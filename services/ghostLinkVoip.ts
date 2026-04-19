import { isGhostLinkAgoraNativeAvailable } from '@/services/expoGoAgoraGuard';
import { resolveExpoPublicApiBaseUrl } from '@/services/expoPublicApiBaseUrl';
import axios from 'axios';
import { Alert } from 'react-native';

/** Aborta startGhostLinkVoipCall en Expo Go tras informar al usuario (evita doble Alert en el caller). */
export class GhostLinkExpoGoAbortError extends Error {
  constructor() {
    super('GHOST_LINK_EXPO_GO_ABORT');
    this.name = 'GhostLinkExpoGoAbortError';
  }
}

export function isGhostLinkExpoGoAbortError(e: unknown): boolean {
  return e instanceof GhostLinkExpoGoAbortError;
}

function alertGhostLinkExpoGo(): void {
  Alert.alert(
    'Ghost-Link',
    'Motor de audio solo disponible en compilaciones nativas (development build / EAS). En Expo Go puedes seguir usando el resto de la app.\n\n' +
      'Audio engine is only available in native builds. The rest of the app works in Expo Go.',
  );
}

export type GhostLinkCardContext = {
  sourceSid?: string | null;
  sourceBId?: string | null;
  sourceCardName: string;
  /** Alineado con Mongo `smart_cards.cardType` / UI; el backend prioriza el doc de tarjeta. */
  sourceCardKind?: 'business' | 'personal';
  /** Logo o foto de preview de la tarjeta (p. ej. negocio sin fila Mongo o logo faltante). */
  sourceCardPhotoUrl?: string | null;
  sourceCardDisplayName?: string | null;
};

/**
 * Datos de la tarjeta compartida (el puente entre caller y receptor).
 *
 * Reglas por `cardType`:
 * - `personal` (Smart Card): se usan `cardName` y `cardPhoto`. Los 3 campos `bc*` quedan `null`.
 * - `business` (Business Card): se usan EXCLUSIVAMENTE `bcLogoUrl`, `bcName`, `bcContactName`
 *   (mismos 3 nombres con los que se crea y guarda en Firestore `businessCards/{bId}`).
 *   `cardName` y `cardPhoto` NO los lee la UI para Business; quedan sólo como eco genérico.
 */
export type GhostLinkSharedCard = {
  sid: string | null;
  bId: string | null;
  cardName: string;
  cardPhoto: string | null;
  cardType: 'business' | 'personal';
  /** Business only: logo del negocio (= `businessCards.bcLogoUrl`, = `item.bcLogoUrl` en Calls). */
  bcLogoUrl?: string | null;
  /** Business only: nombre comercial (= `businessCards.bcName`, = `item.bcName` en Calls). */
  bcName?: string | null;
  /** Business only: contacto en la tarjeta (= `businessCards.bcContactName`, = `item.bcContactName` en Calls). */
  bcContactName?: string | null;
};

function parseGhostLinkSharedCard(
  raw: Record<string, unknown> | null | undefined,
  fallbacks: { sourceSid: string | null; sourceBId: string | null; sourceCardName: string },
): GhostLinkSharedCard {
  const outSid =
    raw?.sid != null && String(raw.sid).trim() ? String(raw.sid).trim() : fallbacks.sourceSid;
  const outBId =
    raw?.bId != null && String(raw.bId).trim() ? String(raw.bId).trim() : fallbacks.sourceBId;
  const cardType: 'business' | 'personal' =
    String(raw?.cardType || '').toLowerCase() === 'business' ? 'business' : 'personal';
  const card: GhostLinkSharedCard = {
    sid: outSid || null,
    bId: outBId || null,
    cardName: String(raw?.cardName || fallbacks.sourceCardName || 'Tarjeta Social'),
    cardPhoto: raw?.cardPhoto != null && String(raw.cardPhoto).trim() ? String(raw.cardPhoto) : null,
    cardType,
  };
  if (cardType === 'business') {
    const bcName = raw?.bcName != null && String(raw.bcName).trim() ? String(raw.bcName).trim() : null;
    const bcLogoUrl =
      raw?.bcLogoUrl != null && String(raw.bcLogoUrl).trim() ? String(raw.bcLogoUrl).trim() : null;
    const bcContactName =
      raw?.bcContactName != null && String(raw.bcContactName).trim()
        ? String(raw.bcContactName).trim()
        : null;
    if (bcName) card.bcName = bcName;
    if (bcLogoUrl) card.bcLogoUrl = bcLogoUrl;
    if (bcContactName) card.bcContactName = bcContactName;
  }
  return card;
}

