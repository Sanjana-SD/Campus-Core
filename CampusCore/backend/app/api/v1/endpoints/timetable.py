from datetime import date, time, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models.models import (
    AuditLog, ClassSchedule, LecturerProfile, Section, Semester, StudentProfile, Subject, User, UserRole,
)
from app.models.extended import AttendanceRecord, ClassSession, TimetableBreak
from app.services import attendance_engine as eng

router = APIRouter()
DAYS = eng.DAYS


def _section_label(sec: Optional[Section]) -> Optional[str]:
    if not sec:
        return None
    sem = sec.semester
    course = sem.course if sem else None
    return f"{course.code if course else ''} Sem {sem.number if sem else '?'} - {sec.name}".strip()


def schedule_to_dict(s: ClassSchedule) -> Dict[str, Any]:
    subj, lect, sec = s.subject, s.lecturer, s.section
    return {
        "id": s.id, "subject_id": s.subject_id, "lecturer_id": s.lecturer_id, "section_id": s.section_id,
        "day_of_week": s.day_of_week, "start_time": s.start_time.strftime("%H:%M"),
        "end_time": s.end_time.strftime("%H:%M"), "room_number": s.room_number,
        "academic_year_id": s.academic_year_id, "academic_term": s.academic_term,
        "effective_from": s.effective_from.isoformat() if s.effective_from else None,
        "effective_to": s.effective_to.isoformat() if s.effective_to else None,
        "is_active": s.is_active is not False,
        "subject": {"id": subj.id, "code": subj.code, "name": subj.name,
                    "department_id": subj.department_id} if subj else None,
        "lecturer": {"id": lect.id, "employee_id": lect.employee_id,
                     "user": {"full_name": lect.user.full_name} if lect.user else None} if lect else None,
        "lecturer_name": lect.user.full_name if (lect and lect.user) else None,
        "section_label": _section_label(sec),
        "department_id": subj.department_id if subj else None,
    }


def _applies_on(s: ClassSchedule, d: date) -> bool:
    return (s.effective_from is None or s.effective_from <= d) and (s.effective_to is None or d <= s.effective_to)


@router.get("")
def get_schedules(
    section_id: Optional[int] = None, lecturer_id: Optional[int] = None, subject_id: Optional[int] = None,
    department_id: Optional[int] = None, student_id: Optional[int] = None, day_of_week: Optional[str] = None,
    on_date: Optional[date] = None, include_inactive: bool = False,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
) -> Any:
    q = db.query(ClassSchedule)
    if current_user.role == UserRole.STUDENT:
        # Students only see their own section's timetable.
        sp = current_user.student_profile
        section_id = sp.section_id if sp else -1
        student_id = None
    if student_id:
        st = db.get(StudentProfile, student_id)
        section_id = st.section_id if st else -1
    if section_id:
        q = q.filter(ClassSchedule.section_id == section_id)
    if lecturer_id:
        q = q.filter(ClassSchedule.lecturer_id == lecturer_id)
    if subject_id:
        q = q.filter(ClassSchedule.subject_id == subject_id)
    if department_id:
        q = q.join(Subject, ClassSchedule.subject_id == Subject.id).filter(Subject.department_id == department_id)
    if day_of_week:
        q = q.filter(ClassSchedule.day_of_week == day_of_week.capitalize())
    items = q.all()
    ref = on_date or eng.college_now().date()
    if not include_inactive:
        items = [s for s in items if s.is_active is not False and _applies_on(s, ref)
                 or (s.effective_from and s.effective_from > ref and s.is_active is not False)]
    items.sort(key=lambda s: (DAYS.index(s.day_of_week) if s.day_of_week in DAYS else 9, s.start_time))
    return [schedule_to_dict(s) for s in items]


