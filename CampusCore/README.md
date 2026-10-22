# Campus Core

> **One Campus. One Core. Everything Connected.**

Campus Core is a college management platform: students, lecturers, academics, timetable-based
RFID attendance, assignments, examinations, results, announcements and placement management —
for four roles: **Admin, Lecturer, Student, Placement Officer**.

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, lucide-react, React Router
- **Backend:** FastAPI, SQLAlchemy 2, Pydantic v2, Alembic, SQLite (dev) / PostgreSQL
- **Auth:** bcrypt password hashing, JWT bearer tokens, role checks on every protected endpoint

---

## 1. Quick start (local)

```powershell
# from the project root (this folder)
python -m pip install -r backend/requirements.txt
copy .env.example .env          # then edit SECRET_KEY etc.
python backend/app/seed.py      # demo data on an empty DB; also ensures the Placement Officer account
cd backend; python -m uvicorn app.main:app --port 8000     # API + docs at http://localhost:8000/docs

# second terminal
cd frontend; npm install; npm run dev                       # http://localhost:5173
```

On startup the backend creates missing tables and runs `alembic upgrade head` (set
`AUTO_MIGRATE=false` to manage migrations manually: `alembic upgrade head` from the project root).
Relative SQLite paths always resolve against the project root, so the same `campuscore.db` is
used regardless of the directory the server is started from.

Demo accounts (seed data): `admin/admin123`, `turing/lecturer123`, `rahul/student123`,
`placement/placement123`.

---

## 2. Google Form / Google Sheets RFID integration

The existing RFID hardware, Apps Script and Google Form response spreadsheet are unchanged:

| Setting | Value |
|---|---|
| Spreadsheet | `1CLlTz9hZ3IdChuTO9gx4Fusf5CspohMhyqn3Pwar_xw` |
| Worksheet gid | `0` |
| Expected columns | `UID, Name, Role, Date, Entry Time, Exit Time, Status` (similar spellings are mapped; extra columns are kept as source data) |

### Why data was not appearing (diagnosed)
1. The spreadsheet is **private** — anonymous CSV export returns HTTP 401 — and no Google
   credentials were configured, so every pull failed.
2. The Apps Script push webhook pointed at `http://localhost:8000`, which Google's servers can
   never reach.
3. The dashboards showed **seeded sample rows** stored as if they came from the sheet; no
   synchronisation had ever succeeded. Seeding no longer creates RFID data, and the UI reads
   only imported sheet rows.
4. The old import merged all scans of a student into one record per day (the Apps Script writes
   one row per entry→exit session) and computed attendance as days ÷ a fixed 60.

### Connect it (one-time, server-side)
1. In Google Cloud, create a project → enable the **Google Sheets API** → create a **service account** → create a JSON key.
2. Save the key as `config/google-service-account.json` (git-ignored) and set
   `GOOGLE_SERVICE_ACCOUNT_JSON=config/google-service-account.json` in `.env`.
3. Open the spreadsheet → **Share** → add the service account e-mail (`...@...iam.gserviceaccount.com`) as **Viewer**.
4. Restart the backend → **Admin → Google Sheets → Test connection**, then **Synchronize now**.

The integration page reports the exact failure (`NOT_CONFIGURED`, `CREDENTIALS_FILE_MISSING`,
`CREDENTIALS_INVALID`, `API_DISABLED`, `PERMISSION_DENIED`, `SPREADSHEET_NOT_FOUND`,
`WORKSHEET_NOT_FOUND`, `HEADERS_MISSING`, `NETWORK_ERROR`). Credentials never reach the browser.

Alternative reader: the existing Apps Script web app (`GOOGLE_APPS_SCRIPT_WEBAPP_URL`) using the
`?action=export&gid=0&secret=…` action in `google-apps-script/Code.gs` (redeploy the script after
updating it; export is refused unless `WEBHOOK_SECRET` is set). Optional real-time push:
`POST /api/v1/integrations/google-sheets/attendance` with `X-Integration-Secret`, only when the
backend has a public HTTPS URL.

### Synchronisation rules
- Each sheet row = one presence interval. Identity = fingerprint of (UID, Date, Entry Time,
  occurrence), so filling in Exit Time later updates the same record and re-syncs never duplicate.
