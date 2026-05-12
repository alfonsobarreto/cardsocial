import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';

import { resolveAdminApp, shouldLogFirebaseAdmin } from '@/lib/firebaseAdminStudio';
import { signStudioEmbedToken } from '@/lib/studioEmbedToken';

export const runtime = 'nodejs';

/** TTL del ticket `et` (solo hasta el exchange). Muy largo para uso desde la app; la sesión real es Firebase Auth. */
const EMBED_TTL_SEC = 10 * 365 * 24 * 60 * 60;

// ─── DIAGNÓSTICO 504 ──────────────────────────────────────────────────────────
/** Máximo tiempo en ms que permitimos para verifyIdToken antes de asumir timeout de red. */
const VERIFY_TOKEN_TIMEOUT_MS = 12_000;

function ts(): string {
  return `[${new Date().toISOString()}]`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`TIMEOUT after ${ms}ms: ${label}`));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
// ─────────────────────────────────────────────────────────────────────────────

/** Studio locale keys accepted for the embed URL (mirror `studioI18n`). */
function normalizeLang(raw: unknown): string {
  const s = String(raw || 'en').toLowerCase().split('-')[0] ?? 'en';
  return s === 'es' || s === 'en' || s === 'it' || s === 'fr' || s === 'pt' || s === 'de' ? s : 'en';
}

function embedSecretIssue(secret: string | undefined): 'embed_secret_missing' | 'embed_secret_too_short' | null {
  const s = secret?.trim() ?? '';
  if (!s) return 'embed_secret_missing';
  if (s.length < 16) return 'embed_secret_too_short';
  return null;
}

/**
 * Origin público de la página embed. Si el cliente envía `publicOrigin` y coincide con `Host`,
 * se usa (Expo + LAN); evita URLs `http://localhost:3001` en el ticket cuando el móvil abre `http://<IP>:3001`.
 */
function resolvePublicPageOrigin(req: Request, bodyPublicOrigin: unknown): string {
  const reqUrl = new URL(req.url);
  const requestOrigin = reqUrl.origin;

  const hostHeader = (req.headers.get('host') || '').trim().toLowerCase();
  const raw = typeof bodyPublicOrigin === 'string' ? bodyPublicOrigin.trim().replace(/\/+$/, '') : '';
  if (raw && /^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.username || parsed.password) {
        return requestOrigin;
      }
      if (!hostHeader || parsed.host.toLowerCase() !== hostHeader) {
        return requestOrigin;
      }
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return requestOrigin;
    }
  }

  const forwarded = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwarded) {
    const rawProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
    const safeProto = rawProto === 'http' || rawProto === 'https' ? rawProto : 'https';
    return `${safeProto}://${forwarded}`;
  }

  return requestOrigin;
}

/**
 * Mint an opaque `et` ticket for `/embed/market-radar` (TTL largo para clientes nativos; tras `/api/embed/exchange` manda Firebase).
 * Called from Expo with `Authorization: Bearer <Firebase ID token>` (fresh from `getIdToken`).
 *
 * ⚠️  DIAGNÓSTICO 504 ACTIVO — logging agresivo para identificar en qué paso se cuelga.
 *     Una vez resuelto el problema, revertir a la versión sin logs.
 */
