"""One-time migration: copy every row from the local SQLite DB into a
Postgres DB (e.g. Supabase).

Usage:
    set DATABASE_URL=postgresql://user:pass@host:port/dbname
    python scripts/migrate_to_postgres.py

The local SQLite path is read from settings.db_path (default C:/bsc-vault/db/bsc.sqlite).
Postgres URL comes from DATABASE_URL env (same one prod uses).

What it does:
1. Creates all tables on Postgres (if not already present)
2. Iterates every table in dependency order, copying rows
3. Rewrites Asset.storage_path from absolute Windows paths to relative
   (videos/{asset_id}.{ext}) so the prod container can resolve them
4. Resets Postgres sequences for auto-increment PKs

Idempotent — re-running skips rows that already exist on Postgres."""
from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.config import settings  # noqa: E402
from app.db.models import (  # noqa: E402
    AdReference, Asset, AuditEvent, AutoTag, Brief, Concept,
    Hook, Ingest, PerformanceRow,
)
from app.db.session import Base  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


# Order matters — parents before children to satisfy FKs
COPY_ORDER = [
    Ingest,
    Concept,
    Asset,
    AdReference,
    PerformanceRow,
    AutoTag,
    Hook,
    Brief,
    AuditEvent,
]

# Tables with auto-increment PKs that need sequence-reset after bulk load
SEQUENCE_TABLES = {
    Ingest: ("ingests", "id"),
    Concept: None,  # PK is concept_id string
    Asset: None,    # PK is asset_id string
    AdReference: ("ad_references", "id"),
    PerformanceRow: ("performance_rows", "id"),
    AutoTag: ("auto_tags", "id"),
    Hook: ("hooks", "id"),
    Brief: ("briefs", "id"),
    AuditEvent: ("audit_events", "id"),
}


def _normalize_storage_path(asset_dict: dict) -> dict:
    """Rewrite absolute Windows paths to relative paths-against-vault."""
    sp = asset_dict.get("storage_path") or ""
    p = Path(sp)
    if p.is_absolute() and sp:
        ext = p.suffix
        if not ext or len(ext) > 6:
            ext = ".mp4" if asset_dict.get("asset_type") == "video" else ".webp"
        asset_dict["storage_path"] = f"videos/{asset_dict['asset_id']}{ext}"
    return asset_dict


def _row_to_dict(row, model) -> dict:
    """Pull all column values out of a model instance as a plain dict."""
    out = {}
    for c in model.__table__.columns:
        out[c.name] = getattr(row, c.name)
    return out


def _existing_pks(session, model) -> set:
    pk_col = list(model.__table__.primary_key.columns)[0]
    return {r[0] for r in session.query(pk_col).all()}


def main():
    pg_url = os.getenv("DATABASE_URL")
    if not pg_url:
        log.error("Set DATABASE_URL env var to the Postgres connection string before running.")
        sys.exit(1)

    # Normalize Postgres URL
    if pg_url.startswith("postgres://"):
        pg_url = "postgresql+psycopg://" + pg_url[len("postgres://"):]
    elif pg_url.startswith("postgresql://"):
        pg_url = "postgresql+psycopg://" + pg_url[len("postgresql://"):]

    sqlite_url = settings.db_url
    log.info("Source SQLite: %s", sqlite_url)
    log.info("Target Postgres: %s", pg_url.split("@")[-1])  # hide creds in log

    sqlite_engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})
    pg_engine = create_engine(pg_url, pool_pre_ping=True)

    log.info("Creating Postgres schema (if not already present)…")
    Base.metadata.create_all(bind=pg_engine)

    SqliteSession = sessionmaker(bind=sqlite_engine)
    PgSession = sessionmaker(bind=pg_engine)
    s_src = SqliteSession()
    s_dst = PgSession()

    total_inserted = 0
    try:
        for model in COPY_ORDER:
            existing = _existing_pks(s_dst, model)
            rows = s_src.query(model).all()
            inserted_in_table = 0
            for r in rows:
                d = _row_to_dict(r, model)
                pk_col_name = list(model.__table__.primary_key.columns)[0].name
                if d.get(pk_col_name) in existing:
                    continue
                if model is Asset:
                    d = _normalize_storage_path(d)
                s_dst.execute(model.__table__.insert().values(**d))
                inserted_in_table += 1
            s_dst.commit()
            total_inserted += inserted_in_table
            log.info("  %-22s  %d rows inserted (skipped %d existing)",
                     model.__tablename__, inserted_in_table, len(rows) - inserted_in_table)

        # Reset sequences for auto-increment PKs
        log.info("Resetting Postgres sequences for auto-increment PKs…")
        with pg_engine.begin() as conn:
            for model, seq in SEQUENCE_TABLES.items():
                if seq is None:
                    continue
                table, col = seq
                conn.execute(text(
                    f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), "
                    f"COALESCE((SELECT MAX({col}) FROM {table}), 1), true)"
                ))

        log.info("Migration complete. %d total rows inserted.", total_inserted)
    finally:
        s_src.close()
        s_dst.close()


if __name__ == "__main__":
    main()
