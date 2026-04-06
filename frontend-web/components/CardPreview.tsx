'use client';

import Image from 'next/image';
import { CardTheme } from '@/lib/themes';
import { getSlotIcon } from '@/lib/slotIcons';
import { getWireframeIconRowPlan } from '@/lib/wireframeIconPlan';

export type PublicSlot = {
  type: string;
  label: string;
  value: string;
};

export type CardData = {
  cardId: string;
  name: string;
  layout: 'vertical' | 'horizontal';
  themeId: string | null;
  wallpaperUrl: string | null;
  ownerDisplayName: string;
  ownerNickname: string | null;
  ownerPhotoUrl: string | null;
  ownerOccupation: string | null;
  holdersCount: number;
  ratingAvg: number;
  totalRatings: number;
  slots: PublicSlot[];
  expiresAt: string;
};

type Props = {
  card: CardData;
  theme: CardTheme;
  expiresAt: string;
  locale: 'es' | 'en';
};

function StarIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={color}>
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

function RatingStars({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{ position: 'relative', width: 16, height: 16 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.15)">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
          {value >= i ? (
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: '100%' }}>
              <StarIcon color={color} />
            </div>
          ) : value > i - 1 ? (
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: `${(value - (i - 1)) * 100}%` }}>
              <StarIcon color={color} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SlotTile({ slot, theme }: { slot: PublicSlot; theme: CardTheme }) {
  const icon = getSlotIcon(slot.type);
  const isVoip = slot.type?.toLowerCase().includes('voip');

  const handleTap = () => {
    if (isVoip) return;
    const val = slot.value || '';
    const type = (slot.type || '').toLowerCase();
    let url = '';
    if (type === 'phone') url = `tel:${val}`;
    else if (type === 'email') url = `mailto:${val}`;
    else if (type === 'whatsapp') url = `https://wa.me/${val.replace(/\D/g, '')}`;
    else if (type === 'instagram') url = `https://instagram.com/${val.replace('@', '')}`;
    else if (type === 'linkedin') url = `https://linkedin.com/in/${val}`;
    else if (type === 'twitter') url = `https://twitter.com/${val.replace('@', '')}`;
    else if (type === 'facebook') url = `https://facebook.com/${val}`;
    else if (type === 'youtube') url = `https://youtube.com/@${val}`;
    else if (type === 'tiktok') url = `https://tiktok.com/@${val}`;
    else if (type === 'telegram') url = `https://t.me/${val}`;
    else if (type === 'snapchat') url = `https://snapchat.com/add/${val}`;
    else if (type === 'website' || type === 'url') url = val.startsWith('http') ? val : `https://${val}`;
    else if (type === 'location' || type === 'address') url = `https://maps.google.com/?q=${encodeURIComponent(val)}`;
    if (url) window.open(url, '_blank', 'noopener');
  };

  return (
    <button
      onClick={handleTap}
      disabled={isVoip}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        background: 'none',
        border: 'none',
        cursor: isVoip ? 'not-allowed' : 'pointer',
        padding: '8px 4px',
        opacity: isVoip ? 0.45 : 1,
        minWidth: 64,
        flex: 1,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: theme.bubble.borderRadius,
          backgroundColor: theme.bubble.backgroundColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: theme.shadowStyle === 'drop'
            ? `0 3px 10px ${theme.border.color}55`
            : theme.shadowStyle === 'inner'
            ? `inset 0 2px 6px ${theme.border.color}44`
            : 'none',
        }}
      >
        <svg
          width="26"
          height="26"
          viewBox={icon.viewBox ?? '0 0 24 24'}
          fill={theme.icon.color}
        >
          <path d={icon.path} />
        </svg>
      </div>
      <span
        style={{
          color: theme.iconLabel.color,
          fontSize: 10,
          fontWeight: theme.iconLabel.fontWeight,
          fontStyle: theme.iconLabel.fontStyle,
          textAlign: 'center',
          maxWidth: 64,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {slot.label || slot.type}
      </span>
    </button>
  );
}

