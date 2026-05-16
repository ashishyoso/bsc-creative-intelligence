// No auth guard for now — /inspiration is open. Re-enable by restoring the
// useSession + redirect logic when Google OAuth is configured.
export default function InspirationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
