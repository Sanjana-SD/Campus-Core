"""
Google Sheets synchronisation + timetable attendance through the real API.
The worksheet read is replaced by a deterministic fixture (FakeSheet); this proves the
pipeline logic, not connectivity to the live spreadsheet.
"""
from datetime import date

import pytest

from app.services import sheet_sync_service
from app.services.google_sheets_service import FetchResult
from app.models.extended import AttendanceRecord, ClassSession, SheetAttendanceRow, SheetRowRevision
from conftest import WEBHOOK_SECRET, TestingSessionLocal, token_for

HEADERS = ["UID", "Name", "Role", "Date", "Entry Time", "Exit Time", "Status"]
MON1 = "2026-10-12"  # Monday
MON2 = "2026-10-19"  # Monday


class FakeSheet:
    def __init__(self, rows, headers=HEADERS, ok=True, code=None, message=None):
        self.rows, self.headers, self.ok, self.code, self.message = rows, headers, ok, code, message

    def __call__(self, *a, **k):
        if not self.ok:
            r = FetchResult(ok=False)
            return r.fail("SERVICE_ACCOUNT", self.code, self.message)
        return FetchResult(ok=True, transport="SERVICE_ACCOUNT", worksheet_title="Form Responses 1",
                           headers=self.headers, rows=[(i + 2, list(r)) for i, r in enumerate(self.rows)])


@pytest.fixture()
def sheet(monkeypatch):
    fake = FakeSheet([])
    monkeypatch.setattr(sheet_sync_service, "fetch_worksheet", fake)
    return fake


def records_on(db, day: str):
    d = date.fromisoformat(day)
    return {(r.student.student_id_number, r.subject.code): r for r in db.query(AttendanceRecord) if r.date == d}


def sync(client):
    r = client.post("/api/v1/integrations/google-sheets/sync", headers=token_for("admin_t"))
    assert r.status_code == 200, r.text
    return r.json()


BASE_ROWS = [
    ["00A1B2", "Student A", "STUDENT", MON1, "08:55:00", "10:00:00", "COMPLETED"],   # CS501 present
    ["00A1B2", "Student A", "STUDENT", MON1, "10:20:00", "11:00:00", "COMPLETED"],   # CS502 40/60 -> partial
    ["C3D4E5", "Student B", "STUDENT", MON1, "09:12:00", "", "PRESENT"],             # missing exit -> pending
    ["STAFF01", "Lecturer T", "LECTURER", MON1, "08:30:00", "16:00:00", "COMPLETED"],  # staff, not student
    ["FFFF99", "Visitor", "Visitor", MON1, "11:00:00", "11:30:00", "COMPLETED"],    # unmatched
    ["", "", "", "garbage", "", "", ""],                                               # invalid
]


def test_sync_imports_real_rows_preserves_source_and_calculates(client, sheet):
    sheet.rows = [list(r) for r in BASE_ROWS]
    out = sync(client)
    run = out["run"]
    assert run["status"] == "PARTIAL"  # one invalid row
    assert (run["imported"], run["rejected"], run["rows_read"]) == (6, 1, 6)
    assert run["column_mapping"]["uid"] == "UID" and run["worksheet_title"] == "Form Responses 1"

    rows = client.get("/api/v1/integrations/google-sheets/rows?limit=100", headers=token_for("admin_t")).json()
    assert rows["total"] == 6
    a = [x for x in rows["items"] if x["uid"] == "00A1B2"]
    assert len(a) == 2 and all(x["student_usn"] == "USN001" for x in a)  # leading zeros kept, exact match
    assert a[0]["original_status"] == "COMPLETED"  # original source status kept separately
    staff = [x for x in rows["items"] if x["uid"] == "STAFF01"][0]
    assert staff["match_status"] == "STAFF" and staff["student_id"] is None

    db = TestingSessionLocal()
    recs = records_on(db, MON1)
    assert recs[("USN001", "CS501")].final_status == "PRESENT"
    assert recs[("USN001", "CS502")].final_status == "PARTIAL"
    assert recs[("USN001", "CS502")].attended_minutes == 40
    assert recs[("USN002", "CS501")].final_status == "PENDING_VERIFICATION"
    assert recs[("USN002", "CS502")].final_status == "PENDING_VERIFICATION"
    db.close()


