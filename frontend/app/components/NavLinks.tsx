'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PRIMARY_GROUPS: Array<{ items: Array<{ href: string; label: string }> }> = [
  // Inspiration tab hidden until Meta Ad Library access is granted.
  // Pages at /inspiration/* remain routable for internal use.
  {
    items: [
      { href: '/leaderboards', label: 'Leaderboards' },
      { href: '/combinatorial', label: 'Combinations' },
      { href: '/anti-patterns', label: 'Anti-patterns' },
      { href: '/persona-coverage', label: 'Persona' },
    ],
  },
  {
    items: [
      { href: '/formula', label: 'Magic Formula' },
      { href: '/briefs', label: 'Briefs' },
      { href: '/hooks', label: 'Hooks' },
    ],
  },
  {
    items: [
      { href: '/quality', label: 'Quality' },
      { href: '/calendar', label: 'Calendar' },
    ],
  },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  // /briefs is active for /briefs/123 too
  return pathname === href || pathname.startsWith(href + '/');
}

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {PRIMARY_GROUPS.map((group, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <div className="nav-divider" />}
          <div className="nav-group">
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(pathname, item.href) ? 'nav-active' : ''}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </span>
      ))}
    </>
  );
}
