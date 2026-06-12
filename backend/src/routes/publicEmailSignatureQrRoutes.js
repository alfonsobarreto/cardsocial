/**
 * Firma HTML (correo): mismo contrato que `frontend-web/app/api/qr/generate/route.ts`
 * pero en Express — público (sin JWT) y sin depender de Next escuchando en 3001.
 */

const QRCode = require('qrcode');
const sharp = require('sharp');
const { buildUserFacingJson } = require('../lib/userFacingErrors');
const { brandColors } = require('../lib/brandTokens');

const MAX_PAYLOAD_LEN = 4096;
const WIDTH_DEFAULT = 256;
const WIDTH_MIN = 64;
const WIDTH_MAX = 1024;

const REF_QR_PX = 64;
const REF_LOGO_PX = 16;
const REF_LOGO_MARGIN_PX = 2;

function clampWidth(raw) {
  const n = raw == null ? NaN : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return WIDTH_DEFAULT;
  return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.floor(n)));
}

function isAllowedQrPayload(decoded) {
  try {
    const u = new URL(decoded);
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:') {
      const h = u.hostname.toLowerCase();
      return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    }
    return false;
  } catch {
    return false;
  }
}

function isAllowedLogoFetchUrl(decoded) {
  try {
    const u = new URL(decoded);
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:') {
      const h = u.hostname.toLowerCase();
      return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    }
    return false;
  } catch {
    return false;
  }
}

async function composeBrandedQrPng(qrBuffer, outWidth, logoAbsoluteUrl) {
  if (!isAllowedLogoFetchUrl(logoAbsoluteUrl)) {
    return qrBuffer;
  }

  const reserved = Math.round(((REF_LOGO_PX + 2 * REF_LOGO_MARGIN_PX) / REF_QR_PX) * outWidth);
  const logoDim = Math.round((REF_LOGO_PX / REF_QR_PX) * outWidth);
  const innerPad = Math.max(0, Math.floor((reserved - logoDim) / 2));

  let logoBin;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    const logoRes = await fetch(logoAbsoluteUrl, { signal: ac.signal });
    clearTimeout(t);
    if (!logoRes.ok) return qrBuffer;
    logoBin = Buffer.from(await logoRes.arrayBuffer());
    if (logoBin.length < 16) return qrBuffer;
  } catch {
    return qrBuffer;
  }

  let resizedLogo;
  try {
    resizedLogo = await sharp(logoBin)
      .resize(logoDim, logoDim, { fit: 'cover' })
      .png()
      .toBuffer();
  } catch {
    return qrBuffer;
  }

  const whitePad = await sharp({
    create: {
      width: reserved,
      height: reserved,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const padWithLogo = await sharp(whitePad)
    .composite([{ input: resizedLogo, left: innerPad, top: innerPad }])
    .png()
    .toBuffer();

  const offset = Math.round((outWidth - reserved) / 2);
  return sharp(qrBuffer)
    .composite([{ input: padWithLogo, left: offset, top: offset }])
    .png()
    .toBuffer();
}

/**
 * GET /api/qr/generate?format=png&width=256&url=…&logoUrl=… (logoUrl opcional)
 */
async function handlePublicEmailSignatureQr(req, res) {
  try {
    const rawParam = req.query.url;
    if (rawParam == null || !String(rawParam).trim()) {
      return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'QR_STUDIO_URL_MISSING'));
    }

    let decoded;
    try {
      decoded = decodeURIComponent(String(rawParam).trim());
    } catch {
      return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'QR_STUDIO_URL_ENCODING_INVALID'));
    }

    if (decoded.length > MAX_PAYLOAD_LEN) {
      return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'QR_STUDIO_PAYLOAD_TOO_LONG'));
    }

    if (!isAllowedQrPayload(decoded)) {
      return res.status(403).json(buildUserFacingJson(req, 'security_link', 'SECURITY_LINK_REJECTED'));
    }

    const format = String(req.query.format || 'png').toLowerCase();
    const width = clampWidth(req.query.width);

    let decodedLogoUrl = null;
    const rawLogo = req.query.logoUrl;
    if (rawLogo != null && String(rawLogo).trim()) {
      try {
        const d = decodeURIComponent(String(rawLogo).trim());
        if (d.length < 8192 && isAllowedLogoFetchUrl(d)) {
          decodedLogoUrl = d;
        }
      } catch {
        /* ignore */
      }
    }

    const qrOptions = {
      width,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: brandColors.midnightNavy,
        light: '#FFFFFF',
      },
    };

    if (format === 'svg') {
      if (decodedLogoUrl) {
        return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'QR_STUDIO_SVG_LOGO_UNSUPPORTED'));
      }
      const svg = await QRCode.toString(decoded, {
        type: 'svg',
        ...qrOptions,
      });
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      return res.status(200).send(svg);
    }

    if (format !== 'png') {
      return res.status(400).json(buildUserFacingJson(req, 'invalid_body', 'QR_STUDIO_FORMAT_UNSUPPORTED'));
    }

    let buffer = await QRCode.toBuffer(decoded, {
      type: 'png',
      ...qrOptions,
    });

    if (decodedLogoUrl) {
      buffer = await composeBrandedQrPng(buffer, width, decodedLogoUrl);
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.status(200).send(buffer);
  } catch (e) {
    console.error('[GET /api/qr/generate]', e?.message || e, e?.stack);
    return res.status(500).json(buildUserFacingJson(req, 'server_error', 'SERVER_INTERNAL_ERROR'));
  }
}

/**
 * Registrar **antes** de `app.use("/api/qr", gatewayKey…)`.
 */
function attachPublicEmailSignatureQrRoute(expressApp) {
  expressApp.get('/api/qr/generate', handlePublicEmailSignatureQr);
}

module.exports = {
  attachPublicEmailSignatureQrRoute,
  handlePublicEmailSignatureQr,
};
