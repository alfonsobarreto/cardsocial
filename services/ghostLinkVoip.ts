import { isGhostLinkAgoraNativeAvailable } from '@/services/expoGoAgoraGuard';
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
  sourceCardId?: string | null;
  sourceCardName: string;
};

export type GhostLinkCallStartParams = {
  ownerUid: string;
  targetUid: string;
  card: GhostLinkCardContext;
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
  callerDisplay: {
    name: string;
    nickname: string;
    photoUrl: string | null;
    sourceCardName: string;
  };
  receiverDisplay: {
    name: string;
    nickname: string;
    photoUrl: string | null;
    sourceCardName: string;
  };
};

export type GhostLinkIncomingInvite = {
  inviteId: string;
  sessionId: string;
  ownerUid: string;
  targetUid: string;
  sourceCardName: string;
  sourceCardId: string | null;
  callChannel: 'ghost-link-voip';
  agora?: GhostLinkAgoraRtc;
  callerDisplay: {
    name: string;
    nickname: string;
    photoUrl: string | null;
  };
  receiverDisplay: {
    name: string;
    nickname: string;
    photoUrl: string | null;
  };
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
};

function getApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_MODERATION_API_URL?.trim();
  if (!envUrl) {
    throw new Error('Missing EXPO_PUBLIC_MODERATION_API_URL.');
  }
  return envUrl.replace(/\/+$/, '');
}

function getGatewayKey(): string {
  const key = process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim();
  if (!key) {
    throw new Error('Missing EXPO_PUBLIC_MODERATION_GATEWAY_KEY.');
  }
  return key;
}

async function getQrScopedJwt(ownerUid: string): Promise<string> {
  const response = await axios.post(
    `${getApiBaseUrl()}/api/auth/token`,
    { ownerUid, scope: 'qr.access' },
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
  const ownerUid = String(params.ownerUid || '').trim();
  const targetUid = String(params.targetUid || '').trim();
  const sourceCardName = String(params.card?.sourceCardName || '').trim();
  const sourceCardId = params.card?.sourceCardId ? String(params.card.sourceCardId).trim() : null;

  if (!ownerUid || !targetUid || !sourceCardName) {
    throw new Error('ownerUid, targetUid y sourceCardName son obligatorios para Ghost-Link.');
  }

  if (!isGhostLinkAgoraNativeAvailable()) {
    alertGhostLinkExpoGo();
    throw new GhostLinkExpoGoAbortError();
  }

  const jwt = await getQrScopedJwt(ownerUid);
  const response = await axios.post(
    `${getApiBaseUrl()}/api/qr/voip/ghost-link/start`,
    {
      ownerUid,
      targetUid,
      sourceCardName,
      sourceCardId,
    },
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

  return {
    inviteId: response?.data?.inviteId ? String(response.data.inviteId) : undefined,
    sessionId: String(response?.data?.sessionId || ''),
    engine,
    agora: parseAgoraRtc(response?.data?.agora),
    callChannel: 'ghost-link-voip',
    callerDisplay: {
      name: String(response?.data?.callerDisplay?.name || 'Emisor'),
      nickname: String(response?.data?.callerDisplay?.nickname || 'user'),
      photoUrl: response?.data?.callerDisplay?.photoUrl ? String(response.data.callerDisplay.photoUrl) : null,
      sourceCardName: String(response?.data?.callerDisplay?.sourceCardName || sourceCardName),
    },
    receiverDisplay: {
      name: String(response?.data?.receiverDisplay?.name || 'Receptor'),
      nickname: String(response?.data?.receiverDisplay?.nickname || 'user'),
      photoUrl: response?.data?.receiverDisplay?.photoUrl ? String(response.data.receiverDisplay.photoUrl) : null,
      sourceCardName: String(response?.data?.receiverDisplay?.sourceCardName || sourceCardName),
    },
  };
}

export async function getIncomingGhostLinkInvite(params: {
  ownerUid: string;
}): Promise<GhostLinkIncomingInvite | null> {
  const ownerUid = String(params.ownerUid || '').trim();
  if (!ownerUid) {
    throw new Error('ownerUid es obligatorio para consultar llamadas entrantes Ghost-Link.');
  }

  const jwt = await getQrScopedJwt(ownerUid);
  const response = await axios.get(`${getApiBaseUrl()}/api/qr/voip/ghost-link/incoming`, {
    params: { ownerUid },
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

  return {
    inviteId: String(invite?.inviteId || ''),
    sessionId: String(invite?.sessionId || ''),
    ownerUid: String(invite?.ownerUid || ''),
    targetUid: String(invite?.targetUid || ''),
    sourceCardName: String(invite?.sourceCardName || 'Tarjeta Social'),
    sourceCardId: invite?.sourceCardId ? String(invite.sourceCardId) : null,
    callChannel: 'ghost-link-voip',
    agora: parseAgoraRtc(invite?.agora),
    callerDisplay: {
      name: String(invite?.callerDisplay?.name || 'Contacto'),
      nickname: String(invite?.callerDisplay?.nickname || 'user'),
      photoUrl: invite?.callerDisplay?.photoUrl ? String(invite.callerDisplay.photoUrl) : null,
    },
    receiverDisplay: {
      name: String(invite?.receiverDisplay?.name || 'Contacto'),
      nickname: String(invite?.receiverDisplay?.nickname || 'user'),
      photoUrl: invite?.receiverDisplay?.photoUrl ? String(invite.receiverDisplay.photoUrl) : null,
    },
    createdAt: invite?.createdAt ? String(invite.createdAt) : null,
    updatedAt: invite?.updatedAt ? String(invite.updatedAt) : null,
    expiresAt: invite?.expiresAt ? String(invite.expiresAt) : null,
  };
}

export async function respondGhostLinkInvite(params: {
  ownerUid: string;
  inviteId: string;
  action: 'accept' | 'reject' | 'end';
}): Promise<{ status: 'accepted' | 'rejected' | 'ended' }> {
  const ownerUid = String(params.ownerUid || '').trim();
  const inviteId = String(params.inviteId || '').trim();
  const action = String(params.action || '').trim().toLowerCase();

  if (!ownerUid || !inviteId || !['accept', 'reject', 'end'].includes(action)) {
    throw new Error('ownerUid, inviteId y action valido son requeridos para responder Ghost-Link.');
  }

  const jwt = await getQrScopedJwt(ownerUid);
  const response = await axios.post(
    `${getApiBaseUrl()}/api/qr/voip/ghost-link/respond`,
    {
      ownerUid,
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
  };
}
