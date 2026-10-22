from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth, students, lecturers, academic, timetable,
    attendance, integrations, assignments, exams,
    announcements, reports, settings, audit, contact,
    placements, users, notifications
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(students.router, prefix="/students", tags=["Students"])
api_router.include_router(lecturers.router, prefix="/lecturers", tags=["Lecturers"])
api_router.include_router(academic.router, prefix="/academic", tags=["Academic Administration"])
api_router.include_router(timetable.router, prefix="/timetable", tags=["Timetable"])
api_router.include_router(attendance.router, prefix="/attendance", tags=["Attendance Management"])
api_router.include_router(integrations.router, prefix="/integrations", tags=["Google Sheets & RFID"])
api_router.include_router(assignments.router, prefix="/assignments", tags=["Assignments"])
api_router.include_router(exams.router, prefix="/exams", tags=["Examinations & Marks"])
api_router.include_router(announcements.router, prefix="/announcements", tags=["Announcements"])
api_router.include_router(reports.router, prefix="/reports", tags=["Reports & Analytics"])
api_router.include_router(settings.router, prefix="/settings", tags=["System Settings"])
api_router.include_router(audit.router, prefix="/audit", tags=["Audit Logs"])
api_router.include_router(contact.router, prefix="/contact", tags=["Public Contact"])
api_router.include_router(placements.router, prefix="/placements", tags=["Placements"])
api_router.include_router(users.router, prefix="/users", tags=["Users & Roles"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
