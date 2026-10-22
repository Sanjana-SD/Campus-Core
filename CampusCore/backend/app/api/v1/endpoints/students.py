import csv
import io
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.models import User, UserRole, StudentProfile, Department, Course, AuditLog
from app.schemas.schemas import StudentCreate, StudentUpdate, StudentOut
from app.api.deps import require_admin, require_lecturer_or_admin, get_current_user
from app.services.sheet_parsing import normalize_uid as normalize_rfid_uid
from app.services.sheet_sync_service import rematch_uid
from app.models.models import LecturerProfile

router = APIRouter()

@router.get("", response_model=List[StudentOut])
def get_students(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    search: Optional[str] = None,
    department_id: Optional[int] = None,
    course_id: Optional[int] = None,
    semester_id: Optional[int] = None,
    section_id: Optional[int] = None,
    has_rfid: Optional[bool] = None,
    current_user: User = Depends(require_lecturer_or_admin),
    db: Session = Depends(get_db)
) -> Any:
    query = db.query(StudentProfile).join(User, StudentProfile.user_id == User.id)

    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.full_name.ilike(search_pattern),
                User.email.ilike(search_pattern),
                StudentProfile.student_id_number.ilike(search_pattern),
                StudentProfile.rfid_uid.ilike(search_pattern)
            )
        )
    if department_id:
        query = query.filter(StudentProfile.department_id == department_id)
    if course_id:
        query = query.filter(StudentProfile.course_id == course_id)
    if semester_id:
        query = query.filter(StudentProfile.semester_id == semester_id)
    if section_id:
        query = query.filter(StudentProfile.section_id == section_id)
    if has_rfid is True:
        query = query.filter(StudentProfile.rfid_uid.isnot(None), StudentProfile.rfid_uid != "")
    elif has_rfid is False:
        query = query.filter(or_(StudentProfile.rfid_uid.is_(None), StudentProfile.rfid_uid == ""))

    students = query.order_by(StudentProfile.id.desc()).offset(skip).limit(limit).all()
    return students

@router.post("", response_model=StudentOut, status_code=status.HTTP_201_CREATED)
def create_student(
    student_in: StudentCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> Any:
    # Check if username or email already exists
    existing_user = db.query(User).filter(
        or_(User.username == student_in.username, User.email == student_in.email.lower())
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user account with this username or email already exists."
        )

    # Check USN / Student ID uniqueness
    existing_usn = db.query(StudentProfile).filter(
        StudentProfile.student_id_number == student_in.student_id_number.strip().upper()
    ).first()
    if existing_usn:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Student ID / USN '{student_in.student_id_number}' is already registered."
        )

    # Check RFID UID uniqueness if provided
    clean_uid = normalize_rfid_uid(student_in.rfid_uid) if student_in.rfid_uid else None
    if clean_uid:
        existing_rfid = db.query(StudentProfile).filter(
            func.upper(StudentProfile.rfid_uid) == clean_uid
        ).first()
        if existing_rfid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"RFID UID '{clean_uid}' is already assigned to student '{existing_rfid.student_id_number}'."
            )

    # Create User
    new_user = User(
        email=student_in.email.lower(),
        username=student_in.username.strip(),
        hashed_password=get_password_hash(student_in.password or "Student@123"),
        full_name=student_in.full_name.strip(),
        role=UserRole.STUDENT,
        phone=student_in.phone
    )
    db.add(new_user)
    db.flush()

    # Create Student Profile
    profile = StudentProfile(
        user_id=new_user.id,
        student_id_number=student_in.student_id_number.strip().upper(),
        rfid_uid=clean_uid,
        department_id=student_in.department_id,
        course_id=student_in.course_id,
        semester_id=student_in.semester_id,
        section_id=student_in.section_id,
        admission_date=student_in.admission_date,
        graduation_year=student_in.graduation_year,
        cgpa=student_in.cgpa,
        active_backlogs=student_in.active_backlogs,
        enrollment_status=student_in.enrollment_status or "ACTIVE",
        date_of_birth=student_in.date_of_birth,
        parent_name=student_in.parent_name,
        parent_phone=student_in.parent_phone,
        address=student_in.address,
        is_active=True
    )
    db.add(profile)

    # Audit log
    audit = AuditLog(
        user_id=current_user.id,
        action="CREATE_STUDENT",
        entity_type="STUDENT",
        entity_id=str(new_user.id),
        details=f"Created student {profile.student_id_number} ({new_user.full_name}) with RFID '{clean_uid}'"
    )
    db.add(audit)
    db.commit()
    db.refresh(profile)

    return profile

@router.get("/{id}", response_model=StudentOut)
def get_student(
    id: int,
    current_user: User = Depends(require_lecturer_or_admin),
    db: Session = Depends(get_db)
) -> Any:
    student = db.query(StudentProfile).filter(StudentProfile.id == id).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    return student

