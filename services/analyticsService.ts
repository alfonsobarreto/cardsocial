import { getActiveUserId } from '@/services/authSession';
import {
  getCardAnalyticsPeriodSummary,
  getMarketSeoHeatmap,
  getMarketSeoSummary,
  trackCardAnalyticsAction,
  trackMarketSearch,
  trackMarketSearchCardClick,
  type CardAnalyticsActionType,
  type CardAnalyticsPeriodMode,
  type CardAnalyticsPeriodSummary,
  type MarketSeoSummary,
  type MarketSeoHeatmap,
} from '@/services/qrApi';

export type { CardAnalyticsActionType, CardAnalyticsPeriodMode, CardAnalyticsPeriodSummary, MarketSeoSummary, MarketSeoHeatmap };

export async function trackCardAction(
  cardId: string,
  actionType: CardAnalyticsActionType,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const rawUid = await getActiveUserId();
  const uid = rawUid?.trim() || 'anonymous_guest';
  const cleanCardId = String(cardId || '').trim();
  if (!cleanCardId) return;

  await trackCardAnalyticsAction({
    uid,
    cardId: cleanCardId,
    actionType,
    subType: String(metadata.subType || metadata.iconType || actionType),
    metadata,
  });
}

export async function getCardAnalyticsForPeriod(params: {
  cardId: string;
  periodMode: CardAnalyticsPeriodMode;
  periodOffset: number;
}): Promise<CardAnalyticsPeriodSummary | undefined> {
  const uid = await getActiveUserId();
  const cardId = String(params.cardId || '').trim();
  if (!uid || !cardId) return undefined;

  return getCardAnalyticsPeriodSummary({
    uid,
    cardRef: cardId,
    periodMode: params.periodMode,
    periodOffset: params.periodOffset,
  });
}

export async function trackMarketplaceSearch(params: {
  q: string;
  keywordRoot?: string;
  zipcode?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  geoLabel?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  resultBIds?: string[];
}): Promise<void> {
  const uid = (await getActiveUserId())?.trim() || 'anonymous_guest';
  const q = String(params.q || '').trim();
  if (!q) return;
  await trackMarketSearch({ uid, ...params, q });
}

export async function trackMarketplaceCardClick(params: {
  bId: string;
  q: string;
  keywordRoot?: string;
  zipcode?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  geoLabel?: string | null;
}): Promise<void> {
  const uid = (await getActiveUserId())?.trim() || 'anonymous_guest';
  const bId = String(params.bId || '').trim();
  const q = String(params.q || '').trim();
  if (!bId || !q) return;
  await trackMarketSearchCardClick({ uid, ...params, bId, q });
}

export async function getSeoInsightsForCard(params: {
  bId: string;
  locationQuery?: string | null;
}): Promise<MarketSeoSummary | undefined> {
  const uid = await getActiveUserId();
  const bId = String(params.bId || '').trim();
  if (!uid || !bId) return undefined;
  return getMarketSeoSummary({ uid, bId, locationQuery: params.locationQuery });
}

export async function getSeoHeatmap(params: {
  keyword: string;
  periodMode: CardAnalyticsPeriodMode;
  periodOffset: number;
  locationQuery?: string | null;
}): Promise<MarketSeoHeatmap | undefined> {
  const uid = await getActiveUserId();
  const keyword = String(params.keyword || '').trim();
  if (!uid || !keyword) return undefined;
  return getMarketSeoHeatmap({
    uid,
    keyword,
    periodMode: params.periodMode,
    periodOffset: params.periodOffset,
    locationQuery: params.locationQuery,
  });
}
