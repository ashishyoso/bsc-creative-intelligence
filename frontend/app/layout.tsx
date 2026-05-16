import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import NavLinks from './components/NavLinks';
import SettingsMenu from './components/SettingsMenu';
import { ToastProvider } from './components/Toast';
import AskAnything from './components/AskAnything';

export const metadata: Metadata = {
  title: 'YOSO-BSC Creative Intelligence',
  description: 'YOSO × BSC — Creative library, patterns, brief intelligence',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <header className="topbar">
            <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
              <span className="brand-mark">●</span>
              <span>YOSO-BSC Creative Intelligence</span>
            </Link>
            <nav className="primary-nav">
              <NavLinks />
              <SettingsMenu />
            </nav>
          </header>
          <main>{children}</main>
          <AskAnything />
        </ToastProvider>
      </body>
    </html>
  );
}
