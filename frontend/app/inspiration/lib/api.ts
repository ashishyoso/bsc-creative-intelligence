// Inspiration tool API client. Separate from the pilot's lib/api.ts.
// Calls go through the existing Next.js rewrites to FastAPI.

export type SourceChannel =
  | 'meta_ad_library'
  | 'meta_marketing'
  | 'youtube'
  | 'tiktok'
  | 'brand_site'
  | 'manual';

export type UserRole =
  | 'editor'
  | 'strategist'
  | 'senior_reviewer'
  | 'ops_lead'
  | 'founder'
  | 'admin';

export type VideoStatus = 'pending' | 'saved' | 'rejected' | 'escalated';
export type DecisionAction = 'saved' | 'rejected' | 'escalated';
export type Replicability = 'yes' | 'stretch' | 'no';
export type Priority = 'high' | 'medium' | 'low';

export type Product = {
  id: string;
  name: string;
  brand: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

export type Route = {
  id: string;
  product_id: string;
  name: string;
  design_tone: string | null;
  hard_no_list: string[] | null;
  funnel_split: Record<string, any> | null;
  static_format_notes: string | null;
  gif_format_notes: string | null;
  video_format_notes: string | null;
  version: number;
  is_archived: boolean;
};

export type Watchlist = {
  id: string;
  source_channel: SourceChannel;
  brand: string;
  source_external_id: string | null;
  is_active: boolean;
  priority: Priority;
  product_ids: string[];
  notes: string | null;
};

export type VideoSummary = {
  id: string;
  source_channel: SourceChannel;
  brand: string;
  is_internal: boolean;
  title: string | null;
  headline: string | null;
  cta_text: string | null;
  video_url: string;
  video_url_cached: string | null;
  video_thumbnail: string | null;
  duration_seconds: number | null;
  aspect_ratio: string | null;
  days_running: number | null;
  status: VideoStatus;
  fetched_at: string;
  performance: Record<string, any> | null;
};

export type VideoDetail = VideoSummary & {
  primary_text: string | null;
  caption: string | null;
  link_caption: string | null;
  link_description: string | null;
  link_url: string | null;
  languages: string[] | null;
  countries: string[] | null;
  publisher_platforms: string[] | null;
  source_published_at: string | null;
  delivery_start_at: string | null;
  delivery_stop_at: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  source_external_id: string;
};

export type ShotBreakdown = {
  decision_id: string;
  shot_count: number | null;
  camera_type: string | null;
  lighting_type: string | null;
  audio_approach: string | null;
  opening_hook: string | null;
  end_frame: string | null;
  total_runtime_seconds: number | null;
};

export type Reference = {
  decision_id: string;
  video: VideoSummary;
  product_id: string;
  route_id: string;
  route_name: string | null;
  replicability: Replicability;
  why_text: string;
  saved_by: string;
  saved_by_name: string | null;
  saved_at: string;
  shot_breakdown: ShotBreakdown | null;
};

export type SourceHealth = {
  source_channel: SourceChannel;
  last_pull_at: string | null;
  last_pull_records: number | null;
  seven_day_records: number;
  error_count: number;
  last_error: string | null;
  health: 'green' | 'amber' | 'red';
};

export type DecisionLogRow = {
  id: string;
  decided_at: string;
  editor_user_id: string;
  editor_name: string | null;
  product_id: string | null;
  product_name: string | null;
  route_id: string | null;
  route_name: string | null;
  action: DecisionAction;
  brand: string;
  source_channel: SourceChannel;
  video_url: string;
  why_or_reason: string | null;
  replicability: Replicability | null;
};

export type SourceVolumeRow = {
  source_channel: SourceChannel;
  weekly_counts: Array<{ week_start: string; count: number }>;
  save_rate: number | null;
};

export type RouteCoverageRow = {
  route_id: string;
  route_name: string;
  total_saved: number;
  saved_last_7d: number;
  saved_last_30d: number;
  is_under_served: boolean;
};

// ----------------------------------------------------------------- fetch core
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Frontend calls go through Next's /api/:path* rewrite to FastAPI,
  // which serves the Inspiration routers at /inspiration/...
  const resp = await fetch(`/api/inspiration${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!resp.ok) {
    let msg = `${resp.status} ${resp.statusText}`;
    try {
      const body = await resp.json();
      msg = body.detail ?? msg;
    } catch {}
    throw new Error(msg);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json();
}

function qs(params: Record<string, any>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v)) {
      for (const item of v) sp.append(k, String(item));
    } else {
      sp.set(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// -------------------------------------------------------------------- exports
export const insp = {
  // Products
  listProducts: (includeInactive = false) =>
    request<Product[]>(`/products${qs({ include_inactive: includeInactive })}`),
  createProduct: (b: Partial<Product>) =>
    request<Product>('/products', { method: 'POST', body: JSON.stringify(b) }),
  updateProduct: (id: string, b: Partial<Product>) =>
    request<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  archiveProduct: (id: string) =>
    request<void>(`/products/${id}`, { method: 'DELETE' }),

  // Routes
  listRoutes: (productId: string, includeArchived = false) =>
    request<Route[]>(`/routes${qs({ product_id: productId, include_archived: includeArchived })}`),
  createRoute: (b: Partial<Route>) =>
    request<Route>('/routes', { method: 'POST', body: JSON.stringify(b) }),
  updateRoute: (id: string, b: Partial<Route>) =>
    request<Route>(`/routes/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  archiveRoute: (id: string) =>
    request<void>(`/routes/${id}`, { method: 'DELETE' }),

  // Watchlist
  listWatchlist: (sourceChannel?: SourceChannel, includeInactive = false) =>
    request<Watchlist[]>(`/watchlist${qs({ source_channel: sourceChannel, include_inactive: includeInactive })}`),
  addWatchlist: (b: Partial<Watchlist>) =>
    request<Watchlist>('/watchlist', { method: 'POST', body: JSON.stringify(b) }),
  updateWatchlist: (id: string, b: Partial<Watchlist>) =>
    request<Watchlist>(`/watchlist/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  removeWatchlist: (id: string) =>
    request<void>(`/watchlist/${id}`, { method: 'DELETE' }),

  // Users
  me: () => request<{ id: string; email: string; name: string; roles: UserRole[] }>('/users/me'),

  // Videos / queue
  listVideos: (params: {
    status?: VideoStatus;
    brands?: string[];
    source_channels?: SourceChannel[];
    min_days_running?: number;
    duration_bucket?: string;
    aspect_ratios?: string[];
    search?: string;
    limit?: number;
    offset?: number;
  }) => request<VideoSummary[]>(`/videos${qs(params)}`),
  getVideo: (id: string) => request<VideoDetail>(`/videos/${id}`),
  addManualVideo: (b: { url: string; source_channel: SourceChannel; brand: string }) =>
    request<VideoSummary>('/videos/manual', { method: 'POST', body: JSON.stringify(b) }),

  // Decisions
  saveDecision: (b: {
    video_id: string;
    product_id: string;
    route_id: string;
    replicability: Replicability;
    why_text: string;
    cross_product_saves?: Array<{ product_id: string; route_id: string }>;
  }) => request('/decisions/save', { method: 'POST', body: JSON.stringify(b) }),
  rejectDecision: (b: { video_id: string; reject_reason: string; reject_reason_detail?: string }) =>
    request('/decisions/reject', { method: 'POST', body: JSON.stringify(b) }),
  escalateDecision: (b: { video_id: string; escalation_note?: string }) =>
    request('/decisions/escalate', { method: 'POST', body: JSON.stringify(b) }),
  undoDecision: (id: string) =>
    request<void>(`/decisions/${id}/undo`, { method: 'POST' }),

  // References (saved library)
  listReferences: (params: {
    product_id: string;
    route_id: string;
    replicability?: Replicability[];
    search?: string;
    sort?: 'recent' | 'oldest' | 'brand' | 'replicability';
    limit?: number;
  }) => request<Reference[]>(`/references${qs(params)}`),
  getReference: (id: string) => request<Reference>(`/references/${id}`),
  upsertShotBreakdown: (id: string, b: Partial<ShotBreakdown>) =>
    request<ShotBreakdown>(`/references/${id}/shot-breakdown`, {
      method: 'PUT',
      body: JSON.stringify(b),
    }),

  // Senior review
  sendBack: (b: { video_id: string; note?: string }) =>
    request<void>('/escalations/send-back', { method: 'POST', body: JSON.stringify(b) }),
  resolveSave: (b: any) =>
    request('/escalations/resolve-save', { method: 'POST', body: JSON.stringify(b) }),
  resolveReject: (b: any) =>
    request('/escalations/resolve-reject', { method: 'POST', body: JSON.stringify(b) }),

  // Ops / reports
  sourceHealth: () => request<SourceHealth[]>('/sources/health'),
  decisionsLog: (params: Record<string, any>) =>
    request<DecisionLogRow[]>(`/reports/decisions${qs(params)}`),
  sourceVolume: (weeks = 12) =>
    request<SourceVolumeRow[]>(`/reports/source-volume${qs({ weeks })}`),
  routeCoverage: (productId: string) =>
    request<RouteCoverageRow[]>(`/reports/route-coverage${qs({ product_id: productId })}`),
};

export const REJECT_REASONS = [
  { value: 'off_brand', label: 'Off-brand' },
  { value: 'low_production_quality', label: 'Low production quality' },
  { value: 'irrelevant_for_product', label: 'Irrelevant for product' },
  { value: 'cant_replicate', label: 'Can\'t replicate' },
  { value: 'already_have_similar', label: 'Already have similar' },
  { value: 'not_a_video_ad', label: 'Not a video ad' },
  { value: 'other', label: 'Other' },
] as const;
