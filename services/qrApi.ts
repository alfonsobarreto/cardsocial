import axios from 'axios';

function getApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_MODERATION_API_URL?.trim();
  if (!envUrl) {
    throw new Error('Missing EXPO_PUBLIC_MODERATION_API_URL. Set it in your Expo environment.');
  }
  return envUrl.replace(/\/+$/, '');
}

function getGatewayKey(): string {
  const key = process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim();
  if (!key) {
    throw new Error('Missing EXPO_PUBLIC_MODERATION_GATEWAY_KEY. Set it in your Expo environment.');
  }
  return key;
}

async function getScopedJwtToken(ownerUid: string, scope: 'moderation.upload' | 'qr.access') {
  const baseUrl = getApiBaseUrl();
  const gatewayKey = getGatewayKey();

  const response = await axios.post(
    `${baseUrl}/api/auth/token`,
    { ownerUid, scope },
    {
      headers: {
        'x-api-gateway-key': gatewayKey,
      },
      timeout: 15000,
    }
  );

  const token = String(response?.data?.token || '').trim();
  if (!token) {
    throw new Error('Auth token exchange failed: empty token');
  }

  return {
    token,
    baseUrl,
    gatewayKey,
  };
}

export async function issueDynamicQrToken(params: { ownerUid: string; cardId: string }): Promise<{ token: string; ttlSec: number; expiresAt: string }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/issue`,
    {
      ownerUid: params.ownerUid,
      cardId: params.cardId,
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    }
  );

  return {
    token: String(response?.data?.token || ''),
    ttlSec: Number(response?.data?.ttlSec || 60),
    expiresAt: String(response?.data?.expiresAt || ''),
  };
}

export async function consumeDynamicQrToken(params: { receiverUid: string; token: string }): Promise<{ ownerUid: string; receiverUid: string; cardId: string; shareGranted: boolean }> {
  const auth = await getScopedJwtToken(params.receiverUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/consume`,
    {
      receiverUid: params.receiverUid,
      token: params.token,
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    }
  );

  return {
    ownerUid: String(response?.data?.ownerUid || ''),
    receiverUid: String(response?.data?.receiverUid || ''),
    cardId: String(response?.data?.cardId || ''),
    shareGranted: Boolean(response?.data?.shareGranted),
  };
}

export async function listCardSubscribers(params: { ownerUid: string; cardId: string }): Promise<{
  count: number;
  subscribers: Array<{ uid: string; name: string; photoUrl: string | null; isAmixes: boolean }>;
}> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.get(`${auth.baseUrl}/api/cards/${encodeURIComponent(params.cardId)}/subscribers`, {
    params: {
      ownerUid: params.ownerUid,
    },
    headers: {
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
    },
    timeout: 15000,
  });

  const rows = Array.isArray(response?.data?.subscribers) ? response.data.subscribers : [];
  return {
    count: Number(response?.data?.count || rows.length || 0),
    subscribers: rows.map((row: any) => ({
      uid: String(row?.uid || ''),
      name: String(row?.name || 'Usuario'),
      photoUrl: row?.photoUrl ? String(row.photoUrl) : null,
      isAmixes: Boolean(row?.isAmixes),
    })),
  };
}

export async function revokeCardSubscriber(params: { ownerUid: string; cardId: string; targetUid: string }): Promise<{ deletedCount: number }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.delete(
    `${auth.baseUrl}/api/cards/${encodeURIComponent(params.cardId)}/subscribers/${encodeURIComponent(params.targetUid)}`,
    {
      data: {
        ownerUid: params.ownerUid,
      },
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    }
  );

  return {
    deletedCount: Number(response?.data?.deletedCount || 0),
  };
}

export async function blockRelationship(params: { ownerUid: string; targetUid: string }): Promise<{ deletedLinks: number }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/relationships/block`,
    {
      ownerUid: params.ownerUid,
      targetUid: params.targetUid,
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    }
  );

  return {
    deletedLinks: Number(response?.data?.deletedLinks || 0),
  };
}

export async function removeRelationship(params: { ownerUid: string; targetUid: string }): Promise<{ deletedLinks: number }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/relationships/remove`,
    {
      ownerUid: params.ownerUid,
      targetUid: params.targetUid,
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    }
  );

  return {
    deletedLinks: Number(response?.data?.deletedLinks || 0),
  };
}

