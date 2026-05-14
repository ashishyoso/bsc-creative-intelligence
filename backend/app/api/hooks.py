"""Hook Library API (Module 10)."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db.models import Hook, HookType
from app.db.session import get_db
from app.patterns.hook_library import (
    _normalize,
    rebuild_library,
    relevant_hooks_for_formula,
)

router = APIRouter(prefix="/hooks", tags=["hooks"])


@router.post("/rebuild")
def rebuild(db: Session = Depends(get_db)):
    return rebuild_library(db)


@router.get("")
def list_hooks(
    db: Session = Depends(get_db),
    hook_type: str | None = None,
    sku: str | None = None,
    persona: str | None = None,
    archetype: str | None = None,
    language: str | None = None,
    search: str | None = None,
    sort_by: str = Query("parent_roas", description="parent_roas | parent_hook_rate | parent_spend | created_at"),
    limit: int = Query(200, le=1000),
):
    q = db.query(Hook)
    if hook_type:
        q = q.filter(Hook.hook_type == hook_type)
    if sku:
        q = q.filter(Hook.sku == sku)
    if persona:
        q = q.filter(Hook.persona_implied == persona)
    if archetype:
        q = q.filter(Hook.hook_archetype == archetype)
    if language:
        q = q.filter(Hook.language == language)
    if search:
        norm = _normalize(search)
        q = q.filter(or_(
            Hook.text_normalized.like(f"%{norm}%"),
            Hook.text.like(f"%{search}%"),
        ))

    sort_col = {
        "parent_roas": Hook.parent_roas.desc(),
        "parent_hook_rate": Hook.parent_hook_rate.desc(),
        "parent_spend": Hook.parent_spend.desc(),
        "created_at": Hook.created_at.desc(),
    }.get(sort_by, Hook.parent_roas.desc())

    rows = q.order_by(sort_col).limit(limit).all()
    return [
        {
            "id": h.id,
            "text": h.text,
            "hook_type": h.hook_type,
            "source_asset_id": h.source_asset_id,
            "sku": h.sku,
            "hook_archetype": h.hook_archetype,
            "persona_implied": h.persona_implied,
            "language": h.language,
            "parent_roas": h.parent_roas,
            "parent_hook_rate": h.parent_hook_rate,
            "parent_spend": h.parent_spend,
            "source": h.source,
            "used_in_briefs_count": h.used_in_briefs_count,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        }
        for h in rows
    ]


@router.get("/relevant")
def relevant(
    db: Session = Depends(get_db),
    target_sku: str = Query(...),
    persona: str | None = None,
    hook_archetype: str | None = None,
    audio_language: str | None = None,
    top_k: int = 5,
):
    """US-10.3: top-5 most relevant hooks for a brief intent."""
    return relevant_hooks_for_formula(
        db, target_sku=target_sku, persona=persona,
        hook_archetype=hook_archetype, audio_language=audio_language, top_k=top_k,
    )


class ManualHook(BaseModel):
    text: str
    hook_type: str = "verbal"  # verbal | on_screen
    sku: str | None = None
    persona: str | None = None
    hook_archetype: str | None = None
    language: str | None = None
    parent_hook_id: int | None = None  # remix lineage


@router.post("")
def create_hook(body: ManualHook, db: Session = Depends(get_db)):
    if body.hook_type not in (HookType.VERBAL.value, HookType.ON_SCREEN.value):
        raise HTTPException(400, "invalid hook_type")
    hook = Hook(
        text=body.text,
        text_normalized=_normalize(body.text),
        hook_type=body.hook_type,
        sku=body.sku,
        persona_implied=body.persona,
        hook_archetype=body.hook_archetype,
        language=body.language,
        source="remix" if body.parent_hook_id else "manual",
        parent_hook_id=body.parent_hook_id,
    )
    db.add(hook)
    db.commit()
    return {"id": hook.id}


@router.delete("/{hook_id}")
def delete_hook(hook_id: int, db: Session = Depends(get_db)):
    h = db.get(Hook, hook_id)
    if not h:
        raise HTTPException(404, "hook_not_found")
    db.delete(h)
    db.commit()
    return {"ok": True}
