import csv
import io
from datetime import date, datetime, time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_placement_staff, require_student
from app.core.database import get_db
from app.models.models import AcademicYear, AuditLog, Department, StudentProfile, User
from app.models.extended import (
    Company, EligibilityException, PlacementApplication, PlacementDrive, PlacementOffer,
)
from app.services import placement_service as ps

router = APIRouter()


def _audit(db: Session, user: User, action: str, entity: str, eid: Any, details: str = "") -> None:
    db.add(AuditLog(user_id=user.id, action=action, entity_type=entity, entity_id=str(eid), details=details))


def _csv(rows: List[List[Any]], header: List[str], filename: str) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={filename}"})


# =============================================================================
# Officer: dashboard
# =============================================================================

@router.get("/dashboard")
def officer_dashboard(current_user: User = Depends(require_placement_staff), db: Session = Depends(get_db)) -> Any:
    ps.run_reminders(db)
    stats = ps.officer_stats(db)
    now = ps.now_local()
    upcoming = db.query(PlacementDrive).filter(PlacementDrive.status.in_(["PUBLISHED", "IN_PROGRESS"]),
                                               PlacementDrive.drive_date >= now.date()) \
        .order_by(PlacementDrive.drive_date).limit(6).all()
    stats["upcoming"] = [ps.drive_to_dict(db, d, include_private=True) for d in upcoming]
    return stats


# =============================================================================
# Officer: companies
# =============================================================================

class CompanyIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    logo_url: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    website: Optional[str] = None
    location: Optional[str] = None
    recruiter_name: Optional[str] = None
    recruiter_email: Optional[str] = None
    recruiter_phone: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("website", "logo_url")
    @classmethod
    def _url(cls, v):
        if v and not v.strip().lower().startswith(("http://", "https://")):
            raise ValueError("must start with http:// or https://")
        return v.strip() if v else v

    @field_validator("recruiter_email")
    @classmethod
    def _email(cls, v):
        if v and ("@" not in v or "." not in v.split("@")[-1]):
            raise ValueError("is not a valid e-mail address")
        return v.strip() if v else v


@router.get("/companies")
def list_companies(search: Optional[str] = None, status: Optional[str] = None, industry: Optional[str] = None,
                   skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=500),
                   current_user: User = Depends(require_placement_staff), db: Session = Depends(get_db)) -> Any:
    q = db.query(Company)
    if search:
        pat = f"%{search.strip()}%"
        q = q.filter(or_(Company.name.ilike(pat), Company.industry.ilike(pat), Company.location.ilike(pat)))
    if status:
        q = q.filter(Company.status == status.upper())
    if industry:
        q = q.filter(Company.industry.ilike(industry))
    total = q.count()
    items = q.order_by(Company.name).offset(skip).limit(limit).all()
    industries = sorted({i for (i,) in db.query(Company.industry).distinct() if i})
    return {"total": total, "items": [ps.company_to_dict(c, True) for c in items], "industries": industries}


@router.post("/companies", status_code=201)
def create_company(data: CompanyIn, current_user: User = Depends(require_placement_staff), db: Session = Depends(get_db)) -> Any:
    key = ps.company_key(data.name)
    if not key:
        raise HTTPException(400, "Company name is required")
    dup = db.query(Company).filter(Company.name_key == key).first()
    if dup:
        raise HTTPException(409, f"A company named '{dup.name}' already exists (id {dup.id}).")
    c = Company(**data.model_dump(), name_key=key, created_by_id=current_user.id)
    c.name = data.name.strip()
    db.add(c)
    db.flush()
    _audit(db, current_user, "COMPANY_CREATED", "COMPANY", c.id, c.name)
    db.commit()
    return ps.company_to_dict(c, True)


@router.get("/companies/{company_id}")
def get_company(company_id: int, current_user: User = Depends(require_placement_staff), db: Session = Depends(get_db)) -> Any:
    c = db.get(Company, company_id)
    if not c:
        raise HTTPException(404, "Company not found")
    return {**ps.company_to_dict(c, True),
            "drives": [ps.drive_to_dict(db, d, include_private=True) for d in c.drives]}


@router.put("/companies/{company_id}")
def update_company(company_id: int, data: CompanyIn, current_user: User = Depends(require_placement_staff),
                   db: Session = Depends(get_db)) -> Any:
    c = db.get(Company, company_id)
    if not c:
        raise HTTPException(404, "Company not found")
    key = ps.company_key(data.name)
    dup = db.query(Company).filter(Company.name_key == key, Company.id != c.id).first()
    if dup:
        raise HTTPException(409, f"Another company named '{dup.name}' already exists.")
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    c.name, c.name_key = data.name.strip(), key
    _audit(db, current_user, "COMPANY_UPDATED", "COMPANY", c.id, c.name)
    db.commit()
    return ps.company_to_dict(c, True)


@router.post("/companies/{company_id}/archive")
def archive_company(company_id: int, archived: bool = True, current_user: User = Depends(require_placement_staff),
                    db: Session = Depends(get_db)) -> Any:
    c = db.get(Company, company_id)
    if not c:
        raise HTTPException(404, "Company not found")
    c.status = "ARCHIVED" if archived else "ACTIVE"
    _audit(db, current_user, "COMPANY_ARCHIVED" if archived else "COMPANY_RESTORED", "COMPANY", c.id, c.name)
    db.commit()
    return ps.company_to_dict(c, True)


