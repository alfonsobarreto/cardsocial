import { auth } from '@/services/firebaseConfig';
import type { AppLanguage } from '@/services/language';
import { appLanguageToRadarLang, getMarketRadarWebBaseUrl } from '@/services/marketRadarWebUrl';

async function waitAuthReady(): Promise<void> {
  const a = auth as { authStateReady?: () => Promise<void> };
  if (typeof a.authStateReady === 'function') {
    await a.authStateReady();
  }
}

export type MintMarketRadarIssue = {
  code: string;
  detail?: string;
  httpStatus?: number;
};

export type MintMarketRadarResult =
  | { ok: true; url: string; expiresIn: number }
  | { ok: false; issue: MintMarketRadarIssue };

function logMintDev(message: string, payload?: Record<string, unknown>): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  if (message === 'ok') {
    console.log('[MarketRadar/mint] ok', payload ?? {});
    return;
  }
  if (payload !== undefined) {
    console.warn(`[MarketRadar/mint] ${message}`, payload);
  } else {
    console.warn(`[MarketRadar/mint] ${message}`);
  }
}

/**
 * Calls Studio `POST /api/embed/mint-market-radar` with the app user's Firebase ID token.
 * Returns `/embed/market-radar?et=…` for WebView. El `et` tiene TTL largo en servidor; la sesión continúa con Firebase tras el exchange.
 */
export async function mintMarketRadarEmbedUrl(lang: AppLanguage): Promise<MintMarketRadarResult> {
  const base = getMarketRadarWebBaseUrl();
  if (!base) {
    logMintDev('fail', { code: 'studio_url_missing' });
    return { ok: false, issue: { code: 'studio_url_missing' } };
  }

  await waitAuthReady();
  const user = auth.currentUser;
  if (!user) {
    logMintDev('fail', { code: 'not_signed_in' });
    return { ok: false, issue: { code: 'not_signed_in' } };
  }

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
      /**
       * `publicOrigin` debe coincidir con la base que usa Metro (`EXPO_PUBLIC_STUDIO_WEB_URL`).
       * El servidor arma la URL del embed con el mismo host para evitar tickets `http://localhost:…`
       * cuando el móvil necesita `http://<LAN>:3001` (WebView / navegador en blanco).
       */
      body: JSON.stringify({ lang: radarLang, publicOrigin: origin }),
    });

    let data: { ok?: boolean; url?: string; expiresIn?: number; error?: string; detail?: string };
    try {
      data = (await res.json()) as typeof data;
    } catch {
      logMintDev('fail', { code: 'mint_bad_response', httpStatus: res.status });
      return { ok: false, issue: { code: 'mint_bad_response', httpStatus: res.status } };
    }

    if (res.ok && data.ok && typeof data.url === 'string' && data.url.trim()) {
      const expiresIn = typeof data.expiresIn === 'number' ? data.expiresIn : 0;
      logMintDev('ok', { expiresIn });
      return { ok: true, url: data.url.trim(), expiresIn };
    }

    const code = typeof data.error === 'string' && data.error ? data.error : `http_${res.status}`;
    const issue: MintMarketRadarIssue = {
      code,
      httpStatus: res.status,
      ...(typeof data.detail === 'string' && data.detail.trim() ? { detail: data.detail.trim() } : {}),
    };
    logMintDev('fail', {
      code: issue.code,
      httpStatus: issue.httpStatus,
      detailPreview: issue.detail?.slice(0, 200),
    });
    return { ok: false, issue };
  } catch (e) {
    logMintDev('network error', { message: (e as Error)?.message });
    return { ok: false, issue: { code: 'network_unreachable' } };
  }
}
