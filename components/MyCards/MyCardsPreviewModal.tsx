/**
 * Componente maestro de vista previa de tarjeta.
 * Fuente única de verdad visual para Mis Tarjetas (emisor),
 * Contactos (receptor), Búsqueda (receptor) y aceptación entrante (token / QR).
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
import type { MirrorVaultItem } from '@/services/buildReceiverPreviewVaultItems';
import { openVaultPreviewItem } from '@/services/openVaultPreviewItem';
import { seedMetaForIncomingCard } from '@/services/bunkerContactMetaSeed';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import {
  consumeDynamicQrToken,
  fetchBunkerGroups,
  grantBusinessShareFromQr,
  redeemTemporaryAccessToken,
  trackBunkerGroupUsage,
} from '@/services/qrApi';
import appPalette from '@/app/theme';
import { Picker } from '@react-native-picker/picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

const INCOMING_BASE_GROUPS = ['Random', 'Family', 'Social', 'Work'];

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

export type MyCardsIncomingRedeem = {
  mode: 'universal' | 'dynamic_qr' | 'business_permanent';
  token: string;
  ownerUid: string;
  cardId: string;
  receiverUid: string;
  onSuccess: () => void;
};

/* ------------------------------------------------------------------ */
/*  Props del modal                                                    */
/* ------------------------------------------------------------------ */

