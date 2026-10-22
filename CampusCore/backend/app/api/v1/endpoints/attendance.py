import csv
import io
from collections import defaultdict
from datetime import date, datetime, time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin, require_lecturer_or_admin, require_student
from app.core.database import get_db
from app.models.models import AuditLog, Section, StudentProfile, Subject, User, UserRole
from app.models.extended import (
    AttendanceCorrection, AttendanceDispute, AttendanceRecord, ClassSession, SheetAttendanceRow,
    SubjectAttendanceRule, SubjectEnrollment, SyncRun,
)
from app.services import attendance_engine as eng
from app.services.sheet_sync_service import row_to_dict, sync_run_to_dict

router = APIRouter()


# ---------------------------------------------------------------------------
# Scope helpers
# ---------------------------------------------------------------------------

def _lecturer_id(user: User) -> Optional[int]:
    if user.role == UserRole.LECTURER:
        if not user.lecturer_profile:
            raise HTTPException(403, "No lecturer profile is linked to this account")
        return user.lecturer_profile.id
    return None


def _scoped_records(db: Session, user: User):
    q = db.query(AttendanceRecord).join(ClassSession, AttendanceRecord.session_id == ClassSession.id)
    lid = _lecturer_id(user)
    if lid is not None:
        q = q.filter(ClassSession.lecturer_id == lid)
    return q


def _check_record_access(db: Session, rec: AttendanceRecord, user: User, write: bool = False) -> None:
    if user.role == UserRole.ADMIN:
        return
    if user.role == UserRole.LECTURER:
        if rec.session and user.lecturer_profile and rec.session.lecturer_id == user.lecturer_profile.id:
            return
        raise HTTPException(403, "You can only access attendance for classes you teach")
    if user.role == UserRole.STUDENT and not write:
        if user.student_profile and rec.student_id == user.student_profile.id:
            return
    raise HTTPException(403, "You are not authorised to access this attendance record")


def _student_label(st: Optional[StudentProfile]) -> Dict[str, Any]:
    return {"student_name": st.user.full_name if (st and st.user) else None,
            "student_usn": st.student_id_number if st else None,
            "student_uid": st.rfid_uid if st else None}


def _section_label(sec: Optional[Section]) -> Optional[str]:
    if not sec:
        return None
    sem = sec.semester
    course = sem.course if sem else None
    return f"{course.code if course else ''} Sem {sem.number if sem else '?'} - {sec.name}".strip()


# ---------------------------------------------------------------------------
# Student
# ---------------------------------------------------------------------------

@router.get("/my")
def my_attendance(
    date_from: Optional[date] = None, date_to: Optional[date] = None,
    current_user: User = Depends(require_student), db: Session = Depends(get_db),
) -> Any:
    """The authenticated student's timetable-based attendance. The student is taken from the
    token, never from a request parameter."""
    st = current_user.student_profile
    if not st:
        raise HTTPException(404, "No student profile is linked to this account")
    out = eng.student_summary(db, st, date_from, date_to)
    last_ok = db.query(SyncRun).filter(SyncRun.status.in_(["SUCCESS", "PARTIAL"]), SyncRun.trigger != "TEST") \
        .order_by(SyncRun.id.desc()).first()
    out["last_sync_at"] = (last_ok.finished_at.isoformat() + "Z") if (last_ok and last_ok.finished_at) else None
    out["student"] = {"id": st.id, "usn": st.student_id_number, "rfid_uid": st.rfid_uid,
                      "section": _section_label(st.section)}
    out["disputes"] = [_dispute_to_dict(d) for d in db.query(AttendanceDispute).filter(
        AttendanceDispute.student_id == st.id).order_by(AttendanceDispute.id.desc()).limit(50)]
    # legacy shape for the existing student dashboard widget
    ov = out["overall"]
    out["summary"] = {"attendance_percentage": ov["percentage"] if ov["percentage"] is not None else 0,
                      "present_days": ov["attended"], "total_conducted": ov["classes_held"],
                      "late_days": ov["late"], "absent_days": ov["absent"], "incomplete_days": ov["pending"],
                      "threshold_percentage": out["policy"]["minimum_percentage"],
                      "is_warning": ov["percentage"] is not None and ov["percentage"] < out["policy"]["minimum_percentage"]}
    return out


class DisputeIn(BaseModel):
    message: str = Field(..., min_length=5, max_length=2000)