export async function listBlockedRelations(params: { ownerUid: string }): Promise<{
  count: number;
  blockedUsers: Array<{ uid: string; name: string; photoUrl: string | null; blockedByUid: string; createdAt: string | null; blockedAt: string | null }>;
}> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.get(`${auth.baseUrl}/api/relationships/blocked`, {
    params: {
      ownerUid: params.ownerUid,
    },
    headers: {
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
    },
    timeout: 15000,
  });

  const rows = Array.isArray(response?.data?.blockedUsers) ? response.data.blockedUsers : [];
  return {
    count: Number(response?.data?.count || rows.length || 0),
    blockedUsers: rows.map((row: any) => ({
      uid: String(row?.uid || ''),
      name: String(row?.name || 'Usuario bloqueado'),
      photoUrl: row?.photoUrl ? String(row.photoUrl) : null,
      blockedByUid: String(row?.blockedByUid || ''),
      createdAt: row?.createdAt ? String(row.createdAt) : null,
      blockedAt: row?.blockedAt ? String(row.blockedAt) : null,
    })),
  };
}

export async function unblockRelationship(params: { ownerUid: string; targetUid: string }): Promise<{ unblocked: boolean }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.delete(
    `${auth.baseUrl}/api/relationships/blocked/${encodeURIComponent(params.targetUid)}`,
    {
      data: {
        ownerUid: params.ownerUid,
      },
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    }
  );

  return {
    unblocked: Boolean(response?.data?.unblocked),
  };
}

export type SmartCardPayload = {
  cardId: string;
  name: string;
  layout: 'vertical' | 'horizontal';
  themeId?: string;
  fontId?: string;
  fontName?: string;
  fontFamily?: string;
  fontTier?: 'free' | 'premium';
  wallpaperId?: string;
  wallpaperUrl?: string;
  wallpaperThumbUrl?: string;
  wallpaperTier?: 'free' | 'premium';
  wallpaperPriceCredits?: number;
  enableParallax?: boolean;
  isFavorite?: boolean;
  itemIds: string[];
  holdersCount?: number;
  ratingAvg?: number;
  ownerNickname?: string;
  ownerPhotoUrl?: string | null;
};

export async function listSmartCardsFromDb(params: { ownerUid: string }): Promise<{
  cards: Array<SmartCardPayload & { createdAt: string; updatedAt: string }>;
}> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.get(`${auth.baseUrl}/api/cards`, {
    params: {
      ownerUid: params.ownerUid,
    },
    headers: {
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
    },
    timeout: 15000,
  });

  const rows = Array.isArray(response?.data?.cards) ? response.data.cards : [];
  return {
    cards: rows.map((row: any) => ({
      cardId: String(row?.cardId || ''),
      name: String(row?.name || 'Smart Card'),
      layout: String(row?.layout || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical',
      themeId: row?.themeId ? String(row.themeId) : undefined,
      fontId: row?.fontId ? String(row.fontId) : undefined,
      fontName: row?.fontName ? String(row.fontName) : undefined,
      fontFamily: row?.fontFamily ? String(row.fontFamily) : undefined,
      fontTier: String(row?.fontTier || '') === 'premium' ? 'premium' : String(row?.fontTier || '') === 'free' ? 'free' : undefined,
      wallpaperId: row?.wallpaperId ? String(row.wallpaperId) : undefined,
      wallpaperUrl: row?.wallpaperUrl ? String(row.wallpaperUrl) : undefined,
      wallpaperThumbUrl: row?.wallpaperThumbUrl ? String(row.wallpaperThumbUrl) : undefined,
      wallpaperTier: String(row?.wallpaperTier || '') === 'premium' ? 'premium' : String(row?.wallpaperTier || '') === 'free' ? 'free' : undefined,
      wallpaperPriceCredits: Number(row?.wallpaperPriceCredits || 0),
      enableParallax: Boolean(row?.enableParallax),
      isFavorite: Boolean(row?.isFavorite),
      itemIds: Array.isArray(row?.itemIds) ? row.itemIds.map((id: any) => String(id)) : [],
      holdersCount: Number(row?.holdersCount || 0),
      ratingAvg: Number(row?.ratingAvg || 5),
      ownerNickname: row?.ownerNickname ? String(row.ownerNickname) : undefined,
      ownerPhotoUrl: row?.ownerPhotoUrl ? String(row.ownerPhotoUrl) : null,
      createdAt: String(row?.createdAt || new Date().toISOString()),
      updatedAt: String(row?.updatedAt || new Date().toISOString()),
    })),
  };
}

