from datetime import datetime
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Assignment, AssignmentSubmission, User, UserRole, LecturerProfile, StudentProfile, AuditLog
from app.schemas.schemas import (
    AssignmentCreate, AssignmentOut, AssignmentSubmissionCreate,
    AssignmentSubmissionGrade, AssignmentSubmissionOut
)
from app.api.deps import require_lecturer_or_admin, get_current_user

router = APIRouter()

@router.get("", response_model=List[AssignmentOut])
def get_assignments(
    subject_id: Optional[int] = None,
    section_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Any:
    query = db.query(Assignment)
    if subject_id:
        query = query.filter(Assignment.subject_id == subject_id)
    if section_id:
        query = query.filter(Assignment.section_id == section_id)
    return query.order_by(Assignment.due_date.asc()).all()

@router.post("", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED)
def create_assignment(
    assignment_in: AssignmentCreate,
    current_user: User = Depends(require_lecturer_or_admin),
    db: Session = Depends(get_db)
) -> Any:
    lecturer_id = None
    if current_user.role == UserRole.LECTURER:
        if not current_user.lecturer_profile:
            raise HTTPException(status_code=400, detail="Lecturer profile not found")
        lecturer_id = current_user.lecturer_profile.id
    else:
        # Admin creating: assign first lecturer or placeholder
        lp = db.query(LecturerProfile).first()
        lecturer_id = lp.id if lp else 1

    assignment = Assignment(
        title=assignment_in.title.strip(),
        description=assignment_in.description,
        subject_id=assignment_in.subject_id,
        lecturer_id=lecturer_id,
        section_id=assignment_in.section_id,
        due_date=assignment_in.due_date,
        max_marks=assignment_in.max_marks,
        allowed_file_types=assignment_in.allowed_file_types
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment

@router.post("/{id}/submit", response_model=AssignmentSubmissionOut)
def submit_assignment(
    id: int,
    submission_in: AssignmentSubmissionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Any:
    if current_user.role != UserRole.STUDENT or not current_user.student_profile:
        raise HTTPException(status_code=403, detail="Only students can submit assignments")

    assignment = db.query(Assignment).filter(Assignment.id == id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    student_id = current_user.student_profile.id
    existing = db.query(AssignmentSubmission).filter(
        AssignmentSubmission.assignment_id == id,
        AssignmentSubmission.student_id == student_id
    ).first()

    if existing:
        # Update submission
        existing.text_content = submission_in.text_content
        existing.file_url = submission_in.file_url or existing.file_url
        existing.submitted_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing

    submission = AssignmentSubmission(
        assignment_id=id,
        student_id=student_id,
        text_content=submission_in.text_content,
        file_url=submission_in.file_url,
        submitted_at=datetime.utcnow()
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission

@router.get("/{id}/submissions", response_model=List[AssignmentSubmissionOut])
def get_assignment_submissions(
    id: int,
    current_user: User = Depends(require_lecturer_or_admin),
    db: Session = Depends(get_db)
) -> Any:
    subs = db.query(AssignmentSubmission).filter(AssignmentSubmission.assignment_id == id).all()
    out = []
    for s in subs:
        out.append({
            "id": s.id,
            "assignment_id": s.assignment_id,
            "student_id": s.student_id,
            "file_url": s.file_url,
            "text_content": s.text_content,
            "submitted_at": s.submitted_at,
            "marks_obtained": s.marks_obtained,
            "feedback": s.feedback,
            "graded_at": s.graded_at,
            "student_name": s.student.user.full_name if (s.student and s.student.user) else "Unknown",
            "student_usn": s.student.student_id_number if s.student else "N/A"
        })
    return out

@router.post("/submissions/{sub_id}/grade", response_model=AssignmentSubmissionOut)
def grade_submission(
    sub_id: int,
    grade_in: AssignmentSubmissionGrade,
    current_user: User = Depends(require_lecturer_or_admin),
    db: Session = Depends(get_db)
) -> Any:
    sub = db.query(AssignmentSubmission).filter(AssignmentSubmission.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    sub.marks_obtained = grade_in.marks_obtained
    sub.feedback = grade_in.feedback
    sub.graded_by_id = current_user.id
    sub.graded_at = datetime.utcnow()

    db.commit()
    db.refresh(sub)
    return {
        "id": sub.id,
        "assignment_id": sub.assignment_id,
        "student_id": sub.student_id,
        "file_url": sub.file_url,
        "text_content": sub.text_content,
        "submitted_at": sub.submitted_at,
        "marks_obtained": sub.marks_obtained,
        "feedback": sub.feedback,
        "graded_at": sub.graded_at,
        "student_name": sub.student.user.full_name if (sub.student and sub.student.user) else "Unknown",
        "student_usn": sub.student.student_id_number if sub.student else "N/A"
    }
