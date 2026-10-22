"""
Timetable-based attendance calculation.

Definitions (also shown in the UI):
  * Evidence = Google Sheet rows matched to the student by RFID UID. Each row is one
    presence interval (entry -> exit), exactly as written by the existing Apps Script.
  * For every class session the student is expected to attend, the attended minutes are
    the UNION of the student's complete intervals clipped to the scheduled class window.
    Overlapping intervals are never double counted; time outside the class never counts.
  * Duration % = attended minutes / scheduled minutes x 100.
  * Status (per the configured policy, optionally overridden per subject):
        duration % >= present_min_percent (and >= min_required_minutes, if set)
            -> LATE if the first moment of presence is after start + grace, else PRESENT
        duration % >= partial_min_percent and > 0 minutes -> PARTIAL
        otherwise -> ABSENT
    A row with an entry but no exit (or exit but no entry) that could overlap the class is
    ambiguous evidence. It is never treated as presence; by default the class becomes
    PENDING_VERIFICATION (or the policy may treat it as ABSENT). Timestamps are never invented.
  * Subject / overall percentage = attended classes / applicable classes x 100, where
    attended = PRESENT (+ LATE if count_late_as_attended) (+ PARTIAL if count_partial_as_attended)
    and applicable = all evaluated classes except CANCELLED and EXCUSED.
    PENDING_VERIFICATION is applicable but NOT attended until it is resolved.
"""
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import pytz
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import (
    AttendancePolicy, ClassSchedule, StudentProfile, Subject, LecturerProfile, User,
)
from app.models.extended import (
    AttendanceRecord, ClassSession, SheetAttendanceRow, SubjectAttendanceRule, SubjectEnrollment,
)

PRESENT = "PRESENT"
LATE = "LATE"
PARTIAL = "PARTIAL"
ABSENT = "ABSENT"
PENDING = "PENDING_VERIFICATION"
EXCUSED = "EXCUSED"
CANCELLED = "CANCELLED"
ALL_STATUSES = [PRESENT, LATE, PARTIAL, ABSENT, PENDING, EXCUSED, CANCELLED]
CORRECTABLE_STATUSES = [PRESENT, LATE, PARTIAL, ABSENT, EXCUSED]

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


# ----------------------------------------------------------------------------
# Policy helpers
# ----------------------------------------------------------------------------

def get_policy(db: Session) -> AttendancePolicy:
    policy = db.query(AttendancePolicy).order_by(AttendancePolicy.id).first()
    if not policy:
        policy = AttendancePolicy(
            minimum_percentage=settings.ATTENDANCE_THRESHOLD_PERCENT,
            late_arrival_grace_minutes=settings.LATE_ARRIVAL_GRACE_MINUTES,
            college_timezone=settings.COLLEGE_TIMEZONE,
            auto_reconcile_enabled=True,
        )
        db.add(policy)
        db.commit()
        db.refresh(policy)
    changed = False
    defaults = {
        "present_min_percent": 75.0, "partial_min_percent": 25.0,
        "missing_exit_policy": PENDING, "missing_entry_policy": PENDING,
        "count_late_as_attended": True, "count_partial_as_attended": False, "version": 1,
    }
    for k, v in defaults.items():
        if getattr(policy, k, None) is None:
            setattr(policy, k, v)
            changed = True
    if changed:
        db.commit()
    return policy


def rules_for(policy: AttendancePolicy, override: Optional[SubjectAttendanceRule]) -> Dict[str, Any]:
    def pick(name: str, policy_name: Optional[str] = None):
        if override is not None and getattr(override, name, None) is not None:
            return getattr(override, name)
        return getattr(policy, policy_name or name)
    return {
        "grace": pick("late_arrival_grace_minutes") or 0,
        "present_min_percent": pick("present_min_percent"),
        "partial_min_percent": pick("partial_min_percent"),
        "min_required_minutes": pick("min_required_minutes"),
        "minimum_percentage": pick("minimum_percentage"),
        "missing_exit_policy": policy.missing_exit_policy or PENDING,
        "missing_entry_policy": policy.missing_entry_policy or PENDING,
    }


