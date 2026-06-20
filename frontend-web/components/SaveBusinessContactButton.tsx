'use client';

import React from 'react';
import type { CardData } from '@/lib/universalCardTypes';
import type { PublicLocale } from '@/lib/resolvePublicLocale';
import { CONTACT_SAVE_ANALYTICS_PHONE } from '@card-social/constants/contactSaveAnalyticsKeys';
import {
  notifyPublicBusinessCardIconClick,
  notifyPublicSmartCardIconClick,
} from '@/lib/publicBusinessCardAnalytics';
import {
  buildBusinessCardVcardBody,
  buildUniversalCardVcardBody,
  businessCardVcardFilename,
  CONTACTS_PHONE_GREEN,
  universalCardVcardFilename,
} from '@/lib/buildBusinessCardVcard';
import {
  resolveAndroidVcardServeUrl,
  saveVcardToDeviceContacts,
} from '@/lib/saveVcardToDeviceContacts';

type Props = {
  card: CardData;
  canonicalWebUrl: string;
  locale: PublicLocale;
  /** Si está presente, genera vCard de smart card (`/u/…`). */
  universalToken?: string;
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

export default function SaveBusinessContactButton({
  card,
  canonicalWebUrl,
  locale,
  universalToken,
}: Props) {
  const tr = (es: string, en: string) => (locale === 'es' ? es : en);
  const label = tr('Guardar en contactos', 'Save to Contacts');
  const isUniversal = Boolean(String(universalToken || '').trim());

  const handleSave = () => {
    const ownerUid = String(card.uid || '').trim();
    const bId = String(card.bId || '').trim();
    const sid = String(card.sid || '').trim();
    const token = String(universalToken || '').trim();

    try {
      const body = isUniversal
        ? buildUniversalCardVcardBody(card, canonicalWebUrl)
        : buildBusinessCardVcardBody(card, canonicalWebUrl);
      const filename = isUniversal ? universalCardVcardFilename(card) : businessCardVcardFilename(card);
      const serveUrl = resolveAndroidVcardServeUrl(
        isUniversal
          ? { variant: 'universal', token }
          : { variant: 'business', bId, uid: ownerUid },
      );

      saveVcardToDeviceContacts({ body, filename, serveUrl });

      if (isUniversal && ownerUid && sid) {
        notifyPublicSmartCardIconClick(ownerUid, sid, { subType: CONTACT_SAVE_ANALYTICS_PHONE });
      } else if (ownerUid && bId) {
        notifyPublicBusinessCardIconClick(ownerUid, bId, { subType: CONTACT_SAVE_ANALYTICS_PHONE });
      }
    } catch (e) {
      console.warn('[SaveBusinessContact]', e);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSave}
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
