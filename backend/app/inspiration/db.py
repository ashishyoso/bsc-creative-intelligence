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