def college_now(policy: Optional[AttendancePolicy] = None) -> datetime:
    tz_name = (policy.college_timezone if policy is not None else None) or settings.COLLEGE_TIMEZONE
    try:
        tz = pytz.timezone(tz_name)
    except Exception:
        tz = pytz.timezone("Asia/Kolkata")
    return datetime.now(tz).replace(tzinfo=None)


def attended_statuses(policy: AttendancePolicy) -> List[str]:
    s = [PRESENT]
    if policy.count_late_as_attended:
        s.append(LATE)
    if policy.count_partial_as_attended:
        s.append(PARTIAL)
    return s


# ----------------------------------------------------------------------------
# Pure evaluation of one session for one student
# ----------------------------------------------------------------------------

def _fmt(t: Optional[time]) -> Optional[str]:
    return t.strftime("%H:%M:%S") if t else None


def union_minutes(segments: Sequence[Tuple[int, int]]) -> Tuple[int, List[Tuple[int, int]]]:
    merged: List[List[int]] = []
    for s, e in sorted(segments):
        if e <= s:
            continue
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return sum(e - s for s, e in merged), [(s, e) for s, e in merged]


def _secs(t: time) -> int:
    return t.hour * 3600 + t.minute * 60 + t.second


def evaluate_session(
    session_date: date,
    start: time,
    end: time,
    evidence: Iterable[Dict[str, Any]],
    rules: Dict[str, Any],
    now: datetime,
) -> Dict[str, Any]:
    """
    evidence: dicts with keys row_id, entry (time|None), exit (time|None) for the student's
    matched, non-removed, non-invalid rows on `session_date`.
    """
    S, E = _secs(start), _secs(end)
    scheduled_secs = max(E - S, 0)
    scheduled_minutes = scheduled_secs // 60

    complete, open_entries, open_exits = [], [], []
    for ev in evidence:
        en, ex = ev.get("entry"), ev.get("exit")
        if en and ex:
            complete.append((en, ex, ev.get("row_id")))
        elif en:
            open_entries.append((en, ev.get("row_id")))
        elif ex:
            open_exits.append((ex, ev.get("row_id")))

    segments, used_rows, interval_view = [], [], []
    for en, ex, rid in complete:
        a, b = max(_secs(en), S), min(_secs(ex), E)
        if b > a:
            segments.append((a, b))
            used_rows.append(rid)
            interval_view.append({"entry": _fmt(en), "exit": _fmt(ex), "row_id": rid})
    attended_secs, merged = union_minutes(segments)
    attended_minutes = attended_secs // 60
    pct = round(attended_secs / scheduled_secs * 100.0, 2) if scheduled_secs else 0.0

    first_presence = merged[0][0] if merged else None
    overlapping_complete = [c for c in complete if c[2] in used_rows]
    first_entry = min((c[0] for c in overlapping_complete), default=None)
    last_exit = max((c[1] for c in overlapping_complete), default=None)

    min_req = rules.get("min_required_minutes")
    meets_present = pct >= float(rules["present_min_percent"]) and (min_req is None or attended_minutes >= int(min_req))
    if attended_secs > 0 and meets_present:
        late_cut = S + int(rules["grace"]) * 60
        if first_presence is not None and first_presence > late_cut:
            status = LATE
            reason = f"Present for {attended_minutes}/{scheduled_minutes} min ({pct:.2f}%); first presence after the {rules['grace']}-minute grace period"
        else:
            status = PRESENT
            reason = f"Present for {attended_minutes}/{scheduled_minutes} min ({pct:.2f}%)"
    elif attended_secs > 0 and pct >= float(rules["partial_min_percent"]):
        status = PARTIAL
        reason = f"Present for only {attended_minutes}/{scheduled_minutes} min ({pct:.2f}%)"
    else:
        status = ABSENT
        reason = "No recorded presence during the class" if attended_secs == 0 else \
            f"Present for {attended_minutes}/{scheduled_minutes} min ({pct:.2f}%), below the partial threshold"

    # Ambiguous evidence that could overlap the class window
    ambiguous_rows = [rid for en, rid in open_entries if _secs(en) < E] + \
                     [rid for ex, rid in open_exits if _secs(ex) > S]
    if status not in (PRESENT, LATE) and ambiguous_rows:
        for en, rid in open_entries:
            if _secs(en) < E:
                interval_view.append({"entry": _fmt(en), "exit": None, "row_id": rid})
        for ex, rid in open_exits:
            if _secs(ex) > S:
                interval_view.append({"entry": None, "exit": _fmt(ex), "row_id": rid})
        has_open_entry = any(_secs(en) < E for en, _ in open_entries)
        has_open_exit = any(_secs(ex) > S for ex, _ in open_exits)
        if session_date == now.date() and has_open_entry:
            status, reason = PENDING, "Checked in without an exit yet; exit not recorded so far today"
        elif (has_open_entry and rules["missing_exit_policy"] == PENDING) or \
                (has_open_exit and rules["missing_entry_policy"] == PENDING):
            missing = "exit" if has_open_entry else "entry"
            status = PENDING
            reason = f"A scan with a missing {missing} time could overlap this class; presence cannot be confirmed without verification"
        else:
            reason += " (incomplete scan ignored per policy)"

    return {
        "status": status,
        "reason": reason,
        "scheduled_minutes": scheduled_minutes,
        "attended_minutes": attended_minutes,
        "duration_percent": pct,
        "first_entry": first_entry,
        "last_exit": last_exit,
        "intervals": interval_view,
        "row_ids": sorted({r for r in used_rows + ambiguous_rows if r is not None}),
    }


