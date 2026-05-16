'use client';
import { useState } from 'react';
import { insp, VideoSummary } from '../lib/api';

type Props = {
  video: VideoSummary;
  onEscalated: () => void;
  onClose: () => void;
};

// US-3.7 — escalate with optional 1-line context note.
export default function EscalateModal({ video, onEscalated, onClose }: Props) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      await insp.escalateDecision({ video_id: video.id, escalation_note: note || undefined });
      onEscalated();
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="panel" style={{ width: 480, maxWidth: '90vw' }}>
        <h2>Escalate</h2>
        <p className="subtle">{video.brand} — {video.headline ?? video.title ?? video.id}</p>

        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <label>1-line context (optional)
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Why this needs senior judgment"
            />
          </label>

          {error && <div className="panel" style={{ background: '#fee' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose}>Cancel</button>
            <button onClick={submit} disabled={submitting}>Escalate</button>
          </div>
        </div>
      </div>
    </div>
  );
}
