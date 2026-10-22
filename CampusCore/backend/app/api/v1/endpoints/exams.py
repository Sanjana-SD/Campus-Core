from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Examination, ExamMark, StudentProfile, User, UserRole, AuditLog
from app.schemas.schemas import ExaminationCreate, ExaminationOut, ExamMarkEntry, ExamMarkOut
from app.api.deps import require_admin, require_lecturer_or_admin, get_current_user

router = APIRouter()

@router.get("", response_model=List[ExaminationOut])
def get_examinations(
    subject_id: Optional[int] = None,
    semester_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Any:
    query = db.query(Examination)
    if subject_id:
        query = query.filter(Examination.subject_id == subject_id)
    if semester_id:
        query = query.filter(Examination.semester_id == semester_id)
    
    # If student, only show published exams or scheduled exams
    return query.order_by(Examination.exam_date.desc()).all()

@router.post("", response_model=ExaminationOut, status_code=status.HTTP_201_CREATED)
def create_examination(
    exam_in: ExaminationCreate,
    current_user: User = Depends(require_lecturer_or_admin),
    db: Session = Depends(get_db)
) -> Any:
    exam = Examination(**exam_in.dict())
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam

@router.get("/{id}/marks", response_model=List[ExamMarkOut])
def get_exam_marks(
    id: int,
    current_user: User = Depends(require_lecturer_or_admin),
    db: Session = Depends(get_db)
) -> Any:
    marks = db.query(ExamMark).filter(ExamMark.examination_id == id).all()
    out = []
    for m in marks:
        out.append({
            "id": m.id,
            "examination_id": m.examination_id,
            "student_id": m.student_id,
            "marks_obtained": m.marks_obtained,
            "is_absent": m.is_absent,
            "remarks": m.remarks,
            "student_name": m.student.user.full_name if (m.student and m.student.user) else "Unknown",
            "student_usn": m.student.student_id_number if m.student else "N/A"
        })
    return out

@router.post("/{id}/marks")
def enter_exam_marks(
    id: int,
    marks_list: List[ExamMarkEntry],
    current_user: User = Depends(require_lecturer_or_admin),
    db: Session = Depends(get_db)
) -> Any:
    exam = db.query(Examination).filter(Examination.id == id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Examination not found")

    for entry in marks_list:
        if entry.marks_obtained > exam.max_marks:
            raise HTTPException(
                status_code=400,
                detail=f"Marks obtained ({entry.marks_obtained}) exceeds maximum allowed ({exam.max_marks})"
            )

        existing = db.query(ExamMark).filter(
            ExamMark.examination_id == id,
            ExamMark.student_id == entry.student_id
        ).first()

        if existing:
            existing.marks_obtained = entry.marks_obtained
            existing.is_absent = entry.is_absent
            existing.remarks = entry.remarks
            existing.entered_by_id = current_user.id
        else:
            mark = ExamMark(
                examination_id=id,
                student_id=entry.student_id,
                marks_obtained=entry.marks_obtained,
                is_absent=entry.is_absent,
                remarks=entry.remarks,
                entered_by_id=current_user.id
            )
            db.add(mark)

    db.commit()
    return {"message": f"Successfully updated marks for {len(marks_list)} students"}

@router.post("/{id}/publish")
def publish_results(
    id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> Any:
    exam = db.query(Examination).filter(Examination.id == id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Examination not found")

    exam.is_published = True
    audit = AuditLog(
        user_id=current_user.id,
        action="PUBLISH_EXAM_RESULTS",
        entity_type="EXAMINATION",
        entity_id=str(exam.id),
        details=f"Admin {current_user.username} published examination results for {exam.name}"
    )
    db.add(audit)
    db.commit()

    return {"message": f"Results for '{exam.name}' published successfully"}

@router.get("/my-results")
def get_my_results(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Any:
    """Returns examination marks for the logged-in student (only published exams)."""
    if current_user.role != UserRole.STUDENT or not current_user.student_profile:
        raise HTTPException(status_code=403, detail="Only students can access their results")

    student_id = current_user.student_profile.id
    marks = db.query(ExamMark).join(Examination, ExamMark.examination_id == Examination.id)\
                              .filter(
                                  ExamMark.student_id == student_id,
                                  Examination.is_published == True
                              ).all()

    return [
        {
            "id": m.id,
            "exam_name": m.examination.name,
            "exam_type": m.examination.exam_type.value,
            "subject_name": m.examination.subject.name if m.examination.subject else "N/A",
            "subject_code": m.examination.subject.code if m.examination.subject else "N/A",
            "max_marks": m.examination.max_marks,
            "marks_obtained": m.marks_obtained,
            "is_absent": m.is_absent,
            "remarks": m.remarks,
            "percentage": round((m.marks_obtained / max(m.examination.max_marks, 1)) * 100, 1)
        }
        for m in marks
    ]