@router.post("/records/{record_id}/dispute")
def dispute_record(record_id: int, data: DisputeIn, current_user: User = Depends(require_student),
                   db: Session = Depends(get_db)) -> Any:
    rec = db.get(AttendanceRecord, record_id)
    st = current_user.student_profile
    if not rec or not st or rec.student_id != st.id:
        raise HTTPException(404, "Attendance record not found")
    if db.query(AttendanceDispute).filter(AttendanceDispute.record_id == rec.id,
                                          AttendanceDispute.status == "OPEN").first():
        raise HTTPException(409, "You already have an open request for this class")
    d = AttendanceDispute(record_id=rec.id, student_id=st.id, message=data.message.strip())
    db.add(d)
    lect = rec.session.lecturer if rec.session else None
    from app.services.placement_service import notify
    if lect and lect.user_id:
        notify(db, lect.user_id, "Attendance review requested",
               f"{current_user.full_name} disputed {rec.subject.code if rec.subject else ''} on {rec.date.isoformat()}.",
               "ATTENDANCE_DISPUTE", "/lecturer/attendance")
    db.commit()
    return _dispute_to_dict(d)


def _dispute_to_dict(d: AttendanceDispute) -> Dict[str, Any]:
    rec = d.record
    return {"id": d.id, "record_id": d.record_id, "student_id": d.student_id, "message": d.message,
            "status": d.status, "resolution_note": d.resolution_note,
            "created_at": d.created_at.isoformat() + "Z" if d.created_at else None,
            "resolved_at": d.resolved_at.isoformat() + "Z" if d.resolved_at else None,
            "date": rec.date.isoformat() if rec else None,
            "subject_code": rec.subject.code if (rec and rec.subject) else None,
            "final_status": rec.final_status if rec else None,
            **_student_label(rec.student if rec else None)}


# ---------------------------------------------------------------------------
# Records (admin + lecturer)
# ---------------------------------------------------------------------------

@router.get("/records")
def list_records(
    date_from: Optional[date] = None, date_to: Optional[date] = None, on_date: Optional[date] = None,
    subject_id: Optional[int] = None, section_id: Optional[int] = None, student_id: Optional[int] = None,
    session_id: Optional[int] = None, status: Optional[str] = None, search: Optional[str] = None,
    overridden: Optional[bool] = None,
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(require_lecturer_or_admin), db: Session = Depends(get_db),
) -> Any:
    q = _scoped_records(db, current_user)
    if on_date:
        date_from = date_to = on_date
    if date_from:
        q = q.filter(AttendanceRecord.date >= date_from)
    if date_to:
        q = q.filter(AttendanceRecord.date <= date_to)
    if subject_id:
        q = q.filter(AttendanceRecord.subject_id == subject_id)
    if section_id:
        q = q.filter(ClassSession.section_id == section_id)
    if student_id:
        q = q.filter(AttendanceRecord.student_id == student_id)
    if session_id:
        q = q.filter(AttendanceRecord.session_id == session_id)
    if status:
        q = q.filter(AttendanceRecord.final_status == status.upper())
    if overridden is not None:
        q = q.filter(AttendanceRecord.is_overridden.is_(overridden))
    if search:
        pat = f"%{search.strip()}%"
        q = q.join(StudentProfile, AttendanceRecord.student_id == StudentProfile.id) \
             .join(User, StudentProfile.user_id == User.id) \
             .filter(or_(User.full_name.ilike(pat), StudentProfile.student_id_number.ilike(pat),
                         StudentProfile.rfid_uid.ilike(pat)))
    total = q.count()
    items = q.order_by(AttendanceRecord.date.desc(), AttendanceRecord.scheduled_start.desc(),
                       AttendanceRecord.id).offset(skip).limit(limit).all()
    return {"total": total, "items": [{**eng.record_to_dict(r), **_student_label(r.student)} for r in items]}