export async function upsertSmartCardInDb(params: { ownerUid: string; card: SmartCardPayload }): Promise<{ ok: boolean }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  await axios.put(
    `${auth.baseUrl}/api/cards/${encodeURIComponent(params.card.cardId)}`,
    {
      ownerUid: params.ownerUid,
      ...params.card,
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    }
  );

  return { ok: true };
}

export async function deleteSmartCardInDb(params: { ownerUid: string; cardId: string }): Promise<{ deleted: boolean }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.delete(`${auth.baseUrl}/api/cards/${encodeURIComponent(params.cardId)}`, {
    data: {
      ownerUid: params.ownerUid,
    },
    headers: {
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
    },
    timeout: 15000,
  });

  return {
    deleted: Boolean(response?.data?.deleted),
  };
}

export async function listReceivedContacts(params: { ownerUid: string }): Promise<{
  contacts: Array<{
    uid: string;
    name: string;
    nickname: string;
    photoUrl: string | null;
    ratingAvg: number;
    cardName: string;
    holdersCount: number;
    addedAt: string | null;
    storyState: 'none' | 'normal' | 'vip';
  }>;
}> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.get(`${auth.baseUrl}/api/contacts/received`, {
    params: {
      ownerUid: params.ownerUid,
    },
    headers: {
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
    },
    timeout: 15000,
  });

  const rows = Array.isArray(response?.data?.contacts) ? response.data.contacts : [];
  return {
    contacts: rows.map((row: any) => ({
      uid: String(row?.uid || ''),
      name: String(row?.name || 'Contacto'),
      nickname: String(row?.nickname || 'user'),
      photoUrl: row?.photoUrl ? String(row.photoUrl) : null,
      ratingAvg: Number(row?.ratingAvg || 5),
      cardName: String(row?.cardName || 'Tarjeta Social'),
      holdersCount: Number(row?.holdersCount || 0),
      addedAt: row?.addedAt ? String(row.addedAt) : null,
      storyState: row?.storyState === 'vip' ? 'vip' : row?.storyState === 'normal' ? 'normal' : 'none',
    })),
  };
}

