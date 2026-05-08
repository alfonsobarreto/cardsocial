'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithCustomToken, type User } from 'firebase/auth';
import MarketRadar from '@/components/MarketRadar.jsx';
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

type HandshakePhase = 'busy' | 'ready' | 'error';

/**
 * Native WebView entry: `/embed/market-radar?et=…&lang=es`
 */
export default function EmbedMarketRadarPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: studioTheme.bg, color: studioTheme.gold }}>
          Connecting your embedded session...
        </div>
      }
    >
      <EmbedMarketRadarContent />
    </Suspense>
  );
}

function EmbedMarketRadarContent() {
  const searchParams = useSearchParams();
  const langParam = searchParams.get('lang');
  const etParam = searchParams.get('et');
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [locale, setLocale] = useState<StudioLocale>('en');
  const [phase, setPhase] = useState<HandshakePhase>('busy');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromQ = studioLocaleFromQuery(langParam);
    const stored = readStoredLocale();
    setLocale(fromQ ?? stored ?? readBrowserLocale());
  }, [langParam]);

  useEffect(() => {
    const auth = getStudioAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!etParam) return;
    let cancelled = false;

    void (async () => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 35_000);
        const res = await fetch('/api/embed/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ et: etParam }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('exchange_failed');
        const data = (await res.json()) as { ok?: boolean; customToken?: string };
        if (!data.ok || !data.customToken) throw new Error('exchange_invalid');

        await signInWithCustomToken(getStudioAuth(), data.customToken);

        const l = studioLocaleFromQuery(langParam) ?? readStoredLocale() ?? readBrowserLocale();
        const usp = new URLSearchParams({ lang: l });
        if (typeof window !== 'undefined') {
          const embedPath = `${window.location.origin}/embed/market-radar?${usp.toString()}`;
          window.history.replaceState({}, '', embedPath);
        }

        if (!cancelled) setPhase('ready');
      } catch {
        if (!cancelled) setPhase('error');
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [etParam, langParam]);

  useEffect(() => {
    if (etParam) return;
    if (user === undefined) return;
    setPhase(user ? 'ready' : 'error');
  }, [etParam, user]);

  const t = useCallback((k: string, vars?: Record<string, string | number>) => studioT(locale, k, vars), [locale]);

  const setLocaleChip = (l: StudioLocale) => {
    setLocale(l);
    writeStoredLocale(l);
    const usp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    usp.set('lang', l);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', `${window.location.origin}/embed/market-radar?${usp.toString()}`);
    }
  };

  if (phase === 'error') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: studioTheme.bg,
          color: studioTheme.error,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div>
          <p style={{ fontWeight: 800, marginBottom: 8 }}>{studioT(locale, 'embed.radarHandshakeFailed')}</p>
          <p style={{ fontSize: 13, color: studioTheme.textMuted, maxWidth: 360 }}>
            {studioT(locale, 'embed.radarHandshakeHint')}
          </p>
        </div>
      </div>
    );
  }

  if (phase !== 'ready' || user === undefined || !user) {
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
        {studioT(locale, 'embed.radarSyncing')}
      </div>
    );
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
          <div style={{ fontSize: 9, marginTop: 2, color: studioTheme.goldLight, letterSpacing: 0.8 }}>
            {t('embed.radarNativeBadge')}
          </div>
        </div>
        <StudioLocaleDropdown locale={locale} onChange={setLocaleChip} label={studioT(locale, 'studio.localeMenu')} />
      </header>

      <main style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
        <div style={{ width: '100%', maxWidth: 1200, margin: '0 auto' }}>
          <MarketRadar t={t} />
        </div>
      </main>
    </div>
  );
}
