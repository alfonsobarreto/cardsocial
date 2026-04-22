import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CardPreview from '@/components/CardPreview';
import type { CardData } from '@/lib/universalCardTypes';
import { normalizeUniversalCardPayload } from '@/lib/normalizeUniversalCard';
import { getThemeById } from '@/lib/themes';
import PublicLegalFooter from '@/components/PublicLegalFooter';

const API_BASE =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'https://cardsocial.me';

type Props = {
  params: Promise<{ bId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function mapBusinessApiJsonToCardData(data: Record<string, unknown>): CardData {
  return normalizeUniversalCardPayload({
    scName: String(data.cardName ?? data.scName ?? ''),
    ownerDisplayName: String(data.ownerDisplayName ?? ''),
    ownerNickname: data.ownerNickname ?? null,
    ownerPhotoUrl: data.ownerPhotoUrl ?? null,
    ownerOccupation: data.ownerOccupation ?? null,
    userFullName: data.userFullName ?? null,
    userNickName: data.userNickName ?? null,
    userAvatarUrl: data.userAvatarUrl ?? null,
    slots: data.slots ?? [],
    themeId: data.themeId ?? null,
    layout: data.layout === 'horizontal' ? 'horizontal' : 'vertical',
    wallpaperUrl: data.wallpaperUrl ?? null,
    enableParallax: Boolean(data.enableParallax),
    holdersCount: data.holdersCount,
    ratingAvg: data.ratingAvg,
    totalRatings: data.totalRatings,
    expiresAt: String(data.expiresAt ?? ''),
    uid: data.uid,
    bId: data.bId,
  });
}

function permanentAppDeepLink(bId: string, uid: string): string {
  return `card-social://business/${encodeURIComponent(bId)}?uid=${encodeURIComponent(uid)}&mode=permanent`;
}

async function fetchPublicBusinessCard(bId: string, uid: string): Promise<CardData | null> {
  try {
    const qs = new URLSearchParams({ bId, uid, source: 'web' });
    const res = await fetch(`${API_BASE}/api/public/business-card-preview?${qs.toString()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (!data.ok) return null;
    return mapBusinessApiJsonToCardData(data);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { bId } = await params;
  const sp = await searchParams;
  const rawUid = sp.uid ?? sp.owner;
  const uid = Array.isArray(rawUid) ? rawUid[0] : rawUid;
  if (!uid || typeof uid !== 'string' || !uid.trim()) {
    return { title: 'Card-Social — Tarjeta' };
  }
  const card = await fetchPublicBusinessCard(bId, uid.trim());
  if (!card) {
    return { title: 'Card-Social — Tarjeta no encontrada' };
  }
  const name = card.scName || card.ownerDisplayName || 'Card-Social';
  return {
    title: `${name} — Card-Social`,
    description: card.ownerOccupation ?? 'Tarjeta de negocio',
    openGraph: {
      title: `${name} — Card-Social`,
      description: card.ownerOccupation ?? 'Tarjeta de negocio',
      images: (() => {
        const og = card.userAvatarUrl || card.cardWireframeImageUrl;
        return og ? [{ url: og }] : [];
      })(),
    },
  };
}

export default async function PublicBusinessPage({ params, searchParams }: Props) {
  const { bId } = await params;
  const sp = await searchParams;
  const rawUid = sp.uid ?? sp.owner;
  const uid = Array.isArray(rawUid) ? rawUid[0] : rawUid;
  if (!uid || typeof uid !== 'string' || !String(uid).trim()) {
    return <MissingUidPage />;
  }

  const u = String(uid).trim();
  const card = await fetchPublicBusinessCard(bId, u);
  if (!card) {
    notFound();
  }

  const theme = getThemeById(card.themeId);
  const bgGradient = `linear-gradient(180deg, ${theme.background[0]}, ${theme.background[1]}, ${theme.background[2]})`;
  const appDeepLink = permanentAppDeepLink(bId, u);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: bgGradient,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '24px 16px 48px',
      }}
    >
      <CardPreview
        variant="business"
        card={card}
        theme={theme}
        expiresAt={card.expiresAt}
        locale="es"
        appDeepLink={appDeepLink}
      />
    </main>
  );
}

function MissingUidPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #E0F7FA, #B2EBF2, #4DD0C8)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        textAlign: 'center',
      }}
    >
      <h1 style={{ color: '#00695C', fontSize: 22, fontWeight: 400, marginBottom: 8 }}>
        Enlace incompleto
      </h1>
      <p style={{ color: '#4E7570', fontSize: 15, maxWidth: 360, lineHeight: 1.6 }}>
        Falta el parámetro <code>uid</code> en la URL. Usa el enlace completo que comparte el negocio
        (incluye <code>?uid=…</code>).
      </p>
      <div style={{ width: '100%', maxWidth: 420, marginTop: 32 }}>
        <PublicLegalFooter locale="es" accentColor="#00695C" />
      </div>
    </main>
  );
}
