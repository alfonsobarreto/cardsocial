'use client';

/**
 * Texto en tarjeta pública (web): paridad con `PremiumDataPanelHost` “sovereign-text”
 * (app): `splitSovereignText` sobre el **valor** — la primera línea = titular oro (Georgia);
 * el resto con la **primera línea** en negrita (misma jerarquía que la app).
 * No repetimos el `label` del slot como título aparte (evita duplicar el “nombre de data” con la 1ª línea).
 */
import { splitSovereignText } from '@card-social/utils/sovereignTextSplit';
import React, { useCallback, useMemo, useState } from 'react';

/** Alineado con `PremiumDataPanelHost` (app). */
const ACCENT = '#C9A227';
const TEXT_MUTED = '#A1A1AA';
const SHEET_BG = '#000000';

/** Primera línea del bloque “cuerpo” en negrita; resto tipografía normal. */
function splitBodyFirstLine(body: string): { lead: string; rest: string } {
  const s = String(body ?? '');
  const i = s.indexOf('\n');
  if (i === -1) {
    return { lead: s, rest: '' };
  }
  return { lead: s.slice(0, i), rest: s.slice(i + 1) };
}

export function PublicTextSlotModal({
  open,
  title: _ariaTitle,
  value,
  onClose,
  tr,
  accent = ACCENT,
}: {
  open: boolean;
  /** Label del slot (solo accesibilidad / fallback); el layout “lujo” usa solo `value`. */
  title: string;
  value: string;
  onClose: () => void;
  tr: (es: string, en: string) => string;
  /** Borde del panel; el oro del titular sigue `ACCENT` de la app. */
  accent?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    const t = String(value || '').trim();
    if (!t) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(t);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      }
    } catch {
      setCopied(false);
    }
  }, [value]);

  const blocks = useMemo(() => {
    const raw = String(value || '');
    const { headline, body: bodyRest } = splitSovereignText(raw);
    const { lead, rest } = splitBodyFirstLine(bodyRest);
    return { headline, bodyRest, lead, rest };
  }, [value]);

  if (!open) return null;

  const ariaLabel = _ariaTitle?.trim() || blocks.headline || tr('Texto', 'Text');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0,0,0,0.92)',
      }}
      role="dialog"
      aria-modal
      aria-label={ariaLabel}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          flex: 1,
          maxHeight: 'min(92vh, 720px)',
          margin: '12px 0',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: SHEET_BG,
          borderRadius: 2,
          border: `1px solid ${accent}73`,
          boxShadow: '0 8px 40px rgba(0,0,0,0.65)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            height: 1,
            backgroundColor: `${accent}59`,
            marginLeft: 22,
            marginRight: 22,
            flexShrink: 0,
          }}
        />

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '12px 22px 8px',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {blocks.headline && blocks.bodyRest ? (
            <>
              <h2
                style={{
                  margin: '0 0 20px',
                  color: ACCENT,
                  fontSize: 26,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  lineHeight: 1.23,
                  textAlign: 'center',
                  fontFamily: 'Georgia, "Times New Roman", serif',
                }}
              >
                {blocks.headline}
              </h2>
              <div
                style={{
                  color: 'rgba(244, 244, 245, 0.92)',
                  fontSize: 16,
                  lineHeight: 1.625,
                  textAlign: 'left',
                  fontFamily:
                    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                }}
              >
                {blocks.lead ? (
                  <div style={{ fontWeight: 700, marginBottom: blocks.rest ? 0 : 0 }}>{blocks.lead}</div>
                ) : null}
                {blocks.rest ? (
                  <div
                    style={{
                      fontWeight: 400,
                      marginTop: blocks.lead ? 10 : 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {blocks.rest}
                  </div>
                ) : null}
              </div>
            </>
          ) : blocks.headline ? (
            <h2
              style={{
                margin: 0,
                color: ACCENT,
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: 0.4,
                lineHeight: 1.23,
                textAlign: 'center',
                fontFamily: 'Georgia, "Times New Roman", serif',
              }}
            >
              {blocks.headline}
            </h2>
          ) : (
            <p
              style={{
                margin: 0,
                color: 'rgba(244, 244, 245, 0.92)',
                fontSize: 16,
                lineHeight: 1.625,
                fontWeight: 400,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {blocks.bodyRest || '—'}
            </p>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 22px max(10px, env(safe-area-inset-bottom, 0px))',
            borderTop: `1px solid ${accent}33`,
            flexShrink: 0,
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: TEXT_MUTED,
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: 0.8,
              cursor: 'pointer',
              padding: '8px 0',
            }}
          >
            {tr('Cerrar', 'Close')}
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: 'none',
              color: copied ? '#86efac' : ACCENT,
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 0.3,
              cursor: 'pointer',
              padding: '8px 0',
            }}
          >
            <span aria-hidden style={{ fontSize: 16 }}>
              {copied ? '✓' : '⧉'}
            </span>
            {copied ? tr('Copiado', 'Copied') : tr('Copiar', 'Copy')}
          </button>
        </div>
      </div>
    </div>
  );
}
