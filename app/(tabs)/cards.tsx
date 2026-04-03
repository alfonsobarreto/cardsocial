import AutoScaleText from '@/components/AutoScaleText';
import LimitReachedModal from '@/components/LimitReachedModal';
import { isGhostLinkVaultType } from '@/constants/ghostLinkVault';
import { isClassicPhoneVaultType } from '@/services/vaultItemTypeGuards';
import { CARD_THEMES as CHEST_THEMES, getThemeById, TIER_META, type CardTheme as ChestCardTheme, type ThemeTier } from '@/constants/themeChest';
import { getActiveUserId } from '@/services/authSession';
import { type IconVaultEntry, getUserIconVaultMap } from '@/services/iconVaultService';
import { newEntityId } from '@/services/newEntityId';
import {
  readSmartCardsJsonWithLegacyMigration,
  readVaultJsonWithLegacyMigration,
  smartCardsStorageKey,
  vaultStorageKey,
} from '@/services/userScopedStorage';
import { hardLockCheck } from '@/services/biometricAuth';
import { type VaultCollectibleCertificate } from '@/services/collectibleService';
import { auth, db } from '@/services/firebaseConfig';
import { type CardFontItem, type FontTier } from '@/services/fontLibraryService';
import { useLanguage } from '@/services/language';
import { mergeBuiltinGhostLinkIntoVault } from '@/services/ghostLinkVaultBootstrap';
import { generatePermanentBusinessLink } from '@/services/brandedQrService';
import {
  listBusinessCardsByOwner,
  deleteBusinessCard as removeBusinessCardFromFirestore,
  setBusinessCardFavorite,
  type BusinessCardListRow,
} from '@/services/businessCardService';
import { validateCardCreation } from '@/services/limitService';
import { useLookMode } from '@/services/lookMode';
import {
  buildSearchFacetsForSharedCard,
  collectStringsSmartCard,
  orderByDeepSearchWithExpandedQuery,
} from '@/services/deepSearch';
import { buildExpandedMarketQuery } from '@/services/marketSearchSynonyms';
import {
  blockRelationship,
  deleteSmartCardInDb,
  issueDynamicQrToken,
  listCardSubscribers,
  listSmartCardsFromDb,
  revokeCardSubscriber,
  setCardSubscriberMute,
  upsertSmartCardInDb,
  type CardSubscriberRow,
  type SmartCardPayload,
} from '@/services/qrApi';
import { getCardRowTheme, useActiveTheme } from '@/services/useActiveTheme';
import { getWallpaperResizeMode, type WallpaperItem, type WallpaperTier } from '@/services/wallpaperService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Gyroscope } from 'expo-sensors';
import * as Sharing from 'expo-sharing';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  FlatList,
  Image,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import QRCode from 'react-native-qrcode-svg';
import Toast from 'react-native-toast-message';
import { ActionController } from '../../services/ActionController';
import { sanitizeMaterialCommunityIconName } from '../components/iconNameValidation';
import palette from '../theme';

let PdfComponent: any = null;
try {
  PdfComponent = require('react-native-pdf').default;
} catch {
  PdfComponent = null;
}

type CardThemeId = string;

/** Resolves a themeId to its full ChestCardTheme object. Falls back to the first theme. */
const resolveTheme = (id: string | undefined): ChestCardTheme => {
  return getThemeById(id || '') ?? CHEST_THEMES[0];
};

const toRenderableImageUri = (value: string | null | undefined): string | null => {
  const uri = String(value || '').trim();
  if (!uri) return null;
  if (uri.startsWith('https://') || uri.startsWith('http://')) return uri;
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

const WIREFRAME_MAX_ICONS = 12;

/** Máx. 3 filas. 1–3: una fila; 4–8: dos filas; 9–12: tres filas (reparto equilibrado). */
function getWireframeIconRowPlan(count: number): number[] {
  const n = Math.max(0, Math.min(WIREFRAME_MAX_ICONS, Math.floor(count)));
  if (n <= 0) return [];
  if (n <= 3) return [n];
  if (n === 4) return [2, 2];
  if (n === 5) return [2, 3];
  if (n === 6) return [3, 3];
  if (n === 7) return [3, 4];
  if (n === 8) return [4, 4];
  if (n === 9) return [3, 3, 3];
  if (n === 10) return [4, 3, 3];
  if (n === 11) return [4, 4, 3];
  return [4, 4, 4];
}

/** Espacio reservado bajo la burbuja para etiquetas (2 líneas). Menor = burbujas más grandes (~4/5 del hueco vs ~2/5). */
const WIREFRAME_SLOT_LABEL_RESERVE = 26;

function computeWireframeIconCellSize(
  gridW: number,
  gridH: number,
  rowPlan: number[],
  gap: number,
  labelReservePerRow = WIREFRAME_SLOT_LABEL_RESERVE,
): number {
  if (rowPlan.length === 0 || gridW <= 0 || gridH <= 0) return 0;
  const G = gap;
  const numRows = rowPlan.length;
  let s = Number.POSITIVE_INFINITY;
  for (const cols of rowPlan) {
    if (cols <= 0) continue;
    s = Math.min(s, (gridW - G * (cols + 1)) / cols);
  }
  const rowBand = (gridH - G * (numRows + 1)) / numRows - labelReservePerRow;
  s = Math.min(s, rowBand);
  if (!Number.isFinite(s) || s <= 0) return 0;
  return Math.floor(s);
}

/** Altura del stack vista previa: crece cuando la rejilla tiene 3 filas de iconos. */
function getPreviewModalStackSize(screenH: number, iconSlotCount: number): { height: number; maxHeight: number } {
  const rowCount = Math.max(1, getWireframeIconRowPlan(iconSlotCount).length);
  const threeRows = rowCount >= 3;
  const fraction = threeRows ? 0.84 : 0.74;
  const capPx = threeRows ? 800 : 680;
  return {
    height: Math.min(screenH * fraction, capPx),
    maxHeight: screenH * 0.92,
  };
}

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
};

/**
 * Smart Card: la lista pública de datos es solo `itemIds` (subset de la Bóveda).
 * Ítems indelebles en Bóveda (p. ej. Ghost-Link bootstrap / vaultProtected) no se añaden solos a la tarjeta:
 * el usuario los incluye o excluye en el editor como cualquier otro dato.
 */
type SmartCard = {
  id: string;
  name: string;
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
  createdAt: string;
  updatedAt: string;
};

type CardSubscriber = CardSubscriberRow;

type EditSlot = {
  id: string;
  index: number;
  item: VaultItem | null;
};

