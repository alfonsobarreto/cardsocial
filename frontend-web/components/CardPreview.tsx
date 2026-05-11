'use client';

import React, { useEffect, useState } from 'react';
import BusinessCardWeb from '@/components/BusinessCardWeb';
import DocumentHtmlLang from '@/components/DocumentHtmlLang';
import PublicLegalFooter from '@/components/PublicLegalFooter';
import type { CardData } from '@/lib/universalCardTypes';
import { CardTheme } from '@/lib/themes';
import { earlyAccessPrimaryCtaStyle, earlyAccessPrimaryLabel, earlyAccessSecondaryCtaStyle } from '@/lib/publicEarlyAccessCta';
import { trackPublicBusinessCardViewOncePerSession } from '@/lib/publicBusinessCardAnalytics';

export type { CardData, PublicSlot } from '@/lib/universalCardTypes';

type Props =
  | {
      card: CardData;
      theme: CardTheme;
      expiresAt: string;
      locale: 'es' | 'en';
      /** Enlace universal 24h (`/u/…`). */
      variant?: 'universal';
      /** Token del enlace universal (`/u/{token}`), para deep link. */
      universalToken: string;
    }
  | {
      card: CardData;
      theme: CardTheme;
      expiresAt: string;
      locale: 'es' | 'en';
      /** Misma ficha pública que el 24h, sin cuenta regresiva. */
      variant: 'business';
      appDeepLink: string;
    };

export default function CardPreview(props: Props) {
  const { card, theme, expiresAt, locale } = props;
  const isBusiness = props.variant === 'business';
  const tr = (es: string, en: string) => (locale === 'es' ? es : en);
  const bd = theme.border;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (isBusiness) {
      const ownerUid = String(card.uid || '').trim();
      const bId = String(card.bId || '').trim();
      if (ownerUid && bId) {
        trackPublicBusinessCardViewOncePerSession(ownerUid, bId);
      }
      return;
    }
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isBusiness, card.uid, card.bId]);

  const expiresDate = new Date(expiresAt);
  const msLeft = Math.max(0, expiresDate.getTime() - now);
  const sLeft = Math.floor(msLeft / 1000);
  const hh = Math.floor(sLeft / 3600);
  const mm = Math.floor((sLeft % 3600) / 60);
  const ss = sLeft % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const cdStr = `${pad(hh)}:${pad(mm)}:${pad(ss)}`;

  const deepLink = isBusiness ? props.appDeepLink : `cardsocial://u/${props.universalToken}`;
  const storeUrl = 'https://cardsocial.me/';

  return (
    <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
      <DocumentHtmlLang locale={locale} />
      <div
        style={{
          background: `${bd.color}26`,
          border: `1px solid ${bd.color}44`,
          borderRadius: 10,
          padding: '8px 16px',
          marginBottom: 16,
          textAlign: 'center',
          color: bd.color,
          fontSize: 13,
          fontWeight: 300,
        }}
      >
        {isBusiness ? (
          <>
            {tr('Tarjeta de negocio pública (permanente)', 'Public business card (permanent)')}
          </>
        ) : (
          <>
            {tr('Acceso temporal', 'Temporary access')}: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{cdStr}</span>{' '}
            {tr('restantes', 'remaining')}.
          </>
        )}
      </div>

      <BusinessCardWeb
        card={card}
        theme={theme}
        locale={locale}
        previewVariant={isBusiness ? 'business' : 'universal'}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        <a
          href={storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            textAlign: 'center',
            padding: '14px 24px',
            borderRadius: 14,
            ...earlyAccessPrimaryCtaStyle(theme),
            fontSize: 16,
            textDecoration: 'none',
            letterSpacing: 0.3,
          }}
        >
          {earlyAccessPrimaryLabel(locale)}
        </a>
        <a
          href={deepLink}
          style={{
            display: 'block',
            textAlign: 'center',
            padding: '14px 24px',
            borderRadius: 14,
            fontSize: 15,
            textDecoration: 'none',
            ...earlyAccessSecondaryCtaStyle(theme),
          }}
        >
          {tr('Abrir en la app', 'Open in app')}
        </a>
      </div>

      <PublicLegalFooter
        locale={locale}
        accentColor={bd.color}
        background={`${bd.color}14`}
      />
    </div>
  );
}
