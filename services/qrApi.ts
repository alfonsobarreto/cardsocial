import axios from 'axios';

function getApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_MODERATION_API_URL?.trim();
  if (!envUrl) {
    throw new Error('Missing EXPO_PUBLIC_MODERATION_API_URL. Set it in your Expo environment.');
  }
  const normalized = envUrl.replace(/\/+$/, '');
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) {
    throw new Error(
      'EXPO_PUBLIC_MODERATION_API_URL no puede ser localhost en móvil físico. Usa IP LAN (ej. http://192.168.x.x:4000) o URL HTTPS pública.'
    );
  }
  return normalized;
}

function getGatewayKey(): string {
  const key =
    process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim() ||
    process.env.EXPO_PUBLIC_API_GATEWAY_KEY?.trim() ||
    process.env.EXPO_PUBLIC_GATEWAY_KEY?.trim();
  if (!key) {
    throw new Error(
      'Missing gateway key. Set EXPO_PUBLIC_MODERATION_GATEWAY_KEY (or EXPO_PUBLIC_API_GATEWAY_KEY) in your Expo environment and restart Expo with -c.'
    );
  }
  return key;
}

function mapQrNetworkError(error: any, baseUrl: string): Error {
  const message = String(error?.message || '');
  const status = Number(error?.response?.status || 0);
  const isNetwork =
    error?.code === 'ERR_NETWORK' ||
    /Network Error/i.test(message) ||
    /Failed to fetch/i.test(message) ||
    /timeout/i.test(message);

  if (isNetwork) {
    const cleartextHint = /^http:\/\//i.test(baseUrl)
      ? ' Desarrollo Android: sin esto, HTTP LAN falla; usa `android.usesCleartextTraffic: true` en app.json y reconstruye el dev client / APK.'
      : '';
    return new Error(
      `No se pudo conectar con el backend QR (${baseUrl}). Verifica IP/puerto, misma red Wi-Fi y backend activo.${cleartextHint}`
    );
  }
  if (status === 401) {
    return new Error('La API key del gateway es inválida o no coincide con API_GATEWAY_KEY del backend.');
  }
  if (status === 403) {
    return new Error('El token de seguridad no tiene permisos para QR. Revisa scope y backend.');
  }
  return error instanceof Error ? error : new Error(message || 'QR request failed');
}

