"""
Auth middleware for Inspiration endpoints (US-1.4).

Strategy: Supabase issues JWTs after Google SSO. The frontend forwards the
JWT as Authorization: Bearer <token>. We verify the signature against
Supabase's JWT secret (SUPABASE_JWT_SECRET env), look up or upsert the user,
then enforce role-based access.

The pilot's BasicAuthMiddleware in main.py is left intact and runs first.
Inspiration endpoints additionally require a valid Bearer token — Basic auth
alone is insufficient.
"""
from __future__ import annotations

import os
from typing import Iterable

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.inspiration.db import get_db
from app.inspiration.models import User, UserRole
from app.inspiration.util import ulid


def _verify_jwt(token: str) -> dict:
    secret = os.getenv("SUPABASE_JWT_SECRET")
    if not secret:
        raise HTTPException(500, "SUPABASE_JWT_SECRET not configured")
    try:
        return jwt.decode(token, secret, algorithms=["HS256"], audience="authenticated")
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"invalid_token: {e}")


def _bootstrap_admin_emails() -> set[str]:
    raw = os.getenv("INSPIRATION_BOOTSTRAP_ADMIN_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def _upsert_user(db: Session, claims: dict) -> User:
    sub = claims.get("sub")
    email = claims.get("email")
    name = (claims.get("user_metadata") or {}).get("full_name") or email
    if not sub or not email:
        raise HTTPException(401, "token missing sub/email")

    user = db.query(User).filter(User.sso_subject == sub).first()
    if user is None:
        user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(id=ulid(), email=email, name=name, sso_subject=sub, is_active=True)
        db.add(user)
        db.flush()

        # Bootstrap: emails listed in INSPIRATION_BOOTSTRAP_ADMIN_EMAILS get
        # admin + founder on first sign-in. Keeps the chicken-and-egg out of
        # SQL. Subsequent logins are no-ops because the user already exists.
        if email.lower() in _bootstrap_admin_emails():
            db.add(UserRole(user_id=user.id, role="admin"))
            db.add(UserRole(user_id=user.id, role="founder"))
            db.flush()
    elif user.sso_subject is None:
        user.sso_subject = sub
    return user


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "bearer token required")
    token = auth[7:]
    claims = _verify_jwt(token)
    user = _upsert_user(db, claims)
    if not user.is_active:
        raise HTTPException(403, "user inactive")
    return user


def _user_roles(db: Session, user_id: str) -> set[str]:
    rows = db.query(UserRole.role).filter(UserRole.user_id == user_id).all()
    return {r[0] for r in rows}


def require_roles(*allowed: str):
    """Dependency factory enforcing role membership."""
    allowed_set = set(allowed)

    def _check(user: User = Depends(current_user), db: Session = Depends(get_db)) -> User:
        roles = _user_roles(db, user.id)
        if not (roles & allowed_set):
            raise HTTPException(403, f"requires one of: {sorted(allowed_set)}")
        return user

    return _check


def has_role(db: Session, user_id: str, role: str) -> bool:
    return role in _user_roles(db, user_id)


def assert_any_role(db: Session, user_id: str, roles: Iterable[str]):
    have = _user_roles(db, user_id)
    if not (have & set(roles)):
        raise HTTPException(403, f"requires one of: {sorted(set(roles))}")
