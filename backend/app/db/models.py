from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.session import Base


class AssetType(str, Enum):
    VIDEO = "video"
    IMAGE = "image"


class MappingStatus(str, Enum):
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    MAPPING_SUSPECT = "MAPPING_SUSPECT"
    MANUALLY_CONFIRMED = "MANUALLY_CONFIRMED"
    MAPPING_FAILED = "MAPPING_FAILED"
    DOWNLOAD_FAILED = "DOWNLOAD_FAILED"


class TagStatus(str, Enum):
    AUTO = "auto"
    HUMAN_VERIFIED = "human_verified"
    OVERRIDDEN = "overridden"


class Ingest(Base):
    __tablename__ = "ingests"

    id = Column(Integer, primary_key=True)
    source_filename = Column(String, nullable=False)
    month_tag = Column(String, nullable=False)
    uploaded_by = Column(String, default="pilot")
    row_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="active")  # active | rolled_back

    performance_rows = relationship("PerformanceRow", back_populates="ingest")


class Asset(Base):
    __tablename__ = "assets"

    asset_id = Column(String, primary_key=True)  # hash-based stable ID (first 16 chars of SHA-256)
    file_hash = Column(String, unique=True, nullable=False, index=True)
    perceptual_hash = Column(String, nullable=True, index=True)
    storage_path = Column(String, nullable=False)
    mapping_key = Column(String, unique=True, nullable=False, index=True)  # original CDN URL
    asset_type = Column(String, nullable=False)  # video | image
    mime_type = Column(String)

    # ffprobe ground truth
    actual_duration_seconds = Column(Float, nullable=True)
    actual_width = Column(Integer, nullable=True)
    actual_height = Column(Integer, nullable=True)
    video_codec = Column(String, nullable=True)
    audio_codec = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=True)

    # Hawky declared
    declared_duration_seconds = Column(Float, nullable=True)

    mapping_status = Column(String, default=MappingStatus.PENDING.value, nullable=False)
    mapping_resolution_note = Column(Text, nullable=True)
    mapping_resolved_by = Column(String, nullable=True)
    mapping_resolved_at = Column(DateTime, nullable=True)

    concept_id = Column(String, ForeignKey("concepts.concept_id"), nullable=True)

    download_status = Column(String, default="pending")  # pending | downloaded | failed
    download_error = Column(Text, nullable=True)

    first_ingested_at = Column(DateTime, default=datetime.utcnow)
    last_seen_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    ad_refs = relationship("AdReference", back_populates="asset", cascade="all, delete-orphan")
    performance_rows = relationship("PerformanceRow", back_populates="asset")
    autotag = relationship("AutoTag", back_populates="asset", uselist=False, cascade="all, delete-orphan")
    concept = relationship("Concept", back_populates="assets")


class AdReference(Base):
    __tablename__ = "ad_references"

    id = Column(Integer, primary_key=True)
    ad_id = Column(String, index=True, nullable=False)
    asset_id = Column(String, ForeignKey("assets.asset_id"), nullable=False)
    ad_name = Column(Text, nullable=True)
    hawky_sku_implied = Column(String, nullable=True)

    asset = relationship("Asset", back_populates="ad_refs")

    __table_args__ = (UniqueConstraint("ad_id", "asset_id", name="uq_ad_asset"),)


class PerformanceRow(Base):
    __tablename__ = "performance_rows"

    id = Column(Integer, primary_key=True)
    asset_id = Column(String, ForeignKey("assets.asset_id"), nullable=False, index=True)
    ad_id = Column(String, nullable=True, index=True)  # primary ad_id for this row
    ingest_id = Column(Integer, ForeignKey("ingests.id"), nullable=False)
    month_tag = Column(String, nullable=False, index=True)

    spend = Column(Float)
    impressions = Column(Integer)
    hook_rate = Column(Float)  # decimal (0.2185 not 21.85%)
    hold_rate = Column(Float)
    ctr = Column(Float)
    roas = Column(Float)
    clicks = Column(Integer)
    atc = Column(Integer)
    all_clicks = Column(Integer)
    cpc = Column(Float)
    cpm = Column(Float)

    # raw values for QA / audit
    roas_was_integer = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    asset = relationship("Asset", back_populates="performance_rows")
    ingest = relationship("Ingest", back_populates="performance_rows")


class Concept(Base):
    __tablename__ = "concepts"

    concept_id = Column(String, primary_key=True)
    concept_name = Column(Text, nullable=True)
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    last_seen_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assets = relationship("Asset", back_populates="concept")


