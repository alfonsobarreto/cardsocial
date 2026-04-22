/**
 * Página HTML mínima para GET /b/:bId (misma ficha pública que Next.js cuando el API
 * se despliega sin proceso Next hijo; evita "Cannot GET /b/...").
 */

const { resolveCourtesyTheme } = require('./universalCourtesyHtml');

const SITE = 'https://cardsocial.me';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isHttpUrl(v) {
  return /^https?:\/\//i.test(String(v || '').trim());
}

/**
 * @param {Record<string, unknown>} data - JSON 200 de /api/public/business-card-preview (con ok, slots, etc.)
 * @param {{ bId: string, uid: string, isEs: boolean }} ctx
 */
function buildBusinessCardPublicPageHtml(data, { bId, uid, isEs }) {
  const theme = resolveCourtesyTheme(data.themeId);
  const cardName = String(data.cardName || data.ownerDisplayName || 'Card-Social');
  const ownerLine = String(data.ownerDisplayName || '').trim() || cardName;
  const occ = String(data.ownerOccupation || '').trim();
  const photo = String(data.ownerPhotoUrl || '').trim();
  const slots = Array.isArray(data.slots) ? data.slots : [];
  const appDeep = `card-social://business/${encodeURIComponent(bId)}?uid=${encodeURIComponent(uid)}&mode=permanent`;

  const title = `${escapeHtml(cardName)} — Card-Social`;
  const badge = isEs ? 'Tarjeta de negocio (permanente)' : 'Business card (permanent)';

  const tDown = isEs ? 'Obtener Card-Social' : 'Get Card-Social';
  const tOpen = isEs ? 'Abrir en la app' : 'Open in app';
  const footPrivacy = isEs ? 'Privacidad' : 'Privacy';
  const footTerms = isEs ? 'Términos' : 'Terms';
  const footUsage = isEs ? 'Uso' : 'Usage';
  const footSupport = isEs ? 'Soporte' : 'Support';

  const slotRows = slots
    .slice(0, 24)
    .map((s) => {
      const label = escapeHtml(s.label || '');
      const value = String(s.value || '').trim();
      const valEsc = escapeHtml(value);
      if (isHttpUrl(value)) {
        return `<li><a href="${escapeHtml(value)}" rel="noopener noreferrer" target="_blank">${label || valEsc}</a></li>`;
      }
      return `<li><span class="sl">${label ? `${label}: ` : ''}</span>${valEsc}</li>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="${isEs ? 'es' : 'en'}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="theme-color" content="${theme.bg[0]}"/>
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center;
      background: linear-gradient(180deg, ${theme.bg[0]}, ${theme.bg[1]}, ${theme.bg[2]});
      color: ${theme.tc}; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      padding: 24px 16px 40px; text-align: center;
    }
    .card {
      max-width: 22rem; width: 100%; background: ${theme.bb}; border: 1px solid ${theme.bc}44;
      border-radius: 16px; padding: 20px; box-shadow: 0 8px 28px rgba(0,0,0,0.08);
    }
    .badge { font-size: 0.75rem; font-weight: 500; color: ${theme.sc}; margin-bottom: 10px; }
    h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 6px; line-height: 1.25; }
    .occ { font-size: 0.9rem; color: ${theme.sc}; margin: 0 0 14px; }
    .ph { width: 96px; height: 96px; border-radius: 12px; object-fit: cover; margin: 0 auto 14px; display: block; background: #fff; }
    ul { text-align: left; padding: 0 0 0 1.1rem; margin: 10px 0 0; font-size: 0.92rem; }
    li { margin: 6px 0; word-break: break-word; }
    a { color: ${theme.ic}; }
    .sl { color: ${theme.sc}; }
    .cta { display: block; width: 100%; margin-top: 14px; padding: 12px 16px; border-radius: 12px; text-decoration: none; font-weight: 500; }
    .cta-primary { background: ${theme.bc}; color: ${theme.bg[0]}; }
    .cta-ghost { border: 2px solid ${theme.bc}; color: ${theme.ic}; }
    .legal-foot {
      margin-top: 22px; max-width: 24rem; font-size: 0.65rem; font-weight: 300; line-height: 1.55;
      color: ${theme.sc}; opacity: 0.9;
    }
    .legal-foot a { color: inherit; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${escapeHtml(badge)}</div>
    ${photo ? `<img class="ph" src="${escapeHtml(photo)}" alt=""/>` : ''}
    <h1>${escapeHtml(ownerLine)}</h1>
    ${occ ? `<p class="occ">${escapeHtml(occ)}</p>` : ''}
    ${cardName !== ownerLine ? `<p class="occ">${escapeHtml(cardName)}</p>` : ''}
    ${slotRows ? `<ul>${slotRows}</ul>` : ''}
    <a class="cta cta-primary" href="${SITE}">${tDown}</a>
    <a class="cta cta-ghost" href="${escapeHtml(appDeep)}">${tOpen}</a>
  </div>
  <footer class="legal-foot" aria-label="Legal">
    <a href="${SITE}/legal/privacidad" target="_blank" rel="noopener noreferrer">${footPrivacy}</a>
    <span aria-hidden="true"> · </span>
    <a href="${SITE}/legal/terminos" target="_blank" rel="noopener noreferrer">${footTerms}</a>
    <span aria-hidden="true"> · </span>
    <a href="${SITE}/legal/uso" target="_blank" rel="noopener noreferrer">${footUsage}</a>
    <span aria-hidden="true"> · </span>
    <a href="mailto:soporte@card-social.com?subject=Soporte%20Card-Social">${footSupport}</a>
  </footer>
</body>
</html>`;
}

function buildBusinessNotFoundHtml(isEs) {
  const dt = resolveCourtesyTheme();
  const title = isEs ? 'Card-Social — No encontrada' : 'Card-Social — Not found';
  const msg = isEs
    ? 'No se encontró esta tarjeta o el enlace no es válido.'
    : 'This card was not found or the link is invalid.';
  return `<!DOCTYPE html>
<html lang="${isEs ? 'es' : 'en'}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
  <style>
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
      background: linear-gradient(180deg, ${dt.bg[0]}, ${dt.bg[1]}, ${dt.bg[2]}); color: ${dt.tc};
      font-family: system-ui, sans-serif; padding: 24px; text-align: center; }
    p { max-width: 24rem; }
  </style>
</head>
<body><p>${msg}</p></body>
</html>`;
}

module.exports = {
  buildBusinessCardPublicPageHtml,
  buildBusinessNotFoundHtml,
};
