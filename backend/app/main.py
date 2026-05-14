from __future__ import annotations

import base64
import logging
import mimetypes
import os
import secrets
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from sqlalchemy import inspect
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import admin as admin_router
from app.api import assets as assets_router
from app.api import briefs as briefs_router
from app.api import calendar as calendar_router
from app.api import concepts as concepts_router
from app.api import formula as formula_router
from app.api import hooks as hooks_router
from app.api import ingest as ingest_router
from app.api import leaderboards as leaderboards_router
from app.api import mapping as mapping_router
from app.api import persona as persona_router
from app.api import quality as quality_router
from app.api import review as review_router
from app.config import settings
from app.db import models  # noqa: F401 -- register models
from app.db.session import Base, engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger(__name__)


def _init_db():
    settings.vault_root.mkdir(parents=True, exist_ok=True)
    settings.videos_dir.mkdir(parents=True, exist_ok=True)
    settings.frames_dir.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    insp = inspect(engine)
    log.info("DB tables: %s", insp.get_table_names())


def resolve_asset_path(storage_path: str | None) -> Path | None:
    """Resolve an Asset.storage_path to a real filesystem path.

    Stored paths can be:
    - Absolute (legacy local dev: 'C:\\bsc-vault\\videos\\XXX.mp4')
    - Relative (post-migration: 'videos/XXX.mp4'), resolved against VAULT_ROOT

    Returns None if the value is empty/missing.
    """
    if not storage_path:
        return None
    p = Path(storage_path)
    if p.is_absolute() and p.exists():
        return p
    # Relative path → resolve against vault_root
    candidate = settings.vault_root / storage_path
    if candidate.exists():
        return candidate
    # Try with just the basename (last-resort fallback for moved vaults)
    fallback = settings.videos_dir / Path(storage_path).name
    if fallback.exists():
        return fallback
    return None


# ---------------- Basic auth middleware (env-gated) ----------------

BASIC_AUTH_USER = os.getenv("BASIC_AUTH_USER")
BASIC_AUTH_PASS = os.getenv("BASIC_AUTH_PASS")

# Paths that bypass auth (health probes, CORS preflight). Everything else
# requires Authorization: Basic <base64(user:pass)>.
_AUTH_BYPASS_PATHS = {"/health"}


class BasicAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not BASIC_AUTH_USER or not BASIC_AUTH_PASS:
            return await call_next(request)
        if request.method == "OPTIONS" or request.url.path in _AUTH_BYPASS_PATHS:
            return await call_next(request)
        auth = request.headers.get("authorization", "")
        if auth.startswith("Basic "):
            try:
                decoded = base64.b64decode(auth[6:]).decode("utf-8")
                user, _, pwd = decoded.partition(":")
                if secrets.compare_digest(user, BASIC_AUTH_USER) and secrets.compare_digest(pwd, BASIC_AUTH_PASS):
                    return await call_next(request)
            except Exception:
                pass
        return JSONResponse(
            {"detail": "auth required"},
            status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="YOSO-BSC"'},
        )


# ---------------- CORS origins ----------------
# In prod set CORS_ORIGINS=https://yoursite.vercel.app,https://api.yoursite.com
_cors_env = os.getenv("CORS_ORIGINS", "")
CORS_ORIGINS = (
    [o.strip() for o in _cors_env.split(",") if o.strip()]
    if _cors_env
    else ["http://localhost:3000", "http://127.0.0.1:3000"]
)


app = FastAPI(title="YOSO-BSC Creative Intelligence", version="0.2.0")
app.add_middleware(BasicAuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_init_db()

app.include_router(ingest_router.router)
app.include_router(assets_router.router)
app.include_router(mapping_router.router)
app.include_router(leaderboards_router.router)
app.include_router(concepts_router.router)
app.include_router(formula_router.router)
app.include_router(briefs_router.router)
app.include_router(hooks_router.router)
app.include_router(review_router.router)
app.include_router(quality_router.router)
app.include_router(persona_router.router)
app.include_router(calendar_router.router)
app.include_router(admin_router.router)


@app.get("/health")
def health():
    return {
        "ok": True,
        "vault_root": str(settings.vault_root),
        "db_dialect": engine.dialect.name,
        "anthropic_key_set": bool(settings.anthropic_api_key),
        "openai_key_set": bool(settings.openai_api_key),
        "basic_auth_enabled": bool(BASIC_AUTH_USER and BASIC_AUTH_PASS),
    }


@app.get("/media/{asset_id}")
def stream_media(asset_id: str, request: Request):
    """Serve a downloaded asset file with HTTP Range support for hover-play."""
    from app.db.models import Asset
    from app.db.session import SessionLocal

    session = SessionLocal()
    try:
        asset = session.get(Asset, asset_id)
        if asset is None:
            raise HTTPException(404, "not_found")
        path = resolve_asset_path(asset.storage_path)
        if path is None:
            raise HTTPException(404, "file_missing")
        mime = asset.mime_type or mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    finally:
        session.close()

    range_header = request.headers.get("range")
    file_size = path.stat().st_size
    if range_header:
        try:
            _, rng = range_header.split("=", 1)
            start_s, end_s = rng.split("-", 1)
            start = int(start_s) if start_s else 0
            end = int(end_s) if end_s else file_size - 1
            end = min(end, file_size - 1)
            length = end - start + 1
            with path.open("rb") as f:
                f.seek(start)
                data = f.read(length)
            return Response(
                content=data,
                status_code=206,
                media_type=mime,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(length),
                    "Cache-Control": "public, max-age=3600",
                },
            )
        except (ValueError, OSError):
            pass

    return FileResponse(path, media_type=mime, headers={"Cache-Control": "public, max-age=3600"})


@app.get("/media/{asset_id}/frame/{label}")
def stream_frame(asset_id: str, label: str):
    """Serve an extracted frame for thumbnails."""
    safe = "".join(c for c in label if c.isalnum() or c in ("_", "-"))
    candidates = [
        settings.frames_dir / asset_id / f"{safe}.jpg",
        settings.frames_dir / asset_id / "image.jpg",
        settings.frames_dir / asset_id / "hook_0_5s.jpg",
    ]
    for c in candidates:
        if c.exists():
            return FileResponse(c, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})
    raise HTTPException(404, "frame_not_found")
