from app.models.models import (
    Base, User, UserRole, Department, Course, AcademicYear, Semester, Section,
    Subject, StudentProfile, LecturerProfile, ClassSchedule,
    AttendanceSourceRecord, AttendanceInterval, AttendancePolicy, AttendanceStatus, SyncStatus,
    Assignment, AssignmentSubmission, Examination, ExamMark, ExamType,
    Announcement, Notification, AuditLog, ContactSubmission, IntegrationSyncLog
)
from app.models.extended import (
    SyncRun, SheetAttendanceRow, SheetRowRevision, TimetableBreak, ClassSession,
    SubjectEnrollment, SubjectAttendanceRule, AttendanceRecord, AttendanceCorrection, AttendanceDispute,
    Company, PlacementDrive, EligibilityException, PlacementApplication, SelectionStageHistory, PlacementOffer,
)
