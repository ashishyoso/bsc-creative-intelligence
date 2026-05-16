"""
SQLAlchemy ORM models for the Inspiration tool.

Mirror of inspiration/schema/001_init.sql. The SQL file is the source of
truth — these ORM definitions exist so the FastAPI layer can query and
mutate without raw SQL.
"""
from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Float,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import relationship

from app.inspiration.db import Base


# --------------------------------------------------------------------- enums
SOURCE_CHANNELS = ("meta_ad_library", "meta_marketing", "youtube", "tiktok", "brand_site", "manual")
USER_ROLES = ("editor", "strategist", "senior_reviewer", "ops_lead", "founder", "admin")
VIDEO_STATUSES = ("pending", "saved", "rejected", "escalated")
DECISION_ACTIONS = ("saved", "rejected", "escalated")
REPLICABILITY = ("yes", "stretch", "no")
WATCHLIST_PRIORITY = ("high", "medium", "low")


def _enum(name: str, values: tuple[str, ...]):
    return Enum(*values, name=name, create_type=False)


# --------------------------------------------------------------------- users
class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    sso_subject = Column(String, unique=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Two FKs from UserRole to users.id (user_id + granted_by). Be explicit
    # so SQLAlchemy knows which one identifies the role owner.
    roles = relationship(
        "UserRole",
        back_populates="user",
        foreign_keys="UserRole.user_id",
        cascade="all, delete-orphan",
    )


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role = Column(_enum("user_role", USER_ROLES), primary_key=True)
    granted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    granted_by = Column(String, ForeignKey("users.id"))

    user = relationship("User", back_populates="roles", foreign_keys=[user_id])


# ------------------------------------------------------------------ products
class Product(Base):
    __tablename__ = "products"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    brand = Column(String, nullable=False)
    description = Column(Text)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_by = Column(String, ForeignKey("users.id"))

    __table_args__ = (UniqueConstraint("brand", "name"),)

    routes = relationship("Route", back_populates="product")


# -------------------------------------------------------------------- routes
class Route(Base):
    __tablename__ = "routes"

    id = Column(String, primary_key=True)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    name = Column(String, nullable=False)
    design_tone = Column(Text)
    hard_no_list = Column(ARRAY(Text))
    funnel_split = Column(JSONB)
    static_format_notes = Column(Text)
    gif_format_notes = Column(Text)
    video_format_notes = Column(Text)
    version = Column(Integer, nullable=False, default=1)
    is_archived = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_by = Column(String, ForeignKey("users.id"))
    archived_at = Column(DateTime(timezone=True))

    __table_args__ = (UniqueConstraint("product_id", "name"),)

    product = relationship("Product", back_populates="routes")


class RouteVersion(Base):
    __tablename__ = "route_versions"

    id = Column(String, primary_key=True)
    route_id = Column(String, ForeignKey("routes.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    snapshot = Column(JSONB, nullable=False)
    edited_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    edited_by = Column(String, ForeignKey("users.id"))

    __table_args__ = (UniqueConstraint("route_id", "version"),)


# ----------------------------------------------------------------- watchlist
class WatchlistEntry(Base):
    __tablename__ = "watchlist_entries"

    id = Column(String, primary_key=True)
    source_channel = Column(_enum("source_channel", SOURCE_CHANNELS), nullable=False)
    brand = Column(String, nullable=False)
    source_external_id = Column(String)
    is_active = Column(Boolean, nullable=False, default=True)
    priority = Column(_enum("watchlist_priority", WATCHLIST_PRIORITY), nullable=False, default="medium")
    product_ids = Column(ARRAY(String), nullable=False)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_by = Column(String, ForeignKey("users.id"))

    __table_args__ = (
        UniqueConstraint("source_channel", "brand", "source_external_id"),
        Index("idx_watchlist_active", "is_active", "source_channel"),
    )


# -------------------------------------------------------------------- videos
class Video(Base):
    __tablename__ = "videos"

    id = Column(String, primary_key=True)
    source_channel = Column(_enum("source_channel", SOURCE_CHANNELS), nullable=False)
    source_external_id = Column(String, nullable=False)

    brand = Column(String, nullable=False)
    is_internal = Column(Boolean, nullable=False, default=False)
    is_backfill = Column(Boolean, nullable=False, default=False)

    title = Column(Text)
    primary_text = Column(Text)
    headline = Column(Text)
    caption = Column(Text)
    link_caption = Column(Text)
    link_description = Column(Text)
    cta_text = Column(String)
    link_url = Column(Text)

    video_url = Column(Text, nullable=False)
    video_url_cached = Column(Text)
    video_thumbnail = Column(Text)
    video_hash = Column(String)
    duration_seconds = Column(Float)
    aspect_ratio = Column(String)

    languages = Column(ARRAY(String))
    countries = Column(ARRAY(String))
    publisher_platforms = Column(ARRAY(String))

    source_published_at = Column(DateTime(timezone=True))
    delivery_start_at = Column(DateTime(timezone=True))
    delivery_stop_at = Column(DateTime(timezone=True))
    days_running = Column(Integer)

    view_count = Column(BigInteger)
    like_count = Column(BigInteger)
    comment_count = Column(BigInteger)

    performance = Column(JSONB)

    status = Column(_enum("video_status", VIDEO_STATUSES), nullable=False, default="pending")
    fetched_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    added_by = Column(String, ForeignKey("users.id"))

    __table_args__ = (
        UniqueConstraint("source_channel", "source_external_id"),
        Index("idx_videos_status_fetched", "status", "fetched_at"),
        Index("idx_videos_brand", "brand"),
        Index("idx_videos_source_channel", "source_channel"),
    )


# ----------------------------------------------------------------- decisions
class Decision(Base):
    __tablename__ = "decisions"

    id = Column(String, primary_key=True)
    video_id = Column(String, ForeignKey("videos.id"), nullable=False)
    editor_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    action = Column(_enum("decision_action", DECISION_ACTIONS), nullable=False)

    product_id = Column(String, ForeignKey("products.id"))
    route_id = Column(String, ForeignKey("routes.id"))
    replicability = Column(_enum("replicability_tier", REPLICABILITY))
    why_text = Column(Text)

    reject_reason = Column(String)
    reject_reason_detail = Column(Text)

    escalation_note = Column(Text)

    cross_product_origin_id = Column(String, ForeignKey("decisions.id"))

    decided_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "(action <> 'saved') OR ("
            "product_id IS NOT NULL AND route_id IS NOT NULL AND "
            "replicability IS NOT NULL AND why_text IS NOT NULL AND "
            "char_length(why_text) >= 20)",
            name="save_fields_complete",
        ),
        CheckConstraint(
            "(action <> 'rejected') OR (reject_reason IS NOT NULL)",
            name="reject_fields_complete",
        ),
        Index("idx_decisions_video", "video_id"),
        Index("idx_decisions_editor", "editor_user_id", "decided_at"),
        Index("idx_decisions_route", "route_id", "decided_at"),
        Index("idx_decisions_action", "action", "decided_at"),
    )


class ShotBreakdown(Base):
    __tablename__ = "shot_breakdowns"

    decision_id = Column(String, ForeignKey("decisions.id", ondelete="CASCADE"), primary_key=True)
    shot_count = Column(Integer)
    camera_type = Column(String)
    lighting_type = Column(String)
    audio_approach = Column(String)
    opening_hook = Column(Text)
    end_frame = Column(Text)
    total_runtime_seconds = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# -------------------------------------------------------------- source pulls
class SourcePull(Base):
    __tablename__ = "source_pulls"

    id = Column(String, primary_key=True)
    source_channel = Column(_enum("source_channel", SOURCE_CHANNELS), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=False)
    finished_at = Column(DateTime(timezone=True))
    records_pulled = Column(Integer, nullable=False, default=0)
    error_count = Column(Integer, nullable=False, default=0)
    last_error = Column(Text)
    ok = Column(Boolean)

    __table_args__ = (
        Index("idx_source_pulls_channel_time", "source_channel", "started_at"),
    )


# --------------------------------------------------------------- notion sync
class NotionDatabase(Base):
    __tablename__ = "notion_databases"

    id = Column(String, primary_key=True)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    route_id = Column(String, ForeignKey("routes.id"), nullable=False)
    notion_database_id = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("product_id", "route_id"),)


