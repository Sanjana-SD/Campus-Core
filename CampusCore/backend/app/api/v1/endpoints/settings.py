from typing import Any, Dict
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.models import User, AttendancePolicy, Department, Course, StudentProfile, LecturerProfile
from app.api.deps import require_admin
from app.services.attendance_engine import get_policy

router = APIRouter()

@router.get("")
def get_system_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
) -> Any:
    policy = get_policy(db)
    
    return {
        "institution_name": settings.PROJECT_NAME,
        "tagline": settings.TAGLINE,
        "version": settings.VERSION,
        "timezone": policy.college_timezone,
        "minimum_attendance_threshold": policy.minimum_percentage,
        "late_arrival_grace_minutes": policy.late_arrival_grace_minutes,
        "auto_reconcile_enabled": policy.auto_reconcile_enabled,
        "google_sheet_id": settings.GOOGLE_SHEET_ID,
        "google_sheet_url": settings.GOOGLE_SHEET_URL,
        "webhook_url": f"/api/v1/integrations/google-sheets/attendance",
        "total_departments": db.query(Department).count(),
        "total_courses": db.query(Course).count(),
        "total_students": db.query(StudentProfile).count(),
        "total_lecturers": db.query(LecturerProfile).count()
    }
