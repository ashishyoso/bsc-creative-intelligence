"""
Inspiration tool DB session.

Separate engine from the pilot — pilot stays on SQLite per existing
db/session.py, Inspiration runs against Supabase Postgres.

Env: INSPIRATION_DATABASE_URL (preferred) or falls back to DATABASE_URL.
On both being unset, raises at first use (Inspiration cannot run on SQLite —
the schema uses ENUMs, TEXT[], JSONB, TIMESTAMPTZ).
"""
from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


def _resolve_url() -> str:
    url = os.getenv("INSPIRATION_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "INSPIRATION_DATABASE_URL (or DATABASE_URL) is required. "
            "Inspiration uses Postgres — provision Supabase first."
        )
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    elif url.startswith("postgresql+psycopg2://"):
        url = "postgresql+psycopg://" + url[len("postgresql+psycopg2://"):]
    return url


_engine = None
_SessionLocal = None
Base = declarative_base()


def _ensure_engine():
    global _engine, _SessionLocal
    if _engine is None:
        _engine = create_engine(
            _resolve_url(),
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
    return _engine


def engine():
    return _ensure_engine()


def get_db():
    _ensure_engine()
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- Idempotent schema bootstrap ----------------------------------------
# Railway's Data-tab SQL editor doesn't reliably run multi-statement files,
# so we ensure ENUM types + tables exist via the ORM at startup. Safe to
# call repeatedly — Postgres DO-blocks swallow duplicate_object, and
# Base.metadata.create_all skips existing tables.

_INSPIRATION_ENUMS = (
    ("source_channel", ("meta_ad_library", "meta_marketing", "youtube", "tiktok", "brand_site", "manual")),
    ("user_role", ("editor", "strategist", "senior_reviewer", "ops_lead", "founder", "admin")),
    ("video_status", ("pending", "saved", "rejected", "escalated")),
    ("decision_action", ("saved", "rejected", "escalated")),
    ("replicability_tier", ("yes", "stretch", "no")),
    ("watchlist_priority", ("high", "medium", "low")),
)


def ensure_schema() -> None:
    """Create Inspiration ENUM types + tables if missing. Idempotent."""
    # Force model registration before create_all (no-op if already imported).
    from app.inspiration import models  # noqa: F401

    eng = _ensure_engine()
    with eng.begin() as conn:
        for name, values in _INSPIRATION_ENUMS:
            vals = ", ".join(f"'{v}'" for v in values)
            conn.exec_driver_sql(
                f"DO $$ BEGIN "
                f"CREATE TYPE {name} AS ENUM ({vals}); "
                f"EXCEPTION WHEN duplicate_object THEN null; "
                f"END $$;"
            )
    Base.metadata.create_all(bind=eng)