def test_repeat_sync_is_idempotent_and_updates_changed_rows(client, sheet):
    sheet.rows = [list(r) for r in BASE_ROWS]
    sync(client)
    again = sync(client)["run"]
    assert (again["imported"], again["updated"], again["unchanged"]) == (0, 0, 6)
    db = TestingSessionLocal()
    assert db.query(SheetAttendanceRow).count() == 6
    n_records = db.query(AttendanceRecord).count()
    db.close()

    # Student B's exit is filled in later (the Apps Script updates the same row) and a new
    # row is appended above-shifting nothing: identity must be preserved.
    rows = [list(r) for r in BASE_ROWS]
    rows[2] = ["C3D4E5", "Student B", "STUDENT", MON1, "09:12:00", "10:00:00", "COMPLETED"]
    sheet.rows = rows
    third = sync(client)["run"]
    assert (third["imported"], third["updated"]) == (0, 1)
    db = TestingSessionLocal()
    assert db.query(SheetAttendanceRow).count() == 6
    rev = db.query(SheetRowRevision).filter(SheetRowRevision.change_type == "UPDATED").one()
    assert rev.old_values["exit_time"] in (None, "") and rev.new_values["exit_time"] == "10:00:00"
    statuses = {k: r.final_status for k, r in records_on(db, MON1).items()}
    assert statuses[("USN002", "CS501")] == "LATE"      # 09:12 > 09:00 + 10 min grace, 48/60 = 80%
    assert statuses[("USN002", "CS502")] == "ABSENT"    # left at 10:00
    assert db.query(AttendanceRecord).count() == n_records  # no duplicate records
    db.close()


def test_rows_removed_from_sheet_are_flagged_not_deleted(client, sheet):
    sheet.rows = [list(r) for r in BASE_ROWS]
    sync(client)
    sheet.rows = [list(r) for r in BASE_ROWS if r[0] != "00A1B2" or r[4] != "10:20:00"]
    run = sync(client)["run"]
    assert run["removed"] == 1
    db = TestingSessionLocal()
    removed = db.query(SheetAttendanceRow).filter(SheetAttendanceRow.missing_from_source.is_(True)).one()
    assert removed.raw_entry_time == "10:20:00"
    cs502 = records_on(db, MON1)[("USN001", "CS502")]
    assert cs502.final_status == "ABSENT" and cs502.attended_minutes == 0
    db.close()


def test_unmatched_review_and_uid_mapping(client, sheet):
    sheet.rows = [["00a1b2 ", "Student A", "STUDENT", MON1, "08:55", "10:00", "COMPLETED"],
                  ["0A1B2", "Student A", "STUDENT", MON2, "08:55", "10:00", "COMPLETED"]]  # leading zero lost
    sync(client)
    un = client.get("/api/v1/integrations/unmatched", headers=token_for("admin_t")).json()
    assert len(un) == 1 and un[0]["uid"] == "0A1B2"
    assert any("leading zeros" in n for n in un[0]["notes"])  # hint, but never auto-matched

    db = TestingSessionLocal()
    sid = [r for r in db.query(SheetAttendanceRow) if r.uid == "00A1B2"][0].student_id
    db.close()
    # A UID already owned by someone else cannot be assigned to a second person
    r = client.post("/api/v1/integrations/uid-mappings", headers=token_for("admin_t"),
                    json={"uid": "C3D4E5", "student_id": sid, "reason": "test", "replace_existing": True})
    assert r.status_code == 409
    # Replacing the student's own UID requires explicit confirmation
    r = client.post("/api/v1/integrations/uid-mappings", headers=token_for("admin_t"),
                    json={"uid": "0A1B2", "student_id": sid, "reason": "card re-issued"})
    assert r.status_code == 409
    r = client.post("/api/v1/integrations/uid-mappings", headers=token_for("admin_t"),
                    json={"uid": "0A1B2", "student_id": sid, "reason": "card re-issued", "replace_existing": True})
    assert r.status_code == 200, r.text
    assert client.get("/api/v1/integrations/unmatched", headers=token_for("admin_t")).json()[0]["uid"] == "00A1B2"
    # Ignore a UID: it leaves the review queue
    client.post("/api/v1/integrations/uid-ignore", headers=token_for("admin_t"),
                json={"uid": "00A1B2", "ignore": True, "reason": "old card"})
    assert client.get("/api/v1/integrations/unmatched", headers=token_for("admin_t")).json() == []


