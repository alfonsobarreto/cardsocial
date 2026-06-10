/**
 * Firma HTML de Business Card para correo (paridad con `services/businessCardEmailSignatureHtml.ts`).
 * Tema: fallback fijo (evita depender de themeChest TS en el backend).
 */

const FALLBACK_CARD_ROW = {
  gradient: ['#F2F2F7', '#F2F2F7', '#F2F2F7'],
  borderColor: 'rgba(233,195,73,0.35)',
  borderWidth: 1,
  titleColor: '#1C1C1E',
  titleFontWeight: '800',
  titleFontStyle: 'normal',
  metaColor: '#636366',
  subtitleFontWeight: '600',
  subtitleFontStyle: 'normal',
  bubbleBackgroundColor: 'rgba(255,255,255,0.82)',
};

function escapeHtmlForEmail(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveAbsoluteImageUrlForEmail(raw, opts) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('https://') || s.startsWith('http://')) return s;
  const site = String(opts.siteOrigin || '').trim().replace(/\/+$/, '');
  const api = String(opts.apiOrigin || '').trim().replace(/\/+$/, '');
  if (!site && !api) return null;
  if (s.startsWith('/')) {
    if (s.startsWith('/api/') && api) return `${api}${s}`;
    if (site) return `${site}${s}`;
    return null;
  }
  if (!site) return null;
  return `${site}/${s.replace(/^\/+/, '')}`;
}

const VAULT_FILE_ID_RE =
  /^https?:\/\/[^/?#]+\/(?:api\/qr\/vault-proxy\/file|api\/vault\/file)\/([^/?#]+)/i;

function normalizeVaultLogoUrlForEmailSignature(raw, opts) {
  let abs = resolveAbsoluteImageUrlForEmail(raw, opts);
  if (!abs) return null;
  if (abs.startsWith('http://')) {
    abs = `https://${abs.slice('http://'.length)}`;
  }
  const m = abs.match(VAULT_FILE_ID_RE);
  const api = String(opts.apiOrigin || '').trim().replace(/\/+$/, '');
  if (m?.[1] && api) {
    return `${api}/api/qr/vault-proxy/file/${m[1]}`;
  }
  return /^https:\/\//i.test(abs) ? abs : null;
}

function initialsFromBcName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return '●';
  return parts.map((p) => (p[0] ? p[0].toUpperCase() : '')).join('') || '●';
}

function buildSignatureQrImageUrl(webBaseUrl, targetUrlForQr, pixelWidth = 240, logoUrlForQrCenter) {
  const base = String(webBaseUrl || '').trim().replace(/\/+$/, '');
  const size = Math.min(512, Math.max(96, Math.floor(pixelWidth)));
  const encodedTarget = encodeURIComponent(targetUrlForQr);
  const raw = String(logoUrlForQrCenter || '').trim();
  const logoOk = raw.startsWith('https://') || raw.startsWith('http://');
  const logoParam = logoOk ? `&logoUrl=${encodeURIComponent(raw)}` : '';
  return `${base}/api/qr/generate?format=png&width=${size}&url=${encodedTarget}${logoParam}`;
}