@router.get("/my")
def my_timetable(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Any:
    if current_user.role == UserRole.STUDENT:
        sp = current_user.student_profile
        q = db.query(ClassSchedule).filter(ClassSchedule.section_id == (sp.section_id if sp else -1))
    elif current_user.role == UserRole.LECTURER:
        lp = current_user.lecturer_profile
        q = db.query(ClassSchedule).filter(ClassSchedule.lecturer_id == (lp.id if lp else -1))
    else:
        raise HTTPException(400, "Personal timetables are available to students and lecturers")
    today = eng.college_now().date()
    items = [s for s in q if s.is_active is not False and (_applies_on(s, today) or (s.effective_from and s.effective_from > today))]
    items.sort(key=lambda s: (DAYS.index(s.day_of_week) if s.day_of_week in DAYS else 9, s.start_time))
    section_ids = {s.section_id for s in items}
    breaks = db.query(TimetableBreak).filter(or_(TimetableBreak.section_id.is_(None),
                                                 TimetableBreak.section_id.in_(section_ids or [-1]))).all()
    return {"entries": [schedule_to_dict(s) for s in items], "breaks": [_break_to_dict(b) for b in breaks]}


class ScheduleIn(BaseModel):
    subject_id: int
    lecturer_id: int
    section_id: int
    day_of_week: str
    start_time: time
    end_time: time
    room_number: str = Field(..., min_length=1)
    academic_year_id: Optional[int] = None
    academic_term: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    allow_conflict: bool = False  # explicit, audited institutional exception


def _overlaps_dates(a_from, a_to, b_from, b_to) -> bool:
    lo = max(a_from or date.min, b_from or date.min)
    hi = min(a_to or date.max, b_to or date.max)
    return lo <= hi


def _validate(db: Session, data: ScheduleIn, exclude_id: Optional[int] = None) -> List[str]:
    day = data.day_of_week.capitalize()
    if day not in DAYS:
        raise HTTPException(400, f"day_of_week must be one of {', '.join(DAYS)}")
    if data.start_time >= data.end_time:
        raise HTTPException(400, "Start time must be before end time")
    if data.effective_from and data.effective_to and data.effective_to < data.effective_from:
        raise HTTPException(400, "Effective end date must be on or after the start date")
    for model, fid, label in ((Subject, data.subject_id, "Subject"), (LecturerProfile, data.lecturer_id, "Lecturer"),
                              (Section, data.section_id, "Section")):
        if not db.get(model, fid):
            raise HTTPException(404, f"{label} not found")
    room = data.room_number.strip().upper()
    q = db.query(ClassSchedule).filter(
        ClassSchedule.day_of_week == day, ClassSchedule.is_active.isnot(False),
        ClassSchedule.start_time < data.end_time, ClassSchedule.end_time > data.start_time)
    if exclude_id:
        q = q.filter(ClassSchedule.id != exclude_id)
    conflicts = []
    for c in q:
        if not _overlaps_dates(c.effective_from, c.effective_to, data.effective_from, data.effective_to):
            continue
        when = f"{day} {c.start_time.strftime('%H:%M')}-{c.end_time.strftime('%H:%M')}"
        if c.section_id == data.section_id:
            conflicts.append(f"Section conflict: this section already has {c.subject.code if c.subject else 'a class'} on {when}")
        if c.lecturer_id == data.lecturer_id:
            conflicts.append(f"Lecturer conflict: the lecturer already teaches in room {c.room_number} on {when}")
        if (c.room_number or "").upper() == room:
            conflicts.append(f"Room conflict: room {room} is already booked on {when}")
    for b in db.query(TimetableBreak).filter(TimetableBreak.day_of_week == day,
                                             or_(TimetableBreak.section_id.is_(None),
                                                 TimetableBreak.section_id == data.section_id)):
        if b.start_time < data.end_time and b.end_time > data.start_time:
            conflicts.append(f"Overlaps the '{b.label}' break ({b.start_time.strftime('%H:%M')}-{b.end_time.strftime('%H:%M')})")
    return conflicts


@router.post("", status_code=status.HTTP_201_CREATED)
def create_schedule(data: ScheduleIn, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> Any:
    conflicts = _validate(db, data)
    if conflicts and not data.allow_conflict:
        raise HTTPException(400, "; ".join(conflicts))
    s = ClassSchedule(
        subject_id=data.subject_id, lecturer_id=data.lecturer_id, section_id=data.section_id,
        day_of_week=data.day_of_week.capitalize(), start_time=data.start_time, end_time=data.end_time,
        room_number=data.room_number.strip().upper(), academic_year_id=data.academic_year_id,
        academic_term=data.academic_term, effective_from=data.effective_from, effective_to=data.effective_to,
        is_active=True,
    )
    db.add(s)
    db.flush()
    if conflicts:
        db.add(AuditLog(user_id=current_user.id, action="TIMETABLE_CONFLICT_EXCEPTION", entity_type="CLASS_SCHEDULE",
                        entity_id=str(s.id), details="; ".join(conflicts)))
    db.add(AuditLog(user_id=current_user.id, action="TIMETABLE_CREATED", entity_type="CLASS_SCHEDULE", entity_id=str(s.id)))
    db.commit()
    db.refresh(s)
    eng.recalculate(db)
    return schedule_to_dict(s)


def _has_history(db: Session, schedule_id: int, before: date) -> bool:
    return db.query(ClassSession).filter(ClassSession.schedule_id == schedule_id, ClassSession.date < before).first() is not None


def _drop_sessions_from(db: Session, schedule_id: int, start: date) -> None:
    for sess in db.query(ClassSession).filter(ClassSession.schedule_id == schedule_id, ClassSession.date >= start):
        recs = db.query(AttendanceRecord).filter(AttendanceRecord.session_id == sess.id).all()
        if any(r.is_overridden for r in recs):
            continue  # never discard a manual correction silently
        for r in recs:
            db.delete(r)
        db.delete(sess)


@router.put("/{schedule_id}")
def update_schedule(schedule_id: int, data: ScheduleIn, current_user: User = Depends(require_admin),
                    db: Session = Depends(get_db)) -> Any:
    """Changes apply from `effective_from` (default: today). If classes were already held
    under the old entry, it is closed the day before and a new version is created, so past
    sessions keep their original times."""
    old = db.get(ClassSchedule, schedule_id)
    if not old:
        raise HTTPException(404, "Timetable entry not found")
    today = eng.college_now().date()
    start = data.effective_from or max(today, old.effective_from or today)
    data.effective_from = start
    conflicts = _validate(db, data, exclude_id=old.id)
    if conflicts and not data.allow_conflict:
        raise HTTPException(400, "; ".join(conflicts))
    if _has_history(db, old.id, start):
        old.effective_to = start - timedelta(days=1)
        _drop_sessions_from(db, old.id, start)
        new = ClassSchedule(
            subject_id=data.subject_id, lecturer_id=data.lecturer_id, section_id=data.section_id,
            day_of_week=data.day_of_week.capitalize(), start_time=data.start_time, end_time=data.end_time,
            room_number=data.room_number.strip().upper(), academic_year_id=data.academic_year_id,
            academic_term=data.academic_term, effective_from=start, effective_to=data.effective_to, is_active=True)
        db.add(new)
        db.flush()
        detail = f"Versioned: entry {old.id} closed on {old.effective_to}, new entry {new.id} from {start}"
        target = new
    else:
        _drop_sessions_from(db, old.id, date.min)
        for k in ("subject_id", "lecturer_id", "section_id", "start_time", "end_time", "academic_year_id",
                  "academic_term", "effective_to"):
            setattr(old, k, getattr(data, k))
        old.day_of_week = data.day_of_week.capitalize()
        old.room_number = data.room_number.strip().upper()
        old.effective_from = data.effective_from if data.effective_from and data.effective_from > today else old.effective_from
        detail = f"Entry {old.id} updated in place (no classes held yet)"
        target = old
    db.add(AuditLog(user_id=current_user.id, action="TIMETABLE_UPDATED", entity_type="CLASS_SCHEDULE",
                    entity_id=str(old.id), details=detail + ("; conflicts accepted: " + "; ".join(conflicts) if conflicts else "")))
    db.commit()
    eng.recalculate(db)
    db.refresh(target)
    return {**schedule_to_dict(target), "message": detail}


@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: int, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> Any:
    s = db.get(ClassSchedule, schedule_id)
    if not s:
        raise HTTPException(404, "Schedule entry not found")
    today = eng.college_now().date()
    if _has_history(db, s.id, today):
        s.effective_to = today - timedelta(days=1)
        s.is_active = False
        _drop_sessions_from(db, s.id, today)
        msg = "Timetable entry ended; classes already held keep their attendance history"
    else:
        _drop_sessions_from(db, s.id, date.min)
        db.delete(s)
        msg = "Timetable period deleted"
    db.add(AuditLog(user_id=current_user.id, action="TIMETABLE_DELETED", entity_type="CLASS_SCHEDULE",
                    entity_id=str(schedule_id), details=msg))
    db.commit()
    return {"message": msg}


# ---------------------------------------------------------------------------
# Day / week views over concrete sessions
# ---------------------------------------------------------------------------

@router.get("/week")
def week_view(start: Optional[date] = None, section_id: Optional[int] = None, lecturer_id: Optional[int] = None,
              current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Any:
    """Concrete classes for a 7-day window including cancellations."""
    start = start or eng.college_now().date() - timedelta(days=eng.college_now().weekday())
    end = start + timedelta(days=6)
    if current_user.role == UserRole.STUDENT:
        sp = current_user.student_profile
        section_id, lecturer_id = (sp.section_id if sp else -1), None
    elif current_user.role == UserRole.LECTURER:
        lecturer_id = current_user.lecturer_profile.id if current_user.lecturer_profile else -1
    eng.ensure_sessions(db, start, end)
    db.commit()
    q = db.query(ClassSession).filter(ClassSession.date >= start, ClassSession.date <= end)
    if section_id:
        q = q.filter(ClassSession.section_id == section_id)
    if lecturer_id:
        q = q.filter(ClassSession.lecturer_id == lecturer_id)
    out = []
    for s in q.order_by(ClassSession.date, ClassSession.start_time):
        out.append({"id": s.id, "date": s.date.isoformat(), "day": DAYS[s.date.weekday()],
                    "start_time": s.start_time.strftime("%H:%M"), "end_time": s.end_time.strftime("%H:%M"),
                    "subject_code": s.subject.code if s.subject else None,
                    "subject_name": s.subject.name if s.subject else None,
                    "lecturer_name": s.lecturer.user.full_name if (s.lecturer and s.lecturer.user) else None,
                    "section": _section_label(s.section), "room_number": s.room_number,
                    "status": s.status, "cancel_reason": s.cancel_reason})
    return {"start": start.isoformat(), "end": end.isoformat(), "sessions": out}


# ---------------------------------------------------------------------------
# Breaks
# ---------------------------------------------------------------------------

def _break_to_dict(b: TimetableBreak) -> Dict[str, Any]:
    return {"id": b.id, "section_id": b.section_id, "section_label": _section_label(b.section) if b.section else "All sections",
            "day_of_week": b.day_of_week, "start_time": b.start_time.strftime("%H:%M"),
            "end_time": b.end_time.strftime("%H:%M"), "label": b.label}


class BreakIn(BaseModel):
    section_id: Optional[int] = None
    day_of_week: str
    start_time: time
    end_time: time
    label: str = "Break"


@router.get("/breaks")
def list_breaks(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Any:
    return [_break_to_dict(b) for b in db.query(TimetableBreak).all()]


@router.post("/breaks", status_code=201)
def create_break(data: BreakIn, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> Any:
    day = data.day_of_week.capitalize()
    if day not in DAYS or data.start_time >= data.end_time:
        raise HTTPException(400, "Provide a valid day and a start time before the end time")
    clash = db.query(ClassSchedule).filter(ClassSchedule.day_of_week == day, ClassSchedule.is_active.isnot(False),
                                           ClassSchedule.start_time < data.end_time,
                                           ClassSchedule.end_time > data.start_time)
    if data.section_id:
        clash = clash.filter(ClassSchedule.section_id == data.section_id)
    c = clash.first()
    if c:
        raise HTTPException(400, f"A class ({c.subject.code if c.subject else c.id}) is scheduled during this break")
    b = TimetableBreak(section_id=data.section_id, day_of_week=day, start_time=data.start_time,
                       end_time=data.end_time, label=data.label)
    db.add(b)
    db.commit()
    db.refresh(b)
    return _break_to_dict(b)


@router.delete("/breaks/{break_id}")
def delete_break(break_id: int, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> Any:
    b = db.get(TimetableBreak, break_id)
    if not b:
        raise HTTPException(404, "Break not found")
    db.delete(b)
    db.commit()
    return {"message": "Break removed"}
