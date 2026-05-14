from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class IngestSummary(BaseModel):
    ingest_id: Optional[int]
    month_tag: str
    rows_parsed: int
    unique_urls: int
    downloaded: int
    download_failed: int
    assets_verified: int
    assets_mapping_suspect: int
    assets_download_failed: int
    ad_refs_created: int
    performance_rows_created: int
    roas_precision_audit: dict


class AssetSummary(BaseModel):
    asset_id: str
    asset_type: str
    storage_path: str
    mapping_key: Optional[str] = None
    mapping_status: str
    mapping_resolution_note: Optional[str]
    actual_duration_seconds: Optional[float]
    actual_width: Optional[int]
    actual_height: Optional[int]
    size_bytes: Optional[int]
    download_status: str
    concept_id: Optional[str]
    primary_ad_name: Optional[str]
    primary_ad_id: Optional[str]

    spend: Optional[float]
    impressions: Optional[int]
    hook_rate: Optional[float]
    hold_rate: Optional[float]
    ctr: Optional[float]
    roas: Optional[float]
    clicks: Optional[int]

    sku: Optional[str]
    format: Optional[str]
    hook_archetype: Optional[str]
    persona_implied: Optional[str]
    awareness_stage: Optional[str]
    talent_type: Optional[str]
    audio_language: Optional[str]
    on_screen_text: Optional[str]
    brand_visible_first_3s: Optional[bool]
    follows_60pct_rule: Optional[bool]
    sku_confidence: Optional[float]


class MappingQueueItem(BaseModel):
    asset_id: str
    asset_type: str
    mapping_status: str
    mapping_resolution_note: Optional[str]
    declared_duration_seconds: Optional[float]
    actual_duration_seconds: Optional[float]
    actual_width: Optional[int]
    actual_height: Optional[int]
    storage_path: str
    mapping_key: str
    primary_ad_id: Optional[str]
    primary_ad_name: Optional[str]
    spend: Optional[float]
    impressions: Optional[int]


class MappingResolution(BaseModel):
    decision: str  # CONFIRM | REJECT | DIFFERENT_EDIT
    note: Optional[str] = None


class LeaderboardRow(BaseModel):
    value: str
    metric_value: float
    median: Optional[float]
    n: int
    confidence: str  # Insufficient | Weak | Moderate | Strong | Robust
    total_spend: float


class LeaderboardResponse(BaseModel):
    dimension: str
    metric: str
    sku: Optional[str]
    rows: list[LeaderboardRow]
    notes: list[str]


class TagBatchSummary(BaseModel):
    total: int
    ok: int
    failed: int
    cost_inr: float
    failures: list[dict]
