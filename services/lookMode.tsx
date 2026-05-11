import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, AppState, useColorScheme as useSystemColorScheme } from 'react-native';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentLocation, hasLocationPermission } from '@/services/geolocationService';

/** sí = tema claro/oscuro del SO · auto = amanecer/atardecer por GPS */
export type LookMode = 'dia' | 'noche' | 'auto' | 'sistema';

const LOOK_MODE_STORAGE_KEY = 'card-social:look-mode';
const LOOK_MODE_SOLAR_CACHE_KEY = 'card-social:look-mode-solar-cache';

type AutoPrecision = 'gps' | 'cached' | 'fallback';

type SolarCache = {
  latitude: number;
  longitude: number;
  sunriseIso: string;
  sunsetIso: string;
  fetchedAtIso: string;
};

type LookModeContextValue = {
  mode: LookMode;
  resolvedMode: 'dia' | 'noche';
  setMode: (next: LookMode) => void;
  autoStatusText: string;
  autoPrecision: AutoPrecision;
};

const LookModeContext = createContext<LookModeContextValue | null>(null);

export function LookModeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<LookMode>('sistema');
  const [resolvedMode, setResolvedMode] = useState<'dia' | 'noche'>(() =>
    Appearance.getColorScheme() === 'dark' ? 'noche' : 'dia',
  );
  const [autoStatusText, setAutoStatusText] = useState('Auto inactivo');
  const [autoPrecision, setAutoPrecision] = useState<AutoPrecision>('fallback');
  const [autoRefreshTick, setAutoRefreshTick] = useState(0);
  const autoRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(LOOK_MODE_STORAGE_KEY);
        if (stored === 'dia' || stored === 'noche' || stored === 'auto' || stored === 'sistema') {
          setModeState(stored);
        }
      } catch {
        // Keep default mode if storage fails.
      }
    })();
  }, []);

  const setMode = (next: LookMode) => {
    setModeState(next);
    void AsyncStorage.setItem(LOOK_MODE_STORAGE_KEY, next).catch(() => null);
  };

  const parseSolarDate = (value: string | undefined): Date | null => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const resolveModeFromSolar = (sunriseIso: string, sunsetIso: string) => {
    const nowMs = Date.now();
    const sunrise = parseSolarDate(sunriseIso);
    const sunset = parseSolarDate(sunsetIso);
    if (!sunrise || !sunset) {
      return {
        mode: 'noche' as const,
        nextChangeMs: null as number | null,
      };
    }

    const sunriseMs = sunrise.getTime();
    const sunsetMs = sunset.getTime();
    const isDay = nowMs >= sunriseMs && nowMs < sunsetMs;
    const nextChangeMs = isDay ? sunsetMs : sunriseMs;

    return {
      mode: isDay ? ('dia' as const) : ('noche' as const),
      nextChangeMs,
    };
  };

  const fallbackByLocalHour = () => {
    const hour = new Date().getHours();
    const next = hour >= 6 && hour < 18 ? 'dia' : 'noche';
    setResolvedMode(next);
    setAutoPrecision('fallback');
    setAutoStatusText('Auto activo sin GPS (estimado local)');
  };

  const fetchSolar = async (latitude: number, longitude: number) => {
    const url = `https://api.sunrise-sunset.org/json?lat=${latitude}&lng=${longitude}&formatted=0`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`sun api error: ${response.status}`);
    }

    const payload = (await response.json()) as {
      status?: string;
      results?: {
        sunrise?: string;
        sunset?: string;
      };
    };

    if (payload.status !== 'OK' || !payload.results?.sunrise || !payload.results?.sunset) {
      throw new Error('sun api invalid payload');
    }

    return {
      sunriseIso: payload.results.sunrise,
      sunsetIso: payload.results.sunset,
    };
  };

  const loadSolarCache = async (): Promise<SolarCache | null> => {
    try {
      const raw = await AsyncStorage.getItem(LOOK_MODE_SOLAR_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SolarCache;
      if (
        typeof parsed.latitude !== 'number' ||
        typeof parsed.longitude !== 'number' ||
        typeof parsed.sunriseIso !== 'string' ||
        typeof parsed.sunsetIso !== 'string'
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const saveSolarCache = async (cache: SolarCache) => {
    await AsyncStorage.setItem(LOOK_MODE_SOLAR_CACHE_KEY, JSON.stringify(cache));
  };

  const scheduleNextAutoRefresh = (nextChangeMs: number | null) => {
    if (autoRefreshTimeoutRef.current) {
      clearTimeout(autoRefreshTimeoutRef.current);
      autoRefreshTimeoutRef.current = null;
    }
    if (!nextChangeMs) return;
    const delay = Math.max(5_000, nextChangeMs - Date.now() + 1_000);
    autoRefreshTimeoutRef.current = setTimeout(() => {
      setAutoRefreshTick((prev) => prev + 1);
    }, delay);
  };

  const resolveAutoMode = async () => {
    try {
      const permissionGranted = await hasLocationPermission();

      if (permissionGranted) {
        const currentLocation = await getCurrentLocation();
        if (currentLocation) {
          const solar = await fetchSolar(currentLocation.latitude, currentLocation.longitude);
          const resolved = resolveModeFromSolar(solar.sunriseIso, solar.sunsetIso);
          setResolvedMode(resolved.mode);
          setAutoPrecision('gps');
          setAutoStatusText(`Auto activo con GPS (${resolved.mode})`);
          scheduleNextAutoRefresh(resolved.nextChangeMs);

          await saveSolarCache({
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            sunriseIso: solar.sunriseIso,
            sunsetIso: solar.sunsetIso,
            fetchedAtIso: new Date().toISOString(),
          });
          return;
        }
      }

      const cached = await loadSolarCache();
      if (cached) {
        try {
          const freshSolar = await fetchSolar(cached.latitude, cached.longitude);
          const resolved = resolveModeFromSolar(freshSolar.sunriseIso, freshSolar.sunsetIso);
          setResolvedMode(resolved.mode);
          setAutoPrecision('cached');
          setAutoStatusText(`Auto activo con ubicacion en cache (${resolved.mode})`);
          scheduleNextAutoRefresh(resolved.nextChangeMs);

          await saveSolarCache({
            ...cached,
            sunriseIso: freshSolar.sunriseIso,
            sunsetIso: freshSolar.sunsetIso,
            fetchedAtIso: new Date().toISOString(),
          });
          return;
        } catch {
          const resolved = resolveModeFromSolar(cached.sunriseIso, cached.sunsetIso);
          setResolvedMode(resolved.mode);
          setAutoPrecision('cached');
          setAutoStatusText(`Auto activo con cache sin red (${resolved.mode})`);
          scheduleNextAutoRefresh(resolved.nextChangeMs);
          return;
        }
      }

      fallbackByLocalHour();
    } catch {
      fallbackByLocalHour();
    }
  };

  useEffect(() => {
    if (mode === 'dia') {
      if (autoRefreshTimeoutRef.current) {
        clearTimeout(autoRefreshTimeoutRef.current);
        autoRefreshTimeoutRef.current = null;
      }
      setResolvedMode('dia');
      setAutoStatusText('Modo manual: Dia');
      setAutoPrecision('fallback');
      return;
    }

    if (mode === 'noche') {
      if (autoRefreshTimeoutRef.current) {
        clearTimeout(autoRefreshTimeoutRef.current);
        autoRefreshTimeoutRef.current = null;
      }
      setResolvedMode('noche');
      setAutoStatusText('Modo manual: Noche');
      setAutoPrecision('fallback');
      return;
    }

    if (mode === 'sistema') {
      if (autoRefreshTimeoutRef.current) {
        clearTimeout(autoRefreshTimeoutRef.current);
        autoRefreshTimeoutRef.current = null;
      }
      const scheme = (systemScheme ?? Appearance.getColorScheme() ?? 'light') as 'light' | 'dark';
      const isDark = scheme === 'dark';
      setResolvedMode(isDark ? 'noche' : 'dia');
      setAutoStatusText(isDark ? 'Sistema: oscuro' : 'Sistema: claro');
      setAutoPrecision('fallback');
      return;
    }

    void resolveAutoMode();
  }, [mode, autoRefreshTick, systemScheme]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && mode === 'auto') {
        void resolveAutoMode();
      }
    });
    return () => sub.remove();
  }, [mode]);

  useEffect(() => {
    return () => {
      if (autoRefreshTimeoutRef.current) {
        clearTimeout(autoRefreshTimeoutRef.current);
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      mode,
      resolvedMode,
      setMode,
      autoStatusText,
      autoPrecision,
    }),
    [mode, resolvedMode, autoStatusText, autoPrecision]
  );

  return <LookModeContext.Provider value={value}>{children}</LookModeContext.Provider>;
}

export function useLookMode() {
  const context = useContext(LookModeContext);
  if (!context) {
    throw new Error('useLookMode must be used inside LookModeProvider');
  }
  return context;
}
