'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, classifyHook, classifyRoas, fmtMoney, fmtNum, fmtPct, mediaUrlFor } from '../lib/api';

export default function AssetDrawer({
  assetId,
  open,
  onClose,
}: {
  assetId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!assetId || !open) return;
    // Only show the skeleton on the first load; on subsequent asset switches
    // keep the previous content visible until the new one resolves, to avoid
    // a flash of empty drawer.
    setLoading(!data);
    api.getAsset(assetId).then(setData).catch(() => {}).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, open]);

  // Scroll drawer body to top when navigating to a different asset
  useEffect(() => {
    const body = document.querySelector<HTMLDivElement>('.drawer .drawer-body');
    if (body) body.scrollTop = 0;
  }, [assetId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while the drawer is open so the underlying grid stays put.
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    } else {
      // When the drawer closes, pause any video playing inside it — otherwise
      // audio keeps blaring while the panel animates off-screen.
      document.querySelectorAll<HTMLVideoElement>('.drawer .drawer-body video')
        .forEach((v) => { try { v.pause(); } catch {} });
    }
  }, [open]);

  return (
    <div className={`drawer ${open ? 'drawer-open' : ''}`} aria-hidden={!open}>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer-panel">
        <header className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <button className="drawer-close" onClick={onClose} aria-label="Close" title="Close (esc)">✕</button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {data?.ad_references?.[0]?.ad_name ?? assetId ?? ''}
              </div>
              <div className="subtle" style={{ fontSize: 11 }}>{assetId}</div>
            </div>
          </div>
          {data && (
            <>
              <a
                className="btn secondary"
                href={`/api/assets/${assetId}/download`}
                target="_blank" rel="noreferrer"
                style={{ textDecoration: 'none' }}
              >↓ Download</a>
              <Link className="btn secondary" href={`/asset/${assetId}`} style={{ textDecoration: 'none' }}>
                Open page →
              </Link>
            </>
          )}
        </header>

        <div className="drawer-body">
          {loading && <div className="subtle" style={{ padding: 20 }}>Loading…</div>}
          {data && <DrawerContent data={data} />}
        </div>
      </aside>
    </div>
  );
}