export async function setMyStoryState(params: {
  ownerUid: string;
  state: 'none' | 'normal' | 'vip';
  isPaidExternal?: boolean;
  vipSource?: 'manual' | 'subscription' | 'external_partner';
  paidChannel?: string;
  manualReason?: string;
}): Promise<{
  state: 'none' | 'normal' | 'vip';
  expiresAt: string | null;
  isPaidExternal?: boolean;
  vipSource?: 'manual' | 'subscription' | 'external_partner' | null;
  paidChannel?: string | null;
}> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/stories/state`,
    {
      ownerUid: params.ownerUid,
      state: params.state,
      isPaidExternal: params.isPaidExternal,
      vipSource: params.vipSource,
      paidChannel: params.paidChannel,
      manualReason: params.manualReason,
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    }
  );

  return {
    state: response?.data?.state === 'vip' ? 'vip' : response?.data?.state === 'normal' ? 'normal' : 'none',
    expiresAt: response?.data?.expiresAt ? String(response.data.expiresAt) : null,
    isPaidExternal: response?.data?.isPaidExternal === true,
    vipSource: response?.data?.vipSource ? String(response.data.vipSource) as 'manual' | 'subscription' | 'external_partner' : null,
    paidChannel: response?.data?.paidChannel ? String(response.data.paidChannel) : null,
  };
}

export async function getMyStoryState(params: {
  ownerUid: string;
}): Promise<{
  state: 'none' | 'normal' | 'vip';
  expiresAt: string | null;
  isPaidExternal?: boolean;
  vipSource?: 'manual' | 'subscription' | 'external_partner' | null;
  paidChannel?: string | null;
}> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.get(`${auth.baseUrl}/api/stories/state`, {
    params: {
      ownerUid: params.ownerUid,
    },
    headers: {
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
    },
    timeout: 15000,
  });

  return {
    state: response?.data?.state === 'vip' ? 'vip' : response?.data?.state === 'normal' ? 'normal' : 'none',
    expiresAt: response?.data?.expiresAt ? String(response.data.expiresAt) : null,
    isPaidExternal: response?.data?.isPaidExternal === true,
    vipSource: response?.data?.vipSource ? String(response.data.vipSource) as 'manual' | 'subscription' | 'external_partner' : null,
    paidChannel: response?.data?.paidChannel ? String(response.data.paidChannel) : null,
  };
}

export async function activateVipManualExternal(params: {
  ownerUid: string;
  vipDays?: number;
  isPaidExternal?: boolean;
  paidChannel?: string;
  manualReason?: string;
}): Promise<{ state: 'vip'; expiresAt: string; vipDays: number; isPaidExternal: boolean; paidChannel: string | null }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/stories/vip/manual`,
    {
      ownerUid: params.ownerUid,
      vipDays: params.vipDays,
      isPaidExternal: params.isPaidExternal,
      paidChannel: params.paidChannel,
      manualReason: params.manualReason,
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    }
  );

  return {
    state: 'vip',
    expiresAt: String(response?.data?.expiresAt || ''),
    vipDays: Number(response?.data?.vipDays || 7),
    isPaidExternal: response?.data?.isPaidExternal === true,
    paidChannel: response?.data?.paidChannel ? String(response.data.paidChannel) : null,
  };
}

export type HouseAdStory = {
  title: string;
  subtitle: string;
  priceLabel: string;
  locationLabel: string;
  photoUrl: string | null;
  ctaLabel: string;
  ctaUrl: string | null;
  updatedAt: string;
};

export async function getStoriesHouseAd(params: { ownerUid: string }): Promise<{ ad: HouseAdStory | null }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.get(`${auth.baseUrl}/api/stories/ads/house`, {
    params: {
      ownerUid: params.ownerUid,
    },
    headers: {
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
    },
    timeout: 15000,
  });

  const ad = response?.data?.ad;
  if (!ad) {
    return { ad: null };
  }

  return {
    ad: {
      title: String(ad?.title || 'Mi Sueno Mexicano'),
      subtitle: String(ad?.subtitle || 'Casa destacada en tu zona'),
      priceLabel: String(ad?.priceLabel || '$0 MXN'),
      locationLabel: String(ad?.locationLabel || 'Ubicacion no disponible'),
      photoUrl: ad?.photoUrl ? String(ad.photoUrl) : null,
      ctaLabel: String(ad?.ctaLabel || 'Ver propiedad'),
      ctaUrl: ad?.ctaUrl ? String(ad.ctaUrl) : null,
      updatedAt: String(ad?.updatedAt || new Date().toISOString()),
    },
  };
}

export async function upsertStoriesHouseAd(params: {
  ownerUid: string;
  title: string;
  subtitle?: string;
  priceLabel: string;
  locationLabel: string;
  photoUrl?: string | null;
  ctaLabel?: string;
  ctaUrl?: string | null;
  isActive?: boolean;
}): Promise<{ ok: boolean }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  await axios.put(
    `${auth.baseUrl}/api/stories/ads/house`,
    {
      ownerUid: params.ownerUid,
      title: params.title,
      subtitle: params.subtitle,
      priceLabel: params.priceLabel,
      locationLabel: params.locationLabel,
      photoUrl: params.photoUrl ?? null,
      ctaLabel: params.ctaLabel,
      ctaUrl: params.ctaUrl ?? null,
      isActive: params.isActive,
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    }
  );

  return { ok: true };
}