export type GhostLinkCallType = 'audio' | 'video';

export type GhostLinkCallStartParams = {
  uid: string;
  targetUid: string;
  card: GhostLinkCardContext;
  callType?: GhostLinkCallType;
};

/** Credenciales RTC devueltas por el backend (token corto, uid entero Agora). */
export type GhostLinkAgoraRtc = {
  appId: string;
  channelName: string;
  token: string;
  uid: number;
};

function parseAgoraRtc(raw: unknown): GhostLinkAgoraRtc | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const appId = String(o.appId || '').trim();
  const channelName = String(o.channelName || '').trim();
  const token = String(o.token || '').trim();
  const uid = Number(o.uid);
  if (!appId || !channelName || !token || !Number.isFinite(uid) || uid < 1) {
    return undefined;
  }
  return { appId, channelName, token, uid };
}

export type GhostLinkCallStartResult = {
  inviteId?: string;
  sessionId: string;
  engine: 'agora' | 'signaling-only';
  /** Presente cuando el backend tiene Agora configurado (AGORA_* en servidor). */
  agora?: GhostLinkAgoraRtc;
  callChannel: 'ghost-link-voip';
  callType: GhostLinkCallType;
  card: GhostLinkSharedCard;
  callerDisplay: {
    name: string;
    nickname: string;
    userAvatarUrl: string | null;
    /** Perfil caller (paridad con `userFullName` en historial). */
    userFullName?: string | null;
  };
  receiverDisplay: {
    name: string;
    nickname: string;
    userAvatarUrl: string | null;
  };
};

export type GhostLinkIncomingInvite = {
  inviteId: string;
  sessionId: string;
  callerUid: string;
  targetUid: string;
  sourceCardName: string;
  sourceSid: string | null;
  sourceBId: string | null;
  callChannel: 'ghost-link-voip';
  callType: GhostLinkCallType;
  agora?: GhostLinkAgoraRtc;
  card: GhostLinkSharedCard;
  callerDisplay: {
    name: string;
    nickname: string;
    userAvatarUrl: string | null;
    /** Perfil caller (paridad con `userFullName` en historial). */
    userFullName?: string | null;
  };
  receiverDisplay: {
    name: string;
    nickname: string;
    userAvatarUrl: string | null;
  };
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
};

function getApiBaseUrl(): string {
  return resolveExpoPublicApiBaseUrl();
}

function getGatewayKey(): string {
  const key = process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim();
  if (!key) {
    throw new Error('Missing EXPO_PUBLIC_MODERATION_GATEWAY_KEY.');
  }
  return key;
}

async function getQrScopedJwt(uid: string): Promise<string> {
  const response = await axios.post(
    `${getApiBaseUrl()}/api/auth/token`,
    { uid, scope: 'qr.access' },
    {
      headers: {
        'x-api-gateway-key': getGatewayKey(),
      },
      timeout: 15000,
    }
  );

  const token = String(response?.data?.token || '').trim();
  if (!token) {
    throw new Error('No se pudo obtener token QR scope.');
  }
  return token;
}

