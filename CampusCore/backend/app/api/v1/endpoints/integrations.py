import csv
import io
from collections import defaultdict
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import require_admin, verify_integration_secret
from app.core.config import settings
from app.core.database import get_db
from app.models.models import AuditLog, LecturerProfile, StudentProfile, User
from app.models.extended import AttendanceRecord, SheetAttendanceRow, SheetRowRevision, SyncRun
from app.schemas.schemas import AttendanceIngestBatch
from app.services import google_sheets_service as gs
from app.services.sheet_parsing import map_headers
from app.services.sheet_sync_service import (
    ingest_webhook_records, rematch_uid, row_to_dict, run_sync, sync_run_to_dict,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Push (existing Apps Script webhook)
# ---------------------------------------------------------------------------

def handle_webhook(payload: AttendanceIngestBatch, db: Session) -> Dict[str, Any]:
    if not payload.records:
        raise HTTPException(status_code=400, detail="Payload contains empty records list")
    records = [r.model_dump(by_alias=True) for r in payload.records]
    out = ingest_webhook_records(db, records, payload.source or "APPS_SCRIPT")
    run = out["run"]
    return {
        "status": "success",
        "message": run["error_message"],
        "summary": {
            "total": run["rows_read"], "imported": run["imported"], "updated": run["updated"],
            "unchanged": run["unchanged"], "rejected": run["rejected"], "unmatched": out["unmatched"],
            "processed": run["imported"] + run["updated"] + run["unchanged"] - run["rejected"],
            "failed": run["rejected"],
        },
        "sync_run_id": run["id"],
    }


@router.post("/google-sheets/attendance")
def ingest_google_sheets_attendance(
    payload: AttendanceIngestBatch,
    is_authorized: bool = Depends(verify_integration_secret),
    db: Session = Depends(get_db),
) -> Any:
    """Secured webhook used by the existing Apps Script to push new or updated rows."""
    return handle_webhook(payload, db)


# ---------------------------------------------------------------------------
# Status, test connection, sync
# ---------------------------------------------------------------------------

def _status(db: Session) -> Dict[str, Any]:
    last = db.query(SyncRun).filter(SyncRun.trigger != "TEST").order_by(SyncRun.id.desc()).first()
    last_attempt = db.query(SyncRun).order_by(SyncRun.id.desc()).first()
    last_ok = db.query(SyncRun).filter(SyncRun.status.in_(["SUCCESS", "PARTIAL"]),
                                       SyncRun.trigger != "TEST").order_by(SyncRun.id.desc()).first()
    last_err = db.query(SyncRun).filter(SyncRun.status == "FAILED").order_by(SyncRun.id.desc()).first()
    base = db.query(SheetAttendanceRow).filter(
        SheetAttendanceRow.spreadsheet_id == settings.GOOGLE_SHEET_ID,
        SheetAttendanceRow.worksheet_gid == str(settings.GOOGLE_SHEET_GID))
    active = base.filter(SheetAttendanceRow.missing_from_source.is_(False))
    unmatched_uids = active.filter(SheetAttendanceRow.match_status == "UNMATCHED",
                                   SheetAttendanceRow.uid.isnot(None)).with_entities(SheetAttendanceRow.uid).distinct().count()
    transport = ("SERVICE_ACCOUNT" if gs.service_account_configured()
                 else "APPS_SCRIPT" if settings.GOOGLE_APPS_SCRIPT_WEBAPP_URL.strip() else None)
    if last_attempt is None:
        connection = "NOT_TESTED"
    elif last_attempt.status in ("SUCCESS", "PARTIAL"):
        connection = "CONNECTED"
    else:
        connection = "ERROR"
    return {
        "spreadsheet_id": settings.GOOGLE_SHEET_ID,
        "worksheet_gid": str(settings.GOOGLE_SHEET_GID),
        "spreadsheet_url": settings.GOOGLE_SHEET_URL,
        "configured_transport": transport,
        "credentials_configured": transport is not None,
        "service_account_email": gs.service_account_email() if gs.service_account_configured() else None,
        "webhook_enabled": bool(settings.INTEGRATION_WEBHOOK_SECRET),
        "webhook_endpoint": f"{settings.API_V1_STR}/integrations/google-sheets/attendance",
        "connection_status": connection,
        "last_attempt": sync_run_to_dict(last_attempt) if last_attempt else None,
        "last_sync": sync_run_to_dict(last) if last else None,
        "last_successful_sync": sync_run_to_dict(last_ok) if last_ok else None,
        "last_error": sync_run_to_dict(last_err) if last_err else None,
        "counts": {
            "records_imported": active.count(),
            "records_removed_from_sheet": base.filter(SheetAttendanceRow.missing_from_source.is_(True)).count(),
            "matched_student_rows": active.filter(SheetAttendanceRow.match_status == "MATCHED").count(),
            "staff_rows": active.filter(SheetAttendanceRow.match_status == "STAFF").count(),
            "unmatched_rows": active.filter(SheetAttendanceRow.match_status == "UNMATCHED").count(),
            "unmatched_uids": unmatched_uids,
            "conflict_rows": active.filter(SheetAttendanceRow.match_status == "CONFLICT").count(),
            "incomplete_rows": active.filter(SheetAttendanceRow.validity == "INCOMPLETE").count(),
            "invalid_rows": active.filter(SheetAttendanceRow.validity == "INVALID").count(),
        },
        "date_order": settings.SHEET_DATE_ORDER,
    }


@router.get("/google-sheets/status")
def get_integration_status(db: Session = Depends(get_db), current_user: User = Depends(require_admin)) -> Any:
    return _status(db)


@router.get("/google-sheets/health")
def get_integration_health(db: Session = Depends(get_db), current_user: User = Depends(require_admin)) -> Any:
    """Backward-compatible alias of /google-sheets/status."""
    s = _status(db)
    s["health_status"] = s["connection_status"]
    s["last_sync_timestamp"] = (s["last_successful_sync"] or {}).get("finished_at")
    return s


@router.post("/google-sheets/test")
def test_connection(db: Session = Depends(get_db), current_user: User = Depends(require_admin)) -> Any:
    """Reads the worksheet without changing any stored data and reports what was found."""
    run = SyncRun(trigger="TEST", spreadsheet_id=settings.GOOGLE_SHEET_ID,
                  worksheet_gid=str(settings.GOOGLE_SHEET_GID), triggered_by_id=current_user.id)
    db.add(run)
    db.commit()
    res = gs.fetch_worksheet()
    run.transport = res.transport
    run.worksheet_title = res.worksheet_title
    run.finished_at = datetime.utcnow()
    mapping, missing, unmapped = map_headers(res.headers) if res.ok else ({}, [], [])
    if res.ok and missing and res.headers:
        run.status, run.error_code = "FAILED", "HEADERS_MISSING"
        run.error_message = f"Connected, but required column(s) are missing: {', '.join(missing)}"
    elif res.ok:
        run.status = "SUCCESS"
        run.error_message = f"Connected via {res.transport}; worksheet '{res.worksheet_title}' has {len(res.rows)} data rows."
    else:
        run.status, run.error_code, run.error_message = "FAILED", res.error_code, res.error_message
    run.rows_read = len(res.rows)
    run.headers_detected = res.headers or None
    run.column_mapping = {f: res.headers[i] for f, i in mapping.items()} if mapping else None
    db.commit()
    return {
        "ok": run.status == "SUCCESS",
        "run": sync_run_to_dict(run),
        "transport": res.transport,
        "error_code": run.error_code,
        "message": run.error_message,
        "worksheet_title": res.worksheet_title,
        "headers": res.headers,
        "column_mapping": run.column_mapping,
        "missing_required_columns": missing,
        "unmapped_columns": unmapped,
        "row_count": len(res.rows),
        "preview": [{"row_number": rn, "values": v} for rn, v in res.rows[:5]],
        "service_account_email": res.service_account_email,
        "attempts": res.attempts,
    }


@router.post("/google-sheets/sync")
def trigger_sync(db: Session = Depends(get_db), current_user: User = Depends(require_admin)) -> Any:
    out = run_sync(db, trigger="MANUAL", user_id=current_user.id)
    run = out["run"]
    return {
        "success": run["status"] in ("SUCCESS", "PARTIAL"),
        "message": run["error_message"],
        "error_code": run["error_code"],
        "run": run,
        "recalculation": out.get("recalculation"),
        "summary": {k: run[k] for k in ("rows_read", "imported", "updated", "unchanged", "rejected", "removed")},
    }


@router.post("/google-sheets/sync/{run_id}/retry")
def retry_sync(run_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)) -> Any:
    prev = db.get(SyncRun, run_id)
    if not prev:
        raise HTTPException(404, "Sync run not found")
    out = run_sync(db, trigger="RETRY", user_id=current_user.id, retry_of_id=prev.id)
    return {"success": out["run"]["status"] in ("SUCCESS", "PARTIAL"), "run": out["run"],
            "message": out["run"]["error_message"]}


