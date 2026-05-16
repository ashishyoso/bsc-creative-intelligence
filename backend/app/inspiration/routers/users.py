"""US-1.4 — Manage User Roles. Users are upserted on SSO; admins grant roles."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.inspiration.auth import current_user, require_roles
from app.inspiration.db import get_db
from app.inspiration.models import User, UserRole
from app.inspiration.schemas import UserOut, UserRoleEnum

router = APIRouter(prefix="/inspiration/users", tags=["inspiration:admin"])


def _serialize(u: User, roles: list[str]) -> UserOut:
    return UserOut(
        id=u.id, email=u.email, name=u.name, is_active=u.is_active, roles=roles  # type: ignore[arg-type]
    )


@router.get("/me", response_model=UserOut)
def get_me(me=Depends(current_user), db: Session = Depends(get_db)):
    roles = [r[0] for r in db.query(UserRole.role).filter(UserRole.user_id == me.id).all()]
    return _serialize(me, roles)


@router.get("", response_model=list[UserOut])
def list_users(
    _admin=Depends(require_roles("admin", "founder")),
    db: Session = Depends(get_db),
):
    out: list[UserOut] = []
    for u in db.query(User).order_by(User.email).all():
        roles = [r[0] for r in db.query(UserRole.role).filter(UserRole.user_id == u.id).all()]
        out.append(_serialize(u, roles))
    return out


class RoleGrant(BaseModel):
    role: UserRoleEnum


@router.post("/{user_id}/roles", status_code=204)
def grant_role(
    user_id: str,
    body: RoleGrant,
    actor=Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "user_not_found")
    existing = (
        db.query(UserRole)
        .filter(UserRole.user_id == user_id, UserRole.role == body.role)
        .first()
    )
    if existing is None:
        db.add(UserRole(user_id=user_id, role=body.role, granted_by=actor.id))
        db.commit()


@router.delete("/{user_id}/roles/{role}", status_code=204)
def revoke_role(
    user_id: str,
    role: UserRoleEnum,
    actor=Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    row = (
        db.query(UserRole)
        .filter(UserRole.user_id == user_id, UserRole.role == role)
        .first()
    )
    if row is not None:
        db.delete(row)
        db.commit()
