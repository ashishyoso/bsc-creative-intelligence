import Link from 'next/link';
import InspirationNav from './components/InspirationNav';

export default function InspirationHub() {
  return (
    <main style={{ maxWidth: 960 }}>
      <InspirationNav />

      <section className="panel">
        <h1>Inspiration</h1>
        <p className="subtle">
          Sourced and saved competitor + own video ads, classified by product
          and route, feeding the brief pipeline as reference-grounded creative.
        </p>

        <h2 style={{ marginTop: 24 }}>Daily workflow</h2>
        <ul>
          <li>
            <Link href="/inspiration/queue">Queue</Link> — swipe through pending videos,
            save / reject / escalate (Epic 3)
          </li>
          <li>
            <Link href="/inspiration/library">Library</Link> — browse saved references
            by route board (Epic 5)
          </li>
          <li>
            <Link href="/inspiration/review">Review</Link> — Senior Reviewer escalation
            queue (Epic 8)
          </li>
          <li>
            <Link href="/inspiration/reports">Reports</Link> — decisions log, source
            volume, route coverage (Epic 7)
          </li>
          <li>
            <Link href="/inspiration/admin">Admin</Link> — products, routes,
            watchlist, source health (Epic 1, Epic 2)
          </li>
        </ul>

        <h2 style={{ marginTop: 24 }}>Status</h2>
        <p className="subtle">
          v0.1 scaffold — schema, API surface, and UI shells in place. Live data
          arrives once Supabase + R2 + Meta dev access are provisioned. Spec:
          BSC_Creative_Intelligence_Tool_User_Stories.pdf v1.0 (16 May 2026).
        </p>
      </section>
    </main>
  );
}
