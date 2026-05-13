'use client';

import React, { useEffect, useState } from 'react';
import type { CardData } from '@/lib/universalCardTypes';
import type { PublicLocale } from '@/lib/resolvePublicLocale';
import {
  buildBusinessCardVcardBody,
  businessCardVcardFilename,
  CONTACTS_PHONE_GREEN,
} from '@/lib/buildBusinessCardVcard';

type Props = {
  card: CardData;
  canonicalWebUrl: string;
  locale: PublicLocale;
};

function PhoneOutlineIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.6 2.33.92 3.57.92.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.32 2.45.92 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function useShowOnTouchDevices(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    const touchPoints = nav?.maxTouchPoints ? nav.maxTouchPoints > 0 : false;
    setShow(Boolean(coarse || touchPoints));
  }, []);
  return show;
}

export default function SaveBusinessContactButton({ card, canonicalWebUrl, locale }: Props) {
  const visible = useShowOnTouchDevices();
  const tr = (es: string, en: string) => (locale === 'es' ? es : en);
  const label = tr('Guardar en contactos', 'Save to Contacts');

  if (!visible) return null;

  const download = () => {
    try {
      const body = buildBusinessCardVcardBody(card, canonicalWebUrl);
      const blob = new Blob([body], { type: 'text/vcard;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = businessCardVcardFilename(card);
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('[SaveBusinessContact]', e);
    }
  };

  return (
    <button
      type="button"
      onClick={download}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        width: '100%',
        padding: '14px 24px',
        borderRadius: 14,
        border: 'none',
        cursor: 'pointer',
        backgroundColor: CONTACTS_PHONE_GREEN,
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 600,
        letterSpacing: 0.2,
        boxShadow: '0 2px 8px rgba(52, 199, 89, 0.35)',
      }}
    >
      <span style={{ color: '#FFFFFF', display: 'flex', flexShrink: 0 }}>
        <PhoneOutlineIcon size={22} />
      </span>
      {label}
    </button>
  );
}
