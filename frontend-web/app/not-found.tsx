import Link from 'next/link';
import { studioTheme } from '@/lib/studioTheme';

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: studioTheme.bg,
        color: studioTheme.text,
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          border: `1px solid ${studioTheme.border}`,
          borderRadius: 18,
          background: studioTheme.surface,
          padding: 28,
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0, color: studioTheme.gold, fontWeight: 900, letterSpacing: 1 }}>404</p>
        <h1 style={{ margin: '10px 0 8px', fontSize: 24 }}>Page not found</h1>
        <p style={{ margin: '0 0 18px', color: studioTheme.textMuted }}>This Card-Social page does not exist.</p>
        <Link href="/studio" style={{ color: studioTheme.goldLight, fontWeight: 800 }}>
          Open Card Studio
        </Link>
      </div>
    </main>
  );
}