# ----------------------------------------------------------------------------
# Session generation
# ----------------------------------------------------------------------------

def tracking_start(db: Session, policy: AttendancePolicy) -> Optional[date]:
    """Attendance is evaluated from the configured start date, or (by default) from the
    first date that has RFID evidence in the sheet. With no evidence and no configured
    start, nothing is evaluated rather than marking everyone absent."""
    if policy.tracking_start_date:
        return policy.tracking_start_date
    return db.query(func.min(SheetAttendanceRow.event_date)).filter(
        SheetAttendanceRow.missing_from_source.is_(False),
        SheetAttendanceRow.event_date.isnot(None),
    ).scalar()


def ensure_sessions(db: Session, start: date, end: date) -> int:
    created = 0
    if end < start:
        return 0
    schedules = db.query(ClassSchedule).all()
    existing = {
        (s.schedule_id, s.date)
        for s in db.query(ClassSession.schedule_id, ClassSession.date).filter(
            ClassSession.date >= start, ClassSession.date <= end
        )
    }
    for sch in schedules:
        try:
            weekday = DAYS.index((sch.day_of_week or "").capitalize())
        except ValueError:
            continue
        lo = max(start, sch.effective_from) if sch.effective_from else start
        hi = min(end, sch.effective_to) if sch.effective_to else end
        if sch.is_active is False and not sch.effective_to:
            continue
        d = lo + timedelta(days=(weekday - lo.weekday()) % 7)
        while d <= hi:
            if (sch.id, d) not in existing:
                db.add(ClassSession(
                    schedule_id=sch.id, date=d, start_time=sch.start_time, end_time=sch.end_time,
                    subject_id=sch.subject_id, lecturer_id=sch.lecturer_id, section_id=sch.section_id,
                    room_number=sch.room_number, status="SCHEDULED",
                ))
                created += 1
            d += timedelta(days=7)
    db.flush()
    return created


def _is_expected(student: StudentProfile, session: ClassSession, drops: List[SubjectEnrollment]) -> bool:
    if student.section_id != session.section_id:
        return False
    if student.admission_date and session.date < student.admission_date:
        return False
    for d in drops:
        if d.subject_id == session.subject_id and d.status == "DROPPED":
            if (d.effective_from is None or d.effective_from <= session.date) and \
                    (d.effective_to is None or session.date <= d.effective_to):
                return False
    return True


# ----------------------------------------------------------------------------
# Recalculation
# ----------------------------------------------------------------------------

