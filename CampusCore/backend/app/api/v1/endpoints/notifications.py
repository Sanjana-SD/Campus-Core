from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.models import Notification, User, UserRole
from app.services.placement_service import run_reminders

router = APIRouter()


def _out(n: Notification) -> dict:
    return {"id": n.id, "title": n.title, "message": n.message, "type": n.type, "is_read": n.is_read,
            "link": n.link, "created_at": n.created_at.isoformat() + "Z" if n.created_at else None}


@router.get("")
def list_notifications(unread_only: bool = False, type_prefix: Optional[str] = None,
                       skip: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=200),
                       current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Any:
    if current_user.role == UserRole.STUDENT:
        run_reminders(db)  # idempotent deadline / drive-date reminders
    q = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        q = q.filter(Notification.is_read.is_(False))
    if type_prefix:
        q = q.filter(Notification.type.like(f"{type_prefix.upper()}%"))
    total = q.count()
    unread = db.query(Notification).filter(Notification.user_id == current_user.id,
                                           Notification.is_read.is_(False)).count()
    items = q.order_by(Notification.created_at.desc(), Notification.id.desc()).offset(skip).limit(limit).all()
    return {"total": total, "unread": unread, "items": [_out(n) for n in items]}


@router.get("/unread-count")
def unread_count(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Any:
    return {"unread": db.query(Notification).filter(Notification.user_id == current_user.id,
                                                    Notification.is_read.is_(False)).count()}


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, read: bool = True, current_user: User = Depends(get_current_user),
              db: Session = Depends(get_db)) -> Any:
    n = db.get(Notification, notification_id)
    if not n or n.user_id != current_user.id:
        raise HTTPException(404, "Notification not found")
    n.is_read = read
    db.commit()
    return _out(n)


@router.post("/read-all")
def mark_all_read(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Any:
    n = db.query(Notification).filter(Notification.user_id == current_user.id,
                                      Notification.is_read.is_(False)).update({"is_read": True})
    db.commit()
    return {"updated": n}