@router.get("/sync-runs")
def list_sync_runs(skip: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=200),
                   db: Session = Depends(get_db), current_user: User = Depends(require_admin)) -> Any:
    q = db.query(SyncRun).order_by(SyncRun.id.desc())
    return {"total": q.count(), "items": [sync_run_to_dict(r) for r in q.offset(skip).limit(limit)]}


@router.get("/sync-logs")
def legacy_sync_logs(limit: int = 50, db: Session = Depends(get_db), current_user: User = Depends(require_admin)) -> Any:
    return [sync_run_to_dict(r) for r in db.query(SyncRun).order_by(SyncRun.id.desc()).limit(limit)]


# ---------------------------------------------------------------------------
# Imported records
# ---------------------------------------------------------------------------

def _rows_query(db: Session, search: Optional[str], uid: Optional[str], date_from: Optional[date],
                date_to: Optional[date], role: Optional[str], original_status: Optional[str],
                match_status: Optional[str], validity: Optional[str], include_removed: bool,
                calculated_status: Optional[str]):
    q = db.query(SheetAttendanceRow).filter(
        SheetAttendanceRow.spreadsheet_id == settings.GOOGLE_SHEET_ID,
        SheetAttendanceRow.worksheet_gid == str(settings.GOOGLE_SHEET_GID))
    if not include_removed:
        q = q.filter(SheetAttendanceRow.missing_from_source.is_(False))
    if search:
        pat = f"%{search.strip()}%"
        q = q.outerjoin(StudentProfile, SheetAttendanceRow.student_id == StudentProfile.id) \
             .outerjoin(User, StudentProfile.user_id == User.id) \
             .filter(or_(SheetAttendanceRow.raw_name.ilike(pat), SheetAttendanceRow.raw_uid.ilike(pat),
                         SheetAttendanceRow.uid.ilike(pat), User.full_name.ilike(pat),
                         StudentProfile.student_id_number.ilike(pat)))
    if uid:
        q = q.filter(SheetAttendanceRow.uid == uid.strip().upper())
    if date_from:
        q = q.filter(SheetAttendanceRow.event_date >= date_from)
    if date_to:
        q = q.filter(SheetAttendanceRow.event_date <= date_to)
    if role:
        q = q.filter(SheetAttendanceRow.role_category == role.upper())
    if original_status:
        q = q.filter(func.upper(SheetAttendanceRow.raw_status) == original_status.upper())
    if match_status:
        q = q.filter(SheetAttendanceRow.match_status == match_status.upper())
    if validity:
        q = q.filter(SheetAttendanceRow.validity == validity.upper())
    if calculated_status:
        # rows that contributed to at least one class record with this final status
        recs = db.query(AttendanceRecord.source_row_ids).filter(
            AttendanceRecord.final_status == calculated_status.upper()).all()
        ids = {rid for (lst,) in recs for rid in (lst or [])}
        q = q.filter(SheetAttendanceRow.id.in_(ids or [-1]))
    return q


