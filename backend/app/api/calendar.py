"""Cultural Moment Calendar API (US-11.4, US-11.5)."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter

from app.data.cultural_moments import CULTURAL_MOMENTS, moments_in_window

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/moments")
def upcoming_moments(weeks_ahead: int = 6):
    """US-11.4: rolling window of upcoming culturally-relevant moments."""
    return moments_in_window(datetime.utcnow(), weeks_ahead=weeks_ahead)


@router.get("/moments/{moment_id}")
def get_moment(moment_id: str):
    for m in CULTURAL_MOMENTS:
        if m.id == moment_id:
            return {
                "id": m.id,
                "name": m.name,
                "category": m.category,
                "relevance": m.relevance,
                "persona": m.persona,
                "suggested_sku": m.suggested_sku,
                "angle": m.angle,
                "example_hook": m.example_hook,
                "lead_time_days": m.lead_time_days,
                "sensitive": m.sensitive,
            }
    return {"error": "moment_not_found"}, 404
