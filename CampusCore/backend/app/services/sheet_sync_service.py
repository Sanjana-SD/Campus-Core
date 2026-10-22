"""
Synchronises the Google Form / RFID worksheet into `sheet_attendance_rows`.

* Idempotent: rows are keyed by a fingerprint (see sheet_parsing.assign_source_keys), so
  re-running a sync never duplicates records.
* Changes to an existing row (typically Exit Time being filled in) update the stored row and
  are recorded in `sheet_row_revisions` with the old and new source values.
* Rows that disappear from the sheet are flagged `missing_from_source` (never deleted) and
  excluded from attendance calculations until they reappear.
* After every sync, affected students' attendance is recalculated.
"""
import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import AuditLog, LecturerProfile, StudentProfile
from app.models.extended import SheetAttendanceRow, SheetRowRevision, SyncRun
from app.services import attendance_engine
from app.services.google_sheets_service import fetch_worksheet
from app.services.sheet_parsing import (
    HEADER_ALIASES, ParsedRow, assign_source_keys, make_source_key, map_headers, parse_row,
)

logger = logging.getLogger("campuscore.sync")

RAW_FIELDS = ["uid", "name", "role", "date", "entry_time", "exit_time", "status"]


def _raw_values(row: SheetAttendanceRow) -> Dict[str, Any]:
    return {
        "uid": row.raw_uid, "name": row.raw_name, "role": row.raw_role, "date": row.raw_date,
        "entry_time": row.raw_entry_time, "exit_time": row.raw_exit_time, "status": row.raw_status,
        "extra": row.raw_extra, "row_number": row.row_number,
    }


def _apply_parsed(row: SheetAttendanceRow, p: ParsedRow) -> None:
    row.raw_uid = p.raw.get("uid")
    row.raw_name = p.raw.get("name")
    row.raw_role = p.raw.get("role")
    row.raw_date = p.raw.get("date")
    row.raw_entry_time = p.raw.get("entry_time")
    row.raw_exit_time = p.raw.get("exit_time")
    row.raw_status = p.raw.get("status")
    row.raw_extra = p.extra or None
    row.content_hash = p.content_hash
    row.uid = p.uid
    row.event_date = p.event_date
    row.entry_time = p.entry_time
    row.exit_time = p.exit_time
    row.role_category = p.role_category
    row.validity = p.validity
    row.issues = p.issues or None
    if p.row_number:
        row.row_number = p.row_number


class UidDirectory:
    """In-memory lookup of verified UID assignments."""

    def __init__(self, db: Session):
        self.students: Dict[str, StudentProfile] = {}
        self.lecturers: Dict[str, LecturerProfile] = {}
        for s in db.query(StudentProfile).filter(StudentProfile.rfid_uid.isnot(None)):
            key = (s.rfid_uid or "").strip().upper()
            if key:
                self.students[key] = s
        for l in db.query(LecturerProfile).filter(LecturerProfile.rfid_uid.isnot(None)):
            key = (l.rfid_uid or "").strip().upper()
            if key:
                self.lecturers[key] = l
        self._stripped = {k.lstrip("0"): k for k in list(self.students) + list(self.lecturers)}

    def leading_zero_hint(self, uid: str) -> Optional[str]:
        cand = self._stripped.get(uid.lstrip("0"))
        return cand if cand and cand != uid else None