def _calc_map(db: Session, rows: List[SheetAttendanceRow]) -> Dict[int, List[str]]:
    """For each row: the calculated per-class statuses it contributed to, e.g. ['CS501 PRESENT']."""
    pairs = {(r.student_id, r.event_date) for r in rows if r.student_id and r.event_date}
    out: Dict[int, List[str]] = defaultdict(list)
    if not pairs:
        return out
    sids = {p[0] for p in pairs}
    dates = {p[1] for p in pairs}
    for rec in db.query(AttendanceRecord).filter(AttendanceRecord.student_id.in_(sids),
                                                 AttendanceRecord.date.in_(dates)):
        for rid in rec.source_row_ids or []:
            code = rec.subject.code if rec.subject else f"#{rec.subject_id}"
            out[rid].append(f"{code} {rec.scheduled_start.strftime('%H:%M')}: {rec.final_status}")
    return out


@router.get("/google-sheets/rows")
def list_rows(
    search: Optional[str] = None, uid: Optional[str] = None,
    date_from: Optional[date] = None, date_to: Optional[date] = None, on_date: Optional[date] = None,
    role: Optional[str] = None, original_status: Optional[str] = None, match_status: Optional[str] = None,
    validity: Optional[str] = None, calculated_status: Optional[str] = None, include_removed: bool = False,
    skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db), current_user: User = Depends(require_admin),
) -> Any:
    if on_date:
        date_from = date_to = on_date
    q = _rows_query(db, search, uid, date_from, date_to, role, original_status, match_status, validity,
                    include_removed, calculated_status)
    total = q.count()
    rows = q.order_by(SheetAttendanceRow.event_date.desc(), SheetAttendanceRow.row_number.desc(),
                      SheetAttendanceRow.id.desc()).offset(skip).limit(limit).all()
    cmap = _calc_map(db, rows)
    statuses = [s for (s,) in db.query(SheetAttendanceRow.raw_status).filter(
        SheetAttendanceRow.spreadsheet_id == settings.GOOGLE_SHEET_ID,
        SheetAttendanceRow.worksheet_gid == str(settings.GOOGLE_SHEET_GID)).distinct() if s]
    return {"total": total, "items": [row_to_dict(r, cmap) for r in rows], "original_statuses": sorted(statuses)}


