'use client';
/** Vista pública en React (Next): `/u/…` y `/b/…` vía `CardPreview`. */

import { MirrorActionModals } from '@/components/MirrorActionModals';
import { PublicTextSlotModal } from '@/components/PublicTextSlotModal';
import type { SlotIconDef } from '@/lib/slotIcons';
import { runPublicWebSlotAction } from '@/lib/runPublicWebSlotAction';
import { resolveSlotVisual } from '@/lib/slotVisual';
import { CardTheme } from '@/lib/themes';
import type { CardData, PublicSlot } from '@/lib/universalCardTypes';
import type { MirrorOpenPlan } from '@card-social/services/mirrorVaultItemOpenPlan';
import Image from 'next/image';
import { useCallback, useState, type CSSProperties } from 'react';

/**
 * Cabecera "Card-Social": el marco blanco mide 1.1× el slot del icono (logo=1, bubble=1.1).
 * `icon.png` deja aire optico; ASSET_ZOOM recorta con overflow para que el motivo rellene el marco
 * (misma lógica que `SmartCardLegacy.js` .card-header-logo).
 */
const HEADER_BRAND_LOGO_PX = 32;
const HEADER_BUBBLE_SCALE = 1.1;
const HEADER_BRAND_ASSET_ZOOM = 1.35;

function CardSocialBrandMark() {
  const logo = HEADER_BRAND_LOGO_PX;
  const bubble = logo * HEADER_BUBBLE_SCALE;
  const corner = (8 * bubble) / logo;
  return (
    <div
      style={{
        width: bubble,
        height: bubble,
        borderRadius: corner,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      <Image
        src="/icon.png"
        alt=""
        width={logo}
        height={logo}
        style={{
          objectFit: 'cover',
          display: 'block',
          transform: `scale(${HEADER_BRAND_ASSET_ZOOM})`,
          transformOrigin: 'center',
        }}
        unoptimized
      />
    </div>
  );
}

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

/** Mismas medidas que `.slot-grid` / `.slot` / `.slot-ic` / `.slot-lb` en `SmartCardLegacy.js` (paridad Business). */
const LEGACY_ICON_PX = 28;

function LegacyGridSlot({
  slot,
  theme,
  onSelect,
}: {
  slot: PublicSlot;
  theme: CardTheme;
  /** Al pulsar: ver / copiar dato público (misma pista que en `/u/…` y `/b/…`). */
  onSelect?: () => void;
}) {
  const [iconUrlFailed, setIconUrlFailed] = useState(false);
  const il = theme.iconLabel;
  const bd = theme.border;
  const baseVisual = resolveSlotVisual(slot);
  const visual =
    iconUrlFailed && baseVisual.kind === 'url' ? resolveSlotVisual({ ...slot, icon: null }) : baseVisual;
  const voip = String(slot.type || '')
    .toLowerCase()
    .includes('voip');
  const labelText = compactSlotLabelForWeb(
    slotLabelForWeb(String(slot.label || ''), String(slot.type || '')),
  );
  const shellStyle: CSSProperties = {
    border: `1px solid ${bd.color}`,
    borderRadius: 12,
    padding: '10px 6px',
    minHeight: 72,
    backgroundColor: theme.bubble.backgroundColor,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: onSelect ? 'pointer' : 'default',
    opacity: voip ? 0.45 : 1,
    boxSizing: 'border-box',
    width: '100%',
    ...(onSelect
      ? {
          borderStyle: 'solid',
          font: 'inherit',
          textAlign: 'center' as const,
          color: 'inherit',
        }
      : {}),
  };
  const inner = (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
          color: theme.icon.color,
        }}
      >
        <SlotGlyph
          visual={visual}
          size={LEGACY_ICON_PX}
          color={theme.icon.color}
          onUrlError={() => setIconUrlFailed(true)}
        />
      </div>
      <div
        style={{
          width: '100%',
          textAlign: 'center',
          fontSize: '0.62rem',
          lineHeight: 1.2,
          color: il.color,
          opacity: 0.85,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden',
          wordBreak: 'break-word',
        }}
      >
        {labelText}
      </div>
    </>
  );
  const press = voip ? undefined : onSelect;
  if (press) {
    return (
      <button type="button" onClick={press} style={shellStyle}>
        {inner}
      </button>
    );
  }
  return <div style={shellStyle}>{inner}</div>;
}

