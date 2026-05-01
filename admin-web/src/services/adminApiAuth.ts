import type { User } from 'firebase/auth';

export type AdminJwtScope = 'admin.system' | 'admin.broadcast';

export function apiBase(): string {
  const u = String(import.meta.env.VITE_BACKEND_API_URL || '').trim();
  if (!u) throw new Error('VITE_BACKEND_API_URL is not configured');
  return u.replace(/\/+$/, '');
}

export function gatewayKey(): string {
  const k =
    String(import.meta.env.VITE_MODERATION_GATEWAY_KEY || '').trim() ||
    String(import.meta.env.VITE_API_GATEWAY_KEY || '').trim();
  if (!k) {
    throw new Error('VITE_MODERATION_GATEWAY_KEY (or VITE_API_GATEWAY_KEY) is not configured');
  }
  return k;
}

export async function readErrBody(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    const m = String(j?.error || '').trim();
    if (m) return m;
  } catch {
    /* ignore */
  }
  return `HTTP ${res.status}`;
}

/**
 * Intercambia Firebase uid + scope por JWT de corta vida (mismo flujo que estadísticas / broadcast).
 */
export async function adminBearer(
  firebaseUser: User,
  scope: AdminJwtScope,
): Promise<{ base: string; key: string; token: string }> {
  const base = apiBase();
  const key = gatewayKey();
  const uid = firebaseUser.uid;
  const tokenRes = await fetch(`${base}/api/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-gateway-key': key,
    },
    body: JSON.stringify({ uid, scope }),
  });
  if (!tokenRes.ok) {
    throw new Error(await readErrBody(tokenRes));
  }
  const tokenJson = (await tokenRes.json()) as { token?: string };
  const token = String(tokenJson?.token || '').trim();
  if (!token) throw new Error('Token exchange returned empty token');
  return { base, key, token };
}
