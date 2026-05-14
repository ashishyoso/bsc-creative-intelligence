'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, fmtMoney, fmtNum, fmtPct } from '../lib/api';
import { TableSkeleton } from '../components/Skeletons';
import { useToast } from '../components/Toast';

type Hook = Awaited<ReturnType<typeof api.listHooks>>[number];

export default function HookLibraryPage() {
  const router = useRouter();
  const toast = useToast();
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [hookType, setHookType] = useState('');
  const [sku, setSku] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('parent_roas');
  const [skus, setSkus] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      setHooks(await api.listHooks({
        hook_type: hookType || undefined,
        sku: sku || undefined,
        search: search || undefined,
        sort_by: sortBy,
        limit: 500,
      }));
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { api.listSkus().then(setSkus).catch(() => {}); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [hookType, sku, sortBy]);

  async function rebuild() {
    const ok = await toast.confirm(
      'Rebuild hook library from all tagged assets? Existing manual hooks are preserved.',
      { confirmLabel: 'Rebuild' }
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.rebuildHooks();
      toast.push(
        `${r.hooks_created} new hooks · ${r.hooks_reused} reused · library size ${r.library_size}`,
        'success'
      );
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
      toast.push('Rebuild failed', 'error');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title">Hook Library</h1>
        <span className="count">{loading ? 'Loading…' : `${hooks.length} hooks`}</span>
      </div>
      <div className="subtle" style={{ marginBottom: 14, fontSize: 13 }}>
        Verbal and on-screen hooks extracted from tagged creatives. Click a hook to see its parent creative.
      </div>

      <div className="toolbar">
        <label className="subtle">Type</label>
        <select value={hookType} onChange={(e) => setHookType(e.target.value)}>
          <option value="">All</option>
          <option value="verbal">Verbal</option>
          <option value="on_screen">On-screen</option>
        </select>

        <label className="subtle">SKU</label>
        <select value={sku} onChange={(e) => setSku(e.target.value)}>
          <option value="">All</option>
          {skus.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <label className="subtle">Sort</label>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="parent_roas">Parent ROAS</option>
          <option value="parent_hook_rate">Parent Hook Rate</option>
          <option value="parent_spend">Parent Spend</option>
          <option value="created_at">Recently added</option>
        </select>

        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} placeholder="search hook text…" style={{ flex: 1, maxWidth: 320 }} />
        <button className="btn secondary" onClick={load}>Search</button>
        <button className="btn" disabled={busy} onClick={rebuild}>{busy ? 'Rebuilding…' : 'Rebuild from assets'}</button>
      </div>

      {error && <div className="panel" style={{ color: 'var(--danger)' }}>Error: {error}</div>}

      {loading && hooks.length === 0 ? (
        <TableSkeleton rows={8} cols={8} />
      ) : (
      <div className="panel" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Type</th><th>Text</th><th>SKU</th><th>Persona</th><th>Lang</th>
              <th>Parent ROAS</th><th>Parent Hook</th><th>Parent Spend</th>
            </tr>
          </thead>
          <tbody>
            {hooks.map((h) => (
              <tr key={h.id} onClick={() => h.source_asset_id && router.push(`/asset/${h.source_asset_id}`)} style={{ cursor: h.source_asset_id ? 'pointer' : 'default' }}>
                <td><span className="chip" style={{ color: h.hook_type === 'verbal' ? 'var(--mid)' : 'var(--accent)' }}>{h.hook_type}</span></td>
                <td style={{ maxWidth: 480 }}>{h.text}</td>
                <td>{h.sku ?? '—'}</td>
                <td>{h.persona_implied ?? '—'}</td>
                <td>{h.language ?? '—'}</td>
                <td>{fmtNum(h.parent_roas)}</td>
                <td>{fmtPct(h.parent_hook_rate)}</td>
                <td>{fmtMoney(h.parent_spend)}</td>
              </tr>
            ))}
            {!hooks.length && !loading && (
              <tr><td colSpan={8}>
                <div className="empty">
                  <span className="empty-icon">💬</span>
                  <div className="empty-title">No hooks extracted yet</div>
                  <div className="empty-hint">Click <strong>Rebuild from assets</strong> to extract hooks from the tagged library — verbal hooks from transcripts, on-screen hooks from OCR.</div>
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
