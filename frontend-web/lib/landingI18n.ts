import type { Metadata } from 'next';

import executiveChrome from '@/locales/executiveChrome.json';
import landingLocales from '@/locales/landingLocales.json';

export type LandingLocale = 'en' | 'es';

function bucketForLocale(l: 'en' | 'es'): LandingLocale {
  return l === 'es' ? 'es' : 'en';
}

export type LandingCopy = (typeof landingLocales)['en'];

export function getLandingCopy(locale: LandingLocale): LandingCopy {
  const b = bucketForLocale(locale);
  return landingLocales[b];
}

/**
 * Flat string lookup for simple landing keys (matches `studioT` interpolation style).
 */
export function landingT(locale: LandingLocale, key: string, vars?: Record<string, string | number>): string {
  const dict = getLandingCopy(locale) as unknown as Record<string, string>;
  let s = dict[key] ?? (getLandingCopy('en') as unknown as Record<string, string>)[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

export function landingPageMetadata(locale: LandingLocale): Metadata {
  const m = getLandingCopy(locale).meta;
  return {
    title: m.title,
    description: m.description,
    openGraph: {
      title: m.ogTitle,
      description: m.ogDescription,
      url: m.ogUrl,
      siteName: m.siteName,
      locale: m.ogLocale,
      type: 'website',
    },
  };
}

type ExecChromeKey = keyof typeof executiveChrome.en;

export function execChromeT(locale: 'en' | 'es', key: ExecChromeKey): string {
  const b = bucketForLocale(locale);
  const row = executiveChrome[b] as Record<string, string>;
  const fallback = executiveChrome.en as Record<string, string>;
  return row[key] ?? fallback[key] ?? String(key);
}
