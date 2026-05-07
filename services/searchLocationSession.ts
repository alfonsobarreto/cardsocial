/**
 * Ubicación solo para búsqueda en Social Market: lectura en primer plano, ventana fija de uso.
 * No revoca el permiso del SO; deja de exponer coordenadas en la app al expirar la sesión.
 */

import * as Location from 'expo-location';

export const SEARCH_LOCATION_SESSION_MS = 5 * 60 * 1000;

type SessionState = {
  latitude: number;
  longitude: number;
  zipcode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  geoLabel: string | null;
  expiresAt: number;
};

let session: SessionState | null = null;
let endTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeSearchLocationSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function endSearchLocationSession(): void {
  if (endTimer) {
    clearTimeout(endTimer);
    endTimer = null;
  }
  session = null;
  notify();
}

function scheduleExpiry() {
  if (endTimer) {
    clearTimeout(endTimer);
  }
  endTimer = setTimeout(() => {
    endTimer = null;
    session = null;
    notify();
  }, SEARCH_LOCATION_SESSION_MS);
}

/**
 * Solicita permiso en primer plano, obtiene una posición y abre sesión de SEARCH_LOCATION_SESSION_MS.
 */
export async function startSearchLocationSession(): Promise<
  | {
      ok: true;
      latitude: number;
      longitude: number;
      zipcode: string | null;
      city: string | null;
      region: string | null;
      country: string | null;
      geoLabel: string | null;
    }
  | { ok: false; reason: 'denied' | 'unavailable' }
> {
  endSearchLocationSession();

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return { ok: false, reason: 'denied' };
  }

  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });
    const latitude = pos.coords.latitude;
    const longitude = pos.coords.longitude;
    let zipcode: string | null = null;
    let city: string | null = null;
    let region: string | null = null;
    let country: string | null = null;
    let geoLabel: string | null = null;
    try {
      const places = await Location.reverseGeocodeAsync({ latitude, longitude });
      const place = places?.[0];
      zipcode = String(place?.postalCode || '').trim() || null;
      city = String(place?.city || place?.district || '').trim() || null;
      region = String(place?.region || '').trim() || null;
      country = String(place?.country || '').trim() || null;
      geoLabel = [city, region, zipcode].filter(Boolean).join(', ') || null;
    } catch {
      zipcode = null;
    }
    const expiresAt = Date.now() + SEARCH_LOCATION_SESSION_MS;
    session = { latitude, longitude, zipcode, city, region, country, geoLabel, expiresAt };
    scheduleExpiry();
    notify();
    return { ok: true, latitude, longitude, zipcode, city, region, country, geoLabel };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export function getSearchSessionCoordinates(): SessionState | null {
  if (!session) {
    return null;
  }
  if (Date.now() >= session.expiresAt) {
    endSearchLocationSession();
    return null;
  }
  return session;
}

export function getSearchSessionExpiresAt(): number | null {
  if (!session || Date.now() >= session.expiresAt) {
    if (session) {
      endSearchLocationSession();
    }
    return null;
  }
  return session.expiresAt;
}

export function isSearchLocationSessionActive(): boolean {
  return getSearchSessionExpiresAt() !== null;
}