export async function startGhostLinkVoipCall(
  params: GhostLinkCallStartParams
): Promise<GhostLinkCallStartResult> {
  const callerUid = String(params.uid || '').trim();
  const targetUid = String(params.targetUid || '').trim();
  const sourceCardName = String(params.card?.sourceCardName || '').trim();
  const sourceSid = params.card?.sourceSid != null && String(params.card.sourceSid).trim()
    ? String(params.card.sourceSid).trim()
    : null;
  const sourceBId = params.card?.sourceBId != null && String(params.card.sourceBId).trim()
    ? String(params.card.sourceBId).trim()
    : null;

  if (!callerUid || !targetUid || !sourceCardName) {
    throw new Error('uid, targetUid y sourceCardName son obligatorios para Ghost-Link.');
  }

  if (!isGhostLinkAgoraNativeAvailable()) {
    alertGhostLinkExpoGo();
    throw new GhostLinkExpoGoAbortError();
  }

  const jwt = await getQrScopedJwt(callerUid);
  const card = params.card || ({} as GhostLinkCardContext);
  const startBody: Record<string, unknown> = {
    uid: callerUid,
    targetUid,
    sourceCardName,
    ...(sourceSid ? { sourceSid } : {}),
    ...(sourceBId ? { sourceBId } : {}),
    callType: params.callType || 'audio',
  };
  if (card.sourceCardKind) {
    startBody.sourceCardKind = card.sourceCardKind;
  }
  if (card.sourceCardPhotoUrl) {
    startBody.sourceCardPhotoUrl = String(card.sourceCardPhotoUrl).trim();
  }
  if (card.sourceCardDisplayName) {
    startBody.sourceCardDisplayName = String(card.sourceCardDisplayName).trim();
  }

  const response = await axios.post(
    `${getApiBaseUrl()}/api/qr/voip/ghost-link/start`,
    startBody,
    {
      headers: {
        'x-api-gateway-key': getGatewayKey(),
        Authorization: `Bearer ${jwt}`,
      },
      timeout: 20000,
    }
  );

  const engineRaw = String(response?.data?.engine || '').trim();
  const engine: 'agora' | 'signaling-only' = engineRaw === 'agora' ? 'agora' : 'signaling-only';

  const rawCard = response?.data?.card as Record<string, unknown> | undefined;
  const respCallType: GhostLinkCallType = response?.data?.callType === 'video' ? 'video' : 'audio';
  const outSid =
    rawCard?.sid != null && String(rawCard.sid).trim() ? String(rawCard.sid).trim() : sourceSid;
  const outBId =
    rawCard?.bId != null && String(rawCard.bId).trim() ? String(rawCard.bId).trim() : sourceBId;
  const cardParsed = parseGhostLinkSharedCard(rawCard, {
    sourceSid: outSid || null,
    sourceBId: outBId || null,
    sourceCardName,
  });
  const callerName = String(response?.data?.callerDisplay?.name || 'Emisor');
  const callerUserFullName =
    response?.data?.callerDisplay?.userFullName != null &&
    String(response.data.callerDisplay.userFullName).trim()
      ? String(response.data.callerDisplay.userFullName)
      : callerName;
  return {
    inviteId: response?.data?.inviteId ? String(response.data.inviteId) : undefined,
    sessionId: String(response?.data?.sessionId || ''),
    engine,
    agora: parseAgoraRtc(response?.data?.agora),
    callChannel: 'ghost-link-voip',
    callType: respCallType,
    card: cardParsed,
    callerDisplay: {
      name: callerName,
      nickname: String(response?.data?.callerDisplay?.nickname || 'user'),
      userAvatarUrl:
        response?.data?.callerDisplay?.userAvatarUrl != null && String(response.data.callerDisplay.userAvatarUrl).trim()
          ? String(response.data.callerDisplay.userAvatarUrl)
          : null,
      userFullName: callerUserFullName,
    },
    receiverDisplay: {
      name: String(response?.data?.receiverDisplay?.name || 'Receptor'),
      nickname: String(response?.data?.receiverDisplay?.nickname || 'user'),
      userAvatarUrl:
        response?.data?.receiverDisplay?.userAvatarUrl != null && String(response.data.receiverDisplay.userAvatarUrl).trim()
          ? String(response.data.receiverDisplay.userAvatarUrl)
          : null,
    },
  };
}

