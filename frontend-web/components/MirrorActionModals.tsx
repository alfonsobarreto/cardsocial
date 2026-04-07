'use client';

import React, { useCallback } from 'react';
import {
  buildLinkOpenCandidates,
  normalizeTelDialString,
  type MirrorOpenPlan,
} from '@card-social/services/mirrorVaultItemOpenPlan';

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.72)',
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};

function makeSheet(accent: string): React.CSSProperties {
  return {
    width: '100%',
    maxWidth: 400,
    maxHeight: '85vh',
    overflow: 'auto',
    borderRadius: 16,
    backgroundColor: '#111',
    border: `1px solid ${accent}59`,
    padding: 20,
    color: '#e5e5e5',
  };
}

function Btn({
  primary,
  onClick,
  children,
  accent,
}: {
  primary?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        minHeight: 44,
        borderRadius: 10,
        border: primary ? 'none' : `1px solid ${accent}80`,
        backgroundColor: primary ? accent : 'transparent',
        color: primary ? '#000' : accent,
        fontWeight: 700,
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function tryOpenNativeAppUrl(schemeUrl: string): void {
  const start = Date.now();
  window.location.href = schemeUrl;
  setTimeout(() => {
    if (Date.now() - start < 1600 && document.visibilityState === 'visible') {
      /* still here — app probably not installed */
    }
  }, 1500);
}

type Tr = (es: string, en: string) => string;

export function MirrorActionModals({
  plan,
  onClose,
  tr,
  accent = '#D4AF37',
}: {
  plan: MirrorOpenPlan | null;
  onClose: () => void;
  tr: Tr;
  accent?: string;
}) {
  const sheetStyle = makeSheet(accent);
  const onCopy = useCallback(async (text: string) => {
    const ok = await copyText(text);
    if (ok) {
      window.alert(tr('Copiado al portapapeles', 'Copied to clipboard'));
    } else {
      window.alert(tr('No se pudo copiar', 'Could not copy'));
    }
  }, [tr]);

  if (!plan) {
    return null;
  }

  const rowBtns: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    marginTop: 16,
    flexWrap: 'wrap',
  };

  if (plan.kind === 'text' || plan.kind === 'raw') {
    const body = plan.value || tr('Sin contenido', 'No content');
    return (
      <div style={overlay} onClick={onClose} role="presentation">
        <div style={sheetStyle} onClick={(e) => e.stopPropagation()} role="dialog">
          <div style={{ fontWeight: 800, color: accent, marginBottom: 12 }}>{plan.title}</div>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 14,
              lineHeight: 1.5,
              margin: 0,
              maxHeight: '50vh',
              overflow: 'auto',
            }}
          >
            {body}
          </pre>
          <div style={rowBtns}>
            <Btn primary accent={accent} onClick={() => void onCopy(body)}>{tr('Copiar', 'Copy')}</Btn>
            <Btn accent={accent} onClick={onClose}>{tr('Cerrar', 'Close')}</Btn>
          </div>
        </div>
      </div>
    );
  }

  if (plan.kind === 'email') {
    return (
      <div style={overlay} onClick={onClose} role="presentation">
        <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 800, color: accent, marginBottom: 8 }}>{tr('Correo', 'Email')}</div>
          <div style={{ fontSize: 15, marginBottom: 16 }}>{plan.value}</div>
          <div style={rowBtns}>
            <Btn
              primary
              accent={accent}
              onClick={() => {
                window.location.href = `mailto:${plan.value}`;
                onClose();
              }}
            >
              {tr('Abrir cliente de correo', 'Open mail app')}
            </Btn>
            <Btn accent={accent} onClick={() => void onCopy(plan.value)}>{tr('Copiar', 'Copy')}</Btn>
          </div>
          <div style={{ marginTop: 10 }}>
            <Btn accent={accent} onClick={onClose}>{tr('Cerrar', 'Close')}</Btn>
          </div>
        </div>
      </div>
    );
  }

  if (plan.kind === 'phone') {
    const compact = normalizeTelDialString(plan.value);
    return (
      <div style={overlay} onClick={onClose} role="presentation">
        <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 800, color: accent, marginBottom: 8 }}>{tr('Teléfono', 'Phone')}</div>
          <div style={{ fontSize: 18, marginBottom: 16, fontVariantNumeric: 'tabular-nums' }}>{plan.value}</div>
          <div style={rowBtns}>
            {compact ? (
              <Btn
                primary
                accent={accent}
                onClick={() => {
                  window.location.href = `tel:${compact}`;
                  onClose();
                }}
              >
                {tr('Llamar', 'Call')}
              </Btn>
            ) : null}
            <Btn accent={accent} onClick={() => void onCopy(plan.value)}>{tr('Copiar número', 'Copy number')}</Btn>
          </div>
          <div style={{ marginTop: 10 }}>
            <Btn accent={accent} onClick={onClose}>{tr('Cerrar', 'Close')}</Btn>
          </div>
        </div>
      </div>
    );
  }

  if (plan.kind === 'link') {
    const candidates = buildLinkOpenCandidates(plan.url);
    const httpsUrl = candidates[candidates.length - 1];
    const appCandidates = candidates.slice(0, -1);

    return (
      <div style={overlay} onClick={onClose} role="presentation">
        <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 800, color: accent, marginBottom: 8 }}>{plan.title}</div>
          <div style={{ fontSize: 12, opacity: 0.85, wordBreak: 'break-all', marginBottom: 16 }}>{httpsUrl}</div>
          <div style={rowBtns}>
            <Btn
              primary
              accent={accent}
              onClick={() => {
                window.open(httpsUrl, '_blank', 'noopener,noreferrer');
                onClose();
              }}
            >
              {tr('Abrir en navegador', 'Open in browser')}
            </Btn>
          </div>
          {appCandidates.length ? (
            <div style={{ ...rowBtns, marginTop: 10 }}>
              <Btn
                accent={accent}
                onClick={() => {
                  tryOpenNativeAppUrl(appCandidates[0]);
                }}
              >
                {tr('Abrir en app (si está instalada)', 'Open in app (if installed)')}
              </Btn>
            </div>
          ) : null}
          <div style={{ marginTop: 10 }}>
            <Btn accent={accent} onClick={() => void onCopy(httpsUrl)}>{tr('Copiar enlace', 'Copy link')}</Btn>
          </div>
          <div style={{ marginTop: 10 }}>
            <Btn accent={accent} onClick={onClose}>{tr('Cerrar', 'Close')}</Btn>
          </div>
        </div>
      </div>
    );
  }

  if (plan.kind === 'document') {
    const u = plan.value.trim();
    const isPdf = /\.pdf(\?|$)/i.test(u);
    const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i.test(u);
    return (
      <div style={{ ...overlay, alignItems: 'stretch', padding: 0 }} onClick={onClose} role="presentation">
        <div
          style={{
            ...sheetStyle,
            maxWidth: '100%',
            maxHeight: '100vh',
            margin: 12,
            display: 'flex',
            flexDirection: 'column',
            padding: 12,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 800, color: accent }}>{plan.title}</div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                padding: '8px 14px',
                cursor: 'pointer',
              }}
            >
              {tr('Cerrar', 'Close')}
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 280, background: '#0a0a0a', borderRadius: 8, overflow: 'hidden' }}>
            {isPdf && u.startsWith('http') ? (
              <iframe title="pdf" src={u} style={{ width: '100%', height: '100%', minHeight: 400, border: 'none' }} />
            ) : null}
            {isImg && u.startsWith('http') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u} alt="" style={{ width: '100%', height: 'auto', maxHeight: '60vh', objectFit: 'contain' }} />
            ) : null}
            {(!isPdf && !isImg) || !u.startsWith('http') ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <p style={{ fontSize: 14 }}>{tr('Vista previa no disponible. Abre el archivo en una pestaña nueva.', 'Preview unavailable. Open the file in a new tab.')}</p>
              </div>
            ) : null}
          </div>
          <div style={rowBtns}>
            <Btn
              primary
              accent={accent}
              onClick={() => {
                window.open(u, '_blank', 'noopener,noreferrer');
              }}
            >
              {tr('Abrir / descargar', 'Open / download')}
            </Btn>
            <Btn accent={accent} onClick={() => void onCopy(u)}>{tr('Copiar URL', 'Copy URL')}</Btn>
          </div>
        </div>
      </div>
    );
  }

  if (plan.kind === 'ghost') {
    const appUrl = `cardsocial://`;
    return (
      <div style={overlay} onClick={onClose} role="presentation">
        <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 800, color: accent, marginBottom: 12 }}>Ghost-Link</div>
          <p style={{ fontSize: 14, lineHeight: 1.5, margin: '0 0 16px' }}>
            {tr(
              'Las llamadas privadas Ghost-Link solo están disponibles en la app Card-Social. Tu número real permanece oculto.',
              'Private Ghost-Link calls are only available in the Card-Social app. Your real number stays hidden.',
            )}
          </p>
          <div style={rowBtns}>
            <Btn primary accent={accent} onClick={() => tryOpenNativeAppUrl(appUrl)}>
              {tr('Abrir Card-Social', 'Open Card-Social')}
            </Btn>
          </div>
          <div style={{ ...rowBtns, marginTop: 10 }}>
            <Btn
              accent={accent}
              onClick={() => {
                window.open('https://cardsocial.me', '_blank', 'noopener,noreferrer');
              }}
            >
              {tr('Descargar app', 'Get the app')}
            </Btn>
            <Btn accent={accent} onClick={onClose}>{tr('Cerrar', 'Close')}</Btn>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
