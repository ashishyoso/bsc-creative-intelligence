'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTIONS: Array<{ href: string; label: string }> = [
  { href: '/inspiration/queue', label: 'Queue' },
  { href: '/inspiration/library', label: 'Library' },
  { href: '/inspiration/review', label: 'Review' },
  { href: '/inspiration/reports', label: 'Reports' },
  { href: '/inspiration/admin', label: 'Admin' },
];

export default function InspirationNav() {
  const pathname = usePathname();
  return (
    <nav className="panel" style={{ display: 'flex', gap: 12, padding: '8px 12px', marginBottom: 16 }}>
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
    </nav>
  );
}
