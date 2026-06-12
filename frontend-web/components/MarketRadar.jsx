'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import zipBoundaries from '@/data/austinMetroZipOutlines.json';
import {
  NICHE_CATEGORIES,
  filterEventsByNiche,
  filterEventsByIntentKeyword,
  computeZipSeoMetrics,
  findZipFeatureForPoint,
  buildDensityGrid,
  sampleDensity,
} from '@/lib/mockIntelligenceService';
import {
  DATA_SOURCES,
  MarketTrendAggregator,
  eventsToGeoJSON,
  heatmapPaintForSource,
} from '@/lib/MarketTrendAggregator';
import {
  requestMarketRadarLocationAccess,
  tryIpFallbackForGeolocationCodes,
} from '@/lib/marketRadarGeolocation';
import { studioTheme } from '@/lib/studioTheme';
import {
  isGlobalDemoModeEnv,
  isGlobalDemoHeatmapEnabledClient,
  setGlobalDemoHeatmapEnabledClient,
} from '@/demo/searchDemand/demoSearchEvents';
import { mdiTrashCanOutline } from '@mdi/js';

const STYLE_URL = 'mapbox://styles/mapbox/dark-v11';

/** @param {object} feature GeoJSON Polygon feature */
function bboxFromPolygonFeature(feature) {
  const ring = feature?.geometry?.coordinates?.[0];
  if (!ring?.length) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const coord of ring) {
    const lng = coord[0];
    const lat = coord[1];
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLng)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

function readMapboxToken() {
  if (typeof process === 'undefined' || !process.env) return '';
  return (
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
    process.env.REACT_APP_MAPBOX_ACCESS_TOKEN ||
    ''
  );
}

/** @typedef {(key: string, vars?: Record<string, string | number>) => string} TFn */

function TargetGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Altura unificada fila búsqueda (iOS/Android WebView). */
const INTENT_ROW_H = 44;