- Changed rows are updated and the old/new source values are stored as revisions; rows deleted
  from the sheet are flagged *removed from sheet* (never deleted) and excluded from calculations.
  Editing a row's Entry Time in the sheet is treated as remove + add.
- Original values (UID, Name, Role, Date, Entry, Exit, Status) are stored verbatim and shown
  separately from calculated attendance.
- UIDs are strings (leading zeros kept). Matching is by exact UID only — never by name.
  Unknown UIDs, UIDs that differ only by leading zeros, and role conflicts go to
  **Admin → Unmatched UIDs** for review/mapping. Lecturer/staff rows are never student attendance.
- Ambiguous numeric dates use `SHEET_DATE_ORDER` (`DMY` default).

> Note: the live spreadsheet could not be inspected during development (it is private and no
> credentials were available), so the source format above was taken from the existing
> `Code.gs`. Run **Test connection** once credentials exist to confirm headers and rows.

---

## 3. Timetable-based attendance

For each scheduled class session a student is expected to attend (their section's timetable,
minus admin-recorded dropped subjects, from the tracking start date):

- **Attended minutes** = union of the student's complete RFID intervals clipped to the class
  window (overlaps never double-counted; time outside the class never counts).
- **Duration %** = attended ÷ scheduled minutes × 100. Example: 09:00–10:00 class, entry 09:10,
  exit 10:00 → 50/60 = 83.33%.
- **Status:** ≥ *present threshold* → `PRESENT` (or `LATE` if first presence is after start +
  grace); ≥ *partial threshold* → `PARTIAL`; otherwise `ABSENT`. A scan with a missing exit/entry
  that could overlap the class → `PENDING_VERIFICATION` (or `ABSENT` if the policy says so); it
  is never treated as presence and timestamps are never invented. Cancelled classes → `CANCELLED`;
  manual `EXCUSED` is supported.
- **Subject / overall %** = attended ÷ applicable classes; attended = Present (+ Late, + Partial
  per policy); applicable excludes Cancelled and Excused; Pending counts as not attended until
  resolved.
- Manual corrections are audited and survive recalculation (flagged if the evidence changes).
  Timetable edits version the entry so past sessions keep their original times.
- Tracking starts at the policy's *tracking start date*, or by default the first date with RFID
  evidence — so nobody is marked absent before data exists.

All thresholds, grace period, missing-scan handling and subject overrides are configurable in
**Admin → Attendance Policy**; changes bump the policy version and recalculate.

---

## 4. Placement management

Placement Officers manage companies, drives (draft → published → in progress → completed /
cancelled; *upcoming / applications open / closed* derived from dates), eligibility (department,
branch, semester, graduation year, CGPA, backlogs; missing data = *incomplete information*, not
ineligible; officer exceptions), applications, registration, drive attendance, selection stages,
results, offers and confirmed placements, with an audit trail, notifications and CSV/print reports.

Definitions: *upcoming drives* = published, non-cancelled, drive date ≥ today; *open
applications* = application window currently open; *offers received* = recorded offers
(a student may have several); *unique students placed* = distinct students with a confirmed placement.

---

## 5. Permission matrix (enforced in the backend)

| Area | Admin | Lecturer | Student | Placement Officer |
|---|---|---|---|---|
| Students / lecturers / academics / timetable admin | ✔ | – | – | – |
| Google Sheets, RFID source data, UID mapping, policy | ✔ | – | – | – |
| Class attendance records | all | own classes (view, correct, export) | own only | – |
| Users & roles | ✔ | – | – | – |
| Companies, drives, applicants, results, offers, reports | ✔ (oversight) | – | – | ✔ |
| Browse drives, apply, own applications & history | – | – | ✔ | – |
| Notifications | own | own | own | own |

Students cannot read other students' records by changing IDs: personal endpoints take the
student from the token.

---

## 6. Tests

```powershell
python -m pytest -q          # backend: parsing, attendance engine, sync, permissions, placements
cd frontend; npm run build   # type-check + production bundle
npm run lint                 # oxlint
```

Backend tests use an in-memory database and deterministic sheet fixtures; they do not touch
`campuscore.db` or the live spreadsheet and are not proof of live connectivity.

## 7. Docker

`docker-compose up -d --build` (PostgreSQL + API + Nginx SPA). Provide secrets via environment /
`.env`, and mount the service-account key into the backend container.
