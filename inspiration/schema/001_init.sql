-- BSC Creative Intelligence Tool — initial schema
-- Target: Supabase Postgres
-- Spec: BSC_Creative_Intelligence_Tool_User_Stories.pdf v1.0
-- Covers P0 stories: US-1.1, 1.2, 1.3, 1.4, 2.x, 3.x, 5.3, 5.4, 9.1, 9.2

-- =====================================================================
-- Enums
-- =====================================================================

CREATE TYPE source_channel AS ENUM (
  'meta_ad_library',
  'meta_marketing',
  'youtube',
  'tiktok',
  'brand_site',
  'manual'
);

CREATE TYPE user_role AS ENUM (
  'editor',
  'strategist',
  'senior_reviewer',
  'ops_lead',
  'founder',
  'admin'
);

CREATE TYPE video_status AS ENUM (
  'pending',
  'saved',
  'rejected',
  'escalated'
);

CREATE TYPE decision_action AS ENUM (
  'saved',
  'rejected',
  'escalated'
);

CREATE TYPE replicability_tier AS ENUM (
  'yes',
  'stretch',
  'no'
);

CREATE TYPE watchlist_priority AS ENUM ('high', 'medium', 'low');

-- =====================================================================
-- Users (US-1.4) — populated from Supabase auth + role grants
-- =====================================================================

CREATE TABLE users (
  id TEXT PRIMARY KEY,              -- ULID; matches Supabase auth.users.id when sourced
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sso_subject TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by TEXT REFERENCES users(id),
  PRIMARY KEY (user_id, role)
);

-- =====================================================================
-- Products (US-1.1)
-- =====================================================================

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,              -- BSC / Bombae / other
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES users(id),
  UNIQUE (brand, name)
);

-- =====================================================================
-- Routes (US-1.2) — versioned, archive-not-delete
-- =====================================================================

CREATE TABLE routes (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  design_tone TEXT,
  hard_no_list TEXT[],
  funnel_split JSONB,               -- {"tof": 0.6, "bof": 0.4}
  static_format_notes TEXT,
  gif_format_notes TEXT,
  video_format_notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES users(id),
  archived_at TIMESTAMPTZ,
  UNIQUE (product_id, name)
);

-- Snapshot of each edit, so versions can be inspected (US-1.2)
CREATE TABLE route_versions (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_by TEXT REFERENCES users(id),
  UNIQUE (route_id, version)
);

-- =====================================================================
-- Source watchlist (US-1.3)
-- =====================================================================

CREATE TABLE watchlist_entries (
  id TEXT PRIMARY KEY,
  source_channel source_channel NOT NULL,
  brand TEXT NOT NULL,
  source_external_id TEXT,          -- Meta page_id, YouTube channel_id, TikTok handle, brand URL, 'self'
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority watchlist_priority NOT NULL DEFAULT 'medium',
  product_ids TEXT[] NOT NULL,      -- which products this brand inspires
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES users(id),
  UNIQUE (source_channel, brand, source_external_id)
);

CREATE INDEX idx_watchlist_active ON watchlist_entries (is_active, source_channel);

-- =====================================================================
-- Videos (US-2.x) — unified schema across all 5 source channels
-- =====================================================================

CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  source_channel source_channel NOT NULL,
  source_external_id TEXT NOT NULL, -- ad_archive_id, ad_id, video_id, url-hash, etc.

  -- Provenance
  brand TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,    -- true for Meta Marketing API (own ads)
  is_backfill BOOLEAN NOT NULL DEFAULT false,    -- US-2.8

  -- Common ad text
  title TEXT,
  primary_text TEXT,
  headline TEXT,
  caption TEXT,
  link_caption TEXT,
  link_description TEXT,
  cta_text TEXT,
  link_url TEXT,

  -- Media
  video_url TEXT NOT NULL,
  video_url_cached TEXT,            -- R2 URL after caching (US-9.1)
  video_thumbnail TEXT,
  video_hash TEXT,
  duration_seconds REAL,
  aspect_ratio TEXT,                -- '9:16', '1:1', '4:5', '16:9'

  -- Locale
  languages TEXT[],
  countries TEXT[],
  publisher_platforms TEXT[],

  -- Timing
  source_published_at TIMESTAMPTZ,
  delivery_start_at TIMESTAMPTZ,
  delivery_stop_at TIMESTAMPTZ,
  days_running INTEGER,             -- computed; null if source doesn't report

  -- Engagement (organic platforms)
  view_count BIGINT,
  like_count BIGINT,
  comment_count BIGINT,

  -- Performance (internal Meta ads only)
  performance JSONB,                -- {spend, impressions, ctr, hook_rate, thumb_stop_ratio, roas, frequency, days_active}

  -- System
  status video_status NOT NULL DEFAULT 'pending',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by TEXT REFERENCES users(id),  -- non-null for source='manual' (US-2.7)

  UNIQUE (source_channel, source_external_id)
);

