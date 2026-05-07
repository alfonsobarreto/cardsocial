import { auth } from '@/services/firebaseConfig';
import type { AppLanguage } from '@/services/language';
import { appLanguageToRadarLang, getMarketRadarWebBaseUrl } from '@/services/marketRadarWebUrl';

async function waitAuthReady(): Promise<void> {
  const a = auth as { authStateReady?: () => Promise<void> };
  if (typeof a.authStateReady === 'function') {
    await a.authStateReady();
  }
}

/**
 * Calls Studio `POST /api/embed/mint-market-radar` with the app user's Firebase ID token.
 * Returns a short-lived `/embed/market-radar?et=…` URL for WebView (no Studio HTML login gate).
 */
export async function mintMarketRadarEmbedUrl(lang: AppLanguage): Promise<{ url: string; expiresIn?: number } | null> {
  const base = getMarketRadarWebBaseUrl();
  if (!base) return null;

  await waitAuthReady();
  const user = auth.currentUser;
  if (!user) return null;

  try {
    const idToken = await user.getIdToken(true);
    const radarLang = appLanguageToRadarLang(lang);
    const origin = base.replace(/\/+$/, '');
    const res = await fetch(`${origin}/api/embed/mint-market-radar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lang: radarLang }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; url?: string; expiresIn?: number };
    if (!data.ok || typeof data.url !== 'string' || !data.url.trim()) return null;
    return { url: data.url.trim(), expiresIn: data.expiresIn };
  } catch {
    return null;
  }
}
