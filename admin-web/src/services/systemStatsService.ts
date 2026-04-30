import type { User } from 'firebase/auth';

export type SystemStatsMongoRow = {
  subscriptionPlan: string;
  count: number;
};

export type SystemStatsResponse = {
  ok: true;
  generatedAt: string;
  business_cards_total: number;
  licenses: {
    active: number;
    expiring_next_7d: number;
  };
  mongo_users_by_subscription_plan: SystemStatsMongoRow[];
};

function apiBase(): string {
  const u = String(import.meta.env.VITE_BACKEND_API_URL || '').trim();
  if (!u) throw new Error('VITE_BACKEND_API_URL is not configured');
  return u.replace(/\/+$/, '');
}

function gatewayKey(): string {
  const k =
    String(import.meta.env.VITE_MODERATION_GATEWAY_KEY || '').trim() ||
    String(import.meta.env.VITE_API_GATEWAY_KEY || '').trim();
  if (!k) {
    throw new Error('VITE_MODERATION_GATEWAY_KEY (or VITE_API_GATEWAY_KEY) is not configured');
  }
  return k;
}

async function readErrBody(res: Response): Promise<string> {
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
 * Mongo agregados para el dashboard. Requiere en backend: ADMIN_SYSTEM_STATS_UIDS incluya el Firebase uid del super admin.
 */
export async function fetchSystemStats(firebaseUser: User): Promise<SystemStatsResponse> {
  const base = apiBase();
  const key = gatewayKey();
  const uid = firebaseUser.uid;

  const tokenRes = await fetch(`${base}/api/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-gateway-key': key,
    },
    body: JSON.stringify({ uid, scope: 'admin.system' }),
  });
  if (!tokenRes.ok) {
    throw new Error(await readErrBody(tokenRes));
  }
  const tokenJson = (await tokenRes.json()) as { token?: string };
  const token = String(tokenJson?.token || '').trim();
  if (!token) throw new Error('Token exchange returned empty token');

  const statsRes = await fetch(`${base}/api/admin/system-stats`, {
    method: 'GET',
    headers: {
      'x-api-gateway-key': key,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!statsRes.ok) {
    throw new Error(await readErrBody(statsRes));
  }
  const data = (await statsRes.json()) as SystemStatsResponse;
  if (!data?.ok) {
    throw new Error('system-stats: invalid response');
  }
  return data;
}
