import enum
from datetime import datetime, date, time
from typing import Optional, List
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Float, ForeignKey, DateTime, Date, Time, Enum, UniqueConstraint, Index, JSON
)
from sqlalchemy.orm import relationship
from app.core.database import Base

class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    LECTURER = "LECTURER"
    STUDENT = "STUDENT"
    PLACEMENT_OFFICER = "PLACEMENT_OFFICER"

class AttendanceStatus(str, enum.Enum):
    PRESENT = "PRESENT"
    ABSENT = "ABSENT"
    LATE = "LATE"
    INCOMPLETE = "INCOMPLETE"
    PENDING_REVIEW = "PENDING_REVIEW"
    UNMATCHED_UID = "UNMATCHED_UID"
    INVALID = "INVALID"

class SyncStatus(str, enum.Enum):
    PROCESSED = "PROCESSED"
    UNMATCHED_UID = "UNMATCHED_UID"
    INVALID = "INVALID"
    DUPLICATE = "DUPLICATE"
    PENDING = "PENDING"
    UPDATED = "UPDATED"

class ExamType(str, enum.Enum):
    INTERNAL_1 = "INTERNAL_1"
    INTERNAL_2 = "INTERNAL_2"
    SEMESTER_FINAL = "SEMESTER_FINAL"
    PRACTICAL = "PRACTICAL"
    QUIZ = "QUIZ"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(200), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.STUDENT)
    is_active = Column(Boolean, default=True)
    phone = Column(String(30), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    student_profile = relationship("StudentProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    lecturer_profile = relationship("LecturerProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user")

class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, index=True, nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    courses = relationship("Course", back_populates="department", cascade="all, delete-orphan")
    subjects = relationship("Subject", back_populates="department")
    lecturers = relationship("LecturerProfile", back_populates="department")
    students = relationship("StudentProfile", back_populates="department")

class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(200), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    duration_years = Column(Integer, default=4)
    total_semesters = Column(Integer, default=8)
    created_at = Column(DateTime, default=datetime.utcnow)

    department = relationship("Department", back_populates="courses")
    semesters = relationship("Semester", back_populates="course", cascade="all, delete-orphan")
    students = relationship("StudentProfile", back_populates="course")

class AcademicYear(Base):
    __tablename__ = "academic_years"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)  # e.g., "2026-2027"
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_current = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Semester(Base):
    __tablename__ = "semesters"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    number = Column(Integer, nullable=False)  # 1 to 8
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True)
    is_current = Column(Boolean, default=True)

    course = relationship("Course", back_populates="semesters")
    sections = relationship("Section", back_populates="semester", cascade="all, delete-orphan")
    subjects = relationship("Subject", back_populates="semester")

class Section(Base):
    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, index=True)
    semester_id = Column(Integer, ForeignKey("semesters.id"), nullable=False)
    name = Column(String(20), nullable=False)  # "A", "B", "C"

    semester = relationship("Semester", back_populates="sections")
    students = relationship("StudentProfile", back_populates="section")
    schedules = relationship("ClassSchedule", back_populates="section")

