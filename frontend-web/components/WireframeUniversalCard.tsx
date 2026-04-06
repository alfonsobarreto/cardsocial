'use client';

import Image from 'next/image';
import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import type { CardData, PublicSlot } from '@/lib/universalCardTypes';
import { CardTheme } from '@/lib/themes';
import {
  computeStitchWireframeBubbleSide,
  getWireframeIconRowPlan,
  WIREFRAME_STITCH_GAP,
  WIREFRAME_STITCH_HORIZONTAL_INSET,
} from '@/lib/wireframeMath';
import { resolveSlotVisual } from '@/lib/slotVisual';
import type { SlotIconDef } from '@/lib/slotIcons';
import { getMirrorVaultOpenPlan, type MirrorOpenPlan } from '@card-social/services/mirrorVaultItemOpenPlan';
import { MirrorActionModals } from '@/components/MirrorActionModals';

const STAR_PATH =
  'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';

function WireRatingStars({ rating, size, color }: { rating: number; size: number; color: string }) {
  const clipUid = useId().replace(/:/g, '');
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  const gap = Math.max(1, Math.round(size * 0.12));
  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const threshold = i;
        let mode: 'full' | 'half' | 'empty' = 'empty';
        if (r >= threshold) mode = 'full';
        else if (r >= threshold - 0.5) mode = 'half';
        const hid = `${clipUid}-h${i}`;
        return (
          <div key={i} style={{ position: 'relative', width: size, height: size }}>
            <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
              <path d={STAR_PATH} fill="none" stroke={color} strokeWidth={1.2} opacity={0.35} />
            </svg>
            {mode === 'full' ? (
              <svg
                width={size}
                height={size}
                viewBox="0 0 24 24"
                style={{ position: 'absolute', left: 0, top: 0, display: 'block' }}
              >
                <path d={STAR_PATH} fill={color} />
              </svg>
            ) : mode === 'half' ? (
              <svg
                width={size}
                height={size}
                viewBox="0 0 24 24"
                style={{ position: 'absolute', left: 0, top: 0, display: 'block' }}
              >
                <defs>
                  <clipPath id={hid}>
                    <rect x="0" y="0" width="12" height="24" />
                  </clipPath>
                </defs>
                <path d={STAR_PATH} fill={color} clipPath={`url(#${hid})`} />
              </svg>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function compactSlotLabel(label: string): string {
  return String(label || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

function SlotGlyph({ visual, size, color }: { visual: { kind: 'url'; url: string } | { kind: 'svg'; def: SlotIconDef }; size: number; color: string }) {
  if (visual.kind === 'url') {
    return (
      <img
        src={visual.url}
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: size / 2, objectFit: 'cover', display: 'block' }}
      />
    );
  }
  const d = visual.def;
  return (
    <svg width={size} height={size} viewBox={d.viewBox ?? '0 0 24 24'} fill={color} style={{ display: 'block' }}>
      <path d={d.path} />
    </svg>
  );
}

function WebWireframeSlotTile({
  slot,
  bubbleSize,
  theme,
  onPress,
}: {
  slot: PublicSlot;
  bubbleSize: number;
  theme: CardTheme;
  onPress: (slot: PublicSlot) => void;
}) {
  const bubble = Math.max(26, Math.floor(bubbleSize));
  const iconSize = Math.round(bubble * 0.9);
  const il = theme.iconLabel;
  const labelFontSize = Math.max(9, Math.min(15, Math.round(Math.min(bubble * 0.155, il.fontSize + 5))));
  const labelLineHeight = Math.ceil(labelFontSize * 1.22);
  const minTileH = bubble + 8 + labelLineHeight * 2 + 8 + 6;
  const bubbleR = Math.min(theme.bubble.borderRadius, bubble / 2);
  const visual = resolveSlotVisual(slot);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: minTileH, width: bubble }}>
      <button
        type="button"
        onClick={() => onPress(slot)}
        disabled={String(slot.type || '').toLowerCase().includes('voip')}
        style={{
          width: bubble,
          height: bubble,
          borderRadius: bubbleR,
          backgroundColor: theme.bubble.backgroundColor,
          border: `${Math.max(1, theme.border.width)}px solid ${theme.border.color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: String(slot.type || '').toLowerCase().includes('voip') ? 'not-allowed' : 'pointer',
          opacity: String(slot.type || '').toLowerCase().includes('voip') ? 0.45 : 1,
          padding: 0,
          boxSizing: 'border-box',
          ...(theme.shadowStyle === 'drop'
            ? { boxShadow: `0 3px 10px ${theme.border.color}55` }
            : theme.shadowStyle === 'inner'
              ? { boxShadow: `inset 0 2px 6px ${theme.border.color}44` }
              : {}),
        }}
      >
        <SlotGlyph visual={visual} size={iconSize} color={theme.icon.color} />
      </button>
      <div
        style={{
          marginTop: 2,
          textAlign: 'center',
          width: '100%',
          maxWidth: bubble + 8,
          fontSize: labelFontSize,
          lineHeight: `${labelLineHeight}px`,
          color: il.color,
          fontWeight: il.fontWeight,
          fontStyle: il.fontStyle,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden',
        }}
      >
        {compactSlotLabel(slot.label || slot.type || '—')}
      </div>
    </div>
  );
}

type Props = {
  card: CardData;
  theme: CardTheme;
  locale: 'es' | 'en';
};

export default function WireframeUniversalCard({ card, theme, locale }: Props) {
  const tr = (es: string, en: string) => (locale === 'es' ? es : en);
  const [slotActionPlan, setSlotActionPlan] = useState<MirrorOpenPlan | null>(null);

  const handleSlotPress = (slot: PublicSlot) => {
    if (String(slot.type || '').toLowerCase().includes('voip')) {
      return;
    }
    const plan = getMirrorVaultOpenPlan(
      { type: slot.type, value: slot.value, title: slot.label },
      {
        cardOwnerUid: String(card.ownerUid || '').trim(),
        cardId: String(card.cardId || '').trim(),
        sourceCardName: String(card.name || '').trim() || 'Card-Social',
      },
    );
    setSlotActionPlan(plan);
  };

  const vertIconsBoxRef = useRef<HTMLDivElement | null>(null);
  const horizIconsBoxRef = useRef<HTMLDivElement | null>(null);
  const [vertBox, setVertBox] = useState({ w: 0, h: 0 });
  const [horizBox, setHorizBox] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = vertIconsBoxRef.current;
    const elH = horizIconsBoxRef.current;
    const ro = new ResizeObserver(() => {
      if (el) {
        const r = el.getBoundingClientRect();
        setVertBox({ w: r.width, h: r.height });
      }
      if (elH) {
        const r = elH.getBoundingClientRect();
        setHorizBox({ w: r.width, h: r.height });
      }
    });
    if (el) ro.observe(el);
    if (elH) ro.observe(elH);
    return () => ro.disconnect();
  }, [card.layout, card.slots?.length]);

  const slots = (card.slots ?? []).slice(0, 24);
  const rowPlan = getWireframeIconRowPlan(slots.length);
  let off = 0;
  const rows: PublicSlot[][] = rowPlan.map((n) => {
    const row = slots.slice(off, off + n);
    off += n;
    return row;
  });

  const cardNm = String(card.name || '').trim();
  const person = String(card.ownerDisplayName || '').trim();
  const occ = String(card.ownerOccupation || '').trim();
  const dispName = (cardNm || person || occ || 'Card-Social').trim();
  const dispSub = card.ownerNickname
    ? card.ownerNickname.startsWith('@')
      ? card.ownerNickname
      : `@${card.ownerNickname}`
    : '';

  const reviewCount = Math.max(0, Math.floor(card.totalRatings ?? 0));
  const ratingVal = reviewCount > 0 ? Math.max(0, Math.min(5, Number(card.ratingAvg ?? 5))) : 0;

  const bg = theme.background;
  const bd = theme.border;

  const layout = card.layout === 'horizontal' ? 'horizontal' : 'vertical';

  const vertUsableW = Math.max(0, vertBox.w - WIREFRAME_STITCH_HORIZONTAL_INSET);
  const vertBubble =
    vertUsableW > 0 && vertBox.h > 0 && rowPlan.length
      ? computeStitchWireframeBubbleSide(
          vertUsableW,
          vertBox.h,
          rowPlan,
          WIREFRAME_STITCH_GAP,
          WIREFRAME_STITCH_GAP,
          theme.iconLabel.fontSize,
        )
      : 0;

  const horizUsableW = Math.max(0, horizBox.w - WIREFRAME_STITCH_HORIZONTAL_INSET);
  const horizBubble =
    horizUsableW > 0 && horizBox.h > 0 && rowPlan.length
      ? computeStitchWireframeBubbleSide(
          horizUsableW,
          horizBox.h,
          rowPlan,
          WIREFRAME_STITCH_GAP,
          WIREFRAME_STITCH_GAP,
          theme.iconLabel.fontSize,
        )
      : 0;

  const iconGrid = (bubble: number) =>
    bubble > 0 ? (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          width: '100%',
          gap: WIREFRAME_STITCH_GAP,
        }}
      >
        {rows.map((row, ri) => (
          <div
            key={`row-${ri}`}
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'center',
              gap: WIREFRAME_STITCH_GAP,
              flexWrap: 'nowrap',
              width: '100%',
            }}
          >
            {row.map((slot, si) => (
              <div
                key={`${slot.itemId || slot.label || si}-${ri}`}
                style={{
                  width: bubble,
                  maxWidth: bubble,
                  flex: '0 0 auto',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <WebWireframeSlotTile slot={slot} bubbleSize={bubble} theme={theme} onPress={handleSlotPress} />
              </div>
            ))}
          </div>
        ))}
      </div>
    ) : null;

  const statsBlock = (starSize: number, captionSize: number, statsSize: number) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        width: '100%',
        maxWidth: '100%',
        padding: '6px 2px 10px',
        marginTop: 6,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 }}>
        <WireRatingStars rating={ratingVal} size={starSize} color={theme.icon.color} />
        <span
          style={{
            color: theme.extraText.color,
            fontSize: captionSize,
            fontWeight: theme.extraText.fontWeight,
            fontStyle: theme.extraText.fontStyle,
            textAlign: 'center',
          }}
        >
          {ratingVal.toFixed(1)} · {reviewCount} {tr('reseñas', 'reviews')}
        </span>
      </div>
      <div
        style={{
          display: 'inline-flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          borderRadius: 999,
          border: `1px solid ${bd.color}`,
          backgroundColor: theme.bubble.backgroundColor,
          padding: '4px 8px',
        }}
      >
        <svg width={statsSize} height={statsSize} viewBox="0 0 24 24" fill={theme.icon.color}>
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
        <span style={{ color: theme.title.color, fontSize: statsSize, fontWeight: 800 }}>{card.holdersCount}</span>
      </div>
    </div>
  );

  const gradientBg = `linear-gradient(180deg, ${bg[0]} 0%, ${bg[1]} 50%, ${bg[2]} 100%)`;
  const cardShadow =
    theme.shadowStyle === 'drop'
      ? `0 8px 32px ${bd.color}44`
      : theme.shadowStyle === 'inner'
        ? `inset 0 2px 16px ${bd.color}22, 0 4px 24px rgba(0,0,0,0.4)`
        : '0 4px 20px rgba(0,0,0,0.3)';

  if (layout === 'horizontal') {
    return (
      <>
      <div
        style={{
          borderRadius: 16,
          border: `${bd.width}px solid ${bd.color}`,
          background: gradientBg,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: cardShadow,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          minHeight: 480,
        }}
      >
        {card.wallpaperUrl ? (
          <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.93, pointerEvents: 'none' }}>
            <Image src={card.wallpaperUrl} alt="" fill style={{ objectFit: 'cover' }} unoptimized />
          </div>
        ) : null}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 480 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 0',
              gap: 6,
              flex: '0 0 auto',
            }}
          >
            <Image src="/cs-icon-logo.png" alt="" width={18} height={18} unoptimized />
            <span style={{ fontWeight: 700, opacity: 0.85, color: theme.subtitle.color, fontSize: 13 }}>Card-Social</span>
          </div>

          <div
            style={{
              flex: '2.85 1 0',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                flex: '1.2 1 0',
                padding: 8,
                paddingRight: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 13,
                  border: `${bd.width}px solid ${bd.color}`,
                  overflow: 'hidden',
                  backgroundColor: theme.bubble.backgroundColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {card.ownerPhotoUrl ? (
                  <Image src={card.ownerPhotoUrl} alt="" width={88} height={88} style={{ objectFit: 'cover' }} unoptimized />
                ) : (
                  <svg width={44} height={44} viewBox="0 0 24 24" fill={theme.title.color}>
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                )}
              </div>
            </div>
            <div
              style={{
                flex: '2.6 1 0',
                padding: 8,
                paddingLeft: 4,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <div style={{ color: theme.title.color, fontWeight: 800, fontSize: 18, textAlign: 'center' }}>{dispName}</div>
              {dispSub ? (
                <div style={{ color: theme.subtitle.color, fontWeight: 600, fontSize: 12, textAlign: 'center' }}>{dispSub}</div>
              ) : null}
              {statsBlock(22, 8, 10)}
            </div>
          </div>

          <div
            ref={horizIconsBoxRef}
            style={{
              flex: '2.95 1 0',
              minHeight: 120,
              marginTop: 12,
              paddingTop: 2,
              paddingBottom: 6,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                flex: 1,
                width: '100%',
                paddingLeft: 24,
                paddingRight: 24,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'stretch',
              }}
            >
              {iconGrid(horizBubble)}
            </div>
          </div>
        </div>
      </div>
      <MirrorActionModals plan={slotActionPlan} onClose={() => setSlotActionPlan(null)} tr={tr} />
      </>
    );
  }

  return (
    <>
    <div
      style={{
        borderRadius: 16,
        border: `${bd.width}px solid ${bd.color}`,
        background: gradientBg,
        overflow: 'hidden',
        position: 'relative',
        boxShadow: cardShadow,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minHeight: 520,
      }}
    >
      {card.wallpaperUrl ? (
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.93, pointerEvents: 'none' }}>
          <Image src={card.wallpaperUrl} alt="" fill style={{ objectFit: 'cover' }} unoptimized />
        </div>
      ) : null}

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 520 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px 0',
            gap: 6,
            flex: '0 0 auto',
          }}
        >
          <Image src="/cs-icon-logo.png" alt="" width={18} height={18} unoptimized />
          <span style={{ fontWeight: 700, opacity: 0.85, color: theme.subtitle.color, fontSize: 13 }}>Card-Social</span>
        </div>

        <div style={{ flex: '2.9 1 0', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              flex: '1.85 1 0',
              minHeight: 96,
              padding: '4px 8px 10px',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 21,
                border: `${bd.width + 1}px solid ${bd.color}`,
                overflow: 'hidden',
                backgroundColor: theme.bubble.backgroundColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 4px 16px ${bd.color}44`,
              }}
            >
              {card.ownerPhotoUrl ? (
                <Image src={card.ownerPhotoUrl} alt="" width={96} height={96} style={{ objectFit: 'cover', width: '100%', height: '100%' }} unoptimized />
              ) : (
                <svg width={48} height={48} viewBox="0 0 24 24" fill={theme.title.color}>
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              )}
            </div>
          </div>

          <div
            style={{
              flex: '1.55 1 0',
              minHeight: 0,
              padding: '8px 8px 12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 5,
            }}
          >
            <div
              style={{
                color: theme.title.color,
                fontSize: 22,
                fontWeight: theme.title.fontWeight,
                fontStyle: theme.title.fontStyle,
                textAlign: 'center',
                lineHeight: 1.2,
              }}
            >
              {dispName}
            </div>
            {dispSub ? (
              <div
                style={{
                  color: theme.subtitle.color,
                  fontSize: 13,
                  fontWeight: theme.subtitle.fontWeight,
                  textAlign: 'center',
                }}
              >
                {dispSub}
              </div>
            ) : null}
            {statsBlock(24, 9, 11)}
          </div>
        </div>

        <div
          ref={vertIconsBoxRef}
          style={{
            flex: '2.35 1 0',
            minHeight: 140,
            marginTop: 12,
            paddingTop: 2,
            paddingBottom: 22,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              flex: 1,
              width: '100%',
              paddingLeft: 24,
              paddingRight: 24,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              alignItems: 'stretch',
            }}
          >
            {iconGrid(vertBubble)}
          </div>
        </div>
      </div>
    </div>
    <MirrorActionModals plan={slotActionPlan} onClose={() => setSlotActionPlan(null)} tr={tr} />
    </>
  );
}
