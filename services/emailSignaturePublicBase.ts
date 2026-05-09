/** Origen público HTTPS para enlaces `/b/` y firma HTML (clientes de correo no cargan LAN ni `http`). */

const DEFAULT_SIGNATURE_PUBLIC_ORIGIN = 'https://cardsocial.me';

export function trimSignatureOriginSlashes(origin: string): string {
  return String(origin || '').trim().replace(/\/+$/, '');
}

function hostnameUnreachableFromMailboxProviders(hostname: string): boolean {
  const raw = hostname.toLowerCase();

  /** Host puede ser `[::1]`, zona `%eth0`, etc. */
  let core = raw;
  const zi = raw.indexOf('%');
  if (zi !== -1) {
    core = raw.slice(0, zi);
  }
  if (core.startsWith('[') && core.endsWith(']')) {
    core = core.slice(1, -1);
  }

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

  /** Common non-routable / link-local IPv6 scopes (not exhaustive). */
  if (/:/.test(core)) {
    if (core.startsWith('fe80:')) return true;
    if (/^fc/i.test(core) || /^fd[0-9a-f]/i.test(core)) return true;
    if (/^::$/.test(core) || /^::1$/.test(core)) return true;
  }

  return false;
}

/** `https`, no localhost ni IP privadas (lo que sí pueden pedir Gmail/Outlook al renderizar firma). */
export function isHttpsPublicReachableSignatureOrigin(candidate: string): boolean {
  const trimmed = trimSignatureOriginSlashes(candidate);
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

export type SignatureOriginEnvInputs = {
  /** Preferido en servidor (`SIGNATURE_EMAIL_PUBLIC_SITE_BASE`). */
  signatureEmailPublicBase?: string;
  /** Opcional solo para PNG del QR (`/api/qr/generate`); mismo esquema que antes. */
  signatureQrImageBaseUrl?: string;
  /** Normalmente `NEXT_PUBLIC_*` / `EXPO_PUBLIC_BUSINESS_WEB_BASE`. */
  businessWebBase?: string;
};

/** Lee env en Node o RN (`EXPO_PUBLIC_*` se inlined en build de Expo). */
export function readSignatureOriginEnvFromProcess(): SignatureOriginEnvInputs {
  if (typeof process === 'undefined') return {};
  const e = process.env || {};
  return {
    signatureEmailPublicBase:
      e.SIGNATURE_EMAIL_PUBLIC_SITE_BASE?.trim() ||
      e.EXPO_PUBLIC_BUSINESS_SIGNATURE_PUBLIC_BASE?.trim() ||
      e.EXPO_PUBLIC_SIGNATURE_EMAIL_PUBLIC_BASE?.trim(),
    signatureQrImageBaseUrl:
      e.SIGNATURE_QR_IMAGE_BASE_URL?.trim() || e.EXPO_PUBLIC_SIGNATURE_QR_IMAGE_BASE_URL?.trim(),
    businessWebBase:
      e.NEXT_PUBLIC_BUSINESS_WEB_BASE?.trim() ||
      e.EXPO_PUBLIC_BUSINESS_WEB_BASE?.trim() ||
      e.PUBLIC_UNIVERSAL_CARD_BASE_URL?.trim(),
  };
}

/** Origen de la tarjeta pública en firma correo (`/b/:id?uid=`). Ignora LAN / `http` / IP privada → cardsocial.me. */
export function resolveSignatureCardPublicOrigin(
  inputs: SignatureOriginEnvInputs = readSignatureOriginEnvFromProcess(),
): string {
  const candidates = [
    trimSignatureOriginSlashes(inputs.signatureEmailPublicBase || ''),
    trimSignatureOriginSlashes(inputs.businessWebBase || ''),
  ].filter(Boolean);

  for (const c of candidates) {
    if (isHttpsPublicReachableSignatureOrigin(c)) return trimSignatureOriginSlashes(c);
  }
  return trimSignatureOriginSlashes(DEFAULT_SIGNATURE_PUBLIC_ORIGIN);
}

/**
 * Host donde vive `/api/qr/generate`.
 * Solo si coincide con un origen público HTTPS; si no, reutiliza {@link resolveSignatureCardPublicOrigin}.
 */
export function resolveSignatureQrImageHostOrigin(
  cardCanonicalOrigin: string,
  inputs: SignatureOriginEnvInputs = readSignatureOriginEnvFromProcess(),
): string {
  const forced = trimSignatureOriginSlashes(inputs.signatureQrImageBaseUrl || '');
  if (forced && isHttpsPublicReachableSignatureOrigin(forced)) return forced;
  return trimSignatureOriginSlashes(cardCanonicalOrigin);
}
