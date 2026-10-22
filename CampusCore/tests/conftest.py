"""
Shared fixtures. Tests run against an isolated in-memory SQLite database and never touch
the real campuscore.db or the real Google spreadsheet (network calls are replaced with
deterministic fixtures). These fixtures are NOT evidence that the live sheet works; the
live connection is verified separately through /integrations/google-sheets/test.
"""
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["AUTO_MIGRATE"] = "false"
os.environ["INTEGRATION_WEBHOOK_SECRET"] = "test-webhook-secret"
os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"] = ""
os.environ["GOOGLE_SERVICE_ACCOUNT_INFO"] = ""
os.environ["GOOGLE_APPS_SCRIPT_WEBAPP_URL"] = ""
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from datetime import date, time  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.main import app  # noqa: E402
from app.core.database import Base, get_db  # noqa: E402
from app.core.security import create_access_token, get_password_hash  # noqa: E402
from app.models.models import (  # noqa: E402
    AcademicYear, AttendancePolicy, ClassSchedule, Course, Department, LecturerProfile, Section, Semester,
    StudentProfile, Subject, User, UserRole,
)

WEBHOOK_SECRET = "test-webhook-secret"

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def db():
    s = TestingSessionLocal()
    yield s
    s.close()


_PASSWORD_HASH = get_password_hash("password123")  # hashed once; bcrypt is deliberately slow


def _user(db, username, role, name):
    u = User(email=f"{username}@test.edu", username=username, hashed_password=_PASSWORD_HASH,
             full_name=name, role=role, is_active=True)
    db.add(u)
    db.flush()
    return u


@pytest.fixture(autouse=True)
def campus():
    """A small deterministic campus: CSE Sem 5 section A with two students, one lecturer
    teaching CS501 (Mon 09:00-10:00) and CS502 (Mon 10:00-11:00), plus a second lecturer."""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    admin = _user(db, "admin_t", UserRole.ADMIN, "Admin T")
    officer = _user(db, "officer_t", UserRole.PLACEMENT_OFFICER, "Officer T")
    dept = Department(code="CSE", name="Computer Science")
    ece = Department(code="ECE", name="Electronics")
    db.add_all([dept, ece])
    db.flush()
    course = Course(code="BTECH-CSE", name="B.Tech CSE", department_id=dept.id)
    db.add(course)
    db.flush()
    ay = AcademicYear(name="2026-2027", start_date=date(2026, 8, 1), end_date=date(2027, 5, 31), is_current=True)
    db.add(ay)
    db.flush()
    sem = Semester(course_id=course.id, number=5, academic_year_id=ay.id)
    db.add(sem)
    db.flush()
    sec = Section(semester_id=sem.id, name="A")
    sec_b = Section(semester_id=sem.id, name="B")
    db.add_all([sec, sec_b])
    db.flush()
    s1 = Subject(code="CS501", name="DBMS", department_id=dept.id, semester_id=sem.id)
    s2 = Subject(code="CS502", name="Networks", department_id=dept.id, semester_id=sem.id)
    db.add_all([s1, s2])
    db.flush()
    lu = _user(db, "lect_t", UserRole.LECTURER, "Lecturer T")
    lu2 = _user(db, "lect_other", UserRole.LECTURER, "Other Lecturer")
    lp = LecturerProfile(user_id=lu.id, employee_id="EMP1", department_id=dept.id, rfid_uid="STAFF01")
    lp2 = LecturerProfile(user_id=lu2.id, employee_id="EMP2", department_id=dept.id)
    db.add_all([lp, lp2])
    db.flush()
    st_users = [_user(db, "stud_a", UserRole.STUDENT, "Student A"), _user(db, "stud_b", UserRole.STUDENT, "Student B")]
    sp1 = StudentProfile(user_id=st_users[0].id, student_id_number="USN001", rfid_uid="00A1B2", department_id=dept.id,
                         course_id=course.id, semester_id=sem.id, section_id=sec.id, graduation_year=2028, cgpa=8.2,
                         active_backlogs=0, is_active=True)
    sp2 = StudentProfile(user_id=st_users[1].id, student_id_number="USN002", rfid_uid="C3D4E5", department_id=dept.id,
                         course_id=course.id, semester_id=sem.id, section_id=sec.id, graduation_year=2028, cgpa=None,
                         active_backlogs=0, is_active=True)
    db.add_all([sp1, sp2])
    db.flush()
    db.add_all([
        ClassSchedule(subject_id=s1.id, lecturer_id=lp.id, section_id=sec.id, day_of_week="Monday",
                      start_time=time(9, 0), end_time=time(10, 0), room_number="R1", is_active=True),
        ClassSchedule(subject_id=s2.id, lecturer_id=lp2.id, section_id=sec.id, day_of_week="Monday",
                      start_time=time(10, 0), end_time=time(11, 0), room_number="R2", is_active=True),
    ])
    db.add(AttendancePolicy(minimum_percentage=75.0, late_arrival_grace_minutes=10, college_timezone="Asia/Kolkata",
                            present_min_percent=75.0, partial_min_percent=25.0,
                            missing_exit_policy="PENDING_VERIFICATION", missing_entry_policy="PENDING_VERIFICATION",
                            count_late_as_attended=True, count_partial_as_attended=False, version=1))
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)


def token_for(username: str) -> dict:
    db = TestingSessionLocal()
    u = db.query(User).filter(User.username == username).first()
    t = create_access_token(subject=u.id, role=u.role.value)
    db.close()
    return {"Authorization": f"Bearer {t}"}