class NotionSyncLog(Base):
    __tablename__ = "notion_sync_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    decision_id = Column(String, ForeignKey("decisions.id", ondelete="CASCADE"), nullable=False)
    notion_page_id = Column(String)
    synced_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ok = Column(Boolean, nullable=False)
    error = Column(Text)
    retry_count = Column(Integer, nullable=False, default=0)


# --------------------------------------------------------------- briefs (US-6)
# Named `creative_briefs` to avoid clashing with the pilot's existing `briefs`
# table. The brief manifest is a light wrapper: title + product + route +
# attached references + status. Body content lives elsewhere (Notion / Docs)
# via external_doc_url, OR inline in notes for in-tool drafting.
class CreativeBrief(Base):
    __tablename__ = "creative_briefs"

    id = Column(String, primary_key=True)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    route_id = Column(String, ForeignKey("routes.id"), nullable=False)
    title = Column(String, nullable=False)
    status = Column(String, nullable=False, default="draft")  # draft / approved
    external_doc_url = Column(Text)
    goal = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_by = Column(String, ForeignKey("users.id"))
    approved_at = Column(DateTime(timezone=True))
    approved_by = Column(String, ForeignKey("users.id"))


class BriefReference(Base):
    __tablename__ = "brief_references"

    brief_id = Column(String, ForeignKey("creative_briefs.id", ondelete="CASCADE"), primary_key=True)
    decision_id = Column(String, ForeignKey("decisions.id"), primary_key=True)
    position = Column(Integer, nullable=False, default=0)
    note = Column(Text)
    added_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
