'use client';

import { MirrorActionModals } from '@/components/MirrorActionModals';
import type { SlotIconDef } from '@/lib/slotIcons';
import { resolveSlotVisual } from '@/lib/slotVisual';
import { CardTheme } from '@/lib/themes';
import type { CardData, PublicSlot } from '@/lib/universalCardTypes';
import {
    computeStitchWireframeBubbleSide,
    getWireframeIconRowPlan,
    WIREFRAME_STITCH_GAP,
    WIREFRAME_STITCH_HORIZONTAL_INSET,
} from '@/lib/wireframeMath';
import { getMirrorVaultOpenPlan, type MirrorOpenPlan } from '@card-social/services/mirrorVaultItemOpenPlan';
import Image from 'next/image';
import { useLayoutEffect, useRef, useState } from 'react';

/** Ancho útil típico del preview (~maxWidth 420 − paddings) hasta que ResizeObserver mida el contenedor. */
const WIREFRAME_FALLBACK_USABLE_W = 304;
/** Si el cálculo devuelve 0 con slots, forzar tamaño mínimo (Safari / flex raro). */
const WIREFRAME_MIN_BUBBLE_WHEN_SLOTS = 48;

function compactSlotLabel(label: string): string {
  return String(label || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

function SlotGlyph({
  visual,
  size,
  color,
  onUrlError,
}: {
  visual: { kind: 'url'; url: string } | { kind: 'svg'; def: SlotIconDef };
  size: number;
  color: string;
  onUrlError?: () => void;
}) {
  if (visual.kind === 'url') {
    return (
      <img
        src={visual.url}
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: size / 2, objectFit: 'cover', display: 'block' }}
        onError={() => onUrlError?.()}
      />
    );
  }
  const d = visual.def;
  return (
    <svg
      width={size}
      height={size}
      viewBox={d.viewBox ?? '0 0 24 24'}
      style={{ display: 'block', color }}
      aria-hidden
    >
      <path d={d.path} fill="currentColor" />
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
  const [iconUrlFailed, setIconUrlFailed] = useState(false);
  const bubble = Math.max(26, Math.floor(bubbleSize));
  const iconSize = Math.round(bubble * 0.9);
  const il = theme.iconLabel;
  const labelFontSize = Math.max(9, Math.min(15, Math.round(Math.min(bubble * 0.155, il.fontSize + 5))));
  const labelLineHeight = Math.ceil(labelFontSize * 1.22);
  const minTileH = bubble + 8 + labelLineHeight * 2 + 8 + 6;
  const bubbleR = Math.min(theme.bubble.borderRadius, bubble / 2);
  const baseVisual = resolveSlotVisual(slot);
  const visual =
    iconUrlFailed && baseVisual.kind === 'url'
      ? resolveSlotVisual({ ...slot, icon: null })
      : baseVisual;

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
        <SlotGlyph
          visual={visual}
          size={iconSize}
          color={theme.icon.color}
          onUrlError={() => setIconUrlFailed(true)}
        />
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
          fontWeight: 300,
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
  const [slotAction, setSlotAction] = useState<{ plan: MirrorOpenPlan; slot: PublicSlot } | null>(null);

  const handleSlotPress = (slot: PublicSlot) => {
    if (String(slot.type || '').toLowerCase().includes('voip')) {
      return;
    }
    const plan = getMirrorVaultOpenPlan(
      {
        type: slot.type,
        value: slot.value,
        title: slot.label,
        vaultMimeType: slot.vaultMimeType ?? undefined,
      },
      {
        cardOwnerUid: String(card.ownerUid || '').trim(),
        cardId: String(card.cardId || '').trim(),
        sourceCardName: String(card.name || '').trim() || 'Card-Social',
      },
    );
    setSlotAction({ plan, slot });
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

  const bg = theme.background;
  const bd = theme.border;

  const layout = card.layout === 'horizontal' ? 'horizontal' : 'vertical';

  const vertMeasuredW = Math.max(0, vertBox.w - WIREFRAME_STITCH_HORIZONTAL_INSET);
  const vertUsableW =
    vertMeasuredW > 0 ? vertMeasuredW : slots.length > 0 ? WIREFRAME_FALLBACK_USABLE_W : 0;
  const vertBubbleRaw =
    vertUsableW > 0 && rowPlan.length
      ? computeStitchWireframeBubbleSide(
          vertUsableW,
          vertBox.h,
          rowPlan,
          WIREFRAME_STITCH_GAP,
          WIREFRAME_STITCH_GAP,
          theme.iconLabel.fontSize,
        )
      : 0;
  const vertBubble =
    slots.length > 0 && rowPlan.length > 0
      ? Math.max(vertBubbleRaw, vertBubbleRaw > 0 ? 0 : WIREFRAME_MIN_BUBBLE_WHEN_SLOTS)
      : 0;

  const horizMeasuredW = Math.max(0, horizBox.w - WIREFRAME_STITCH_HORIZONTAL_INSET);
  const horizUsableW =
    horizMeasuredW > 0 ? horizMeasuredW : slots.length > 0 ? WIREFRAME_FALLBACK_USABLE_W : 0;
  const horizBubbleRaw =
    horizUsableW > 0 && rowPlan.length
      ? computeStitchWireframeBubbleSide(
          horizUsableW,
          horizBox.h,
          rowPlan,
          WIREFRAME_STITCH_GAP,
          WIREFRAME_STITCH_GAP,
          theme.iconLabel.fontSize,
        )
      : 0;
  const horizBubble =
    slots.length > 0 && rowPlan.length > 0
      ? Math.max(horizBubbleRaw, horizBubbleRaw > 0 ? 0 : WIREFRAME_MIN_BUBBLE_WHEN_SLOTS)
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

  const statsBlock = (_starSize: number, captionSize: number, statsSize: number) => (
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
      <span
        style={{
          color: theme.extraText.color,
          fontSize: captionSize,
          fontWeight: theme.extraText.fontWeight,
          fontStyle: theme.extraText.fontStyle,
        }}
      >
        {reviewCount} {tr('calificaciones', 'ratings')}
      </span>
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
        <span style={{ color: theme.title.color, fontSize: statsSize, fontWeight: 300 }}>{card.holdersCount}</span>
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

  const mirrorModals = (
    <MirrorActionModals
      plan={slotAction?.plan ?? null}
      slot={slotAction?.slot ?? null}
      callInterstitialProfile={{ name: dispName, photoUrl: card.ownerPhotoUrl }}
      onClose={() => setSlotAction(null)}
      tr={tr}
      accent={theme.border.color}
    />
  );

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
            <span style={{ fontWeight: 300, opacity: 0.85, color: theme.subtitle.color, fontSize: 13 }}>Card-Social</span>
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
              <div style={{ color: theme.title.color, fontWeight: 300, fontSize: 18, textAlign: 'center' }}>{dispName}</div>
              {dispSub ? (
                <div style={{ color: theme.subtitle.color, fontWeight: 300, fontSize: 12, textAlign: 'center' }}>{dispSub}</div>
              ) : null}
              {statsBlock(22, 8, 10)}
            </div>
          </div>

          <div
            ref={horizIconsBoxRef}
            style={{
              flex: '2.95 1 0',
              minHeight: 180,
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
      {mirrorModals}
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
          <span style={{ fontWeight: 300, opacity: 0.85, color: theme.subtitle.color, fontSize: 13 }}>Card-Social</span>
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
            minHeight: 200,
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
    {mirrorModals}
    </>
  );
}
