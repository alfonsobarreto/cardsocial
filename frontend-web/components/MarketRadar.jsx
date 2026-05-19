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
  buildDensityGrid,
  sampleDensity,
} from '@/lib/mockIntelligenceService';
import {
  DATA_SOURCES,
  MarketTrendAggregator,
  eventsToGeoJSON,
  heatmapPaintForSource,
} from '@/lib/MarketTrendAggregator';
import { marketRadarRequiresIntentBeforeData } from '@/lib/marketRadarBootstrap';
import { studioTheme } from '@/lib/studioTheme';
import {
  isGlobalDemoModeEnv,
  isGlobalDemoHeatmapEnabledClient,
  setGlobalDemoHeatmapEnabledClient,
} from '@/demo/searchDemand/demoSearchEvents';
import { mdiTrashCanOutline } from '@mdi/js';

const STYLE_URL = 'mapbox://styles/mapbox/dark-v11';

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
 * @param {{ t: TFn }} props
 */
export default function MarketRadar({ t }) {
  const wrapRef = useRef(null);
  const mapRef = useRef(null);
  const hoverRef = useRef(null);
  const densityRef = useRef(buildDensityGrid([], 0.04));
  const nicheRef = useRef('all');
  const intentAppliedRef = useRef('');
  const pendingFlyRef = useRef(null);

  const [mapReady, setMapReady] = useState(false);
  const [niche, setNiche] = useState('all');
  const [appliedIntentKeyword, setAppliedIntentKeyword] = useState('');
  const [intentDraft, setIntentDraft] = useState('');
  const [locatedPos, setLocatedPos] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locateAvailable, setLocateAvailable] = useState(false);

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

  /** Show locate control only when the browser / WebView can realistically use geolocation. */
  useEffect(() => {
    function compute() {
      if (typeof window === 'undefined') return false;
      const bridge = window.__CS_NATIVE_GEO__;
      const hasApi = typeof navigator !== 'undefined' && !!navigator.geolocation;
      if (!hasApi) return false;
      if (bridge === 'denied') return false;
      const hostname = window.location.hostname;
      const secureOk = window.isSecureContext || hostname === 'localhost' || hostname === '127.0.0.1';
      return secureOk || bridge === 'granted';
    }
    setLocateAvailable(compute());
    if (typeof window === 'undefined') return undefined;
    const id = window.setInterval(() => {
      const next = compute();
      setLocateAvailable((prev) => (prev === next ? prev : next));
    }, 400);
    const to = window.setTimeout(() => window.clearInterval(id), 12_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(to);
    };
  }, []);

  /** Pull the active feed when source / niche / applied keyword / demo toggle change. */
  useEffect(() => {
    let cancelled = false;
    const keyword = appliedIntentKeyword.trim();
    if (marketRadarRequiresIntentBeforeData() && keyword.length < 2) {
      setActiveEvents([]);
      setSourceLoading(false);
      return;
    }

    setSourceLoading(true);
    aggregatorRef.current
      .fetch(dataSource, { niche, intentKeyword: keyword })
      .then((events) => {
        if (cancelled) return;
        setActiveEvents(events);
      })
      .catch(() => {
        if (cancelled) return;
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

  /** Deferred fly-to if geolocation resolves before Mapbox `load`. */
  useEffect(() => {
    const map = mapRef.current;
    const pending = pendingFlyRef.current;
    if (!mapReady || !map || !pending) return;
    map.flyTo({ center: [pending.lng, pending.lat], zoom: 11, essential: true });
    pendingFlyRef.current = null;
  }, [mapReady]);

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
    if (!el || !token) return;

    mapboxgl.accessToken = token;

    let disposed = false;
    let resizeObserver = null;

    const map = new mapboxgl.Map({
      container: el,
      style: STYLE_URL,
      center: [-97.74, 30.32],
      zoom: 9,
      minZoom: 6,
      maxZoom: 17,
      pitch: 0,
      attributionControl: true,
      dragRotate: false,
      pitchWithRotate: false,
      projection: 'mercator',
    });

    mapRef.current = map;

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

  function flyTo(coords) {
    const map = mapRef.current;
    if (map && mapReady) {
      map.flyTo({ center: [coords.lng, coords.lat], zoom: Math.max(map.getZoom(), 11), essential: true });
    } else {
      pendingFlyRef.current = coords;
    }
  }

  function readNativeGeoBridge() {
    if (typeof window === 'undefined') return 'unset';
    const v = window.__CS_NATIVE_GEO__;
    if (v === 'granted' || v === 'denied') return v;
    return 'unset';
  }

  /** Safari/Chrome block geolocation on http://LAN (non-secure). Localhost is an exception. WebView may still work if native injected `granted`. */
  function isBrowserGeoBlockedOnHttp() {
    if (typeof window === 'undefined') return false;
    if (window.isSecureContext) return false;
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return false;
    return true;
  }

  function handleLocateMe() {
    const nativeGeo = readNativeGeoBridge();
    if (nativeGeo === 'denied') return;
    if (nativeGeo === 'unset' && isBrowserGeoBlockedOnHttp()) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setLocating(true);
    try {
      if (navigator.permissions?.query) {
        void navigator.permissions.query({ name: 'geolocation' }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude: lng, latitude: lat } = pos.coords;
        setLocatedPos({ lng, lat });
        flyTo({ lng, lat });
        setLocating(false);
      },
      () => {
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 20_000 },
    );
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
        {token && locateAvailable ? (
          <button
            type="button"
            onClick={handleLocateMe}
            disabled={!mapReady || locating}
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
              cursor: mapReady && !locating ? 'pointer' : 'not-allowed',
              opacity: mapReady ? 1 : 0.55,
              borderRadius: 12,
              border: `1px solid ${studioTheme.borderStrong}`,
              background: 'rgba(12,12,12,0.85)',
              color: studioTheme.gold,
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
          <span style={{ width: 6, height: 6, borderRadius: 3, background: studioTheme.gold, boxShadow: '0 0 8px rgba(233,195,73,0.85)' }} />
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
      {locatedPos && zipMetrics?.zip ? (
        <p
          style={{
            fontSize: 10,
            color: studioTheme.textMuted,
            margin: '6px 0 0',
            textAlign: 'center',
            fontWeight: 700,
          }}
        >
          {t('marketRadar.zipSummary', {
            zip: String(zipMetrics.zip),
            signals: String(zipMetrics.modeledSignals),
            intents: String(zipMetrics.uniqueIntents),
          })}
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
              background: active ? 'rgba(233,195,73,0.28)' : studioTheme.surface,
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