# =============================================================================
# Officer: drives
# =============================================================================

class DriveIn(BaseModel):
    company_id: int
    job_title: str = Field(..., min_length=2, max_length=200)
    job_description: Optional[str] = None
    job_type: str = "FULL_TIME"
    job_location: Optional[str] = None
    work_mode: Optional[str] = None
    ctc_min: Optional[float] = Field(None, ge=0)
    ctc_max: Optional[float] = Field(None, ge=0)
    ctc_text: Optional[str] = None
    required_skills: List[str] = []
    eligible_department_ids: List[int] = []
    eligible_course_ids: List[int] = []
    eligible_semesters: List[int] = []
    graduation_years: List[int] = []
    min_cgpa: Optional[float] = Field(None, ge=0, le=10)
    max_active_backlogs: Optional[int] = Field(None, ge=0)
    other_requirements: Optional[str] = None
    application_open_at: Optional[datetime] = None
    application_deadline: Optional[datetime] = None
    drive_date: Optional[date] = None
    drive_time: Optional[time] = None
    venue: Optional[str] = None
    meeting_link: Optional[str] = None
    selection_process: List[str] = []
    vacancies: Optional[int] = Field(None, ge=0)
    instructions: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[str] = None


JOB_TYPES = ["FULL_TIME", "INTERNSHIP", "INTERNSHIP_PPO", "CONTRACT"]
WORK_MODES = ["ONSITE", "REMOTE", "HYBRID"]


def _validate_drive(db: Session, data: DriveIn) -> None:
    c = db.get(Company, data.company_id)
    if not c:
        raise HTTPException(400, "The selected company does not exist")
    if c.status == "ARCHIVED":
        raise HTTPException(400, "The selected company is archived")
    if data.job_type not in JOB_TYPES:
        raise HTTPException(400, f"job_type must be one of {', '.join(JOB_TYPES)}")
    if data.work_mode and data.work_mode not in WORK_MODES:
        raise HTTPException(400, f"work_mode must be one of {', '.join(WORK_MODES)}")
    if data.ctc_min is not None and data.ctc_max is not None and data.ctc_max < data.ctc_min:
        raise HTTPException(400, "Maximum CTC cannot be lower than minimum CTC")
    if data.application_open_at and data.application_deadline and data.application_deadline <= data.application_open_at:
        raise HTTPException(400, "The application deadline must be after the opening date")
    if data.application_deadline and data.drive_date and data.drive_date < data.application_deadline.date():
        raise HTTPException(400, "The drive date cannot be before the application deadline")
    if data.eligible_department_ids:
        found = db.query(Department).filter(Department.id.in_(data.eligible_department_ids)).count()
        if found != len(set(data.eligible_department_ids)):
            raise HTTPException(400, "One or more eligible departments do not exist")


def _apply_drive(d: PlacementDrive, data: DriveIn) -> None:
    for k, v in data.model_dump().items():
        if isinstance(v, list):
            v = [x.strip() if isinstance(x, str) else x for x in v if (x.strip() if isinstance(x, str) else x) not in ("", None)]
            v = v or None
        setattr(d, k, v)


def _publish_checks(d: PlacementDrive) -> None:
    missing = [label for label, v in (("application deadline", d.application_deadline), ("drive date", d.drive_date),
                                      ("job description", d.job_description)) if not v]
    if missing:
        raise HTTPException(400, f"Cannot publish: please provide the {', '.join(missing)}.")
    if d.application_deadline and d.application_deadline < ps.now_local():
        raise HTTPException(400, "Cannot publish a drive whose application deadline has already passed.")


@router.get("/drives")
def list_drives(search: Optional[str] = None, status: Optional[str] = None, company_id: Optional[int] = None,
                sort: str = "drive_date_desc", skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=500),
                current_user: User = Depends(require_placement_staff), db: Session = Depends(get_db)) -> Any:
    q = db.query(PlacementDrive).join(Company)
    if search:
        pat = f"%{search.strip()}%"
        q = q.filter(or_(PlacementDrive.job_title.ilike(pat), Company.name.ilike(pat)))
    if company_id:
        q = q.filter(PlacementDrive.company_id == company_id)
    drives = q.all()
    if status:
        drives = [d for d in drives if ps.effective_status(d) == status.upper()]
    keyf = {
        "drive_date_desc": (lambda d: d.drive_date or date.min, True),
        "drive_date_asc": (lambda d: d.drive_date or date.max, False),
        "deadline_asc": (lambda d: d.application_deadline or datetime.max, False),
        "company": (lambda d: d.company.name.lower(), False),
        "created_desc": (lambda d: d.created_at or datetime.min, True),
    }.get(sort, (lambda d: d.drive_date or date.min, True))
    drives.sort(key=keyf[0], reverse=keyf[1])
    total = len(drives)
    page = drives[skip:skip + limit]
    students = db.query(StudentProfile).filter(StudentProfile.is_active.is_(True)).all()
    out = []
    for d in page:
        item = ps.drive_to_dict(db, d, include_private=True)
        item["counts"]["eligible"] = sum(1 for s in students if ps.evaluate_eligibility(db, d, s)["status"] == "ELIGIBLE")
        out.append(item)
    return {"total": total, "items": out}


