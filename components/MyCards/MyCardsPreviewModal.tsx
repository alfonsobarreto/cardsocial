/**
 * Componente maestro de vista previa de tarjeta.
 * Fuente única de verdad visual para Mis Tarjetas (emisor),
 * Contactos (receptor) y Búsqueda (receptor).
 */

import {
  IsolatedWireframeCard,
  type WireframeEditSlot,
  type WireframeVaultItem,
} from '@/components/smartCard/IsolatedWireframeCard';
import {
  createPreviewWireframeSlotRenderer,
  renderWireframeMirrorRatingStars,
  type IconVaultLookup,
} from '@/components/smartCard/wireframeMirrorRendering';
import { SmartCardMirrorModal } from '@/components/SmartCardMirrorModal';
import { VaultDocumentViewerModal } from '@/components/VaultDocumentViewerModal';
import {
  CARD_THEMES as CHEST_THEMES,
  getThemeById,
} from '@/constants/themeChest';
import { hardLockCheck } from '@/services/biometricAuth';
import type { MirrorVaultItem } from '@/services/buildReceiverPreviewVaultItems';
import { openVaultPreviewItem } from '@/services/openVaultPreviewItem';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import appPalette from '@/app/theme';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, useWindowDimensions } from 'react-native';

/* ------------------------------------------------------------------ */
/*  Payload: contrato de datos que cada pantalla construye             */
/* ------------------------------------------------------------------ */

export type MyCardsPayload = {
  cardName: string;
  subtitle: string;
  avatarUrl: string | null;
  themeId: string;
  wallpaperUrl?: string;
  layout: 'vertical' | 'horizontal';
  holdersCount: number;
  ratingAvg: number;
  totalRatings: number;
  enableParallax: boolean;
  slots: WireframeEditSlot[];
  noAvatarIcon?: 'account' | 'storefront-outline';
  iconVaultById?: IconVaultLookup;
};

/* ------------------------------------------------------------------ */
/*  Props del modal                                                    */
/* ------------------------------------------------------------------ */

export type MyCardsPreviewModalProps = {
  visible: boolean;
  onClose: () => void;
  variant: 'issuer' | 'receiver';
  payload: MyCardsPayload | null;
  onEditCard?: () => void;
  ghostTargetUid?: string | null;
  sourceCardId?: string | null;
  sourceCardName?: string;
  peerDisplayName?: string;
};

/* ------------------------------------------------------------------ */
/*  Componente                                                         */
/* ------------------------------------------------------------------ */

