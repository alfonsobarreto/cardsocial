'use client';

import Image from 'next/image';
import React, { useCallback, useState } from 'react';
import {
  buildLinkOpenCandidates,
  normalizeTelDialString,
  type MirrorOpenPlan,
} from '@card-social/services/mirrorVaultItemOpenPlan';
import type { PublicSlot } from '@/lib/universalCardTypes';
import { resolvePublicVaultUrlForWeb } from '@/lib/resolvePublicVaultMediaUrl';
import { resolveSlotVisual } from '@/lib/slotVisual';
import {
  InterstitialAvatar,
  SafeDataViewerSheet,
  slotDefToGlyph,
} from '@/components/SafeDataViewerSheet';

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
        fontWeight: 400,
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

function CopyChip({
  text,
  tr,
  accent,
  narrowLabel,
}: {
  text: string;
  tr: Tr;
  accent: string;
  narrowLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    }
  }, [text]);
  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      style={{
        flex: 1,
        minHeight: 44,
        borderRadius: 10,
        border: copied ? '1px solid rgba(34,197,94,0.45)' : `1px solid ${accent}80`,
        backgroundColor: copied ? 'rgba(34,197,94,0.12)' : 'transparent',
        color: copied ? '#86efac' : accent,
        fontWeight: 500,
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      {copied
        ? tr('Copiado', 'Copied')
        : narrowLabel ?? tr('Copiar', 'Copy')}
    </button>
  );
}

function tryOpenNativeAppUrl(schemeUrl: string): void {
  window.location.href = schemeUrl;
}

type Tr = (es: string, en: string) => string;

export type CallInterstitialProfile = {
  name: string;
  photoUrl: string | null;
};

function slotHeaderGlyph(slot: PublicSlot | null | undefined, accent: string): React.ReactNode | undefined {
  if (!slot) return undefined;
  const v = resolveSlotVisual(slot);
  if (v.kind === 'url') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={v.url} alt="" width={28} height={28} style={{ borderRadius: 8, objectFit: 'cover' }} />
    );
  }
  return slotDefToGlyph(v.def, 26, accent);
}

export function MirrorActionModals({
  plan,
  slot,
  callInterstitialProfile,
  onClose,
  tr,
  accent = '#D4AF37',
}: {
  plan: MirrorOpenPlan | null;
  /** Slot pulsado (icono en el panel de datos). */
  slot?: PublicSlot | null;
  /** Perfil del titular de la tarjeta (interstitial Ghost-Link). */
  callInterstitialProfile?: CallInterstitialProfile | null;
  onClose: () => void;
  tr: Tr;
  accent?: string;
}) {
  const sheetStyle = makeSheet(accent);

  const rowBtns: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    marginTop: 16,
    flexWrap: 'wrap',
  };

  if (!plan) {
    return null;
  }

  if (plan.kind === 'text' || plan.kind === 'raw') {
    const body = plan.value || tr('Sin contenido', 'No content');
    return (
      <SafeDataViewerSheet
        open
        onClose={onClose}
        title={plan.title}
        body={body}
        tr={tr}
        accent={accent}
        headerGlyph={slotHeaderGlyph(slot ?? null, accent)}
        copyText={body}
        footerActions={
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              minHeight: 48,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.12)',
              backgroundColor: 'rgba(255,255,255,0.06)',
              color: '#a1a1aa',
              fontSize: 16,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {tr('Cerrar', 'Close')}
          </button>
        }
      />
    );
  }

  if (plan.kind === 'email') {
    return (
      <div style={overlay} onClick={onClose} role="presentation">
        <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 400, color: accent, marginBottom: 8 }}>{tr('Correo', 'Email')}</div>
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
            <CopyChip text={plan.value} tr={tr} accent={accent} />
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
          <div style={{ fontWeight: 400, color: accent, marginBottom: 8 }}>{tr('Teléfono', 'Phone')}</div>
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
            <CopyChip text={plan.value} tr={tr} accent={accent} narrowLabel={tr('Copiar número', 'Copy number')} />
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
          <div style={{ fontWeight: 400, color: accent, marginBottom: 8 }}>{plan.title}</div>
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
            <CopyChip text={httpsUrl} tr={tr} accent={accent} narrowLabel={tr('Copiar enlace', 'Copy link')} />
          </div>
          <div style={{ marginTop: 10 }}>
            <Btn accent={accent} onClick={onClose}>{tr('Cerrar', 'Close')}</Btn>
          </div>
        </div>
      </div>
    );
  }

  if (plan.kind === 'document') {
    const uRaw = plan.value.trim();
    const u = resolvePublicVaultUrlForWeb(uRaw) ?? uRaw;
    const mime = String(plan.vaultMimeType || '').toLowerCase();
    const isPdf = mime.includes('pdf') || /\.pdf(\?|$)/i.test(u);
    const isImg =
      mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|heic)(\?|$)/i.test(u);
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
            <div style={{ fontWeight: 400, color: accent }}>{plan.title}</div>
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
            <CopyChip text={u} tr={tr} accent={accent} narrowLabel={tr('Copiar URL', 'Copy URL')} />
          </div>
        </div>
      </div>
    );
  }

  if (plan.kind === 'ghost') {
    return (
      <GhostCallInterstitial
        accent={accent}
        tr={tr}
        onClose={onClose}
        profile={callInterstitialProfile ?? null}
      />
    );
  }

  return null;
}

