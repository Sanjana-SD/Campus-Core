"""
Server-side reader for the existing Google Form / RFID response spreadsheet.

Primary transport: Google Sheets API v4 with a service account (read-only scope). The
spreadsheet must be shared (Viewer) with the service account's e-mail address.
Alternative: the existing Apps Script web app's `?action=export` endpoint, if configured.
A public CSV export is only attempted as a diagnostic; it works only if the sheet is
link-shared, which the configured sheet currently is not (HTTP 401).

Credentials never leave the backend; diagnostics expose only the service-account e-mail.
"""
import csv
import io
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

import httpx

from app.core.config import settings

logger = logging.getLogger("campuscore.sheets")

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets"


@dataclass
class FetchResult:
    ok: bool
    transport: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    worksheet_title: Optional[str] = None
    headers: List[str] = field(default_factory=list)
    rows: List[Tuple[int, List[str]]] = field(default_factory=list)  # (1-based sheet row number, values)
    service_account_email: Optional[str] = None
    attempts: List[Dict[str, Any]] = field(default_factory=list)

    def fail(self, transport: str, code: str, message: str) -> "FetchResult":
        self.ok = False
        self.transport = transport
        self.error_code = code
        self.error_message = message
        self.attempts.append({"transport": transport, "ok": False, "error_code": code, "message": message})
        return self


def _load_service_account_info() -> Tuple[Optional[dict], Optional[str], Optional[str]]:
    """Returns (info, error_code, error_message)."""
    raw = settings.GOOGLE_SERVICE_ACCOUNT_INFO.strip()
    path = settings.service_account_path
    try:
        if raw:
            return json.loads(raw), None, None
        if path and path.lstrip().startswith("{"):
            return json.loads(path), None, None
        if path:
            if not os.path.isfile(path):
                return None, "CREDENTIALS_FILE_MISSING", (
                    f"GOOGLE_SERVICE_ACCOUNT_JSON points to '{path}', but that file does not exist on the server."
                )
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh), None, None
    except json.JSONDecodeError as exc:
        return None, "CREDENTIALS_INVALID", f"Service account credentials are not valid JSON: {exc.msg}"
    return None, None, None


def service_account_configured() -> bool:
    return bool(settings.GOOGLE_SERVICE_ACCOUNT_INFO.strip() or settings.GOOGLE_SERVICE_ACCOUNT_JSON.strip())


def service_account_email() -> Optional[str]:
    info, _, _ = _load_service_account_info()
    return (info or {}).get("client_email")


def _google_error(resp) -> Tuple[str, str]:
    try:
        body = resp.json().get("error", {})
    except Exception:
        body = {}
    message = body.get("message") or resp.text[:300]
    reasons = json.dumps(body).upper()
    return message, reasons


