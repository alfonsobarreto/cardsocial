import AutoScaleText from '@/components/AutoScaleText';
import FlexGrid from '@/components/FlexGrid';
import LimitReachedModal from '@/components/LimitReachedModal';
import { getActiveUserId } from '@/services/authSession';
import { hardLockCheck } from '@/services/biometricAuth';
import { type VaultCollectibleCertificate } from '@/services/collectibleService';
import { auth, db } from '@/services/firebaseConfig';
import {
  getFontGallery,
  loadDynamicFont,
  type CardFontItem,
  type FontTier,
} from '@/services/fontLibraryService';
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
import {
  getAvailableWallpapers,
  getWallpaperResizeMode,
  type WallpaperItem,
  type WallpaperTier,
} from '@/services/wallpaperService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Gyroscope } from 'expo-sensors';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import QRCode from 'react-native-qrcode-svg';
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
  const [fontOptions, setFontOptions] = useState<CardFontItem[]>([]);
  const [loadingFonts, setLoadingFonts] = useState(false);
  const [selectedFont, setSelectedFont] = useState<CardFontItem | null>(null);
  const [resolvedFontFamily, setResolvedFontFamily] = useState<string | null>(null);
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [wallpaperOptions, setWallpaperOptions] = useState<WallpaperItem[]>([]);
  const [loadingWallpapers, setLoadingWallpapers] = useState(false);
  const [selectedWallpaper, setSelectedWallpaper] = useState<WallpaperItem | null>(null);
  const [enableParallax, setEnableParallax] = useState(false);
  const [factoryVisible, setFactoryVisible] = useState(false);
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
  const [qrToken, setQrToken] = useState('');
  const [qrExpiresAt, setQrExpiresAt] = useState<number>(0);
  const [qrWindowMs, setQrWindowMs] = useState(60000);
  const [remainingSec, setRemainingSec] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [issuingQr, setIssuingQr] = useState(false);
  const [ownerNickname, setOwnerNickname] = useState('');
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

        loadVaultItems();
        loadSmartCards();
      };

      void verifyAccess();
    }, [])
  );

  useEffect(() => {
    const user = auth.currentUser;
    if (user?.displayName) {
      setOwnerNickname(user.displayName);
    } else if (user?.email) {
      setOwnerNickname(String(user.email).split('@')[0]);
    } else if (user?.uid) {
      setOwnerNickname(`user_${String(user.uid).slice(0, 6)}`);
    }
    setOwnerPhotoUrl(user?.photoURL || null);

    loadVaultItems();
    loadSmartCards();
  }, []);

  useEffect(() => {
    if (!factoryVisible) {
      return;
    }

    void loadWallpaperOptions(layoutMode);
    void loadFontOptions();
  }, [factoryVisible, layoutMode]);

  useEffect(() => {
    if (!selectedFont?.fileUrl) {
      return;
    }

    void (async () => {
      const loaded = await loadDynamicFont(selectedFont);
      setResolvedFontFamily(loaded);
    })();
  }, [selectedFont]);

  useEffect(() => {
    void loadUserPremiumStatus();
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
    try {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        throw new Error('No session');
      }

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

      setSmartCards(mapped);
      await AsyncStorage.setItem(SMART_CARDS_STORAGE_KEY, JSON.stringify(mapped));
    } catch {
      try {
        const raw = await AsyncStorage.getItem(SMART_CARDS_STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as SmartCard[]) : [];
        setSmartCards(parsed.map((card) => ({ ...card, isFavorite: Boolean(card.isFavorite) })));
      } catch {
        setSmartCards([]);
      }
    }
  };

  const persistCards = async (nextCards: SmartCard[]) => {
    setSmartCards(nextCards);
    await AsyncStorage.setItem(SMART_CARDS_STORAGE_KEY, JSON.stringify(nextCards));

    try {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        return;
      }

      for (const card of nextCards) {
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

  const loadUserPremiumStatus = async () => {
    try {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        setIsPremiumUser(false);
        return;
      }
      const userSnap = await getDoc(doc(db, 'users', ownerUid));
      setIsPremiumUser(Boolean(userSnap.exists() && userSnap.data()?.isPremium));
    } catch {
      setIsPremiumUser(false);
    }
  };

  const loadWallpaperOptions = async (layout: 'vertical' | 'horizontal') => {
    try {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        setWallpaperOptions([]);
        return;
      }

      setLoadingWallpapers(true);
      const orientation = layout === 'horizontal' ? 'horizontal' : 'vertical';
      const rows = await getAvailableWallpapers(ownerUid, orientation);
      setWallpaperOptions(rows);
    } catch {
      setWallpaperOptions([]);
    } finally {
      setLoadingWallpapers(false);
    }
  };

  const loadFontOptions = async () => {
    try {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        setFontOptions([]);
        return;
      }

      setLoadingFonts(true);
      const rows = await getFontGallery(ownerUid);
      setFontOptions(rows);
    } catch {
      setFontOptions([]);
    } finally {
      setLoadingFonts(false);
    }
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

  const pickWallpaperWithGate = (wall: WallpaperItem) => {
    setSelectedWallpaper(wall);
  };

  const pickFontWithGate = async (font: CardFontItem) => {
    setSelectedFont(font);
    const loadedFamily = await loadDynamicFont(font);
    setResolvedFontFamily(loadedFamily);
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
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
      await persistCards(nextCards);
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

    await persistCards([newCard, ...smartCards]);
    setFactoryVisible(false);
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

  const createFirstDynamicQr = async () => {
    // [CUARENTENA] Lógica de QR dinámico deshabilitada temporalmente
    // if (vaultItems.length === 0) {
    //   Alert.alert(tr('Vault vacío', 'Empty Vault'), tr('Agrega al menos un dato en Vault para generar tu primer QR dinámico.', 'Add at least one Vault item to generate your first dynamic QR.'));
    //   return;
    // }
    // const baseItems = vaultItems.slice(0, 4).map((item) => item.id);
    // const nowIso = new Date().toISOString();
    // const firstCard: SmartCard = {
    //   id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    //   name: 'Smart Card Inicial',
    //   layout: 'vertical',
    //   themeId: 'sky-glass',
    //   isFavorite: false,
    //   itemIds: baseItems,
    //   holdersCount: 0,
    //   ratingAvg: 5,
    //   createdAt: nowIso,
    //   updatedAt: nowIso,
    // };
    // const nextCards = [firstCard, ...smartCards];
    // await persistCards(nextCards);
    // await issueQrForCard(firstCard);
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
    const handleChange = () => {
      if (window.innerWidth > window.innerHeight) {
        setPreviewLayout('horizontal');
      } else {
        setPreviewLayout('vertical');
      }
    };
    window.addEventListener('resize', handleChange);
    return () => window.removeEventListener('resize', handleChange);
  }, [previewVisible]);

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
      return <Image source={{ uri: item.icon }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
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
    const holderCount = selectedCard?.holdersCount ?? previewCard?.holdersCount ?? 0;
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
          <Image source={{ uri: ownerPhotoUrl }} style={compact ? styles.wireAvatarSm : styles.wireAvatar} />
        ) : (
          <View style={compact ? styles.wireAvatarFallbackSm : styles.wireAvatarFallback}>
            <MaterialCommunityIcons name="account" size={compact ? 14 : 18} color="#0D4D8A" />
          </View>
        )}
        <AutoScaleText style={compact ? styles.wireNameSm : styles.wireName}>{cardTitle}</AutoScaleText>
        <AutoScaleText style={compact ? styles.wireNickSm : styles.wireNick}>@{nickname}</AutoScaleText>
        <View style={styles.wireStatsRow}>
          <View style={styles.wireUsersPill}>
            <Text style={styles.wireUsersPillText}>#{holderCount}</Text>
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
              <TouchableOpacity style={styles.slotMinusBtn} onPress={() => removeSlotItem(slot.index)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <MaterialCommunityIcons name="minus" size={11} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.slotPlusBtn} onPress={() => openSlotPicker(slot.index)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
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

  const renderVaultOption = ({ item }: { item: VaultItem }) => {
    const selected = selectedItemIds.includes(item.id);
    return (
      <TouchableOpacity
        style={[styles.vaultOption, selected && styles.vaultOptionSelected]}
        onPress={() => toggleItemSelection(item.id)}
      >
        <View style={styles.vaultOptionLeft}>
          {renderVaultMiniIcon(item, 18)}
          <MaterialCommunityIcons
            name={selected ? 'check-circle' : 'circle-outline'}
            size={18}
            color={selected ? '#0D4D8A' : '#5A87A6'}
          />
          <Text style={styles.vaultOptionTitle}>{item.title}</Text>
        </View>
        <Text style={styles.vaultOptionType}>{item.type}</Text>
      </TouchableOpacity>
    );
  };

  const renderCard = ({ item }: { item: SmartCard }) => {
    const refsCount = item.itemIds.length;
    const theme = CARD_THEMES[item.themeId || 'sky-glass'];
    const holders = item.holdersCount ?? 0;
    const rating = item.ratingAvg ?? 5;

    return (
      <Swipeable
        containerStyle={[styles.swipeWrap, isLandscape && styles.swipeWrapLandscape]}
        rightThreshold={24}
        renderRightActions={() => (
          <View style={styles.swipeActions}>
            <TouchableOpacity style={styles.swipeEditBtn} onPress={() => openEditFactory(item)}>
              <MaterialCommunityIcons name="pencil" size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.swipeDeleteBtn} onPress={() => deleteCard(item)}>
              <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FFFFFF" />
              <Text style={styles.swipeActionText}>Eliminar</Text>
            </TouchableOpacity>
          </View>
        )}
      >
        <View style={[styles.cardItem, isLandscape && styles.cardItemLandscape]}>
          <LinearGradient colors={theme.colors} style={StyleSheet.absoluteFillObject} />
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
            <AutoScaleText style={[styles.cardTitle, item.fontFamily ? { fontFamily: item.fontFamily } : null]}>{item.name}</AutoScaleText>
            <Text style={styles.cardMeta}>{item.layout.toUpperCase()} · {refsCount} refs</Text>
            <View style={styles.cardMetricRow}>
              <TouchableOpacity style={styles.metricPill} onPress={() => openSubscribersModal(item)}>
                <MaterialCommunityIcons name="account-group-outline" size={13} color="#0D4D8A" />
                <Text style={styles.metricPillText}>{holders}</Text>
              </TouchableOpacity>
              {renderRatingStars(rating)}
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardIconBtn} onPress={() => openEditFactory(item)}>
            <MaterialCommunityIcons name="pencil" size={18} color="#0D4D8A" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardIconBtn} onPress={() => issueQrForCard(item)} disabled={issuingQr}>
            <MaterialCommunityIcons name="qrcode" size={18} color="#0D4D8A" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardIconBtn} onPress={() => toggleFavoriteCard(item)}>
            <MaterialCommunityIcons
              name={item.isFavorite ? 'star' : 'star-outline'}
              size={18}
              color={item.isFavorite ? '#C5A065' : '#0D4D8A'}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardIconBtn} onPress={() => deleteCard(item)}>
            <MaterialCommunityIcons name="trash-can-outline" size={18} color="#0D4D8A" />
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
          <Text style={[styles.headerTitle, { color: cardsTheme.text }]}>Smart Cards Factory</Text>
          <Text style={[styles.headerSubtitle, { color: cardsTheme.sectionLabel }]}>QR dinámico seguro: 60 segundos</Text>
        </View>
        <View style={styles.headerActionsRow}>
          {/* [CUARENTENA] Botón de escanear deshabilitado */}
          {/*
          <TouchableOpacity style={[styles.scanBtn, { backgroundColor: cardsTheme.btnPrimary }]} onPress={() => router.push('/scan' as any)} activeOpacity={0.82}>
            <MaterialCommunityIcons name="qrcode-scan" size={18} color={cardsTheme.btnPrimaryText} />
            <Text style={[styles.scanBtnText, { color: cardsTheme.btnPrimaryText }]}>Escanear</Text>
          </TouchableOpacity>
          */}
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: cardsTheme.fabBg, borderColor: cardsTheme.icon }]} onPress={openCreateFactory} activeOpacity={0.82}>
            <MaterialCommunityIcons name="plus" size={22} color={cardsTheme.fabText} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={sortedCards}
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
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="credit-card-plus-outline" size={52} color="#0D4D8A" />
            <Text style={styles.emptyTitle}>Sin Smart Cards todavía</Text>
            <Text style={styles.emptyText}>Crea tu primera tarjeta dinámica con datos del Vault.</Text>
            {/* [CUARENTENA] Botón de primer QR dinámico deshabilitado */}
            {/*
            <TouchableOpacity style={styles.firstQrBtn} onPress={createFirstDynamicQr}>
              <MaterialCommunityIcons name="qrcode" size={18} color="#FFFFFF" />
              <Text style={styles.firstQrBtnText}>Generar primer QR dinámico</Text>
            </TouchableOpacity>
            */}
          </View>
        }
      />

      <TouchableOpacity style={[styles.createFab, { backgroundColor: cardsTheme.fabBg }]} onPress={openCreateFactory} activeOpacity={0.82}>
        <MaterialCommunityIcons name="plus" size={20} color={cardsTheme.fabText} />
        <Text style={[styles.createFabText, { color: cardsTheme.fabText }]}>Crear</Text>
      </TouchableOpacity>

      <Modal visible={factoryVisible} transparent animationType="slide" onRequestClose={() => setFactoryVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: cardsTheme.modalOverlay }]}> 
          <View style={[styles.factoryModal, { backgroundColor: cardsTheme.modalBg, borderColor: cardsTheme.modalBorder }]}> 
            <Text style={[styles.factoryTitle, { color: cardsTheme.modalTitle }]}>{selectedCard ? 'Editar Smart Card' : 'Nueva Smart Card'}</Text>

            <View style={[styles.identityAutoRow, { backgroundColor: cardsTheme.inputBg, borderColor: cardsTheme.modalBorder }]}> 
              {ownerPhotoUrl ? (
                <Image source={{ uri: ownerPhotoUrl }} style={styles.identityAvatar} />
              ) : (
                <View style={styles.identityAvatarFallback}>
                  <MaterialCommunityIcons name="account" size={16} color="#0D4D8A" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.identityLabel, { color: cardsTheme.sectionLabel } ]}>Identidad automática</Text>
                <Text style={[styles.identityValue, { color: cardsTheme.text }]}>{ownerNickname || 'user'}</Text>
              </View>
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: cardsTheme.inputBg, color: cardsTheme.inputText, borderColor: cardsTheme.modalBorder }]}
              placeholder="Nombre de tarjeta"
              placeholderTextColor={cardsTheme.sectionLabel}
              value={cardName}
              onChangeText={setCardName}
            />

            <View style={styles.layoutSwitchRow}>
              <TouchableOpacity
                style={[styles.layoutBtn, layoutMode === 'vertical' && styles.layoutBtnActive]}
                onPress={() => setLayoutMode('vertical')}
              >
                <Text style={[styles.layoutText, layoutMode === 'vertical' && styles.layoutTextActive, { color: layoutMode === 'vertical' ? cardsTheme.text : cardsTheme.sectionLabel }]}>Vertical</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.layoutBtn, layoutMode === 'horizontal' && styles.layoutBtnActive]}
                onPress={() => setLayoutMode('horizontal')}
              >
                <Text style={[styles.layoutText, layoutMode === 'horizontal' && styles.layoutTextActive, { color: layoutMode === 'horizontal' ? cardsTheme.text : cardsTheme.sectionLabel }]}>Horizontal</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionLabel, { color: cardsTheme.sectionLabel }]}>Fondo visual premium</Text>
            <View style={styles.themeRow}>
              {Object.entries(CARD_THEMES).map(([id, theme]) => {
                const key = id as CardTheme;
                const active = themeId === key;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.themeBtn, active && styles.themeBtnActive]}
                    onPress={() => setThemeId(key)}
                  >
                    <LinearGradient colors={theme.colors} style={styles.themeSwatch} />
                    <Text style={[styles.themeLabel, { color: active ? cardsTheme.text : cardsTheme.sectionLabel }]}>{theme.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { color: cardsTheme.sectionLabel }]}>Cambiar Fondo</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wallpaperListRow}>
              <TouchableOpacity
                style={[styles.wallpaperThumbBtn, !selectedWallpaper && styles.wallpaperThumbBtnActive]}
                onPress={() => setSelectedWallpaper(null)}
              >
                <LinearGradient colors={CARD_THEMES[themeId].colors} style={styles.wallpaperThumbImage} />
                <Text style={styles.wallpaperThumbLabel}>Solo tema</Text>
              </TouchableOpacity>

              {loadingWallpapers ? (
                <View style={styles.wallpaperLoadingBox}>
                  <ActivityIndicator size="small" color="#0D4D8A" />
                  <Text style={styles.wallpaperLoadingText}>Cargando fondos...</Text>
                </View>
              ) : (
                wallpaperOptions.map((wall) => {
                  const active = selectedWallpaper?.id === wall.id;
                  return (
                    <TouchableOpacity
                      key={wall.id}
                      style={[styles.wallpaperThumbBtn, active && styles.wallpaperThumbBtnActive]}
                      onPress={() => pickWallpaperWithGate(wall)}
                    >
                      <Image source={{ uri: wall.thumbnailUrl }} style={styles.wallpaperThumbImage} resizeMode="cover" />
                      <Text style={styles.wallpaperThumbLabel} numberOfLines={1}>{wall.name}</Text>
                      {wall.tier === 'premium' ? (
                        <MaterialCommunityIcons name="crown" size={12} color="#C5A065" style={styles.wallpaperCrownBadge} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <Text style={[styles.sectionLabel, { color: cardsTheme.sectionLabel }]}>Cambiar Fuente</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wallpaperListRow}>
              <TouchableOpacity
                style={[styles.wallpaperThumbBtn, !selectedFont && styles.wallpaperThumbBtnActive]}
                onPress={() => {
                  setSelectedFont(null);
                  setResolvedFontFamily(null);
                }}
              >
                <View style={[styles.wallpaperThumbImage, styles.fontThumbBase]}>
                  <AutoScaleText style={styles.fontThumbText}>Aa</AutoScaleText>
                </View>
                <Text style={styles.wallpaperThumbLabel}>Sistema</Text>
              </TouchableOpacity>

              {loadingFonts ? (
                <View style={styles.wallpaperLoadingBox}>
                  <ActivityIndicator size="small" color="#0D4D8A" />
                  <Text style={styles.wallpaperLoadingText}>Cargando fuentes...</Text>
                </View>
              ) : (
                fontOptions.map((font) => {
                  const active = selectedFont?.id === font.id;
                  return (
                    <TouchableOpacity
                      key={font.id}
                      style={[styles.wallpaperThumbBtn, active && styles.wallpaperThumbBtnActive]}
                      onPress={() => {
                        void pickFontWithGate(font);
                      }}
                    >
                      <View style={[styles.wallpaperThumbImage, styles.fontThumbBase]}>
                        <AutoScaleText style={[styles.fontThumbText, resolvedFontFamily === font.family ? { fontFamily: resolvedFontFamily } : null]}>Aa</AutoScaleText>
                      </View>
                      <Text style={styles.wallpaperThumbLabel} numberOfLines={1}>{font.name}</Text>
                      {font.tier === 'premium' ? (
                        <MaterialCommunityIcons name="crown" size={12} color="#C5A065" style={styles.wallpaperCrownBadge} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.parallaxToggleRow}>
              <Text style={[styles.parallaxToggleLabel, { color: cardsTheme.sectionLabel }]}>Parallax Wallpaper</Text>
              <TouchableOpacity
                style={[styles.parallaxToggleBtn, enableParallax && styles.parallaxToggleBtnActive]}
                onPress={() => setEnableParallax((prev) => !prev)}
              >
                <MaterialCommunityIcons name={enableParallax ? 'motion-play' : 'motion-pause'} size={15} color={enableParallax ? '#FFFFFF' : '#0D4D8A'} />
                <Text style={[styles.parallaxToggleBtnText, enableParallax && styles.parallaxToggleBtnTextActive]}>
                  {enableParallax ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionLabel, { color: cardsTheme.sectionLabel }]}>Edit Choice (slots directos)</Text>
            {renderWireframeCard({
              layout: layoutMode,
              slots: editSlots,
              editable: true,
              colors: CARD_THEMES[themeId].colors,
              wallpaperUrl: selectedWallpaper?.fullUrl,
            })}

            <Text style={[styles.sectionLabel, { color: cardsTheme.sectionLabel }]}>Selecciona datos del Vault</Text>
            <FlatList
              data={vaultItems}
              keyExtractor={(item) => item.id}
              renderItem={renderVaultOption}
              style={styles.vaultList}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.ghostBtn, { backgroundColor: cardsTheme.btnGhost, borderColor: cardsTheme.modalBorder }]} onPress={() => setFactoryVisible(false)}>
                <Text style={[styles.ghostBtnText, { color: cardsTheme.btnGhostText }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: cardsTheme.btnPrimary }]} onPress={handleSaveCard}>
                <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
            <Text style={[styles.factoryTitle, { color: cardsTheme.modalTitle }]}>Suscriptores de la tarjeta</Text>
            <Text style={[styles.subscribersSubtitle, { color: cardsTheme.modalSubtitle }]}>{subscribersCard?.name || 'Smart Card'}</Text>

            <ScrollView style={styles.subscribersList}>
              {subscribersLoading ? (
                <Text style={[styles.subscribersLoadingText, { color: cardsTheme.sectionLabel }]}>Cargando suscriptores...</Text>
              ) : subscribers.length === 0 ? (
                <Text style={[styles.subscribersLoadingText, { color: cardsTheme.sectionLabel }]}>Aun no hay personas con acceso a esta tarjeta.</Text>
              ) : (
                subscribers.map((row) => (
                  <View key={row.uid} style={styles.subscriberRow}>
                    <View style={styles.subscriberIdentity}>
                      {row.photoUrl ? (
                        <Image source={{ uri: row.photoUrl }} style={styles.subscriberAvatar} />
                      ) : (
                        <View style={styles.subscriberAvatarFallback}>
                          <MaterialCommunityIcons name="account" size={16} color="#0D4D8A" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subscriberName}>{row.name}</Text>
                        <Text style={styles.subscriberUid}>{row.uid}</Text>
                      </View>
                      {row.isAmixes ? (
                        <View style={styles.amixesBadge}>
                          <MaterialCommunityIcons name="cards-heart-outline" size={12} color="#0A2540" />
                          <Text style={styles.amixesBadgeText}>Tarjeta Amixes</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.subscriberActions}>
                      <TouchableOpacity
                        style={styles.revokeBtn}
                        onPress={() => {
                          Alert.alert('Eliminar acceso', 'Se revocara al instante este permiso en la base de datos.', [
                            { text: 'Cancelar', style: 'cancel' },
                            {
                              text: 'Eliminar',
                              style: 'destructive',
                              onPress: () => handleRevokeSubscriber(row.uid),
                            },
                          ]);
                        }}
                      >
                        <Text style={styles.revokeBtnText}>Eliminar</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.blockBtn}
                        onPress={() => {
                          Alert.alert(
                            'Bloquear relacion',
                            'Se eliminaran todos los vinculos de share_permissions en ambas direcciones.',
                            [
                              { text: 'Cancelar', style: 'cancel' },
                              {
                                text: 'Bloquear',
                                style: 'destructive',
                                onPress: () => handleBlockSubscriber(row.uid),
                              },
                            ]
                          );
                        }}
                      >
                        <Text style={styles.blockBtnText}>Bloquear</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
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
              <Text style={[styles.saveBtnText, { color: cardsTheme.btnPrimaryText }]}>Cerrar</Text>
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
            <ScrollView style={styles.qrRefsList}>
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
  createBtnDark: {
    backgroundColor: '#0F1722',
    borderColor: '#C5A065',
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
  swipeEditBtn: {
    width: 90,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D4D8A',
    gap: 4,
  },
  swipeDeleteBtn: {
    width: 95,
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
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    minHeight: 290,
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
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: '#C5A065',
  },
  wireAvatarFallback: {
    width: 76,
    height: 76,
    borderRadius: 38,
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
    marginTop: 8,
    color: '#0A2540',
    fontWeight: '800',
    fontSize: 16,
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
    marginTop: 2,
    color: '#4A4A4A',
    fontWeight: '600',
    fontSize: 12,
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
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#AFCFE6',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 7,
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
    maxHeight: '88%',
    backgroundColor: '#F2FBFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    padding: 16,
  },
  factoryTitle: {
    color: '#0D4D8A',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  identityAutoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#CDEFFF',
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    backgroundColor: '#FFFFFF',
    color: '#0D4D8A',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  layoutSwitchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  layoutBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    borderRadius: 10,
    minHeight: 44,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  layoutBtnActive: {
    backgroundColor: '#DFF3FF',
    borderColor: '#0D4D8A',
  },
  layoutText: {
    color: '#5A87A6',
    fontWeight: '600',
  },
  layoutTextActive: {
    color: '#0D4D8A',
  },
  sectionLabel: {
    color: '#0D4D8A',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  themeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  themeBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B8E7FF',
    backgroundColor: '#FFFFFF',
    padding: 6,
    alignItems: 'center',
    minHeight: 44,
  },
  themeBtnActive: {
    borderColor: '#0D4D8A',
    backgroundColor: '#EAF7FF',
  },
  themeSwatch: {
    width: '100%',
    height: 24,
    borderRadius: 8,
    marginBottom: 4,
  },
  themeLabel: {
    color: '#5A87A6',
    fontSize: 11,
    fontWeight: '700',
  },
  themeLabelActive: {
    color: '#0D4D8A',
  },
  wallpaperListRow: {
    gap: 10,
    paddingBottom: 12,
  },
  wallpaperThumbBtn: {
    width: 92,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CFE4F3',
    backgroundColor: '#FFFFFF',
    padding: 6,
    minHeight: 44,
  },
  wallpaperThumbBtnActive: {
    borderColor: '#0D4D8A',
    backgroundColor: '#EAF7FF',
  },
  wallpaperThumbImage: {
    width: '100%',
    height: 64,
    borderRadius: 8,
    backgroundColor: '#D9E8F5',
  },
  wallpaperThumbLabel: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '700',
    color: '#2F5976',
    textAlign: 'center',
  },
  wallpaperCrownBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  fontThumbBase: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F8FC',
  },
  fontThumbText: {
    color: '#0A2540',
    fontSize: 24,
    fontWeight: '700',
  },
  wallpaperLoadingBox: {
    width: 140,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CFE4F3',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  wallpaperLoadingText: {
    fontSize: 11,
    color: '#2F5976',
    fontWeight: '600',
  },
  parallaxToggleRow: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  parallaxToggleLabel: {
    color: '#0D4D8A',
    fontWeight: '700',
    fontSize: 12,
  },
  parallaxToggleBtn: {
    minWidth: 84,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#0D4D8A',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#FFFFFF',
  },
  parallaxToggleBtnActive: {
    backgroundColor: '#0D4D8A',
  },
  parallaxToggleBtnText: {
    color: '#0D4D8A',
    fontWeight: '800',
    fontSize: 11,
  },
  parallaxToggleBtnTextActive: {
    color: '#FFFFFF',
  },
  vaultList: {
    maxHeight: 260,
  },
  vaultOption: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CFEFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vaultOptionSelected: {
    backgroundColor: '#EAF7FF',
    borderColor: '#0D4D8A',
  },
  vaultOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  vaultOptionTitle: {
    color: '#0D4D8A',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  vaultOptionType: {
    color: '#4F7799',
    fontSize: 11,
  },
  modalActions: {
    marginTop: 12,
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
});