async function getScopedJwtToken(ownerUid: string, scope: 'moderation.upload' | 'qr.access') {
  const baseUrl = getApiBaseUrl();
  const gatewayKey = getGatewayKey();

  let response: any;
  try {
    response = await axios.post(
      `${baseUrl}/api/auth/token`,
      { ownerUid, scope },
      {
        headers: {
          'x-api-gateway-key': gatewayKey,
        },
        timeout: 15000,
      }
    );
  } catch (error: any) {
    throw mapQrNetworkError(error, baseUrl);
  }

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

/** QR universal 24h → `universalUrl` (web + App Link); distinto del token `/issue` de un solo uso para compartir en app. */
export async function issueTemporaryUniversalAccess(params: {
  ownerUid: string;
  cardId: string;
}): Promise<{ token: string; universalUrl: string; ttlSec: number; expiresAt: string; source: string }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/temporary-access/issue`,
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
    universalUrl: String(response?.data?.universalUrl || ''),
    ttlSec: Number(response?.data?.ttlSec || 86400),
    expiresAt: String(response?.data?.expiresAt || ''),
    source: String(response?.data?.source || 'qr_scan'),
  };
}

export type PublicUniversalCardSlot = {
  itemId: string;
  type: string;
  label: string;
  value: string;
  iconName: string | null;
};

export type PublicUniversalCardPayload = {
  cardId: string;
  ownerUid: string;
  name: string;
  layout: 'vertical' | 'horizontal';
  themeId: string | null;
  fontId: string | null;
  fontName: string | null;
  fontFamily: string | null;
  fontTier: 'free' | 'premium' | null;
  wallpaperId: string | null;
  wallpaperUrl: string | null;
  wallpaperThumbUrl: string | null;
  wallpaperTier: 'free' | 'premium' | null;
  enableParallax: boolean;
  ownerDisplayName: string | null;
  ownerNickname: string | null;
  ownerPhotoUrl: string | null;
  ownerOccupation: string | null;
  searchFacets: Array<{ type: string; label: string; value: string }>;
  holdersCount: number;
  ratingAvg: number;
  totalRatings: number;
  storyState: 'none' | 'normal' | 'vip';
  slots: PublicUniversalCardSlot[];
  expiresAt: string;
};

function publicApiAcceptLanguage(locale?: 'en' | 'es'): { 'Accept-Language': string } {
  return { 'Accept-Language': locale === 'es' ? 'es' : 'en' };
}

/** Sin JWT: el token opaco es el secreto. Usar en Expo Web para `/u/[token]`. */
export async function fetchPublicUniversalCardByToken(params: {
  token: string;
  source?: string;
  /** Alinea mensajes JSON con el idioma de la app (header Accept-Language). */
  locale?: 'en' | 'es';
}): Promise<
  | { ok: true; card: PublicUniversalCardPayload; source: string | null }
  | { ok: false; expired: boolean; error?: string }
> {
  const baseUrl = getApiBaseUrl();
  const response = await axios.get(`${baseUrl}/api/public/universal-card`, {
    params: { token: params.token, source: params.source ?? 'qr_scan' },
    headers: publicApiAcceptLanguage(params.locale),
    timeout: 20000,
    validateStatus: () => true,
  });

  if (response.status === 410) {
    return {
      ok: false,
      expired: true,
      error: String(response?.data?.error || ''),
    };
  }
  if (response.status !== 200 || !response?.data?.ok || !response?.data?.card) {
    return {
      ok: false,
      expired: false,
      error: String(response?.data?.error || 'Request failed'),
    };
  }

  return {
    ok: true,
    card: response.data.card as PublicUniversalCardPayload,
    source: response.data.source != null ? String(response.data.source) : null,
  };
}

export type PublicQrTokenPreview = {
  ownerUid: string;
  cardId: string;
  token: string;
  expiresAt: string;
  ownerDisplayName: string;
  cardName: string;
  ownerNickname: string | null;
  ownerPhotoUrl: string | null;
  ownerOccupation: string | null;
  /** Tema Chest / smart_cards (vista previa fiel al emisor). */
  themeId: string;
  layout: 'vertical' | 'horizontal';
  wallpaperUrl?: string;
  enableParallax: boolean;
  holdersCount: number;
  ratingAvg: number;
  totalRatings: number;
  slots: Array<{
    itemId?: string;
    type?: string;
    label?: string;
    value?: string;
    icon?: string;
    iconName?: string;
    vaultMimeType?: string;
  }>;
};

function mapPublicQrPreviewResponse(
  d: Record<string, unknown>,
  tokenFallback: string,
): PublicQrTokenPreview {
  const layoutRaw = String(d.layout || 'vertical').toLowerCase();
  const layout: 'vertical' | 'horizontal' = layoutRaw === 'horizontal' ? 'horizontal' : 'vertical';
  const rawSlots = d.slots;
  return {
    ownerUid: String(d.ownerUid || ''),
    cardId: String(d.cardId || ''),
    token: String(d.token != null && d.token !== '' ? d.token : tokenFallback),
    expiresAt: String(d.expiresAt || ''),
    ownerDisplayName: String(d.ownerDisplayName || ''),
    cardName: String(d.cardName || ''),
    ownerNickname: d.ownerNickname != null ? String(d.ownerNickname) : null,
    ownerPhotoUrl: d.ownerPhotoUrl != null ? String(d.ownerPhotoUrl) : null,
    ownerOccupation: d.ownerOccupation != null ? String(d.ownerOccupation) : null,
    themeId: d.themeId != null ? String(d.themeId) : '',
    layout,
    wallpaperUrl: d.wallpaperUrl != null ? String(d.wallpaperUrl) : undefined,
    enableParallax: Boolean(d.enableParallax),
    holdersCount: Math.max(0, Math.floor(Number(d.holdersCount ?? 0))),
    ratingAvg: Number.isFinite(Number(d.ratingAvg)) ? Number(d.ratingAvg) : 0,
    totalRatings: Math.max(0, Math.floor(Number(d.totalRatings ?? 0))),
    slots: Array.isArray(rawSlots) ? rawSlots : [],
  };
}

/** Vista previa del QR dinámico sin consumir (modal de clasificación). */
export async function fetchPublicQrTokenPreview(params: {
  token: string;
  locale?: 'en' | 'es';
}): Promise<{ ok: true; preview: PublicQrTokenPreview } | { ok: false; expired: boolean; error?: string }> {
  const baseUrl = getApiBaseUrl();
  let response;
  try {
    response = await axios.get(`${baseUrl}/api/public/qr-token-preview`, {
      params: { token: params.token },
      headers: publicApiAcceptLanguage(params.locale),
      timeout: 20000,
      validateStatus: () => true,
    });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      console.error('[qrApi fetchPublicQrTokenPreview] request failed', {
        message: e.message,
        code: e.code,
        url: e.config?.url,
        method: e.config?.method,
        status: e.response?.status,
        data: e.response?.data,
        baseUrl,
      });
    } else {
      console.error('[qrApi fetchPublicQrTokenPreview]', e);
    }
    throw mapQrNetworkError(e, baseUrl);
  }

  if (response.status === 410) {
    return { ok: false, expired: true, error: String(response?.data?.error || '') };
  }
  if (response.status !== 200 || !response?.data?.ok) {
    return {
      ok: false,
      expired: false,
      error: String(response?.data?.error || 'Request failed'),
    };
  }

  const d = response.data as Record<string, unknown>;
  return {
    ok: true,
    preview: mapPublicQrPreviewResponse(d, params.token),
  };
}

export async function consumeDynamicQrToken(params: {
  receiverUid: string;
  token: string;
  locale?: 'en' | 'es';
}): Promise<{ ownerUid: string; receiverUid: string; cardId: string; shareGranted: boolean }> {
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
        ...publicApiAcceptLanguage(params.locale),
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

export async function fetchPublicBusinessCardPreview(params: {
  ownerUid: string;
  cardId: string;
  locale?: 'en' | 'es';
}): Promise<{ ok: true; preview: PublicQrTokenPreview } | { ok: false; error?: string }> {
  const baseUrl = getApiBaseUrl();
  let response;
  try {
    response = await axios.get(`${baseUrl}/api/public/business-card-preview`, {
      params: { ownerUid: params.ownerUid, cardId: params.cardId },
      headers: publicApiAcceptLanguage(params.locale),
      timeout: 20000,
      validateStatus: () => true,
    });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      console.error('[qrApi fetchPublicBusinessCardPreview] request failed', {
        message: e.message,
        code: e.code,
        url: e.config?.url,
        method: e.config?.method,
        status: e.response?.status,
        data: e.response?.data,
        baseUrl,
      });
    } else {
      console.error('[qrApi fetchPublicBusinessCardPreview]', e);
    }
    throw mapQrNetworkError(e, baseUrl);
  }

  if (response.status !== 200 || !response?.data?.ok) {
    return {
      ok: false,
      error: String(response?.data?.error || 'Request failed'),
    };
  }

  const d = response.data as Record<string, unknown>;
  return {
    ok: true,
    preview: mapPublicQrPreviewResponse(d, ''),
  };
}

export async function grantBusinessShareFromQr(params: {
  receiverUid: string;
  ownerUid: string;
  cardId: string;
  locale?: 'en' | 'es';
}): Promise<{ ownerUid: string; receiverUid: string; cardId: string; shareGranted: boolean }> {
  const auth = await getScopedJwtToken(params.receiverUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/grant-business-share`,
    {
      receiverUid: params.receiverUid,
      ownerUid: params.ownerUid,
      cardId: params.cardId,
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
        ...publicApiAcceptLanguage(params.locale),
      },
      timeout: 15000,
    },
  );

  return {
    ownerUid: String(response?.data?.ownerUid || ''),
    receiverUid: String(response?.data?.receiverUid || ''),
    cardId: String(response?.data?.cardId || ''),
    shareGranted: Boolean(response?.data?.shareGranted),
  };
}

