'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from './lib/session';

const PUBLIC_PATHS = ['/inspiration/login', '/inspiration/auth/callback'];

export default function InspirationLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname?.startsWith(p + '/'));

  useEffect(() => {
    if (session === undefined) return;             // loading
    if (isPublic) return;                          // login + callback don't need auth
    if (session === null) {
      const next = encodeURIComponent(pathname || '/inspiration');
      router.replace(`/inspiration/login?next=${next}`);
    }
  }, [session, isPublic, pathname, router]);

  if (!isPublic && session === undefined) {
    return <main className="panel" style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>Loading…</main>;
  }
  if (!isPublic && session === null) {
    return null; // redirecting
  }

  return <>{children}</>;
}