function LegacySlotGrid({
  slots,
  theme,
  onSlotPress,
}: {
  slots: PublicSlot[];
  theme: CardTheme;
  onSlotPress?: (slot: PublicSlot) => void;
}) {
  const list = (slots ?? []).slice(0, 24);
  if (list.length === 0) return null;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
        width: '100%',
        boxSizing: 'border-box',
        padding: '12px 24px 22px',
      }}
    >
      {list.map((slot, idx) => (
        <LegacyGridSlot
          key={`${slot.itemId || slot.label || 'slot'}-${idx}`}
          slot={slot}
          theme={theme}
          onSelect={onSlotPress ? () => onSlotPress(slot) : undefined}
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
   * `universal` = `/u/…`; `business` = `/b/…`. Acción de slots = misma que Smart (`getMirrorVaultOpenPlan` + app).
   */
  previewVariant?: 'universal' | 'business';
};

export default function BusinessCardWeb({ card, theme, locale, previewVariant = 'universal' }: Props) {
  const tr = (es: string, en: string) => (locale === 'es' ? es : en);
  const [ghostPlan, setGhostPlan] = useState<Extract<MirrorOpenPlan, { kind: 'ghost' }> | null>(null);
  const [textSheet, setTextSheet] = useState<{ title: string; value: string } | null>(null);

  const handleSlotPress = useCallback(
    (slot: PublicSlot) => {
      const r = runPublicWebSlotAction(card, slot);
      if (r.kind === 'ghost') {
        setGhostPlan(r.plan);
      } else if (r.kind === 'text_sheet') {
        setTextSheet({ title: r.title, value: r.value });
      }
    },
    [card],
  );

  const slots = (card.slots ?? []).slice(0, 24);

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
          minHeight: isBusinessPreview ? undefined : 480,
        }}
      >
        {card.wallpaperUrl ? (
          <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.93, pointerEvents: 'none' }}>
            <Image src={card.wallpaperUrl} alt="" fill style={{ objectFit: 'cover' }} unoptimized />
          </div>
        ) : null}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            flex: isBusinessPreview ? '0 0 auto' : 1,
            minHeight: isBusinessPreview ? undefined : 480,
            width: '100%',
          }}
        >
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
            <CardSocialBrandMark />
            <span style={{ fontWeight: 700, color: theme.subtitle.color, fontSize: 13 }}>Card-Social</span>
          </div>

          <div
            style={{
              flex: isBusinessPreview ? '0 0 auto' : '2.85 1 0',
              minHeight: isBusinessPreview ? undefined : 0,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                flex: isBusinessPreview ? '0 0 auto' : '1.2 1 0',
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
                flex: isBusinessPreview ? '0 0 auto' : '2.6 1 0',
                minWidth: isBusinessPreview ? undefined : 0,
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
            style={{
              flex: isBusinessPreview ? '0 0 auto' : '2.95 1 0',
              minHeight: isBusinessPreview ? undefined : 180,
              marginTop: 12,
              paddingTop: 2,
              paddingBottom: isBusinessPreview ? 22 : 6,
              overflow: isBusinessPreview ? 'visible' : 'hidden',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: isBusinessPreview ? 0 : undefined,
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {slots.length > 0 ? (
              <LegacySlotGrid slots={slots} theme={theme} onSlotPress={handleSlotPress} />
            ) : null}
          </div>
        </div>
      </div>
      <MirrorActionModals
        plan={ghostPlan}
        onClose={() => setGhostPlan(null)}
        tr={tr}
        accent={theme.border.color}
        callInterstitialProfile={{
          name: String(card.userFullName || card.ownerDisplayName || tr('Contacto', 'Contact')).trim(),
          photoUrl: card.userAvatarUrl ?? null,
        }}
      />
      <PublicTextSlotModal
        open={Boolean(textSheet)}
        title={textSheet?.title ?? ''}
        value={textSheet?.value ?? ''}
        onClose={() => setTextSheet(null)}
        tr={tr}
        accent={theme.border.color}
      />
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
        minHeight: isBusinessPreview ? undefined : 520,
      }}
    >
      {card.wallpaperUrl ? (
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.93, pointerEvents: 'none' }}>
          <Image src={card.wallpaperUrl} alt="" fill style={{ objectFit: 'cover' }} unoptimized />
        </div>
      ) : null}

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          flex: isBusinessPreview ? '0 0 auto' : 1,
          minHeight: isBusinessPreview ? undefined : 520,
          width: '100%',
        }}
      >
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
          <CardSocialBrandMark />
          <span style={{ fontWeight: 700, color: theme.subtitle.color, fontSize: 13 }}>Card-Social</span>
        </div>

        <div
          style={{
            flex: isBusinessPreview ? '0 0 auto' : '2.9 1 0',
            minHeight: isBusinessPreview ? undefined : 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              flex: isBusinessPreview ? '0 0 auto' : '1.85 1 0',
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
              flex: isBusinessPreview ? '0 0 auto' : '1.55 1 0',
              minHeight: isBusinessPreview ? undefined : 0,
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
          style={{
            flex: isBusinessPreview ? '0 0 auto' : '2.35 1 0',
            minHeight: isBusinessPreview ? undefined : 200,
            marginTop: 12,
            paddingTop: 2,
            paddingBottom: 22,
            overflow: isBusinessPreview ? 'visible' : 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: isBusinessPreview ? 0 : undefined,
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {slots.length > 0 ? (
            <LegacySlotGrid slots={slots} theme={theme} onSlotPress={handleSlotPress} />
          ) : null}
        </div>
      </div>
    </div>
    <MirrorActionModals
      plan={ghostPlan}
      onClose={() => setGhostPlan(null)}
      tr={tr}
      accent={theme.border.color}
      callInterstitialProfile={{
        name: String(card.userFullName || card.ownerDisplayName || tr('Contacto', 'Contact')).trim(),
        photoUrl: card.userAvatarUrl ?? null,
      }}
    />
    <PublicTextSlotModal
      open={Boolean(textSheet)}
      title={textSheet?.title ?? ''}
      value={textSheet?.value ?? ''}
      onClose={() => setTextSheet(null)}
      tr={tr}
      accent={theme.border.color}
    />
    </>
  );
}
