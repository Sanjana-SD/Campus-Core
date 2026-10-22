"""
Pure parsing helpers for the Google Form / RFID response worksheet.

Nothing in this module touches the database or the network, so every rule here is
covered by deterministic unit tests.
"""
import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Dict, List, Optional, Tuple

# Canonical field -> accepted header spellings (compared after normalisation)
HEADER_ALIASES: Dict[str, List[str]] = {
    "uid": ["uid", "rfiduid", "rfid", "carduid", "cardid", "tagid", "taguid", "rfidtag", "rfidcard"],
    "name": ["name", "fullname", "studentname", "personname"],
    "role": ["role", "usertype", "persontype", "category", "designation"],
    "date": ["date", "attendancedate", "scandate", "day"],
    "entry_time": ["entrytime", "entry", "intime", "timein", "checkin", "checkintime", "entrytimestamp"],
    "exit_time": ["exittime", "exit", "outtime", "timeout", "checkout", "checkouttime", "exittimestamp"],
    "status": ["status", "attendancestatus", "remarks"],
}
REQUIRED_FIELDS = ["uid", "date"]
EMPTY_MARKERS = {"", "-", "--", "n/a", "na", "null", "none", "nil"}


def normalize_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(h or "").lower())


def map_headers(headers: List[str]) -> Tuple[Dict[str, int], List[str], List[str]]:
    """Returns (field -> column index, missing required fields, unmapped headers)."""
    mapping: Dict[str, int] = {}
    unmapped: List[str] = []
    for idx, raw in enumerate(headers):
        key = normalize_header(raw)
        matched = None
        for fld, aliases in HEADER_ALIASES.items():
            if key in aliases and fld not in mapping:
                matched = fld
                break
        if matched:
            mapping[matched] = idx
        elif str(raw or "").strip():
            unmapped.append(str(raw).strip())
    missing = [f for f in REQUIRED_FIELDS if f not in mapping]
    return mapping, missing, unmapped


def clean_cell(v) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return None if s.lower() in EMPTY_MARKERS else s


def normalize_uid(raw: Optional[str]) -> Optional[str]:
    """UIDs are kept as strings: whitespace removed, upper-cased, leading zeros preserved.
    A '0x' hex prefix is stripped because readers differ on whether they print it."""
    if raw is None:
        return None
    s = re.sub(r"\s+", "", str(raw))
    if s.lower().startswith("0x") and len(s) > 2:
        s = s[2:]
    s = s.upper()
    return s or None


DATE_FORMATS_DMY = ["%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y", "%d-%m-%y"]
DATE_FORMATS_MDY = ["%m/%d/%Y", "%m-%d-%Y", "%m.%d.%Y", "%m/%d/%y", "%m-%d-%y"]
DATE_FORMATS_UNAMBIGUOUS = [
    "%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y",
    "%d-%b-%Y", "%d-%b-%y", "%a, %d %b %Y", "%A, %d %B %Y",
]


def parse_date(raw: Optional[str], order: str = "DMY") -> Tuple[Optional[date], Optional[str]]:
    """Returns (date, issue). Ambiguous numeric dates follow `order` and are reported."""
    s = clean_cell(raw)
    if not s:
        return None, "Date is empty"
    # Accept "2026-10-20 09:00:00" / "20/10/2026 09:00:00" (date part only)
    s_date = re.split(r"[ T](?=\d{1,2}:\d{2})", s)[0].strip()
    for fmt in DATE_FORMATS_UNAMBIGUOUS:
        try:
            return datetime.strptime(s_date, fmt).date(), None
        except ValueError:
            pass
    primary, secondary = (DATE_FORMATS_DMY, DATE_FORMATS_MDY) if order.upper() == "DMY" else (DATE_FORMATS_MDY, DATE_FORMATS_DMY)
    for fmt in primary:
        try:
            return datetime.strptime(s_date, fmt).date(), None
        except ValueError:
            pass
    for fmt in secondary:
        try:
            return datetime.strptime(s_date, fmt).date(), None
        except ValueError:
            pass
    return None, f"Unrecognised date '{s}'"


TIME_FORMATS = [
    "%H:%M:%S", "%H:%M", "%I:%M:%S %p", "%I:%M %p", "%I:%M:%S%p", "%I:%M%p", "%H.%M", "%H.%M.%S",
    "%I.%M %p", "%H:%M:%S.%f",
]