def recalculate(db: Session, start: Optional[date] = None, end: Optional[date] = None,
                student_ids: Optional[Sequence[int]] = None, commit: bool = True) -> Dict[str, Any]:
    policy = get_policy(db)
    now = college_now(policy)
    today = now.date()
    t_start = tracking_start(db, policy)
    if t_start is None:
        return {"evaluated": 0, "created": 0, "updated": 0, "removed": 0, "sessions_created": 0,
                "message": "No RFID evidence imported yet and no tracking start date configured; nothing to evaluate."}
    start = max(start or t_start, t_start)
    end = min(end or today, today)
    if end < start:
        return {"evaluated": 0, "created": 0, "updated": 0, "removed": 0, "sessions_created": 0,
                "message": "Date range is before attendance tracking starts."}

    sessions_created = ensure_sessions(db, start, end)

    sessions = db.query(ClassSession).filter(ClassSession.date >= start, ClassSession.date <= end).all()
    sq = db.query(StudentProfile).filter(StudentProfile.is_active.is_(True))
    if student_ids is not None:
        sq = sq.filter(StudentProfile.id.in_(list(student_ids)))
    students = sq.all()
    by_section: Dict[int, List[StudentProfile]] = defaultdict(list)
    for s in students:
        if s.section_id:
            by_section[s.section_id].append(s)
    sids = [s.id for s in students]

    drops: Dict[int, List[SubjectEnrollment]] = defaultdict(list)
    if sids:
        for d in db.query(SubjectEnrollment).filter(SubjectEnrollment.student_id.in_(sids)):
            drops[d.student_id].append(d)

    evidence: Dict[Tuple[int, date], List[Dict[str, Any]]] = defaultdict(list)
    if sids:
        rows = db.query(SheetAttendanceRow).filter(
            SheetAttendanceRow.student_id.in_(sids),
            SheetAttendanceRow.match_status == "MATCHED",
            SheetAttendanceRow.missing_from_source.is_(False),
            SheetAttendanceRow.validity != "INVALID",
            SheetAttendanceRow.event_date >= start,
            SheetAttendanceRow.event_date <= end,
        ).all()
        for r in rows:
            evidence[(r.student_id, r.event_date)].append(
                {"row_id": r.id, "entry": r.entry_time, "exit": r.exit_time})

    overrides = {o.subject_id: o for o in db.query(SubjectAttendanceRule).all()}
    existing: Dict[Tuple[int, int], AttendanceRecord] = {}
    if sids:
        for rec in db.query(AttendanceRecord).filter(
                AttendanceRecord.date >= start, AttendanceRecord.date <= end,
                AttendanceRecord.student_id.in_(sids)):
            existing[(rec.student_id, rec.session_id)] = rec

    stats = {"evaluated": 0, "created": 0, "updated": 0, "removed": 0, "sessions_created": sessions_created}
    seen = set()
    calc_time = datetime.utcnow()
    for sess in sessions:
        if datetime.combine(sess.date, sess.end_time) > now:
            continue  # class not finished yet
        rules = rules_for(policy, overrides.get(sess.subject_id))
        for st in by_section.get(sess.section_id, []):
            if not _is_expected(st, sess, drops[st.id]):
                continue
            key = (st.id, sess.id)
            seen.add(key)
            if sess.status == "CANCELLED":
                result = {"status": CANCELLED, "reason": sess.cancel_reason or "Class cancelled",
                          "scheduled_minutes": int((_secs(sess.end_time) - _secs(sess.start_time)) // 60),
                          "attended_minutes": 0, "duration_percent": 0.0, "first_entry": None,
                          "last_exit": None, "intervals": [], "row_ids": []}
            else:
                result = evaluate_session(sess.date, sess.start_time, sess.end_time,
                                          evidence.get((st.id, sess.date), []), rules, now)
            rec = existing.get(key)
            stats["evaluated"] += 1
            if rec is None:
                rec = AttendanceRecord(student_id=st.id, session_id=sess.id, date=sess.date,
                                       subject_id=sess.subject_id)
                db.add(rec)
                stats["created"] += 1
            else:
                if rec.computed_status != result["status"] or rec.attended_minutes != result["attended_minutes"]:
                    stats["updated"] += 1
                    if rec.is_overridden:
                        rec.override_stale = True
            rec.scheduled_start = sess.start_time
            rec.scheduled_end = sess.end_time
            rec.scheduled_minutes = result["scheduled_minutes"]
            rec.intervals = result["intervals"]
            rec.first_entry = result["first_entry"]
            rec.last_exit = result["last_exit"]
            rec.attended_minutes = result["attended_minutes"]
            rec.duration_percent = result["duration_percent"]
            rec.computed_status = result["status"]
            rec.status_reason = result["reason"]
            rec.source_row_ids = result["row_ids"]
            rec.policy_id = policy.id
            rec.policy_version = policy.version
            rec.calculated_at = calc_time
            rec.final_status = rec.override_status if (rec.is_overridden and rec.override_status) else result["status"]

    # Records whose session/enrollment no longer applies (e.g. subject dropped).
    for key, rec in existing.items():
        if key not in seen and not rec.is_overridden:
            sess = rec.session
            if sess is not None and datetime.combine(sess.date, sess.end_time) > now:
                continue
            db.delete(rec)
            stats["removed"] += 1
    if commit:
        db.commit()
    else:
        db.flush()
    stats["range"] = {"start": start.isoformat(), "end": end.isoformat()}
    return stats


# ----------------------------------------------------------------------------
# Read models
# ----------------------------------------------------------------------------

def record_to_dict(rec: AttendanceRecord) -> Dict[str, Any]:
    sess = rec.session
    subj = rec.subject
    return {
        "id": rec.id,
        "student_id": rec.student_id,
        "session_id": rec.session_id,
        "date": rec.date.isoformat(),
        "subject_id": rec.subject_id,
        "subject_code": subj.code if subj else None,
        "subject_name": subj.name if subj else None,
        "scheduled_start": _fmt(rec.scheduled_start),
        "scheduled_end": _fmt(rec.scheduled_end),
        "scheduled_minutes": rec.scheduled_minutes,
        "first_entry": _fmt(rec.first_entry),
        "last_exit": _fmt(rec.last_exit),
        "intervals": rec.intervals or [],
        "attended_minutes": rec.attended_minutes,
        "duration_percent": rec.duration_percent,
        "computed_status": rec.computed_status,
        "final_status": rec.final_status,
        "status_reason": rec.status_reason,
        "source_row_ids": rec.source_row_ids or [],
        "is_overridden": rec.is_overridden,
        "override_status": rec.override_status,
        "override_reason": rec.override_reason,
        "override_stale": rec.override_stale,
        "policy_version": rec.policy_version,
        "calculated_at": rec.calculated_at.isoformat() + "Z" if rec.calculated_at else None,
        "room_number": sess.room_number if sess else None,
        "lecturer_name": sess.lecturer.user.full_name if (sess and sess.lecturer and sess.lecturer.user) else None,
        "session_status": sess.status if sess else None,
    }


def aggregate(records: Iterable[AttendanceRecord], policy: AttendancePolicy) -> Dict[str, Any]:
    counted = attended_statuses(policy)
    c = defaultdict(int)
    for r in records:
        c[r.final_status] += 1
    total = sum(c.values())
    applicable = total - c[CANCELLED] - c[EXCUSED]
    attended = sum(c[s] for s in counted)
    return {
        "total_sessions": total,
        "classes_held": applicable,
        "present": c[PRESENT], "late": c[LATE], "partial": c[PARTIAL], "absent": c[ABSENT],
        "pending": c[PENDING], "excused": c[EXCUSED], "cancelled": c[CANCELLED],
        "attended": attended,
        "missed": c[ABSENT] + (c[PARTIAL] if PARTIAL not in counted else 0) + (c[LATE] if LATE not in counted else 0),
        "percentage": round(attended / applicable * 100.0, 2) if applicable else None,
    }


def student_summary(db: Session, student: StudentProfile, start: Optional[date] = None,
                    end: Optional[date] = None) -> Dict[str, Any]:
    policy = get_policy(db)
    q = db.query(AttendanceRecord).filter(AttendanceRecord.student_id == student.id)
    if start:
        q = q.filter(AttendanceRecord.date >= start)
    if end:
        q = q.filter(AttendanceRecord.date <= end)
    records = q.order_by(AttendanceRecord.date.desc(), AttendanceRecord.scheduled_start.desc()).all()
    overrides = {o.subject_id: o for o in db.query(SubjectAttendanceRule).all()}

    overall = aggregate(records, policy)
    by_subject: Dict[int, List[AttendanceRecord]] = defaultdict(list)
    for r in records:
        by_subject[r.subject_id].append(r)
    subjects = []
    for sid, recs in by_subject.items():
        agg = aggregate(recs, policy)
        subj = recs[0].subject
        ov = overrides.get(sid)
        threshold = ov.minimum_percentage if (ov and ov.minimum_percentage is not None) else policy.minimum_percentage
        agg.update({
            "subject_id": sid, "subject_code": subj.code if subj else None,
            "subject_name": subj.name if subj else None, "threshold": threshold,
            "below_threshold": agg["percentage"] is not None and agg["percentage"] < threshold,
        })
        subjects.append(agg)
    subjects.sort(key=lambda s: s["subject_code"] or "")

    # Alerts
    alerts = []
    if overall["percentage"] is not None and overall["percentage"] < policy.minimum_percentage:
        alerts.append({"type": "BELOW_THRESHOLD", "severity": "danger",
                       "message": f"Overall attendance {overall['percentage']:.2f}% is below the required {policy.minimum_percentage:.0f}%."})
    for s in subjects:
        if s["below_threshold"]:
            alerts.append({"type": "SUBJECT_BELOW_THRESHOLD", "severity": "warning",
                           "message": f"{s['subject_code']} attendance {s['percentage']:.2f}% is below {s['threshold']:.0f}%."})
    recent_cut = college_now(policy).date() - timedelta(days=14)
    recent_late = sum(1 for r in records if r.final_status == LATE and r.date >= recent_cut)
    if recent_late >= 3:
        alerts.append({"type": "REPEATED_LATE", "severity": "warning",
                       "message": f"{recent_late} late arrivals in the last 14 days."})
    missing_exit = db.query(SheetAttendanceRow).filter(
        SheetAttendanceRow.student_id == student.id, SheetAttendanceRow.match_status == "MATCHED",
        SheetAttendanceRow.missing_from_source.is_(False), SheetAttendanceRow.entry_time.isnot(None),
        SheetAttendanceRow.exit_time.is_(None),
    ).count()
    if missing_exit:
        alerts.append({"type": "MISSING_EXIT", "severity": "info",
                       "message": f"{missing_exit} RFID scan(s) have an entry time but no exit time."})
    if overall["pending"]:
        alerts.append({"type": "PENDING_VERIFICATION", "severity": "info",
                       "message": f"{overall['pending']} class record(s) are awaiting verification and are not counted as attended."})

    return {
        "policy": policy_to_dict(policy),
        "overall": overall,
        "subjects": subjects,
        "subjects_below_threshold": sum(1 for s in subjects if s["below_threshold"]),
        "records": [record_to_dict(r) for r in records],
        "alerts": alerts,
        "tracking_start": (tracking_start(db, policy).isoformat() if tracking_start(db, policy) else None),
    }


def policy_to_dict(p: AttendancePolicy) -> Dict[str, Any]:
    return {
        "id": p.id,
        "minimum_percentage": p.minimum_percentage,
        "late_arrival_grace_minutes": p.late_arrival_grace_minutes,
        "college_timezone": p.college_timezone,
        "present_min_percent": p.present_min_percent,
        "partial_min_percent": p.partial_min_percent,
        "min_required_minutes": p.min_required_minutes,
        "missing_exit_policy": p.missing_exit_policy,
        "missing_entry_policy": p.missing_entry_policy,
        "count_late_as_attended": p.count_late_as_attended,
        "count_partial_as_attended": p.count_partial_as_attended,
        "tracking_start_date": p.tracking_start_date.isoformat() if p.tracking_start_date else None,
        "version": p.version,
        "updated_at": p.updated_at.isoformat() + "Z" if p.updated_at else None,
        # kept for backward compatibility with the existing settings page
        "auto_reconcile_enabled": p.auto_reconcile_enabled,
        "total_conducted_days": p.total_conducted_days,
    }
