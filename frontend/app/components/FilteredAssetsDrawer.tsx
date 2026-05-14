'use client';
import { useEffect, useState } from 'react';
import { AssetSummary, api } from '../lib/api';
import AssetCard from './AssetCard';
import AssetDrawer from './AssetDrawer';

type Filters = Record<string, string | number | boolean | null | undefined>;

export default function FilteredAssetsDrawer({
  open,
  onClose,
  filters,
  title,
  subtitle,
}: {
  open: boolean;
  onClose: () => void;
  filters: Filters | null;
  title: string;
  subtitle?: string;
}) {
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('spend');

  useEffect(() => {
    if (!open || !filters) return;
    setLoading(true);
    api
      .listAssets({ ...filters, sort_by: sortBy, limit: 500 })
      .then(setAssets)
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [open, JSON.stringify(filters), sortBy]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open && !openAssetId) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, openAssetId, onClose]);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  const chips = filters
    ? Object.entries(filters).filter(([_, v]) => v !== null && v !== undefined && v !== '')
    : [];

  return (
    <>
      <div className={`drawer drawer-wide ${open ? 'drawer-open' : ''}`} aria-hidden={!open}>
        <div className="drawer-overlay" onClick={onClose} />
        <aside className="drawer-panel">
          <header className="drawer-header">
            <button className="drawer-close" onClick={onClose} aria-label="Close" title="Close (esc)">✕</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {title}
              </div>
              {subtitle && <div className="subtle" style={{ fontSize: 11 }}>{subtitle}</div>}
            </div>
            <label className="subtle" style={{ fontSize: 12 }}>Sort</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ padding: '4px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, fontSize: 12 }}
            >
              <option value="spend">Spend</option>
              <option value="roas">ROAS</option>
              <option value="hook_rate">Hook</option>
              <option value="hold_rate">Hold</option>
              <option value="ctr">CTR</option>
            </select>
            <span className="count">{loading ? 'Loading…' : `${assets.length} creatives`}</span>
          </header>

          <div className="drawer-body" style={{ padding: 16 }}>
            {chips.length > 0 && (
              <div className="chips" style={{ marginBottom: 14 }}>
                {chips.map(([k, v]) => (
                  <span key={k} className="chip">
                    {k.replace(/_/g, ' ')}: <strong style={{ color: 'var(--accent)' }}>{String(v)}</strong>
                  </span>
                ))}
              </div>
            )}
            {!loading && assets.length === 0 && (
              <div className="subtle" style={{ padding: 20, textAlign: 'center' }}>
                No creatives match these filters.
              </div>
            )}
            <div className="grid grid-compact">
              {assets.map((a) => (
                <AssetCard
                  key={a.asset_id}
                  a={a}
                  onClick={() => setOpenAssetId(a.asset_id)}
                />
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Nested single-asset drawer, layered on top */}
      <AssetDrawer
        assetId={openAssetId}
        open={!!openAssetId}
        onClose={() => setOpenAssetId(null)}
      />
    </>
  );
}
