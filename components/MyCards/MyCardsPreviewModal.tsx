/**
 * Componente maestro de vista previa de tarjeta.
 * Fuente única de verdad visual para Mis Tarjetas (emisor),
 * Contactos (receptor), Búsqueda (receptor) y aceptación entrante (token / QR).
 */

import appPalette from '@/app/theme';
import { MedalRatingModal } from '@/components/MedalRatingModal';
import {
    IsolatedWireframeCard,
    type WireframeEditSlot,
    type WireframeVaultItem,
} from '@/components/smartCard/IsolatedWireframeCard';
import {
    createPreviewWireframeSlotRenderer,
    type IconVaultLookup,
} from '@/components/smartCard/wireframeMirrorRendering';
import { SmartCardMirrorModal } from '@/components/SmartCardMirrorModal';
import { VaultDocumentViewerModal } from '@/components/VaultDocumentViewerModal';
import {
    CARD_THEMES as CHEST_THEMES,
    getThemeById,
} from '@/constants/themeChest';
import { getActiveUserId } from '@/services/authSession';
import { trackCardAction } from '@/services/analyticsService';
import {
    mirrorNotifyPublicBizIconClick,
    mirrorNotifyPublicBizView,
} from '@/services/mirrorBusinessCardPublicAnalytics';
import type { MirrorVaultItem } from '@/services/buildReceiverPreviewVaultItems';
import { CONTACT_META_STORAGE_KEY, seedMetaForIncomingCard } from '@/services/bunkerContactMetaSeed';
import { runBunkerContactTieredSaveFeedback } from '@/services/bunkerContactTieredSaveFeedback';
import { viewerQualifiesVaultFerrariSensory } from '@/services/vaultSensoryTierGate';
import { toApiLocale, trEsEn, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import {
    BUSINESS_MEDALS,
    getMedalData,
    type MedalCounts,
    SOCIAL_MEDALS,
} from '@/services/medalService';
import { openVaultPreviewItem } from '@/services/openVaultPreviewItem';
import {
    consumeDynamicQrToken,
    fetchBunkerGroups,
    grantBusinessShareFromQr,
    redeemTemporaryAccessToken,
    trackBunkerGroupUsage,
    upsertSmartCardInDb,
    listReceivedContacts,
} from '@/services/qrApi';
import { receivedContactMergeKey } from '@/services/receivedContactsPresentationMerge';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
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
  enableParallax: boolean;
  slots: WireframeEditSlot[];
  noAvatarIcon?: 'account' | 'storefront-outline';
  iconVaultById?: IconVaultLookup;
};

export type MyCardsIncomingRedeem = {
  mode: 'universal' | 'dynamic_qr' | 'business_permanent';
  token: string;
  issuerUid: string;
  sid: string | null;
  bId: string | null;
  receiverUid: string;
  onSuccess: () => void;
};

