import type { CardData } from '@/lib/universalCardTypes';
import { normalizeUniversalCardPayload } from '@/lib/normalizeUniversalCard';

const API_BASE =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'https://cardsocial.me';

function mapBusinessApiJsonToCardData(data: Record<string, unknown>): CardData {
  return normalizeUniversalCardPayload({
    scName: String(data.cardName ?? data.scName ?? ''),
    bcContactName: data.bcContactName ?? null,
    ownerDisplayName: String(data.ownerDisplayName ?? ''),
    ownerNickname: data.ownerNickname ?? null,
    ownerPhotoUrl: data.ownerPhotoUrl ?? null,
    ownerOccupation: data.ownerOccupation ?? null,
    userFullName: data.userFullName ?? null,
    userNickName: data.userNickName ?? null,
    userAvatarUrl: null,
    slots: data.slots ?? [],
    themeId: data.themeId ?? null,
    layout: data.layout === 'horizontal' ? 'horizontal' : 'vertical',
    wallpaperUrl: data.wallpaperUrl ?? null,
    enableParallax: Boolean(data.enableParallax),
    expiresAt: String(data.expiresAt ?? ''),
    uid: data.uid,
    bId: data.bId,
    businessMedalCounts: (data.businessMedalCounts ?? data.medalCounts) as Record<string, number> | undefined,
    bcKeywords: Array.isArray(data.bcKeywords) ? data.bcKeywords : undefined,
  });
}

export async function fetchPublicBusinessCardForWeb(bId: string, uid: string): Promise<CardData | null> {
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

export async function fetchPublicUniversalCardForWeb(token: string): Promise<CardData | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/public/universal-card?token=${encodeURIComponent(token)}&source=web`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok || !data.card) return null;
    return normalizeUniversalCardPayload(data.card);
  } catch {
    return null;
  }
}

export function canonicalBusinessCardWebUrl(origin: string, bId: string, uid: string): string {
  return `${origin.replace(/\/+$/, '')}/b/${encodeURIComponent(bId)}?uid=${encodeURIComponent(uid)}`;
}

export function canonicalUniversalCardWebUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/u/${encodeURIComponent(token)}`;
}

export function vcardResponseHeaders(filename: string): HeadersInit {
  const safe = filename.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'contact.vcf';
  return {
    'Content-Type': 'text/vcard; charset=utf-8',
    'Content-Disposition': `inline; filename="${safe}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}
