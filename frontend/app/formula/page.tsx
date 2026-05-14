'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, fmtMoney, fmtNum, fmtPct } from '../lib/api';
import { useToast } from '../components/Toast';

const SKU_OPTIONS = ['FBT', 'FBT SE', '3@999', '18hr Sale', 'Legend 365', 'Bombae', 'Fragrance', 'Razors', 'Blo Trimmer'];
const METRIC_OPTIONS = [
  { v: 'roas', l: 'ROAS (full-funnel)' },
  { v: 'hook_rate', l: 'Hook Rate' },
  { v: 'hold_rate', l: 'Hold Rate' },
  { v: 'ctr', l: 'CTR' },
];
const PERSONA_OPTIONS = ['', 'Corporate Professional', 'Gym-Goer', 'College Student', 'Tier-2 Aspirational', 'Dad/Husband', 'Newly-Single/Glow-up', 'Dating-Active', 'Body-Conscious', 'Hygiene-Aware'];
const LANG_OPTIONS = ['', 'English', 'Hindi', 'Hinglish'];
const FORMAT_OPTIONS = ['', 'Talking Head', 'Skit/Sketch', 'Unboxing', 'Product Demo', 'Static Image', 'Explainer/VO over B-roll', 'Lifestyle B-roll', 'Trend Adaptation'];

type FormulaResult = Awaited<ReturnType<typeof api.generateFormula>>;

function formatMetric(metric: string, v: number | null) {
  if (v === null) return '—';
  if (metric === 'roas') return fmtNum(v);
  return fmtPct(v);
}

