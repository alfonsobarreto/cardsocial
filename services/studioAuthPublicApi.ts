/**
 * Resolución de nick para login: solo vía HTTP (Admin SDK en cardsocial.me u origen Expo).
 * No se consulta Firestore cliente (reglas bloquean); evita errores de permisos en UI.
 */
import { collection, getDocs, limit, query, where } from 'firebase/firestore';

import { auth, db } from '@/services/firebaseConfig';
import { resolveExpoPublicApiBaseUrl } from '@/services/expoPublicApiBaseUrl';
import marketRadarStudioBaseFromEnv from '@/services/marketRadarStudioBaseFromEnv';
import { firestoreFirstUserDocByNickLower } from '@/services/userIdentityFields';

export const SIGN_IN_EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PRIMARY_STUDIO_PUBLIC_ORIGIN = 'https://cardsocial.me';

function normalizeOrigin(base: string): string {
  return base.trim().replace(/\/+$/, '');
}

function parseEmailsFromResolveUsernameJson(j: unknown): string[] {
  if (typeof j !== 'object' || j === null) return [];
  const rec = j as { emails?: unknown; email?: string };
  const out: string[] = [];
  if (Array.isArray(rec.emails)) {
    for (const e of rec.emails) {
      const s = String(e || '')
        .trim()
        .toLowerCase();
      if (SIGN_IN_EMAIL_LIKE.test(s)) out.push(s);
    }
  }
  const single = String(rec.email || '')
    .trim()
    .toLowerCase();
  if (single && SIGN_IN_EMAIL_LIKE.test(single)) out.push(single);
  return [...new Set(out)];
}

function resolveModerationGatewayKey(): string | null {
  const key =
    process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim() ||
    process.env.EXPO_PUBLIC_API_GATEWAY_KEY?.trim() ||
    process.env.EXPO_PUBLIC_GATEWAY_KEY?.trim();
  return key || null;
}

