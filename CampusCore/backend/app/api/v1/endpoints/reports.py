"""Attendance reports, computed from per-class attendance records (never from raw scan counts)."""
from collections import defaultdict
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import require_lecturer_or_admin
from app.core.database import get_db
from app.models.models import StudentProfile, User
from app.models.extended import AttendanceRecord, ClassSession
from app.api.v1.endpoints.attendance import _scoped_records, _student_label, export_records
from app.services import attendance_engine as eng

router = APIRouter()


@router.get("/daily")
def daily_report(date_val: Optional[date] = None, department_id: Optional[int] = None,
                 db: Session = Depends(get_db), current_user: User = Depends(require_lecturer_or_admin)) -> Any:
    policy = eng.get_policy(db)
    target = date_val or eng.college_now(policy).date()
    q = _scoped_records(db, current_user).filter(AttendanceRecord.date == target)
    if department_id:
        q = q.join(StudentProfile, AttendanceRecord.student_id == StudentProfile.id) \
             .filter(StudentProfile.department_id == department_id)
    recs = q.order_by(AttendanceRecord.scheduled_start).all()
    agg = eng.aggregate(recs, policy)
    return {
        "report_type": "DAILY_CLASS_ATTENDANCE",
        "date": target.isoformat(),
        **agg,
        "records": [{**eng.record_to_dict(r), **_student_label(r.student)} for r in recs],
    }


@router.get("/threshold-warnings")
def threshold_warnings(threshold: Optional[float] = None, department_id: Optional[int] = None,
                       db: Session = Depends(get_db), current_user: User = Depends(require_lecturer_or_admin)) -> Any:
    policy = eng.get_policy(db)
    min_pct = threshold if threshold is not None else policy.minimum_percentage
    q = _scoped_records(db, current_user)
    if department_id:
        q = q.join(StudentProfile, AttendanceRecord.student_id == StudentProfile.id) \
             .filter(StudentProfile.department_id == department_id)
    per: Dict[int, List[AttendanceRecord]] = defaultdict(list)
    for r in q:
        per[r.student_id].append(r)
    out = []
    for sid, lst in per.items():
        a = eng.aggregate(lst, policy)
        if a["percentage"] is not None and a["percentage"] < min_pct:
            st = lst[0].student
            out.append({"student_id": sid, "usn": st.student_id_number if st else None,
                        "name": st.user.full_name if (st and st.user) else None,
                        "department": st.department.code if (st and st.department) else None,
                        "attended": a["attended"], "classes_held": a["classes_held"], "pending": a["pending"],
                        "attendance_percentage": a["percentage"], "threshold": min_pct})
    out.sort(key=lambda x: x["attendance_percentage"])
    return {"threshold": min_pct, "total_warning_students": len(out), "students": out}


@router.get("/export/csv")
def export_csv(start_date: Optional[date] = None, end_date: Optional[date] = None, status_filter: Optional[str] = None,
               db: Session = Depends(get_db), current_user: User = Depends(require_lecturer_or_admin)) -> Response:
    return export_records(date_from=start_date, date_to=end_date, subject_id=None, section_id=None,
                          status=status_filter, current_user=current_user, db=db)
