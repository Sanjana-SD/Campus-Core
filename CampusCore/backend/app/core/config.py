import os
from typing import List
from pydantic_settings import BaseSettings

# backend/app/core/config.py -> project root is three levels above backend/app
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROJECT_ROOT = os.path.abspath(os.path.join(BACKEND_DIR, ".."))


def _resolve_sqlite_url(url: str) -> str:
    """Resolve relative SQLite paths against the project root so the same database
    file is used regardless of the directory the server is launched from."""
    prefix = "sqlite:///"
    if url.startswith(prefix) and not url.startswith("sqlite:///:memory:"):
        path = url[len(prefix):]
        if not os.path.isabs(path):
            return prefix + os.path.abspath(os.path.join(PROJECT_ROOT, path)).replace("\\", "/")
    return url


class Settings(BaseSettings):
    PROJECT_NAME: str = "Campus Core"
    TAGLINE: str = "One Campus. One Core. Everything Connected."
    VERSION: str = "1.1.0"
    API_V1_STR: str = "/api/v1"

    # Security
    SECRET_KEY: str = "change-me-in-env"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Database
    DATABASE_URL: str = "sqlite:///./campuscore.db"
    AUTO_MIGRATE: bool = True

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
    ]

    # Google Sheets Attendance Integration (existing Google Form response spreadsheet)
    GOOGLE_SHEET_ID: str = "1CLlTz9hZ3IdChuTO9gx4Fusf5CspohMhyqn3Pwar_xw"
    GOOGLE_SHEET_GID: str = "0"
    GOOGLE_SHEET_URL: str = "https://docs.google.com/spreadsheets/d/1CLlTz9hZ3IdChuTO9gx4Fusf5CspohMhyqn3Pwar_xw/edit?gid=0#gid=0"
    # Service account credentials (server-side only). Either a path to the JSON key
    # file (relative paths resolve against the project root) or the raw JSON content.
    GOOGLE_SERVICE_ACCOUNT_JSON: str = ""
    GOOGLE_SERVICE_ACCOUNT_INFO: str = ""
    # Optional: the existing Apps Script web app (?action=export) as an alternative reader.
    GOOGLE_APPS_SCRIPT_WEBAPP_URL: str = ""
    INTEGRATION_WEBHOOK_SECRET: str = ""
    # Ordering used when a date like 03/04/2026 is ambiguous: DMY or MDY
    SHEET_DATE_ORDER: str = "DMY"
    SHEET_SYNC_TIMEOUT_SECONDS: float = 30.0

    # Academic & Attendance Policies (initial defaults; editable in the app)
    COLLEGE_TIMEZONE: str = "Asia/Kolkata"
    ATTENDANCE_THRESHOLD_PERCENT: float = 75.0
    LATE_ARRIVAL_GRACE_MINUTES: int = 10
    AUTO_RECONCILE_UPDATED_ROWS: bool = True

    # File Storage
    UPLOAD_DIR: str = os.path.join(BACKEND_DIR, "uploads")
    MAX_UPLOAD_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB

    class Config:
        env_file = os.path.join(PROJECT_ROOT, ".env")
        extra = "allow"

    @property
    def database_url(self) -> str:
        return _resolve_sqlite_url(self.DATABASE_URL)

    @property
    def service_account_path(self) -> str:
        p = self.GOOGLE_SERVICE_ACCOUNT_JSON.strip()
        if p and not p.lstrip().startswith("{") and not os.path.isabs(p):
            return os.path.join(PROJECT_ROOT, p)
        return p


settings = Settings()
