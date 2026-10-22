"""Administrator user & role management (staff accounts such as Placement Officers).
Students and lecturers keep being created through their dedicated endpoints so that their
academic profiles are always present."""
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.models import AuditLog, User, UserRole

router = APIRouter()
STAFF_ROLES = {UserRole.ADMIN, UserRole.PLACEMENT_OFFICER}


def _out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "email": u.email, "full_name": u.full_name,
            "role": u.role.value, "is_active": u.is_active, "phone": u.phone,
            "created_at": u.created_at.isoformat() + "Z" if u.created_at else None}


@router.get("")
def list_users(role: Optional[str] = None, search: Optional[str] = None, skip: int = Query(0, ge=0),
               limit: int = Query(50, ge=1, le=500), current_user: User = Depends(require_admin),
               db: Session = Depends(get_db)) -> Any:
    q = db.query(User)
    if role:
        try:
            q = q.filter(User.role == UserRole(role.upper()))
        except ValueError:
            raise HTTPException(400, f"Unknown role '{role}'")
    if search:
        pat = f"%{search.strip()}%"
        q = q.filter(or_(User.full_name.ilike(pat), User.username.ilike(pat), User.email.ilike(pat)))
    total = q.count()
    counts = {r.value: db.query(User).filter(User.role == r).count() for r in UserRole}
    return {"total": total, "counts": counts,
            "items": [_out(u) for u in q.order_by(User.role, User.full_name).offset(skip).limit(limit)]}


class StaffIn(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    email: EmailStr
    full_name: str = Field(..., min_length=2)
    password: str = Field(..., min_length=8)
    role: str = "PLACEMENT_OFFICER"
    phone: Optional[str] = None


@router.post("", status_code=201)
def create_staff(data: StaffIn, current_user: User = Depends(require_admin), db: Session = Depends(get_db)) -> Any:
    try:
        role = UserRole(data.role.upper())
    except ValueError:
        raise HTTPException(400, f"Unknown role '{data.role}'")
    if role not in STAFF_ROLES:
        raise HTTPException(400, "Create students and lecturers from their management pages so their academic "
                                 "profiles are created too.")
    if db.query(User).filter(or_(User.username == data.username.strip(), User.email == data.email.lower())).first():
        raise HTTPException(409, "A user with this username or e-mail already exists")
    u = User(username=data.username.strip(), email=data.email.lower(), full_name=data.full_name.strip(),
             hashed_password=get_password_hash(data.password), role=role, phone=data.phone, is_active=True)
    db.add(u)
    db.flush()
    db.add(AuditLog(user_id=current_user.id, action="USER_CREATED", entity_type="USER", entity_id=str(u.id),
                    details=f"{role.value} account {u.username} created"))
    db.commit()
    return _out(u)


class UserUpdateIn(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    new_password: Optional[str] = Field(None, min_length=8)


@router.put("/{user_id}")
def update_user(user_id: int, data: UserUpdateIn, current_user: User = Depends(require_admin),
                db: Session = Depends(get_db)) -> Any:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.id == current_user.id and data.is_active is False:
        raise HTTPException(400, "You cannot deactivate your own account")
    changes = []
    if data.full_name:
        u.full_name = data.full_name.strip()
        changes.append("name")
    if data.phone is not None:
        u.phone = data.phone
        changes.append("phone")
    if data.is_active is not None and data.is_active != u.is_active:
        u.is_active = data.is_active
        if u.student_profile:
            u.student_profile.is_active = data.is_active
        if u.lecturer_profile:
            u.lecturer_profile.is_active = data.is_active
        changes.append("activated" if data.is_active else "deactivated")
    if data.new_password:
        u.hashed_password = get_password_hash(data.new_password)
        changes.append("password reset")
    db.add(AuditLog(user_id=current_user.id, action="USER_UPDATED", entity_type="USER", entity_id=str(u.id),
                    details=", ".join(changes) or "no changes"))
    db.commit()
    return _out(u)