@router.get("/google-sheets/rows/export")
def export_rows(
    search: Optional[str] = None, uid: Optional[str] = None,
    date_from: Optional[date] = None, date_to: Optional[date] = None,
    role: Optional[str] = None, original_status: Optional[str] = None, match_status: Optional[str] = None,
    validity: Optional[str] = None, calculated_status: Optional[str] = None, include_removed: bool = False,
    db: Session = Depends(get_db), current_user: User = Depends(require_admin),
) -> Response:
    q = _rows_query(db, search, uid, date_from, date_to, role, original_status, match_status, validity,
                    include_removed, calculated_status)
    rows = q.order_by(SheetAttendanceRow.event_date.desc(), SheetAttendanceRow.row_number.desc()).all()
    cmap = _calc_map(db, rows)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Sheet Row", "UID", "Name", "Role", "Date", "Entry Time", "Exit Time", "Original Status",
                "Matched Student", "USN", "Match Status", "Validity", "Issues", "Calculated Attendance"])
    for r in rows:
        st = r.student
        w.writerow([r.row_number, r.raw_uid, r.raw_name, r.raw_role, r.raw_date, r.raw_entry_time,
                    r.raw_exit_time, r.raw_status, st.user.full_name if (st and st.user) else "",
                    st.student_id_number if st else "", r.match_status, r.validity, "; ".join(r.issues or []),
                    " | ".join(cmap.get(r.id, []))])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=rfid_attendance_source.csv"})


@router.get("/google-sheets/rows/{row_id}")
def row_detail(row_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)) -> Any:
    r = db.get(SheetAttendanceRow, row_id)
    if not r:
        raise HTTPException(404, "Row not found")
    revisions = db.query(SheetRowRevision).filter(SheetRowRevision.row_id == r.id).order_by(SheetRowRevision.id).all()
    from app.services.attendance_engine import record_to_dict
    linked = []
    if r.student_id and r.event_date:
        for rec in db.query(AttendanceRecord).filter(AttendanceRecord.student_id == r.student_id,
                                                     AttendanceRecord.date == r.event_date):
            if r.id in (rec.source_row_ids or []):
                linked.append(record_to_dict(rec))
    return {
        "row": row_to_dict(r),
        "revisions": [{"change_type": v.change_type, "old_values": v.old_values, "new_values": v.new_values,
                       "sync_run_id": v.sync_run_id, "changed_at": v.changed_at.isoformat() + "Z"} for v in revisions],
        "attendance_records": linked,
    }


# ---------------------------------------------------------------------------
# Unmatched / conflicting UIDs
# ---------------------------------------------------------------------------

@router.get("/unmatched")
def unmatched_uids(include_ignored: bool = False, db: Session = Depends(get_db),
                   current_user: User = Depends(require_admin)) -> Any:
    statuses = ["UNMATCHED", "CONFLICT"] + (["IGNORED"] if include_ignored else [])
    rows = db.query(SheetAttendanceRow).filter(SheetAttendanceRow.match_status.in_(statuses),
                                               SheetAttendanceRow.missing_from_source.is_(False)).all()
    groups: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        key = r.uid or f"(empty UID, row {r.row_number})"
        g = groups.setdefault(key, {"uid": r.uid, "raw_uids": set(), "names": set(), "roles": set(), "row_count": 0,
                                    "first_date": None, "last_date": None, "match_status": r.match_status,
                                    "notes": set(), "row_ids": []})
        g["raw_uids"].add(r.raw_uid or "")
        if r.raw_name:
            g["names"].add(r.raw_name)
        if r.raw_role:
            g["roles"].add(r.raw_role)
        g["row_count"] += 1
        g["row_ids"].append(r.id)
        if r.match_note:
            g["notes"].add(r.match_note)
        if r.match_status == "CONFLICT":
            g["match_status"] = "CONFLICT"
        if r.event_date:
            g["first_date"] = min(filter(None, [g["first_date"], r.event_date]))
            g["last_date"] = max(filter(None, [g["last_date"], r.event_date]))
    out = []
    for g in groups.values():
        out.append({**g, "raw_uids": sorted(g["raw_uids"]), "names": sorted(g["names"]), "roles": sorted(g["roles"]),
                    "notes": sorted(g["notes"]),
                    "first_date": g["first_date"].isoformat() if g["first_date"] else None,
                    "last_date": g["last_date"].isoformat() if g["last_date"] else None})
    out.sort(key=lambda x: (x["match_status"] != "CONFLICT", -(x["row_count"])))
    return out


