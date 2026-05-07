/**
 * Next.js frontend-web Studio base URL for embedding Market Radar in the native app (WebView).
 *
 * Dev (Expo device + laptop on LAN):
 * 1. In `frontend-web`: `npm run dev -- --hostname 0.0.0.0 --port 3001` (or your chosen port).
 * 2. In project root `.env`: `EXPO_PUBLIC_STUDIO_WEB_URL=http://<YOUR_LAN_IP>:3001`
 *    (physical device cannot use `localhost`; use the host machine’s Wi‑Fi IP).
 * 3. Run Expo (`npx expo start`) on the same network. Android cleartext is allowed in app.json;
 *    iOS allows local networking via NSAllowsLocalNetworking.
 *
 * Prod: set to your deployed Studio origin (https), e.g. `https://studio.cardsocial.me`.
 *
 * Optional override: `EXPO_PUBLIC_MARKET_RADAR_WEB_ORIGIN` (same shape, takes precedence).
 */
import type { AppLanguage } from '@/services/language';

export type StudioRadarLang = 'es' | 'en' | 'it' | 'fr' | 'pt';

export function getMarketRadarWebBaseUrl(): string | null {
  const raw =
    process.env.EXPO_PUBLIC_MARKET_RADAR_WEB_ORIGIN ??
    process.env.EXPO_PUBLIC_STUDIO_WEB_URL ??
    '';
  const s = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
  return s.length > 0 ? s : null;
}

export function appLanguageToRadarLang(lang: AppLanguage): StudioRadarLang {
  const map: Record<AppLanguage, StudioRadarLang> = {
    es: 'es',
    en: 'en',
    fr: 'fr',
    it: 'it',
    pt: 'pt',
    de: 'en',
  };
  return map[lang];
}

export function buildMarketRadarWebUri(baseUrl: string, lang: AppLanguage): string {
  const q = new URLSearchParams({ lang: appLanguageToRadarLang(lang) });
  return `${baseUrl.replace(/\/+$/, '')}/studio/market-radar?${q.toString()}`;
}
