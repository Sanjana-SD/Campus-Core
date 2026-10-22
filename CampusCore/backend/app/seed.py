import sys
import os
from datetime import date, time, datetime, timedelta

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal, engine, Base
from app.core.security import get_password_hash
from app.models.models import (
    User, UserRole, Department, Course, AcademicYear, Semester, Section, Subject,
    StudentProfile, LecturerProfile, ClassSchedule, AttendancePolicy,
    AttendanceSourceRecord, AttendanceInterval, AttendanceStatus, SyncStatus,
    Assignment, Examination, ExamMark, ExamType, Announcement, Notification
)

def seed_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    print("Checking if database already has users...")
    admin_user = db.query(User).filter(User.username == "admin").first()
    if admin_user:
        print("Database already seeded. Skipping initial seeding.")
        db.close()
        return

    print("Seeding initial data for Campus Core...")

    # 1. Attendance Policy
    policy = AttendancePolicy(
        minimum_percentage=75.0,
        late_arrival_grace_minutes=15,
        college_timezone="Asia/Kolkata",
        auto_reconcile_enabled=True,
        total_conducted_days=60
    )
    db.add(policy)

    # 2. Departments
    dept_cse = Department(code="CSE", name="Computer Science & Engineering", description="Department of Computer Science and Engineering")
    dept_ece = Department(code="ECE", name="Electronics & Communication Engineering", description="Department of Electronics and Communication")
    dept_me = Department(code="ME", name="Mechanical Engineering", description="Department of Mechanical Engineering")
    db.add_all([dept_cse, dept_ece, dept_me])
    db.flush()

    # 3. Courses
    course_cse = Course(code="BTECH-CSE", name="Bachelor of Technology in CSE", department_id=dept_cse.id, duration_years=4, total_semesters=8)
    course_ece = Course(code="BTECH-ECE", name="Bachelor of Technology in ECE", department_id=dept_ece.id, duration_years=4, total_semesters=8)
    db.add_all([course_cse, course_ece])
    db.flush()

    # 4. Academic Year
    ay = AcademicYear(name="2026-2027", start_date=date(2026, 8, 1), end_date=date(2027, 5, 31), is_current=True)
    db.add(ay)
    db.flush()

    # 5. Semesters
    sem5_cse = Semester(course_id=course_cse.id, number=5, academic_year_id=ay.id, is_current=True)
    sem3_ece = Semester(course_id=course_ece.id, number=3, academic_year_id=ay.id, is_current=True)
    db.add_all([sem5_cse, sem3_ece])
    db.flush()

    # 6. Sections
    sec_a = Section(semester_id=sem5_cse.id, name="A")
    sec_b = Section(semester_id=sem5_cse.id, name="B")
    db.add_all([sec_a, sec_b])
    db.flush()

    # 7. Subjects
    subj_dbms = Subject(code="CS501", name="Database Management Systems", department_id=dept_cse.id, semester_id=sem5_cse.id, credits=4, total_hours=50)
    subj_cn = Subject(code="CS502", name="Computer Networks", department_id=dept_cse.id, semester_id=sem5_cse.id, credits=4, total_hours=48)
    subj_os = Subject(code="CS503", name="Operating Systems", department_id=dept_cse.id, semester_id=sem5_cse.id, credits=3, total_hours=40)
    db.add_all([subj_dbms, subj_cn, subj_os])
    db.flush()

    # 8. Admin User
    admin = User(
        email="admin@campuscore.edu",
        username="admin",
        hashed_password=get_password_hash("admin123"),
        full_name="Chief Administrator",
        role=UserRole.ADMIN,
        phone="+91 98765 43210"
    )
    db.add(admin)
    db.flush()

    # 9. Lecturers
    user_prof1 = User(
        email="alan.turing@campuscore.edu",
        username="turing",
        hashed_password=get_password_hash("lecturer123"),
        full_name="Dr. Alan Turing",
        role=UserRole.LECTURER,
        phone="+91 98765 00001"
    )
    user_prof2 = User(
        email="ada.lovelace@campuscore.edu",
        username="lovelace",
        hashed_password=get_password_hash("lecturer123"),
        full_name="Dr. Ada Lovelace",
        role=UserRole.LECTURER,
        phone="+91 98765 00002"
    )
    db.add_all([user_prof1, user_prof2])
    db.flush()

    lect_1 = LecturerProfile(
        user_id=user_prof1.id,
        employee_id="EMP-CSE-001",
        department_id=dept_cse.id,
        designation="Professor & HOD",
        qualification="Ph.D. in Computer Science",
        specialization="Algorithms & Cryptography"
    )
    lect_2 = LecturerProfile(
        user_id=user_prof2.id,
        employee_id="EMP-CSE-002",
        department_id=dept_cse.id,
        designation="Associate Professor",
        qualification="Ph.D. in Computer Engineering",
        specialization="Database Systems & Big Data"
    )
    db.add_all([lect_1, lect_2])
    db.flush()

    # 10. Students (Registered with RFID UIDs)
    # Rahul Sharma has RFID UID: A1B2C3D4
    user_stud1 = User(
        email="rahul.sharma@campuscore.edu",
        username="rahul",
        hashed_password=get_password_hash("student123"),
        full_name="Rahul Sharma",
        role=UserRole.STUDENT,
        phone="+91 91234 56780"
    )
    # Priya Patel has RFID UID: E5F6G7H8
    user_stud2 = User(
        email="priya.patel@campuscore.edu",
        username="priya",
        hashed_password=get_password_hash("student123"),
        full_name="Priya Patel",
        role=UserRole.STUDENT,
        phone="+91 91234 56781"
    )
    # Sneha Rao has RFID UID: 99AA88BB
    user_stud3 = User(
        email="sneha.rao@campuscore.edu",
        username="sneha",
        hashed_password=get_password_hash("student123"),
        full_name="Sneha Rao",
        role=UserRole.STUDENT,
        phone="+91 91234 56782"
    )
    db.add_all([user_stud1, user_stud2, user_stud3])
    db.flush()

    stud_1 = StudentProfile(
        user_id=user_stud1.id,
        student_id_number="1CC22CS001",
        rfid_uid="A1B2C3D4",
        department_id=dept_cse.id,
        course_id=course_cse.id,
        semester_id=sem5_cse.id,
        section_id=sec_a.id,
        parent_name="Vikas Sharma",
        parent_phone="+91 94444 11111",
        address="12, MG Road, Tech Campus Residency"
    )
    stud_2 = StudentProfile(
        user_id=user_stud2.id,
        student_id_number="1CC22CS002",
        rfid_uid="E5F6G7H8",
        department_id=dept_cse.id,
        course_id=course_cse.id,
        semester_id=sem5_cse.id,
        section_id=sec_a.id,
        parent_name="Kiran Patel",
        parent_phone="+91 94444 22222",
        address="88, Lakeview Enclave"
    )
    stud_3 = StudentProfile(
        user_id=user_stud3.id,
        student_id_number="1CC22CS003",
        rfid_uid="99AA88BB",
        department_id=dept_cse.id,
        course_id=course_cse.id,
        semester_id=sem5_cse.id,
        section_id=sec_a.id,
        parent_name="Satish Rao",
        parent_phone="+91 94444 33333",
        address="45, Silicon Orchard"
    )
    db.add_all([stud_1, stud_2, stud_3])
    db.flush()

    # 11. Timetable / Class Schedules
    schedules = [
        ClassSchedule(subject_id=subj_dbms.id, lecturer_id=lect_2.id, section_id=sec_a.id, day_of_week="Monday", start_time=time(9, 0), end_time=time(10, 0), room_number="LH-101", academic_year_id=ay.id),
        ClassSchedule(subject_id=subj_cn.id, lecturer_id=lect_1.id, section_id=sec_a.id, day_of_week="Monday", start_time=time(10, 15), end_time=time(11, 15), room_number="LH-101", academic_year_id=ay.id),
        ClassSchedule(subject_id=subj_os.id, lecturer_id=lect_2.id, section_id=sec_a.id, day_of_week="Tuesday", start_time=time(9, 0), end_time=time(10, 0), room_number="LH-102", academic_year_id=ay.id),
        ClassSchedule(subject_id=subj_dbms.id, lecturer_id=lect_2.id, section_id=sec_a.id, day_of_week="Wednesday", start_time=time(11, 30), end_time=time(12, 30), room_number="LH-101", academic_year_id=ay.id),
        ClassSchedule(subject_id=subj_cn.id, lecturer_id=lect_1.id, section_id=sec_a.id, day_of_week="Thursday", start_time=time(14, 0), end_time=time(15, 0), room_number="LAB-3", academic_year_id=ay.id)
    ]
    db.add_all(schedules)

    # 12. RFID attendance is NOT seeded. Attendance evidence comes only from the real
    #     Google Form / RFID spreadsheet through the Google Sheets integration.
    today = date.today()

    # 13. Assignments
    asg1 = Assignment(
        title="SQL Query Optimization and Normalization",
        description="Design a normalized relational schema for a healthcare clinic and formulate optimized indexed queries.",
        subject_id=subj_dbms.id,
        lecturer_id=lect_2.id,
        section_id=sec_a.id,
        due_date=datetime.utcnow() + timedelta(days=7),
        max_marks=50.0,
        allowed_file_types="pdf,sql,txt"
    )
    asg2 = Assignment(
        title="TCP Socket Programming Lab Report",
        description="Implement a multi-threaded client-server echo application in C/Python and measure packet round-trip times.",
        subject_id=subj_cn.id,
        lecturer_id=lect_1.id,
        section_id=sec_a.id,
        due_date=datetime.utcnow() + timedelta(days=12),
        max_marks=100.0,
        allowed_file_types="pdf,zip"
    )
    db.add_all([asg1, asg2])

    # 14. Examination & Results
    exam1 = Examination(
        name="Internal Assessment 1 - Autumn 2026",
        exam_type=ExamType.INTERNAL_1,
        subject_id=subj_dbms.id,
        semester_id=sem5_cse.id,
        exam_date=today - timedelta(days=5),
        start_time=time(10, 0),
        end_time=time(11, 30),
        max_marks=50.0,
        is_published=True
    )
    db.add(exam1)
    db.flush()

    mark1 = ExamMark(examination_id=exam1.id, student_id=stud_1.id, marks_obtained=46.5, remarks="Outstanding grasp of relational algebra")
    mark2 = ExamMark(examination_id=exam1.id, student_id=stud_2.id, marks_obtained=42.0, remarks="Good problem formulation")
    mark3 = ExamMark(examination_id=exam1.id, student_id=stud_3.id, marks_obtained=38.5, remarks="Needs practice with B+ trees")
    db.add_all([mark1, mark2, mark3])

    # 15. Announcements
    ann1 = Announcement(
        title="Mid-Semester Examination Schedule Published",
        content="The official timetable for Internal Assessment 1 has been published on Campus Core. Please review your subject-wise slots under Examinations.",
        target_role="ALL",
        department_id=dept_cse.id,
        author_id=admin.id,
        priority="NORMAL"
    )
    ann2 = Announcement(
        title="RFID Smart Card Re-Validation Reminder",
        content="All students whose RFID cards show unmatched or incomplete interval flags should verify their card UID at the Administration Office Counter 4.",
        target_role="STUDENT",
        department_id=dept_cse.id,
        author_id=admin.id,
        priority="URGENT"
    )
    db.add_all([ann1, ann2])

    # 16. Notifications
    notif2 = Notification(
        user_id=user_stud1.id,
        title="New Assignment: SQL Optimization",
        message="Dr. Ada Lovelace posted a new assignment due in 7 days.",
        type="ASSIGNMENT",
        is_read=False
    )
    db.add(notif2)

    db.commit()
    db.close()
    print("Database seeding completed successfully!")

def ensure_placement_officer():
    """Idempotently create the demo Placement Officer account (safe on existing databases)."""
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "placement").first():
            db.add(User(
                email="placement.officer@campuscore.edu",
                username="placement",
                hashed_password=get_password_hash("placement123"),
                full_name="Placement Officer",
                role=UserRole.PLACEMENT_OFFICER,
            ))
            db.commit()
            print("Created Placement Officer account: placement / placement123")
        else:
            print("Placement Officer account already exists.")
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
    ensure_placement_officer()
