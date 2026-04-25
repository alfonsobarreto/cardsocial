'use client';

import { studioTheme } from '@/lib/studioTheme';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
          maxWidth: 460,
          border: `1px solid ${studioTheme.border}`,
          borderRadius: 18,
          background: studioTheme.surface,
          padding: 28,
        }}
      >
        <p style={{ margin: 0, color: studioTheme.error, fontWeight: 900 }}>Card-Social</p>
        <h1 style={{ margin: '10px 0 8px', fontSize: 22 }}>Something went wrong</h1>
        <p style={{ margin: '0 0 18px', color: studioTheme.textMuted, lineHeight: 1.5 }}>
          {error?.message || 'The page could not be rendered.'}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            width: '100%',
            border: 'none',
            borderRadius: 12,
            padding: '12px 14px',
            background: studioTheme.gold,
            color: studioTheme.bg,
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </main>
  );
}
