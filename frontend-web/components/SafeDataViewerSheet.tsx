'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import type { SlotIconDef } from '@/lib/slotIcons';

type Tr = (es: string, en: string) => string;

export type SafeDataViewerSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  tr: Tr;
  accent: string;
  /** Icono SVG inline (path) o imagen URL */
  headerGlyph?: React.ReactNode;
  /** Texto a copiar (por defecto `body`) */
  copyText?: string;
  hideCopy?: boolean;
  footerActions?: React.ReactNode;
};

export function SafeDataViewerSheet({
  open,
  onClose,
  title,
  body,
  tr,
  accent,
  headerGlyph,
  copyText,
  hideCopy,
  footerActions,
}: SafeDataViewerSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      const t = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(t);
    }
    setMounted(false);
    setCopied(false);
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open) return null;

  const textToCopy = (copyText ?? body).trim();
  const showCopy = !hideCopy && Boolean(textToCopy);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        backgroundColor: mounted ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0)',
        transition: 'background-color 0.28s ease',
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-labelledby="safe-data-viewer-title"
        style={{
          width: '100%',
          maxHeight: '88vh',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          background: 'linear-gradient(180deg, #15151c 0%, #0c0c10 100%)',
          borderTop: `1px solid ${accent}55`,
          boxShadow: `0 -12px 48px rgba(0,0,0,0.45)`,
          transform: mounted ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
          padding: '10px 22px 24px',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 10px' }}>
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: 'rgba(255,255,255,0.18)',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              backgroundColor: `${accent}18`,
              border: `1px solid ${accent}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {headerGlyph ?? (
              <svg width={28} height={28} viewBox="0 0 24 24" fill={accent}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6m-1 1v5h5v10H6V4h7v4h5v-.09L14 3z" />
              </svg>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              id="safe-data-viewer-title"
              style={{
                color: '#f4f4f5',
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: 0.2,
                lineHeight: 1.25,
              }}
            >
              {title}
            </div>
          </div>
        </div>

        <div
          style={{
            maxHeight: 'min(40vh, 320px)',
            overflowY: 'auto',
            marginBottom: 14,
            paddingRight: 4,
          }}
        >
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
              fontSize: 16,
              lineHeight: 1.55,
              fontWeight: 400,
              color: '#e4e4e7',
              margin: 0,
            }}
          >
            {body}
          </pre>
        </div>

        {showCopy ? (
          <button
            type="button"
            onClick={() => void copy()}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '14px 16px',
              borderRadius: 14,
              border: copied ? '1px solid rgba(34,197,94,0.45)' : `1px solid ${accent}55`,
              backgroundColor: copied ? 'rgba(34,197,94,0.1)' : `${accent}10`,
              color: copied ? '#86efac' : accent,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: 12,
            }}
          >
            {copied ? (
              <>
                <span style={{ fontSize: 18 }}>✓</span>
                {tr('Copiado', 'Copied')}
              </>
            ) : (
              <>
                <span style={{ opacity: 0.9 }}>⎘</span>
                {tr('Copiar al portapapeles', 'Copy to clipboard')}
              </>
            )}
          </button>
        ) : null}

        {footerActions}

      </div>
    </div>
  );
}

/** Helper: render glyph desde SlotIconDef (misma familia que WireframeUniversalCard). */
export function slotDefToGlyph(def: SlotIconDef, size: number, color: string) {
  return (
    <svg width={size} height={size} viewBox={def.viewBox ?? '0 0 24 24'} style={{ display: 'block', color }}>
      <path d={def.path} fill="currentColor" />
    </svg>
  );
}

/** Avatar circular para interstitial */
export function InterstitialAvatar({
  photoUrl,
  name,
  size,
  accent,
}: {
  photoUrl: string | null;
  name: string;
  size: number;
  accent: string;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        overflow: 'hidden',
        border: `2px solid ${accent}66`,
        boxShadow: `0 8px 32px ${accent}33`,
        backgroundColor: '#1a1a22',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {photoUrl ? (
        <Image src={photoUrl} alt="" width={size} height={size} style={{ objectFit: 'cover', width: '100%', height: '100%' }} unoptimized />
      ) : (
        <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24" fill={accent}>
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      )}
    </div>
  );
}

export { SafeDataViewerSheet as SafeDataViewerModal };