class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(30), unique=True, index=True, nullable=False)
    name = Column(String(200), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    semester_id = Column(Integer, ForeignKey("semesters.id"), nullable=True)
    credits = Column(Integer, default=3)
    total_hours = Column(Integer, default=45)
    created_at = Column(DateTime, default=datetime.utcnow)

    department = relationship("Department", back_populates="subjects")
    semester = relationship("Semester", back_populates="subjects")
    schedules = relationship("ClassSchedule", back_populates="subject")
    assignments = relationship("Assignment", back_populates="subject")
    examinations = relationship("Examination", back_populates="subject")

class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    student_id_number = Column(String(50), unique=True, index=True, nullable=False)  # USN / Roll number
    rfid_uid = Column(String(100), unique=True, index=True, nullable=True)  # Hardware RFID UID
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    semester_id = Column(Integer, ForeignKey("semesters.id"), nullable=True)
    section_id = Column(Integer, ForeignKey("sections.id"), nullable=True)
    admission_date = Column(Date, nullable=True)
    date_of_birth = Column(Date, nullable=True)
    parent_name = Column(String(200), nullable=True)
    parent_phone = Column(String(30), nullable=True)
    address = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    # Academic standing used for placement eligibility (maintained by administrators)
    graduation_year = Column(Integer, nullable=True)
    cgpa = Column(Float, nullable=True)
    active_backlogs = Column(Integer, nullable=True)
    enrollment_status = Column(String(30), default="ACTIVE")  # ACTIVE, ON_LEAVE, GRADUATED, WITHDRAWN

    user = relationship("User", back_populates="student_profile")
    department = relationship("Department", back_populates="students")
    course = relationship("Course", back_populates="students")
    section = relationship("Section", back_populates="students")
    attendance_intervals = relationship("AttendanceInterval", back_populates="student")
    submissions = relationship("AssignmentSubmission", back_populates="student")
    exam_marks = relationship("ExamMark", back_populates="student")

class LecturerProfile(Base):
    __tablename__ = "lecturer_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    employee_id = Column(String(50), unique=True, index=True, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    designation = Column(String(100), default="Assistant Professor")
    qualification = Column(String(200), nullable=True)
    specialization = Column(String(200), nullable=True)
    joining_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    rfid_uid = Column(String(100), unique=True, index=True, nullable=True)  # Staff RFID card (kept out of student attendance)

    user = relationship("User", back_populates="lecturer_profile")
    department = relationship("Department", back_populates="lecturers")
    schedules = relationship("ClassSchedule", back_populates="lecturer")
    assignments = relationship("Assignment", back_populates="lecturer")

class ClassSchedule(Base):
    __tablename__ = "class_schedules"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    lecturer_id = Column(Integer, ForeignKey("lecturer_profiles.id"), nullable=False)
    section_id = Column(Integer, ForeignKey("sections.id"), nullable=False)
    day_of_week = Column(String(20), nullable=False)  # Monday, Tuesday, ...
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    room_number = Column(String(50), nullable=False)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True)
    academic_term = Column(String(50), nullable=True)
    # A timetable entry applies only between these dates (inclusive). Changing a timetable
    # closes the old entry and opens a new one so historical sessions keep their original times.
    effective_from = Column(Date, nullable=True)
    effective_to = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    subject = relationship("Subject", back_populates="schedules")
    lecturer = relationship("LecturerProfile", back_populates="schedules")
    section = relationship("Section", back_populates="schedules")

# Existing Google Sheets Raw Source Record
class AttendanceSourceRecord(Base):
    __tablename__ = "attendance_source_records"

    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String(100), index=True, nullable=False)  # RFID UID
    raw_name = Column(String(200), nullable=True)
    raw_role = Column(String(50), nullable=True)
    raw_date = Column(String(50), nullable=False)  # e.g., "2026-10-20"
    raw_entry_time = Column(String(50), nullable=True)
    raw_exit_time = Column(String(50), nullable=True)
    raw_status = Column(String(50), nullable=True)  # Raw status from sheet
    
    source_row_id = Column(String(100), index=True, nullable=True)  # Spreadsheet row or hash identifier
    ingestion_method = Column(String(50), default="APPS_SCRIPT")  # APPS_SCRIPT, SHEETS_API, MANUAL_SYNC
    sync_status = Column(Enum(SyncStatus), default=SyncStatus.PENDING)
    error_details = Column(Text, nullable=True)
    
    ingested_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    intervals = relationship("AttendanceInterval", back_populates="source_record")

# Processed Normalized Attendance Interval
class AttendanceInterval(Base):
    __tablename__ = "attendance_intervals"

    id = Column(Integer, primary_key=True, index=True)
    source_record_id = Column(Integer, ForeignKey("attendance_source_records.id"), nullable=True)
    student_id = Column(Integer, ForeignKey("student_profiles.id"), nullable=True, index=True)
    
    rfid_uid = Column(String(100), index=True, nullable=False)
    date = Column(Date, index=True, nullable=False)
    entry_time = Column(Time, nullable=True)
    exit_time = Column(Time, nullable=True)
    duration_minutes = Column(Integer, default=0)
    
    official_status = Column(Enum(AttendanceStatus), default=AttendanceStatus.PENDING_REVIEW)
    source_status = Column(String(50), nullable=True)
    
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=True)
    notes = Column(Text, nullable=True)
    
    is_manually_corrected = Column(Boolean, default=False)
    corrected_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    correction_reason = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    source_record = relationship("AttendanceSourceRecord", back_populates="intervals")
    student = relationship("StudentProfile", back_populates="attendance_intervals")
    subject = relationship("Subject")
    corrected_by = relationship("User", foreign_keys=[corrected_by_id])