/** Canjea enlace universal 24h (temporary_access) → share_permission. */
export async function redeemTemporaryAccessToken(params: {
  receiverUid: string;
  token: string;
  locale?: 'en' | 'es';
}): Promise<{ ownerUid: string; receiverUid: string; cardId: string; shareGranted: boolean }> {
  const auth = await getScopedJwtToken(params.receiverUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/temporary-access/redeem`,
    {
      receiverUid: params.receiverUid,
      token: params.token,
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
        ...publicApiAcceptLanguage(params.locale),
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

/** Grupos del Búnker: valores por defecto + personalizados guardados en Mongo (`bunker_groups`). */
export async function fetchBunkerGroups(viewerUid: string, locale?: 'en' | 'es'): Promise<string[]> {
  const auth = await getScopedJwtToken(viewerUid, 'qr.access');

  const response = await axios.get(`${auth.baseUrl}/api/qr/bunker/groups`, {
    headers: {
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
      ...publicApiAcceptLanguage(locale),
    },
    timeout: 15000,
    validateStatus: () => true,
  });

  if (response.status !== 200 || !response.data?.ok || !Array.isArray(response.data.groups)) {
    throw new Error(String(response?.data?.error || 'Failed to load bunker groups'));
  }

  return (response.data.groups as unknown[]).map((g) => String(g || '').trim()).filter(Boolean);
}

/** Registra uso de un grupo personalizado para que aparezca en futuras sesiones/dispositivos. */
export async function trackBunkerGroupUsage(params: {
  viewerUid: string;
  groupName: string;
  locale?: 'en' | 'es';
}): Promise<void> {
  const auth = await getScopedJwtToken(params.viewerUid, 'qr.access');
  const groupName = String(params.groupName || '').trim().slice(0, 60);
  if (!groupName) {
    return;
  }

  await axios.post(
    `${auth.baseUrl}/api/qr/bunker/groups/track`,
    { groupName },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
        ...publicApiAcceptLanguage(params.locale),
      },
      timeout: 15000,
      validateStatus: () => true,
    },
  );
}

export type CardSubscriberRow = {
  uid: string;
  name: string;
  fullName: string;
  /** @handle desde Mongo (`nickname` / `nicknameLower`); sin inventar desde el nombre. */
  username: string;
  nickname: string;
  photoUrl: string | null;
  ownerOccupation: string | null;
  isAmixes: boolean;
  userRating: number;
  mutualCount: number;
  mutualPreviewPhotos: string[];
  muted: boolean;
  addedAt: string | null;
};

export async function listCardSubscribers(params: { ownerUid: string; cardId: string }): Promise<{
  count: number;
  subscribers: CardSubscriberRow[];
}> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.get(`${auth.baseUrl}/api/qr/cards/${encodeURIComponent(params.cardId)}/subscribers`, {
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
    subscribers: rows.map((row: any) => {
      const fullName = String(row?.fullName || row?.name || '').trim();
      const username = String(row?.username ?? row?.nickname ?? '')
        .trim()
        .replace(/^@+/g, '');
      return {
      uid: String(row?.uid || ''),
      name: fullName,
      fullName,
      username,
      nickname: username,
      photoUrl: row?.photoUrl ? String(row.photoUrl) : null,
      ownerOccupation: row?.ownerOccupation ? String(row.ownerOccupation).trim() : null,
      isAmixes: Boolean(row?.isAmixes),
      userRating: Number.isFinite(Number(row?.userRating)) ? Number(row.userRating) : 0,
      mutualCount: Number.isFinite(Number(row?.mutualCount)) ? Math.max(0, Math.floor(Number(row.mutualCount))) : 0,
      mutualPreviewPhotos: Array.isArray(row?.mutualPreviewPhotos)
        ? row.mutualPreviewPhotos.map((u: unknown) => String(u || '').trim()).filter(Boolean)
        : [],
      muted: Boolean(row?.muted),
      addedAt: row?.addedAt ? String(row.addedAt) : null,
    };
    }),
  };
}

export async function revokeCardSubscriber(params: { ownerUid: string; cardId: string; targetUid: string }): Promise<{ deletedCount: number }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.delete(
    `${auth.baseUrl}/api/qr/cards/${encodeURIComponent(params.cardId)}/subscribers/${encodeURIComponent(params.targetUid)}`,
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

export async function setCardSubscriberMute(params: {
  ownerUid: string;
  cardId: string;
  targetUid: string;
  muted: boolean;
}): Promise<{ muted: boolean }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/cards/${encodeURIComponent(params.cardId)}/subscribers/${encodeURIComponent(params.targetUid)}/mute`,
    {
      ownerUid: params.ownerUid,
      muted: params.muted,
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
    muted: response?.data?.muted === true,
  };
}

/** El receptor silencia (o reactiva) el canal de historias de una tarjeta recibida; requiere `cardId`. */
export async function setSubscriberSelfCardMute(params: {
  viewerUid: string;
  issuerUid: string;
  cardId: string;
  muted: boolean;
}): Promise<{ muted: boolean }> {
  const auth = await getScopedJwtToken(params.viewerUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/cards/${encodeURIComponent(params.cardId)}/subscribers/${encodeURIComponent(params.viewerUid)}/mute`,
    {
      ownerUid: params.issuerUid,
      muted: params.muted,
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
    muted: response?.data?.muted === true,
  };
}

export async function setCardSilenced(params: {
  ownerUid: string;
  cardId: string;
  silenced: boolean;
}): Promise<{ silenced: boolean }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/cards/${encodeURIComponent(params.cardId)}/silence`,
    {
      ownerUid: params.ownerUid,
      silenced: params.silenced,
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
    silenced: response?.data?.silenced === true,
  };
}

export async function blockRelationship(params: { ownerUid: string; targetUid: string }): Promise<{ deletedLinks: number }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/relationships/block`,
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

export async function removeRelationship(params: {
  ownerUid: string;
  targetUid: string;
  /** Si se envía, solo se elimina el permiso de esa tarjeta (mismo emisor puede tener otras). */
  cardId?: string | null;
}): Promise<{ deletedLinks: number }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const cardId = params.cardId != null && String(params.cardId).trim() ? String(params.cardId).trim() : '';

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/relationships/remove`,
    {
      ownerUid: params.ownerUid,
      targetUid: params.targetUid,
      ...(cardId ? { cardId } : {}),
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

  const response = await axios.get(`${auth.baseUrl}/api/qr/relationships/blocked`, {
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
    `${auth.baseUrl}/api/qr/relationships/blocked/${encodeURIComponent(params.targetUid)}`,
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

export type CardSearchFacetPayload = {
  type: string;
  label: string;
  value: string;
};

export type PublicCardSlotPayload = {
  itemId: string;
  type?: string;
  label?: string;
  value?: string;
  iconName?: string;
  icon?: string;
  isPrivate?: boolean;
  visibility?: string;
  /** MIME para visor (proxy /api/vault/file/… sin extensión). */
  vaultMimeType?: string;
};

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
  totalRatings?: number;
  ownerDisplayName?: string;
  ownerNickname?: string;
  ownerPhotoUrl?: string | null;
  /** Cargo / título profesional persistido en la tarjeta (receptor). */
  ownerOccupation?: string | null;
  /** 'business' para BusinessCard sincronizada desde Firestore; 'smart' para tarjeta personal. */
  cardType?: 'business' | 'smart';
  /** Facetas sin tipo teléfono, para búsqueda del receptor en Contactos */
  searchFacets?: CardSearchFacetPayload[];
  /**
   * Slots seguros para vista web pública (QR universal). No enviar el vault completo.
   * El backend filtra `isPrivate` / `visibility: private`.
   */
  publicCardSlots?: PublicCardSlotPayload[];
};

export async function listSmartCardsFromDb(params: { ownerUid: string }): Promise<{
  cards: Array<SmartCardPayload & { createdAt: string; updatedAt: string }>;
}> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.get(`${auth.baseUrl}/api/qr/cards`, {
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
      totalRatings: Number(row?.totalRatings ?? 0),
      ownerDisplayName: row?.ownerDisplayName ? String(row.ownerDisplayName) : undefined,
      ownerNickname: row?.ownerNickname ? String(row.ownerNickname) : undefined,
      ownerPhotoUrl: row?.ownerPhotoUrl ? String(row.ownerPhotoUrl) : null,
      ownerOccupation: row?.ownerOccupation != null ? String(row.ownerOccupation) : undefined,
      cardType: row?.cardType === 'business' ? 'business' : 'smart',
      searchFacets: Array.isArray(row?.searchFacets)
        ? row.searchFacets.map((f: any) => ({
            type: String(f?.type || ''),
            label: String(f?.label || ''),
            value: String(f?.value || ''),
          }))
        : undefined,
      publicCardSlots: Array.isArray(row?.publicCardSlots)
        ? row.publicCardSlots.map((s: any) => {
            const iconRaw = s?.icon != null ? String(s.icon).trim() : '';
            const icon = /^https?:\/\//i.test(iconRaw) ? iconRaw : undefined;
            const iconName = s?.iconName != null ? String(s.iconName).trim() : '';
            return {
              itemId: String(s?.itemId || ''),
              type: String(s?.type || 'link'),
              label: String(s?.label || ''),
              value: String(s?.value || ''),
              ...(icon ? { icon } : {}),
              ...(iconName ? { iconName } : {}),
              isPrivate: Boolean(s?.isPrivate),
              visibility: s?.visibility != null ? String(s.visibility) : undefined,
            };
          })
        : undefined,
      createdAt: String(row?.createdAt || new Date().toISOString()),
      updatedAt: String(row?.updatedAt || new Date().toISOString()),
    })),
  };
}

export async function upsertSmartCardInDb(params: { ownerUid: string; card: SmartCardPayload }): Promise<{ ok: boolean }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  await axios.put(
    `${auth.baseUrl}/api/qr/cards/${encodeURIComponent(params.card.cardId)}`,
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

  const response = await axios.delete(`${auth.baseUrl}/api/qr/cards/${encodeURIComponent(params.cardId)}`, {
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

export type ReceivedContactRow = {
  uid: string;
  cardId: string | null;
  name: string;
  nickname: string;
  photoUrl: string | null;
  ownerOccupation?: string | null;
  ratingAvg: number;
  cardName: string;
  holdersCount: number;
  addedAt: string | null;
  storyState: 'none' | 'normal' | 'vip';
  searchFacets: CardSearchFacetPayload[];
  mutualContactsCount: number;
  totalRatings: number;
  channelMuted: boolean;
  themeId: string;
  layout: 'vertical' | 'horizontal';
  fontId: string | null;
  fontName: string | null;
  fontFamily: string | null;
  fontTier: 'free' | 'premium' | null;
  wallpaperId: string | null;
  wallpaperUrl: string | null;
  wallpaperThumbUrl: string | null;
  wallpaperTier: 'free' | 'premium' | null;
  wallpaperPriceCredits: number;
  enableParallax: boolean;
  itemIds: string[];
  cardUpdatedAt: string | null;
  /** Slots públicos (logos/URLs + iconName) para preview espejo del receptor. */
  publicCardSlots?: PublicCardSlotPayload[];
  /** 'business' para BusinessCard corporativa; 'smart' para tarjeta personal. */
  cardType?: 'business' | 'smart';
};

export async function listReceivedContacts(params: { ownerUid: string }): Promise<{
  contacts: ReceivedContactRow[];
}> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  try {
    const response = await axios.get(`${auth.baseUrl}/api/qr/contacts/received`, {
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
      contacts: rows.map((row: any) => {
        const facetRows = Array.isArray(row?.searchFacets) ? row.searchFacets : [];
        const totalRatings = Number.isFinite(Number(row?.totalRatings))
          ? Math.max(0, Math.floor(Number(row.totalRatings)))
          : 0;
        const ratingAvgRaw = Number(row?.ratingAvg);
        const ratingAvg =
          totalRatings > 0 && Number.isFinite(ratingAvgRaw) ? ratingAvgRaw : 0;
        const slotRows = Array.isArray(row?.publicCardSlots) ? row.publicCardSlots : [];
        return {
          uid: String(row?.uid || ''),
          cardId: row?.cardId != null && String(row.cardId).trim() ? String(row.cardId).trim() : null,
          name: String(row?.name || 'Contacto'),
          nickname: String(row?.nickname || 'user'),
          photoUrl: row?.photoUrl ? String(row.photoUrl) : null,
          ownerOccupation: row?.ownerOccupation != null && String(row.ownerOccupation).trim() ? String(row.ownerOccupation).trim() : null,
          ratingAvg,
          cardName: String(row?.cardName || 'Tarjeta Social'),
          holdersCount: Number(row?.holdersCount || 0),
          addedAt: row?.addedAt ? String(row.addedAt) : null,
          storyState: row?.storyState === 'vip' ? 'vip' : row?.storyState === 'normal' ? 'normal' : 'none',
          searchFacets: facetRows.map((f: any) => ({
            type: String(f?.type || ''),
            label: String(f?.label || ''),
            value: String(f?.value || ''),
          })),
          publicCardSlots: slotRows.map((s: any) => {
            const iconRaw = s?.icon != null ? String(s.icon).trim() : '';
            const icon = /^https?:\/\//i.test(iconRaw) ? iconRaw : undefined;
            const iconName = s?.iconName != null ? String(s.iconName).trim() : '';
            return {
              itemId: String(s?.itemId || ''),
              type: String(s?.type || 'link'),
              label: String(s?.label || ''),
              value: String(s?.value || ''),
              ...(icon ? { icon } : {}),
              ...(iconName ? { iconName } : {}),
            };
          }),
          mutualContactsCount: Number.isFinite(Number(row?.mutualContactsCount))
            ? Math.max(0, Math.floor(Number(row.mutualContactsCount)))
            : 0,
          totalRatings,
          channelMuted: Boolean(row?.channelMuted),
          themeId: String(row?.themeId || 'deep_teal').trim() || 'deep_teal',
          layout: String(row?.layout || 'vertical') === 'horizontal' ? 'horizontal' : 'vertical',
          fontId: row?.fontId ? String(row.fontId) : null,
          fontName: row?.fontName ? String(row.fontName) : null,
          fontFamily: row?.fontFamily ? String(row.fontFamily) : null,
          fontTier: String(row?.fontTier || '') === 'premium' ? 'premium' : String(row?.fontTier || '') === 'free' ? 'free' : null,
          wallpaperId: row?.wallpaperId ? String(row.wallpaperId) : null,
          wallpaperUrl: row?.wallpaperUrl ? String(row.wallpaperUrl) : null,
          wallpaperThumbUrl: row?.wallpaperThumbUrl ? String(row.wallpaperThumbUrl) : null,
          wallpaperTier: String(row?.wallpaperTier || '') === 'premium' ? 'premium' : String(row?.wallpaperTier || '') === 'free' ? 'free' : null,
          wallpaperPriceCredits: Number(row?.wallpaperPriceCredits || 0),
          enableParallax: Boolean(row?.enableParallax),
          itemIds: Array.isArray(row?.itemIds) ? row.itemIds.map((id: any) => String(id)) : [],
          cardUpdatedAt: row?.cardUpdatedAt ? String(row.cardUpdatedAt) : null,
          cardType: row?.cardType === 'business' ? 'business' as const : 'smart' as const,
        };
      }),
    };
  } catch (error: any) {
    const status = Number(error?.response?.status || 0);
    if (status === 404) {
      return { contacts: [] };
    }
    throw error;
  }
}

export async function setMyStoryState(params: {
  ownerUid: string;
  state: 'none' | 'normal' | 'vip';
  cardId?: string;
  isPaidExternal?: boolean;
  vipSource?: 'manual' | 'subscription' | 'external_partner';
  paidChannel?: string;
  manualReason?: string;
}): Promise<{
  state: 'none' | 'normal' | 'vip';
  expiresAt: string | null;
  cardId?: string;
  isPaidExternal?: boolean;
  vipSource?: 'manual' | 'subscription' | 'external_partner' | null;
  paidChannel?: string | null;
}> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/stories/state`,
    {
      ownerUid: params.ownerUid,
      state: params.state,
      cardId: params.cardId,
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
    cardId: response?.data?.cardId ? String(response.data.cardId) : undefined,
    isPaidExternal: response?.data?.isPaidExternal === true,
    vipSource: response?.data?.vipSource ? String(response.data.vipSource) as 'manual' | 'subscription' | 'external_partner' : null,
    paidChannel: response?.data?.paidChannel ? String(response.data.paidChannel) : null,
  };
}

export async function getMyStoryState(params: {
  ownerUid: string;
  cardId?: string;
}): Promise<{
  state: 'none' | 'normal' | 'vip';
  expiresAt: string | null;
  cardId?: string;
  isPaidExternal?: boolean;
  vipSource?: 'manual' | 'subscription' | 'external_partner' | null;
  paidChannel?: string | null;
}> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.get(`${auth.baseUrl}/api/qr/stories/state`, {
    params: {
      ownerUid: params.ownerUid,
      ...(params.cardId ? { cardId: params.cardId } : {}),
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
    cardId: response?.data?.cardId ? String(response.data.cardId) : undefined,
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
    `${auth.baseUrl}/api/qr/stories/vip/manual`,
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

  const response = await axios.get(`${auth.baseUrl}/api/qr/stories/ads/house`, {
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
    `${auth.baseUrl}/api/qr/stories/ads/house`,
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
  callType: 'audio' | 'video';
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

  const response = await axios.get(`${auth.baseUrl}/api/qr/calls/history`, {
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
      callType: row?.callType === 'video' ? 'video' : 'audio' as const,
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
  callType?: 'audio' | 'video';
}): Promise<{ callId: string }> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/calls/logs`,
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
      callType: params.callType || 'audio',
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
    `${auth.baseUrl}/api/qr/calls/logs/${encodeURIComponent(params.callId)}`,
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

export type CardAnalyticsSummary = {
  cardId: string;
  totalViews: number;
  topIcons: Array<{ iconType: string; count: number }>;
};

export async function trackCardAnalyticsEvent(params: {
  ownerUid: string;
  cardId: string;
  iconType: string;
  source: 'search' | 'story' | 'card' | 'qr_scan';
}): Promise<void> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');
  await axios.post(
    `${auth.baseUrl}/api/qr/analytics/track`,
    {
      cardId: params.cardId,
      iconType: params.iconType,
      source: params.source,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 12000,
    }
  );
}

export async function getCardAnalyticsSummary(params: {
  ownerUid: string;
  cardId: string;
}): Promise<CardAnalyticsSummary> {
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');

  const response = await axios.get(
    `${auth.baseUrl}/api/qr/analytics/card/${encodeURIComponent(params.cardId)}/summary`,
    {
      params: { ownerUid: params.ownerUid },
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    }
  );

  const top = Array.isArray(response?.data?.topIcons) ? response.data.topIcons : [];
  return {
    cardId: String(response?.data?.cardId || params.cardId),
    totalViews: Number(response?.data?.totalViews || 0) || 0,
    topIcons: top.map((row: any) => ({
      iconType: String(row?.iconType || ''),
      count: Number(row?.count || 0) || 0,
    })),
  };
}

/**
 * Obtiene holdersCount real (desde share_permissions) para un conjunto de business cards.
 * Retorna mapa { cardId: holdersCount }.
 */
export async function fetchBusinessCardHolderCounts(params: {
  ownerUid: string;
  cardIds: string[];
}): Promise<Record<string, number>> {
  if (!params.ownerUid || !params.cardIds.length) return {};
  const auth = await getScopedJwtToken(params.ownerUid, 'qr.access');
  const response = await axios.get(`${auth.baseUrl}/api/qr/business-holders`, {
    params: { ownerUid: params.ownerUid, cardIds: params.cardIds.join(',') },
    headers: {
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
    },
    timeout: 12000,
  });
  const counts = response?.data?.counts;
  if (!counts || typeof counts !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [cid, n] of Object.entries(counts)) {
    result[cid] = Number(n || 0);
  }
  return result;
}