export async function POST(req: Request) {
  const reqStart = Date.now();
  console.log(`${ts()} [mint-market-radar] >>> INICIO POST`);

  // ── PASO 1: verificar STUDIO_EMBED_SECRET ──────────────────────────────────
  console.log(`${ts()} [mint-market-radar] PASO 1: leyendo STUDIO_EMBED_SECRET (+${Date.now() - reqStart}ms)`);
  const secretRaw = process.env.STUDIO_EMBED_SECRET;
  const secretIssue = embedSecretIssue(secretRaw);
  if (secretIssue) {
    console.error(`${ts()} [mint-market-radar] FALLO PASO 1 — embed secret: ${secretIssue}`);
    if (shouldLogFirebaseAdmin()) {
      console.error('[mint-market-radar] 503 embed secret:', secretIssue);
    }
    return NextResponse.json({ ok: false, error: secretIssue }, { status: 503 });
  }
  const secret = secretRaw!.trim();
  console.log(`${ts()} [mint-market-radar] PASO 1 OK — secret len=${secret.length} (+${Date.now() - reqStart}ms)`);

  // ── PASO 2: resolveAdminApp ────────────────────────────────────────────────
  console.log(`${ts()} [mint-market-radar] PASO 2: resolveAdminApp() (+${Date.now() - reqStart}ms)`);
  const admin = resolveAdminApp();
  if (!admin.ok) {
    console.error(`${ts()} [mint-market-radar] FALLO PASO 2 — code=${admin.code} detail=${admin.detail} (+${Date.now() - reqStart}ms)`);
    if (shouldLogFirebaseAdmin()) {
      console.error('[mint-market-radar] 503', { error: admin.code, detail: admin.detail });
    }
    return NextResponse.json(
      { ok: false, error: admin.code, ...(admin.detail ? { detail: admin.detail } : {}) },
      { status: 503 },
    );
  }
  console.log(`${ts()} [mint-market-radar] PASO 2 OK — Firebase Admin app listo (+${Date.now() - reqStart}ms)`);

  // ── PASO 3: extraer Bearer token del header ────────────────────────────────
  console.log(`${ts()} [mint-market-radar] PASO 3: extrayendo Bearer token (+${Date.now() - reqStart}ms)`);
  const authHeader = req.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const idToken = match?.[1]?.trim();
  if (!idToken) {
    console.error(`${ts()} [mint-market-radar] FALLO PASO 3 — missing_bearer_token (+${Date.now() - reqStart}ms)`);
    return NextResponse.json({ ok: false, error: 'missing_bearer_token' }, { status: 401 });
  }
  console.log(`${ts()} [mint-market-radar] PASO 3 OK — token len=${idToken.length} (+${Date.now() - reqStart}ms)`);

  // ── PASO 4: verifyIdToken (PETICIÓN DE RED A GOOGLE — SOSPECHOSO DEL 504) ──
  console.log(`${ts()} [mint-market-radar] PASO 4: getAuth().verifyIdToken() — llamada de red a Google (+${Date.now() - reqStart}ms)`);
  let uid: string;
  try {
    const decoded = await withTimeout(
      getAuth(admin.app).verifyIdToken(idToken),
      VERIFY_TOKEN_TIMEOUT_MS,
      'getAuth().verifyIdToken()',
    );
    uid = decoded.uid;
    console.log(`${ts()} [mint-market-radar] PASO 4 OK — uid=${uid} (+${Date.now() - reqStart}ms)`);
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    const isTimeout = msg.startsWith('TIMEOUT');
    console.error(
      `${ts()} [mint-market-radar] FALLO PASO 4 — ${isTimeout ? '🔴 TIMEOUT (esto es el 504)' : 'error auth'}: ${msg} (+${Date.now() - reqStart}ms)`,
    );
    if (isTimeout) {
      // Devolver 504 explícito para distinguirlo de un 401 normal
      return NextResponse.json(
        { ok: false, error: 'verify_token_timeout', detail: 'Firebase verifyIdToken exceeded timeout. Likely a network issue in Azure reaching Google APIs.' },
        { status: 504 },
      );
    }
    return NextResponse.json({ ok: false, error: 'invalid_or_expired_id_token' }, { status: 401 });
  }

  // ── PASO 5: parsear body ───────────────────────────────────────────────────
  console.log(`${ts()} [mint-market-radar] PASO 5: parseando body (+${Date.now() - reqStart}ms)`);
  let lang = 'en';
  let bodyPublicOrigin: unknown;
  try {
    const body = (await req.json()) as { lang?: string; publicOrigin?: string };
    lang = normalizeLang(body?.lang);
    bodyPublicOrigin = body?.publicOrigin;
  } catch {
    /* empty body OK */
  }
  console.log(`${ts()} [mint-market-radar] PASO 5 OK — lang=${lang} (+${Date.now() - reqStart}ms)`);

  // ── PASO 6: firmar token y armar URL ───────────────────────────────────────
  console.log(`${ts()} [mint-market-radar] PASO 6: signStudioEmbedToken + buildUrl (+${Date.now() - reqStart}ms)`);
  const now = Math.floor(Date.now() / 1000);
  const et = signStudioEmbedToken({ v: 1, uid, iat: now, exp: now + EMBED_TTL_SEC }, secret);

  const origin = resolvePublicPageOrigin(req, bodyPublicOrigin);
  const q = new URLSearchParams({ et, lang });
  const url = `${origin.replace(/\/+$/, '')}/embed/market-radar?${q.toString()}`;
  console.log(`${ts()} [mint-market-radar] PASO 6 OK — url origin=${origin} (+${Date.now() - reqStart}ms)`);

  console.log(`${ts()} [mint-market-radar] <<< ÉXITO total en ${Date.now() - reqStart}ms`);
  return NextResponse.json({ ok: true, url, expiresIn: EMBED_TTL_SEC });
}
