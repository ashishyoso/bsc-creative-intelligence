"""Pydantic request/response models for the Inspiration API surface."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SourceChannel = Literal["meta_ad_library", "meta_marketing", "youtube", "tiktok", "brand_site", "manual"]
UserRoleEnum = Literal["editor", "strategist", "senior_reviewer", "ops_lead", "founder", "admin"]
VideoStatus = Literal["pending", "saved", "rejected", "escalated"]
DecisionAction = Literal["saved", "rejected", "escalated"]
Replicability = Literal["yes", "stretch", "no"]
Priority = Literal["high", "medium", "low"]

REJECT_REASONS = {
    "off_brand",
    "low_production_quality",
    "irrelevant_for_product",
    "cant_replicate",
    "already_have_similar",
    "not_a_video_ad",
    "other",
}


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------- user
class UserOut(ORMModel):
    id: str
    email: str
    name: str
    is_active: bool
    roles: list[UserRoleEnum] = []


# ------------------------------------------------------------------- product
class ProductIn(BaseModel):
    name: str
    brand: str
    description: str | None = None
    is_active: bool = True


class ProductOut(ORMModel):
    id: str
    name: str
    brand: str
    description: str | None
    is_active: bool
    created_at: datetime


# --------------------------------------------------------------------- route
class RouteIn(BaseModel):
    product_id: str
    name: str
    design_tone: str | None = None
    hard_no_list: list[str] | None = None
    funnel_split: dict[str, Any] | None = None
    static_format_notes: str | None = None
    gif_format_notes: str | None = None
    video_format_notes: str | None = None


class RouteOut(ORMModel):
    id: str
    product_id: str
    name: str
    design_tone: str | None
    hard_no_list: list[str] | None
    funnel_split: dict[str, Any] | None
    static_format_notes: str | None
    gif_format_notes: str | None
    video_format_notes: str | None
    version: int
    is_archived: bool


# ----------------------------------------------------------------- watchlist
class WatchlistIn(BaseModel):
    source_channel: SourceChannel
    brand: str
    source_external_id: str | None = None
    priority: Priority = "medium"
    product_ids: list[str] = Field(default_factory=list)
    notes: str | None = None


class WatchlistOut(ORMModel):
    id: str
    source_channel: SourceChannel
    brand: str
    source_external_id: str | None
    is_active: bool
    priority: Priority
    product_ids: list[str]
    notes: str | None


# -------------------------------------------------------------------- video
class VideoSummary(ORMModel):
    id: str
    source_channel: SourceChannel
    brand: str
    is_internal: bool
    title: str | None
    headline: str | None
    cta_text: str | None
    video_url: str
    video_url_cached: str | None
    video_thumbnail: str | None
    duration_seconds: float | None
    aspect_ratio: str | None
    days_running: int | None
    status: VideoStatus
    fetched_at: datetime
    performance: dict[str, Any] | None


class VideoDetail(VideoSummary):
    primary_text: str | None
    caption: str | None
    link_caption: str | None
    link_description: str | None
    link_url: str | None
    languages: list[str] | None
    countries: list[str] | None
    publisher_platforms: list[str] | None
    source_published_at: datetime | None
    delivery_start_at: datetime | None
    delivery_stop_at: datetime | None
    view_count: int | None
    like_count: int | None
    comment_count: int | None
    source_external_id: str


class ManualVideoIn(BaseModel):
    """US-2.7 — manual override / add video."""
    url: str
    source_channel: SourceChannel
    brand: str
    source_published_at: datetime | None = None
    product_ids: list[str] = Field(default_factory=list)


# ----------------------------------------------------------------- decisions
class SaveDecisionIn(BaseModel):
    """US-3.5 save modal — route + replicability + why_text required."""
    video_id: str
    product_id: str
    route_id: str
    replicability: Replicability
    why_text: str = Field(..., min_length=20)
    # US-3.9 — propagate same save to other products at write time
    cross_product_saves: list[dict[str, str]] = Field(default_factory=list)


class RejectDecisionIn(BaseModel):
    """US-3.6 reject modal — reason required; detail required if reason='other'."""
    video_id: str
    reject_reason: str
    reject_reason_detail: str | None = None

    @field_validator("reject_reason")
    @classmethod
    def _known(cls, v: str) -> str:
        if v not in REJECT_REASONS:
            raise ValueError(f"reject_reason must be one of {sorted(REJECT_REASONS)}")
        return v

    @field_validator("reject_reason_detail")
    @classmethod
    def _detail_when_other(cls, v: str | None, info):
        reason = info.data.get("reject_reason")
        if reason == "other" and (not v or len(v) < 10):
            raise ValueError("reject_reason_detail (min 10 chars) is required when reason='other'")
        return v


class EscalateDecisionIn(BaseModel):
    """US-3.7 — escalate to senior reviewer queue."""
    video_id: str
    escalation_note: str | None = None


class DecisionOut(ORMModel):
    id: str
    video_id: str
    editor_user_id: str
    action: DecisionAction
    product_id: str | None
    route_id: str | None
    replicability: Replicability | None
    why_text: str | None
    reject_reason: str | None
    reject_reason_detail: str | None
    escalation_note: str | None
    cross_product_origin_id: str | None
    decided_at: datetime


# -------------------------------------------------------------- shot break
class ShotBreakdownIn(BaseModel):
    """US-5.3 — all fields optional, saveable as partial."""
    shot_count: int | None = None
    camera_type: str | None = None
    lighting_type: str | None = None
    audio_approach: str | None = None
    opening_hook: str | None = None
    end_frame: str | None = None
    total_runtime_seconds: float | None = None


class ShotBreakdownOut(ShotBreakdownIn, ORMModel):
    decision_id: str
    created_at: datetime
    updated_at: datetime


# -------------------------------------------------------------- saved reference
class ReferenceOut(ORMModel):
    """A saved video — joins video + the save decision + optional shot breakdown."""
    decision_id: str
    video: VideoSummary
    product_id: str
    route_id: str
    route_name: str | None = None
    replicability: Replicability
    why_text: str
    saved_by: str
    saved_by_name: str | None = None
    saved_at: datetime
    shot_breakdown: ShotBreakdownOut | None = None


# ------------------------------------------------------------------- sources
class SourceHealth(BaseModel):
    """US-2.6 — one row per source."""
    source_channel: SourceChannel
    last_pull_at: datetime | None
    last_pull_records: int | None
    seven_day_records: int
    error_count: int
    last_error: str | None
    health: Literal["green", "amber", "red"]


# ------------------------------------------------------------------- reports
class DecisionLogRow(ORMModel):
    """US-7.1."""
    id: str
    decided_at: datetime
    editor_user_id: str
    editor_name: str | None
    product_id: str | None
    product_name: str | None
    route_id: str | None
    route_name: str | None
    action: DecisionAction
    brand: str
    source_channel: SourceChannel
    video_url: str
    why_or_reason: str | None
    replicability: Replicability | None


class SourceVolumeCell(BaseModel):
    week_start: str  # ISO date
    count: int


class SourceVolumeRow(BaseModel):
    """US-7.2 — one row per source, columns = last 12 weeks."""
    source_channel: SourceChannel
    weekly_counts: list[SourceVolumeCell]
    save_rate: float | None  # saved / decided over the 12-week window


class RouteCoverageRow(BaseModel):
    """US-7.3 — one row per route in a product."""
    route_id: str
    route_name: str
    total_saved: int
    saved_last_7d: int
    saved_last_30d: int
    is_under_served: bool  # red flag at <5 total


# -------------------------------------------------------------- video filters
class VideoListQuery(BaseModel):
    """Bundles all P0 filter params for the queue and library views."""
    product_id: str | None = None
    route_ids: list[str] | None = None
    brands: list[str] | None = None
    source_channels: list[SourceChannel] | None = None
    min_days_running: int | None = None
    duration_bucket: Literal["3-6", "6-15", "15-30", "30+"] | None = None
    status: VideoStatus | None = "pending"
    aspect_ratios: list[str] | None = None
    search: str | None = None
    limit: int = 50
    offset: int = 0
