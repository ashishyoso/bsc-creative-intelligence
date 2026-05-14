'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AssetSummary, api } from './lib/api';
import AssetCard from './components/AssetCard';
import AssetDrawer from './components/AssetDrawer';
import { CardGridSkeleton } from './components/Skeletons';
import { useToast } from './components/Toast';

const SKU_OPTIONS = ['', 'FBT', 'FBT SE', '3@999', '18hr Sale', 'Legend 365', 'Bombae', 'Fragrance', 'Razors', 'Blo Trimmer'];
const FORMAT_OPTIONS = ['', 'Talking Head', 'Skit/Sketch', 'Unboxing', 'Product Demo', 'Static Image', 'Carousel Frame', 'Explainer/VO over B-roll', 'Lifestyle B-roll', 'Trend Adaptation', 'Other'];
const ARCHETYPE_OPTIONS = ['', 'POV/Relatable', 'Humor Sketch', 'Founder/Talking Head', 'Product Demo', 'Before/After Transformation', 'Testimonial', 'Meme Format', 'UGC/Unboxing', 'Listicle/Tips', 'Trend-Jack', 'Comparison', 'Educational', 'Offer/Discount Forward', 'Cinematic Brand Film', 'Other'];
const PERSONA_OPTIONS = ['', 'Corporate Professional', 'Gym-Goer', 'College Student', 'Tier-2 Aspirational', 'Dad/Husband', 'Newly-Single/Glow-up', 'Dating-Active', 'Body-Conscious', 'Hygiene-Aware', 'Undifferentiated'];
const AWARENESS_OPTIONS = ['', 'Unaware', 'Problem-Aware', 'Solution-Aware', 'Product-Aware', 'Most-Aware'];
const LANG_OPTIONS = ['', 'English', 'Hindi', 'Hinglish', 'Other', 'N/A'];
const SORT_OPTIONS = [
  { v: 'spend', l: 'Spend' },
  { v: 'roas', l: 'ROAS' },
  { v: 'hook_rate', l: 'Hook Rate' },
  { v: 'hold_rate', l: 'Hold Rate' },
  { v: 'ctr', l: 'CTR' },
];

const PAGE_SIZE = 48;