async function resolveSignInEmailsViaModerationMongo(rawUsername: string): Promise<string[] | null> {
  const gatewayKey = resolveModerationGatewayKey();
  let baseUrl: string;
  try {
    baseUrl = resolveExpoPublicApiBaseUrl();
  } catch {
    return null;
  }
  if (!gatewayKey || !baseUrl) {
    return null;
  }
  const base = normalizeOrigin(baseUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`${base}/api/auth/resolve-sign-in-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-gateway-key': gatewayKey,
      },
      body: JSON.stringify({ username: rawUsername }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const j: unknown = await r.json().catch(() => null);
    if (r.ok && j && typeof j === 'object' && (j as { ok?: boolean }).ok === true) {
      return parseEmailsFromResolveUsernameJson(j);
    }
    return null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function resolveUsernameViaHttp(username: string, origin: string): Promise<string[] | null> {
  const base = normalizeOrigin(origin);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(`${base}/api/studio/resolve-username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const j: unknown = await r.json().catch(() => null);
    if (r.ok && j && typeof j === 'object' && (j as { ok?: boolean }).ok === true) {
      const list = parseEmailsFromResolveUsernameJson(j);
      if (list.length) return list;
    }
    if (r.status === 404) {
      return null;
    }
    return null;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function collectResolveUsernameOrigins(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    if (!raw) return;
    const n = normalizeOrigin(raw);
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  push(PRIMARY_STUDIO_PUBLIC_ORIGIN);
  push(marketRadarStudioBaseFromEnv() ?? '');
  return out;
}

/**
 * Resuelve nick (o email) → emails candidatos para Firebase Auth email/password.
 */
export async function resolveEmailCandidatesForSignIn(rawUsername: string): Promise<string[] | null> {
  const t = rawUsername.trim();
  if (!t) {
    return null;
  }
  if (t.includes('@')) {
    const lower = t.toLowerCase();
    if (!SIGN_IN_EMAIL_LIKE.test(lower)) return null;
    return [lower];
  }

  for (const origin of collectResolveUsernameOrigins()) {
    try {
      const list = await resolveUsernameViaHttp(t, origin);
      if (list?.length) return list;
    } catch (e) {
      console.warn('[studioAuthPublicApi] resolve-username HTTP failed', origin, e);
    }
  }

  /**
   * Último recurso (producción móvil): Mongo del backend moderation con gateway key.
   */
  try {
    const viaMongo = await resolveSignInEmailsViaModerationMongo(t);
    if (viaMongo?.length) {
      return viaMongo;
    }
  } catch (e) {
    console.warn('[studioAuthPublicApi] resolve-sign-in-email gateway failed', e);
  }

  return null;
}

export type SignupFieldKey = 'nickname' | 'email' | 'phone';

export type SignupFieldAvailabilityMap = Partial<Record<SignupFieldKey, 'available' | 'taken'>>;

async function fetchSignupAvailabilityFirestoreFallback(params: {
  nickname?: string;
  emailLower?: string;
  phoneNormalized?: string;
  ignoreUid?: string;
}): Promise<SignupFieldAvailabilityMap | null> {
  const usersRef = collection(db, 'users');
  const ignore = String(params.ignoreUid || '').trim();
  const out: SignupFieldAvailabilityMap = {};

  if (params.nickname != null && String(params.nickname).trim()) {
    const nick = String(params.nickname).trim();
    const nickLower = nick.toLowerCase();
    let taken = false;
    try {
      const nickDoc = await firestoreFirstUserDocByNickLower(db, nickLower);
      if (nickDoc && (!ignore || nickDoc.id !== ignore)) {
        taken = true;
      }
      if (!taken) {
        const byNick = await getDocs(query(usersRef, where('nickname', '==', nick), limit(1)));
        if (!byNick.empty && (!ignore || byNick.docs[0].id !== ignore)) {
          taken = true;
        }
      }
      if (!taken) {
        const byUserNick = await getDocs(query(usersRef, where('userNickName', '==', nick), limit(1)));
        if (!byUserNick.empty && (!ignore || byUserNick.docs[0].id !== ignore)) {
          taken = true;
        }
      }
    } catch {
      return null;
    }
    out.nickname = taken ? 'taken' : 'available';
  }

  if (params.emailLower != null && String(params.emailLower).trim()) {
    const emailLower = String(params.emailLower).trim().toLowerCase();
    try {
      const snap = await getDocs(query(usersRef, where('emailLower', '==', emailLower), limit(1)));
      const hit = !snap.empty && (!ignore || snap.docs[0].id !== ignore);
      out.email = hit ? 'taken' : 'available';
    } catch {
      return null;
    }
  }

  if (params.phoneNormalized != null && String(params.phoneNormalized).trim()) {
    const phoneNormalized = String(params.phoneNormalized).trim();
    try {
      const snap = await getDocs(query(usersRef, where('phoneNormalized', '==', phoneNormalized), limit(1)));
      const hit = !snap.empty && (!ignore || snap.docs[0].id !== ignore);
      out.phone = hit ? 'taken' : 'available';
    } catch {
      return null;
    }
  }

  return Object.keys(out).length ? out : null;
}

function collectSignupAvailabilityOrigins(): string[] {
  return collectResolveUsernameOrigins();
}

/**
 * Disponibilidad de nick / email / teléfono para registro (uno o varios campos).
 */
export async function fetchSignupFieldAvailability(params: {
  nickname?: string;
  emailLower?: string;
  phoneNormalized?: string;
  ignoreUid?: string;
}): Promise<SignupFieldAvailabilityMap | null> {
  const hasAny =
    (params.nickname != null && String(params.nickname).trim() !== '') ||
    (params.emailLower != null && String(params.emailLower).trim() !== '') ||
    (params.phoneNormalized != null && String(params.phoneNormalized).trim() !== '');

  if (!hasAny) {
    return null;
  }

  for (const base of collectSignupAvailabilityOrigins()) {
    try {
      const uid = auth.currentUser?.uid;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const r = await fetch(`${base}/api/studio/signup-availability`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            nickname: params.nickname,
            emailLower: params.emailLower,
            phoneNormalized: params.phoneNormalized,
            ignoreUid: params.ignoreUid ?? uid,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const j: unknown = await r.json().catch(() => null);
        if (r.ok && j && typeof j === 'object' && (j as { ok?: boolean }).ok === true) {
          const rec = j as {
            nickname?: 'available' | 'taken';
            email?: 'available' | 'taken';
            phone?: 'available' | 'taken';
          };
          const out: SignupFieldAvailabilityMap = {};
          if (rec.nickname === 'available' || rec.nickname === 'taken') out.nickname = rec.nickname;
          if (rec.email === 'available' || rec.email === 'taken') out.email = rec.email;
          if (rec.phone === 'available' || rec.phone === 'taken') out.phone = rec.phone;
          if (Object.keys(out).length) return out;
        }
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (e) {
      console.warn('[studioAuthPublicApi] signup-availability HTTP failed', base, e);
    }
  }

  return fetchSignupAvailabilityFirestoreFallback({
    nickname: params.nickname,
    emailLower: params.emailLower,
    phoneNormalized: params.phoneNormalized,
    ignoreUid: params.ignoreUid ?? auth.currentUser?.uid,
  });
}
