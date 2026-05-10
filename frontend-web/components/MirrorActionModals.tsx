'use client';

/**
 * Solo interstitial Ghost-Link (abrir app). Enlaces, documentos y demás salen de
 * `runPublicWebSlotAction` en el primer toque — no hay hojas modales aquí.
 */
import Image from 'next/image';
import React from 'react';
import type { MirrorOpenPlan } from '@card-social/services/mirrorVaultItemOpenPlan';
import { InterstitialAvatar } from '@/components/SafeDataViewerSheet';

type Tr = (es: string, en: string) => string;

export type CallInterstitialProfile = {
  name: string;
  photoUrl: string | null;
};

export type GhostPlan = Extract<MirrorOpenPlan, { kind: 'ghost' }>;

export function MirrorActionModals({
  plan,
  callInterstitialProfile,
  onClose,
  tr,
  accent = '#E9C349',
}: {
  plan: GhostPlan | null;
  callInterstitialProfile?: CallInterstitialProfile | null;
  onClose: () => void;
  tr: Tr;
  accent?: string;
}) {
  if (!plan || plan.kind !== 'ghost') {
    return null;
  }
  return (
    <GhostCallInterstitial
      accent={accent}
      tr={tr}
      onClose={onClose}
      profile={callInterstitialProfile ?? null}
    />
  );
}

function tryOpenNativeAppUrl(schemeUrl: string): void {
  window.location.href = schemeUrl;
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
      <div
        style={{
          position: 'absolute',
          top: 18,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
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

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: 360,
          width: '100%',
        }}
      >
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
          {tr('Abrir app para llamar de forma segura', 'Open the app to call securely')}
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
            {tr('Obtener Acceso Anticipado', 'Get Early Access')}
          </button>
        </div>
      </div>
    </div>
  );
}
