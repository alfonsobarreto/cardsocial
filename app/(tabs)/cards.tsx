import AutoScaleText from '@/components/AutoScaleText';
import LimitReachedModal from '@/components/LimitReachedModal';
import { MyCardsPreviewModal, type MyCardsPayload } from '@/components/MyCards';
import ReceptorScreenModal from '@/components/ReceptorScreenModal';
import {
    computeThemeLockerTileWidth,
    THEME_LOCKER_TILE_GAP,
    ThemeLockerThemeTile,
} from '@/components/ThemeLockerThemeTile';
import { VaultDocumentViewerModal } from '@/components/VaultDocumentViewerModal';
import { IsolatedWireframeCard, type WireframeEditSlot } from '@/components/smartCard/IsolatedWireframeCard';
import { WireframeSlotTile } from '@/components/smartCard/WireframeSlotTile';
import { getPreviewModalStackSize, getWireframeIconRowPlan } from '@/components/smartCard/wireframeMath';
import { renderWireframeMiniIcon } from '@/components/smartCard/wireframeMirrorRendering';
import { brandCsIconLogo } from '@/constants/brandAssets';
import { isGhostLinkVaultType } from '@/constants/ghostLinkVault';
import {
    CARD_THEMES as CHEST_THEMES,
    DEFAULT_CARD_THEME_ID,
    getThemeById,
    getThemesByTier,
    TIER_META,
    type CardTheme as ChestCardTheme,
    type ThemeTier,
} from '@/constants/themeChest';
import { getActiveUserId } from '@/services/authSession';
import { hardLockCheck } from '@/services/biometricAuth';
import {
  ExportBusinessQR,
  generatePublicBusinessWebUrl,
  rewriteLoopbackSmartCardUniversalUrl,
  shareBusinessQrPngDataUrl,
} from '@/services/brandedQrService';
import {
    listMyBusinessCards,
    getBusinessCard,
    deleteBusinessCard as deleteBusinessCardViaApi,
    updateBusinessCard as updateBusinessCardViaApi,
} from '@/services/businessCardsRepo';
import { getBusinessCardSlotAvailability } from '@/services/businessCardSlotsGate';
import type { BusinessCardDoc, PublicCardSlot } from '@/services/types/cards';

/**
 * UI-facing view of a business card row. This is a flat, minimal shape that
 * only the cards.tsx screen consumes; it is built from `BusinessCardDoc` by
 * `toBusinessCardListRow` below. Keeping it local lets us retire
 * `businessCardService` without churning the UI code beneath.
 */
type BusinessCardListRow = {
  bId: string;
  bcName: string;
  createdAtMs: number;
  themeId: string;
  bcContactName: string;
  bcLogoUrl: string;
  /** IDs en Bóveda (users/{uid}/links). */
  vaultLinkIds: string[];
  /** Copia Mongo `publicCardSlots` tras refrescar; respaldo si el preview cruza antes que la Bóveda local. */
  publicCardSlots?: PublicCardSlot[];
  isFavorite: boolean;
  holdersCount: number;
  totalRatings: number;
  ratingAvg: number;
  silenced?: boolean;
};

