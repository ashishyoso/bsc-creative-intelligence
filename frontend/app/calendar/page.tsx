'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';

const CATEGORY_COLOR: Record<string, string> = {
  Festival: 'var(--accent)',
  Sports: '#60a5fa',
  College: '#fbbf24',
  QuickCommerce: '#34d399',
  BSC: 'var(--accent-soft)',
  Cultural: '#c4b5fd',
};

export default function CalendarPage() {
  const router = useRouter();
  const [moments, setMoments] = useState<any[]>([]);
  const [weeks, setWeeks] = useState(6);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setMoments(await api.upcomingMoments(weeks)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [weeks]);

  function briefIt(m: any) {
    const params = new URLSearchParams();
    if (m.suggested_sku?.[0]) params.set('sku', m.suggested_sku[0]);
    if (m.persona) params.set('persona', m.persona);
    router.push(`/formula?${params.toString()}`);
  }

  return (
    <div>
      <div className="toolbar">
        <h1 className="page-title">Cultural Moment Calendar</h1>
        <label className="subtle">Window</label>
        <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
          <option value={3}>Next 3 weeks</option>
          <option value={6}>Next 6 weeks</option>
          <option value={12}>Next 3 months</option>
          <option value={26}>Next 6 months</option>
        </select>
        <span className="count">{loading ? 'Loading…' : `${moments.length} moments`}</span>
      </div>
      <div className="subtle" style={{ marginBottom: 14, fontSize: 13 }}>
        Indian male audience 18-34 — festivals, IPL, college calendar, BSC dates. Click "Brief this" on any moment to open the Magic Formula with the SKU + persona pre-filled.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
        {moments.map((m) => (
          <div key={`${m.id}-${m.date}`} className="panel" style={{
            margin: 0,
            borderColor: m.production_critical ? 'var(--danger)' : 'var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16, textTransform: 'none', letterSpacing: 'normal', color: 'var(--text)' }}>{m.name}</h2>
              <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: CATEGORY_COLOR[m.category] ?? 'var(--bg-card)', color: '#0e0a14', fontWeight: 700 }}>
                {m.category}
              </span>
            </div>

            <div className="subtle" style={{ fontSize: 12, marginBottom: 8 }}>
              {m.date} · {m.days_until === 0 ? 'today' : `${m.days_until} days away`} · Lead time {m.lead_time_days}d
            </div>

            {m.production_critical && (
              <div style={{ background: 'rgba(248, 113, 113, 0.15)', borderLeft: '3px solid var(--danger)', padding: '6px 10px', fontSize: 12, marginBottom: 8 }}>
                ⚠ Production window closing — brief needed today
              </div>
            )}

            <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 8 }}>
              <strong style={{ color: 'var(--accent)' }}>Angle:</strong> {m.angle}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 8, fontStyle: 'italic', color: 'var(--text-dim)' }}>
              "{m.example_hook}"
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {m.persona && <span className="chip">Persona: {m.persona}</span>}
              {m.suggested_sku?.map((s: string) => <span key={s} className="chip">{s}</span>)}
              <span className="chip">Relevance: {m.relevance}</span>
            </div>

            <button className="btn" onClick={() => briefIt(m)}>Brief this moment →</button>
          </div>
        ))}
        {!moments.length && !loading && (
          <div className="panel" style={{ gridColumn: '1 / -1' }}>
            <div className="empty">
              <span className="empty-icon">📅</span>
              <div className="empty-title">No moments in this window</div>
              <div className="empty-hint">Try expanding the window to next 3 or 6 months.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
