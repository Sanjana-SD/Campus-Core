from typing import Any, List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import ContactSubmission, User
from app.schemas.schemas import ContactSubmissionCreate, ContactSubmissionOut
from app.api.deps import require_admin

router = APIRouter()

@router.post("", response_model=ContactSubmissionOut, status_code=status.HTTP_201_CREATED)
def submit_contact_form(
    contact_in: ContactSubmissionCreate,
    db: Session = Depends(get_db)
) -> Any:
    """Public landing page contact form submission."""
    submission = ContactSubmission(
        name=contact_in.name.strip(),
        email=contact_in.email.strip().lower(),
        subject=contact_in.subject.strip(),
        message=contact_in.message.strip(),
        status="PENDING"
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission

@router.get("", response_model=List[ContactSubmissionOut])
def get_contact_submissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
) -> Any:
    return db.query(ContactSubmission).order_by(ContactSubmission.submitted_at.desc()).all()