CREATE INDEX idx_videos_status_fetched ON videos (status, fetched_at);
CREATE INDEX idx_videos_brand ON videos (brand);
CREATE INDEX idx_videos_source_channel ON videos (source_channel);
CREATE INDEX idx_videos_days_running ON videos (days_running) WHERE days_running IS NOT NULL;

-- =====================================================================
-- Decisions (US-3.5/3.6/3.7, US-9.2) — the most valuable long-term table
-- =====================================================================

CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id),
  editor_user_id TEXT NOT NULL REFERENCES users(id),
  action decision_action NOT NULL,

  -- Required for action='saved'
  product_id TEXT REFERENCES products(id),
  route_id TEXT REFERENCES routes(id),
  replicability replicability_tier,
  why_text TEXT,                    -- min 20 chars when action='saved'

  -- Required for action='rejected'
  reject_reason TEXT,               -- enum text: off-brand / low production / etc.
  reject_reason_detail TEXT,        -- min 10 chars when reject_reason='other'

  -- Required for action='escalated'
  escalation_note TEXT,

  -- US-3.9 cross-product saves (P1 — included now for schema stability)
  cross_product_origin_id TEXT REFERENCES decisions(id),

  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT save_fields_complete CHECK (
    action <> 'saved' OR (
      product_id IS NOT NULL AND
      route_id IS NOT NULL AND
      replicability IS NOT NULL AND
      why_text IS NOT NULL AND char_length(why_text) >= 20
    )
  ),
  CONSTRAINT reject_fields_complete CHECK (
    action <> 'rejected' OR reject_reason IS NOT NULL
  )
);

CREATE INDEX idx_decisions_video ON decisions (video_id);
CREATE INDEX idx_decisions_editor ON decisions (editor_user_id, decided_at DESC);
CREATE INDEX idx_decisions_route ON decisions (route_id, decided_at DESC);
CREATE INDEX idx_decisions_action ON decisions (action, decided_at DESC);

-- =====================================================================
-- Shot breakdowns (US-5.3) — optional post-save
-- =====================================================================

CREATE TABLE shot_breakdowns (
  decision_id TEXT PRIMARY KEY REFERENCES decisions(id) ON DELETE CASCADE,
  shot_count INTEGER,
  camera_type TEXT,                 -- locked / handheld / gimbal / macro / mixed
  lighting_type TEXT,               -- single source / window-natural / 3-point / available-light / other
  audio_approach TEXT,              -- silence / ambient / VO / music / SFX-led
  opening_hook TEXT,
  end_frame TEXT,
  total_runtime_seconds REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- Source pull health (US-2.6)
-- =====================================================================

CREATE TABLE source_pulls (
  id TEXT PRIMARY KEY,
  source_channel source_channel NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  records_pulled INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  ok BOOLEAN
);

CREATE INDEX idx_source_pulls_channel_time ON source_pulls (source_channel, started_at DESC);

-- =====================================================================
-- Notion sync state (US-5.4)
-- =====================================================================

CREATE TABLE notion_databases (
  id TEXT PRIMARY KEY,              -- ULID
  product_id TEXT NOT NULL REFERENCES products(id),
  route_id TEXT NOT NULL REFERENCES routes(id),
  notion_database_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, route_id)
);

CREATE TABLE notion_sync_log (
  id BIGSERIAL PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  notion_page_id TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok BOOLEAN NOT NULL,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_notion_sync_decision ON notion_sync_log (decision_id, synced_at DESC);
CREATE INDEX idx_notion_sync_failed ON notion_sync_log (ok, synced_at) WHERE ok = false;