export type MyCardsPreviewModalProps = {
  visible: boolean;
  onClose: () => void;
  variant: 'issuer' | 'receiver' | 'incoming';
  payload: MyCardsPayload | null;
  onEditCard?: () => void;
  /** Obligatorio si variant === 'incoming'. */
  incomingRedeem?: MyCardsIncomingRedeem | null;
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
  incomingRedeem,
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

  const [incomingGroups, setIncomingGroups] = useState<string[]>(INCOMING_BASE_GROUPS);
  const [incomingGroup, setIncomingGroup] = useState('Random');
  const [incomingBusy, setIncomingBusy] = useState(false);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const theme = useMemo(
    () => getThemeById(payload?.themeId || '') ?? CHEST_THEMES[0],
    [payload?.themeId],
  );

  useEffect(() => {
    if (variant !== 'incoming' || !visible || !incomingRedeem?.receiverUid) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const g = await fetchBunkerGroups(incomingRedeem.receiverUid, language);
        if (!cancelled) {
          const list = Array.isArray(g) && g.length > 0 ? g : INCOMING_BASE_GROUPS;
          setIncomingGroups(list);
          setIncomingGroup((prev) => (list.includes(prev) ? prev : 'Random'));
        }
      } catch {
        if (!cancelled) {
          setIncomingGroups(INCOMING_BASE_GROUPS);
          setIncomingGroup((prev) => (INCOMING_BASE_GROUPS.includes(prev) ? prev : 'Random'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [variant, visible, incomingRedeem?.receiverUid, language]);

  const handleIncomingAccept = useCallback(async () => {
    const r = incomingRedeem;
    if (!r || variant !== 'incoming') return;
    const { receiverUid, token, ownerUid, cardId, mode, onSuccess } = r;
    if (!receiverUid || !ownerUid || !cardId) return;
    if (mode !== 'business_permanent' && !String(token || '').trim()) return;
    setIncomingBusy(true);
    try {
      if (mode === 'universal') {
        await redeemTemporaryAccessToken({ receiverUid, token, locale: language });
      } else if (mode === 'business_permanent') {
        await grantBusinessShareFromQr({ receiverUid, ownerUid, cardId, locale: language });
      } else {
        await consumeDynamicQrToken({ receiverUid, token, locale: language });
      }
      await seedMetaForIncomingCard({
        issuerUid: ownerUid,
        cardId,
        group: incomingGroup,
      });
      try {
        await trackBunkerGroupUsage({ viewerUid: receiverUid, groupName: incomingGroup, locale: language });
      } catch {
        /* no bloquear */
      }
      onSuccess();
      handleClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : tr('Intenta de nuevo.', 'Try again.');
      Alert.alert(tr('No se pudo agregar', 'Could not add'), msg);
    } finally {
      setIncomingBusy(false);
    }
  }, [incomingRedeem, variant, incomingGroup, language, tr, handleClose]);

  const openDocumentViewer = useCallback((item: MirrorVaultItem) => {
    setViewerItem(item);
    setViewerVisible(true);
  }, []);

  const handleSlotPress = useCallback(
    async (item: WireframeVaultItem) => {
      await openVaultPreviewItem(item as unknown as MirrorVaultItem, {
        tr,
        openDocumentViewer: (it) => {
          openDocumentViewer(it as MirrorVaultItem);
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

  const renderSlotContent = useMemo(
    () =>
      createPreviewWireframeSlotRenderer({
        tr,
        onDataPress: (it) => void handleSlotPress(it as WireframeVaultItem),
        iconVaultById: payload?.iconVaultById,
      }),
    [handleSlotPress, tr, payload?.iconVaultById],
  );

  const reviewCount = Math.max(
    0,
    Math.floor(Number(payload?.totalRatings ?? 0)),
  );
  const ratingAvgRaw = Number(payload?.ratingAvg);
  const dispStarsValue =
    reviewCount > 0 && Number.isFinite(ratingAvgRaw)
      ? Math.max(0, Math.min(5, ratingAvgRaw))
      : 0;

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

  const accent = theme.border.color;
  const footerVariant = variant === 'incoming' ? 'incoming' : variant;

  const incomingAccessory =
    variant === 'incoming' ? (
      <View style={incomingStyles.wrap}>
        <Text style={[incomingStyles.label, { color: accent }]}>{tr('Grupo en el Búnker', 'Bunker group')}</Text>
        <View style={[incomingStyles.pickerWrap, { borderColor: `${accent}73` }]}>
          <Picker
            selectedValue={incomingGroup}
            onValueChange={(v) => setIncomingGroup(String(v))}
            dropdownIconColor={accent}
            style={incomingStyles.picker}
            itemStyle={incomingStyles.pickerItem}
            enabled={!incomingBusy}
          >
            {incomingGroups.map((g) => (
              <Picker.Item key={g} label={g} value={g} color={accent} />
            ))}
          </Picker>
        </View>
      </View>
    ) : null;

  const mirrorScale = variant === 'issuer' ? 0.8 : 1;

  return (
    <>
      <SmartCardMirrorModal
        visible={visible && payload != null}
        onRequestClose={handleClose}
        screenHeight={screenHeight}
        iconSlotCount={payload?.slots.length ?? 0}
        cardBorder={{
          color: theme.border.color,
          width: theme.border.width,
        }}
        footerTopAccessory={incomingAccessory}
        footer={{
          variant: footerVariant,
          closeLabel:
            variant === 'incoming' ? tr('Cancelar', 'Cancel') : tr('Cerrar', 'Close'),
          editLabel:
            variant === 'issuer'
              ? tr('Editar tarjeta', 'Edit card')
              : undefined,
          onClose: handleClose,
          onEditCard: variant === 'issuer' ? onEditCard : undefined,
          acceptLabel:
            variant === 'incoming' ? tr('Aceptar', 'Accept') : undefined,
          onAccept:
            variant === 'incoming' ? () => void handleIncomingAccept() : undefined,
          acceptBusy: variant === 'incoming' ? incomingBusy : undefined,
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
            mirrorStatsCapsuleScale={mirrorScale}
          />
        ) : null}
      </SmartCardMirrorModal>

      {viewerVisible && viewerItem ? (
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
      ) : null}
    </>
  );
}

const incomingStyles = StyleSheet.create({
  wrap: { width: '100%', paddingHorizontal: 4 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  pickerWrap: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  picker: {
    color: '#d4af37',
  },
  pickerItem: {
    color: '#d4af37',
    backgroundColor: '#000000',
  },
});