def _fetch_via_service_account(result: FetchResult, spreadsheet_id: str, gid: str) -> FetchResult:
    transport = "SERVICE_ACCOUNT"
    info, code, msg = _load_service_account_info()
    if code:
        return result.fail(transport, code, msg)
    if not info:
        return result.fail(transport, "NOT_CONFIGURED", "No service account credentials are configured.")
    result.service_account_email = info.get("client_email")
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import AuthorizedSession
        creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
        session = AuthorizedSession(creds)
    except Exception as exc:  # malformed key, missing fields
        return result.fail(transport, "CREDENTIALS_INVALID", f"Could not load service account credentials: {exc}")

    timeout = settings.SHEET_SYNC_TIMEOUT_SECONDS
    try:
        meta = session.get(
            f"{SHEETS_API}/{spreadsheet_id}",
            params={"fields": "properties.title,sheets.properties(sheetId,title,gridProperties.rowCount)"},
            timeout=timeout,
        )
    except Exception as exc:
        text = str(exc)
        if "invalid_grant" in text or "Invalid JWT" in text:
            return result.fail(transport, "CREDENTIALS_INVALID",
                               f"Google rejected the service account key (revoked or wrong key): {text}")
        return result.fail(transport, "NETWORK_ERROR", f"Could not reach the Google Sheets API: {text}")

    if meta.status_code != 200:
        message, reasons = _google_error(meta)
        if meta.status_code == 404:
            return result.fail(transport, "SPREADSHEET_NOT_FOUND",
                               f"Spreadsheet '{spreadsheet_id}' was not found. Check GOOGLE_SHEET_ID. ({message})")
        if meta.status_code == 403 and ("SERVICE_DISABLED" in reasons or "ACCESSNOTCONFIGURED" in reasons
                                        or "HAS NOT BEEN USED" in reasons):
            return result.fail(transport, "API_DISABLED",
                               "The Google Sheets API is not enabled for the service account's Google Cloud "
                               f"project. Enable it in the Cloud Console. ({message})")
        if meta.status_code == 403:
            return result.fail(transport, "PERMISSION_DENIED",
                               f"The service account {result.service_account_email} does not have access. Share the "
                               "spreadsheet with this e-mail address as a Viewer. "
                               f"({message})")
        if meta.status_code == 401:
            return result.fail(transport, "CREDENTIALS_INVALID", f"Google rejected the credentials: {message}")
        return result.fail(transport, "UNEXPECTED", f"Sheets API returned HTTP {meta.status_code}: {message}")

    sheets = meta.json().get("sheets", [])
    title = None
    for s in sheets:
        props = s.get("properties", {})
        if str(props.get("sheetId")) == str(gid):
            title = props.get("title")
            break
    if title is None:
        available = ", ".join(f"'{s['properties'].get('title')}' (gid {s['properties'].get('sheetId')})" for s in sheets)
        return result.fail(transport, "WORKSHEET_NOT_FOUND",
                           f"No worksheet with gid {gid} exists in the spreadsheet. Available: {available}")
    result.worksheet_title = title

    rng = quote("'" + title.replace("'", "''") + "'", safe="")
    try:
        values = session.get(
            f"{SHEETS_API}/{spreadsheet_id}/values/{rng}",
            params={"valueRenderOption": "FORMATTED_VALUE", "dateTimeRenderOption": "FORMATTED_STRING",
                    "majorDimension": "ROWS"},
            timeout=timeout,
        )
    except Exception as exc:
        return result.fail(transport, "NETWORK_ERROR", f"Failed while reading worksheet values: {exc}")
    if values.status_code != 200:
        message, _ = _google_error(values)
        return result.fail(transport, "UNEXPECTED", f"Reading worksheet values failed (HTTP {values.status_code}): {message}")

    grid = values.json().get("values", [])
    if not grid:
        result.ok = True
        result.transport = transport
        result.attempts.append({"transport": transport, "ok": True, "message": "Worksheet is empty"})
        return result
    result.headers = [str(h) for h in grid[0]]
    result.rows = [(i + 2, [str(c) for c in r]) for i, r in enumerate(grid[1:])]
    result.ok = True
    result.transport = transport
    result.attempts.append({"transport": transport, "ok": True, "message": f"Read {len(result.rows)} rows from '{title}'"})
    return result


