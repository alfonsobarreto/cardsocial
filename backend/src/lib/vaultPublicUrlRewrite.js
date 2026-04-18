/**
 * Reescribe URLs del proxy de vault al host público del despliegue (PUBLIC_VAULT_FILE_BASE_URL).
 * Evita devolver http://192.168… en JSON servido a https://cardsocial.me (contenido mixto / Next Image).
 */
const VAULT_FILE_RE = /\/(?:api\/qr\/vault-proxy|api\/vault)\/file\/([^/?#]+)/;

function rewriteVaultProxyUrl(rawUrl, publicBase) {
  const s = String(rawUrl || '').trim();
  const base = String(publicBase || '').replace(/\/+$/, '');
  if (!s || !base) return s || null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return s;
  }
  const m = u.pathname.match(VAULT_FILE_RE);
  if (!m?.[1]) return s;
  return `${base}/api/qr/vault-proxy/file/${m[1]}`;
}

function rewriteOptionalUrl(val, publicBase) {
  if (val == null || val === '') return val;
  return rewriteVaultProxyUrl(val, publicBase);
}

/**
 * @param {object} payload - fragmento de tarjeta pública
 * @param {string} publicBase - ej. https://api.cardsocial.me o https://cardsocial.me
 */
function rewritePublicCardMediaUrls(payload, publicBase) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = { ...payload };
  for (const key of ['ownerPhotoUrl', 'wallpaperUrl', 'wallpaperThumbUrl', 'userAvatarUrl']) {
    if (out[key] != null && String(out[key]).trim()) {
      out[key] = rewriteOptionalUrl(String(out[key]), publicBase);
    }
  }
  if (Array.isArray(out.slots)) {
    out.slots = out.slots.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const icon = row.icon != null && String(row.icon).trim() ? String(row.icon) : null;
      if (!icon) return row;
      return { ...row, icon: rewriteVaultProxyUrl(icon, publicBase) };
    });
  }
  return out;
}

module.exports = {
  rewriteVaultProxyUrl,
  rewritePublicCardMediaUrls,
};