@router.get("/drives/export")
def export_drives(current_user: User = Depends(require_placement_staff), db: Session = Depends(get_db)) -> Response:
    rows = []
    for d in db.query(PlacementDrive).order_by(PlacementDrive.drive_date.desc()):
        x = ps.drive_to_dict(db, d, include_private=True)
        c = x["counts"]
        rows.append([d.id, d.company.name if d.company else "", d.job_title, x["effective_status"],
                     x["application_deadline"] or "", x["drive_date"] or "", c["applications"], c["registered"],
                     c["attended"], c["shortlisted"], c["selected"], c["offers"], c["placed"]])
    return _csv(rows, ["ID", "Company", "Job Title", "Status", "Application Deadline", "Drive Date", "Applications",
                       "Registered", "Attended", "Shortlisted", "Selected", "Offers", "Placed"], "placement_drives.csv")


@router.post("/drives", status_code=201)
def create_drive(data: DriveIn, current_user: User = Depends(require_placement_staff), db: Session = Depends(get_db)) -> Any:
    _validate_drive(db, data)
    d = PlacementDrive(status="DRAFT", created_by_id=current_user.id)
    _apply_drive(d, data)
    db.add(d)
    db.flush()
    _audit(db, current_user, "DRIVE_CREATED", "PLACEMENT_DRIVE", d.id, d.job_title)
    db.commit()
    return ps.drive_to_dict(db, d, include_private=True)


def _get_drive(db: Session, drive_id: int) -> PlacementDrive:
    d = db.get(PlacementDrive, drive_id)
    if not d:
        raise HTTPException(404, "Placement drive not found")
    return d


@router.get("/drives/{drive_id}")
def get_drive(drive_id: int, current_user: User = Depends(require_placement_staff), db: Session = Depends(get_db)) -> Any:
    d = _get_drive(db, drive_id)
    out = ps.drive_to_dict(db, d, include_private=True)
    out["company"] = ps.company_to_dict(d.company, True)
    return out


@router.put("/drives/{drive_id}")
def update_drive(drive_id: int, data: DriveIn, current_user: User = Depends(require_placement_staff),
                 db: Session = Depends(get_db)) -> Any:
    d = _get_drive(db, drive_id)
    if d.status in ("COMPLETED", "CANCELLED"):
        raise HTTPException(400, f"A {d.status.lower()} drive cannot be edited")
    _validate_drive(db, data)
    before = (d.drive_date, d.drive_time, d.venue, d.meeting_link)
    _apply_drive(d, data)
    _audit(db, current_user, "DRIVE_UPDATED", "PLACEMENT_DRIVE", d.id, d.job_title)
    if d.status in ("PUBLISHED", "IN_PROGRESS") and before != (d.drive_date, d.drive_time, d.venue, d.meeting_link):
        for a in d.applications:
            if a.application_status == "APPLIED":
                ps.notify_student(db, a.student, "Drive schedule updated",
                                  f"{d.company.name} – {d.job_title}: the drive date, time or venue has changed.",
                                  "PLACEMENT_DRIVE", f"/student/placements/drives/{d.id}")
    db.commit()
    return ps.drive_to_dict(db, d, include_private=True)


@router.post("/drives/{drive_id}/publish")
def publish_drive(drive_id: int, current_user: User = Depends(require_placement_staff), db: Session = Depends(get_db)) -> Any:
    d = _get_drive(db, drive_id)
    if d.status != "DRAFT":
        raise HTTPException(400, f"Only draft drives can be published (current status: {d.status})")
    _publish_checks(d)
    d.status, d.published_at = "PUBLISHED", datetime.utcnow()
    _audit(db, current_user, "DRIVE_PUBLISHED", "PLACEMENT_DRIVE", d.id, d.job_title)
    n = 0
    for st in db.query(StudentProfile).filter(StudentProfile.is_active.is_(True)):
        if ps.evaluate_eligibility(db, d, st)["status"] != "INELIGIBLE":
            ps.notify_student(db, st, "New placement drive published",
                              f"{d.company.name} is hiring for {d.job_title}. Apply by "
                              f"{d.application_deadline.strftime('%d %b %Y %H:%M')}.",
                              "PLACEMENT_DRIVE", f"/student/placements/drives/{d.id}", f"published:{d.id}")
            n += 1
    db.commit()
    return {**ps.drive_to_dict(db, d, include_private=True), "notified_students": n}


class DriveStatusIn(BaseModel):
    status: str
    reason: Optional[str] = None


