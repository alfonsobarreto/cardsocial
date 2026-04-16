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
import { getWireframeIconRowPlan } from '@/components/smartCard/wireframeMath';
import {
    renderWireframeDetailedRatingStars,
    renderWireframeMiniIcon,
} from '@/components/smartCard/wireframeMirrorRendering';
import { brandCsIconLogo } from '@/constants/brandAssets';
import { isGhostLinkVaultType } from '@/constants/ghostLinkVault';
import {
    CARD_THEMES as CHEST_THEMES,
    getThemeById,
    getThemesByTier,
    TIER_META,
    type CardTheme as ChestCardTheme,
    type ThemeTier,
} from '@/constants/themeChest';
import { getActiveUserId } from '@/services/authSession';
import { hardLockCheck } from '@/services/biometricAuth';
import { generatePermanentBusinessLink } from '@/services/brandedQrService';
import {
    listBusinessCardsByOwner,
    mergeBusinessCardRowsWithMongoOwnerPhoto,
    deleteBusinessCard as removeBusinessCardFromFirestore,
    setBusinessCardFavorite,
    type BusinessCardListRow,
} from '@/services/businessCardService';
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
} from '@/services/userIdentityFields';
import { type CardFontItem, type FontTier } from '@/services/fontLibraryService';
import { mergeBuiltinGhostLinkIntoVault } from '@/services/ghostLinkVaultBootstrap';
import { getUserIconVaultMap, type IconVaultEntry } from '@/services/iconVaultService';
import { useLanguage } from '@/services/language';
import { validateCardCreation } from '@/services/limitService';
import { useLookMode } from '@/services/lookMode';
import { buildExpandedMarketQuery } from '@/services/marketSearchSynonyms';
import { newEntityId } from '@/services/newEntityId';
import { openVaultPreviewItem } from '@/services/openVaultPreviewItem';
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
    type PublicCardSlotPayload,
    type SmartCardPayload,
} from '@/services/qrApi';
import { resolvePillForegroundColor } from '@/services/pillForegroundColor';
import { getCardRowTheme, useActiveTheme } from '@/services/useActiveTheme';
import {
    cardsTabFeedOrderStorageKey,
    readSmartCardsJsonWithLegacyMigration,
    readVaultJsonWithLegacyMigration,
    smartCardsStorageKey,
    vaultStorageKey,
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
import {
    resolveMaterialGlyphFromVaultLikeFields,
    sanitizeMaterialCommunityIconName,
} from '../components/iconNameValidation';
import palette from '../theme';

type CardThemeId = string;

/** Resolves a themeId to its full ChestCardTheme object. Falls back to the first theme. */
const resolveTheme = (id: string | undefined): ChestCardTheme => {
  return getThemeById(id || '') ?? CHEST_THEMES[0];
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

function buildPublicCardSlotsForPersist(
  vaultItems: VaultItem[],
  itemIds: string[],
  iconVaultById: Record<string, IconVaultEntry>,
): PublicCardSlotPayload[] {
  const out: PublicCardSlotPayload[] = [];
  const seen = new Set<string>();
  for (const id of itemIds) {
    const trimmedId = String(id || '').trim();
    if (!trimmedId || seen.has(trimmedId)) {
      continue;
    }
    seen.add(trimmedId);
    const it = vaultItems.find((v) => String(v.id || '').trim() === trimmedId);
    if (!it) {
      continue;
    }
    const iconRaw = String(it.icon || '').trim();
    const iconUrl = /^https?:\/\//i.test(iconRaw) ? iconRaw.slice(0, 4000) : undefined;
    const resolvedGlyph = resolveMaterialGlyphFromVaultLikeFields(
      {
        icon: it.icon,
        iconName: it.iconName,
        iconVaultId: it.iconVaultId,
      },
      iconVaultById,
    );
    const value = isGhostLinkVaultType(it.type) ? '' : String(it.value || '').trim();
    const row: PublicCardSlotPayload = {
      itemId: trimmedId,
      type: String(it.type || 'link').slice(0, 64),
      label: String(it.title || '').slice(0, 200),
      value: value.slice(0, 4000),
    };
    if (iconUrl) {
      row.icon = iconUrl;
    }
    if (resolvedGlyph) {
      row.iconName = resolvedGlyph.slice(0, 120);
    }
    const vm = String((it as { vaultMimeType?: string }).vaultMimeType || '').trim();
    if (vm) {
      row.vaultMimeType = vm.slice(0, 120);
    }
    out.push(row);
  }
  return out.slice(0, 24);
}

function migrateVaultIconsForStorage(items: any[]) {
  return items.map((item) => {
    if (item.iconName === 'alternate-email') return { ...item, iconName: 'email' };
    if (item.iconName === 'file-presentation') return { ...item, iconName: 'file-document' };
    if (item.iconName === 'Gmail') return { ...item, iconName: 'gmail' };
    if (item.iconName === 'Stamp') return { ...item, iconName: 'certificate' };
    if (item.iconName === 'Classic') return { ...item, iconName: 'card-text' };
    if (!item.iconName || item.iconName.includes(' ') || item.iconName === '') {
      return { ...item, iconName: 'link-variant' };
    }
    return { ...item, iconName: sanitizeMaterialCommunityIconName(item.iconName) };
  });
}

/**
 * Misma fuente que `loadVaultItems`, pero devuelve datos sin depender del estado React.
 * QR24h debe usar esto antes del upsert: si `vaultItems` en memoria va vacío, `publicCardSlots` salía [] y la web sin iconos.
 */
async function loadVaultSnapshotForSync(ownerUid: string): Promise<{
  vaultItems: VaultItem[];
  iconVaultById: Record<string, IconVaultEntry>;
}> {
  const raw = await readVaultJsonWithLegacyMigration(ownerUid);
  let parsed = raw ? (JSON.parse(raw) as any[]) : [];
  let itemsMigrated = migrateVaultIconsForStorage(parsed);
  if (JSON.stringify(itemsMigrated) !== JSON.stringify(parsed)) {
    await AsyncStorage.setItem(vaultStorageKey(ownerUid), JSON.stringify(itemsMigrated));
  }

  /** Unión local + Firestore por `id`: si el caché local no tiene algún link, la tarjeta igual muestra iconos en app pero publicCardSlots salía []. */
  const byId = new Map<string, any>();
  for (const it of itemsMigrated) {
    const id = String(it?.id || '').trim();
    if (id) {
      byId.set(id, it);
    }
  }
  try {
    const cloudSnapshot = await getDocs(collection(db, 'users', ownerUid, 'links'));
    for (const itemDoc of cloudSnapshot.docs) {
      const id = String(itemDoc.id || '').trim();
      if (!id || byId.has(id)) {
        continue;
      }
      byId.set(id, { id: itemDoc.id, ...itemDoc.data() });
    }
  } catch {
    /* sin red */
  }
  itemsMigrated = migrateVaultIconsForStorage([...byId.values()]);

  if (itemsMigrated.length === 0) {
    try {
      const cloudSnapshot = await getDocs(collection(db, 'users', ownerUid, 'links'));
      const cloudItems = cloudSnapshot.docs.map((itemDoc) => ({
        id: itemDoc.id,
        ...itemDoc.data(),
      })) as any[];
      itemsMigrated = migrateVaultIconsForStorage(cloudItems);
      await AsyncStorage.setItem(vaultStorageKey(ownerUid), JSON.stringify(itemsMigrated));
    } catch {
      /* sin red */
    }
  }
  itemsMigrated = await mergeBuiltinGhostLinkIntoVault(ownerUid, itemsMigrated);
  let iconMap: Record<string, IconVaultEntry> = {};
  try {
    const vaultMap = await getUserIconVaultMap(ownerUid);
    iconMap = Object.fromEntries(vaultMap);
  } catch {
    iconMap = {};
  }
  return { vaultItems: itemsMigrated as VaultItem[], iconVaultById: iconMap };
}

type Universal24hQrCacheRow = {
  universalUrl: string;
  expiresAt: number;
  /** Misma ventana que al emitir (barra de progreso al reabrir). */
  qrWindowMs: number;
};

function universal24hQrStorageKey(ownerUid: string, cardId: string) {
  return `@cs_universal24h_${ownerUid}_${cardId}`;
}

async function readUniversal24hQrCache(ownerUid: string, cardId: string): Promise<Universal24hQrCacheRow | null> {
  try {
    const raw = await AsyncStorage.getItem(universal24hQrStorageKey(ownerUid, cardId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Universal24hQrCacheRow>;
    const universalUrl = String(p.universalUrl || '').trim();
    const expiresAt = Number(p.expiresAt || 0);
    const qrWindowMs = Math.max(1000, Number(p.qrWindowMs || 0));
    if (!universalUrl || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await AsyncStorage.removeItem(universal24hQrStorageKey(ownerUid, cardId));
      return null;
    }
    return { universalUrl, expiresAt, qrWindowMs };
  } catch {
    return null;
  }
}

async function writeUniversal24hQrCache(ownerUid: string, cardId: string, row: Universal24hQrCacheRow) {
  try {
    await AsyncStorage.setItem(universal24hQrStorageKey(ownerUid, cardId), JSON.stringify(row));
  } catch {
    /* ignore */
  }
}

/**
 * Smart Card: la lista pública de datos es solo `itemIds` (subset de la Bóveda).
 * Ítems indelebles en Bóveda (p. ej. Ghost-Link bootstrap / vaultProtected) no se añaden solos a la tarjeta:
 * el usuario los incluye o excluye en el editor como cualquier otro dato.
 */
type SmartCard = {
  id: string;
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
};

/** Una sola fila por `id` (evita claves duplicadas en listas y orden manual). */
function dedupeSmartCardsById(cards: SmartCard[]): SmartCard[] {
  const byId = new Map<string, SmartCard>();
  for (const c of cards) {
    const id = String(c.id || '').trim();
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
  return item.kind === 'business' ? `b:${item.bId}` : `s:${item.card.id}`;
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
  const tr = (es: string, en: string) => language === 'en' ? en : es;
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [iconVaultById, setIconVaultById] = useState<Record<string, IconVaultEntry>>({});
  const [smartCards, setSmartCards] = useState<SmartCard[]>([]);
  const [businessCardsFeed, setBusinessCardsFeed] = useState<BusinessCardListRow[]>([]);
  const [selectedCard, setSelectedCard] = useState<SmartCard | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [cardName, setCardName] = useState('');
  const [layoutMode, setLayoutMode] = useState<'vertical' | 'horizontal'>('vertical');
  const [themeId, setThemeId] = useState<string>('deep_teal');
  /** Ancho de tile del modal Temas (misma fórmula que Locker de Estilos, caja 85% / max 380 menos padding). */
  const themesModalTileWidth = useMemo(() => {
    const boxOuter = Math.min(400, width * 0.92);
    const contentInner = Math.max(200, boxOuter - 32);
    return computeThemeLockerTileWidth(contentInner);
  }, [width]);
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
    cardId: string;
    bcName: string;
    bcContactName: string;
    ownerUid: string;
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
  const [themesPlaceholderVisible, setThemesPlaceholderVisible] = useState(false);
  const [qrToken, setQrToken] = useState('');
  /** Si no está vacío, el QR codifica esta URL web (acceso universal 24h); si no, JSON in-app (`qrToken`). */
  const [qrUniversalWebUrl, setQrUniversalWebUrl] = useState('');
  const [qrExpiresAt, setQrExpiresAt] = useState<number>(0);
  const [qrWindowMs, setQrWindowMs] = useState(60000);
  /** Tarjeta a la que aplica el QR activo (dinámico o web 24h); bloquea otra emisión hasta `qrExpiresAt`. */
  const [qrActiveCardId, setQrActiveCardId] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [issuingQr, setIssuingQr] = useState(false);
  const [issuingUniversalLink, setIssuingUniversalLink] = useState(false);
  /** UID de la sesión en Mis Tarjetas (QR permanente en filas de negocio). */
  const [sessionOwnerUid, setSessionOwnerUid] = useState<string | null>(null);
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
  const [ownerNickname, setOwnerNickname] = useState('');
  const [ownerDisplayName, setOwnerDisplayName] = useState('');
  const [ownerPhotoUrl, setOwnerPhotoUrl] = useState<string | null>(null);
  const parallaxX = useRef(new Animated.Value(0)).current;
  const parallaxY = useRef(new Animated.Value(0)).current;
  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
      const userData = userSnap.data() as Record<string, unknown>;
      if (userData) {
        const display = readUserFullName(userData);
        setOwnerDisplayName(
          display === 'Usuario' ? String(userData.firstName || '').trim() || authFallback : display
        );
        setOwnerNickname(
          readUserNickName(userData) || readUserNickNameLower(userData) || authFallback
        );
        setOwnerPhotoUrl(
          toRenderableImageUri(readUserAvatarUrl(userData) || undefined) ||
            toRenderableImageUri(user.photoURL) ||
            null
        );
      } else {
        setOwnerDisplayName(authFallback);
        setOwnerNickname(authFallback);
        setOwnerPhotoUrl(toRenderableImageUri(user.photoURL) || null);
      }
    } catch {
      setOwnerDisplayName(authFallback);
      setOwnerNickname(authFallback);
      setOwnerPhotoUrl(toRenderableImageUri(user.photoURL) || null);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const verifyAccess = async () => {
        const authenticated = await hardLockCheck('acceso a Business Cards');
        setIsCardsUnlocked(authenticated);
        if (!authenticated) {
          setSessionOwnerUid(null);
          return;
        }

        const uid = await getActiveUserId();
        setSessionOwnerUid(uid ?? null);

        void refreshThemes();

        InteractionManager.runAfterInteractions(() => {
          void loadOwnerProfile();
          loadVaultItems();
          loadSmartCards();
          void loadBusinessCardsFeed();
        });
      };

      void verifyAccess();
    }, [refreshThemes, loadOwnerProfile])
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
        setQrActiveCardId(null);
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

  const loadVaultItems = async () => {
    try {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        setVaultItems([]);
        setIconVaultById({});
        return;
      }
      const snap = await loadVaultSnapshotForSync(ownerUid);
      setVaultItems(snap.vaultItems);
      setIconVaultById(snap.iconVaultById);
    } catch {
      setVaultItems([]);
      setIconVaultById({});
    }
  };

  const loadSmartCards = async (): Promise<SmartCard[]> => {
    const ownerUid = await getActiveUserId();
    if (!ownerUid) {
      setSmartCards([]);
      return [];
    }

    let lastList: SmartCard[] = [];
    try {
      const raw = await readSmartCardsJsonWithLegacyMigration(ownerUid);
      const cached = raw ? (JSON.parse(raw) as SmartCard[]) : [];
      lastList = dedupeSmartCardsById(cached.map((card) => ({ ...card, isFavorite: Boolean(card.isFavorite) })));
      if (lastList.length > 0) {
        setSmartCards(lastList);
      }
    } catch {
      /* ignora — la nube actualiza a continuación */
    }

    try {
      const remote = await listSmartCardsFromDb({ uid: ownerUid });
      const smartOnly = remote.cards.filter((c) => (c.cardType || 'smart') !== 'business');
      const mapped = smartOnly.map((card) => ({
        id: card.cardId,
        scName: card.scName,
        layout: card.layout,
        themeId: card.themeId || 'deep_teal',
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
      }));

      const deduped = dedupeSmartCardsById(mapped);
      setSmartCards(deduped);
      await AsyncStorage.setItem(smartCardsStorageKey(ownerUid), JSON.stringify(deduped));
      return deduped;
    } catch {
      return lastList;
    }
  };

  const loadBusinessCardsFeed = async (): Promise<BusinessCardListRow[]> => {
    const ownerUid = await getActiveUserId();
    if (!ownerUid) {
      setBusinessCardsFeed([]);
      return [];
    }
    try {
      let rows = await listBusinessCardsByOwner(ownerUid);
      try {
        const { cards: mongoMirror } = await listSmartCardsFromDb({ uid: ownerUid });
        rows = mergeBusinessCardRowsWithMongoOwnerPhoto(rows, mongoMirror);
      } catch {
        /* sin espejo Mongo: se usa solo Firestore */
      }
      /* Obtener holdersCount real desde share_permissions (MongoDB) */
      const cardIds = rows.map((r) => r.bId);
      if (cardIds.length) {
        try {
          const counts = await fetchBusinessCardHolderCounts({ ownerUid, cardIds });
          for (const r of rows) {
            if (counts[r.bId] !== undefined) {
              r.holdersCount = counts[r.bId];
            }
          }
        } catch { /* Firestore fallback si el backend no responde */ }
      }
      setBusinessCardsFeed(rows);
      return rows;
    } catch {
      setBusinessCardsFeed([]);
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
  ): SmartCardPayload => {
    const vItems = vaultSnap?.vaultItems ?? vaultItems;
    const vIcons = vaultSnap?.iconVaultById ?? iconVaultById;
    const searchFacets = buildSearchFacetsForSharedCard(vItems, card.itemIds);
    const occ = deriveOwnerOccupationFromFacets(searchFacets).trim();
    const publicCardSlots = buildPublicCardSlotsForPersist(vItems, card.itemIds, vIcons);
    return {
      cardId: card.id,
      scName: card.scName,
      layout: card.layout,
      themeId: card.themeId || 'deep_teal',
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
      ownerDisplayName: (ownerDisplayName || '').trim() || undefined,
      ownerNickname: (ownerNickname || '').trim() || undefined,
      ownerPhotoUrl,
      ownerOccupation: occ || undefined,
      searchFacets,
      publicCardSlots,
    };
  };

  const persistCards = async (nextCards: SmartCard[], changedCardIds?: string[]) => {
    console.log('[Card] persistCards: INICIO');
    const normalized = dedupeSmartCardsById(nextCards);
    setSmartCards(normalized);

    console.log('[Card] persistCards: Antes de getActiveUserId');
    const ownerUid = await getActiveUserId();
    console.log('[Card] persistCards: Después de getActiveUserId', ownerUid);

    console.log('[Card] persistCards: Antes de AsyncStorage.setItem');
    if (ownerUid) {
      await AsyncStorage.setItem(smartCardsStorageKey(ownerUid), JSON.stringify(normalized));
    }
    console.log('[Card] persistCards: Después de AsyncStorage.setItem');

    try {
      if (!ownerUid) {
        return;
      }

      const cardsToSync = changedCardIds
        ? nextCards.filter((c) => changedCardIds.includes(c.id))
        : nextCards;

      for (const card of cardsToSync) {
        console.log('[Card] persistCards: Antes de upsertSmartCardInDb', card.id);
        await upsertSmartCardInDb({
          ownerUid,
          card: buildSmartCardDbPayload(card),
        });
        console.log('[Card] persistCards: Después de upsertSmartCardInDb', card.id);
      }
    } catch (e) {
      // Keep local cache as fallback when backend is not reachable.
      console.log('[Card] persistCards: ERROR', e);
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
      .map((c) => c.id);
    if (!ids.length) {
      return;
    }
    void (async () => {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        return;
      }
      const state = searchFacetRepairAttemptRef.current;
      if (state.uid !== ownerUid) {
        searchFacetRepairAttemptRef.current = { uid: ownerUid, attempted: false };
      } else if (state.attempted) {
        return;
      }
      searchFacetRepairInFlightRef.current = true;
      try {
        searchFacetRepairAttemptRef.current = {
          uid: ownerUid,
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
    setThemeId('deep_teal');
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
      
      if (!validation.canCreate && validation.isFreeUser) {
        // Show limit reached modal
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
    setThemeId(card.themeId || 'deep_teal');
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
            id: card.wallpaperId || `custom-${card.id}`,
            name: String(card.wallpaperId || `custom-${card.id}`).trim() || 'wallpaper',
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
      if (selectedCard && card.id === selectedCard.id) {
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
          card.id === selectedCard.id
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
        await persistCards(nextCards as SmartCard[], [selectedCard.id]);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Toast.show({
          type: 'success',
          text1: tr('Cambio exitoso', 'Change saved'),
          text2: tr('La tarjeta se actualizo correctamente.', 'The card was updated successfully.'),
          position: 'bottom',
          visibilityTime: 2200,
        });
        setFactoryVisible(false);
        return;
      }

      const newCard: SmartCard = {
        id: createSmartCardId(),
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

      await persistCards([newCard, ...smartCards], [newCard.id]);
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
    const nextCards = smartCards.filter((item) => item.id !== card.id);
    await persistCards(nextCards);

    try {
      const ownerUid = await getActiveUserId();
      if (ownerUid) {
        await deleteSmartCardInDb({ ownerUid, cardId: card.id });
      }
    } catch {
      // Local state already updated.
    }

    if (selectedCard?.id === card.id) {
      setSelectedCard(null);
    }
  };

  const toggleFavoriteCard = async (card: SmartCard) => {
    const nextCards = smartCards.map((entry) =>
      entry.id === card.id
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
      entry.id === card.id
        ? {
            ...entry,
            itemIds: normalized,
            updatedAt: nowIso,
          }
        : entry
    );

    await persistCards(nextCards);
    const refreshed = nextCards.find((entry) => entry.id === card.id) || null;
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

  const closeThemesPickerModal = () => {
    setThemesPlaceholderVisible(false);
    requestAnimationFrame(() => restoreFactoryAfterAuxModal());
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

    Alert.alert('Gestionar icono', 'Elige la accion para este dato de la tarjeta.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Editar', onPress: onEdit },
      {
        text: 'Mover',
        onPress: () => {
          Alert.alert('Mover icono', 'Selecciona la direccion de movimiento.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Atras', onPress: () => { void onMoveBack(); } },
            { text: 'Adelante', onPress: () => { void onMoveForward(); } },
          ]);
        },
      },
      {
        text: 'Agregar nuevo dato',
        onPress: () => openAddDataFlowFromPreview(card),
      },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => { void onDelete(); },
      },
    ]);
  };

  const openBusinessSubscribersModal = async (row: BusinessCardListRow) => {
    try {
      void loadOwnerProfile();
      setSubscribersVisible(true);
      setSubscribersLoading(true);
      setSubscribersBusinessRow(row);
      setSubscribersCard(null);

      const ownerUid = await getActiveUserId();
      if (!ownerUid) throw new Error('No active session.');

      const response = await listCardSubscribers({ ownerUid, cardId: row.bId });
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

      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        throw new Error('No se pudo validar tu sesion.');
      }

      const response = await listCardSubscribers({ ownerUid, cardId: card.id });
      setSubscribers(response.subscribers);

      setSmartCards((prev) =>
        prev.map((entry) =>
          entry.id === card.id
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
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        throw new Error('No se pudo validar tu sesion.');
      }

      await revokeCardSubscriber({
        ownerUid,
        cardId: subscribersCard.id,
        targetUid,
      });

      const nextRows = subscribers.filter((row) => row.uid !== targetUid);
      setSubscribers(nextRows);
      setSmartCards((prev) =>
        prev.map((entry) =>
          entry.id === subscribersCard.id
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
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        throw new Error('No se pudo validar tu sesion.');
      }

      await blockRelationship({ ownerUid, targetUid });

      const nextRows = subscribers.filter((row) => row.uid !== targetUid);
      setSubscribers(nextRows);
      if (subscribersCard) {
        setSmartCards((prev) =>
          prev.map((entry) =>
            entry.id === subscribersCard.id
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
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        throw new Error('No se pudo validar tu sesion.');
      }

      await setCardSubscriberMute({
        ownerUid,
        cardId: subscribersCard.id,
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
      const ownerUid = await getActiveUserId();
      if (!ownerUid) return;
      await setCardSilenced({ ownerUid, cardId: card.id, silenced: next });
      setSmartCards((prev) =>
        prev.map((c) => (c.id === card.id ? { ...c, silenced: next } : c)),
      );
    } catch (e: any) {
      Alert.alert(tr('Error', 'Error'), e?.message || tr('No se pudo actualizar.', 'Could not update.'));
    }
  };

  const issueQrForCard = async (card: SmartCard) => {
    try {
      const authenticated = await hardLockCheck(tr('generar QR y compartir tu tarjeta', 'generate QR and share your card'));
      if (!authenticated) {
        return;
      }

      // Mismo QR dinámico (app↔app) aún válido: solo reabrir modal con countdown, sin nueva emisión.
      if (
        qrActiveCardId === card.id &&
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

      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        throw new Error(tr('No se pudo obtener tu sesión para emitir el QR.', 'Could not get your session to issue the QR.'));
      }

      // Sincroniza smart_cards (themeId + publicCardSlots) antes de emitir el token,
      // igual que el flujo de QR web 24h. Sin esto, el receptor ve la tarjeta vacía
      // o con el tema incorrecto si el documento en MongoDB está desactualizado.
      try {
        const vaultSnap = await loadVaultSnapshotForSync(ownerUid);
        await upsertSmartCardInDb({ ownerUid, card: buildSmartCardDbPayload(card, vaultSnap) });
      } catch {
        // Mejor esfuerzo: el QR se emite igualmente; el receptor verá el snapshot anterior si falla la red.
      }

      const issued = await issueDynamicQrToken({ ownerUid, cardId: card.id });
      const parsedExpiresAt = Date.parse(String(issued.expiresAt || ''));
      const nextExpiresAt = Number.isFinite(parsedExpiresAt)
        ? parsedExpiresAt
        : Date.now() + Math.max(1, Number(issued.ttlSec || 120)) * 1000;
      const visibleWindowMs = Math.max(1000, nextExpiresAt - Date.now());

      // QR payload: JSON opaco para que scan.tsx lo parsee (no una URL)
      const qrJson = JSON.stringify({
        kind: 'cardsocial-qr-v1',
        token: issued.token,
        cardId: card.id,
        exp: nextExpiresAt,
      });
      setQrUniversalWebUrl('');
      setQrToken(qrJson);
      setQrExpiresAt(nextExpiresAt);
      setQrWindowMs(visibleWindowMs);
      setQrActiveCardId(card.id);
      setQrVisible(true);
    } catch (error: any) {
      const rawMessage = String(error?.message || '');
      const likelyNetworkError =
        /network error/i.test(rawMessage) ||
        /failed to fetch/i.test(rawMessage) ||
        /timeout/i.test(rawMessage);
      const diagnosticMessage = likelyNetworkError
        ? tr(
            'No se pudo conectar al backend de QR.\n\nChecklist rápido:\n• EXPO_PUBLIC_MODERATION_API_URL con IP LAN (no localhost)\n• Backend activo en puerto 4000\n• Móvil y PC en la misma Wi‑Fi\n• EXPO_PUBLIC_MODERATION_GATEWAY_KEY igual a API_GATEWAY_KEY del backend',
            'Could not connect to the QR backend.\n\nQuick checklist:\n• EXPO_PUBLIC_MODERATION_API_URL uses LAN IP (not localhost)\n• Backend is running on port 4000\n• Phone and PC are on the same Wi‑Fi\n• EXPO_PUBLIC_MODERATION_GATEWAY_KEY matches backend API_GATEWAY_KEY'
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
        const ownerUid = await getActiveUserId();
        if (!ownerUid) {
          throw new Error(tr('Sin sesión', 'Not signed in'));
        }
        const sum = await getCardAnalyticsSummary({ ownerUid, cardId: card.id });
        setCardStatsData({ totalViews: sum.totalViews, topIcons: sum.topIcons });
      } catch {
        setCardStatsData({ totalViews: 0, topIcons: [] });
      } finally {
        setCardStatsLoading(false);
      }
    })();
  };

  const confirmAndIssueQrForCard = (card: SmartCard) => {
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
            void issueQrForCard(card);
          },
        },
      ]
    );
  };

  /** QR web ~24h: si ya hay uno vigente para esta tarjeta, solo muestra modal + countdown; si no, lo crea. */
  const openOrCreateUniversalQrForCard = async (card: SmartCard) => {
    if (issuingUniversalLink) return;

    const universalStillValid =
      qrActiveCardId === card.id && qrExpiresAt > Date.now() && Boolean(qrUniversalWebUrl);

    if (universalStillValid) {
      setQrBusinessContext(null);
      setSelectedCard(card);
      setQrVisible(true);
      void (async () => {
        try {
          const uid = await getActiveUserId();
          if (uid) {
            const snap = await loadVaultSnapshotForSync(uid);
            await upsertSmartCardInDb({ ownerUid: uid, card: buildSmartCardDbPayload(card, snap) });
          }
        } catch {
          // Mejor esfuerzo: el enlace ya existía; la web puede seguir mostrando un snapshot antiguo si falla la red.
        }
      })();
      return;
    }

    try {
      const authenticated = await hardLockCheck(tr('QR web 24 h de tarjeta', '24h web QR for card'));
      if (!authenticated) return;
      const ownerUid = await getActiveUserId();
      if (!ownerUid) throw new Error(tr('No se pudo obtener tu sesión.', 'Could not get your session.'));

      const cached = await readUniversal24hQrCache(ownerUid, card.id);
      if (cached) {
        setQrBusinessContext(null);
        setSelectedCard(card);
        setQrToken('');
        setQrUniversalWebUrl(cached.universalUrl);
        setQrExpiresAt(cached.expiresAt);
        setQrWindowMs(cached.qrWindowMs);
        setQrActiveCardId(card.id);
        setQrVisible(true);
        void (async () => {
          try {
            const snap = await loadVaultSnapshotForSync(ownerUid);
            await upsertSmartCardInDb({ ownerUid, card: buildSmartCardDbPayload(card, snap) });
          } catch {
            /* mejor esfuerzo */
          }
        })();
        return;
      }

      setIssuingUniversalLink(true);
      // Leer Bóveda desde disco (no solo estado React): si no, publicCardSlots podía ir vacío y la web sin iconos.
      const vaultSnap = await loadVaultSnapshotForSync(ownerUid);
      const cardPayload = buildSmartCardDbPayload(card, vaultSnap);
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
      await upsertSmartCardInDb({ ownerUid, card: cardPayload });
      const result = await issueTemporaryUniversalAccess({ ownerUid, cardId: card.id });
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
      setQrActiveCardId(card.id);
      setQrVisible(true);
      await writeUniversal24hQrCache(ownerUid, card.id, {
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
    try {
      const authenticated = await hardLockCheck('generar QR y compartir tu tarjeta');
      if (!authenticated) {
        return;
      }

      setIssuingQr(true);
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        throw new Error(tr('No se pudo obtener tu sesión.', 'Could not get your session.'));
      }

      // Sincroniza el snapshot de la Business Card en MongoDB (smart_cards) antes de mostrar el QR permanente.
      // Sin esto, el receptor siempre ve 404 en /business-card-preview y cae en el fallback de Firestore,
      // que no incluye los vault items (vaultLinkIds) del propietario.
      try {
        const vaultSnap = await loadVaultSnapshotForSync(ownerUid);
        const publicCardSlots = buildPublicCardSlotsForPersist(
          vaultSnap.vaultItems,
          row.vaultLinkIds,
          vaultSnap.iconVaultById,
        );
        await upsertSmartCardInDb({
          ownerUid,
          card: {
            cardId: row.bId,
            bId: row.bId,
            scName: row.bcName,
            layout: 'vertical',
            themeId: row.themeId || 'deep_teal',
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
          },
        });
      } catch {
        // Mejor esfuerzo: el QR se muestra igualmente; el receptor verá el snapshot anterior (o 404 + fallback).
      }

      setQrBusinessContext({
        cardId: row.bId,
        bcName: row.bcName,
        bcContactName: row.bcContactName,
        ownerUid,
        bcLogoUrl: toRenderableImageUri(row.bcLogoUrl),
      });
      setSelectedCard(null);
      setQrToken('');
      setQrUniversalWebUrl('');
      setQrExpiresAt(0);
      setQrActiveCardId(null);
      setRemainingMs(0);
      setRemainingSec(0);
      setQrVisible(true);
    } catch (error: any) {
      Alert.alert(tr('Error de QR', 'QR error'), String(error?.message || ''));
    } finally {
      setIssuingQr(false);
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
    const ownerUid = await getActiveUserId();
    if (!ownerUid) {
      return;
    }
    let previous: BusinessCardListRow[] = [];
    setBusinessCardsFeed((p) => {
      previous = p;
      return p.filter((c) => c.bId !== row.bId);
    });
    try {
      const r = await removeBusinessCardFromFirestore(ownerUid, row.bId);
      if (!r.success) {
        throw new Error(r.message);
      }
    } catch {
      setBusinessCardsFeed(previous);
      Alert.alert(tr('Error', 'Error'), tr('No se pudo eliminar la tarjeta de negocio.', 'Could not delete the business card.'));
    }
  };

  const toggleBusinessCardSilence = async (row: BusinessCardListRow) => {
    const next = !row.silenced;
    try {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) return;
      await setCardSilenced({ ownerUid, cardId: row.bId, silenced: next });
      setBusinessCardsFeed((prev) =>
        prev.map((r) => (r.bId === row.bId ? { ...r, silenced: next } : r)),
      );
    } catch (e: any) {
      Alert.alert(tr('Error', 'Error'), e?.message || tr('No se pudo actualizar.', 'Could not update.'));
    }
  };

  const toggleFavoriteBusinessCard = async (row: BusinessCardListRow) => {
    const ownerUid = await getActiveUserId();
    if (!ownerUid) {
      return;
    }
    const next = !row.isFavorite;
    setBusinessCardsFeed((p) => p.map((c) => (c.bId === row.bId ? { ...c, isFavorite: next } : c)));
    try {
      const r = await setBusinessCardFavorite(ownerUid, row.bId, next);
      if (!r.success) {
        throw new Error(r.message);
      }
    } catch {
      setBusinessCardsFeed((p) => p.map((c) => (c.bId === row.bId ? { ...c, isFavorite: row.isFavorite } : c)));
    }
  };

  const openPreviewBusinessCard = async (row: BusinessCardListRow) => {
    const uid = (await getActiveUserId()) ?? sessionOwnerUid ?? '';
    const rows = await loadBusinessCardsFeed();
    const fresh = rows.find((r) => r.bId === row.bId) ?? row;
    setPreviewBusinessOwnerUid(uid);
    setPreviewBusiness(fresh);
    setPreviewLayout(width > height ? 'horizontal' : 'vertical');
    setPreviewBusinessVisible(true);
  };

  const businessSwipeKey = (id: string) => `business:${id}`;

  const previewCardItems = useMemo(() => {
    if (!previewCard) {
      return [];
    }
    const idOrder = previewCard.itemIds.map((id) => String(id || '').trim()).filter(Boolean);
    const byId = new Map(vaultItems.map((v) => [String(v.id || '').trim(), v]));
    const out: VaultItem[] = [];
    for (const id of idOrder) {
      const item = byId.get(id);
      if (item) {
        out.push(item);
      }
    }
    return out;
  }, [previewCard, vaultItems]);

  const editSlots = useMemo<EditSlot[]>(() => {
    return Array.from({ length: MAX_CARD_SLOTS }, (_, index) => {
      const itemId = selectedItemIds[index];
      const item = vaultItems.find((entry) => entry.id === itemId) || null;
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
        'Modelo actualizado',
        'No existe suscripcion global. Si quieres funciones de negocio, activa anualidad por cada Tarjeta de Negocio en Create Business Card.',
      );
    } catch (error) {
      console.error('Error upgrading:', error);
      Alert.alert(tr('Error', 'Error'), tr('No se pudo completar la compra.', 'Purchase could not be completed.'));
    }
  };

  const previewSlots = useMemo<EditSlot[]>(() => {
    return previewCardItems.map((item, index) => ({
      id: `preview-slot-${item.id}-${index}`,
      index,
      item,
    }));
  }, [previewCardItems]);

  const previewPayload = useMemo<MyCardsPayload | null>(() => {
    if (!previewCard) return null;
    return {
      cardName: (previewCard.scName || cardName || 'Nueva Tarjeta').trim(),
      subtitle: `@${(ownerNickname || 'user').toLowerCase()}`,
      avatarUrl: ownerPhotoUrl,
      themeId: previewCard.themeId || '',
      wallpaperUrl: previewCard.wallpaperUrl,
      layout: previewLayout,
      holdersCount: previewCard.holdersCount ?? 0,
      ratingAvg: previewCard.ratingAvg ?? 5,
      totalRatings: previewCard.totalRatings ?? 0,
      enableParallax,
      slots: previewSlots as unknown as WireframeEditSlot[],
      iconVaultById,
    };
  }, [previewCard, cardName, ownerNickname, ownerPhotoUrl, previewLayout, enableParallax, previewSlots, iconVaultById]);

  const businessPreviewSlots = useMemo<EditSlot[]>(() => {
    if (!previewBusiness?.vaultLinkIds?.length) {
      return [];
    }
    return previewBusiness.vaultLinkIds.map((linkId, index) => {
      const item = vaultItems.find((v) => v.id === linkId) || null;
      return { id: `biz-preview-${linkId}-${index}`, index, item };
    });
  }, [previewBusiness, vaultItems]);

  const businessPreviewPayload = useMemo<MyCardsPayload | null>(() => {
    if (!previewBusiness) return null;
    return {
      cardName: previewBusiness.bcName.trim(),
      subtitle: previewBusiness.bcContactName.trim(),
      avatarUrl: toRenderableImageUri(previewBusiness.bcLogoUrl),
      themeId: previewBusiness.themeId || '',
      layout: previewLayout,
      holdersCount: previewBusiness.holdersCount ?? 0,
      ratingAvg: Number(previewBusiness.ratingAvg ?? 0),
      totalRatings: previewBusiness.totalRatings ?? 0,
      enableParallax,
      slots: businessPreviewSlots as unknown as WireframeEditSlot[],
      noAvatarIcon: 'storefront-outline',
      iconVaultById,
    };
  }, [previewBusiness, previewLayout, enableParallax, businessPreviewSlots, iconVaultById]);

  const qrPayload = useMemo(() => {
    if (qrBusinessContext) {
      return generatePermanentBusinessLink(qrBusinessContext.cardId, qrBusinessContext.ownerUid);
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
    // qrToken: JSON {kind, token, cardId, exp} para escaneo in-app
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
    const unique = dedupeSmartCardsById(smartCards);
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
    void (async () => {
      const list = await loadSmartCards();
      const fresh = list.find((c) => c.id === card.id) ?? card;
      setPreviewLayout(width > height ? 'horizontal' : 'vertical');
      setPreviewCard(fresh);
      setPreviewVisible(true);
    })();
  };

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
    const activeCard =
      previewBusinessVisible && previewBusiness
        ? { id: previewBusiness.bId, scName: previewBusiness.bcName }
        : previewVisible && previewCard
          ? previewCard
          : selectedCard;
    const issuerUid = await getActiveUserId();
    await openVaultPreviewItem(item, {
      tr,
      openDocumentViewer: (it) => {
        openDocumentViewer(it as VaultItem);
      },
      ghostTargetUid: issuerUid,
      sourceCardName: activeCard?.scName ?? cardName ?? 'Tarjeta Social',
      sourceCardId: activeCard?.id ?? null,
      peerDisplayName: ownerNickname || 'este contacto',
      dismissParentModal: dismissCardPreviewModals,
      peerPhotoUrl: ownerPhotoUrl ?? null,
      cardPhoto: ownerPhotoUrl ?? null,
      cardType: previewBusinessVisible ? 'business' : 'personal',
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
      const activeCard =
        previewBusinessVisible && previewBusiness
          ? { id: previewBusiness.bId, scName: previewBusiness.bcName }
          : previewVisible && previewCard
            ? previewCard
            : selectedCard;
      const issuerUid = await getActiveUserId();
      await openVaultPreviewItem(item, {
        tr,
        openDocumentViewer: (it) => {
          openDocumentViewer(it as VaultItem);
        },
        ghostTargetUid: issuerUid,
        sourceCardName: activeCard?.scName ?? cardName ?? 'Tarjeta Social',
        sourceCardId: activeCard?.id ?? null,
        peerDisplayName: ownerNickname || 'este contacto',
        dismissParentModal: dismissCardPreviewModals,
        peerPhotoUrl: ownerPhotoUrl ?? null,
        cardPhoto: ownerPhotoUrl ?? null,
        cardType: previewBusinessVisible ? 'business' : 'personal',
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
    setViewerItem(item);
    setViewerVisible(true);
  };

  const renderIdentityBadge = (compact = false) => {
    const holderCount = selectedCard?.holdersCount ?? previewCard?.holdersCount ?? 0;
    const capSize = compact ? 11 : 13;
    return (
      <>
        {ownerPhotoUrl ? (
          <ExpoImage source={{ uri: ownerPhotoUrl }} style={compact ? styles.wireAvatarSm : styles.wireAvatar} cachePolicy="disk" />
        ) : (
          <View style={compact ? styles.wireAvatarFallbackSm : styles.wireAvatarFallback}>
            <MaterialCommunityIcons name="account" size={compact ? 22 : 32} color="#0D4D8A" />
          </View>
        )}
        <AutoScaleText style={compact ? styles.wireNameSm : styles.wireName}>{(selectedCard?.scName || previewCard?.scName || cardName || 'Nueva Tarjeta').trim()}</AutoScaleText>
        <AutoScaleText style={compact ? styles.wireNickSm : styles.wireNick}>@{(ownerNickname || 'user').toLowerCase()}</AutoScaleText>
        <View style={styles.wireStatsRowInline}>
          <View style={styles.wireUsersPill}>
            <MaterialCommunityIcons name="account-outline" size={capSize} color="#0A2540" />
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
  }) => {
    const { layout, slots, editable, theme, wallpaperUrl, wireIdentity } = params;
    const wId = wireIdentity;
    const dispName = wId?.cardTitle ?? (selectedCard?.scName || previewCard?.scName || cardName || 'Nueva Tarjeta').trim();
    const dispSub = wId ? wId.subtitle : `@${(ownerNickname || 'user').toLowerCase()}`;
    const dispAvatar = wId ? wId.avatarUri : ownerPhotoUrl;
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
            swipeableMethodsByCardIdRef.current.get(sk)?.close();
            confirmAndIssueQrForBusiness(row);
          }
        }}
        renderRightActions={() => (
          <View style={styles.swipeActions}>
            <TouchableOpacity
              style={[styles.swipeActionBtn, { backgroundColor: cardsTheme.swipeStripEditBg }]}
              onPress={() => {
                closeBusinessRowSwipe();
                router.push({ pathname: '/(tabs)/createBusinessCard', params: { cardId: row.bId } } as any);
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
              accessibilityLabel={tr('Favorito', 'Favorite')}
            >
              <MaterialCommunityIcons name={row.isFavorite ? 'star' : 'star-outline'} size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>{row.isFavorite ? '★' : '☆'}</Text>
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
              closeAllCardSwipes();
              void openPreviewBusinessCard(row);
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
                {sessionOwnerUid ? (
                  <View style={styles.businessListQrWrap} pointerEvents="none">
                    <QRCode
                      value={generatePermanentBusinessLink(row.bId, sessionOwnerUid)}
                      size={64}
                      color="#0A2540"
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
    const reviewCount = item.totalRatings ?? 0;
    const ratingRaw = Number(item.ratingAvg ?? 0);
    const rating =
      reviewCount > 0 && Number.isFinite(ratingRaw) ? Math.max(0, Math.min(5, ratingRaw)) : 0;
    const themeMeta = getThemeById(item.themeId || '') ?? CHEST_THEMES[0];
    const themeLabel = themeMeta.name;
    const closeSmartCardRowSwipe = () => {
      swipeableMethodsByCardIdRef.current.get(item.id)?.close();
    };

    return (
      <Swipeable
        containerStyle={[styles.swipeWrap, isLandscape && styles.swipeWrapLandscape]}
        rightThreshold={24}
        leftThreshold={24}
        renderLeftActions={(_progress, _translation, methods) => {
          swipeableMethodsByCardIdRef.current.set(item.id, methods);
          return <View style={styles.swipeLeftTriggerArea} />;
        }}
        onSwipeableOpen={(direction) => {
          if (direction === 'right') {
            swipeableMethodsByCardIdRef.current.get(item.id)?.close();
            confirmAndIssueQrForCard(item);
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
              accessibilityLabel={tr('Favorito', 'Favorite')}
            >
              <MaterialCommunityIcons name={item.isFavorite ? 'star' : 'star-outline'} size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>{item.isFavorite ? '★' : '☆'}</Text>
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
              closeAllCardSwipes();
              openPreviewCard(item);
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
            <MaterialCommunityIcons name="chart-line-variant" size={17} color="rgba(212,175,55,0.95)" />
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
      const reviewCount = row.totalRatings ?? 0;
      const ratingRaw = Number(row.ratingAvg ?? 0);
      const rating =
        reviewCount > 0 && Number.isFinite(ratingRaw) ? Math.max(0, Math.min(5, ratingRaw)) : 0;
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
                        <View style={styles.statsRatingStack}>
                          <View style={styles.businessRatingStarsWrap}>{renderWireframeDetailedRatingStars(rating)}</View>
                          <Text style={[styles.ratingStackCaption, { color: chestTheme.metaColor }]} numberOfLines={2}>
                            {rating.toFixed(1)} · {reviewCount} {tr('reseñas', 'reviews')}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {sessionOwnerUid ? (
                      <View style={styles.businessListQrWrap} pointerEvents="none">
                        <QRCode
                          value={generatePermanentBusinessLink(row.bId, sessionOwnerUid)}
                          size={64}
                          color="#0A2540"
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
      <LinearGradient
        colors={[...cardsTheme.tabShellGradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="shield-lock-outline" size={56} color={cardsTheme.icon} />
          <Text style={[styles.emptyTitle, { color: cardsTheme.text }]}>Acceso biométrico requerido</Text>
          <Text style={[styles.emptyText, { color: cardsTheme.modalSubtitle }]}>Autoriza FaceID/TouchID para entrar a Business Cards.</Text>
          <TouchableOpacity
            style={[styles.firstQrBtn, { backgroundColor: cardsTheme.btnPrimary }]}
            onPress={async () => {
              const authenticated = await hardLockCheck('acceso a Business Cards');
              setIsCardsUnlocked(authenticated);
              if (authenticated) {
                const uid = await getActiveUserId();
                setSessionOwnerUid(uid ?? null);
                loadVaultItems();
                loadSmartCards();
                void loadBusinessCardsFeed();
              }
            }}
          >
            <MaterialCommunityIcons name="fingerprint" size={18} color={cardsTheme.btnPrimaryText} />
            <Text style={[styles.firstQrBtnText, { color: cardsTheme.btnPrimaryText }]}>Desbloquear</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[...cardsTheme.tabShellGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={[styles.headerRow, { borderBottomColor: cardsTheme.divider }]}> 
        <View>
          <Text style={[styles.headerTitle, { color: cardsTheme.text }]}>{tr('Mis Tarjetas', 'My Cards')}</Text>
          <Text style={[styles.headerSubtitle, { color: cardsTheme.sectionLabel }]}>
            {smartCards.length + businessCardsFeed.length} {tr('tarjetas', 'cards')}
            {businessCardsFeed.length > 0 && smartCards.length > 0
              ? ` (${smartCards.length} Smart · ${businessCardsFeed.length} ${tr('negocio', 'business')})`
              : ''}
          </Text>
        </View>
        <View style={styles.headerActionsRow}>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/createBusinessCard' as any)}
            activeOpacity={0.9}
            style={styles.businessCtaWrap}
            accessibilityRole="button"
            accessibilityLabel={tr('Abrir Business Card', 'Open Business Card')}
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
                <Text style={styles.businessCtaSub}>{tr('Lujo', 'Luxury')}</Text>
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
        style={[styles.createFab, { backgroundColor: cardsTheme.fabBg, opacity: cardsReorderMode ? 0.35 : 1 }]}
        onPress={openCreateFactory}
        activeOpacity={0.82}
        disabled={cardsReorderMode}
      >
        <MaterialCommunityIcons name="plus" size={20} color={cardsTheme.fabText} />
        <Text style={[styles.createFabText, { color: cardsTheme.fabText }]}>{tr('Crear', 'Create')}</Text>
      </TouchableOpacity>

      <Modal visible={factoryVisible} transparent animationType="slide" onRequestClose={closeFactoryModalAndSync}>
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
                    {ownerPhotoUrl ? (
                      <ExpoImage source={{ uri: ownerPhotoUrl }} style={styles.identityAvatarLg} cachePolicy="disk" />
                    ) : (
                      <View style={styles.identityAvatarLgFallback}>
                        <MaterialCommunityIcons name="account" size={32} color={cardsTheme.ctaAccent} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.identityFullName, { color: cardsTheme.text }]} numberOfLines={1}>
                        {ownerDisplayName || tr('Nombre Completo', 'Full Name')}
                      </Text>
                      <Text style={[styles.identityHandle, { color: cardsTheme.sectionLabel }]} numberOfLines={1}>
                        @{String(ownerNickname || 'user').toLowerCase().replace(/\s+/g, '')}
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
                              <MaterialCommunityIcons name="card-plus-outline" size={38} color={isDark ? 'rgba(184,231,255,0.3)' : 'rgba(13,77,138,0.18)'} />
                              <Text style={[styles.factoryPreviewEmptyText, { color: cardsTheme.sectionLabel }]}>
                                {tr('Agrega DATA para ver tu tarjeta aquí', 'Add DATA to see your card here')}
                              </Text>
                            </View>
                          ) : (
                            renderWireframeCard({
                              layout: isLandscape ? 'horizontal' : 'vertical',
                              slots: editSlots.filter((s) => s.item !== null),
                              editable: false,
                              theme: resolveTheme(themeId),
                              wallpaperUrl: selectedWallpaper?.fullUrl,
                            })
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
        <View style={[styles.modalOverlay, { backgroundColor: cardsTheme.modalOverlay }]}>
          <View style={[styles.dataSelectorModal, { backgroundColor: cardsTheme.modalBg, borderColor: cardsTheme.modalBorder }]}>

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
            ) : (
              <FlatList
                data={vaultItems}
                keyExtractor={(item) => item.id}
                numColumns={3}
                bounces={false}
                overScrollMode="never"
                renderItem={({ item }) => {
                  const isSelected = tempSelectedIds.includes(item.id);
                  return (
                    <TouchableOpacity
                      style={[
                        styles.selectorItemTile,
                        {
                          borderColor: isDark ? 'rgba(184,231,255,0.18)' : cardsTheme.border,
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
                          <MaterialCommunityIcons name="check-circle" size={17} color={cardsTheme.ctaAccent} />
                        </View>
                      )}
                      <View
                        style={[
                          styles.selectorIconCircle,
                          { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : cardsTheme.marketCtaPressedBg },
                        ]}
                      >
                        {renderVaultMiniIcon(item, 26)}
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
                >
                  {(['fresh', 'moderno', 'luxury'] as ThemeTier[]).map((tier) => {
                    const meta = TIER_META[tier];
                    const tierThemes = getThemesByTier(tier);
                    return (
                      <View key={tier} style={styles.themesLockerTierSection}>
                        <View style={styles.themesLockerTierHeader}>
                          <Text style={styles.themesLockerTierEmoji}>{meta.emoji}</Text>
                          <Text style={[styles.themesLockerTierLabel, { color: cardsTheme.text }]}>
                            {language === 'en' ? meta.label[1] : meta.label[0]}
                          </Text>
                          <View
                            style={[
                              styles.themesLockerTierLine,
                              { backgroundColor: tier === 'luxury' ? '#D4AF37' : cardsTheme.divider },
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
                              reviewsLabel={tr('4.8 · 12 reseñas', '4.8 · 12 reviews')}
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
        key={previewVisible && previewCard ? `my-cards-preview-${previewCard.id}` : 'my-cards-preview-closed'}
        visible={Boolean(previewVisible && previewCard)}
        onClose={() => {
          setPreviewVisible(false);
          setPreviewCard(null);
          refreshCardsTabFromServer();
        }}
        variant="issuer"
        payload={previewPayload}
        onEditCard={
          previewCard != null
            ? () => {
                setPreviewVisible(false);
                openEditFactory(previewCard);
              }
            : undefined
        }
        sourceCardId={previewCard?.id ?? null}
        sourceCardName={previewCard?.scName ?? cardName ?? 'Tarjeta Social'}
        peerDisplayName={ownerNickname || 'este contacto'}
        ghostTargetUid={sessionOwnerUid}
        ratingCardType='smart'
      />

      <MyCardsPreviewModal
        key={previewBusinessVisible && previewBusiness ? `my-cards-biz-${previewBusiness.bId}` : 'my-cards-biz-closed'}
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
          previewBusiness
            ? () => {
                const id = previewBusiness.bId;
                setPreviewBusinessVisible(false);
                setPreviewBusiness(null);
                setPreviewBusinessOwnerUid('');
                router.push({ pathname: '/(tabs)/createBusinessCard', params: { cardId: id } } as any);
              }
            : undefined
        }
        sourceCardId={previewBusiness?.bId ?? null}
        sourceCardName={previewBusiness?.bcName ?? tr('Negocio', 'Business')}
        peerDisplayName={ownerNickname || 'este contacto'}
        ghostTargetUid={previewBusinessOwnerUid || sessionOwnerUid}
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
            <Text style={[styles.factoryTitle, { color: cardsTheme.modalTitle }]}>Elegir dato para slot</Text>
            <Text style={[styles.slotPickerSubtitle, { color: cardsTheme.modalSubtitle }]}> 
              Slot #{activeSlotIndex !== null ? activeSlotIndex + 1 : '-'}
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
              <Text style={[styles.ghostBtnText, { color: cardsTheme.btnGhostText }]}>Cerrar</Text>
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
                <Text style={[styles.dataPopoverTitle, { color: cardsTheme.modalTitle }]}>{focusedDataItem?.title || 'Dato'}</Text>
                <Text style={[styles.dataPopoverType, { color: cardsTheme.sectionLabel }]}>{focusedDataItem?.type || 'Vault'}</Text>
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
                <Text style={styles.authCertTitle}>Certificado de Autenticidad</Text>
                <Text style={styles.authCertText}>{focusedCertificate.value}</Text>
                <Text style={styles.authCertToken}>Asset ID: {focusedCertificate.assetToken || 'N/A'}</Text>
              </View>
            ) : null}

            <View style={[styles.modalActions, { paddingBottom: modalFooterBottomPad }]}>
              <TouchableOpacity
                style={[styles.ghostBtn, { backgroundColor: cardsTheme.btnGhost, borderColor: cardsTheme.modalBorder }]}
                onPress={async () => {
                  await tryOpenInApp(focusedDataItem);
                }}
              >
                <Text style={[styles.ghostBtnText, { color: cardsTheme.btnGhostText }]}>Abrir en app</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: cardsTheme.btnPrimary }]}
                onPress={async () => {
                  await openInBrowser(focusedDataItem);
                }}
              >
                <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>Ver en navegador</Text>
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
              <Text style={[styles.popoverCloseText, { color: cardsTheme.btnGhostText }]}>Cerrar</Text>
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
            : (ownerDisplayName || tr('Mi Tarjeta', 'My Card')),
          occupation: subscribersBusinessRow
            ? (subscribersBusinessRow.bcContactName || '')
            : (() => {
                const cardNm = String(subscribersCard?.scName || '').trim();
                const who = String(ownerDisplayName || '').trim();
                if (cardNm && who && cardNm.localeCompare(who, undefined, { sensitivity: 'accent' }) === 0) {
                  const h = String(ownerNickname || '')
                    .trim()
                    .replace(/^@+/g, '')
                    .replace(/\s+/g, '');
                  return h ? `@${h.toLowerCase()}` : '';
                }
                return cardNm;
              })(),
          userAvatarUrl: subscribersBusinessRow?.bcLogoUrl || ownerPhotoUrl,
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
        <View style={[styles.modalOverlay, { backgroundColor: cardsTheme.modalOverlay }]}>
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
                    {selectedCard?.scName || 'Smart Card'}
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
                    : selectedCard?.scName || 'Smart Card'}
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
                      value={qrPayload}
                      size={210}
                      color={isDark ? '#E8D4A3' : '#0D4D8A'}
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
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: cardsTheme.btnPrimary, flex: 1 }]}
                  onPress={() => {
                    setQrVisible(false);
                    setQrBusinessContext(null);
                  }}
                >
                  <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>{tr('Cerrar', 'Close')}</Text>
                </TouchableOpacity>
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
                        confirmAndIssueQrForCard(selectedCard);
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
                        {issuingUniversalLink ? tr('Generando…', 'Generating…') : tr('QR24h', 'QR24h')}
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
        </View>
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
                        <Text style={[styles.cardStatsIconCount, { color: 'rgba(212,175,55,0.95)' }]}>{row.count}</Text>
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
    </LinearGradient>
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
    color: '#0A2540',
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
    shadowColor: '#0A2540',
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
  businessCtaSub: {
    marginTop: 1,
    color: '#E9D8B0',
    fontSize: 10,
    fontWeight: '700',
  },


  createBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0A2540',
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
    backgroundColor: '#0A2540',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    shadowColor: '#0A2540',
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
    color: '#0D4D8A',
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
    shadowColor: '#0A2540',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  cardTitle: {
    color: '#0D4D8A',
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
    color: '#0D4D8A',
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
    backgroundColor: '#0A2540',
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
    color: '#0A2540',
    fontWeight: '800',
    fontSize: 22,
    textAlign: 'left',
  },
  wireNameSm: {
    marginTop: 7,
    color: '#0A2540',
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
    color: '#0A2540',
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
    backgroundColor: '#0D4D8A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,45,76,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  factoryModal: {
    width: '100%',
    height: '98%',
    flexDirection: 'column',
    backgroundColor: '#F2FBFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  factoryTitle: {
    color: '#0D4D8A',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  identityAutoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#CDEFFF',
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
    borderColor: '#CDEFFF',
    backgroundColor: '#EAF7FF',
  },
  identityLabel: {
    color: '#4F7B9A',
    fontSize: 10,
    fontWeight: '600',
  },
  identityValue: {
    color: '#0D4D8A',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    backgroundColor: '#FFFFFF',
    color: '#0D4D8A',
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
    borderColor: '#B8E7FF',
    backgroundColor: '#FFFFFF',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: {
    color: '#0D4D8A',
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#0D4D8A',
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
    color: '#0D4D8A',
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
    borderColor: '#B8E7FF',
  },
  previewItemLabel: {
    marginTop: 4,
    color: '#0D4D8A',
    fontSize: 10,
    fontWeight: '700',
  },
  dataPopoverCard: {
    width: '88%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    backgroundColor: '#F2FBFF',
    padding: 14,
  },
  dataPopoverTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dataPopoverTitle: {
    color: '#0D4D8A',
    fontSize: 16,
    fontWeight: '800',
  },
  dataPopoverType: {
    color: '#4A7392',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  dataPopoverHint: {
    marginTop: 10,
    color: '#3E6787',
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
    color: '#0A2540',
  },
  authCertText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#244A66',
  },
  authCertToken: {
    fontSize: 10,
    color: '#3D6787',
  },
  popoverCloseBtn: {
    marginTop: 10,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  popoverCloseText: {
    color: '#0D4D8A',
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
    backgroundColor: '#D4AF37',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewerDownloadText: {
    color: '#0A2540',
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
    backgroundColor: '#0E2236',
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
    borderColor: '#B8E7FF',
    backgroundColor: '#F2FBFF',
    padding: 14,
  },
  subscribersSubtitle: {
    color: '#3D6C8D',
    fontWeight: '700',
    marginTop: -2,
    marginBottom: 8,
  },
  subscribersList: {
    maxHeight: 390,
  },
  subscribersLoadingText: {
    color: '#406B8A',
    fontSize: 13,
    paddingVertical: 14,
  },
  subscriberRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CDEFFF',
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
    borderColor: '#B8E7FF',
    backgroundColor: '#EAF7FF',
  },
  subscriberName: {
    color: '#0D4D8A',
    fontWeight: '800',
    fontSize: 13,
  },
  subscriberUid: {
    color: '#5B809D',
    fontSize: 10,
    marginTop: 1,
  },
  amixesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: '#DCEFFF',
    borderWidth: 1,
    borderColor: '#A4CAE8',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  amixesBadgeText: {
    color: '#0A2540',
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
    borderColor: '#0A2540',
    backgroundColor: '#0A2540',
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
    borderColor: '#B8E7FF',
    backgroundColor: '#F2FBFF',
    padding: 14,
  },
  slotPickerSubtitle: {
    color: '#3D6C8D',
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
    borderColor: '#CFEFFF',
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
    color: '#0D4D8A',
    fontSize: 13,
    fontWeight: '700',
  },
  slotPickerType: {
    color: '#4F7799',
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
    backgroundColor: '#EAF7FF',
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
    color: '#0A2540',
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
    borderColor: 'rgba(184,231,255,0.72)',
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
    paddingBottom: 6,
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
  dataSelectorModal: {
    width: '100%',
    maxHeight: '88%',
    borderRadius: 16,
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
    maxHeight: 360,
    marginBottom: 8,
  },
  selectorItemTile: {
    flex: 1,
    margin: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CFEFFF',
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
  },
  selectorIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#EAF7FF',
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
    color: '#0A2540',
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
    color: '#0A2540',
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
    color: '#0A2540',
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
    borderColor: '#B8E7FF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    height: 42,
    shadowColor: '#0A2540',
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
    backgroundColor: 'rgba(10, 37, 64, 0.88)',
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
