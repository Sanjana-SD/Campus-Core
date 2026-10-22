"""
New entities for the Google Sheets import, timetable-based attendance and placement
management. They share the declarative Base (and therefore the metadata) with
app.models.models, so relationships can reference existing classes by name.
"""
from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Float, ForeignKey, DateTime, Date, Time,
    UniqueConstraint, Index, JSON,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


# =====================================================================
# Google Sheets import (source of truth for RFID evidence)
# =====================================================================

class SyncRun(Base):
    """One attempt to read the configured worksheet (manual, webhook, test or retry)."""
    __tablename__ = "sync_runs"

    id = Column(Integer, primary_key=True, index=True)
    trigger = Column(String(30), default="MANUAL")      # MANUAL, WEBHOOK, TEST, RETRY
    transport = Column(String(30), nullable=True)       # SERVICE_ACCOUNT, APPS_SCRIPT, PUBLIC_CSV, WEBHOOK
    spreadsheet_id = Column(String(200), nullable=False)
    worksheet_gid = Column(String(50), nullable=False)
    worksheet_title = Column(String(200), nullable=True)
    status = Column(String(20), default="RUNNING")      # RUNNING, SUCCESS, PARTIAL, FAILED
    error_code = Column(String(50), nullable=True)
    error_message = Column(Text, nullable=True)
    headers_detected = Column(JSON, nullable=True)
    column_mapping = Column(JSON, nullable=True)
    rows_read = Column(Integer, default=0)
    imported = Column(Integer, default=0)
    updated = Column(Integer, default=0)
    unchanged = Column(Integer, default=0)
    rejected = Column(Integer, default=0)
    removed = Column(Integer, default=0)
    triggered_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    retry_of_id = Column(Integer, ForeignKey("sync_runs.id"), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    finished_at = Column(DateTime, nullable=True)


class SheetAttendanceRow(Base):
    """
    One row of the Google Form / RFID response worksheet, stored exactly as read.

    Source behaviour (google-apps-script/Code.gs): an ENTRY scan appends a new row and the
    matching EXIT scan fills Exit Time on that same row (Status becomes COMPLETED). A UID can
    therefore have several rows, i.e. several presence intervals, on one date.

    Identity: `source_key` is a fingerprint of (UID, Date, Entry Time, occurrence). It stays
    stable when Exit Time is filled in later and when rows above shift position.
    """
    __tablename__ = "sheet_attendance_rows"

    id = Column(Integer, primary_key=True, index=True)
    spreadsheet_id = Column(String(200), nullable=False)
    worksheet_gid = Column(String(50), nullable=False)
    source_key = Column(String(80), nullable=False)
    row_number = Column(Integer, nullable=True)  # last known 1-based row number in the sheet

    # Original values, never overwritten by calculated results
    raw_uid = Column(String(200), nullable=True)
    raw_name = Column(String(300), nullable=True)
    raw_role = Column(String(100), nullable=True)
    raw_date = Column(String(100), nullable=True)
    raw_entry_time = Column(String(100), nullable=True)
    raw_exit_time = Column(String(100), nullable=True)
    raw_status = Column(String(100), nullable=True)
    raw_extra = Column(JSON, nullable=True)  # any additional columns (e.g. Timestamp)
    content_hash = Column(String(64), nullable=False)

    # Parsed values
    uid = Column(String(200), index=True, nullable=True)  # trimmed + upper-cased string; leading zeros kept
    event_date = Column(Date, index=True, nullable=True)
    entry_time = Column(Time, nullable=True)
    exit_time = Column(Time, nullable=True)
    role_category = Column(String(20), default="UNKNOWN")  # STUDENT, LECTURER, OTHER, UNKNOWN
    validity = Column(String(20), default="VALID")  # VALID, INCOMPLETE, INVALID
    issues = Column(JSON, nullable=True)  # list of human-readable problems

    # Identity matching
    match_status = Column(String(20), default="UNMATCHED", index=True)  # MATCHED, UNMATCHED, CONFLICT, STAFF, IGNORED
    match_note = Column(Text, nullable=True)
    student_id = Column(Integer, ForeignKey("student_profiles.id"), nullable=True, index=True)
    lecturer_id = Column(Integer, ForeignKey("lecturer_profiles.id"), nullable=True)

    ingestion_method = Column(String(30), default="SERVICE_ACCOUNT")
    missing_from_source = Column(Boolean, default=False)
    first_seen_run_id = Column(Integer, ForeignKey("sync_runs.id"), nullable=True)
    last_seen_run_id = Column(Integer, ForeignKey("sync_runs.id"), nullable=True)
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    last_changed_at = Column(DateTime, default=datetime.utcnow)

    student = relationship("StudentProfile")
    lecturer = relationship("LecturerProfile")

    __table_args__ = (
        UniqueConstraint("spreadsheet_id", "worksheet_gid", "source_key", name="uq_sheet_row_identity"),
        Index("ix_sheet_rows_student_date", "student_id", "event_date"),
    )


class SheetRowRevision(Base):
    """Audit trail of source values whenever a previously imported row changes."""
    __tablename__ = "sheet_row_revisions"

    id = Column(Integer, primary_key=True, index=True)
    row_id = Column(Integer, ForeignKey("sheet_attendance_rows.id"), nullable=False, index=True)
    sync_run_id = Column(Integer, ForeignKey("sync_runs.id"), nullable=True)
    change_type = Column(String(30), nullable=False)  # UPDATED, REMOVED, RESTORED, UID_MAPPED
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    changed_at = Column(DateTime, default=datetime.utcnow)


# =====================================================================
# Timetable sessions & per-class attendance
# =====================================================================

class TimetableBreak(Base):
    __tablename__ = "timetable_breaks"

    id = Column(Integer, primary_key=True, index=True)
    section_id = Column(Integer, ForeignKey("sections.id"), nullable=True)  # null = all sections
    day_of_week = Column(String(20), nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    label = Column(String(100), default="Break")

    section = relationship("Section")


class ClassSession(Base):
    """A concrete occurrence of a timetable entry on a date. Times are snapshotted so
    later timetable edits never rewrite history."""
    __tablename__ = "class_sessions"

    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("class_schedules.id"), nullable=False)
    date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    lecturer_id = Column(Integer, ForeignKey("lecturer_profiles.id"), nullable=False)
    section_id = Column(Integer, ForeignKey("sections.id"), nullable=False, index=True)
    room_number = Column(String(50), nullable=True)
    status = Column(String(20), default="SCHEDULED")  # SCHEDULED, CANCELLED
    cancel_reason = Column(Text, nullable=True)
    cancelled_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    schedule = relationship("ClassSchedule")
    subject = relationship("Subject")
    lecturer = relationship("LecturerProfile")
    section = relationship("Section")

    __table_args__ = (UniqueConstraint("schedule_id", "date", name="uq_session_schedule_date"),)


class SubjectEnrollment(Base):
    """Per-student exceptions to section-based enrollment (e.g. a subject the student dropped)."""
    __tablename__ = "subject_enrollments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("student_profiles.id"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    status = Column(String(20), default="DROPPED")  # DROPPED (sessions excluded in the date range)
    effective_from = Column(Date, nullable=True)
    effective_to = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SubjectAttendanceRule(Base):
    """Subject-specific overrides of the global attendance policy (null = inherit)."""
    __tablename__ = "subject_attendance_rules"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), unique=True, nullable=False)
    late_arrival_grace_minutes = Column(Integer, nullable=True)
    present_min_percent = Column(Float, nullable=True)
    partial_min_percent = Column(Float, nullable=True)
    min_required_minutes = Column(Integer, nullable=True)
    minimum_percentage = Column(Float, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    subject = relationship("Subject")


class AttendanceRecord(Base):
    """Calculated attendance of one student for one class session."""
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("student_profiles.id"), nullable=False, index=True)
    session_id = Column(Integer, ForeignKey("class_sessions.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    scheduled_start = Column(Time, nullable=False)
    scheduled_end = Column(Time, nullable=False)
    scheduled_minutes = Column(Integer, nullable=False)
    intervals = Column(JSON, nullable=True)  # [{"entry": "09:10", "exit": "10:00", "row_id": 5}, ...]
    first_entry = Column(Time, nullable=True)
    last_exit = Column(Time, nullable=True)
    attended_minutes = Column(Integer, default=0)
    duration_percent = Column(Float, default=0.0)
    computed_status = Column(String(30), nullable=False)
    final_status = Column(String(30), nullable=False, index=True)
    status_reason = Column(Text, nullable=True)
    source_row_ids = Column(JSON, nullable=True)
    policy_id = Column(Integer, ForeignKey("attendance_policies.id"), nullable=True)
    policy_version = Column(Integer, nullable=True)
    calculated_at = Column(DateTime, default=datetime.utcnow)
    # Manual correction (never silently overwritten by recalculation)
    is_overridden = Column(Boolean, default=False)
    override_status = Column(String(30), nullable=True)
    override_reason = Column(Text, nullable=True)
    overridden_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    overridden_at = Column(DateTime, nullable=True)
    override_stale = Column(Boolean, default=False)  # evidence changed after the correction

    student = relationship("StudentProfile")
    session = relationship("ClassSession")
    subject = relationship("Subject")

    __table_args__ = (UniqueConstraint("student_id", "session_id", name="uq_attendance_student_session"),)


class AttendanceCorrection(Base):
    __tablename__ = "attendance_corrections"

    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(Integer, ForeignKey("attendance_records.id"), nullable=False, index=True)
    old_status = Column(String(30), nullable=True)
    new_status = Column(String(30), nullable=True)  # null = correction removed
    reason = Column(Text, nullable=False)
    corrected_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    corrected_by = relationship("User")


class AttendanceDispute(Base):
    __tablename__ = "attendance_disputes"

    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(Integer, ForeignKey("attendance_records.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("student_profiles.id"), nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(20), default="OPEN")  # OPEN, RESOLVED, REJECTED
    resolution_note = Column(Text, nullable=True)
    resolved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    record = relationship("AttendanceRecord")


# =====================================================================
# Placement management
# =====================================================================

class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    name_key = Column(String(200), unique=True, nullable=False)  # normalised name, prevents duplicates
    logo_url = Column(String(500), nullable=True)
    industry = Column(String(150), nullable=True)
    description = Column(Text, nullable=True)
    website = Column(String(300), nullable=True)
    location = Column(String(200), nullable=True)
    recruiter_name = Column(String(200), nullable=True)
    recruiter_email = Column(String(255), nullable=True)
    recruiter_phone = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String(20), default="ACTIVE")  # ACTIVE, ARCHIVED
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    drives = relationship("PlacementDrive", back_populates="company")


class PlacementDrive(Base):
    __tablename__ = "placement_drives"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    job_title = Column(String(200), nullable=False)
    job_description = Column(Text, nullable=True)
    job_type = Column(String(30), default="FULL_TIME")  # FULL_TIME, INTERNSHIP, INTERNSHIP_PPO, CONTRACT
    job_location = Column(String(200), nullable=True)
    work_mode = Column(String(20), nullable=True)  # ONSITE, REMOTE, HYBRID
    ctc_min = Column(Float, nullable=True)  # LPA
    ctc_max = Column(Float, nullable=True)
    ctc_text = Column(String(200), nullable=True)
    required_skills = Column(JSON, nullable=True)
    # Eligibility rules (null/empty = no restriction on that criterion)
    eligible_department_ids = Column(JSON, nullable=True)
    eligible_course_ids = Column(JSON, nullable=True)  # branches / programmes
    eligible_semesters = Column(JSON, nullable=True)
    graduation_years = Column(JSON, nullable=True)
    min_cgpa = Column(Float, nullable=True)
    max_active_backlogs = Column(Integer, nullable=True)
    other_requirements = Column(Text, nullable=True)
    # Schedule
    application_open_at = Column(DateTime, nullable=True)
    application_deadline = Column(DateTime, nullable=True)
    drive_date = Column(Date, nullable=True)
    drive_time = Column(Time, nullable=True)
    venue = Column(String(300), nullable=True)
    meeting_link = Column(String(500), nullable=True)
    selection_process = Column(JSON, nullable=True)  # ordered list of stage names
    vacancies = Column(Integer, nullable=True)
    instructions = Column(Text, nullable=True)
    contact_person = Column(String(200), nullable=True)
    contact_email = Column(String(255), nullable=True)
    # Stored lifecycle: DRAFT, PUBLISHED, IN_PROGRESS, COMPLETED, CANCELLED.
    # UPCOMING / APPLICATIONS_OPEN / APPLICATIONS_CLOSED are derived from dates for PUBLISHED drives.
    status = Column(String(30), default="DRAFT", index=True)
    published_at = Column(DateTime, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="drives")
    applications = relationship("PlacementApplication", back_populates="drive")


class EligibilityException(Base):
    __tablename__ = "placement_eligibility_exceptions"

    id = Column(Integer, primary_key=True, index=True)
    drive_id = Column(Integer, ForeignKey("placement_drives.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("student_profiles.id"), nullable=False)
    reason = Column(Text, nullable=False)
    granted_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("drive_id", "student_id", name="uq_eligibility_exception"),)


class PlacementApplication(Base):
    """
    Explicit, separate dimensions so that applying != registration != attendance
    != selection != offer != final placement.
    """
    __tablename__ = "placement_applications"

    id = Column(Integer, primary_key=True, index=True)
    drive_id = Column(Integer, ForeignKey("placement_drives.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("student_profiles.id"), nullable=False, index=True)
    applied_at = Column(DateTime, default=datetime.utcnow)
    application_status = Column(String(20), default="APPLIED")  # APPLIED, WITHDRAWN
    registration_status = Column(String(20), default="PENDING")  # PENDING, CONFIRMED, REJECTED
    attendance_status = Column(String(20), default="NOT_RECORDED")  # NOT_RECORDED, ATTENDED, DID_NOT_ATTEND
    current_stage = Column(String(100), default="Application Submitted")
    result = Column(String(20), default="IN_PROCESS")  # IN_PROCESS, SHORTLISTED, SELECTED, REJECTED
    result_date = Column(Date, nullable=True)
    eligibility_snapshot = Column(JSON, nullable=True)
    via_exception = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)  # officer-only
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    drive = relationship("PlacementDrive", back_populates="applications")
    student = relationship("StudentProfile")
    offer = relationship("PlacementOffer", back_populates="application", uselist=False)
    history = relationship(
        "SelectionStageHistory", back_populates="application", order_by="SelectionStageHistory.id"
    )

    __table_args__ = (UniqueConstraint("drive_id", "student_id", name="uq_application_drive_student"),)


class SelectionStageHistory(Base):
    __tablename__ = "selection_stage_history"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("placement_applications.id"), nullable=False, index=True)
    field = Column(String(30), nullable=False)  # registration, attendance, stage, result, offer, placement
    old_value = Column(String(100), nullable=True)
    new_value = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    changed_at = Column(DateTime, default=datetime.utcnow)

    application = relationship("PlacementApplication", back_populates="history")
    changed_by = relationship("User")


class PlacementOffer(Base):
    __tablename__ = "placement_offers"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("placement_applications.id"), unique=True, nullable=False)
    student_id = Column(Integer, ForeignKey("student_profiles.id"), nullable=False, index=True)
    drive_id = Column(Integer, ForeignKey("placement_drives.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    offered_ctc = Column(Float, nullable=True)
    offer_date = Column(Date, nullable=True)
    joining_date = Column(Date, nullable=True)
    status = Column(String(20), default="OFFERED")  # OFFERED, ACCEPTED, DECLINED, REVOKED
    responded_at = Column(DateTime, nullable=True)
    is_placed = Column(Boolean, default=False)  # confirmed final placement
    placed_confirmed_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    application = relationship("PlacementApplication", back_populates="offer")