function IconSearchGo({ color = '#1B1205' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="8" stroke={color} strokeWidth="2" />
      <path d="m21 21-4.3-4.3" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconClearIntent({ color = 'currentColor' }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden style={{ display: 'block' }}>
      <path d={mdiTrashCanOutline} fill={color} />
    </svg>
  );
}

/**
 * Hyper-Local Market Intent heatmap (Mapbox GL). Renders proprietary / internal points only.
 * @param {{ t: TFn, seedLocation?: { lat: number, lng: number } | null }} props
 */
export default function MarketRadar({ t, seedLocation = null }) {
  const wrapRef = useRef(null);
  const mapRef = useRef(null);
  const hoverRef = useRef(null);
  const densityRef = useRef(buildDensityGrid([], 0.04));
  const nicheRef = useRef('all');
  const intentAppliedRef = useRef('');
  const pendingUserLocRef = useRef(null);
  const pendingFitBoundsRef = useRef(null);
  const seedAppliedRef = useRef(false);
  const applyLocatedRef = useRef(null);
  /** @type {'pending' | 'granted' | 'denied'} */
  const [geoAccess, setGeoAccess] = useState('pending');
  const [mapReady, setMapReady] = useState(false);
  const [niche, setNiche] = useState('all');
  const [appliedIntentKeyword, setAppliedIntentKeyword] = useState('');
  const [intentDraft, setIntentDraft] = useState('');
  const [locatedPos, setLocatedPos] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locateAvailable, setLocateAvailable] = useState(false);
  const [locateFeedback, setLocateFeedback] = useState(null);

  const [dataSource, setDataSource] = useState(() =>
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_GLOBAL_DEMO_MODE === '1'
      ? DATA_SOURCES.GLOBAL_DEMAND
      : DATA_SOURCES.APP_NETWORK,
  );
  const [activeEvents, setActiveEvents] = useState([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [demoHeatmapRev, setDemoHeatmapRev] = useState(0);
  const [demoHeatmapOn, setDemoHeatmapOn] = useState(true);
  const dataSourceRef = useRef(dataSource);
  useEffect(() => {
    dataSourceRef.current = dataSource;
  }, [dataSource]);

  const token = typeof window !== 'undefined' ? readMapboxToken() : '';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (readMapboxToken()) return;
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[MarketRadar] Map disabled: missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN. Add it to frontend-web/.env.local and restart dev, or set it on your host for production.',
      );
    }
  }, []);

  const aggregatorRef = useRef(null);
  if (aggregatorRef.current === null) {
    aggregatorRef.current = new MarketTrendAggregator();
  }

  useEffect(() => {
    if (!isGlobalDemoModeEnv()) return;
    setDemoHeatmapOn(isGlobalDemoHeatmapEnabledClient());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setLocateAvailable(typeof navigator !== 'undefined' && !!navigator.geolocation);
  }, []);

  function locateMessageForAccessReason(result, tFn) {
    if (result?.reason === 'denied') return tFn('marketRadar.locateErrorDenied');
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      const host = window.location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') {
        return tFn('marketRadar.locateErrorInsecure');
      }
    }
    return tFn('marketRadar.locateErrorDesktop');
  }

  function applyLocationFromGps(latitude, longitude, tFn) {
    const lng = longitude;
    const lat = latitude;
    applyLocatedRef.current?.(lng, lat);
    const zipFeature = findZipFeatureForPoint(zipBoundaries, lng, lat);
    if (!zipFeature) {
      setLocateFeedback(tFn('marketRadar.locateOutsideZip'));
    } else {
      setLocateFeedback(null);
    }
  }

  /** Heatmap: carga al montar (no depende del GPS; la ubicación solo mueve el mapa al ZIP). */
  useEffect(() => {
    let cancelled = false;
    const keyword = appliedIntentKeyword.trim();

    setSourceLoading(true);
    aggregatorRef.current
      .fetch(dataSource, { niche, intentKeyword: keyword })
      .then((events) => {
        if (cancelled) return;
        setActiveEvents(events);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[MarketRadar] Aggregator fetch failed:', err);
        setActiveEvents([]);
      })
      .finally(() => {
        if (cancelled) return;
        setSourceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dataSource, niche, appliedIntentKeyword, demoHeatmapRev]);

  /** Niche + keyword filters apply on top of the active source corpus. */
  const filteredEvents = useMemo(() => {
    let list = filterEventsByNiche(activeEvents, niche);
    list = filterEventsByIntentKeyword(list, appliedIntentKeyword);
    return list;
  }, [activeEvents, niche, appliedIntentKeyword]);

  const zipMetrics = useMemo(() => {
    if (!locatedPos) return null;
    return computeZipSeoMetrics(zipBoundaries, locatedPos.lng, locatedPos.lat, filteredEvents);
  }, [locatedPos, filteredEvents]);

  const geojson = useMemo(() => eventsToGeoJSON(filteredEvents), [filteredEvents]);

  const geojsonRef = useRef(geojson);
  useEffect(() => {
    geojsonRef.current = geojson;
  }, [geojson]);

  const density = useMemo(() => buildDensityGrid(filteredEvents, 0.04), [filteredEvents]);

  useEffect(() => {
    densityRef.current = density;
  }, [density]);

  useEffect(() => {
    nicheRef.current = niche;
  }, [niche]);

  useEffect(() => {
    intentAppliedRef.current = appliedIntentKeyword;
  }, [appliedIntentKeyword]);

  const nicheOptions = useMemo(() => [{ value: 'all', labelKey: 'marketRadar.nicheAll' }, ...NICHE_CATEGORIES.map((c) => ({ value: c, labelKey: `marketRadar.niche.${c}` }))], []);

  useEffect(() => {
    let map = mapRef.current;
    if (!map || !mapReady) return;

    function onHover(ev) {
      const tooltip = hoverRef.current;
      if (!tooltip) return;
      const lngLat = ev.lngLat;
      const d = sampleDensity(densityRef.current, lngLat.lng, lngLat.lat);
      const HOT = 48;
      if (d >= HOT) {
        tooltip.style.display = 'block';
        tooltip.style.left = `${ev.point.x + 12}px`;
        tooltip.style.top = `${ev.point.y + 12}px`;
        const scoped = nicheRef.current;
        const iq = intentAppliedRef.current.trim();
        tooltip.innerHTML = [
          `<strong style="color:#FFD700">${escapeHtml(t('marketRadar.tooltipTitle'))}</strong>`,
          `<div style="margin-top:6px;color:${studioTheme.textMuted}">${escapeHtml(t('marketRadar.tooltipSignals', { n: String(d) }))}</div>`,
          scoped !== 'all'
            ? `<div style="margin-top:4px;color:${studioTheme.textSubtle};font-size:11px">${escapeHtml(t('marketRadar.tooltipNicheScoped', { niche: escapeHtml(t(`marketRadar.niche.${scoped}`)) }))}</div>`
            : '',
          iq
            ? `<div style="margin-top:4px;color:${studioTheme.textSubtle};font-size:11px">${escapeHtml(t('marketRadar.tooltipIntentFilter', { q: iq }))}</div>`
            : '',
        ].join('');
      } else {
        tooltip.style.display = 'none';
      }
    }

    function hideTooltip() {
      if (hoverRef.current) hoverRef.current.style.display = 'none';
    }

    map.on('mousemove', onHover);
    map.on('mouseout', hideTooltip);

    return () => {
      map.off('mousemove', onHover);
      map.off('mouseout', hideTooltip);
    };
  }, [mapReady, t]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (!token) {
      console.warn(
        '[MarketRadar] Mapbox not initialized: NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN (or REACT_APP_MAPBOX_ACCESS_TOKEN) is empty in this build.',
      );
      return;
    }

    mapboxgl.accessToken = token;

    let disposed = false;
    let resizeObserver = null;

    const map = new mapboxgl.Map({
      container: el,
      style: STYLE_URL,
      center: [0, 20],
      zoom: 1.5,
      minZoom: 1,
      maxZoom: 17,
      pitch: 0,
      attributionControl: true,
      dragRotate: false,
      pitchWithRotate: false,
      projection: 'mercator',
    });

    mapRef.current = map;

    map.on('error', (e) => {
      console.error('[MarketRadar] Mapbox runtime error:', e?.error ?? e);
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 100, unit: 'imperial' }), 'bottom-left');

    map.on('load', () => {
      if (disposed) return;

      map.addSource('zip-boundaries', {
        type: 'geojson',
        data: zipBoundaries,
      });
      map.addLayer({
        id: 'zip-fill',
        type: 'fill',
        source: 'zip-boundaries',
        paint: {
          'fill-color': '#000',
          'fill-opacity': 0.04,
        },
      });

      map.addSource('search-intelligence', {
        type: 'geojson',
        data: geojsonRef.current,
      });
      const initialPaint = heatmapPaintForSource(dataSourceRef.current);
      map.addLayer({
        id: 'intent-heatmap',
        type: 'heatmap',
        source: 'search-intelligence',
        paint: {
          'heatmap-weight': initialPaint['heatmap-weight'],
          'heatmap-intensity': initialPaint['heatmap-intensity'],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(255,215,0,0)',
            0.12,
            'rgba(255,215,0,0.08)',
            0.35,
            'rgba(255,215,0,0.42)',
            0.72,
            'rgba(255,215,0,0.82)',
            1,
            '#FFD700',
          ],
          'heatmap-radius': initialPaint['heatmap-radius'],
          'heatmap-opacity': initialPaint['heatmap-opacity'],
        },
      });

      map.addLayer({
        id: 'zip-outline',
        type: 'line',
        source: 'zip-boundaries',
        paint: {
          'line-color': 'rgba(255,215,0,0.35)',
          'line-width': 0.85,
          'line-opacity': 0.9,
        },
      });

      setMapReady(true);

      const pendingLoc = pendingUserLocRef.current;
      if (pendingLoc) {
        applyUserLocationMarker(pendingLoc.lng, pendingLoc.lat);
        pendingUserLocRef.current = null;
      }
      const pendingZip = pendingFitBoundsRef.current;
      if (pendingZip) {
        fitMapToZipFeature(pendingZip);
        pendingFitBoundsRef.current = null;
      }

      resizeObserver = new ResizeObserver(() => {
        map.resize();
      });
      resizeObserver.observe(el);
    });

    return () => {
      disposed = true;
      try {
        if (resizeObserver) resizeObserver.disconnect();
      } catch {
        /* ignore */
      }
      try {
        map.remove();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
      setMapReady(false);
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('search-intelligence');
    if (src && typeof src.setData === 'function') {
      src.setData(geojson);
    }
  }, [geojson, mapReady]);

  /** Re-apply heatmap paint whenever the active data source changes. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const paint = heatmapPaintForSource(dataSource);
    try {
      map.setPaintProperty('intent-heatmap', 'heatmap-weight', paint['heatmap-weight']);
      map.setPaintProperty('intent-heatmap', 'heatmap-intensity', paint['heatmap-intensity']);
      map.setPaintProperty('intent-heatmap', 'heatmap-radius', paint['heatmap-radius']);
      map.setPaintProperty('intent-heatmap', 'heatmap-opacity', paint['heatmap-opacity']);
    } catch {
      /* Layer may be torn down during fast-refresh; safe to ignore. */
    }
  }, [dataSource, mapReady]);

  function fitMapToZipFeature(feature) {
    const map = mapRef.current;
    const bbox = bboxFromPolygonFeature(feature);
    if (!bbox || !map) return false;
    const bounds = new mapboxgl.LngLatBounds(bbox[0], bbox[1]);
    if (map.isStyleLoaded()) {
      map.fitBounds(bounds, { padding: 20 });
      pendingFitBoundsRef.current = null;
      return true;
    }
    pendingFitBoundsRef.current = feature;
    return false;
  }

  function applyLocatedPosition(lng, lat) {
    setLocatedPos({ lng, lat });
    const zipFeature = findZipFeatureForPoint(zipBoundaries, lng, lat);
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      pendingUserLocRef.current = { lng, lat };
      pendingFitBoundsRef.current = zipFeature ?? null;
      return;
    }
    applyUserLocationMarker(lng, lat);
    if (zipFeature) {
      fitMapToZipFeature(zipFeature);
    }
  }

  function userLocationFeatureCollection(lng, lat) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {},
        },
      ],
    };
  }

  function applyUserLocationMarker(lng, lat) {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      pendingUserLocRef.current = { lng, lat };
      return;
    }
    const data = userLocationFeatureCollection(lng, lat);
    try {
      const existing = map.getSource('user-location');
      if (existing && typeof existing.setData === 'function') {
        existing.setData(data);
        return;
      }
      map.addSource('user-location', { type: 'geojson', data });
      map.addLayer({
        id: 'user-location-halo',
        type: 'circle',
        source: 'user-location',
        paint: {
          'circle-radius': 16,
          'circle-color': '#2F7BFF',
          'circle-opacity': 0.28,
          'circle-blur': 0.2,
        },
      });
      map.addLayer({
        id: 'user-location-dot',
        type: 'circle',
        source: 'user-location',
        paint: {
          'circle-radius': 7,
          'circle-color': '#FFD700',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#1B1205',
        },
      });
    } catch (e) {
      console.warn('[MarketRadar] user-location layer:', e);
    }
  }

  applyLocatedRef.current = applyLocatedPosition;

  /** Misma secuencia que Social Market: permiso en primer plano antes de datos del mapa. */
  useEffect(() => {
    let cancelled = false;
    setGeoAccess('pending');
    setLocateFeedback(null);

    void (async () => {
      const result = await requestMarketRadarLocationAccess();
      if (cancelled) return;
      if (result.ok) {
        setGeoAccess('granted');
        applyLocationFromGps(result.latitude, result.longitude, t);
        if (result.source === 'ipapi') {
          setLocateFeedback(t('marketRadar.locateIpApprox'));
        }
        return;
      }
      console.error('[MarketRadar] initial location access failed:', {
        reason: result.reason,
        code: result.code,
        message: result.message,
      });
      setGeoAccess('denied');
      setLocateFeedback(locateMessageForAccessReason(result, t));
    })();

    return () => {
      cancelled = true;
    };
  }, [t]);

  /** Tras permiso concedido: refuerzo con `?lat=&lng=` si la app nativa los envió. */
  useEffect(() => {
    if (geoAccess !== 'granted' || !seedLocation || seedAppliedRef.current) return;
    const { lat, lng } = seedLocation;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    if (locatedPos) return;
    seedAppliedRef.current = true;
    applyLocatedPosition(lng, lat);
    const zipFeature = findZipFeatureForPoint(zipBoundaries, lng, lat);
    if (!zipFeature) {
      setLocateFeedback(t('marketRadar.locateOutsideZip'));
    }
  }, [geoAccess, seedLocation, locatedPos, t]);

  async function handleLocateMe() {
    setLocateFeedback(null);
    setLocating(true);
    try {
      let result =
        typeof navigator !== 'undefined' && navigator.geolocation
          ? await requestMarketRadarLocationAccess()
          : { ok: false, reason: 'unavailable', code: 2, message: 'geolocation_api_missing' };

      if (!result.ok && (result.code === 1 || result.code === 2)) {
        result = await tryIpFallbackForGeolocationCodes(result);
      }

      if (result.ok) {
        setGeoAccess('granted');
        applyLocationFromGps(result.latitude, result.longitude, t);
        if (result.source === 'ipapi') {
          setLocateFeedback(t('marketRadar.locateIpApprox'));
        }
        return;
      }

      console.error('[MarketRadar] geolocation failed:', {
        code: result.code ?? (result.reason === 'denied' ? 1 : 2),
        message: result.message ?? result.reason,
      });
      setGeoAccess('denied');
      setLocateFeedback(locateMessageForAccessReason(result, t));
    } finally {
      setLocating(false);
    }
  }

  function submitIntent(ev) {
    ev.preventDefault();
    setAppliedIntentKeyword(intentDraft.trim());
  }

  function clearIntent() {
    setIntentDraft('');
    setAppliedIntentKeyword('');
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          border: `1px solid ${studioTheme.border}`,
          borderRadius: 12,
          padding: '10px 12px',
          background: studioTheme.surfaceElevated,
        }}
      >
        <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.2, color: studioTheme.textSubtle, marginBottom: 8 }}>
          {t('marketRadar.toolbarTitle')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <CompactSourceSegment t={t} dataSource={dataSource} onChange={setDataSource} />
          {sourceLoading ? (
            <span style={{ fontSize: 10, fontWeight: 800, color: studioTheme.goldLight }}>{t('marketRadar.dataSource.fetching')}</span>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'stretch',
            marginTop: 10,
            width: '100%',
          }}
        >
          <select
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            aria-label={t('marketRadar.nicheFilterLabel')}
            style={{
              width: '100%',
              height: INTENT_ROW_H,
              paddingLeft: 12,
              paddingRight: 12,
              borderRadius: 10,
              border: `1px solid ${studioTheme.border}`,
              background: studioTheme.bg,
              color: studioTheme.text,
              fontSize: 16,
              fontWeight: 700,
              boxSizing: 'border-box',
            }}
          >
            {nicheOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
          <form
            onSubmit={submitIntent}
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              flexWrap: 'nowrap',
            }}
          >
            <input
              type="search"
              enterKeyHint="search"
              value={intentDraft}
              onChange={(e) => setIntentDraft(e.target.value)}
              placeholder={t('marketRadar.intentPlaceholder')}
              autoCapitalize="none"
              autoCorrect="off"
              style={{
                flex: 1,
                minWidth: 0,
                width: '100%',
                height: INTENT_ROW_H,
                paddingLeft: 12,
                paddingRight: 12,
                borderRadius: 10,
                border: `1px solid ${studioTheme.borderStrong}`,
                background: studioTheme.surface,
                color: studioTheme.text,
                fontSize: 16,
                outline: 'none',
                boxSizing: 'border-box',
                WebkitAppearance: 'none',
              }}
            />
            <button
              type="submit"
              aria-label={t('marketRadar.intentApply')}
              title={t('marketRadar.intentApply')}
              style={{
                width: INTENT_ROW_H,
                height: INTENT_ROW_H,
                flexShrink: 0,
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                border: `1px solid ${studioTheme.borderStrong}`,
                background: studioTheme.gold,
                cursor: 'pointer',
                boxSizing: 'border-box',
                WebkitAppearance: 'none',
                appearance: 'none',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
            >
              <IconSearchGo color="#1B1205" />
            </button>
            <button
              type="button"
              aria-label={t('marketRadar.intentClear')}
              title={t('marketRadar.intentClear')}
              onClick={clearIntent}
              style={{
                width: INTENT_ROW_H,
                height: INTENT_ROW_H,
                flexShrink: 0,
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                border: `1px solid ${studioTheme.borderStrong}`,
                background: 'rgba(233, 216, 176, 0.08)',
                color: studioTheme.goldLight,
                cursor: 'pointer',
                boxSizing: 'border-box',
                WebkitAppearance: 'none',
                appearance: 'none',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
            >
              <IconClearIntent color={studioTheme.goldLight} />
            </button>
          </form>
        </div>

        {isGlobalDemoModeEnv() ? (
          <label
            style={{
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={demoHeatmapOn}
              onChange={(e) => {
                const on = e.target.checked;
                setGlobalDemoHeatmapEnabledClient(on);
                setDemoHeatmapOn(on);
                setDemoHeatmapRev((n) => n + 1);
              }}
            />
            <span style={{ fontSize: 11, fontWeight: 700, color: studioTheme.textMuted }}>{t('marketRadar.demoPhase4Toggle')}</span>
          </label>
        ) : null}
      </div>

      <div
        style={{
          position: 'relative',
          width: '100%',
          borderRadius: 14,
          overflow: 'hidden',
          border: `1px solid ${studioTheme.border}`,
          boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
          minHeight: 'min(56vh, 560px)',
          height: 'min(56vh, 560px)',
        }}
      >
        {token && geoAccess === 'pending' ? (
          <div
            aria-live="polite"
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              top: 64,
              zIndex: 8,
              padding: '8px 12px',
              textAlign: 'center',
              borderRadius: 10,
              border: `1px solid ${studioTheme.borderStrong}`,
              background: 'rgba(12,12,12,0.88)',
              pointerEvents: 'none',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 800,
                lineHeight: 1.45,
                color: studioTheme.goldLight,
              }}
            >
              {t('marketRadar.awaitingLocationPermission')}
            </p>
          </div>
        ) : null}
        {token && locateAvailable ? (
          <button
            type="button"
            onClick={handleLocateMe}
            disabled={!mapReady || locating || geoAccess === 'pending'}
            title={t('marketRadar.locateCurrentZone')}
            aria-label={t('marketRadar.locateCurrentZone')}
            style={{
              position: 'absolute',
              left: 12,
              top: 12,
              zIndex: 10,
              width: 44,
              height: 44,
              display: 'grid',
              placeItems: 'center',
              padding: 0,
              cursor: mapReady && !locating && geoAccess !== 'pending' ? 'pointer' : 'not-allowed',
              opacity: mapReady && geoAccess !== 'pending' ? 1 : 0.55,
              borderRadius: 12,
              border: `1px solid ${geoAccess === 'denied' ? studioTheme.error : studioTheme.borderStrong}`,
              background:
                geoAccess === 'denied' ? 'rgba(80,20,20,0.55)' : 'rgba(12,12,12,0.85)',
              color: geoAccess === 'denied' ? studioTheme.error : studioTheme.gold,
              boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
              backdropFilter: 'blur(8px)',
              touchAction: 'manipulation',
            }}
          >
            {locating ? (
              <span style={{ fontSize: 11, fontWeight: 900, color: studioTheme.textMuted }}>
                •••
              </span>
            ) : (
              <TargetGlyph />
            )}
          </button>
        ) : null}
        <div
          aria-live="polite"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 52,
            transform: 'translateX(-50%)',
            zIndex: 6,
            padding: '5px 10px',
            borderRadius: 999,
            border: `1px solid ${studioTheme.borderStrong}`,
            background: 'rgba(12,12,12,0.78)',
            color: studioTheme.gold,
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: 0.6,
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            pointerEvents: 'none',
            maxWidth: 'calc(100% - 24px)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 3, background: studioTheme.gold, boxShadow: '0 0 8px rgba(47,123,255,0.85)' }} />
          {t(
            dataSource === DATA_SOURCES.GLOBAL_DEMAND
              ? 'marketRadar.dataSource.compactGoogle'
              : 'marketRadar.dataSource.compactApp',
          )}
        </div>
        <div ref={wrapRef} style={{ width: '100%', height: '100%', background: studioTheme.surface }} />
        {!token ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              padding: 20,
              textAlign: 'center',
              background: 'rgba(0,0,0,0.88)',
              color: studioTheme.error,
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.45,
              zIndex: 5,
            }}
          >
            <div>
              <div>{t('marketRadar.noToken')}</div>
              <div
                style={{
                  marginTop: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  color: studioTheme.textMuted,
                  maxWidth: 400,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              >
                {t('marketRadar.noTokenHint')}
              </div>
            </div>
          </div>
        ) : null}
        <div
          ref={hoverRef}
          style={{
            display: 'none',
            position: 'absolute',
            zIndex: 5,
            pointerEvents: 'none',
            minWidth: 200,
            maxWidth: 280,
            padding: '10px 12px',
            borderRadius: 10,
            border: `1px solid ${studioTheme.borderStrong}`,
            background: 'rgba(10,10,10,0.94)',
            fontSize: 12,
          }}
        />
      </div>
      {locatedPos ? (
        <p
          style={{
            fontSize: 10,
            color: studioTheme.goldLight,
            margin: '6px 0 0',
            textAlign: 'center',
            fontWeight: 700,
            lineHeight: 1.45,
          }}
        >
          {zipMetrics?.zip
            ? t('marketRadar.zipSummary', {
                zip: String(zipMetrics.zip),
                signals: String(zipMetrics.modeledSignals),
                intents: String(zipMetrics.uniqueIntents),
              })
            : t('marketRadar.locateOutsideZip')}
        </p>
      ) : null}
      {locateFeedback ? (
        <p
          style={{
            fontSize: 10,
            color: studioTheme.error,
            margin: '6px 0 0',
            textAlign: 'center',
            fontWeight: 700,
            lineHeight: 1.45,
          }}
        >
          {locateFeedback}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Two-option source: app corpus vs external / Google-style demand.
 * @param {{ t: TFn, dataSource: string, onChange: (next: string) => void }} props
 */
function CompactSourceSegment({ t, dataSource, onChange }) {
  const segments = [
    { id: DATA_SOURCES.APP_NETWORK, labelKey: 'marketRadar.dataSource.compactApp' },
    { id: DATA_SOURCES.GLOBAL_DEMAND, labelKey: 'marketRadar.dataSource.compactGoogle' },
  ];
  return (
    <div
      role="tablist"
      aria-label={t('marketRadar.dataSourceLabel')}
      style={{
        display: 'flex',
        borderRadius: 10,
        overflow: 'hidden',
        border: `1px solid ${studioTheme.borderStrong}`,
        flex: '1 1 220px',
        maxWidth: 360,
      }}
    >
      {segments.map((s) => {
        const active = s.id === dataSource;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(s.id)}
            style={{
              flex: 1,
              padding: '9px 10px',
              border: 'none',
              cursor: 'pointer',
              background: active ? 'rgba(47,123,255,0.28)' : studioTheme.surface,
              color: active ? studioTheme.gold : studioTheme.textMuted,
              fontWeight: 900,
              fontSize: 11,
              letterSpacing: 0.2,
            }}
          >
            {t(s.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

