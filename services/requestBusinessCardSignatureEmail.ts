import { getPublicBusinessWebBaseUrl } from '@/services/brandedQrService';
import { auth } from '@/services/firebaseConfig';

type LocaleSig = 'es' | 'en';

export async function requestBusinessCardSignatureEmail(params: { bId: string; locale: LocaleSig }): Promise<void> {
  const bId = String(params.bId || '').trim();
  if (!bId) throw new Error('bId required');

  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');

  const idToken = await user.getIdToken();
  const base = getPublicBusinessWebBaseUrl().replace(/\/+$/, '');
  const res = await fetch(`${base}/api/email-signature/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bId: String(params.bId || '').trim(),
      locale: params.locale === 'es' ? 'es' : 'en',
    }),
  });

  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !data?.ok) {
    const code = data?.error || `http_${res.status}`;
    throw new Error(code);
  }
}
