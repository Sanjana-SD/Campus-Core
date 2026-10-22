import logging
import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.core.config import BACKEND_DIR, PROJECT_ROOT, settings
from app.core.database import Base, engine, get_db
from app.api.v1.api import api_router
from app.api.deps import verify_integration_secret
from app.schemas.schemas import AttendanceIngestBatch
import app.models  # noqa: F401  (registers every model on the metadata)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("campuscore")


def prepare_database() -> None:
    """Create missing tables, then apply migrations (adds new columns to existing tables)."""
    Base.metadata.create_all(bind=engine)
    if not settings.AUTO_MIGRATE:
        return
    try:
        from alembic import command
        from alembic.config import Config
        cfg = Config(os.path.join(PROJECT_ROOT, "alembic.ini"))
        cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic").replace("\\", "/"))
        command.upgrade(cfg, "head")
    except Exception:
        logger.exception("Database migration failed; run `alembic upgrade head` from the project root")
        raise


prepare_database()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Campus Core: centralized college management, timetable-based RFID attendance and placements",
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.post("/api/integrations/google-sheets/attendance", tags=["Google Sheets & RFID"])
def direct_ingest_attendance(
    payload: AttendanceIngestBatch,
    is_authorized: bool = Depends(verify_integration_secret),
    db: Session = Depends(get_db),
):
    """Alias of /api/v1/integrations/google-sheets/attendance kept for existing Apps Script deployments."""
    from app.api.v1.endpoints.integrations import handle_webhook
    return handle_webhook(payload, db)


@app.get("/", tags=["Health"])
def root():
    return {"product": settings.PROJECT_NAME, "tagline": settings.TAGLINE, "status": "healthy",
            "version": settings.VERSION, "docs": "/docs"}


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "Campus Core Backend"}