export default function FormulaPage() {
  const router = useRouter();
  const toast = useToast();
  const [sku, setSku] = useState('FBT SE');
  const [metric, setMetric] = useState('roas');
  const [persona, setPersona] = useState('');
  const [language, setLanguage] = useState('');
  const [formatConstraint, setFormatConstraint] = useState('');
  const [minN, setMinN] = useState(3);
  const [result, setResult] = useState<FormulaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savingBrief, setSavingBrief] = useState(false);

  async function generate() {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await api.generateFormula({
        target_sku: sku,
        metric,
        persona: persona || null,
        audio_language: language || null,
        format_constraint: formatConstraint || null,
        min_n: minN,
      });
      setResult(r);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveAsBrief() {
    setSavingBrief(true); setError(null);
    toast.push('Drafting brief — Claude is generating hooks…', 'info', { durationMs: 8000 });
    try {
      const b = await api.briefFromFormula({
        target_sku: sku,
        metric,
        persona: persona || null,
        audio_language: language || null,
        format_constraint: formatConstraint || null,
        min_n: minN,
      });
      toast.push('Brief created', 'success');
      router.push(`/briefs/${b.id}`);
    } catch (e: any) {
      setError(e.message ?? String(e));
      toast.push('Brief generation failed', 'error');
      setSavingBrief(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Magic Formula</h1>
      <div className="subtle" style={{ marginBottom: 14, fontSize: 13 }}>
        Pick a target SKU and outcome metric. The tool finds the tag combination
        with the strongest historical performance and surfaces 3 reference creatives.
      </div>

      <div className="panel">
        <h2>1 · Brief intent</h2>
        <div className="kv" style={{ gridTemplateColumns: '180px 1fr' }}>
          <div className="k">Target SKU <span style={{ color: 'var(--danger)' }}>*</span></div>
          <select value={sku} onChange={(e) => setSku(e.target.value)} style={{ width: 280, padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }}>
            {SKU_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <div className="k">Outcome metric</div>
          <select value={metric} onChange={(e) => setMetric(e.target.value)} style={{ width: 280, padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }}>
            {METRIC_OPTIONS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>

          <div className="k">Persona (optional)</div>
          <select value={persona} onChange={(e) => setPersona(e.target.value)} style={{ width: 280, padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }}>
            {PERSONA_OPTIONS.map((p) => <option key={p} value={p}>{p || '— any —'}</option>)}
          </select>

          <div className="k">Language (optional)</div>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ width: 280, padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }}>
            {LANG_OPTIONS.map((l) => <option key={l} value={l}>{l || '— any —'}</option>)}
          </select>

          <div className="k">Format constraint (optional)</div>
          <select value={formatConstraint} onChange={(e) => setFormatConstraint(e.target.value)} style={{ width: 280, padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }}>
            {FORMAT_OPTIONS.map((f) => <option key={f} value={f}>{f || '— any —'}</option>)}
          </select>

          <div className="k">Min N per dimension</div>
          <input type="number" value={minN} onChange={(e) => setMinN(Number(e.target.value) || 3)} style={{ width: 80, padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn" disabled={loading || !sku} onClick={generate}>
            {loading ? 'Generating…' : 'Generate formula'}
          </button>
          {result && (
            <button className="btn secondary" disabled={savingBrief} onClick={saveAsBrief} title="Generate hooks via Claude and create a brief draft">
              {savingBrief ? 'Drafting brief…' : '→ Save as brief (with auto-generated hooks)'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="panel" style={{ color: 'var(--danger)' }}>Error: {error}</div>}

      {result && (
        <>
          <div className="panel">
            <h2>2 · Recommended formula</h2>
            <div className="kv" style={{ gridTemplateColumns: '180px 1fr' }}>
              <div className="k">Cohort size</div>
              <div>{result.cohort_size} historical creatives match these constraints</div>
              <div className="k">Overall confidence</div>
              <div><span className={`confidence ${result.overall_confidence}`}>{result.overall_confidence}</span></div>
            </div>

            <table className="table" style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>Dimension</th>
                  <th>Recommended value</th>
                  <th>Metric ({result.metric})</th>
                  <th>N</th>
                  <th>Confidence</th>
                  <th>Alternatives</th>
                </tr>
              </thead>
              <tbody>
                {result.recommendations.map((r) => (
                  <tr key={r.dimension}>
                    <td>{r.label}</td>
                    <td>{r.value ? <strong style={{ color: 'var(--accent)' }}>{r.value}</strong> : <span className="subtle">— no data —</span>}</td>
                    <td>{formatMetric(result.metric, r.metric_value)}</td>
                    <td>{r.n}</td>
                    <td><span className={`confidence ${r.confidence}`}>{r.confidence}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      {r.alternatives.map((a) => (
                        <div key={a.value}>{a.value} ({formatMetric(result.metric, a.metric_value)}, N={a.n})</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.risks.length > 0 && (
            <div className="panel" style={{ borderColor: '#92400e' }}>
              <h2 style={{ color: 'var(--warn)' }}>3 · Risk factors</h2>
              <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
                {result.risks.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          {result.anti_patterns && result.anti_patterns.length > 0 && (
            <div className="panel" style={{ borderColor: '#7f1d1d' }}>
              <h2 style={{ color: 'var(--danger)' }}>4 · Anti-patterns to avoid</h2>
              <div className="subtle" style={{ fontSize: 12, marginBottom: 8 }}>
                Combinations that consistently underperform the benchmark for this SKU. Don't pair these into the brief.
              </div>
              <table className="table" style={{ marginTop: 8 }}>
                <thead>
                  <tr><th>Combination</th><th>Avg {result.metric}</th><th>Deficit</th><th>N</th><th>Confidence</th></tr>
                </thead>
                <tbody>
                  {result.anti_patterns.map((ap, i) => (
                    <tr key={i}>
                      <td>
                        <span className="chip">{ap.dim_a}: <strong style={{ color: 'var(--danger)' }}>{ap.val_a}</strong></span>
                        {ap.dim_b && (
                          <>
                            <span style={{ margin: '0 6px' }}>+</span>
                            <span className="chip">{ap.dim_b}: <strong style={{ color: 'var(--danger)' }}>{ap.val_b}</strong></span>
                          </>
                        )}
                      </td>
                      <td>{result.metric === 'roas' ? fmtNum(ap.metric_value) : fmtPct(ap.metric_value)}</td>
                      <td style={{ color: 'var(--danger)' }}>-{(ap.deficit_pct * 100).toFixed(0)}%</td>
                      <td>{ap.n}</td>
                      <td><span className={`confidence ${ap.confidence}`}>{ap.confidence}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="panel">
            <h2>4 · Reference creatives</h2>
            <div className="subtle" style={{ marginBottom: 12, fontSize: 12 }}>
              Top 3 historical creatives that match the recommended formula. Click any to inspect.
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {result.references.map((ref) => {
                const ratio = ref.actual_width && ref.actual_height ? ref.actual_width / ref.actual_height : 9 / 16;
                const aspect = ratio < 0.7 ? '9 / 16' : ratio < 0.95 ? '4 / 5' : ratio < 1.15 ? '1 / 1' : '16 / 9';
                return (
                  <div key={ref.asset_id} className="card" onClick={() => router.push(`/asset/${ref.asset_id}`)}>
                    <div className="thumb" style={{ aspectRatio: aspect }}>
                      {ref.asset_type === 'image' ? (
                        <img src={`/media/${ref.asset_id}`} alt={ref.ad_name ?? ''} style={{ objectFit: 'contain' }} />
                      ) : (
                        <img src={`/media/${ref.asset_id}/frame/hook_0_5s`} alt={ref.ad_name ?? ''} style={{ objectFit: 'contain' }}
                          onError={(e) => ((e.currentTarget.style.display = 'none'))} />
                      )}
                    </div>
                    <div className="card-body">
                      <div className="card-title" title={ref.ad_name ?? ''}>{ref.ad_name ?? ref.asset_id}</div>
                      <div className="card-stats">
                        <div><div className="stat-label">Match</div><div className="stat-val">{(ref.match_score * 100).toFixed(0)}%</div></div>
                        <div><div className="stat-label">ROAS</div><div className="stat-val">{fmtNum(ref.roas)}</div></div>
                        <div><div className="stat-label">Hook</div><div className="stat-val">{fmtPct(ref.hook_rate)}</div></div>
                        <div><div className="stat-label">Spend</div><div className="stat-val">{fmtMoney(ref.spend)}</div></div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {result.references.length === 0 && (
                <div className="subtle" style={{ gridColumn: '1 / -1', padding: 20, textAlign: 'center' }}>
                  No historical creatives closely match this formula. Treat the recommendation as a hypothesis test.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
