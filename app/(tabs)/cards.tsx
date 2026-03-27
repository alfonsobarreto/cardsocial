import AutoScaleText from '@/components/AutoScaleText';
import FlexGrid from '@/components/FlexGrid';
import LimitReachedModal from '@/components/LimitReachedModal';
import { getActiveUserId } from '@/services/authSession';
import { hardLockCheck } from '@/services/biometricAuth';
import { type VaultCollectibleCertificate } from '@/services/collectibleService';
import { auth, db } from '@/services/firebaseConfig';
import { type CardFontItem, type FontTier } from '@/services/fontLibraryService';
import { useLanguage } from '@/services/language';
import { validateCardCreation } from '@/services/limitService';
import { useLookMode } from '@/services/lookMode';
import {
    blockRelationship,
    deleteSmartCardInDb,
    issueDynamicQrToken,
    listCardSubscribers,
    listSmartCardsFromDb,
    revokeCardSubscriber,
    upsertSmartCardInDb,
} from '@/services/qrApi';
import { getCardRowTheme } from '@/services/useActiveTheme';
import { getWallpaperResizeMode, type WallpaperItem, type WallpaperTier } from '@/services/wallpaperService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Gyroscope } from 'expo-sensors';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    AppState,
    FlatList,
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
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import QRCode from 'react-native-qrcode-svg';
import Toast from 'react-native-toast-message';
import { ActionController } from '../../services/ActionController';
import palette from '../theme';

const VAULT_STORAGE_KEY = 'vault_data';
const SMART_CARDS_STORAGE_KEY = 'smart_cards';

type CardTheme = 'sky-glass' | 'ocean-night' | 'ice-lux';

const CARD_THEMES: Record<CardTheme, { label: string; colors: [string, string] }> = {
  'sky-glass': { label: 'Sky Glass', colors: ['#EAF7FF', '#CDEFFF'] },
  'ocean-night': { label: 'Ocean Night', colors: ['#0A2540', '#1E4F7C'] },
  'ice-lux': { label: 'Ice Lux', colors: ['#F4FCFF', '#BFE8FF'] },
};

const toRenderableImageUri = (value: string | null | undefined): string | null => {
  const uri = String(value || '').trim();
  if (!uri) return null;
  if (uri.startsWith('https://') || uri.startsWith('http://')) return uri;
  if (uri.startsWith('file://')) return uri;
  if (uri.startsWith('data:image/')) return uri;
  return null;
};

type VaultItem = {
  id: string;
  title: string;
  type: string;
  value: string;
  iconName: string;
  icon?: string;
  isFavorite: boolean;
};

type SmartCard = {
  id: string;
  name: string;
  layout: 'vertical' | 'horizontal';
  themeId?: CardTheme;
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
  itemIds: string[];
  holdersCount?: number;
  ratingAvg?: number;
  createdAt: string;
  updatedAt: string;
};