def test_failed_sync_reports_clear_error_and_keeps_data(client, sheet):
    sheet.rows = [list(r) for r in BASE_ROWS]
    sync(client)
    sheet.ok, sheet.code, sheet.message = False, "PERMISSION_DENIED", "Share the sheet with sa@x"
    out = sync(client)
    assert out["success"] is False and out["error_code"] == "PERMISSION_DENIED"
    status = client.get("/api/v1/integrations/google-sheets/status", headers=token_for("admin_t")).json()
    assert status["connection_status"] == "ERROR"
    assert status["last_error"]["error_code"] == "PERMISSION_DENIED"
    assert status["last_successful_sync"]["imported"] == 6  # last-known good state remains visible
    assert status["counts"]["records_imported"] == 6
    retry = client.post(f"/api/v1/integrations/google-sheets/sync/{out['run']['id']}/retry", headers=token_for("admin_t"))
    assert retry.json()["run"]["retry_of_id"] == out["run"]["id"]


def test_missing_required_headers_fail(client, sheet):
    sheet.headers = ["Name", "Entry Time"]
    sheet.rows = [["A", "09:00"]]
    out = sync(client)
    assert out["error_code"] == "HEADERS_MISSING"


def test_not_configured_message_without_credentials(client, monkeypatch):
    # No fixture patching: the real reader runs with no credentials; the public probe is stubbed.
    from app.services import google_sheets_service as gs
    monkeypatch.setattr(gs, "_fetch_via_public_csv",
                        lambda res, sid, gid: res.fail("PUBLIC_CSV", "SHEET_PRIVATE", "HTTP 401"))
    out = sync(client)
    assert out["error_code"] == "NOT_CONFIGURED" and "GOOGLE_SERVICE_ACCOUNT_JSON" in out["message"]


def test_webhook_push_uses_same_identity_as_pull(client, sheet):
    assert client.post("/api/v1/integrations/google-sheets/attendance", json={"records": []}).status_code == 401
    rec = {"UID": "00A1B2", "Name": "Student A", "Role": "STUDENT", "Date": MON1, "Entry Time": "08:55:00",
           "Exit Time": "", "Status": "PRESENT", "source_row_id": "row_2_00A1B2"}
    r = client.post("/api/v1/integrations/google-sheets/attendance", json={"records": [rec]},
                    headers={"X-Integration-Secret": WEBHOOK_SECRET})
    assert r.status_code == 200 and r.json()["summary"]["imported"] == 1
    rec["Exit Time"], rec["Status"] = "10:00:00", "COMPLETED"
    r = client.post("/api/v1/integrations/google-sheets/attendance", json={"records": [rec]},
                    headers={"X-Integration-Secret": WEBHOOK_SECRET})
    assert r.json()["summary"]["updated"] == 1
    sheet.rows = [["00A1B2", "Student A", "STUDENT", MON1, "08:55:00", "10:00:00", "COMPLETED"]]
    run = sync(client)["run"]
    assert (run["imported"], run["unchanged"]) == (0, 1)  # pull recognises the pushed row
    db = TestingSessionLocal()
    assert db.query(SheetAttendanceRow).count() == 1
    db.close()


# ---------------------------------------------------------------- attendance API & permissions

def seed_two_weeks(client, sheet):
    sheet.rows = [
        ["00A1B2", "Student A", "STUDENT", MON1, "08:55:00", "11:00:00", "COMPLETED"],
        ["00A1B2", "Student A", "STUDENT", MON2, "09:20:00", "10:00:00", "COMPLETED"],
        ["C3D4E5", "Student B", "STUDENT", MON1, "09:00:00", "10:00:00", "COMPLETED"],
    ]
    sync(client)


