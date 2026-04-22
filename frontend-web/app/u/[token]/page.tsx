import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CardPreview from '@/components/CardPreview';
import type { CardData } from '@/lib/universalCardTypes';
import { normalizeUniversalCardPayload } from '@/lib/normalizeUniversalCard';
import { getThemeById } from '@/lib/themes';
import PublicLegalFooter from '@/components/PublicLegalFooter';

// En producción (Azure) el Next.js corre como proceso hijo del backend Express.
// Llamamos directo a localhost para evitar el loop proxy → Next.js → proxy.
// NEXT_PUBLIC_API_URL se usa solo en desarrollo local.
const API_BASE =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'https://cardsocial.me';

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
    return { card: normalizeUniversalCardPayload(data.card) };
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
  const name = card.userFullName || card.ownerDisplayName || card.scName || 'Card-Social';
  return {
    title: `${name} — Card-Social`,
    description: card.ownerOccupation ?? 'Tarjeta digital inteligente',
    openGraph: {
      title: `${name} — Card-Social`,
      description: card.ownerOccupation ?? 'Tarjeta digital inteligente',
      images: (() => {
        const og = card.userAvatarUrl || card.cardWireframeImageUrl;
        return og ? [{ url: og }] : [];
      })(),
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
  const bgGradient = `linear-gradient(180deg, ${theme.background[0]}, ${theme.background[1]}, ${theme.background[2]})`;

  return (
    <main style={{
      minHeight: '100vh',
      background: bgGradient,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: '24px 16px 48px',
    }}>
      <CardPreview
        variant="universal"
        card={card}
        theme={theme}
        expiresAt={card.expiresAt}
        locale="es"
        universalToken={token}
      />
    </main>
  );
}

function ExpiredPage() {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #E0F7FA, #B2EBF2, #4DD0C8)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⏱</div>
      <h1 style={{ color: '#00695C', fontSize: 24, fontWeight: '400', marginBottom: 8 }}>
        Enlace expirado
      </h1>
      <p style={{ color: '#4E7570', fontSize: 15, maxWidth: 320, lineHeight: 1.6 }}>
        Este acceso temporal ha expirado. Pide al emisor que genere un nuevo enlace desde la app.
      </p>
      <a
        href="https://cardsocial.me"
        style={{
          marginTop: 32,
          display: 'inline-block',
          padding: '14px 32px',
          borderRadius: 14,
          backgroundColor: '#00E5FF',
          color: '#00695C',
          fontWeight: '400',
          fontSize: 16,
          textDecoration: 'none',
        }}
      >
        Descargar Card-Social
      </a>
      <div style={{ width: '100%', maxWidth: 420, marginTop: 8 }}>
        <PublicLegalFooter locale="es" accentColor="#00695C" />
      </div>
    </main>
  );
}
