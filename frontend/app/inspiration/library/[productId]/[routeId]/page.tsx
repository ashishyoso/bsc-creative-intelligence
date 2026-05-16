'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import InspirationNav from '../../../components/InspirationNav';
import { insp, Reference, Replicability } from '../../../lib/api';

// US-5.1 — Route board view.
export default function RouteBoardPage() {
  const params = useParams<{ productId: string; routeId: string }>();
  const [refs, setRefs] = useState<Reference[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<'recent' | 'oldest' | 'brand' | 'replicability'>('recent');
  const [replicability, setReplicability] = useState<Replicability[]>([]);

  useEffect(() => {
    setLoading(true);
    insp.listReferences({
      product_id: params.productId,
      route_id: params.routeId,
      sort,
      replicability: replicability.length ? replicability : undefined,
      limit: 200,
    }).then(setRefs).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [params.productId, params.routeId, sort, replicability]);

  const recent7d = refs.filter(r => new Date(r.saved_at) > new Date(Date.now() - 7 * 24 * 3600 * 1000)).length;

  return (
    <main style={{ maxWidth: 1200 }}>
      <InspirationNav />
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>{refs[0]?.route_name ?? 'Route board'}</h1>
          <Link href="/inspiration/library">← All routes</Link>
        </div>
        <p className="subtle">{refs.length} saved · {recent7d} added this week</p>

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <label>Sort:&nbsp;
            <select value={sort} onChange={e => setSort(e.target.value as any)}>
              <option value="recent">most recent</option>
              <option value="oldest">oldest</option>
              <option value="brand">by brand</option>
              <option value="replicability">by replicability</option>
            </select>
          </label>
          <label>Replicability:&nbsp;
            <select
              multiple
              value={replicability}
              onChange={e => setReplicability(Array.from(e.target.selectedOptions).map(o => o.value as Replicability))}
              size={3}
            >
              <option value="yes">Yes</option>
              <option value="stretch">Stretch</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>

        {error && <div className="panel" style={{ background: '#fee' }}>{error}</div>}
        {loading ? <p>Loading…</p> : refs.length === 0 ? (
          <p className="subtle" style={{ marginTop: 16 }}>
            No references yet — route under-served (sourcing gap).
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginTop: 16 }}>
            {refs.map(r => <ReferenceCard key={r.decision_id} reference={r} />)}
          </div>
        )}
      </section>
    </main>
  );
}

function ReferenceCard({ reference: r }: { reference: Reference }) {
  const v = r.video;
  return (
    <Link href={`/inspiration/reference/${r.decision_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="panel" style={{ padding: 12 }}>
        {v.video_thumbnail ? (
          <img src={v.video_thumbnail} alt="" style={{ width: '100%', borderRadius: 4 }} />
        ) : (
          <div style={{ background: '#000', height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>video</div>
        )}
        <div style={{ marginTop: 8, fontWeight: 600 }}>{v.brand}</div>
        <div className="subtle" style={{ fontSize: 13, marginTop: 4 }}>{r.why_text.slice(0, 120)}{r.why_text.length > 120 ? '…' : ''}</div>
        <div style={{ marginTop: 6, fontSize: 12 }}>
          <span style={{ padding: '2px 6px', background: '#eef', borderRadius: 4 }}>{r.replicability}</span>
          <span className="subtle" style={{ marginLeft: 6 }}>by {r.saved_by_name ?? r.saved_by}</span>
        </div>
      </div>
    </Link>
  );
}
