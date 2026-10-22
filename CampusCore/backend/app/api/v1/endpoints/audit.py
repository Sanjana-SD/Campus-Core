from typing import Any, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import AuditLog, User
from app.schemas.schemas import AuditLogOut
from app.api.deps import require_admin

router = APIRouter()

@router.get("", response_model=List[AuditLogOut])
def get_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
) -> Any:
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
    out = []
    for l in logs:
        out.append({
            "id": l.id,
            "user_id": l.user_id,
            "user_name": l.user.username if l.user else "System",
            "action": l.action,
            "entity_type": l.entity_type,
            "entity_id": l.entity_id,
            "details": l.details,
            "ip_address": l.ip_address,
            "timestamp": l.timestamp
        })
    return out
