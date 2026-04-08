import React from 'react';

type Props = {
  title: string;
  children: React.ReactNode;
};

export default function LegalStaticPage({ title, children }: Props) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #E0F7FA, #B2EBF2, #4DD0C8)',
        color: '#00695C',
        padding: '28px 18px 40px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <a
          href="/"
          style={{
            display: 'inline-block',
            marginBottom: 20,
            fontSize: 13,
            color: '#00897B',
            textDecoration: 'underline',
          }}
        >
          ← Card-Social
        </a>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px', lineHeight: 1.25 }}>{title}</h1>
        <div style={{ fontSize: 15, lineHeight: 1.65 }}>{children}</div>
      </div>
    </main>
  );
}
