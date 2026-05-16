import Link from 'next/link';
import InspirationNav from '../components/InspirationNav';

export default function AdminHub() {
  return (
    <main style={{ maxWidth: 960 }}>
      <InspirationNav />
      <section className="panel">
        <h1>Admin</h1>
        <p className="subtle">
          Taxonomy, watchlist, source health, and users. Admin role required for
          mutations.
        </p>
        <ul>
          <li><Link href="/inspiration/admin/products">Products</Link> — US-1.1</li>
          <li><Link href="/inspiration/admin/routes">Routes</Link> — US-1.2 (per product)</li>
          <li><Link href="/inspiration/admin/watchlist">Watchlist</Link> — US-1.3 (per source)</li>
          <li><Link href="/inspiration/admin/sources">Source health</Link> — US-2.6</li>
        </ul>
      </section>
    </main>
  );
}