def match_row(row: SheetAttendanceRow, d: UidDirectory) -> None:
    if row.match_status == "IGNORED":
        return  # an administrator explicitly excluded this UID (e.g. a visitor card)
    row.student_id = None
    row.lecturer_id = None
    uid = row.uid
    if not uid:
        row.match_status, row.match_note = "UNMATCHED", "Row has no UID"
        return
    student = d.students.get(uid)
    lecturer = d.lecturers.get(uid)
    role = row.role_category
    if student and lecturer:
        row.match_status = "CONFLICT"
        row.match_note = "This UID is registered to both a student and a lecturer"
        return
    if role == "LECTURER":
        if lecturer:
            row.match_status, row.lecturer_id, row.match_note = "STAFF", lecturer.id, None
        elif student:
            row.match_status = "CONFLICT"
            row.match_note = f"Sheet role is '{row.raw_role}' but the UID is registered to student {student.student_id_number}"
        else:
            row.match_status = "STAFF"
            row.match_note = "Staff scan with a UID not linked to any lecturer profile (not used for student attendance)"
        return
    if role == "OTHER":
        if student:
            row.match_status = "CONFLICT"
            row.match_note = f"Sheet role is '{row.raw_role}' but the UID is registered to student {student.student_id_number}"
        elif lecturer:
            row.match_status, row.lecturer_id, row.match_note = "STAFF", lecturer.id, None
        else:
            row.match_status, row.match_note = "UNMATCHED", f"Unregistered UID with role '{row.raw_role}'"
        return
    # STUDENT or UNKNOWN role
    if student:
        row.match_status, row.student_id = "MATCHED", student.id
        row.match_note = None if role == "STUDENT" else "Role missing in sheet; matched by verified UID"
    elif lecturer:
        if role == "STUDENT":
            row.match_status = "CONFLICT"
            row.match_note = "Sheet role is Student but the UID is registered to a lecturer"
        else:
            row.match_status, row.lecturer_id, row.match_note = "STAFF", lecturer.id, None
    else:
        hint = d.leading_zero_hint(uid)
        row.match_status = "UNMATCHED"
        row.match_note = (f"No registered card has this UID. Registered UID {hint} differs only by leading zeros; "
                          "verify before mapping.") if hint else "No registered student or lecturer has this UID"


def _affected(row: SheetAttendanceRow, acc: Set[Tuple[int, date]]) -> None:
    if row.student_id and row.event_date:
        acc.add((row.student_id, row.event_date))


def apply_rows(db: Session, keyed: List[Tuple[str, ParsedRow]], run: SyncRun, method: str,
               full_snapshot: bool) -> Dict[str, Any]:
    sid, gid = run.spreadsheet_id, run.worksheet_gid
    existing = {r.source_key: r for r in db.query(SheetAttendanceRow).filter(
        SheetAttendanceRow.spreadsheet_id == sid, SheetAttendanceRow.worksheet_gid == gid)}
    directory = UidDirectory(db)
    affected: Set[Tuple[int, date]] = set()
    stats = {"imported": 0, "updated": 0, "unchanged": 0, "rejected": 0, "removed": 0, "restored": 0}
    seen: Set[str] = set()
    now = datetime.utcnow()

    for key, p in keyed:
        seen.add(key)
        if p.validity == "INVALID":
            stats["rejected"] += 1
        row = existing.get(key)
        if row is None:
            row = SheetAttendanceRow(spreadsheet_id=sid, worksheet_gid=gid, source_key=key,
                                     ingestion_method=method, first_seen_run_id=run.id, first_seen_at=now,
                                     last_changed_at=now)
            _apply_parsed(row, p)
            row.last_seen_run_id = run.id
            match_row(row, directory)
            db.add(row)
            existing[key] = row
            stats["imported"] += 1
            _affected(row, affected)
            continue
        restored = row.missing_from_source
        if row.content_hash != p.content_hash or restored:
            old = _raw_values(row)
            _affected(row, affected)
            _apply_parsed(row, p)
            row.missing_from_source = False
            row.last_changed_at = now
            row.ingestion_method = method
            match_row(row, directory)
            _affected(row, affected)
            db.add(SheetRowRevision(row_id=row.id, sync_run_id=run.id,
                                    change_type="RESTORED" if restored and old["entry_time"] == row.raw_entry_time and old["exit_time"] == row.raw_exit_time else "UPDATED",
                                    old_values=old, new_values=_raw_values(row)))
            if restored:
                stats["restored"] += 1
            stats["updated"] += 1
        else:
            stats["unchanged"] += 1
            if p.row_number:
                row.row_number = p.row_number
        row.last_seen_run_id = run.id

    if full_snapshot:
        for key, row in existing.items():
            if key not in seen and not row.missing_from_source:
                row.missing_from_source = True
                row.last_changed_at = now
                db.add(SheetRowRevision(row_id=row.id, sync_run_id=run.id, change_type="REMOVED",
                                        old_values=_raw_values(row), new_values=None))
                _affected(row, affected)
                stats["removed"] += 1
    db.flush()
    stats["affected"] = affected
    return stats


