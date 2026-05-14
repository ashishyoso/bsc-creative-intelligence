'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, fmtMoney, fmtNum, fmtPct } from '../lib/api';
import { PanelSkeleton } from '../components/Skeletons';

export default function QualityPage() {
  const router = useRouter();
  const [sku, setSku] = useState('');
  const [skus, setSkus] = useState<string[]>([]);
  const [sixtyPct, setSixtyPct] = useState<any>(null);
  const [brandFirst, setBrandFirst] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.listSkus().then(setSkus).catch(() => {}); }, []);

  async function load() {
    setLoading(true);
    const [s, b] = await Promise.all([
      api.quality60pct(sku || undefined).catch(() => null),
      api.qualityBrandFirst3s(sku || undefined).catch(() => null),
    ]);
    setSixtyPct(s); setBrandFirst(b); setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [sku]);

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title">Quality dashboards</h1>
        <label className="subtle">SKU</label>
        <select value={sku} onChange={(e) => setSku(e.target.value)}>
          <option value="">All</option>
          {skus.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="count">{loading ? 'Loading…' : ''}</span>
      </div>

      {loading && !sixtyPct && (
        <>
          <PanelSkeleton lines={4} />
          <PanelSkeleton lines={4} />
        </>
      )}

      {/* 60% rule compliance (US-7.3) */}
      {sixtyPct && (
      <div className="panel">
        <h2>60% rule compliance (videos only)</h2>
        <div className="subtle" style={{ fontSize: 12, marginBottom: 8 }}>
          Strategic non-negotiable: product/brand should appear AFTER 60% of the video's duration.
        </div>
        {sixtyPct && (
          <>
            <div className="kv" style={{ gridTemplateColumns: '200px 1fr' }}>
              <div className="k">Total video creatives</div><div>{sixtyPct.total}</div>
              <div className="k">Compliant</div><div style={{ color: 'var(--good)' }}>{sixtyPct.compliant} ({sixtyPct.compliance_pct}%)</div>
              <div className="k">Violations</div><div style={{ color: 'var(--danger)' }}>{sixtyPct.total - sixtyPct.compliant}</div>
            </div>
            <div className="progress" style={{ marginTop: 14 }}>
              <div className="progress-fill" style={{ width: `${sixtyPct.compliance_pct}%` }} />
              <div className="progress-label">{sixtyPct.compliance_pct}% compliant</div>
            </div>
            {sixtyPct.violations?.length > 0 && (
              <>
                <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', marginTop: 18, marginBottom: 8 }}>Top violators by spend</h3>
                <table className="table">
                  <thead><tr><th>Ad name</th><th>SKU</th><th>Reveal at</th><th>Duration</th><th>Spend</th><th>ROAS</th></tr></thead>
                  <tbody>
                    {sixtyPct.violations.slice(0, 15).map((v: any) => (
                      <tr key={v.asset_id} onClick={() => router.push(`/asset/${v.asset_id}`)} style={{ cursor: 'pointer' }}>
                        <td>{v.ad_name ?? v.asset_id}</td>
                        <td>{v.sku ?? '—'}</td>
                        <td>{v.product_reveal_second ? `${v.product_reveal_second.toFixed(1)}s (${(v.product_reveal_pct * 100).toFixed(0)}%)` : '—'}</td>
                        <td>{v.duration ? `${v.duration.toFixed(1)}s` : '—'}</td>
                        <td>{fmtMoney(v.spend)}</td>
                        <td>{fmtNum(v.roas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </div>
      )}

      {/* Brand visible <3s audit (US-7.4) */}
      {brandFirst && (
      <div className="panel">
        <h2>Brand visible in first 3 seconds</h2>
        <div className="subtle" style={{ fontSize: 12, marginBottom: 8 }}>
          Counter-signal — creatives that lead with brand often see hold-rate collapse. The data tells us when this is true.
        </div>
        {brandFirst && (
          <>
            <div className="kv" style={{ gridTemplateColumns: '220px 1fr' }}>
              <div className="k">Total creatives</div><div>{brandFirst.total}</div>
              <div className="k">Brand-in-first-3s</div><div>{brandFirst.brand_first_3s_count} ({brandFirst.brand_first_3s_pct}%)</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginTop: 16 }}>
              <div className="panel" style={{ marginBottom: 0, borderColor: 'var(--warn)' }}>
                <h3 style={{ fontSize: 12, color: 'var(--warn)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Brand visible &lt;3s (aggregate)</h3>
                <div className="kv" style={{ gridTemplateColumns: '140px 1fr', marginTop: 8 }}>
                  <div className="k">Spend</div><div>{fmtMoney(brandFirst.yes_aggregate?.spend)}</div>
                  <div className="k">Weighted ROAS</div><div>{fmtNum(brandFirst.yes_aggregate?.weighted_roas)}</div>
                  <div className="k">Weighted Hook</div><div>{fmtPct(brandFirst.yes_aggregate?.weighted_hook_rate)}</div>
                </div>
              </div>
              <div className="panel" style={{ marginBottom: 0, borderColor: 'var(--good)' }}>
                <h3 style={{ fontSize: 12, color: 'var(--good)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Brand reveal later (aggregate)</h3>
                <div className="kv" style={{ gridTemplateColumns: '140px 1fr', marginTop: 8 }}>
                  <div className="k">Spend</div><div>{fmtMoney(brandFirst.no_aggregate?.spend)}</div>
                  <div className="k">Weighted ROAS</div><div>{fmtNum(brandFirst.no_aggregate?.weighted_roas)}</div>
                  <div className="k">Weighted Hook</div><div>{fmtPct(brandFirst.no_aggregate?.weighted_hook_rate)}</div>
                </div>
              </div>
            </div>
            {brandFirst.top_offenders?.length > 0 && (
              <>
                <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', marginTop: 18, marginBottom: 8 }}>Top brand-first-3s by spend</h3>
                <table className="table">
                  <thead><tr><th>Ad name</th><th>SKU</th><th>Spend</th><th>ROAS</th><th>Hook</th></tr></thead>
                  <tbody>
                    {brandFirst.top_offenders.slice(0, 12).map((o: any) => (
                      <tr key={o.asset_id} onClick={() => router.push(`/asset/${o.asset_id}`)} style={{ cursor: 'pointer' }}>
                        <td>{o.ad_name ?? o.asset_id}</td>
                        <td>{o.sku ?? '—'}</td>
                        <td>{fmtMoney(o.spend)}</td>
                        <td>{fmtNum(o.roas)}</td>
                        <td>{fmtPct(o.hook_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}
