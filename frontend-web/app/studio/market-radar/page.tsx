'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { assignStudioLoginPage } from '@/lib/studioAuthClient';
import { getStudioAuth } from '@/lib/studioFirebase';
import {
  readBrowserLocale,
  readStoredLocale,
  studioLocaleFromQuery,
  studioT,
  writeStoredLocale,
  type StudioLocale,
} from '@/lib/studioI18n';
import { studioTheme } from '@/lib/studioTheme';
import MarketRadar from '@/components/MarketRadar.jsx';

export default function MarketRadarPage() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [locale, setLocale] = useState<StudioLocale>('en');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const fromQ = studioLocaleFromQuery(params.get('lang'));
    const stored = readStoredLocale();
    setLocale(fromQ ?? stored ?? readBrowserLocale());
  }, []);

  useEffect(() => {
    const auth = getStudioAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        return;
      }
      assignStudioLoginPage({
        returnPathWithQuery: `${window.location.pathname}${window.location.search}`,
      });
    });
    return () => unsub();
  }, []);

  const t = useCallback((k: string, vars?: Record<string, string | number>) => studioT(locale, k, vars), [locale]);

  const setLocaleChip = (l: StudioLocale) => {
    setLocale(l);
    writeStoredLocale(l);
    const usp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    usp.set('lang', l);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', `${window.location.pathname}?${usp.toString()}`);
    }
  };

  if (user === undefined) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: studioTheme.bg,
          color: studioTheme.gold,
        }}
      >
        {studioT(locale, 'studio.sessionLoading')}
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div style={{ minHeight: '100vh', background: studioTheme.bg, color: studioTheme.text, display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 16px',
          borderBottom: `1px solid ${studioTheme.border}`,
          background: 'linear-gradient(180deg, #0a0a0a 0%, #000 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href={`/studio/bunker?lang=${locale}`}
            style={{
              color: studioTheme.goldLight,
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 700,
              border: `1px solid ${studioTheme.border}`,
              borderRadius: 8,
              padding: '8px 12px',
            }}
          >
            ← {t('marketRadar.backStudio')}
          </Link>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 1, fontWeight: 900, color: studioTheme.textSubtle }}>
              {t('marketRadar.pageTitle')}
            </div>
            <div style={{ fontWeight: 900, fontSize: 13, color: studioTheme.gold }}>{studioT(locale, 'studio.brand')}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['es', 'en', 'it', 'fr', 'pt'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocaleChip(l)}
              style={{
                padding: '6px 10px',
                border: `1px solid ${studioTheme.border}`,
                cursor: 'pointer',
                borderRadius: 8,
                background: locale === l ? studioTheme.gold : 'transparent',
                color: locale === l ? studioTheme.bg : studioTheme.textMuted,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {studioT(locale, `lang.${l}`)}
            </button>
          ))}
        </div>
      </header>

      <main style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 1200, margin: '0 auto' }}>
          <MarketRadar t={t} />
        </div>
      </main>
    </div>
  );
}