def _recalc_affected(db: Session, affected: Set[Tuple[int, date]],
                     prev_tracking_start: Optional[date]) -> Dict[str, Any]:
    if not affected:
        return {"evaluated": 0}
    policy = attendance_engine.get_policy(db)
    new_start = attendance_engine.tracking_start(db, policy)
    if new_start is not None and (prev_tracking_start is None or new_start < prev_tracking_start):
        # The evaluation window grew backwards (e.g. first import of historical rows):
        # every student's classes in the new window must be evaluated.
        return attendance_engine.recalculate(db, commit=False)
    students = sorted({s for s, _ in affected})
    return attendance_engine.recalculate(db, start=min(d for _, d in affected), end=max(d for _, d in affected),
                                         student_ids=students, commit=False)


def _current_tracking_start(db: Session) -> Optional[date]:
    return attendance_engine.tracking_start(db, attendance_engine.get_policy(db))


def _finish(db: Session, run: SyncRun, status: str, code: Optional[str] = None, message: Optional[str] = None):
    run.status = status
    run.error_code = code
    run.error_message = message
    run.finished_at = datetime.utcnow()
    db.commit()
    if status == "FAILED":
        logger.warning("Sheet sync %s failed: %s %s", run.id, code, message)
    return run


def run_sync(db: Session, trigger: str = "MANUAL", user_id: Optional[int] = None,
             retry_of_id: Optional[int] = None) -> Dict[str, Any]:
    run = SyncRun(trigger=trigger, spreadsheet_id=settings.GOOGLE_SHEET_ID,
                  worksheet_gid=str(settings.GOOGLE_SHEET_GID), status="RUNNING",
                  triggered_by_id=user_id, retry_of_id=retry_of_id)
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        res = fetch_worksheet()
    except Exception as exc:  # never let an unexpected client failure crash the API
        logger.exception("Unexpected error reading worksheet")
        _finish(db, run, "FAILED", "UNEXPECTED", f"Unexpected error: {exc}")
        return {"run": sync_run_to_dict(run), "attempts": []}

    run.transport = res.transport
    run.worksheet_title = res.worksheet_title
    if not res.ok:
        _finish(db, run, "FAILED", res.error_code, res.error_message)
        return {"run": sync_run_to_dict(run), "attempts": res.attempts}

    run.headers_detected = res.headers
    mapping, missing, unmapped = map_headers(res.headers)
    run.column_mapping = {f: res.headers[i] for f, i in mapping.items()}
    if not res.headers:
        run.rows_read = 0
        _finish(db, run, "SUCCESS", None, "Worksheet is empty (no header row).")
        return {"run": sync_run_to_dict(run), "attempts": res.attempts}
    if missing:
        _finish(db, run, "FAILED", "HEADERS_MISSING",
                f"Required column(s) not found: {', '.join(missing)}. Headers in the sheet: {', '.join(res.headers)}")
        return {"run": sync_run_to_dict(run), "attempts": res.attempts}

    parsed = []
    for row_number, values in res.rows:
        if not any(str(v or "").strip() for v in values):
            continue  # blank line
        try:
            parsed.append(parse_row(values, mapping, res.headers, row_number, settings.SHEET_DATE_ORDER))
        except Exception as exc:  # defensive: a malformed row must not abort the sync
            logger.warning("Row %s could not be parsed: %s", row_number, exc)
            p = ParsedRow(row_number=row_number, raw={f: None for f in HEADER_ALIASES}, extra={"error": str(exc)})
            p.validity = "INVALID"
            p.issues = [f"Unparseable row: {exc}"]
            parsed.append(p)
    run.rows_read = len(parsed)
    keyed = assign_source_keys(parsed)
    try:
        prev_start = _current_tracking_start(db)
        stats = apply_rows(db, keyed, run, res.transport or "SERVICE_ACCOUNT", full_snapshot=True)
        recalc = _recalc_affected(db, stats.pop("affected"), prev_start)
    except Exception as exc:
        db.rollback()
        run = db.get(SyncRun, run.id)
        logger.exception("Sync %s failed while saving", run.id)
        _finish(db, run, "FAILED", "DATABASE_ERROR", f"Failed while saving rows: {exc}")
        return {"run": sync_run_to_dict(run), "attempts": res.attempts}

    for k in ("imported", "updated", "unchanged", "rejected", "removed"):
        setattr(run, k, stats[k])
    msg = (f"Read {run.rows_read} rows from '{run.worksheet_title or 'worksheet'}' via {res.transport}: "
           f"{stats['imported']} imported, {stats['updated']} updated, {stats['unchanged']} unchanged, "
           f"{stats['rejected']} rejected, {stats['removed']} removed from sheet.")
    if unmapped:
        msg += f" Extra columns kept as source data: {', '.join(unmapped)}."
    db.add(AuditLog(user_id=user_id, action="SHEET_SYNC", entity_type="SYNC_RUN", entity_id=str(run.id), details=msg))
    _finish(db, run, "PARTIAL" if stats["rejected"] else "SUCCESS", None, msg)
    out = {"run": sync_run_to_dict(run), "attempts": res.attempts, "recalculation": recalc}
    return out


