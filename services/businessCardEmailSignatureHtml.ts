import { getCardRowTheme } from './cardRowTheme';

export type BusinessCardEmailSignatureParams = {
  /** Host sin barra final donde exista `GET /api/qr/generate` (típico: API Express, p. ej. `https://api.cardsocial.me`). */
  webBaseUrl: string;
  /** URL HTTPS de la tarjeta (misma que usa el QR en la lista «Mis tarjetas»). */
  publicCardUrl: string;
  bcName: string;
  subtitle: string;
  logoUrl?: string | null;
  themeId?: string;
};

export function escapeHtmlForEmail(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * URLs absolutas para `<img src>` en correo (Gmail exige absolutas).
 * - `https?://` y `//` se dejan / normalizan a https.
 * - Rutas que empiezan por `/api/` usan `apiOrigin` (host del backend).
 * - Otras rutas absolutas en sitio usan `siteOrigin`.
 * - Sin `/` inicial: se concatena a `siteOrigin`.
 */
export function resolveAbsoluteImageUrlForEmail(
  raw: string | null | undefined,
  opts: { siteOrigin: string; apiOrigin: string },
): string | null {
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

function initialsFromBcName(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return '●';
  return parts.map((p) => (p[0] ? p[0].toUpperCase() : '')).join('') || '●';
}

/**
 * `<img>` → `/api/qr/generate` con el mismo payload y branding que el QR de lista
 * (`generatePublicBusinessWebUrl` + logo centrado como en `cards.tsx`).
 */
export function buildSignatureQrImageUrl(
  webBaseUrl: string,
  targetUrlForQr: string,
  pixelWidth = 240,
  /** Misma `bcLogoUrl` renderizable (https) que usa el `QRCode` en la app. */
  logoUrlForQrCenter?: string | null,
): string {
  const base = String(webBaseUrl || '').trim().replace(/\/+$/, '');
  const size = Math.min(512, Math.max(96, Math.floor(pixelWidth)));
  const encodedTarget = encodeURIComponent(targetUrlForQr);
  const raw = String(logoUrlForQrCenter || '').trim();
  const logoOk = raw.startsWith('https://') || raw.startsWith('http://');
  const logoParam = logoOk ? `&logoUrl=${encodeURIComponent(raw)}` : '';
  return `${base}/api/qr/generate?format=png&width=${size}&url=${encodedTarget}${logoParam}`;
}

/**
 * Firma en tabla, calca de lista business: logo (70) | textos | QR (64 + marco blanco).
 */
export function buildBusinessCardEmailSignatureHtml(p: BusinessCardEmailSignatureParams): string {
  const chest = getCardRowTheme(p.themeId);
  const cardBg = chest.gradient[2] ?? chest.gradient[1] ?? chest.gradient[0] ?? '#EAF7FF';
  const borderStyle = `${chest.borderWidth}px solid ${chest.borderColor}`;

  const title = escapeHtmlForEmail((p.bcName || 'Card-Social').trim());
  const sub = escapeHtmlForEmail((p.subtitle || '').trim().replace(/\s+/g, ' '));
  const linkText = escapeHtmlForEmail(String(p.publicCardUrl || '').trim());
  const linkHref = escapeHtmlForEmail(String(p.publicCardUrl || '').trim());

  const rawLogo = String(p.logoUrl || '').trim();
  const logoOk = rawLogo.startsWith('https://') || rawLogo.startsWith('http://');
  const logoSrc = escapeHtmlForEmail(rawLogo);
  const initials = escapeHtmlForEmail(initialsFromBcName(p.bcName));

  const qrSrc = escapeHtmlForEmail(
    buildSignatureQrImageUrl(p.webBaseUrl, p.publicCardUrl, 256, logoOk ? rawLogo : null),
  );

  const logoInner = logoOk
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
<tr><td style="padding:0;margin:0;"><img src="${qrSrc}" alt="QR" width="64" height="64" style="display:block;width:64px;height:64px;border:0;margin:0;" /></td></tr></table>
</td>
</tr>
</table>`;
}

/** Texto simple para MIME `text/plain` en ClipboardItem / respaldo pegado como texto sin formato. */
export function buildBusinessCardEmailSignaturePlainText(p: {
  bcName: string;
  subtitle: string;
  publicCardUrl: string;
}): string {
  const title = String(p.bcName || '').trim();
  const sub = String(p.subtitle || '').trim();
  const url = String(p.publicCardUrl || '').trim();
  return [title, sub, url].filter(Boolean).join('\n');
}
