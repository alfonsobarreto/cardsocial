export default function Home() {
  return (
    <main style={{
      minHeight: '100vh',
      backgroundColor: '#000000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>★</div>
      <h1 style={{ color: '#D4AF37', fontSize: 32, fontWeight: '300', margin: '0 0 12px' }}>
        Card-Social
      </h1>
      <p style={{ color: '#9CA3AF', fontSize: 16, maxWidth: 340, lineHeight: 1.6, margin: '0 0 32px' }}>
        Tu identidad digital inteligente. Comparte quien eres con un solo QR.
      </p>
      <a
        href="https://apps.apple.com"
        style={{
          display: 'block',
          padding: '14px 40px',
          borderRadius: 14,
          backgroundColor: '#D4AF37',
          color: '#000',
          fontWeight: '400',
          fontSize: 16,
          textDecoration: 'none',
          marginBottom: 12,
        }}
      >
        Descargar la app
      </a>
    </main>
  );
}
