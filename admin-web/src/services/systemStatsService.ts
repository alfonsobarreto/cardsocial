import type { User } from 'firebase/auth';

import { adminBearer, readErrBody } from './adminApiAuth';

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

/**
 * Mongo agregados para el dashboard. Requiere en backend: ADMIN_SYSTEM_STATS_UIDS incluya el Firebase uid del super admin.
 */
export async function fetchSystemStats(firebaseUser: User): Promise<SystemStatsResponse> {
  const { base, key, token } = await adminBearer(firebaseUser, 'admin.system');

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