class UidMappingIn(BaseModel):
    uid: str
    student_id: Optional[int] = None
    lecturer_id: Optional[int] = None
    replace_existing: bool = False
    reason: str


@router.post("/uid-mappings")
def map_uid(data: UidMappingIn, db: Session = Depends(get_db), current_user: User = Depends(require_admin)) -> Any:
    uid = data.uid.strip().upper()
    if not uid:
        raise HTTPException(400, "UID is required")
    if not data.reason.strip():
        raise HTTPException(400, "A reason is required for the audit trail")
    if bool(data.student_id) == bool(data.lecturer_id):
        raise HTTPException(400, "Provide exactly one of student_id or lecturer_id")
    holder_s = db.query(StudentProfile).filter(func.upper(StudentProfile.rfid_uid) == uid).first()
    holder_l = db.query(LecturerProfile).filter(func.upper(LecturerProfile.rfid_uid) == uid).first()
    if data.student_id:
        target = db.get(StudentProfile, data.student_id)
        if not target:
            raise HTTPException(404, "Student not found")
        if (holder_s and holder_s.id != target.id) or holder_l:
            who = f"student {holder_s.student_id_number}" if holder_s else "a lecturer"
            raise HTTPException(409, f"UID {uid} is already assigned to {who}. Unassign it there first; a UID "
                                     "cannot belong to more than one person.")
        if target.rfid_uid and target.rfid_uid.upper() != uid and not data.replace_existing:
            raise HTTPException(409, f"Student {target.student_id_number} already has UID {target.rfid_uid}. "
                                     "Confirm replacement to continue.")
        old = target.rfid_uid
        target.rfid_uid = uid
        label = f"student {target.student_id_number}"
    else:
        target = db.get(LecturerProfile, data.lecturer_id)
        if not target:
            raise HTTPException(404, "Lecturer not found")
        if holder_s or (holder_l and holder_l.id != target.id):
            raise HTTPException(409, f"UID {uid} is already assigned to someone else. Unassign it there first.")
        if target.rfid_uid and target.rfid_uid.upper() != uid and not data.replace_existing:
            raise HTTPException(409, f"Lecturer {target.employee_id} already has UID {target.rfid_uid}. "
                                     "Confirm replacement to continue.")
        old = target.rfid_uid
        target.rfid_uid = uid
        label = f"lecturer {target.employee_id}"
    # Un-ignore rows for this UID now that it is verified
    for r in db.query(SheetAttendanceRow).filter(SheetAttendanceRow.uid == uid,
                                                 SheetAttendanceRow.match_status == "IGNORED"):
        r.match_status = "UNMATCHED"
    db.add(AuditLog(user_id=current_user.id, action="UID_MAPPED", entity_type="RFID_UID", entity_id=uid,
                    details=f"UID {uid} assigned to {label} (previous UID: {old or 'none'}). Reason: {data.reason}"))
    db.flush()
    changed = rematch_uid(db, uid)
    if old and old.upper() != uid:
        rematch_uid(db, old)
    return {"message": f"UID {uid} assigned to {label}", "rows_rematched": changed}


class IgnoreIn(BaseModel):
    uid: str
    ignore: bool = True
    reason: str


@router.post("/uid-ignore")
def ignore_uid(data: IgnoreIn, db: Session = Depends(get_db), current_user: User = Depends(require_admin)) -> Any:
    uid = data.uid.strip().upper()
    rows = db.query(SheetAttendanceRow).filter(SheetAttendanceRow.uid == uid).all()
    if not rows:
        raise HTTPException(404, "No imported rows have this UID")
    for r in rows:
        if data.ignore:
            if r.match_status in ("UNMATCHED", "CONFLICT"):
                r.match_status, r.match_note = "IGNORED", f"Ignored by {current_user.username}: {data.reason}"
        elif r.match_status == "IGNORED":
            r.match_status = "UNMATCHED"
    db.add(AuditLog(user_id=current_user.id, action="UID_IGNORED" if data.ignore else "UID_UNIGNORED",
                    entity_type="RFID_UID", entity_id=uid, details=data.reason))
    db.flush()
    rematch_uid(db, uid)
    return {"message": f"UID {uid} {'ignored' if data.ignore else 'returned to review'}"}