@router.put("/{id}", response_model=StudentOut)
def update_student(
    id: int,
    student_in: StudentUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> Any:
    student = db.query(StudentProfile).filter(StudentProfile.id == id).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    user = student.user
    uid_changes = []
    if student_in.full_name is not None:
        user.full_name = student_in.full_name.strip()
    if student_in.email is not None:
        user.email = student_in.email.lower()
    if student_in.phone is not None:
        user.phone = student_in.phone

    if student_in.rfid_uid is not None:
        clean_uid = normalize_rfid_uid(student_in.rfid_uid)
        if clean_uid:
            existing = db.query(StudentProfile).filter(
                func.upper(StudentProfile.rfid_uid) == clean_uid,
                StudentProfile.id != id
            ).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"RFID UID '{clean_uid}' is already assigned to student '{existing.student_id_number}'."
                )
        if clean_uid and db.query(LecturerProfile).filter(func.upper(LecturerProfile.rfid_uid) == clean_uid).first():
            raise HTTPException(status_code=400, detail=f"RFID UID '{clean_uid}' is assigned to a lecturer.")
        if (student.rfid_uid or None) != (clean_uid or None):
            uid_changes.extend([u for u in (student.rfid_uid, clean_uid) if u])
        student.rfid_uid = clean_uid or None

    for fld in ("admission_date", "graduation_year", "cgpa", "active_backlogs", "enrollment_status"):
        val = getattr(student_in, fld)
        if val is not None:
            setattr(student, fld, val)
    for fld in (student_in.clear_academic_fields or []):
        if fld in ("graduation_year", "cgpa", "active_backlogs", "admission_date"):
            setattr(student, fld, None)
    section_changed = student_in.section_id is not None and student_in.section_id != student.section_id

    if student_in.department_id is not None:
        student.department_id = student_in.department_id
    if student_in.course_id is not None:
        student.course_id = student_in.course_id
    if student_in.semester_id is not None:
        student.semester_id = student_in.semester_id
    if student_in.section_id is not None:
        student.section_id = student_in.section_id
    if student_in.parent_name is not None:
        student.parent_name = student_in.parent_name
    if student_in.parent_phone is not None:
        student.parent_phone = student_in.parent_phone
    if student_in.address is not None:
        student.address = student_in.address
    if student_in.is_active is not None:
        student.is_active = student_in.is_active
        user.is_active = student_in.is_active

    audit = AuditLog(
        user_id=current_user.id,
        action="UPDATE_STUDENT",
        entity_type="STUDENT",
        entity_id=str(student.id),
        details=f"Updated student profile {student.student_id_number}"
                + (f"; RFID UID change {uid_changes}" if uid_changes else "")
    )
    db.add(audit)
    db.commit()
    for u in uid_changes:
        rematch_uid(db, u)
    if section_changed:
        # Section changes apply from today; earlier classes keep their calculated history.
        from app.services import attendance_engine as eng
        eng.recalculate(db, start=eng.college_now().date(), student_ids=[student.id])
    db.refresh(student)

    return student

@router.delete("/{id}")
def delete_or_deactivate_student(
    id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> Any:
    student = db.query(StudentProfile).filter(StudentProfile.id == id).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    student.is_active = False
    if student.user:
        student.user.is_active = False

    audit = AuditLog(
        user_id=current_user.id,
        action="DEACTIVATE_STUDENT",
        entity_type="STUDENT",
        entity_id=str(student.id),
        details=f"Deactivated student {student.student_id_number}"
    )
    db.add(audit)
    db.commit()

    return {"message": f"Student {student.student_id_number} deactivated successfully"}

@router.post("/import-csv")
async def import_students_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> Any:
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))

    imported = 0
    errors = []

    # Get fallback department & course
    default_dept = db.query(Department).first()
    default_course = db.query(Course).first()

    for idx, row in enumerate(reader, start=2):
        usn = row.get("USN") or row.get("student_id_number") or row.get("Student ID")
        name = row.get("Name") or row.get("full_name")
        email = row.get("Email") or row.get("email")
        uid = row.get("RFID") or row.get("rfid_uid") or row.get("UID")

        if not usn or not name or not email:
            errors.append(f"Row {idx}: Missing USN, Name, or Email")
            continue

        usn = usn.strip().upper()
        email = email.strip().lower()

        # Check duplicate
        if db.query(StudentProfile).filter(StudentProfile.student_id_number == usn).first():
            errors.append(f"Row {idx}: USN '{usn}' already exists")
            continue
        if db.query(User).filter(User.email == email).first():
            errors.append(f"Row {idx}: Email '{email}' already exists")
            continue

        clean_uid = normalize_rfid_uid(uid) if uid else None
        if clean_uid and db.query(StudentProfile).filter(StudentProfile.rfid_uid == clean_uid).first():
            clean_uid = None  # Don't fail entire row, leave UID blank for review

        user = User(
            email=email,
            username=usn.lower(),
            hashed_password=get_password_hash("Student@123"),
            full_name=name.strip(),
            role=UserRole.STUDENT,
            is_active=True
        )
        db.add(user)
        db.flush()

        profile = StudentProfile(
            user_id=user.id,
            student_id_number=usn,
            rfid_uid=clean_uid,
            department_id=default_dept.id if default_dept else 1,
            course_id=default_course.id if default_course else 1,
            is_active=True
        )
        db.add(profile)
        imported += 1

    db.commit()
    return {
        "imported_count": imported,
        "error_count": len(errors),
        "errors": errors[:10]
    }

@router.get("/export/csv")
def export_students_csv(
    current_user: User = Depends(require_lecturer_or_admin),
    db: Session = Depends(get_db)
) -> Response:
    students = db.query(StudentProfile).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Student ID / USN", "Full Name", "Email", "Department", "Course", "RFID UID", "Status"])

    for s in students:
        writer.writerow([
            s.student_id_number,
            s.user.full_name if s.user else "",
            s.user.email if s.user else "",
            s.department.name if s.department else "",
            s.course.name if s.course else "",
            s.rfid_uid or "Unregistered",
            "Active" if s.is_active else "Inactive"
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=campus_core_students.csv"}
    )
