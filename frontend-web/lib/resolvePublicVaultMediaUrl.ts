/**
 * URLs del vault guardadas en Mongo suelen apuntar al host de desarrollo (http://192.168…/api/qr/vault-proxy/…).
 * En https://cardsocial.me el navegador bloquea HTTP (contenido mixto) y Next/Image solo permite orígenes permitidos.
 * Reescribimos rutas `/api/qr/vault-proxy/file/:id` y `/api/vault/file/:id` al API público del build.
 */
const VAULT_FILE_RE = /\/(?:api\/qr\/vault-proxy|api\/vault)\/file\/([^/?#]+)/;

export function getPublicVaultBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_PUBLIC_VAULT_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    'https://api.cardsocial.me';
  return raw.replace(/\/+$/, '');
}

export function resolvePublicVaultUrlForWeb(raw: string | null | undefined): string | null {
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
  const base = getPublicVaultBaseUrl();
  return `${base}/api/qr/vault-proxy/file/${fileId}`;
}
