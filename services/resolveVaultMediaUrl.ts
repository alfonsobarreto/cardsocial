import { getApiBaseUrl } from '@/services/qrApi';

/**
 * Reescribe URLs del vault proxy al host configurado en la app (`EXPO_PUBLIC_MODERATION_API_URL`).
 *
 * En Mongo a veces queda una URL antigua (otra IP LAN, otro puerto, o http vs https). Android puede
 * ser permisivo; iOS (ATS) suele bloquear HTTP si el host no coincide con las excepciones del Info.plist.
 * Las imágenes no llevan JWT: el GET a vault-proxy es público por fileId.
 */
const VAULT_FILE_RE = /\/(?:api\/qr\/vault-proxy|api\/vault)\/file\/([^/?#]+)/;

export function resolveVaultMediaUrlForApp(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    return s;
  }
  const m = parsed.pathname.match(VAULT_FILE_RE);
  if (!m?.[1]) return s;
  const fileId = m[1];
  const base = getApiBaseUrl().replace(/\/+$/, '');
  return `${base}/api/qr/vault-proxy/file/${fileId}`;
}
