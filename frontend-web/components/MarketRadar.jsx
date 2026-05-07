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
import { studioTheme } from '@/lib/studioTheme';

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
  const [geoError, setGeoError] = useState(null);

  const [dataSource, setDataSource] = useState(DATA_SOURCES.APP_NETWORK);
  const [activeEvents, setActiveEvents] = useState([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const dataSourceRef = useRef(dataSource);
  useEffect(() => {
    dataSourceRef.current = dataSource;
  }, [dataSource]);

  const token = typeof window !== 'undefined' ? readMapboxToken() : '';

  const aggregatorRef = useRef(null);
  if (aggregatorRef.current === null) {
    aggregatorRef.current = new MarketTrendAggregator();
  }

  /** Pull the active feed whenever the user changes source. */
  useEffect(() => {
    let cancelled = false;
    setSourceLoading(true);
    aggregatorRef.current
      .fetch(dataSource, {})
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
  }, [dataSource]);

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

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
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

  function handleLocateMe() {
    setGeoError(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError(t('marketRadar.geoUnsupported'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude: lng, latitude: lat } = pos.coords;
        setLocatedPos({ lng, lat });
        flyTo({ lng, lat });
        setLocating(false);
      },
      () => {
        setGeoError(t('marketRadar.geoDenied'));
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
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
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          border: `1px solid ${studioTheme.border}`,
          borderRadius: 12,
          padding: 14,
          background: studioTheme.surfaceElevated,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: studioTheme.gold, letterSpacing: 0.6 }}>
            {t('marketRadar.heroLine')}
          </h2>
          <span style={{ color: studioTheme.textMuted, fontSize: 12, fontWeight: 700 }}>{t('marketRadar.heroSubtitle')}</span>
        </div>
        <p style={{ margin: '0 0 12px', color: studioTheme.textMuted, fontSize: 12, lineHeight: 1.45, maxWidth: 780 }}>
          {dataSource === DATA_SOURCES.GLOBAL_DEMAND
            ? t('marketRadar.dataSource.globalDemandHint')
            : t('marketRadar.proprietaryDisclaimer')}
        </p>

        <DataSourceToggle
          t={t}
          dataSource={dataSource}
          onChange={setDataSource}
          loading={sourceLoading}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', marginBottom: 12, marginTop: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 200px', minWidth: 180 }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: studioTheme.textSubtle, letterSpacing: 1.1 }}>
              {t('marketRadar.nicheFilterLabel')}
            </span>
            <select
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${studioTheme.border}`,
                background: studioTheme.bg,
                color: studioTheme.text,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {nicheOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>

          <form
            onSubmit={submitIntent}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              flex: '2 1 260px',
              minWidth: 220,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 900, color: studioTheme.textSubtle, letterSpacing: 1.1 }}>
              {t('marketRadar.intentKeywordSearch')}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <input
                type="text"
                value={intentDraft}
                onChange={(e) => setIntentDraft(e.target.value)}
                placeholder={t('marketRadar.intentPlaceholder')}
                style={{
                  flex: '1 1 140px',
                  minWidth: 120,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${studioTheme.borderStrong}`,
                  background: studioTheme.surface,
                  color: studioTheme.text,
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: `1px solid ${studioTheme.borderStrong}`,
                  background: studioTheme.surfaceElevated,
                  color: studioTheme.goldLight,
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {t('marketRadar.intentApply')}
              </button>
              <button
                type="button"
                onClick={clearIntent}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: `1px solid ${studioTheme.border}`,
                  background: 'transparent',
                  color: studioTheme.textMuted,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {t('marketRadar.intentClear')}
              </button>
            </div>
          </form>

          <div
            style={{
              flex: '2 1 260px',
              border: `1px solid ${studioTheme.borderStrong}`,
              borderRadius: 10,
              padding: '10px 14px',
              background: studioTheme.surface,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 900, color: studioTheme.goldLight, letterSpacing: 1, marginBottom: 4 }}>
              {t('marketRadar.gapTitle')}
            </div>
            <div style={{ fontSize: 11, color: studioTheme.textMuted, lineHeight: 1.5 }}>{t('marketRadar.gapBody')}</div>
          </div>
        </div>

        {/* Local SEO / CRO strip — gated on geolocation */}
        <div
          style={{
            borderRadius: 10,
            padding: '12px 14px',
            background: studioTheme.surface,
            border: `1px solid ${studioTheme.border}`,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 900, color: studioTheme.gold, letterSpacing: 0.9, marginBottom: 10 }}>
            {t('marketRadar.metricsStripTitle')}
          </div>
          {!locatedPos ? (
            <div style={{ color: studioTheme.textMuted, fontSize: 12, lineHeight: 1.5 }}>{t('marketRadar.metricsLocateHint')}</div>
          ) : !zipMetrics?.zip ? (
            <div style={{ color: studioTheme.textMuted, fontSize: 12 }}>{t('marketRadar.metricsOutsideRoi')}</div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 12,
              }}
            >
              <MetricCell label={t('marketRadar.metricsZipLabel')} value={String(zipMetrics.zip)} sub={zipMetrics.zipLabel || ''} />
              <MetricCell label={t('marketRadar.metricsModeledSignals')} value={String(zipMetrics.modeledSignals)} />
              <MetricCell label={t('marketRadar.metricsUniqueIntents')} value={String(zipMetrics.uniqueIntents)} />
            </div>
          )}
          {appliedIntentKeyword ? (
            <div style={{ marginTop: 10, fontSize: 11, color: studioTheme.textSubtle }}>
              {t('marketRadar.tooltipIntentFilter', { q: appliedIntentKeyword })}
            </div>
          ) : null}
        </div>
      </div>

      {geoError ? (
        <div style={{ color: studioTheme.error, fontSize: 12, paddingLeft: 4 }}>
          {geoError}
        </div>
      ) : null}

      {!token ? (
        <div
          style={{
            border: `1px solid ${studioTheme.error}`,
            color: studioTheme.error,
            borderRadius: 10,
            padding: 14,
            fontSize: 13,
          }}
        >
          {t('marketRadar.noToken')}
        </div>
      ) : null}

      <div
        style={{
          position: 'relative',
          width: '100%',
          borderRadius: 14,
          overflow: 'hidden',
          border: `1px solid ${studioTheme.border}`,
          boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
          minHeight: 'min(70vh, 640px)',
          height: 'min(70vh, 640px)',
        }}
      >
        {token ? (
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
              zIndex: 6,
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
            right: 14,
            top: 14,
            zIndex: 6,
            padding: '6px 10px',
            borderRadius: 999,
            border: `1px solid ${studioTheme.borderStrong}`,
            background: 'rgba(12,12,12,0.78)',
            color: studioTheme.gold,
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: 0.8,
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 3, background: studioTheme.gold, boxShadow: '0 0 8px rgba(212,175,55,0.85)' }} />
          {t(
            dataSource === DATA_SOURCES.GLOBAL_DEMAND
              ? 'marketRadar.dataSource.globalDemand'
              : 'marketRadar.dataSource.appNetwork',
          )}
        </div>
        <div ref={wrapRef} style={{ width: '100%', height: '100%' }} />
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
    </div>
  );
}

