import axios from 'axios';
import { Platform } from 'react-native';

import { logBackendNetworkDebug } from '@/services/backendAuth';
import { resolveExpoPublicApiBaseUrl } from '@/services/expoPublicApiBaseUrl';
import { rewriteLoopbackSmartCardUniversalUrl } from '@/services/brandedQrService';
import { fromWireCallDisplayCard, type CallDisplayCard } from './callDisplayCard';
import { toAcceptLanguageHeader, type AppLanguage } from './language';

/** Base URL del backend QR (misma que usa axios). Exportada para resolver URLs de medios (vault) en el device. */
export function getApiBaseUrl(): string {
  return resolveExpoPublicApiBaseUrl();
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
    logBackendNetworkDebug('mapQrNetworkError', error, baseUrl);
    const androidHttpHint =
      Platform.OS === 'android' && /^http:\/\//i.test(baseUrl)
        ? ' En Android con HTTP en la LAN hace falta `android.usesCleartextTraffic: true` en app.json y volver a generar el dev client.'
        : '';
    return new Error(
      `No se pudo conectar con el backend QR (${baseUrl}). Verifica IP/puerto, misma red Wi-Fi y que el backend esté en marcha.${androidHttpHint}`,
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

async function getScopedJwtToken(uid: string, scope: 'moderation.upload' | 'qr.access') {
  const baseUrl = getApiBaseUrl();
  const gatewayKey = getGatewayKey();

  let response: any;
  try {
    response = await axios.post(
      `${baseUrl}/api/auth/token`,
      { uid, scope },
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

export async function issueDynamicQrToken(params: { uid: string; sid: string }): Promise<{ token: string; ttlSec: number; expiresAt: string }> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/issue`,
    {
      uid: params.uid,
      sid: params.sid,
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
  uid: string;
  sid?: string;
  bId?: string;
}): Promise<{ token: string; universalUrl: string; ttlSec: number; expiresAt: string; source: string }> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/temporary-access/issue`,
    {
      uid: params.uid,
      ...(params.sid ? { sid: params.sid } : {}),
      ...(params.bId ? { bId: params.bId } : {}),
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
    universalUrl: rewriteLoopbackSmartCardUniversalUrl(String(response?.data?.universalUrl || '')),
    ttlSec: Number(response?.data?.ttlSec || 86400),
    expiresAt: String(response?.data?.expiresAt || ''),
    source: String(response?.data?.source || 'qr_scan'),
  };
}

/**
 * Slots públicos (Mongo/API). `icon` puede ser favicon HTTPS **o** nombre de glifo Material
 * (ej. `linkedin`): el wireframe usa `materialIconResolveShared` igual que Mis Tarjetas.
 * Si solo se preservan URLs HTTPS, los glifos desaparecen en contactos / QR / universal.
 */
export type PublicCardSlotPayload = {
  itemId: string;
  type?: string;
  label?: string;
  value?: string;
  iconName?: string;
  icon?: string;
  /** Stable id en Firestore icon_vault; el receptor suele resolver vía iconName/icon. */
  iconVaultId?: string;
  isPrivate?: boolean;
  visibility?: string;
  vaultMimeType?: string;
};

export function normalizePublicCardSlotFromApi(s: unknown): PublicCardSlotPayload {
  const r = s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
  const itemId = String(r.itemId ?? '').trim();
  const type = (String(r.type ?? 'link').trim() || 'link').slice(0, 64);
  const label = String(r.label ?? '').trim().slice(0, 400);
  const value = String(r.value ?? '').trim().slice(0, 8000);
  const iconRaw = r.icon != null ? String(r.icon).trim() : '';
  const iconName = r.iconName != null ? String(r.iconName).trim() : '';
  const vaultMimeType = r.vaultMimeType != null ? String(r.vaultMimeType).trim().slice(0, 120) : '';
  const iconVaultId = r.iconVaultId != null ? String(r.iconVaultId).trim() : '';

  const out: PublicCardSlotPayload = {
    itemId,
    type,
    label,
    value,
  };

  if (iconRaw) {
    out.icon = iconRaw.slice(0, 4000);
  }
  if (iconName) {
    out.iconName = iconName.slice(0, 200);
  }
  if (vaultMimeType) {
    out.vaultMimeType = vaultMimeType;
  }
  if (iconVaultId) {
    out.iconVaultId = iconVaultId.slice(0, 400);
  }
  if (r.isPrivate !== undefined) {
    out.isPrivate = Boolean(r.isPrivate);
  }
  if (r.visibility != null && String(r.visibility).trim()) {
    out.visibility = String(r.visibility).trim();
  }
  return out;
}

export function normalizePublicCardSlotsFromApi(arr: unknown): PublicCardSlotPayload[] {
  if (!Array.isArray(arr)) {
    return [];
  }
  return arr.map(normalizePublicCardSlotFromApi);
}

export type PublicUniversalCardSlot = PublicCardSlotPayload;

export type PublicUniversalCardPayload = {
  uid: string;
  sid: string | null;
  bId: string | null;
  scName: string;
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
  /** Foto en documento `smart_cards` (wireframe; en business a menudo logo). */
  ownerPhotoUrl: string | null;
  ownerOccupation: string | null;
  /** Persona real (Mongo); añadido en API pública 2026 — opcional por caché viejo. */
  userFullName?: string | null;
  userNickName?: string | null;
  userAvatarUrl?: string | null;
  searchFacets: Array<{ type: string; label: string; value: string }>;
  /** Retirado del producto; opcional por respuestas cacheadas. */
  holdersCount?: number;
  ratingAvg?: number;
  totalRatings?: number;
  /** Opcional — campo legacy que aún puede llegar en el JSON público (no relacionado con el log VOIP). */
  storyState?: 'none' | 'normal' | 'vip';
  slots: PublicUniversalCardSlot[];
  expiresAt: string;
  /** Emisor con Legacy ≥ Silver (API pública / Firestore `users.legacyTier`). */
  legacyOfficialPartner?: boolean;
};

/**
 * Fase D — API pública puede mandar solo espejos Mongo (`ownerDisplayName` / `ownerNickname`)
 * o también persona (`userFullName` / `userNickName` / `userAvatarUrl`). Unifica en cliente
 * para que downstream no duplique fallbacks. **No** usa `ownerPhotoUrl` como avatar de persona.
 */
export function normalizePublicUniversalCardPayload(card: PublicUniversalCardPayload): PublicUniversalCardPayload {
  const userFullName =
    String(card.userFullName ?? '').trim() ||
    String(card.ownerDisplayName ?? '').trim() ||
    null;
  const userNickName =
    String(card.userNickName ?? '').trim() ||
    String(card.ownerNickname ?? '').trim() ||
    null;
  const userAvatarUrl = String(card.userAvatarUrl ?? '').trim() || null;
  const legacyOfficialPartner = card.legacyOfficialPartner === true;
  const slots = normalizePublicCardSlotsFromApi(card.slots as unknown);
  return {
    ...card,
    slots,
    holdersCount: Math.max(0, Math.floor(Number(card.holdersCount ?? 0))),
    ratingAvg: Number.isFinite(Number(card.ratingAvg)) ? Number(card.ratingAvg) : 0,
    totalRatings: Math.max(0, Math.floor(Number(card.totalRatings ?? 0))),
    userFullName,
    userNickName,
    userAvatarUrl,
    ...(legacyOfficialPartner ? { legacyOfficialPartner: true } : {}),
  };
}

function publicApiAcceptLanguage(locale?: AppLanguage): { 'Accept-Language': string } {
  return toAcceptLanguageHeader(locale ?? 'en');
}

/** Sin JWT: el token opaco es el secreto. Usar en Expo Web para `/u/[token]`. */
export async function fetchPublicUniversalCardByToken(params: {
  token: string;
  source?: string;
  /** Alinea mensajes JSON con el idioma de la app (header Accept-Language). */
  locale?: AppLanguage;
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

  const raw = response.data.card as PublicUniversalCardPayload;
  return {
    ok: true,
    card: normalizePublicUniversalCardPayload(raw),
    source: response.data.source != null ? String(response.data.source) : null,
  };
}

export type PublicQrTokenPreview = {
  uid: string;
  sid: string | null;
  bId: string | null;
  token: string;
  expiresAt: string;
  ownerDisplayName: string;
  cardName: string;
  ownerNickname: string | null;
  ownerPhotoUrl: string | null;
  ownerOccupation: string | null;
  /**
   * Identidad REAL del dueño (issuer) — distinta del negocio en Business Cards.
   * `ownerPhotoUrl` puede ser el `bcLogoUrl` (logo del comercio); estos campos
   * son la persona: su `userAvatarUrl`, `userFullName`, `userNickName`. El
   * receptor los usa para listar al dueño como contacto personal y para
   * pintar el avatar real en Ghost-Link VoIP cuando reciba/haga una llamada.
   */
  userFullName: string | null;
  userNickName: string | null;
  userAvatarUrl: string | null;
  /** Tema Chest / smart_cards (vista previa fiel al emisor). */
  themeId: string;
  layout: 'vertical' | 'horizontal';
  wallpaperUrl?: string;
  enableParallax: boolean;
  holdersCount: number;
  /** Producto: sin estrellas; opcional por respuestas antiguas. */
  ratingAvg?: number;
  totalRatings?: number;
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
    uid: String(d.uid || ''),
    sid: d.sid != null && String(d.sid).trim() ? String(d.sid) : null,
    bId: d.bId != null && String(d.bId).trim() ? String(d.bId) : null,
    token: String(d.token != null && d.token !== '' ? d.token : tokenFallback),
    expiresAt: String(d.expiresAt || ''),
    ownerDisplayName: String(d.ownerDisplayName || ''),
    cardName: String(d.cardName || ''),
    ownerNickname: d.ownerNickname != null ? String(d.ownerNickname) : null,
    ownerPhotoUrl: d.ownerPhotoUrl != null ? String(d.ownerPhotoUrl) : null,
    ownerOccupation: d.ownerOccupation != null ? String(d.ownerOccupation) : null,
    userFullName: d.userFullName != null ? String(d.userFullName) : null,
    userNickName: d.userNickName != null ? String(d.userNickName) : null,
    userAvatarUrl: d.userAvatarUrl != null ? String(d.userAvatarUrl) : null,
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

/** Misma idea que `normalizePublicUniversalCardPayload`: persona canónica sin depender de duplicar lógica en cada pantalla. */
export function normalizePublicQrTokenPreview(p: PublicQrTokenPreview): PublicQrTokenPreview {
  const userFullName =
    String(p.userFullName ?? '').trim() ||
    String(p.ownerDisplayName ?? '').trim() ||
    null;
  const userNickName =
    String(p.userNickName ?? '').trim() ||
    String(p.ownerNickname ?? '').trim() ||
    null;
  const userAvatarUrl = String(p.userAvatarUrl ?? '').trim() || null;
  return { ...p, userFullName, userNickName, userAvatarUrl };
}

/** Vista previa del QR dinámico sin consumir (modal de clasificación). */
export async function fetchPublicQrTokenPreview(params: {
  token: string;
  locale?: AppLanguage;
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
    preview: normalizePublicQrTokenPreview(mapPublicQrPreviewResponse(d, params.token)),
  };
}

export async function consumeDynamicQrToken(params: {
  receiverUid: string;
  token: string;
  locale?: AppLanguage;
}): Promise<{
  uid: string;
  receiverUid: string;
  sid: string | null;
  bId: string | null;
  shareGranted: boolean;
  issuerPremiumExperience: boolean;
}> {
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
    uid: String(response?.data?.uid || ''),
    receiverUid: String(response?.data?.receiverUid || ''),
    sid: response?.data?.sid != null && String(response.data.sid).trim() ? String(response.data.sid) : null,
    bId: response?.data?.bId != null && String(response.data.bId).trim() ? String(response.data.bId) : null,
    shareGranted: Boolean(response?.data?.shareGranted),
    issuerPremiumExperience: Boolean(response?.data?.issuerPremiumExperience),
  };
}

export async function fetchPublicBusinessCardPreview(params: {
  uid: string;
  bId: string;
  locale?: AppLanguage;
}): Promise<{ ok: true; preview: PublicQrTokenPreview } | { ok: false; error?: string }> {
  const baseUrl = getApiBaseUrl();
  let response;
  try {
    response = await axios.get(`${baseUrl}/api/public/business-card-preview`, {
      params: { uid: params.uid, bId: params.bId },
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
    preview: normalizePublicQrTokenPreview(mapPublicQrPreviewResponse(d, '')),
  };
}

export async function grantBusinessShareFromQr(params: {
  receiverUid: string;
  uid: string;
  bId: string;
  locale?: AppLanguage;
}): Promise<{
  uid: string;
  receiverUid: string;
  bId: string;
  shareGranted: boolean;
  issuerPremiumExperience: boolean;
}> {
  const auth = await getScopedJwtToken(params.receiverUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/grant-business-share`,
    {
      receiverUid: params.receiverUid,
      uid: params.uid,
      bId: params.bId,
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
    uid: String(response?.data?.uid || ''),
    receiverUid: String(response?.data?.receiverUid || ''),
    bId: String(response?.data?.bId || ''),
    shareGranted: Boolean(response?.data?.shareGranted),
    issuerPremiumExperience: Boolean(response?.data?.issuerPremiumExperience),
  };
}

/** Canjea enlace universal 24h (temporary_access) → share_permission. */
export async function redeemTemporaryAccessToken(params: {
  receiverUid: string;
  token: string;
  locale?: AppLanguage;
}): Promise<{
  uid: string;
  receiverUid: string;
  sid: string | null;
  bId: string | null;
  shareGranted: boolean;
  issuerPremiumExperience: boolean;
}> {
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
    uid: String(response?.data?.uid || ''),
    receiverUid: String(response?.data?.receiverUid || ''),
    sid: response?.data?.sid != null && String(response.data.sid).trim() ? String(response.data.sid) : null,
    bId: response?.data?.bId != null && String(response.data.bId).trim() ? String(response.data.bId) : null,
    shareGranted: Boolean(response?.data?.shareGranted),
    issuerPremiumExperience: Boolean(response?.data?.issuerPremiumExperience),
  };
}

/** Grupos del Búnker: valores por defecto + personalizados guardados en Mongo (`bunker_groups`). */
export async function fetchBunkerGroups(viewerUid: string, locale?: AppLanguage): Promise<string[]> {
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
  locale?: AppLanguage;
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
  /** Igual que `userFullName` (línea principal en listas). */
  name: string;
  userFullName: string;
  userNickName: string;
  userAvatarUrl: string | null;
  ownerOccupation: string | null;
  isAmixes: boolean;
  userRating: number;
  mutualCount: number;
  mutualPreviewPhotos: string[];
  muted: boolean;
  addedAt: string | null;
};

export async function listCardSubscribers(params: { uid: string; cardRef: string }): Promise<{
  count: number;
  subscribers: CardSubscriberRow[];
}> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  const response = await axios.get(`${auth.baseUrl}/api/qr/cards/${encodeURIComponent(params.cardRef)}/subscribers`, {
    params: {
      uid: params.uid,
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
      const userFullName = String(row?.userFullName ?? row?.fullName ?? row?.name ?? '').trim();
      const userNickName = String(row?.userNickName ?? row?.username ?? row?.nickname ?? '')
        .trim()
        .replace(/^@+/g, '');
      return {
      uid: String(row?.uid || ''),
      name: userFullName,
      userFullName,
      userNickName,
      userAvatarUrl:
        row?.userAvatarUrl != null && String(row.userAvatarUrl).trim()
          ? String(row.userAvatarUrl)
          : row?.photoUrl != null && String(row.photoUrl).trim()
            ? String(row.photoUrl)
            : null,
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

export async function revokeCardSubscriber(params: { uid: string; cardRef: string; targetUid: string }): Promise<{ deletedCount: number }> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  const response = await axios.delete(
    `${auth.baseUrl}/api/qr/cards/${encodeURIComponent(params.cardRef)}/subscribers/${encodeURIComponent(params.targetUid)}`,
    {
      data: {
        uid: params.uid,
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
  uid: string;
  cardRef: string;
  targetUid: string;
  muted: boolean;
}): Promise<{ muted: boolean }> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/cards/${encodeURIComponent(params.cardRef)}/subscribers/${encodeURIComponent(params.targetUid)}/mute`,
    {
      uid: params.uid,
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

/** El receptor silencia (o reactiva) el canal de historias de una tarjeta recibida. */
export async function setSubscriberSelfCardMute(params: {
  viewerUid: string;
  issuerUid: string;
  cardRef: string;
  muted: boolean;
}): Promise<{ muted: boolean }> {
  const auth = await getScopedJwtToken(params.viewerUid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/cards/${encodeURIComponent(params.cardRef)}/subscribers/${encodeURIComponent(params.viewerUid)}/mute`,
    {
      uid: params.issuerUid,
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
  uid: string;
  cardRef: string;
  silenced: boolean;
}): Promise<{ silenced: boolean }> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/cards/${encodeURIComponent(params.cardRef)}/silence`,
    {
      uid: params.uid,
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

export async function blockRelationship(params: { uid: string; targetUid: string }): Promise<{ deletedLinks: number }> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/relationships/block`,
    {
      uid: params.uid,
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
  uid: string;
  targetUid: string;
  /** Si se envía, solo se elimina el permiso de esa tarjeta (mismo emisor puede tener otras). */
  sid?: string | null;
  bId?: string | null;
}): Promise<{ deletedLinks: number }> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  const sid = params.sid != null && String(params.sid).trim() ? String(params.sid).trim() : '';
  const bId = params.bId != null && String(params.bId).trim() ? String(params.bId).trim() : '';

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/relationships/remove`,
    {
      uid: params.uid,
      targetUid: params.targetUid,
      ...(sid ? { sid } : {}),
      ...(bId ? { bId } : {}),
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

export async function listBlockedRelations(params: { uid: string }): Promise<{
  count: number;
  blockedUsers: Array<{ uid: string; name: string; userAvatarUrl: string | null; blockedByUid: string; createdAt: string | null; blockedAt: string | null }>;
}> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  const response = await axios.get(`${auth.baseUrl}/api/qr/relationships/blocked`, {
    params: {
      uid: params.uid,
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
      userAvatarUrl:
        row?.userAvatarUrl != null && String(row.userAvatarUrl).trim()
          ? String(row.userAvatarUrl)
          : row?.photoUrl != null && String(row.photoUrl).trim()
            ? String(row.photoUrl)
            : null,
      blockedByUid: String(row?.blockedByUid || ''),
      createdAt: row?.createdAt ? String(row.createdAt) : null,
      blockedAt: row?.blockedAt ? String(row.blockedAt) : null,
    })),
  };
}

export async function unblockRelationship(params: { uid: string; targetUid: string }): Promise<{ unblocked: boolean }> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  const response = await axios.delete(
    `${auth.baseUrl}/api/qr/relationships/blocked/${encodeURIComponent(params.targetUid)}`,
    {
      data: {
        uid: params.uid,
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

/** Whitelist segura dentro de `issuerSnapshot` (Mongo `smart_cards`). */
export type IssuerVaultPickedItem = {
  itemId: string;
  type: string;
  title: string;
  icon?: string;
  publicValue?: string;
};

/** Snapshot denormalizado del emisor en la tarjeta (Phase 1). */
export type IssuerSnapshotPayload = {
  uid: string;
  userFullName: string;
  userNickName: string;
  userAvatarUrl: string | null;
  userVaultPicked: IssuerVaultPickedItem[];
  snapshotVersion: number;
  snapshotAt: string;
  /** Extensiones opcionales (p. ej. historial de llamadas denormalizado). */
  bcLogoUrl?: string | null;
  bcName?: string;
  /** Línea de contacto en negocio (opcional en snapshot extendido). */
  bcContactName?: string | null;
  scName?: string;
};

export type SmartCardPayload = {
  /** Tarjeta personal en Mongo. */
  sid?: string;
  /** Espejo business en Mongo: id de tarjeta de negocio (Firestore doc id). */
  bId?: string;
  scName: string;
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
  /**
   * Snapshot del emisor (opcional en cliente; el API `PUT /cards` lo recalcula desde Mongo + slots).
   * Útil para caché local / depuración.
   */
  issuerSnapshot?: IssuerSnapshotPayload;
};

export async function listSmartCardsFromDb(params: { uid: string }): Promise<{
  cards: Array<SmartCardPayload & { createdAt: string; updatedAt: string }>;
}> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  const response = await axios.get(`${auth.baseUrl}/api/qr/cards`, {
    params: {
      uid: params.uid,
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
      scName: String(row?.scName ?? 'Smart Card'),
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
      bId: row?.cardType === 'business' ? String(row?.bId ?? '') : undefined,
      sid: row?.cardType === 'business' ? undefined : String(row?.sid ?? ''),
      searchFacets: Array.isArray(row?.searchFacets)
        ? row.searchFacets.map((f: any) => ({
            type: String(f?.type || ''),
            label: String(f?.label || ''),
            value: String(f?.value || ''),
          }))
        : undefined,
      publicCardSlots: Array.isArray(row?.publicCardSlots)
        ? row.publicCardSlots.map((s: unknown) => normalizePublicCardSlotFromApi(s))
        : undefined,
      issuerSnapshot: parseIssuerSnapshotFromApi(row?.issuerSnapshot),
      createdAt: String(row?.createdAt || new Date().toISOString()),
      updatedAt: String(row?.updatedAt || new Date().toISOString()),
    })),
  };
}

function parseIssuerSnapshotFromApi(raw: unknown): IssuerSnapshotPayload | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const uid = String(o.uid || '').trim();
  if (!uid) return undefined;
  const pickedRaw = Array.isArray(o.userVaultPicked) ? o.userVaultPicked : [];
  const userVaultPicked: IssuerVaultPickedItem[] = pickedRaw
    .map((p: any) => {
      const itemId = String(p?.itemId || '').trim();
      if (!itemId) return null;
      const type = String(p?.type || 'link').trim();
      const title = String(p?.title || '').trim();
      const icon = p?.icon != null && String(p.icon).trim() ? String(p.icon).trim() : undefined;
      const publicValue =
        p?.publicValue != null && String(p.publicValue).trim() ? String(p.publicValue).trim() : undefined;
      const it: IssuerVaultPickedItem = { itemId, type, title };
      if (icon) it.icon = icon;
      if (publicValue) it.publicValue = publicValue;
      return it;
    })
    .filter(Boolean) as IssuerVaultPickedItem[];
  const bcLogoRaw = o.bcLogoUrl;
  const bcLogoUrl =
    bcLogoRaw != null && String(bcLogoRaw).trim() ? String(bcLogoRaw).trim() : undefined;
  const bcName = o.bcName != null && String(o.bcName).trim() ? String(o.bcName).trim() : undefined;
  const bcContactNameRaw = o.bcContactName;
  const bcContactName =
    bcContactNameRaw != null && String(bcContactNameRaw).trim()
      ? String(bcContactNameRaw).trim()
      : undefined;
  const scName = o.scName != null && String(o.scName).trim() ? String(o.scName).trim() : undefined;
  return {
    uid,
    userFullName: String(o.userFullName || '').trim(),
    userNickName: String(o.userNickName || '').trim(),
    userAvatarUrl: o.userAvatarUrl != null && String(o.userAvatarUrl).trim() ? String(o.userAvatarUrl).trim() : null,
    userVaultPicked,
    snapshotVersion: Number.isFinite(Number(o.snapshotVersion)) ? Number(o.snapshotVersion) : 1,
    snapshotAt: String(o.snapshotAt || new Date().toISOString()),
    ...(bcLogoUrl !== undefined ? { bcLogoUrl } : {}),
    ...(bcName !== undefined ? { bcName } : {}),
    ...(bcContactName !== undefined ? { bcContactName } : {}),
    ...(scName !== undefined ? { scName } : {}),
  };
}

export async function upsertSmartCardInDb(params: { uid: string; card: SmartCardPayload }): Promise<{ ok: boolean }> {
  const cardRef = String(params.card.sid || params.card.bId || '').trim();
  if (!cardRef) {
    throw new Error('SmartCardPayload requires sid or bId');
  }
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  await axios.put(
    `${auth.baseUrl}/api/qr/cards/${encodeURIComponent(cardRef)}`,
    {
      uid: params.uid,
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

/**
 * Escribe `userAvatarUrl` en Mongo (`users` + `profiles`) y refresca `issuerSnapshot`
 * en las smart cards del dueño. Firestore ya se actualiza en la app; sin esto, receptores
 * y listas que leen solo Mongo no ven el avatar.
 */
export async function syncProfileAvatarUrlToMongo(params: {
  uid: string;
  userAvatarUrl: string;
}): Promise<{ ok: boolean }> {
  const uid = String(params.uid || '').trim();
  const userAvatarUrl = String(params.userAvatarUrl || '').trim();
  if (!uid) {
    throw new Error('syncProfileAvatarUrlToMongo: uid is required');
  }
  if (!userAvatarUrl) {
    throw new Error('syncProfileAvatarUrlToMongo: userAvatarUrl is required');
  }
  const auth = await getScopedJwtToken(uid, 'qr.access');
  await axios.put(
    `${auth.baseUrl}/api/qr/users/${encodeURIComponent(uid)}/profile-avatar`,
    { userAvatarUrl },
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

export async function deleteSmartCardInDb(params: { uid: string; cardRef: string }): Promise<{ deleted: boolean }> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  const response = await axios.delete(`${auth.baseUrl}/api/qr/cards/${encodeURIComponent(params.cardRef)}`, {
    data: {
      uid: params.uid,
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
  sid: string | null;
  bId: string | null;
  userFullName: string;
  userNickName: string;
  userAvatarUrl: string | null;
  ownerOccupation?: string | null;
  /** Nombre comercial canónico (`business_cards.bcName`); solo business — alineado con emisor / Mis Tarjetas. */
  bcName?: string | null;
  /** Nombre de contacto en tarjeta negocio (`business_cards`); solo business. */
  bcContactName?: string | null;
  /** Logo de marca (`business_cards.bcLogoUrl`); solo business — no usar `userAvatarUrl` del perfil. */
  bcLogoUrl?: string | null;
  /** Espejo Mongo: logo en doc smart (solo smart / QR legacy). Business: usar `bcLogoUrl`. */
  ownerPhotoUrl?: string | null;
  ratingAvg: number;
  cardName: string;
  holdersCount: number;
  addedAt: string | null;
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

export async function listReceivedContacts(params: { uid: string }): Promise<{
  contacts: ReceivedContactRow[];
}> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  try {
    const response = await axios.get(`${auth.baseUrl}/api/qr/contacts/received`, {
      params: {
        uid: params.uid,
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
        const cardTypeRow = row?.cardType === 'business' ? ('business' as const) : ('smart' as const);
        const isBizRow = cardTypeRow === 'business';
        const userFullName = isBizRow
          ? ''
          : String(row?.userFullName ?? row?.name ?? 'Contacto').trim();
        const userNickName = isBizRow
          ? ''
          : String(row?.userNickName ?? row?.nickname ?? 'user')
              .trim()
              .replace(/^@+/g, '');
        const userAvatarUrl = isBizRow
          ? null
          : row?.userAvatarUrl != null && String(row.userAvatarUrl).trim()
            ? String(row.userAvatarUrl)
            : row?.photoUrl != null && String(row.photoUrl).trim()
              ? String(row.photoUrl)
              : null;
        return {
          uid: String(row?.uid || ''),
          sid: row?.sid != null && String(row.sid).trim() ? String(row.sid).trim() : null,
          bId: row?.bId != null && String(row.bId).trim() ? String(row.bId).trim() : null,
          userFullName,
          userNickName: isBizRow ? '' : userNickName || 'user',
          userAvatarUrl,
          ownerOccupation:
            isBizRow
              ? null
              : row?.ownerOccupation != null && String(row.ownerOccupation).trim()
                ? String(row.ownerOccupation).trim()
                : null,
          bcName:
            isBizRow && row?.bcName != null && String(row.bcName).trim()
              ? String(row.bcName).trim()
              : null,
          bcContactName:
            row?.bcContactName != null && String(row.bcContactName).trim()
              ? String(row.bcContactName).trim()
              : null,
          bcLogoUrl:
            row?.bcLogoUrl != null && String(row.bcLogoUrl).trim() ? String(row.bcLogoUrl).trim() : null,
          ownerPhotoUrl:
            isBizRow
              ? null
              : row?.ownerPhotoUrl != null && String(row.ownerPhotoUrl).trim()
                ? String(row.ownerPhotoUrl).trim()
                : null,
          ratingAvg,
          cardName: String(row?.cardName || 'Tarjeta Social'),
          holdersCount: Number(row?.holdersCount || 0),
          addedAt: row?.addedAt ? String(row.addedAt) : null,
          searchFacets: facetRows.map((f: any) => ({
            type: String(f?.type || ''),
            label: String(f?.label || ''),
            value: String(f?.value || ''),
          })),
          publicCardSlots: normalizePublicCardSlotsFromApi(slotRows),
          mutualContactsCount: Number.isFinite(Number(row?.mutualContactsCount))
            ? Math.max(0, Math.floor(Number(row.mutualContactsCount)))
            : 0,
          totalRatings,
          channelMuted: Boolean(row?.channelMuted),
          themeId: String(row?.themeId || 'obsidian').trim() || 'obsidian',
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
          cardType: cardTypeRow,
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

/** Presencia/indicador de fila en el log VOIP (`calls/history`). El JSON legacy usa `storyState`. */
export type VoipCallHistoryPresence = 'none' | 'normal' | 'vip';

export type CallHistoryRow = {
  callId: string;
  peerUid: string;
  displayCardName: string;
  /** Tarjeta emisora en el log (Ghost-Link). */
  isBusinessCard: boolean;
  /** Tipo de tarjeta del título en Calls (entrante: tu tarjeta; saliente: tarjeta desde la que llamaste). */
  displayCardIsBusiness?: boolean;
  /** Denormalizado: 'business' | 'smart' cuando el API lo envía. */
  cardType?: 'business' | 'smart';
  bcLogoUrl?: string | null;
  bcName?: string | null;
  bcContactName?: string | null;
  scName?: string | null;
  cardName?: string | null;
  /** Saliente + negocio: nombre de contacto en la tarjeta emisora (≈ bcContactName / Mongo ownerDisplayName). */
  emitterCardContactName?: string | null;
  peerFullName: string;
  peerPersonalName: string;
  /** Nombre completo perfil del caller (paridad con Smart Card; en business entrante = subtítulo). */
  userFullName?: string | null;
  userAvatarUrl: string | null;
  sourceCardName: string;
  sourceSid: string | null;
  sourceBId: string | null;
  callChannel: 'ghost-link-voip';
  callType: 'audio' | 'video';
  /**
   * Estado visual para el histórico de llamadas Ghost-Link (anillo/lista).
   * En el servidor a veces llega como `storyState`; **no** es Instagram Stories ni feed social.
   */
  voipLogPresence: VoipCallHistoryPresence;
  direction: 'incoming' | 'outgoing' | 'missed';
  status: 'completed' | 'missed' | 'rejected';
  durationSec: number;
  tags: string[];
  voiceNoteUri: string | null;
  voiceNoteName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Si el API lo envía: snapshot del emisor en la tarjeta (Mongo); Calls usa campos acordados (sin nick en UI). */
  issuerSnapshot?: IssuerSnapshotPayload;
  /**
   * Contrato canónico de UI de llamada (ver `services/callDisplayCard.ts`).
   * El backend (`/api/qr/calls/history`) lo calcula por fila: la UI lo consume
   * sin ramificar por `cardType` ni leer `bc*`/`user*`. `null` si el API no lo
   * envía todavía (tolerancia a backends viejos durante rollout).
   */
  display: CallDisplayCard | null;
};

export async function listCallsHistory(params: { uid: string }): Promise<{ count: number; history: CallHistoryRow[] }> {
  if (__DEV__) {
    console.log('[qrApi][listCallsHistory] pidiendo token…', { baseUrl: getApiBaseUrl() });
  }
  const auth = await getScopedJwtToken(params.uid, 'qr.access');
  if (__DEV__) {
    console.log('[qrApi][listCallsHistory] token OK → GET /api/qr/calls/history', {
      url: `${auth.baseUrl}/api/qr/calls/history`,
    });
  }

  let response: any;
  try {
    response = await axios.get(`${auth.baseUrl}/api/qr/calls/history`, {
      params: {
        uid: params.uid,
      },
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    });
  } catch (error: any) {
    throw mapQrNetworkError(error, auth.baseUrl);
  }

  const rows = Array.isArray(response?.data?.history) ? response.data.history : [];
  const history: CallHistoryRow[] = rows.map((row: any) => {
    const displayCardName =
      row?.displayCardName != null && String(row.displayCardName).trim()
        ? String(row.displayCardName).trim()
        : '';
    const sourceCardName =
      row?.sourceCardName != null && String(row.sourceCardName).trim()
        ? String(row.sourceCardName).trim()
        : '';
    const peerFullName =
      row?.peerFullName != null && String(row.peerFullName).trim()
        ? String(row.peerFullName).trim()
        : '';
    const peerPersonalName =
      row?.peerPersonalName != null && String(row.peerPersonalName).trim()
        ? String(row.peerPersonalName).trim()
        : '';
    const userFullName =
      row?.userFullName != null && String(row.userFullName).trim()
        ? String(row.userFullName).trim()
        : peerFullName;
    const userAvatarUrl =
      row?.userAvatarUrl != null && String(row.userAvatarUrl).trim()
        ? String(row.userAvatarUrl)
        : row?.avatarUrl != null && String(row.avatarUrl).trim()
          ? String(row.avatarUrl)
          : row?.photoUrl != null && String(row.photoUrl).trim()
            ? String(row.photoUrl)
            : null;
    const isBusinessCard = row?.isBusinessCard === true || row?.isBusinessCard === 'true';
    const dcb = row?.displayCardIsBusiness;
    const displayCardIsBusiness =
      dcb === true || dcb === 'true'
        ? true
        : dcb === false || dcb === 'false'
          ? false
          : isBusinessCard;
    const emitterCardContactNameRaw = row?.emitterCardContactName;
    const emitterCardContactName =
      emitterCardContactNameRaw != null && String(emitterCardContactNameRaw).trim()
        ? String(emitterCardContactNameRaw).trim()
        : null;
    const ct = row?.cardType;
    const cardType = ct === 'business' || ct === 'smart' ? ct : undefined;
    const bcLogoUrl =
      row?.bcLogoUrl != null && String(row.bcLogoUrl).trim() ? String(row.bcLogoUrl).trim() : null;
    const bcName = row?.bcName != null && String(row.bcName).trim() ? String(row.bcName).trim() : null;
    const bcContactName =
      row?.bcContactName != null && String(row.bcContactName).trim()
        ? String(row.bcContactName).trim()
        : null;
    const scName = row?.scName != null && String(row.scName).trim() ? String(row.scName).trim() : null;
    const cardName = row?.cardName != null && String(row.cardName).trim() ? String(row.cardName).trim() : null;
    /** JSON legacy VOIP suele llamarse `storyState`; toleramos `voipLogPresence`. */
    const rawVoipPresence =
      row?.voipLogPresence != null && String(row.voipLogPresence).trim()
        ? String(row.voipLogPresence).trim()
        : row?.storyState != null && String(row.storyState).trim()
          ? String(row.storyState).trim()
          : '';
    const voipLogPresence: VoipCallHistoryPresence =
      rawVoipPresence === 'vip'
        ? 'vip'
        : rawVoipPresence === 'normal'
          ? 'normal'
          : 'none';
    return {
      callId: String(row?.callId || ''),
      peerUid: String(row?.peerUid || ''),
      displayCardName,
      isBusinessCard,
      displayCardIsBusiness,
      cardType,
      bcLogoUrl,
      bcName,
      bcContactName,
      scName,
      cardName,
      emitterCardContactName,
      peerFullName,
      peerPersonalName,
      userFullName,
      userAvatarUrl,
      sourceCardName,
      sourceSid: row?.sourceSid != null && String(row.sourceSid).trim() ? String(row.sourceSid) : null,
      sourceBId: row?.sourceBId != null && String(row.sourceBId).trim() ? String(row.sourceBId) : null,
      callChannel: 'ghost-link-voip' as const,
      callType: row?.callType === 'video' ? 'video' : 'audio' as const,
      voipLogPresence,
      direction: row?.direction === 'outgoing' ? 'outgoing' : row?.direction === 'missed' ? 'missed' : 'incoming',
      status: row?.status === 'missed' ? 'missed' : row?.status === 'rejected' ? 'rejected' : 'completed',
      durationSec: Number(row?.durationSec || 0),
      tags: Array.isArray(row?.tags) ? row.tags.map((tag: any) => String(tag)) : [],
      voiceNoteUri: row?.voiceNoteUri ? String(row.voiceNoteUri) : null,
      voiceNoteName: row?.voiceNoteName ? String(row.voiceNoteName) : null,
      createdAt: String(row?.createdAt || new Date().toISOString()),
      updatedAt: String(row?.updatedAt || new Date().toISOString()),
      issuerSnapshot: parseIssuerSnapshotFromApi(row?.issuerSnapshot),
      display: fromWireCallDisplayCard(row?.display),
    };
  });
  return {
    count: Number(response?.data?.count ?? history.length),
    history,
  };
}

export async function createCallLog(params: {
  uid: string;
  peerUid: string;
  direction: 'incoming' | 'outgoing' | 'missed';
  status: 'completed' | 'missed' | 'rejected';
  durationSec?: number;
  tags?: string[];
  voiceNoteUri?: string | null;
  voiceNoteName?: string | null;
  sourceCardName?: string;
  sourceSid?: string | null;
  sourceBId?: string | null;
  callChannel?: 'ghost-link-voip';
  callType?: 'audio' | 'video';
  isBusinessCard?: boolean;
  /** Foto/logo de la tarjeta emisora al colgar (saliente: logo negocio o avatar smart). */
  emitterCardPhotoUrl?: string | null;
}): Promise<{ callId: string }> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  const response = await axios.post(
    `${auth.baseUrl}/api/qr/calls/logs`,
    {
      uid: params.uid,
      peerUid: params.peerUid,
      direction: params.direction,
      status: params.status,
      durationSec: Number(params.durationSec || 0),
      tags: Array.isArray(params.tags) ? params.tags : [],
      voiceNoteUri: params.voiceNoteUri ?? null,
      voiceNoteName: params.voiceNoteName ?? null,
      sourceCardName: params.sourceCardName ? String(params.sourceCardName) : 'Tarjeta Social',
      sourceSid: params.sourceSid ?? null,
      sourceBId: params.sourceBId ?? null,
      callChannel: params.callChannel || 'ghost-link-voip',
      callType: params.callType || 'audio',
      isBusinessCard: Boolean(params.isBusinessCard),
      emitterCardPhotoUrl:
        params.emitterCardPhotoUrl != null && String(params.emitterCardPhotoUrl).trim()
          ? String(params.emitterCardPhotoUrl).trim()
          : null,
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

export type VoipMinutesSummaryWire = {
  ok: boolean;
  uid?: string;
  unlimited: boolean;
  cycleKey: string;
  subscriptionUsedMinutes: number;
  subscriptionIncludedMinutes: number;
  purchasedMinutesRemaining: number;
  totalAvailableMinutes: number;
};

export async function fetchVoipMinutesSummary(params: { uid: string }): Promise<VoipMinutesSummaryWire> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');
  const response = await axios.get(`${auth.baseUrl}/api/qr/voip/minutes-summary`, {
    params: { uid: params.uid },
    headers: {
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
    },
    timeout: 15000,
  });
  const d = response?.data || {};
  return {
    ok: d.ok === true,
    uid: d.uid ? String(d.uid) : undefined,
    unlimited: Boolean(d.unlimited),
    cycleKey: String(d.cycleKey || ''),
    subscriptionUsedMinutes: Number(d.subscriptionUsedMinutes ?? 0),
    subscriptionIncludedMinutes: Number(d.subscriptionIncludedMinutes ?? 0),
    purchasedMinutesRemaining: Number(d.purchasedMinutesRemaining ?? 0),
    totalAvailableMinutes: Number(d.totalAvailableMinutes ?? 0),
  };
}

export async function redeemVoipMinutePack(params: {
  uid: string;
  packId: string;
  productId: string;
}): Promise<{ ok: boolean; grantedMinutes?: number }> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');
  const response = await axios.post(
    `${auth.baseUrl}/api/qr/voip/redeem-minute-pack`,
    {
      uid: params.uid,
      packId: params.packId,
      productId: params.productId,
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 20000,
    },
  );
  const d = response?.data || {};
  return { ok: d.ok === true, grantedMinutes: Number(d.grantedMinutes ?? 0) || undefined };
}

export async function redeemIconDataSlotPack(params: {
  uid: string;
  packId: string;
  productId: string;
}): Promise<{ ok: boolean; grantedSlots?: number }> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');
  const response = await axios.post(
    `${auth.baseUrl}/api/qr/commerce/redeem-icondata-slot-pack`,
    {
      uid: params.uid,
      packId: params.packId,
      productId: params.productId,
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 20000,
    },
  );
  const d = response?.data || {};
  return { ok: d.ok === true, grantedSlots: Number(d.grantedSlots ?? 0) || undefined };
}

export async function patchCallLogMeta(params: {
  uid: string;
  callId: string;
  tags?: string[];
  voiceNoteUri?: string | null;
  voiceNoteName?: string | null;
}): Promise<{ ok: boolean }> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  await axios.patch(
    `${auth.baseUrl}/api/qr/calls/logs/${encodeURIComponent(params.callId)}`,
    {
      uid: params.uid,
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
  sid: string | null;
  bId: string | null;
  totalViews: number;
  topIcons: Array<{ iconType: string; count: number }>;
};

export type CardAnalyticsActionType = 'view' | 'icon_click' | 'qr_scan';
export type CardAnalyticsPeriodMode = 'day' | 'week' | 'month' | 'year';

export type CardAnalyticsPeriodSummary = CardAnalyticsSummary & {
  cardId: string;
  labels: string[];
  points: number[];
  totalClicks: number;
  /** Clics en slots públicos (excluye guardados de contacto). */
  engagementClicks: number;
  clickRate: number;
  contactSaves?: { app: number; phone: number };
  periodMode: CardAnalyticsPeriodMode;
  periodOffset: number;
  startAt: string;
  endAt: string;
};

export type MarketSearchSeoRow = {
  keyword: string;
  keywordRoot: string;
  totalSearches: number;
  myClicks: number;
  percent: number;
};

export type MarketSeoSummary = {
  bId: string;
  zipcode: string | null;
  city: string | null;
  locationMode: 'zipcode' | 'city' | 'all';
  locationLabel: string;
  locationSource: 'card_location' | 'explorer' | 'fallback';
  cardLocationUpdatedAt: string | null;
  niche: string;
  rows: MarketSearchSeoRow[];
  topNicheKeyword: string | null;
  topNicheSearches: number;
};

export type MarketSeoHeatmapPoint = {
  latitude: number;
  longitude: number;
  count: number;
  intensity: number;
  zipcode: string | null;
  city: string | null;
  region: string | null;
  label: string | null;
};

export type MarketSeoHeatmap = {
  keywordRoot: string;
  periodMode: CardAnalyticsPeriodMode;
  periodOffset: number;
  startAt: string;
  endAt: string;
  locationQuery: string | null;
  points: MarketSeoHeatmapPoint[];
};

export async function trackMarketSearch(params: {
  uid: string;
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
}): Promise<{ keywordRoot: string; zipcode: string | null; searchId: string }> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');
  const response = await axios.post(
    `${auth.baseUrl}/api/market/searches/track`,
    {
      q: params.q,
      keywordRoot: params.keywordRoot,
      zipcode: params.zipcode || null,
      city: params.city || null,
      region: params.region || null,
      country: params.country || null,
      geoLabel: params.geoLabel || null,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      resultBIds: params.resultBIds || [],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 12000,
    },
  );
  return {
    keywordRoot: String(response?.data?.keywordRoot || ''),
    zipcode: response?.data?.zipcode != null ? String(response.data.zipcode) : null,
    searchId: String(response?.data?.searchId || ''),
  };
}

export async function trackMarketSearchCardClick(params: {
  uid: string;
  bId: string;
  q: string;
  keywordRoot?: string;
  zipcode?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  geoLabel?: string | null;
}): Promise<void> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');
  await axios.post(
    `${auth.baseUrl}/api/market/searches/click`,
    {
      bId: params.bId,
      q: params.q,
      keywordRoot: params.keywordRoot,
      zipcode: params.zipcode || null,
      city: params.city || null,
      region: params.region || null,
      country: params.country || null,
      geoLabel: params.geoLabel || null,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 12000,
    },
  );
}

export async function getMarketSeoSummary(params: {
  uid: string;
  bId: string;
  locationQuery?: string | null;
}): Promise<MarketSeoSummary> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');
  const response = await axios.get(
    `${auth.baseUrl}/api/market/seo/card/${encodeURIComponent(params.bId)}/summary`,
    {
      params: {
        uid: params.uid,
        ...(params.locationQuery ? { locationQuery: params.locationQuery } : {}),
      },
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    },
  );
  const rows = Array.isArray(response?.data?.rows) ? response.data.rows : [];
  return {
    bId: String(response?.data?.bId || params.bId),
    zipcode: response?.data?.zipcode != null ? String(response.data.zipcode) : null,
    city: response?.data?.city != null ? String(response.data.city) : null,
    locationMode: (response?.data?.locationMode || 'all') as MarketSeoSummary['locationMode'],
    locationLabel: String(response?.data?.locationLabel || 'Zona acumulada'),
    locationSource: (response?.data?.locationSource || 'fallback') as MarketSeoSummary['locationSource'],
    cardLocationUpdatedAt: response?.data?.cardLocationUpdatedAt != null ? String(response.data.cardLocationUpdatedAt) : null,
    niche: String(response?.data?.niche || 'general'),
    rows: rows.map((row: any) => ({
      keyword: String(row?.keyword || ''),
      keywordRoot: String(row?.keywordRoot || ''),
      totalSearches: Number(row?.totalSearches || 0) || 0,
      myClicks: Number(row?.myClicks || 0) || 0,
      percent: Number(row?.percent || 0) || 0,
    })),
    topNicheKeyword: response?.data?.topNicheKeyword != null ? String(response.data.topNicheKeyword) : null,
    topNicheSearches: Number(response?.data?.topNicheSearches || 0) || 0,
  };
}

export async function getMarketSeoHeatmap(params: {
  uid: string;
  keyword: string;
  periodMode: CardAnalyticsPeriodMode;
  periodOffset: number;
  locationQuery?: string | null;
}): Promise<MarketSeoHeatmap> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');
  const response = await axios.get(`${auth.baseUrl}/api/market/seo/heatmap`, {
    params: {
      uid: params.uid,
      keyword: params.keyword,
      periodMode: params.periodMode,
      periodOffset: params.periodOffset,
      ...(params.locationQuery ? { locationQuery: params.locationQuery } : {}),
    },
    headers: {
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
    },
    timeout: 15000,
  });
  const points = Array.isArray(response?.data?.points) ? response.data.points : [];
  return {
    keywordRoot: String(response?.data?.keywordRoot || params.keyword),
    periodMode: (response?.data?.periodMode || params.periodMode) as CardAnalyticsPeriodMode,
    periodOffset: Number(response?.data?.periodOffset || params.periodOffset) || 0,
    startAt: String(response?.data?.startAt || ''),
    endAt: String(response?.data?.endAt || ''),
    locationQuery: response?.data?.locationQuery != null ? String(response.data.locationQuery) : null,
    points: points.map((point: any) => ({
      latitude: Number(point?.latitude || 0) || 0,
      longitude: Number(point?.longitude || 0) || 0,
      count: Number(point?.count || 0) || 0,
      intensity: Number(point?.intensity || 0) || 0,
      zipcode: point?.zipcode != null ? String(point.zipcode) : null,
      city: point?.city != null ? String(point.city) : null,
      region: point?.region != null ? String(point.region) : null,
      label: point?.label != null ? String(point.label) : null,
    })),
  };
}

export async function trackCardAnalyticsEvent(params: {
  uid: string;
  sid?: string;
  bId?: string;
  iconType: string;
  source: 'search' | 'card' | 'qr_scan';
}): Promise<void> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');
  await axios.post(
    `${auth.baseUrl}/api/qr/analytics/track`,
    {
      ...(params.sid ? { sid: params.sid } : {}),
      ...(params.bId ? { bId: params.bId } : {}),
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

import { resolveAnalyticsCardIdentity } from '@/services/analyticsCardIdentity';

export async function trackCardAnalyticsAction(params: {
  uid: string;
  cardId: string;
  actionType: CardAnalyticsActionType;
  subType?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');
  const cardId = String(params.cardId || '').trim();
  if (!cardId) return;
  const slotId = String(params.metadata?.slotId || params.metadata?.itemId || '').trim();
  const subTypeRaw = String(params.subType || params.metadata?.subType || params.metadata?.iconType || params.actionType).trim();
  const subType = slotId || subTypeRaw;
  const { sid, bId } = resolveAnalyticsCardIdentity(
    cardId,
    params.metadata?.sid as string | null | undefined,
    params.metadata?.bId as string | null | undefined,
  );

  await axios.post(
    `${auth.baseUrl}/api/qr/analytics/track`,
    {
      ...(sid ? { sid } : {}),
      ...(bId ? { bId } : {}),
      type: params.actionType,
      actionType: params.actionType,
      subType,
      ...(slotId ? { slotId } : {}),
      source: String(params.metadata?.source || 'app'),
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
  uid: string;
  cardRef: string;
}): Promise<CardAnalyticsSummary> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');

  const response = await axios.get(
    `${auth.baseUrl}/api/qr/analytics/card/${encodeURIComponent(params.cardRef)}/summary`,
    {
      params: { uid: params.uid },
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    }
  );

  const top = Array.isArray(response?.data?.topIcons) ? response.data.topIcons : [];
  return {
    sid: response?.data?.sid != null && String(response.data.sid).trim() ? String(response.data.sid) : null,
    bId: response?.data?.bId != null && String(response.data.bId).trim() ? String(response.data.bId) : null,
    totalViews: Number(response?.data?.totalViews || 0) || 0,
    topIcons: top.map((row: any) => ({
      iconType: String(row?.iconType || ''),
      count: Number(row?.count || 0) || 0,
    })),
  };
}

export async function getCardAnalyticsPeriodSummary(params: {
  uid: string;
  cardRef: string;
  periodMode: CardAnalyticsPeriodMode;
  periodOffset: number;
}): Promise<CardAnalyticsPeriodSummary> {
  const auth = await getScopedJwtToken(params.uid, 'qr.access');
  const response = await axios.get(
    `${auth.baseUrl}/api/qr/analytics/card/${encodeURIComponent(params.cardRef)}/events-summary`,
    {
      params: {
        uid: params.uid,
        periodMode: params.periodMode,
        periodOffset: params.periodOffset,
      },
      headers: {
        'x-api-gateway-key': auth.gatewayKey,
        Authorization: `Bearer ${auth.token}`,
      },
      timeout: 15000,
    }
  );

  const top = Array.isArray(response?.data?.topIcons) ? response.data.topIcons : [];
  const labels = Array.isArray(response?.data?.labels) ? response.data.labels : [];
  const points = Array.isArray(response?.data?.points) ? response.data.points : [];
  return {
    sid: response?.data?.sid != null && String(response.data.sid).trim() ? String(response.data.sid) : null,
    bId: response?.data?.bId != null && String(response.data.bId).trim() ? String(response.data.bId) : null,
    cardId: String(response?.data?.cardId || params.cardRef),
    totalViews: Number(response?.data?.totalViews || 0) || 0,
    totalClicks: Number(response?.data?.totalClicks || 0) || 0,
    engagementClicks: Number(response?.data?.engagementClicks ?? response?.data?.totalClicks ?? 0) || 0,
    clickRate: Number(response?.data?.clickRate || 0) || 0,
    contactSaves: response?.data?.contactSaves
      ? {
          app: Number(response.data.contactSaves.app || 0) || 0,
          phone: Number(response.data.contactSaves.phone || 0) || 0,
        }
      : undefined,
    periodMode: (response?.data?.periodMode || params.periodMode) as CardAnalyticsPeriodMode,
    periodOffset: Number(response?.data?.periodOffset || params.periodOffset) || 0,
    startAt: String(response?.data?.startAt || ''),
    endAt: String(response?.data?.endAt || ''),
    labels: labels.map((label: unknown) => String(label)),
    points: points.map((value: unknown) => Number(value || 0) || 0),
    topIcons: top.map((row: any) => ({
      iconType: String(row?.iconType || ''),
      count: Number(row?.count || 0) || 0,
    })),
  };
}

/**
 * Obtiene holdersCount real (desde share_permissions) para un conjunto de business cards.
 * Retorna mapa { bId: holdersCount }.
 */
export async function fetchBusinessCardHolderCounts(params: {
  uid: string;
  keys: string[];
}): Promise<Record<string, number>> {
  if (!params.uid || !params.keys.length) return {};
  const auth = await getScopedJwtToken(params.uid, 'qr.access');
  const response = await axios.get(`${auth.baseUrl}/api/qr/business-holders`, {
    params: { uid: params.uid, keys: params.keys.join(',') },
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

export type BusinessHoldersHistoryGranularity = 'daily' | 'monthly' | 'yearly';

export async function fetchBusinessCardHoldersHistory(params: {
  uid: string;
  bId: string;
  granularity: BusinessHoldersHistoryGranularity;
  monthCursor?: number;
  yearCursor?: number;
}): Promise<{
  totalActive: number;
  sumInRange: number;
  buckets: Array<{ key: string; count: number }>;
  granularity: string;
  startAt: string;
  endAt: string;
}> {
  const { uid, bId, granularity, monthCursor = 0, yearCursor = 0 } = params;
  if (!uid || !bId) {
    return { totalActive: 0, sumInRange: 0, buckets: [], granularity, startAt: '', endAt: '' };
  }
  const auth = await getScopedJwtToken(uid, 'qr.access');
  const response = await axios.get(`${auth.baseUrl}/api/qr/business-holders-history`, {
    params: {
      uid,
      bId,
      granularity,
      monthCursor,
      yearCursor,
    },
    headers: {
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
    },
    timeout: 20000,
    validateStatus: () => true,
  });
  if (response.status !== 200 || !response?.data?.ok) {
    throw new Error(String(response?.data?.error || 'History request failed'));
  }
  const d = response.data;
  const buckets = Array.isArray(d.buckets)
    ? d.buckets.map((row: { key?: string; count?: number }) => ({
        key: String(row?.key || ''),
        count: Number(row?.count || 0) || 0,
      }))
    : [];
  return {
    totalActive: Number(d.totalActive || 0) || 0,
    sumInRange: Number(d.sumInRange || 0) || 0,
    buckets,
    granularity: String(d.granularity || granularity),
    startAt: String(d.startAt || ''),
    endAt: String(d.endAt || ''),
  };
}
