import { getPublicBusinessWebBaseUrlForEmailSignature } from '@/services/brandedQrService';
import { resolveExpoPublicApiBaseUrl } from '@/services/expoPublicApiBaseUrl';
import { auth } from '@/services/firebaseConfig';
import { getCurrentI18nAppLanguage, toAcceptLanguageHeader } from '@/services/language';

type LocaleSig = 'es' | 'en';

const REQUEST_TIMEOUT_MS = 45_000;
const ID_TOKEN_TIMEOUT_MS = 20_000;

function resolveSignatureEmailPostUrl(): string {
  try {
    const api = resolveExpoPublicApiBaseUrl().replace(/\/+$/, '');
    return `${api}/api/email-signature/send`;
  } catch {
    const web = getPublicBusinessWebBaseUrlForEmailSignature().replace(/\/+$/, '');
    return `${web}/api/email-signature/send`;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getFirebaseIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('AUTH_REQUIRED');

  return Promise.race([
    user.getIdToken(),
    new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error('auth_token_timeout')), ID_TOKEN_TIMEOUT_MS);
    }),
  ]);
}

export async function requestBusinessCardSignatureEmail(params: { bId: string; locale: LocaleSig }): Promise<void> {
  const bId = String(params.bId || '').trim();
  if (!bId) throw new Error('bId required');

  const idToken = await getFirebaseIdToken();
  const lang = getCurrentI18nAppLanguage();
  const url = resolveSignatureEmailPostUrl();

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...toAcceptLanguageHeader(lang),
        },
        body: JSON.stringify({
          bId,
          locale: params.locale === 'es' ? 'es' : 'en',
        }),
      },
      REQUEST_TIMEOUT_MS,
    );
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('request_timeout');
    }
    throw e;
  }

  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; errorCode?: string } | null;
  if (!res.ok || !data?.ok) {
    const code =
      typeof data?.errorCode === 'string' && data.errorCode.trim()
        ? data.errorCode.trim()
        : data?.error || `http_${res.status}`;
    throw new Error(code);
  }
}
