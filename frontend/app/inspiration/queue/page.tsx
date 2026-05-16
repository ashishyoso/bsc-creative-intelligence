'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import InspirationNav from '../components/InspirationNav';
import VideoCard from '../components/VideoCard';
import SaveModal from '../components/SaveModal';
import RejectModal from '../components/RejectModal';
import EscalateModal from '../components/EscalateModal';
import { insp, SourceChannel, VideoSummary } from '../lib/api';

const ALL_CHANNELS: SourceChannel[] = ['meta_ad_library', 'meta_marketing', 'youtube', 'tiktok', 'brand_site', 'manual'];

type ModalKind = 'save' | 'reject' | 'escalate' | null;

// Epic 3 — the swipe interface. FIFO queue, single video at a time,
// mandatory tagging on save, decided videos disappear forever.
// Filters: route (P0 — applied client-side once we have product), brand,
// days running (default 30+), duration, status, source channel.
export default function QueuePage() {
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [stats, setStats] = useState({ saved: 0, rejected: 0, escalated: 0 });

  // Filters (P0)
  const [minDaysRunning, setMinDaysRunning] = useState<number>(30);
  const [durationBucket, setDurationBucket] = useState<string>('');
  const [sourceChannels, setSourceChannels] = useState<SourceChannel[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const vs = await insp.listVideos({
        status: 'pending',
        min_days_running: minDaysRunning || undefined,
        duration_bucket: durationBucket || undefined,
        source_channels: sourceChannels.length ? sourceChannels : undefined,
        brands: brands.length ? brands : undefined,
        search: search || undefined,
        limit: 50,
      });
      setVideos(vs);
      setIndex(0);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [minDaysRunning, durationBucket, sourceChannels, brands, search]);

  useEffect(() => { load(); }, [load]);

  const current = videos[index];

  const next = useCallback(() => {
    if (index < videos.length - 1) setIndex(i => i + 1);
    else load();
  }, [index, videos.length, load]);

  // Keyboard shortcuts (US-3.2 J/K + arrows, US-3.3 spacebar, action keys S/R/E)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (modal) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'j' || e.key === 'ArrowDown') { next(); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { setIndex(i => Math.max(0, i - 1)); }
      else if (e.key === 's' || e.key === 'S') { if (current) setModal('save'); }
      else if (e.key === 'r' || e.key === 'R') { if (current) setModal('reject'); }
      else if (e.key === 'e' || e.key === 'E') { if (current) setModal('escalate'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, current, next]);

  function onDecided(kind: 'save' | 'reject' | 'escalate') {
    setStats(s => ({ ...s, [kind === 'save' ? 'saved' : kind === 'reject' ? 'rejected' : 'escalated']: s[kind === 'save' ? 'saved' : kind === 'reject' ? 'rejected' : 'escalated'] + 1 }));
    setModal(null);
    // Remove the decided video from local state (US-3.8)
    setVideos(prev => prev.filter(v => v.id !== current?.id));
  }

  return (
    <main style={{ maxWidth: 1100 }}>
      <InspirationNav />

      <section className="panel" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
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
            {loading ? 'Loading…' : `${videos.length} pending — ${index + 1}/${videos.length || 0}`}
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

      {current && (
        <>
          <VideoCard video={current} />

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

      {modal === 'save' && current && (
        <SaveModal video={current} onSaved={() => onDecided('save')} onClose={() => setModal(null)} />
      )}
      {modal === 'reject' && current && (
        <RejectModal video={current} onRejected={() => onDecided('reject')} onClose={() => setModal(null)} />
      )}
      {modal === 'escalate' && current && (
        <EscalateModal video={current} onEscalated={() => onDecided('escalate')} onClose={() => setModal(null)} />
      )}
    </main>
  );
}