def test_student_my_attendance_subject_wise_and_overall(client, sheet):
    seed_two_weeks(client, sheet)
    r = client.get("/api/v1/attendance/my", headers=token_for("stud_a"))
    assert r.status_code == 200
    d = r.json()
    subj = {s["subject_code"]: s for s in d["subjects"]}
    # CS501: wk1 present, wk2 09:20-10:00 = 40/60 = 66.7% -> partial (not counted)
    assert subj["CS501"]["classes_held"] == 2 and subj["CS501"]["present"] == 1 and subj["CS501"]["partial"] == 1
    assert subj["CS501"]["percentage"] == 50.0
    # CS502: wk1 present (till 11:00), wk2 absent
    assert subj["CS502"]["present"] == 1 and subj["CS502"]["absent"] == 1
    assert d["overall"]["classes_held"] == 4 and d["overall"]["attended"] == 2 and d["overall"]["percentage"] == 50.0
    assert any(a["type"] == "BELOW_THRESHOLD" for a in d["alerts"])
    assert all(rec["student_id"] == d["student"]["id"] for rec in d["records"])


def test_cancelled_class_excluded_from_percentage(client, sheet):
    seed_two_weeks(client, sheet)
    db = TestingSessionLocal()
    sess = [s for s in db.query(ClassSession) if s.date == date(2026, 10, 19) and s.subject.code == "CS502"][0]
    db.close()
    r = client.post(f"/api/v1/attendance/sessions/{sess.id}/cancel", headers=token_for("admin_t"), json={"reason": "Holiday"})
    assert r.status_code == 200
    d = client.get("/api/v1/attendance/my", headers=token_for("stud_a")).json()
    cs502 = [s for s in d["subjects"] if s["subject_code"] == "CS502"][0]
    assert cs502["cancelled"] == 1 and cs502["classes_held"] == 1 and cs502["percentage"] == 100.0


def test_manual_correction_survives_recalculation_and_is_audited(client, sheet):
    seed_two_weeks(client, sheet)
    db = TestingSessionLocal()
    rec = [r for r in db.query(AttendanceRecord) if r.student.student_id_number == "USN001"
           and r.subject.code == "CS501" and r.date == date(2026, 10, 19)][0]
    rid = rec.id
    db.close()
    # Lecturer of CS501 may correct; the CS502 lecturer may not.
    assert client.post(f"/api/v1/attendance/records/{rid}/correct", headers=token_for("lect_other"),
                       json={"status": "PRESENT", "reason": "x" * 5}).status_code == 403
    r = client.post(f"/api/v1/attendance/records/{rid}/correct", headers=token_for("lect_t"),
                    json={"status": "EXCUSED", "reason": "Medical certificate"})
    assert r.status_code == 200 and r.json()["final_status"] == "EXCUSED"
    client.post("/api/v1/attendance/recalculate", headers=token_for("admin_t"), json={})
    detail = client.get(f"/api/v1/attendance/records/{rid}", headers=token_for("admin_t")).json()
    assert detail["record"]["final_status"] == "EXCUSED" and detail["record"]["computed_status"] == "PARTIAL"
    assert detail["corrections"][0]["new_status"] == "EXCUSED"
    # source rows are traceable from the record
    assert detail["source_rows"][0]["entry_time"] == "09:20:00"


def test_policy_change_recalculates(client, sheet):
    seed_two_weeks(client, sheet)
    r = client.put("/api/v1/attendance/policy", headers=token_for("admin_t"), json={"present_min_percent": 60})
    assert r.status_code == 200 and r.json()["version"] == 2
    d = client.get("/api/v1/attendance/my", headers=token_for("stud_a")).json()
    cs501 = [s for s in d["subjects"] if s["subject_code"] == "CS501"][0]
    assert cs501["late"] == 1  # 66.7% now >= 60%, first presence 09:20 > grace
    assert client.put("/api/v1/attendance/policy", headers=token_for("stud_a"), json={}).status_code == 403


