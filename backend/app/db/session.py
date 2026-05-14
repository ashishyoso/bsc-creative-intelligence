from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings


def _resolve_db_url() -> str:
    """
    Production: DATABASE_URL env var pointing at Postgres (e.g. Supabase).
    Local dev:  falls back to SQLite at settings.db_path.

    Accepts both postgres:// and postgresql:// schemes. Supabase + Heroku-style
    URLs use postgres://; SQLAlchemy 2.x prefers postgresql+psycopg://.
    """
    url = os.getenv("DATABASE_URL")
    if not url:
        settings.db_path.parent.mkdir(parents=True, exist_ok=True)
        return settings.db_url

    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    elif url.startswith("postgresql+psycopg2://"):
        url = "postgresql+psycopg://" + url[len("postgresql+psycopg2://"):]
    return url


_DB_URL = _resolve_db_url()
_IS_SQLITE = _DB_URL.startswith("sqlite")

engine = create_engine(
    _DB_URL,
    connect_args={"check_same_thread": False} if _IS_SQLITE else {},
    pool_pre_ping=True,
    pool_size=5 if not _IS_SQLITE else 0,
    max_overflow=10 if not _IS_SQLITE else 0,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
