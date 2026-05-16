'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useUser } from '../lib/session';

const SECTIONS: Array<{ href: string; label: string }> = [
  { href: '/inspiration/queue', label: 'Queue' },
  { href: '/inspiration/library', label: 'Library' },
  { href: '/inspiration/review', label: 'Review' },
  { href: '/inspiration/reports', label: 'Reports' },
  { href: '/inspiration/admin', label: 'Admin' },
];

export default function InspirationNav() {
  const pathname = usePathname();
  const user = useUser();
  return (
    <nav
      className="panel"
      style={{ display: 'flex', gap: 12, padding: '8px 12px', marginBottom: 16, alignItems: 'center' }}
    >
      {SECTIONS.map((s) => {
        const active = pathname === s.href || pathname?.startsWith(s.href + '/');
        return (
          <Link
            key={s.href}
            href={s.href}
            className={active ? 'nav-active' : ''}
            style={{ textDecoration: 'none' }}
          >
            {s.label}
          </Link>
        );
      })}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }} className="subtle">
        {user && <span>{user.email}</span>}
        {user && (
          <button onClick={() => signOut().then(() => (window.location.href = '/inspiration/login'))}>
            Sign out
          </button>
        )}
      </div>
    </nav>
  );
}
