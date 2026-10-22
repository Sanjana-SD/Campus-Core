"""Placement management workflows, role authorisation, and the original auth/contact tests."""
from datetime import datetime, timedelta

from app.models.models import Notification, StudentProfile
from conftest import TestingSessionLocal, token_for

OFF = token_for  # readability


def future(days=0, hours=0):
    return (datetime.now() + timedelta(days=days, hours=hours)).strftime("%Y-%m-%dT%H:%M")


def make_company(client, name="Example Systems Pvt Ltd"):
    r = client.post("/api/v1/placements/companies", headers=OFF("officer_t"),
                    json={"name": name, "industry": "Software", "website": "https://example.com",
                          "recruiter_name": "R. Recruiter", "recruiter_email": "hr@example.com"})
    assert r.status_code == 201, r.text
    return r.json()


def make_drive(client, company_id, **over):
    body = {"company_id": company_id, "job_title": "Graduate Engineer", "job_description": "Build software.",
            "job_type": "FULL_TIME", "work_mode": "HYBRID", "ctc_min": 6, "ctc_max": 8,
            "required_skills": ["Python", "SQL"], "graduation_years": [2028], "min_cgpa": 7.0,
            "max_active_backlogs": 0, "application_open_at": future(-1), "application_deadline": future(5),
            "drive_date": (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d"),
            "selection_process": ["Aptitude Test", "Technical Interview", "HR Interview"]}
    body.update(over)
    r = client.post("/api/v1/placements/drives", headers=OFF("officer_t"), json=body)
    assert r.status_code == 201, r.text
    return r.json()


def published_drive(client, **over):
    c = make_company(client, over.pop("company_name", "Example Systems Pvt Ltd"))
    d = make_drive(client, c["id"], **over)
    r = client.post(f"/api/v1/placements/drives/{d['id']}/publish", headers=OFF("officer_t"))
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------- authorisation

def test_only_placement_staff_manage_placements(client):
    for user in ("stud_a", "lect_t"):
        h = OFF(user)
        assert client.get("/api/v1/placements/companies", headers=h).status_code == 403
        assert client.post("/api/v1/placements/companies", headers=h, json={"name": "X Co"}).status_code == 403
        assert client.get("/api/v1/placements/dashboard", headers=h).status_code == 403
    assert client.get("/api/v1/placements/companies").status_code == 401
    assert client.get("/api/v1/placements/dashboard", headers=OFF("admin_t")).status_code == 200  # oversight
    # placement officers do not get attendance administration or student admin
    assert client.get("/api/v1/attendance/records", headers=OFF("officer_t")).status_code == 403
    assert client.post("/api/v1/attendance/recalculate", headers=OFF("officer_t"), json={}).status_code == 403
    assert client.get("/api/v1/students", headers=OFF("officer_t")).status_code == 403
    assert client.get("/api/v1/settings", headers=OFF("officer_t")).status_code == 403
    # students cannot use officer-only student endpoints and vice versa
    assert client.get("/api/v1/placements/student/overview", headers=OFF("officer_t")).status_code == 403


def test_company_duplicates_and_archive(client):
    c = make_company(client)
    r = client.post("/api/v1/placements/companies", headers=OFF("officer_t"), json={"name": "example systems ltd."})
    assert r.status_code == 409
    assert client.post("/api/v1/placements/companies", headers=OFF("officer_t"),
                       json={"name": "Bad URL Co", "website": "example.com"}).status_code == 422
    assert client.post(f"/api/v1/placements/companies/{c['id']}/archive", headers=OFF("officer_t")).json()["status"] == "ARCHIVED"
    r = client.post("/api/v1/placements/drives", headers=OFF("officer_t"),
                    json={"company_id": c["id"], "job_title": "Engineer"})
    assert r.status_code == 400  # archived company


def test_drive_validation_and_publish(client):
    c = make_company(client)
    bad = client.post("/api/v1/placements/drives", headers=OFF("officer_t"),
                      json={"company_id": c["id"], "job_title": "Eng", "application_open_at": future(3),
                            "application_deadline": future(1)})
    assert bad.status_code == 400
    d = make_drive(client, c["id"], job_description=None)
    assert client.post(f"/api/v1/placements/drives/{d['id']}/publish", headers=OFF("officer_t")).status_code == 400
    # draft drives are invisible to students
    assert client.get(f"/api/v1/placements/student/drives/{d['id']}", headers=OFF("stud_a")).status_code == 404
    assert client.post(f"/api/v1/placements/student/drives/{d['id']}/apply", headers=OFF("stud_a")).status_code == 404


# ---------------------------------------------------------------- student flow

def test_student_sees_published_drive_with_eligibility_and_applies_once(client):
    d = published_drive(client)
    lst = client.get("/api/v1/placements/student/drives", headers=OFF("stud_a")).json()
    assert lst["total"] == 1 and lst["items"][0]["eligibility"]["status"] == "ELIGIBLE"
    assert "recruiter_email" not in lst["items"][0]["company"]  # recruiter contact is officer-only
    r = client.post(f"/api/v1/placements/student/drives/{d['id']}/apply", headers=OFF("stud_a"))
    assert r.status_code == 201 and r.json()["overall_status"] == "Applied"
    assert client.post(f"/api/v1/placements/student/drives/{d['id']}/apply", headers=OFF("stud_a")).status_code == 409
    # publish notification + application notification were recorded
    db = TestingSessionLocal()
    sp = db.query(StudentProfile).filter_by(student_id_number="USN001").one()
    types = {n.type for n in db.query(Notification).filter(Notification.user_id == sp.user_id)}
    db.close()
    assert {"PLACEMENT_DRIVE", "PLACEMENT_APPLICATION"} <= types


def test_incomplete_information_is_not_ineligible_and_exception_allows(client):
    d = published_drive(client)
    detail = client.get(f"/api/v1/placements/student/drives/{d['id']}", headers=OFF("stud_b")).json()
    assert detail["eligibility"]["status"] == "INCOMPLETE_INFORMATION"  # CGPA not recorded
    assert any(c["outcome"] == "MISSING" for c in detail["eligibility"]["checks"])
    assert detail["can_apply"] is False
    assert client.post(f"/api/v1/placements/student/drives/{d['id']}/apply", headers=OFF("stud_b")).status_code == 400
    db = TestingSessionLocal()
    sid = db.query(StudentProfile).filter_by(student_id_number="USN002").one().id
    db.close()
    r = client.post(f"/api/v1/placements/drives/{d['id']}/exceptions", headers=OFF("officer_t"),
                    json={"student_id": sid, "reason": "CGPA verified offline 7.9"})
    assert r.status_code == 201
    r = client.post(f"/api/v1/placements/student/drives/{d['id']}/apply", headers=OFF("stud_b"))
    assert r.status_code == 201


def test_ineligible_and_closed_drives_reject_applications(client):
    d = published_drive(client, min_cgpa=9.0)
    assert client.post(f"/api/v1/placements/student/drives/{d['id']}/apply", headers=OFF("stud_a")).status_code == 400
    d2 = published_drive(client, company_name="Second Example Co", min_cgpa=None, application_deadline=future(0, 1))
    from app.models.extended import PlacementDrive
    db = TestingSessionLocal()
    drv = db.get(PlacementDrive, d2["id"])
    drv.application_deadline = datetime.now() - timedelta(hours=1)  # deadline passes
    db.commit()
    db.close()
    r = client.post(f"/api/v1/placements/student/drives/{d2['id']}/apply", headers=OFF("stud_a"))
    assert r.status_code == 400 and "not open" in r.json()["detail"].lower()


def test_selection_pipeline_rules_and_counts(client):
    d = published_drive(client, min_cgpa=None)
    d2 = published_drive(client, company_name="Second Example Co", min_cgpa=None)
    a1 = client.post(f"/api/v1/placements/student/drives/{d['id']}/apply", headers=OFF("stud_a")).json()
    a2 = client.post(f"/api/v1/placements/student/drives/{d2['id']}/apply", headers=OFF("stud_a")).json()
    h = OFF("officer_t")
    url = lambda a: f"/api/v1/placements/applications/{a['id']}"  # noqa: E731

    # attendance requires confirmed registration; selection requires attendance; offer requires selection
    assert client.patch(url(a1), headers=h, json={"attendance_status": "ATTENDED"}).status_code == 400
    assert client.patch(url(a1), headers=h, json={"result": "SELECTED"}).status_code == 400
    assert client.post(url(a1) + "/offer", headers=h, json={"offered_ctc": 7}).status_code == 400
    assert client.patch(url(a1), headers=h, json={"current_stage": "Not A Stage"}).status_code == 400

    for a in (a1, a2):
        assert client.patch(url(a), headers=h, json={"registration_status": "CONFIRMED"}).status_code == 200
        assert client.patch(url(a), headers=h, json={"attendance_status": "ATTENDED"}).status_code == 200
        assert client.patch(url(a), headers=h, json={"current_stage": "Technical Interview"}).status_code == 200
        assert client.patch(url(a), headers=h, json={"result": "SELECTED"}).status_code == 200
        assert client.post(url(a) + "/offer", headers=h, json={"offered_ctc": 7.5, "offer_date": "2026-10-20"}).status_code == 200

    # placed requires accepted
    assert client.post(url(a1) + "/offer", headers=h, json={"is_placed": True}).status_code == 400
    assert client.post(url(a1) + "/offer", headers=h, json={"status": "ACCEPTED"}).status_code == 200
    r = client.post(url(a1) + "/offer", headers=h, json={"is_placed": True})
    assert r.status_code == 200 and r.json()["overall_status"] == "Placed"
    assert client.post(url(a2) + "/offer", headers=h, json={"status": "DECLINED"}).status_code == 200

    # a student cannot change official outcomes
    assert client.patch(url(a1), headers=OFF("stud_a"), json={"result": "SELECTED"}).status_code == 403

    stats = client.get("/api/v1/placements/dashboard", headers=h).json()["cards"]
    assert stats["offers_received"] == 2            # total offers (one student, two companies)
    assert stats["unique_students_placed"] == 1     # distinct students
    assert stats["offers_declined"] == 1 and stats["offers_accepted"] == 1
    assert stats["students_selected"] == 1 and stats["total_applications"] == 2

    ov = client.get("/api/v1/placements/student/overview", headers=OFF("stud_a")).json()["counts"]
    assert ov["companies_selected"] == 2 and ov["offers_received"] == 2 and ov["confirmed_placements"] == 1
    # student B sees none of student A's applications
    assert client.get("/api/v1/placements/student/applications", headers=OFF("stud_b")).json() == []

    hist = client.get(f"/api/v1/placements/applications/{a1['id']}", headers=h).json()["history"]
    assert [x["field"] for x in hist][:2] == ["application", "registration"]
    rep = client.get("/api/v1/placements/reports/company", headers=h).json()
    assert rep["totals"]["offers"] == 2 and rep["totals"]["unique_students_placed"] == 1
    csv = client.get("/api/v1/placements/reports/company?format=csv", headers=h)
    assert csv.status_code == 200 and csv.text.startswith("Group,")


def test_notifications_read_state(client):
    published_drive(client, min_cgpa=None)
    h = OFF("stud_a")
    lst = client.get("/api/v1/notifications", headers=h).json()
    assert lst["unread"] >= 1
    nid = lst["items"][0]["id"]
    assert client.post(f"/api/v1/notifications/{nid}/read", headers=h).json()["is_read"] is True
    # cannot touch someone else's notification
    assert client.post(f"/api/v1/notifications/{nid}/read", headers=OFF("stud_b")).status_code == 404
    client.post("/api/v1/notifications/read-all", headers=h)
    assert client.get("/api/v1/notifications/unread-count", headers=h).json()["unread"] == 0


def test_admin_creates_placement_officer(client):
    r = client.post("/api/v1/users", headers=OFF("admin_t"),
                    json={"username": "po2", "email": "po2@test.edu", "full_name": "PO Two",
                          "password": "longpassword", "role": "PLACEMENT_OFFICER"})
    assert r.status_code == 201
    assert client.post("/api/v1/users", headers=OFF("admin_t"),
                       json={"username": "stu9", "email": "s9@test.edu", "full_name": "Some Student", "password": "longpassword",
                             "role": "STUDENT"}).status_code == 400
    assert client.post("/api/v1/users", headers=OFF("officer_t"),
                       json={"username": "x1", "email": "x1@test.edu", "full_name": "X", "password": "longpassword"}).status_code == 403
    login = client.post("/api/v1/auth/login", json={"username_or_email": "po2", "password": "longpassword"})
    assert login.status_code == 200 and login.json()["role"] == "PLACEMENT_OFFICER"


# ---------------------------------------------------------------- original auth / contact tests

def test_login_successful(client):
    r = client.post("/api/v1/auth/login", json={"username_or_email": "admin_t", "password": "password123"})
    assert r.status_code == 200 and r.json()["role"] == "ADMIN"


def test_login_invalid_password(client):
    r = client.post("/api/v1/auth/login", json={"username_or_email": "admin_t", "password": "wrong"})
    assert r.status_code == 401


def test_student_cannot_access_admin_settings(client):
    assert client.get("/api/v1/settings", headers=OFF("stud_a")).status_code == 403


def test_admin_can_access_settings(client):
    r = client.get("/api/v1/settings", headers=OFF("admin_t"))
    assert r.status_code == 200 and r.json()["institution_name"] == "Campus Core"


def test_timetable_requires_auth_and_students_see_only_own_section(client):
    assert client.get("/api/v1/timetable").status_code == 401
    mine = client.get("/api/v1/timetable?section_id=999", headers=OFF("stud_a")).json()
    assert mine and all(s["section_id"] == mine[0]["section_id"] for s in mine)


def test_public_contact_form(client):
    r = client.post("/api/v1/contact", json={"name": "Jane Visitor", "email": "jane@example.com",
                                             "subject": "Inquiry", "message": "Please contact us."})
    assert r.status_code == 201 and r.json()["status"] == "PENDING"
