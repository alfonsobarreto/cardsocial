/**
 * Tokens RTC para Ghost-Link (voz). Requiere AGORA_APP_ID y AGORA_APP_CERTIFICATE en el servidor.
 * El certificado nunca debe exponerse al cliente.
 */

const { RtcTokenBuilder, RtcRole } = require('agora-token');
const { checkVoipGateForGhostLink, computeGhostLinkAgoraExpireDurations } = require('./voipUsageService');

function uidFromString(s) {
  const str = String(s || '');
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  const u = h >>> 0;
  return u >= 1 ? u : 1;
}

/**
 * @param {{
 *   callerUid: string;
 *   targetUid: string;
 *   channelName: string;
 *   ttlSeconds: number;
 *   callerTokenExpireSec?: number;
 *   callerPrivilegeExpireSec?: number;
 *   calleeTokenExpireSec?: number;
 *   calleePrivilegeExpireSec?: number;
 * }} params
 * @returns {null | {
 *   appId: string;
 *   channelName: string;
 *   callerUid: number;
 *   calleeUid: number;
 *   callerToken: string;
 *   calleeToken: string;
 * }}
 */
function buildGhostLinkAgoraInvite(params) {
  const appId = process.env.AGORA_APP_ID?.trim();
  const cert = process.env.AGORA_APP_CERTIFICATE?.trim();
  if (!appId || !cert) {
    return null;
  }

  const channelName = String(params.channelName || '').trim();
  if (!channelName || channelName.length > 63) {
    return null;
  }

  const callerRtcUid = uidFromString(`c:${params.callerUid}`);
  let calleeUid = uidFromString(`t:${params.targetUid}`);
  if (calleeUid === callerRtcUid) {
    calleeUid = (calleeUid + 1) >>> 0;
    if (calleeUid < 1) calleeUid = 2;
  }

  const baseTtl = Math.max(60, Number(params.ttlSeconds || 45) + 300);
  const callerTok = params.callerTokenExpireSec != null ? Number(params.callerTokenExpireSec) : baseTtl;
  const callerPriv = params.callerPrivilegeExpireSec != null ? Number(params.callerPrivilegeExpireSec) : callerTok;
  const calleeTok = params.calleeTokenExpireSec != null ? Number(params.calleeTokenExpireSec) : baseTtl;
  const calleePriv = params.calleePrivilegeExpireSec != null ? Number(params.calleePrivilegeExpireSec) : calleeTok;

  const role = RtcRole.PUBLISHER;

  const callerToken = RtcTokenBuilder.buildTokenWithUid(
    appId,
    cert,
    channelName,
    callerRtcUid,
    role,
    callerTok,
    callerPriv,
  );
  const calleeToken = RtcTokenBuilder.buildTokenWithUid(
    appId,
    cert,
    channelName,
    calleeUid,
    role,
    calleeTok,
    calleePriv,
  );

  return {
    appId,
    channelName,
    callerUid: callerRtcUid,
    calleeUid,
    callerToken,
    calleeToken,
  };
}

/**
 * Comprueba cupo VoIP del llamante antes de emitir tokens (independiente de si Agora está configurado).
 * @param {*} storage — `createQrRoutes({ storage })`
 * @param {{ callerUid: string; targetUid: string; channelName: string; ttlSeconds: number }} params
 * @returns {Promise<null | (ReturnType<typeof buildGhostLinkAgoraInvite> & { trialCap: null | { callerMinutes: number | null; calleeMinutes: number | null } })>}
 */
async function buildGhostLinkAgoraInviteWithVoipGate(storage, params) {
  const gate = await checkVoipGateForGhostLink(storage, params.callerUid, params.targetUid);
  if (!gate.ok) {
    const err = new Error(String(gate.error || 'VOIP_MINUTES_EXHAUSTED'));
    err.code = 'VOIP_MINUTES_EXHAUSTED';
    throw err;
  }
  const d = await computeGhostLinkAgoraExpireDurations(storage, params.callerUid, params.targetUid, params.ttlSeconds);
  const invite = buildGhostLinkAgoraInvite({
    ...params,
    callerTokenExpireSec: d.callerTokenExpire,
    callerPrivilegeExpireSec: d.callerPrivilegeExpire,
    calleeTokenExpireSec: d.calleeTokenExpire,
    calleePrivilegeExpireSec: d.calleePrivilegeExpire,
  });
  if (!invite) return null;
  return { ...invite, trialCap: d.trialCap };
}

module.exports = { buildGhostLinkAgoraInvite, buildGhostLinkAgoraInviteWithVoipGate };