@router.post("/drives/{drive_id}/status")
def set_drive_status(drive_id: int, data: DriveStatusIn, current_user: User = Depends(require_placement_staff),
                     db: Session = Depends(get_db)) -> Any:
    d = _get_drive(db, drive_id)
    new = data.status.upper()
    allowed = {"DRAFT": ["CANCELLED"], "PUBLISHED": ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
               "IN_PROGRESS": ["COMPLETED", "CANCELLED", "PUBLISHED"], "COMPLETED": ["IN_PROGRESS"], "CANCELLED": []}
    if new not in allowed.get(d.status, []):
        raise HTTPException(400, f"Cannot move a {d.status} drive to {new}. Allowed: {', '.join(allowed.get(d.status, [])) or 'none'}")
    if new == "CANCELLED" and not (data.reason or "").strip():
        raise HTTPException(400, "A reason is required to cancel a drive")
    old = d.status
    d.status = new
    _audit(db, current_user, "DRIVE_STATUS_CHANGED", "PLACEMENT_DRIVE", d.id, f"{old} -> {new}. {data.reason or ''}")
    if new == "CANCELLED":
        for a in d.applications:
            ps.notify_student(db, a.student, "Placement drive cancelled",
                              f"{d.company.name} – {d.job_title} has been cancelled. {data.reason}",
                              "PLACEMENT_DRIVE", f"/student/placements/drives/{d.id}")
    db.commit()
    return ps.drive_to_dict(db, d, include_private=True)


# =============================================================================
# Officer: eligibility, participants, results, offers
# =============================================================================

@router.get("/drives/{drive_id}/eligibility")
def drive_eligibility(drive_id: int, status: Optional[str] = None, search: Optional[str] = None,
                      current_user: User = Depends(require_placement_staff), db: Session = Depends(get_db)) -> Any:
    d = _get_drive(db, drive_id)
    applied = {a.student_id: a for a in d.applications}
    out = []
    for st in db.query(StudentProfile).filter(StudentProfile.is_active.is_(True)):
        e = ps.evaluate_eligibility(db, d, st)
        name = st.user.full_name if st.user else ""
        if status and e["status"] != status.upper():
            continue
        if search and search.lower() not in f"{name} {st.student_id_number}".lower():
            continue
        out.append({"student_id": st.id, "name": name, "usn": st.student_id_number,
                    "department": st.department.code if st.department else None,
                    "graduation_year": st.graduation_year, "cgpa": st.cgpa, "active_backlogs": st.active_backlogs,
                    "eligibility": e, "applied": st.id in applied,
                    "application_id": applied[st.id].id if st.id in applied else None})
    summary = {s: sum(1 for x in out if x["eligibility"]["status"] == s)
               for s in ("ELIGIBLE", "INELIGIBLE", "INCOMPLETE_INFORMATION")}
    return {"summary": summary, "items": out}


class ExceptionIn(BaseModel):
    student_id: int
    reason: str = Field(..., min_length=5)


@router.post("/drives/{drive_id}/exceptions", status_code=201)
def grant_exception(drive_id: int, data: ExceptionIn, current_user: User = Depends(require_placement_staff),
                    db: Session = Depends(get_db)) -> Any:
    d = _get_drive(db, drive_id)
    st = db.get(StudentProfile, data.student_id)
    if not st:
        raise HTTPException(404, "Student not found")
    if db.query(EligibilityException).filter(EligibilityException.drive_id == d.id,
                                             EligibilityException.student_id == st.id).first():
        raise HTTPException(409, "An exception already exists for this student")
    db.add(EligibilityException(drive_id=d.id, student_id=st.id, reason=data.reason, granted_by_id=current_user.id))
    _audit(db, current_user, "ELIGIBILITY_EXCEPTION", "PLACEMENT_DRIVE", d.id, f"student {st.student_id_number}: {data.reason}")
    ps.notify_student(db, st, "Eligibility exception granted",
                      f"You may apply to {d.company.name} – {d.job_title}.", "PLACEMENT_DRIVE",
                      f"/student/placements/drives/{d.id}")
    db.commit()
    return {"message": "Exception granted"}


@router.delete("/drives/{drive_id}/exceptions/{student_id}")
def revoke_exception(drive_id: int, student_id: int, current_user: User = Depends(require_placement_staff),
                     db: Session = Depends(get_db)) -> Any:
    e = db.query(EligibilityException).filter(EligibilityException.drive_id == drive_id,
                                              EligibilityException.student_id == student_id).first()
    if not e:
        raise HTTPException(404, "No exception found")
    db.delete(e)
    _audit(db, current_user, "ELIGIBILITY_EXCEPTION_REVOKED", "PLACEMENT_DRIVE", drive_id, f"student id {student_id}")
    db.commit()
    return {"message": "Exception revoked (existing applications are kept)"}


def _participants(db: Session, d: PlacementDrive, search, registration, attendance, result, stage, offer_status):
    apps = list(d.applications)
    out = []
    for a in apps:
        x = ps.application_to_dict(a, for_officer=True)
        s = x.get("student") or {}
        if search and search.lower() not in f"{s.get('name', '')} {s.get('usn', '')}".lower():
            continue
        if registration and a.registration_status != registration.upper():
            continue
        if attendance and a.attendance_status != attendance.upper():
            continue
        if result and a.result != result.upper():
            continue
        if stage and a.current_stage != stage:
            continue
        if offer_status and ((a.offer.status if a.offer else "NONE") != offer_status.upper()):
            continue
        x["eligibility_now"] = ps.evaluate_eligibility(db, d, a.student)["status"] if a.student else None
        out.append(x)
    return out


