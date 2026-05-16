import QRCode from 'qrcode';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

import { pickLocaleFromHeaders, userFacingMessageForErrorCode } from '@/lib/userFacingApiMessages';

export const runtime = 'nodejs';

const MAX_PAYLOAD_LEN = 4096;
const WIDTH_DEFAULT = 256;
const WIDTH_MIN = 64;
const WIDTH_MAX = 1024;

/** Misma referencia que `renderBusinessCardRow` en `cards.tsx` (QR 64 px). */
const REF_QR_PX = 64;
const REF_LOGO_PX = 16;
const REF_LOGO_MARGIN_PX = 2;

function clampWidth(raw: string | null): number {
  const n = raw == null ? NaN : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return WIDTH_DEFAULT;
  return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.floor(n)));
}

function isAllowedQrPayload(decoded: string): boolean {
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

function isAllowedLogoFetchUrl(decoded: string): boolean {
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

async function composeBrandedQrPng(qrBuffer: Buffer, outWidth: number, logoAbsoluteUrl: string): Promise<Buffer> {
  if (!isAllowedLogoFetchUrl(logoAbsoluteUrl)) {
    return qrBuffer;
  }

  const reserved = Math.round(((REF_LOGO_PX + 2 * REF_LOGO_MARGIN_PX) / REF_QR_PX) * outWidth);
  const logoDim = Math.round((REF_LOGO_PX / REF_QR_PX) * outWidth);
  const innerPad = Math.max(0, Math.floor((reserved - logoDim) / 2));

  let logoBin: Buffer;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const logoRes = await fetch(logoAbsoluteUrl, { signal: ctrl.signal });
    clearTimeout(t);
    if (!logoRes.ok) return qrBuffer;
    logoBin = Buffer.from(await logoRes.arrayBuffer());
    if (logoBin.length < 16) return qrBuffer;
  } catch {
    return qrBuffer;
  }

  let resizedLogo: Buffer;
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

function jsonError(status: number, errorCode: string, req: NextRequest) {
  const loc = pickLocaleFromHeaders(req.headers);
  return NextResponse.json(
    { error: userFacingMessageForErrorCode(errorCode, loc), errorCode },
    { status },
  );
}

export async function GET(req: NextRequest) {
  const rawParam = req.nextUrl.searchParams.get('url');
  if (rawParam == null || !String(rawParam).trim()) {
    return jsonError(400, 'QR_STUDIO_URL_MISSING', req);
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawParam);
  } catch {
    return jsonError(400, 'QR_STUDIO_URL_ENCODING_INVALID', req);
  }

  if (decoded.length > MAX_PAYLOAD_LEN) {
    return jsonError(400, 'QR_STUDIO_PAYLOAD_TOO_LONG', req);
  }

  if (!isAllowedQrPayload(decoded)) {
    const loc = pickLocaleFromHeaders(req.headers);
    return NextResponse.json(
      { error: userFacingMessageForErrorCode('SECURITY_LINK_REJECTED', loc), errorCode: 'SECURITY_LINK_REJECTED' },
      { status: 403 },
    );
  }

  const format = (req.nextUrl.searchParams.get('format') || 'png').toLowerCase();
  const width = clampWidth(req.nextUrl.searchParams.get('width'));

  const rawLogo = req.nextUrl.searchParams.get('logoUrl');
  let decodedLogoUrl: string | null = null;
  if (rawLogo != null && String(rawLogo).trim()) {
    try {
      const d = decodeURIComponent(rawLogo.trim());
      if (d.length < 8192 && isAllowedLogoFetchUrl(d)) {
        decodedLogoUrl = d;
      }
    } catch {
      /* ignore malformed logo query */
    }
  }

  const qrOptions = {
    width,
    margin: 2,
    errorCorrectionLevel: 'H' as const,
    color: {
      dark: '#0A2540',
      light: '#FFFFFF',
    },
  };

  try {
    if (format === 'svg') {
      if (decodedLogoUrl) {
        return jsonError(400, 'QR_STUDIO_SVG_LOGO_UNSUPPORTED', req);
      }
      const svg = await QRCode.toString(decoded, {
        type: 'svg',
        ...qrOptions,
      });
      return new NextResponse(svg, {
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      });
    }

    if (format !== 'png') {
      return jsonError(400, 'QR_STUDIO_FORMAT_UNSUPPORTED', req);
    }

    let buffer = await QRCode.toBuffer(decoded, {
      type: 'png',
      ...qrOptions,
    });

    if (decodedLogoUrl) {
      buffer = await composeBrandedQrPng(buffer, width, decodedLogoUrl);
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (e) {
    console.error('[api/qr/generate]', e);
    return jsonError(500, 'SERVER_INTERNAL_ERROR', req);
  }
}
