'use client';
import { useEffect, useState } from 'react';
import { MappingQueueItem, api, fmtMoney } from '../lib/api';
import { useToast } from '../components/Toast';

export default function MappingQueuePage() {
  const toast = useToast();
  const [items, setItems] = useState<MappingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true); setError(null);
    try {
      setItems(await api.mappingQueue());
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function resolve(id: string, decision: 'CONFIRM' | 'REJECT' | 'DIFFERENT_EDIT') {
    setBusy(id);
    try {
      await api.resolveMapping(id, decision, notes[id]);
      setItems((p) => p.filter((it) => it.asset_id !== id));
      const label = decision === 'CONFIRM' ? 'Confirmed' : decision === 'REJECT' ? 'Rejected' : 'Marked as different edit';
      toast.push(label, 'success');
    } catch (e: any) {
      toast.push(e.message ?? String(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title">Mapping Queue</h1>
        <span className="count">{loading ? 'Loading…' : `${items.length} pending`}</span>
      </div>
      {error && <div className="panel" style={{ color: 'var(--danger)' }}>Error: {error}</div>}
      {!loading && items.length === 0 && (
        <div className="panel">
          <div className="empty">
            <span className="empty-icon" style={{ color: 'var(--good)' }}>✓</span>
            <div className="empty-title" style={{ color: 'var(--good)' }}>All assets verified clean</div>
            <div className="empty-hint">No mapping issues. Every downloaded file matches its Hawky row within tolerance.</div>
          </div>
        </div>
      )}

      {items.map((it) => (
        <div key={it.asset_id} className="panel">
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
            <video
              src={`/media/${it.asset_id}`}
              controls
              muted
              preload="metadata"
              style={{ width: '100%', borderRadius: 8, background: '#000', aspectRatio: '9 / 16' }}
            />
            <div>
              <div className="kv">
                <div className="k">Asset ID</div><div>{it.asset_id}</div>
                <div className="k">Status</div><div style={{ color: 'var(--warn)' }}>{it.mapping_status}</div>
                <div className="k">Reason</div><div>{it.mapping_resolution_note}</div>
                <div className="k">Hawky duration</div><div>{it.declared_duration_seconds ?? '—'}</div>
                <div className="k">Actual duration</div><div>{it.actual_duration_seconds ? `${it.actual_duration_seconds.toFixed(2)}s` : '—'}</div>
                <div className="k">Resolution</div><div>{it.actual_width && it.actual_height ? `${it.actual_width}×${it.actual_height}` : '—'}</div>
                <div className="k">Primary Ad ID</div><div>{it.primary_ad_id ?? '—'}</div>
                <div className="k">Ad Name</div><div>{it.primary_ad_name ?? '—'}</div>
                <div className="k">Spend</div><div>{fmtMoney(it.spend)}</div>
                <div className="k">CDN URL</div><div style={{ fontSize: 11, wordBreak: 'break-all' }}>{it.mapping_key}</div>
              </div>
              <div style={{ marginTop: 12 }}>
                <input
                  placeholder="Resolution note (optional)"
                  value={notes[it.asset_id] ?? ''}
                  onChange={(e) => setNotes((p) => ({ ...p, [it.asset_id]: e.target.value }))}
                  style={{ width: '100%', padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn" disabled={busy === it.asset_id} onClick={() => resolve(it.asset_id, 'CONFIRM')}>Confirm match</button>
                  <button className="btn secondary" disabled={busy === it.asset_id} onClick={() => resolve(it.asset_id, 'DIFFERENT_EDIT')}>Different edit, same concept</button>
                  <button className="btn danger" disabled={busy === it.asset_id} onClick={() => resolve(it.asset_id, 'REJECT')}>Reject — wrong file</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
