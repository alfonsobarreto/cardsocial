import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CardPreview, { CardData } from '@/components/CardPreview';
import { getThemeById } from '@/lib/themes';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://cardsocial.me';

type Props = { params: Promise<{ token: string }> };

async function fetchCard(token: string): Promise<{ card: CardData } | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/public/universal-card?token=${encodeURIComponent(token)}&source=web`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok || !data.card) return null;
    return { card: data.card as CardData };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const result = await fetchCard(token);
  if (!result) {
    return { title: 'Card-Social — Enlace expirado' };
  }
  const { card } = result;
  const name = card.ownerDisplayName || card.name || 'Card-Social';
  return {
    title: `${name} — Card-Social`,
    description: card.ownerOccupation ?? 'Tarjeta digital inteligente',
    openGraph: {
      title: `${name} — Card-Social`,
      description: card.ownerOccupation ?? 'Tarjeta digital inteligente',
      images: card.ownerPhotoUrl ? [{ url: card.ownerPhotoUrl }] : [],
    },
  };
}

export default async function UniversalCardPage({ params }: Props) {
  const { token } = await params;
  const result = await fetchCard(token);

  if (!result) {
    return <ExpiredPage />;
  }

  const { card } = result;
  const theme = getThemeById(card.themeId);

  return (
    <main style={{
      minHeight: '100vh',
      backgroundColor: '#000000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: '24px 16px 48px',
    }}>
      <CardPreview
        card={card}
        theme={theme}
        expiresAt={card.expiresAt}
        locale="es"
      />
    </main>
  );
}

function ExpiredPage() {
  return (
    <main style={{
      minHeight: '100vh',
      backgroundColor: '#000000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⏱</div>
      <h1 style={{ color: '#D4AF37', fontSize: 24, fontWeight: '800', marginBottom: 8 }}>
        Enlace expirado
      </h1>
      <p style={{ color: '#9CA3AF', fontSize: 15, maxWidth: 320, lineHeight: 1.6 }}>
        Este acceso temporal ha expirado. Pide al emisor que genere un nuevo enlace desde la app.
      </p>
      <a
        href="https://cardsocial.me"
        style={{
          marginTop: 32,
          display: 'inline-block',
          padding: '14px 32px',
          borderRadius: 14,
          backgroundColor: '#D4AF37',
          color: '#000',
          fontWeight: '800',
          fontSize: 16,
          textDecoration: 'none',
        }}
      >
        Descargar Card-Social
      </a>
    </main>
  );
}