function GhostCallInterstitial({
  accent,
  tr,
  onClose,
  profile,
}: {
  accent: string;
  tr: Tr;
  onClose: () => void;
  profile: CallInterstitialProfile | null;
}) {
  const appUrl = 'cardsocial://';
  const displayName = (profile?.name || tr('Contacto', 'Contact')).trim();

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
        paddingBottom: 'max(28px, env(safe-area-inset-bottom, 0px))',
        background: 'radial-gradient(ellipse 120% 80% at 50% 20%, rgba(201,162,39,0.12) 0%, transparent 55%), linear-gradient(180deg, #0a0a0f 0%, #050508 100%)',
      }}
      role="dialog"
      aria-modal
    >
      <div style={{ position: 'absolute', top: 18, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Image src="/cs-icon-logo.png" alt="" width={22} height={22} unoptimized />
        <span style={{ color: '#d4d4d8', fontWeight: 300, fontSize: 15, letterSpacing: 0.5 }}>Card-Social</span>
      </div>

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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', maxWidth: 360, width: '100%' }}>
        <InterstitialAvatar photoUrl={profile?.photoUrl ?? null} name={displayName} size={112} accent={accent} />
        <h2
          style={{
            margin: '22px 0 8px',
            color: '#fafafa',
            fontSize: 24,
            fontWeight: 600,
            textAlign: 'center',
            lineHeight: 1.25,
          }}
        >
          {displayName}
        </h2>
        <p
          style={{
            margin: '0 0 28px',
            color: '#a1a1aa',
            fontSize: 15,
            lineHeight: 1.55,
            textAlign: 'center',
          }}
        >
          {tr(
            'Llamada privada Ghost-Link: solo en la app Card-Social. Tu número real no se comparte.',
            'Private Ghost-Link call: only in the Card-Social app. Your real number is never shared.',
          )}
        </p>

        <button
          type="button"
          onClick={() => tryOpenNativeAppUrl(appUrl)}
          style={{
            width: '100%',
            maxWidth: 340,
            minHeight: 54,
            borderRadius: 16,
            border: 'none',
            background: `linear-gradient(135deg, ${accent} 0%, #a67c1f 100%)`,
            color: '#0a0a0a',
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: 0.3,
            cursor: 'pointer',
            boxShadow: `0 8px 28px ${accent}44`,
          }}
        >
          {tr('Iniciar llamada segura', 'Start secure call')}
        </button>

        <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => window.open('https://cardsocial.me', '_blank', 'noopener,noreferrer')}
            style={{
              padding: '12px 20px',
              borderRadius: 12,
              border: `1px solid ${accent}55`,
              background: 'transparent',
              color: accent,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {tr('Descargar app', 'Get the app')}
          </button>
        </div>
      </div>
    </div>
  );
}