@router.get("/drives/{drive_id}/participants")
def drive_participants(drive_id: int, search: Optional[str] = None, registration: Optional[str] = None,
                       attendance: Optional[str] = None, result: Optional[str] = None, stage: Optional[str] = None,
                       offer_status: Optional[str] = None, sort: str = "name",
                       skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=500),
                       current_user: User = Depends(require_placement_staff), db: Session = Depends(get_db)) -> Any:
    d = _get_drive(db, drive_id)
    items = _participants(db, d, search, registration, attendance, result, stage, offer_status)
    sorters = {"name": lambda x: (x["student"]["name"] or "").lower(), "usn": lambda x: x["student"]["usn"] or "",
               "applied_at": lambda x: x["applied_at"] or "", "cgpa": lambda x: -(x["student"]["cgpa"] or 0)}
    items.sort(key=sorters.get(sort, sorters["name"]))
    return {"total": len(items), "items": items[skip:skip + limit],
            "stages": list(ps.DEFAULT_STAGES) + [s for s in (d.selection_process or []) if s not in ps.DEFAULT_STAGES],
            "drive": ps.drive_to_dict(db, d, include_private=True)}


@router.get("/drives/{drive_id}/participants/export")
def export_participants(drive_id: int, current_user: User = Depends(require_placement_staff),
                        db: Session = Depends(get_db)) -> Response:
    d = _get_drive(db, drive_id)
    rows = []
    for x in _participants(db, d, None, None, None, None, None, None):
        s, o = x["student"], x["offer"] or {}
        rows.append([s["name"], s["usn"], s["department"], s["semester"], s["graduation_year"], s["cgpa"],
                     x["eligibility_now"], x["application_status"], x["registration_status"], x["attendance_status"],
                     x["current_stage"], x["result"], o.get("status", ""), o.get("offered_ctc", ""),
                     "yes" if o.get("is_placed") else "no", x["overall_status"]])
    return _csv(rows, ["Name", "USN", "Department", "Semester", "Graduation Year", "CGPA", "Eligibility", "Application",
                       "Registration", "Drive Attendance", "Stage", "Result", "Offer Status", "Offered CTC", "Placed",
                       "Overall"], f"drive_{drive_id}_participants.csv")


def _get_app(db: Session, app_id: int) -> PlacementApplication:
    a = db.get(PlacementApplication, app_id)
    if not a:
        raise HTTPException(404, "Application not found")
    return a


@router.get("/applications/{app_id}")
def application_detail(app_id: int, current_user: User = Depends(require_placement_staff), db: Session = Depends(get_db)) -> Any:
    a = _get_app(db, app_id)
    return {**ps.application_to_dict(a, for_officer=True),
            "eligibility_now": ps.evaluate_eligibility(db, a.drive, a.student)}


class ApplicationUpdateIn(BaseModel):
    registration_status: Optional[str] = None
    attendance_status: Optional[str] = None
    current_stage: Optional[str] = None
    result: Optional[str] = None
    result_date: Optional[date] = None
    notes: Optional[str] = None


@router.patch("/applications/{app_id}")
def update_application(app_id: int, data: ApplicationUpdateIn, current_user: User = Depends(require_placement_staff),
                       db: Session = Depends(get_db)) -> Any:
    a = _get_app(db, app_id)
    if a.drive.status in ("DRAFT", "CANCELLED"):
        raise HTTPException(400, f"Applications of a {a.drive.status.lower()} drive cannot be updated")
    ps.apply_transition(db, a, current_user, data.model_dump())
    _audit(db, current_user, "APPLICATION_UPDATED", "PLACEMENT_APPLICATION", a.id,
           str({k: v for k, v in data.model_dump().items() if v is not None}))
    db.commit()
    db.refresh(a)
    return ps.application_to_dict(a, for_officer=True)


class BulkUpdateIn(ApplicationUpdateIn):
    application_ids: List[int]


@router.post("/drives/{drive_id}/bulk-update")
def bulk_update(drive_id: int, data: BulkUpdateIn, current_user: User = Depends(require_placement_staff),
                db: Session = Depends(get_db)) -> Any:
    d = _get_drive(db, drive_id)
    if d.status in ("DRAFT", "CANCELLED"):
        raise HTTPException(400, f"Applications of a {d.status.lower()} drive cannot be updated")
    payload = data.model_dump(exclude={"application_ids"})
    ok, errors = 0, []
    for aid in data.application_ids:
        a = db.get(PlacementApplication, aid)
        if not a or a.drive_id != d.id:
            errors.append({"application_id": aid, "error": "Not an application of this drive"})
            continue
        try:
            with db.begin_nested():
                ps.apply_transition(db, a, current_user, payload)
            ok += 1
        except HTTPException as exc:
            errors.append({"application_id": aid, "student": a.student.student_id_number if a.student else None,
                           "error": exc.detail})
    _audit(db, current_user, "APPLICATIONS_BULK_UPDATED", "PLACEMENT_DRIVE", d.id, f"{ok} updated: {payload}")
    db.commit()
    return {"updated": ok, "errors": errors}