def parse_time(raw: Optional[str]) -> Tuple[Optional[time], Optional[str]]:
    """Returns (time, issue). Empty input returns (None, None): an empty cell is not an error."""
    s = clean_cell(raw)
    if not s:
        return None, None
    # A full timestamp in the time column: keep the time part.
    m = re.search(r"(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\.\d+)?\s*(?:[AaPp]\.?[Mm]\.?)?)\s*$", s)
    candidate = m.group(1) if m else s
    candidate = re.sub(r"([AaPp])\.?([Mm])\.?", lambda x: (x.group(1) + x.group(2)).upper(), candidate).strip()
    for fmt in TIME_FORMATS:
        try:
            return datetime.strptime(candidate, fmt).time().replace(microsecond=0), None
        except ValueError:
            pass
    return None, f"Unrecognised time '{s}'"


def classify_role(raw: Optional[str]) -> str:
    s = (clean_cell(raw) or "").lower()
    if not s:
        return "UNKNOWN"
    if s.startswith("stud") or s in {"pupil", "learner"}:
        return "STUDENT"
    if any(k in s for k in ("lectur", "faculty", "teacher", "professor", "staff", "hod", "instructor")):
        return "LECTURER"
    return "OTHER"


@dataclass
class ParsedRow:
    row_number: Optional[int]
    raw: Dict[str, Optional[str]]
    extra: Dict[str, str]
    uid: Optional[str] = None
    event_date: Optional[date] = None
    entry_time: Optional[time] = None
    exit_time: Optional[time] = None
    role_category: str = "UNKNOWN"
    validity: str = "VALID"
    issues: List[str] = field(default_factory=list)

    @property
    def content_hash(self) -> str:
        payload = json.dumps({"raw": self.raw, "extra": self.extra}, sort_keys=True, default=str)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def identity_base(self) -> str:
        return "|".join([
            self.uid or (self.raw.get("uid") or ""),
            (self.raw.get("date") or "").strip(),
            (self.raw.get("entry_time") or "").strip(),
        ])


def make_source_key(identity_base: str, occurrence: int) -> str:
    return hashlib.sha256(f"{identity_base}#{occurrence}".encode("utf-8")).hexdigest()[:40]


def parse_row(values: List[str], mapping: Dict[str, int], headers: List[str],
              row_number: Optional[int], date_order: str = "DMY") -> ParsedRow:
    def get(fld: str) -> Optional[str]:
        idx = mapping.get(fld)
        if idx is None or idx >= len(values):
            return None
        v = values[idx]
        return None if v is None else str(v)

    raw = {f: get(f) for f in HEADER_ALIASES.keys()}
    mapped_idx = set(mapping.values())
    extra = {}
    for i, h in enumerate(headers):
        if i not in mapped_idx and i < len(values) and str(values[i] or "").strip():
            extra[str(h or f"col_{i + 1}")] = str(values[i])

    row = ParsedRow(row_number=row_number, raw=raw, extra=extra)
    row.uid = normalize_uid(clean_cell(raw["uid"]))
    if not row.uid:
        row.issues.append("UID is empty")

    row.event_date, d_issue = parse_date(raw["date"], date_order)
    if d_issue:
        row.issues.append(d_issue)

    row.entry_time, e_issue = parse_time(raw["entry_time"])
    if e_issue:
        row.issues.append(f"Entry: {e_issue}")
    row.exit_time, x_issue = parse_time(raw["exit_time"])
    if x_issue:
        row.issues.append(f"Exit: {x_issue}")

    row.role_category = classify_role(raw["role"])

    if not row.uid or not row.event_date or e_issue or x_issue:
        row.validity = "INVALID"
    elif row.entry_time and row.exit_time and row.exit_time < row.entry_time:
        row.validity = "INVALID"
        row.issues.append("Exit time is earlier than entry time")
    elif not row.entry_time and not row.exit_time:
        row.validity = "INVALID"
        row.issues.append("Neither entry nor exit time recorded")
    elif not row.entry_time:
        row.validity = "INCOMPLETE"
        row.issues.append("Missing entry time")
    elif not row.exit_time:
        row.validity = "INCOMPLETE"
        row.issues.append("Missing exit time")
    return row


def assign_source_keys(rows: List[ParsedRow]) -> List[Tuple[str, ParsedRow]]:
    """Fingerprint every row. Exact duplicates of (UID, Date, Entry Time) are numbered by
    their order of appearance so each keeps a distinct, stable identity."""
    seen: Dict[str, int] = {}
    out = []
    for r in rows:
        base = r.identity_base()
        occ = seen.get(base, 0)
        seen[base] = occ + 1
        out.append((make_source_key(base, occ), r))
    return out
