/**
 * Componente maestro de vista previa de tarjeta.
 * Fuente única de verdad visual para Mis Tarjetas (emisor),
 * Contactos (receptor), Búsqueda (receptor) y aceptación entrante (token / QR).
 */

import appPalette from '@/app/theme';
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
import { getActiveUserId } from '@/services/authSession';
import type { MirrorVaultItem } from '@/services/buildReceiverPreviewVaultItems';
import { seedMetaForIncomingCard } from '@/services/bunkerContactMetaSeed';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { openVaultPreviewItem } from '@/services/openVaultPreviewItem';
import {
    consumeDynamicQrToken,
    fetchBunkerGroups,
    grantBusinessShareFromQr,
    redeemTemporaryAccessToken,
    trackBunkerGroupUsage,
} from '@/services/qrApi';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions
} from 'react-native';

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
  const [groupSheetOpen, setGroupSheetOpen] = useState(false);

  /* Receiver "Add to Bunker" state */
  const [receiverGroups, setReceiverGroups] = useState<string[]>(INCOMING_BASE_GROUPS);
  const [receiverGroup, setReceiverGroup] = useState('Random');
  const [receiverAddBusy, setReceiverAddBusy] = useState(false);
  const [receiverGroupSheetOpen, setReceiverGroupSheetOpen] = useState(false);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const theme = useMemo(
    () => getThemeById(payload?.themeId || '') ?? CHEST_THEMES[0],
    [payload?.themeId],
  );

  useEffect(() => {
    if (!visible) {
      setGroupSheetOpen(false);
      setReceiverGroupSheetOpen(false);
    }
  }, [visible]);

  /* Fetch groups for receiver variant (Social Market add) */
  useEffect(() => {
    if (variant !== 'receiver' || !visible || !ghostTargetUid) return;
    let cancelled = false;
    void (async () => {
      try {
        const uid = await getActiveUserId();
        if (!uid || cancelled) return;
        const g = await fetchBunkerGroups(uid, language);
        if (!cancelled) {
          const list = Array.isArray(g) && g.length > 0 ? g : INCOMING_BASE_GROUPS;
          setReceiverGroups(list);
          setReceiverGroup((prev) => (list.includes(prev) ? prev : 'Random'));
        }
      } catch {
        if (!cancelled) {
          setReceiverGroups(INCOMING_BASE_GROUPS);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [variant, visible, ghostTargetUid, language]);

  /* Handle "Add to Bunker" from receiver (Social Market) */
  const handleReceiverAdd = useCallback(async () => {
    if (variant !== 'receiver' || !ghostTargetUid || !sourceCardId) return;
    setReceiverAddBusy(true);
    try {
      const uid = await getActiveUserId();
      if (!uid) throw new Error(tr('No autenticado', 'Not authenticated'));
      await grantBusinessShareFromQr({
        receiverUid: uid,
        ownerUid: ghostTargetUid,
        cardId: sourceCardId,
        locale: language === 'en' ? 'en' : 'es',
      });
      await seedMetaForIncomingCard({
        issuerUid: ghostTargetUid,
        cardId: sourceCardId,
        group: receiverGroup,
        scanThemeId: payload?.themeId?.trim() ? payload.themeId : null,
      });
      try {
        await trackBunkerGroupUsage({ viewerUid: uid, groupName: receiverGroup, locale: language === 'en' ? 'en' : 'es' });
      } catch { /* non-blocking */ }
      Alert.alert(
        tr('Agregado', 'Added'),
        tr('La tarjeta fue agregada a tu Búnker.', 'The card was added to your Bunker.'),
      );
      handleClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : tr('Intenta de nuevo.', 'Try again.');
      Alert.alert(tr('No se pudo agregar', 'Could not add'), msg);
    } finally {
      setReceiverAddBusy(false);
    }
  }, [variant, ghostTargetUid, sourceCardId, receiverGroup, language, payload?.themeId, tr, handleClose]);

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
        scanThemeId: payload?.themeId?.trim() ? payload.themeId : null,
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
      const ok = tr('Aceptar', 'OK');
      Alert.alert(tr('No se pudo agregar', 'Could not add'), msg, [{ text: ok }]);
    } finally {
      setIncomingBusy(false);
    }
  }, [incomingRedeem, variant, incomingGroup, language, payload?.themeId, tr, handleClose]);

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
      <>
        <TouchableOpacity
          style={[incomingStyles.groupChip, { borderColor: `${accent}55` }]}
          onPress={() => !incomingBusy && setGroupSheetOpen(true)}
          disabled={incomingBusy}
          accessibilityRole="button"
          accessibilityLabel={tr('Cambiar grupo del Búnker', 'Change Bunker group')}
        >
          <MaterialCommunityIcons name="folder-outline" size={16} color={accent} />
          <Text style={[incomingStyles.groupChipText, { color: accent }]} numberOfLines={1}>
            {tr('Grupo', 'Group')}: {incomingGroup}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={accent} />
        </TouchableOpacity>
        <Modal
          visible={groupSheetOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setGroupSheetOpen(false)}
        >
          <Pressable style={incomingStyles.sheetBackdrop} onPress={() => setGroupSheetOpen(false)}>
            <Pressable
              style={[incomingStyles.sheetCard, { backgroundColor: shell.modalBg, borderColor: shell.border }]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[incomingStyles.sheetTitle, { color: shell.textPrimary }]}>
                {tr('Grupo en el Búnker', 'Bunker group')}
              </Text>
              <ScrollView style={incomingStyles.sheetList} keyboardShouldPersistTaps="handled">
                {incomingGroups.map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={incomingStyles.sheetRow}
                    onPress={() => {
                      setIncomingGroup(g);
                      setGroupSheetOpen(false);
                    }}
                  >
                    <Text style={[incomingStyles.sheetRowText, { color: shell.textPrimary }]}>{g}</Text>
                    {incomingGroup === g ? (
                      <MaterialCommunityIcons name="check" size={20} color={accent} />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={[incomingStyles.sheetDone, { borderColor: shell.border }]}
                onPress={() => setGroupSheetOpen(false)}
              >
                <Text style={{ color: shell.textPrimary, fontWeight: '600' }}>{tr('Listo', 'Done')}</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      </>
    ) : null;

  const receiverAccessory =
    variant === 'receiver' && ghostTargetUid ? (
      <>
        <TouchableOpacity
          style={[incomingStyles.groupChip, { borderColor: `${accent}55` }]}
          onPress={() => !receiverAddBusy && setReceiverGroupSheetOpen(true)}
          disabled={receiverAddBusy}
          accessibilityRole="button"
          accessibilityLabel={tr('Elegir grupo del Búnker', 'Choose Bunker group')}
        >
          <MaterialCommunityIcons name="folder-outline" size={16} color={accent} />
          <Text style={[incomingStyles.groupChipText, { color: accent }]} numberOfLines={1}>
            {tr('Grupo', 'Group')}: {receiverGroup}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={accent} />
        </TouchableOpacity>
        <Modal
          visible={receiverGroupSheetOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setReceiverGroupSheetOpen(false)}
        >
          <Pressable style={incomingStyles.sheetBackdrop} onPress={() => setReceiverGroupSheetOpen(false)}>
            <Pressable
              style={[incomingStyles.sheetCard, { backgroundColor: shell.modalBg, borderColor: shell.border }]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[incomingStyles.sheetTitle, { color: shell.textPrimary }]}>
                {tr('Grupo en el Búnker', 'Bunker group')}
              </Text>
              <ScrollView style={incomingStyles.sheetList} keyboardShouldPersistTaps="handled">
                {receiverGroups.map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={incomingStyles.sheetRow}
                    onPress={() => {
                      setReceiverGroup(g);
                      setReceiverGroupSheetOpen(false);
                    }}
                  >
                    <Text style={[incomingStyles.sheetRowText, { color: shell.textPrimary }]}>{g}</Text>
                    {receiverGroup === g ? (
                      <MaterialCommunityIcons name="check" size={20} color={accent} />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={[incomingStyles.sheetDone, { borderColor: shell.border }]}
                onPress={() => setReceiverGroupSheetOpen(false)}
              >
                <Text style={{ color: shell.textPrimary, fontWeight: '600' }}>{tr('Listo', 'Done')}</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      </>
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
        footerTopAccessory={incomingAccessory || receiverAccessory}
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
          addLabel:
            variant === 'receiver' && ghostTargetUid
              ? tr('Agregar', 'Add')
              : undefined,
          onAdd:
            variant === 'receiver' && ghostTargetUid
              ? () => void handleReceiverAdd()
              : undefined,
          addBusy: receiverAddBusy,
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
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  groupChipText: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  sheetCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingTop: 14,
    paddingHorizontal: 12,
    maxHeight: 360,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  sheetList: {
    maxHeight: 260,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  sheetRowText: {
    fontSize: 16,
  },
  sheetDone: {
    marginTop: 4,
    marginBottom: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