def test_enrollment_exception_excludes_subject(client, sheet):
    seed_two_weeks(client, sheet)
    db = TestingSessionLocal()
    from app.models.models import StudentProfile, Subject
    sid = db.query(StudentProfile).filter_by(student_id_number="USN001").one().id
    subj = db.query(Subject).filter_by(code="CS502").one().id
    db.close()
    r = client.post("/api/v1/attendance/enrollment-exceptions", headers=token_for("admin_t"),
                    json={"student_id": sid, "subject_id": subj})
    assert r.status_code == 200
    d = client.get("/api/v1/attendance/my", headers=token_for("stud_a")).json()
    assert {s["subject_code"] for s in d["subjects"]} == {"CS501"}


def test_timetable_change_keeps_history(client, sheet):
    seed_two_weeks(client, sheet)
    sched = client.get("/api/v1/timetable", headers=token_for("admin_t")).json()
    cs501 = [s for s in sched if s["subject"]["code"] == "CS501"][0]
    body = {"subject_id": cs501["subject_id"], "lecturer_id": cs501["lecturer_id"], "section_id": cs501["section_id"],
            "day_of_week": "Monday", "start_time": "08:00", "end_time": "09:00", "room_number": "R1"}
    r = client.put(f"/api/v1/timetable/{cs501['id']}", headers=token_for("admin_t"), json=body)
    assert r.status_code == 200, r.text
    assert "Versioned" in r.json()["message"]
    db = TestingSessionLocal()
    old = [s for s in db.query(ClassSession) if s.date == date(2026, 10, 12) and s.subject.code == "CS501"]
    assert old and old[0].start_time.hour == 9  # historical session keeps its original time
    db.close()


def test_timetable_conflicts_rejected(client):
    sched = client.get("/api/v1/timetable", headers=token_for("admin_t")).json()
    s = sched[0]
    body = {"subject_id": s["subject_id"], "lecturer_id": s["lecturer_id"], "section_id": s["section_id"],
            "day_of_week": "Monday", "start_time": "09:30", "end_time": "10:30", "room_number": "R9"}
    r = client.post("/api/v1/timetable", headers=token_for("admin_t"), json=body)
    assert r.status_code == 400 and "conflict" in r.json()["detail"].lower()
    assert client.post("/api/v1/timetable", headers=token_for("lect_t"), json=body).status_code == 403


def test_attendance_data_isolation(client, sheet):
    seed_two_weeks(client, sheet)
    db = TestingSessionLocal()
    other = [r for r in db.query(AttendanceRecord) if r.student.student_id_number == "USN002"][0].id
    db.close()
    assert client.get(f"/api/v1/attendance/records/{other}", headers=token_for("stud_a")).status_code == 403
    assert client.get("/api/v1/attendance/records", headers=token_for("stud_a")).status_code == 403
    assert client.get("/api/v1/integrations/google-sheets/rows", headers=token_for("stud_a")).status_code == 403
    assert client.get("/api/v1/integrations/google-sheets/rows", headers=token_for("officer_t")).status_code == 403
    assert client.get("/api/v1/attendance/records", headers=token_for("officer_t")).status_code == 403
    assert client.post(f"/api/v1/attendance/records/{other}/dispute", headers=token_for("stud_a"),
                       json={"message": "not mine"}).status_code == 404
    # lecturer only sees records of classes they teach
    recs = client.get("/api/v1/attendance/records?limit=500", headers=token_for("lect_t")).json()["items"]
    assert recs and all(r["subject_code"] == "CS501" for r in recs)


def test_student_dispute_flow(client, sheet):
    seed_two_weeks(client, sheet)
    d = client.get("/api/v1/attendance/my", headers=token_for("stud_a")).json()
    rec = [r for r in d["records"] if r["subject_code"] == "CS501" and r["final_status"] == "PARTIAL"][0]
    r = client.post(f"/api/v1/attendance/records/{rec['id']}/dispute", headers=token_for("stud_a"),
                    json={"message": "I was in class from 09:05"})
    assert r.status_code == 200
    disputes = client.get("/api/v1/attendance/disputes", headers=token_for("lect_t")).json()
    assert len(disputes) == 1
    r = client.post(f"/api/v1/attendance/disputes/{disputes[0]['id']}/resolve", headers=token_for("lect_t"),
                    json={"status": "REJECTED", "note": "Scan shows 09:20"})
    assert r.status_code == 200 and r.json()["status"] == "REJECTED"
