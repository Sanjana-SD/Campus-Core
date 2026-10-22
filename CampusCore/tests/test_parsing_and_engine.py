"""Pure-function tests: sheet parsing and the per-class attendance evaluation."""
from datetime import date, datetime, time

from app.services.sheet_parsing import (
    assign_source_keys, classify_role, map_headers, normalize_uid, parse_date, parse_row, parse_time,
)
from app.services.attendance_engine import (
    ABSENT, LATE, PARTIAL, PENDING, PRESENT, evaluate_session, union_minutes,
)

HEADERS = ["UID", "Name", "Role", "Date", "Entry Time", "Exit Time", "Status"]
RULES = {"grace": 10, "present_min_percent": 75.0, "partial_min_percent": 25.0, "min_required_minutes": None,
         "minimum_percentage": 75.0, "missing_exit_policy": PENDING, "missing_entry_policy": PENDING}
DAY = date(2026, 10, 12)
LATER = datetime(2026, 10, 22, 12, 0)


def ev(*pairs):
    return [{"row_id": i + 1, "entry": a, "exit": b} for i, (a, b) in enumerate(pairs)]


def T(h, m=0, s=0):
    return time(h, m, s)


# ---------------------------------------------------------------- parsing

def test_header_mapping_exact_and_variants():
    m, missing, unmapped = map_headers(HEADERS)
    assert missing == [] and m["uid"] == 0 and m["exit_time"] == 5 and m["status"] == 6
    m2, missing2, unmapped2 = map_headers(["Timestamp", "RFID UID", "Full Name", "Role", "Date", "In Time", "Out Time"])
    assert missing2 == [] and m2["uid"] == 1 and m2["entry_time"] == 5 and m2["exit_time"] == 6
    assert unmapped2 == ["Timestamp"]
    _, missing3, _ = map_headers(["Name", "Entry Time"])
    assert set(missing3) == {"uid", "date"}


def test_uid_preserved_as_string_with_leading_zeros():
    assert normalize_uid(" 00a1b2 ") == "00A1B2"
    assert normalize_uid("0x00FF") == "00FF"
    assert normalize_uid("0012 34") == "001234"
    assert normalize_uid("") is None


def test_date_formats_and_ambiguity_order():
    assert parse_date("2026-10-12")[0] == date(2026, 10, 12)
    assert parse_date("12/10/2026", "DMY")[0] == date(2026, 10, 12)
    assert parse_date("10/12/2026", "MDY")[0] == date(2026, 10, 12)
    assert parse_date("12 Oct 2026")[0] == date(2026, 10, 12)
    assert parse_date("2026-10-12 09:05:00")[0] == date(2026, 10, 12)
    assert parse_date("not a date")[0] is None and parse_date("not a date")[1]
    assert parse_date("")[0] is None


def test_time_formats():
    assert parse_time("09:05:07")[0] == T(9, 5, 7)
    assert parse_time("9:05 AM")[0] == T(9, 5)
    assert parse_time("1:30 p.m.")[0] == T(13, 30)
    assert parse_time("2026-10-12 16:45:00")[0] == T(16, 45)
    assert parse_time("")[0] is None and parse_time("")[1] is None  # empty is not an error
    assert parse_time("garbage")[1]


def test_role_classification():
    assert classify_role("STUDENT") == "STUDENT"
    assert classify_role("Lecturer") == "LECTURER"
    assert classify_role("Faculty") == "LECTURER"
    assert classify_role("Visitor") == "OTHER"
    assert classify_role("") == "UNKNOWN"


def test_parse_row_validity():
    m, _, _ = map_headers(HEADERS)
    ok = parse_row(["00A1B2", "A", "STUDENT", "2026-10-12", "09:00:00", "10:00:00", "COMPLETED"], m, HEADERS, 2)
    assert ok.validity == "VALID" and ok.uid == "00A1B2"
    open_ = parse_row(["00A1B2", "A", "STUDENT", "2026-10-12", "09:00:00", "", "PRESENT"], m, HEADERS, 3)
    assert open_.validity == "INCOMPLETE" and "Missing exit time" in open_.issues
    bad = parse_row(["00A1B2", "A", "STUDENT", "32/13/2026", "09:00", "", ""], m, HEADERS, 4)
    assert bad.validity == "INVALID"
    reversed_ = parse_row(["X", "A", "STUDENT", "2026-10-12", "10:00", "09:00", ""], m, HEADERS, 5)
    assert reversed_.validity == "INVALID"
    short = parse_row(["X"], m, HEADERS, 6)  # malformed/short row must not crash
    assert short.validity == "INVALID"


