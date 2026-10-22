from sqlalchemy import func
from app.models.models import StudentProfile
from app.services.sheet_parsing import normalize_uid
from app.services.sheet_sync_service import rematch_uid
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.models import User, UserRole, LecturerProfile, AuditLog
from app.schemas.schemas import LecturerCreate, LecturerUpdate, LecturerOut
from app.api.deps import require_admin, require_lecturer_or_admin

router = APIRouter()

@router.get("", response_model=List[LecturerOut])
def get_lecturers(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    search: Optional[str] = None,
    department_id: Optional[int] = None,
    current_user: User = Depends(require_lecturer_or_admin),
    db: Session = Depends(get_db)
) -> Any:
    query = db.query(LecturerProfile).join(User, LecturerProfile.user_id == User.id)

    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.full_name.ilike(pattern),
                User.email.ilike(pattern),
                LecturerProfile.employee_id.ilike(pattern)
            )
        )
    if department_id:
        query = query.filter(LecturerProfile.department_id == department_id)

    lecturers = query.order_by(LecturerProfile.id.desc()).offset(skip).limit(limit).all()
    return lecturers

@router.post("", response_model=LecturerOut, status_code=status.HTTP_201_CREATED)
def create_lecturer(
    lecturer_in: LecturerCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> Any:
    # Check duplicate email or username
    existing_user = db.query(User).filter(
        or_(User.username == lecturer_in.username, User.email == lecturer_in.email.lower())
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this username or email already exists."
        )

    # Check employee ID uniqueness
    emp_id = lecturer_in.employee_id.strip().upper()
    existing_emp = db.query(LecturerProfile).filter(LecturerProfile.employee_id == emp_id).first()
    if existing_emp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Employee ID '{emp_id}' is already assigned."
        )

    clean_uid = normalize_uid(lecturer_in.rfid_uid) if lecturer_in.rfid_uid else None
    if clean_uid and (
        db.query(StudentProfile).filter(func.upper(StudentProfile.rfid_uid) == clean_uid).first()
        or db.query(LecturerProfile).filter(func.upper(LecturerProfile.rfid_uid) == clean_uid).first()
    ):
        raise HTTPException(status_code=400, detail=f"RFID UID '{clean_uid}' is already assigned to someone else.")

    # Create User
    new_user = User(
        email=lecturer_in.email.lower(),
        username=lecturer_in.username.strip(),
        hashed_password=get_password_hash(lecturer_in.password or "Lecturer@123"),
        full_name=lecturer_in.full_name.strip(),
        role=UserRole.LECTURER,
        phone=lecturer_in.phone
    )
    db.add(new_user)
    db.flush()

    # Create Lecturer Profile
    profile = LecturerProfile(
        user_id=new_user.id,
        employee_id=emp_id,
        department_id=lecturer_in.department_id,
        designation=lecturer_in.designation or "Assistant Professor",
        qualification=lecturer_in.qualification,
        specialization=lecturer_in.specialization,
        rfid_uid=clean_uid,
        is_active=True
    )
    db.add(profile)

    audit = AuditLog(
        user_id=current_user.id,
        action="CREATE_LECTURER",
        entity_type="LECTURER",
        entity_id=str(new_user.id),
        details=f"Created lecturer {profile.employee_id} ({new_user.full_name})"
    )
    db.add(audit)
    db.commit()
    if clean_uid:
        rematch_uid(db, clean_uid)
    db.refresh(profile)

    return profile

@router.get("/{id}", response_model=LecturerOut)
def get_lecturer(
    id: int,
    current_user: User = Depends(require_lecturer_or_admin),
    db: Session = Depends(get_db)
) -> Any:
    lecturer = db.query(LecturerProfile).filter(LecturerProfile.id == id).first()
    if not lecturer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lecturer not found")
    return lecturer

@router.put("/{id}", response_model=LecturerOut)
def update_lecturer(
    id: int,
    lecturer_in: LecturerUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> Any:
    lecturer = db.query(LecturerProfile).filter(LecturerProfile.id == id).first()
    if not lecturer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lecturer not found")

    user = lecturer.user
    if lecturer_in.full_name is not None:
        user.full_name = lecturer_in.full_name.strip()
    if lecturer_in.email is not None:
        user.email = lecturer_in.email.lower()
    if lecturer_in.phone is not None:
        user.phone = lecturer_in.phone

    if lecturer_in.department_id is not None:
        lecturer.department_id = lecturer_in.department_id
    if lecturer_in.designation is not None:
        lecturer.designation = lecturer_in.designation
    if lecturer_in.qualification is not None:
        lecturer.qualification = lecturer_in.qualification
    if lecturer_in.specialization is not None:
        lecturer.specialization = lecturer_in.specialization
    if lecturer_in.is_active is not None:
        lecturer.is_active = lecturer_in.is_active
        user.is_active = lecturer_in.is_active
    uid_changes = []
    if lecturer_in.rfid_uid is not None:
        clean = normalize_uid(lecturer_in.rfid_uid)
        if clean:
            taken_by_student = db.query(StudentProfile).filter(func.upper(StudentProfile.rfid_uid) == clean).first()
            taken_by_lecturer = db.query(LecturerProfile).filter(func.upper(LecturerProfile.rfid_uid) == clean,
                                                                 LecturerProfile.id != lecturer.id).first()
            if taken_by_student or taken_by_lecturer:
                raise HTTPException(status_code=400, detail=f"RFID UID '{clean}' is already assigned to someone else.")
        if (lecturer.rfid_uid or None) != (clean or None):
            uid_changes = [u for u in (lecturer.rfid_uid, clean) if u]
        lecturer.rfid_uid = clean or None

    audit = AuditLog(
        user_id=current_user.id,
        action="UPDATE_LECTURER",
        entity_type="LECTURER",
        entity_id=str(lecturer.id),
        details=f"Updated lecturer profile {lecturer.employee_id}"
    )
    db.add(audit)
    db.commit()
    for u in uid_changes:
        rematch_uid(db, u)
    db.refresh(lecturer)

    return lecturer

@router.delete("/{id}")
def delete_or_deactivate_lecturer(
    id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> Any:
    lecturer = db.query(LecturerProfile).filter(LecturerProfile.id == id).first()
    if not lecturer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lecturer not found")

    lecturer.is_active = False
    if lecturer.user:
        lecturer.user.is_active = False

    audit = AuditLog(
        user_id=current_user.id,
        action="DEACTIVATE_LECTURER",
        entity_type="LECTURER",
        entity_id=str(lecturer.id),
        details=f"Deactivated lecturer {lecturer.employee_id}"
    )
    db.add(audit)
    db.commit()

    return {"message": f"Lecturer {lecturer.employee_id} deactivated successfully"}
