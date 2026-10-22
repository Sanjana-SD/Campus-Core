"""
Placement domain rules.

Lifecycle dimensions of an application are kept separate on purpose:
  applied (application_status) -> registration confirmed (registration_status)
  -> attended the drive (attendance_status) -> selection stages / result
  -> offer recorded (PlacementOffer.status=OFFERED) -> offer accepted/declined -> placed (is_placed)

Metric definitions (used by dashboards and reports):
  upcoming drives          published, non-cancelled drives whose drive date is today or later
  open applications        published drives whose application window contains "now"
  drives attended          distinct drives where attendance_status = ATTENDED
  companies selected       distinct companies with result = SELECTED
  offers received / total  number of PlacementOffer rows (status != REVOKED)
  unique students placed   distinct students with at least one offer where is_placed = true
"""
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import Course, Department, Notification, Semester, StudentProfile, User, UserRole
from app.models.extended import (
    Company, EligibilityException, PlacementApplication, PlacementDrive, PlacementOffer,
    SelectionStageHistory,
)
from app.services.attendance_engine import college_now

DRIVE_STORED_STATUSES = ["DRAFT", "PUBLISHED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]
DRIVE_EFFECTIVE_STATUSES = ["DRAFT", "UPCOMING", "APPLICATIONS_OPEN", "APPLICATIONS_CLOSED",
                            "IN_PROGRESS", "COMPLETED", "CANCELLED"]
DEFAULT_STAGES = ["Application Submitted", "Eligibility Verified", "Assessment", "Technical Interview", "HR Interview"]
RESULTS = ["IN_PROCESS", "SHORTLISTED", "SELECTED", "REJECTED"]
REGISTRATION = ["PENDING", "CONFIRMED", "REJECTED"]
ATTENDANCE = ["NOT_RECORDED", "ATTENDED", "DID_NOT_ATTEND"]
OFFER_STATUSES = ["OFFERED", "ACCEPTED", "DECLINED", "REVOKED"]


def now_local() -> datetime:
    return college_now()


def company_key(name: str) -> str:
    s = re.sub(r"[^a-z0-9 ]", "", (name or "").lower())
    s = re.sub(r"\b(private|pvt|limited|ltd|inc|llp|corporation|corp|co)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def effective_status(drive: PlacementDrive, now: Optional[datetime] = None) -> str:
    if drive.status != "PUBLISHED":
        return drive.status
    now = now or now_local()
    if drive.application_open_at and now < drive.application_open_at:
        return "UPCOMING"
    if drive.application_deadline and now > drive.application_deadline:
        return "APPLICATIONS_CLOSED"
    return "APPLICATIONS_OPEN"


def applications_open(drive: PlacementDrive, now: Optional[datetime] = None) -> bool:
    return effective_status(drive, now) == "APPLICATIONS_OPEN"


# ----------------------------------------------------------------------------
# Eligibility
# ----------------------------------------------------------------------------

def _semester_number(db: Session, student: StudentProfile) -> Optional[int]:
    if not student.semester_id:
        return None
    sem = db.get(Semester, student.semester_id)
    return sem.number if sem else None


def evaluate_eligibility(db: Session, drive: PlacementDrive, student: StudentProfile) -> Dict[str, Any]:
    checks: List[Dict[str, Any]] = []

    def add(criterion: str, requirement: str, value: Any, outcome: str, note: str = ""):
        checks.append({"criterion": criterion, "requirement": requirement,
                       "student_value": value, "outcome": outcome, "note": note})

    if drive.eligible_department_ids:
        names = [d.code for d in db.query(Department).filter(Department.id.in_(drive.eligible_department_ids))]
        dept = student.department.code if student.department else None
        add("Department", ", ".join(names) or "-", dept,
            "PASS" if student.department_id in drive.eligible_department_ids else "FAIL")
    if drive.eligible_course_ids:
        names = [c.code for c in db.query(Course).filter(Course.id.in_(drive.eligible_course_ids))]
        add("Branch / Programme", ", ".join(names) or "-", student.course.code if student.course else None,
            "PASS" if student.course_id in drive.eligible_course_ids else "FAIL")
    if drive.eligible_semesters:
        sem = _semester_number(db, student)
        req = ", ".join(str(s) for s in drive.eligible_semesters)
        add("Semester", req, sem, "MISSING" if sem is None else ("PASS" if sem in drive.eligible_semesters else "FAIL"),
            "Semester not recorded in your profile" if sem is None else "")
    if drive.graduation_years:
        gy = student.graduation_year
        req = ", ".join(str(y) for y in drive.graduation_years)
        add("Graduation year", req, gy, "MISSING" if gy is None else ("PASS" if gy in drive.graduation_years else "FAIL"),
            "Graduation year not recorded in your profile" if gy is None else "")
    if drive.min_cgpa is not None:
        cg = student.cgpa
        add("Minimum CGPA", f">= {drive.min_cgpa}", cg,
            "MISSING" if cg is None else ("PASS" if cg >= drive.min_cgpa else "FAIL"),
            "CGPA not recorded in your profile" if cg is None else "")
    if drive.max_active_backlogs is not None:
        bl = student.active_backlogs
        add("Active backlogs", f"<= {drive.max_active_backlogs}", bl,
            "MISSING" if bl is None else ("PASS" if bl <= drive.max_active_backlogs else "FAIL"),
            "Backlog count not recorded in your profile" if bl is None else "")

    if student.enrollment_status and student.enrollment_status not in ("ACTIVE",):
        add("Enrollment", "ACTIVE", student.enrollment_status, "FAIL")

    exception = db.query(EligibilityException).filter(
        EligibilityException.drive_id == drive.id, EligibilityException.student_id == student.id).first()

    if any(c["outcome"] == "FAIL" for c in checks):
        status = "INELIGIBLE"
    elif any(c["outcome"] == "MISSING" for c in checks):
        status = "INCOMPLETE_INFORMATION"
    else:
        status = "ELIGIBLE"
    return {
        "status": status,
        "checks": checks,
        "has_exception": exception is not None,
        "exception_reason": exception.reason if exception else None,
        "can_apply_by_eligibility": status == "ELIGIBLE" or exception is not None,
        "other_requirements": drive.other_requirements,
    }


# ----------------------------------------------------------------------------
# Status helpers
# ----------------------------------------------------------------------------

def overall_label(app: PlacementApplication) -> str:
    """Single human-readable position of an application in the pipeline."""
    offer = app.offer
    if app.application_status == "WITHDRAWN":
        return "Withdrawn"
    if offer and offer.status != "REVOKED":
        if offer.is_placed:
            return "Placed"
        return {"OFFERED": "Offer Received", "ACCEPTED": "Offer Accepted", "DECLINED": "Offer Declined"}[offer.status]
    if app.result == "SELECTED":
        return "Selected"
    if app.result == "REJECTED":
        return "Rejected"
    if app.result == "SHORTLISTED":
        return "Shortlisted"
    if app.attendance_status == "ATTENDED":
        return "Attended"
    if app.attendance_status == "DID_NOT_ATTEND":
        return "Did Not Attend"
    if app.registration_status == "CONFIRMED":
        return "Registration Confirmed"
    if app.registration_status == "REJECTED":
        return "Registration Rejected"
    return "Applied"


def log_change(db: Session, app: PlacementApplication, field: str, old: Any, new: Any,
               user: Optional[User], notes: Optional[str] = None) -> None:
    if str(old) == str(new):
        return
    db.add(SelectionStageHistory(application_id=app.id, field=field,
                                 old_value=None if old is None else str(old),
                                 new_value=None if new is None else str(new),
                                 notes=notes, changed_by_id=user.id if user else None))


def notify(db: Session, user_id: int, title: str, message: str, ntype: str, link: Optional[str] = None,
           dedupe_key: Optional[str] = None) -> Optional[Notification]:
    if dedupe_key and db.query(Notification).filter(Notification.user_id == user_id,
                                                    Notification.dedupe_key == dedupe_key).first():
        return None
    n = Notification(user_id=user_id, title=title, message=message, type=ntype, link=link, dedupe_key=dedupe_key)
    db.add(n)
    return n


def notify_student(db: Session, student: StudentProfile, title: str, message: str, ntype: str,
                   link: Optional[str] = None, dedupe_key: Optional[str] = None) -> None:
    if student and student.user_id:
        notify(db, student.user_id, title, message, ntype, link, dedupe_key)


def apply_transition(db: Session, app: PlacementApplication, user: User, data: Dict[str, Any]) -> None:
    """Validates and applies an officer's update. Raises HTTP 400 on invalid transitions."""
    drive = app.drive
    student = app.student
    company = drive.company.name if drive.company else "the company"
    link = f"/student/placements/applications"
    if app.application_status == "WITHDRAWN":
        raise HTTPException(400, "This application was withdrawn and can no longer be updated.")

    reg = data.get("registration_status")
    if reg is not None and reg != app.registration_status:
        if reg not in REGISTRATION:
            raise HTTPException(400, f"Invalid registration status '{reg}'")
        if app.attendance_status != "NOT_RECORDED" and reg != "CONFIRMED":
            raise HTTPException(400, "Attendance is already recorded; registration must remain confirmed.")
        log_change(db, app, "registration", app.registration_status, reg, user, data.get("notes"))
        app.registration_status = reg
        notify_student(db, student, "Drive registration updated",
                       f"Your registration for {drive.job_title} at {company} is now {reg.lower()}.",
                       "PLACEMENT_STATUS", link)

    att = data.get("attendance_status")
    if att is not None and att != app.attendance_status:
        if att not in ATTENDANCE:
            raise HTTPException(400, f"Invalid attendance status '{att}'")
        if att != "NOT_RECORDED" and app.registration_status != "CONFIRMED":
            raise HTTPException(400, "Confirm the student's drive registration before recording drive attendance.")
        if att != "ATTENDED" and app.result == "SELECTED":
            raise HTTPException(400, "A selected student must have attended the drive.")
        log_change(db, app, "attendance", app.attendance_status, att, user, data.get("notes"))
        app.attendance_status = att

    stage = data.get("current_stage")
    if stage is not None and stage != app.current_stage:
        allowed = list(DEFAULT_STAGES) + list(drive.selection_process or [])
        if stage not in allowed:
            raise HTTPException(400, f"Stage '{stage}' is not part of this drive's selection process: {', '.join(allowed)}")
        log_change(db, app, "stage", app.current_stage, stage, user, data.get("notes"))
        app.current_stage = stage
        notify_student(db, student, "Selection stage updated",
                       f"{drive.job_title} at {company}: you are now at stage '{stage}'.",
                       "PLACEMENT_STATUS", link)

    res = data.get("result")
    if res is not None and res != app.result:
        if res not in RESULTS:
            raise HTTPException(400, f"Invalid result '{res}'")
        if app.offer is not None and app.offer.status != "REVOKED":
            raise HTTPException(400, "An offer is already recorded; revoke it before changing the selection result.")
        if res == "SELECTED" and app.attendance_status != "ATTENDED":
            raise HTTPException(400, "Record the student's drive attendance (Attended) before marking them Selected.")
        log_change(db, app, "result", app.result, res, user, data.get("notes"))
        app.result = res
        app.result_date = data.get("result_date") or now_local().date()
        notify_student(db, student, "Selection result published",
                       f"Your result for {drive.job_title} at {company}: {res.replace('_', ' ').title()}.",
                       "PLACEMENT_RESULT", link)

    if "notes" in data and data.get("notes") is not None and not any(
            data.get(k) is not None for k in ("registration_status", "attendance_status", "current_stage", "result")):
        app.notes = data["notes"]


def record_offer(db: Session, app: PlacementApplication, user: User, data: Dict[str, Any]) -> PlacementOffer:
    if app.result != "SELECTED":
        raise HTTPException(400, "An offer can only be recorded for a student whose official result is Selected.")
    offer = app.offer
    if offer is None:
        offer = PlacementOffer(application_id=app.id, student_id=app.student_id, drive_id=app.drive_id,
                               company_id=app.drive.company_id, status="OFFERED", created_by_id=user.id)
        db.add(offer)
        db.flush()
        log_change(db, app, "offer", None, "OFFERED", user, data.get("notes"))
        notify_student(db, app.student, "Offer recorded",
                       f"An offer from {app.drive.company.name} for {app.drive.job_title} has been recorded.",
                       "PLACEMENT_OFFER", "/student/placements/applications")
    for k in ("offered_ctc", "offer_date", "joining_date", "notes"):
        if k in data and data[k] is not None:
            setattr(offer, k, data[k])

    new_status = data.get("status")
    if new_status and new_status != offer.status:
        if new_status not in OFFER_STATUSES:
            raise HTTPException(400, f"Invalid offer status '{new_status}'")
        if offer.is_placed and new_status != "ACCEPTED":
            raise HTTPException(400, "This offer is confirmed as a placement. Remove the placement confirmation first.")
        if new_status in ("ACCEPTED", "DECLINED") and offer.status not in ("OFFERED", "ACCEPTED", "DECLINED"):
            raise HTTPException(400, f"Cannot change an offer from {offer.status} to {new_status}.")
        log_change(db, app, "offer", offer.status, new_status, user, data.get("notes"))
        offer.status = new_status
        offer.responded_at = datetime.utcnow() if new_status in ("ACCEPTED", "DECLINED") else offer.responded_at
        notify_student(db, app.student, "Offer status updated",
                       f"Your offer from {app.drive.company.name} is now marked {new_status.lower()}.",
                       "PLACEMENT_OFFER", "/student/placements/applications")

    placed = data.get("is_placed")
    if placed is not None and bool(placed) != bool(offer.is_placed):
        if placed and offer.status != "ACCEPTED":
            raise HTTPException(400, "Only an accepted offer can be confirmed as a final placement.")
        log_change(db, app, "placement", offer.is_placed, bool(placed), user, data.get("notes"))
        offer.is_placed = bool(placed)
        offer.placed_confirmed_at = datetime.utcnow() if placed else None
        if placed:
            notify_student(db, app.student, "Placement confirmed",
                           f"Your placement with {app.drive.company.name} has been officially confirmed.",
                           "PLACEMENT_OFFER", "/student/placements/history")
    return offer


# ----------------------------------------------------------------------------
# Reminders (idempotent; run lazily when placement data is read)
# ----------------------------------------------------------------------------

def run_reminders(db: Session) -> int:
    now = now_local()
    created = 0
    drives = db.query(PlacementDrive).filter(PlacementDrive.status == "PUBLISHED").all()
    for d in drives:
        apps = {a.student_id: a for a in d.applications if a.application_status == "APPLIED"}
        company = d.company.name if d.company else "Company"
        if d.application_deadline:
            delta = d.application_deadline - now
            if timedelta(0) < delta <= timedelta(hours=48):
                for st in db.query(StudentProfile).filter(StudentProfile.is_active.is_(True)):
                    if st.id in apps:
                        continue
                    if evaluate_eligibility(db, d, st)["status"] == "INELIGIBLE":
                        continue
                    if notify(db, st.user_id, "Application deadline approaching",
                              f"Applications for {d.job_title} at {company} close on "
                              f"{d.application_deadline.strftime('%d %b %Y %H:%M')}.",
                              "PLACEMENT_DEADLINE", f"/student/placements/drives/{d.id}",
                              f"deadline-soon:{d.id}"):
                        created += 1
            elif delta <= timedelta(0):
                for a in apps.values():
                    if notify(db, a.student.user_id, "Application deadline passed",
                              f"Applications for {d.job_title} at {company} are now closed. Your application is on record.",
                              "PLACEMENT_DEADLINE", f"/student/placements/drives/{d.id}", f"deadline-passed:{d.id}"):
                        created += 1
        if d.drive_date:
            days = (d.drive_date - now.date()).days
            if 0 <= days <= 2:
                for a in apps.values():
                    if a.registration_status == "REJECTED":
                        continue
                    if notify(db, a.student.user_id, "Placement drive approaching",
                              f"{company} – {d.job_title} drive is on {d.drive_date.strftime('%d %b %Y')}"
                              + (f" at {d.drive_time.strftime('%H:%M')}" if d.drive_time else "")
                              + (f", {d.venue}" if d.venue else "") + ".",
                              "PLACEMENT_DRIVE", f"/student/placements/drives/{d.id}", f"drive-soon:{d.id}"):
                        created += 1
    if created:
        db.commit()
    return created


# ----------------------------------------------------------------------------
# Serialisers
# ----------------------------------------------------------------------------

def company_to_dict(c: Company, include_private: bool) -> Dict[str, Any]:
    d = {"id": c.id, "name": c.name, "logo_url": c.logo_url, "industry": c.industry,
         "description": c.description, "website": c.website, "location": c.location, "status": c.status}
    if include_private:
        d.update({"recruiter_name": c.recruiter_name, "recruiter_email": c.recruiter_email,
                  "recruiter_phone": c.recruiter_phone, "notes": c.notes,
                  "created_at": c.created_at.isoformat() + "Z" if c.created_at else None,
                  "drive_count": len(c.drives)})
    return d


def drive_to_dict(db: Session, d: PlacementDrive, include_private: bool = False) -> Dict[str, Any]:
    dept_names = [x.code for x in db.query(Department).filter(Department.id.in_(d.eligible_department_ids))] \
        if d.eligible_department_ids else []
    course_names = [x.code for x in db.query(Course).filter(Course.id.in_(d.eligible_course_ids))] \
        if d.eligible_course_ids else []
    out = {
        "id": d.id, "company_id": d.company_id,
        "company": company_to_dict(d.company, include_private=False) if d.company else None,
        "job_title": d.job_title, "job_description": d.job_description, "job_type": d.job_type,
        "job_location": d.job_location, "work_mode": d.work_mode, "ctc_min": d.ctc_min, "ctc_max": d.ctc_max,
        "ctc_text": d.ctc_text, "required_skills": d.required_skills or [],
        "eligible_department_ids": d.eligible_department_ids or [], "eligible_departments": dept_names,
        "eligible_course_ids": d.eligible_course_ids or [], "eligible_courses": course_names,
        "eligible_semesters": d.eligible_semesters or [], "graduation_years": d.graduation_years or [],
        "min_cgpa": d.min_cgpa, "max_active_backlogs": d.max_active_backlogs,
        "other_requirements": d.other_requirements,
        "application_open_at": d.application_open_at.isoformat() if d.application_open_at else None,
        "application_deadline": d.application_deadline.isoformat() if d.application_deadline else None,
        "drive_date": d.drive_date.isoformat() if d.drive_date else None,
        "drive_time": d.drive_time.strftime("%H:%M") if d.drive_time else None,
        "venue": d.venue, "meeting_link": d.meeting_link,
        "selection_process": d.selection_process or [], "vacancies": d.vacancies,
        "instructions": d.instructions, "contact_person": d.contact_person, "contact_email": d.contact_email,
        "status": d.status, "effective_status": effective_status(d),
        "published_at": d.published_at.isoformat() + "Z" if d.published_at else None,
        "created_at": d.created_at.isoformat() + "Z" if d.created_at else None,
    }
    if include_private:
        apps = [a for a in d.applications if a.application_status == "APPLIED"]
        out["counts"] = {
            "applications": len(apps),
            "registered": sum(1 for a in apps if a.registration_status == "CONFIRMED"),
            "attended": sum(1 for a in apps if a.attendance_status == "ATTENDED"),
            "shortlisted": sum(1 for a in apps if a.result in ("SHORTLISTED", "SELECTED")),
            "selected": sum(1 for a in apps if a.result == "SELECTED"),
            "offers": sum(1 for a in apps if a.offer and a.offer.status != "REVOKED"),
            "placed": sum(1 for a in apps if a.offer and a.offer.is_placed),
        }
    return out


def application_to_dict(a: PlacementApplication, for_officer: bool) -> Dict[str, Any]:
    st = a.student
    offer = a.offer
    out = {
        "id": a.id, "drive_id": a.drive_id, "student_id": a.student_id,
        "applied_at": a.applied_at.isoformat() + "Z" if a.applied_at else None,
        "application_status": a.application_status, "registration_status": a.registration_status,
        "attendance_status": a.attendance_status, "current_stage": a.current_stage, "result": a.result,
        "result_date": a.result_date.isoformat() if a.result_date else None,
        "overall_status": overall_label(a),
        "offer": None if (offer is None or (offer.status == "REVOKED" and not for_officer)) else {
            "id": offer.id, "offered_ctc": offer.offered_ctc,
            "offer_date": offer.offer_date.isoformat() if offer.offer_date else None,
            "joining_date": offer.joining_date.isoformat() if offer.joining_date else None,
            "status": offer.status, "is_placed": offer.is_placed,
            "placed_confirmed_at": offer.placed_confirmed_at.isoformat() + "Z" if offer.placed_confirmed_at else None,
            **({"notes": offer.notes} if for_officer else {}),
        },
        "drive": {
            "job_title": a.drive.job_title, "company_name": a.drive.company.name if a.drive.company else None,
            "company_logo": a.drive.company.logo_url if a.drive.company else None,
            "drive_date": a.drive.drive_date.isoformat() if a.drive.drive_date else None,
            "effective_status": effective_status(a.drive),
            "selection_process": a.drive.selection_process or [],
        },
        "history": [{"field": h.field, "old_value": h.old_value, "new_value": h.new_value,
                     "changed_at": h.changed_at.isoformat() + "Z" if h.changed_at else None,
                     **({"notes": h.notes, "changed_by": h.changed_by.full_name if h.changed_by else None}
                        if for_officer else {})}
                    for h in a.history],
    }
    if for_officer and st:
        out.update({
            "notes": a.notes, "via_exception": a.via_exception, "eligibility_snapshot": a.eligibility_snapshot,
            "student": {
                "id": st.id, "name": st.user.full_name if st.user else None, "usn": st.student_id_number,
                "email": st.user.email if st.user else None,
                "department": st.department.code if st.department else None,
                "semester": st.semester_id and _sem_num(st), "graduation_year": st.graduation_year,
                "cgpa": st.cgpa, "active_backlogs": st.active_backlogs,
            },
        })
    return out


def _sem_num(st: StudentProfile) -> Optional[int]:
    from sqlalchemy.orm import object_session
    s = object_session(st)
    if s is None or not st.semester_id:
        return None
    sem = s.get(Semester, st.semester_id)
    return sem.number if sem else None


# ----------------------------------------------------------------------------
# Statistics
# ----------------------------------------------------------------------------

def officer_stats(db: Session) -> Dict[str, Any]:
    now = now_local()
    drives = db.query(PlacementDrive).all()
    apps = db.query(PlacementApplication).filter(PlacementApplication.application_status == "APPLIED").all()
    offers = db.query(PlacementOffer).filter(PlacementOffer.status != "REVOKED").all()
    published = [d for d in drives if d.status in ("PUBLISHED", "IN_PROGRESS")]
    upcoming = [d for d in drives if d.status in ("PUBLISHED", "IN_PROGRESS") and d.drive_date and d.drive_date >= now.date()]
    open_ = [d for d in drives if applications_open(d, now)]
    completed = [d for d in drives if d.status == "COMPLETED"]
    companies_visiting = {d.company_id for d in drives if d.status in ("PUBLISHED", "IN_PROGRESS", "COMPLETED")}

    cards = {
        "total_students": db.query(StudentProfile).filter(StudentProfile.is_active.is_(True)).count(),
        "upcoming_drives": len(upcoming),
        "open_applications": len(open_),
        "completed_drives": len(completed),
        "total_applications": len(apps),
        "students_applied": len({a.student_id for a in apps}),
        "students_registered": len({a.student_id for a in apps if a.registration_status == "CONFIRMED"}),
        "students_attended": len({a.student_id for a in apps if a.attendance_status == "ATTENDED"}),
        "students_shortlisted": len({a.student_id for a in apps if a.result in ("SHORTLISTED", "SELECTED")}),
        "students_selected": len({a.student_id for a in apps if a.result == "SELECTED"}),
        "offers_received": len(offers),
        "offers_accepted": sum(1 for o in offers if o.status == "ACCEPTED"),
        "offers_declined": sum(1 for o in offers if o.status == "DECLINED"),
        "unique_students_placed": len({o.student_id for o in offers if o.is_placed}),
        "confirmed_placements": sum(1 for o in offers if o.is_placed),
        "companies_visiting": len(companies_visiting),
        "published_drives": len(published),
    }

    company_apps: Dict[str, int] = defaultdict(int)
    drive_part = []
    for d in drives:
        cname = d.company.name if d.company else f"Company {d.company_id}"
        d_apps = [a for a in apps if a.drive_id == d.id]
        company_apps[cname] += len(d_apps)
        if d.status != "DRAFT":
            drive_part.append({"drive_id": d.id, "label": f"{cname} – {d.job_title}",
                               "applications": len(d_apps),
                               "attended": sum(1 for a in d_apps if a.attendance_status == "ATTENDED"),
                               "selected": sum(1 for a in d_apps if a.result == "SELECTED")})

    dept: Dict[str, Dict[str, set]] = defaultdict(lambda: {"applied": set(), "selected": set(), "placed": set()})
    for a in apps:
        code = a.student.department.code if (a.student and a.student.department) else "Unassigned"
        dept[code]["applied"].add(a.student_id)
        if a.result == "SELECTED":
            dept[code]["selected"].add(a.student_id)
        if a.offer and a.offer.status != "REVOKED" and a.offer.is_placed:
            dept[code]["placed"].add(a.student_id)

    monthly: Dict[str, Dict[str, int]] = defaultdict(lambda: {"applications": 0, "offers": 0, "drives": 0})
    for a in apps:
        if a.applied_at:
            monthly[a.applied_at.strftime("%Y-%m")]["applications"] += 1
    for o in offers:
        ref = o.offer_date or (o.created_at.date() if o.created_at else None)
        if ref:
            monthly[ref.strftime("%Y-%m")]["offers"] += 1
    for d in drives:
        if d.drive_date and d.status != "DRAFT":
            monthly[d.drive_date.strftime("%Y-%m")]["drives"] += 1

    def rate(n, base):
        return round(n / base * 100.0, 2) if base else None

    funnel = {
        "applied": cards["total_applications"],
        "registered": sum(1 for a in apps if a.registration_status == "CONFIRMED"),
        "attended": sum(1 for a in apps if a.attendance_status == "ATTENDED"),
        "shortlisted": sum(1 for a in apps if a.result in ("SHORTLISTED", "SELECTED")),
        "selected": sum(1 for a in apps if a.result == "SELECTED"),
        "offers": cards["offers_received"],
        "accepted": cards["offers_accepted"],
        "placed": cards["confirmed_placements"],
    }
    return {
        "cards": cards,
        "company_applications": [{"label": k, "value": v} for k, v in sorted(company_apps.items(), key=lambda x: -x[1])],
        "drive_participation": drive_part,
        "department_outcomes": [{"department": k, "applied": len(v["applied"]), "selected": len(v["selected"]),
                                 "placed": len(v["placed"])} for k, v in sorted(dept.items())],
        "monthly_activity": [{"month": k, **v} for k, v in sorted(monthly.items())],
        "funnel": funnel,
        "conversion": {
            "attendance_rate": rate(funnel["attended"], funnel["registered"]),
            "selection_rate_of_attended": rate(funnel["selected"], funnel["attended"]),
            # placed offers always have status ACCEPTED, so they are already in `accepted`
            "offer_acceptance_rate": rate(funnel["accepted"], funnel["offers"]),
            "placement_rate_of_students": rate(cards["unique_students_placed"], cards["total_students"]),
        },
        "definitions": {
            "upcoming_drives": "Published, non-cancelled drives with a drive date today or later.",
            "open_applications": "Published drives whose application window is currently open.",
            "unique_students_placed": "Distinct students with at least one confirmed placement.",
            "offers_received": "Recorded offers (a student can hold several); revoked offers excluded.",
            "student_counts": "Student counts are distinct students; application counts are applications.",
        },
    }
