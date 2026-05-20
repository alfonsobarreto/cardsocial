import { auth } from '@/services/firebaseConfig';
import type { AppLanguage } from '@/services/language';
import { appLanguageToRadarLang } from '@/services/marketRadarWebUrl';

import marketRadarStudioBaseFromEnv from './marketRadarStudioBaseFromEnv';

async function waitAuthReady(): Promise<void> {
  const a = auth as { authStateReady?: () => Promise<void> };
  if (typeof a.authStateReady === 'function') {
    await a.authStateReady();
  }
}

export type PromotionsQrMarketRadarIssue = {
  code: string;
  detail?: string;
  httpStatus?: number;
};

export type PromotionsQrMarketRadarResult =
  | { ok: true; url: string; expiresIn: number }
  | { ok: false; issue: PromotionsQrMarketRadarIssue };

function logPromotionsQrRadarDev(message: string, payload?: Record<string, unknown>): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  if (message === 'ok') {
    console.log('[MarketRadar/promotions-qr]', payload ?? {});
    return;
  }
  if (payload !== undefined) {
    console.warn(`[MarketRadar/promotions-qr] ${message}`, payload);
  } else {
    console.warn(`[MarketRadar/promotions-qr] ${message}`);
  }
}

/**
 * Llama `POST /api/embed/promotions-qr-market-radar` del Studio con token Firebase ID.
 * Devuelve `/embed/market-radar?et=…`. El servidor firma ticket `et`; la sesión continúa tras el exchange con Firebase.
 */
export async function issuePromotionsQrMarketRadarUrl(
  lang: AppLanguage,
  options?: { originOverride?: string | null },
): Promise<PromotionsQrMarketRadarResult> {
  const overrideRaw =
    options?.originOverride != null ? String(options.originOverride).trim().replace(/\/+$/, '') : '';
  const base = overrideRaw || marketRadarStudioBaseFromEnv();
  if (!base) {
    logPromotionsQrRadarDev('fail', { code: 'studio_url_missing' });
    return { ok: false, issue: { code: 'studio_url_missing' } };
  }

  await waitAuthReady();
  const user = auth.currentUser;
  if (!user) {
    logPromotionsQrRadarDev('fail', { code: 'not_signed_in' });
    return { ok: false, issue: { code: 'not_signed_in' } };
  }

  try {
    const idToken = await user.getIdToken(true);
    const radarLang = appLanguageToRadarLang(lang);
    const origin = base.replace(/\/+$/, '');
    const acceptLanguage =
      lang === 'es'
        ? 'es-ES,es;q=0.9,en;q=0.8'
        : lang === 'it'
          ? 'it-IT,it;q=0.9,en;q=0.8'
          : lang === 'fr'
            ? 'fr-FR,fr;q=0.9,en;q=0.8'
            : lang === 'de'
              ? 'de-DE,de;q=0.9,en;q=0.8'
              : lang === 'pt'
                ? 'pt-BR,pt;q=0.9,en;q=0.8'
                : 'en-US,en;q=0.9';
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 35_000);
    let res: Response;
    try {
      res = await fetch(`${origin}/api/embed/promotions-qr-market-radar`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
          'Accept-Language': acceptLanguage,
        },
        signal: controller.signal,
        body: JSON.stringify({ lang: radarLang, publicOrigin: origin }),
      });
    } finally {
      clearTimeout(abortTimer);
    }

    let data: {
      ok?: boolean;
      url?: string;
      expiresIn?: number;
      error?: string;
      errorCode?: string;
      detail?: string;
    };
    try {
      data = (await res.json()) as typeof data;
    } catch {
      logPromotionsQrRadarDev('fail', {
        code: 'promotions_qr_studio_bad_response',
        httpStatus: res.status,
      });
      return {
        ok: false,
        issue: { code: 'promotions_qr_studio_bad_response', httpStatus: res.status },
      };
    }

    if (res.ok && data.ok && typeof data.url === 'string' && data.url.trim()) {
      const expiresIn = typeof data.expiresIn === 'number' ? data.expiresIn : 0;
      logPromotionsQrRadarDev('ok', { expiresIn });
      return { ok: true, url: data.url.trim(), expiresIn };
    }

    const machineCode =
      typeof data.errorCode === 'string' && data.errorCode.trim()
        ? data.errorCode.trim()
        : typeof data.error === 'string' && data.error.trim()
          ? data.error.trim()
          : `http_${res.status}`;
    const issue: PromotionsQrMarketRadarIssue = {
      code: machineCode,
      httpStatus: res.status,
      ...(typeof data.detail === 'string' && data.detail.trim() ? { detail: data.detail.trim() } : {}),
    };
    logPromotionsQrRadarDev('fail', {
      code: issue.code,
      httpStatus: issue.httpStatus,
      detailPreview: issue.detail?.slice(0, 200),
    });
    return { ok: false, issue };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    logPromotionsQrRadarDev('network error', {
      message: (e as Error)?.message,
      aborted,
    });
    return {
      ok: false,
      issue: {
        code: aborted ? 'promotions_qr_request_timeout' : 'network_unreachable',
      },
    };
  }
}
