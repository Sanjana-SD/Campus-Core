from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.models.models import Announcement, Notification, User, UserRole
from app.schemas.schemas import AnnouncementCreate, AnnouncementOut, NotificationOut
from app.api.deps import require_lecturer_or_admin, get_current_user

router = APIRouter()

@router.get("", response_model=List[AnnouncementOut])
def get_announcements(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Any:
    # Filter announcements based on user role
    role_str = current_user.role.value
    query = db.query(Announcement).filter(
        or_(
            Announcement.target_role == "ALL",
            Announcement.target_role == role_str
        )
    )
    items = query.order_by(Announcement.created_at.desc()).limit(50).all()
    
    out = []
    for item in items:
        out.append({
            "id": item.id,
            "title": item.title,
            "content": item.content,
            "target_role": item.target_role,
            "department_id": item.department_id,
            "priority": item.priority,
            "created_at": item.created_at,
            "author_id": item.author_id,
            "author_name": item.author.full_name if item.author else "Administrator"
        })
    return out

@router.post("", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
def create_announcement(
    ann_in: AnnouncementCreate,
    current_user: User = Depends(require_lecturer_or_admin),
    db: Session = Depends(get_db)
) -> Any:
    ann = Announcement(
        title=ann_in.title.strip(),
        content=ann_in.content.strip(),
        target_role=ann_in.target_role,
        department_id=ann_in.department_id,
        priority=ann_in.priority,
        author_id=current_user.id
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)

    return {
        "id": ann.id,
        "title": ann.title,
        "content": ann.content,
        "target_role": ann.target_role,
        "department_id": ann.department_id,
        "priority": ann.priority,
        "created_at": ann.created_at,
        "author_id": ann.author_id,
        "author_name": current_user.full_name
    }

@router.get("/notifications", response_model=List[NotificationOut])
def get_user_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Any:
    return db.query(Notification).filter(
        Notification.user_id == current_user.id
    ).order_by(Notification.created_at.desc()).limit(20).all()

@router.put("/notifications/{id}/read")
def mark_notification_read(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Any:
    notif = db.query(Notification).filter(
        Notification.id == id,
        Notification.user_id == current_user.id
    ).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"message": "Notification updated"}