function buildBusinessCardEmailSignatureHtml(p) {
  const chest = FALLBACK_CARD_ROW;
  const cardBg = chest.gradient[2] ?? chest.gradient[1] ?? chest.gradient[0] ?? '#EAF7FF';
  const borderStyle = `${chest.borderWidth}px solid ${chest.borderColor}`;

  const title = escapeHtmlForEmail(String(p.bcName || 'Card-Social').trim());
  const sub = escapeHtmlForEmail(String(p.subtitle || '').trim().replace(/\s+/g, ' '));
  const linkText = escapeHtmlForEmail(String(p.publicCardUrl || '').trim());
  const linkHref = escapeHtmlForEmail(String(p.publicCardUrl || '').trim());
  const qrAlt = escapeHtmlForEmail(String(p.qrImageAlt ?? 'QR').trim() || 'QR');

  const rawLogo = String(p.logoUrl || '').trim();
  const normalizedLogo =
    p.emailLogoNormalize != null
      ? normalizeVaultLogoUrlForEmailSignature(rawLogo, p.emailLogoNormalize) ?? rawLogo
      : rawLogo;
  const logoForImg = String(normalizedLogo || '').trim();
  const logoImgSrcOk = /^https:\/\//i.test(logoForImg);
  const logoForQr = /^https:\/\//i.test(logoForImg) ? logoForImg : null;
  const logoSrc = escapeHtmlForEmail(logoForImg);
  const initials = escapeHtmlForEmail(initialsFromBcName(p.bcName));

  const qrSrc = escapeHtmlForEmail(
    buildSignatureQrImageUrl(p.webBaseUrl, p.publicCardUrl, 256, logoForQr),
  );

  const logoInner = logoImgSrcOk
    ? `<img src="${logoSrc}" alt="" width="70" height="70" style="display:block;width:70px;height:70px;border-radius:15px;border:${borderStyle};object-fit:cover;background-color:${chest.bubbleBackgroundColor};font-family:Arial,sans-serif;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:70px;height:70px;border-collapse:collapse;border-radius:15px;border:${borderStyle};background-color:rgba(255,255,255,0.4);"><tr><td align="center" valign="middle" style="font-family:Arial,sans-serif;font-size:20px;font-weight:800;font-style:normal;color:${chest.titleColor};">${initials}</td></tr></table>`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:${borderStyle};border-radius:16px;background-color:${cardBg};max-width:560px;font-family:Arial,Helvetica,sans-serif;">
<tr>
<td valign="middle" align="center" style="padding:14px 10px 14px 14px;width:74px;">${logoInner}</td>
<td valign="middle" style="padding:14px 8px;font-family:Arial,Helvetica,sans-serif;">
<div style="font-weight:${chest.titleFontWeight};font-style:${chest.titleFontStyle};font-size:17px;line-height:1.25;color:${chest.titleColor};">${title}</div>
${
  sub
    ? `<div style="margin-top:5px;font-weight:${chest.subtitleFontWeight};font-style:${chest.subtitleFontStyle};font-size:13px;line-height:1.35;color:${chest.metaColor};">${sub}</div>`
    : ''
}
<div style="margin-top:8px;font-size:11px;line-height:1.35;"><a href="${linkHref}" target="_blank" rel="noopener noreferrer" style="color:${chest.metaColor};text-decoration:underline;">${linkText}</a></div>
</td>
<td valign="middle" align="center" style="padding:12px 14px 12px 6px;width:72px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-radius:6px;background-color:#FFFFFF;padding:2px;line-height:0;">
<tr><td style="padding:0;margin:0;"><img src="${qrSrc}" alt="${qrAlt}" width="64" height="64" style="display:block;width:64px;height:64px;border:0;margin:0;" /></td></tr></table>
</td>
</tr>
</table>`;
}

function buildBusinessCardEmailSignaturePlainText(p) {
  const title = String(p.bcName || '').trim();
  const sub = String(p.subtitle || '').trim();
  const url = String(p.publicCardUrl || '').trim();
  return [title, sub, url].filter(Boolean).join('\n');
}

function wrapCorporateSignatureEmail(signatureHtmlFragment, locale, emailT) {
  const lang = locale === 'es' ? 'es' : 'en';
  const headline = escapeHtmlForEmail(emailT(locale, 'email_sig_wrap_headline'));
  const p1 = escapeHtmlForEmail(emailT(locale, 'email_sig_wrap_p1'));
  const p2 = escapeHtmlForEmail(emailT(locale, 'email_sig_wrap_p2'));

  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8" /></head>
<body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222;">
  <div style="max-width:640px;margin:0 auto;padding:28px 20px;">
    <h1 style="font-size:20px;line-height:1.3;margin:0 0 16px;color:#111;">${headline}</h1>
    <p style="font-size:15px;line-height:1.55;margin:0 0 12px;">${p1}</p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 28px;color:#444;">${p2}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0;">
      <tr><td style="padding:0;">${signatureHtmlFragment}</td></tr>
    </table>
  </div>
</body>
</html>`;
}

module.exports = {
  escapeHtmlForEmail,
  resolveAbsoluteImageUrlForEmail,
  buildBusinessCardEmailSignatureHtml,
  buildBusinessCardEmailSignaturePlainText,
  wrapCorporateSignatureEmail,
};