function toBusinessCardListRow(doc: BusinessCardDoc): BusinessCardListRow {
  const createdMs = Date.parse(doc.createdAt);
  return {
    bId: doc.bId,
    bcName: doc.bcName || doc.bId,
    createdAtMs: Number.isFinite(createdMs) ? createdMs : 0,
    themeId: doc.themeId || DEFAULT_CARD_THEME_ID,
    bcContactName: doc.bcContactName || '',
    bcLogoUrl: doc.bcLogoUrl || '',
    vaultLinkIds: [...(doc.vaultItemIds || [])],
    publicCardSlots: Array.isArray(doc.publicCardSlots) ? [...doc.publicCardSlots] : undefined,
    isFavorite: Boolean(doc.isFavorite),
    holdersCount: Number(doc.holdersCount || 0),
    totalRatings: Number(doc.totalRatings || 0),
    ratingAvg: Number(doc.averageRating || 5),
  };
}
function parseBusinessCardsFeedCache(json: string | null): BusinessCardListRow[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    const out: BusinessCardListRow[] = [];
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const bId = String(r.bId || '').trim();
      if (!bId) continue;
      out.push({
        bId,
        bcName: String(r.bcName || bId),
        createdAtMs: Number(r.createdAtMs) || 0,
        themeId: String(r.themeId || DEFAULT_CARD_THEME_ID),
        bcContactName: String(r.bcContactName || ''),
        bcLogoUrl: String(r.bcLogoUrl || ''),
        vaultLinkIds: Array.isArray(r.vaultLinkIds) ? r.vaultLinkIds.map((x) => String(x)) : [],
        publicCardSlots: Array.isArray(r.publicCardSlots) ? (r.publicCardSlots as PublicCardSlot[]) : undefined,
        isFavorite: Boolean(r.isFavorite),
        holdersCount: Number(r.holdersCount || 0),
        totalRatings: Number(r.totalRatings || 0),
        ratingAvg: Number(r.ratingAvg ?? 5),
        silenced: r.silenced != null ? Boolean(r.silenced) : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}
import { type VaultCollectibleCertificate } from '@/services/collectibleService';
import {
    buildSearchFacetsForSharedCard,
    collectStringsSmartCard,
    deriveOwnerOccupationFromFacets,
    orderByDeepSearchWithExpandedQuery,
} from '@/services/deepSearch';
import { auth, db } from '@/services/firebaseConfig';
import {
  readUserAvatarUrl,
  readUserFullName,
  readUserNickName,
  readUserNickNameLower,
  readVoipCanonicalFullName,
} from '@/services/userIdentityFields';
import {
  buildCanonicalIssuerIdentityFromFirestore,
  emptyCanonicalIssuerIdentity,
  type CanonicalIssuerIdentity,
} from '@/types/canonicalIssuerIdentity';
import { type CardFontItem, type FontTier } from '@/services/fontLibraryService';
import { getUserIconVaultMap, type IconVaultEntry } from '@/services/iconVaultService';
import { trEsEn, useLanguage } from '@/services/language';
import { validateCardCreation } from '@/services/limitService';
import { useLookMode } from '@/services/lookMode';
import { buildExpandedMarketQuery } from '@/services/marketSearchSynonyms';
import { SOCIAL_MEDALS } from '@/services/medalService';
import { newEntityId } from '@/services/newEntityId';
import { openVaultPreviewItem } from '@/services/openVaultPreviewItem';
import { buildIssuerSnapshotFromPublicSlots } from '@/services/issuerSnapshotPayload';
import {
    blockRelationship,
    deleteSmartCardInDb,
    fetchBusinessCardHolderCounts,
    getCardAnalyticsSummary,
    issueDynamicQrToken,
    issueTemporaryUniversalAccess,
    listCardSubscribers,
    listSmartCardsFromDb,
    revokeCardSubscriber,
    setCardSilenced,
    setCardSubscriberMute,
    upsertSmartCardInDb,
    type CardSubscriberRow,
    type IssuerSnapshotPayload,
    type IssuerVaultPickedItem,
    type PublicCardSlotPayload,
    type SmartCardPayload,
} from '@/services/qrApi';
import { resolvePillForegroundColor } from '@/services/pillForegroundColor';
import { getCardRowTheme, useActiveTheme } from '@/services/useActiveTheme';
import {
    cardsTabFeedOrderStorageKey,
    readSmartCardsJsonWithLegacyMigration,
    smartCardsStorageKey,
    businessCardsFeedStorageKey,
} from '@/services/userScopedStorage';
import { isClassicPhoneVaultType } from '@/services/vaultItemTypeGuards';
import { getWallpaperResizeMode, type WallpaperItem, type WallpaperTier } from '@/services/wallpaperService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Gyroscope } from 'expo-sensors';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    AppState,
    DeviceEventEmitter,
    FlatList,
    InteractionManager,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    useWindowDimensions,
    View
} from 'react-native';
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from 'react-native-draggable-flatlist';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import QRCode from 'react-native-qrcode-svg';
import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { ActionController } from '../../services/ActionController';
import { loadVaultSnapshotForSlotSync } from '@/services/loadVaultSnapshotForSlotSync';
import { VAULT_LINK_SAVED_EVENT } from '@/services/vaultLinkSavedBus';
import { buildPublicCardSlotsForPersist } from '@/services/vaultPublicCardSlots';
import palette from '../theme';

type CardThemeId = string;

/** Resolves a themeId to its full ChestCardTheme object. Falls back to the first theme. */
const resolveTheme = (id: string | undefined): ChestCardTheme => {
  return getThemeById(id || '') ?? getThemeById(DEFAULT_CARD_THEME_ID) ?? CHEST_THEMES[0];
};

const toRenderableImageUri = (value: string | null | undefined): string | null => {
  const uri = String(value || '').trim();
  if (!uri) return null;
  if (/^https?:\/\//i.test(uri)) return uri;
  if (uri.startsWith('file://')) return uri;
  if (uri.startsWith('data:image/')) return uri;
  return null;
};

const normalizeType = (type: string) => String(type || '').trim().toLowerCase();
const isImageValue = (value: string) =>
  /\.(jpg|jpeg|png|gif|webp|bmp|heic)(\?|$)/i.test(value) ||
  (value.startsWith('file://') && !value.toLowerCase().endsWith('.pdf'));
const isPdfValue = (value: string) => /\.pdf(\?|$)/i.test(value);
const createSmartCardId = () => newEntityId();

type VaultItem = {
  id: string;
  title: string;
  type: string;
  value: string;
  iconName: string;
  icon?: string;
  iconVaultId?: string;
  vaultProtected?: boolean;
  isFavorite: boolean;
  vaultMimeType?: string;
};

function vaultItemFromIssuerPicked(picked: IssuerVaultPickedItem, vaultId: string): VaultItem {
  return {
    id: vaultId,
    title: String(picked.title || '').trim(),
    type: String(picked.type || 'link').trim() || 'link',
    value: String(picked.publicValue ?? '').trim(),
    iconName: 'link-variant',
    ...(picked.icon?.trim() ? { icon: picked.icon.trim() } : {}),
    isFavorite: false,
  };
}

function vaultItemFromPublicCardSlot(slot: PublicCardSlot): VaultItem {
  const id = String(slot.itemId || '').trim();
  const gn = String(slot.iconName || '').trim();
  return {
    id,
    title: String(slot.label || '').trim(),
    type: String(slot.type || 'link').trim() || 'link',
    value: String(slot.value || '').trim(),
    iconName: gn || 'link-variant',
    ...(slot.icon != null && String(slot.icon).trim() ? { icon: String(slot.icon).trim() } : {}),
    isFavorite: false,
  };
}

type Universal24hQrCacheRow = {
  universalUrl: string;
  expiresAt: number;
  /** Misma ventana que al emitir (barra de progreso al reabrir). */
  qrWindowMs: number;
};

function universal24hQrStorageKey(uid: string, sid: string) {
  return `@cs_universal24h_${uid}_${sid}`;
}

async function readUniversal24hQrCache(uid: string, sid: string): Promise<Universal24hQrCacheRow | null> {
  try {
    const raw = await AsyncStorage.getItem(universal24hQrStorageKey(uid, sid));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Universal24hQrCacheRow>;
    const rawUrl = String(p.universalUrl || '').trim();
    const universalUrl = rewriteLoopbackSmartCardUniversalUrl(rawUrl);
    const expiresAt = Number(p.expiresAt || 0);
    const qrWindowMs = Math.max(1000, Number(p.qrWindowMs || 0));
    if (!universalUrl || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await AsyncStorage.removeItem(universal24hQrStorageKey(uid, sid));
      return null;
    }
    if (rawUrl && universalUrl !== rawUrl) {
      void writeUniversal24hQrCache(uid, sid, { universalUrl, expiresAt, qrWindowMs });
    }
    return { universalUrl, expiresAt, qrWindowMs };
  } catch {
    return null;
  }
}

async function writeUniversal24hQrCache(uid: string, sid: string, row: Universal24hQrCacheRow) {
  try {
    await AsyncStorage.setItem(universal24hQrStorageKey(uid, sid), JSON.stringify(row));
  } catch {
    /* ignore */
  }
}

/** Firestore `users/{uid}` → nombre VoIP al momento de abrir (sin refs obsoletos). */
async function fetchVoipCanonicalFullNameForUid(uid: string): Promise<string> {
  const ou = String(uid || '').trim();
  if (!ou) return '';
  try {
    const snap = await getDoc(doc(db, 'users', ou));
    return readVoipCanonicalFullName(snap.data() as Record<string, unknown> | undefined);
  } catch {
    return '';
  }
}

/**
 * Tras resolver uid: prioriza Firestore (`readVoipCanonicalFullName` en `users/{uid}`); si falta, respaldo Mongo de la tarjeta (sid).
 * Se pasa el nickname conocido al objeto sintético para que `readVoipCanonicalFullName` descarte candidatos iguales al nick.
 */
function ghostPeerVoipFullName(
  firestoreCanonical: string,
  cardOwnerDisplayName: string | undefined,
  peerNick?: string,
): string {
  const fs = String(firestoreCanonical || '').trim();
  if (fs) return fs;
  const card = String(cardOwnerDisplayName || '').trim();
  if (!card) return '';
  const nickRaw = String(peerNick || '').trim().replace(/^@+/g, '');
  return readVoipCanonicalFullName({ userFullName: card, userNickName: nickRaw });
}

/**
 * Smart Card: la lista pública de datos es solo `itemIds` (subset de la Bóveda).
 * Ítems indelebles en Bóveda (p. ej. Ghost-Link bootstrap / vaultProtected) no se añaden solos a la tarjeta:
 * el usuario los incluye o excluye en el editor como cualquier otro dato.
 */
type SmartCard = {
  sid: string;
  scName: string;
  layout: 'vertical' | 'horizontal';
  themeId?: string;
  fontId?: string;
  fontName?: string;
  fontFamily?: string;
  fontTier?: FontTier;
  wallpaperId?: string;
  wallpaperUrl?: string;
  wallpaperThumbUrl?: string;
  wallpaperTier?: WallpaperTier;
  wallpaperPriceCredits?: number;
  enableParallax?: boolean;
  isFavorite?: boolean;
  /** IDs de ítems de Bóveda activos en esta tarjeta (preview, wireframe, QR, facetas compartidas). */
  itemIds: string[];
  holdersCount?: number;
  ratingAvg?: number;
  /** Número de reseñas (si el backend lo expone; si no, 0). */
  totalRatings?: number;
  /** Facetas para contactos; opcional en cache local */
  searchFacets?: Array<{ type: string; label: string; value: string }>;
  silenced?: boolean;
  createdAt: string;
  updatedAt: string;
  /** Espejo Mongo (`smart_cards.ownerDisplayName`) al hidratar desde API; respaldo de nombre para VoIP. */
  ownerDisplayName?: string;
  /** Snapshot denormalizado del emisor (Mongo Phase 1). */
  issuerSnapshot?: IssuerSnapshotPayload;
};

/** Una sola fila por `sid` (evita claves duplicadas en listas y orden manual). */
function dedupeSmartCardsBySid(cards: SmartCard[]): SmartCard[] {
  const byId = new Map<string, SmartCard>();
  for (const c of cards) {
    const id = String(c.sid || '').trim();
    if (!id) {
      continue;
    }
    byId.set(id, c);
  }
  return [...byId.values()];
}

/**
 * Segunda línea en Mis Tarjetas (Smart): evita repetir el título si coincide con el tema o con tu nombre público.
 */
function misCardsSmartRowSubtitle(
  cardName: string,
  themeLabel: string,
  ownerDisplayName: string,
  ownerNicknameRaw: string,
): string {
  const t = String(cardName || '').trim();
  const th = String(themeLabel || '').trim();
  const who = String(ownerDisplayName || '').trim();
  const nick = () => {
    const raw = String(ownerNicknameRaw || '')
      .trim()
      .replace(/^@+/g, '')
      .replace(/\s+/g, '');
    return raw ? `@${raw.toLowerCase()}` : '';
  };
  if (who && t && who.localeCompare(t, undefined, { sensitivity: 'accent' }) === 0) {
    return nick() || th;
  }
  if (th && t && th.localeCompare(t, undefined, { sensitivity: 'accent' }) === 0) {
    return nick() || '';
  }
  return th;
}

/** Fila unificada en la lista Mis Tarjetas (Smart + negocio). */
type CardsFeedListItem =
  | ({ kind: 'business' } & BusinessCardListRow)
  | { kind: 'smart'; card: SmartCard };

function cardsFeedItemKey(item: CardsFeedListItem): string {
  return item.kind === 'business' ? `b:${item.bId}` : `s:${item.card.sid}`;
}

function applyCardsManualFeedOrder(feed: CardsFeedListItem[], savedKeys: string[] | null): CardsFeedListItem[] {
  if (!savedKeys?.length) return feed;
  const map = new Map<string, CardsFeedListItem>();
  for (const it of feed) {
    map.set(cardsFeedItemKey(it), it);
  }
  const out: CardsFeedListItem[] = [];
  const used = new Set<string>();
  for (const k of savedKeys) {
    const it = map.get(k);
    if (it) {
      out.push(it);
      used.add(k);
    }
  }
  for (const it of feed) {
    const k = cardsFeedItemKey(it);
    if (!used.has(k)) {
      out.push(it);
      used.add(k);
    }
  }
  return out;
}

type CardSubscriber = CardSubscriberRow;

type EditSlot = {
  id: string;
  index: number;
  item: VaultItem | null;
};

export default function CardsFactoryScreen() {
  const modalFooterBottomPad = useModalFooterBottomPad();
  const safeAreaInsets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const cardsTheme = palette[isDark ? 'dark' : 'light'];
  const router = useRouter();
  const { language } = useLanguage();
  const tr = (es: string, en: string) => trEsEn(es, en, language);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [iconVaultById, setIconVaultById] = useState<Record<string, IconVaultEntry>>({});
  const [smartCards, setSmartCards] = useState<SmartCard[]>([]);
  const [businessCardsFeed, setBusinessCardsFeed] = useState<BusinessCardListRow[]>([]);
  const [selectedCard, setSelectedCard] = useState<SmartCard | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [cardName, setCardName] = useState('');
  const [layoutMode, setLayoutMode] = useState<'vertical' | 'horizontal'>('vertical');
  const [themeId, setThemeId] = useState<string>(DEFAULT_CARD_THEME_ID);
  /** Ancho real del área scroll del modal Temas (evita desfase vs % del modal → 2 columnas). */
  const [themesModalContentW, setThemesModalContentW] = useState<number | null>(null);
  /** Misma fórmula que Locker: 3 tiles por fila según ancho medido o fallback al ancho de pantalla. */
  const themesModalTileWidth = useMemo(() => {
    const boxOuter = Math.min(400, width * 0.92);
    const fallbackInner = Math.max(200, boxOuter - 32);
    const inner = themesModalContentW ?? fallbackInner;
    return computeThemeLockerTileWidth(inner);
  }, [width, themesModalContentW]);
  const [selectedFont, setSelectedFont] = useState<CardFontItem | null>(null);
  const [resolvedFontFamily, setResolvedFontFamily] = useState<string | null>(null);
  const [selectedWallpaper, setSelectedWallpaper] = useState<WallpaperItem | null>(null);
  const [enableParallax, setEnableParallax] = useState(false);
  const [factoryVisible, setFactoryVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshingCards, setRefreshingCards] = useState(false);
  const [slotPickerVisible, setSlotPickerVisible] = useState(false);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewCard, setPreviewCard] = useState<SmartCard | null>(null);
  const [previewBusinessVisible, setPreviewBusinessVisible] = useState(false);
  const [previewBusiness, setPreviewBusiness] = useState<BusinessCardListRow | null>(null);
  const [previewBusinessOwnerUid, setPreviewBusinessOwnerUid] = useState('');
  // Estado para forzar orientación de la tarjeta en preview
  const [previewLayout, setPreviewLayout] = useState<'vertical' | 'horizontal'>('vertical');
  const [dataPopoverVisible, setDataPopoverVisible] = useState(false);
  const [focusedDataItem, setFocusedDataItem] = useState<VaultItem | null>(null);
  const [focusedCertificate, setFocusedCertificate] = useState<VaultCollectibleCertificate | null>(null);
  const [subscribersVisible, setSubscribersVisible] = useState(false);
  const [subscribersLoading, setSubscribersLoading] = useState(false);
  const [subscribersCard, setSubscribersCard] = useState<SmartCard | null>(null);
  const [subscribersBusinessRow, setSubscribersBusinessRow] = useState<BusinessCardListRow | null>(null);
  const [subscribers, setSubscribers] = useState<CardSubscriber[]>([]);
  const [qrVisible, setQrVisible] = useState(false);
  const [qrBusinessContext, setQrBusinessContext] = useState<null | {
    bId: string;
    bcName: string;
    bcContactName: string;
    uid: string;
    bcLogoUrl: string | null;
  }>(null);
  // Limit Reached Modal States
  const [limitReachedVisible, setLimitReachedVisible] = useState(false);
  const [limitCardCount, setLimitCardCount] = useState(0);
  const [limitMaxCards, setLimitMaxCards] = useState(5);
  const [isCardsUnlocked, setIsCardsUnlocked] = useState(false);
  const [dataSelectorVisible, setDataSelectorVisible] = useState(false);
  const [dataSelectorLimitReached, setDataSelectorLimitReached] = useState(false);
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>([]);
  const [dataSelectorQuery, setDataSelectorQuery] = useState('');
  const [dataSelectorSort, setDataSelectorSort] = useState<'recent' | 'alpha'>('recent');
  const [themesPlaceholderVisible, setThemesPlaceholderVisible] = useState(false);
  const [qrToken, setQrToken] = useState('');
  /** Si no está vacío, el QR codifica esta URL web (acceso universal 24h); si no, JSON in-app (`qrToken`). */
  const [qrUniversalWebUrl, setQrUniversalWebUrl] = useState('');
  const [qrExpiresAt, setQrExpiresAt] = useState<number>(0);
  const [qrWindowMs, setQrWindowMs] = useState(60000);
  /** Tarjeta a la que aplica el QR activo (dinámico o web 24h); bloquea otra emisión hasta `qrExpiresAt`. */
  const [qrActiveSid, setQrActiveSid] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [issuingQr, setIssuingQr] = useState(false);
  const [issuingUniversalLink, setIssuingUniversalLink] = useState(false);
  /** UID de la sesión en Mis Tarjetas (QR permanente en filas de negocio). */
  const [sessionUid, setSessionUid] = useState<string | null>(null);
  const [cardSlotCaps, setCardSlotCaps] = useState<{
    smartCurrent: number;
    smartMax: number;
    businessUsed: number;
    businessMax: number;
  } | null>(null);
  const [cardSearchQuery, setCardSearchQuery] = useState('');
  const [cardStatsVisible, setCardStatsVisible] = useState(false);
  const [cardStatsTarget, setCardStatsTarget] = useState<SmartCard | null>(null);
  const [cardStatsLoading, setCardStatsLoading] = useState(false);
  const [cardStatsData, setCardStatsData] = useState<{
    totalViews: number;
    topIcons: Array<{ iconType: string; count: number }>;
  } | null>(null);
  const [manualFeedOrderKeys, setManualFeedOrderKeys] = useState<string[]>([]);
  const [cardsReorderMode, setCardsReorderMode] = useState(false);
  const [reorderDraftData, setReorderDraftData] = useState<CardsFeedListItem[]>([]);
  const enterCardsReorderRef = useRef<(() => void) | null>(null);
  const [rotateHintVisible, setRotateHintVisible] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  /** Una sola raíz de identidad del emisor (Firestore `users/{uid}`), no variables paralelas. */
  const [issuerIdentity, setIssuerIdentity] = useState<CanonicalIssuerIdentity>(() =>
    emptyCanonicalIssuerIdentity(''),
  );
  const parallaxX = useRef(new Animated.Value(0)).current;
  const parallaxY = useRef(new Animated.Value(0)).current;
  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** `react-native-qrcode-svg` pasa el ref al `Svg` de react-native-svg (`toDataURL` → PNG). */
  const permanentBusinessQrSvgRef = useRef<{
    toDataURL?: (cb: (dataUrl: string) => void) => void;
  } | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerItem, setViewerItem] = useState<VaultItem | null>(null);
  const swipeableMethodsByCardIdRef = useRef<Map<string, SwipeableMethods>>(new Map());
  const subscriberSwipeableMethodsRef = useRef<Map<string, SwipeableMethods>>(new Map());

  const closeAllCardSwipes = useCallback(() => {
    for (const m of swipeableMethodsByCardIdRef.current.values()) {
      m.close();
    }
    for (const m of subscriberSwipeableMethodsRef.current.values()) {
      m.close();
    }
  }, []);

  useEffect(() => {
    if (!subscribersVisible) {
      subscriberSwipeableMethodsRef.current.clear();
    }
  }, [subscribersVisible]);

  /** Tras cerrar selector de datos / temas, reabrir el factory si estaba abierto (evita 2 Modals superpuestos en Android). */
  const resumeFactoryAfterAuxModalRef = useRef(false);

  const restoreFactoryAfterAuxModal = () => {
    if (!resumeFactoryAfterAuxModalRef.current) {
      return;
    }
    resumeFactoryAfterAuxModalRef.current = false;
    setFactoryVisible(true);
  };

  const { unlockedIds, refreshThemes } = useActiveTheme();

  const isChestThemeUnlocked = (t: ChestCardTheme) => !t.locked || unlockedIds.has(t.id);

  const loadOwnerProfile = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      return;
    }
    const authFallback = user.displayName
      ? user.displayName
      : user.email
        ? String(user.email).split('@')[0]
        : `user_${String(user.uid).slice(0, 6)}`;
    try {
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      const userData = userSnap.data() as Record<string, unknown> | undefined;
      setIssuerIdentity(
        buildCanonicalIssuerIdentityFromFirestore({
          uid: user.uid,
          userDoc: userData,
          authDisplayNameFallback: authFallback,
          authPhotoUrlFallback: user.photoURL,
        }),
      );
    } catch {
      setIssuerIdentity(
        buildCanonicalIssuerIdentityFromFirestore({
          uid: user.uid,
          userDoc: undefined,
          authDisplayNameFallback: authFallback,
          authPhotoUrlFallback: user.photoURL,
        }),
      );
    }
  }, []);

  const refreshCardSlotCaps = useCallback(async () => {
    const uid = await getActiveUserId();
    if (!uid) {
      setCardSlotCaps(null);
      return;
    }
    try {
      const [v, slots] = await Promise.all([validateCardCreation(uid), getBusinessCardSlotAvailability(uid)]);
      setCardSlotCaps({
        smartCurrent: v.currentCount,
        smartMax: v.maxLimit,
        businessUsed: slots.used,
        businessMax: slots.max,
      });
    } catch {
      setCardSlotCaps(null);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const verifyAccess = async () => {
        const authenticated = await hardLockCheck(tr('acceso a Business Cards', 'access to Business Cards'));
        setIsCardsUnlocked(authenticated);
        if (!authenticated) {
          setSessionUid(null);
          setCardSlotCaps(null);
          return;
        }

        const uid = await getActiveUserId();
        setSessionUid(uid ?? null);
        if (uid) {
          void refreshCardSlotCaps();
        } else {
          setCardSlotCaps(null);
        }

        void refreshThemes();

        InteractionManager.runAfterInteractions(() => {
          void loadOwnerProfile();
          loadVaultItems();
          loadSmartCards();
          void loadBusinessCardsFeed();
        });
      };

      void verifyAccess();
    }, [refreshThemes, loadOwnerProfile, refreshCardSlotCaps])
  );

  useEffect(() => {
    void loadOwnerProfile();
    loadVaultItems();
    loadSmartCards();
  }, [loadOwnerProfile]);

  useEffect(() => {
    if (!enableParallax) {
      Animated.spring(parallaxX, { toValue: 0, useNativeDriver: true }).start();
      Animated.spring(parallaxY, { toValue: 0, useNativeDriver: true }).start();
      return;
    }

    Gyroscope.setUpdateInterval(45);
    const sub = Gyroscope.addListener((g) => {
      const tx = Math.max(-8, Math.min(8, g.y * 16));
      const ty = Math.max(-8, Math.min(8, g.x * 16));
      Animated.timing(parallaxX, {
        toValue: tx,
        duration: 70,
        useNativeDriver: true,
      }).start();
      Animated.timing(parallaxY, {
        toValue: ty,
        duration: 70,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      sub.remove();
      Animated.spring(parallaxX, { toValue: 0, useNativeDriver: true }).start();
      Animated.spring(parallaxY, { toValue: 0, useNativeDriver: true }).start();
    };
  }, [enableParallax, parallaxX, parallaxY]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void loadOwnerProfile();
        loadVaultItems();
        void loadSmartCards();
        void loadBusinessCardsFeed();
      }
    });
    return () => {
      sub.remove();
    };
  }, [loadOwnerProfile]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(VAULT_LINK_SAVED_EVENT, () => {
      refreshCardsTabFromServer();
      void loadVaultItems();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!qrVisible || qrExpiresAt <= 0) {
      setRemainingSec(0);
      if (qrTimerRef.current) {
        clearInterval(qrTimerRef.current);
        qrTimerRef.current = null;
      }
      return;
    }

    const tick = () => {
      const remainingMs = Math.max(0, qrExpiresAt - Date.now());
      setRemainingMs(remainingMs);
      const nextRemainingSec = Math.ceil(remainingMs / 1000);
      setRemainingSec(nextRemainingSec);
      if (remainingMs <= 0) {
        setQrActiveSid(null);
        if (qrTimerRef.current) {
          clearInterval(qrTimerRef.current);
          qrTimerRef.current = null;
        }
      }
    };

    tick();
    qrTimerRef.current = setInterval(tick, 250);

    return () => {
      if (qrTimerRef.current) {
        clearInterval(qrTimerRef.current);
        qrTimerRef.current = null;
      }
    };
  }, [qrVisible, qrExpiresAt]);

  const loadVaultItems = useCallback(async () => {
    try {
      const uid = await getActiveUserId();
      if (!uid) {
        setVaultItems([]);
        setIconVaultById({});
        return;
      }
      const snap = await loadVaultSnapshotForSlotSync(uid);
      setVaultItems(snap.vaultItems);
      setIconVaultById(snap.iconVaultById);
    } catch {
      // Do NOT wipe existing vaultItems on a transient error.
      // A failed reload (network blip, Firestore timeout) would otherwise clear
      // correctly-cached items and cause the preview to render empty slots.
    }
  }, []);

  const loadSmartCards = async (): Promise<SmartCard[]> => {
    const uid = await getActiveUserId();
    if (!uid) {
      setSmartCards([]);
      setCardSlotCaps(null);
      return [];
    }

    let lastList: SmartCard[] = [];
    try {
      const raw = await readSmartCardsJsonWithLegacyMigration(uid);
      const cached = raw ? (JSON.parse(raw) as SmartCard[]) : [];
      lastList = dedupeSmartCardsBySid(
        cached.map((card) => {
          const row = card as SmartCard & { id?: string };
          const sid = String(row.sid || row.id || '').trim();
          const next = { ...row, sid, isFavorite: Boolean(card.isFavorite) } as SmartCard & { id?: string };
          delete next.id;
          return next as SmartCard;
        }),
      );
      if (lastList.length > 0) {
        setSmartCards(lastList);
      }
    } catch {
      /* ignora — la nube actualiza a continuación */
    }

    try {
      const remote = await listSmartCardsFromDb({ uid: uid });
      const smartOnly = remote.cards.filter((c) => (c.cardType || 'smart') !== 'business');
      const mapped = smartOnly.map((card) => ({
        sid: String(card.sid || ''),
        scName: card.scName,
        layout: card.layout,
        themeId: card.themeId || DEFAULT_CARD_THEME_ID,
        fontId: card.fontId,
        fontName: card.fontName,
        fontFamily: card.fontFamily,
        fontTier: card.fontTier,
        wallpaperId: card.wallpaperId,
        wallpaperUrl: card.wallpaperUrl,
        wallpaperThumbUrl: card.wallpaperThumbUrl,
        wallpaperTier: card.wallpaperTier,
        wallpaperPriceCredits: Number(card.wallpaperPriceCredits || 0),
        enableParallax: Boolean(card.enableParallax),
        isFavorite: Boolean(card.isFavorite),
        itemIds: Array.isArray(card.itemIds) ? card.itemIds : [],
        holdersCount: Number(card.holdersCount || 0),
        ratingAvg: Number(card.ratingAvg || 5),
        totalRatings: Number(card.totalRatings ?? 0),
        searchFacets: card.searchFacets,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
        ownerDisplayName: card.ownerDisplayName ? String(card.ownerDisplayName).trim() : undefined,
        issuerSnapshot: card.issuerSnapshot,
      }));

      const dedupedRaw = dedupeSmartCardsBySid(mapped);

      /**
       * Edge-case: el API puede devolver `itemIds: []` en una ventana de tiempo
       * justo después de un `persistCards` (race entre escritura y lectura en Mongo).
       * Si el caché local tiene `itemIds` no vacíos para esa tarjeta, los preservamos
       * para evitar que el preview y los slots queden vacíos mientras la BD se
       * estabiliza. El caché ya contiene los IDs correctos porque `persistCards`
       * los escribió en AsyncStorage antes de llamar al API.
       */
      const localBySid = new Map(lastList.map((c) => [c.sid, c]));
      const deduped = dedupedRaw.map((serverCard) => {
        if (serverCard.itemIds.length === 0) {
          const local = localBySid.get(serverCard.sid);
          if (local && local.itemIds.length > 0) {
            return { ...serverCard, itemIds: [...local.itemIds] };
          }
        }
        return serverCard;
      });

      /**
       * Reconciliación local → Mongo. Si el caché local tiene sids que no
       * aparecen en el backend, significa que un `persistCards` anterior
       * falló silenciosamente (ej. token expirado, 5xx) y las cards quedaron
       * sólo en AsyncStorage. Hacemos un force-upsert de cada card huérfana
       * para que la BD recupere el estado del dispositivo. Es idempotente:
       * si la card ya existe en Mongo con mismo `sid`, `findOneAndUpdate`
       * simplemente refresca `updatedAt`.
       */
      const remoteSids = new Set(deduped.map((c) => c.sid));
      const orphanLocal = lastList.filter((c) => c.sid && !remoteSids.has(c.sid));
      if (orphanLocal.length > 0) {
        console.log('[Card] loadSmartCards: reconciling', orphanLocal.length, 'local-only cards');
        for (const card of orphanLocal) {
          try {
            await upsertSmartCardInDb({
              uid,
              card: buildSmartCardDbPayload(card, undefined, uid),
            });
            deduped.push(card);
          } catch (reconErr: unknown) {
            const anyErr = reconErr as { response?: { status?: number }; message?: string };
            console.log(
              '[Card] loadSmartCards: reconcile FAILED sid=',
              card.sid,
              anyErr?.response?.status ?? '?',
              anyErr?.message || reconErr,
            );
          }
        }
      }

      setSmartCards(deduped);
      await AsyncStorage.setItem(smartCardsStorageKey(uid), JSON.stringify(deduped));
      void refreshCardSlotCaps();
      return deduped;
    } catch (remoteErr) {
      /**
       * Antes este catch era silencioso (`catch {}`) por lo que nunca sabíamos
       * por qué el backend "no devolvía nada". Ahora dejamos traza explícita
       * para poder diagnosticar fallos de auth/JWT en un segundo.
       */
      console.log('[Card] loadSmartCards: remote FAILED', (remoteErr as { message?: string })?.message || remoteErr);
      void refreshCardSlotCaps();
      return lastList;
    }
  };

  const loadBusinessCardsFeed = async (): Promise<BusinessCardListRow[]> => {
    const uid = await getActiveUserId();
    if (!uid) {
      setBusinessCardsFeed([]);
      setCardSlotCaps(null);
      return [];
    }
    const cacheKey = businessCardsFeedStorageKey(uid);
    let lastList: BusinessCardListRow[] = [];
    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      const cached = parseBusinessCardsFeedCache(raw);
      lastList = cached;
      if (lastList.length > 0) {
        setBusinessCardsFeed(lastList);
      }
    } catch {
      lastList = [];
    }

    try {
      const docs = await listMyBusinessCards(uid);
      const rows = docs
        .map(toBusinessCardListRow)
        .sort((a, b) => b.createdAtMs - a.createdAtMs);

      // Authoritative holdersCount from share_permissions (MongoDB via backend).
      const bIds = rows.map((r) => r.bId);
      if (bIds.length) {
        try {
          const counts = await fetchBusinessCardHolderCounts({ uid, keys: bIds });
          for (const r of rows) {
            if (counts[r.bId] !== undefined) {
              r.holdersCount = counts[r.bId];
            }
          }
        } catch {
          /* fallback al valor denormalizado del doc */
        }
      }
      setBusinessCardsFeed(rows);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(rows));
      void refreshCardSlotCaps();
      return rows;
    } catch {
      if (lastList.length > 0) {
        setBusinessCardsFeed(lastList);
        void refreshCardSlotCaps();
        return lastList;
      }
      setBusinessCardsFeed([]);
      void refreshCardSlotCaps();
      return [];
    }
  };

  /** Otro dispositivo puede haber guardado en la nube: vuelve a leer sin cambiar de pestaña. */
  const refreshCardsTabFromServer = () => {
    InteractionManager.runAfterInteractions(() => {
      void loadSmartCards();
      void loadBusinessCardsFeed();
    });
  };

  const closeFactoryModalAndSync = () => {
    Keyboard.dismiss();
    InteractionManager.runAfterInteractions(() => {
      setFactoryVisible(false);
      void loadSmartCards();
      void loadBusinessCardsFeed();
    });
  };

  /** Payload para `smart_cards` en Mongo (incl. `publicCardSlots` que consume la web del QR24h). */
  const buildSmartCardDbPayload = (
    card: SmartCard,
    vaultSnap?: { vaultItems: VaultItem[]; iconVaultById: Record<string, IconVaultEntry> },
    ownerUid?: string | null,
  ): SmartCardPayload => {
    const vItems = vaultSnap?.vaultItems ?? vaultItems;
    const vIcons = vaultSnap?.iconVaultById ?? iconVaultById;
    const searchFacets = buildSearchFacetsForSharedCard(vItems, card.itemIds);
    const occ = deriveOwnerOccupationFromFacets(searchFacets).trim();
    const publicCardSlots = buildPublicCardSlotsForPersist(vItems, card.itemIds, vIcons);
    const ownerUidTrim = String(ownerUid || '').trim();
    return {
      sid: card.sid,
      cardType: 'smart' as const,
      scName: card.scName,
      layout: card.layout,
      themeId: card.themeId || DEFAULT_CARD_THEME_ID,
      fontId: card.fontId,
      fontName: card.fontName,
      fontFamily: card.fontFamily,
      fontTier: card.fontTier,
      wallpaperId: card.wallpaperId,
      wallpaperUrl: card.wallpaperUrl,
      wallpaperThumbUrl: card.wallpaperThumbUrl,
      wallpaperTier: card.wallpaperTier,
      wallpaperPriceCredits: Number(card.wallpaperPriceCredits || 0),
      enableParallax: Boolean(card.enableParallax),
      isFavorite: Boolean(card.isFavorite),
      itemIds: card.itemIds,
      holdersCount: Number(card.holdersCount || 0),
      ratingAvg: Number(card.ratingAvg || 5),
      ownerDisplayName: (issuerIdentity.userFullName || '').trim() || undefined,
      ownerNickname: (issuerIdentity.userNickName || '').trim() || undefined,
      ownerPhotoUrl: issuerIdentity.userAvatarUrl,
      ownerOccupation: occ || undefined,
      searchFacets,
      publicCardSlots,
      ...(ownerUidTrim
        ? {
            issuerSnapshot: buildIssuerSnapshotFromPublicSlots({
              uid: ownerUidTrim,
              userFullName: (issuerIdentity.userFullName || '').trim(),
              userNickName: (issuerIdentity.userNickName || '').trim(),
              userAvatarUrl: issuerIdentity.userAvatarUrl ?? null,
              publicCardSlots,
              itemIds: card.itemIds,
            }),
          }
        : {}),
    };
  };

  const persistCards = async (nextCards: SmartCard[], changedCardIds?: string[]) => {
    console.log('[Card] persistCards: INICIO');
    const normalized = dedupeSmartCardsBySid(nextCards);
    setSmartCards(normalized);

    console.log('[Card] persistCards: Antes de getActiveUserId');
    const uid = await getActiveUserId();
    console.log('[Card] persistCards: Después de getActiveUserId', uid);

    console.log('[Card] persistCards: Antes de AsyncStorage.setItem');
    if (uid) {
      await AsyncStorage.setItem(smartCardsStorageKey(uid), JSON.stringify(normalized));
    }
    console.log('[Card] persistCards: Después de AsyncStorage.setItem');

    try {
      if (!uid) {
        return;
      }

      const cardsToSync = changedCardIds
        ? nextCards.filter((c) => changedCardIds.includes(c.sid))
        : nextCards;

      const failures: Array<{ sid: string; message: string }> = [];
      for (const card of cardsToSync) {
        console.log('[Card] persistCards: Antes de upsertSmartCardInDb', card.sid);
        try {
          await upsertSmartCardInDb({
            uid: uid,
            card: buildSmartCardDbPayload(card, undefined, uid),
          });
          console.log('[Card] persistCards: Después de upsertSmartCardInDb', card.sid);
        } catch (cardErr: unknown) {
          /**
           * Antes este catch vivía fuera del loop y silenciaba cualquier fallo
           * devolviendo la card a AsyncStorage sin avisar — por eso las cards
           * "existían" en la app pero nunca aparecían en Mongo. Ahora reportamos
           * cada sid fallido con el mensaje real (status HTTP + body) y
           * mostramos un Toast rojo para que el usuario pueda actuar en vez de
           * descubrirlo horas después mirando la consola.
           */
          const anyErr = cardErr as { response?: { status?: number; data?: unknown }; message?: string };
          const msg = anyErr?.response
            ? `HTTP ${anyErr.response.status ?? '?'} ${JSON.stringify(anyErr.response.data ?? {}).slice(0, 200)}`
            : anyErr?.message || String(cardErr);
          console.log('[Card] persistCards: ERROR upsert sid=', card.sid, msg);
          failures.push({ sid: card.sid, message: msg });
        }
      }
      if (failures.length > 0) {
        Toast.show({
          type: 'error',
          text1: tr('Sync fallida', 'Sync failed'),
          text2: tr(
            `No se pudieron guardar ${failures.length} tarjeta(s) en el servidor`,
            `Could not save ${failures.length} card(s) on the server`,
          ),
          visibilityTime: 5000,
        });
      }
    } catch (e) {
      console.log('[Card] persistCards: ERROR global', e);
      Toast.show({
        type: 'error',
        text1: tr('Error al sincronizar tarjetas', 'Failed to sync cards'),
        text2: String((e as { message?: string })?.message || e),
        visibilityTime: 5000,
      });
    }
    console.log('[Card] persistCards: FIN');
  };

  const searchFacetRepairInFlightRef = useRef(false);
  const searchFacetRepairAttemptRef = useRef<{ uid: string | null; attempted: boolean }>({
    uid: null,
    attempted: false,
  });

  useEffect(() => {
    if (searchFacetRepairInFlightRef.current) {
      return;
    }
    if (!smartCards.length || !vaultItems.length) {
      return;
    }
    const ids = smartCards
      .filter(
        (c) =>
          c.itemIds.length > 0 && (!c.searchFacets || c.searchFacets.length === 0),
      )
      .map((c) => c.sid);
    if (!ids.length) {
      return;
    }
    void (async () => {
      const uid = await getActiveUserId();
      if (!uid) {
        return;
      }
      const state = searchFacetRepairAttemptRef.current;
      if (state.uid !== uid) {
        searchFacetRepairAttemptRef.current = { uid: uid, attempted: false };
      } else if (state.attempted) {
        return;
      }
      searchFacetRepairInFlightRef.current = true;
      try {
        searchFacetRepairAttemptRef.current = {
          uid: uid,
          attempted: true,
        };
        await persistCards(smartCards, ids);
        await loadSmartCards();
      } finally {
        searchFacetRepairInFlightRef.current = false;
      }
    })();
  }, [smartCards, vaultItems]);

  const resetFactory = () => {
    setCardName('');
    setSelectedItemIds([]);
    setLayoutMode('vertical');
    setThemeId(DEFAULT_CARD_THEME_ID);
    setSelectedWallpaper(null);
    setSelectedFont(null);
    setResolvedFontFamily(null);
    setEnableParallax(false);
    setSelectedCard(null);
  };

  const openCreateFactory = async () => {
    try {
      const userId = await getActiveUserId();
      if (!userId) {
        Alert.alert(tr('Error', 'Error'), tr('No se pudo validar tu sesión.', 'Could not validate your session.'));
        return;
      }

      // Validate card creation limits
      const validation = await validateCardCreation(userId);
      
      if (!validation.canCreate) {
        setLimitCardCount(validation.currentCount);
        setLimitMaxCards(validation.maxLimit);
        setLimitReachedVisible(true);
        return;
      }

      // Can create - proceed normally
      resetFactory();
      setFactoryVisible(true);
    } catch (error) {
      console.error('Error validating card creation:', error);
      Alert.alert(tr('Error', 'Error'), tr('No se pudo validar disponibilidad.', 'Could not validate availability.'));
    }
  };

  const openEditFactory = (card: SmartCard) => {
    setSelectedCard(card);
    setCardName(card.scName);
    setLayoutMode(card.layout);
    setThemeId(card.themeId || DEFAULT_CARD_THEME_ID);
    setEnableParallax(Boolean(card.enableParallax));
    setResolvedFontFamily(card.fontFamily || null);
    setSelectedFont(
      card.fontId
        ? {
            id: card.fontId,
            /** Etiqueta del pack tipográfico (no es `scName` de la tarjeta). */
            name: String(card.fontName || card.fontId || '').trim() || 'font',
            family: card.fontFamily || `font-${card.fontId}`,
            tier: card.fontTier || 'free',
            fileUrl: '',
          }
        : null
    );
    setSelectedWallpaper(
      card.wallpaperUrl
        ? {
            id: card.wallpaperId || `custom-${card.sid}`,
            name: String(card.wallpaperId || `custom-${card.sid}`).trim() || 'wallpaper',
            orientation: card.layout,
            tier: card.wallpaperTier || 'free',
            fullUrl: card.wallpaperUrl,
            thumbnailUrl: card.wallpaperThumbUrl || card.wallpaperUrl,
            priceCredits: Number(card.wallpaperPriceCredits || 0),
          }
        : null
    );
    setSelectedItemIds(card.itemIds);
    setFactoryVisible(true);
  };

  const MAX_CARD_SLOTS = 12;

  const removeSlotItem = (slotIndex: number) => {
    setSelectedItemIds((prev) => prev.filter((_, index) => index !== slotIndex));
  };

  const openSlotPicker = (slotIndex: number) => {
    setActiveSlotIndex(slotIndex);
    setSlotPickerVisible(true);
  };

  const assignVaultItemToSlot = (itemId: string) => {
    if (activeSlotIndex === null) {
      return;
    }

    setSelectedItemIds((prev) => {
      const next = [...prev];
      const existingIndex = next.indexOf(itemId);
      if (existingIndex !== -1) {
        next.splice(existingIndex, 1);
      }

      if (activeSlotIndex >= next.length) {
        next.push(itemId);
      } else {
        next[activeSlotIndex] = itemId;
      }

      return next.slice(0, MAX_CARD_SLOTS);
    });

    setSlotPickerVisible(false);
    setActiveSlotIndex(null);
  };

  const handleSaveCard = async () => {
    if (isSaving) return;

    if (!cardName.trim()) {
      Alert.alert(tr('Nombre requerido', 'Name required'), tr('Dale un nombre a tu Smart Card.', 'Give your Smart Card a name.'));
      return;
    }

    const normalizedCardName = cardName.trim().toLowerCase();
    const duplicatedName = smartCards.some((card) => {
      if (selectedCard && card.sid === selectedCard.sid) {
        return false;
      }
      return String(card.scName || '').trim().toLowerCase() === normalizedCardName;
    });

    if (duplicatedName) {
      Alert.alert(
        tr('Nombre duplicado', 'Duplicate name'),
        tr('Ya tienes una tarjeta con ese nombre. Usa un nombre distinto.', 'You already have a card with that name. Use a different name.')
      );
      return;
    }

    const normalizedItemIds = selectedItemIds
      .filter((id) => vaultItems.some((vi) => vi.id === id))
      .slice(0, MAX_CARD_SLOTS);

    if (normalizedItemIds.length === 0) {
      Alert.alert(tr('Sin datos', 'No data'), tr('Selecciona al menos un dato del Vault para tu tarjeta.', 'Select at least one Vault item for your card.'));
      return;
    }

    setIsSaving(true);

    try {
      const nowIso = new Date().toISOString();

      if (selectedCard) {
        const nextCards = smartCards.map((card) =>
          card.sid === selectedCard.sid
            ? {
                ...card,
                scName: cardName.trim(),
                layout: 'vertical' as const,
                themeId,
                fontId: selectedFont?.id,
                fontName: selectedFont?.name,
                fontFamily: resolvedFontFamily || selectedFont?.family,
                fontTier: selectedFont?.tier,
                wallpaperId: selectedWallpaper?.id,
                wallpaperUrl: selectedWallpaper?.fullUrl,
                wallpaperThumbUrl: selectedWallpaper?.thumbnailUrl,
                wallpaperTier: selectedWallpaper?.tier,
                wallpaperPriceCredits: Number(selectedWallpaper?.priceCredits || 0),
                enableParallax,
                itemIds: normalizedItemIds,
                updatedAt: nowIso,
              }
            : card
        );
        await persistCards(nextCards as SmartCard[], [selectedCard.sid]);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Toast.show({
          type: 'success',
          text1: tr('Cambio exitoso', 'Change saved'),
          text2: tr('La tarjeta se actualizo correctamente.', 'The card was updated successfully.'),
          position: 'bottom',
          visibilityTime: 2200,
        });
        setFactoryVisible(false);
        // Recargar desde el servidor para actualizar issuerSnapshot.userVaultPicked.
        // Así la próxima apertura del preview tiene el snapshot correcto incluso si
        // la bóveda tarda en cargar (fallback a issuerSnapshot).
        InteractionManager.runAfterInteractions(() => {
          void loadSmartCards();
        });
        return;
      }

      const newCard: SmartCard = {
        sid: createSmartCardId(),
        scName: cardName.trim(),
        layout: 'vertical',
        themeId,
        fontId: selectedFont?.id,
        fontName: selectedFont?.name,
        fontFamily: resolvedFontFamily || selectedFont?.family,
        fontTier: selectedFont?.tier,
        wallpaperId: selectedWallpaper?.id,
        wallpaperUrl: selectedWallpaper?.fullUrl,
        wallpaperThumbUrl: selectedWallpaper?.thumbnailUrl,
        wallpaperTier: selectedWallpaper?.tier,
        wallpaperPriceCredits: Number(selectedWallpaper?.priceCredits || 0),
        enableParallax,
        isFavorite: false,
        itemIds: normalizedItemIds,
        holdersCount: 0,
        ratingAvg: 5,
        totalRatings: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await persistCards([newCard, ...smartCards], [newCard.sid]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({
        type: 'success',
        text1: tr('Cambio exitoso', 'Change saved'),
        text2: tr('La tarjeta se guardo correctamente.', 'The card was saved successfully.'),
        position: 'bottom',
        visibilityTime: 2200,
      });
      setFactoryVisible(false);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCard = async (card: SmartCard) => {
    const nextCards = smartCards.filter((item) => item.sid !== card.sid);
    await persistCards(nextCards);

    try {
      const uid = await getActiveUserId();
      if (uid) {
        await deleteSmartCardInDb({ uid: uid, cardRef: card.sid });
      }
    } catch {
      // Local state already updated.
    }

    if (selectedCard?.sid === card.sid) {
      setSelectedCard(null);
    }
  };

  const toggleFavoriteCard = async (card: SmartCard) => {
    const nextCards = smartCards.map((entry) =>
      entry.sid === card.sid
        ? {
            ...entry,
            isFavorite: !entry.isFavorite,
            updatedAt: new Date().toISOString(),
          }
        : entry
    );
    await persistCards(nextCards);
  };

  const updateCardItemIds = async (card: SmartCard, nextItemIds: string[]) => {
    const normalized = nextItemIds.filter(Boolean).slice(0, MAX_CARD_SLOTS);
    const nowIso = new Date().toISOString();

    const nextCards = smartCards.map((entry) =>
      entry.sid === card.sid
        ? {
            ...entry,
            itemIds: normalized,
            updatedAt: nowIso,
          }
        : entry
    );

    await persistCards(nextCards);
    const refreshed = nextCards.find((entry) => entry.sid === card.sid) || null;
    setPreviewCard(refreshed);
    setSelectedCard(refreshed);
  };

  const openEditOnSpecificSlot = (card: SmartCard, slotIndex: number) => {
    setPreviewVisible(false);
    openEditFactory(card);
    setTimeout(() => {
      setActiveSlotIndex(slotIndex);
      setSlotPickerVisible(true);
    }, 220);
  };

  const openAddDataFlowFromPreview = (card: SmartCard) => {
    const targetIndex = Math.min(card.itemIds.length, Math.max(0, MAX_CARD_SLOTS - 1));
    openEditOnSpecificSlot(card, targetIndex);
  };

  const openDataSelector = () => {
    const validIds = selectedItemIds.filter((id) => vaultItems.some((vi) => vi.id === id));
    setTempSelectedIds(validIds);
    setDataSelectorLimitReached(false);
    setDataSelectorQuery('');
    resumeFactoryAfterAuxModalRef.current = factoryVisible;
    if (factoryVisible) {
      setFactoryVisible(false);
    }
    requestAnimationFrame(() => {
      setDataSelectorVisible(true);
    });
  };

  const handleSelectorToggle = (itemId: string) => {
    if (tempSelectedIds.includes(itemId)) {
      setTempSelectedIds((prev) => prev.filter((id) => id !== itemId));
      setDataSelectorLimitReached(false);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      if (tempSelectedIds.length >= MAX_CARD_SLOTS) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setDataSelectorLimitReached(true);
        return;
      }
      setTempSelectedIds((prev) => [...prev, itemId]);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const confirmDataSelector = () => {
    setSelectedItemIds(tempSelectedIds.slice(0, MAX_CARD_SLOTS));
    setDataSelectorVisible(false);
    requestAnimationFrame(() => restoreFactoryAfterAuxModal());
  };

  const cancelDataSelector = () => {
    setDataSelectorVisible(false);
    requestAnimationFrame(() => restoreFactoryAfterAuxModal());
  };

  const openDataSelectorSortOptions = () => {
    Alert.alert(
      tr('Ordenar datos', 'Sort data'),
      tr('Elige cómo ver tus datos.', 'Choose how to view your data.'),
      [
        {
          text: tr('Recién agregado', 'Recently added'),
          onPress: () => setDataSelectorSort('recent'),
        },
        {
          text: tr('Alfabético', 'Alphabetical'),
          onPress: () => setDataSelectorSort('alpha'),
        },
        {
          text: tr('Cancelar', 'Cancel'),
          style: 'cancel',
        },
      ],
    );
  };

  const closeThemesPickerModal = () => {
    setThemesPlaceholderVisible(false);
    void (async () => {
      try {
        /**
         * Antes solo se guardaba `themeId` al pulsar «Guardar» en el factory. Si el usuario
         * elegía tema y «Aceptar» en el modal, Mongo no recibía el cambio → el otro celular
         * seguía viendo el tema viejo en contactos/receptores.
         */
        if (selectedCard) {
          const sid = selectedCard.sid;
          const nextThemeId = themeId;
          const nowIso = new Date().toISOString();
          const nextCards = smartCards.map((c) =>
            c.sid === sid ? { ...c, themeId: nextThemeId, updatedAt: nowIso } : c,
          );
          await persistCards(nextCards, [sid]);
          const merged = nextCards.find((c) => c.sid === sid);
          if (merged) {
            setSelectedCard(merged);
          }
        }
      } finally {
        requestAnimationFrame(() => restoreFactoryAfterAuxModal());
      }
    })();
  };

  const handlePreviewIconLongPress = (slot: EditSlot) => {
    if (!previewCard || !slot.item) {
      return;
    }

    const card = previewCard;
    const currentIds = [...card.itemIds];
    const canMoveBack = slot.index > 0;
    const canMoveForward = slot.index < currentIds.length - 1;

    const onEdit = () => openEditOnSpecificSlot(card, slot.index);
    const onMoveBack = async () => {
      if (!canMoveBack) {
        return;
      }
      const next = [...currentIds];
      [next[slot.index - 1], next[slot.index]] = [next[slot.index], next[slot.index - 1]];
      await updateCardItemIds(card, next);
    };
    const onMoveForward = async () => {
      if (!canMoveForward) {
        return;
      }
      const next = [...currentIds];
      [next[slot.index], next[slot.index + 1]] = [next[slot.index + 1], next[slot.index]];
      await updateCardItemIds(card, next);
    };
    const onDelete = async () => {
      const next = currentIds.filter((_, index) => index !== slot.index);
      await updateCardItemIds(card, next);
    };

    Alert.alert(
      tr('Gestionar icono', 'Manage icon'),
      tr('Elige la acción para este dato de la tarjeta.', 'Choose an action for this card item.'),
      [
        { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        { text: tr('Editar', 'Edit'), onPress: onEdit },
        {
          text: tr('Mover', 'Move'),
          onPress: () => {
            Alert.alert(
              tr('Mover icono', 'Move icon'),
              tr('Selecciona la dirección de movimiento.', 'Choose a direction to move.'),
              [
                { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
                { text: tr('Atrás', 'Back'), onPress: () => { void onMoveBack(); } },
                { text: tr('Adelante', 'Forward'), onPress: () => { void onMoveForward(); } },
              ],
            );
          },
        },
        {
          text: tr('Agregar nuevo dato', 'Add new data'),
          onPress: () => openAddDataFlowFromPreview(card),
        },
        {
          text: tr('Eliminar', 'Delete'),
          style: 'destructive',
          onPress: () => { void onDelete(); },
        },
      ],
    );
  };

  const openBusinessSubscribersModal = async (row: BusinessCardListRow) => {
    try {
      void loadOwnerProfile();
      setSubscribersVisible(true);
      setSubscribersLoading(true);
      setSubscribersBusinessRow(row);
      setSubscribersCard(null);

      const uid = await getActiveUserId();
      if (!uid) throw new Error('No active session.');

      const response = await listCardSubscribers({ uid: uid, cardRef: row.bId });
      setSubscribers(response.subscribers);

      setBusinessCardsFeed((prev) =>
        prev.map((entry) =>
          entry.bId === row.bId ? { ...entry, holdersCount: response.count } : entry
        )
      );
    } catch (error: any) {
      Alert.alert(tr('Error', 'Error'), error?.message || tr('No se pudo cargar receptores.', 'Could not load receptors.'));
      setSubscribers([]);
    } finally {
      setSubscribersLoading(false);
    }
  };

  const openSubscribersModal = async (card: SmartCard) => {
    try {
      void loadOwnerProfile();
      setSubscribersVisible(true);
      setSubscribersLoading(true);
      setSubscribersCard(card);

      const uid = await getActiveUserId();
      if (!uid) {
        throw new Error('No se pudo validar tu sesion.');
      }

      const response = await listCardSubscribers({ uid: uid, cardRef: card.sid });
      setSubscribers(response.subscribers);

      setSmartCards((prev) =>
        prev.map((entry) =>
          entry.sid === card.sid
            ? {
                ...entry,
                holdersCount: response.count,
              }
            : entry
        )
      );
    } catch (error: any) {
      Alert.alert(tr('Error', 'Error'), error?.message || tr('No se pudo cargar la lista de suscriptores.', 'Could not load subscribers list.'));
      setSubscribers([]);
    } finally {
      setSubscribersLoading(false);
    }
  };

  const handleRevokeSubscriber = async (targetUid: string) => {
    if (!subscribersCard) {
      return;
    }

    try {
      const uid = await getActiveUserId();
      if (!uid) {
        throw new Error('No se pudo validar tu sesion.');
      }

      await revokeCardSubscriber({
        uid: uid,
        cardRef: subscribersCard.sid,
        targetUid,
      });

      const nextRows = subscribers.filter((row) => row.uid !== targetUid);
      setSubscribers(nextRows);
      setSmartCards((prev) =>
        prev.map((entry) =>
          entry.sid === subscribersCard.sid
            ? {
                ...entry,
                holdersCount: nextRows.length,
              }
            : entry
        )
      );
    } catch (error: any) {
      Alert.alert(tr('No se pudo eliminar', 'Could not delete'), error?.message || tr('La revocacion fallo.', 'Revocation failed.'));
    }
  };

  const handleBlockSubscriber = async (targetUid: string) => {
    try {
      const uid = await getActiveUserId();
      if (!uid) {
        throw new Error('No se pudo validar tu sesion.');
      }

      await blockRelationship({ uid: uid, targetUid });

      const nextRows = subscribers.filter((row) => row.uid !== targetUid);
      setSubscribers(nextRows);
      if (subscribersCard) {
        setSmartCards((prev) =>
          prev.map((entry) =>
            entry.sid === subscribersCard.sid
              ? {
                  ...entry,
                  holdersCount: nextRows.length,
                }
              : entry
          )
        );
      }
    } catch (error: any) {
      Alert.alert(tr('No se pudo bloquear', 'Could not block'), error?.message || tr('El bloqueo no se pudo completar.', 'Block could not be completed.'));
    }
  };

  const handleMuteSubscriber = async (targetUid: string, nextMuted: boolean) => {
    if (!subscribersCard) {
      return;
    }
    try {
      const uid = await getActiveUserId();
      if (!uid) {
        throw new Error('No se pudo validar tu sesion.');
      }

      await setCardSubscriberMute({
        uid: uid,
        cardRef: subscribersCard.sid,
        targetUid,
        muted: nextMuted,
      });

      setSubscribers((prev) =>
        prev.map((row) => (row.uid === targetUid ? { ...row, muted: nextMuted } : row))
      );
    } catch (error: any) {
      Alert.alert(tr('No se pudo actualizar', 'Could not update'), error?.message || tr('Intenta de nuevo.', 'Try again.'));
    }
  };

  const toggleCardSilence = async (card: SmartCard) => {
    const next = !card.silenced;
    try {
      const uid = await getActiveUserId();
      if (!uid) return;
      await setCardSilenced({ uid: uid, cardRef: card.sid, silenced: next });
      setSmartCards((prev) =>
        prev.map((c) => (c.sid === card.sid ? { ...c, silenced: next } : c)),
      );
    } catch (e: any) {
      Alert.alert(tr('Error', 'Error'), e?.message || tr('No se pudo actualizar.', 'Could not update.'));
    }
  };

  const issueQrForCard = async (card: SmartCard, options?: { forceNew?: boolean }) => {
    try {
      const authenticated = await hardLockCheck(tr('generar QR y compartir tu tarjeta', 'generate QR and share your card'));
      if (!authenticated) {
        return;
      }

      // Mismo QR dinámico (app↔app) aún válido: solo reabrir modal con countdown, sin nueva emisión.
      // forceNew: el usuario eligió "Nuevo QR" dentro del modal y debe recibir un token distinto.
      if (
        !options?.forceNew &&
        qrActiveSid === card.sid &&
        qrExpiresAt > Date.now() &&
        Boolean(qrToken) &&
        !qrUniversalWebUrl
      ) {
        setSelectedCard(card);
        setQrVisible(true);
        return;
      }

      setIssuingQr(true);
      setQrBusinessContext(null);
      setSelectedCard(card);

      const uid = await getActiveUserId();
      if (!uid) {
        throw new Error(tr('No se pudo obtener tu sesión para emitir el QR.', 'Could not get your session to issue the QR.'));
      }

      // Sincroniza smart_cards (themeId + publicCardSlots) antes de emitir el token,
      // igual que el flujo de QR web 24h. Sin esto, el receptor ve la tarjeta vacía
      // o con el tema incorrecto si el documento en MongoDB está desactualizado.
      try {
        const vaultSnap = await loadVaultSnapshotForSlotSync(uid);
        await upsertSmartCardInDb({ uid: uid, card: buildSmartCardDbPayload(card, vaultSnap, uid) });
      } catch {
        // Mejor esfuerzo: el QR se emite igualmente; el receptor verá el snapshot anterior si falla la red.
      }

      const issued = await issueDynamicQrToken({ uid: uid, sid: card.sid });
      const parsedExpiresAt = Date.parse(String(issued.expiresAt || ''));
      const nextExpiresAt = Number.isFinite(parsedExpiresAt)
        ? parsedExpiresAt
        : Date.now() + Math.max(1, Number(issued.ttlSec || 120)) * 1000;
      const visibleWindowMs = Math.max(1000, nextExpiresAt - Date.now());

      // QR payload: JSON opaco para que scan.tsx lo parsee (no una URL)
      const qrJson = JSON.stringify({
        kind: 'cardsocial-qr-v1',
        token: issued.token,
        sid: card.sid,
        bId: null,
        exp: nextExpiresAt,
      });
      setQrUniversalWebUrl('');
      setQrToken(qrJson);
      setQrExpiresAt(nextExpiresAt);
      setQrWindowMs(visibleWindowMs);
      setQrActiveSid(card.sid);
      setQrVisible(true);
    } catch (error: any) {
      const rawMessage = String(error?.message || '');
      const likelyNetworkError =
        /network error/i.test(rawMessage) ||
        /failed to fetch/i.test(rawMessage) ||
        /timeout/i.test(rawMessage);
      const androidLanHintEs =
        Platform.OS === 'android'
          ? '\n• Android: HTTP en la LAN requiere `android.usesCleartextTraffic: true` en app.json y volver a generar el dev client.'
          : '';
      const androidLanHintEn =
        Platform.OS === 'android'
          ? '\n• Android: HTTP over LAN needs `android.usesCleartextTraffic: true` in app.json and a rebuilt dev client.'
          : '';
      const diagnosticMessage = likelyNetworkError
        ? tr(
            `No se pudo conectar al backend de QR.\n\nChecklist rápido:\n• EXPO_PUBLIC_MODERATION_API_URL con IP LAN (no localhost)\n• Backend activo en puerto 4000\n• Móvil y PC en la misma Wi‑Fi\n• EXPO_PUBLIC_MODERATION_GATEWAY_KEY igual a API_GATEWAY_KEY del backend${androidLanHintEs}`,
            `Could not connect to the QR backend.\n\nQuick checklist:\n• EXPO_PUBLIC_MODERATION_API_URL uses LAN IP (not localhost)\n• Backend is running on port 4000\n• Phone and PC are on the same Wi‑Fi\n• EXPO_PUBLIC_MODERATION_GATEWAY_KEY matches backend API_GATEWAY_KEY${androidLanHintEn}`,
          )
        : rawMessage || tr('No se pudo emitir el QR.', 'Could not issue QR.');
      Alert.alert(tr('Error de QR', 'QR error'), diagnosticMessage);
    } finally {
      setIssuingQr(false);
    }
  };

  const openCardAnalytics = (card: SmartCard) => {
    setCardStatsTarget(card);
    setCardStatsVisible(true);
    setCardStatsLoading(true);
    setCardStatsData(null);
    void (async () => {
      try {
        const uid = await getActiveUserId();
        if (!uid) {
          throw new Error(tr('Sin sesión', 'Not signed in'));
        }
        const sum = await getCardAnalyticsSummary({ uid: uid, cardRef: card.sid });
        setCardStatsData({ totalViews: sum.totalViews, topIcons: sum.topIcons });
      } catch {
        setCardStatsData({ totalViews: 0, topIcons: [] });
      } finally {
        setCardStatsLoading(false);
      }
    })();
  };

  const confirmAndIssueQrForCard = (card: SmartCard, options?: { forceNew?: boolean }) => {
    if (issuingQr) {
      return;
    }
    Alert.alert(
      tr('Crear QR', 'Create QR'),
      tr(
        `¿Deseas generar el QR de la tarjeta "${card.scName}"?`,
        `Do you want to generate the QR for card "${card.scName}"?`
      ),
      [
        { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        {
          text: tr('Aceptar', 'Accept'),
          onPress: () => {
            void issueQrForCard(card, options);
          },
        },
      ]
    );
  };

  /** QR web ~24h: si ya hay uno vigente para esta tarjeta, solo muestra modal + countdown; si no, lo crea. */
  const openOrCreateUniversalQrForCard = async (card: SmartCard) => {
    if (issuingUniversalLink) return;

    const universalStillValid =
      qrActiveSid === card.sid && qrExpiresAt > Date.now() && Boolean(qrUniversalWebUrl);

    if (universalStillValid) {
      setQrBusinessContext(null);
      setSelectedCard(card);
      setQrVisible(true);
      void (async () => {
        try {
          const uid = await getActiveUserId();
          if (uid) {
            const snap = await loadVaultSnapshotForSlotSync(uid);
            await upsertSmartCardInDb({ uid, card: buildSmartCardDbPayload(card, snap, uid) });
          }
        } catch {
          // Mejor esfuerzo: el enlace ya existía; la web puede seguir mostrando un snapshot antiguo si falla la red.
        }
      })();
      return;
    }

    try {
      const authenticated = await hardLockCheck(tr('generar QR 24 Hr', 'generate QR 24h'));
      if (!authenticated) return;
      const uid = await getActiveUserId();
      if (!uid) throw new Error(tr('No se pudo obtener tu sesión.', 'Could not get your session.'));

      const cached = await readUniversal24hQrCache(uid, card.sid);
      if (cached) {
        setQrBusinessContext(null);
        setSelectedCard(card);
        setQrToken('');
        setQrUniversalWebUrl(cached.universalUrl);
        setQrExpiresAt(cached.expiresAt);
        setQrWindowMs(cached.qrWindowMs);
        setQrActiveSid(card.sid);
        setQrVisible(true);
        void (async () => {
          try {
            const snap = await loadVaultSnapshotForSlotSync(uid);
            await upsertSmartCardInDb({ uid: uid, card: buildSmartCardDbPayload(card, snap, uid) });
          } catch {
            /* mejor esfuerzo */
          }
        })();
        return;
      }

      setIssuingUniversalLink(true);
      // Leer Bóveda desde disco (no solo estado React): si no, publicCardSlots podía ir vacío y la web sin iconos.
      const vaultSnap = await loadVaultSnapshotForSlotSync(uid);
      const cardPayload = buildSmartCardDbPayload(card, vaultSnap, uid);
      const slotN = cardPayload.publicCardSlots?.length ?? 0;
      const needN = card.itemIds.length;
      if (needN > 0 && slotN === 0) {
        Toast.show({
          type: 'error',
          text1: tr('No se sincronizaron los datos públicos', 'Public data did not sync'),
          text2: tr(
            'Comprueba conexión, abre Bóveda y vuelve a intentar QR24h.',
            'Check connection, open Vault, then try QR24h again.',
          ),
        });
        return;
      }
      if (needN > 0 && slotN > 0 && slotN < needN) {
        Toast.show({
          type: 'info',
          text1: tr('Sincronización parcial', 'Partial sync'),
          text2: tr(
            `Se enviaron ${slotN} de ${needN} datos a la web. El resto no está en Bóveda local ni en la nube.`,
            `Sent ${slotN} of ${needN} items to the web. The rest are missing locally and in the cloud.`,
          ),
        });
      }
      await upsertSmartCardInDb({ uid: uid, card: cardPayload });
      const result = await issueTemporaryUniversalAccess({ uid: uid, sid: card.sid });
      const url = result.universalUrl;
      if (!url) throw new Error(tr('No se recibió el enlace del servidor.', 'No link received from server.'));
      const parsedExpiresAt = Date.parse(String(result.expiresAt || ''));
      const ttlMs = Math.max(1, Number(result.ttlSec || 86400)) * 1000;
      const nextExpiresAt = Number.isFinite(parsedExpiresAt)
        ? parsedExpiresAt
        : Date.now() + ttlMs;
      const visibleWindowMs = Math.max(1000, nextExpiresAt - Date.now());

      setQrBusinessContext(null);
      setSelectedCard(card);
      setQrToken('');
      setQrUniversalWebUrl(url);
      setQrExpiresAt(nextExpiresAt);
      setQrWindowMs(visibleWindowMs);
      setQrActiveSid(card.sid);
      setQrVisible(true);
      await writeUniversal24hQrCache(uid, card.sid, {
        universalUrl: url,
        expiresAt: nextExpiresAt,
        qrWindowMs: visibleWindowMs,
      });
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (msg && !msg.includes('cancel')) {
        Alert.alert(tr('Error de QR web', 'Web QR error'), msg);
      }
    } finally {
      setIssuingUniversalLink(false);
    }
  };

  const issueQrForBusiness = async (row: BusinessCardListRow) => {
    // Fijamos el flag ANTES que cualquier await. Cualquier path de salida (return,
    // throw, finally) lo baja. Así evitamos quedar con `issuingQr=true` trapped
    // si algún await cuelga y el UI queda con los botones bloqueados.
    console.log('[QR_FLOW] issueQrForBusiness: START', { bId: row.bId, bcName: row.bcName });
    setIssuingQr(true);
    try {
      const authenticated = await hardLockCheck(tr('generar QR y compartir tu tarjeta', 'generate QR and share your card'));
      console.log('[QR_FLOW] hardLockCheck →', authenticated);
      if (!authenticated) {
        return;
      }

      const uid = await getActiveUserId();
      console.log('[QR_FLOW] getActiveUserId →', uid);
      if (!uid) {
        throw new Error(tr('No se pudo obtener tu sesión.', 'Could not get your session.'));
      }

      // Sync a smart_cards (espejo legacy) es best-effort y ACOTADO EN TIEMPO.
      // Si el backend tarda >4s, seguimos y abrimos el QR igual. El receptor
      // leerá el snapshot anterior en el peor caso. Paso 13 elimina este espejo.
      try {
        const syncPromise = (async () => {
          const vaultSnap = await loadVaultSnapshotForSlotSync(uid);
          const publicCardSlots = buildPublicCardSlotsForPersist(
            vaultSnap.vaultItems,
            row.vaultLinkIds,
            vaultSnap.iconVaultById,
          );
          await upsertSmartCardInDb({
            uid: uid,
            card: {
              bId: row.bId,
              cardType: 'business',
              scName: row.bcName,
              layout: 'vertical',
              themeId: row.themeId || DEFAULT_CARD_THEME_ID,
              ownerDisplayName: row.bcContactName || undefined,
              ownerNickname: undefined,
              ownerPhotoUrl: row.bcLogoUrl ? toRenderableImageUri(row.bcLogoUrl) : null,
              itemIds: row.vaultLinkIds,
              publicCardSlots,
              holdersCount: Number(row.holdersCount || 0),
              ratingAvg: Number(row.ratingAvg || 5),
              totalRatings: Number(row.totalRatings || 0),
              enableParallax: false,
              isFavorite: Boolean(row.isFavorite),
              issuerSnapshot: buildIssuerSnapshotFromPublicSlots({
                uid,
                userFullName: (issuerIdentity.userFullName || '').trim(),
                userNickName: (issuerIdentity.userNickName || '').trim(),
                userAvatarUrl: issuerIdentity.userAvatarUrl ?? null,
                publicCardSlots,
                itemIds: row.vaultLinkIds,
              }),
            },
          });
        })();
        const timeoutPromise = new Promise<'timeout'>((resolve) =>
          setTimeout(() => resolve('timeout'), 4000),
        );
        const winner = await Promise.race([syncPromise.then(() => 'ok'), timeoutPromise]);
        console.log('[QR_FLOW] legacy mirror sync →', winner);
      } catch (syncErr: any) {
        console.log('[QR_FLOW] legacy mirror sync FAILED (ignoring):', String(syncErr?.message || syncErr));
      }

      setQrBusinessContext({
        bId: row.bId,
        bcName: row.bcName,
        bcContactName: row.bcContactName,
        uid,
        bcLogoUrl: toRenderableImageUri(row.bcLogoUrl),
      });
      setSelectedCard(null);
      setQrToken('');
      setQrUniversalWebUrl('');
      setQrExpiresAt(0);
      setQrActiveSid(null);
      setRemainingMs(0);
      setRemainingSec(0);
      setQrVisible(true);
      console.log('[QR_FLOW] issueQrForBusiness: QR modal opened');
    } catch (error: any) {
      console.log('[QR_FLOW] issueQrForBusiness: ERROR', String(error?.message || error));
      const msg = error?.message?.trim();
      Alert.alert(
        tr('Error de QR', 'QR error'),
        msg ? String(msg) : tr('No se pudo generar el QR.', 'Could not generate the QR code.'),
      );
    } finally {
      setIssuingQr(false);
      console.log('[QR_FLOW] issueQrForBusiness: DONE');
    }
  };

  const confirmAndIssueQrForBusiness = (row: BusinessCardListRow) => {
    if (issuingQr) {
      return;
    }
    Alert.alert(
      tr('Crear QR', 'Create QR'),
      tr(
        `¿Deseas mostrar el QR permanente de "${row.bcName}"?`,
        `Do you want to show the permanent QR for "${row.bcName}"?`,
      ),
      [
        { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        {
          text: tr('Aceptar', 'Accept'),
          onPress: () => {
            void issueQrForBusiness(row);
          },
        },
      ],
    );
  };

  const deleteBusinessCardEntry = async (row: BusinessCardListRow) => {
    const uid = await getActiveUserId();
    if (!uid) {
      return;
    }
    let previous: BusinessCardListRow[] = [];
    setBusinessCardsFeed((p) => {
      previous = p;
      return p.filter((c) => c.bId !== row.bId);
    });
    try {
      await deleteBusinessCardViaApi(uid, row.bId);
    } catch {
      setBusinessCardsFeed(previous);
      Alert.alert(tr('Error', 'Error'), tr('No se pudo eliminar la tarjeta de negocio.', 'Could not delete the business card.'));
    }
  };

  const toggleBusinessCardSilence = async (row: BusinessCardListRow) => {
    const next = !row.silenced;
    try {
      const uid = await getActiveUserId();
      if (!uid) return;
      await setCardSilenced({ uid: uid, cardRef: row.bId, silenced: next });
      setBusinessCardsFeed((prev) =>
        prev.map((r) => (r.bId === row.bId ? { ...r, silenced: next } : r)),
      );
    } catch (e: any) {
      Alert.alert(tr('Error', 'Error'), e?.message || tr('No se pudo actualizar.', 'Could not update.'));
    }
  };

  const toggleFavoriteBusinessCard = async (row: BusinessCardListRow) => {
    const uid = await getActiveUserId();
    if (!uid) {
      return;
    }
    const next = !row.isFavorite;
    setBusinessCardsFeed((p) => p.map((c) => (c.bId === row.bId ? { ...c, isFavorite: next } : c)));
    try {
      await updateBusinessCardViaApi(uid, row.bId, { isFavorite: next });
    } catch {
      setBusinessCardsFeed((p) => p.map((c) => (c.bId === row.bId ? { ...c, isFavorite: row.isFavorite } : c)));
    }
  };

  /** Refresca bóveda antes de mostrar el modal (mismas razones que openPreviewCard). */
  const openPreviewBusinessCard = (row: BusinessCardListRow) => {
    void (async () => {
      const uid = (await getActiveUserId()) ?? sessionUid ?? '';
      setPreviewBusinessOwnerUid(uid);
      /**
       * Igual que openPreviewCard: cargar bóveda primero y luego fijar
       * previewBusiness + abrir modal en la misma continuación async para
       * garantizar que businessPreviewSlots se compute con vaultItems poblado.
       */
      await loadVaultItems();
      setPreviewBusiness(row);
      setPreviewLayout(width > height ? 'horizontal' : 'vertical');
      setPreviewBusinessVisible(true);

      if (!String(uid).trim()) return;
      try {
        const doc = await getBusinessCard(uid, row.bId);
        if (!doc) return;
        let fresh = toBusinessCardListRow(doc);
        try {
          const counts = await fetchBusinessCardHolderCounts({ uid, keys: [fresh.bId] });
          if (counts[fresh.bId] !== undefined) {
            fresh = { ...fresh, holdersCount: counts[fresh.bId] };
          }
        } catch {
          /* holders opcional */
        }
        setPreviewBusiness((prev) => (prev?.bId === fresh.bId ? fresh : prev));
        setBusinessCardsFeed((prev) => {
          const idx = prev.findIndex((c) => c.bId === fresh.bId);
          if (idx < 0) return prev;
          const next = [...prev];
          next[idx] = fresh;
          return next;
        });
      } catch {
        /* mantener fila optimista */
      }
    })();
  };

  const businessSwipeKey = (id: string) => `business:${id}`;

  /**
   * Misma verdad que la lista y el editor: `previewCard` se fija al abrir el modal y NO
   * se re-sincroniza al guardar en el factory; `smartCards` sí.
   *
   * Si el API devuelve `itemIds: []` pero el modal o caché local sí tenían ids, no pisan
   * con lista vacía (caso típico tras `setPreviewCard(fresh)` desde `loadSmartCards`).
   */
  const effectiveIssuerPreviewSmartCard = useMemo((): SmartCard | null => {
    if (!previewCard) return null;
    const sid = String(previewCard.sid || '').trim();
    if (!sid) return previewCard;
    const fromList = smartCards.find((c) => String(c.sid || '').trim() === sid) ?? previewCard;
    const idsFromList = Array.isArray(fromList.itemIds)
      ? fromList.itemIds.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const idsFromPreview = Array.isArray(previewCard.itemIds)
      ? previewCard.itemIds.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const itemIds = idsFromList.length > 0 ? idsFromList : idsFromPreview;
    if (idsFromList.length > 0) {
      return fromList;
    }
    if (idsFromPreview.length === 0) {
      return fromList;
    }
    return { ...fromList, itemIds };
  }, [previewCard, smartCards]);

  const effectiveIssuerPreviewBusinessRow = useMemo((): BusinessCardListRow | null => {
    if (!previewBusiness) return null;
    const bid = String(previewBusiness.bId || '').trim();
    if (!bid) return previewBusiness;
    const fromFeed = businessCardsFeed.find((r) => String(r.bId || '').trim() === bid) ?? previewBusiness;
    const idsFromFeed = Array.isArray(fromFeed.vaultLinkIds)
      ? fromFeed.vaultLinkIds.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const idsFromPreview = Array.isArray(previewBusiness.vaultLinkIds)
      ? previewBusiness.vaultLinkIds.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const vaultLinkIds = idsFromFeed.length > 0 ? idsFromFeed : idsFromPreview;
    if (idsFromFeed.length > 0) {
      return fromFeed;
    }
    if (idsFromPreview.length === 0) {
      return fromFeed;
    }
    return { ...fromFeed, vaultLinkIds };
  }, [previewBusiness, businessCardsFeed]);

  const previewSlots = useMemo<EditSlot[]>(() => {
    if (!effectiveIssuerPreviewSmartCard) return [];
    const card = effectiveIssuerPreviewSmartCard;
    const pickedRaw = card.issuerSnapshot?.userVaultPicked ?? [];
    const pickedById = new Map(
      pickedRaw.map((p) => [String(p.itemId || '').trim(), p] as const),
    );
    const idOrder = card.itemIds.map((id) => String(id || '').trim()).filter(Boolean);
    const slots: EditSlot[] = [];
    let idx = 0;
    for (const id of idOrder) {
      let item: VaultItem | null =
        vaultItems.find((v) => String(v.id || '').trim() === id) ?? null;
      if (!item) {
        const sp = pickedById.get(id);
        if (sp) {
          item = vaultItemFromIssuerPicked(sp, id);
        }
      }
      if (item) {
        slots.push({
          id: `preview-slot-${id}-${idx}`,
          index: idx,
          item,
        });
        idx += 1;
      }
    }
    return slots;
  }, [effectiveIssuerPreviewSmartCard, vaultItems]);

  const editSlots = useMemo<EditSlot[]>(() => {
    return Array.from({ length: MAX_CARD_SLOTS }, (_, index) => {
      const rawId = selectedItemIds[index];
      const trimmed = String(rawId || '').trim();
      const item = trimmed ? vaultItems.find((entry) => String(entry.id || '').trim() === trimmed) ?? null : null;
      return {
        id: `slot-${index}`,
        index,
        item,
      };
    });
  }, [selectedItemIds, vaultItems]);

  const factoryWireIconRows = useMemo(() => {
    const n = editSlots.filter((s) => s.item !== null).length;
    return Math.max(1, getWireframeIconRowPlan(n).length);
  }, [editSlots]);

  const factoryResolvedDataCount = useMemo(
    () => editSlots.filter((s) => s.item !== null).length,
    [editSlots],
  );
  const factorySmartMedalPills = useMemo(
    () =>
      SOCIAL_MEDALS.map((medal) => ({
        key: medal.key,
        icon: medal.icon,
        count: 0,
      })),
    [],
  );
  const factoryPreviewMirrorScale = 0.8;
  const factoryPreviewScaledCard = useMemo(() => {
    const baseW = 420;
    const modalCardH = Math.max(
      560,
      getPreviewModalStackSize(height, factoryResolvedDataCount).height - 96,
    );
    const availableW = Math.max(240, Math.min(width - 88, baseW));
    const scale = Math.min(1, availableW / baseW);
    const scaledW = Math.round(baseW * scale);
    const scaledH = Math.round(modalCardH * scale);
    return {
      baseW,
      baseH: modalCardH,
      scale,
      scaledW,
      scaledH,
      left: (scaledW - baseW) / 2,
      top: (scaledH - modalCardH) / 2,
    };
  }, [height, width, factoryResolvedDataCount]);
  const filteredVaultItemsForSelector = useMemo(() => {
    const query = dataSelectorQuery.trim().toLowerCase();
    const indexed = vaultItems.map((item, index) => ({ item, index }));
    const filtered = query
      ? indexed.filter(({ item }) => {
          const haystack = `${item.title} ${item.type} ${item.value}`.toLowerCase();
          return haystack.includes(query);
        })
      : indexed;

    if (dataSelectorSort === 'alpha') {
      return filtered
        .slice()
        .sort((a, b) => {
          const byTitle = a.item.title.localeCompare(b.item.title, undefined, { sensitivity: 'base' });
          return byTitle !== 0 ? byTitle : a.index - b.index;
        })
        .map(({ item }) => item);
    }

    return filtered.map(({ item }) => item);
  }, [vaultItems, dataSelectorQuery, dataSelectorSort]);
  const dataSelectorCardTheme = useMemo(() => resolveTheme(themeId), [themeId]);

  useEffect(() => {
    if (!factoryVisible || vaultItems.length === 0) {
      return;
    }
    setSelectedItemIds((prev) => {
      const next = prev.filter((id) => vaultItems.some((v) => v.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [vaultItems, factoryVisible]);

  // Handle upgrade button press (limit reached modal)
  const handleUpgradePress = async () => {
    try {
      setLimitReachedVisible(false);
      Alert.alert(
        tr('Modelo actualizado', 'Model updated'),
        tr(
          'No existe suscripción global. Si quieres funciones de negocio, activa anualidad por cada Tarjeta de Negocio en Crear tarjeta de negocio.',
          'There is no global subscription. For business features, activate the yearly plan per business card in Create business card.',
        ),
      );
    } catch (error) {
      console.error('Error upgrading:', error);
      Alert.alert(tr('Error', 'Error'), tr('No se pudo completar la compra.', 'Purchase could not be completed.'));
    }
  };

  const previewPayload = useMemo<MyCardsPayload | null>(() => {
    const src = effectiveIssuerPreviewSmartCard;
    if (!src) return null;
    return {
      cardName: (src.scName || cardName || tr('Nueva Tarjeta', 'New Card')).trim(),
      subtitle: `@${(issuerIdentity.userNickName || 'user').toLowerCase()}`,
      avatarUrl: issuerIdentity.userAvatarUrl,
      themeId: src.themeId || '',
      wallpaperUrl: src.wallpaperUrl,
      layout: previewLayout,
      holdersCount: src.holdersCount ?? 0,
      enableParallax,
      slots: previewSlots as unknown as WireframeEditSlot[],
      iconVaultById,
    };
  }, [
    effectiveIssuerPreviewSmartCard,
    cardName,
    issuerIdentity.userNickName,
    issuerIdentity.userAvatarUrl,
    previewLayout,
    enableParallax,
    previewSlots,
    iconVaultById,
    language,
  ]);

  const businessPreviewSlots = useMemo<EditSlot[]>(() => {
    const row = effectiveIssuerPreviewBusinessRow;
    if (!row?.vaultLinkIds?.length) {
      return [];
    }
    const slotByItemId = new Map(
      (row.publicCardSlots ?? []).map((s) => [String(s.itemId || '').trim(), s] as const),
    );
    const out: EditSlot[] = [];
    let idx = 0;
    for (const raw of row.vaultLinkIds) {
      const linkId = String(raw || '').trim();
      if (!linkId) continue;
      let item: VaultItem | null =
        vaultItems.find((v) => String(v.id || '').trim() === linkId) ?? null;
      if (!item) {
        const pub = slotByItemId.get(linkId);
        if (pub) {
          item = vaultItemFromPublicCardSlot(pub);
        }
      }
      if (item) {
        out.push({ id: `biz-preview-${linkId}-${idx}`, index: idx, item });
        idx += 1;
      }
    }
    return out;
  }, [effectiveIssuerPreviewBusinessRow, vaultItems]);

  const businessPreviewPayload = useMemo<MyCardsPayload | null>(() => {
    const src = effectiveIssuerPreviewBusinessRow;
    if (!src) return null;
    return {
      cardName: src.bcName.trim(),
      subtitle: src.bcContactName.trim(),
      avatarUrl: toRenderableImageUri(src.bcLogoUrl),
      themeId: src.themeId || '',
      layout: previewLayout,
      holdersCount: src.holdersCount ?? 0,
      enableParallax,
      slots: businessPreviewSlots as unknown as WireframeEditSlot[],
      noAvatarIcon: 'storefront-outline',
      iconVaultById,
    };
  }, [effectiveIssuerPreviewBusinessRow, previewLayout, enableParallax, businessPreviewSlots, iconVaultById]);

  const qrPayload = useMemo(() => {
    if (qrBusinessContext) {
      return generatePublicBusinessWebUrl(qrBusinessContext.bId, qrBusinessContext.uid);
    }
    if (!selectedCard) {
      return '';
    }
    if (qrUniversalWebUrl) {
      return qrUniversalWebUrl;
    }
    if (!qrToken) {
      return '';
    }
    // qrToken: JSON {kind, token, sid, bId, exp} para escaneo in-app
    return qrToken;
  }, [selectedCard, qrToken, qrUniversalWebUrl, qrBusinessContext]);

  const remainingPercent = useMemo(() => {
    if (qrBusinessContext || qrWindowMs <= 0) {
      return 1;
    }
    return Math.max(0, Math.min(1, remainingMs / qrWindowMs));
  }, [remainingMs, qrWindowMs, qrBusinessContext]);

  const qrExpired = useMemo(() => {
    if (qrBusinessContext) {
      return false;
    }
    return qrVisible && remainingMs <= 0 && Boolean(qrPayload);
  }, [qrVisible, remainingMs, qrPayload, qrBusinessContext]);

  const sortedCards = useMemo(() => {
    const unique = dedupeSmartCardsBySid(smartCards);
    return unique.sort((a, b) => {
      const favDiff = Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite));
      if (favDiff !== 0) {
        return favDiff;
      }
      return String(a.scName || '').localeCompare(String(b.scName || ''), 'es', { sensitivity: 'base' });
    });
  }, [smartCards]);

  const sortedBusinessCards = useMemo(() => {
    return [...businessCardsFeed].sort((a, b) => {
      const favDiff = Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite));
      if (favDiff !== 0) {
        return favDiff;
      }
      return b.createdAtMs - a.createdAtMs;
    });
  }, [businessCardsFeed]);

  const baseFeedMerged = useMemo((): CardsFeedListItem[] => {
    const bizItems: CardsFeedListItem[] = sortedBusinessCards.map((b) => ({
      kind: 'business' as const,
      ...b,
    }));
    return [...bizItems, ...sortedCards.map((card) => ({ kind: 'smart' as const, card }))];
  }, [sortedBusinessCards, sortedCards]);

  const orderedBaseFeed = useMemo(() => {
    return applyCardsManualFeedOrder(
      baseFeedMerged,
      manualFeedOrderKeys.length > 0 ? manualFeedOrderKeys : null,
    );
  }, [baseFeedMerged, manualFeedOrderKeys]);

  const filteredFeed = useMemo((): CardsFeedListItem[] => {
    const q = cardSearchQuery.trim();
    if (!q) {
      return orderedBaseFeed;
    }
    const qExpanded = buildExpandedMarketQuery(q) || q;
    const qLower = q.toLowerCase();
    const bizFiltered = orderedBaseFeed.filter((b): b is CardsFeedListItem & { kind: 'business' } => {
      if (b.kind !== 'business') return false;
      return (
        b.bcName.toLowerCase().includes(qLower) ||
        b.bId.toLowerCase().includes(qLower) ||
        b.bcContactName.toLowerCase().includes(qLower)
      );
    });
    const smartOrdered = orderedBaseFeed
      .filter((x): x is { kind: 'smart'; card: SmartCard } => x.kind === 'smart')
      .map((x) => x.card);
    const smartFiltered = orderByDeepSearchWithExpandedQuery(smartOrdered, qExpanded, (card) =>
      collectStringsSmartCard({ scName: card.scName, itemIds: card.itemIds }, vaultItems, false),
    );
    return [...bizFiltered, ...smartFiltered.map((card) => ({ kind: 'smart' as const, card }))];
  }, [orderedBaseFeed, cardSearchQuery, vaultItems]);

  useEffect(() => {
    enterCardsReorderRef.current = () => {
      if (cardSearchQuery.trim()) {
        Alert.alert(
          tr('Ordenar tarjetas', 'Reorder cards'),
          tr('Sal de la búsqueda para poder reordenar la lista.', 'Clear search to reorder the list.'),
        );
        return;
      }
      if (isLandscape) {
        Alert.alert(
          tr('Ordenar tarjetas', 'Reorder cards'),
          tr('Gira el teléfono a vertical para reordenar.', 'Rotate your phone to portrait to reorder.'),
        );
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReorderDraftData([...filteredFeed]);
      setCardsReorderMode(true);
    };
  }, [filteredFeed, cardSearchQuery, isLandscape, tr]);

  useEffect(() => {
    if (!isCardsUnlocked) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const uid = await getActiveUserId();
      if (!uid || cancelled) return;
      try {
        const raw = await AsyncStorage.getItem(cardsTabFeedOrderStorageKey(uid));
        if (cancelled || !raw) return;
        const arr = JSON.parse(raw) as unknown;
        if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) {
          setManualFeedOrderKeys(arr);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCardsUnlocked]);

  const commitCardsReorder = useCallback(async () => {
    const keys = reorderDraftData.map(cardsFeedItemKey);
    setManualFeedOrderKeys(keys);
    setCardsReorderMode(false);
    const uid = await getActiveUserId();
    if (uid) {
      try {
        await AsyncStorage.setItem(cardsTabFeedOrderStorageKey(uid), JSON.stringify(keys));
      } catch {
        /* ignore */
      }
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [reorderDraftData]);

  const cancelCardsReorder = useCallback(() => {
    setCardsReorderMode(false);
    setReorderDraftData([]);
  }, []);

  useEffect(() => {
    if (cardsReorderMode && isLandscape) {
      cancelCardsReorder();
    }
  }, [cardsReorderMode, isLandscape, cancelCardsReorder]);

  const openPreviewCard = (card: SmartCard) => {
    setPreviewLayout(width > height ? 'horizontal' : 'vertical');
    void (async () => {
      // Load vault BEFORE setting previewCard + opening the modal.
      // All three setters (setVaultItems inside loadVaultItems, setPreviewCard,
      // and setPreviewVisible) run in the same async continuation -> React 18
      // batches them in one render -> first paint always has vaultItems populated.
      await loadVaultItems();
      setPreviewCard(card);
      setPreviewVisible(true);
      try {
        const list = await loadSmartCards();
        const fresh = list.find((c) => c.sid === card.sid);
        if (fresh) {
          setPreviewCard((prev) => {
            if (prev?.sid !== fresh.sid) return prev;
            const prevIds = Array.isArray(prev.itemIds)
              ? prev.itemIds.map((x) => String(x || '').trim()).filter(Boolean)
              : [];
            const freshIds = Array.isArray(fresh.itemIds)
              ? fresh.itemIds.map((x) => String(x || '').trim()).filter(Boolean)
              : [];
            if (freshIds.length > 0) {
              return fresh;
            }
            if (prevIds.length > 0) {
              return { ...fresh, itemIds: prev.itemIds };
            }
            return fresh;
          });
        }
      } catch {
        /* mantener card optimista */
      }
    })();
  };

  /** Si la bóveda se rellena un tick después (red/Firestore), vuelve a cruzar itemIds × vaultItems sin cerrar el modal. */
  useEffect(() => {
    if (!previewVisible || !previewCard) return;
    void loadVaultItems();
  }, [previewVisible, previewCard?.sid, loadVaultItems]);

  useEffect(() => {
    if (!previewBusinessVisible || !previewBusiness) return;
    void loadVaultItems();
  }, [previewBusinessVisible, previewBusiness?.bId, loadVaultItems]);

  // Efecto para actualizar orientación en tiempo real mientras el modal de vista previa está abierto
  useEffect(() => {
    if (!previewVisible && !previewBusinessVisible) return;
    setPreviewLayout(width > height ? 'horizontal' : 'vertical');
  }, [previewVisible, previewBusinessVisible, width, height]);

  const dismissCardPreviewModals = useCallback(() => {
    setPreviewVisible(false);
    setPreviewCard(null);
    setPreviewBusinessVisible(false);
    setPreviewBusiness(null);
    setPreviewBusinessOwnerUid('');
    refreshCardsTabFromServer();
  }, []);

  const openDataPopover = async (item: VaultItem) => {
    const activeScName =
      previewBusinessVisible && previewBusiness
        ? previewBusiness.bcName
        : previewVisible && previewCard
          ? previewCard.scName
          : selectedCard?.scName ?? cardName;
    const issuerUid = await getActiveUserId();
    if (previewBusinessVisible && previewBusiness) {
      const bizLogo = String(previewBusiness.bcLogoUrl || '').trim() || null;
      const bizName = String(previewBusiness.bcName || '').trim() || null;
      const bizContact = String(previewBusiness.bcContactName || '').trim() || null;
      const displayForPeer = bizName || bizContact || tr('Negocio', 'Business');
      await openVaultPreviewItem(item, {
        tr,
        openDocumentViewer: (it) => {
          openDocumentViewer(it as VaultItem);
        },
        ghostTargetUid: issuerUid,
        sourceCardName: String(
          previewBusiness.bcName || activeScName || cardName || tr('Tarjeta Social', 'Social Card'),
        ),
        sourceSid: null,
        sourceBId: String(previewBusiness.bId || '').trim() || null,
        peerDisplayName: displayForPeer,
        peerFullName: bizContact || undefined,
        peerNickname: undefined,
        bcLogoUrl: bizLogo,
        bcName: bizName,
        bcContactName: bizContact,
        userAvatarUrl: null,
        dismissParentModal: dismissCardPreviewModals,
        peerPhotoUrl: bizLogo,
        cardPhoto: bizLogo,
        cardType: 'business',
      });
      return;
    }
    const activeSmartForGhost = (() => {
      const sidKey = String(previewCard?.sid ?? selectedCard?.sid ?? '').trim();
      if (!sidKey) return previewCard ?? selectedCard;
      return smartCards.find((c) => c.sid === sidKey) ?? previewCard ?? selectedCard;
    })();
    const fromFs = issuerUid ? await fetchVoipCanonicalFullNameForUid(issuerUid) : '';
    const voipName = ghostPeerVoipFullName(
      fromFs,
      activeSmartForGhost?.ownerDisplayName,
      issuerIdentity.userNickName,
    ).trim();
    if (voipName) {
      setIssuerIdentity((prev) => ({ ...prev, voipCanonicalFullName: voipName }));
    }
    await openVaultPreviewItem(item, {
      tr,
      openDocumentViewer: (it) => {
        openDocumentViewer(it as VaultItem);
      },
      ghostTargetUid: issuerUid,
      sourceCardName: activeScName ?? cardName ?? tr('Tarjeta Social', 'Social Card'),
      sourceSid: String(previewCard?.sid ?? selectedCard?.sid ?? '').trim() || null,
      sourceBId: null,
      peerDisplayName: voipName || tr('este contacto', 'this contact'),
      peerFullName: voipName || undefined,
      peerNickname: issuerIdentity.userNickName || undefined,
      bcLogoUrl: null,
      bcName: null,
      bcContactName: null,
      userAvatarUrl: issuerIdentity.userAvatarUrl ?? null,
      dismissParentModal: dismissCardPreviewModals,
      peerPhotoUrl: issuerIdentity.userAvatarUrl ?? null,
      cardPhoto: issuerIdentity.userAvatarUrl ?? null,
      cardType: 'personal',
    });
  };

  const ensureWebUrl = (raw: string) => {
    const value = String(raw || '').trim();
    if (!value) {
      return '';
    }
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    return `https://${value}`;
  };

  const tryOpenInApp = async (item: VaultItem | null) => {
    if (!item) {
      return;
    }
    try {
      const activeScName =
        previewBusinessVisible && previewBusiness
          ? previewBusiness.bcName
          : previewVisible && previewCard
            ? previewCard.scName
            : selectedCard?.scName ?? cardName;
      const issuerUid = await getActiveUserId();
      if (previewBusinessVisible && previewBusiness) {
        const bizLogo = String(previewBusiness.bcLogoUrl || '').trim() || null;
        const bizName = String(previewBusiness.bcName || '').trim() || null;
        const bizContact = String(previewBusiness.bcContactName || '').trim() || null;
        const displayForPeer = bizName || bizContact || tr('Negocio', 'Business');
        await openVaultPreviewItem(item, {
          tr,
          openDocumentViewer: (it) => {
            openDocumentViewer(it as VaultItem);
          },
          ghostTargetUid: issuerUid,
          sourceCardName: String(
            previewBusiness.bcName || activeScName || cardName || tr('Tarjeta Social', 'Social Card'),
          ),
          sourceSid: null,
          sourceBId: String(previewBusiness.bId || '').trim() || null,
          peerDisplayName: displayForPeer,
          peerFullName: bizContact || undefined,
          peerNickname: undefined,
          bcLogoUrl: bizLogo,
          bcName: bizName,
          bcContactName: bizContact,
          userAvatarUrl: null,
          dismissParentModal: dismissCardPreviewModals,
          peerPhotoUrl: bizLogo,
          cardPhoto: bizLogo,
          cardType: 'business',
        });
        return;
      }
      const activeSmartForGhost = (() => {
        const sidKey = String(previewCard?.sid ?? selectedCard?.sid ?? '').trim();
        if (!sidKey) return previewCard ?? selectedCard;
        return smartCards.find((c) => c.sid === sidKey) ?? previewCard ?? selectedCard;
      })();
      const fromFs = issuerUid ? await fetchVoipCanonicalFullNameForUid(issuerUid) : '';
      const voipName = ghostPeerVoipFullName(
        fromFs,
        activeSmartForGhost?.ownerDisplayName,
        issuerIdentity.userNickName,
      ).trim();
      if (voipName) {
        setIssuerIdentity((prev) => ({ ...prev, voipCanonicalFullName: voipName }));
      }
      await openVaultPreviewItem(item, {
        tr,
        openDocumentViewer: (it) => {
          openDocumentViewer(it as VaultItem);
        },
        ghostTargetUid: issuerUid,
        sourceCardName: activeScName ?? cardName ?? tr('Tarjeta Social', 'Social Card'),
        sourceSid: String(previewCard?.sid ?? selectedCard?.sid ?? '').trim() || null,
        sourceBId: null,
        peerDisplayName: voipName || tr('este contacto', 'this contact'),
        peerFullName: voipName || undefined,
        peerNickname: issuerIdentity.userNickName || undefined,
        bcLogoUrl: null,
        bcName: null,
        bcContactName: null,
        userAvatarUrl: issuerIdentity.userAvatarUrl ?? null,
        dismissParentModal: dismissCardPreviewModals,
        peerPhotoUrl: issuerIdentity.userAvatarUrl ?? null,
        cardPhoto: issuerIdentity.userAvatarUrl ?? null,
        cardType: 'personal',
      });
    } catch {
      Alert.alert(tr('No se pudo abrir', 'Could not open'), tr('El dispositivo no pudo abrir este dato en app nativa.', 'Device could not open this data in native app.'));
    }
  };

  const openInBrowser = async (item: VaultItem | null) => {
    if (!item) {
      return;
    }
    try {
      if (isGhostLinkVaultType(item.type)) {
        Alert.alert(
          tr('No disponible', 'Not available'),
          tr('Ghost-Link solo funciona dentro de Card-Social (llamada VoIP).', 'Ghost-Link only works inside Card-Social (VoIP call).'),
        );
        return;
      }
      if (isClassicPhoneVaultType(item.type)) {
        await ActionController.ActionTelefono({ value: String(item.value || '') });
        return;
      }
      if (item.type === 'Enlaces') {
        await ActionController.ActionLink({ value: ensureWebUrl(item.value), title: item.title });
        return;
      }
      if (item.type === 'Documento') {
        openDocumentViewer(item);
        return;
      }
      Alert.alert(tr('No disponible', 'Not available'), tr('Este dato no tiene ruta de navegador directa.', 'This data has no direct browser route.'));
    } catch {
      Alert.alert(tr('Error', 'Error'), tr('No se pudo abrir en navegador.', 'Could not open in browser.'));
    }
  };

  const renderVaultMiniIcon = (item: VaultItem | null | undefined, size = 20, glyphColor?: string) =>
    renderWireframeMiniIcon(item, size, glyphColor, iconVaultById, cardsTheme.textMuted);

  const openDocumentViewer = (item: VaultItem) => {
    setDataPopoverVisible(false);
    setFocusedCertificate(null);
    const wasFactory = factoryVisible;
    if (wasFactory) {
      resumeFactoryAfterAuxModalRef.current = true;
      setFactoryVisible(false);
    }
    setViewerItem(item);
    // iOS: dejar que el modal del editor cierre (animación) antes de mostrar el visor; si no, a veces no se ve.
    if (Platform.OS === 'ios' && wasFactory) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setViewerVisible(true);
        });
      });
    } else {
      setViewerVisible(true);
    }
  };

  const renderIdentityBadge = (compact = false) => {
    const holderCount = selectedCard?.holdersCount ?? previewCard?.holdersCount ?? 0;
    const capSize = compact ? 11 : 13;
    return (
      <>
        {issuerIdentity.userAvatarUrl ? (
          <ExpoImage source={{ uri: issuerIdentity.userAvatarUrl }} style={compact ? styles.wireAvatarSm : styles.wireAvatar} cachePolicy="disk" />
        ) : (
          <View style={compact ? styles.wireAvatarFallbackSm : styles.wireAvatarFallback}>
            <MaterialCommunityIcons name="account" size={compact ? 22 : 32} color="#636366" />
          </View>
        )}
        <AutoScaleText style={compact ? styles.wireNameSm : styles.wireName}>
          {(selectedCard?.scName || previewCard?.scName || cardName || tr('Nueva Tarjeta', 'New Card')).trim()}
        </AutoScaleText>
        <AutoScaleText style={compact ? styles.wireNickSm : styles.wireNick}>@{(issuerIdentity.userNickName || 'user').toLowerCase()}</AutoScaleText>
        <View style={styles.wireStatsRowInline}>
          <View style={styles.wireUsersPill}>
            <MaterialCommunityIcons name="account-outline" size={capSize} color="#636366" />
            <Text style={styles.wireUsersPillText}>{holderCount}</Text>
          </View>
        </View>
      </>
    );
  };

  const renderSlotContent = (slot: EditSlot, ui: { size: number }, editable: boolean, chestTheme: ChestCardTheme) => (
    <WireframeSlotTile
      slot={slot}
      ui={ui}
      editable={editable}
      chestTheme={chestTheme}
      tr={tr}
      renderMiniIcon={renderVaultMiniIcon}
      onEditableOpenPicker={(index) => openSlotPicker(index)}
      onDataPress={(item) => void openDataPopover(item as VaultItem)}
      onMirrorLongPress={(s) => handlePreviewIconLongPress(s as EditSlot)}
      onRemoveSlotItem={(index) => removeSlotItem(index)}
    />
  );

  const renderWireframeCard = (params: {
    layout: 'vertical' | 'horizontal';
    slots: EditSlot[];
    editable: boolean;
    theme: ChestCardTheme;
    wallpaperUrl?: string;
    wireIdentity?: {
      cardTitle: string;
      subtitle: string;
      avatarUri: string | null;
      holdersCount: number;
      ratingAvg: number;
      totalRatings?: number;
      noAvatarIcon: 'account' | 'storefront-outline';
    } | null;
    mirrorStatsCapsuleScale?: number;
    medalPills?: { key: string; icon: string; count: number }[];
  }) => {
    const { layout, slots, editable, theme, wallpaperUrl, wireIdentity, mirrorStatsCapsuleScale, medalPills } = params;
    const wId = wireIdentity;
    const dispName = wId?.cardTitle ?? (selectedCard?.scName || previewCard?.scName || cardName || tr('Nueva Tarjeta', 'New Card')).trim();
    const dispSub = wId ? wId.subtitle : `@${(issuerIdentity.userNickName || 'user').toLowerCase()}`;
    const dispAvatar = wId ? wId.avatarUri : issuerIdentity.userAvatarUrl;
    const dispHolders = wId ? wId.holdersCount : (selectedCard?.holdersCount ?? previewCard?.holdersCount ?? 0);
    const noAvatarIconName = (wId?.noAvatarIcon ?? 'account') as 'account' | 'storefront-outline';

    return (
      <IsolatedWireframeCard
        layout={layout}
        slots={slots}
        editable={editable}
        theme={theme}
        wallpaperUrl={wallpaperUrl}
        dispName={dispName}
        dispSub={dispSub}
        dispAvatar={dispAvatar}
        dispHolders={dispHolders}
        noAvatarIconName={noAvatarIconName}
        enableParallax={enableParallax}
        parallaxX={parallaxX}
        parallaxY={parallaxY}
        renderSlotContent={renderSlotContent}
        tr={tr}
        mirrorStatsCapsuleScale={mirrorStatsCapsuleScale}
        medalPills={medalPills}
      />
    );
  };

  const renderBusinessCardRow = (row: BusinessCardListRow) => {
    const chestTheme = getCardRowTheme(row.themeId);
    const themeMeta = getThemeById(row.themeId || '') ?? CHEST_THEMES[0];
    const holders = row.holdersCount ?? 0;
    const metricPillFg = resolvePillForegroundColor({
      cardGradient: chestTheme.gradient,
      pillBackground: 'rgba(255,255,255,0.72)',
      preferredColor: chestTheme.iconColor,
    });
    const logoUri = toRenderableImageUri(row.bcLogoUrl);
    const sk = businessSwipeKey(row.bId);
    const closeBusinessRowSwipe = () => {
      swipeableMethodsByCardIdRef.current.get(sk)?.close();
    };
    return (
      <Swipeable
        containerStyle={[styles.swipeWrap, isLandscape && styles.swipeWrapLandscape]}
        rightThreshold={24}
        leftThreshold={24}
        renderLeftActions={(_progress, _translation, methods) => {
          swipeableMethodsByCardIdRef.current.set(sk, methods);
          return <View style={styles.swipeLeftTriggerArea} />;
        }}
        onSwipeableOpen={(direction) => {
          if (direction === 'right') {
            // Cerramos primero el swipe para que el gesture handler no quede
            // atrapado con la strip abierta mientras el Alert consume el foco.
            // Diferimos el Alert al siguiente frame para dar tiempo a la
            // animación de close() y evitar UI "congelada" si el usuario
            // cancela o el flujo QR tarda.
            swipeableMethodsByCardIdRef.current.get(sk)?.close();
            requestAnimationFrame(() => {
              confirmAndIssueQrForBusiness(row);
            });
          }
        }}
        renderRightActions={() => (
          <View style={styles.swipeActions}>
            <TouchableOpacity
              style={[styles.swipeActionBtn, { backgroundColor: cardsTheme.swipeStripEditBg }]}
              onPress={() => {
                closeBusinessRowSwipe();
                router.push({ pathname: '/(tabs)/createBusinessCard', params: { bId: row.bId } } as any);
              }}
              accessibilityLabel={tr('Editar tarjeta', 'Edit card')}
            >
              <MaterialCommunityIcons name="pencil" size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>{tr('Editar', 'Edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.swipeActionBtn, { backgroundColor: row.silenced ? '#34C759' : '#FF9500' }]}
              onPress={() => {
                closeBusinessRowSwipe();
                if (row.silenced) {
                  void toggleBusinessCardSilence(row);
                } else {
                  Alert.alert(
                    tr('Silenciar tarjeta', 'Silence card'),
                    tr(
                      'Nadie podrá llamarte desde esta tarjeta mientras esté silenciada.',
                      'No one will be able to call you from this card while silenced.',
                    ),
                    [
                      { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
                      { text: tr('Silenciar', 'Silence'), onPress: () => void toggleBusinessCardSilence(row) },
                    ],
                  );
                }
              }}
              accessibilityLabel={row.silenced ? tr('Reactivar tarjeta', 'Unmute card') : tr('Silenciar tarjeta', 'Silence card')}
            >
              <MaterialCommunityIcons name={row.silenced ? 'volume-high' : 'volume-off'} size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>{row.silenced ? tr('Activar', 'Unmute') : tr('Silenciar', 'Silence')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.swipeActionBtn, { backgroundColor: cardsTheme.subscriberSwipeRevokeBg }]}
              onPress={() => {
                closeBusinessRowSwipe();
                void toggleFavoriteBusinessCard(row);
              }}
              accessibilityLabel={
                row.isFavorite
                  ? tr('Quitar de favoritos', 'Remove from favorites')
                  : tr('Marcar favorito', 'Mark as favorite')
              }
            >
              <MaterialCommunityIcons name={row.isFavorite ? 'heart' : 'heart-outline'} size={16} color="#FFFFFF" />
              <Text style={[styles.swipeActionText, styles.swipeFavoriteSwipeLabel]} numberOfLines={2}>
                {row.isFavorite ? tr('Quitar favorito', 'Unfavorite') : tr('Marcar favorito', 'Favorite')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.swipeDeleteBtn, { backgroundColor: cardsTheme.swipeDeleteBg }]}
              onPress={() => {
                closeBusinessRowSwipe();
                void deleteBusinessCardEntry(row);
              }}
              accessibilityLabel={tr('Eliminar tarjeta', 'Delete card')}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>{tr('Eliminar', 'Delete')}</Text>
            </TouchableOpacity>
          </View>
        )}
      >
        <View
          style={[
            styles.cardItem,
            isLandscape && styles.cardItemLandscape,
            { borderColor: chestTheme.borderColor, borderWidth: chestTheme.borderWidth },
          ]}
        >
          <LinearGradient
            colors={[...chestTheme.gradient]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <TouchableOpacity
            style={styles.cardRowTouchable}
            onPress={() => {
              requestAnimationFrame(() => {
                closeAllCardSwipes();
                openPreviewBusinessCard(row);
              });
            }}
            onLongPress={() => enterCardsReorderRef.current?.()}
            delayLongPress={420}
            activeOpacity={0.92}
          >
            <View style={[styles.cardRowInner, styles.businessCardListInner, styles.businessCardRowInner]}>
              <View style={styles.businessListMainRow}>
                {logoUri ? (
                  <ExpoImage
                    source={{ uri: logoUri }}
                    style={[styles.businessListLogo, { borderColor: chestTheme.borderColor }]}
                    cachePolicy="memory"
                    recyclingKey={logoUri}
                    transition={120}
                  />
                ) : (
                  <View style={[styles.businessListLogoPh, { borderColor: chestTheme.borderColor }]}>
                    <MaterialCommunityIcons name="storefront-outline" size={35} color={chestTheme.titleColor} />
                  </View>
                )}
                <View style={styles.businessListTextCol}>
                  <AutoScaleText
                    maxLines={2}
                    style={[styles.cardTitle, styles.businessListTitle, { color: chestTheme.titleColor }]}
                  >
                    {row.bcName}
                  </AutoScaleText>
                  <Text style={[styles.businessListSubtitle, { color: chestTheme.metaColor }]} numberOfLines={1}>
                    {row.bcContactName.trim()
                      ? row.bcContactName
                      : themeMeta.name}
                  </Text>
                  <View style={styles.businessCardStatsRow}>
                    <TouchableOpacity
                      style={[
                        styles.metricPill,
                        { borderColor: chestTheme.borderColor, backgroundColor: 'rgba(255,255,255,0.72)' },
                      ]}
                      accessibilityRole="text"
                      accessibilityLabel={tr('Personas con tu tarjeta', 'People with your card')}
                      onPress={() => { void openBusinessSubscribersModal(row); }}
                    >
                      <MaterialCommunityIcons name="account-group-outline" size={13} color={metricPillFg} />
                      <Text style={[styles.metricPillText, { color: metricPillFg }]}>{holders}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {sessionUid ? (
                  <View style={styles.businessListQrWrap} pointerEvents="none">
                    <QRCode
                      value={generatePublicBusinessWebUrl(row.bId, sessionUid)}
                      size={64}
                      color="#636366"
                      backgroundColor="#FFFFFF"
                      ecl="H"
                      {...(logoUri
                        ? {
                            logo: { uri: logoUri },
                            logoSize: 16,
                            logoMargin: 2,
                            logoBackgroundColor: '#FFFFFF',
                          }
                        : {})}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cardRowFavoriteBtn}
            onPress={() => {
              closeBusinessRowSwipe();
              void toggleFavoriteBusinessCard(row);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={
              row.isFavorite ? tr('Quitar de favoritos', 'Remove from favorites') : tr('Marcar favorito', 'Mark as favorite')
            }
          >
            <MaterialCommunityIcons
              name={row.isFavorite ? 'heart' : 'heart-outline'}
              size={18}
              color={row.isFavorite ? cardsTheme.favoriteActive : chestTheme.titleColor}
            />
          </TouchableOpacity>
        </View>
      </Swipeable>
    );
  };

  const renderCard = ({ item }: { item: SmartCard }) => {
    const chestTheme = getCardRowTheme(item.themeId);
    const holders = item.holdersCount ?? 0;
    const metricPillFg = resolvePillForegroundColor({
      cardGradient: chestTheme.gradient,
      pillBackground: 'rgba(255,255,255,0.72)',
      preferredColor: chestTheme.iconColor,
    });
    const themeMeta = getThemeById(item.themeId || '') ?? CHEST_THEMES[0];
    const themeLabel = themeMeta.name;
    const closeSmartCardRowSwipe = () => {
      swipeableMethodsByCardIdRef.current.get(item.sid)?.close();
    };

    return (
      <Swipeable
        containerStyle={[styles.swipeWrap, isLandscape && styles.swipeWrapLandscape]}
        rightThreshold={24}
        leftThreshold={24}
        renderLeftActions={(_progress, _translation, methods) => {
          swipeableMethodsByCardIdRef.current.set(item.sid, methods);
          return <View style={styles.swipeLeftTriggerArea} />;
        }}
        onSwipeableOpen={(direction) => {
          if (direction === 'right') {
            // Igual que negocio: cerrar el swipe y diferir el Alert un frame para que
            // RNGH termine la animación; si no, el Alert + modal pueden “congelar” la lista.
            swipeableMethodsByCardIdRef.current.get(item.sid)?.close();
            requestAnimationFrame(() => {
              confirmAndIssueQrForCard(item);
            });
          }
        }}
        renderRightActions={() => (
          <View style={styles.swipeActions}>
            <TouchableOpacity
              style={[styles.swipeActionBtn, { backgroundColor: cardsTheme.swipeStripEditBg }]}
              onPress={() => {
                closeSmartCardRowSwipe();
                openEditFactory(item);
              }}
              accessibilityLabel={tr('Editar tarjeta', 'Edit card')}
            >
              <MaterialCommunityIcons name="pencil" size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>{tr('Editar', 'Edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.swipeActionBtn, { backgroundColor: item.silenced ? '#34C759' : '#FF9500' }]}
              onPress={() => {
                closeSmartCardRowSwipe();
                if (item.silenced) {
                  void toggleCardSilence(item);
                } else {
                  Alert.alert(
                    tr('Silenciar tarjeta', 'Silence card'),
                    tr(
                      'Nadie podrá llamarte desde esta tarjeta mientras esté silenciada.',
                      'No one will be able to call you from this card while silenced.',
                    ),
                    [
                      { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
                      { text: tr('Silenciar', 'Silence'), onPress: () => void toggleCardSilence(item) },
                    ],
                  );
                }
              }}
              accessibilityLabel={item.silenced ? tr('Reactivar tarjeta', 'Unmute card') : tr('Silenciar tarjeta', 'Silence card')}
            >
              <MaterialCommunityIcons name={item.silenced ? 'volume-high' : 'volume-off'} size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>{item.silenced ? tr('Activar', 'Unmute') : tr('Silenciar', 'Silence')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.swipeActionBtn, { backgroundColor: cardsTheme.subscriberSwipeRevokeBg }]}
              onPress={() => {
                closeSmartCardRowSwipe();
                toggleFavoriteCard(item);
              }}
              accessibilityLabel={
                item.isFavorite
                  ? tr('Quitar de favoritos', 'Remove from favorites')
                  : tr('Marcar favorito', 'Mark as favorite')
              }
            >
              <MaterialCommunityIcons name={item.isFavorite ? 'star' : 'star-outline'} size={16} color="#FFFFFF" />
              <Text style={[styles.swipeActionText, styles.swipeFavoriteSwipeLabel]} numberOfLines={2}>
                {item.isFavorite ? tr('Quitar favorito', 'Unfavorite') : tr('Marcar favorito', 'Favorite')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.swipeDeleteBtn, { backgroundColor: cardsTheme.swipeDeleteBg }]}
              onPress={() => {
                closeSmartCardRowSwipe();
                deleteCard(item);
              }}
              accessibilityLabel={tr('Eliminar tarjeta', 'Delete card')}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>{tr('Eliminar', 'Delete')}</Text>
            </TouchableOpacity>
          </View>
        )}
      >
        <View style={[styles.cardItem, isLandscape && styles.cardItemLandscape, { borderColor: chestTheme.borderColor, borderWidth: chestTheme.borderWidth }]}>
          <LinearGradient
            colors={[...chestTheme.gradient]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          {item.wallpaperUrl ? (
            <Animated.Image
              source={{ uri: item.wallpaperUrl }}
              style={[
                styles.wallpaperFill,
                item.enableParallax
                  ? { transform: [{ translateX: parallaxX }, { translateY: parallaxY }, { scale: 1.06 }] }
                  : null,
              ]}
              resizeMode={getWallpaperResizeMode()}
            />
          ) : null}
          <TouchableOpacity
            style={styles.cardRowTouchable}
            onPress={() => {
              requestAnimationFrame(() => {
                closeAllCardSwipes();
                openPreviewCard(item);
              });
            }}
            onLongPress={() => enterCardsReorderRef.current?.()}
            delayLongPress={420}
            activeOpacity={0.92}
          >
            <View style={styles.cardRowInner}>
              <AutoScaleText
                maxLines={2}
                style={[
                  styles.cardTitle,
                  styles.cardRowTitle,
                  { color: chestTheme.titleColor },
                  item.fontFamily ? { fontFamily: item.fontFamily } : null,
                ]}
              >
                {item.scName}
              </AutoScaleText>
              <Text style={[styles.cardRowThemeSubtitle, { color: chestTheme.metaColor }]} numberOfLines={1}>
                {themeLabel}
              </Text>
              <View style={styles.cardRowStatsRow}>
                <TouchableOpacity
                  style={[
                    styles.metricPill,
                    { borderColor: chestTheme.borderColor, backgroundColor: 'rgba(255,255,255,0.72)' },
                  ]}
                  onPress={() => {
                    closeSmartCardRowSwipe();
                    openSubscribersModal(item);
                  }}
                >
                  <MaterialCommunityIcons name="account-group-outline" size={13} color={metricPillFg} />
                  <Text style={[styles.metricPillText, { color: metricPillFg }]}>{holders}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cardRowStatsBtn}
            onPress={() => {
              closeSmartCardRowSwipe();
              openCardAnalytics(item);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={tr('Estadísticas', 'Statistics')}
          >
            <MaterialCommunityIcons name="chart-line-variant" size={17} color="rgba(233,195,73,0.95)" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cardRowFavoriteBtn}
            onPress={() => {
              closeSmartCardRowSwipe();
              void toggleFavoriteCard(item);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={item.isFavorite ? tr('Quitar de favoritos', 'Remove from favorites') : tr('Marcar favorito', 'Mark as favorite')}
          >
            <MaterialCommunityIcons
              name={item.isFavorite ? 'heart' : 'heart-outline'}
              size={18}
              color={item.isFavorite ? cardsTheme.favoriteActive : chestTheme.titleColor}
            />
          </TouchableOpacity>
        </View>
      </Swipeable>
    );
  };

  const renderDraggableFeedItem = ({ item, drag, isActive }: RenderItemParams<CardsFeedListItem>) => {
    if (item.kind === 'business') {
      const row = item;
      const chestTheme = getCardRowTheme(row.themeId);
      const themeMeta = getThemeById(row.themeId || '') ?? CHEST_THEMES[0];
      const holders = row.holdersCount ?? 0;
      const metricPillFg = resolvePillForegroundColor({
        cardGradient: chestTheme.gradient,
        pillBackground: 'rgba(255,255,255,0.72)',
        preferredColor: chestTheme.iconColor,
      });
      const logoUri = toRenderableImageUri(row.bcLogoUrl);
      return (
        <ScaleDecorator>
          <TouchableOpacity
            onLongPress={drag}
            disabled={isActive}
            delayLongPress={180}
            activeOpacity={0.95}
            style={[styles.swipeWrap, isLandscape && styles.swipeWrapLandscape]}
            accessibilityLabel={tr('Mantén y arrastra para mover', 'Hold and drag to move')}
          >
            <View
              style={[
                styles.cardItem,
                isLandscape && styles.cardItemLandscape,
                {
                  borderColor: chestTheme.borderColor,
                  borderWidth: chestTheme.borderWidth,
                  opacity: isActive ? 0.92 : 1,
                },
              ]}
            >
              <LinearGradient
                colors={[...chestTheme.gradient]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={[styles.cardRowTouchable, styles.reorderRowPad]}>
                <View style={[styles.cardRowInner, styles.businessCardListInner, styles.businessCardRowInner]}>
                  <View style={styles.businessListMainRow}>
                    {logoUri ? (
                      <ExpoImage
                        source={{ uri: logoUri }}
                        style={[styles.businessListLogo, { borderColor: chestTheme.borderColor }]}
                        cachePolicy="memory"
                        recyclingKey={logoUri}
                        transition={120}
                      />
                    ) : (
                      <View style={[styles.businessListLogoPh, { borderColor: chestTheme.borderColor }]}>
                        <MaterialCommunityIcons name="storefront-outline" size={35} color={chestTheme.titleColor} />
                      </View>
                    )}
                    <View style={styles.businessListTextCol}>
                      <AutoScaleText
                        maxLines={2}
                        style={[styles.cardTitle, styles.businessListTitle, { color: chestTheme.titleColor }]}
                      >
                        {row.bcName}
                      </AutoScaleText>
                      <Text style={[styles.businessListSubtitle, { color: chestTheme.metaColor }]} numberOfLines={1}>
                        {row.bcContactName.trim() ? row.bcContactName : themeMeta.name}
                      </Text>
                      {/*
                        Lista de MIS businesscards: antes había una fila con
                        pill de holders + estrellitas tipo Amazon + "X.X · N
                        reseñas". Se eliminó el rating por estrellas (el
                        sistema oficial son las medallas, que viven en el
                        modal de preview). El pill de holders se mantiene
                        porque sí da info útil sin entrar al modal.
                      */}
                      <View style={styles.businessCardStatsRow}>
                        <View
                          style={[
                            styles.metricPill,
                            { borderColor: chestTheme.borderColor, backgroundColor: 'rgba(255,255,255,0.72)' },
                          ]}
                          accessibilityRole="text"
                        >
                          <MaterialCommunityIcons name="account-group-outline" size={13} color={metricPillFg} />
                          <Text style={[styles.metricPillText, { color: metricPillFg }]}>{holders}</Text>
                        </View>
                      </View>
                    </View>
                    {sessionUid ? (
                      <View style={styles.businessListQrWrap} pointerEvents="none">
                        <QRCode
                          value={generatePublicBusinessWebUrl(row.bId, sessionUid)}
                          size={64}
                          color="#636366"
                          backgroundColor="#FFFFFF"
                          ecl="H"
                          {...(logoUri
                            ? {
                                logo: { uri: logoUri },
                                logoSize: 16,
                                logoMargin: 2,
                                logoBackgroundColor: '#FFFFFF',
                              }
                            : {})}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
              <View style={[styles.reorderHandleHint, { backgroundColor: cardsTheme.pillBg }]}>
                <MaterialCommunityIcons name="drag" size={18} color={cardsTheme.icon} />
              </View>
            </View>
          </TouchableOpacity>
        </ScaleDecorator>
      );
    }

    const card = item.card;
    const chestTheme = getCardRowTheme(card.themeId);
    const holders = card.holdersCount ?? 0;
    const metricPillFg = resolvePillForegroundColor({
      cardGradient: chestTheme.gradient,
      pillBackground: 'rgba(255,255,255,0.72)',
      preferredColor: chestTheme.iconColor,
    });
    const themeMeta = getThemeById(card.themeId || '') ?? CHEST_THEMES[0];
    const themeLabel = themeMeta.name;

    return (
      <ScaleDecorator>
        <TouchableOpacity
          onLongPress={drag}
          disabled={isActive}
          delayLongPress={180}
          activeOpacity={0.95}
          style={[styles.swipeWrap, isLandscape && styles.swipeWrapLandscape]}
          accessibilityLabel={tr('Mantén y arrastra para mover', 'Hold and drag to move')}
        >
          <View
            style={[
              styles.cardItem,
              isLandscape && styles.cardItemLandscape,
              {
                borderColor: chestTheme.borderColor,
                borderWidth: chestTheme.borderWidth,
                opacity: isActive ? 0.92 : 1,
              },
            ]}
          >
            <LinearGradient
              colors={[...chestTheme.gradient]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            {card.wallpaperUrl ? (
              <Animated.Image
                source={{ uri: card.wallpaperUrl }}
                style={[
                  styles.wallpaperFill,
                  card.enableParallax
                    ? { transform: [{ translateX: parallaxX }, { translateY: parallaxY }, { scale: 1.06 }] }
                    : null,
                ]}
                resizeMode={getWallpaperResizeMode()}
              />
            ) : null}
            <View style={[styles.cardRowTouchable, styles.reorderRowPad]}>
              <View style={styles.cardRowInner}>
                <AutoScaleText
                  maxLines={2}
                  style={[
                    styles.cardTitle,
                    styles.cardRowTitle,
                    { color: chestTheme.titleColor },
                    card.fontFamily ? { fontFamily: card.fontFamily } : null,
                  ]}
                >
                  {card.scName}
                </AutoScaleText>
                <Text style={[styles.cardRowThemeSubtitle, { color: chestTheme.metaColor }]} numberOfLines={1}>
                  {themeLabel}
                </Text>
                <View style={styles.cardRowStatsRow}>
                  <View
                    style={[
                      styles.metricPill,
                      { borderColor: chestTheme.borderColor, backgroundColor: 'rgba(255,255,255,0.72)' },
                    ]}
                  >
                    <MaterialCommunityIcons name="account-group-outline" size={13} color={metricPillFg} />
                    <Text style={[styles.metricPillText, { color: metricPillFg }]}>{holders}</Text>
                  </View>

                </View>
              </View>
            </View>
            <View style={[styles.reorderHandleHint, { backgroundColor: cardsTheme.pillBg }]}>
              <MaterialCommunityIcons name="drag" size={18} color={cardsTheme.icon} />
            </View>
          </View>
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };

  if (!isCardsUnlocked) {
    return (
      <View style={[styles.container, { backgroundColor: cardsTheme.backgroundSolid }]}>
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="shield-lock-outline" size={56} color={cardsTheme.icon} />
          <Text style={[styles.emptyTitle, { color: cardsTheme.text }]}>
            {tr('Acceso biométrico requerido', 'Biometric access required')}
          </Text>
          <Text style={[styles.emptyText, { color: cardsTheme.modalSubtitle }]}>
            {tr('Autoriza Face ID o Touch ID para entrar a Mis tarjetas.', 'Authorize Face ID or Touch ID to open My Cards.')}
          </Text>
          <TouchableOpacity
            style={[styles.firstQrBtn, { backgroundColor: cardsTheme.btnPrimary }]}
            onPress={async () => {
              const authenticated = await hardLockCheck(tr('acceso a Business Cards', 'access to Business Cards'));
              setIsCardsUnlocked(authenticated);
              if (authenticated) {
                const uid = await getActiveUserId();
                setSessionUid(uid ?? null);
                loadVaultItems();
                loadSmartCards();
                void loadBusinessCardsFeed();
              }
            }}
          >
            <MaterialCommunityIcons name="fingerprint" size={18} color={cardsTheme.btnPrimaryText} />
            <Text style={[styles.firstQrBtnText, { color: cardsTheme.btnPrimaryText }]}>{tr('Desbloquear', 'Unlock')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const businessSlotBlocked = Boolean(cardSlotCaps && cardSlotCaps.businessUsed >= cardSlotCaps.businessMax);
  const smartSlotBlocked = Boolean(cardSlotCaps && cardSlotCaps.smartCurrent >= cardSlotCaps.smartMax);

  return (
    <View style={[styles.container, { backgroundColor: cardsTheme.backgroundSolid }]}>
      <View style={[styles.headerRow, { borderBottomColor: cardsTheme.divider }]}> 
        <View>
          <Text style={[styles.headerTitle, { color: cardsTheme.text }]}>{tr('Mis Tarjetas', 'My Cards')}</Text>
          <Text style={[styles.headerSubtitle, { color: cardsTheme.sectionLabel }]}>
            {cardSlotCaps
              ? `${cardSlotCaps.smartCurrent}/${cardSlotCaps.smartMax} Smart · ${cardSlotCaps.businessUsed}/${cardSlotCaps.businessMax} ${tr('negocio', 'business')}`
              : tr('Cargando límites…', 'Loading limits…')}
          </Text>
        </View>
        <View style={styles.headerActionsRow}>
          <TouchableOpacity
            onPress={() => {
              void (async () => {
                const uid = await getActiveUserId();
                if (!uid) {
                  return;
                }
                const slots = await getBusinessCardSlotAvailability(uid);
                if (!slots.canCreate) {
                  router.push('/vault_store' as never);
                  return;
                }
                router.push({
                  pathname: '/(tabs)/createBusinessCard',
                  params: { mode: 'new', fresh: String(Date.now()) },
                } as any);
              })();
            }}
            activeOpacity={businessSlotBlocked ? 1 : 0.9}
            disabled={businessSlotBlocked}
            style={[styles.businessCtaWrap, businessSlotBlocked ? { opacity: 0.5 } : null]}
            accessibilityRole="button"
            accessibilityLabel={tr('Crear Business Card', 'Create Business Card')}
          >
            <LinearGradient
              colors={[...cardsTheme.vipBannerGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.businessCta}
            >
              <View style={styles.businessCtaIcon}>
                <MaterialCommunityIcons name="diamond-stone" size={14} color={cardsTheme.vipBannerDiamondIcon} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.businessCtaTitle}>{tr('Tarjeta de Negocio', 'Business Card')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={16} color={cardsTheme.vipBannerChevron} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {cardsReorderMode && !isLandscape ? (
        <View style={styles.cardsReorderListWrap}>
          <View
            style={[styles.cardsReorderBanner, { backgroundColor: cardsTheme.surfaceMuted, borderBottomColor: cardsTheme.divider }]}
          >
            <Text style={[styles.cardsReorderBannerText, { color: cardsTheme.text }]}>
              {tr(
                'Mantén pulsado y arrastra. Listo guarda el orden.',
                'Hold and drag to reorder. Done saves the order.',
              )}
            </Text>
            <TouchableOpacity
              style={[styles.reorderBannerBtn, { backgroundColor: cardsTheme.inputBg }]}
              onPress={cancelCardsReorder}
              accessibilityRole="button"
              accessibilityLabel={tr('Cancelar orden', 'Cancel reorder')}
            >
              <Text style={[styles.reorderBannerBtnText, { color: cardsTheme.text }]}>{tr('Cancelar', 'Cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reorderBannerBtn, { backgroundColor: cardsTheme.btnPrimary }]}
              onPress={() => void commitCardsReorder()}
              accessibilityRole="button"
              accessibilityLabel={tr('Guardar orden', 'Save order')}
            >
              <Text style={[styles.reorderBannerBtnText, { color: cardsTheme.btnPrimaryText }]}>{tr('Listo', 'Done')}</Text>
            </TouchableOpacity>
          </View>
          <DraggableFlatList
            style={styles.cardsReorderDraggableList}
            containerStyle={styles.cardsReorderDraggableList}
            data={reorderDraftData}
            keyExtractor={(item) => cardsFeedItemKey(item)}
            onDragEnd={({ data }) => setReorderDraftData(data)}
            renderItem={renderDraggableFeedItem}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            key="cards-reorder-portrait"
            contentContainerStyle={styles.cardsList}
            bounces={false}
            overScrollMode="never"
            activationDistance={12}
          />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={filteredFeed}
          keyExtractor={(item) => cardsFeedItemKey(item)}
          renderItem={({ item }) => {
            if (item.kind === 'business') {
              const { kind: _k, ...bizRow } = item;
              return renderBusinessCardRow(bizRow);
            }
            return renderCard({ item: item.card });
          }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          horizontal={isLandscape}
          pagingEnabled={isLandscape}
          snapToAlignment={isLandscape ? 'start' : undefined}
          snapToInterval={isLandscape ? width * 0.84 : undefined}
          decelerationRate={isLandscape ? 'fast' : 'normal'}
          showsHorizontalScrollIndicator={false}
          key={isLandscape ? 'cards-landscape' : 'cards-portrait'}
          contentContainerStyle={[styles.cardsList, isLandscape && styles.cardsListLandscape]}
          bounces={false}
          overScrollMode="never"
          onScrollBeginDrag={closeAllCardSwipes}
          ListFooterComponent={
            <Pressable onPress={closeAllCardSwipes} style={{ minHeight: 120 }} />
          }
          refreshControl={
            !isLandscape ? (
              <RefreshControl
                refreshing={refreshingCards}
                onRefresh={async () => {
                  setRefreshingCards(true);
                  await loadSmartCards();
                  await loadBusinessCardsFeed();
                  setRefreshingCards(false);
                }}
                tintColor={cardsTheme.tint}
                colors={[cardsTheme.tint]}
              />
            ) : undefined
          }
          ListEmptyComponent={
            cardSearchQuery.trim().length > 0 ? (
              <View style={styles.emptyWrap}>
                <MaterialCommunityIcons name="magnify" size={52} color={cardsTheme.sectionLabel} />
                <Text style={[styles.emptyTitle, { color: cardsTheme.text }]}>{tr('Sin coincidencias', 'No matches')}</Text>
                <Text style={[styles.emptyText, { color: cardsTheme.modalSubtitle }]}>
                  {tr(
                    'Prueba con otras palabras o sinónimos. También puedes revisar tu conexión.',
                    'Try different words or synonyms. You can also check your connection.',
                  )}
                </Text>
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <MaterialCommunityIcons name="credit-card-plus-outline" size={52} color={cardsTheme.icon} />
                <Text style={[styles.emptyTitle, { color: cardsTheme.text }]}>{tr('Sin tarjetas todavía', 'No cards yet')}</Text>
                <Text style={[styles.emptyText, { color: cardsTheme.modalSubtitle }]}>
                  {tr(
                    'Crea una Smart Card con datos del Vault o una Tarjeta de negocio con el botón de lujo.',
                    'Create a Smart Card with Vault data or a Business card with the luxury button.',
                  )}
                </Text>
              </View>
            )
          }
        />
      )}

      {/* Search bar — fixed above FAB */}
      {(smartCards.length > 0 || businessCardsFeed.length > 0) && (
        <View
          style={[
            styles.cardSearchWrap,
            { backgroundColor: cardsTheme.inputBg, borderColor: cardsTheme.divider },
            cardsReorderMode ? { opacity: 0.45 } : null,
          ]}
          pointerEvents={cardsReorderMode ? 'none' : 'auto'}
        >
          <MaterialCommunityIcons name="magnify" size={18} color={cardsTheme.sectionLabel} />
          <TextInput
            style={[styles.cardSearchInput, { color: cardsTheme.inputText }]}
            placeholder={tr(
              'Buscar nombre o datos enlazados (títulos, enlaces, texto…)',
              'Search name or linked data (titles, links, text…)'
            )}
            placeholderTextColor={cardsTheme.sectionLabel}
            value={cardSearchQuery}
            onChangeText={setCardSearchQuery}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {cardSearchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                Keyboard.dismiss();
                setCardSearchQuery('');
              }}
              accessibilityLabel={tr('Limpiar', 'Clear')}
            >
              <MaterialCommunityIcons name="close-circle" size={16} color={cardsTheme.sectionLabel} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.createFab,
          { backgroundColor: cardsTheme.fabBg, opacity: cardsReorderMode ? 0.35 : smartSlotBlocked ? 0.45 : 1 },
        ]}
        onPress={openCreateFactory}
        activeOpacity={0.82}
        disabled={cardsReorderMode || smartSlotBlocked}
      >
        <MaterialCommunityIcons name="plus" size={20} color={cardsTheme.fabText} />
        <Text style={[styles.createFabText, { color: cardsTheme.fabText }]}>{tr('Crear', 'Create')}</Text>
      </TouchableOpacity>

      <Modal
        visible={factoryVisible}
        transparent
        animationType="slide"
        onRequestClose={closeFactoryModalAndSync}
        statusBarTranslucent
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={[styles.modalOverlay, { backgroundColor: cardsTheme.modalOverlay }]}>
                <View
                  style={[
                    styles.factoryModal,
                    {
                      backgroundColor: cardsTheme.modalBg,
                      borderColor: cardsTheme.modalBorder,
                      paddingTop: 16 + safeAreaInsets.top,
                    },
                  ]}
                >

                  {/* Header */}
                  <View style={styles.factoryHeaderRow}>
                    <Text style={[styles.factoryTitle, { color: cardsTheme.modalTitle, marginBottom: 0 }]}>
                      {selectedCard ? tr('Editar Smart Card', 'Edit Smart Card') : tr('Nueva Smart Card', 'New Smart Card')}
                    </Text>
                    <TouchableOpacity
                      onPress={closeFactoryModalAndSync}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      accessibilityLabel={tr('Cerrar', 'Close')}
                    >
                      <MaterialCommunityIcons name="close" size={22} color={cardsTheme.sectionLabel} />
                    </TouchableOpacity>
                  </View>

                  {/* Identity — read-only */}
                  <View style={[styles.identityAutoRow, { backgroundColor: cardsTheme.inputBg, borderColor: cardsTheme.modalBorder }]}>
                    {issuerIdentity.userAvatarUrl ? (
                      <ExpoImage source={{ uri: issuerIdentity.userAvatarUrl }} style={styles.identityAvatarLg} cachePolicy="disk" />
                    ) : (
                      <View style={styles.identityAvatarLgFallback}>
                        <MaterialCommunityIcons name="account" size={32} color={cardsTheme.ctaAccent} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.identityFullName, { color: cardsTheme.text }]} numberOfLines={1}>
                        {issuerIdentity.userFullName || tr('Nombre Completo', 'Full Name')}
                      </Text>
                      <Text style={[styles.identityHandle, { color: cardsTheme.sectionLabel }]} numberOfLines={1}>
                        @{String(issuerIdentity.userNickName || 'user').toLowerCase().replace(/\s+/g, '')}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.factoryFieldLabel, { color: cardsTheme.sectionLabel }]}>{tr('Nombre de Tarjeta', 'Card Name')}</Text>

                  {/* Card name input */}
                  <TextInput
                    style={[styles.input, { backgroundColor: cardsTheme.inputBg, color: cardsTheme.inputText, borderColor: cardsTheme.modalBorder }]}
                    placeholder={tr('Nombre de Tarjeta', 'Card Name')}
                    placeholderTextColor={cardsTheme.sectionLabel}
                    value={cardName}
                    onChangeText={setCardName}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />

                  {/* Action buttons: DATA + TEMAS */}
                  <View style={styles.factoryActionRow}>
                    <TouchableOpacity
                      style={[styles.factoryActionBtn, { borderColor: cardsTheme.modalBorder, backgroundColor: cardsTheme.inputBg }]}
                      onPress={openDataSelector}
                      activeOpacity={0.82}
                    >
                      <MaterialCommunityIcons name="database-plus-outline" size={18} color={cardsTheme.icon} />
                      <Text style={[styles.factoryActionBtnText, { color: cardsTheme.text }]}>{tr('Agregar DATA', 'Add DATA')}</Text>
                      {factoryResolvedDataCount > 0 && (
                        <View style={styles.factoryActionBadge}>
                          <Text style={styles.factoryActionBadgeText}>{factoryResolvedDataCount}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.factoryActionBtn, { borderColor: cardsTheme.modalBorder, backgroundColor: cardsTheme.inputBg }]}
                      onPress={() => {
                        void refreshThemes();
                        resumeFactoryAfterAuxModalRef.current = factoryVisible;
                        if (factoryVisible) {
                          setFactoryVisible(false);
                        }
                        requestAnimationFrame(() => {
                          setThemesPlaceholderVisible(true);
                        });
                      }}
                      activeOpacity={0.82}
                    >
                      <MaterialCommunityIcons name="palette-outline" size={18} color={cardsTheme.icon} />
                      <Text style={[styles.factoryActionBtnText, { color: cardsTheme.text }]}>{tr('Agregar TEMAS', 'Add THEMES')}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Card preview — solo el interior del marco hace scroll */}
                  <View style={styles.factoryPreviewWrap}>
                    <View style={[styles.factoryPreviewStage, { backgroundColor: isDark ? 'rgba(8,18,30,0.72)' : 'rgba(255,255,255,0.36)', borderColor: cardsTheme.modalBorder }] }>
                      <View
                        style={[
                          styles.factoryPreviewCardFrame,
                          { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.15)' },
                          factoryWireIconRows >= 3
                            ? { minHeight: Math.min(height * 0.44, 520) }
                            : { minHeight: Math.min(height * 0.34, 380) },
                        ]}
                      >
                        <ScrollView
                          style={styles.factoryPreviewInnerScroll}
                          contentContainerStyle={styles.factoryPreviewInnerScrollContent}
                          keyboardShouldPersistTaps="handled"
                          showsVerticalScrollIndicator
                          nestedScrollEnabled
                          bounces
                        >
                          {editSlots.filter((s) => s.item !== null).length === 0 ? (
                            <View style={styles.factoryPreviewEmpty}>
                              <MaterialCommunityIcons name="card-plus-outline" size={38} color={isDark ? 'rgba(235,235,245,0.32)' : 'rgba(28,28,30,0.18)'} />
                              <Text style={[styles.factoryPreviewEmptyText, { color: cardsTheme.sectionLabel }]}>
                                {tr('Agrega DATA para ver tu tarjeta aquí', 'Add DATA to see your card here')}
                              </Text>
                            </View>
                          ) : (
                            <View
                              style={[
                                styles.factoryPreviewScaledOuter,
                                {
                                  width: factoryPreviewScaledCard.scaledW,
                                  height: factoryPreviewScaledCard.scaledH,
                                },
                              ]}
                            >
                              <View
                                style={{
                                  position: 'absolute',
                                  left: factoryPreviewScaledCard.left,
                                  top: factoryPreviewScaledCard.top,
                                  width: factoryPreviewScaledCard.baseW,
                                  height: factoryPreviewScaledCard.baseH,
                                  transform: [{ scale: factoryPreviewScaledCard.scale }],
                                }}
                              >
                                {renderWireframeCard({
                                  layout: isLandscape ? 'horizontal' : 'vertical',
                                  slots: editSlots.filter((s) => s.item !== null),
                                  editable: false,
                                  theme: resolveTheme(themeId),
                                  wallpaperUrl: selectedWallpaper?.fullUrl,
                                  mirrorStatsCapsuleScale: factoryPreviewMirrorScale,
                                  medalPills: factorySmartMedalPills,
                                })}
                              </View>
                            </View>
                          )}
                        </ScrollView>
                      </View>
                    </View>
                  </View>

                  {/* Footer buttons — respect system nav / home indicator (Android + iOS) */}
                  <View
                    style={[
                      styles.modalActions,
                      {
                        paddingBottom: modalFooterBottomPad,
                        backgroundColor: cardsTheme.modalBg,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={[styles.ghostBtn, { backgroundColor: cardsTheme.btnGhost, borderColor: cardsTheme.modalBorder }]}
                      onPress={closeFactoryModalAndSync}
                    >
                      <Text style={[styles.ghostBtnText, { color: cardsTheme.btnGhostText }]}>{tr('Cancelar', 'Cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.saveBtn, { backgroundColor: cardsTheme.btnPrimary, opacity: isSaving ? 0.5 : 1 }]} onPress={handleSaveCard} disabled={isSaving}>
                      <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>{isSaving ? tr('Guardando…', 'Saving…') : tr('Guardar', 'Save')}</Text>
                    </TouchableOpacity>
                  </View>

                </View>
            </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* DataSelector — Vault mirror for bulk icon selection */}
      <Modal
        visible={dataSelectorVisible}
        transparent
        animationType="slide"
        onRequestClose={cancelDataSelector}
      >
        <View style={[styles.modalOverlay, styles.dataSelectorOverlay, { backgroundColor: cardsTheme.modalOverlay }]}>
          <View
            style={[
              styles.dataSelectorModal,
              {
                backgroundColor: cardsTheme.modalBg,
                borderColor: cardsTheme.modalBorder,
                paddingTop: 14 + safeAreaInsets.top,
              },
            ]}
          >

            {/* Header */}
            <View style={styles.dataSelectorHeader}>
              <Text style={[styles.factoryTitle, { color: cardsTheme.modalTitle, marginBottom: 0, fontSize: 17 }]}>
                {tr('Selecciona datos', 'Select data')}
              </Text>
              <View style={styles.dataSelectorCounterWrap}>
                <Text style={[styles.dataSelectorCounter, { color: tempSelectedIds.length >= MAX_CARD_SLOTS ? cardsTheme.danger : cardsTheme.icon }]}>
                  {tempSelectedIds.length} / {MAX_CARD_SLOTS}
                </Text>
              </View>
              <TouchableOpacity onPress={cancelDataSelector} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel={tr('Cerrar', 'Close')}>
                <MaterialCommunityIcons name="close" size={20} color={cardsTheme.sectionLabel} />
              </TouchableOpacity>
            </View>

            <View style={styles.dataSelectorToolsRow}>
              <View
                style={[
                  styles.dataSelectorSearchBox,
                  { backgroundColor: cardsTheme.inputBg, borderColor: cardsTheme.modalBorder },
                ]}
              >
                <MaterialCommunityIcons name="magnify" size={18} color={cardsTheme.sectionLabel} />
                <TextInput
                  style={[styles.dataSelectorSearchInput, { color: cardsTheme.inputText }]}
                  placeholder={tr('Buscar dato...', 'Search data...')}
                  placeholderTextColor={cardsTheme.sectionLabel}
                  value={dataSelectorQuery}
                  onChangeText={setDataSelectorQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {dataSelectorQuery.trim() ? (
                  <TouchableOpacity
                    onPress={() => setDataSelectorQuery('')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel={tr('Limpiar búsqueda', 'Clear search')}
                  >
                    <MaterialCommunityIcons name="close-circle" size={17} color={cardsTheme.sectionLabel} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity
                style={[styles.dataSelectorSortBtn, { backgroundColor: cardsTheme.inputBg, borderColor: cardsTheme.modalBorder }]}
                onPress={openDataSelectorSortOptions}
                activeOpacity={0.82}
              >
                <MaterialCommunityIcons name="sort" size={17} color={cardsTheme.icon} />
                <Text style={[styles.dataSelectorSortText, { color: cardsTheme.text }]}>
                  {dataSelectorSort === 'alpha' ? tr('Alfabético', 'A-Z') : tr('Reciente', 'Recent')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Limit reached banner */}
            {dataSelectorLimitReached && (
              <View
                style={[
                  styles.dataSelectorLimitBanner,
                  {
                    backgroundColor: isDark ? cardsTheme.dangerBannerBgDark : cardsTheme.dangerBannerBg,
                    borderColor: isDark ? cardsTheme.dangerBannerBorderDark : cardsTheme.dangerBannerBorder,
                  },
                ]}
              >
                <MaterialCommunityIcons name="alert-circle-outline" size={14} color={cardsTheme.danger} />
                <Text style={styles.dataSelectorLimitText}>{tr(`Máximo ${MAX_CARD_SLOTS} iconos por tarjeta`, `Maximum ${MAX_CARD_SLOTS} icons per card`)}</Text>
              </View>
            )}

            {/* Vault icon grid */}
            {vaultItems.length === 0 ? (
              <View style={styles.dataSelectorEmpty}>
                <MaterialCommunityIcons name="database-off-outline" size={40} color={cardsTheme.sectionLabel} />
                <Text style={[styles.dataSelectorEmpty, { color: cardsTheme.sectionLabel }]}> 
                  {tr('Tu Vault está vacío.\nAgrega datos primero desde Bóveda.', 'Your Vault is empty.\nAdd data from Vault first.')}
                </Text>
              </View>
            ) : filteredVaultItemsForSelector.length === 0 ? (
              <View style={styles.dataSelectorEmpty}>
                <MaterialCommunityIcons name="database-search-outline" size={40} color={cardsTheme.sectionLabel} />
                <Text style={[styles.dataSelectorEmpty, { color: cardsTheme.sectionLabel }]}>
                  {tr('No encontramos datos con esa búsqueda.', 'No data matched that search.')}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredVaultItemsForSelector}
                keyExtractor={(item) => item.id}
                numColumns={3}
                bounces={false}
                overScrollMode="never"
                renderItem={({ item }) => {
                  const selectedOrder = tempSelectedIds.indexOf(item.id) + 1;
                  const isSelected = selectedOrder > 0;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.selectorItemTile,
                        {
                          borderColor: cardsTheme.border,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : cardsTheme.surface,
                        },
                        isSelected && [
                          styles.selectorItemTileSelected,
                          { backgroundColor: isDark ? 'rgba(197,160,101,0.14)' : cardsTheme.typeBadgeBg },
                        ],
                      ]}
                      onPress={() => handleSelectorToggle(item.id)}
                      activeOpacity={0.75}
                    >
                      {isSelected && (
                        <View style={styles.selectorCheckOverlay}>
                          <Text style={styles.selectorOrderText}>{selectedOrder}</Text>
                        </View>
                      )}
                      <View
                        style={[
                          styles.selectorIconCircle,
                          {
                            backgroundColor: dataSelectorCardTheme.bubble.backgroundColor,
                            borderColor: dataSelectorCardTheme.border.color,
                            borderWidth: Math.max(1, dataSelectorCardTheme.border.width * 0.5),
                          },
                        ]}
                      >
                        {renderVaultMiniIcon(item, 26, dataSelectorCardTheme.icon.color)}
                      </View>
                      <Text style={[styles.selectorItemTitle, { color: cardsTheme.text }]} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={[styles.selectorItemType, { color: cardsTheme.sectionLabel }]} numberOfLines={1}>
                        {item.type}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
                style={styles.selectorGrid}
                contentContainerStyle={styles.selectorGridContent}
              />
            )}

            {/* Floating upsell */}
            <TouchableOpacity style={styles.dataSelectorUpsellBtn} activeOpacity={0.85}>
              <MaterialCommunityIcons name="star-circle-outline" size={15} color={cardsTheme.modalTitle} />
              <Text style={styles.dataSelectorUpsellText}>{tr('Consigue tu coleccionable', 'Get your collectible')}</Text>
            </TouchableOpacity>

            {/* Footer */}
            <View style={[styles.modalActions, { paddingBottom: modalFooterBottomPad }]}>
              <TouchableOpacity
                style={[styles.ghostBtn, { backgroundColor: cardsTheme.btnGhost, borderColor: cardsTheme.modalBorder }]}
                onPress={cancelDataSelector}
              >
                <Text style={[styles.ghostBtnText, { color: cardsTheme.btnGhostText }]}>{tr('Cancelar', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: cardsTheme.btnPrimary }]}
                onPress={confirmDataSelector}
              >
                <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>
                  {tr('Confirmar', 'Confirm')} ({tempSelectedIds.length})
                </Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* ThemesPlaceholder — small centered popup, no overlay blur */}
      <Modal
        visible={themesPlaceholderVisible}
        transparent
        animationType="fade"
        onRequestClose={closeThemesPickerModal}
      >
        <TouchableWithoutFeedback onPress={closeThemesPickerModal}>
          <View style={styles.themesPopupOverlay}>
            <TouchableWithoutFeedback onPress={() => {}} accessible={false}>
              <View style={[styles.themesPopupBox, { backgroundColor: cardsTheme.modalBg, borderColor: cardsTheme.modalBorder }]}>

                <View style={styles.factoryHeaderRow}>
                  <Text style={[styles.factoryTitle, { color: cardsTheme.modalTitle, marginBottom: 0 }]}>
                    {tr('Temas de Tarjeta', 'Card Themes')}
                  </Text>
                  <TouchableOpacity
                    onPress={closeThemesPickerModal}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <MaterialCommunityIcons name="close" size={22} color={cardsTheme.sectionLabel} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.themesLockerScroll}
                  contentContainerStyle={styles.themesLockerScrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  overScrollMode="never"
                  onLayout={(e) => {
                    const w = e.nativeEvent.layout.width;
                    if (w > 0) {
                      setThemesModalContentW((prev) => (Math.abs((prev ?? 0) - w) > 0.5 ? w : prev));
                    }
                  }}
                >
                  {(['fresh', 'moderno', 'luxury'] as ThemeTier[]).map((tier) => {
                    const meta = TIER_META[tier];
                    const tierThemes = getThemesByTier(tier);
                    return (
                      <View key={tier} style={styles.themesLockerTierSection}>
                        <View style={styles.themesLockerTierHeader}>
                          <Text style={styles.themesLockerTierEmoji}>{meta.emoji}</Text>
                          <Text style={[styles.themesLockerTierLabel, { color: cardsTheme.text }]}>
                            {language === 'en' || language === 'de' ? meta.label[1] : meta.label[0]}
                          </Text>
                          <View
                            style={[
                              styles.themesLockerTierLine,
                              { backgroundColor: tier === 'luxury' ? '#E9C349' : cardsTheme.divider },
                            ]}
                          />
                        </View>
                        <View style={[styles.themesLockerTierGrid, { gap: THEME_LOCKER_TILE_GAP }]}>
                          {tierThemes.map((t) => (
                            <ThemeLockerThemeTile
                              key={t.id}
                              theme={t}
                              isActive={themeId === t.id}
                              isUnlocked={isChestThemeUnlocked(t)}
                              tileWidth={themesModalTileWidth}
                              onPress={() => {
                                if (!isChestThemeUnlocked(t)) {
                                  Toast.show({
                                    type: 'info',
                                    text1: tr('Tema bloqueado', 'Theme locked'),
                                    text2: tr(
                                      'Desbloquéalo en Locker de Estilos o La Fragua.',
                                      'Unlock it in Theme Locker or The Forge.',
                                    ),
                                    position: 'bottom',
                                    visibilityTime: 2800,
                                  });
                                  return;
                                }
                                setThemeId(t.id);
                                void Haptics.selectionAsync();
                              }}
                            />
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: cardsTheme.btnPrimary, marginTop: 12, marginBottom: modalFooterBottomPad }]}
                  onPress={closeThemesPickerModal}
                >
                  <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>{tr('Aceptar', 'Accept')}</Text>
                </TouchableOpacity>

              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <MyCardsPreviewModal
        key={
          previewVisible && previewCard
            ? `my-cards-preview-${previewCard.sid}-${(effectiveIssuerPreviewSmartCard?.itemIds ?? []).join(',')}`
            : 'my-cards-preview-closed'
        }
        visible={Boolean(previewVisible && previewCard)}
        onClose={() => {
          setPreviewVisible(false);
          setPreviewCard(null);
          refreshCardsTabFromServer();
        }}
        variant="issuer"
        payload={previewPayload}
        onEditCard={
          effectiveIssuerPreviewSmartCard != null
            ? () => {
                setPreviewVisible(false);
                openEditFactory(effectiveIssuerPreviewSmartCard);
              }
            : undefined
        }
        sourceSid={previewCard?.sid ?? null}
        sourceBId={null}
        sourceCardName={previewCard?.scName ?? cardName ?? tr('Tarjeta Social', 'Social Card')}
        peerDisplayName={
          issuerIdentity.voipCanonicalFullName || issuerIdentity.userFullName || tr('este contacto', 'this contact')
        }
        peerFullName={issuerIdentity.voipCanonicalFullName || undefined}
        peerNickname={issuerIdentity.userNickName || undefined}
        ghostCardContactName={null}
        ghostTargetUid={sessionUid}
        ratingCardType='smart'
      />

      <MyCardsPreviewModal
        key={
          previewBusinessVisible && previewBusiness
            ? `my-cards-biz-${previewBusiness.bId}-${(effectiveIssuerPreviewBusinessRow?.vaultLinkIds ?? []).join(',')}`
            : 'my-cards-biz-closed'
        }
        visible={Boolean(previewBusinessVisible && previewBusiness)}
        onClose={() => {
          setPreviewBusinessVisible(false);
          setPreviewBusiness(null);
          setPreviewBusinessOwnerUid('');
          refreshCardsTabFromServer();
        }}
        variant="issuer"
        payload={businessPreviewPayload}
        onEditCard={
          effectiveIssuerPreviewBusinessRow
            ? () => {
                const id = effectiveIssuerPreviewBusinessRow.bId;
                setPreviewBusinessVisible(false);
                setPreviewBusiness(null);
                setPreviewBusinessOwnerUid('');
                router.push({ pathname: '/(tabs)/createBusinessCard', params: { bId: id } } as any);
              }
            : undefined
        }
        sourceSid={null}
        sourceBId={previewBusiness?.bId ?? null}
        sourceCardName={previewBusiness?.bcName ?? tr('Negocio', 'Business')}
        peerDisplayName={
          issuerIdentity.voipCanonicalFullName || issuerIdentity.userFullName || tr('este contacto', 'this contact')
        }
        peerFullName={issuerIdentity.voipCanonicalFullName || undefined}
        peerNickname={issuerIdentity.userNickName || undefined}
        ghostCardContactName={String(previewBusiness?.bcContactName || '').trim() || null}
        ghostTargetUid={previewBusinessOwnerUid || sessionUid}
        ratingCardType='business'
      />

      <Modal
        visible={slotPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSlotPickerVisible(false);
          setActiveSlotIndex(null);
        }}
      >
        <View style={[styles.modalOverlay, { backgroundColor: cardsTheme.modalOverlay }]}> 
          <View style={[styles.slotPickerCard, { backgroundColor: cardsTheme.modalBg, borderColor: cardsTheme.modalBorder }]}> 
            <Text style={[styles.factoryTitle, { color: cardsTheme.modalTitle }]}>
              {tr('Elegir dato para el slot', 'Choose data for the slot')}
            </Text>
            <Text style={[styles.slotPickerSubtitle, { color: cardsTheme.modalSubtitle }]}> 
              {tr('Slot', 'Slot')} #{activeSlotIndex !== null ? activeSlotIndex + 1 : '-'}
            </Text>

            <FlatList
              data={vaultItems}
              keyExtractor={(item) => item.id}
              bounces={false}
              overScrollMode="never"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.slotPickerRow} onPress={() => assignVaultItemToSlot(item.id)}>
                  {renderVaultMiniIcon(item, 18)}
                  <Text style={styles.slotPickerTitle}>{item.title}</Text>
                  <Text style={styles.slotPickerType}>{item.type}</Text>
                </TouchableOpacity>
              )}
              style={styles.slotPickerList}
            />

            <TouchableOpacity
              style={[styles.ghostBtn, { backgroundColor: cardsTheme.btnGhost, borderColor: cardsTheme.modalBorder }]}
              onPress={() => {
                setSlotPickerVisible(false);
                setActiveSlotIndex(null);
              }}
            >
              <Text style={[styles.ghostBtnText, { color: cardsTheme.btnGhostText }]}>{tr('Cerrar', 'Close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={dataPopoverVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDataPopoverVisible(false);
          setFocusedDataItem(null);
          setFocusedCertificate(null);
        }}
      >
        <View style={[styles.modalOverlay, { backgroundColor: cardsTheme.modalOverlay }]}> 
          <View style={[styles.dataPopoverCard, { backgroundColor: cardsTheme.modalBg, borderColor: cardsTheme.modalBorder }]}> 
            <View style={styles.dataPopoverTop}>
              <View style={styles.previewIconBubble}>{renderVaultMiniIcon(focusedDataItem as VaultItem, 24)}</View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.dataPopoverTitle, { color: cardsTheme.modalTitle }]}>
                  {focusedDataItem?.title || tr('Dato', 'Item')}
                </Text>
                <Text style={[styles.dataPopoverType, { color: cardsTheme.sectionLabel }]}>
                  {focusedDataItem?.type || tr('Bóveda', 'Vault')}
                </Text>
              </View>
            </View>

            <Text style={[styles.dataPopoverHint, { color: cardsTheme.sectionLabel }]}>
              {focusedDataItem && isGhostLinkVaultType(focusedDataItem.type)
                ? tr(
                    'Ghost-Link: llamada VoIP privada desde la app. No usa número visible.',
                    'Ghost-Link: private VoIP call from the app. No visible phone number.',
                  )
                : tr('Valor protegido por Ghost-Link: solo acceso enrutado.', 'Ghost-Link protected value: routed access only.')}
            </Text>

            {focusedCertificate ? (
              <View style={styles.authCertBox}>
                <Text style={styles.authCertTitle}>
                  {tr('Certificado de autenticidad', 'Certificate of authenticity')}
                </Text>
                <Text style={styles.authCertText}>{focusedCertificate.value}</Text>
                <Text style={styles.authCertToken}>
                  {tr('ID del activo', 'Asset ID')}: {focusedCertificate.assetToken || 'N/A'}
                </Text>
              </View>
            ) : null}

            <View style={[styles.modalActions, { paddingBottom: modalFooterBottomPad }]}>
              <TouchableOpacity
                style={[styles.ghostBtn, { backgroundColor: cardsTheme.btnGhost, borderColor: cardsTheme.modalBorder }]}
                onPress={async () => {
                  await tryOpenInApp(focusedDataItem);
                }}
              >
                <Text style={[styles.ghostBtnText, { color: cardsTheme.btnGhostText }]}>
                  {tr('Abrir en app', 'Open in app')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: cardsTheme.btnPrimary }]}
                onPress={async () => {
                  await openInBrowser(focusedDataItem);
                }}
              >
                <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>
                  {tr('Ver en navegador', 'View in browser')}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.popoverCloseBtn}
              onPress={() => {
                setDataPopoverVisible(false);
                setFocusedDataItem(null);
                setFocusedCertificate(null);
              }}
            >
              <Text style={[styles.popoverCloseText, { color: cardsTheme.btnGhostText }]}>{tr('Cerrar', 'Close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Rotate phone hint overlay */}
      <Modal visible={rotateHintVisible} transparent animationType="fade" onRequestClose={() => setRotateHintVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setRotateHintVisible(false)}>
          <View style={styles.rotateHintOverlay}>
            <Animated.View
              style={{
                transform: [{
                  rotate: rotateAnim.interpolate 
                    ? rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) 
                    : '0deg',
                }],
              }}
            >
              <MaterialCommunityIcons name="cellphone" size={80} color="#FFFFFF" />
            </Animated.View>
            <Text style={styles.rotateHintText}>{tr('Gira tu celular para ver\nla vista horizontal', 'Rotate your phone to see\nthe horizontal view')}</Text>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <ReceptorScreenModal
        visible={subscribersVisible}
        onClose={() => {
          setSubscribersVisible(false);
          setSubscribersCard(null);
          setSubscribersBusinessRow(null);
          setSubscribers([]);
        }}
        owner={{
                   displayName: subscribersBusinessRow
            ? (subscribersBusinessRow.bcName || tr('Mi Negocio', 'My Business'))
            : (issuerIdentity.userFullName || tr('Mi Tarjeta', 'My Card')),
          occupation: subscribersBusinessRow
            ? (subscribersBusinessRow.bcContactName || '')
            : (() => {
                const cardNm = String(subscribersCard?.scName || '').trim();
                const who = String(issuerIdentity.userFullName || '').trim();
                if (cardNm && who && cardNm.localeCompare(who, undefined, { sensitivity: 'accent' }) === 0) {
                  const h = String(issuerIdentity.userNickName || '')
                    .trim()
                    .replace(/^@+/g, '')
                    .replace(/\s+/g, '');
                  return h ? `@${h.toLowerCase()}` : '';
                }
                return cardNm;
              })(),
          userAvatarUrl: issuerIdentity.userAvatarUrl ?? null,
          brandLogoUrl: subscribersBusinessRow ? subscribersBusinessRow.bcLogoUrl || null : null,
        }}
        subscribers={subscribers}
        totalCount={
          subscribersBusinessRow
            ? (subscribersBusinessRow.holdersCount ?? subscribers.length)
            : (subscribersCard?.holdersCount ?? subscribers.length)
        }
        loading={subscribersLoading}
        isDark={isDark}
        tr={tr}
        onRevoke={(targetUid, name) => {
          Alert.alert(
            tr('Eliminar receptor', 'Remove receptor'),
            tr(
              `¿Eliminar a ${name} de esta tarjeta? Tu tarjeta desaparecerá de sus contactos.`,
              `Remove ${name} from this card? Your card will disappear from their contacts.`,
            ),
            [
              { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
              { text: tr('Eliminar', 'Remove'), style: 'destructive', onPress: () => void handleRevokeSubscriber(targetUid) },
            ],
          );
        }}
        onMute={(targetUid, currentlyMuted, name) => {
          if (currentlyMuted) {
            void handleMuteSubscriber(targetUid, false);
          } else {
            Alert.alert(
              tr('Silenciar receptor', 'Mute receptor'),
              tr(
                `¿Silenciar a ${name}? No podrá llamarte desde esta tarjeta. No sabrá que está silenciado/a.`,
                `Mute ${name}? They won't be able to call you from this card. They won't know they're muted.`,
              ),
              [
                { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
                { text: tr('Silenciar', 'Mute'), onPress: () => void handleMuteSubscriber(targetUid, true) },
              ],
            );
          }
        }}
        onBlock={(targetUid, name) => {
          Alert.alert(
            tr('Bloquear usuario', 'Block user'),
            tr(
              `¿Bloquear a ${name}? Se eliminará de tus contactos y tarjetas. No podrá agregarte.`,
              `Block ${name}? They will be removed from your contacts and cards. They won't be able to add you.`,
            ),
            [
              { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
              { text: tr('Bloquear', 'Block'), style: 'destructive', onPress: () => void handleBlockSubscriber(targetUid) },
            ],
          );
        }}
      />

      {viewerVisible && viewerItem ? (
        <VaultDocumentViewerModal
          visible={viewerVisible}
          item={viewerItem}
          onClose={() => {
            setViewerVisible(false);
            setViewerItem(null);
            requestAnimationFrame(() => restoreFactoryAfterAuxModal());
          }}
          tr={tr}
          fallbackMutedColor={cardsTheme.sectionLabel}
        />
      ) : null}

      <Modal
        visible={qrVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setQrVisible(false);
          setQrBusinessContext(null);
        }}
      >
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: cardsTheme.modalOverlay }]}
          onPress={() => {
            // Tap en el backdrop (fuera del card del modal) cierra el QR.
            // Garantía de salida por si el botón "Cerrar" queda tapado por el
            // QR, el logo remoto demora, o el layout se rompe en algún device.
            setQrVisible(false);
            setQrBusinessContext(null);
          }}
        >
          <Pressable onPress={() => {}}>
          <LinearGradient
            colors={[...cardsTheme.luxuryFrameGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.qrModalLuxuryOuter}
          >
            <View style={[styles.qrModalInner, { backgroundColor: cardsTheme.modalBg }]}>
              {!qrBusinessContext && qrUniversalWebUrl ? (
                <View style={styles.qrModalTitleRow}>
                  <Text
                    style={[styles.factoryTitle, styles.qrModalTitleText, { color: cardsTheme.modalTitle }]}
                    numberOfLines={2}
                  >
                    {selectedCard?.scName || tr('Smart Card', 'Smart Card')}
                  </Text>
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        await Clipboard.setStringAsync(qrUniversalWebUrl);
                        Toast.show({
                          type: 'success',
                          text1: tr('Enlace copiado', 'Link copied'),
                          text2: tr('Pégalo donde quieras compartirlo.', 'Paste it wherever you want to share.'),
                        });
                      } catch {
                        Toast.show({
                          type: 'error',
                          text1: tr('No se pudo copiar', 'Could not copy'),
                        });
                      }
                    }}
                    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                    accessibilityRole="button"
                    accessibilityLabel={tr('Copiar enlace', 'Copy link')}
                  >
                    <MaterialCommunityIcons name="content-copy" size={22} color={cardsTheme.tint} />
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={[styles.factoryTitle, { color: cardsTheme.modalTitle }]}>
                  {qrBusinessContext
                    ? qrBusinessContext.bcName
                    : selectedCard?.scName || tr('Smart Card', 'Smart Card')}
                </Text>
              )}
              <Text style={[styles.qrSubtitle, { color: cardsTheme.modalSubtitle }]}>
                {qrBusinessContext
                  ? tr('QR permanente (no caduca)', 'Permanent QR (does not expire)')
                  : qrUniversalWebUrl
                    ? tr('Enlace web · válido 24 h (aprox.)', 'Web link · valid ~24 h')
                    : tr('QR dinámico · válido 2 minutos', 'Dynamic QR · valid 2 minutes')}
              </Text>

              {qrBusinessContext ? null : (
                <View style={styles.countdownWrap}>
                  <Text style={[styles.countdownText, { color: cardsTheme.text }]}>
                    {remainingSec <= 0
                      ? tr('Expirado', 'Expired')
                      : remainingSec >= 3600
                        ? `${Math.floor(remainingSec / 3600)}h ${Math.floor((remainingSec % 3600) / 60)}m`
                        : remainingSec >= 60
                          ? `${Math.floor(remainingSec / 60)}:${String(remainingSec % 60).padStart(2, '0')}`
                          : `${remainingSec}s`}
                  </Text>
                  <View style={[styles.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,28,30,0.08)' }]}>
                    <View style={[styles.progressFill, { width: `${remainingPercent * 100}%`, backgroundColor: cardsTheme.tint }]} />
                  </View>
                </View>
              )}

              <View style={[styles.qrWrap, { backgroundColor: cardsTheme.inputBg, borderColor: cardsTheme.modalBorder }]}>
                {qrPayload ? (
                  <View style={styles.qrLayerContainer}>
                    <QRCode
                      getRef={(c) => {
                        permanentBusinessQrSvgRef.current = c;
                      }}
                      value={qrPayload}
                      size={210}
                      color={isDark ? '#E8D4A3' : '#636366'}
                      backgroundColor={isDark ? '#1C1C1E' : '#FFFFFF'}
                      logo={
                        qrBusinessContext?.bcLogoUrl ? { uri: qrBusinessContext.bcLogoUrl } : brandCsIconLogo
                      }
                      logoSize={qrBusinessContext?.bcLogoUrl ? 48 : 42}
                      logoBackgroundColor={isDark ? '#1C1C1E' : '#FFFFFF'}
                      logoMargin={qrBusinessContext?.bcLogoUrl ? 2 : 4}
                      ecl="H"
                    />

                    {!qrBusinessContext && qrExpired ? (
                      <View style={styles.expiredOverlay}>
                        <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} pointerEvents="none" />
                        <TouchableOpacity
                          style={[styles.refreshOverlayBtn, { backgroundColor: cardsTheme.btnPrimary, borderColor: cardsTheme.modalBorder }]}
                          onPress={() => {
                            if (selectedCard) {
                              confirmAndIssueQrForCard(selectedCard);
                            }
                          }}
                          disabled={issuingQr}
                        >
                          <MaterialCommunityIcons name="refresh" size={16} color={cardsTheme.btnPrimaryText} />
                          <Text style={[styles.refreshOverlayBtnText, { color: cardsTheme.btnPrimaryText }]}>
                            {tr('Generar nuevo QR', 'Generate new QR')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>

              <View style={[styles.modalActions, styles.qrModalActions, { paddingBottom: modalFooterBottomPad }]}>
              {qrBusinessContext ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginBottom: 10 }}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.ghostBtn,
                        {
                          flex: 1,
                          borderColor: pressed ? cardsTheme.btnPrimary : cardsTheme.modalBorder,
                          backgroundColor: pressed ? cardsTheme.btnPrimary : cardsTheme.btnGhost,
                        },
                      ]}
                      onPress={async () => {
                        const link = generatePublicBusinessWebUrl(qrBusinessContext.bId, qrBusinessContext.uid);
                        try {
                          await Clipboard.setStringAsync(link);
                          Toast.show({
                            type: 'success',
                            text1: tr('Enlace web copiado', 'Web link copied'),
                            text2: tr('Pégalo en web o e-mail.', 'Paste on web or email.'),
                          });
                        } catch {
                          Toast.show({ type: 'error', text1: tr('No se pudo copiar', 'Could not copy') });
                        }
                      }}
                    >
                      {({ pressed }) => (
                        <Text
                          style={[
                            styles.ghostBtnText,
                            { textAlign: 'center', color: pressed ? cardsTheme.btnPrimaryText : cardsTheme.btnGhostText },
                          ]}
                          numberOfLines={2}
                        >
                          {tr('Copiar enlace web', 'Copy web link')}
                        </Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.ghostBtn,
                        {
                          flex: 1,
                          borderColor: pressed ? cardsTheme.btnPrimary : cardsTheme.modalBorder,
                          backgroundColor: pressed ? cardsTheme.btnPrimary : cardsTheme.btnGhost,
                        },
                      ]}
                      onPress={async () => {
                        const link = generatePublicBusinessWebUrl(qrBusinessContext.bId, qrBusinessContext.uid);
                        const runSvgVectorFallback = async () => {
                          const result = await ExportBusinessQR({
                            businessId: qrBusinessContext.bId,
                            bcName: qrBusinessContext.bcName,
                            permanentBusinessLink: link,
                            bcLogo: qrBusinessContext.bcLogoUrl || undefined,
                            format: 'png',
                          });
                          Alert.alert(
                            tr('QR', 'QR'),
                            result.message || (result.success ? tr('Listo', 'Done') : tr('Error', 'Error')),
                          );
                        };
                        const svg = permanentBusinessQrSvgRef.current;
                        if (svg && typeof svg.toDataURL === 'function') {
                          try {
                            svg.toDataURL(async (dataUrl: string) => {
                              try {
                                const result = await shareBusinessQrPngDataUrl(
                                  dataUrl,
                                  qrBusinessContext.bcName,
                                );
                                if (result.success) {
                                  Alert.alert(
                                    tr('QR', 'QR'),
                                    result.message || tr('Listo', 'Done'),
                                  );
                                } else {
                                  await runSvgVectorFallback();
                                }
                              } catch {
                                await runSvgVectorFallback();
                              }
                            });
                          } catch {
                            await runSvgVectorFallback();
                          }
                          return;
                        }
                        await runSvgVectorFallback();
                      }}
                    >
                      {({ pressed }) => (
                        <Text
                          style={[
                            styles.ghostBtnText,
                            { textAlign: 'center', color: pressed ? cardsTheme.btnPrimaryText : cardsTheme.btnGhostText },
                          ]}
                          numberOfLines={2}
                        >
                          {tr('Descargar QR', 'Download QR')}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: cardsTheme.btnPrimary, flex: 1, width: '100%' }]}
                    onPress={() => {
                      setQrVisible(false);
                      setQrBusinessContext(null);
                    }}
                  >
                    <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>{tr('Cerrar', 'Close')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Pressable
                    disabled={issuingQr}
                    style={({ pressed }) => [
                      styles.ghostBtn,
                      {
                        borderColor: pressed ? cardsTheme.btnPrimary : cardsTheme.modalBorder,
                        backgroundColor: pressed ? cardsTheme.btnPrimary : cardsTheme.btnGhost,
                        opacity: issuingQr ? 0.45 : 1,
                      },
                    ]}
                    onPress={() => {
                      if (selectedCard) {
                        confirmAndIssueQrForCard(selectedCard, { forceNew: true });
                      }
                    }}
                  >
                    {({ pressed }) => (
                      <Text
                        style={[
                          styles.ghostBtnText,
                          { color: pressed ? cardsTheme.btnPrimaryText : cardsTheme.btnGhostText },
                        ]}
                      >
                        {tr('Nuevo QR', 'New QR')}
                      </Text>
                    )}
                  </Pressable>
                  <Pressable
                    disabled={issuingUniversalLink}
                    style={({ pressed }) => [
                      styles.ghostBtn,
                      {
                        borderColor: issuingUniversalLink
                          ? cardsTheme.modalBorder
                          : pressed
                            ? cardsTheme.btnPrimary
                            : cardsTheme.modalBorder,
                        backgroundColor: issuingUniversalLink
                          ? cardsTheme.btnGhost
                          : pressed
                            ? cardsTheme.btnPrimary
                            : cardsTheme.btnGhost,
                        opacity: issuingUniversalLink ? 0.45 : 1,
                      },
                    ]}
                    onPress={() => {
                      if (selectedCard) {
                        void openOrCreateUniversalQrForCard(selectedCard);
                      }
                    }}
                  >
                    {({ pressed }) => (
                      <Text
                        style={[
                          styles.ghostBtnText,
                          {
                            color: issuingUniversalLink
                              ? cardsTheme.btnGhostText
                              : pressed
                                ? cardsTheme.btnPrimaryText
                                : cardsTheme.btnGhostText,
                          },
                        ]}
                      >
                        {issuingUniversalLink ? tr('Generando…', 'Generating…') : tr('QR 24 Hr', 'QR 24h')}
                      </Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.ghostBtn,
                      {
                        borderColor: pressed ? cardsTheme.btnPrimary : cardsTheme.modalBorder,
                        backgroundColor: pressed ? cardsTheme.btnPrimary : cardsTheme.btnGhost,
                      },
                    ]}
                    onPress={() => {
                      setQrVisible(false);
                      setQrBusinessContext(null);
                    }}
                  >
                    {({ pressed }) => (
                      <Text
                        style={[
                          styles.ghostBtnText,
                          { color: pressed ? cardsTheme.btnPrimaryText : cardsTheme.btnGhostText },
                        ]}
                      >
                        {tr('Cerrar', 'Close')}
                      </Text>
                    )}
                  </Pressable>
                </>
              )}
              </View>
            </View>
          </LinearGradient>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={cardStatsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCardStatsVisible(false);
          setCardStatsTarget(null);
        }}
      >
        <Pressable
          style={[styles.cardStatsOverlay, { backgroundColor: cardsTheme.modalOverlay }]}
          onPress={() => {
            setCardStatsVisible(false);
            setCardStatsTarget(null);
          }}
        >
          <Pressable
            style={[styles.cardStatsCard, { backgroundColor: cardsTheme.modalBg, borderColor: cardsTheme.modalBorder }]}
            onPress={() => {}}
          >
            <View style={styles.cardStatsHeaderRow}>
              <Text style={[styles.cardStatsTitle, { color: cardsTheme.modalTitle }]}>
                {tr('Estadísticas', 'Statistics')}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setCardStatsVisible(false);
                  setCardStatsTarget(null);
                }}
                hitSlop={12}
                accessibilityLabel={tr('Cerrar', 'Close')}
              >
                <MaterialCommunityIcons name="close" size={22} color={cardsTheme.sectionLabel} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.cardStatsCardName, { color: cardsTheme.text }]} numberOfLines={2}>
              {cardStatsTarget?.scName || '—'}
            </Text>
            {cardStatsLoading ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color={cardsTheme.ctaAccent} />
            ) : (
              <>
                <Text style={[styles.cardStatsSectionLabel, { color: cardsTheme.sectionLabel }]}>
                  {tr('Visualizaciones totales (90 días)', 'Total views (90 days)')}
                </Text>
                <Text style={[styles.cardStatsBigNumber, { color: cardsTheme.ctaAccent }]}>
                  {cardStatsData?.totalViews ?? 0}
                </Text>
                <Text style={[styles.cardStatsSectionLabel, { color: cardsTheme.sectionLabel, marginTop: 16 }]}>
                  {tr('Tus iconos más usados', 'Your most-used icons')}
                </Text>
                {(cardStatsData?.topIcons || []).length === 0 ? (
                  <Text style={[styles.cardStatsEmpty, { color: cardsTheme.modalSubtitle }]}>
                    {tr('Aún no hay datos. Comparte tu tarjeta o espera interacciones.', 'No data yet. Share your card or wait for interactions.')}
                  </Text>
                ) : (
                  <View style={styles.cardStatsIconList}>
                    {(cardStatsData?.topIcons || []).map((row) => (
                      <View key={row.iconType} style={[styles.cardStatsIconRow, { borderBottomColor: cardsTheme.divider }]}>
                        <Text style={[styles.cardStatsIconType, { color: cardsTheme.text }]} numberOfLines={1}>
                          {row.iconType}
                        </Text>
                        <Text style={[styles.cardStatsIconCount, { color: cardsTheme.ctaAccent }]}>{row.count}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Limit Reached Modal */}
      <LimitReachedModal
        visible={limitReachedVisible}
        limitType="cards"
        currentCount={limitCardCount}
        maxLimit={limitMaxCards}
        onClose={() => setLimitReachedVisible(false)}
        onUpgradePress={handleUpgradePress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#1C1C1E',
    fontSize: 25,
    fontWeight: '800',
  },
  headerSubtitle: {
    marginTop: 3,
    color: '#2F5A78',
    fontSize: 12,
    fontWeight: '600',
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  businessCtaWrap: {
    borderRadius: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  businessCta: {
    minHeight: 48,
    minWidth: 172,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  businessCtaIcon: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#F7E7C6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessCtaTitle: {
    color: '#F7E7C6',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },


  createBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#C5A065',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createFab: {
    position: 'absolute',
    right: 16,
    bottom: 74,
    height: 48,
    borderRadius: 999,
    paddingHorizontal: 16,
    backgroundColor: '#1C1C1E',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
    zIndex: 10,
  },
  createFabText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  cardsReorderListWrap: {
    flex: 1,
    minHeight: 0,
  },
  cardsReorderDraggableList: {
    flex: 1,
    minHeight: 0,
  },
  cardsReorderBanner: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardsReorderBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  reorderBannerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  reorderBannerBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  reorderRowPad: {
    paddingRight: 40,
  },
  reorderHandleHint: {
    position: 'absolute',
    right: 6,
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardsList: {
    paddingHorizontal: 12,
    paddingBottom: 130,
  },
  cardsListLandscape: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  swipeWrap: {
    marginVertical: 5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  swipeWrapLandscape: {
    width: 320,
    marginRight: 14,
  },
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  swipeActionBtn: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  swipeDeleteBtn: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  swipeLeftTriggerArea: {
    width: 56,
    marginVertical: 5,
  },
  swipeActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  /** Swipe “favorito”: ancho fijo 64px; dos líneas evitan duplicar icono con símbolo ♥/★. */
  swipeFavoriteSwipeLabel: {
    fontSize: 9,
    lineHeight: 10,
    textAlign: 'center',
  },
  cardMetricRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardRowTouchable: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  businessCardListInner: {
    alignItems: 'stretch',
  },
  /** Menos padding derecho: QR pegado al borde; el corazón va absolute encima de la esquina. */
  businessCardRowInner: {
    paddingRight: 2,
    paddingLeft: 6,
  },
  businessListMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  /** Pill a la izquierda; bloque valoración en columna (estrellas arriba, texto abajo) para que quepa con el QR. */
  businessCardStatsRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    gap: 8,
    width: '100%',
    minWidth: 0,
  },
  /** Estrellas arriba, “4.5 · N reseñas” debajo (menos ancho que en una sola fila). */
  statsRatingStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 2,
    flexShrink: 1,
    minWidth: 0,
  },
  statsRatingStackAlignEnd: {
    alignItems: 'flex-end',
  },
  businessRatingStarsWrap: {
    flexShrink: 0,
  },
  ratingStackCaption: {
    fontSize: 11,
    fontWeight: '600',
    includeFontPadding: false,
    maxWidth: '100%',
  },
  ratingStackCaptionRight: {
    textAlign: 'right',
  },
  businessListQrWrap: {
    marginLeft: 'auto',
    width: 68,
    height: 68,
    padding: 2,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  businessListLogo: {
    width: 70,
    height: 70,
    borderRadius: 15,
    borderWidth: 1,
  },
  businessListLogoPh: {
    width: 70,
    height: 70,
    borderRadius: 15,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessListTextCol: {
    flex: 1,
    minWidth: 0,
  },
  businessListTitle: {
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  businessListSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'left',
  },
  cardRowInner: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 4,
    paddingRight: 28,
  },
  cardRowTitle: {
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  cardRowThemeSubtitle: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: '100%',
    paddingHorizontal: 8,
  },
  /** Fila 3: receptores (izq.) + estrellas y texto de valoración (der.) en la misma línea. */
  cardRowStatsRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 6,
    paddingHorizontal: 2,
  },
  cardRowRatingCluster: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  cardRowFavoriteBtn: {
    position: 'absolute',
    top: 5,
    right: 4,
    zIndex: 4,
    padding: 3,
  },
  cardRowStatsBtn: {
    position: 'absolute',
    top: 5,
    right: 34,
    zIndex: 4,
    padding: 3,
  },
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.18)',
  },
  metricPillText: {
    color: '#1C1C1E',
    fontWeight: '700',
    fontSize: 12,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cardItem: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: 'relative',
    minHeight: 90,
  },
  wallpaperFill: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.93,
  },
  cardItemLandscape: {
    minHeight: 88,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  cardTitle: {
    color: '#1C1C1E',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },
  cardMeta: {
    marginTop: 2,
    color: '#497499',
    fontSize: 11,
    fontWeight: '600',
  },
  cardIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    marginTop: 70,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 10,
    color: '#1C1C1E',
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    marginTop: 6,
    color: '#3D6F92',
    fontSize: 13,
    textAlign: 'center',
  },
  firstQrBtn: {
    marginTop: 16,
    backgroundColor: '#1C1C1E',
    borderRadius: 999,
    paddingHorizontal: 16,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  firstQrBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  wireVerticalCard: {
    borderRadius: 16,
    flex: 1,
    overflow: 'hidden',
  },
  // ── Vertical Model sections ─────────────────────────────────────
  vertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 6,
  },
  vertBrandingText: {
    fontWeight: '700',
    opacity: 0.85,
  },
  vertTop: {
    flex: 2.9,
    flexDirection: 'column',
  },
  vertAvatarBox: {
    flex: 1.85,
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  vertInfoBox: {
    flex: 1.55,
    padding: 8,
    paddingTop: 12,
    paddingBottom: 12,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 5,
  },
  vertName: {
    fontWeight: '800',
    textAlign: 'center',
  },
  vertNick: {
    fontWeight: '600',
    textAlign: 'center',
  },
  vertIconsBox: {
    flex: 2.35,
    marginTop: 12,
    paddingHorizontal: 0,
    paddingTop: 2,
    paddingBottom: 22,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  wireVertIconGridRoot: {
    justifyContent: 'flex-start',
  },
  vertIconsGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'center',
    justifyContent: 'center',
  },
  wireIconGridRoot: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingHorizontal: 24,
  },
  wireIconRowsStack: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'stretch',
    width: '100%',
    gap: 12,
  },
  wireIconRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
    gap: 12,
    flexWrap: 'nowrap',
    paddingHorizontal: 0,
  },
  wireIconCell: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    alignItems: 'center',
  },
  wireVerticalIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '4%',
    paddingBottom: '3%',
  },
  wireVerticalAvatarCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wireVerticalInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  wireVerticalGrid: {
    flex: 1,
    marginTop: 4,
  },
  wireHorizontalCard: {
    borderRadius: 16,
    flex: 1,
    overflow: 'hidden',
  },
  wireHorizontalLeft: {
    width: '60%',
    justifyContent: 'center',
  },
  wireHorizontalRight: {
    width: '40%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.15)',
    backgroundColor: 'rgba(255,255,255,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  // ── Horizontal Model sections ───────────────────────────────────
  wireHorizCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  horizHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 6,
  },
  horizBrandingText: {
    fontWeight: '700',
    opacity: 0.85,
  },
  horizMiddleRow: {
    flex: 2.85,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  horizAvatarBox: {
    flex: 1.2,
    padding: 8,
    paddingRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  horizInfoBox: {
    flex: 2.6,
    padding: 8,
    paddingLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  horizName: {
    fontWeight: '800',
    textAlign: 'center',
  },
  horizNick: {
    fontWeight: '600',
    textAlign: 'center',
  },
  horizIconsBox: {
    flex: 2.95,
    marginTop: 12,
    paddingHorizontal: 0,
    paddingTop: 2,
    paddingBottom: 6,
  },
  horizIconsGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'center',
    justifyContent: 'center',
  },
  wireAvatar: {
    width: 110,
    height: 110,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#C5A065',
  },
  wireAvatarFallback: {
    width: 110,
    height: 110,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#C5A065',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wireAvatarSm: {
    width: 72,
    height: 72,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#C5A065',
  },
  wireAvatarFallbackSm: {
    width: 72,
    height: 72,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#C5A065',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wireName: {
    marginTop: 2,
    color: '#1C1C1E',
    fontWeight: '800',
    fontSize: 22,
    textAlign: 'left',
  },
  wireNameSm: {
    marginTop: 7,
    color: '#1C1C1E',
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'center',
  },
  wireNick: {
    marginTop: 3,
    color: '#4A4A4A',
    fontWeight: '600',
    fontSize: 15,
    textAlign: 'left',
  },
  wireNickSm: {
    marginTop: 1,
    color: '#4A4A4A',
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
  },
  wireStatsRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  /** Estrellas arriba, pill de receptores abajo (evita corte horizontal en wireframe). */
  wireStatsStack: {
    marginTop: 6,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    width: '100%',
    maxWidth: '100%',
  },
  wireStatsRowInline: {
    marginTop: 6,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: 2,
  },
  /** Estrellas arriba, texto de reseñas más pequeño abajo (wireframe). */
  wireStatsRatingStack: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    flex: 1,
    minWidth: 0,
  },
  wireStatsReviewCaption: {
    fontWeight: '600',
    flexShrink: 1,
  },
  wireUsersPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#AFCFE6',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  wireUsersPillText: {
    color: '#1C1C1E',
    fontSize: 10,
    fontWeight: '800',
  },
  slotTile: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  slotBubble: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.83)',
    borderWidth: 1,
    borderColor: '#C3E6FA',
  },
  slotLabel: {
    marginTop: 2,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  slotMinusBtn: {
    position: 'absolute',
    top: -2,
    right: 8,
    width: 19,
    height: 19,
    borderRadius: 9.5,
    backgroundColor: '#C44B55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotPlusBtn: {
    position: 'absolute',
    bottom: 14,
    right: 8,
    width: 19,
    height: 19,
    borderRadius: 9.5,
    backgroundColor: '#48484A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  factoryModal: {
    width: '100%',
    height: '98%',
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  factoryTitle: {
    color: '#1C1C1E',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  identityAutoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  identityAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  identityAvatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  identityLabel: {
    color: '#636366',
    fontSize: 10,
    fontWeight: '600',
  },
  identityValue: {
    color: '#1C1C1E',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    color: '#1C1C1E',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  modalActions: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  ghostBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: {
    color: '#1C1C1E',
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#E9C349',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  qrModalLuxuryOuter: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 2,
  },
  qrModalInner: {
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    width: '100%',
  },
  qrModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  qrModalTitleText: {
    flex: 1,
    marginBottom: 0,
    textAlign: 'left',
  },
  qrModalActions: {
    marginTop: 16,
    width: '100%',
  },
  qrSubtitle: {
    marginTop: 2,
    marginBottom: 10,
    textAlign: 'center',
  },
  countdownWrap: {
    width: '100%',
    marginBottom: 10,
  },
  countdownText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  qrWrap: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  qrLayerContainer: {
    width: 210,
    height: 210,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiredOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshOverlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
  },
  refreshOverlayBtnText: {
    fontWeight: '700',
    fontSize: 12,
  },
  previewBrandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  previewBrandingLogo: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  previewBrandingText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  previewTitle: {
    color: '#1C1C1E',
    fontSize: 21,
    fontWeight: '800',
  },
  previewMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewGrid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  previewGridItem: {
    width: '22%',
    alignItems: 'center',
  },
  previewIconBubble: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  previewItemLabel: {
    marginTop: 4,
    color: '#1C1C1E',
    fontSize: 10,
    fontWeight: '700',
  },
  dataPopoverCard: {
    width: '88%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  dataPopoverTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dataPopoverTitle: {
    color: '#1C1C1E',
    fontSize: 16,
    fontWeight: '800',
  },
  dataPopoverType: {
    color: '#636366',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  dataPopoverHint: {
    marginTop: 10,
    color: '#636366',
    fontSize: 12,
  },
  authCertBox: {
    marginTop: 10,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(197,160,101,0.6)',
    backgroundColor: 'rgba(197,160,101,0.14)',
    gap: 4,
  },
  authCertTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  authCertText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#636366',
  },
  authCertToken: {
    fontSize: 10,
    color: '#636366',
  },
  popoverCloseBtn: {
    marginTop: 10,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  popoverCloseText: {
    color: '#1C1C1E',
    fontWeight: '700',
    fontSize: 12,
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.86)',
  },
  viewerTopBar: {
    marginTop: Platform.OS === 'ios' ? 56 : 24,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 4,
  },
  viewerDownloadButton: {
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: '#E9C349',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewerDownloadText: {
    color: '#1C1C1E',
    fontSize: 12,
    fontWeight: '800',
  },
  viewerCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  viewerBody: {
    flex: 1,
    marginTop: 14,
  },
  viewerZoomContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
    minHeight: 340,
  },
  viewerPdfWrapper: {
    flex: 1,
  },
  viewerPdf: {
    flex: 1,
    backgroundColor: '#000000',
  },
  viewerFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  viewerFallbackText: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  subscribersModalCard: {
    width: '92%',
    maxHeight: '78%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  subscribersSubtitle: {
    color: '#636366',
    fontWeight: '700',
    marginTop: -2,
    marginBottom: 8,
  },
  subscribersList: {
    maxHeight: 390,
  },
  subscribersLoadingText: {
    color: '#8E8E93',
    fontSize: 13,
    paddingVertical: 14,
  },
  subscriberRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    padding: 10,
    marginBottom: 8,
  },
  subscriberIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subscriberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  subscriberAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  subscriberName: {
    color: '#1C1C1E',
    fontWeight: '800',
    fontSize: 13,
  },
  subscriberUid: {
    color: '#8E8E93',
    fontSize: 10,
    marginTop: 1,
  },
  amixesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  amixesBadgeText: {
    color: '#1C1C1E',
    fontSize: 10,
    fontWeight: '700',
  },
  subscriberActions: {
    marginTop: 9,
    flexDirection: 'row',
    gap: 8,
  },
  revokeBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5A4A8',
    backgroundColor: '#FFF2F3',
    alignItems: 'center',
    paddingVertical: 8,
  },
  revokeBtnText: {
    color: '#AF2830',
    fontSize: 12,
    fontWeight: '700',
  },
  blockBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    paddingVertical: 8,
  },
  blockBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  slotPickerCard: {
    width: '90%',
    maxHeight: '78%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  slotPickerSubtitle: {
    color: '#636366',
    fontWeight: '700',
    marginTop: -2,
    marginBottom: 8,
  },
  slotPickerList: {
    maxHeight: 360,
    marginBottom: 8,
  },
  slotPickerRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slotPickerTitle: {
    flex: 1,
    color: '#1C1C1E',
    fontSize: 13,
    fontWeight: '700',
  },
  slotPickerType: {
    color: '#8E8E93',
    fontSize: 11,
  },
  // ── Factory redesign ───────────────────────────────────────────────
  factoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  factoryFieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
    marginTop: 2,
    paddingLeft: 2,
  },
  identityAvatarLg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#C5A065',
  },
  identityAvatarLgFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#C5A065',
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityFullName: {
    fontSize: 17,
    fontWeight: '800',
  },
  identityHandle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
  },
  factoryActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  factoryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 52,
    paddingHorizontal: 8,
    position: 'relative',
  },
  factoryActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  factoryActionBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#C5A065',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  factoryActionBadgeText: {
    color: '#1C1C1E',
    fontSize: 10,
    fontWeight: '800',
  },
  factoryPreviewWrap: {
    flex: 1,
    marginBottom: 8,
    overflow: 'hidden',
    minHeight: 0,
  },
  factoryPreviewStage: {
    flex: 1,
    minHeight: 0,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.36)',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  factoryPreviewCardFrame: {
    flex: 1,
    minHeight: 0,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  factoryPreviewInnerScroll: {
    flex: 1,
    minHeight: 0,
  },
  factoryPreviewInnerScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingBottom: 6,
  },
  factoryPreviewScaledOuter: {
    alignSelf: 'center',
    position: 'relative',
  },
  factoryPreviewEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  factoryPreviewEmptyText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  // ── DataSelector ───────────────────────────────────────────────────
  dataSelectorOverlay: {
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    paddingHorizontal: 0,
  },
  dataSelectorModal: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
    borderWidth: 1,
    padding: 14,
  },
  dataSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  dataSelectorCounterWrap: {
    flex: 1,
    alignItems: 'flex-end',
    marginRight: 4,
  },
  dataSelectorCounter: {
    fontSize: 14,
    fontWeight: '800',
  },
  dataSelectorToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  dataSelectorSearchBox: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  dataSelectorSearchInput: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: '600',
  },
  dataSelectorSortBtn: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dataSelectorSortText: {
    fontSize: 12,
    fontWeight: '800',
  },
  dataSelectorLimitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF2F3',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E5A4A8',
    marginBottom: 10,
  },
  dataSelectorLimitText: {
    color: '#C44B55',
    fontSize: 12,
    fontWeight: '700',
  },
  dataSelectorEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  selectorGrid: {
    flex: 1,
    marginBottom: 8,
  },
  selectorGridContent: {
    paddingBottom: 10,
  },
  selectorItemTile: {
    flex: 1,
    margin: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    position: 'relative',
    minHeight: 90,
  },
  selectorItemTileSelected: {
    borderColor: '#C5A065',
    borderWidth: 2,
    backgroundColor: '#FFFBF0',
  },
  selectorCheckOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#C5A065',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  selectorOrderText: {
    color: '#1C1C1E',
    fontSize: 12,
    fontWeight: '900',
  },
  selectorIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  selectorItemTitle: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 2,
  },
  selectorItemType: {
    fontSize: 10,
    textAlign: 'center',
  },
  dataSelectorUpsellBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#C5A065',
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginBottom: 10,
    alignSelf: 'center',
    shadowColor: '#C5A065',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  dataSelectorUpsellText: {
    color: '#1C1C1E',
    fontSize: 13,
    fontWeight: '800',
  },
  // ── ThemesPlaceholder ──────────────────────────────────────────────
  themesPopupOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  themesPopupBox: {
    width: '92%',
    maxWidth: 400,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    maxHeight: '82%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  themesLockerScroll: {
    maxHeight: 440,
  },
  themesLockerScrollContent: {
    paddingBottom: 8,
  },
  themesLockerTierSection: {
    marginBottom: 16,
  },
  themesLockerTierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  themesLockerTierEmoji: {
    fontSize: 18,
  },
  themesLockerTierLabel: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  themesLockerTierLine: {
    flex: 1,
    height: 1,
    marginLeft: 8,
  },
  themesLockerTierGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignContent: 'flex-start',
  },
  themesPlaceholderModal: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  themesPlaceholderSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  themeTierLabel: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 2,
  },
  themesPlaceholderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
  themePlaceholderTile: {
    width: '30%',
    borderRadius: 12,
    overflow: 'visible',
    position: 'relative',
    alignItems: 'center',
    paddingBottom: 4,
  },
  themePlaceholderSwatch: {
    width: '100%',
    height: 70,
    borderRadius: 12,
  },
  themePlaceholderIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  themePlaceholderLock: {
    position: 'absolute',
    top: 28,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  themePlaceholderName: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  themesUpsellBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#C5A065',
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginBottom: 10,
    shadowColor: '#C5A065',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  themesUpsellText: {
    color: '#1C1C1E',
    fontSize: 14,
    fontWeight: '800',
  },
  cardSearchWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    height: 42,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    zIndex: 10,
  },
  cardSearchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  rotateHintOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  rotateHintText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
  },
  subscriberSwipeMute: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  subscriberSwipeRevoke: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  subscriberSwipeBlock: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  subscriberMetaColumn: {
    minWidth: 0,
  },
  subscriberMutedTag: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  mutualRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  mutualLabel: {
    fontSize: 11,
    flexShrink: 1,
  },
  mutualStackRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mutualTinyAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    marginLeft: -7,
  },
  mutualTinyAvatarFirst: {
    marginLeft: 0,
  },
  cardStatsOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardStatsCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  cardStatsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardStatsTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  cardStatsCardName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  cardStatsSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardStatsBigNumber: {
    fontSize: 32,
    fontWeight: '800',
  },
  cardStatsEmpty: {
    fontSize: 13,
    marginTop: 8,
    lineHeight: 19,
  },
  cardStatsIconList: {
    marginTop: 8,
    maxHeight: 220,
  },
  cardStatsIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardStatsIconType: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    marginRight: 8,
  },
  cardStatsIconCount: {
    fontSize: 14,
    fontWeight: '800',
  },
});
