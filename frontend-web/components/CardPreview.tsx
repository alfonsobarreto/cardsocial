'use client';

import React, { useEffect, useState } from 'react';
import WireframeUniversalCard from '@/components/WireframeUniversalCard';
import PublicLegalFooter from '@/components/PublicLegalFooter';
import type { CardData } from '@/lib/universalCardTypes';
import { CardTheme } from '@/lib/themes';

export type { CardData, PublicSlot } from '@/lib/universalCardTypes';

type Props = {
  card: CardData;
  theme: CardTheme;
  expiresAt: string;
  locale: 'es' | 'en';
};

export default function CardPreview({ card, theme, expiresAt, locale }: Props) {
  const tr = (es: string, en: string) => (locale === 'es' ? es : en);
  const bd = theme.border;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const expiresDate = new Date(expiresAt);
  const msLeft = Math.max(0, expiresDate.getTime() - now);
  const sLeft = Math.floor(msLeft / 1000);
  const hh = Math.floor(sLeft / 3600);
  const mm = Math.floor((sLeft % 3600) / 60);
  const ss = sLeft % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const cdStr = `${pad(hh)}:${pad(mm)}:${pad(ss)}`;

  const deepLink = `cardsocial://u/${card.cardId}`;
  const storeUrl = 'https://cardsocial.me';

  return (
    <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
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
        {tr('Acceso temporal', 'Temporary access')}: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{cdStr}</span>{' '}
        {tr('restantes', 'remaining')}.
      </div>

      <WireframeUniversalCard card={card} theme={theme} locale={locale} />

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
            backgroundColor: bd.color,
            color: theme.background[0],
            fontWeight: 400,
            fontSize: 16,
            textDecoration: 'none',
            letterSpacing: 0.3,
          }}
        >
          {tr('Descargar Card-Social', 'Download Card-Social')}
        </a>
        <a
          href={deepLink}
          style={{
            display: 'block',
            textAlign: 'center',
            padding: '14px 24px',
            borderRadius: 14,
            border: `2px solid ${bd.color}`,
            color: bd.color,
            fontWeight: 400,
            fontSize: 15,
            textDecoration: 'none',
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
