/**
 * Correo servidor (Next `/api`) — mismo patrón que firma corporativa (`Authorization: Bearer idToken`).
 */
import { auth } from '@/services/firebaseConfig';
import { getPublicBusinessWebBaseUrlForEmailSignature } from '@/services/brandedQrService';

export type LegacyPhysicalBenefitMilestone = 'pvc_or_higher' | 'metal_card';

export async function requestLegacyPhysicalBenefitEmail(params: {
  milestone: LegacyPhysicalBenefitMilestone;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');

  const idToken = await user.getIdToken();
  const base = getPublicBusinessWebBaseUrlForEmailSignature().replace(/\/+$/, '');
  const res = await fetch(`${base}/api/legacy-path/benefit-notify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ milestone: params.milestone }),
  });

  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !data?.ok) {
    const code = data?.error || `http_${res.status}`;
    throw new Error(code);
  }
}