export type CallHistoryRow = {
  callId: string;
  peerUid: string;
  name: string;
  nickname: string;
  photoUrl: string | null;
  sourceCardName: string;
  sourceCardId: string | null;
  callChannel: 'ghost-link-voip';
  storyState: 'none' | 'normal' | 'vip';
  direction: 'incoming' | 'outgoing' | 'missed';
  status: 'completed' | 'missed' | 'rejected';
  durationSec: number;
  tags: string[];
  voiceNoteUri: string | null;
  voiceNoteName: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listCallsHistory(params: { ownerUid: string }): Promise<{ count: number; history: CallHistoryRow[] }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.get(`${auth.baseUrl}/api/calls/history`, {
    params: {
      ownerUid: params.ownerUid,
    },
    headers: {
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
    },
    timeout: 15000,
  });

  const rows = Array.isArray(response?.data?.history) ? response.data.history : [];
  return {
    count: Number(response?.data?.count || rows.length || 0),
    history: rows.map((row: any) => ({
      callId: String(row?.callId || ''),
      peerUid: String(row?.peerUid || ''),
      name: String(row?.name || 'Contacto'),
      nickname: String(row?.nickname || 'user'),
      photoUrl: row?.photoUrl ? String(row.photoUrl) : null,
      sourceCardName: String(row?.sourceCardName || 'Tarjeta Social'),
      sourceCardId: row?.sourceCardId ? String(row.sourceCardId) : null,
      callChannel: 'ghost-link-voip',
      storyState: row?.storyState === 'vip' ? 'vip' : row?.storyState === 'normal' ? 'normal' : 'none',
      direction: row?.direction === 'outgoing' ? 'outgoing' : row?.direction === 'missed' ? 'missed' : 'incoming',
      status: row?.status === 'missed' ? 'missed' : row?.status === 'rejected' ? 'rejected' : 'completed',
      durationSec: Number(row?.durationSec || 0),
      tags: Array.isArray(row?.tags) ? row.tags.map((tag: any) => String(tag)) : [],
      voiceNoteUri: row?.voiceNoteUri ? String(row.voiceNoteUri) : null,
      voiceNoteName: row?.voiceNoteName ? String(row.voiceNoteName) : null,
      createdAt: String(row?.createdAt || new Date().toISOString()),
      updatedAt: String(row?.updatedAt || new Date().toISOString()),
    })),
  };
}

export async function createCallLog(params: {
  ownerUid: string;
  peerUid: string;
  direction: 'incoming' | 'outgoing' | 'missed';
  status: 'completed' | 'missed' | 'rejected';
  durationSec?: number;
  tags?: string[];
  voiceNoteUri?: string | null;
  voiceNoteName?: string | null;
  sourceCardName?: string;
  sourceCardId?: string | null;
  callChannel?: 'ghost-link-voip';
}): Promise<{ callId: string }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/calls/logs`,
    {
      ownerUid: params.ownerUid,
      peerUid: params.peerUid,
      direction: params.direction,
      status: params.status,
      durationSec: Number(params.durationSec || 0),
      tags: Array.isArray(params.tags) ? params.tags : [],
      voiceNoteUri: params.voiceNoteUri ?? null,
      voiceNoteName: params.voiceNoteName ?? null,
      sourceCardName: params.sourceCardName ? String(params.sourceCardName) : 'Tarjeta Social',
      sourceCardId: params.sourceCardId ?? null,
      callChannel: params.callChannel || 'ghost-link-voip',
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    }
  );

  return {
    callId: String(response?.data?.callId || ''),
  };
}

export async function patchCallLogMeta(params: {
  ownerUid: string;
  callId: string;
  tags?: string[];
  voiceNoteUri?: string | null;
  voiceNoteName?: string | null;
}): Promise<{ ok: boolean }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  await axios.patch(
    `${auth.baseUrl}/api/calls/logs/${encodeURIComponent(params.callId)}`,
    {
      ownerUid: params.ownerUid,
      tags: params.tags,
      voiceNoteUri: params.voiceNoteUri,
      voiceNoteName: params.voiceNoteName,
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    }
  );

  return { ok: true };
}
