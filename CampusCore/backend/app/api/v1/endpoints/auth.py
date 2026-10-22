from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token
from app.models.models import User, UserRole, AuditLog, StudentProfile, LecturerProfile
from app.schemas.schemas import LoginRequest, Token, UserOut, PasswordChangeRequest
from app.api.deps import get_current_user

router = APIRouter()

@router.post("/login", response_model=Token)
def login(login_data: LoginRequest, db: Session = Depends(get_db)) -> Any:
    identifier = login_data.username_or_email.strip()
    user = db.query(User).filter(
        (User.username == identifier) | (User.email == identifier.lower())
    ).first()

    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username/email or password"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Please contact the administrator."
        )

    # Log audit entry
    audit = AuditLog(
        user_id=user.id,
        action="USER_LOGIN",
        entity_type="AUTH",
        entity_id=str(user.id),
        details=f"User {user.username} logged in successfully."
    )
    db.add(audit)
    db.commit()

    token = create_access_token(subject=user.id, role=user.role.value)
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role.value,
        "user_id": user.id,
        "full_name": user.full_name,
        "username": user.username
    }

@router.get("/me")
def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Any:
    profile_data: dict = {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "role": current_user.role.value,
        "phone": current_user.phone,
        "avatar_url": current_user.avatar_url,
        "is_active": current_user.is_active,
    }

    if current_user.role == UserRole.STUDENT and current_user.student_profile:
        sp = current_user.student_profile
        profile_data["student_profile"] = {
            "id": sp.id,
            "student_id_number": sp.student_id_number,
            "rfid_uid": sp.rfid_uid,
            "department_id": sp.department_id,
            "department_name": sp.department.name if sp.department else None,
            "course_id": sp.course_id,
            "course_name": sp.course.name if sp.course else None,
            "semester_id": sp.semester_id,
            "section_id": sp.section_id,
            "section_name": sp.section.name if sp.section else None
        }
    elif current_user.role == UserRole.LECTURER and current_user.lecturer_profile:
        lp = current_user.lecturer_profile
        profile_data["lecturer_profile"] = {
            "id": lp.id,
            "employee_id": lp.employee_id,
            "department_id": lp.department_id,
            "department_name": lp.department.name if lp.department else None,
            "designation": lp.designation,
            "qualification": lp.qualification,
            "specialization": lp.specialization
        }

    return profile_data

@router.post("/change-password")
def change_password(
    data: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Any:
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    if len(data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters"
        )

    current_user.hashed_password = get_password_hash(data.new_password)
    db.commit()

    # Log audit entry
    audit = AuditLog(
        user_id=current_user.id,
        action="PASSWORD_CHANGE",
        entity_type="USER",
        entity_id=str(current_user.id),
        details="User successfully updated their password"
    )
    db.add(audit)
    db.commit()

    return {"message": "Password changed successfully"}
