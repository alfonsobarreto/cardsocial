'use client';

import { machineErrorUserMessage } from '@/lib/userFacingApiMessages';
export default function GlobalError({ error: _error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#000', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div
            style={{
              width: '100%',
              maxWidth: 460,
              border: '1px solid rgba(233,195,73,0.35)',
              borderRadius: 18,
              background: '#0D0D0D',
              padding: 28,
            }}
          >
            <p style={{ margin: 0, color: '#FF6B6B', fontWeight: 900 }}>Card-Social</p>
            <h1 style={{ margin: '10px 0 8px', fontSize: 22 }}>Unexpected error</h1>
            <p style={{ margin: '0 0 18px', color: 'rgba(255,255,255,0.62)', lineHeight: 1.5 }}>
              {machineErrorUserMessage('SERVER_INTERNAL_ERROR', 'en')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.location.assign(new URL('/login', window.location.origin).href);
                  }
                }}
                style={{
                  width: '100%',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 14px',
                  background: '#E9C349',
                  color: '#000',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Go to sign in
              </button>
              <button
                type="button"
                onClick={reset}
                style={{
                  width: '100%',
                  border: '1px solid rgba(233,195,73,0.4)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.85)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
