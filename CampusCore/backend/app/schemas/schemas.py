from datetime import datetime, date, time
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, Field
from app.models.models import UserRole, AttendanceStatus, SyncStatus, ExamType

# Token & Auth
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int
    full_name: str
    username: str

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    role: Optional[str] = None
    exp: Optional[int] = None

class LoginRequest(BaseModel):
    username_or_email: str
    password: str

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

# Users
class UserBase(BaseModel):
    email: EmailStr
    username: str
    full_name: str
    role: UserRole = UserRole.STUDENT
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool = True

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: Optional[bool] = None

class UserOut(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Department & Course
class DepartmentBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None

class DepartmentCreate(DepartmentBase):
    pass

class DepartmentOut(DepartmentBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class CourseBase(BaseModel):
    code: str
    name: str
    department_id: int
    duration_years: int = 4
    total_semesters: int = 8

class CourseCreate(CourseBase):
    pass

class CourseOut(CourseBase):
    id: int
    created_at: datetime
    department: Optional[DepartmentOut] = None

    class Config:
        from_attributes = True

# Academic Years, Semesters, Sections
class AcademicYearCreate(BaseModel):
    name: str
    start_date: date
    end_date: date
    is_current: bool = False

class AcademicYearOut(AcademicYearCreate):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class SemesterCreate(BaseModel):
    course_id: int
    number: int
    academic_year_id: Optional[int] = None
    is_current: bool = True

class SemesterOut(SemesterCreate):
    id: int

    class Config:
        from_attributes = True

class SectionCreate(BaseModel):
    semester_id: int
    name: str

class SectionOut(SectionCreate):
    id: int

    class Config:
        from_attributes = True

# Subjects
class SubjectBase(BaseModel):
    code: str
    name: str
    department_id: int
    semester_id: Optional[int] = None
    credits: int = 3
    total_hours: int = 45

class SubjectCreate(SubjectBase):
    pass

class SubjectOut(SubjectBase):
    id: int
    created_at: datetime
    department: Optional[DepartmentOut] = None

    class Config:
        from_attributes = True

# Student Profiles
class StudentCreate(BaseModel):
    email: EmailStr
    username: str
    full_name: str
    password: Optional[str] = "Student@123"
    student_id_number: str  # USN
    rfid_uid: Optional[str] = None
    department_id: int
    course_id: int
    semester_id: Optional[int] = None
    section_id: Optional[int] = None
    phone: Optional[str] = None
    date_of_birth: Optional[date] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    address: Optional[str] = None
    admission_date: Optional[date] = None
    graduation_year: Optional[int] = Field(None, ge=1990, le=2100)
    cgpa: Optional[float] = Field(None, ge=0, le=10)
    active_backlogs: Optional[int] = Field(None, ge=0)
    enrollment_status: Optional[str] = "ACTIVE"

class StudentUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    rfid_uid: Optional[str] = None
    department_id: Optional[int] = None
    course_id: Optional[int] = None
    semester_id: Optional[int] = None
    section_id: Optional[int] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None
    admission_date: Optional[date] = None
    graduation_year: Optional[int] = Field(None, ge=1990, le=2100)
    cgpa: Optional[float] = Field(None, ge=0, le=10)
    active_backlogs: Optional[int] = Field(None, ge=0)
    enrollment_status: Optional[str] = None
    clear_academic_fields: Optional[List[str]] = None  # e.g. ["cgpa"] to unset a value

class StudentOut(BaseModel):
    id: int
    user_id: int
    student_id_number: str
    rfid_uid: Optional[str] = None
    department_id: int
    course_id: int
    semester_id: Optional[int] = None
    section_id: Optional[int] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    address: Optional[str] = None
    is_active: bool
    admission_date: Optional[date] = None
    graduation_year: Optional[int] = None
    cgpa: Optional[float] = None
    active_backlogs: Optional[int] = None
    enrollment_status: Optional[str] = None
    user: Optional[UserOut] = None
    department: Optional[DepartmentOut] = None
    course: Optional[CourseOut] = None

    class Config:
        from_attributes = True

# Lecturer Profiles
class LecturerCreate(BaseModel):
    email: EmailStr
    username: str
    full_name: str
    password: Optional[str] = "Lecturer@123"
    employee_id: str
    department_id: int
    designation: Optional[str] = "Assistant Professor"
    qualification: Optional[str] = None
    specialization: Optional[str] = None
    phone: Optional[str] = None
    rfid_uid: Optional[str] = None

class LecturerUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    department_id: Optional[int] = None
    designation: Optional[str] = None
    qualification: Optional[str] = None
    specialization: Optional[str] = None
    is_active: Optional[bool] = None
    rfid_uid: Optional[str] = None

class LecturerOut(BaseModel):
    id: int
    user_id: int
    employee_id: str
    department_id: int
    designation: str
    qualification: Optional[str] = None
    specialization: Optional[str] = None
    is_active: bool
    rfid_uid: Optional[str] = None
    user: Optional[UserOut] = None
    department: Optional[DepartmentOut] = None

    class Config:
        from_attributes = True

# Timetable / Class Schedule
class ClassScheduleCreate(BaseModel):
    subject_id: int
    lecturer_id: int
    section_id: int
    day_of_week: str  # Monday, Tuesday, Wednesday, Thursday, Friday, Saturday
    start_time: time
    end_time: time
    room_number: str
    academic_year_id: Optional[int] = None

class ClassScheduleOut(ClassScheduleCreate):
    id: int
    subject: Optional[SubjectOut] = None
    lecturer: Optional[LecturerOut] = None

    class Config:
        from_attributes = True

# Existing Google Sheets Raw Ingestion Payload
# Exactly matching Google Sheet headers: UID, Name, Role, Date, Entry Time, Exit Time, Status
class GoogleSheetRowIngest(BaseModel):
    UID: str
    Name: Optional[str] = None
    Role: Optional[str] = None
    Date: str  # e.g., "2026-10-20" or "20/10/2026"
    Entry_Time: Optional[str] = Field(None, alias="Entry Time")
    Exit_Time: Optional[str] = Field(None, alias="Exit Time")
    Status: Optional[str] = None
    source_row_id: Optional[str] = None

    class Config:
        populate_by_name = True

class AttendanceIngestBatch(BaseModel):
    records: List[GoogleSheetRowIngest]
    source: Optional[str] = "APPS_SCRIPT"

# Attendance Interval / Processed Records
class AttendanceIntervalOut(BaseModel):
    id: int
    student_id: Optional[int] = None
    rfid_uid: str
    date: date
    entry_time: Optional[time] = None
    exit_time: Optional[time] = None
    duration_minutes: int
    official_status: AttendanceStatus
    source_status: Optional[str] = None
    notes: Optional[str] = None
    is_manually_corrected: bool
    correction_reason: Optional[str] = None
    student_name: Optional[str] = None
    student_usn: Optional[str] = None
    department_name: Optional[str] = None

    class Config:
        from_attributes = True

class AttendanceIntervalUpdate(BaseModel):
    official_status: Optional[AttendanceStatus] = None
    entry_time: Optional[time] = None
    exit_time: Optional[time] = None
    notes: Optional[str] = None
    correction_reason: str  # Mandatory reason for auditing

# Attendance Policy
class AttendancePolicyOut(BaseModel):
    id: int
    minimum_percentage: float
    late_arrival_grace_minutes: int
    college_timezone: str
    auto_reconcile_enabled: bool
    total_conducted_days: int

    class Config:
        from_attributes = True

class AttendancePolicyUpdate(BaseModel):
    minimum_percentage: Optional[float] = None
    late_arrival_grace_minutes: Optional[int] = None
    college_timezone: Optional[str] = None
    auto_reconcile_enabled: Optional[bool] = None
    total_conducted_days: Optional[int] = None

# Assignments & Submissions
class AssignmentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    subject_id: int
    section_id: Optional[int] = None
    due_date: datetime
    max_marks: float = 100.0
    allowed_file_types: str = "pdf,docx,zip,txt"

class AssignmentOut(AssignmentCreate):
    id: int
    lecturer_id: int
    created_at: datetime
    subject: Optional[SubjectOut] = None

    class Config:
        from_attributes = True

class AssignmentSubmissionCreate(BaseModel):
    assignment_id: int
    text_content: Optional[str] = None
    file_url: Optional[str] = None

class AssignmentSubmissionGrade(BaseModel):
    marks_obtained: float
    feedback: Optional[str] = None

class AssignmentSubmissionOut(BaseModel):
    id: int
    assignment_id: int
    student_id: int
    file_url: Optional[str] = None
    text_content: Optional[str] = None
    submitted_at: datetime
    marks_obtained: Optional[float] = None
    feedback: Optional[str] = None
    graded_at: Optional[datetime] = None
    student_name: Optional[str] = None
    student_usn: Optional[str] = None

    class Config:
        from_attributes = True

# Examinations & Marks
class ExaminationCreate(BaseModel):
    name: str
    exam_type: ExamType = ExamType.INTERNAL_1
    subject_id: int
    semester_id: Optional[int] = None
    exam_date: date
    start_time: time
    end_time: time
    max_marks: float = 50.0

class ExaminationOut(ExaminationCreate):
    id: int
    is_published: bool
    created_at: datetime
    subject: Optional[SubjectOut] = None

    class Config:
        from_attributes = True

class ExamMarkEntry(BaseModel):
    student_id: int
    marks_obtained: float
    is_absent: bool = False
    remarks: Optional[str] = None

class ExamMarkOut(BaseModel):
    id: int
    examination_id: int
    student_id: int
    marks_obtained: float
    is_absent: bool
    remarks: Optional[str] = None
    student_name: Optional[str] = None
    student_usn: Optional[str] = None

    class Config:
        from_attributes = True

# Announcements & Notifications
class AnnouncementCreate(BaseModel):
    title: str
    content: str
    target_role: str = "ALL"
    department_id: Optional[int] = None
    priority: str = "NORMAL"

class AnnouncementOut(AnnouncementCreate):
    id: int
    author_id: int
    author_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class NotificationOut(BaseModel):
    id: int
    title: str
    message: str
    type: str
    is_read: bool
    link: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Contact
class ContactSubmissionCreate(BaseModel):
    name: str
    email: EmailStr
    subject: str
    message: str

class ContactSubmissionOut(ContactSubmissionCreate):
    id: int
    submitted_at: datetime
    status: str

    class Config:
        from_attributes = True

# Audit & Sync Logs
class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True

class IntegrationSyncLogOut(BaseModel):
    id: int
    sync_source: str
    records_received: int
    records_processed: int
    records_failed: int
    records_unmatched: int
    status: str
    message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
