"""timetable attendance, google sheets import, placement management

Adds the Placement Officer role, new columns on existing tables, and the tables for
sheet import, class sessions, per-class attendance and placements.

The upgrade inspects the live schema and only adds what is missing, so it is safe on the
existing SQLite database, on a fresh database where tables were created from the models,
and on PostgreSQL. Existing rows are preserved.

Revision ID: c3a1d2e4f5b6
Revises: bf6eff6b38f6
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c3a1d2e4f5b6"
down_revision: Union[str, None] = "bf6eff6b38f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_COLUMNS = {
    "student_profiles": [
        sa.Column("graduation_year", sa.Integer(), nullable=True),
        sa.Column("cgpa", sa.Float(), nullable=True),
        sa.Column("active_backlogs", sa.Integer(), nullable=True),
        sa.Column("enrollment_status", sa.String(30), nullable=True, server_default="ACTIVE"),
    ],
    "lecturer_profiles": [
        sa.Column("rfid_uid", sa.String(100), nullable=True),
    ],
    "class_schedules": [
        sa.Column("academic_term", sa.String(50), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=True),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    ],
    "notifications": [
        sa.Column("dedupe_key", sa.String(200), nullable=True),
    ],
    "attendance_policies": [
        sa.Column("present_min_percent", sa.Float(), nullable=True, server_default="75"),
        sa.Column("partial_min_percent", sa.Float(), nullable=True, server_default="25"),
        sa.Column("min_required_minutes", sa.Integer(), nullable=True),
        sa.Column("missing_exit_policy", sa.String(30), nullable=True, server_default="PENDING_VERIFICATION"),
        sa.Column("missing_entry_policy", sa.String(30), nullable=True, server_default="PENDING_VERIFICATION"),
        sa.Column("count_late_as_attended", sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column("count_partial_as_attended", sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column("tracking_start_date", sa.Date(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=True, server_default="1"),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
    ],
}

NEW_TABLES = [
    "sync_runs", "sheet_attendance_rows", "sheet_row_revisions", "timetable_breaks", "class_sessions",
    "subject_enrollments", "subject_attendance_rules", "attendance_records", "attendance_corrections",
    "attendance_disputes", "companies", "placement_drives", "placement_eligibility_exceptions",
    "placement_applications", "selection_stage_history", "placement_offers",
]


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1. New role value (PostgreSQL stores the enum natively; SQLite uses VARCHAR).
    if bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'PLACEMENT_OFFICER'")

    # 2. Columns on existing tables.
    existing_tables = set(insp.get_table_names())
    for table, cols in NEW_COLUMNS.items():
        if table not in existing_tables:
            continue
        have = {c["name"] for c in insp.get_columns(table)}
        for col in cols:
            if col.name not in have:
                op.add_column(table, col.copy())

    if "lecturer_profiles" in existing_tables:
        idx = {i["name"] for i in sa.inspect(bind).get_indexes("lecturer_profiles")}
        if "ix_lecturer_profiles_rfid_uid" not in idx:
            op.create_index("ix_lecturer_profiles_rfid_uid", "lecturer_profiles", ["rfid_uid"], unique=True)
    if "class_schedules" in existing_tables:
        op.execute("UPDATE class_schedules SET is_active = " + ("true" if bind.dialect.name == "postgresql" else "1")
                   + " WHERE is_active IS NULL")
    if "student_profiles" in existing_tables:
        op.execute("UPDATE student_profiles SET enrollment_status = 'ACTIVE' WHERE enrollment_status IS NULL")

    # 3. New tables, created from the current model definitions.
    from app.models import extended  # noqa: F401  (registers the tables on the metadata)
    from app.core.database import Base
    current = set(sa.inspect(bind).get_table_names())
    for name in NEW_TABLES:
        if name not in current:
            Base.metadata.tables[name].create(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    current = set(sa.inspect(bind).get_table_names())
    for name in reversed(NEW_TABLES):
        if name in current:
            op.drop_table(name)
    for table, cols in NEW_COLUMNS.items():
        if table not in current:
            continue
        with op.batch_alter_table(table) as batch:
            for col in cols:
                batch.drop_column(col.name)