@router.get("/records/{record_id}")
def record_detail(record_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Any:
    rec = db.get(AttendanceRecord, record_id)
    if not rec:
        raise HTTPException(404, "Attendance record not found")
    _check_record_access(db, rec, current_user)
    rows = db.query(SheetAttendanceRow).filter(SheetAttendanceRow.id.in_(rec.source_row_ids or [-1])).all()
    same_day = db.query(SheetAttendanceRow).filter(SheetAttendanceRow.student_id == rec.student_id,
                                                   SheetAttendanceRow.event_date == rec.date).all()
    corrections = db.query(AttendanceCorrection).filter(AttendanceCorrection.record_id == rec.id) \
        .order_by(AttendanceCorrection.id).all()
    is_staff = current_user.role in (UserRole.ADMIN, UserRole.LECTURER)
    def src(r):
        d = row_to_dict(r)
        if not is_staff:  # students see their own scan values, not matching internals
            d = {k: d[k] for k in ("id", "row_number", "uid", "date", "entry_time", "exit_time",
                                   "original_status", "validity", "issues", "missing_from_source")}
        return d
    return {
        "record": {**eng.record_to_dict(rec), **_student_label(rec.student)},
        "source_rows": [src(r) for r in rows],
        "same_day_rows": [src(r) for r in same_day],
        "corrections": [{"old_status": c.old_status, "new_status": c.new_status, "reason": c.reason,
                         "by": c.corrected_by.full_name if c.corrected_by else None,
                         "at": c.created_at.isoformat() + "Z"} for c in corrections],
    }


class CorrectionIn(BaseModel):
    status: Optional[str] = None  # null removes an existing correction
    reason: str = Field(..., min_length=3, max_length=1000)


@router.post("/records/{record_id}/correct")
def correct_record(record_id: int, data: CorrectionIn, current_user: User = Depends(require_lecturer_or_admin),
                   db: Session = Depends(get_db)) -> Any:
    rec = db.get(AttendanceRecord, record_id)
    if not rec:
        raise HTTPException(404, "Attendance record not found")
    _check_record_access(db, rec, current_user, write=True)
    new = data.status.upper() if data.status else None
    if new is not None and new not in eng.CORRECTABLE_STATUSES:
        raise HTTPException(400, f"Status must be one of {', '.join(eng.CORRECTABLE_STATUSES)}")
    if rec.computed_status == eng.CANCELLED:
        raise HTTPException(400, "This class was cancelled; restore the session instead of correcting attendance.")
    old = rec.final_status
    db.add(AttendanceCorrection(record_id=rec.id, old_status=old, new_status=new, reason=data.reason.strip(),
                                corrected_by_id=current_user.id))
    if new is None:
        rec.is_overridden, rec.override_status, rec.override_reason = False, None, None
        rec.overridden_by_id, rec.overridden_at, rec.override_stale = None, None, False
        rec.final_status = rec.computed_status
    else:
        rec.is_overridden, rec.override_status, rec.override_reason = True, new, data.reason.strip()
        rec.overridden_by_id, rec.overridden_at, rec.override_stale = current_user.id, datetime.utcnow(), False
        rec.final_status = new
    db.add(AuditLog(user_id=current_user.id, action="ATTENDANCE_CORRECTION", entity_type="ATTENDANCE_RECORD",
                    entity_id=str(rec.id),
                    details=f"{old} -> {new or rec.computed_status + ' (correction removed)'} for student "
                            f"{rec.student.student_id_number if rec.student else rec.student_id}, "
                            f"{rec.subject.code if rec.subject else ''} {rec.date}. Reason: {data.reason}"))
    db.commit()
    return {**eng.record_to_dict(rec), **_student_label(rec.student)}


@router.get("/disputes")
def list_disputes(status: Optional[str] = "OPEN", current_user: User = Depends(require_lecturer_or_admin),
                  db: Session = Depends(get_db)) -> Any:
    q = db.query(AttendanceDispute).join(AttendanceRecord, AttendanceDispute.record_id == AttendanceRecord.id) \
        .join(ClassSession, AttendanceRecord.session_id == ClassSession.id)
    lid = _lecturer_id(current_user)
    if lid is not None:
        q = q.filter(ClassSession.lecturer_id == lid)
    if status:
        q = q.filter(AttendanceDispute.status == status.upper())
    return [_dispute_to_dict(d) for d in q.order_by(AttendanceDispute.id.desc()).limit(200)]


class ResolveIn(BaseModel):
    status: str  # RESOLVED | REJECTED
    note: str = Field(..., min_length=3)


@router.post("/disputes/{dispute_id}/resolve")
def resolve_dispute(dispute_id: int, data: ResolveIn, current_user: User = Depends(require_lecturer_or_admin),
                    db: Session = Depends(get_db)) -> Any:
    d = db.get(AttendanceDispute, dispute_id)
    if not d:
        raise HTTPException(404, "Request not found")
    _check_record_access(db, d.record, current_user, write=True)
    if data.status.upper() not in ("RESOLVED", "REJECTED"):
        raise HTTPException(400, "Status must be RESOLVED or REJECTED")
    d.status, d.resolution_note = data.status.upper(), data.note
    d.resolved_by_id, d.resolved_at = current_user.id, datetime.utcnow()
    st = d.record.student if d.record else None
    if st and st.user_id:
        from app.services.placement_service import notify
        notify(db, st.user_id, "Attendance request reviewed", f"Your request was {d.status.lower()}: {data.note}",
               "ATTENDANCE_DISPUTE", "/student/attendance")
    db.commit()
    return _dispute_to_dict(d)


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

def _session_to_dict(s: ClassSession, counts: Optional[Dict[str, int]] = None) -> Dict[str, Any]:
    return {
        "id": s.id, "schedule_id": s.schedule_id, "date": s.date.isoformat(),
        "start_time": s.start_time.strftime("%H:%M"), "end_time": s.end_time.strftime("%H:%M"),
        "subject_id": s.subject_id, "subject_code": s.subject.code if s.subject else None,
        "subject_name": s.subject.name if s.subject else None,
        "lecturer_id": s.lecturer_id,
        "lecturer_name": s.lecturer.user.full_name if (s.lecturer and s.lecturer.user) else None,
        "section_id": s.section_id, "section": _section_label(s.section), "room_number": s.room_number,
        "status": s.status, "cancel_reason": s.cancel_reason, "counts": counts or {},
    }


@router.get("/sessions")
def list_sessions(
    date_from: Optional[date] = None, date_to: Optional[date] = None, section_id: Optional[int] = None,
    subject_id: Optional[int] = None, lecturer_id: Optional[int] = None,
    skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(require_lecturer_or_admin), db: Session = Depends(get_db),
) -> Any:
    q = db.query(ClassSession)
    lid = _lecturer_id(current_user)
    if lid is not None:
        q = q.filter(ClassSession.lecturer_id == lid)
    elif lecturer_id:
        q = q.filter(ClassSession.lecturer_id == lecturer_id)
    if date_from:
        q = q.filter(ClassSession.date >= date_from)
    if date_to:
        q = q.filter(ClassSession.date <= date_to)
    if section_id:
        q = q.filter(ClassSession.section_id == section_id)
    if subject_id:
        q = q.filter(ClassSession.subject_id == subject_id)
    total = q.count()
    sessions = q.order_by(ClassSession.date.desc(), ClassSession.start_time.desc()).offset(skip).limit(limit).all()
    counts: Dict[int, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    if sessions:
        for sid, st in db.query(AttendanceRecord.session_id, AttendanceRecord.final_status).filter(
                AttendanceRecord.session_id.in_([s.id for s in sessions])):
            counts[sid][st] += 1
    return {"total": total, "items": [_session_to_dict(s, dict(counts.get(s.id, {}))) for s in sessions]}


class CancelIn(BaseModel):
    reason: str = Field(..., min_length=3)


@router.post("/sessions/{session_id}/cancel")
def cancel_session(session_id: int, data: CancelIn, current_user: User = Depends(require_admin),
                   db: Session = Depends(get_db)) -> Any:
    s = db.get(ClassSession, session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    s.status, s.cancel_reason, s.cancelled_by_id = "CANCELLED", data.reason, current_user.id
    db.add(AuditLog(user_id=current_user.id, action="SESSION_CANCELLED", entity_type="CLASS_SESSION",
                    entity_id=str(s.id), details=data.reason))
    db.flush()
    eng.recalculate(db, s.date, s.date)
    return _session_to_dict(s)


@router.post("/sessions/{session_id}/restore")
def restore_session(session_id: int, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> Any:
    s = db.get(ClassSession, session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    s.status, s.cancel_reason = "SCHEDULED", None
    db.add(AuditLog(user_id=current_user.id, action="SESSION_RESTORED", entity_type="CLASS_SESSION", entity_id=str(s.id)))
    db.flush()
    eng.recalculate(db, s.date, s.date)
    return _session_to_dict(s)


class CancelDayIn(BaseModel):
    date: date
    reason: str = Field(..., min_length=3)
    section_id: Optional[int] = None


@router.post("/cancel-day")
def cancel_day(data: CancelDayIn, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> Any:
    """Cancels every class on a date (e.g. a holiday). Sessions are generated first so
    future dates can be cancelled in advance."""
    eng.ensure_sessions(db, data.date, data.date)
    q = db.query(ClassSession).filter(ClassSession.date == data.date)
    if data.section_id:
        q = q.filter(ClassSession.section_id == data.section_id)
    n = 0
    for s in q:
        s.status, s.cancel_reason, s.cancelled_by_id = "CANCELLED", data.reason, current_user.id
        n += 1
    db.add(AuditLog(user_id=current_user.id, action="DAY_CANCELLED", entity_type="CLASS_SESSION",
                    entity_id=data.date.isoformat(), details=f"{n} sessions: {data.reason}"))
    db.flush()
    eng.recalculate(db, data.date, data.date)
    return {"cancelled_sessions": n}


class RecalcIn(BaseModel):
    start: Optional[date] = None
    end: Optional[date] = None


@router.post("/recalculate")
def recalculate(data: RecalcIn, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> Any:
    stats = eng.recalculate(db, data.start, data.end)
    db.add(AuditLog(user_id=current_user.id, action="ATTENDANCE_RECALCULATED", entity_type="ATTENDANCE",
                    details=str({k: v for k, v in stats.items() if k != "range"})))
    db.commit()
    return stats


# ---------------------------------------------------------------------------
# Dashboards
# ---------------------------------------------------------------------------

@router.get("/summary")
def admin_dashboard(current_user: User = Depends(require_lecturer_or_admin), db: Session = Depends(get_db)) -> Any:
    """Campus-wide attendance analytics computed from stored class records (lecturers: own classes)."""
    policy = eng.get_policy(db)
    today = eng.college_now(policy).date()
    recs = _scoped_records(db, current_user).all()
    overall = eng.aggregate(recs, policy)
    sq = db.query(ClassSession)
    lid = _lecturer_id(current_user)
    if lid is not None:
        sq = sq.filter(ClassSession.lecturer_id == lid)
    sessions_total = sq.filter(ClassSession.date <= today).count()
    completed = len({r.session_id for r in recs if r.final_status != eng.CANCELLED})

    per_student: Dict[int, List[AttendanceRecord]] = defaultdict(list)
    for r in recs:
        per_student[r.student_id].append(r)
    below = []
    for sid, lst in per_student.items():
        agg = eng.aggregate(lst, policy)
        if agg["percentage"] is not None and agg["percentage"] < policy.minimum_percentage:
            st = lst[0].student
            below.append({"student_id": sid, **_student_label(st), "percentage": agg["percentage"],
                          "attended": agg["attended"], "classes_held": agg["classes_held"]})
    below.sort(key=lambda x: x["percentage"])

    today_recs = [r for r in recs if r.date == today]
    rows = db.query(SheetAttendanceRow).filter(SheetAttendanceRow.missing_from_source.is_(False))
    last_ok = db.query(SyncRun).filter(SyncRun.status.in_(["SUCCESS", "PARTIAL"]), SyncRun.trigger != "TEST") \
        .order_by(SyncRun.id.desc()).first()
    last_any = db.query(SyncRun).filter(SyncRun.trigger != "TEST").order_by(SyncRun.id.desc()).first()
    t_start = eng.tracking_start(db, policy)
    return {
        "policy": eng.policy_to_dict(policy),
        "tracking_start": t_start.isoformat() if t_start else None,
        "total_students": db.query(StudentProfile).filter(StudentProfile.is_active.is_(True)).count(),
        "total_scheduled_sessions": sessions_total,
        "completed_sessions": completed,
        "overall": overall,
        "today": {"date": today.isoformat(), **eng.aggregate(today_recs, policy)},
        "students_below_threshold": len(below),
        "below_threshold": below[:50],
        "late_arrivals": overall["late"],
        "partial_attendance": overall["partial"],
        "pending_verification": overall["pending"],
        "unmatched_rfid_rows": rows.filter(SheetAttendanceRow.match_status == "UNMATCHED").count(),
        "conflict_rfid_rows": rows.filter(SheetAttendanceRow.match_status == "CONFLICT").count(),
        "incomplete_events": rows.filter(SheetAttendanceRow.validity == "INCOMPLETE").count(),
        "open_disputes": db.query(AttendanceDispute).filter(AttendanceDispute.status == "OPEN").count()
        if lid is None else None,
        "sync": {
            "last_successful": sync_run_to_dict(last_ok) if last_ok else None,
            "last_attempt": sync_run_to_dict(last_any) if last_any else None,
        },
    }


@router.get("/students/{student_id}/summary")
def student_summary(student_id: int, date_from: Optional[date] = None, date_to: Optional[date] = None,
                    current_user: User = Depends(require_lecturer_or_admin), db: Session = Depends(get_db)) -> Any:
    st = db.get(StudentProfile, student_id)
    if not st:
        raise HTTPException(404, "Student not found")
    lid = _lecturer_id(current_user)
    out = eng.student_summary(db, st, date_from, date_to)
    if lid is not None:
        # Lecturers see only the classes they teach for this student.
        from app.models.models import ClassSchedule
        teaches_section = db.query(ClassSchedule).filter(ClassSchedule.lecturer_id == lid,
                                                         ClassSchedule.section_id == st.section_id).first()
        if not teaches_section:
            raise HTTPException(403, "This student does not attend any of your classes")
        allowed = {s for (s,) in db.query(ClassSession.id).filter(ClassSession.lecturer_id == lid)}
        q = db.query(AttendanceRecord).filter(AttendanceRecord.student_id == st.id,
                                              AttendanceRecord.session_id.in_(allowed or [-1]))
        if date_from:
            q = q.filter(AttendanceRecord.date >= date_from)
        if date_to:
            q = q.filter(AttendanceRecord.date <= date_to)
        recs = q.all()
        policy = eng.get_policy(db)
        out["records"] = [eng.record_to_dict(r) for r in recs]
        out["overall"] = eng.aggregate(recs, policy)
        codes = {r.subject_id for r in recs}
        out["subjects"] = [s for s in out["subjects"] if s["subject_id"] in codes]
        out["subjects_below_threshold"] = sum(1 for s in out["subjects"] if s["below_threshold"])
        # campus-wide alerts would reveal other subjects; keep only those about this lecturer's subjects
        own_codes = {s["subject_code"] for s in out["subjects"]}
        out["alerts"] = [a for a in out["alerts"] if a["type"] == "SUBJECT_BELOW_THRESHOLD"
                         and any(c and a["message"].startswith(c + " ") for c in own_codes)]
    out["student"] = {"id": st.id, **_student_label(st), "section": _section_label(st.section)}
    return out


@router.get("/lecturer/overview")
def lecturer_overview(current_user: User = Depends(require_lecturer_or_admin), db: Session = Depends(get_db)) -> Any:
    lid = _lecturer_id(current_user)
    if lid is None:
        raise HTTPException(400, "This view is for lecturer accounts")
    policy = eng.get_policy(db)
    recs = _scoped_records(db, current_user).all()
    by_class: Dict[tuple, List[AttendanceRecord]] = defaultdict(list)
    for r in recs:
        by_class[(r.subject_id, r.session.section_id if r.session else None)].append(r)
    classes = []
    for (subj_id, sec_id), lst in by_class.items():
        agg = eng.aggregate(lst, policy)
        subj = lst[0].subject
        sec = lst[0].session.section if lst[0].session else None
        per_st: Dict[int, List[AttendanceRecord]] = defaultdict(list)
        for r in lst:
            per_st[r.student_id].append(r)
        below = []
        for sid, l2 in per_st.items():
            a2 = eng.aggregate(l2, policy)
            if a2["percentage"] is not None and a2["percentage"] < policy.minimum_percentage:
                below.append({"student_id": sid, **_student_label(l2[0].student), "percentage": a2["percentage"]})
        classes.append({"subject_id": subj_id, "subject_code": subj.code if subj else None,
                        "subject_name": subj.name if subj else None, "section_id": sec_id,
                        "section": _section_label(sec), "sessions": len({r.session_id for r in lst}),
                        **agg, "below_threshold": sorted(below, key=lambda x: x["percentage"])})
    return {"policy": eng.policy_to_dict(policy), "classes": classes,
            "pending_verification": sum(1 for r in recs if r.final_status == eng.PENDING),
            "open_disputes": db.query(AttendanceDispute).join(AttendanceRecord).join(
                ClassSession, AttendanceRecord.session_id == ClassSession.id).filter(
                ClassSession.lecturer_id == lid, AttendanceDispute.status == "OPEN").count()}


@router.get("/export")
def export_records(
    date_from: Optional[date] = None, date_to: Optional[date] = None, subject_id: Optional[int] = None,
    section_id: Optional[int] = None, status: Optional[str] = None,
    current_user: User = Depends(require_lecturer_or_admin), db: Session = Depends(get_db),
) -> Response:
    q = _scoped_records(db, current_user)
    if date_from:
        q = q.filter(AttendanceRecord.date >= date_from)
    if date_to:
        q = q.filter(AttendanceRecord.date <= date_to)
    if subject_id:
        q = q.filter(AttendanceRecord.subject_id == subject_id)
    if section_id:
        q = q.filter(ClassSession.section_id == section_id)
    if status:
        q = q.filter(AttendanceRecord.final_status == status.upper())
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date", "Subject", "Scheduled Start", "Scheduled End", "USN", "Student", "RFID UID",
                "Entry", "Exit", "Intervals", "Attended Minutes", "Scheduled Minutes", "Duration %",
                "Calculated Status", "Final Status", "Corrected", "Correction Reason", "Reason", "Policy Version"])
    for r in q.order_by(AttendanceRecord.date, AttendanceRecord.scheduled_start):
        st = r.student
        ivs = "; ".join(f"{i.get('entry') or '?'}-{i.get('exit') or '?'}" for i in (r.intervals or []))
        w.writerow([r.date, r.subject.code if r.subject else "", r.scheduled_start, r.scheduled_end,
                    st.student_id_number if st else "", st.user.full_name if (st and st.user) else "",
                    st.rfid_uid if st else "", r.first_entry or "", r.last_exit or "", ivs, r.attended_minutes,
                    r.scheduled_minutes, r.duration_percent, r.computed_status, r.final_status,
                    "yes" if r.is_overridden else "no", r.override_reason or "", r.status_reason or "",
                    r.policy_version])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=class_attendance.csv"})


# ---------------------------------------------------------------------------
# Policy, subject rules, enrollment exceptions
# ---------------------------------------------------------------------------

@router.get("/policy")
def get_policy(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Any:
    return eng.policy_to_dict(eng.get_policy(db))


class PolicyIn(BaseModel):
    minimum_percentage: Optional[float] = Field(None, ge=0, le=100)
    late_arrival_grace_minutes: Optional[int] = Field(None, ge=0, le=180)
    college_timezone: Optional[str] = None
    present_min_percent: Optional[float] = Field(None, ge=0, le=100)
    partial_min_percent: Optional[float] = Field(None, ge=0, le=100)
    min_required_minutes: Optional[int] = Field(None, ge=0)
    clear_min_required_minutes: bool = False
    missing_exit_policy: Optional[str] = None
    missing_entry_policy: Optional[str] = None
    count_late_as_attended: Optional[bool] = None
    count_partial_as_attended: Optional[bool] = None
    tracking_start_date: Optional[date] = None
    clear_tracking_start_date: bool = False
    auto_reconcile_enabled: Optional[bool] = None
    total_conducted_days: Optional[int] = None  # accepted for compatibility, unused
    recalculate: bool = True


@router.put("/policy")
def update_policy(data: PolicyIn, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> Any:
    p = eng.get_policy(db)
    before = eng.policy_to_dict(p)
    for k in ("minimum_percentage", "late_arrival_grace_minutes", "present_min_percent", "partial_min_percent",
              "min_required_minutes", "count_late_as_attended", "count_partial_as_attended",
              "tracking_start_date", "auto_reconcile_enabled"):
        v = getattr(data, k)
        if v is not None:
            setattr(p, k, v)
    if data.college_timezone:
        import pytz
        if data.college_timezone not in pytz.all_timezones_set:
            raise HTTPException(400, f"Unknown timezone '{data.college_timezone}'")
        p.college_timezone = data.college_timezone
    for k in ("missing_exit_policy", "missing_entry_policy"):
        v = getattr(data, k)
        if v is not None:
            if v not in (eng.PENDING, eng.ABSENT):
                raise HTTPException(400, f"{k} must be {eng.PENDING} or {eng.ABSENT}")
            setattr(p, k, v)
    if data.clear_min_required_minutes:
        p.min_required_minutes = None
    if data.clear_tracking_start_date:
        p.tracking_start_date = None
    if p.partial_min_percent > p.present_min_percent:
        raise HTTPException(400, "The partial threshold cannot be higher than the present threshold")
    after = eng.policy_to_dict(p)
    changed = {k: (before[k], after[k]) for k in after if before.get(k) != after.get(k) and k not in ("updated_at",)}
    if changed:
        p.version = (p.version or 1) + 1
        p.updated_by_id = current_user.id
        db.add(AuditLog(user_id=current_user.id, action="ATTENDANCE_POLICY_UPDATED", entity_type="ATTENDANCE_POLICY",
                        entity_id=str(p.id), details=str(changed)))
    db.commit()
    stats = eng.recalculate(db) if (changed and data.recalculate) else None
    return {**eng.policy_to_dict(p), "recalculation": stats}


@router.get("/subject-rules")
def list_subject_rules(current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> Any:
    return [{"subject_id": r.subject_id, "subject_code": r.subject.code if r.subject else None,
             "late_arrival_grace_minutes": r.late_arrival_grace_minutes, "present_min_percent": r.present_min_percent,
             "partial_min_percent": r.partial_min_percent, "min_required_minutes": r.min_required_minutes,
             "minimum_percentage": r.minimum_percentage} for r in db.query(SubjectAttendanceRule)]


class SubjectRuleIn(BaseModel):
    late_arrival_grace_minutes: Optional[int] = Field(None, ge=0)
    present_min_percent: Optional[float] = Field(None, ge=0, le=100)
    partial_min_percent: Optional[float] = Field(None, ge=0, le=100)
    min_required_minutes: Optional[int] = Field(None, ge=0)
    minimum_percentage: Optional[float] = Field(None, ge=0, le=100)


@router.put("/subject-rules/{subject_id}")
def put_subject_rule(subject_id: int, data: SubjectRuleIn, current_user: User = Depends(require_admin),
                     db: Session = Depends(get_db)) -> Any:
    if not db.get(Subject, subject_id):
        raise HTTPException(404, "Subject not found")
    r = db.query(SubjectAttendanceRule).filter(SubjectAttendanceRule.subject_id == subject_id).first()
    if r is None:
        r = SubjectAttendanceRule(subject_id=subject_id)
        db.add(r)
    new_values = data.model_dump()
    changed = any(getattr(r, k, None) != v for k, v in new_values.items())
    for k, v in new_values.items():
        setattr(r, k, v)  # null = inherit global policy
    if not changed:
        db.commit()
        return {"message": "No changes"}
    p = eng.get_policy(db)
    p.version = (p.version or 1) + 1
    db.add(AuditLog(user_id=current_user.id, action="SUBJECT_RULE_UPDATED", entity_type="SUBJECT",
                    entity_id=str(subject_id), details=str(new_values)))
    db.commit()
    eng.recalculate(db)
    return {"message": "Subject rule saved"}


@router.delete("/subject-rules/{subject_id}")
def delete_subject_rule(subject_id: int, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> Any:
    r = db.query(SubjectAttendanceRule).filter(SubjectAttendanceRule.subject_id == subject_id).first()
    if r:
        db.delete(r)
        db.commit()
        eng.recalculate(db)
    return {"message": "Subject now inherits the global policy"}


class EnrollmentExceptionIn(BaseModel):
    student_id: int
    subject_id: int
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None


@router.get("/enrollment-exceptions")
def list_enrollment_exceptions(student_id: Optional[int] = None, current_user: User = Depends(require_admin),
                               db: Session = Depends(get_db)) -> Any:
    q = db.query(SubjectEnrollment)
    if student_id:
        q = q.filter(SubjectEnrollment.student_id == student_id)
    out = []
    for e in q:
        st = db.get(StudentProfile, e.student_id)
        subj = db.get(Subject, e.subject_id)
        out.append({"id": e.id, "student_id": e.student_id, **_student_label(st), "subject_id": e.subject_id,
                    "subject_code": subj.code if subj else None, "status": e.status,
                    "effective_from": e.effective_from.isoformat() if e.effective_from else None,
                    "effective_to": e.effective_to.isoformat() if e.effective_to else None})
    return out


@router.post("/enrollment-exceptions")
def add_enrollment_exception(data: EnrollmentExceptionIn, current_user: User = Depends(require_admin),
                             db: Session = Depends(get_db)) -> Any:
    if not db.get(StudentProfile, data.student_id) or not db.get(Subject, data.subject_id):
        raise HTTPException(404, "Student or subject not found")
    if data.effective_from and data.effective_to and data.effective_to < data.effective_from:
        raise HTTPException(400, "effective_to must be on or after effective_from")
    e = SubjectEnrollment(student_id=data.student_id, subject_id=data.subject_id, status="DROPPED",
                          effective_from=data.effective_from, effective_to=data.effective_to)
    db.add(e)
    db.add(AuditLog(user_id=current_user.id, action="ENROLLMENT_EXCEPTION_ADDED", entity_type="STUDENT",
                    entity_id=str(data.student_id), details=str(data.model_dump())))
    db.commit()
    eng.recalculate(db, student_ids=[data.student_id])
    return {"id": e.id}


@router.delete("/enrollment-exceptions/{exc_id}")
def delete_enrollment_exception(exc_id: int, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> Any:
    e = db.get(SubjectEnrollment, exc_id)
    if not e:
        raise HTTPException(404, "Not found")
    sid = e.student_id
    db.delete(e)
    db.commit()
    eng.recalculate(db, student_ids=[sid])
    return {"message": "Removed"}