class AttendancePolicy(Base):
    __tablename__ = "attendance_policies"

    id = Column(Integer, primary_key=True, index=True)
    minimum_percentage = Column(Float, default=75.0)
    late_arrival_grace_minutes = Column(Integer, default=15)
    college_timezone = Column(String(100), default="Asia/Kolkata")
    auto_reconcile_enabled = Column(Boolean, default=True)
    total_conducted_days = Column(Integer, default=60)  # legacy field, no longer used in calculations
    # Timetable-based calculation rules
    present_min_percent = Column(Float, default=75.0)    # % of class time needed for Present/Late
    partial_min_percent = Column(Float, default=25.0)    # below this -> Absent, between -> Partial
    min_required_minutes = Column(Integer, nullable=True)  # optional absolute minimum minutes
    missing_exit_policy = Column(String(30), default="PENDING_VERIFICATION")   # PENDING_VERIFICATION | ABSENT
    missing_entry_policy = Column(String(30), default="PENDING_VERIFICATION")  # PENDING_VERIFICATION | ABSENT
    count_late_as_attended = Column(Boolean, default=True)
    count_partial_as_attended = Column(Boolean, default=False)
    tracking_start_date = Column(Date, nullable=True)  # sessions before this date are not evaluated
    version = Column(Integer, default=1)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    lecturer_id = Column(Integer, ForeignKey("lecturer_profiles.id"), nullable=False)
    section_id = Column(Integer, ForeignKey("sections.id"), nullable=True)
    due_date = Column(DateTime, nullable=False)
    max_marks = Column(Float, default=100.0)
    allowed_file_types = Column(String(100), default="pdf,docx,zip,txt")
    created_at = Column(DateTime, default=datetime.utcnow)

    subject = relationship("Subject", back_populates="assignments")
    lecturer = relationship("LecturerProfile", back_populates="assignments")
    submissions = relationship("AssignmentSubmission", back_populates="assignment", cascade="all, delete-orphan")

class AssignmentSubmission(Base):
    __tablename__ = "assignment_submissions"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("student_profiles.id"), nullable=False)
    file_url = Column(String(500), nullable=True)
    text_content = Column(Text, nullable=True)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    marks_obtained = Column(Float, nullable=True)
    feedback = Column(Text, nullable=True)
    graded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    graded_at = Column(DateTime, nullable=True)

    assignment = relationship("Assignment", back_populates="submissions")
    student = relationship("StudentProfile", back_populates="submissions")
    graded_by = relationship("User")

class Examination(Base):
    __tablename__ = "examinations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    exam_type = Column(Enum(ExamType), default=ExamType.INTERNAL_1)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    semester_id = Column(Integer, ForeignKey("semesters.id"), nullable=True)
    exam_date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    max_marks = Column(Float, default=50.0)
    is_published = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    subject = relationship("Subject", back_populates="examinations")
    marks = relationship("ExamMark", back_populates="examination", cascade="all, delete-orphan")

class ExamMark(Base):
    __tablename__ = "exam_marks"

    id = Column(Integer, primary_key=True, index=True)
    examination_id = Column(Integer, ForeignKey("examinations.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("student_profiles.id"), nullable=False)
    marks_obtained = Column(Float, default=0.0)
    is_absent = Column(Boolean, default=False)
    remarks = Column(String(255), nullable=True)
    entered_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    entered_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    examination = relationship("Examination", back_populates="marks")
    student = relationship("StudentProfile", back_populates="exam_marks")
    entered_by = relationship("User")

class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    target_role = Column(String(50), default="ALL")  # ALL, LECTURER, STUDENT, ADMIN
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    priority = Column(String(20), default="NORMAL")  # LOW, NORMAL, URGENT
    created_at = Column(DateTime, default=datetime.utcnow)

    author = relationship("User")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), default="SYSTEM")  # ATTENDANCE_WARNING, ASSIGNMENT, EXAM, SYSTEM
    is_read = Column(Boolean, default=False)
    link = Column(String(255), nullable=True)
    dedupe_key = Column(String(200), nullable=True, index=True)  # prevents duplicate reminders
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="notifications")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String(50), nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="audit_logs")

class ContactSubmission(Base):
    __tablename__ = "contact_submissions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    email = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String(30), default="PENDING")

class IntegrationSyncLog(Base):
    __tablename__ = "integration_sync_logs"

    id = Column(Integer, primary_key=True, index=True)
    sync_source = Column(String(50), default="GOOGLE_SHEETS")
    records_received = Column(Integer, default=0)
    records_processed = Column(Integer, default=0)
    records_failed = Column(Integer, default=0)
    records_unmatched = Column(Integer, default=0)
    status = Column(String(50), default="SUCCESS")  # SUCCESS, PARTIAL, FAILED
    message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