export default function CardPreview({ card, theme, expiresAt, locale }: Props) {
  const tr = (es: string, en: string) => locale === 'es' ? es : en;

  const bg = theme.background;
  const bd = theme.border;

  /** Misma prioridad que modales RN: nombre de tarjeta → nombre visible → cargo. */
  const cardNm = String(card.name || '').trim();
  const person = String(card.ownerDisplayName || '').trim();
  const occ = String(card.ownerOccupation || '').trim();
  const dispName = (cardNm || person || occ || 'Card-Social').trim();
  const dispSub = card.ownerNickname
    ? (card.ownerNickname.startsWith('@') ? card.ownerNickname : `@${card.ownerNickname}`)
    : null;

  const reviewCount = Math.max(0, Math.floor(card.totalRatings ?? 0));
  const ratingVal = reviewCount > 0 ? Math.max(0, Math.min(5, Number(card.ratingAvg ?? 5))) : 0;

  const slots = (card.slots ?? []).slice(0, 24);
  const rows: PublicSlot[][] = [];
  const plan = getWireframeIconRowPlan(slots.length);
  let offset = 0;
  for (const n of plan) {
    rows.push(slots.slice(offset, offset + n));
    offset += n;
  }

  const expiresDate = new Date(expiresAt);
  const hoursLeft = Math.max(0, Math.ceil((expiresDate.getTime() - Date.now()) / 3600000));

  const deepLink = `cardsocial://u/${card.cardId}`;
  const storeUrl = 'https://cardsocial.me';

  return (
    <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
      {/* Countdown banner */}
      <div style={{
        background: 'rgba(212,175,55,0.15)',
        border: `1px solid ${bd.color}44`,
        borderRadius: 10,
        padding: '8px 16px',
        marginBottom: 16,
        textAlign: 'center',
        color: bd.color,
        fontSize: 13,
        fontWeight: '600',
      }}>
        {tr('Acceso temporal', 'Temporary access')} · {hoursLeft}h {tr('restantes', 'remaining')}
      </div>

      {/* Card */}
      <div
        style={{
          borderRadius: 20,
          border: `${bd.width}px solid ${bd.color}`,
          background: `linear-gradient(180deg, ${bg[0]} 0%, ${bg[1]} 50%, ${bg[2]} 100%)`,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: theme.shadowStyle === 'drop'
            ? `0 8px 32px ${bd.color}44`
            : theme.shadowStyle === 'inner'
            ? `inset 0 2px 16px ${bd.color}22, 0 4px 24px rgba(0,0,0,0.4)`
            : '0 4px 20px rgba(0,0,0,0.3)',
        }}
      >
        {/* Wallpaper */}
        {card.wallpaperUrl && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
            <Image
              src={card.wallpaperUrl}
              alt=""
              fill
              style={{ objectFit: 'cover', opacity: 0.35 }}
              unoptimized
            />
          </div>
        )}

        <div style={{ position: 'relative', zIndex: 1, padding: '16px 16px 20px' }}>
          {/* Brand header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginBottom: 14,
          }}>
            <span style={{ fontSize: 13, color: theme.subtitle.color, fontWeight: '700', letterSpacing: 1 }}>
              ★ Card-Social
            </span>
          </div>

          {/* Avatar + Info */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            {/* Avatar */}
            <div style={{
              width: 88,
              height: 88,
              borderRadius: Math.round(88 * 0.22),
              border: `${bd.width + 1}px solid ${bd.color}`,
              overflow: 'hidden',
              backgroundColor: theme.bubble.backgroundColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 4px 16px ${bd.color}44`,
              flexShrink: 0,
            }}>
              {card.ownerPhotoUrl ? (
                <Image
                  src={card.ownerPhotoUrl}
                  alt={card.ownerDisplayName}
                  width={88}
                  height={88}
                  style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                  unoptimized
                />
              ) : (
                <svg width="44" height="44" viewBox="0 0 24 24" fill={theme.title.color}>
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              )}
            </div>

            {/* Name + Nick + Stats */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                color: theme.title.color,
                fontSize: 22,
                fontWeight: theme.title.fontWeight,
                fontStyle: theme.title.fontStyle,
                lineHeight: 1.2,
                marginBottom: 2,
              }}>
                {dispName}
              </div>
              {dispSub && (
                <div style={{
                  color: theme.subtitle.color,
                  fontSize: 13,
                  fontWeight: theme.subtitle.fontWeight,
                  marginBottom: 6,
                }}>
                  {dispSub}
                </div>
              )}

              {/* Stats row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <RatingStars value={ratingVal} color={theme.icon.color} />
                  <span style={{ color: theme.extraText.color, fontSize: 11, fontStyle: theme.extraText.fontStyle }}>
                    {ratingVal.toFixed(1)} · {reviewCount} {tr('reseñas', 'reviews')}
                  </span>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  border: `1px solid ${bd.color}`,
                  borderRadius: 20,
                  padding: '3px 10px',
                  backgroundColor: theme.bubble.backgroundColor,
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill={theme.icon.color}>
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                  </svg>
                  <span style={{ color: theme.title.color, fontSize: 12, fontWeight: '600' }}>
                    {card.holdersCount}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Slots grid */}
          {rows.length > 0 && (
            <div style={{
              borderTop: `1px solid ${bd.color}33`,
              paddingTop: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}>
              {rows.map((row, ri) => (
                <div key={ri} style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                  {row.map((slot, si) => (
                    <SlotTile key={`${ri}-${si}`} slot={slot} theme={theme} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
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
            color: '#000',
            fontWeight: '800',
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
            fontWeight: '700',
            fontSize: 15,
            textDecoration: 'none',
          }}
        >
          {tr('Abrir en la app', 'Open in app')}
        </a>
      </div>
    </div>
  );
}
