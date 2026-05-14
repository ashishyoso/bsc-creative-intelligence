'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, fmtMoney, fmtNum, fmtPct } from '../lib/api';
import { TableSkeleton } from '../components/Skeletons';
import { useToast } from '../components/Toast';

type Concept = Awaited<ReturnType<typeof api.listConcepts>>[number];

export default function ConceptsPage() {
  const router = useRouter();
  const toast = useToast();
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [minAssets, setMinAssets] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [lastRecompute, setLastRecompute] = useState<any>(null);

  async function load() {
    setLoading(true); setError(null);
    try { setConcepts(await api.listConcepts(minAssets)); }
    catch (e: any) { setError(e.message ?? String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [minAssets]);

  async function recompute() {
    const ok = await toast.confirm(
      'Recluster all assets? Manual concept names are preserved; auto-generated ones are regenerated.',
      { confirmLabel: 'Recompute' }
    );
    if (!ok) return;
    setBusy(true); setError(null);
    try {
      const r = await api.recomputeConcepts();
      setLastRecompute(r);
      await load();
      toast.push(`${r.clusters_created} clusters created · ${r.assets_assigned} assets assigned`, 'success');
    } catch (e: any) {
      setError(e.message ?? String(e));
      toast.push('Recompute failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  const groups = concepts.filter(c => c.asset_count > 1);
  const singletons = concepts.filter(c => c.asset_count === 1);

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title">Concepts</h1>
        <span className="count">{loading ? 'Loading…' : `${groups.length} clustered concepts · ${singletons.length} singletons`}</span>
      </div>
      <div className="subtle" style={{ marginBottom: 14, fontSize: 13 }}>
        Creatives grouped by visual similarity (perceptual hash on hook frame) + matching hook archetype.
        Click any concept to see its variations.
      </div>

      <div className="toolbar">
        <label className="subtle">Min asset count per concept</label>
        <input type="number" value={minAssets} onChange={(e) => setMinAssets(Number(e.target.value) || 1)} style={{ width: 60 }} />
        <button className="btn" disabled={busy} onClick={recompute}>{busy ? 'Reclustering…' : 'Recompute clustering'}</button>
      </div>

      {lastRecompute && (
        <div className="panel subtle" style={{ fontSize: 12 }}>
          <strong>Last recompute:</strong> {lastRecompute.clusters_created} clusters created · {lastRecompute.assets_assigned} assets assigned · largest cluster = {lastRecompute.largest_cluster}
        </div>
      )}

      {error && <div className="panel" style={{ color: 'var(--danger)' }}>Error: {error}</div>}

      <h3 style={{ fontSize: 13, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '20px 0 10px' }}>Multi-asset concepts</h3>
      {loading && concepts.length === 0 ? (
        <TableSkeleton rows={8} cols={6} />
      ) : (
      <div className="panel" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th><th>Name</th><th>Assets</th><th>Total Spend</th><th>Avg ROAS</th><th>Avg Hook Rate</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((c) => (
              <tr key={c.concept_id} onClick={() => router.push(`/concepts/${c.concept_id}`)} style={{ cursor: 'pointer' }}>
                <td><strong>{c.concept_id}</strong></td>
                <td>{c.concept_name}</td>
                <td>{c.asset_count}</td>
                <td>{fmtMoney(c.total_spend)}</td>
                <td>{fmtNum(c.avg_roas)}</td>
                <td>{fmtPct(c.avg_hook_rate)}</td>
              </tr>
            ))}
            {!groups.length && !loading && (
              <tr><td colSpan={6}>
                <div className="empty">
                  <span className="empty-icon">🧩</span>
                  <div className="empty-title">No multi-asset concepts yet</div>
                  <div className="empty-hint">Click <strong>Recompute clustering</strong> to group visually-similar creatives by perceptual hash + matching hook archetype.</div>
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {singletons.length > 0 && minAssets === 1 && (
        <div className="subtle" style={{ marginTop: 14, fontSize: 12 }}>
          {singletons.length} singleton concepts hidden (creatives that don't perceptually match any other).
        </div>
      )}
    </div>
  );
}
