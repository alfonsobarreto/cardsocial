import type { User } from 'firebase/auth';

import { adminBearer, readErrBody } from './adminApiAuth';

export type TrafficLightStatus = 'red' | 'yellow' | 'green';

export type BudgetSummaryResponse = {
  ok: true;
  generatedAt: string;
  monthlyActiveUsers: number;
  monthlyNetRevenueUsd: number | null;
  revenueSource: 'mongo_settings' | 'env' | 'missing' | 'payment_providers';
  revenueBreakdown?: {
    calendarMonthUtc: string;
    stripeUsd: number | null;
    revenueCatUsd: number | null;
    revenueCatMetricId: string | null;
    revenueCatPeriodNote: string | null;
    stripeError: string | null;
    revenueCatError: string | null;
    conservativeBlocked: boolean;
    allowPartialSum: boolean;
  } | null;
  retentionBudgetPercent: number;
  retentionBudgetUsd: number | null;
  trafficLight: {
    status: TrafficLightStatus;
    reasons: string[];
    messageEs: string;
    messageEn: string;
  };
  channelsUnlocked: boolean;
  channelActivationHistory: Array<{ channel: string; at: string }>;
  thresholds: {
    redUsersBelow: number;
    redRevenueBelow: number;
    greenUsersMin: number;
    greenRevenueMin: number;
  };
  disclaimers: string[];
};

export async function fetchBudgetSummary(firebaseUser: User): Promise<BudgetSummaryResponse> {
  const { base, key, token } = await adminBearer(firebaseUser, 'admin.system');
  const res = await fetch(`${base}/api/admin/budget-summary`, {
    method: 'GET',
    headers: {
      'x-api-gateway-key': key,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(await readErrBody(res));
  }
  const data = (await res.json()) as BudgetSummaryResponse;
  if (!data?.ok) throw new Error('budget-summary: invalid response');
  return data;
}

export async function putBudgetSettings(
  firebaseUser: User,
  body: { retentionBudgetPercent?: number; reportedMonthlyNetRevenueUsd?: number | null },
): Promise<void> {
  const { base, key, token } = await adminBearer(firebaseUser, 'admin.system');
  const res = await fetch(`${base}/api/admin/budget-settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-api-gateway-key': key,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await readErrBody(res));
  }
  const j = (await res.json()) as { ok?: boolean };
  if (!j?.ok) throw new Error('budget-settings: invalid response');
}