function MetricCell({ label, value, sub }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.9, color: studioTheme.textSubtle }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: studioTheme.gold, marginTop: 2 }}>{value}</div>
      {sub ? <div style={{ fontSize: 10, color: studioTheme.textMuted, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

/**
 * Hybrid Intelligence Mode · two-segment data source toggle.
 * @param {{ t: TFn, dataSource: string, onChange: (next: string) => void, loading: boolean }} props
 */
function DataSourceToggle({ t, dataSource, onChange, loading }) {
  const segments = [
    {
      id: DATA_SOURCES.APP_NETWORK,
      label: t('marketRadar.dataSource.appNetwork'),
      hint: t('marketRadar.dataSource.appNetworkHint'),
      icon: '◎',
    },
    {
      id: DATA_SOURCES.GLOBAL_DEMAND,
      label: t('marketRadar.dataSource.globalDemand'),
      hint: t('marketRadar.dataSource.globalDemandHint'),
      icon: '◈',
    },
  ];
  return (
    <div
      style={{
        marginTop: 4,
        borderRadius: 14,
        border: `1px solid ${studioTheme.borderStrong}`,
        background: 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(0,0,0,0))',
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: 1.6,
            color: studioTheme.gold,
            textTransform: 'uppercase',
          }}
        >
          ⌖ {t('marketRadar.hybridMode')}
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, color: studioTheme.textSubtle, letterSpacing: 0.8 }}>
          {t('marketRadar.dataSourceLabel')}
        </span>
        {loading ? (
          <span
            style={{
              fontSize: 9,
              fontWeight: 900,
              padding: '3px 8px',
              borderRadius: 999,
              border: `1px solid ${studioTheme.border}`,
              color: studioTheme.goldLight,
              letterSpacing: 0.6,
            }}
          >
            {t('marketRadar.dataSource.fetching')}
          </span>
        ) : null}
      </div>
      <div
        role="tablist"
        aria-label={t('marketRadar.dataSourceLabel')}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        {segments.map((seg) => {
          const active = seg.id === dataSource;
          return (
            <button
              key={seg.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(seg.id)}
              style={{
                cursor: 'pointer',
                padding: '12px 14px',
                borderRadius: 12,
                textAlign: 'left',
                border: active
                  ? `1.5px solid ${studioTheme.gold}`
                  : `1px solid ${studioTheme.border}`,
                background: active
                  ? 'linear-gradient(135deg, rgba(212,175,55,0.22), rgba(212,175,55,0.04))'
                  : studioTheme.surface,
                color: active ? studioTheme.goldLight : studioTheme.text,
                boxShadow: active ? '0 8px 22px rgba(212,175,55,0.18)' : 'none',
                transition: 'all 140ms ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.4 }}>
                  <span style={{ marginRight: 6, opacity: active ? 1 : 0.6 }}>{seg.icon}</span>
                  {seg.label}
                </span>
                {active ? (
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 900,
                      letterSpacing: 1.4,
                      padding: '2px 7px',
                      borderRadius: 999,
                      background: studioTheme.gold,
                      color: '#1B1205',
                    }}
                  >
                    {t('marketRadar.dataSource.activeBadge')}
                  </span>
                ) : null}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: active ? studioTheme.gold : studioTheme.textMuted, lineHeight: 1.45 }}>
                {seg.hint}
              </span>
            </button>
          );
        })}
      </div>
      {dataSource === DATA_SOURCES.GLOBAL_DEMAND ? (
        <div style={{ marginTop: 10, fontSize: 10, color: studioTheme.textSubtle, lineHeight: 1.5 }}>
          {t('marketRadar.dataSource.externalDisclaimer')}
        </div>
      ) : null}
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
