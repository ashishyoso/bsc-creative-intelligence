'use client';
import { useState } from 'react';
import { insp, REJECT_REASONS, VideoSummary } from '../lib/api';

type Props = {
  video: VideoSummary;
  onRejected: () => void;
  onClose: () => void;
};

// US-3.6 — reject with structured reason. If reason='other', detail required (min 10 chars).
export default function RejectModal({ video, onRejected, onClose }: Props) {
  const [reason, setReason] = useState<string>('off_brand');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detailRequired = reason === 'other';
  const canSubmit = reason && (!detailRequired || detail.length >= 10) && !submitting;

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      await insp.rejectDecision({
        video_id: video.id,
        reject_reason: reason,
        reject_reason_detail: detailRequired ? detail : (detail || undefined),
      });
      onRejected();
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="panel" style={{ width: 480, maxWidth: '90vw' }}>
        <h2>Reject</h2>
        <p className="subtle">{video.brand} — {video.headline ?? video.title ?? video.id}</p>

        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <label>Reason
            <select value={reason} onChange={e => setReason(e.target.value)}>
              {REJECT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>

          {detailRequired && (
            <label>Detail (min 10 chars)
              <textarea rows={3} value={detail} onChange={e => setDetail(e.target.value)} />
              <span className="subtle">{detail.length} / 10</span>
            </label>
          )}

          {error && <div className="panel" style={{ background: '#fee' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onClose}>Cancel</button>
            <button onClick={submit} disabled={!canSubmit}>Reject</button>
          </div>
        </div>
      </div>
    </div>
  );
}
