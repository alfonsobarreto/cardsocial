/** Orígenes HTTPS públicos para enlaces y QR en firma de correo (paridad con `services/emailSignaturePublicBase.ts`). */

const DEFAULT_SIGNATURE_PUBLIC_ORIGIN = 'https://cardsocial.me';

function trimOrigin(origin) {
  return String(origin || '').trim().replace(/\/+$/, '');
}

function hostnameUnreachableFromMailboxProviders(hostname) {
  const raw = String(hostname || '').toLowerCase();
  let core = raw;
  const zi = raw.indexOf('%');
  if (zi !== -1) core = raw.slice(0, zi);
  if (core.startsWith('[') && core.endsWith(']')) core = core.slice(1, -1);

  if (core === 'localhost' || core === '::1' || core.endsWith('.localhost')) return true;
  if (core.endsWith('.local')) return true;

  const dotted = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(core);
  if (dotted) {
    const a = Number(dotted[1]);
    const b = Number(dotted[2]);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  if (/:/.test(core)) {
    if (core.startsWith('fe80:')) return true;
    if (/^fc/i.test(core) || /^fd[0-9a-f]/i.test(core)) return true;
  }

  return false;
}

function isHttpsPublicReachableSignatureOrigin(candidate) {
  const trimmed = trimOrigin(candidate);
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    if (u.protocol !== 'https:') return false;
    if (hostnameUnreachableFromMailboxProviders(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function readSignatureOriginEnv() {
  return {
    signatureEmailPublicBase:
      String(process.env.SIGNATURE_EMAIL_PUBLIC_SITE_BASE || '').trim() ||
      String(process.env.EXPO_PUBLIC_BUSINESS_SIGNATURE_PUBLIC_BASE || '').trim() ||
      String(process.env.EXPO_PUBLIC_SIGNATURE_EMAIL_PUBLIC_BASE || '').trim(),
    signatureQrImageBaseUrl:
      String(process.env.SIGNATURE_QR_IMAGE_BASE_URL || '').trim() ||
      String(process.env.EXPO_PUBLIC_SIGNATURE_QR_IMAGE_BASE_URL || '').trim(),
    businessWebBase:
      String(process.env.NEXT_PUBLIC_BUSINESS_WEB_BASE || '').trim() ||
      String(process.env.EXPO_PUBLIC_BUSINESS_WEB_BASE || '').trim() ||
      String(process.env.PUBLIC_UNIVERSAL_CARD_BASE_URL || '').trim(),
  };
}

function resolveSignatureCardPublicOrigin(inputs = readSignatureOriginEnv()) {
  const candidates = [
    trimOrigin(inputs.signatureEmailPublicBase || ''),
    trimOrigin(inputs.businessWebBase || ''),
  ].filter(Boolean);

  for (const c of candidates) {
    if (isHttpsPublicReachableSignatureOrigin(c)) return trimOrigin(c);
  }
  return trimOrigin(DEFAULT_SIGNATURE_PUBLIC_ORIGIN);
}

function resolveSignatureQrImageHostOrigin(cardCanonicalOrigin, inputs = readSignatureOriginEnv()) {
  const forced = trimOrigin(inputs.signatureQrImageBaseUrl || '');
  if (forced && isHttpsPublicReachableSignatureOrigin(forced)) return forced;
  return trimOrigin(cardCanonicalOrigin);
}

/** @param {{ publicUniversalCardBaseUrl?: string; publicVaultFileBaseUrl?: string }} env */
function resolveSignatureOriginsForEmail(env = {}) {
  const cardOrigin = resolveSignatureCardPublicOrigin();
  const apiOrigin = trimOrigin(env.publicVaultFileBaseUrl || 'https://api.cardsocial.me');
  const qrBase = resolveSignatureQrImageHostOrigin(cardOrigin);
  return { cardOrigin, apiOrigin, qrBase };
}

module.exports = {
  resolveSignatureOriginsForEmail,
  resolveSignatureCardPublicOrigin,
};
