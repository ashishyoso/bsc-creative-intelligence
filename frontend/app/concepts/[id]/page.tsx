'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, fmtMoney, fmtNum, fmtPct } from '../../lib/api';

export default function ConceptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  useEffect(() => {
    api.conceptDetail(id).then((d) => {
      setData(d);
      setRenameVal(d?.concept_name ?? '');
    }).catch((e) => setError(e.message ?? String(e)));
  }, [id]);

  async function rename() {
    try {
      await api.renameConcept(id, renameVal);
      setData({ ...data, concept_name: renameVal });
    } catch (e: any) { setError(e.message ?? String(e)); }
  }

  if (error) return <div className="panel" style={{ color: 'var(--danger)' }}>Error: {error}</div>;
  if (!data) return <div className="panel subtle">Loading…</div>;

  return (
    <div>
      <div className="toolbar">
        <Link href="/concepts" className="btn secondary">← Concepts</Link>
        <h1 className="page-title">{data.concept_id}</h1>
        <span className="count">{data.asset_count} variations</span>
      </div>

      <div className="panel">
        <h2>Name</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} style={{ flex: 1, padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }} />
          <button className="btn" onClick={rename}>Save</button>
        </div>
        <div className="subtle" style={{ fontSize: 11, marginTop: 6 }}>
          Renaming protects the concept from being auto-overwritten on re-clustering.
        </div>
      </div>

      <h3 style={{ fontSize: 13, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '20px 0 10px' }}>Variations</h3>
      <div className="grid">
        {data.variations.map((v: any) => {
          const ratio = v.actual_width && v.actual_height ? v.actual_width / v.actual_height : 9 / 16;
          const aspect = ratio < 0.7 ? '9 / 16' : ratio < 0.95 ? '4 / 5' : ratio < 1.15 ? '1 / 1' : '16 / 9';
          return (
            <div key={v.asset_id} className="card" onClick={() => router.push(`/asset/${v.asset_id}`)}>
              <div className="thumb" style={{ aspectRatio: aspect }}>
                {v.asset_type === 'image' ? (
                  <img src={`/media/${v.asset_id}`} alt={v.ad_name ?? ''} style={{ objectFit: 'contain' }} />
                ) : (
                  <img src={`/media/${v.asset_id}/frame/hook_0_5s`} alt={v.ad_name ?? ''} style={{ objectFit: 'contain' }}
                    onError={(e) => ((e.currentTarget.style.display = 'none'))} />
                )}
              </div>
              <div className="card-body">
                <div className="card-title" title={v.ad_name ?? ''}>{v.ad_name ?? v.asset_id}</div>
                <div className="card-stats">
                  <div><div className="stat-label">Spend</div><div className="stat-val">{fmtMoney(v.spend)}</div></div>
                  <div><div className="stat-label">ROAS</div><div className="stat-val">{fmtNum(v.roas)}</div></div>
                  <div><div className="stat-label">Hook</div><div className="stat-val">{fmtPct(v.hook_rate)}</div></div>
                  <div><div className="stat-label">SKU</div><div className="stat-val" style={{ fontSize: 10 }}>{v.sku ?? '—'}</div></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
