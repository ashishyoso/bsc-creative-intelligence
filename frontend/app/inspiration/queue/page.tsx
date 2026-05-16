'use client';
import { useCallback, useEffect, useState } from 'react';
import InspirationNav from '../components/InspirationNav';
import VideoCard from '../components/VideoCard';
import VideoGridCard from '../components/VideoGridCard';
import SaveModal from '../components/SaveModal';
import RejectModal from '../components/RejectModal';
import EscalateModal from '../components/EscalateModal';
import { insp, SourceChannel, VideoSummary } from '../lib/api';

const ALL_CHANNELS: SourceChannel[] = ['meta_ad_library', 'meta_marketing', 'youtube', 'tiktok', 'brand_site', 'manual'];

type ModalKind = 'save' | 'reject' | 'escalate' | null;
type ViewMode = 'grid' | 'swipe';

// Epic 3 — the swipe interface, plus a Foreplay-style grid view for
// "see everything at once" browsing. Decisions are global (US-3.8) — a
// reject in either view removes the video from both views immediately.
export default function QueuePage() {
  const [view, setView] = useState<ViewMode>('grid');
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [stats, setStats] = useState({ saved: 0, rejected: 0, escalated: 0 });

  // Filters (P0)
  const [minDaysRunning, setMinDaysRunning] = useState<number>(30);
  const [durationBucket, setDurationBucket] = useState<string>('');
  const [sourceChannels, setSourceChannels] = useState<SourceChannel[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const vs = await insp.listVideos({
        status: 'pending',
        min_days_running: minDaysRunning || undefined,
        duration_bucket: durationBucket || undefined,
        source_channels: sourceChannels.length ? sourceChannels : undefined,
        search: search || undefined,
        limit: 100,
      });
      setVideos(vs);
      setIndex(0);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [minDaysRunning, durationBucket, sourceChannels, search]);

  useEffect(() => { load(); }, [load]);

  // The "active" video for modals — swipe mode uses index, grid uses click
  const active: VideoSummary | undefined = view === 'swipe'
    ? videos[index]
    : (activeVideoId ? videos.find(v => v.id === activeVideoId) : undefined);

  const next = useCallback(() => {
    if (index < videos.length - 1) setIndex(i => i + 1);
    else load();
  }, [index, videos.length, load]);

  // Keyboard shortcuts (swipe mode only)
  useEffect(() => {
    if (view !== 'swipe') return;
    function onKey(e: KeyboardEvent) {
      if (modal) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'j' || e.key === 'ArrowDown') { next(); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { setIndex(i => Math.max(0, i - 1)); }
      else if (e.key === 's' || e.key === 'S') { if (active) setModal('save'); }
      else if (e.key === 'r' || e.key === 'R') { if (active) setModal('reject'); }
      else if (e.key === 'e' || e.key === 'E') { if (active) setModal('escalate'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, modal, active, next]);

  function onDecided(kind: 'save' | 'reject' | 'escalate') {
    setStats(s => ({ ...s, [kind === 'save' ? 'saved' : kind === 'reject' ? 'rejected' : 'escalated']: s[kind === 'save' ? 'saved' : kind === 'reject' ? 'rejected' : 'escalated'] + 1 }));
    setModal(null);
    const decidedId = active?.id;
    setActiveVideoId(null);
    setVideos(prev => prev.filter(v => v.id !== decidedId));
  }

  function openModalFor(id: string, kind: 'save' | 'reject' | 'escalate') {
    setActiveVideoId(id);
    setModal(kind);
  }

  return (
    <main style={{ maxWidth: 1400 }}>
      <InspirationNav />

      <section className="panel" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setView('grid')} className={view === 'grid' ? 'nav-active' : ''}>Grid</button>
            <button onClick={() => setView('swipe')} className={view === 'swipe' ? 'nav-active' : ''}>Swipe</button>
          </div>
          <label>Min days running
            <select value={minDaysRunning} onChange={e => setMinDaysRunning(Number(e.target.value))} style={{ marginLeft: 4 }}>
              <option value={0}>any</option>
              <option value={14}>14+</option>
              <option value={30}>30+ (recommended)</option>
              <option value={60}>60+</option>
              <option value={90}>90+</option>
            </select>
          </label>
          <label>Duration
            <select value={durationBucket} onChange={e => setDurationBucket(e.target.value)} style={{ marginLeft: 4 }}>
              <option value="">any</option>
              <option value="3-6">3–6s</option>
              <option value="6-15">6–15s</option>
              <option value="15-30">15–30s</option>
              <option value="30+">30s+</option>
            </select>
          </label>
          <label>Source
            <select
              multiple
              value={sourceChannels}
              onChange={e => setSourceChannels(Array.from(e.target.selectedOptions).map(o => o.value as SourceChannel))}
              style={{ marginLeft: 4, minWidth: 160 }}
              size={3}
            >
              {ALL_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>Search
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="brand / copy / headline" style={{ marginLeft: 4 }} />
          </label>
          <div style={{ marginLeft: 'auto' }} className="subtle">
            {loading ? 'Loading…' : `${videos.length} pending${view === 'swipe' && videos.length ? ` — ${index + 1}/${videos.length}` : ''}`}
            <span style={{ marginLeft: 12 }}>
              Session: {stats.saved} saved · {stats.rejected} rejected · {stats.escalated} escalated
            </span>
          </div>
        </div>
      </section>

      {error && <div className="panel" style={{ background: '#fee' }}>{error}</div>}

      {!loading && videos.length === 0 && (
        <section className="panel" style={{ textAlign: 'center', padding: 48 }}>
          <h2>Queue empty</h2>
          <p className="subtle">No pending videos for current filters. Loosen filters or check source health.</p>
        </section>
      )}

      {view === 'grid' && videos.length > 0 && (
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
          }}
        >
          {videos.map(v => (
            <VideoGridCard
              key={v.id}
              video={v}
              onClick={() => { setActiveVideoId(v.id); setView('swipe'); setIndex(videos.findIndex(x => x.id === v.id)); }}
              onSave={() => openModalFor(v.id, 'save')}
              onReject={() => openModalFor(v.id, 'reject')}
              onEscalate={() => openModalFor(v.id, 'escalate')}
            />
          ))}
        </section>
      )}

      {view === 'swipe' && active && (
        <>
          <VideoCard video={active} />
          <section className="panel" style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
            <div className="subtle">Shortcuts: J/↓ next · K/↑ prev · S save · R reject · E escalate · space play/pause</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setIndex(i => Math.max(0, i - 1))}>← Prev</button>
              <button onClick={() => setModal('reject')} style={{ color: '#c62828' }}>Reject (R)</button>
              <button onClick={() => setModal('escalate')}>Escalate (E)</button>
              <button onClick={() => setModal('save')} style={{ background: '#4caf50', color: 'white' }}>Save (S)</button>
              <button onClick={next}>Next →</button>
            </div>
          </section>
        </>
      )}

      {modal === 'save' && active && (
        <SaveModal video={active} onSaved={() => onDecided('save')} onClose={() => setModal(null)} />
      )}
      {modal === 'reject' && active && (
        <RejectModal video={active} onRejected={() => onDecided('reject')} onClose={() => setModal(null)} />
      )}
      {modal === 'escalate' && active && (
        <EscalateModal video={active} onEscalated={() => onDecided('escalate')} onClose={() => setModal(null)} />
      )}
    </main>
  );
}