class OfferIn(BaseModel):
    offered_ctc: Optional[float] = Field(None, ge=0)
    offer_date: Optional[date] = None
    joining_date: Optional[date] = None
    status: Optional[str] = None
    is_placed: Optional[bool] = None
    notes: Optional[str] = None


@router.post("/applications/{app_id}/offer")
def upsert_offer(app_id: int, data: OfferIn, current_user: User = Depends(require_placement_staff),
                 db: Session = Depends(get_db)) -> Any:
    a = _get_app(db, app_id)
    offer = ps.record_offer(db, a, current_user, data.model_dump())
    _audit(db, current_user, "OFFER_RECORDED", "PLACEMENT_OFFER", offer.id or "new",
           str({k: v for k, v in data.model_dump().items() if v is not None}))
    db.commit()
    db.refresh(a)
    return ps.application_to_dict(a, for_officer=True)


# =============================================================================
# Officer: reports
# =============================================================================

@router.get("/reports/{report}")
def reports(report: str, format: str = "json", graduation_year: Optional[int] = None,
            current_user: User = Depends(require_placement_staff), db: Session = Depends(get_db)) -> Any:
    apps = db.query(PlacementApplication).filter(PlacementApplication.application_status == "APPLIED").all()
    if graduation_year:
        apps = [a for a in apps if a.student and a.student.graduation_year == graduation_year]

    def offers_of(lst):
        return [a.offer for a in lst if a.offer and a.offer.status != "REVOKED"]

    def agg(lst):
        offs = offers_of(lst)
        return {"applications": len(lst), "students": len({a.student_id for a in lst}),
                "registered": sum(1 for a in lst if a.registration_status == "CONFIRMED"),
                "attended": sum(1 for a in lst if a.attendance_status == "ATTENDED"),
                "shortlisted": sum(1 for a in lst if a.result in ("SHORTLISTED", "SELECTED")),
                "selected": sum(1 for a in lst if a.result == "SELECTED"),
                "rejected": sum(1 for a in lst if a.result == "REJECTED"),
                "offers": len(offs), "offers_accepted": sum(1 for o in offs if o.status == "ACCEPTED"),
                "offers_declined": sum(1 for o in offs if o.status == "DECLINED"),
                "placements": sum(1 for o in offs if o.is_placed),
                "unique_students_placed": len({o.student_id for o in offs if o.is_placed}),
                "selection_rate": round(sum(1 for a in lst if a.result == "SELECTED") /
                                        max(1, sum(1 for a in lst if a.attendance_status == "ATTENDED")) * 100, 2)
                if any(a.attendance_status == "ATTENDED" for a in lst) else None}

    groups: Dict[str, List[PlacementApplication]] = {}
    if report == "company":
        for a in apps:
            groups.setdefault(a.drive.company.name, []).append(a)
    elif report == "drive":
        for a in apps:
            groups.setdefault(f"{a.drive.company.name} – {a.drive.job_title} (#{a.drive_id})", []).append(a)
    elif report == "department":
        for a in apps:
            groups.setdefault(a.student.department.code if (a.student and a.student.department) else "Unassigned", []).append(a)
    elif report == "graduation-year":
        for a in apps:
            groups.setdefault(str(a.student.graduation_year) if (a.student and a.student.graduation_year) else "Not recorded", []).append(a)
    elif report == "student":
        for a in apps:
            st = a.student
            groups.setdefault(f"{st.student_id_number} – {st.user.full_name if st.user else ''}" if st else "?", []).append(a)
    elif report == "summary":
        groups["All drives"] = apps
    else:
        raise HTTPException(404, "Unknown report. Use company, drive, department, graduation-year, student or summary")
    rows = [{"group": k, **agg(v)} for k, v in sorted(groups.items())]
    totals = agg(apps)
    if format == "csv":
        cols = list(totals.keys())
        return _csv([[r["group"]] + [r[c] for c in cols] for r in rows] + [["TOTAL"] + [totals[c] for c in cols]],
                    ["Group"] + cols, f"placement_report_{report}.csv")
    return {"report": report, "rows": rows, "totals": totals,
            "definitions": ps.officer_stats(db)["definitions"] if report == "summary" else None,
            "generated_at": datetime.utcnow().isoformat() + "Z"}


# =============================================================================
# Student
# =============================================================================

def _me(user: User) -> StudentProfile:
    if not user.student_profile:
        raise HTTPException(404, "No student profile is linked to this account")
    return user.student_profile


def _visible(d: PlacementDrive) -> bool:
    return d.status in ("PUBLISHED", "IN_PROGRESS", "COMPLETED", "CANCELLED") and d.published_at is not None


