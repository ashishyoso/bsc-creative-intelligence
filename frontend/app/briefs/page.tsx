'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { TableSkeleton } from '../components/Skeletons';

type Brief = Awaited<ReturnType<typeof api.listBriefs>>[number];

const STATUS_COLOR: Record<string, string> = {
  draft: 'var(--text-dim)',
  briefed: 'var(--mid)',
  shipped: 'var(--accent)',
  performed: 'var(--good)',
};

export default function BriefsListPage() {
  const router = useRouter();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    setLoading(true);
    try { setBriefs(await api.listBriefs(statusFilter || undefined)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title">Brief Workspace</h1>
        <span className="count">{loading ? 'Loading…' : `${briefs.length} briefs`}</span>
      </div>
      <div className="subtle" style={{ marginBottom: 14, fontSize: 13 }}>
        Saved briefs generated from the Magic Formula. Edit, ship, or revisit.
      </div>

      <div className="toolbar">
        <label className="subtle">Status</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All</option>
          <option value="draft">Draft</option>
          <option value="briefed">Briefed</option>
          <option value="shipped">Shipped</option>
          <option value="performed">Performed</option>
        </select>
        <button className="btn" onClick={() => router.push('/formula')}>+ New from Magic Formula</button>
      </div>

      {loading && briefs.length === 0 ? (
        <TableSkeleton rows={6} cols={8} />
      ) : (
      <div className="panel" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>#</th><th>Title</th><th>SKU</th><th>Persona</th>
              <th>Confidence</th><th>Cohort</th><th>Status</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {briefs.map((b) => (
              <tr key={b.id} onClick={() => router.push(`/briefs/${b.id}`)} style={{ cursor: 'pointer' }}>
                <td>{b.id}</td>
                <td><strong>{b.title}</strong></td>
                <td>{b.target_sku}</td>
                <td>{b.persona ?? '—'}</td>
                <td>{b.overall_confidence ? <span className={`confidence ${b.overall_confidence}`}>{b.overall_confidence}</span> : '—'}</td>
                <td>{b.cohort_size ?? '—'}</td>
                <td><span style={{ color: STATUS_COLOR[b.status] ?? 'var(--text)', fontWeight: 600 }}>{b.status}</span></td>
                <td className="subtle">{b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
            {!briefs.length && !loading && (
              <tr><td colSpan={8}>
                <div className="empty">
                  <span className="empty-icon">📝</span>
                  <div className="empty-title">No briefs yet</div>
                  <div className="empty-hint">Generate one from the <a href="/formula">Magic Formula</a> tab.</div>
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
