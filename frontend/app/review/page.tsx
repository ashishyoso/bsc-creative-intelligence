'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, fmtMoney } from '../lib/api';
import { useToast } from '../components/Toast';

const FIELDS = ['sku', 'format', 'hook_archetype', 'persona_implied', 'awareness_stage', 'audio_language', 'talent_type', 'setting'];

export default function ReviewPage() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});

  async function load() {
    setLoading(true); setError(null);
    try { setData(await api.reviewQueue()); }
    catch (e: any) { setError(e.message ?? String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function approve(assetId: string) {
    await api.reviewDecision(assetId, { decision: 'approve' });
    setData({ ...data, items: data.items.filter((x: any) => x.asset_id !== assetId) });
    toast.push('Approved as human-verified', 'success');
  }

  async function override(assetId: string) {
    const corrections = edits[assetId] ?? {};
    if (!Object.keys(corrections).filter((k) => corrections[k]).length) {
      toast.push('Edit at least one field, or use Approve', 'warn');
      return;
    }
    await api.reviewDecision(assetId, { decision: 'override', corrections });
    setData({ ...data, items: data.items.filter((x: any) => x.asset_id !== assetId) });
    toast.push('Override saved', 'success');
  }

  if (loading) return <div className="panel subtle">Loading…</div>;
  if (error) return <div className="panel" style={{ color: 'var(--danger)' }}>Error: {error}</div>;

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title">Auto-tag review queue</h1>
        <span className="count">{data?.queue_size ?? 0} pending · {data?.sample_pct_realized * 100}% of recent tags</span>
      </div>
      <div className="subtle" style={{ marginBottom: 14, fontSize: 13 }}>
        Random + targeted sample of recent auto-tags. Approve to mark verified, or override to correct.
      </div>

      {data?.items?.length === 0 && (
        <div className="panel">
          <div className="empty">
            <span className="empty-icon" style={{ color: 'var(--good)' }}>✓</span>
            <div className="empty-title" style={{ color: 'var(--good)' }}>No items pending review</div>
            <div className="empty-hint">All recent auto-tags have been sampled or marked clean. The queue regenerates daily as new creatives get tagged.</div>
          </div>
        </div>
      )}

      {data?.items?.map((item: any) => {
        const ratio = item.actual_width && item.actual_height ? item.actual_width / item.actual_height : 9/16;
        const aspect = ratio < 0.7 ? '9 / 16' : ratio < 0.95 ? '4 / 5' : ratio < 1.15 ? '1 / 1' : '16 / 9';
        return (
          <div key={item.asset_id} className="panel">
            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
              <div>
                <div style={{ aspectRatio: aspect, background: '#000', borderRadius: 6, overflow: 'hidden' }}>
                  {item.asset_type === 'image' ? (
                    <img src={`/media/${item.asset_id}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <video src={`/media/${item.asset_id}`} controls preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  )}
                </div>
                <div className="subtle" style={{ fontSize: 11, marginTop: 6 }}>
                  Spend: {fmtMoney(item.spend)} · Reason: <strong style={{ color: 'var(--accent)' }}>{item.reason}</strong>
                </div>
                <div className="subtle" style={{ fontSize: 11, marginTop: 2 }}>
                  <a href={`/asset/${item.asset_id}`} style={{ color: 'var(--accent)' }}>View full detail →</a>
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{item.ad_name ?? item.asset_id}</div>
                <table className="table">
                  <thead>
                    <tr><th>Field</th><th>Auto-detected</th><th>Confidence</th><th>Override</th></tr>
                  </thead>
                  <tbody>
                    {FIELDS.map((f) => {
                      const field = item.fields?.[f] ?? {};
                      const val = field.value;
                      const conf = field.confidence;
                      return (
                        <tr key={f}>
                          <td>{f.replace('_', ' ')}</td>
                          <td>{val === null || val === undefined ? '—' : String(val)}</td>
                          <td className="subtle">{conf !== undefined && conf !== null ? `${(conf * 100).toFixed(0)}%` : '—'}</td>
                          <td>
                            <input
                              placeholder="correction…"
                              value={(edits[item.asset_id] ?? {})[f] ?? ''}
                              onChange={(e) => setEdits({ ...edits, [item.asset_id]: { ...(edits[item.asset_id] ?? {}), [f]: e.target.value } })}
                              style={{ width: 180, padding: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, fontSize: 12 }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn" onClick={() => approve(item.asset_id)}>✓ Approve as is</button>
                  <button className="btn secondary" onClick={() => override(item.asset_id)}>Override with corrections</button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