export function MyCardsPreviewModal({
  visible,
  onClose,
  variant,
  payload,
  onEditCard,
  ghostTargetUid,
  sourceCardId,
  sourceCardName,
  peerDisplayName,
}: MyCardsPreviewModalProps) {
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const shell = appPalette[isDark ? 'dark' : 'light'];
  const { language } = useLanguage();
  const tr = (es: string, en: string) => (language === 'en' ? en : es);
  const { height: screenHeight } = useWindowDimensions();

  const parallaxX = useRef(new Animated.Value(0)).current;
  const parallaxY = useRef(new Animated.Value(0)).current;

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerItem, setViewerItem] = useState<MirrorVaultItem | null>(null);

  /* ---------- theme ---------- */

  const theme = useMemo(
    () => getThemeById(payload?.themeId || '') ?? CHEST_THEMES[0],
    [payload?.themeId],
  );

  /* ---------- document viewer ---------- */

  const openDocumentViewer = useCallback(async (item: MirrorVaultItem) => {
    const ok = await hardLockCheck('abrir visor seguro de documentos');
    if (!ok) return;
    setViewerItem(item);
    setViewerVisible(true);
  }, []);

  /* ---------- slot action ---------- */

  const handleSlotPress = useCallback(
    async (item: WireframeVaultItem) => {
      await openVaultPreviewItem(item as unknown as MirrorVaultItem, {
        tr,
        openDocumentViewer: async (it) => {
          await openDocumentViewer(it as MirrorVaultItem);
        },
        ghostTargetUid: ghostTargetUid ?? null,
        sourceCardName:
          sourceCardName || payload?.cardName || 'Tarjeta Social',
        sourceCardId: sourceCardId ?? null,
        peerDisplayName: peerDisplayName || tr('contacto', 'contact'),
      });
    },
    [
      tr,
      openDocumentViewer,
      ghostTargetUid,
      sourceCardName,
      sourceCardId,
      peerDisplayName,
      payload?.cardName,
    ],
  );

  /* ---------- slot renderer ---------- */

  const renderSlotContent = useMemo(
    () =>
      createPreviewWireframeSlotRenderer({
        tr,
        onDataPress: (it) => void handleSlotPress(it as WireframeVaultItem),
        iconVaultById: payload?.iconVaultById,
      }),
    [handleSlotPress, tr, payload?.iconVaultById],
  );

  /* ---------- display stars ---------- */

  const reviewCount = Math.max(
    0,
    Math.floor(Number(payload?.totalRatings ?? 0)),
  );
  const ratingAvgRaw = Number(payload?.ratingAvg);
  const dispStarsValue =
    reviewCount > 0 && Number.isFinite(ratingAvgRaw)
      ? Math.max(0, Math.min(5, ratingAvgRaw))
      : 0;

  /* ---------- footer colors per variant ---------- */

  const footerColors =
    variant === 'issuer'
      ? {
          overlay: shell.modalOverlay,
          modalBg: shell.modalBg,
          modalBorder: shell.modalBorder,
          ghostBg: shell.btnGhost,
          ghostBorder: shell.modalBorder,
          ghostText: shell.btnGhostText,
          primaryBg: shell.btnPrimary,
          primaryText: shell.btnPrimaryText,
        }
      : {
          overlay: shell.overlayScrim,
          modalBg: shell.modalBg,
          modalBorder: shell.modalBorder,
          ghostBg: shell.surfaceMuted,
          ghostBorder: shell.border,
          ghostText: shell.textPrimary,
          primaryBg: shell.ctaPrimary,
          primaryText: shell.btnPrimaryText,
        };

  /* ---------- render ---------- */

  return (
    <>
      <SmartCardMirrorModal
        visible={visible && payload != null}
        onRequestClose={onClose}
        screenHeight={screenHeight}
        iconSlotCount={payload?.slots.length ?? 0}
        cardBorder={{
          color: theme.border.color,
          width: theme.border.width,
        }}
        footer={{
          variant,
          closeLabel: tr('Cerrar', 'Close'),
          editLabel:
            variant === 'issuer'
              ? tr('Editar tarjeta', 'Edit card')
              : undefined,
          onClose,
          onEditCard: variant === 'issuer' ? onEditCard : undefined,
          colors: footerColors,
          blurTint: isDark ? 'dark' : 'light',
        }}
      >
        {payload ? (
          <IsolatedWireframeCard
            layout={payload.layout}
            slots={payload.slots}
            editable={false}
            theme={theme}
            wallpaperUrl={payload.wallpaperUrl}
            dispName={payload.cardName}
            dispSub={payload.subtitle}
            dispAvatar={payload.avatarUrl}
            dispHolders={Math.max(
              0,
              Math.floor(Number(payload.holdersCount ?? 0)),
            )}
            dispReviewCount={reviewCount}
            dispStarsValue={dispStarsValue}
            noAvatarIconName={payload.noAvatarIcon ?? 'account'}
            enableParallax={payload.enableParallax}
            parallaxX={parallaxX}
            parallaxY={parallaxY}
            renderSlotContent={renderSlotContent}
            renderDetailedRatingStars={renderWireframeMirrorRatingStars}
            tr={tr}
            mirrorStatsCapsuleScale={variant === 'issuer' ? 0.8 : 1}
          />
        ) : null}
      </SmartCardMirrorModal>

      <VaultDocumentViewerModal
        visible={viewerVisible}
        item={viewerItem}
        onClose={() => {
          setViewerVisible(false);
          setViewerItem(null);
        }}
        tr={tr}
        fallbackMutedColor={shell.textSecondary}
      />
    </>
  );
}
