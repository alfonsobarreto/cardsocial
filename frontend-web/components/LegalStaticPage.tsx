import LegalSiteNav from '@/components/LegalSiteNav';
import Link from 'next/link';
import React from 'react';

type Props = {
  title: string;
  children: React.ReactNode;
  /** Mostrar índice de enlaces legales al pie (por defecto sí, para auditoría en tiendas). */
  showLegalNav?: boolean;
};

export default function LegalStaticPage({ title, children, showLegalNav = true }: Props) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#F2F2F7',
        color: '#1C1C1E',
        padding: '28px 18px 40px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            marginBottom: 20,
            fontSize: 13,
            color: '#636366',
            textDecoration: 'underline',
          }}
        >
          ← Card-Social
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px', lineHeight: 1.25 }}>{title}</h1>
        <div style={{ fontSize: 15, lineHeight: 1.65 }}>{children}</div>
        {showLegalNav ? <LegalSiteNav /> : null}
      </div>
    </main>
  );
}