def _student_drive(db: Session, d: PlacementDrive, st: StudentProfile) -> Dict[str, Any]:
    x = ps.drive_to_dict(db, d, include_private=False)
    app = db.query(PlacementApplication).filter(PlacementApplication.drive_id == d.id,
                                                PlacementApplication.student_id == st.id).first()
    e = ps.evaluate_eligibility(db, d, st)
    x["eligibility"] = e
    x["my_application"] = ps.application_to_dict(app, for_officer=False) if app else None
    # one application per student per drive (a withdrawn application cannot be re-submitted)
    x["can_apply"] = app is None and ps.applications_open(d) and e["can_apply_by_eligibility"]
    if app is None and not ps.applications_open(d):
        x["apply_blocker"] = "Applications are not open"
    elif app is None and not e["can_apply_by_eligibility"]:
        x["apply_blocker"] = ("Your profile is missing information required to check eligibility"
                              if e["status"] == "INCOMPLETE_INFORMATION" else "You do not meet the eligibility criteria")
    elif app is not None:
        x["apply_blocker"] = "You have already applied" if app.application_status == "APPLIED" else "Application withdrawn"
    else:
        x["apply_blocker"] = None
    return x


@router.get("/student/overview")
def student_overview(current_user: User = Depends(require_student), db: Session = Depends(get_db)) -> Any:
    st = _me(current_user)
    ps.run_reminders(db)
    now = ps.now_local()
    drives = [d for d in db.query(PlacementDrive).all() if _visible(d)]
    apps = db.query(PlacementApplication).filter(PlacementApplication.student_id == st.id).all()
    active = [a for a in apps if a.application_status == "APPLIED"]
    offers = [a.offer for a in active if a.offer and a.offer.status != "REVOKED"]
    upcoming = [d for d in drives if d.status in ("PUBLISHED", "IN_PROGRESS") and d.drive_date and d.drive_date >= now.date()]
    open_ = [d for d in drives if ps.applications_open(d, now)]
    open_ = sorted(open_, key=lambda d: d.application_deadline or datetime.max)
    return {
        "counts": {
            "upcoming_drives": len(upcoming),
            "open_applications": len(open_),
            "applications_submitted": len(active),
            "drives_attended": len({a.drive_id for a in active if a.attendance_status == "ATTENDED"}),
            "shortlisted": sum(1 for a in active if a.result in ("SHORTLISTED", "SELECTED")),
            "selections": sum(1 for a in active if a.result == "SELECTED"),
            "companies_selected": len({a.drive.company_id for a in active if a.result == "SELECTED"}),
            "offers_received": len(offers),
            "offers_accepted": sum(1 for o in offers if o.status == "ACCEPTED"),
            "confirmed_placements": sum(1 for o in offers if o.is_placed),
        },
        "open_drives": [_student_drive(db, d, st) for d in open_[:6]],
        "recent_applications": [ps.application_to_dict(a, False) for a in sorted(apps, key=lambda a: a.applied_at, reverse=True)[:5]],
        "profile": {"graduation_year": st.graduation_year, "cgpa": st.cgpa, "active_backlogs": st.active_backlogs,
                    "department": st.department.code if st.department else None,
                    "missing_fields": [f for f, v in (("graduation year", st.graduation_year), ("CGPA", st.cgpa),
                                                      ("active backlogs", st.active_backlogs)) if v is None]},
    }


@router.get("/student/drives")
def student_drives(search: Optional[str] = None, company_id: Optional[int] = None, location: Optional[str] = None,
                   work_mode: Optional[str] = None, department_id: Optional[int] = None,
                   min_ctc: Optional[float] = None, application_status: Optional[str] = None,
                   timeframe: str = "upcoming", sort: str = "relevance",
                   current_user: User = Depends(require_student), db: Session = Depends(get_db)) -> Any:
    st = _me(current_user)
    now = ps.now_local()
    drives = [d for d in db.query(PlacementDrive).all() if _visible(d)]
    if timeframe == "upcoming":
        drives = [d for d in drives if d.status not in ("COMPLETED", "CANCELLED") and (d.drive_date is None or d.drive_date >= now.date())]
    elif timeframe == "completed":
        drives = [d for d in drives if d.status in ("COMPLETED", "CANCELLED") or (d.drive_date and d.drive_date < now.date())]
    items = []
    for d in drives:
        if search and search.lower() not in f"{d.job_title} {d.company.name} {' '.join(d.required_skills or [])}".lower():
            continue
        if company_id and d.company_id != company_id:
            continue
        if location and location.lower() not in (d.job_location or "").lower():
            continue
        if work_mode and d.work_mode != work_mode.upper():
            continue
        if department_id and d.eligible_department_ids and department_id not in d.eligible_department_ids:
            continue
        if min_ctc is not None and (d.ctc_max or d.ctc_min or 0) < min_ctc:
            continue
        x = _student_drive(db, d, st)
        my = x["my_application"]
        if application_status == "APPLIED" and not my:
            continue
        if application_status == "NOT_APPLIED" and my:
            continue
        if application_status == "ELIGIBLE" and x["eligibility"]["status"] != "ELIGIBLE":
            continue
        items.append(x)

    def relevance(x):
        open_rank = 0 if x["effective_status"] == "APPLICATIONS_OPEN" else 1 if x["effective_status"] == "UPCOMING" else 2
        elig_rank = 0 if x["eligibility"]["status"] == "ELIGIBLE" else 1
        return (open_rank, elig_rank, x["application_deadline"] or "9999", x["drive_date"] or "9999")
    sorters = {"relevance": (relevance, False), "deadline": (lambda x: x["application_deadline"] or "9999", False),
               "drive_date": (lambda x: x["drive_date"] or "9999", False),
               "ctc": (lambda x: -(x["ctc_max"] or x["ctc_min"] or 0), False),
               "company": (lambda x: (x["company"] or {}).get("name", "").lower(), False)}
    f, rev = sorters.get(sort, sorters["relevance"])
    items.sort(key=f, reverse=rev)
    companies = sorted({(d.company_id, d.company.name) for d in db.query(PlacementDrive).all() if _visible(d)}, key=lambda c: c[1])
    return {"total": len(items), "items": items, "companies": [{"id": i, "name": n} for i, n in companies]}