export async function getIncomingGhostLinkInvite(params: {
  uid: string;
}): Promise<GhostLinkIncomingInvite | null> {
  const userUid = String(params.uid || '').trim();
  if (!userUid) {
    throw new Error('uid es obligatorio para consultar llamadas entrantes Ghost-Link.');
  }

  try {
    const jwt = await getQrScopedJwt(userUid);
    const response = await axios.get(`${getApiBaseUrl()}/api/qr/voip/ghost-link/incoming`, {
      params: { uid: userUid },
      headers: {
        'x-api-gateway-key': getGatewayKey(),
        Authorization: `Bearer ${jwt}`,
      },
      timeout: 15000,
    });

    const invite = response?.data?.invite;
    if (!invite) {
      return null;
    }

    const invCard = invite?.card as Record<string, unknown> | undefined;
    const invCallType: GhostLinkCallType = invite?.callType === 'video' ? 'video' : 'audio';
    const srcSid = invite?.sourceSid != null && String(invite.sourceSid).trim() ? String(invite.sourceSid) : null;
    const srcBId = invite?.sourceBId != null && String(invite.sourceBId).trim() ? String(invite.sourceBId) : null;
    const sourceCardName = String(invite?.sourceCardName || 'Tarjeta Social');
    const cardParsed = parseGhostLinkSharedCard(invCard, {
      sourceSid: srcSid,
      sourceBId: srcBId,
      sourceCardName,
    });
    const callerNameIn = String(invite?.callerDisplay?.name || 'Contacto');
    const callerUserFullNameIn =
      invite?.callerDisplay?.userFullName != null && String(invite.callerDisplay.userFullName).trim()
        ? String(invite.callerDisplay.userFullName)
        : callerNameIn;
    return {
      inviteId: String(invite?.inviteId || ''),
      sessionId: String(invite?.sessionId || ''),
      callerUid: String(invite?.callerUid || ''),
      targetUid: String(invite?.targetUid || ''),
      sourceCardName,
      sourceSid: srcSid,
      sourceBId: srcBId,
      callChannel: 'ghost-link-voip',
      callType: invCallType,
      agora: parseAgoraRtc(invite?.agora),
      card: cardParsed,
      callerDisplay: {
        name: callerNameIn,
        nickname: String(invite?.callerDisplay?.nickname || 'user'),
        userAvatarUrl:
          invite?.callerDisplay?.userAvatarUrl != null && String(invite.callerDisplay.userAvatarUrl).trim()
            ? String(invite.callerDisplay.userAvatarUrl)
            : null,
        userFullName: callerUserFullNameIn,
      },
      receiverDisplay: {
        name: String(invite?.receiverDisplay?.name || 'Contacto'),
        nickname: String(invite?.receiverDisplay?.nickname || 'user'),
        userAvatarUrl:
          invite?.receiverDisplay?.userAvatarUrl != null && String(invite.receiverDisplay.userAvatarUrl).trim()
            ? String(invite.receiverDisplay.userAvatarUrl)
            : null,
      },
      createdAt: invite?.createdAt ? String(invite.createdAt) : null,
      updatedAt: invite?.updatedAt ? String(invite.updatedAt) : null,
      expiresAt: invite?.expiresAt ? String(invite.expiresAt) : null,
    };
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) {
      return null;
    }
    throw e;
  }
}

export type OutgoingGhostLinkInviteStatus =
  | 'ringing'
  | 'accepted'
  | 'rejected'
  | 'ended'
  | 'expired'
  | 'not_found'
  | 'unknown';

/** Emisor: consulta el estado de la invitación tras `start` (signaling antes del join Agora). */
export async function getOutgoingGhostLinkInviteStatus(params: {
  uid: string;
  inviteId: string;
}): Promise<OutgoingGhostLinkInviteStatus> {
  const userUid = String(params.uid || '').trim();
  const inviteId = String(params.inviteId || '').trim();
  if (!userUid || !inviteId) {
    throw new Error('uid e inviteId son obligatorios para el estado de invitación saliente Ghost-Link.');
  }

  try {
    const jwt = await getQrScopedJwt(userUid);
    const response = await axios.get(`${getApiBaseUrl()}/api/qr/voip/ghost-link/outgoing-invite`, {
      params: { uid: userUid, inviteId },
      headers: {
        'x-api-gateway-key': getGatewayKey(),
        Authorization: `Bearer ${jwt}`,
      },
      timeout: 15000,
    });

    const raw = String(response?.data?.status || '').trim().toLowerCase();
    if (raw === 'accepted') return 'accepted';
    if (raw === 'rejected') return 'rejected';
    if (raw === 'ended') return 'ended';
    if (raw === 'expired') return 'expired';
    if (raw === 'not_found') return 'not_found';
    if (raw === 'ringing') return 'ringing';
    return 'unknown';
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) {
      return 'not_found';
    }
    throw e;
  }
}

export async function respondGhostLinkInvite(params: {
  uid: string;
  inviteId: string;
  action: 'accept' | 'reject' | 'end';
}): Promise<{ status: 'accepted' | 'rejected' | 'ended' }> {
  const userUid = String(params.uid || '').trim();
  const inviteId = String(params.inviteId || '').trim();
  const action = String(params.action || '').trim().toLowerCase();

  if (!userUid || !inviteId || !['accept', 'reject', 'end'].includes(action)) {
    throw new Error('uid, inviteId y action valido son requeridos para responder Ghost-Link.');
  }

  const jwt = await getQrScopedJwt(userUid);
  const response = await axios.post(
    `${getApiBaseUrl()}/api/qr/voip/ghost-link/respond`,
    {
      uid: userUid,
      inviteId,
      action,
    },
    {
      headers: {
        'x-api-gateway-key': getGatewayKey(),
        Authorization: `Bearer ${jwt}`,
      },
      timeout: 15000,
    }
  );

  const status = String(response?.data?.status || '').trim().toLowerCase();
  return {
    status: status === 'rejected' ? 'rejected' : status === 'ended' ? 'ended' : 'accepted',
  } as { status: 'accepted' | 'rejected' | 'ended' };
}
