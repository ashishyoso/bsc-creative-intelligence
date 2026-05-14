'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, classifyHook, classifyRoas, fmtMoney, fmtNum, fmtPct } from '../../lib/api';

export default function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAsset(id).then(setData).catch((e) => setError(e.message ?? String(e)));
  }, [id]);

  if (error) return <div className="panel" style={{ color: 'var(--danger)' }}>Error: {error}</div>;
  if (!data) {
    return (
      <div>
        <div className="toolbar"><span className="dot-spinner" /> <span className="subtle">Loading asset…</span></div>
        <div className="detail-grid">
          <div className="skeleton" style={{ aspectRatio: '9 / 16', borderRadius: 8, maxHeight: '70vh' }} />
          <div>
            <div className="panel"><div className="skeleton" style={{ height: 16, width: 140, marginBottom: 12 }} />
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, marginBottom: 8 }}>
                  <div className="skeleton" style={{ height: 11 }} /><div className="skeleton" style={{ height: 11 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isImage = data.asset_type === 'image';
  const t = data.autotag ?? {};
  const p = data.performance_aggregate ?? {};

  return (
    <div>
      <div className="toolbar">
        <Link href="/" className="btn secondary">← Library</Link>
        <h1 className="page-title">{data.ad_references[0]?.ad_name ?? data.asset_id}</h1>
        <a className="btn secondary" href={`/api/assets/${data.asset_id}/download`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
          ↓ Download
        </a>
        <span className="count">{data.asset_id}</span>
      </div>

      <div className="detail-grid">
        <div>
          <div style={{
            width: '100%',
            maxHeight: '70vh',
            display: 'flex',
            justifyContent: 'center',
            background: '#000',
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            {isImage ? (
              <img
                src={`/media/${data.asset_id}`}
                alt=""
                style={{ maxWidth: '100%', maxHeight: '70vh', width: 'auto', height: 'auto', objectFit: 'contain' }}
              />
            ) : (
              <video
                src={`/media/${data.asset_id}`}
                controls
                preload="metadata"
                style={{ maxWidth: '100%', maxHeight: '70vh', width: 'auto', height: 'auto' }}
              />
            )}
          </div>
          <div className="panel" style={{ marginTop: 12 }}>
            <h2>File &amp; mapping</h2>
            <div className="kv">
              <div className="k">Mapping status</div><div>{data.mapping_status}</div>
              {data.mapping_resolution_note && (<><div className="k">Note</div><div>{data.mapping_resolution_note}</div></>)}
              <div className="k">Asset type</div><div>{data.asset_type}</div>
              <div className="k">Duration (actual)</div><div>{data.actual_duration_seconds ? `${data.actual_duration_seconds.toFixed(2)}s` : '—'}</div>
              <div className="k">Resolution</div><div>{data.actual_width && data.actual_height ? `${data.actual_width}×${data.actual_height}` : '—'}</div>
              <div className="k">File size</div><div>{data.size_bytes ? `${(data.size_bytes / 1e6).toFixed(2)} MB` : '—'}</div>
              <div className="k">CDN URL</div><div style={{ wordBreak: 'break-all', fontSize: 11 }}>{data.mapping_key}</div>
            </div>
          </div>
        </div>

        <div>
          <div className="panel">
            <h2>Performance (aggregated)</h2>
            <div className="kv">
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
              <div className="kv">
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
            <div className="panel subtle">No auto-tags yet (asset may still be in mapping queue, or tagging not run).</div>
          )}

          <div className="panel">
            <h2>Ad references ({data.ad_references.length})</h2>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {data.ad_references.slice(0, 12).map((r: any) => (
                <div key={r.ad_id} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <strong>{r.ad_id}</strong> — {r.ad_name ?? '(unnamed)'}
                </div>
              ))}
              {data.ad_references.length > 12 && <div style={{ marginTop: 6 }}>… and {data.ad_references.length - 12} more</div>}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
