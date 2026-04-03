/**
 * Tokens RTC para Ghost-Link (voz). Requiere AGORA_APP_ID y AGORA_APP_CERTIFICATE en el servidor.
 * El certificado nunca debe exponerse al cliente.
 */

const { RtcTokenBuilder, RtcRole } = require('agora-token');

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
 * @param {{ ownerUid: string; targetUid: string; channelName: string; ttlSeconds: number }} params
 * @returns {null | { appId: string; channelName: string; callerUid: number; calleeUid: number; callerToken: string; calleeToken: string }}
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

  const callerUid = uidFromString(`c:${params.ownerUid}`);
  let calleeUid = uidFromString(`t:${params.targetUid}`);
  if (calleeUid === callerUid) {
    calleeUid = (calleeUid + 1) >>> 0;
    if (calleeUid < 1) calleeUid = 2;
  }

  const ttl = Math.max(60, Number(params.ttlSeconds || 45) + 300);
  const role = RtcRole.PUBLISHER;

  const callerToken = RtcTokenBuilder.buildTokenWithUid(appId, cert, channelName, callerUid, role, ttl, ttl);
  const calleeToken = RtcTokenBuilder.buildTokenWithUid(appId, cert, channelName, calleeUid, role, ttl, ttl);

  return {
    appId,
    channelName,
    callerUid,
    calleeUid,
    callerToken,
    calleeToken,
  };
}

module.exports = { buildGhostLinkAgoraInvite };