export default function LibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ total: number; by_type: Record<string, number> } | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Filters — sourced from URL when present (drill-down deep-links)
  const [sku, setSku] = useState(searchParams.get('sku') ?? '');
  const [format, setFormat] = useState(searchParams.get('format') ?? '');
  const [archetype, setArchetype] = useState(searchParams.get('hook_archetype') ?? '');
  const [persona, setPersona] = useState(searchParams.get('persona_implied') ?? '');
  const [awareness, setAwareness] = useState(searchParams.get('awareness_stage') ?? '');
  const [language, setLanguage] = useState(searchParams.get('audio_language') ?? '');
  const [assetType, setAssetType] = useState<'' | 'video' | 'image'>(
    (searchParams.get('asset_type') as 'video' | 'image' | '') ?? ''
  );
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [minSpend, setMinSpend] = useState(searchParams.get('min_spend') ?? '');
  const [minRoas, setMinRoas] = useState(searchParams.get('min_roas') ?? '');
  const [minHook, setMinHook] = useState(searchParams.get('min_hook_rate') ?? '');
  const [brandFirst3s, setBrandFirst3s] = useState<'' | 'true' | 'false'>(
    (searchParams.get('brand_visible_first_3s') as 'true' | 'false' | '') ?? ''
  );
  const [sortBy, setSortBy] = useState(searchParams.get('sort_by') ?? 'spend');

  async function load() {
    setLoading(true);
    setError(null);
    setVisible(PAGE_SIZE);
    try {
      const data = await api.listAssets({
        sku: sku || null,
        format: format || null,
        hook_archetype: archetype || null,
        persona_implied: persona || null,
        awareness_stage: awareness || null,
        audio_language: language || null,
        asset_type: assetType || null,
        search: search || null,
        min_spend: minSpend ? Number(minSpend) : null,
        min_roas: minRoas ? Number(minRoas) : null,
        min_hook_rate: minHook ? Number(minHook) / 100 : null,
        brand_visible_first_3s: brandFirst3s === '' ? null : brandFirst3s === 'true',
        sort_by: sortBy,
        limit: 1000,
      });
      setAssets(data);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { api.getCounts().then(setCounts).catch(() => {}); }, []);

  // Reload whenever the filter params change. The `asset` param drives the
  // drawer alone — toggling it should not refetch the library.
  const filterKey = (() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete('asset');
    return p.toString();
  })();
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterKey]);

  function clearAll() {
    setSku(''); setFormat(''); setArchetype(''); setPersona(''); setAwareness('');
    setLanguage(''); setAssetType(''); setSearch(''); setMinSpend(''); setMinRoas('');
    setMinHook(''); setBrandFirst3s(''); setSortBy('spend');
    router.push('/');
  }

  function applyFilters() {
    const params = new URLSearchParams();
    if (sku) params.set('sku', sku);
    if (format) params.set('format', format);
    if (archetype) params.set('hook_archetype', archetype);
    if (persona) params.set('persona_implied', persona);
    if (awareness) params.set('awareness_stage', awareness);
    if (language) params.set('audio_language', language);
    if (assetType) params.set('asset_type', assetType);
    if (search) params.set('search', search);
    if (minSpend) params.set('min_spend', minSpend);
    if (minRoas) params.set('min_roas', minRoas);
    if (minHook) params.set('min_hook_rate', minHook);
    if (brandFirst3s) params.set('brand_visible_first_3s', brandFirst3s);
    if (sortBy !== 'spend') params.set('sort_by', sortBy);
    router.push(`/?${params.toString()}`);
  }

  const visibleAssets = useMemo(() => assets.slice(0, visible), [assets, visible]);
  const remaining = assets.length - visible;

  // Saved views (US-2.6) — local storage for the pilot
  type SavedView = { name: string; query: string };
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('yoso-bsc-saved-views');
      if (raw) setSavedViews(JSON.parse(raw));
    } catch {}
  }, []);
  function persistSavedViews(views: SavedView[]) {
    setSavedViews(views);
    try { window.localStorage.setItem('yoso-bsc-saved-views', JSON.stringify(views)); } catch {}
  }
  function saveCurrentView() {
    const name = window.prompt('Name this view (e.g. "FBT SE Top ROAS"):');
    if (!name) return;
    const query = searchParams.toString();
    persistSavedViews([...savedViews.filter((v) => v.name !== name), { name, query }]);
    toast.push(`Saved view "${name}"`, 'success');
  }
  function loadView(v: SavedView) { router.push(`/?${v.query}`); }
  function deleteView(name: string) { persistSavedViews(savedViews.filter((v) => v.name !== name)); }

  // Multi-select compare (US-2.7) — up to 4 assets
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      else { toast.push('Maximum 4 creatives can be compared', 'warn'); return prev; }
      return next;
    });
  }
  function openCompare() {
    const ids = Array.from(selectedIds).join(',');
    router.push(`/compare?ids=${ids}`);
  }

  // Drawer: when ?asset=X is present in the URL, show the right-side detail panel
  const openAssetId = searchParams.get('asset');
  function openAsset(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('asset', id);
    router.push(`/?${params.toString()}`, { scroll: false });
  }
  function closeAsset() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('asset');
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : '/', { scroll: false });
  }

  return (
    <div className="layout">
      <aside className="filters">
        <h3>Asset Type</h3>
        <div className="segmented">
          <button
            className={assetType === '' ? 'active' : ''}
            onClick={() => setAssetType('')}
          >All<span className="seg-count">{counts ? counts.total : ''}</span></button>
          <button
            className={assetType === 'video' ? 'active' : ''}
            onClick={() => setAssetType('video')}
          >Video<span className="seg-count">{counts?.by_type?.video ?? ''}</span></button>
          <button
            className={assetType === 'image' ? 'active' : ''}
            onClick={() => setAssetType('image')}
          >Image<span className="seg-count">{counts?.by_type?.image ?? ''}</span></button>
        </div>

        <h3>SKU</h3>
        <select value={sku} onChange={(e) => setSku(e.target.value)}>
          {SKU_OPTIONS.map((o) => <option key={o} value={o}>{o || 'All'}</option>)}
        </select>

        <h3>Format</h3>
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          {FORMAT_OPTIONS.map((o) => <option key={o} value={o}>{o || 'All'}</option>)}
        </select>

        <h3>Hook Archetype</h3>
        <select value={archetype} onChange={(e) => setArchetype(e.target.value)}>
          {ARCHETYPE_OPTIONS.map((o) => <option key={o} value={o}>{o || 'All'}</option>)}
        </select>

        <h3>Persona</h3>
        <select value={persona} onChange={(e) => setPersona(e.target.value)}>
          {PERSONA_OPTIONS.map((o) => <option key={o} value={o}>{o || 'All'}</option>)}
        </select>

        <h3>Awareness Stage</h3>
        <select value={awareness} onChange={(e) => setAwareness(e.target.value)}>
          {AWARENESS_OPTIONS.map((o) => <option key={o} value={o}>{o || 'All'}</option>)}
        </select>

        <h3>Language</h3>
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANG_OPTIONS.map((o) => <option key={o} value={o}>{o || 'All'}</option>)}
        </select>

        <h3>Brand visible in first 3s</h3>
        <select value={brandFirst3s} onChange={(e) => setBrandFirst3s(e.target.value as any)}>
          <option value="">Any</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>

        <h3>Min Spend (₹)</h3>
        <input value={minSpend} onChange={(e) => setMinSpend(e.target.value)} placeholder="e.g. 100000" />

        <h3>Min ROAS</h3>
        <input value={minRoas} onChange={(e) => setMinRoas(e.target.value)} placeholder="e.g. 3.0" />

        <h3>Min Hook Rate (%)</h3>
        <input value={minHook} onChange={(e) => setMinHook(e.target.value)} placeholder="e.g. 30" />

        <h3>Search</h3>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ad name / text / transcript" />

        <h3>Sort</h3>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>

        <button onClick={applyFilters}>Apply filters</button>
        <button className="secondary" onClick={clearAll}>Clear</button>

        {savedViews.length > 0 && (
          <>
            <h3>Saved views</h3>
            {savedViews.map((v) => (
              <div key={v.name} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <button
                  className="secondary"
                  onClick={() => loadView(v)}
                  style={{ flex: 1, marginTop: 0, padding: '6px 8px', fontSize: 12, textAlign: 'left' }}
                >{v.name}</button>
                <button
                  className="secondary"
                  onClick={() => deleteView(v.name)}
                  style={{ marginTop: 0, padding: '6px 8px', fontSize: 12, width: 28 }}
                  title="Delete"
                >×</button>
              </div>
            ))}
          </>
        )}
        <button className="secondary" onClick={saveCurrentView} style={{ fontSize: 12 }}>+ Save current view</button>
      </aside>

      <section>
        <div className="toolbar">
          <h1 className="page-title">Library</h1>
          {loading && assets.length > 0 && <span className="dot-spinner" />}
          <span className="count">
            {loading && assets.length === 0
              ? 'Loading…'
              : `Showing ${Math.min(visible, assets.length)} of ${assets.length}${counts ? ` · ${counts.total} total in vault` : ''}`}
          </span>
        </div>
        {error && <div className="panel" style={{ color: 'var(--danger)' }}>Error: {error}</div>}
        {loading && assets.length === 0 ? (
          <CardGridSkeleton count={12} />
        ) : (
          <div className="grid">
            {visibleAssets.map((a) => (
              <AssetCard
                key={a.asset_id}
                a={a}
                selectable
                selected={selectedIds.has(a.asset_id)}
                onToggleSelect={() => toggleSelect(a.asset_id)}
                onClick={() => openAsset(a.asset_id)}
              />
            ))}
          </div>
        )}
        <AssetDrawer assetId={openAssetId} open={!!openAssetId} onClose={closeAsset} />
        {selectedIds.size > 0 && (
          <div className="compare-bar">
            <span className="compare-count">{selectedIds.size}</span>
            <span>creative{selectedIds.size > 1 ? 's' : ''} selected</span>
            <button
              className="btn"
              disabled={selectedIds.size < 2}
              onClick={openCompare}
              style={{ padding: '6px 14px' }}
            >Compare →</button>
            <button
              className="btn secondary"
              onClick={() => setSelectedIds(new Set())}
              style={{ padding: '6px 14px' }}
            >Clear</button>
          </div>
        )}
        {remaining > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0' }}>
            <button
              className="btn"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
            >
              Load {Math.min(remaining, PAGE_SIZE)} more · {remaining} remaining
            </button>
          </div>
        )}
        {!loading && assets.length === 0 && !error && (
          <div className="panel">
            <div className="empty">
              <span className="empty-icon">⌕</span>
              <div className="empty-title">No creatives match these filters</div>
              <div className="empty-hint">
                Try clearing filters, or run the ingest pipeline from <a href="/ingest">Settings → Ingest</a>.
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
