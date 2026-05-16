'use client';
import { useCallback, useEffect, useState } from 'react';
import InspirationNav from '../components/InspirationNav';
import VideoCard from '../components/VideoCard';
import SaveModal from '../components/SaveModal';
import RejectModal from '../components/RejectModal';
import { insp, VideoSummary } from '../lib/api';

type ModalKind = 'save' | 'reject' | 'sendback' | null;

// US-8.1 — Senior Reviewer escalation queue.
export default function ReviewPage() {
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalKind>(null);
  const [sendBackNote, setSendBackNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const vs = await insp.listVideos({ status: 'escalated', limit: 100 });
      setVideos(vs);
      setIndex(0);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const current = videos[index];

  async function sendBack() {
    if (!current) return;
    try {
      await insp.sendBack({ video_id: current.id, note: sendBackNote || undefined });
      setVideos(prev => prev.filter(v => v.id !== current.id));
      setSendBackNote('');
      setModal(null);
    } catch (e: any) { setError(e.message); }
  }

  return (
    <main style={{ maxWidth: 1100 }}>
      <InspirationNav />
      <section className="panel" style={{ marginBottom: 12 }}>
        <h1>Senior Review (US-8.1)</h1>
        <p className="subtle">{videos.length} escalated · clear daily.</p>
        {videos.length > 10 && (
          <p style={{ color: '#f44336' }}>⚠ Escalation queue exceeds 10 items — Slack/email alert should have fired.</p>
        )}
      </section>

      {error && <div className="panel" style={{ background: '#fee' }}>{error}</div>}
      {loading ? <p>Loading…</p> : null}

      {!loading && videos.length === 0 && (
        <section className="panel" style={{ textAlign: 'center', padding: 48 }}>
          <h2>All clear</h2>
          <p className="subtle">No escalations in the queue.</p>
        </section>
      )}

      {current && (
        <>
          <VideoCard video={current} />
          <section className="panel" style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
            <div className="subtle">{index + 1}/{videos.length}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModal('sendback')}>Send back to editor</button>
              <button onClick={() => setModal('reject')} style={{ color: '#c62828' }}>Reject</button>
              <button onClick={() => setModal('save')} style={{ background: '#4caf50', color: 'white' }}>Save</button>
            </div>
          </section>
        </>
      )}

      {modal === 'save' && current && (
        <SaveModal
          video={current}
          onSaved={() => { setVideos(prev => prev.filter(v => v.id !== current.id)); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'reject' && current && (
        <RejectModal
          video={current}
          onRejected={() => { setVideos(prev => prev.filter(v => v.id !== current.id)); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'sendback' && current && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="panel" style={{ width: 480 }}>
            <h2>Send back</h2>
            <p className="subtle">{current.brand} — {current.headline}</p>
            <label>Note to editor
              <textarea rows={3} value={sendBackNote} onChange={e => setSendBackNote(e.target.value)} />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setModal(null)}>Cancel</button>
              <button onClick={sendBack}>Send back</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
