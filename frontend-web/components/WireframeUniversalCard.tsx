'use client';

import { MirrorActionModals } from '@/components/MirrorActionModals';
import type { SlotIconDef } from '@/lib/slotIcons';
import { resolveSlotVisual } from '@/lib/slotVisual';
import { CardTheme } from '@/lib/themes';
import type { CardData, PublicSlot } from '@/lib/universalCardTypes';
import {
  computeStitchWireframeBubbleSide,
  getWireframeIconRowPlan,
  wireframeSlotBelowBubbleHeight,
  WIREFRAME_STITCH_GAP,
  WIREFRAME_STITCH_HORIZONTAL_INSET,
} from '@/lib/wireframeMath';
import { getMirrorVaultOpenPlan, type MirrorOpenPlan } from '@card-social/services/mirrorVaultItemOpenPlan';
import Image from 'next/image';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** Si el cálculo devuelve 0 con slots, forzar tamaño mínimo (Safari / flex raro). */
const WIREFRAME_MIN_BUBBLE_WHEN_SLOTS = 48;

function slotLabelForWeb(label: string, type: string): string {
  return String(label || type || '—').trim() || '—';
}

/** Igual que `compactSlotLabel` en la app: máx. 2 palabras para el chip. */
function compactSlotLabelForWeb(label: string): string {
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
  previewVariant = 'universal',
}: {
  slot: PublicSlot;
  bubbleSize: number;
  theme: CardTheme;
  onPress: (slot: PublicSlot) => void;
  /** `business`: zona de icono 1:1 (preview `/b/…`); `universal` = enlaces 24h, sin cambio. */
  previewVariant?: 'universal' | 'business';
}) {
  const [iconUrlFailed, setIconUrlFailed] = useState(false);
  const bubble = Math.max(26, Math.floor(bubbleSize));
  /** Misma fórmula en web que la columna vertical Smart (0.48×); el `bubble` ya se alinea vía contenedor en business. */
  const iconSize = Math.max(20, Math.round(bubble * 0.48));
  const il = theme.iconLabel;
  const labelFontSize = Math.max(9, Math.min(15, Math.round(Math.min(bubble * 0.155, il.fontSize + 5))));
  const labelLineHeight = Math.ceil(labelFontSize * 1.22);
  const minTileH = bubble + wireframeSlotBelowBubbleHeight(bubble, il.fontSize);
  const bubbleR = Math.min(theme.bubble.borderRadius, Math.max(8, Math.round(bubble * 0.2)));
  const baseVisual = resolveSlotVisual(slot);
  const visual =
    iconUrlFailed && baseVisual.kind === 'url'
      ? resolveSlotVisual({ ...slot, icon: null })
      : baseVisual;
  const voip = String(slot.type || '')
    .toLowerCase()
    .includes('voip');
  const labelText = compactSlotLabelForWeb(
    slotLabelForWeb(String(slot.label || ''), String(slot.type || '')),
  );

  const isBusinessPreview = previewVariant === 'business';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: bubble,
        minHeight: minTileH,
        boxSizing: 'border-box',
      }}
    >
      <button
        type="button"
        onClick={() => onPress(slot)}
        disabled={voip}
        style={{
          width: '100%',
          minHeight: minTileH,
          borderRadius: bubbleR,
          backgroundColor: theme.bubble.backgroundColor,
          border: `${Math.max(1, theme.border.width)}px solid ${theme.border.color}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: voip ? 'not-allowed' : 'pointer',
          opacity: voip ? 0.45 : 1,
          padding: '6px 6px 8px',
          boxSizing: 'border-box',
          ...(theme.shadowStyle === 'drop'
            ? { boxShadow: `0 3px 10px ${theme.border.color}55` }
            : theme.shadowStyle === 'inner'
              ? { boxShadow: `inset 0 2px 6px ${theme.border.color}44` }
              : {}),
        }}
      >
        <div
          style={
            isBusinessPreview
              ? {
                  flex: '0 0 auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  aspectRatio: 1,
                }
              : {
                  flex: '0 0 auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: Math.max(32, Math.round(bubble * 0.5)),
                  width: '100%',
                }
          }
        >
          <SlotGlyph
            visual={visual}
            size={iconSize}
            color={theme.icon.color}
            onUrlError={() => setIconUrlFailed(true)}
          />
        </div>
        <div
          style={{
            width: '100%',
            textAlign: 'center',
            fontSize: labelFontSize,
            lineHeight: `${labelLineHeight}px`,
            color: il.color,
            fontWeight: 300,
            fontStyle: il.fontStyle,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
            wordBreak: 'break-word',
            marginTop: 2,
            flexShrink: 0,
          }}
        >
          {labelText}
        </div>
      </button>
    </div>
  );
}

/** Placeholder hasta primera medida síncrona (ResizeObserver llega después del paint → causaba el “grande y luego chico”). */
function IconSlotsSkeleton({
  theme,
  slotCount,
  accent,
}: {
  theme: CardTheme;
  slotCount: number;
  accent: string;
}) {
  const n = Math.min(6, Math.max(1, slotCount));
  const bd = theme.border;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: WIREFRAME_STITCH_GAP,
        width: '100%',
        minHeight: 160,
        padding: '8px 0 12px',
        boxSizing: 'border-box',
      }}
    >
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          style={{
            width: 52,
            height: 52,
            borderRadius: Math.min(14, 26),
            backgroundColor: theme.bubble.backgroundColor,
            border: `${Math.max(1, theme.border.width)}px solid ${bd.color}33`,
            boxShadow: `inset 0 0 0 1px ${accent}1a`,
          }}
        />
      ))}
    </div>
  );
}

type Props = {
  card: CardData;
  theme: CardTheme;
  locale: 'es' | 'en';
  /**
   * `business` = páginas `/b/…` (alinear métricas de rejilla y tile con la columna vertical / Smart).
   * `universal` = enlaces 24h: sin cambios de estilo frente a antes.
   */
  previewVariant?: 'universal' | 'business';
};

export default function WireframeUniversalCard({ card, theme, locale, previewVariant = 'universal' }: Props) {
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
        cardOwnerUid: String(card.uid || '').trim(),
        sid: String(card.sid || '').trim(),
        bId: String(card.bId || '').trim(),
        sourceCardName: String(card.scName || '').trim() || 'Card-Social',
      },
    );
    setSlotAction({ plan, slot });
  };

  const vertIconsBoxRef = useRef<HTMLDivElement | null>(null);
  const horizIconsBoxRef = useRef<HTMLDivElement | null>(null);
  const [vertBox, setVertBox] = useState({ w: 0, h: 0 });
  const [horizBox, setHorizBox] = useState({ w: 0, h: 0 });

  const syncReadIconBoxes = useCallback(() => {
    const el = vertIconsBoxRef.current;
    const elH = horizIconsBoxRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setVertBox((p) =>
        Math.abs(p.w - r.width) < 0.5 && Math.abs(p.h - r.height) < 0.5 ? p : { w: r.width, h: r.height },
      );
    } else {
      setVertBox({ w: 0, h: 0 });
    }
    if (elH) {
      const r = elH.getBoundingClientRect();
      setHorizBox((p) =>
        Math.abs(p.w - r.width) < 0.5 && Math.abs(p.h - r.height) < 0.5 ? p : { w: r.width, h: r.height },
      );
    } else {
      setHorizBox({ w: 0, h: 0 });
    }
  }, []);

  useLayoutEffect(() => {
    const read = () => {
      syncReadIconBoxes();
    };
    read();
    const el = vertIconsBoxRef.current;
    const elH = horizIconsBoxRef.current;
    const wV = el ? el.getBoundingClientRect().width : 0;
    const wHv = elH ? elH.getBoundingClientRect().width : 0;
    const needsRaf = (el && wV < 1) || (elH && wHv < 1);
    let raf0 = 0;
    let raf1 = 0;
    if (needsRaf) {
      raf0 = requestAnimationFrame(() => {
        read();
        raf1 = requestAnimationFrame(() => {
          read();
        });
      });
    }
    const ro = new ResizeObserver(read);
    if (el) ro.observe(el);
    if (elH) ro.observe(elH);
    return () => {
      cancelAnimationFrame(raf0);
      cancelAnimationFrame(raf1);
      ro.disconnect();
    };
  }, [card.layout, card.slots?.length, syncReadIconBoxes]);

  const slots = (card.slots ?? []).slice(0, 24);
  const rowPlan = getWireframeIconRowPlan(slots.length);
  let off = 0;
  const rows: PublicSlot[][] = rowPlan.map((n) => {
    const row = slots.slice(off, off + n);
    off += n;
    return row;
  });

  const cardNm = String(card.scName || '').trim();
  const person = String(card.ownerDisplayName || '').trim();
  const occ = String(card.ownerOccupation || '').trim();
  const dispName = (cardNm || person || occ || 'Card-Social').trim();
  const bcContact = String(card.bcContactName || '').trim();
  const dispSub = bcContact
    ? bcContact
    : card.ownerNickname
      ? card.ownerNickname.startsWith('@')
        ? card.ownerNickname
        : `@${card.ownerNickname}`
      : '';

  const reviewCount = Math.max(0, Math.floor(card.totalRatings ?? 0));

  const bg = theme.background;
  const bd = theme.border;

  const layout = card.layout === 'horizontal' ? 'horizontal' : 'vertical';

  const vertMeasuredW = Math.max(0, vertBox.w - WIREFRAME_STITCH_HORIZONTAL_INSET);
  const vertUsableW = vertMeasuredW;
  const vertGridH = vertBox.h;
  const vertIconAreaReady = vertBox.w > 0.5 && vertBox.h > 0.5;

  const vertBubbleRaw =
    vertIconAreaReady && vertUsableW > 0 && rowPlan.length
      ? computeStitchWireframeBubbleSide(
          vertUsableW,
          vertGridH,
          rowPlan,
          WIREFRAME_STITCH_GAP,
          WIREFRAME_STITCH_GAP,
          theme.iconLabel.fontSize,
        )
      : 0;
  const vertBubble =
    slots.length > 0 && rowPlan.length > 0 && vertIconAreaReady
      ? Math.max(vertBubbleRaw, vertBubbleRaw > 0 ? 0 : WIREFRAME_MIN_BUBBLE_WHEN_SLOTS)
      : 0;

  const horizMeasuredW = Math.max(0, horizBox.w - WIREFRAME_STITCH_HORIZONTAL_INSET);
  const horizUsableW = horizMeasuredW;
  const horizGridH = horizBox.h;
  const horizIconAreaReady = horizBox.w > 0.5 && horizBox.h > 0.5;

  const horizBubbleRaw =
    horizIconAreaReady && horizUsableW > 0 && rowPlan.length
      ? computeStitchWireframeBubbleSide(
          horizUsableW,
          horizGridH,
          rowPlan,
          WIREFRAME_STITCH_GAP,
          WIREFRAME_STITCH_GAP,
          theme.iconLabel.fontSize,
        )
      : 0;
  const horizBubble =
    slots.length > 0 && rowPlan.length > 0 && horizIconAreaReady
      ? Math.max(horizBubbleRaw, horizBubbleRaw > 0 ? 0 : WIREFRAME_MIN_BUBBLE_WHEN_SLOTS)
      : 0;

  const showSlotsSkeleton =
    slots.length > 0 &&
    (layout === 'vertical' ? !vertIconAreaReady : !horizIconAreaReady);

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
              alignItems: 'center',
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
                <WebWireframeSlotTile
                  slot={slot}
                  bubbleSize={bubble}
                  theme={theme}
                  onPress={handleSlotPress}
                  previewVariant={previewVariant}
                />
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
          padding: '3px 8px',
        }}
      >
        <span style={{ color: theme.title.color, fontSize: statsSize, fontWeight: 800 }}>
          👤 {card.holdersCount ?? 0} {tr('receptores', 'holders')}
        </span>
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
      callInterstitialProfile={{ name: dispName, photoUrl: card.cardWireframeImageUrl }}
      onClose={() => setSlotAction(null)}
      tr={tr}
      accent={theme.border.color}
    />
  );

  const isBusinessPreview = previewVariant === 'business';

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
              opacity: 0.85,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1, color: theme.subtitle.color, fontWeight: 700 }} aria-hidden>
              ★
            </span>
            <span style={{ fontWeight: 700, color: theme.subtitle.color, fontSize: 13 }}>SOY EL FRONTEND</span>
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
                {card.cardWireframeImageUrl ? (
                  <Image src={card.cardWireframeImageUrl} alt="" width={88} height={88} style={{ objectFit: 'cover' }} unoptimized />
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
                <div
                  style={{
                    color: theme.subtitle.color,
                    fontWeight: 300,
                    fontSize: bcContact ? 14 : 12,
                    textAlign: 'center',
                    lineHeight: 1.35,
                  }}
                >
                  {dispSub}
                </div>
              ) : null}
              {statsBlock(22, 8, 10)}
            </div>
          </div>

          <div
            ref={horizIconsBoxRef}
            style={{
              flex: isBusinessPreview ? '2.35 1 0' : '2.95 1 0',
              minHeight: isBusinessPreview ? 200 : 180,
              marginTop: 12,
              paddingTop: 2,
              paddingBottom: isBusinessPreview ? 22 : 6,
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
              {showSlotsSkeleton ? (
                <IconSlotsSkeleton theme={theme} slotCount={slots.length} accent={bd.color} />
              ) : (
                iconGrid(horizBubble)
              )}
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
            opacity: 0.85,
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1, color: theme.subtitle.color, fontWeight: 700 }} aria-hidden>
            ★
          </span>
          <span style={{ fontWeight: 700, color: theme.subtitle.color, fontSize: 13 }}>SOY EL FRONTEND</span>
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
              {card.cardWireframeImageUrl ? (
                <Image src={card.cardWireframeImageUrl} alt="" width={96} height={96} style={{ objectFit: 'cover', width: '100%', height: '100%' }} unoptimized />
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
                  fontSize: bcContact ? 15 : 13,
                  fontWeight: theme.subtitle.fontWeight,
                  textAlign: 'center',
                  lineHeight: 1.35,
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
            {showSlotsSkeleton ? (
              <IconSlotsSkeleton theme={theme} slotCount={slots.length} accent={bd.color} />
            ) : (
              iconGrid(vertBubble)
            )}
          </div>
        </div>
      </div>
    </div>
    {mirrorModals}
    </>
  );
}