def _fetch_via_apps_script(result: FetchResult, gid: str) -> FetchResult:
    transport = "APPS_SCRIPT"
    url = settings.GOOGLE_APPS_SCRIPT_WEBAPP_URL.strip()
    try:
        with httpx.Client(timeout=settings.SHEET_SYNC_TIMEOUT_SECONDS, follow_redirects=True) as client:
            resp = client.get(url, params={"action": "export", "gid": gid,
                                           "secret": settings.INTEGRATION_WEBHOOK_SECRET})
    except Exception as exc:
        return result.fail(transport, "NETWORK_ERROR", f"Could not reach the Apps Script web app: {exc}")
    if resp.status_code != 200:
        return result.fail(transport, "APPS_SCRIPT_ERROR", f"Apps Script web app returned HTTP {resp.status_code}")
    try:
        data = resp.json()
    except Exception:
        return result.fail(transport, "APPS_SCRIPT_ERROR",
                           "Apps Script web app did not return JSON. It must be deployed as a web app with access "
                           "'Anyone' and include the export action from google-apps-script/Code.gs.")
    if not data.get("success"):
        return result.fail(transport, "APPS_SCRIPT_ERROR", f"Apps Script export failed: {data.get('message')}")
    if "headers" in data and "rows" in data:
        result.headers = [str(h) for h in data["headers"]]
        result.rows = [(int(r.get("row")), [str(c) for c in r.get("values", [])]) for r in data["rows"]]
    else:  # legacy export format: list of keyed records with source_row_id "row_<n>_<uid>"
        result.headers = ["UID", "Name", "Role", "Date", "Entry Time", "Exit Time", "Status"]
        for i, rec in enumerate(data.get("records", [])):
            rn = None
            sid = str(rec.get("source_row_id") or "")
            if sid.startswith("row_"):
                try:
                    rn = int(sid.split("_")[1])
                except ValueError:
                    rn = None
            result.rows.append((rn or i + 2, [str(rec.get(h, "") or "") for h in result.headers]))
    result.worksheet_title = data.get("sheetName")
    result.ok = True
    result.transport = transport
    result.attempts.append({"transport": transport, "ok": True, "message": f"Read {len(result.rows)} rows"})
    return result


def _fetch_via_public_csv(result: FetchResult, spreadsheet_id: str, gid: str) -> FetchResult:
    transport = "PUBLIC_CSV"
    url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv&gid={gid}"
    try:
        with httpx.Client(timeout=settings.SHEET_SYNC_TIMEOUT_SECONDS, follow_redirects=True) as client:
            resp = client.get(url)
    except Exception as exc:
        return result.fail(transport, "NETWORK_ERROR", f"Could not reach docs.google.com: {exc}")
    ctype = resp.headers.get("content-type", "")
    if resp.status_code in (401, 403) or "text/html" in ctype:
        return result.fail(transport, "SHEET_PRIVATE",
                           f"The spreadsheet is private (HTTP {resp.status_code} for anonymous export). "
                           "Configure a service account (GOOGLE_SERVICE_ACCOUNT_JSON) and share the sheet with it.")
    if resp.status_code == 404:
        return result.fail(transport, "SPREADSHEET_NOT_FOUND", "Spreadsheet not found (HTTP 404).")
    if resp.status_code != 200:
        return result.fail(transport, "UNEXPECTED", f"CSV export returned HTTP {resp.status_code}")
    grid = list(csv.reader(io.StringIO(resp.text)))
    if grid:
        result.headers = grid[0]
        result.rows = [(i + 2, r) for i, r in enumerate(grid[1:])]
    result.ok = True
    result.transport = transport
    result.attempts.append({"transport": transport, "ok": True, "message": f"Read {len(result.rows)} rows"})
    return result


def fetch_worksheet(spreadsheet_id: Optional[str] = None, gid: Optional[str] = None) -> FetchResult:
    """Reads the configured worksheet using the first configured transport. If nothing is
    configured, probes anonymous access so the diagnostic says exactly what is required."""
    spreadsheet_id = spreadsheet_id or settings.GOOGLE_SHEET_ID
    gid = str(gid if gid is not None else settings.GOOGLE_SHEET_GID)
    result = FetchResult(ok=False)

    if not spreadsheet_id:
        return result.fail("NONE", "NOT_CONFIGURED", "GOOGLE_SHEET_ID is not set.")

    if service_account_configured():
        return _fetch_via_service_account(result, spreadsheet_id, gid)
    if settings.GOOGLE_APPS_SCRIPT_WEBAPP_URL.strip():
        return _fetch_via_apps_script(result, gid)

    probe = _fetch_via_public_csv(result, spreadsheet_id, gid)
    if probe.ok:
        return probe
    if probe.error_code == "SHEET_PRIVATE":
        return probe.fail(
            "NONE", "NOT_CONFIGURED",
            "No Google credentials are configured and the spreadsheet is not publicly readable "
            "(anonymous export returned HTTP 401). Set GOOGLE_SERVICE_ACCOUNT_JSON in .env to a service-account "
            "key file and share the spreadsheet with that service account's e-mail (Viewer)."
        )
    return probe