export default function CardsFactoryScreen() {
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
  const [subscribers, setSubscribers] = useState<CardSubscriber[]>([]);
  const [qrVisible, setQrVisible] = useState(false);
  const [qrBusinessContext, setQrBusinessContext] = useState<null | {
    cardId: string;
    businessName: string;
    ownerName: string;
    ownerUid: string;
    logoUrl: string | null;
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
  const [qrExpiresAt, setQrExpiresAt] = useState<number>(0);
  const [qrWindowMs, setQrWindowMs] = useState(60000);
  const [remainingSec, setRemainingSec] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [issuingQr, setIssuingQr] = useState(false);
  /** UID de la sesión en Mis Tarjetas (QR permanente en filas de negocio). */
  const [sessionOwnerUid, setSessionOwnerUid] = useState<string | null>(null);
  const [cardSearchQuery, setCardSearchQuery] = useState('');
  const [rotateHintVisible, setRotateHintVisible] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  // Vertical card responsive layout state
  const [vertAvatarBoxH, setVertAvatarBoxH] = useState(0);
  const [vertIconGridLayout, setVertIconGridLayout] = useState({ w: 0, h: 0 });
  const [vertInfoBoxLayout, setVertInfoBoxLayout] = useState({ w: 0, h: 0 });
  const [vertHeaderH, setVertHeaderH] = useState(0);
  // Horizontal card responsive layout state
  const [horizHeaderH, setHorizHeaderH] = useState(0);
  const [horizAvatarBoxLayout, setHorizAvatarBoxLayout] = useState({ w: 0, h: 0 });
  const [horizInfoBoxLayout, setHorizInfoBoxLayout] = useState({ w: 0, h: 0 });
  const [horizIconGridLayout, setHorizIconGridLayout] = useState({ w: 0, h: 0 });
  const [ownerNickname, setOwnerNickname] = useState('');
  const [ownerDisplayName, setOwnerDisplayName] = useState('');
  const [ownerPhotoUrl, setOwnerPhotoUrl] = useState<string | null>(null);
  const parallaxX = useRef(new Animated.Value(0)).current;
  const parallaxY = useRef(new Animated.Value(0)).current;
  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerItem, setViewerItem] = useState<VaultItem | null>(null);
  const [isDownloadingViewerFile, setIsDownloadingViewerFile] = useState(false);
  const swipeableMethodsByCardIdRef = useRef<Map<string, SwipeableMethods>>(new Map());

  const { unlockedIds, refreshThemes } = useActiveTheme();

  const isChestThemeUnlocked = (t: ChestCardTheme) => !t.locked || unlockedIds.has(t.id);

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
          loadVaultItems();
          loadSmartCards();
          void loadBusinessCardsFeed();
        });
      };

      void verifyAccess();
    }, [refreshThemes])
  );

  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      const authFallback = user.displayName
        ? user.displayName
        : user.email
        ? String(user.email).split('@')[0]
        : `user_${String(user.uid).slice(0, 6)}`;
      const loadProfile = async () => {
        try {
          const userSnap = await getDoc(doc(db, 'users', user.uid));
          const userData = userSnap.data() as any;
          if (userData) {
            setOwnerDisplayName(userData.fullName || userData.firstName || authFallback);
            setOwnerNickname(userData.nickname || userData.nicknameLower || authFallback);
            setOwnerPhotoUrl(toRenderableImageUri(userData.photoUrl) || toRenderableImageUri(user.photoURL) || null);
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
      };
      void loadProfile();
    }

    loadVaultItems();
    loadSmartCards();
  }, []);

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
        loadVaultItems();
        loadSmartCards();
      }
    });
    return () => {
      sub.remove();
    };
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
      if (remainingMs <= 0 && qrTimerRef.current) {
        clearInterval(qrTimerRef.current);
        qrTimerRef.current = null;
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
      const raw = await readVaultJsonWithLegacyMigration(ownerUid);
      let parsed = raw ? (JSON.parse(raw) as any[]) : [];
      const migrateIcons = (items: any[]) =>
        items.map((item) => {
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
      let itemsMigrated = migrateIcons(parsed);
      if (JSON.stringify(itemsMigrated) !== JSON.stringify(parsed)) {
        await AsyncStorage.setItem(vaultStorageKey(ownerUid), JSON.stringify(itemsMigrated));
      }
      if (itemsMigrated.length === 0) {
        try {
          const cloudSnapshot = await getDocs(collection(db, 'users', ownerUid, 'links'));
          const cloudItems = cloudSnapshot.docs.map((itemDoc) => ({
            id: itemDoc.id,
            ...itemDoc.data(),
          })) as any[];
          itemsMigrated = migrateIcons(cloudItems);
          await AsyncStorage.setItem(vaultStorageKey(ownerUid), JSON.stringify(itemsMigrated));
        } catch {
          /* sin red o sin permisos — deja vacío */
        }
      }
      itemsMigrated = await mergeBuiltinGhostLinkIntoVault(ownerUid, itemsMigrated);
      setVaultItems(itemsMigrated as VaultItem[]);
      try {
        const vaultMap = await getUserIconVaultMap(ownerUid);
        setIconVaultById(Object.fromEntries(vaultMap));
      } catch {
        setIconVaultById({});
      }
    } catch {
      setVaultItems([]);
      setIconVaultById({});
    }
  };

  const loadSmartCards = async () => {
    const ownerUid = await getActiveUserId();
    if (!ownerUid) {
      setSmartCards([]);
      return;
    }

    // 1. Lectura optimista: mostrar cache local inmediatamente (cero latencia)
    let cachedJson = '';
    try {
      const raw = await readSmartCardsJsonWithLegacyMigration(ownerUid);
      cachedJson = raw || '';
      const cached = raw ? (JSON.parse(raw) as SmartCard[]) : [];
      if (cached.length > 0) {
        setSmartCards(cached.map((card) => ({ ...card, isFavorite: Boolean(card.isFavorite) })));
      }
    } catch { /* ignora — la nube actualiza a continuación */ }

    // 2. Refresco silencioso — actualiza estado solo si los datos cambiaron
    try {
      const remote = await listSmartCardsFromDb({ ownerUid });
      const mapped = remote.cards.map((card) => ({
        id: card.cardId,
        name: card.name,
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

      const cloudJson = JSON.stringify(mapped);
      if (cloudJson !== cachedJson) {
        setSmartCards(mapped);
        await AsyncStorage.setItem(smartCardsStorageKey(ownerUid), cloudJson);
      }
    } catch {
      // Cache ya pintado — no hacer nada
    }
  };

  const loadBusinessCardsFeed = async () => {
    const ownerUid = await getActiveUserId();
    if (!ownerUid) {
      setBusinessCardsFeed([]);
      return;
    }
    try {
      const rows = await listBusinessCardsByOwner(ownerUid);
      setBusinessCardsFeed(rows);
    } catch {
      setBusinessCardsFeed([]);
    }
  };

  const persistCards = async (nextCards: SmartCard[], changedCardIds?: string[]) => {
    console.log('[Card] persistCards: INICIO');
    setSmartCards(nextCards);

    console.log('[Card] persistCards: Antes de getActiveUserId');
    const ownerUid = await getActiveUserId();
    console.log('[Card] persistCards: Después de getActiveUserId', ownerUid);

    console.log('[Card] persistCards: Antes de AsyncStorage.setItem');
    if (ownerUid) {
      await AsyncStorage.setItem(smartCardsStorageKey(ownerUid), JSON.stringify(nextCards));
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
        const cardPayload: SmartCardPayload = {
          cardId: card.id,
          name: card.name,
          layout: card.layout,
          themeId: card.themeId,
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
          ownerNickname: ownerNickname || undefined,
          ownerPhotoUrl,
          searchFacets: buildSearchFacetsForSharedCard(vaultItems, card.itemIds),
        };
        await upsertSmartCardInDb({
          ownerUid,
          card: cardPayload,
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
    setCardName(card.name);
    setLayoutMode(card.layout);
    setThemeId(card.themeId || 'deep_teal');
    setEnableParallax(Boolean(card.enableParallax));
    setResolvedFontFamily(card.fontFamily || null);
    setSelectedFont(
      card.fontId
        ? {
            id: card.fontId,
            name: card.fontName || card.name,
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
            name: card.name,
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
      return String(card.name || '').trim().toLowerCase() === normalizedCardName;
    });

    if (duplicatedName) {
      Alert.alert(
        tr('Nombre duplicado', 'Duplicate name'),
        tr('Ya tienes una tarjeta con ese nombre. Usa un nombre distinto.', 'You already have a card with that name. Use a different name.')
      );
      return;
    }

    const normalizedItemIds = selectedItemIds.slice(0, MAX_CARD_SLOTS);

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
                name: cardName.trim(),
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
        name: cardName.trim(),
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

  const handleCardLongPress = (card: SmartCard) => {
    Alert.alert('Gestionar Smart Card', 'Selecciona una accion para esta tarjeta.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Editar',
        onPress: () => openEditFactory(card),
      },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => deleteCard(card),
      },
    ]);
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
    // Only carry over IDs that still exist in the vault — discard stale references
    const validIds = selectedItemIds.filter((id) => vaultItems.some((vi) => vi.id === id));
    setTempSelectedIds(validIds);
    setDataSelectorLimitReached(false);
    setDataSelectorVisible(true);
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
  };

  const cancelDataSelector = () => {
    setDataSelectorVisible(false);
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

  const openSubscribersModal = async (card: SmartCard) => {
    try {
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

  const issueQrForCard = async (card: SmartCard) => {
    try {
      // Hard Lock: Require biometric before generating QR (Nivel 6.6)
      const authenticated = await hardLockCheck('generar QR y compartir tu tarjeta');
      if (!authenticated) {
        return; // User cancelled or auth failed
      }

      setIssuingQr(true);
      setQrBusinessContext(null);
      setSelectedCard(card);

      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        throw new Error('No se pudo obtener tu sesión para emitir el QR.');
      }

      const issued = await issueDynamicQrToken({ ownerUid, cardId: card.id });
      const parsedExpiresAt = Date.parse(String(issued.expiresAt || ''));
      const nextExpiresAt = Number.isFinite(parsedExpiresAt)
        ? parsedExpiresAt
        : Date.now() + Math.max(1, Number(issued.ttlSec || 60)) * 1000;
      const visibleWindowMs = Math.max(1000, nextExpiresAt - Date.now());

      setQrToken(issued.token);
      setQrExpiresAt(nextExpiresAt);
      setQrWindowMs(visibleWindowMs);
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
        : rawMessage || tr('No se pudo emitir el QR dinámico.', 'Could not issue dynamic QR.');
      Alert.alert(tr('Error de QR', 'QR error'), diagnosticMessage);
    } finally {
      setIssuingQr(false);
    }
  };

  const confirmAndIssueQrForCard = (card: SmartCard) => {
    if (issuingQr) {
      return;
    }
    Alert.alert(
      tr('Crear QR', 'Create QR'),
      tr(
        `¿Deseas generar el QR de la tarjeta "${card.name}"?`,
        `Do you want to generate the QR for card "${card.name}"?`
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

      setQrBusinessContext({
        cardId: row.id,
        businessName: row.businessName,
        ownerName: row.ownerName,
        ownerUid,
        logoUrl: toRenderableImageUri(row.businessLogo),
      });
      setSelectedCard(null);
      setQrToken('');
      setQrExpiresAt(0);
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
        `¿Deseas mostrar el QR permanente de "${row.businessName}"?`,
        `Do you want to show the permanent QR for "${row.businessName}"?`,
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
      return p.filter((c) => c.id !== row.id);
    });
    try {
      const r = await removeBusinessCardFromFirestore(ownerUid, row.id);
      if (!r.success) {
        throw new Error(r.message);
      }
    } catch {
      setBusinessCardsFeed(previous);
      Alert.alert(tr('Error', 'Error'), tr('No se pudo eliminar la tarjeta de negocio.', 'Could not delete the business card.'));
    }
  };

  const toggleFavoriteBusinessCard = async (row: BusinessCardListRow) => {
    const ownerUid = await getActiveUserId();
    if (!ownerUid) {
      return;
    }
    const next = !row.isFavorite;
    setBusinessCardsFeed((p) => p.map((c) => (c.id === row.id ? { ...c, isFavorite: next } : c)));
    try {
      const r = await setBusinessCardFavorite(ownerUid, row.id, next);
      if (!r.success) {
        throw new Error(r.message);
      }
    } catch {
      setBusinessCardsFeed((p) => p.map((c) => (c.id === row.id ? { ...c, isFavorite: row.isFavorite } : c)));
    }
  };

  const openPreviewBusinessCard = async (row: BusinessCardListRow) => {
    const uid = await getActiveUserId();
    if (!uid) {
      return;
    }
    setPreviewBusinessOwnerUid(uid);
    setPreviewBusiness(row);
    setPreviewLayout(width > height ? 'horizontal' : 'vertical');
    setPreviewBusinessVisible(true);
  };

  const handleBusinessCardLongPress = (row: BusinessCardListRow) => {
    Alert.alert(tr('Tarjeta de negocio', 'Business card'), tr('Elige una acción.', 'Choose an action.'), [
      { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
      {
        text: tr('Editar', 'Edit'),
        onPress: () => router.push({ pathname: '/(tabs)/createBusinessCard', params: { cardId: row.id } } as any),
      },
      {
        text: tr('Eliminar', 'Delete'),
        style: 'destructive',
        onPress: () => void deleteBusinessCardEntry(row),
      },
    ]);
  };

  const businessSwipeKey = (id: string) => `business:${id}`;

  const selectedCardItems = useMemo(() => {
    if (!selectedCard) {
      return [];
    }
    return vaultItems.filter((item) => selectedCard.itemIds.includes(item.id));
  }, [selectedCard, vaultItems]);

  const previewCardItems = useMemo(() => {
    if (!previewCard) {
      return [];
    }
    return vaultItems.filter((item) => previewCard.itemIds.includes(item.id));
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

  const businessPreviewSlots = useMemo<EditSlot[]>(() => {
    if (!previewBusiness?.vaultLinkIds?.length) {
      return [];
    }
    return previewBusiness.vaultLinkIds.map((linkId, index) => {
      const item = vaultItems.find((v) => v.id === linkId) || null;
      return { id: `biz-preview-${linkId}-${index}`, index, item };
    });
  }, [previewBusiness, vaultItems]);

  const qrPayload = useMemo(() => {
    if (qrBusinessContext) {
      return generatePermanentBusinessLink(qrBusinessContext.cardId, qrBusinessContext.ownerUid);
    }
    if (!selectedCard || !qrToken) {
      return '';
    }

    return JSON.stringify({
      kind: 'cardsocial-qr-v1',
      token: qrToken,
      cardId: selectedCard.id,
      exp: qrExpiresAt,
    });
  }, [selectedCard, qrToken, qrExpiresAt, qrBusinessContext]);

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
    return [...smartCards].sort((a, b) => {
      const favDiff = Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite));
      if (favDiff !== 0) {
        return favDiff;
      }
      return String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' });
    });
  }, [smartCards]);

  type FeedListItem =
    | ({ kind: 'business' } & BusinessCardListRow)
    | { kind: 'smart'; card: SmartCard };

  const sortedBusinessCards = useMemo(() => {
    return [...businessCardsFeed].sort((a, b) => {
      const favDiff = Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite));
      if (favDiff !== 0) {
        return favDiff;
      }
      return b.createdAtMs - a.createdAtMs;
    });
  }, [businessCardsFeed]);

  const filteredFeed = useMemo((): FeedListItem[] => {
    const bizItems: FeedListItem[] = sortedBusinessCards.map((b) => ({
      kind: 'business' as const,
      ...b,
    }));
    const q = cardSearchQuery.trim();
    if (!q) {
      return [...bizItems, ...sortedCards.map((card) => ({ kind: 'smart' as const, card }))];
    }
    const qExpanded = buildExpandedMarketQuery(q) || q;
    const qLower = q.toLowerCase();
    const bizFiltered = bizItems.filter((b) => {
      if (b.kind !== 'business') return false;
      return (
        b.businessName.toLowerCase().includes(qLower) ||
        b.id.toLowerCase().includes(qLower) ||
        b.ownerName.toLowerCase().includes(qLower)
      );
    });
    const smartFiltered = orderByDeepSearchWithExpandedQuery(sortedCards, qExpanded, (card) =>
      collectStringsSmartCard({ name: card.name, itemIds: card.itemIds }, vaultItems, false),
    );
    return [...bizFiltered, ...smartFiltered.map((card) => ({ kind: 'smart' as const, card }))];
  }, [sortedBusinessCards, sortedCards, cardSearchQuery, vaultItems]);

  const openPreviewCard = (card: SmartCard) => {
    setPreviewCard(card);
    // Detecta orientación actual
    if (width > height) {
      setPreviewLayout('horizontal');
    } else {
      setPreviewLayout('vertical');
    }
    setPreviewVisible(true);
  };

  // Efecto para actualizar orientación en tiempo real mientras el modal de vista previa está abierto
  useEffect(() => {
    if (!previewVisible && !previewBusinessVisible) return;
    setPreviewLayout(width > height ? 'horizontal' : 'vertical');
  }, [previewVisible, previewBusinessVisible, width, height]);

  const openDataPopover = async (item: VaultItem) => {
    const type = String(item.type || '').toLowerCase();
    const value = String(item.value || '').trim();
    if (isGhostLinkVaultType(item.type)) {
      const activeCard = previewVisible && previewCard ? previewCard : selectedCard;
      const issuerUid = await getActiveUserId();
      await ActionController.ActionGhostLinkVaultItem({
        targetUid: issuerUid,
        sourceCardName: activeCard?.name ?? cardName ?? 'Tarjeta Social',
        sourceCardId: activeCard?.id ?? null,
        userName: ownerNickname || 'este contacto',
      });
      return;
    }
    if (type.includes('email')) {
      await ActionController.ActionEmail({ value });
    } else if (isClassicPhoneVaultType(item.type)) {
      await ActionController.ActionTelefono({ value });
    } else if (type.includes('enlace') || type.includes('link') || type.includes('web')) {
      await ActionController.ActionLink({ value, title: item.title });
    } else if (
      type.includes('documento') ||
      type.includes('pdf') ||
      isPdfValue(value) ||
      isImageValue(value)
    ) {
      await openDocumentViewer(item);
    } else if (type.includes('texto')) {
      await ActionController.ActionText({ value, title: item.title });
    } else {
      Alert.alert('Dato', value);
    }
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
      if (isGhostLinkVaultType(item.type)) {
        const activeCard = previewVisible && previewCard ? previewCard : selectedCard;
        const issuerUid = await getActiveUserId();
        await ActionController.ActionGhostLinkVaultItem({
          targetUid: issuerUid,
          sourceCardName: activeCard?.name ?? cardName ?? 'Tarjeta Social',
          sourceCardId: activeCard?.id ?? null,
          userName: ownerNickname || 'este contacto',
        });
        return;
      }
      if (isClassicPhoneVaultType(item.type)) {
        await ActionController.ActionTelefono({ value: String(item.value || '') });
        return;
      }
      if (item.type === 'Email') {
        await ActionController.ActionEmail({ value: String(item.value || '') });
        return;
      }
      if (item.type === 'Enlaces') {
        await ActionController.ActionLink({ value: ensureWebUrl(item.value), title: item.title });
        return;
      }
      if (item.type === 'Documento') {
        await openDocumentViewer(item);
        return;
      }
      Alert.alert(tr('Documento protegido', 'Protected document'), tr('Este dato solo se puede visualizar por el visor seguro de Card-Social.', 'This data can only be viewed through Card-Social secure viewer.'));
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
        await openDocumentViewer(item);
        return;
      }
      Alert.alert(tr('No disponible', 'Not available'), tr('Este dato no tiene ruta de navegador directa.', 'This data has no direct browser route.'));
    } catch {
      Alert.alert(tr('Error', 'Error'), tr('No se pudo abrir en navegador.', 'Could not open in browser.'));
    }
  };

  const renderVaultMiniIcon = (item: VaultItem | null | undefined, size = 20) => {
    try {
      if (!item) {
        return <MaterialCommunityIcons name="link-variant" size={size} color="#B0B0B0" />;
      }
      if (item.icon?.startsWith('http')) {
        return <ExpoImage source={{ uri: item.icon }} style={{ width: size, height: size, borderRadius: size / 2 }} cachePolicy="disk" />;
      }
      const fromVault =
        item.iconVaultId && iconVaultById[item.iconVaultId]?.materialIconName
          ? sanitizeMaterialCommunityIconName(iconVaultById[item.iconVaultId].materialIconName)
          : null;
      const fromStoredIcon =
        item.icon && String(item.icon).trim() !== '' && !String(item.icon).startsWith('http')
          ? sanitizeMaterialCommunityIconName(item.icon)
          : null;
      const safeIconName =
        fromVault ||
        fromStoredIcon ||
        (item.iconName && item.iconName.trim() !== ''
          ? sanitizeMaterialCommunityIconName(item.iconName)
          : 'help-circle');
      return <MaterialCommunityIcons name={safeIconName as any} size={size} color="#0D4D8A" />;
    } catch {
      return <MaterialCommunityIcons name={"help-circle" as any} size={size} color="#0D4D8A" />;
    }
  };

  const openDocumentViewer = async (item: VaultItem) => {
    const biometricOk = await hardLockCheck('abrir visor seguro de documentos');
    if (!biometricOk) {
      return;
    }

    setDataPopoverVisible(false);
    setFocusedCertificate(null);
    setViewerItem(item);
    setViewerVisible(true);
  };

  const handleDownloadFromViewer = async () => {
    if (!viewerItem?.value) {
      return;
    }

    try {
      setIsDownloadingViewerFile(true);
      const fileNameSafe = `${viewerItem.title || 'archivo'}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, '_');
      const extension = isPdfValue(viewerItem.value) ? 'pdf' : 'jpg';
      const targetUri = `${FileSystem.cacheDirectory}${fileNameSafe}.${extension}`;

      await FileSystem.downloadAsync(viewerItem.value, targetUri);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(targetUri, {
          mimeType: isPdfValue(viewerItem.value) ? 'application/pdf' : 'image/jpeg',
          dialogTitle: tr('Guardar archivo de Card-Social', 'Save Card-Social file'),
        });
      }

      Toast.show({
        type: 'success',
        text1: tr('📥 Descarga lista', '📥 Download ready'),
        text2: tr('Archivo preparado en tu dispositivo', 'File ready on your device'),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });
    } catch (error) {
      console.error('Cards viewer download failed:', error);
      Toast.show({
        type: 'error',
        text1: tr('❌ No se pudo descargar', '❌ Download failed'),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });
    } finally {
      setIsDownloadingViewerFile(false);
    }
  };

  const handleViewerLongPress = () => {
    if (!viewerItem) return;
    Alert.alert(
      tr('Guardar archivo', 'Save file'),
      tr(
        'Mantén la privacidad: el archivo se exportará desde el visor seguro.',
        'Keep privacy: the file will be exported from the secure viewer.'
      ),
      [
        { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        {
          text: tr('Guardar', 'Save'),
          onPress: () => {
            void handleDownloadFromViewer();
          },
        },
      ]
    );
  };

  const renderRatingStars = (rating: number) => {
    const rounded = Math.max(0, Math.min(5, Math.round(rating)));
    return (
      <View style={styles.ratingRow}>
        {Array.from({ length: 5 }).map((_, index) => (
          <MaterialCommunityIcons
            key={`star-${index}`}
            name={index < rounded ? 'star' : 'star-outline'}
            size={13}
            color="#C5A065"
          />
        ))}
      </View>
    );
  };

  /** Estrellas con media (½) para la fila de Mis Tarjetas. `starSize` por defecto 14. */
  const renderDetailedRatingStars = (rating: number, starSize = 14) => {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    const gap = Math.max(1, Math.round(starSize * 0.12));
    return (
      <View style={[styles.ratingRow, { gap }]}>
        {Array.from({ length: 5 }).map((_, index) => {
          const threshold = index + 1;
          let name: 'star' | 'star-half-full' | 'star-outline' = 'star-outline';
          if (r >= threshold) name = 'star';
          else if (r >= threshold - 0.5) name = 'star-half-full';
          return (
            <MaterialCommunityIcons
              key={`dstar-${index}`}
              name={name}
              size={starSize}
              color="#C5A065"
            />
          );
        })}
      </View>
    );
  };

  const renderIdentityBadge = (compact = false) => {
    const holderCount = selectedCard?.holdersCount ?? previewCard?.holdersCount ?? 100;
    const reviewCount = selectedCard?.totalRatings ?? previewCard?.totalRatings ?? 0;
    const ratingAvg = selectedCard?.ratingAvg ?? previewCard?.ratingAvg ?? 5;
    const starsVal = reviewCount > 0 ? Math.max(0, Math.min(5, Number(ratingAvg))) : 0;
    const cardTitle = (
      selectedCard?.name
      || previewCard?.name
      || cardName
      || 'Nueva Tarjeta'
    ).trim();
    const nickname = (ownerNickname || 'user').toLowerCase();
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
        <AutoScaleText style={compact ? styles.wireNameSm : styles.wireName}>{cardTitle}</AutoScaleText>
        <AutoScaleText style={compact ? styles.wireNickSm : styles.wireNick}>@{nickname}</AutoScaleText>
        <View style={styles.wireStatsRowInline}>
          <View style={styles.wireStatsRatingStack}>
            {renderDetailedRatingStars(starsVal, compact ? 16 : 20)}
            <Text
              style={[styles.wireStatsReviewCaption, { color: '#497499', fontSize: compact ? 9 : 10, textAlign: 'center' }]}
              numberOfLines={1}
            >
              {starsVal.toFixed(1)} · {reviewCount} {tr('reseñas', 'reviews')}
            </Text>
          </View>
          <View style={styles.wireUsersPill}>
            <MaterialCommunityIcons name="account-outline" size={capSize} color="#0A2540" />
            <Text style={styles.wireUsersPillText}>{holderCount}</Text>
          </View>
        </View>
      </>
    );
  };

  const renderSlotContent = (slot: EditSlot, ui: { size: number }, editable: boolean) => {
    const hasItem = Boolean(slot.item);
    // Burbuja = celda; el logo llena casi todo el cuadro blanco.
    const bubbleSize = Math.max(26, Math.floor(ui.size));
    const iconSize = Math.round(bubbleSize * 0.9);
    const compactTitle = String(slot.item?.title || 'Agregar')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(' ');
    const labelFontSize = Math.max(9, Math.round(bubbleSize * 0.15));
    const labelLineHeight = Math.ceil(labelFontSize * 1.22);
    const minTileH = bubbleSize + 8 + labelLineHeight * 2 + 8;

    return (
      <View style={[styles.slotTile, { minHeight: minTileH }]}>
        <TouchableOpacity
          style={[styles.slotBubble, { width: bubbleSize, height: bubbleSize, borderRadius: Math.min(14, bubbleSize / 4) }]}
          onPress={() => {
            if (editable) {
              openSlotPicker(slot.index);
              return;
            }
            if (slot.item) {
              void openDataPopover(slot.item);
            }
          }}
          onLongPress={() => {
            if (!editable) {
              handlePreviewIconLongPress(slot);
            }
          }}
          delayLongPress={650}
        >
          {slot.item ? (
            renderVaultMiniIcon(slot.item, iconSize)
          ) : (
            <MaterialCommunityIcons name="plus" size={iconSize} color="#4D7A97" />
          )}
        </TouchableOpacity>
        <Text
          style={[
            styles.slotLabel,
            {
              width: '100%',
              maxWidth: '100%',
              fontSize: labelFontSize,
              lineHeight: labelLineHeight,
            },
          ]}
          numberOfLines={2}
        >
          {compactTitle}
        </Text>

        {editable ? (
          <>
            {hasItem ? (
              <TouchableOpacity style={styles.slotMinusBtn} onPress={() => removeSlotItem(slot.index)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel={tr('Quitar dato', 'Remove item')}>
                <MaterialCommunityIcons name="minus" size={11} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.slotPlusBtn} onPress={() => openSlotPicker(slot.index)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel={tr('Agregar dato', 'Add item')}>
              <MaterialCommunityIcons name="plus" size={11} color="#FFFFFF" />
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    );
  };

  const renderWireframeCard = (params: {
    layout: 'vertical' | 'horizontal';
    slots: EditSlot[];
    editable: boolean;
    theme: ChestCardTheme;
    wallpaperUrl?: string;
    /** Vista previa de tarjeta de negocio (misma rejilla que Smart Card). */
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
    const dispName = wId?.cardTitle ?? (selectedCard?.name || previewCard?.name || cardName || 'Nueva Tarjeta').trim();
    const dispSub = wId ? wId.subtitle : `@${(ownerNickname || 'user').toLowerCase()}`;
    const dispAvatar = wId ? wId.avatarUri : ownerPhotoUrl;
    const dispHolders = wId ? wId.holdersCount : (selectedCard?.holdersCount ?? previewCard?.holdersCount ?? 0);
    const dispReviewCount = wId?.totalRatings ?? selectedCard?.totalRatings ?? previewCard?.totalRatings ?? 0;
    const dispRatingRaw = wId ? wId.ratingAvg : (selectedCard?.ratingAvg ?? previewCard?.ratingAvg ?? 5);
    const dispStarsValue = dispReviewCount > 0 ? Math.max(0, Math.min(5, Number(dispRatingRaw))) : 0;
    const noAvatarIconName = (wId?.noAvatarIcon ?? 'account') as 'account' | 'storefront-outline';
    const dataSlots = slots.filter((slot) => slot.item !== null);
    const feed = editable ? slots : dataSlots;
    const bg3 = theme.background; // 3-stop gradient
    const bd = theme.border;
    const titleStyle = theme.title;
    const subStyle = theme.subtitle;
    const iconMeta = theme.icon;
    // Responsive sizes based on screen width
    const avatarSize = Math.round(width * 0.24);   // ~24% of screen
    const avatarRadius = Math.round(avatarSize * 0.18);
    const iconFallbackSize = Math.round(avatarSize * 0.38);

    if (layout === 'horizontal') {
      // Avatar: cuadrado toca top/bottom del su box (padding 8)
      const H_PAD = 8;
      const horizAvatarSide = horizAvatarBoxLayout.h > 0 ? horizAvatarBoxLayout.h - H_PAD * 2 : 0;
      const horizAvatarRadius = horizAvatarSide > 0 ? Math.round(horizAvatarSide * 0.15) : 0;

      // Font sizes proporcional al alto del info box
      const hNameFontSize  = horizInfoBoxLayout.h > 0 ? Math.round(horizInfoBoxLayout.h * 0.28) : 18;
      const hNickFontSize  = horizInfoBoxLayout.h > 0 ? Math.round(horizInfoBoxLayout.h * 0.18) : 12;
      const hStatsFontSize = horizInfoBoxLayout.h > 0 ? Math.round(horizInfoBoxLayout.h * 0.12) : 10;
      const hWireStarSize = Math.max(18, Math.min(26, Math.round(hStatsFontSize * 2.05)));
      const hReviewCaptionSize = Math.max(8, Math.round(hStatsFontSize * 0.68));

      // Branding proporcional al alto del header
      const hBrandFontSize = horizHeaderH > 0 ? Math.round(horizHeaderH * 0.45) : 13;
      const hBrandLogoSize = horizHeaderH > 0 ? Math.round(horizHeaderH * 0.55) : 18;

      const H_GAP = 5;
      const hFeed = feed.slice(0, WIREFRAME_MAX_ICONS);
      const hRowPlan = getWireframeIconRowPlan(hFeed.length);
      let hCursor = 0;
      const hIconRows = hRowPlan.map((n) => {
        const row = hFeed.slice(hCursor, hCursor + n);
        hCursor += n;
        return row;
      });
      const hIconSize =
        horizIconGridLayout.w > 0 && horizIconGridLayout.h > 0
          ? computeWireframeIconCellSize(horizIconGridLayout.w, horizIconGridLayout.h, hRowPlan, H_GAP)
          : 0;

      return (
        <LinearGradient colors={bg3} style={[styles.wireHorizCard, { borderColor: bd.color, borderWidth: bd.width }]}>
          {wallpaperUrl ? (
            <Animated.Image
              source={{ uri: wallpaperUrl }}
              style={[
                styles.wallpaperFill,
                enableParallax
                  ? { transform: [{ translateX: parallaxX }, { translateY: parallaxY }, { scale: 1.06 }] }
                  : null,
              ]}
              resizeMode={getWallpaperResizeMode()}
            />
          ) : null}

          {/* ── HEADER ─────────────────────────────────────────── */}
          <View style={styles.horizHeader} onLayout={e => setHorizHeaderH(e.nativeEvent.layout.height)}>
            <Image source={require('../../assets/images/CS Icon Logo.png')} style={{ width: hBrandLogoSize, height: hBrandLogoSize }} />
            <Text style={[styles.horizBrandingText, { color: subStyle.color, fontSize: hBrandFontSize }]}>Card-Social</Text>
          </View>

          {/* ── FILA MEDIA flex:3 ── */}
          <View style={styles.horizMiddleRow}>
            {/* Avatar */}
            <View
              style={styles.horizAvatarBox}
              onLayout={e => setHorizAvatarBoxLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
            >
              {horizAvatarSide > 0 ? (
                dispAvatar ? (
                  <ExpoImage
                    source={{ uri: dispAvatar }}
                    style={{ width: horizAvatarSide, height: horizAvatarSide, borderRadius: horizAvatarRadius, borderWidth: bd.width, borderColor: bd.color }}
                    cachePolicy="disk"
                  />
                ) : (
                  <View style={{ width: horizAvatarSide, height: horizAvatarSide, borderRadius: horizAvatarRadius, borderWidth: bd.width, borderColor: bd.color, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name={noAvatarIconName} size={Math.round(horizAvatarSide * 0.5)} color={titleStyle.color} />
                  </View>
                )
              ) : null}
            </View>

            {/* Info */}
            <View
              style={styles.horizInfoBox}
              onLayout={e => setHorizInfoBoxLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
            >
              <Text style={[styles.horizName, { color: titleStyle.color, fontSize: hNameFontSize }]} numberOfLines={1} adjustsFontSizeToFit>
                {dispName}
              </Text>
              <Text style={[styles.horizNick, { color: subStyle.color, fontSize: hNickFontSize }]} numberOfLines={1} adjustsFontSizeToFit>
                {dispSub}
              </Text>
              <View style={styles.wireStatsRowInline}>
                <View style={styles.wireStatsRatingStack}>
                  {renderDetailedRatingStars(dispStarsValue, hWireStarSize)}
                  <Text
                    style={[styles.wireStatsReviewCaption, { color: subStyle.color, fontSize: hReviewCaptionSize, textAlign: 'center' }]}
                    numberOfLines={1}
                  >
                    {dispStarsValue.toFixed(1)} · {dispReviewCount} {tr('reseñas', 'reviews')}
                  </Text>
                </View>
                <View style={[styles.wireUsersPill, { borderColor: bd.color }]}>
                  <MaterialCommunityIcons name="account-outline" size={hStatsFontSize} color={titleStyle.color} />
                  <Text style={[styles.wireUsersPillText, { color: titleStyle.color, fontSize: hStatsFontSize }]}>
                    {dispHolders}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* ── ICONOS flex:4 ───────────────────────────────────── */}
          <View
            style={styles.horizIconsBox}
            onLayout={e => setHorizIconGridLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          >
            {hIconSize > 0 ? (
              <View style={styles.wireIconGridRoot}>
                <View style={styles.wireIconRowsStack}>
                  {hIconRows.map((rowSlots, ri) => (
                    <View key={`h-ir-${ri}`} style={styles.wireIconRow}>
                      {rowSlots.map((slot) => (
                        <View key={slot.id} style={styles.wireIconCell}>
                          {renderSlotContent(slot, { size: hIconSize }, editable)}
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        </LinearGradient>
      );
    }

    // ── VERTICAL MODEL ─────────────────────────────────────────────
    const AVATAR_PAD = 8;
    const vertAvatarSide = vertAvatarBoxH > 0 ? vertAvatarBoxH - AVATAR_PAD * 2 : 0;
    const vertAvatarRadius = vertAvatarSide > 0 ? Math.round(vertAvatarSide * 0.15) : 0;

    // Font sizes scale from info box height — no fixed numbers
    const nameFontSize  = vertInfoBoxLayout.h > 0 ? Math.round(vertInfoBoxLayout.h * 0.28) : 18;
    const nickFontSize  = vertInfoBoxLayout.h > 0 ? Math.round(vertInfoBoxLayout.h * 0.18) : 12;
    const statsFontSize = vertInfoBoxLayout.h > 0 ? Math.round(vertInfoBoxLayout.h * 0.12) : 10;
    const vWireStarSize = Math.max(20, Math.min(28, Math.round(statsFontSize * 2.15)));
    const vReviewCaptionSize = Math.max(8, Math.round(statsFontSize * 0.65));
    // Branding font scales from header height
    const brandFontSize = vertHeaderH > 0 ? Math.round(vertHeaderH * 0.45) : 13;
    const brandLogoSize = vertHeaderH > 0 ? Math.round(vertHeaderH * 0.55) : 18;

    const ICON_GAP = 4;
    const vFeed = feed.slice(0, WIREFRAME_MAX_ICONS);
    const vRowPlan = getWireframeIconRowPlan(vFeed.length);
    let vCursor = 0;
    const vIconRows = vRowPlan.map((n) => {
      const row = vFeed.slice(vCursor, vCursor + n);
      vCursor += n;
      return row;
    });
    const vertIconCellSize =
      vertIconGridLayout.w > 0 && vertIconGridLayout.h > 0
        ? computeWireframeIconCellSize(vertIconGridLayout.w, vertIconGridLayout.h, vRowPlan, ICON_GAP)
        : 0;

    return (
      <LinearGradient colors={bg3} style={[styles.wireVerticalCard, { borderColor: bd.color, borderWidth: bd.width }]}>
        {wallpaperUrl ? (
          <Animated.Image
            source={{ uri: wallpaperUrl }}
            style={[
              styles.wallpaperFill,
              enableParallax
                ? { transform: [{ translateX: parallaxX }, { translateY: parallaxY }, { scale: 1.06 }] }
                : null,
            ]}
            resizeMode={getWallpaperResizeMode()}
          />
        ) : null}

        {/* ── HEADER ─────────────────────────────────────────────── */}
        <View style={styles.vertHeader} onLayout={e => setVertHeaderH(e.nativeEvent.layout.height)}>
          <Image source={require('../../assets/images/CS Icon Logo.png')} style={{ width: brandLogoSize, height: brandLogoSize }} />
          <Text style={[styles.vertBrandingText, { color: subStyle.color, fontSize: brandFontSize }]}>Card-Social</Text>
        </View>

        {/* ── SECCIÓN TOP (avatar + info; más aire para nombre) ── */}
        <View style={styles.vertTop}>
          {/* Avatar */}
          <View
            style={styles.vertAvatarBox}
            onLayout={e => setVertAvatarBoxH(e.nativeEvent.layout.height)}
          >
            {vertAvatarSide > 0 ? (
              dispAvatar ? (
                <ExpoImage
                  source={{ uri: dispAvatar }}
                  style={{
                    width: vertAvatarSide,
                    height: vertAvatarSide,
                    borderRadius: Math.round(vertAvatarSide * 0.22),
                    borderWidth: bd.width + 1,
                    borderColor: bd.color,
                  }}
                  cachePolicy="disk"
                />
              ) : (
                <View style={{
                  width: vertAvatarSide,
                  height: vertAvatarSide,
                  borderRadius: Math.round(vertAvatarSide * 0.22),
                  borderWidth: bd.width + 1,
                  borderColor: bd.color,
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: bd.color,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.35,
                  shadowRadius: 6,
                  elevation: 5,
                }}>
                  <MaterialCommunityIcons name={noAvatarIconName} size={Math.round(vertAvatarSide * 0.52)} color={titleStyle.color} />
                </View>
              )
            ) : null}
          </View>

          {/* Info */}
          <View style={styles.vertInfoBox} onLayout={e => setVertInfoBoxLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            <Text style={[styles.vertName, { color: titleStyle.color, fontSize: nameFontSize }]} numberOfLines={1} adjustsFontSizeToFit>
              {dispName}
            </Text>
            <Text style={[styles.vertNick, { color: subStyle.color, fontSize: nickFontSize }]} numberOfLines={1} adjustsFontSizeToFit>
              {dispSub}
            </Text>
            <View style={styles.wireStatsRowInline}>
              <View style={styles.wireStatsRatingStack}>
                {renderDetailedRatingStars(dispStarsValue, vWireStarSize)}
                <Text
                  style={[styles.wireStatsReviewCaption, { color: subStyle.color, fontSize: vReviewCaptionSize, textAlign: 'center' }]}
                  numberOfLines={1}
                >
                  {dispStarsValue.toFixed(1)} · {dispReviewCount} {tr('reseñas', 'reviews')}
                </Text>
              </View>
              <View style={[styles.wireUsersPill, { borderColor: bd.color }]}>
                <MaterialCommunityIcons name="account-outline" size={statsFontSize} color={titleStyle.color} />
                <Text style={[styles.wireUsersPillText, { color: titleStyle.color, fontSize: statsFontSize }]}>
                  {dispHolders}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Iconos (caja más baja; margen separa del bloque superior) ── */}
        <View
          style={styles.vertIconsBox}
          onLayout={e => setVertIconGridLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        >
          {vertIconCellSize > 0 ? (
            <View style={styles.wireIconGridRoot}>
              <View style={styles.wireIconRowsStack}>
                {vIconRows.map((rowSlots, ri) => (
                  <View key={`v-ir-${ri}`} style={styles.wireIconRow}>
                    {rowSlots.map((slot) => (
                      <View key={slot.id} style={styles.wireIconCell}>
                        {renderSlotContent(slot, { size: vertIconCellSize }, editable)}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </LinearGradient>
    );
  };

  const renderBusinessCardRow = (row: BusinessCardListRow) => {
    const chestTheme = getCardRowTheme(row.themeId);
    const themeMeta = getThemeById(row.themeId || '') ?? CHEST_THEMES[0];
    const holders = row.holdersCount ?? 0;
    const reviewCount = row.totalRatings ?? 0;
    const rating = reviewCount > 0 ? Number(row.ratingAvg ?? 0) : 0;
    const logoUri = toRenderableImageUri(row.businessLogo);
    const sk = businessSwipeKey(row.id);
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
              style={styles.swipeActionBtn}
              onPress={() =>
                router.push({ pathname: '/(tabs)/createBusinessCard', params: { cardId: row.id } } as any)
              }
              accessibilityLabel={tr('Editar tarjeta', 'Edit card')}
            >
              <MaterialCommunityIcons name="pencil" size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>{tr('Editar', 'Edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.swipeActionBtn, { backgroundColor: '#0D4D8A' }]}
              onPress={() => confirmAndIssueQrForBusiness(row)}
              disabled={issuingQr}
              accessibilityLabel={tr('Generar QR', 'Generate QR')}
            >
              <MaterialCommunityIcons name="qrcode" size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>QR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.swipeActionBtn, { backgroundColor: '#C5A065' }]}
              onPress={() => void toggleFavoriteBusinessCard(row)}
              accessibilityLabel={tr('Favorito', 'Favorite')}
            >
              <MaterialCommunityIcons name={row.isFavorite ? 'star' : 'star-outline'} size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>{row.isFavorite ? '★' : '☆'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.swipeDeleteBtn}
              onPress={() => void deleteBusinessCardEntry(row)}
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
          <LinearGradient colors={chestTheme.gradient} style={StyleSheet.absoluteFillObject} />
          <TouchableOpacity
            style={styles.cardRowTouchable}
            onPress={() => void openPreviewBusinessCard(row)}
            onLongPress={() => handleBusinessCardLongPress(row)}
            delayLongPress={4000}
            activeOpacity={0.92}
          >
            <View style={[styles.cardRowInner, styles.businessCardListInner, styles.businessCardRowInner]}>
              <View style={styles.businessListMainRow}>
                {logoUri ? (
                  <ExpoImage
                    source={{ uri: logoUri }}
                    style={[styles.businessListLogo, { borderColor: chestTheme.borderColor }]}
                    cachePolicy="disk"
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
                    {row.businessName}
                  </AutoScaleText>
                  <Text style={[styles.businessListSubtitle, { color: chestTheme.metaColor }]} numberOfLines={1}>
                    {row.ownerName.trim()
                      ? row.ownerName
                      : themeMeta.name}
                  </Text>
                  <View style={styles.businessCardStatsRow}>
                    <View
                      style={[
                        styles.metricPill,
                        { borderColor: chestTheme.borderColor, backgroundColor: 'rgba(255,255,255,0.72)' },
                      ]}
                      accessibilityRole="text"
                      accessibilityLabel={tr('Personas con tu tarjeta', 'People with your card')}
                    >
                      <MaterialCommunityIcons name="account-group-outline" size={13} color={chestTheme.titleColor} />
                      <Text style={[styles.metricPillText, { color: chestTheme.titleColor }]}>{holders}</Text>
                    </View>
                    <View style={styles.statsRatingStack}>
                      <View style={styles.businessRatingStarsWrap}>{renderDetailedRatingStars(rating)}</View>
                      <Text style={[styles.ratingStackCaption, { color: chestTheme.metaColor }]} numberOfLines={2}>
                        {rating.toFixed(1)} · {reviewCount} {tr('reseñas', 'reviews')}
                      </Text>
                    </View>
                  </View>
                </View>
                {sessionOwnerUid ? (
                  <View style={styles.businessListQrWrap} pointerEvents="none">
                    <QRCode
                      value={generatePermanentBusinessLink(row.id, sessionOwnerUid)}
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
            onPress={() => void toggleFavoriteBusinessCard(row)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={
              row.isFavorite ? tr('Quitar de favoritos', 'Remove from favorites') : tr('Marcar favorito', 'Mark as favorite')
            }
          >
            <MaterialCommunityIcons
              name={row.isFavorite ? 'heart' : 'heart-outline'}
              size={18}
              color={row.isFavorite ? '#B7343A' : chestTheme.titleColor}
            />
          </TouchableOpacity>
        </View>
      </Swipeable>
    );
  };

  const renderCard = ({ item }: { item: SmartCard }) => {
    const chestTheme = getCardRowTheme(item.themeId);
    const holders = item.holdersCount ?? 0;
    const reviewCount = item.totalRatings ?? 0;
    const rating = reviewCount > 0 ? Number(item.ratingAvg ?? 0) : 0;
    const themeMeta = getThemeById(item.themeId || '') ?? CHEST_THEMES[0];
    const themeLabel = themeMeta.name;

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
            <TouchableOpacity style={styles.swipeActionBtn} onPress={() => openEditFactory(item)} accessibilityLabel={tr('Editar tarjeta', 'Edit card')}>
              <MaterialCommunityIcons name="pencil" size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>{tr('Editar', 'Edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.swipeActionBtn, { backgroundColor: '#0D4D8A' }]} onPress={() => confirmAndIssueQrForCard(item)} disabled={issuingQr} accessibilityLabel={tr('Generar QR', 'Generate QR')}>
              <MaterialCommunityIcons name="qrcode" size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>QR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.swipeActionBtn, { backgroundColor: '#C5A065' }]} onPress={() => toggleFavoriteCard(item)} accessibilityLabel={tr('Favorito', 'Favorite')}>
              <MaterialCommunityIcons name={item.isFavorite ? 'star' : 'star-outline'} size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>{item.isFavorite ? '★' : '☆'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.swipeDeleteBtn} onPress={() => deleteCard(item)} accessibilityLabel={tr('Eliminar tarjeta', 'Delete card')}>
              <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>{tr('Eliminar', 'Delete')}</Text>
            </TouchableOpacity>
          </View>
        )}
      >
        <View style={[styles.cardItem, isLandscape && styles.cardItemLandscape, { borderColor: chestTheme.borderColor, borderWidth: chestTheme.borderWidth }]}>
          <LinearGradient colors={chestTheme.gradient} style={StyleSheet.absoluteFillObject} />
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
            onPress={() => openPreviewCard(item)}
            onLongPress={() => handleCardLongPress(item)}
            delayLongPress={4000}
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
                {item.name}
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
                  onPress={() => openSubscribersModal(item)}
                >
                  <MaterialCommunityIcons name="account-group-outline" size={13} color={chestTheme.titleColor} />
                  <Text style={[styles.metricPillText, { color: chestTheme.titleColor }]}>{holders}</Text>
                </TouchableOpacity>
                <View style={styles.cardRowRatingCluster}>
                  <View style={[styles.statsRatingStack, styles.statsRatingStackAlignEnd]}>
                    {renderDetailedRatingStars(rating)}
                    <Text
                      style={[styles.ratingStackCaption, styles.ratingStackCaptionRight, { color: chestTheme.metaColor }]}
                      numberOfLines={2}
                    >
                      {rating.toFixed(1)} · {reviewCount} {tr('reseñas', 'reviews')}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cardRowFavoriteBtn}
            onPress={() => void toggleFavoriteCard(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={item.isFavorite ? tr('Quitar de favoritos', 'Remove from favorites') : tr('Marcar favorito', 'Mark as favorite')}
          >
            <MaterialCommunityIcons
              name={item.isFavorite ? 'heart' : 'heart-outline'}
              size={18}
              color={item.isFavorite ? '#B7343A' : chestTheme.titleColor}
            />
          </TouchableOpacity>
        </View>
      </Swipeable>
    );
  };

  if (!isCardsUnlocked) {
    return (
      <LinearGradient
        colors={isDark ? ['#05070A', '#0C121A', '#151D28'] : ['#EAF7FF', '#CDEFFF', '#B8E7FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="shield-lock-outline" size={56} color="#0D4D8A" />
          <Text style={styles.emptyTitle}>Acceso biométrico requerido</Text>
          <Text style={styles.emptyText}>Autoriza FaceID/TouchID para entrar a Business Cards.</Text>
          <TouchableOpacity
            style={styles.firstQrBtn}
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
            <MaterialCommunityIcons name="fingerprint" size={18} color="#FFFFFF" />
            <Text style={styles.firstQrBtnText}>Desbloquear</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: cardsTheme.background }]}> 
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
              colors={['#0A2540', '#153D63', '#C5A065']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.businessCta}
            >
              <View style={styles.businessCtaIcon}>
                <MaterialCommunityIcons name="diamond-stone" size={14} color="#0A2540" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.businessCtaTitle}>{tr('Tarjeta de Negocio', 'Business Card')}</Text>
                <Text style={styles.businessCtaSub}>{tr('Lujo', 'Luxury')}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={16} color="#F7E7C6" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={filteredFeed}
        keyExtractor={(item) => (item.kind === 'business' ? `biz-${item.id}` : `smart-${item.card.id}`)}
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
              tintColor="#C5A065"
              colors={['#C5A065']}
            />
          ) : undefined
        }
        ListEmptyComponent={
          cardSearchQuery.trim().length > 0 ? (
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="magnify" size={52} color="#CCCCCC" />
              <Text style={styles.emptyTitle}>{tr('Sin coincidencias', 'No matches')}</Text>
              <Text style={styles.emptyText}>
                {tr(
                  'Prueba con otras palabras o sinónimos. También puedes revisar tu conexión.',
                  'Try different words or synonyms. You can also check your connection.',
                )}
              </Text>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="credit-card-plus-outline" size={52} color="#0D4D8A" />
              <Text style={styles.emptyTitle}>{tr('Sin tarjetas todavía', 'No cards yet')}</Text>
              <Text style={styles.emptyText}>
                {tr(
                  'Crea una Smart Card con datos del Vault o una Tarjeta de negocio con el botón de lujo.',
                  'Create a Smart Card with Vault data or a Business card with the luxury button.',
                )}
              </Text>
            </View>
          )
        }
      />

      {/* Search bar — fixed above FAB */}
      {(smartCards.length > 0 || businessCardsFeed.length > 0) && (
        <View style={[styles.cardSearchWrap, { backgroundColor: cardsTheme.inputBg, borderColor: cardsTheme.divider }]}>
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

      <TouchableOpacity style={[styles.createFab, { backgroundColor: cardsTheme.fabBg }]} onPress={openCreateFactory} activeOpacity={0.82}>
        <MaterialCommunityIcons name="plus" size={20} color={cardsTheme.fabText} />
        <Text style={[styles.createFabText, { color: cardsTheme.fabText }]}>{tr('Crear', 'Create')}</Text>
      </TouchableOpacity>

      <Modal visible={factoryVisible} transparent animationType="slide" onRequestClose={() => { Keyboard.dismiss(); InteractionManager.runAfterInteractions(() => setFactoryVisible(false)); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={[styles.modalOverlay, { backgroundColor: cardsTheme.modalOverlay }]}>
              <TouchableWithoutFeedback>
                <View style={[styles.factoryModal, { backgroundColor: cardsTheme.modalBg, borderColor: cardsTheme.modalBorder }]}>

                  {/* Header */}
                  <View style={styles.factoryHeaderRow}>
                    <Text style={[styles.factoryTitle, { color: cardsTheme.modalTitle, marginBottom: 0 }]}>
                      {selectedCard ? tr('Editar Smart Card', 'Edit Smart Card') : tr('Nueva Smart Card', 'New Smart Card')}
                    </Text>
                    <TouchableOpacity
                      onPress={() => { Keyboard.dismiss(); InteractionManager.runAfterInteractions(() => setFactoryVisible(false)); }}
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
                        <MaterialCommunityIcons name="account" size={32} color="#0D4D8A" />
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
                      {selectedItemIds.length > 0 && (
                        <View style={styles.factoryActionBadge}>
                          <Text style={styles.factoryActionBadgeText}>{selectedItemIds.length}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.factoryActionBtn, { borderColor: cardsTheme.modalBorder, backgroundColor: cardsTheme.inputBg }]}
                      onPress={() => {
                        void refreshThemes();
                        setThemesPlaceholderVisible(true);
                      }}
                      activeOpacity={0.82}
                    >
                      <MaterialCommunityIcons name="palette-outline" size={18} color={cardsTheme.icon} />
                      <Text style={[styles.factoryActionBtnText, { color: cardsTheme.text }]}>{tr('Agregar TEMAS', 'Add THEMES')}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Card preview — fills remaining height */}
                  <View style={styles.factoryPreviewWrap}>
                    <View style={[styles.factoryPreviewStage, { backgroundColor: isDark ? 'rgba(8,18,30,0.72)' : 'rgba(255,255,255,0.36)', borderColor: cardsTheme.modalBorder }] }>
                      <View style={styles.factoryPreviewHeaderRow}>
                        <Text style={[styles.factoryPreviewTitle, { color: cardsTheme.text }]}>{tr('Asi te veran', 'How they will see you')}</Text>
                        <TouchableOpacity
                          style={[styles.factoryPreviewChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.8)', borderColor: cardsTheme.modalBorder }]}
                          onPress={() => {
                            setRotateHintVisible(true);
                            rotateAnim.setValue(0);
                            Animated.loop(
                              Animated.sequence([
                                Animated.timing(rotateAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
                                Animated.timing(rotateAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
                              ]),
                              { iterations: 2 },
                            ).start(() => setTimeout(() => setRotateHintVisible(false), 400));
                          }}
                          activeOpacity={0.7}
                          accessibilityLabel={tr('Vista horizontal', 'Horizontal view')}
                        >
                          <MaterialCommunityIcons name="phone-rotate-landscape" size={13} color={cardsTheme.icon} />
                          <Text style={[styles.factoryPreviewChipText, { color: cardsTheme.text }]}>{tr('Vista horizontal', 'Horizontal view')}</Text>
                        </TouchableOpacity>
                      </View>

                      <View
                        style={[
                          styles.factoryPreviewCardFrame,
                          { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.15)' },
                          factoryWireIconRows >= 3
                            ? { minHeight: Math.min(height * 0.44, 520) }
                            : null,
                        ]}
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
                      </View>
                    </View>
                  </View>

                  {/* Footer buttons */}
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.ghostBtn, { backgroundColor: cardsTheme.btnGhost, borderColor: cardsTheme.modalBorder }]}
                      onPress={() => { Keyboard.dismiss(); InteractionManager.runAfterInteractions(() => setFactoryVisible(false)); }}
                    >
                      <Text style={[styles.ghostBtnText, { color: cardsTheme.btnGhostText }]}>{tr('Cancelar', 'Cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.saveBtn, { backgroundColor: cardsTheme.btnPrimary, opacity: isSaving ? 0.5 : 1 }]} onPress={handleSaveCard} disabled={isSaving}>
                      <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>{isSaving ? tr('Guardando…', 'Saving…') : tr('Guardar', 'Save')}</Text>
                    </TouchableOpacity>
                  </View>

                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>

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
                <Text style={[styles.dataSelectorCounter, { color: tempSelectedIds.length >= MAX_CARD_SLOTS ? '#C44B55' : cardsTheme.icon }]}>
                  {tempSelectedIds.length} / {MAX_CARD_SLOTS}
                </Text>
              </View>
              <TouchableOpacity onPress={cancelDataSelector} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel={tr('Cerrar', 'Close')}>
                <MaterialCommunityIcons name="close" size={20} color={cardsTheme.sectionLabel} />
              </TouchableOpacity>
            </View>

            {/* Limit reached banner */}
            {dataSelectorLimitReached && (
              <View style={[styles.dataSelectorLimitBanner, { backgroundColor: isDark ? 'rgba(196,75,85,0.16)' : '#FFF2F3', borderColor: isDark ? 'rgba(229,164,168,0.35)' : '#E5A4A8' }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#C44B55" />
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
                        { borderColor: isDark ? 'rgba(184,231,255,0.18)' : '#CFEFFF', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF' },
                        isSelected && [styles.selectorItemTileSelected, { backgroundColor: isDark ? 'rgba(197,160,101,0.14)' : '#FFFBF0' }],
                      ]}
                      onPress={() => handleSelectorToggle(item.id)}
                      activeOpacity={0.75}
                    >
                      {isSelected && (
                        <View style={styles.selectorCheckOverlay}>
                          <MaterialCommunityIcons name="check-circle" size={17} color="#C5A065" />
                        </View>
                      )}
                      <View style={[styles.selectorIconCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EAF7FF' }]}>
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
              <MaterialCommunityIcons name="star-circle-outline" size={15} color="#0A2540" />
              <Text style={styles.dataSelectorUpsellText}>{tr('Consigue tu coleccionable', 'Get your collectible')}</Text>
            </TouchableOpacity>

            {/* Footer */}
            <View style={styles.modalActions}>
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
        onRequestClose={() => setThemesPlaceholderVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setThemesPlaceholderVisible(false)}>
          <View style={styles.themesPopupOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.themesPopupBox, { backgroundColor: cardsTheme.modalBg, borderColor: cardsTheme.modalBorder }]}>

                <View style={styles.factoryHeaderRow}>
                  <Text style={[styles.factoryTitle, { color: cardsTheme.modalTitle, marginBottom: 0 }]}>
                    {tr('Temas de Tarjeta', 'Card Themes')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setThemesPlaceholderVisible(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <MaterialCommunityIcons name="close" size={22} color={cardsTheme.sectionLabel} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {(['fresh', 'moderno', 'luxury'] as ThemeTier[]).map((tier) => {
                  const meta = TIER_META[tier];
                  const tierThemes = CHEST_THEMES.filter((t) => t.tier === tier);
                  return (
                    <View key={tier} style={{ marginBottom: 12 }}>
                      <Text style={[styles.themeTierLabel, { color: cardsTheme.text }]}>{meta.emoji} {language === 'en' ? meta.label[1] : meta.label[0]}</Text>
                      <View style={styles.themesPlaceholderGrid}>
                        {tierThemes.map((t) => (
                          <TouchableOpacity
                            key={t.id}
                            style={[
                              styles.themePlaceholderTile,
                              themeId === t.id && { borderWidth: 3, borderColor: '#C5A065', borderRadius: 14 },
                              !isChestThemeUnlocked(t) ? { opacity: 0.5 } : null,
                            ]}
                            onPress={() => {
                              if (!isChestThemeUnlocked(t)) {
                                Toast.show({
                                  type: 'info',
                                  text1: tr('Tema bloqueado', 'Theme locked'),
                                  text2: tr('Desbloquéalo en Card-Studio (boutique).', 'Unlock it in Card-Studio (boutique).'),
                                  position: 'bottom',
                                  visibilityTime: 2800,
                                });
                                return;
                              }
                              setThemeId(t.id);
                              void Haptics.selectionAsync();
                            }}
                            activeOpacity={0.75}
                          >
                            <LinearGradient colors={t.background} style={[styles.themePlaceholderSwatch, { borderColor: t.border.color, borderWidth: t.border.width, borderRadius: 12 }]} />
                            <View style={styles.themePlaceholderIconRow}>
                              <MaterialCommunityIcons name={t.icon.name as any} size={18} color={t.icon.color} />
                              {t.locked && !unlockedIds.has(t.id) ? (
                                <MaterialCommunityIcons name="lock-outline" size={12} color={t.border.color} />
                              ) : null}
                            </View>
                            <Text style={[styles.themePlaceholderName, { color: t.title.color }]} numberOfLines={1}>{t.name}</Text>
                            {themeId === t.id ? (
                              <View style={styles.themePlaceholderLock}>
                                <MaterialCommunityIcons name="check-circle" size={20} color="#C5A065" />
                              </View>
                            ) : null}
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                })}
                </ScrollView>

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: cardsTheme.btnPrimary, marginTop: 12 }]}
                  onPress={() => setThemesPlaceholderVisible(false)}
                >
                  <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>{tr('Aceptar', 'Accept')}</Text>
                </TouchableOpacity>

              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      </Modal>

      <Modal
        visible={previewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPreviewVisible(false);
          setPreviewCard(null);
        }}
      >
        <View style={[styles.modalOverlay, { backgroundColor: cardsTheme.modalOverlay }]}> 
          <BlurView intensity={65} tint="light" style={StyleSheet.absoluteFill} />
          {previewCard ? (
            <View
              style={[
                styles.previewModalStack,
                getPreviewModalStackSize(height, previewCardItems.length),
              ]}
            >
              <View
                style={[
                  styles.previewModalCard,
                  { borderColor: resolveTheme(previewCard.themeId).border.color, borderWidth: resolveTheme(previewCard.themeId).border.width },
                ]}
              >
                <View style={{ flex: 1, minHeight: 0 }}>
                  <LinearGradient
                    colors={resolveTheme(previewCard.themeId).background}
                    style={StyleSheet.absoluteFillObject}
                  />
                  {previewCard.wallpaperUrl ? (
                    <Animated.Image
                      source={{ uri: previewCard.wallpaperUrl }}
                      style={[
                        styles.wallpaperFill,
                        previewCard.enableParallax
                          ? { transform: [{ translateX: parallaxX }, { translateY: parallaxY }, { scale: 1.06 }] }
                          : null,
                      ]}
                      resizeMode={getWallpaperResizeMode()}
                    />
                  ) : null}

                  {renderWireframeCard({
                    layout: previewLayout,
                    slots: previewSlots,
                    editable: false,
                    theme: resolveTheme(previewCard.themeId),
                    wallpaperUrl: previewCard.wallpaperUrl,
                  })}
                </View>
              </View>

              <View
                style={[
                  styles.modalActions,
                  styles.previewModalFooterOutside,
                  {
                    backgroundColor: cardsTheme.modalBg,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderColor: cardsTheme.modalBorder,
                  },
                ]}
              >
                <TouchableOpacity
                  style={[styles.ghostBtn, { backgroundColor: cardsTheme.btnGhost, borderColor: cardsTheme.modalBorder }]}
                  onPress={() => {
                    setPreviewVisible(false);
                    setPreviewCard(null);
                  }}
                >
                  <Text style={[styles.ghostBtnText, { color: cardsTheme.btnGhostText }]}>{tr('Cerrar', 'Close')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: cardsTheme.btnPrimary }]}
                  onPress={() => {
                    setPreviewVisible(false);
                    openEditFactory(previewCard);
                  }}
                >
                  <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>{tr('Editar tarjeta', 'Edit card')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={previewBusinessVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPreviewBusinessVisible(false);
          setPreviewBusiness(null);
          setPreviewBusinessOwnerUid('');
        }}
      >
        <View style={[styles.modalOverlay, { backgroundColor: cardsTheme.modalOverlay }]}>
          <BlurView intensity={65} tint="light" style={StyleSheet.absoluteFill} />
          {previewBusiness && previewBusinessOwnerUid ? (
            <View
              style={[
                styles.previewModalStack,
                getPreviewModalStackSize(
                  height,
                  businessPreviewSlots.filter((s) => s.item !== null).length,
                ),
              ]}
            >
              <View
                style={[
                  styles.previewModalCard,
                  {
                    borderColor: resolveTheme(previewBusiness.themeId).border.color,
                    borderWidth: resolveTheme(previewBusiness.themeId).border.width,
                  },
                ]}
              >
                <View style={{ flex: 1, minHeight: 0 }}>
                  <LinearGradient
                    colors={resolveTheme(previewBusiness.themeId).background}
                    style={StyleSheet.absoluteFillObject}
                  />
                  {renderWireframeCard({
                    layout: previewLayout,
                    slots: businessPreviewSlots,
                    editable: false,
                    theme: resolveTheme(previewBusiness.themeId),
                    wireIdentity: {
                      cardTitle: previewBusiness.businessName.trim(),
                      subtitle: previewBusiness.ownerName.trim(),
                      avatarUri: toRenderableImageUri(previewBusiness.businessLogo),
                      holdersCount: previewBusiness.holdersCount ?? 0,
                      ratingAvg: Number(previewBusiness.ratingAvg ?? 0),
                      totalRatings: previewBusiness.totalRatings ?? 0,
                      noAvatarIcon: 'storefront-outline',
                    },
                  })}
                </View>
              </View>

              <View
                style={[
                  styles.modalActions,
                  styles.previewModalFooterOutside,
                  {
                    backgroundColor: cardsTheme.modalBg,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderColor: cardsTheme.modalBorder,
                  },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.ghostBtn,
                    { backgroundColor: cardsTheme.btnGhost, borderColor: cardsTheme.modalBorder },
                  ]}
                  onPress={() => {
                    setPreviewBusinessVisible(false);
                    setPreviewBusiness(null);
                    setPreviewBusinessOwnerUid('');
                  }}
                >
                  <Text style={[styles.ghostBtnText, { color: cardsTheme.btnGhostText }]}>
                    {tr('Cerrar', 'Close')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: cardsTheme.btnPrimary }]}
                  onPress={() => {
                    const id = previewBusiness.id;
                    setPreviewBusinessVisible(false);
                    setPreviewBusiness(null);
                    setPreviewBusinessOwnerUid('');
                    router.push({ pathname: '/(tabs)/createBusinessCard', params: { cardId: id } } as any);
                  }}
                >
                  <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>
                    {tr('Editar tarjeta', 'Edit card')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

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

            <View style={styles.modalActions}>
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

      <Modal
        visible={subscribersVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSubscribersVisible(false);
          setSubscribersCard(null);
          setSubscribers([]);
        }}
      >
        <View style={[styles.modalOverlay, { backgroundColor: cardsTheme.modalOverlay }]}> 
          <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[styles.subscribersModalCard, { backgroundColor: cardsTheme.modalBg, borderColor: cardsTheme.modalBorder }]}> 
            <Text style={[styles.factoryTitle, { color: cardsTheme.modalTitle }]}>{tr('Personas con tu tarjeta', 'People with your card')}</Text>
            <Text style={[styles.subscribersSubtitle, { color: cardsTheme.modalSubtitle }]}>{subscribersCard?.name || 'Smart Card'}</Text>

            <ScrollView style={styles.subscribersList} bounces={false} overScrollMode="never">
              {subscribersLoading ? (
                <Text style={[styles.subscribersLoadingText, { color: cardsTheme.sectionLabel }]}>{tr('Cargando...', 'Loading...')}</Text>
              ) : subscribers.length === 0 ? (
                <Text style={[styles.subscribersLoadingText, { color: cardsTheme.sectionLabel }]}>{tr('Aún no hay personas con acceso a esta tarjeta.', 'No one has access to this card yet.')}</Text>
              ) : (
                subscribers.map((row) => (
                  <Swipeable
                    key={row.uid}
                    containerStyle={{ marginBottom: 6, borderRadius: 12, overflow: 'hidden' }}
                    rightThreshold={20}
                    renderRightActions={() => (
                      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                        <TouchableOpacity
                          style={styles.subscriberSwipeMute}
                          onPress={() => {
                            const title = row.muted
                              ? tr('Dejar de silenciar', 'Unmute channel')
                              : tr('Silenciar canal', 'Mute channel');
                            const msg = row.muted
                              ? tr('Esta persona volverá a ver historias y novedades de esta tarjeta.', 'They will see stories and updates from this card again.')
                              : tr('No verá historias ni novedades de esta tarjeta (solo este canal).', 'They will not see stories or updates for this card only.');
                            Alert.alert(title, msg, [
                              { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
                              {
                                text: row.muted ? tr('Activar', 'Unmute') : tr('Silenciar', 'Mute'),
                                onPress: () => { void handleMuteSubscriber(row.uid, !row.muted); },
                              },
                            ]);
                          }}
                        >
                          <MaterialCommunityIcons name={row.muted ? 'volume-high' : 'volume-off'} size={16} color="#FFFFFF" />
                          <Text style={styles.swipeActionText}>{row.muted ? tr('Audio', 'Unmute') : tr('Silenciar', 'Mute')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.subscriberSwipeRevoke}
                          onPress={() => {
                            Alert.alert(
                              tr('Eliminar acceso', 'Remove access'),
                              tr('Se revocará tu tarjeta de este usuario.', 'Your card will be revoked from this user.'),
                              [
                                { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
                                { text: tr('Eliminar', 'Remove'), style: 'destructive', onPress: () => handleRevokeSubscriber(row.uid) },
                              ],
                            );
                          }}
                        >
                          <MaterialCommunityIcons name="card-remove-outline" size={16} color="#FFFFFF" />
                          <Text style={styles.swipeActionText}>{tr('Quitar', 'Remove')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.subscriberSwipeBlock}
                          onPress={() => {
                            Alert.alert(
                              tr('Bloquear usuario', 'Block user'),
                              tr('Se eliminarán todos los vínculos en ambas direcciones.', 'All share permissions will be removed bilaterally.'),
                              [
                                { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
                                { text: tr('Bloquear', 'Block'), style: 'destructive', onPress: () => handleBlockSubscriber(row.uid) },
                              ],
                            );
                          }}
                        >
                          <MaterialCommunityIcons name="account-cancel-outline" size={16} color="#FFFFFF" />
                          <Text style={styles.swipeActionText}>{tr('Bloquear', 'Block')}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  >
                    <View style={[styles.subscriberRow, { backgroundColor: cardsTheme.inputBg }]}>
                      <View style={styles.subscriberIdentity}>
                        {row.photoUrl ? (
                          <ExpoImage source={{ uri: row.photoUrl }} style={styles.subscriberAvatar} cachePolicy="disk" />
                        ) : (
                          <View style={styles.subscriberAvatarFallback}>
                            <MaterialCommunityIcons name="account" size={16} color="#0D4D8A" />
                          </View>
                        )}
                        <View style={[styles.subscriberMetaColumn, { flex: 1 }]}>
                          <Text style={styles.subscriberName}>{row.fullName || row.name}</Text>
                          <Text style={styles.subscriberUid}>@{row.nickname}</Text>
                          {row.muted ? (
                            <Text style={[styles.subscriberMutedTag, { color: cardsTheme.sectionLabel }]}>
                              {tr('Canal silenciado', 'Channel muted')}
                            </Text>
                          ) : null}
                          <View style={styles.mutualRow}>
                            <Text style={[styles.mutualLabel, { color: cardsTheme.sectionLabel }]}>
                              {tr('En común en Card-Social', 'Mutual on Card-Social')}: {row.mutualCount}
                            </Text>
                            {row.mutualPreviewPhotos.length > 0 ? (
                              <View style={styles.mutualStackRow}>
                                {row.mutualPreviewPhotos.slice(0, 3).map((uri, idx) => (
                                  <ExpoImage
                                    key={`${row.uid}-mutual-${idx}`}
                                    source={{ uri }}
                                    style={[styles.mutualTinyAvatar, idx === 0 ? styles.mutualTinyAvatarFirst : null]}
                                    cachePolicy="disk"
                                  />
                                ))}
                              </View>
                            ) : null}
                          </View>
                        </View>
                        {renderRatingStars(row.userRating)}
                      </View>
                    </View>
                  </Swipeable>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: cardsTheme.btnPrimary }]}
              onPress={() => {
                setSubscribersVisible(false);
                setSubscribersCard(null);
                setSubscribers([]);
              }}
            >
              <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>{tr('Cerrar', 'Close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={viewerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setViewerVisible(false);
          setViewerItem(null);
        }}
      >
        <View style={styles.viewerOverlay}>
          <View style={styles.viewerTopBar}>
            <TouchableOpacity style={styles.viewerDownloadButton} onPress={handleDownloadFromViewer} disabled={isDownloadingViewerFile}>
              {isDownloadingViewerFile ? (
                <ActivityIndicator size="small" color="#0A2540" />
              ) : (
                <MaterialCommunityIcons name="download" color="#0A2540" size={18} />
              )}
              <Text style={styles.viewerDownloadText}>{tr('Descargar', 'Download')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.viewerCloseButton}
              onPress={() => {
                setViewerVisible(false);
                setViewerItem(null);
              }}
            >
              <MaterialCommunityIcons name="close" color="#002D4B" size={28} />
            </TouchableOpacity>
          </View>

          <View style={styles.viewerBody}>
            {viewerItem ? (
              isImageValue(viewerItem.value) ? (
                <TouchableWithoutFeedback onLongPress={handleViewerLongPress} delayLongPress={550}>
                  <ScrollView
                    maximumZoomScale={6}
                    minimumZoomScale={1}
                    contentContainerStyle={styles.viewerZoomContainer}
                    centerContent
                    bounces={false}
                    overScrollMode="never"
                    bouncesZoom
                  >
                    <ExpoImage
                      source={{ uri: viewerItem.value }}
                      style={styles.viewerImage}
                      contentFit="contain"
                      cachePolicy="disk"
                      transition={200}
                      accessibilityLabel={tr('Documento imagen', 'Document image')}
                    />
                  </ScrollView>
                </TouchableWithoutFeedback>
              ) : isPdfValue(viewerItem.value) ? (
                PdfComponent ? (
                  <TouchableWithoutFeedback onLongPress={handleViewerLongPress} delayLongPress={550}>
                    <View style={styles.viewerPdfWrapper}>
                      <PdfComponent
                        source={{ uri: viewerItem.value }}
                        style={styles.viewerPdf}
                        minScale={1}
                        maxScale={3}
                        trustAllCerts={false}
                      />
                    </View>
                  </TouchableWithoutFeedback>
                ) : (
                  <View style={styles.viewerFallback}>
                    <MaterialCommunityIcons name="file-pdf-box" color="#C5A065" size={54} />
                    <Text style={[styles.viewerFallbackText, { color: cardsTheme.sectionLabel }]}>
                      {tr(
                        'La previsualizacion PDF no esta disponible en Expo Go. Usa un development build para verla.',
                        'PDF preview is not available in Expo Go. Use a development build to view it.'
                      )}
                    </Text>
                  </View>
                )
              ) : (
                <View style={styles.viewerFallback}>
                  <MaterialCommunityIcons name="file-alert-outline" color="#C5A065" size={54} />
                  <Text style={[styles.viewerFallbackText, { color: cardsTheme.sectionLabel }]}>
                    {tr('No se pudo previsualizar este archivo.', 'Could not preview this file.')}
                  </Text>
                </View>
              )
            ) : null}
          </View>
        </View>
      </Modal>

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
          <View style={styles.qrModal}>
            <Text style={[styles.factoryTitle, { color: cardsTheme.modalTitle }]}>
              {qrBusinessContext
                ? qrBusinessContext.businessName
                : selectedCard?.name || 'Smart Card'}
            </Text>
            <Text style={[styles.qrSubtitle, { color: cardsTheme.sectionLabel }]}>
              {qrBusinessContext
                ? tr('QR permanente (no caduca)', 'Permanent QR (does not expire)')
                : tr('QR dinámico seguro con expiración de 60s', 'Secure dynamic QR with ~60s expiry')}
            </Text>

            {qrBusinessContext ? null : (
              <View style={styles.countdownWrap}>
                <Text style={styles.countdownText}>{remainingSec}s</Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${remainingPercent * 100}%` }]} />
                </View>
              </View>
            )}

            <View style={styles.qrWrap}>
              {qrPayload ? (
                <View style={styles.qrLayerContainer}>
                  <QRCode
                    value={qrPayload}
                    size={210}
                    color="#0D4D8A"
                    backgroundColor="#FFFFFF"
                    logo={
                      qrBusinessContext?.logoUrl
                        ? { uri: qrBusinessContext.logoUrl }
                        : require('../../assets/images/CS Icon Logo.png')
                    }
                    logoSize={qrBusinessContext?.logoUrl ? 48 : 42}
                    logoBackgroundColor="#FFFFFF"
                    logoMargin={qrBusinessContext?.logoUrl ? 2 : 4}
                    ecl="H"
                  />

                  {!qrBusinessContext && qrExpired ? (
                    <View style={styles.expiredOverlay}>
                      <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
                      <TouchableOpacity
                        style={styles.refreshOverlayBtn}
                        onPress={() => {
                          if (selectedCard) {
                            confirmAndIssueQrForCard(selectedCard);
                          }
                        }}
                        disabled={issuingQr}
                      >
                        <MaterialCommunityIcons name="refresh" size={16} color="#FFFFFF" />
                        <Text style={styles.refreshOverlayBtnText}>{tr('Generar nuevo QR', 'Generate new QR')}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            <Text style={[styles.qrRefsTitle, { color: cardsTheme.text }]}>
              {qrBusinessContext ? tr('Resumen', 'Summary') : tr('Datos vinculados', 'Linked data')}
            </Text>
            <ScrollView style={styles.qrRefsList} bounces={false} overScrollMode="never">
              {qrBusinessContext ? (
                <>
                  <Text style={[styles.qrRefItem, { color: cardsTheme.sectionLabel }]}>
                    • {tr('Titular', 'Owner')}: {qrBusinessContext.ownerName || '—'}
                  </Text>
                  <Text style={[styles.qrRefItem, { color: cardsTheme.sectionLabel }]}>
                    • {tr('Enlace fijo de negocio', 'Fixed business link')}
                  </Text>
                </>
              ) : (
                selectedCardItems.map((item) => (
                  <Text key={item.id} style={[styles.qrRefItem, { color: cardsTheme.sectionLabel }]}>
                    • {item.title} ({item.type})
                  </Text>
                ))
              )}
            </ScrollView>

            <View style={styles.modalActions}>
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
                  <TouchableOpacity
                    style={[styles.ghostBtn, { backgroundColor: cardsTheme.btnGhost, borderColor: cardsTheme.modalBorder }]}
                    onPress={() => {
                      if (selectedCard) {
                        confirmAndIssueQrForCard(selectedCard);
                      }
                    }}
                  >
                    <Text style={[styles.ghostBtnText, { color: cardsTheme.btnGhostText }]}>{tr('Renovar QR', 'Renew QR')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: cardsTheme.btnPrimary }]}
                    onPress={() => {
                      setQrVisible(false);
                      setQrBusinessContext(null);
                    }}
                  >
                    <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>{tr('Cerrar', 'Close')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
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
    marginVertical: 5,
  },
  swipeActionBtn: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#497499',
    gap: 4,
  },
  swipeDeleteBtn: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B7343A',
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
    padding: 2,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
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
    flex: 2.2,
    flexDirection: 'column',
  },
  vertAvatarBox: {
    flex: 2.2,
    padding: 8,
    paddingBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vertInfoBox: {
    flex: 1.45,
    padding: 8,
    paddingTop: 6,
    paddingBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
    flex: 2.05,
    marginTop: 12,
    paddingHorizontal: 5,
    paddingTop: 2,
    paddingBottom: 6,
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
    paddingHorizontal: 2,
  },
  wireIconRowsStack: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'stretch',
    width: '100%',
    gap: 7,
  },
  wireIconRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    paddingHorizontal: 0,
  },
  wireIconCell: {
    flex: 1,
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
    paddingHorizontal: 5,
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
    marginTop: 4,
    color: '#0A2540',
    fontSize: 10,
    fontWeight: '700',
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
  qrModal: {
    width: '90%',
    backgroundColor: '#F2FBFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    padding: 16,
    alignItems: 'center',
  },
  qrSubtitle: {
    marginTop: 2,
    color: '#4B7395',
    marginBottom: 10,
  },
  countdownWrap: {
    width: '100%',
    marginBottom: 10,
  },
  countdownText: {
    color: '#0A2540',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: '#EAF7FF',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0A2540',
  },
  qrWrap: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D6F2FF',
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
    backgroundColor: '#0A2540',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#CDEFFF',
  },
  refreshOverlayBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  qrRefsTitle: {
    marginTop: 12,
    marginBottom: 6,
    color: '#0D4D8A',
    fontWeight: '700',
    alignSelf: 'flex-start',
  },
  qrRefsList: {
    width: '100%',
    maxHeight: 120,
    marginBottom: 10,
  },
  qrRefItem: {
    color: '#2F6389',
    fontSize: 12,
    marginBottom: 4,
  },
  previewModalStack: {
    width: '92%',
    maxWidth: 600,
    alignSelf: 'center',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  previewModalCard: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CDEFFF',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  previewModalFooterOutside: {
    marginTop: 14,
    marginBottom: 0,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
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
  },
  factoryPreviewStage: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.36)',
    borderWidth: 1,
    borderColor: 'rgba(184,231,255,0.72)',
    padding: 10,
  },
  factoryPreviewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  factoryPreviewTitle: {
    color: '#0A2540',
    fontSize: 12,
    fontWeight: '800',
  },
  factoryPreviewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: '#B8E7FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  factoryPreviewChipText: {
    color: '#0A2540',
    fontSize: 10,
    fontWeight: '800',
  },
  factoryPreviewCardFrame: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.15)',
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
    width: '85%',
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
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
    color: '#0D4D8A',
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
    backgroundColor: '#5B6E8C',
    gap: 4,
  },
  subscriberSwipeRevoke: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E88D3F',
    gap: 4,
  },
  subscriberSwipeBlock: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B7343A',
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
});