class AutoTag(Base):
    __tablename__ = "auto_tags"

    id = Column(Integer, primary_key=True)
    asset_id = Column(String, ForeignKey("assets.asset_id"), unique=True, nullable=False)

    sku = Column(String, nullable=True)
    sku_confidence = Column(Float, nullable=True)
    campaign = Column(String, nullable=True)

    format = Column(String, nullable=True)
    hook_archetype = Column(String, nullable=True)
    hook_mechanic = Column(String, nullable=True)
    opening_subject = Column(String, nullable=True)
    on_screen_text = Column(Text, nullable=True)
    audio_type = Column(String, nullable=True)
    audio_language = Column(String, nullable=True)
    persona_implied = Column(String, nullable=True)
    pain_addressed = Column(Text, nullable=True)
    awareness_stage = Column(String, nullable=True)
    angle = Column(Text, nullable=True)
    brand_visible_first_3s = Column(Boolean, nullable=True)
    product_reveal_second = Column(Float, nullable=True)
    product_reveal_pct = Column(Float, nullable=True)  # of actual duration
    talent_type = Column(String, nullable=True)
    setting = Column(String, nullable=True)
    color_palette = Column(String, nullable=True)

    follows_60pct_rule = Column(Boolean, nullable=True)
    audio_transcript = Column(Text, nullable=True)

    status = Column(String, default=TagStatus.AUTO.value, nullable=False)
    model_version = Column(String, nullable=True)
    raw_response = Column(Text, nullable=True)  # for audit / debugging
    tagging_cost_inr = Column(Float, default=0.0)

    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    asset = relationship("Asset", back_populates="autotag")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True)
    user_id = Column(String, default="pilot")
    action_type = Column(String, nullable=False)
    target_entity = Column(String, nullable=True)
    target_id = Column(String, nullable=True)
    payload = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class HookType(str, Enum):
    VERBAL = "verbal"
    ON_SCREEN = "on_screen"


class Hook(Base):
    """A single hook (verbal or on-screen) extracted from a creative (US-10.1)."""
    __tablename__ = "hooks"

    id = Column(Integer, primary_key=True)
    text = Column(Text, nullable=False)
    text_normalized = Column(Text, nullable=False, index=True)  # lower, trimmed, for dedup search
    hook_type = Column(String, nullable=False)  # verbal | on_screen
    source_asset_id = Column(String, ForeignKey("assets.asset_id"), nullable=True, index=True)

    # Cached parent-creative context at extraction time
    sku = Column(String, nullable=True, index=True)
    hook_archetype = Column(String, nullable=True, index=True)
    persona_implied = Column(String, nullable=True, index=True)
    language = Column(String, nullable=True, index=True)

    # Cached performance snapshot of the parent creative
    parent_spend = Column(Float, nullable=True)
    parent_roas = Column(Float, nullable=True)
    parent_hook_rate = Column(Float, nullable=True)

    source = Column(String, default="auto")  # auto | manual | remix
    parent_hook_id = Column(Integer, ForeignKey("hooks.id"), nullable=True)  # for remix lineage
    used_in_briefs_count = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class BriefStatus(str, Enum):
    DRAFT = "draft"
    BRIEFED = "briefed"
    SHIPPED = "shipped"
    PERFORMED = "performed"


class Brief(Base):
    """A creative brief generated from a Magic Formula (US-5.1)."""
    __tablename__ = "briefs"

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    status = Column(String, default=BriefStatus.DRAFT.value, nullable=False)
    owner = Column(String, default="pilot")

    # The intent inputs that produced this brief
    target_sku = Column(String, nullable=False)
    target_metric = Column(String, default="roas")
    persona = Column(String, nullable=True)
    pain_addressed = Column(Text, nullable=True)
    awareness_stage = Column(String, nullable=True)
    audio_language = Column(String, nullable=True)
    format_constraint = Column(String, nullable=True)

    # The formula JSON (frozen at brief creation time) + the cohort confidence
    formula_json = Column(Text, nullable=True)
    overall_confidence = Column(String, nullable=True)
    cohort_size = Column(Integer, nullable=True)

    # The generated brief content (rich text / markdown)
    brief_markdown = Column(Text, nullable=True)

    # Hooks (list of strings, JSON-encoded)
    verbal_hooks_json = Column(Text, nullable=True)       # 3 spoken hook options
    on_screen_hooks_json = Column(Text, nullable=True)    # 3 on-screen text hook options
    mechanic = Column(Text, nullable=True)
    music_direction = Column(Text, nullable=True)
    talent_direction = Column(Text, nullable=True)
    duration_target_seconds = Column(Integer, nullable=True)

    # FK list of reference asset_ids (comma-separated for simplicity in SQLite)
    reference_asset_ids = Column(String, nullable=True)
    forbidden_archetypes_json = Column(Text, nullable=True)

    # Audit + lifecycle
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    shipped_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
