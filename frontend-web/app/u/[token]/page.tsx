import { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import CardPreview from '@/components/CardPreview';
import type { CardData } from '@/lib/universalCardTypes';
import { normalizeUniversalCardPayload } from '@/lib/normalizeUniversalCard';
import { resolvePublicLocale, type PublicLocale } from '@/lib/resolvePublicLocale';
import { getThemeById } from '@/lib/themes';
import PublicLegalFooter from '@/components/PublicLegalFooter';
import DocumentHtmlLang from '@/components/DocumentHtmlLang';
import { earlyAccessPrimaryLabel } from '@/lib/publicEarlyAccessCta';

// En producción (Azure) el Next.js corre como proceso hijo del backend Express.
// Llamamos directo a localhost para evitar el loop proxy → Next.js → proxy.
// NEXT_PUBLIC_API_URL se usa solo en desarrollo local.
const API_BASE =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'https://cardsocial.me';

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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

export default async function UniversalCardPage({ params, searchParams }: Props) {
  const headerList = await headers();
  const sp = await searchParams;
  const locale = resolvePublicLocale({
    searchParams: sp,
    acceptLanguage: headerList.get('accept-language'),
  });
  const { token } = await params;
  const result = await fetchCard(token);

  if (!result) {
    return <ExpiredPage locale={locale} />;
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
        locale={locale}
        universalToken={token}
      />
    </main>
  );
}

function ExpiredPage({ locale }: { locale: PublicLocale }) {
  const tr = (es: string, en: string) => (locale === 'es' ? es : en);
  return (
    <main style={{
      minHeight: '100vh',
      background: '#F2F2F7',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      textAlign: 'center',
    }}>
      <DocumentHtmlLang locale={locale} />
      <div style={{ fontSize: 48, marginBottom: 16 }}>⏱</div>
      <h1 style={{ color: '#1C1C1E', fontSize: 24, fontWeight: '400', marginBottom: 8 }}>
        {tr('Enlace expirado', 'Link expired')}
      </h1>
      <p style={{ color: '#636366', fontSize: 15, maxWidth: 320, lineHeight: 1.6 }}>
        {tr(
          'Este acceso temporal ha expirado. Pide al emisor que genere un nuevo enlace desde la app.',
          'This temporary access has expired. Ask the sender to create a new link from the app.',
        )}
      </p>
      <a
        href="https://cardsocial.me"
        style={{
          marginTop: 32,
          display: 'inline-block',
          padding: '14px 32px',
          borderRadius: 14,
          backgroundColor: '#0f172a',
          color: '#ffffff',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 10px 28px rgba(15, 23, 42, 0.35)',
          fontWeight: 600,
          fontSize: 16,
          textDecoration: 'none',
        }}
      >
        {earlyAccessPrimaryLabel(locale)}
      </a>
      <div style={{ width: '100%', maxWidth: 420, marginTop: 8 }}>
        <PublicLegalFooter locale={locale} accentColor="#636366" />
      </div>
    </main>
  );
}
