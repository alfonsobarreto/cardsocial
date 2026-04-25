'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#000', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div
            style={{
              width: '100%',
              maxWidth: 460,
              border: '1px solid rgba(212,175,55,0.35)',
              borderRadius: 18,
              background: '#0D0D0D',
              padding: 28,
            }}
          >
            <p style={{ margin: 0, color: '#FF6B6B', fontWeight: 900 }}>Card-Social</p>
            <h1 style={{ margin: '10px 0 8px', fontSize: 22 }}>Unexpected error</h1>
            <p style={{ margin: '0 0 18px', color: 'rgba(255,255,255,0.62)', lineHeight: 1.5 }}>
              {error?.message || 'The application could not recover automatically.'}
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                width: '100%',
                border: 'none',
                borderRadius: 12,
                padding: '12px 14px',
                background: '#D4AF37',
                color: '#000',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
