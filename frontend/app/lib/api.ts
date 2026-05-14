// Thin fetch wrapper. All requests proxy through Next rewrites to FastAPI.

export type AssetSummary = {
  asset_id: string;
  asset_type: 'video' | 'image';
  storage_path: string;
  mapping_status: string;
  mapping_resolution_note: string | null;
  actual_duration_seconds: number | null;
  actual_width: number | null;
  actual_height: number | null;
  size_bytes: number | null;
  download_status: string;
  concept_id: string | null;
  primary_ad_id: string | null;
  primary_ad_name: string | null;
  spend: number | null;
  impressions: number | null;
  hook_rate: number | null;
  hold_rate: number | null;
  ctr: number | null;
  roas: number | null;
  clicks: number | null;
  sku: string | null;
  format: string | null;
  hook_archetype: string | null;
  persona_implied: string | null;
  awareness_stage: string | null;
  talent_type: string | null;
  audio_language: string | null;
  on_screen_text: string | null;
  brand_visible_first_3s: boolean | null;
  follows_60pct_rule: boolean | null;
  sku_confidence: number | null;
  mapping_key?: string | null;
};

export function mediaUrlFor(a: { asset_id: string; mapping_key?: string | null }): string {
  const key = a.mapping_key ?? null;
  if (key && /^https?:\/\//i.test(key)) return key;
  return `/media/${a.asset_id}`;
}

export type MappingQueueItem = {
  asset_id: string;
  asset_type: string;
  mapping_status: string;
  mapping_resolution_note: string | null;
  declared_duration_seconds: number | null;
  actual_duration_seconds: number | null;
  actual_width: number | null;
  actual_height: number | null;
  storage_path: string;
  mapping_key: string;
  primary_ad_id: string | null;
  primary_ad_name: string | null;
  spend: number | null;
  impressions: number | null;
};

export type LeaderboardRow = {
  value: string;
  metric_value: number;
  median: number | null;
  n: number;
  confidence: 'Insufficient' | 'Weak' | 'Moderate' | 'Strong' | 'Robust';
  total_spend: number;
};

export type LeaderboardResponse = {
  dimension: string;
  metric: string;
  sku: string | null;
  rows: LeaderboardRow[];
  notes: string[];
};

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, { cache: 'no-store', ...init });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  return r.json();
}

