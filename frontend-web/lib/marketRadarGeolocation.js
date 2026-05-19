/**
 * Geolocalización Market Radar — misma semántica que Social Market (`startSearchLocationSession`).
 * - Navegador / PC: `getCurrentPosition` (baja precisión primero, como `Accuracy.Low`) + reintentos + `watchPosition`.
 * - WebView Card-Social: `ReactNativeWebView.postMessage` → capa nativa expo-location.
 */

export const CS_NATIVE_LOCATION_REQUEST = 'cs-request-location';

export function isNativeCardSocialWebView() {
  return typeof window !== 'undefined' && typeof window.ReactNativeWebView?.postMessage === 'function';
}

/**
 * @returns {Promise<{ ok: true, latitude: number, longitude: number } | { ok: false, reason: 'denied' | 'unavailable', code?: number, message?: string }>}
 */
export function requestMarketRadarLocationAccess() {
  if (isNativeCardSocialWebView()) {
    return requestNativeCardSocialLocation();
  }
  return requestBrowserMarketRadarLocation();
}

function requestNativeCardSocialLocation() {
  return new Promise((resolve) => {
    const timeoutMs = 35_000;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('cs-native-location-result', onNativeResult);
      resolve(result);
    };

    const onNativeResult = (ev) => {
      const detail = ev?.detail;
      if (detail?.ok === true && Number.isFinite(detail.latitude) && Number.isFinite(detail.longitude)) {
        finish({ ok: true, latitude: detail.latitude, longitude: detail.longitude });
        return;
      }
      const reason = detail?.reason === 'denied' ? 'denied' : 'unavailable';
      finish({ ok: false, reason, message: String(detail?.reason || reason) });
    };

    const timer = window.setTimeout(() => {
      finish({ ok: false, reason: 'unavailable', message: 'native_location_timeout' });
    }, timeoutMs);

    window.addEventListener('cs-native-location-result', onNativeResult);
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: CS_NATIVE_LOCATION_REQUEST }));
    } catch (e) {
      finish({ ok: false, reason: 'unavailable', message: (e && e.message) || 'native_bridge_error' });
    }
  });
}

function getCurrentPositionPromise(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function watchPositionOnce(options) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation?.watchPosition) {
      reject(Object.assign(new Error('watch_not_supported'), { code: 2 }));
      return;
    }
    let watchId = null;
    const stop = () => {
      if (watchId != null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };
    const timer = window.setTimeout(() => {
      stop();
      reject(Object.assign(new Error('watch_timeout'), { code: 3 }));
    }, options.timeoutMs ?? 28_000);
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        window.clearTimeout(timer);
        stop();
        resolve(pos);
      },
      (err) => {
        window.clearTimeout(timer);
        stop();
        reject(err);
      },
      {
        enableHighAccuracy: options.enableHighAccuracy === true,
        maximumAge: options.maximumAge ?? 0,
        timeout: options.timeout ?? 22_000,
      },
    );
  });
}

function positionResultFromCoords(pos) {
  const latitude = pos?.coords?.latitude;
  const longitude = pos?.coords?.longitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, reason: 'unavailable', message: 'invalid_coords' };
  }
  return { ok: true, latitude, longitude };
}

function errorResultFromGeolocation(err) {
  const code = typeof err?.code === 'number' ? err.code : undefined;
  const message = typeof err?.message === 'string' ? err.message : String(err ?? 'unknown');
  if (code === 1) {
    return { ok: false, reason: 'denied', code, message };
  }
  return { ok: false, reason: 'unavailable', code, message };
}

/**
 * PC / navegador: prioriza Wi‑Fi / ubicación de Windows (baja precisión), luego GPS de alta precisión.
 * Paridad con `Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low })`.
 */
async function requestBrowserMarketRadarLocation() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { ok: false, reason: 'unavailable', message: 'geolocation_api_missing' };
  }

  const attempts = [
    { enableHighAccuracy: false, maximumAge: 0, timeout: 28_000, label: 'low_fresh' },
    { enableHighAccuracy: false, maximumAge: 120_000, timeout: 28_000, label: 'low_cached' },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 28_000, label: 'high_fresh' },
  ];

  let lastFail = { ok: false, reason: 'unavailable', message: 'no_attempt' };

  for (const attempt of attempts) {
    try {
      const pos = await getCurrentPositionPromise({
        enableHighAccuracy: attempt.enableHighAccuracy,
        maximumAge: attempt.maximumAge,
        timeout: attempt.timeout,
      });
      const result = positionResultFromCoords(pos);
      if (result.ok) return result;
      lastFail = result;
    } catch (err) {
      lastFail = errorResultFromGeolocation(err);
      console.warn('[MarketRadar/geolocation] getCurrentPosition failed:', {
        attempt: attempt.label,
        code: lastFail.code,
        message: lastFail.message,
      });
    }
  }

  try {
    const pos = await watchPositionOnce({
      enableHighAccuracy: false,
      maximumAge: 0,
      timeout: 22_000,
      timeoutMs: 30_000,
    });
    const result = positionResultFromCoords(pos);
    if (result.ok) return result;
    lastFail = result;
  } catch (err) {
    lastFail = errorResultFromGeolocation(err);
    console.warn('[MarketRadar/geolocation] watchPosition failed:', {
      code: lastFail.code,
      message: lastFail.message,
    });
  }

  return tryIpFallbackForGeolocationCodes(lastFail);
}

const IPAPI_JSON_URL = 'https://ipapi.co/json/';

/**
 * Aproximación por IP (escritorio cuando GPS del navegador falla).
 * @returns {Promise<{ ok: true, latitude: number, longitude: number, source?: string } | { ok: false, reason: string, message?: string }>}
 */
export async function fetchIpApproximateLocation() {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer =
    controller != null
      ? window.setTimeout(() => {
          controller.abort();
        }, 12_000)
      : null;
  try {
    const res = await fetch(IPAPI_JSON_URL, {
      method: 'GET',
      cache: 'no-store',
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) {
      return { ok: false, reason: 'unavailable', message: `ipapi_http_${res.status}` };
    }
    const data = await res.json();
    const latitude = Number(data?.latitude);
    const longitude = Number(data?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { ok: false, reason: 'unavailable', message: 'ipapi_invalid_coords' };
    }
    return { ok: true, latitude, longitude, source: 'ipapi' };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      reason: 'unavailable',
      message: aborted ? 'ipapi_timeout' : (err && err.message) || 'ipapi_fetch_failed',
    };
  } finally {
    if (timer != null) window.clearTimeout(timer);
  }
}

/**
 * Si GPS devolvió code 1 (denied) o 2 (unavailable), intenta ipapi.co antes del error final.
 * @param {{ ok?: boolean, reason?: string, code?: number, message?: string }} result
 */
export async function tryIpFallbackForGeolocationCodes(result) {
  if (result?.ok === true) return result;
  const code = typeof result?.code === 'number' ? result.code : null;
  if (code !== 1 && code !== 2) return result;

  const ip = await fetchIpApproximateLocation();
  if (ip.ok) {
    console.warn('[MarketRadar/geolocation] GPS failed (code %s); using IP approximation via ipapi.co', code);
    return { ...ip, code, message: 'ip_fallback' };
  }
  return result;
}
