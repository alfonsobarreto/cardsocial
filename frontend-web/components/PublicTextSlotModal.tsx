'use client';

/**
 * Texto en tarjeta pública (web): la app abre hoja; en el navegador hacía solo
 * `clipboard.writeText` silencioso. Aquí se muestra el valor y se copia con feedback.
 */
import React, { useCallback, useState } from 'react';

export function PublicTextSlotModal({
  open,
  title,
  value,
  onClose,
  tr,
  accent = '#D4AF37',
}: {
  open: boolean;
  title: string;
  value: string;
  onClose: () => void;
  tr: (es: string, en: string) => string;
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
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      setCopied(false);
    }
  }, [value]);

  if (!open) return null;

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
        padding: 24,
        background: 'rgba(5,5,8,0.86)',
      }}
      role="dialog"
      aria-modal
      aria-label={title}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={tr('Cerrar', 'Close')}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.06)',
          color: '#a1a1aa',
          fontSize: 22,
          lineHeight: 1,
          cursor: 'pointer',
        }}
      >
        ×
      </button>

      <div
        style={{
          width: '100%',
          maxWidth: 400,
          borderRadius: 16,
          border: `1px solid ${accent}44`,
          background: 'linear-gradient(180deg, #141418 0%, #0a0a0f 100%)',
          padding: '20px 18px 18px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}
      >
        <h2
          style={{
            margin: '0 0 12px',
            fontSize: 15,
            fontWeight: 600,
            color: '#e4e4e7',
            letterSpacing: 0.3,
          }}
        >
          {title || tr('Texto', 'Text')}
        </h2>
        <div
          style={{
            maxHeight: 'min(50vh, 320px)',
            overflow: 'auto',
            padding: 12,
            borderRadius: 10,
            background: 'rgba(0,0,0,0.35)',
            color: '#fafafa',
            fontSize: 15,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            marginBottom: 14,
          }}
        >
          {value}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void copy()}
            style={{
              flex: 1,
              minWidth: 120,
              padding: '10px 14px',
              borderRadius: 10,
              border: 'none',
              background: `linear-gradient(180deg, ${accent} 0%, ${accent}cc 100%)`,
              color: '#0a0a0f',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {copied ? tr('Copiado', 'Copied') : tr('Copiar', 'Copy')}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color: '#a1a1aa',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {tr('Cerrar', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
}