function seedAvatarUrlFromPreviewPayload(payload: MyCardsPayload | null): string | undefined {
  if (!payload) return undefined;
  /** Negocio: el círculo no es foto de persona; el logo va al wireframe — no sembrar como avatar de contacto. */
  if (payload.noAvatarIcon === 'storefront-outline') return undefined;
  const u = payload.avatarUrl;
  if (u == null || !String(u).trim()) return undefined;
  return String(u).trim().slice(0, 4096);
}

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
  sourceSid?: string | null;
  sourceBId?: string | null;
  sourceCardName?: string;
  peerDisplayName?: string;
  /** Nombre canónico VoIP (userFullName / Firestore); se pasa al Ghost-Link al tocar un dato. */
  peerFullName?: string;
  /** userNickName del titular; solo trazabilidad en UI + se envía a Ghost-Link. */
  peerNickname?: string;
  /** Negocio: bcContactName para la pastilla Ghost-Link. */
  ghostCardContactName?: string | null;
  /** Tipo de tarjeta para el modal de medallas ('smart' | 'business'). No aplica a variant=issuer. */
  ratingCardType?: 'smart' | 'business';
  /**
   * Android: medal rating uses RN Modal above the card mirror (Contacts / Social Market).
   * No effect on iOS. Omit for default (true on Android).
   */
  medalRatingUseNativeAndroidModal?: boolean;
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
  sourceSid,
  sourceBId,
  sourceCardName,
  peerDisplayName,
  peerFullName,
  peerNickname,
  ghostCardContactName,
  ratingCardType,
  medalRatingUseNativeAndroidModal,
}: MyCardsPreviewModalProps) {
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const shell = appPalette[isDark ? 'dark' : 'light'];
  const { language } = useLanguage();
  const tr = (es: string, en: string) => trEsEn(es, en, language);
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

  /* Already-in-bunker check — all incoming modes + receiver variant */
  const [alreadyInBunker, setAlreadyInBunker] = useState(false);

  /* Add-new-group inline (dentro del sheet, sin modal separado) */
  const preLoadedGroupRef = useRef<string>('');
  const [newGroupInput, setNewGroupInput] = useState('');
  const [isAddingIncomingGroup, setIsAddingIncomingGroup] = useState(false);
  const [isAddingReceiverGroup, setIsAddingReceiverGroup] = useState(false);

  /* ── Medallas ─────────────────────────────────────────────────────────────── */
  const [medalCounts, setMedalCounts] = useState<MedalCounts>({});
  const [medalModalVisible, setMedalModalVisible] = useState(false);

  const canRate = variant !== 'issuer' && !!ratingCardType;
  const showMedals = !!ratingCardType;  // issuer ve sus medallas, contacts pueden votar
  const sidOrBIdForMedals =
    [sourceBId, incomingRedeem?.bId, sourceSid, incomingRedeem?.sid].find((v) => v != null && String(v).trim()) ?? null;
  const issuerUidForMedals = ghostTargetUid ?? incomingRedeem?.issuerUid ?? null;
  const analyticsBId = sourceBId ?? incomingRedeem?.bId ?? null;
  const analyticsSid = sourceSid ?? incomingRedeem?.sid ?? null;
  const analyticsCardId =
    [analyticsBId, analyticsSid].find((v) => v != null && String(v).trim()) ?? null;
  const mirrorBizOwnerUid = useMemo(() => {
    if (variant === 'incoming' && incomingRedeem?.issuerUid) {
      return String(incomingRedeem.issuerUid).trim();
    }
    if (variant === 'receiver' && ghostTargetUid) return String(ghostTargetUid).trim();
    return '';
  }, [variant, incomingRedeem?.issuerUid, ghostTargetUid]);
  const lastTrackedViewRef = useRef('');

  useEffect(() => {
    const cardId = analyticsCardId != null ? String(analyticsCardId).trim() : '';
    if (!visible) {
      lastTrackedViewRef.current = '';
      return;
    }
    if (variant === 'issuer' || !cardId) return;
    const key = `${variant}:${cardId}`;
    if (lastTrackedViewRef.current === key) return;
    lastTrackedViewRef.current = key;
    void (async () => {
      const bizBId = analyticsBId != null ? String(analyticsBId).trim() : '';
      await trackCardAction(cardId, 'view', {
        subType: 'modal_open',
        source: variant,
        ...(analyticsBId ? { bId: analyticsBId } : {}),
        ...(analyticsSid ? { sid: analyticsSid } : {}),
      }).catch(() => undefined);
      const selfUid = await getActiveUserId();
      if (
        !selfUid &&
        bizBId &&
        mirrorBizOwnerUid &&
        bizBId === cardId
      ) {
        mirrorNotifyPublicBizView(mirrorBizOwnerUid, bizBId, key);
      }
    })();
  }, [
    visible,
    variant,
    analyticsCardId,
    analyticsBId,
    analyticsSid,
    mirrorBizOwnerUid,
  ]);

  useEffect(() => {
    if (!visible || !showMedals || !sidOrBIdForMedals) return;
    void (async () => {
      try {
        const uid = await getActiveUserId();
        if (!uid) return;
        const data = await getMedalData(String(sidOrBIdForMedals).trim(), uid);
        setMedalCounts(data.counts);
      } catch {
        // no-op — medallas no críticas
      }
    })();
  }, [visible, showMedals, sidOrBIdForMedals]);

  const medalPillDefs = ratingCardType === 'business' ? BUSINESS_MEDALS : SOCIAL_MEDALS;
  const medalPills = showMedals
    ? medalPillDefs.map((m) => ({
        key: m.key,
        icon: m.icon,
        count: medalCounts[m.key] ?? 0,
      }))
    : undefined;

  useEffect(() => {
    if (!visible) { setAlreadyInBunker(false); return; }
    let issuerUid = '';
    let sid: string | null = null;
    let bId: string | null = null;
    if (
      variant === 'incoming' &&
      incomingRedeem?.issuerUid &&
      (incomingRedeem.sid || incomingRedeem.bId)
    ) {
      issuerUid = incomingRedeem.issuerUid;
      sid = incomingRedeem.sid;
      bId = incomingRedeem.bId;
    } else if (variant === 'receiver' && ghostTargetUid && (sourceSid || sourceBId)) {
      issuerUid = ghostTargetUid;
      sid = sourceSid ?? null;
      bId = sourceBId ?? null;
    }
    if (!issuerUid || (!sid && !bId)) { setAlreadyInBunker(false); return; }
    let cancelled = false;
    void (async () => {
      try {
        const selfUid = await getActiveUserId();
        if (!selfUid || cancelled) return;
        const { contacts } = await listReceivedContacts({ uid: selfUid });
        const backendHasContact = contacts.some((row) => (
          String(row.uid || '').trim() === issuerUid &&
          (bId
            ? String(row.bId || '').trim() === bId
            : String(row.sid || '').trim() === String(sid || '').trim())
        ));
        if (cancelled) return;
        if (!backendHasContact) {
          setAlreadyInBunker(false);
          preLoadedGroupRef.current = '';
          return;
        }

        const raw = await AsyncStorage.getItem(CONTACT_META_STORAGE_KEY);
        if (!raw) { setAlreadyInBunker(true); return; }
        const map = JSON.parse(raw) as Record<string, { group?: string } | unknown>;
        const key = receivedContactMergeKey({ uid: issuerUid, sid, bId });
        const isIn = key in map;
        setAlreadyInBunker(backendHasContact);
        // Pre-load the stored group so the dropdown shows the correct current value
        if (isIn) {
          const meta = map[key] as { group?: string } | undefined;
          if (meta?.group) {
            preLoadedGroupRef.current = meta.group;
            if (variant === 'incoming') setIncomingGroup(meta.group);
            else setReceiverGroup(meta.group);
          }
        }
      } catch {
        setAlreadyInBunker(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, variant, incomingRedeem, ghostTargetUid, sourceSid, sourceBId]);

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
      setIsAddingIncomingGroup(false);
      setIsAddingReceiverGroup(false);
      setNewGroupInput('');
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
        const g = await fetchBunkerGroups(uid, toApiLocale(language));
        if (!cancelled) {
          const base = Array.isArray(g) && g.length > 0 ? g : INCOMING_BASE_GROUPS;
          const preLoaded = preLoadedGroupRef.current;
          const list = preLoaded && !base.includes(preLoaded) ? [...base, preLoaded] : base;
          setReceiverGroups(list);
          setReceiverGroup((prev) => (list.includes(prev) ? prev : (list[0] ?? 'Random')));
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
    const bId = sourceBId != null && String(sourceBId).trim() ? String(sourceBId).trim() : '';
    if (variant !== 'receiver' || !ghostTargetUid || !bId) return;
    setReceiverAddBusy(true);
    try {
      const uid = await getActiveUserId();
      if (!uid) throw new Error(tr('No autenticado', 'Not authenticated'));
      const share = await grantBusinessShareFromQr({
        receiverUid: uid,
        uid: ghostTargetUid,
        bId,
        locale: toApiLocale(language),
      });
      const issuerPremiumExperience = share.issuerPremiumExperience;
      const viewerIsFerrari = await viewerQualifiesVaultFerrariSensory(uid);
      const premiumSensory = issuerPremiumExperience || viewerIsFerrari;
      await seedMetaForIncomingCard({
        issuerUid: ghostTargetUid,
        sid: null,
        bId,
        group: receiverGroup,
        scanThemeId: payload?.themeId?.trim() ? payload.themeId : null,
        seedAvatarUrl: seedAvatarUrlFromPreviewPayload(payload),
      });
      const linkKey = receivedContactMergeKey({ uid: ghostTargetUid, sid: null, bId });
      await runBunkerContactTieredSaveFeedback({ premiumSensory, linkKey });
      try {
        await trackBunkerGroupUsage({ viewerUid: uid, groupName: receiverGroup, locale: toApiLocale(language) });
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
  }, [variant, ghostTargetUid, sourceBId, receiverGroup, language, payload, tr, handleClose]);

  useEffect(() => {
    if (variant !== 'incoming' || !visible) return;
    if (!incomingRedeem?.issuerUid || (!incomingRedeem.sid && !incomingRedeem.bId)) return;
    let cancelled = false;
    void (async () => {
      try {
        const selfUid = await getActiveUserId();
        if (!selfUid || cancelled) return;
        const g = await fetchBunkerGroups(selfUid, toApiLocale(language));
        if (!cancelled) {
          const base = Array.isArray(g) && g.length > 0 ? g : INCOMING_BASE_GROUPS;
          const preLoaded = preLoadedGroupRef.current;
          const list = preLoaded && !base.includes(preLoaded) ? [...base, preLoaded] : base;
          setIncomingGroups(list);
          // Always preserve the pre-loaded group from meta
          setIncomingGroup((prev) => (list.includes(prev) ? prev : (list[0] ?? 'Random')));
        }
      } catch {
        if (!cancelled) {
          setIncomingGroups(INCOMING_BASE_GROUPS);
          setIncomingGroup((prev) => (INCOMING_BASE_GROUPS.includes(prev) ? prev : 'Random'));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [variant, visible, incomingRedeem?.issuerUid, incomingRedeem?.sid, incomingRedeem?.bId, language]);

  /* Cambiar grupo de una tarjeta ya existente en el Búnker (Caso 2 y Caso 3) */
  const handleChangeGroup = useCallback(async () => {
    let issuerUid = '';
    let sid: string | null = null;
    let bId: string | null = null;
    let group = incomingGroup;
    if (variant === 'incoming' && incomingRedeem) {
      issuerUid = incomingRedeem.issuerUid;
      sid = incomingRedeem.sid;
      bId = incomingRedeem.bId;
      group = incomingGroup;
    } else if (variant === 'receiver' && ghostTargetUid && (sourceSid || sourceBId)) {
      issuerUid = ghostTargetUid;
      sid = sourceSid ?? null;
      bId = sourceBId ?? null;
      group = receiverGroup;
    }
    if (!issuerUid || (!sid && !bId)) { handleClose(); return; }
    if (variant === 'incoming') setIncomingBusy(true);
    else setReceiverAddBusy(true);
    try {
      await seedMetaForIncomingCard({
        issuerUid,
        sid,
        bId,
        group,
        scanThemeId: payload?.themeId?.trim() ? payload.themeId : null,
        seedAvatarUrl: seedAvatarUrlFromPreviewPayload(payload),
      });
      try {
        const uid = await getActiveUserId();
        if (uid) await trackBunkerGroupUsage({ viewerUid: uid, groupName: group, locale: toApiLocale(language) });
      } catch { /* non-blocking */ }
      if (variant === 'incoming' && incomingRedeem?.onSuccess) {
        incomingRedeem.onSuccess();
      }
      handleClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : tr('Intenta de nuevo.', 'Try again.');
      Alert.alert(tr('Error', 'Error'), msg);
    } finally {
      if (variant === 'incoming') setIncomingBusy(false);
      else setReceiverAddBusy(false);
    }
  }, [variant, incomingRedeem, ghostTargetUid, sourceSid, sourceBId, incomingGroup, receiverGroup, language, payload, tr, handleClose]);

  const handleAddNewGroup = useCallback(async (target: 'incoming' | 'receiver') => {
    const trimmed = newGroupInput.trim();
    if (!trimmed) return;
    if (target === 'incoming') {
      setIncomingGroups((prev) => Array.from(new Set([...prev, trimmed])));
      setIncomingGroup(trimmed);
      setIsAddingIncomingGroup(false);
      setGroupSheetOpen(false);
    } else {
      setReceiverGroups((prev) => Array.from(new Set([...prev, trimmed])));
      setReceiverGroup(trimmed);
      setIsAddingReceiverGroup(false);
      setReceiverGroupSheetOpen(false);
    }
    setNewGroupInput('');
    const uid = await getActiveUserId();
    if (uid) {
      try {
        await trackBunkerGroupUsage({ viewerUid: uid, groupName: trimmed, locale: toApiLocale(language) });
      } catch { /* non-blocking */ }
    }
  }, [newGroupInput, language]);

  const handleIncomingAccept = useCallback(async () => {
    const r = incomingRedeem;
    if (!r || variant !== 'incoming') return;
    const { token, issuerUid, sid, bId, mode, onSuccess } = r;
    if (!issuerUid || (!sid && !bId)) return;
    if (mode !== 'business_permanent' && !String(token || '').trim()) return;
    // Resolve the receiver UID on the spot — the prop may have been empty on first render.
    const receiverUid = r.receiverUid || (await getActiveUserId()) || '';
    if (!receiverUid) return;
    setIncomingBusy(true);
    try {
      let issuerPremiumExperience = false;
      if (mode === 'universal') {
        const out = await redeemTemporaryAccessToken({
          receiverUid,
          token,
          locale: toApiLocale(language),
        });
        issuerPremiumExperience = out.issuerPremiumExperience;
      } else if (mode === 'business_permanent') {
        const bizId = String(bId || '').trim();
        if (!bizId) throw new Error(tr('Tarjeta inválida', 'Invalid card'));
        const out = await grantBusinessShareFromQr({
          receiverUid,
          uid: issuerUid,
          bId: bizId,
          locale: toApiLocale(language),
        });
        issuerPremiumExperience = out.issuerPremiumExperience;
      } else {
        const out = await consumeDynamicQrToken({ receiverUid, token, locale: toApiLocale(language) });
        issuerPremiumExperience = out.issuerPremiumExperience;
      }
      await seedMetaForIncomingCard({
        issuerUid,
        sid,
        bId,
        group: incomingGroup,
        scanThemeId: payload?.themeId?.trim() ? payload.themeId : null,
        seedAvatarUrl: seedAvatarUrlFromPreviewPayload(payload),
      });

      // --- NUEVO: persistir localmente en Contactos ---
      if (mode === 'business_permanent' && payload) {
        const bizId = String(bId || '').trim();
        if (bizId) {
          const { cardName, subtitle, avatarUrl, themeId, wallpaperUrl, layout, holdersCount, enableParallax, slots } = payload;
          await upsertSmartCardInDb({
            uid: receiverUid,
            card: {
              bId: bizId,
              scName: cardName,
              layout: layout === 'horizontal' ? 'horizontal' : 'vertical',
              themeId,
              wallpaperUrl,
              holdersCount,
              enableParallax,
              ownerDisplayName: subtitle,
              /** Clave Mongo `smart_cards.ownerPhotoUrl` (imagen en doc de tarjeta); valor viene del preview (`avatarUrl`). */
              ownerPhotoUrl: avatarUrl ?? null,
              itemIds: Array.isArray(slots) ? slots.map((s: any) => String(s.id ?? s.itemId ?? '')) : [],
              cardType: 'business',
            },
          });
        }
      }
      // --- FIN NUEVO ---

      const linkKey = receivedContactMergeKey({ uid: issuerUid, sid, bId });
      const viewerIsFerrari = await viewerQualifiesVaultFerrariSensory(receiverUid);
      const premiumSensory = issuerPremiumExperience || viewerIsFerrari;
      await runBunkerContactTieredSaveFeedback({ premiumSensory, linkKey });

      try {
        await trackBunkerGroupUsage({ viewerUid: receiverUid, groupName: incomingGroup, locale: toApiLocale(language) });
      } catch {
        /* no bloquear */
      }
      if (mode === 'business_permanent') {
        Alert.alert(
          tr('Agregado', 'Added'),
          tr('El contacto ha sido agregado a tu Búnker.', 'The contact has been added to your Bunker.'),
          [{ text: tr('OK', 'OK') }],
        );
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
  }, [incomingRedeem, variant, incomingGroup, language, payload, tr, handleClose]);

  const openDocumentViewer = useCallback((item: MirrorVaultItem) => {
    setViewerItem(item);
    if (Platform.OS === 'ios') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setViewerVisible(true);
        });
      });
    } else {
      setViewerVisible(true);
    }
  }, []);

  const handleSlotPress = useCallback(
    async (item: WireframeVaultItem) => {
      const cardId = analyticsCardId != null ? String(analyticsCardId).trim() : '';
      if (variant !== 'issuer' && cardId) {
        const subType = String(item.type || item.iconName || item.title || 'unknown').trim() || 'unknown';
        const bizBIdTap = analyticsBId != null ? String(analyticsBId).trim() : '';
        void (async () => {
          await trackCardAction(cardId, 'icon_click', {
            subType,
            iconType: subType,
            source: variant,
            slotId: item.id,
            slotTitle: item.title,
            ...(analyticsBId ? { bId: analyticsBId } : {}),
            ...(analyticsSid ? { sid: analyticsSid } : {}),
          }).catch(() => undefined);
          const selfTap = await getActiveUserId();
          if (
            !selfTap &&
            bizBIdTap &&
            mirrorBizOwnerUid &&
            bizBIdTap === String(cardId).trim()
          ) {
            mirrorNotifyPublicBizIconClick(mirrorBizOwnerUid, bizBIdTap, { subType });
          }
        })();
      }
      await openVaultPreviewItem(item as unknown as MirrorVaultItem, {
        tr,
        openDocumentViewer: (it) => {
          openDocumentViewer(it as MirrorVaultItem);
        },
        ghostTargetUid: ghostTargetUid ?? null,
        sourceCardName:
          sourceCardName || payload?.cardName || tr('Tarjeta Social', 'Social Card'),
        sourceSid: sourceSid ?? null,
        sourceBId: sourceBId ?? null,
        peerDisplayName: peerDisplayName || tr('contacto', 'contact'),
        peerFullName,
        peerNickname,
        bcLogoUrl:
          ratingCardType === 'business' ? payload?.avatarUrl ?? null : null,
        bcName:
          ratingCardType === 'business' ? payload?.cardName ?? null : null,
        bcContactName:
          ratingCardType === 'business' && ghostCardContactName != null && String(ghostCardContactName).trim()
            ? String(ghostCardContactName).trim()
            : null,
        dismissParentModal: handleClose,
        peerPhotoUrl: payload?.avatarUrl ?? null,
        cardPhoto: payload?.avatarUrl ?? null,
        cardType: ratingCardType === 'business' ? 'business' : 'personal',
      });
    },
    [
      tr,
      openDocumentViewer,
      ghostTargetUid,
      sourceCardName,
      sourceSid,
      sourceBId,
      peerDisplayName,
      peerFullName,
      peerNickname,
      ghostCardContactName,
      payload?.cardName,
      payload?.avatarUrl,
      handleClose,
      ratingCardType,
      analyticsCardId,
      analyticsBId,
      analyticsSid,
      variant,
      mirrorBizOwnerUid,
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
          onRequestClose={() => {
            setGroupSheetOpen(false);
            setIsAddingIncomingGroup(false);
            setNewGroupInput('');
          }}
        >
          <Pressable
            style={incomingStyles.sheetBackdrop}
            onPress={() => {
              setGroupSheetOpen(false);
              setIsAddingIncomingGroup(false);
              setNewGroupInput('');
            }}
          >
            <Pressable
              style={[incomingStyles.sheetCard, { backgroundColor: shell.modalBg, borderColor: shell.border }]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[incomingStyles.sheetTitle, { color: shell.textPrimary }]}>
                {tr('Grupo en el Búnker', 'Bunker group')}
              </Text>
              {isAddingIncomingGroup ? (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                  <View style={incomingStyles.inlineAddContainer}>
                    <TextInput
                      style={[
                        incomingStyles.inlineAddInput,
                        { color: shell.textPrimary, borderColor: shell.border, backgroundColor: shell.surfaceMuted },
                      ]}
                      placeholder={tr('Nombre del grupo', 'Group name')}
                      placeholderTextColor={shell.textSecondary}
                      value={newGroupInput}
                      onChangeText={setNewGroupInput}
                      maxLength={40}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => void handleAddNewGroup('incoming')}
                    />
                    <View style={incomingStyles.inlineAddActions}>
                      <TouchableOpacity
                        style={incomingStyles.inlineAddCancel}
                        onPress={() => { setIsAddingIncomingGroup(false); setNewGroupInput(''); }}
                      >
                        <Text style={{ color: shell.textSecondary, fontWeight: '600' }}>{tr('Cancelar', 'Cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[incomingStyles.inlineAddSave, { backgroundColor: newGroupInput.trim() ? accent : `${accent}55` }]}
                        onPress={() => void handleAddNewGroup('incoming')}
                        disabled={!newGroupInput.trim()}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{tr('Guardar', 'Save')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </KeyboardAvoidingView>
              ) : (
                <>
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
                    style={[incomingStyles.sheetAddNewRow, { borderColor: shell.border }]}
                    onPress={() => { setIsAddingIncomingGroup(true); setNewGroupInput(''); }}
                  >
                    <MaterialCommunityIcons name="plus-circle-outline" size={18} color={accent} />
                    <Text style={[incomingStyles.sheetAddNewText, { color: accent }]}>
                      {tr('Agregar nuevo grupo', 'Add new group')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[incomingStyles.sheetDone, { borderColor: shell.border }]}
                    onPress={() => setGroupSheetOpen(false)}
                  >
                    <Text style={{ color: shell.textPrimary, fontWeight: '600' }}>{tr('Listo', 'Done')}</Text>
                  </TouchableOpacity>
                </>
              )}
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
          onRequestClose={() => {
            setReceiverGroupSheetOpen(false);
            setIsAddingReceiverGroup(false);
            setNewGroupInput('');
          }}
        >
          <Pressable
            style={incomingStyles.sheetBackdrop}
            onPress={() => {
              setReceiverGroupSheetOpen(false);
              setIsAddingReceiverGroup(false);
              setNewGroupInput('');
            }}
          >
            <Pressable
              style={[incomingStyles.sheetCard, { backgroundColor: shell.modalBg, borderColor: shell.border }]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[incomingStyles.sheetTitle, { color: shell.textPrimary }]}>
                {tr('Grupo en el Búnker', 'Bunker group')}
              </Text>
              {isAddingReceiverGroup ? (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                  <View style={incomingStyles.inlineAddContainer}>
                    <TextInput
                      style={[
                        incomingStyles.inlineAddInput,
                        { color: shell.textPrimary, borderColor: shell.border, backgroundColor: shell.surfaceMuted },
                      ]}
                      placeholder={tr('Nombre del grupo', 'Group name')}
                      placeholderTextColor={shell.textSecondary}
                      value={newGroupInput}
                      onChangeText={setNewGroupInput}
                      maxLength={40}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => void handleAddNewGroup('receiver')}
                    />
                    <View style={incomingStyles.inlineAddActions}>
                      <TouchableOpacity
                        style={incomingStyles.inlineAddCancel}
                        onPress={() => { setIsAddingReceiverGroup(false); setNewGroupInput(''); }}
                      >
                        <Text style={{ color: shell.textSecondary, fontWeight: '600' }}>{tr('Cancelar', 'Cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[incomingStyles.inlineAddSave, { backgroundColor: newGroupInput.trim() ? accent : `${accent}55` }]}
                        onPress={() => void handleAddNewGroup('receiver')}
                        disabled={!newGroupInput.trim()}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{tr('Guardar', 'Save')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </KeyboardAvoidingView>
              ) : (
                <>
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
                    style={[incomingStyles.sheetAddNewRow, { borderColor: shell.border }]}
                    onPress={() => { setIsAddingReceiverGroup(true); setNewGroupInput(''); }}
                  >
                    <MaterialCommunityIcons name="plus-circle-outline" size={18} color={accent} />
                    <Text style={[incomingStyles.sheetAddNewText, { color: accent }]}>
                      {tr('Agregar nuevo grupo', 'Add new group')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[incomingStyles.sheetDone, { borderColor: shell.border }]}
                    onPress={() => setReceiverGroupSheetOpen(false)}
                  >
                    <Text style={{ color: shell.textPrimary, fontWeight: '600' }}>{tr('Listo', 'Done')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      </>
    ) : null;

  const mirrorScale = variant === 'issuer' ? 0.8 : 1;

  return (
    <>
      <SmartCardMirrorModal
        visible={Boolean(visible && payload != null && !viewerVisible)}
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
            variant === 'issuer' ? tr('Cerrar', 'Close') : tr('Cancelar', 'Cancel'),
          editLabel:
            variant === 'issuer'
              ? tr('Editar tarjeta', 'Edit card')
              : undefined,
          onClose: handleClose,
          onEditCard: variant === 'issuer' ? onEditCard : undefined,
          // Caso 1: nuevo → Agregar/Aceptar | Caso 2: ya está → Cambiar Grupo
          acceptLabel:
            variant === 'incoming'
              ? (alreadyInBunker
                  ? tr('Cambiar Grupo', 'Change Group')
                  : (incomingRedeem?.mode === 'business_permanent'
                      ? tr('Agregar', 'Add')
                      : tr('Aceptar', 'Accept')))
              : undefined,
          onAccept:
            variant === 'incoming'
              ? (alreadyInBunker ? () => void handleChangeGroup() : () => void handleIncomingAccept())
              : undefined,
          acceptBusy: variant === 'incoming' ? incomingBusy : undefined,

          // Caso 3: ya en contactos → Cambiar Grupo | Social Market nuevo → Agregar
          addLabel:
            variant === 'receiver' && ghostTargetUid
              ? (alreadyInBunker ? tr('Cambiar Grupo', 'Change Group') : tr('Agregar', 'Add'))
              : undefined,
          onAdd:
            variant === 'receiver' && ghostTargetUid
              ? (alreadyInBunker ? () => void handleChangeGroup() : () => void handleReceiverAdd())
              : undefined,

          addBusy: receiverAddBusy,
          colors: footerColors,
          blurTint: isDark ? 'dark' : 'light',
        }}
      >
        {payload ? (
          <>
            <IsolatedWireframeCard
              layout={payload.layout}
              slots={payload.slots}
              editable={false}
              theme={theme}
              wallpaperUrl={payload.wallpaperUrl}
              dispName={payload.cardName}
              dispSub={payload.subtitle}
              dispAvatar={payload.avatarUrl}
              dispHolders={
                Platform.OS === 'web'
                  ? 0
                  : Math.max(0, Math.floor(Number(payload.holdersCount ?? 0)))
              }
              noAvatarIconName={payload.noAvatarIcon ?? 'account'}
              enableParallax={payload.enableParallax}
              parallaxX={parallaxX}
              parallaxY={parallaxY}
              renderSlotContent={renderSlotContent}
              tr={tr}
              mirrorStatsCapsuleScale={mirrorScale}
              medalPills={medalPills}
              onRate={canRate ? () => setMedalModalVisible(true) : undefined}
            />
          </>
        ) : null}
      </SmartCardMirrorModal>

      {/* Modal de medallas */}
      {canRate ? (
        <MedalRatingModal
          visible={medalModalVisible}
          onClose={() => setMedalModalVisible(false)}
          cardType={ratingCardType!}
          sidOrBId={sidOrBIdForMedals != null ? String(sidOrBIdForMedals).trim() : ''}
          issuerUid={issuerUidForMedals ?? ''}
          cardOwnerName={peerDisplayName ?? sourceCardName ?? ''}
          onCountsChanged={setMedalCounts}
          useNativeModalOnAndroid={medalRatingUseNativeAndroidModal ?? true}
        />
      ) : null}

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
    paddingBottom: 12,
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
  sheetAddNewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheetAddNewText: {
    fontSize: 15,
    fontWeight: '600',
  },
  inlineAddContainer: {
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  inlineAddInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  inlineAddActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  inlineAddCancel: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  inlineAddSave: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
});