function DrawerContent({ data }: { data: any }) {
  const isImage = data.asset_type === 'image';
  const t = data.autotag ?? {};
  const p = data.performance_aggregate ?? {};
  const ratio = data.actual_width && data.actual_height ? data.actual_width / data.actual_height : 9 / 16;
  const aspect = ratio < 0.7 ? '9 / 16' : ratio < 0.95 ? '4 / 5' : ratio < 1.15 ? '1 / 1' : '16 / 9';

  return (
    <div style={{ padding: 16 }}>
      <div style={{
        width: '100%', maxHeight: '50vh',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        background: '#000', borderRadius: 8, overflow: 'hidden',
        aspectRatio: aspect,
      }}>
        {(() => {
          const src = mediaUrlFor({ asset_id: data.asset_id, mapping_key: data.mapping_key });
          return isImage ? (
            <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '50vh', objectFit: 'contain' }} />
          ) : (
            <video src={src} controls preload="metadata" style={{ maxWidth: '100%', maxHeight: '50vh' }} />
          );
        })()}
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <h2>Performance (aggregated)</h2>
        <div className="kv" style={{ gridTemplateColumns: '140px 1fr' }}>
          <div className="k">Spend</div><div>{fmtMoney(p.spend)}</div>
          <div className="k">ROAS</div><div className={classifyRoas(p.roas, t.sku)}>{fmtNum(p.roas)}</div>
          <div className="k">Hook rate</div><div className={classifyHook(p.hook_rate)}>{fmtPct(p.hook_rate)}</div>
          <div className="k">Hold rate</div><div>{fmtPct(p.hold_rate)}</div>
          <div className="k">CTR</div><div>{fmtPct(p.ctr, 2)}</div>
          <div className="k">Impressions</div><div>{p.impressions?.toLocaleString() ?? '—'}</div>
          <div className="k">Clicks</div><div>{p.clicks?.toLocaleString() ?? '—'}</div>
        </div>
      </div>

      {data.autotag ? (
        <div className="panel">
          <h2>Auto tags</h2>
          <div className="kv" style={{ gridTemplateColumns: '160px 1fr' }}>
            <div className="k">SKU (visual)</div><div>{t.sku} <span className="subtle">{t.sku_confidence ? `(${(t.sku_confidence * 100).toFixed(0)}%)` : ''}</span></div>
            <div className="k">Campaign</div><div>{t.campaign ?? '—'}</div>
            <div className="k">Format</div><div>{t.format ?? '—'}</div>
            <div className="k">Hook archetype</div><div>{t.hook_archetype ?? '—'}</div>
            <div className="k">Hook mechanic</div><div>{t.hook_mechanic ?? '—'}</div>
            <div className="k">Opening subject</div><div>{t.opening_subject ?? '—'}</div>
            <div className="k">On-screen text</div><div>{t.on_screen_text ?? '—'}</div>
            <div className="k">Audio type</div><div>{t.audio_type ?? '—'}</div>
            <div className="k">Audio language</div><div>{t.audio_language ?? '—'}</div>
            <div className="k">Persona implied</div><div>{t.persona_implied ?? '—'}</div>
            <div className="k">Pain addressed</div><div>{t.pain_addressed ?? '—'}</div>
            <div className="k">Awareness stage</div><div>{t.awareness_stage ?? '—'}</div>
            <div className="k">Angle</div><div>{t.angle ?? '—'}</div>
            <div className="k">Brand visible &lt;3s</div><div>{t.brand_visible_first_3s === null ? '—' : t.brand_visible_first_3s ? 'Yes' : 'No'}</div>
            <div className="k">Product reveal</div><div>{t.product_reveal_second !== null && t.product_reveal_second !== undefined ? `${t.product_reveal_second.toFixed(1)}s${t.product_reveal_pct != null ? ` (${(t.product_reveal_pct * 100).toFixed(0)}%)` : ''}` : '—'}</div>
            <div className="k">Follows 60% rule</div><div>{t.follows_60pct_rule === null ? '—' : t.follows_60pct_rule ? 'Yes' : 'No'}</div>
            <div className="k">Talent</div><div>{t.talent_type ?? '—'}</div>
            <div className="k">Setting</div><div>{t.setting ?? '—'}</div>
            <div className="k">Color palette</div><div>{t.color_palette ?? '—'}</div>
            <div className="k">Model</div><div>{t.model_version} <span className="subtle">· ₹{t.tagging_cost_inr?.toFixed(2)}</span></div>
          </div>
          {t.audio_transcript && (
            <div style={{ marginTop: 12 }}>
              <div className="stat-label">Transcript</div>
              <div className="subtle" style={{ fontSize: 12, marginTop: 4 }}>{t.audio_transcript}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="panel subtle">No auto-tags yet.</div>
      )}

      <div className="panel">
        <h2>File &amp; mapping</h2>
        <div className="kv" style={{ gridTemplateColumns: '140px 1fr' }}>
          <div className="k">Mapping status</div><div>{data.mapping_status}</div>
          <div className="k">Asset type</div><div>{data.asset_type}</div>
          <div className="k">Duration</div><div>{data.actual_duration_seconds ? `${data.actual_duration_seconds.toFixed(2)}s` : '—'}</div>
          <div className="k">Resolution</div><div>{data.actual_width && data.actual_height ? `${data.actual_width}×${data.actual_height}` : '—'}</div>
          <div className="k">File size</div><div>{data.size_bytes ? `${(data.size_bytes / 1e6).toFixed(2)} MB` : '—'}</div>
          <div className="k">CDN URL</div><div style={{ wordBreak: 'break-all', fontSize: 11 }}>{data.mapping_key}</div>
        </div>
      </div>

      <div className="panel">
        <h2>Ad references ({data.ad_references.length})</h2>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {data.ad_references.slice(0, 10).map((r: any) => (
            <div key={r.ad_id} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <strong>{r.ad_id}</strong> — {r.ad_name ?? '(unnamed)'}
            </div>
          ))}
          {data.ad_references.length > 10 && <div style={{ marginTop: 6 }}>… and {data.ad_references.length - 10} more</div>}
        </div>
      </div>

    </div>
  );
}