@router.get("/student/drives/{drive_id}")
def student_drive_detail(drive_id: int, current_user: User = Depends(require_student), db: Session = Depends(get_db)) -> Any:
    st = _me(current_user)
    d = db.get(PlacementDrive, drive_id)
    if not d or not _visible(d):
        raise HTTPException(404, "Placement drive not found")
    return _student_drive(db, d, st)


@router.post("/student/drives/{drive_id}/apply", status_code=201)
def apply(drive_id: int, current_user: User = Depends(require_student), db: Session = Depends(get_db)) -> Any:
    st = _me(current_user)
    d = db.get(PlacementDrive, drive_id)
    if not d or not _visible(d):
        raise HTTPException(404, "Placement drive not found")
    if not ps.applications_open(d):
        raise HTTPException(400, f"Applications are not open for this drive ({ps.effective_status(d).replace('_', ' ').lower()})")
    if db.query(PlacementApplication).filter(PlacementApplication.drive_id == d.id,
                                             PlacementApplication.student_id == st.id).first():
        raise HTTPException(409, "You have already applied to this drive")
    e = ps.evaluate_eligibility(db, d, st)
    if not e["can_apply_by_eligibility"]:
        if e["status"] == "INCOMPLETE_INFORMATION":
            raise HTTPException(400, "Your academic profile is missing information needed to verify eligibility. "
                                     "Contact the placement office.")
        raise HTTPException(400, "You do not meet the eligibility criteria for this drive")
    a = PlacementApplication(drive_id=d.id, student_id=st.id, eligibility_snapshot=e,
                             via_exception=e["status"] != "ELIGIBLE")
    db.add(a)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "You have already applied to this drive")
    ps.log_change(db, a, "application", None, "APPLIED", current_user)
    ps.notify(db, current_user.id, "Application submitted",
              f"Your application to {d.company.name} – {d.job_title} was received.",
              "PLACEMENT_APPLICATION", "/student/placements/applications")
    db.commit()
    db.refresh(a)
    return ps.application_to_dict(a, for_officer=False)


@router.post("/student/applications/{app_id}/withdraw")
def withdraw(app_id: int, current_user: User = Depends(require_student), db: Session = Depends(get_db)) -> Any:
    st = _me(current_user)
    a = db.get(PlacementApplication, app_id)
    if not a or a.student_id != st.id:
        raise HTTPException(404, "Application not found")
    if a.application_status == "WITHDRAWN":
        raise HTTPException(400, "Already withdrawn")
    if not ps.applications_open(a.drive) or a.registration_status != "PENDING" or a.result != "IN_PROCESS":
        raise HTTPException(400, "Applications can only be withdrawn while the application window is open and "
                                 "before the placement office has processed them")
    ps.log_change(db, a, "application", a.application_status, "WITHDRAWN", current_user)
    a.application_status = "WITHDRAWN"
    db.commit()
    return ps.application_to_dict(a, for_officer=False)


@router.get("/student/applications")
def my_applications(current_user: User = Depends(require_student), db: Session = Depends(get_db)) -> Any:
    st = _me(current_user)
    apps = db.query(PlacementApplication).filter(PlacementApplication.student_id == st.id) \
        .order_by(PlacementApplication.applied_at.desc()).all()
    return [ps.application_to_dict(a, for_officer=False) for a in apps]


@router.get("/student/history")
def my_history(academic_year: Optional[str] = None, status: Optional[str] = None,
               current_user: User = Depends(require_student), db: Session = Depends(get_db)) -> Any:
    st = _me(current_user)
    years = db.query(AcademicYear).order_by(AcademicYear.start_date.desc()).all()

    def year_of(dt: Optional[date]) -> Optional[str]:
        if not dt:
            return None
        for y in years:
            if y.start_date <= dt <= y.end_date:
                return y.name
        start = dt.year if dt.month >= 6 else dt.year - 1
        return f"{start}-{start + 1}"

    out = []
    for a in db.query(PlacementApplication).filter(PlacementApplication.student_id == st.id):
        x = ps.application_to_dict(a, for_officer=False)
        x["academic_year"] = year_of(a.drive.drive_date or (a.applied_at.date() if a.applied_at else None))
        if academic_year and x["academic_year"] != academic_year:
            continue
        if status and x["overall_status"].upper().replace(" ", "_") != status.upper():
            continue
        out.append(x)
    out.sort(key=lambda x: x["drive"]["drive_date"] or x["applied_at"] or "", reverse=True)
    return {"items": out, "academic_years": sorted({x["academic_year"] for x in out if x["academic_year"]}, reverse=True)}