def test_source_key_stable_when_exit_filled_and_duplicates_distinct():
    m, _, _ = map_headers(HEADERS)
    before = parse_row(["U1", "A", "STUDENT", "2026-10-12", "09:00", "", "PRESENT"], m, HEADERS, 2)
    after = parse_row(["U1", "A", "STUDENT", "2026-10-12", "09:00", "10:00", "COMPLETED"], m, HEADERS, 7)
    k1 = assign_source_keys([before])[0][0]
    k2 = assign_source_keys([after])[0][0]
    assert k1 == k2  # same identity, different content
    assert before.content_hash != after.content_hash
    dup = assign_source_keys([before, before])
    assert dup[0][0] != dup[1][0]


# ---------------------------------------------------------------- engine

def test_union_does_not_double_count():
    total, merged = union_minutes([(0, 30), (20, 50), (55, 60)])
    assert total == 55 and merged == [(0, 50), (55, 60)]


def test_arrival_before_class_present():
    r = evaluate_session(DAY, T(9), T(10), ev((T(8, 30), T(10, 30))), RULES, LATER)
    assert r["status"] == PRESENT and r["attended_minutes"] == 60 and r["duration_percent"] == 100.0


def test_arrival_exactly_at_start_present():
    r = evaluate_session(DAY, T(9), T(10), ev((T(9), T(10))), RULES, LATER)
    assert r["status"] == PRESENT and r["attended_minutes"] == 60


def test_spec_example_9_10_arrival_is_83_33_percent():
    r = evaluate_session(DAY, T(9), T(10), ev((T(9, 10), T(10))), RULES, LATER)
    assert r["attended_minutes"] == 50 and r["duration_percent"] == 83.33
    assert r["status"] == PRESENT  # within the 10-minute grace period
    strict = dict(RULES, grace=5)
    assert evaluate_session(DAY, T(9), T(10), ev((T(9, 10), T(10))), strict, LATER)["status"] == LATE


def test_late_arrival():
    r = evaluate_session(DAY, T(9), T(10), ev((T(9, 14), T(10))), RULES, LATER)
    assert r["status"] == LATE and r["attended_minutes"] == 46


def test_early_departure_partial_and_absent():
    r = evaluate_session(DAY, T(9), T(10), ev((T(8, 55), T(9, 30))), RULES, LATER)
    assert r["status"] == PARTIAL and r["attended_minutes"] == 30 and r["duration_percent"] == 50.0
    r2 = evaluate_session(DAY, T(9), T(10), ev((T(8, 55), T(9, 10))), RULES, LATER)
    assert r2["status"] == ABSENT and r2["attended_minutes"] == 10


def test_time_outside_class_never_counts():
    r = evaluate_session(DAY, T(9), T(10), ev((T(7), T(8, 59)), (T(10, 1), T(12))), RULES, LATER)
    assert r["status"] == ABSENT and r["attended_minutes"] == 0


def test_multiple_intervals_union():
    # leaves 9:20-9:30 and the two scans overlap 9:40-9:45: union = 20 + 30 = 50
    r = evaluate_session(DAY, T(9), T(10), ev((T(8, 50), T(9, 20)), (T(9, 30), T(9, 45)), (T(9, 40), T(10, 5))), RULES, LATER)
    assert r["attended_minutes"] == 50 and r["status"] == PRESENT
    assert len(r["intervals"]) == 3


def test_missing_exit_is_pending_not_present():
    r = evaluate_session(DAY, T(9), T(10), ev((T(8, 50), None)), RULES, LATER)
    assert r["status"] == PENDING and r["attended_minutes"] == 0
    absent_policy = dict(RULES, missing_exit_policy=ABSENT)
    assert evaluate_session(DAY, T(9), T(10), ev((T(8, 50), None)), absent_policy, LATER)["status"] == ABSENT


def test_missing_entry_is_pending():
    r = evaluate_session(DAY, T(9), T(10), ev((None, T(9, 50))), RULES, LATER)
    assert r["status"] == PENDING


def test_open_entry_after_class_is_irrelevant():
    r = evaluate_session(DAY, T(9), T(10), ev((T(11), None)), RULES, LATER)
    assert r["status"] == ABSENT


def test_complete_evidence_beats_ambiguous_row():
    r = evaluate_session(DAY, T(9), T(10), ev((T(8, 55), T(10)), (T(10, 30), None)), RULES, LATER)
    assert r["status"] == PRESENT


def test_back_to_back_classes_split_one_interval():
    evidence = ev((T(9, 5), T(10, 20)))
    a = evaluate_session(DAY, T(9), T(10), evidence, RULES, LATER)
    b = evaluate_session(DAY, T(10), T(11), evidence, RULES, LATER)
    assert a["attended_minutes"] == 55 and a["status"] == PRESENT
    # 20/60 = 33.33%: below the 75% present threshold, above the 25% partial threshold
    assert b["attended_minutes"] == 20 and b["duration_percent"] == 33.33 and b["status"] == PARTIAL


def test_min_required_minutes_rule():
    rules = dict(RULES, min_required_minutes=55)
    r = evaluate_session(DAY, T(9), T(10), ev((T(9, 10), T(10))), rules, LATER)
    assert r["status"] == PARTIAL  # 83% but only 50 of the required 55 minutes