export const api = {
  listAssets: (qs: Record<string, string | number | boolean | undefined | null>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(qs)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
    return http<AssetSummary[]>(`/assets?${params.toString()}`);
  },
  getCounts: () => http<{ total: number; by_type: Record<string, number>; tagged: number }>('/assets/_counts'),
  getAsset: (id: string) => http<any>(`/assets/${id}`),
  mappingQueue: () => http<MappingQueueItem[]>('/mapping/queue'),
  resolveMapping: (id: string, decision: string, note?: string) =>
    http<{ ok: boolean; new_status: string }>(`/mapping/queue/${id}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision, note }),
    }),
  leaderboard: (q: { dimension: string; metric: string; sku?: string; spend_weighted?: boolean; min_n?: number }) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
    return http<LeaderboardResponse>(`/leaderboards?${params.toString()}`);
  },
  listSkus: () => http<string[]>('/leaderboards/skus'),
  listHooks: (q: { hook_type?: string; sku?: string; persona?: string; archetype?: string; language?: string; search?: string; sort_by?: string; limit?: number }) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
    return http<Array<{
      id: number; text: string; hook_type: string; source_asset_id: string | null;
      sku: string | null; hook_archetype: string | null; persona_implied: string | null;
      language: string | null; parent_roas: number | null; parent_hook_rate: number | null;
      parent_spend: number | null; source: string; used_in_briefs_count: number;
      created_at: string | null;
    }>>(`/hooks?${params.toString()}`);
  },
  rebuildHooks: () => http<any>('/hooks/rebuild', { method: 'POST' }),
  reviewQueue: () => http<any>('/review/queue'),
  reviewDecision: (assetId: string, body: { decision: string; corrections?: any; notes?: string }) =>
    http<any>(`/review/${assetId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  quality60pct: (sku?: string) => http<any>(`/quality/60pct-rule${sku ? `?sku=${encodeURIComponent(sku)}` : ''}`),
  qualityBrandFirst3s: (sku?: string) => http<any>(`/quality/brand-first-3s${sku ? `?sku=${encodeURIComponent(sku)}` : ''}`),
  personaCoverage: (sku?: string) => http<any>(`/persona/coverage${sku ? `?sku=${encodeURIComponent(sku)}` : ''}`),
  personaMatrix: (metric: string = 'roas') => http<any>(`/persona/matrix?metric=${metric}`),
  compareSegments: (q: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (v) params.set(k, String(v));
    }
    return http<any>(`/persona/compare-segments?${params.toString()}`);
  },
  upcomingMoments: (weeksAhead = 6) => http<Array<any>>(`/calendar/moments?weeks_ahead=${weeksAhead}`),
  relevantHooks: (q: { target_sku: string; persona?: string; hook_archetype?: string; audio_language?: string; top_k?: number }) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
    return http<Array<any>>(`/hooks/relevant?${params.toString()}`);
  },
  antiPatterns: (q: { metric?: string; sku?: string; min_n?: number; top_k?: number; include_pairs?: boolean; fail_threshold_pct?: number }) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
    return http<{
      metric: string; sku: string | null; benchmark: number; fail_threshold_pct: number; count: number;
      rows: Array<{
        dim_a: string; val_a: string; dim_b: string | null; val_b: string | null;
        metric_value: number; n: number;
        confidence: 'Insufficient' | 'Weak' | 'Moderate' | 'Strong' | 'Robust';
        total_spend: number; sample_asset_ids: string[]; benchmark: number; deficit_pct: number;
      }>;
    }>(`/leaderboards/anti-patterns?${params.toString()}`);
  },
  combinatorial: (q: { metric?: string; sku?: string; pin_dimension?: string; min_n?: number; top_k?: number; spend_weighted?: boolean }) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
    return http<{
      metric: string;
      sku: string | null;
      pin_dimension: string | null;
      min_n: number;
      spend_weighted: boolean;
      count: number;
      rows: Array<{
        dim_a: string; val_a: string;
        dim_b: string; val_b: string;
        metric_value: number;
        median: number | null;
        n: number;
        confidence: 'Insufficient' | 'Weak' | 'Moderate' | 'Strong' | 'Robust';
        total_spend: number;
        sample_asset_ids: string[];
      }>;
      available_dimensions: string[];
    }>(`/leaderboards/combinatorial?${params.toString()}`);
  },
  runIngest: (body: { xlsx_path: string; month_tag: string; limit?: number; auto_tag?: boolean }) =>
    http<{ job_id: string; status: string }>('/ingest/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  tagPending: (limit?: number) =>
    http<{ job_id: string; status: string }>(`/ingest/tag-pending${limit ? `?limit=${limit}` : ''}`, { method: 'POST' }),
  getJob: (jobId: string) => http<any>(`/ingest/jobs/${jobId}`),
  listConcepts: (minAssets = 1) => http<Array<{
    concept_id: string; concept_name: string; asset_count: number;
    total_spend: number; avg_roas: number | null; avg_hook_rate: number | null;
    sample_asset_id: string | null;
  }>>(`/concepts?min_assets=${minAssets}`),
  conceptDetail: (id: string) => http<any>(`/concepts/${id}`),
  recomputeConcepts: () => http<any>('/concepts/recompute', { method: 'POST' }),
  renameConcept: (id: string, name: string) => http<any>(`/concepts/${id}/rename`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  }),
  listBriefs: (status?: string) => http<Array<{
    id: number; title: string; status: string; target_sku: string;
    persona: string | null; overall_confidence: string | null;
    cohort_size: number | null; created_at: string | null;
  }>>(`/briefs${status ? `?status=${status}` : ''}`),
  getBrief: (id: number) => http<any>(`/briefs/${id}`),
  briefFromFormula: (body: {
    target_sku: string; metric?: string; persona?: string | null;
    audio_language?: string | null; format_constraint?: string | null;
    pain_addressed?: string | null; awareness_stage?: string | null;
    forbidden_archetypes?: string[]; min_n?: number; title_override?: string | null;
  }) => http<any>('/briefs/from-formula', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
  patchBrief: (id: number, body: Record<string, any>) => http<any>(`/briefs/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
  deleteBrief: (id: number) => http<any>(`/briefs/${id}`, { method: 'DELETE' }),
  generateFormula: (body: {
    target_sku: string; metric?: string; persona?: string | null;
    audio_language?: string | null; format_constraint?: string | null;
    forbidden_archetypes?: string[]; min_n?: number;
  }) => http<{
    target_sku: string; metric: string; persona: string | null; cohort_size: number;
    overall_confidence: 'Insufficient' | 'Weak' | 'Moderate' | 'Strong' | 'Robust';
    anti_patterns: Array<{
      dim_a: string; val_a: string; dim_b: string | null; val_b: string | null;
      metric_value: number; n: number;
      confidence: 'Insufficient' | 'Weak' | 'Moderate' | 'Strong' | 'Robust';
      total_spend: number; deficit_pct: number;
    }>;
    recommendations: Array<{
      dimension: string; label: string; value: string | null;
      metric_value: number | null; n: number;
      confidence: 'Insufficient' | 'Weak' | 'Moderate' | 'Strong' | 'Robust';
      alternatives: Array<{ value: string; metric_value: number; n: number }>;
    }>;
    references: Array<{
      asset_id: string; ad_name: string | null; sku: string | null;
      hook_archetype: string | null; match_score: number;
      spend: number | null; roas: number | null; hook_rate: number | null;
      asset_type: string; actual_width: number | null; actual_height: number | null;
    }>;
    risks: string[];
  }>('/formula/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }),
  taggingProgress: () => http<{
    eligible_total: number;
    tagged: number;
    remaining: number;
    pct_complete: number;
    total_cost_inr: number;
    avg_cost_per_asset_inr: number | null;
    mapping_suspect: number;
    download_failed: number;
  }>('/ingest/tagging-progress'),
  health: () => http<any>('/health'),
};

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return '—';
  return v.toFixed(digits);
}

export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (v >= 1e6) return `₹${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
}

export function classifyRoas(roas: number | null | undefined, sku?: string | null): 'good' | 'warn' | 'bad' | undefined {
  if (roas === null || roas === undefined) return undefined;
  const benchmark = sku === '3@999' ? 5 : 3;
  if (roas >= benchmark) return 'good';
  if (roas >= benchmark * 0.7) return 'warn';
  return 'bad';
}

export function classifyHook(rate: number | null | undefined): 'good' | 'warn' | 'bad' | undefined {
  if (rate === null || rate === undefined) return undefined;
  if (rate >= 0.30) return 'good';
  if (rate >= 0.20) return 'warn';
  return 'bad';
}