type CardSubscriber = {
  uid: string;
  name: string;
  photoUrl: string | null;
  isAmixes: boolean;
};

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
  const [smartCards, setSmartCards] = useState<SmartCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<SmartCard | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [cardName, setCardName] = useState('');
  const [layoutMode, setLayoutMode] = useState<'vertical' | 'horizontal'>('vertical');
  const [themeId, setThemeId] = useState<CardTheme>('sky-glass');
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
  const [cardSearchQuery, setCardSearchQuery] = useState('');
  const [rotateHintVisible, setRotateHintVisible] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const [ownerNickname, setOwnerNickname] = useState('');
  const [ownerDisplayName, setOwnerDisplayName] = useState('');
  const [ownerPhotoUrl, setOwnerPhotoUrl] = useState<string | null>(null);
  const parallaxX = useRef(new Animated.Value(0)).current;
  const parallaxY = useRef(new Animated.Value(0)).current;
  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      const verifyAccess = async () => {
        const authenticated = await hardLockCheck('acceso a Business Cards');
        setIsCardsUnlocked(authenticated);
        if (!authenticated) {
          return;
        }

        InteractionManager.runAfterInteractions(() => {
          loadVaultItems();
          loadSmartCards();
        });
      };

      void verifyAccess();
    }, [])
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
      const raw = await AsyncStorage.getItem(VAULT_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as VaultItem[]) : [];
      setVaultItems(parsed);
    } catch {
      setVaultItems([]);
    }
  };

  const loadSmartCards = async () => {
    // 1. Lectura optimista: mostrar cache local inmediatamente (cero latencia)
    let cachedJson = '';
    try {
      const raw = await AsyncStorage.getItem(SMART_CARDS_STORAGE_KEY);
      cachedJson = raw || '';
      const cached = raw ? (JSON.parse(raw) as SmartCard[]) : [];
      if (cached.length > 0) {
        setSmartCards(cached.map((card) => ({ ...card, isFavorite: Boolean(card.isFavorite) })));
      }
    } catch { /* ignora — la nube actualiza a continuación */ }

    // 2. Refresco silencioso — actualiza estado solo si los datos cambiaron
    try {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) return;

      const remote = await listSmartCardsFromDb({ ownerUid });
      const mapped = remote.cards.map((card) => ({
        id: card.cardId,
        name: card.name,
        layout: card.layout,
        themeId: (card.themeId as CardTheme) || 'sky-glass',
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
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
      }));

      const cloudJson = JSON.stringify(mapped);
      if (cloudJson !== cachedJson) {
        setSmartCards(mapped);
        await AsyncStorage.setItem(SMART_CARDS_STORAGE_KEY, cloudJson);
      }
    } catch {
      // Cache ya pintado — no hacer nada
    }
  };

  const persistCards = async (nextCards: SmartCard[], changedCardIds?: string[]) => {
    setSmartCards(nextCards);
    await AsyncStorage.setItem(SMART_CARDS_STORAGE_KEY, JSON.stringify(nextCards));

    try {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        return;
      }

      const cardsToSync = changedCardIds
        ? nextCards.filter((c) => changedCardIds.includes(c.id))
        : nextCards;

      for (const card of cardsToSync) {
        await upsertSmartCardInDb({
          ownerUid,
          card: {
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
          },
        });
      }
    } catch {
      // Keep local cache as fallback when backend is not reachable.
    }
  };

  const resetFactory = () => {
    setCardName('');
    setSelectedItemIds([]);
    setLayoutMode('vertical');
    setThemeId('sky-glass');
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
    setThemeId(card.themeId || 'sky-glass');
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

  const MAX_CARD_SLOTS = 8;

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
                layout: layoutMode,
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
        await persistCards(nextCards, [selectedCard.id]);
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
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: cardName.trim(),
        layout: layoutMode,
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
    setTempSelectedIds([...selectedItemIds]);
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

  const issueQrForCard = async (card: SmartCard) => {
    try {
      // Hard Lock: Require biometric before generating QR (Nivel 6.6)
      const authenticated = await hardLockCheck('generar QR y compartir tu tarjeta');
      if (!authenticated) {
        return; // User cancelled or auth failed
      }

      setIssuingQr(true);
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
      Alert.alert(tr('Error de QR', 'QR error'), error?.message || tr('No se pudo emitir el QR dinámico.', 'Could not issue dynamic QR.'));
    } finally {
      setIssuingQr(false);
    }
  };

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

  const qrPayload = useMemo(() => {
    if (!selectedCard || !qrToken) {
      return '';
    }

    return JSON.stringify({
      kind: 'cardsocial-qr-v1',
      token: qrToken,
      cardId: selectedCard.id,
      exp: qrExpiresAt,
    });
  }, [selectedCard, qrToken, qrExpiresAt]);

  const remainingPercent = useMemo(() => {
    return Math.max(0, Math.min(1, remainingMs / qrWindowMs));
  }, [remainingMs, qrWindowMs]);

  const qrExpired = useMemo(() => {
    return qrVisible && remainingMs <= 0 && Boolean(qrPayload);
  }, [qrVisible, remainingMs, qrPayload]);

  const sortedCards = useMemo(() => {
    return [...smartCards].sort((a, b) => {
      const favDiff = Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite));
      if (favDiff !== 0) {
        return favDiff;
      }
      return String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' });
    });
  }, [smartCards]);

  const filteredCards = useMemo(() => {
    const q = cardSearchQuery.trim().toLowerCase();
    if (!q) return sortedCards;
    return sortedCards.filter((card) => {
      if (card.name.toLowerCase().includes(q)) return true;
      const cardItems = vaultItems.filter((vi) => card.itemIds.includes(vi.id));
      return cardItems.some(
        (vi) => vi.title.toLowerCase().includes(q) || vi.value.toLowerCase().includes(q) || vi.iconName.toLowerCase().includes(q),
      );
    });
  }, [sortedCards, cardSearchQuery, vaultItems]);

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

  // Efecto para actualizar orientación en tiempo real mientras el modal está abierto
  useEffect(() => {
    if (!previewVisible) return;
    setPreviewLayout(width > height ? 'horizontal' : 'vertical');
  }, [previewVisible, width, height]);

  const openDataPopover = (item: VaultItem) => {
    const type = String(item.type || '').toLowerCase();
    const value = String(item.value || '').trim();
    if (type.includes('email')) {
      ActionController.ActionEmail({ value });
    } else if (type.includes('tel')) {
      ActionController.ActionTelefono({
        value,
        userName: ownerNickname || 'este contacto',
        cardName: selectedCard?.name ?? '',
      });
    } else if (type.includes('enlace') || type.includes('link') || type.includes('web')) {
      ActionController.ActionLink({ value, title: item.title });
    } else if (type.includes('documento') || type.includes('pdf')) {
      ActionController.ActionDocument({
        value,
        closeModal: () => {
          setDataPopoverVisible(false);
          setFocusedDataItem(null);
        },
      });
    } else if (type.includes('texto')) {
      ActionController.ActionText({ value, title: item.title });
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
      if (item.type === 'Teléfono') {
        // Ghost-Link: no expone el número, redirige a la pestaña Calls
        Alert.alert(
          'Ghost-Link Activo',
          'Para proteger el número real, las llamadas se hacen desde Calls/Contacts dentro de Card-Social.',
          [
            { text: 'Ir a Calls', onPress: () => router.push('/(tabs)/calls' as any) },
            { text: 'Cerrar', style: 'cancel' },
          ],
        );
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
        await ActionController.ActionDocument({ value: String(item.value || '') });
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
      if (item.type === 'Teléfono') {
        Alert.alert(tr('No disponible', 'Not available'), tr('Los teléfonos no se abren en navegador por política Ghost-Link.', 'Phones cannot be opened in browser per Ghost-Link policy.'));
        return;
      }
      if (item.type === 'Enlaces') {
        await ActionController.ActionLink({ value: ensureWebUrl(item.value), title: item.title });
        return;
      }
      if (item.type === 'Documento') {
        await ActionController.ActionDocument({ value: String(item.value || '') });
        return;
      }
      Alert.alert(tr('No disponible', 'Not available'), tr('Este dato no tiene ruta de navegador directa.', 'This data has no direct browser route.'));
    } catch {
      Alert.alert(tr('Error', 'Error'), tr('No se pudo abrir en navegador.', 'Could not open in browser.'));
    }
  };

  const renderVaultMiniIcon = (item: VaultItem | null | undefined, size = 20) => {
    if (!item) {
      return <MaterialCommunityIcons name="link-variant" size={size} color="#B0B0B0" />;
    }
    if (item.icon?.startsWith('http')) {
      return <ExpoImage source={{ uri: item.icon }} style={{ width: size, height: size, borderRadius: size / 2 }} cachePolicy="disk" />;
    }
    return <MaterialCommunityIcons name={(item.icon as any) || 'link-variant'} size={size} color="#0D4D8A" />;
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

  const renderIdentityBadge = (compact = false) => {
    const holderCount = selectedCard?.holdersCount ?? previewCard?.holdersCount ?? 100;
    const ratingAvg = selectedCard?.ratingAvg ?? previewCard?.ratingAvg ?? 5;
    const cardTitle = (
      selectedCard?.name
      || previewCard?.name
      || cardName
      || 'Nueva Tarjeta'
    ).trim();
    const nickname = (ownerNickname || 'user').toLowerCase();
    return (
      <>
        {ownerPhotoUrl ? (
          <ExpoImage source={{ uri: ownerPhotoUrl }} style={compact ? styles.wireAvatarSm : styles.wireAvatar} cachePolicy="disk" />
        ) : (
          <View style={compact ? styles.wireAvatarFallbackSm : styles.wireAvatarFallback}>
            <MaterialCommunityIcons name="account" size={compact ? 14 : 18} color="#0D4D8A" />
          </View>
        )}
        <AutoScaleText style={compact ? styles.wireNameSm : styles.wireName}>{cardTitle}</AutoScaleText>
        <AutoScaleText style={compact ? styles.wireNickSm : styles.wireNick}>@{nickname}</AutoScaleText>
        <View style={styles.wireStatsRow}>
          <View style={styles.wireUsersPill}>
            <MaterialCommunityIcons name="account-outline" size={compact ? 11 : 13} color="#0A2540" />
            <Text style={styles.wireUsersPillText}>{holderCount}</Text>
          </View>
          {renderRatingStars(ratingAvg)}
        </View>
      </>
    );
  };

  const renderSlotContent = (slot: EditSlot, ui: { size: number }, editable: boolean) => {
    const hasItem = Boolean(slot.item);
    const bubbleSize = Math.max(40, Math.min(64, ui.size - 12));
    const compactTitle = String(slot.item?.title || 'Agregar')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(' ');
    const labelFontSize = compactTitle.length > 14 ? 8 : 9;

    return (
      <View style={[styles.slotTile, { minHeight: bubbleSize + 26 }]}>
        <TouchableOpacity
          style={[styles.slotBubble, { width: bubbleSize, height: bubbleSize, borderRadius: bubbleSize / 2 }]}
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
            renderVaultMiniIcon(slot.item, 24)
          ) : (
            <MaterialCommunityIcons name="plus" size={24} color="#4D7A97" />
          )}
        </TouchableOpacity>
        <Text style={[styles.slotLabel, { width: bubbleSize, fontSize: labelFontSize }]} numberOfLines={2}>
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
    colors: [string, string];
    wallpaperUrl?: string;
  }) => {
    const { layout, slots, editable, colors, wallpaperUrl } = params;
    const dataSlots = slots.filter((slot) => slot.item !== null);
    const feed = editable ? slots : dataSlots;

    if (layout === 'horizontal') {
      return (
        <LinearGradient colors={colors} style={styles.wireHorizontalCard}>
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
          <View style={styles.wireHorizontalLeft}>
            <FlexGrid
              items={feed}
              getKey={(slot) => slot.id}
              renderItem={(slot, _index, ui) => renderSlotContent(slot, ui, editable)}
            />
          </View>

          <View style={styles.wireHorizontalRight}>{renderIdentityBadge(true)}</View>
        </LinearGradient>
      );
    }

    return (
      <LinearGradient colors={colors} style={styles.wireVerticalCard}>
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
        <View style={styles.wireVerticalIdentity}>{renderIdentityBadge(false)}</View>
        <View style={styles.wireVerticalGrid}>
          <FlexGrid
            items={feed}
            getKey={(slot) => slot.id}
            renderItem={(slot, _index, ui) => renderSlotContent(slot, ui, editable)}
          />
        </View>
      </LinearGradient>
    );
  };

  const renderCard = ({ item }: { item: SmartCard }) => {
    const refsCount = item.itemIds.length;
    const chestTheme = getCardRowTheme(item.themeId);
    const holders = item.holdersCount ?? 0;
    const rating = item.ratingAvg ?? 5;

    return (
      <Swipeable
        containerStyle={[styles.swipeWrap, isLandscape && styles.swipeWrapLandscape]}
        rightThreshold={24}
        renderRightActions={() => (
          <View style={styles.swipeActions}>
            <TouchableOpacity style={styles.swipeActionBtn} onPress={() => openEditFactory(item)} accessibilityLabel={tr('Editar tarjeta', 'Edit card')}>
              <MaterialCommunityIcons name="pencil" size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>{tr('Editar', 'Edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.swipeActionBtn, { backgroundColor: '#0D4D8A' }]} onPress={() => issueQrForCard(item)} disabled={issuingQr} accessibilityLabel={tr('Generar QR', 'Generate QR')}>
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
            style={{ flex: 1 }}
            onPress={() => openPreviewCard(item)}
            onLongPress={() => handleCardLongPress(item)}
            delayLongPress={4000}
          >
            <AutoScaleText style={[styles.cardTitle, { color: chestTheme.titleColor }, item.fontFamily ? { fontFamily: item.fontFamily } : null]}>{item.name}</AutoScaleText>
            <Text style={[styles.cardMeta, { color: chestTheme.metaColor }]}>{refsCount} refs</Text>
            <View style={styles.cardMetricRow}>
              {renderRatingStars(rating)}
              <TouchableOpacity style={styles.metricPill} onPress={() => openSubscribersModal(item)}>
                <MaterialCommunityIcons name="account-group-outline" size={13} color="#0D4D8A" />
                <Text style={styles.metricPillText}>{holders}</Text>
              </TouchableOpacity>
            </View>
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
                loadVaultItems();
                loadSmartCards();
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
          <Text style={[styles.headerSubtitle, { color: cardsTheme.sectionLabel }]}>{smartCards.length} / 30 {tr('tarjetas', 'cards')}</Text>
        </View>
        <View style={styles.headerActionsRow}>
          {/* [CUARENTENA] Botón de escanear deshabilitado */}
          {/*
          <TouchableOpacity style={[styles.scanBtn, { backgroundColor: cardsTheme.btnPrimary }]} onPress={() => router.push('/scan' as any)} activeOpacity={0.82}>
            <MaterialCommunityIcons name="qrcode-scan" size={18} color={cardsTheme.btnPrimaryText} />
            <Text style={[styles.scanBtnText, { color: cardsTheme.btnPrimaryText }]}>Escanear</Text>
          </TouchableOpacity>
          */}
        </View>
      </View>

      <FlatList
        data={filteredCards}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
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
        keyboardDismissMode="on-drag"
        refreshControl={
          !isLandscape ? (
            <RefreshControl
              refreshing={refreshingCards}
              onRefresh={async () => {
                setRefreshingCards(true);
                await loadSmartCards();
                setRefreshingCards(false);
              }}
              tintColor="#C5A065"
              colors={['#C5A065']}
            />
          ) : undefined
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="credit-card-plus-outline" size={52} color="#0D4D8A" />
            <Text style={styles.emptyTitle}>{tr('Sin Smart Cards todavía', 'No Smart Cards yet')}</Text>
            <Text style={styles.emptyText}>{tr('Crea tu primera tarjeta dinámica con datos del Vault.', 'Create your first dynamic card with Vault data.')}</Text>
          </View>
        }
      />

      {/* Search bar — fixed above FAB */}
      {smartCards.length > 0 && (
        <View style={[styles.cardSearchWrap, { backgroundColor: cardsTheme.inputBg, borderColor: cardsTheme.divider }]}>
          <MaterialCommunityIcons name="magnify" size={18} color={cardsTheme.sectionLabel} />
          <TextInput
            style={[styles.cardSearchInput, { color: cardsTheme.inputText }]}
            placeholder={tr('Buscar en mis tarjetas...', 'Search my cards...')}
            placeholderTextColor={cardsTheme.sectionLabel}
            value={cardSearchQuery}
            onChangeText={setCardSearchQuery}
            returnKeyType="search"
          />
          {cardSearchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setCardSearchQuery('')} accessibilityLabel={tr('Limpiar', 'Clear')}>
              <MaterialCommunityIcons name="close-circle" size={16} color={cardsTheme.sectionLabel} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <TouchableOpacity style={[styles.createFab, { backgroundColor: cardsTheme.fabBg }]} onPress={openCreateFactory} activeOpacity={0.82}>
        <MaterialCommunityIcons name="plus" size={20} color={cardsTheme.fabText} />
        <Text style={[styles.createFabText, { color: cardsTheme.fabText }]}>Crear</Text>
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
                      onPress={() => setThemesPlaceholderVisible(true)}
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
                              { iterations: 3 },
                            ).start(() => {
                              setTimeout(() => setRotateHintVisible(false), 600);
                            });
                          }}
                          activeOpacity={0.7}
                          accessibilityLabel={tr('Vista horizontal', 'Horizontal view')}
                        >
                          <MaterialCommunityIcons name="phone-rotate-landscape" size={13} color={cardsTheme.icon} />
                          <Text style={[styles.factoryPreviewChipText, { color: cardsTheme.text }]}>{tr('Vista horizontal', 'Horizontal view')}</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={[styles.factoryPreviewCardFrame, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.15)' }]}>
                        {editSlots.filter((s) => s.item !== null).length === 0 ? (
                          <View style={styles.factoryPreviewEmpty}>
                            <MaterialCommunityIcons name="card-plus-outline" size={38} color={isDark ? 'rgba(184,231,255,0.3)' : 'rgba(13,77,138,0.18)'} />
                            <Text style={[styles.factoryPreviewEmptyText, { color: cardsTheme.sectionLabel }]}>
                              {tr('Agrega DATA para ver tu tarjeta aquí', 'Add DATA to see your card here')}
                            </Text>
                          </View>
                        ) : (
                          renderWireframeCard({
                            layout: layoutMode,
                            slots: editSlots.filter((s) => s.item !== null),
                            editable: false,
                            colors: CARD_THEMES[themeId].colors,
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
                <Text style={[styles.dataSelectorEmptyText, { color: cardsTheme.sectionLabel }]}>
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
                bounces={false}
                overScrollMode="never"
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

      {/* ThemesPlaceholder */}
      <Modal
        visible={themesPlaceholderVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setThemesPlaceholderVisible(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: cardsTheme.modalOverlay }]}>
          <View style={[styles.themesPlaceholderModal, { backgroundColor: cardsTheme.modalBg, borderColor: cardsTheme.modalBorder }]}>

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

            <Text style={[styles.themesPlaceholderSubtitle, { color: cardsTheme.sectionLabel }]}>
              {tr('Personaliza el look de tu tarjeta con themes exclusivos', 'Customize your card look with exclusive themes')}
            </Text>

            <View style={styles.themesPlaceholderGrid}>
              {([
                { name: 'Obsidian Pro', gradient: ['#1A1A2E', '#16213E'] },
                { name: 'Rose Gold', gradient: ['#F7C7B5', '#E8A598'] },
                { name: 'Neon Pulse', gradient: ['#0F3460', '#533483'] },
              ] as { name: string; gradient: [string, string] }[]).map((theme) => (
                <View key={theme.name} style={styles.themePlaceholderTile}>
                  <LinearGradient colors={theme.gradient} style={styles.themePlaceholderSwatch} />
                  <View style={styles.themePlaceholderLock}>
                    <MaterialCommunityIcons name="lock-outline" size={18} color="#C5A065" />
                  </View>
                  <Text style={[styles.themePlaceholderName, { color: cardsTheme.text }]}>{theme.name}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.themesUpsellBtn} activeOpacity={0.85}>
              <MaterialCommunityIcons name="crown" size={16} color="#0A2540" />
              <Text style={styles.themesUpsellText}>{tr('Consigue los mejores themes', 'Get the best themes')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ghostBtn, { backgroundColor: cardsTheme.btnGhost, borderColor: cardsTheme.modalBorder, marginTop: 10 }]}
              onPress={() => setThemesPlaceholderVisible(false)}
            >
              <Text style={[styles.ghostBtnText, { color: cardsTheme.btnGhostText }]}>{tr('Cerrar', 'Close')}</Text>
            </TouchableOpacity>

          </View>
        </View>
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
            <View style={[styles.previewModalCard, { backgroundColor: cardsTheme.modalBg, borderColor: cardsTheme.modalBorder, aspectRatio: previewLayout === 'vertical' ? 0.62 : 1.6, width: previewLayout === 'vertical' ? 320 : 420 }]}> 
              <LinearGradient
                colors={CARD_THEMES[previewCard.themeId || 'sky-glass'].colors}
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
              <AutoScaleText style={[styles.previewTitle, { color: cardsTheme.modalTitle }, previewCard.fontFamily ? { fontFamily: previewCard.fontFamily } : null]}>{previewCard.name}</AutoScaleText>
              <View style={styles.previewMetaRow}>
                <View style={styles.metricPill}>
                  <MaterialCommunityIcons name="account-group-outline" size={14} color="#0D4D8A" />
                  <Text style={styles.metricPillText}>{previewCard.holdersCount ?? 0}</Text>
                </View>
                {renderRatingStars(previewCard.ratingAvg ?? 5)}
              </View>

              {renderWireframeCard({
                layout: previewCard.layout,
                slots: previewSlots,
                editable: false,
                colors: CARD_THEMES[previewCard.themeId || 'sky-glass'].colors,
                wallpaperUrl: previewCard.wallpaperUrl,
              })}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.ghostBtn, { backgroundColor: cardsTheme.btnGhost, borderColor: cardsTheme.modalBorder }]}
                  onPress={() => {
                    setPreviewVisible(false);
                    setPreviewCard(null);
                  }}
                >
                  <Text style={[styles.ghostBtnText, { color: cardsTheme.btnGhostText }]}>Cerrar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: cardsTheme.btnPrimary }]}
                  onPress={() => {
                    setPreviewVisible(false);
                    openEditFactory(previewCard);
                  }}
                >
                  <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>Editar tarjeta</Text>
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

            <Text style={[styles.dataPopoverHint, { color: cardsTheme.sectionLabel }]}>Valor protegido por Ghost-Link: solo acceso enrutado.</Text>

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
                  rotate: rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }),
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
                        <View style={{ flex: 1 }}>
                          <Text style={styles.subscriberName}>{row.name}</Text>
                          <Text style={styles.subscriberUid}>@{row.uid}</Text>
                        </View>
                        {renderRatingStars(5)}
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

      <Modal visible={qrVisible} transparent animationType="fade" onRequestClose={() => setQrVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: cardsTheme.modalOverlay }]}> 
          <View style={styles.qrModal}>
            <Text style={styles.factoryTitle}>{selectedCard?.name || 'Smart Card'}</Text>
            <Text style={styles.qrSubtitle}>QR dinámico seguro con expiración de 60s</Text>

            <View style={styles.countdownWrap}>
              <Text style={styles.countdownText}>{remainingSec}s</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${remainingPercent * 100}%` }]} />
              </View>
            </View>

            <View style={styles.qrWrap}>
              {qrPayload ? (
                <View style={styles.qrLayerContainer}>
                  <QRCode
                    value={qrPayload}
                    size={210}
                    color="#0D4D8A"
                    backgroundColor="#FFFFFF"
                    logo={require('../../assets/images/CS Icon Logo.png')}
                    logoSize={42}
                    logoBackgroundColor="transparent"
                    ecl="H"
                  />

                  {qrExpired ? (
                    <View style={styles.expiredOverlay}>
                      <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
                      <TouchableOpacity
                        style={styles.refreshOverlayBtn}
                        onPress={() => {
                          if (selectedCard) {
                            issueQrForCard(selectedCard);
                          }
                        }}
                        disabled={issuingQr}
                      >
                        <MaterialCommunityIcons name="refresh" size={16} color="#FFFFFF" />
                        <Text style={styles.refreshOverlayBtnText}>Generar nuevo QR</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            <Text style={styles.qrRefsTitle}>Datos vinculados</Text>
            <ScrollView style={styles.qrRefsList} bounces={false} overScrollMode="never">
              {selectedCardItems.map((item) => (
                <Text key={item.id} style={styles.qrRefItem}>• {item.title} ({item.type})</Text>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.ghostBtn}
                onPress={() => {
                  if (selectedCard) {
                    issueQrForCard(selectedCard);
                  }
                }}
              >
                <Text style={styles.ghostBtnText}>Renovar QR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={() => setQrVisible(false)}>
                <Text style={styles.saveBtnText}>Cerrar</Text>
              </TouchableOpacity>
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
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#54C1FB',
    borderRadius: 999,
    paddingHorizontal: 10,
    height: 40,
  },
  scanBtnText: {
    color: '#0A1A2F',
    fontSize: 12,
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
    bottom: 18,
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
    paddingBottom: 94,
  },
  cardsListLandscape: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  swipeWrap: {
    marginVertical: 6,
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
    marginVertical: 6,
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
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.18)',
  },
  metricPillText: {
    color: '#0D4D8A',
    fontWeight: '700',
    fontSize: 11,
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wallpaperFill: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.93,
  },
  cardItemLandscape: {
    minHeight: 140,
    shadowColor: '#0A2540',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  cardTitle: {
    color: '#0D4D8A',
    fontSize: 15,
    fontWeight: '700',
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
    borderWidth: 1,
    borderColor: '#B8E7FF',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    flex: 1,
  },
  wireVerticalIdentity: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  wireVerticalGrid: {
    flex: 1,
    marginTop: 8,
  },
  wireHorizontalCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    padding: 10,
    minHeight: 220,
    flexDirection: 'row',
    gap: 10,
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
  wireAvatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 2,
    borderColor: '#C5A065',
  },
  wireAvatarFallback: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 2,
    borderColor: '#C5A065',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wireAvatarSm: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: '#C5A065',
  },
  wireAvatarFallbackSm: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: '#C5A065',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wireName: {
    marginTop: 10,
    color: '#0A2540',
    fontWeight: '800',
    fontSize: 18,
    textAlign: 'center',
  },
  wireNameSm: {
    marginTop: 7,
    color: '#0A2540',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
  },
  wireNick: {
    marginTop: 3,
    color: '#4A4A4A',
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
  },
  wireNickSm: {
    marginTop: 1,
    color: '#4A4A4A',
    fontWeight: '600',
    fontSize: 10,
    textAlign: 'center',
  },
  wireStatsRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    fontSize: 9,
    fontWeight: '700',
    maxWidth: 66,
    textAlign: 'center',
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
    height: '90%',
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
  previewModalCard: {
    width: '92%',
    maxHeight: '90%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CDEFFF',
    padding: 16,
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
    width: 48,
    height: 48,
    borderRadius: 24,
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
  dataSelectorEmptyText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
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
  themesPlaceholderGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  themePlaceholderTile: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
  },
  themePlaceholderSwatch: {
    width: '100%',
    height: 80,
    borderRadius: 12,
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
    right: 76,
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
});
