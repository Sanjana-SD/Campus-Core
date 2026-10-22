from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import (
    Department, Course, AcademicYear, Semester, Section, Subject, User, AuditLog
)
from app.schemas.schemas import (
    DepartmentCreate, DepartmentOut, CourseCreate, CourseOut,
    AcademicYearCreate, AcademicYearOut, SemesterCreate, SemesterOut,
    SectionCreate, SectionOut, SubjectCreate, SubjectOut
)
from app.api.deps import require_admin, get_current_user

router = APIRouter()

# ----------------- DEPARTMENTS -----------------
@router.get("/departments", response_model=List[DepartmentOut])
def get_departments(db: Session = Depends(get_db)) -> Any:
    return db.query(Department).all()

@router.post("/departments", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
def create_department(
    dept_in: DepartmentCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> Any:
    code = dept_in.code.strip().upper()
    if db.query(Department).filter(Department.code == code).first():
        raise HTTPException(status_code=400, detail=f"Department code '{code}' already exists")
    dept = Department(code=code, name=dept_in.name.strip(), description=dept_in.description)
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept

# ----------------- COURSES -----------------
@router.get("/courses", response_model=List[CourseOut])
def get_courses(department_id: Optional[int] = None, db: Session = Depends(get_db)) -> Any:
    query = db.query(Course)
    if department_id:
        query = query.filter(Course.department_id == department_id)
    return query.all()

@router.post("/courses", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(
    course_in: CourseCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> Any:
    code = course_in.code.strip().upper()
    if db.query(Course).filter(Course.code == code).first():
        raise HTTPException(status_code=400, detail=f"Course code '{code}' already exists")
    course = Course(**course_in.dict())
    course.code = code
    db.add(course)
    db.commit()
    db.refresh(course)
    return course

# ----------------- ACADEMIC YEARS -----------------
@router.get("/academic-years", response_model=List[AcademicYearOut])
def get_academic_years(db: Session = Depends(get_db)) -> Any:
    return db.query(AcademicYear).order_by(AcademicYear.id.desc()).all()

@router.post("/academic-years", response_model=AcademicYearOut, status_code=status.HTTP_201_CREATED)
def create_academic_year(
    year_in: AcademicYearCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> Any:
    year = AcademicYear(**year_in.dict())
    db.add(year)
    db.commit()
    db.refresh(year)
    return year

# ----------------- SEMESTERS & SECTIONS -----------------
@router.get("/semesters", response_model=List[SemesterOut])
def get_semesters(course_id: Optional[int] = None, db: Session = Depends(get_db)) -> Any:
    query = db.query(Semester)
    if course_id:
        query = query.filter(Semester.course_id == course_id)
    return query.all()

@router.post("/semesters", response_model=SemesterOut, status_code=status.HTTP_201_CREATED)
def create_semester(
    sem_in: SemesterCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> Any:
    sem = Semester(**sem_in.dict())
    db.add(sem)
    db.commit()
    db.refresh(sem)
    return sem

@router.get("/sections", response_model=List[SectionOut])
def get_sections(semester_id: Optional[int] = None, db: Session = Depends(get_db)) -> Any:
    query = db.query(Section)
    if semester_id:
        query = query.filter(Section.semester_id == semester_id)
    return query.all()

@router.post("/sections", response_model=SectionOut, status_code=status.HTTP_201_CREATED)
def create_section(
    sec_in: SectionCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> Any:
    sec = Section(semester_id=sec_in.semester_id, name=sec_in.name.strip().upper())
    db.add(sec)
    db.commit()
    db.refresh(sec)
    return sec

# ----------------- SUBJECTS -----------------
@router.get("/subjects", response_model=List[SubjectOut])
def get_subjects(
    department_id: Optional[int] = None,
    semester_id: Optional[int] = None,
    db: Session = Depends(get_db)
) -> Any:
    query = db.query(Subject)
    if department_id:
        query = query.filter(Subject.department_id == department_id)
    if semester_id:
        query = query.filter(Subject.semester_id == semester_id)
    return query.all()

@router.post("/subjects", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
def create_subject(
    subj_in: SubjectCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> Any:
    code = subj_in.code.strip().upper()
    if db.query(Subject).filter(Subject.code == code).first():
        raise HTTPException(status_code=400, detail=f"Subject code '{code}' already exists")
    subj = Subject(**subj_in.dict())
    subj.code = code
    db.add(subj)
    db.commit()
    db.refresh(subj)
    return subj
