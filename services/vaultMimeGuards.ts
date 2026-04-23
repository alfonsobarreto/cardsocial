/**
 * Misma familia de reglas que el visor de documentos y el proxy de vault
 * (`/api/vault/file/…` y `/api/qr/vault-proxy/file/…`).
 */
const VAULT_FILE_PATH_RE = /\/(?:api\/qr\/vault-proxy|api\/vault)\/file\//i;

export function isVaultProxyFileUrl(value: string): boolean {
  return VAULT_FILE_PATH_RE.test(String(value || ''));
}

export function isVaultDocumentImage(value: string, mimeHint?: string): boolean {
  const m = String(mimeHint || '').toLowerCase();
  if (m.startsWith('image/')) {
    return true;
  }
  return (
    /\.(jpg|jpeg|png|gif|webp|bmp|heic)(\?|$)/i.test(value) ||
    (value.startsWith('file://') && !value.toLowerCase().endsWith('.pdf'))
  );
}

export function isVaultDocumentPdf(value: string, mimeHint?: string): boolean {
  const m = String(mimeHint || '').toLowerCase();
  if (m.includes('pdf') || m === 'application/pdf') {
    return true;
  }
  if (isVaultProxyFileUrl(value)) {
    return !m.startsWith('image/');
  }
  return /\.pdf(\?|$)/i.test(value);
}