def ingest_webhook_records(db: Session, records: List[Dict[str, Any]], source: str) -> Dict[str, Any]:
    """Push path used by the existing Apps Script (`forwardToCampusCore`). Rows are keyed the
    same way as a pulled sync, so push and pull never create duplicates of each other."""
    run = SyncRun(trigger="WEBHOOK", transport="WEBHOOK", spreadsheet_id=settings.GOOGLE_SHEET_ID,
                  worksheet_gid=str(settings.GOOGLE_SHEET_GID), status="RUNNING")
    db.add(run)
    db.commit()
    db.refresh(run)
    headers = ["UID", "Name", "Role", "Date", "Entry Time", "Exit Time", "Status"]
    mapping, _, _ = map_headers(headers)
    keyed: List[Tuple[str, ParsedRow]] = []
    for rec in records:
        rn = None
        sid = str(rec.get("source_row_id") or "")
        if sid.startswith("row_"):
            try:
                rn = int(sid.split("_")[1])
            except (ValueError, IndexError):
                rn = None
        values = [str(rec.get(h) if rec.get(h) is not None else "") for h in headers]
        p = parse_row(values, mapping, headers, rn, settings.SHEET_DATE_ORDER)
        base = p.identity_base()
        occ = 0
        while True:
            key = make_source_key(base, occ)
            existing = db.query(SheetAttendanceRow).filter(
                SheetAttendanceRow.spreadsheet_id == run.spreadsheet_id,
                SheetAttendanceRow.worksheet_gid == run.worksheet_gid,
                SheetAttendanceRow.source_key == key).first()
            already_in_batch = any(k == key for k, _ in keyed)
            if (existing is None and not already_in_batch) or (existing is not None and (rn is None or existing.row_number == rn)):
                break
            occ += 1
        keyed.append((key, p))
    prev_start = _current_tracking_start(db)
    stats = apply_rows(db, keyed, run, "WEBHOOK", full_snapshot=False)
    recalc = _recalc_affected(db, stats.pop("affected"), prev_start)
    run.rows_read = len(keyed)
    for k in ("imported", "updated", "unchanged", "rejected", "removed"):
        setattr(run, k, stats[k])
    _finish(db, run, "PARTIAL" if stats["rejected"] else "SUCCESS", None,
            f"Webhook ({source}): {stats['imported']} imported, {stats['updated']} updated, "
            f"{stats['unchanged']} unchanged, {stats['rejected']} rejected.")
    unmatched = db.query(SheetAttendanceRow).filter(
        SheetAttendanceRow.last_seen_run_id == run.id, SheetAttendanceRow.match_status == "UNMATCHED").count()
    return {"run": sync_run_to_dict(run), "unmatched": unmatched, "recalculation": recalc}


