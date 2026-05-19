'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { assignStudioLoginPage } from '@/lib/studioAuthClient';
import { StudioLocaleDropdown } from '@/components/studio/StudioLocaleDropdown';
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

function useStudioDevRadarBypass(searchParams: ReturnType<typeof useSearchParams>): boolean {
  return useMemo(() => {
    if (process.env.NODE_ENV !== 'development') return false;
    if (process.env.NEXT_PUBLIC_STUDIO_DEV_OPEN_RADAR === '1') return true;
    return searchParams.get('dev_open') === '1';
  }, [searchParams]);
}

function MarketRadarPageInner() {
  const searchParams = useSearchParams();
  const devBypass = useStudioDevRadarBypass(searchParams);
  const seedLocation = useMemo(() => {
    const lat = Number.parseFloat(searchParams.get('lat') ?? '');
    const lng = Number.parseFloat(searchParams.get('lng') ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  }, [searchParams]);
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
    if (devBypass) {
      setUser({ uid: 'studio-dev-open-radar', isAnonymous: true } as User);
      return;
    }
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
  }, [devBypass]);

  const t = useCallback((k: string, vars?: Record<string, string | number>) => studioT(locale, k, vars), [locale]);

  const setLocaleChip = (l: StudioLocale) => {
    setLocale(l);
    writeStoredLocale(l);
    const usp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    usp.set('lang', l);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', `${window.location.origin}/studio/market-radar?${usp.toString()}`);
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
          padding: '10px 14px',
          borderBottom: `1px solid ${studioTheme.border}`,
          background: 'linear-gradient(180deg, #0a0a0a 0%, #000 100%)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: 1, fontWeight: 900, color: studioTheme.textSubtle }}>
            {t('marketRadar.pageTitle')}
          </div>
          <div style={{ fontWeight: 900, fontSize: 13, color: studioTheme.gold }}>{studioT(locale, 'studio.brand')}</div>
        </div>
        <StudioLocaleDropdown locale={locale} onChange={setLocaleChip} label={studioT(locale, 'studio.localeMenu')} variant="header" />
      </header>

      <main style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 1200, margin: '0 auto' }}>
          <MarketRadar t={t} seedLocation={seedLocation} />
        </div>
      </main>
    </div>
  );
}

/**
 * Desde la app móvil usa `/embed/market-radar?et=…` (botón “Abrir radar”).
 * En `next dev`, `/studio/market-radar?dev_open=1` abre el mapa sin login (solo LAN; no uses en prod).
 */
export default function MarketRadarPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            background: studioTheme.bg,
            color: studioTheme.gold,
          }}
        >
          Loading…
        </div>
      }
    >
      <MarketRadarPageInner />
    </Suspense>
  );
}