def rematch_uid(db: Session, uid: Optional[str] = None) -> int:
    """Re-run identity matching after a UID assignment changes, then recalculate."""
    directory = UidDirectory(db)
    q = db.query(SheetAttendanceRow)
    if uid:
        q = q.filter(SheetAttendanceRow.uid == uid.strip().upper())
    affected: Set[Tuple[int, date]] = set()
    n = 0
    for row in q:
        before = (row.match_status, row.student_id, row.lecturer_id)
        _affected(row, affected)
        match_row(row, directory)
        if (row.match_status, row.student_id, row.lecturer_id) != before:
            n += 1
            _affected(row, affected)
    db.flush()
    _recalc_affected(db, affected, _current_tracking_start(db))
    db.commit()
    return n


def sync_run_to_dict(r: SyncRun) -> Dict[str, Any]:
    return {
        "id": r.id, "trigger": r.trigger, "transport": r.transport, "spreadsheet_id": r.spreadsheet_id,
        "worksheet_gid": r.worksheet_gid, "worksheet_title": r.worksheet_title, "status": r.status,
        "error_code": r.error_code, "error_message": r.error_message, "headers_detected": r.headers_detected,
        "column_mapping": r.column_mapping, "rows_read": r.rows_read, "imported": r.imported,
        "updated": r.updated, "unchanged": r.unchanged, "rejected": r.rejected, "removed": r.removed,
        "retry_of_id": r.retry_of_id,
        "started_at": r.started_at.isoformat() + "Z" if r.started_at else None,
        "finished_at": r.finished_at.isoformat() + "Z" if r.finished_at else None,
    }


def row_to_dict(r: SheetAttendanceRow, include_calc: Optional[Dict[int, List[str]]] = None) -> Dict[str, Any]:
    st = r.student
    return {
        "id": r.id, "row_number": r.row_number,
        "uid": r.raw_uid, "uid_normalized": r.uid, "name": r.raw_name, "role": r.raw_role,
        "date": r.raw_date, "entry_time": r.raw_entry_time, "exit_time": r.raw_exit_time,
        "original_status": r.raw_status, "extra": r.raw_extra,
        "parsed_date": r.event_date.isoformat() if r.event_date else None,
        "parsed_entry": r.entry_time.strftime("%H:%M:%S") if r.entry_time else None,
        "parsed_exit": r.exit_time.strftime("%H:%M:%S") if r.exit_time else None,
        "role_category": r.role_category, "validity": r.validity, "issues": r.issues or [],
        "match_status": r.match_status, "match_note": r.match_note,
        "student_id": r.student_id,
        "student_name": st.user.full_name if (st and st.user) else None,
        "student_usn": st.student_id_number if st else None,
        "lecturer_id": r.lecturer_id,
        "lecturer_name": r.lecturer.user.full_name if (r.lecturer and r.lecturer.user) else None,
        "missing_from_source": r.missing_from_source,
        "ingestion_method": r.ingestion_method,
        "first_seen_at": r.first_seen_at.isoformat() + "Z" if r.first_seen_at else None,
        "last_changed_at": r.last_changed_at.isoformat() + "Z" if r.last_changed_at else None,
        "calculated_statuses": (include_calc or {}).get(r.id, []),
    }
