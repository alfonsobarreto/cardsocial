import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BusinessCardKeywordTags } from '@/components/BusinessCardKeywordTags';
import { ThemedSharedCardSurface } from '@/components/ThemedSharedCardSurface';
import {
  computeThemeLockerTileWidth,
  THEME_LOCKER_TILE_GAP,
  ThemeLockerThemeTile,
} from '@/components/ThemeLockerThemeTile';
import { getThemeById, getThemesByTier, TIER_META, type CardTheme as ChestCardTheme, type ThemeTier } from '@/constants/themeChest';
import { getActiveUserId } from '@/services/authSession';
import { generatePermanentBusinessLink } from '@/services/brandedQrService';
import {
  createBusinessCard,
  getBusinessCard,
  updateBusinessCard,
} from '@/services/businessCardsRepo';
import { getBusinessCardSlotAvailability } from '@/services/businessCardSlotsGate';
import { resolveBusinessMarketFacets } from '@/services/businessMarketFacets';
import type { BusinessCardDoc } from '@/services/types/cards';

/** Igual que Smart Cards (12 slots): máx. ítems de Bóveda por tarjeta de negocio. */
const MAX_BUSINESS_VAULT_DATA_SLOTS = 12;
import { validateBusinessKeywordList } from '@/services/businessKeywordValidation';
import {
  activateOrRenewBusinessLicense,
  hasActiveBusinessLicense,
} from '@/services/businessLicenseService';
import { db } from '@/services/firebaseConfig';
import { readUserAvatarUrl, readUserFullName } from '@/services/userIdentityFields';
import { getUserIconVaultMap, type IconVaultEntry } from '@/services/iconVaultService';
import { trEsEn, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { uploadFileWithModeration } from '@/services/moderationApi';
import { getCardRowTheme, useActiveTheme } from '@/services/useActiveTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Toast from 'react-native-toast-message';
import { sanitizeMaterialCommunityIconName } from '../components/iconNameValidation';
import palette from '../theme';

import AsyncStorage from '@react-native-async-storage/async-storage';
const DEFAULT_BIZ_THEME_ID = 'deep_teal';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Build `publicCardSlots` for a BusinessCard payload. Runs entirely client-side
 * (reads the user's own vault + icon vault in Firestore) and returns a compact
 * array that the backend stores as-is.
 */
async function buildPublicCardSlots(
  uid: string,
  vaultLinkIds: string[],
): Promise<
  Array<{
    itemId: string;
    type: string;
    label: string;
    value: string;
    iconName?: string;
    icon?: string;
  }>
> {
  try {
    const vaultSnap = await getDocs(collection(db, 'users', uid, 'links'));
    const vaultAll: Array<Record<string, unknown> & { id: string }> = vaultSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
    }));
    const iconMap: Record<string, IconVaultEntry> = await getUserIconVaultMap(uid)
      .then((m) => Object.fromEntries(m))
      .catch(() => ({}));
    return vaultLinkIds.slice(0, MAX_BUSINESS_VAULT_DATA_SLOTS).flatMap((lid) => {
      const it = vaultAll.find((v) => v.id === lid);
      if (!it) return [];
      const iconVaultId = it.iconVaultId as string | undefined;
      const iconEntry: IconVaultEntry | undefined = iconVaultId ? iconMap[iconVaultId] : undefined;
      const iconRaw = String(it.icon || '').trim();
      const iconUrl = /^https?:\/\//i.test(iconRaw) ? iconRaw : undefined;

      const fromVault = iconEntry?.materialIconName
        ? sanitizeMaterialCommunityIconName(iconEntry.materialIconName, '')
        : '';
      const fromStored = iconRaw && !iconUrl ? sanitizeMaterialCommunityIconName(iconRaw, '') : '';
      const fromName = (it.iconName as string | undefined)
        ? sanitizeMaterialCommunityIconName(it.iconName as string, '')
        : '';
      const glyphName = fromVault || fromStored || fromName || undefined;

      return [
        {
          itemId: String(it.id),
          type: String(it.type || 'link'),
          label: String(it.title || ''),
          value: String(it.value || ''),
          ...(glyphName ? { iconName: glyphName } : {}),
          ...(iconUrl ? { icon: iconUrl } : {}),
        },
      ];
    });
  } catch {
    return [];
  }
}

type VaultLinkRow = {
  id: string;
  title: string;
  type: string;
  iconName?: string;
  icon?: string;
  iconVaultId?: string;
};

function renderVaultLinkTileIcon(
  item: VaultLinkRow,
  size: number,
  iconVaultById: Record<string, IconVaultEntry>,
  iconColor: string,
) {
  try {
    if (item.icon?.startsWith('http')) {
      return (
        <ExpoImage
          source={{ uri: item.icon }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          cachePolicy="disk"
        />
      );
    }
    const fromVault =
      item.iconVaultId && iconVaultById[item.iconVaultId]?.materialIconName
        ? sanitizeMaterialCommunityIconName(iconVaultById[item.iconVaultId].materialIconName)
        : null;
    const fromStored =
      item.icon && String(item.icon).trim() !== '' && !String(item.icon).startsWith('http')
        ? sanitizeMaterialCommunityIconName(item.icon)
        : null;
    const fromName =
      item.iconName && item.iconName.trim() !== ''
        ? sanitizeMaterialCommunityIconName(item.iconName)
        : null;
    const safe = (fromVault || fromStored || fromName || 'link-variant') as React.ComponentProps<
      typeof MaterialCommunityIcons
    >['name'];
    return <MaterialCommunityIcons name={safe} size={size} color={iconColor} />;
  } catch {
    return <MaterialCommunityIcons name="help-circle" size={size} color={iconColor} />;
  }
}

type SubscriptionUi = 'trial' | 'active' | 'dull' | null;

function toRenderableImageUri(value: string | null | undefined): string | null {
  const uri = String(value || '').trim();
  if (!uri) return null;
  if (uri.startsWith('https://') || uri.startsWith('http://')) return uri;
  if (uri.startsWith('file://')) return uri;
  if (uri.startsWith('data:image/')) return uri;
  return null;
}

async function getFileSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true } as any);
    if ((info as any)?.size) return Number((info as any).size);
  } catch {
    /* ignore */
  }
  const blob = await fetch(uri).then((r) => r.blob());
  return blob.size;
}

/**
 * Siempre decodifica a JPEG (corrige HEIC / PNG pesado / data URI) y recorta el tamaño
 * antes de subir con mimeType image/jpeg — misma idea que el avatar en myprofile.
 */
async function optimizePhoto(uri: string): Promise<string> {
  const normalized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG },
  );
  let best = normalized.uri;
  let size = await getFileSize(best);
  if (size <= MAX_LOGO_BYTES) return best;

  const attempts = [
    { width: 800, compress: 0.78 },
    { width: 640, compress: 0.68 },
    { width: 512, compress: 0.58 },
  ];
  for (const a of attempts) {
    const r = await ImageManipulator.manipulateAsync(
      best,
      [{ resize: { width: a.width } }],
      { compress: a.compress, format: ImageManipulator.SaveFormat.JPEG },
    );
    size = await getFileSize(r.uri);
    best = r.uri;
    if (size <= MAX_LOGO_BYTES) return best;
  }
  const emergency = await ImageManipulator.manipulateAsync(
    best,
    [{ resize: { width: 400 } }],
    { compress: 0.45, format: ImageManipulator.SaveFormat.JPEG },
  );
  return emergency.uri;
}

function formatReverseAddress(a?: Location.LocationGeocodedAddress | null): string {
  if (!a) return '';
  const name = String(a.name || '').trim();
  const streetLine = [a.streetNumber, a.street].filter(Boolean).join(' ').trim();
  const areaLine = [a.district, a.city, a.region, a.postalCode, a.country].filter(Boolean).join(', ');
  const parts = [name, streetLine, areaLine].filter(Boolean);
  return parts.join(' · ');
}

type BusinessGeoMeta = {
  zipcode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  geoLabel: string | null;
};

function buildBusinessGeoMeta(a?: Location.LocationGeocodedAddress | null, fallbackLabel = ''): BusinessGeoMeta {
  const zipcode = String(a?.postalCode || '').trim() || null;
  const city = String(a?.city || a?.district || '').trim() || null;
  const region = String(a?.region || '').trim() || null;
  const country = String(a?.country || '').trim() || null;
  const geoLabel = [city, region, zipcode].filter(Boolean).join(', ').replace(', ', ', ').trim() ||
    String(fallbackLabel || '').trim() ||
    null;
  return { zipcode, city, region, country, geoLabel };
}

async function cropImageWithDims(uri: string, width: number, height: number): Promise<string> {
  const size = Math.min(width, height);
  const originX = Math.floor((width - size) / 2);
  const originY = Math.floor((height - size) / 2);
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: { originX, originY, width: size, height: size } }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

async function cropImageToSquare(uri: string): Promise<string> {
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
  });
  return cropImageWithDims(uri, width, height);
}

export default function CreateBusinessCardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bId?: string; mode?: string; fresh?: string }>();
  const routeBId = typeof params.bId === 'string' ? params.bId : params.bId?.[0] || '';
  const routeMode = typeof params.mode === 'string' ? params.mode : params.mode?.[0] || '';
  const routeFresh = typeof params.fresh === 'string' ? params.fresh : params.fresh?.[0] || '';
  const safeInsets = useSafeAreaInsets();
  const { language } = useLanguage();
  /** Estable: si no, el efecto de carga (deps incluían `tr`) se re-ejecutaba cada render, cancelaba el fetch y el `finally` no ponía `loadingExistingCard` en false. */
  const tr = useCallback((es: string, en: string) => trEsEn(es, en, language), [language]);
  const modalFooterBottomPad = useModalFooterBottomPad();
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const shell = palette[isNight ? 'dark' : 'light'];
  const { width: windowWidth } = useWindowDimensions();
  const { unlockedIds, refreshThemes } = useActiveTheme();
  const isChestThemeUnlocked = (t: ChestCardTheme) => !t.locked || unlockedIds.has(t.id);
  const [bizThemesModalContentW, setBizThemesModalContentW] = useState<number | null>(null);
  const bizThemesTileWidth = useMemo(() => {
    const boxOuter = Math.min(380, windowWidth * 0.85);
    const fallbackInner = Math.max(200, boxOuter - 32);
    const inner = bizThemesModalContentW ?? fallbackInner;
    return computeThemeLockerTileWidth(inner);
  }, [windowWidth, bizThemesModalContentW]);

  const [links, setLinks] = useState<VaultLinkRow[]>([]);
  const [iconVaultById, setIconVaultById] = useState<Record<string, IconVaultEntry>>({});
  const [selectedVaultLinkIds, setSelectedVaultLinkIds] = useState<Set<string>>(new Set());
  const [vaultSelectorVisible, setVaultSelectorVisible] = useState(false);
  const [tempVaultLinkIds, setTempVaultLinkIds] = useState<string[]>([]);
  const [vaultSelectorLimitReached, setVaultSelectorLimitReached] = useState(false);
  const [profileFullName, setProfileFullName] = useState('');
  const [bcName, setBcName] = useState('');
  const [bcContactName, setBcContactName] = useState('');
  const [addressSearchQuery, setAddressSearchQuery] = useState('');
  const [geocodeCandidates, setGeocodeCandidates] = useState<Location.LocationGeocodedLocation[]>([]);
  const [geocodeLabels, setGeocodeLabels] = useState<string[]>([]);
  const [resolvedAddressLabel, setResolvedAddressLabel] = useState('');
  const [geocodingInProgress, setGeocodingInProgress] = useState(false);
  const [keywordTags, setKeywordTags] = useState<string[]>([]);
  const [businessTermsAccepted, setBusinessTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdBId, setCreatedBId] = useState<string | null>(null);
  const [uidState, setUidState] = useState<string | null>(null);
  const [marketVisible, setMarketVisible] = useState(false);
  const [licenseActive, setLicenseActive] = useState(false);
  const [activatingLicense, setActivatingLicense] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionUi>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [bcLogo, setBcLogo] = useState<string | null>(null);
  const [bcLogoUrl, setBcLogoUrl] = useState<string | null>(null);
  const [pickingLogo, setPickingLogo] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [businessGeoMeta, setBusinessGeoMeta] = useState<BusinessGeoMeta>({
    zipcode: null,
    city: null,
    region: null,
    country: null,
    geoLabel: null,
  });
  const [locationCoordSource, setLocationCoordSource] = useState<'device_gps' | 'geocode_forward' | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [simulatingDull, setSimulatingDull] = useState(false);
  const [businessThemeId, setBusinessThemeId] = useState<string>(DEFAULT_BIZ_THEME_ID);
  const [themesPickerVisible, setThemesPickerVisible] = useState(false);
  /** Si hay bId en la ruta, mostramos loading hasta hidratar Firestore (evita baseline “vacío” antes de cargar). */
  const [loadingExistingCard, setLoadingExistingCard] = useState(() => Boolean(String(routeBId || '').trim()));

  const formBaselineRef = useRef<string | null>(null);
  /** Evita resetear el baseline en cada tecla: solo al terminar carga o primer montaje en “crear”. */
  const prevLoadingExistingRef = useRef<boolean | null>(null);
  /** Señal explícita del chip Business Card: cada `fresh` abre un formulario nuevo limpio. */
  const lastNewFormResetKeyRef = useRef<string | null>(null);
  const handleCreateRef = useRef<() => Promise<void>>(async () => {});

  /**
   * El borrador de negocio vive en estado React; no hay otra caché. Si el servidor ya no tiene la
   * tarjeta, hay que vaciar el formulario o seguirían mostrándose el último nombre, datos, iconos, etc.
   */
  const resetBusinessCardFormForNewCreation = useCallback((uidForPreview: string) => {
    setCreatedBId(null);
    setUidState(uidForPreview);
    setBcName('');
    setBcContactName('');
    setKeywordTags([]);
    setBusinessThemeId(DEFAULT_BIZ_THEME_ID);
    setSelectedVaultLinkIds(new Set());
    setTempVaultLinkIds([]);
    setLatitude(null);
    setLongitude(null);
    setBusinessGeoMeta({ zipcode: null, city: null, region: null, country: null, geoLabel: null });
    setResolvedAddressLabel('');
    setAddressSearchQuery('');
    setLocationCoordSource(null);
    setBcLogoUrl(null);
    setBcLogo(null);
    setBusinessTermsAccepted(false);
    setSubscriptionStatus(null);
    setMarketVisible(false);
    setLicenseActive(false);
    setGeocodeCandidates([]);
    setGeocodeLabels([]);
    setGeocodingInProgress(false);
    setVaultSelectorVisible(false);
    setVaultSelectorLimitReached(false);
  }, []);

  const loadLinks = useCallback(async (): Promise<VaultLinkRow[] | null> => {
    const uid = await getActiveUserId();
    if (!uid) return null;
    setUidState(uid);
    try {
      const vaultMap = await getUserIconVaultMap(uid);
      setIconVaultById(Object.fromEntries(vaultMap));

      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) {
        const u = userSnap.data() as Record<string, unknown>;
        setProfilePhotoUrl(toRenderableImageUri(readUserAvatarUrl(u) || undefined));
        setProfileFullName(readUserFullName(u));
      } else {
        setProfileFullName('');
      }
      const snap = await getDocs(collection(db, 'users', uid, 'links'));
      const next: VaultLinkRow[] = snap.docs.map((d) => {
        const row = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          title: row.title != null ? String(row.title) : d.id,
          type: row.type != null ? String(row.type) : '',
          iconName: row.iconName != null ? String(row.iconName) : 'link-variant',
          icon: row.icon != null ? String(row.icon) : undefined,
          iconVaultId: row.iconVaultId != null ? String(row.iconVaultId) : undefined,
        };
      });
      setLinks(next);
      return next;
    } catch {
      setLinks([]);
      setIconVaultById({});
      setProfileFullName('');
      return null;
    }
  }, []);

  const refreshCreatedCardMeta = useCallback(async () => {
    if (!createdBId) return;
    const uid = await getActiveUserId();
    if (!uid) return;
    try {
      const card = await getBusinessCard(uid, createdBId);
      if (card) {
        setMarketVisible(Boolean(card.isPublishedToMarket));
        const st = card.subscriptionStatus;
        if (st === 'trial' || st === 'active') {
          setSubscriptionStatus(st);
        } else if (st === 'expired') {
          setSubscriptionStatus('dull');
        }
      }
    } catch {
      /* ignore */
    }
    setLicenseActive(await hasActiveBusinessLicense(uid, createdBId));
  }, [createdBId]);

  useEffect(() => {
    void refreshCreatedCardMeta();
  }, [refreshCreatedCardMeta]);

  useEffect(() => {
    const bId = String(routeBId || '').trim();
    if (!bId) {
      setLoadingExistingCard(false);
      return;
    }
    let cancelled = false;
    setLoadingExistingCard(true);
    void (async () => {
      const uid = await getActiveUserId();
      if (!uid) {
        setLoadingExistingCard(false);
        return;
      }
      try {
        let card: BusinessCardDoc | null = null;
        try {
          card = await getBusinessCard(uid, bId);
        } catch {
          card = null;
        }
        if (cancelled) return;
        if (!card) {
          try {
            await AsyncStorage.removeItem(`@smartcard_${bId}`);
          } catch {
            /* ignore */
          }
          resetBusinessCardFormForNewCreation(uid);
          // Quitar ?bId= de la ruta: si no, `routeBId` seguía activo y el guardado hacía PATCH a un bId borrado.
          try {
            router.replace('/(tabs)/createBusinessCard' as any);
          } catch {
            /* ignore */
          }
          Alert.alert(
            tr('Tarjeta no encontrada', 'Card not found'),
            tr(
              'Tu tarjeta anterior ya no existe en el servidor. El formulario ha sido limpiado para que puedas crear una nueva.',
              'Your previous card no longer exists on the server. The form has been cleared so you can create a new one.',
            ),
          );
          setLoadingExistingCard(false);
          return;
        }
        if (cancelled) return;
        setCreatedBId(bId);
        setUidState(uid);
        setBcName(card.bcName || '');
        setBcContactName(card.bcContactName || '');
        setKeywordTags(card.bcKeywords || []);
        setBusinessThemeId(card.themeId || DEFAULT_BIZ_THEME_ID);
        setSelectedVaultLinkIds(new Set((card.vaultItemIds || []).slice(0, MAX_BUSINESS_VAULT_DATA_SLOTS)));
        setLatitude(Number.isFinite(card.bcLatitude) ? card.bcLatitude : null);
        setLongitude(Number.isFinite(card.bcLongitude) ? card.bcLongitude : null);
        setResolvedAddressLabel(card.bcPhysicalAddress || '');
        setBusinessGeoMeta({
          zipcode: card.bcZipcode || null,
          city: card.bcCity || null,
          region: card.bcRegion || null,
          country: card.bcCountry || null,
          geoLabel: card.bcGeoLabel || null,
        });
        const ls = card.bcLocationSource;
        setLocationCoordSource(ls === 'device_gps' || ls === 'geocode_forward' ? ls : null);
        setBcLogoUrl(card.bcLogoUrl || null);
        setBcLogo(null);
        setBusinessTermsAccepted(Boolean(card.businessTermsAccepted));
        const st = card.subscriptionStatus;
        if (st === 'trial' || st === 'active') {
          setSubscriptionStatus(st);
        } else if (st === 'expired') {
          setSubscriptionStatus('dull');
        } else {
          setSubscriptionStatus(null);
        }
      } finally {
        if (!cancelled) setLoadingExistingCard(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeBId, resetBusinessCardFormForNewCreation, router, tr]);

  const editingBId = routeBId || createdBId;

  const openVaultLinkSelector = () => {
    setVaultSelectorLimitReached(false);
    void (async () => {
      const fresh = await loadLinks();
      const pool = fresh ?? links;
      const valid = [...selectedVaultLinkIds].filter((id) => pool.some((l) => l.id === id));
      setTempVaultLinkIds(valid);
      setVaultSelectorVisible(true);
    })();
  };

  const toggleVaultLinkInSelector = (itemId: string) => {
    if (tempVaultLinkIds.includes(itemId)) {
      setTempVaultLinkIds((prev) => prev.filter((id) => id !== itemId));
      setVaultSelectorLimitReached(false);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      if (tempVaultLinkIds.length >= MAX_BUSINESS_VAULT_DATA_SLOTS) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setVaultSelectorLimitReached(true);
        return;
      }
      setTempVaultLinkIds((prev) => [...prev, itemId]);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const confirmVaultLinkSelector = () => {
    setSelectedVaultLinkIds(new Set(tempVaultLinkIds.slice(0, MAX_BUSINESS_VAULT_DATA_SLOTS)));
    setVaultSelectorVisible(false);
  };

  const cancelVaultLinkSelector = () => {
    setVaultSelectorVisible(false);
  };

  const applyProfileFullName = () => {
    const n = profileFullName.trim();
    if (!n) {
      Alert.alert(
        tr('Perfil', 'Profile'),
        tr('No hay nombre completo en tu perfil. Complétalo en Mi perfil.', 'No full name on your profile. Complete it in My Profile.'),
      );
      return;
    }
    setBcContactName(n);
  };

  const displayLogoUri = useMemo(() => {
    return bcLogo || bcLogoUrl || profilePhotoUrl || null;
  }, [bcLogo, bcLogoUrl, profilePhotoUrl]);

  const qrPayload = useMemo(() => {
    const uid = uidState || 'owner';
    if (createdBId) {
      return generatePermanentBusinessLink(createdBId, uid);
    }
    return `card-social://business/preview?owner=${encodeURIComponent(uid)}&mode=draft`;
  }, [createdBId, uidState]);

  const isDullPreview = subscriptionStatus === 'dull';

  const computeFormSnapshot = useCallback(() => {
    return JSON.stringify({
      bcN: bcName.trim(),
      bcC: bcContactName.trim(),
      kw: [...keywordTags].sort().join('|'),
      v: [...selectedVaultLinkIds].sort().join('|'),
      th: businessThemeId,
      lp: bcLogo || '',
      ul: bcLogoUrl || '',
      lat: latitude,
      lng: longitude,
      ad: resolvedAddressLabel.trim(),
      aq: addressSearchQuery.trim(),
      gz: businessGeoMeta.zipcode,
      gc: businessGeoMeta.city,
      gr: businessGeoMeta.region,
      gn: businessGeoMeta.country,
      gl: businessGeoMeta.geoLabel,
      ls: locationCoordSource,
      tm: businessTermsAccepted,
    });
  }, [
    bcName,
    bcContactName,
    keywordTags,
    selectedVaultLinkIds,
    businessThemeId,
    bcLogo,
    bcLogoUrl,
    latitude,
    longitude,
    resolvedAddressLabel,
    addressSearchQuery,
    businessGeoMeta,
    locationCoordSource,
    businessTermsAccepted,
  ]);

  /** Restaura el formulario al último baseline (última carga o último guardado). */
  const applyFormSnapshotFromBaselineJson = useCallback((json: string) => {
    try {
      const s = JSON.parse(json) as {
        bcN?: string;
        bcC?: string;
        bn?: string;
        on?: string;
        kw?: string;
        v?: string;
        th?: string;
        lp?: string;
        ul?: string;
        lat?: number | null;
        lng?: number | null;
        ad?: string;
        aq?: string;
        gz?: string | null;
        gc?: string | null;
        gr?: string | null;
        gn?: string | null;
        gl?: string | null;
        ls?: 'device_gps' | 'geocode_forward' | null;
        tm?: boolean;
      };
      setBcName(String(s.bcN ?? s.bn ?? ''));
      setBcContactName(String(s.bcC ?? s.on ?? ''));
      const kwRaw = String(s.kw ?? '');
      setKeywordTags(kwRaw ? kwRaw.split('|') : []);
      const vRaw = String(s.v ?? '');
      setSelectedVaultLinkIds(new Set(vRaw ? vRaw.split('|').filter(Boolean) : []));
      setBusinessThemeId(String(s.th ?? '').trim() || DEFAULT_BIZ_THEME_ID);
      const lp = String(s.lp ?? '').trim();
      setBcLogo(lp || null);
      const ul = String(s.ul ?? '').trim();
      setBcLogoUrl(ul || null);
      setLatitude(typeof s.lat === 'number' ? s.lat : null);
      setLongitude(typeof s.lng === 'number' ? s.lng : null);
      setResolvedAddressLabel(String(s.ad ?? ''));
      setAddressSearchQuery(String(s.aq ?? ''));
      setBusinessGeoMeta({
        zipcode: String(s.gz || '').trim() || null,
        city: String(s.gc || '').trim() || null,
        region: String(s.gr || '').trim() || null,
        country: String(s.gn || '').trim() || null,
        geoLabel: String(s.gl || '').trim() || null,
      });
      const ls = s.ls;
      setLocationCoordSource(ls === 'device_gps' || ls === 'geocode_forward' ? ls : null);
      setBusinessTermsAccepted(Boolean(s.tm));
      setGeocodeCandidates([]);
      setGeocodeLabels([]);
    } catch {
      /* ignore */
    }
  }, []);

  /** En tabs, `replace` a veces hace JUMP_TO y cae en otra pestaña (p. ej. Vault). `navigate` fija Cards. */
  const goToCardsTab = useCallback(() => {
    router.navigate('/(tabs)/cards' as any);
  }, [router]);

  /**
   * Tras eliminar la tarjeta en "Tarjetas", el estado local podía seguir con `createdBId` (POST no
   * añade ?bId= en la URL). Sin esto, Guardar hacía PATCH a un bId borrado → 404.
   */
  const reconcileIfCardNoLongerOnServer = useCallback(async () => {
    if (loadingExistingCard) return;
    const id = String(routeBId || createdBId || '').trim();
    if (!id) return;
    const uid = await getActiveUserId();
    if (!uid) return;
    let card: BusinessCardDoc | null = null;
    try {
      card = await getBusinessCard(uid, id);
    } catch {
      return;
    }
    if (card) return;
    try {
      await AsyncStorage.removeItem(`@smartcard_${id}`);
    } catch {
      /* ignore */
    }
    if (routeBId) {
      try {
        router.replace('/(tabs)/createBusinessCard' as any);
      } catch {
        /* ignore */
      }
    }
    resetBusinessCardFormForNewCreation(uid);
    setTimeout(() => {
      formBaselineRef.current = computeFormSnapshot();
    }, 0);
    Toast.show({
      type: 'info',
      text1: tr('Formulario vaciado', 'Form cleared'),
      text2: tr(
        'Esa tarjeta ya no existe. Completa los datos de una nueva tarjeta.',
        'That card no longer exists. Enter details for a new business card.',
      ),
      position: 'bottom',
      visibilityTime: 5000,
    });
  }, [
    loadingExistingCard,
    routeBId,
    createdBId,
    router,
    tr,
    computeFormSnapshot,
    resetBusinessCardFormForNewCreation,
  ]);

  // Bóveda al volver + comprobar que el bId siga existiendo (p. ej. eliminaste la tarjeta en otra pestaña).
  useFocusEffect(
    useCallback(() => {
      void loadLinks();
      void reconcileIfCardNoLongerOnServer();
    }, [loadLinks, reconcileIfCardNoLongerOnServer]),
  );

  /** Sin bId = flujo crear nueva: si no hay cupo, solo pestaña de suscripción (sin tocar su UI interna). */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const bId = String(routeBId || '').trim();
        if (bId) {
          return;
        }
        const uid = await getActiveUserId();
        if (!uid || cancelled) {
          return;
        }
        const slots = await getBusinessCardSlotAvailability(uid);
        if (cancelled || slots.canCreate) {
          return;
        }
        router.replace('/vault_store' as never);
      })();
      return () => {
        cancelled = true;
      };
    }, [routeBId, router]),
  );

  useEffect(() => {
    if (loadingExistingCard) {
      prevLoadingExistingRef.current = true;
      return;
    }
    const prev = prevLoadingExistingRef.current;
    prevLoadingExistingRef.current = false;
    if (prev === true || prev === null) {
      formBaselineRef.current = computeFormSnapshot();
    }
  }, [loadingExistingCard, computeFormSnapshot]);

  useEffect(() => {
    if (String(routeBId || '').trim()) {
      return;
    }
    const isExplicitNewBusiness = String(routeMode || '').trim() === 'new';
    const resetKey = isExplicitNewBusiness ? String(routeFresh || 'new') : 'initial-create';
    if (lastNewFormResetKeyRef.current === resetKey) {
      return;
    }
    lastNewFormResetKeyRef.current = resetKey;
    let cancelled = false;
    void (async () => {
      const uid = await getActiveUserId();
      if (!uid || cancelled) {
        return;
      }
      resetBusinessCardFormForNewCreation(uid);
      setTimeout(() => {
        if (!cancelled) {
          formBaselineRef.current = computeFormSnapshot();
        }
      }, 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [routeBId, routeMode, routeFresh, resetBusinessCardFormForNewCreation, computeFormSnapshot]);

  const pickBusinessLogo = async () => {
    setPickingLogo(true);
    try {
      // Evitar que un Modal RN quede encima del picker/recorte del sistema (Android).
      setVaultSelectorVisible(false);
      setThemesPickerVisible(false);
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          tr('Permiso', 'Permission'),
          tr('Necesitamos acceso a fotos para elegir el logo.', 'We need photo access to pick a logo.'),
        );
        return;
      }

      // Android: allowsEditing abre un crop nativo roto (botones fuera de pantalla / congelado).
      // iOS: recorte nativo 1:1 + base64 para preview estable.
      const skipNativeCrop = Platform.OS === 'android';
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: !skipNativeCrop,
        ...(skipNativeCrop ? {} : { aspect: [1, 1] as [number, number] }),
        quality: 0.85,
        base64: !skipNativeCrop,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];

      let nextUri: string;
      if (skipNativeCrop) {
        const w = typeof asset.width === 'number' ? asset.width : 0;
        const h = typeof asset.height === 'number' ? asset.height : 0;
        nextUri =
          w > 0 && h > 0
            ? await cropImageWithDims(asset.uri, w, h)
            : await cropImageToSquare(asset.uri);
      } else {
        nextUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
      }
      setBcLogo(nextUri);
      setBcLogoUrl(null);
    } catch (e: any) {
      Alert.alert(tr('Error', 'Error'), e?.message || tr('No se pudo procesar la imagen.', 'Could not process image.'));
    } finally {
      setPickingLogo(false);
    }
  };

  const clearCustomLogo = () => {
    setBcLogo(null);
    setBcLogoUrl(null);
  };

  const useDeviceLocation = async () => {
    setLocationLoading(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== Location.PermissionStatus.GRANTED) {
        Alert.alert(
          tr('Ubicación', 'Location'),
          tr('Activa el permiso de ubicación para guardar coordenadas.', 'Enable location permission to save coordinates.'),
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setLatitude(lat);
      setLongitude(lng);
      setLocationCoordSource('device_gps');
      setGeocodeCandidates([]);
      setGeocodeLabels([]);
      try {
        const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const label = formatReverseAddress(rev[0]) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setResolvedAddressLabel(label);
        setBusinessGeoMeta(buildBusinessGeoMeta(rev[0], label));
      } catch {
        const label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setResolvedAddressLabel(label);
        setBusinessGeoMeta(buildBusinessGeoMeta(null, label));
      }
    } catch (e: any) {
      Alert.alert(tr('GPS', 'GPS'), e?.message || tr('No se pudo leer la ubicación.', 'Could not read location.'));
    } finally {
      setLocationLoading(false);
    }
  };

  const searchAddressOnMap = async () => {
    const q = addressSearchQuery.trim();
    if (!q) {
      Alert.alert(
        tr('Dirección', 'Address'),
        tr('Escribe una dirección o lugar para buscar.', 'Type an address or place to search.'),
      );
      return;
    }
    setGeocodingInProgress(true);
    setGeocodeCandidates([]);
    setGeocodeLabels([]);
    try {
      const results = await Location.geocodeAsync(q);
      if (!results?.length) {
        Alert.alert(
          tr('Sin resultados', 'No results'),
          tr('No encontramos ese lugar. Prueba con más detalle (calle, ciudad, país).', 'We could not find that place. Try more detail (street, city, country).'),
        );
        return;
      }
      setGeocodeCandidates(results);
      const labels = await Promise.all(
        results.map(async (r) => {
          try {
            const rev = await Location.reverseGeocodeAsync({ latitude: r.latitude, longitude: r.longitude });
            const line = formatReverseAddress(rev[0]);
            return line || `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}`;
          } catch {
            return `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}`;
          }
        }),
      );
      setGeocodeLabels(labels);
    } catch (e: any) {
      Alert.alert(
        tr('Búsqueda', 'Search'),
        e?.message ||
          tr('El geocodificador del dispositivo no pudo resolver la dirección.', 'The device geocoder could not resolve the address.'),
      );
    } finally {
      setGeocodingInProgress(false);
    }
  };

  const pickGeocodeCandidate = (index: number) => {
    const r = geocodeCandidates[index];
    if (!r) return;
    setLatitude(r.latitude);
    setLongitude(r.longitude);
    setLocationCoordSource('geocode_forward');
    const label = geocodeLabels[index] || `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}`;
    setResolvedAddressLabel(label);
    void Location.reverseGeocodeAsync({ latitude: r.latitude, longitude: r.longitude })
      .then((rev) => setBusinessGeoMeta(buildBusinessGeoMeta(rev[0], label)))
      .catch(() => setBusinessGeoMeta(buildBusinessGeoMeta(null, label)));
    setGeocodeCandidates([]);
    setGeocodeLabels([]);
  };

  const resolveLogoForSave = async (uid: string): Promise<string | null> => {
    console.log('[BusinessCard] resolveLogoForSave', {
      hayPendiente: Boolean(bcLogo),
      haySubido: Boolean(bcLogoUrl),
    });
    if (bcLogo) {
      try {
        console.log('[BusinessCard] optimizando logo antes de subir…');
        const optimizedUri = await optimizePhoto(bcLogo);
        console.log('[BusinessCard] llamando uploadFileWithModeration (business_logo)…');
        const result = await uploadFileWithModeration({
          fileUri: optimizedUri,
          uid: uid,
          label: 'business_logo',
          fileName: `logo_${uid}_${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
        });
        const newPhotoUrl = result?.publicUrl || null;
        if (newPhotoUrl) {
          console.log('[BusinessCard] logo subido OK, publicUrl=', newPhotoUrl);
          setBcLogoUrl(newPhotoUrl);
          setBcLogo(null);
          return newPhotoUrl;
        }
        console.warn('[BusinessCard] upload respondió sin publicUrl', result);
        return null;
      } catch (error) {
        console.error('[BusinessCard] error subiendo logo:', error);
        return null;
      }
    }
    if (bcLogoUrl) {
      console.log('[BusinessCard] reutilizando logo ya subido (sin nuevo pending)');
      return bcLogoUrl;
    }
    console.log('[BusinessCard] sin logo pendiente ni URL previa → bcLogoUrl vacío');
    return null;
  };

  const handleCreate = async () => {
    const uid = await getActiveUserId();
    if (!uid) {
      Alert.alert(tr('Sesión', 'Session'), tr('Inicia sesión de nuevo.', 'Please sign in again.'));
      return;
    }
    if (!bcName.trim() || !bcContactName.trim()) {
      Alert.alert(
        tr('Datos incompletos', 'Missing fields'),
        tr('Indica el nombre de la tarjeta y el nombre de contacto.', 'Enter the card name and contact name.'),
      );
      return;
    }
    if (latitude == null || longitude == null) {
      Alert.alert(
        tr('Ubicación requerida', 'Location required'),
        tr(
          'Busca una dirección y elige un resultado de la lista, o usa “Mi ubicación actual”.',
          'Search for an address and pick a result from the list, or use “Use my current location”.',
        ),
      );
      return;
    }
    const kw = validateBusinessKeywordList(keywordTags);
    if (!kw.ok) {
      if (kw.reason === 'blocked') {
        Alert.alert(
          tr('Palabra no permitida', 'Word not allowed'),
          tr('Revisa las palabras clave.', 'Please review your keywords.'),
        );
      } else if (kw.reason === 'too_many') {
        Alert.alert(tr('Límite', 'Limit'), tr('Máximo 20 palabras clave.', 'Maximum 20 keywords.'));
      } else {
        Alert.alert(tr('Palabras clave', 'Keywords'), tr('Revisa el formato.', 'Check the format.'));
      }
      return;
    }
    if (!businessTermsAccepted) {
      Alert.alert(
        tr('Términos', 'Terms'),
        tr('Debes aceptar los términos y condiciones de la tarjeta de negocio.', 'You must accept the business card terms and conditions.'),
      );
      return;
    }

    setSubmitting(true);
    try {
      const idFromState = String(editingBId || '').trim() || null;
      if (idFromState) {
        const stillThere = await getBusinessCard(uid, idFromState);
        if (!stillThere) {
          try {
            await AsyncStorage.removeItem(`@smartcard_${idFromState}`);
          } catch {
            /* ignore */
          }
          if (routeBId) {
            try {
              router.replace('/(tabs)/createBusinessCard' as any);
            } catch {
              /* ignore */
            }
          }
          resetBusinessCardFormForNewCreation(uid);
          setTimeout(() => {
            formBaselineRef.current = computeFormSnapshot();
          }, 0);
          Toast.show({
            type: 'info',
            text1: tr('Formulario vaciado', 'Form cleared'),
            text2: tr(
              'Esa tarjeta ya no existe. Completa los datos y guarda de nuevo.',
              'That card no longer exists. Fill the form again and save.',
            ),
            position: 'bottom',
            visibilityTime: 5000,
          });
          return;
        }
      }

      console.log('[BusinessCard] handleCreate: resolviendo logo…');
      const resolvedLogo = await resolveLogoForSave(uid);
      const resolvedBcLogoUrl = resolvedLogo ?? '';
      console.log('[BusinessCard] handleCreate: bcLogoUrl length=', resolvedBcLogoUrl.length);

      const kwTags = kw.ok ? kw.tags : [];
      const vaultIds = [...selectedVaultLinkIds];

      const [facets, slots] = await Promise.all([
        resolveBusinessMarketFacets(uid, vaultIds),
        buildPublicCardSlots(uid, vaultIds),
      ]);

      if (idFromState) {
        await updateBusinessCard(uid, idFromState, {
          bcName: bcName.trim(),
          bcContactName: bcContactName.trim(),
          bcLogoUrl: resolvedBcLogoUrl || null,
          bcPhysicalAddress: resolvedAddressLabel.trim(),
          bcLatitude: latitude ?? 0,
          bcLongitude: longitude ?? 0,
          bcLocationSource: (locationCoordSource || 'device_gps') as 'device_gps' | 'geocode_forward' | 'manual',
          bcZipcode: businessGeoMeta.zipcode,
          bcCity: businessGeoMeta.city,
          bcRegion: businessGeoMeta.region,
          bcCountry: businessGeoMeta.country,
          bcGeoLabel: businessGeoMeta.geoLabel,
          bcLocationUpdatedAt: new Date().toISOString(),
          bcKeywords: kwTags,
          bcMarketFacets: facets,
          vaultItemIds: vaultIds,
          publicCardSlots: slots,
          themeId: businessThemeId || 'deep_teal',
        });
        formBaselineRef.current = computeFormSnapshot();
        Alert.alert(tr('Listo', 'Done'), tr('Cambios guardados.', 'Changes saved.'), [
          { text: tr('OK', 'OK'), onPress: goToCardsTab },
        ]);
        void refreshCreatedCardMeta();
      } else {
        const card = await createBusinessCard(uid, {
          bcName: bcName.trim(),
          bcContactName: bcContactName.trim(),
          bcLogoUrl: resolvedBcLogoUrl || null,
          bcPhysicalAddress: resolvedAddressLabel.trim(),
          bcLatitude: latitude ?? 0,
          bcLongitude: longitude ?? 0,
          bcLocationSource: (locationCoordSource || 'device_gps') as 'device_gps' | 'geocode_forward' | 'manual',
          bcZipcode: businessGeoMeta.zipcode,
          bcCity: businessGeoMeta.city,
          bcRegion: businessGeoMeta.region,
          bcCountry: businessGeoMeta.country,
          bcGeoLabel: businessGeoMeta.geoLabel,
          bcLocationUpdatedAt: new Date().toISOString(),
          bcKeywords: kwTags,
          vaultItemIds: vaultIds,
          themeId: businessThemeId || 'deep_teal',
          fontId: null,
          wallpaperId: null,
          iconPackId: null,
          enableParallax: false,
          layout: 'vertical',
          kycDocumentUrl: null,
          kycTermsAccepted: businessTermsAccepted,
          businessTermsAccepted,
        });

        // Market facets + slots go in via immediate PATCH (create input is lean;
        // the server didn't read any Firestore to compute them).
        if (facets.length || slots.length) {
          try {
            await updateBusinessCard(uid, card.bId, {
              bcMarketFacets: facets,
              publicCardSlots: slots,
            });
          } catch {
            /* non-fatal: the card itself was created */
          }
        }

        setCreatedBId(card.bId);
        setUidState(uid);
        setMarketVisible(false);
        setSubscriptionStatus('trial');
        formBaselineRef.current = computeFormSnapshot();

        // Activate trial license in Firestore (deliberately kept there for now).
        let licenseWarning = false;
        try {
          await activateOrRenewBusinessLicense({
            uid,
            bId: card.bId,
            annualPriceUsd: 0,
            cashbackCreditsGranted: 0,
          });
        } catch (licErr) {
          console.warn('[createBusinessCard] trial license write failed:', licErr);
          licenseWarning = true;
        }

        if (licenseWarning) {
          Toast.show({
            type: 'error',
            text1: tr('Licencia trial no activada', 'Trial license not activated'),
            text2: tr(
              'La tarjeta se guardó pero no aparecerá en el Mercado Social. Activa la licencia desde la pantalla de tu tarjeta.',
              "Card saved but won't appear in Social Market. Activate the license from your card screen.",
            ),
            visibilityTime: 7000,
          });
        }

        Alert.alert(
          tr('Listo', 'Done'),
          tr('Tarjeta de negocio creada. Periodo de prueba de 14 días iniciado.', 'Business card created. 14-day trial started.'),
          [{ text: tr('OK', 'OK'), onPress: goToCardsTab }],
        );
        void refreshCreatedCardMeta();
      }
    } catch (e: any) {
      Alert.alert(
        tr('Error', 'Error'),
        (e as Error)?.message?.trim() ? String((e as Error).message) : tr('Inténtalo de nuevo.', 'Please try again.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  handleCreateRef.current = handleCreate;

  const tryLeaveBusinessCardScreen = useCallback(() => {
    if (submitting) {
      return;
    }
    const baseline = formBaselineRef.current;
    if (baseline === null) {
      goToCardsTab();
      return;
    }
    const dirty = computeFormSnapshot() !== baseline;
    if (!dirty) {
      goToCardsTab();
      return;
    }
    Alert.alert(
      tr('Cambios sin guardar', 'Unsaved changes'),
      tr(
        'Si sales ahora, perderás lo que modificaste; no se guarda solo. ¿Quieres guardar antes de salir?',
        'If you leave now, you will lose your edits; nothing is saved automatically. Do you want to save before leaving?',
      ),
      [
        { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        {
          text: tr('No guardar', "Don't save"),
          style: 'destructive',
          onPress: () => {
            applyFormSnapshotFromBaselineJson(baseline);
            goToCardsTab();
          },
        },
        {
          text: tr('Guardar', 'Save'),
          onPress: () => void handleCreateRef.current(),
        },
      ],
    );
  }, [applyFormSnapshotFromBaselineJson, computeFormSnapshot, goToCardsTab, submitting, tr]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      tryLeaveBusinessCardScreen();
      return true;
    });
    return () => sub.remove();
  }, [tryLeaveBusinessCardScreen]);

  const handleDemoLicense = async () => {
    const uid = await getActiveUserId();
    if (!uid || !createdBId) return;
    setActivatingLicense(true);
    try {
      const lic = await activateOrRenewBusinessLicense({
        uid,
        bId: createdBId,
        annualPriceUsd: 99,
        cashbackCreditsGranted: 0,
      });
      const expMs = Date.parse(String(lic.expiresAt || ''));
      try {
        await updateBusinessCard(uid, createdBId, {
          subscriptionStatus: 'active',
          subscriptionExpiresAt: Number.isFinite(expMs) ? new Date(expMs).toISOString() : null,
        });
      } catch (e) {
        const msg = (e as Error)?.message?.trim();
        Alert.alert(
          tr('Error', 'Error'),
          msg ? String(msg) : tr('Inténtalo de nuevo.', 'Please try again.'),
        );
        return;
      }
      setSubscriptionStatus('active');
      setLicenseActive(await hasActiveBusinessLicense(uid, createdBId));
      Alert.alert(
        tr('Licencia activa', 'License active'),
        tr('Estado: active. Puedes publicar en Social Market.', 'Status: active. You can publish to Social Market.'),
      );
    } finally {
      setActivatingLicense(false);
    }
  };

  /**
   * "Dull" is a LOCAL UI preview state only — it is not persisted. The backend
   * schema's subscriptionStatus is 'trial' | 'active' | 'expired'. Hitting this
   * button just dims the preview for the current session so you can see how the
   * card looks when the subscription lapses.
   */
  const handleSimulateDull = async () => {
    const uid = await getActiveUserId();
    if (!uid || !createdBId) return;
    setSimulatingDull(true);
    try {
      setSubscriptionStatus('dull');
      Alert.alert(
        tr('Modo Dull (preview)', 'Dull mode (preview)'),
        tr(
          'Vista previa atenuada. No se persiste; al refrescar vuelve al estado real.',
          'Dimmed preview only. Not persisted; refreshing restores the real state.',
        ),
      );
    } finally {
      setSimulatingDull(false);
    }
  };

  const onToggleMarket = async (value: boolean) => {
    const uid = await getActiveUserId();
    if (!uid || !createdBId) return;
    const licensed = await hasActiveBusinessLicense(uid, createdBId);
    if (!licensed) {
      Alert.alert(
        tr('Licencia requerida', 'License required'),
        tr('Activa la licencia (simulación) antes de publicar.', 'Activate license (simulation) before publishing.'),
      );
      return;
    }
    try {
      await updateBusinessCard(uid, createdBId, { isPublishedToMarket: value });
      setMarketVisible(value);
    } catch (e) {
      const msg = (e as Error)?.message?.trim();
      Alert.alert(
        tr('Error', 'Error'),
        msg ? String(msg) : tr('Inténtalo de nuevo.', 'Please try again.'),
      );
    }
  };

  const bg = shell.backgroundSolid;
  const card = shell.modalBg;
  const text = shell.text;
  const sub = shell.textSecondary;
  const border = shell.ctaAccent;
  const inputBg = shell.inputBg;
  const chipBg = shell.surfaceMuted;

  const subscriptionLabel =
    subscriptionStatus === 'trial'
      ? tr('Prueba (trial)', 'Trial')
      : subscriptionStatus === 'active'
        ? tr('Activa', 'Active')
        : subscriptionStatus === 'dull'
          ? tr('Dull (atenuada)', 'Dull (dimmed)')
          : '—';

  const chestPreview = getCardRowTheme(businessThemeId);

  const vaultTileIconColor = shell.textSecondary;

  return (
    <>
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={[styles.heroHeaderRow, { paddingTop: safeInsets.top + 6 }]}>
            <MaterialCommunityIcons name="card-account-details-outline" size={40} color={border} />
            <TouchableOpacity
              onPress={tryLeaveBusinessCardScreen}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={tr('Cerrar', 'Close')}
              disabled={submitting}
              style={[styles.heroCloseBtn, { opacity: submitting ? 0.45 : 1 }]}
            >
              <MaterialCommunityIcons name="close" size={26} color={border} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.title, { color: text }]}>{tr('Tarjeta de negocio', 'Business card')}</Text>
          <Text style={[styles.sub, { color: sub }]}>
            {tr(
              'Protocolo de arquitectura Zero Trust: correo, teléfono, enlaces y mapa permanecen como datos soberanos en tu Bóveda; aquí solo identidad de negocio, marca, ubicación y palabras clave SEO.',
              'Zero-Trust Architecture Protocol: email, phone, links, and maps stay sovereign in your Vault—this screen only governs business identity, brand, geo, and SEO keywords.',
            )}
          </Text>
        </View>

        {loadingExistingCard ? (
          <View style={{ alignItems: 'center', marginBottom: 14 }}>
            <ActivityIndicator color={border} />
            <Text style={[styles.subInline, { color: sub, marginTop: 8 }]}>
              {tr('Cargando tarjeta…', 'Loading card…')}
            </Text>
          </View>
        ) : null}

        <View style={[styles.cardBlock, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>{tr('Vista previa', 'Preview')}</Text>
          <View style={[styles.previewWrap, isDullPreview && styles.previewDullOuter]}>
            <ThemedSharedCardSurface themeId={businessThemeId} borderRadius={14} style={styles.previewSurface}>
              <View style={[styles.previewInner, isDullPreview && styles.previewDullInner]}>
                <View style={styles.previewRow}>
                  {displayLogoUri ? (
                    <ExpoImage source={{ uri: displayLogoUri }} style={styles.previewAvatar} cachePolicy="memory" />
                  ) : (
                    <View style={[styles.previewAvatar, styles.previewAvatarPh, { borderColor: border }]}>
                      <MaterialCommunityIcons name="storefront-outline" size={32} color={sub} />
                    </View>
                  )}
                  <View style={styles.previewTextCol}>
                    <Text
                      style={[
                        styles.previewBiz,
                        {
                          color: chestPreview.titleColor,
                          fontWeight: chestPreview.titleFontWeight,
                          fontStyle: chestPreview.titleFontStyle,
                        },
                      ]}
                      numberOfLines={2}
                    >
                      {bcName.trim() || tr('Nombre de la tarjeta', 'Card name')}
                    </Text>
                    <Text
                      style={[
                        styles.previewOwner,
                        {
                          color: chestPreview.metaColor,
                          fontWeight: chestPreview.subtitleFontWeight,
                          fontStyle: chestPreview.subtitleFontStyle,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {bcContactName.trim() || tr('Nombre de contacto', 'Contact name')}
                    </Text>
                  </View>
                  <View style={styles.previewQr}>
                    <QRCode
                      value={qrPayload}
                      size={54}
                      color={isNight ? '#0C0C0C' : '#1C1C1E'}
                      backgroundColor="#FFFFFF"
                      ecl="H"
                      logo={
                        displayLogoUri
                          ? {
                              uri: displayLogoUri,
                            }
                          : undefined
                      }
                      logoSize={14}
                      logoMargin={2}
                      logoBackgroundColor="#FFFFFF"
                    />
                  </View>
                </View>
              </View>
            </ThemedSharedCardSurface>
            {isDullPreview ? (
              <View style={styles.dullOverlay} pointerEvents="none">
                <Text style={styles.dullOverlayText}>{tr('Licencia en pausa (Dull)', 'License on hold (Dull)')}</Text>
              </View>
            ) : null}
          </View>
          {subscriptionStatus ? (
            <Text style={[styles.statusLine, { color: sub }]}>
              {tr('Estado de suscripción:', 'Subscription status:')} {subscriptionLabel}
            </Text>
          ) : null}
        </View>

        <View style={[styles.cardBlock, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.label, { color: text }]}>{tr('Nombre de la tarjeta', 'Card name')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: text, borderColor: border }]}
            value={bcName}
            onChangeText={setBcName}
            placeholder={tr('Mi empresa', 'My company')}
            placeholderTextColor={sub}
          />

          <Text style={[styles.label, { color: text, marginTop: 12 }]}>{tr('Nombre de contacto', 'Contact name')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: text, borderColor: border }]}
            value={bcContactName}
            onChangeText={setBcContactName}
            placeholder={tr('Nombre completo', 'Full name')}
            placeholderTextColor={sub}
          />
          <TouchableOpacity
            style={[styles.profileNameChip, { borderColor: border, backgroundColor: inputBg }]}
            onPress={applyProfileFullName}
            activeOpacity={0.85}
            disabled={!profileFullName.trim()}
          >
            <MaterialCommunityIcons name="account-check-outline" size={20} color={profileFullName.trim() ? border : sub} />
            <Text style={[styles.profileNameChipText, { color: profileFullName.trim() ? text : sub }]}>
              {tr('Usar el mismo nombre de mi perfil', 'Use my profile name')}
            </Text>
          </TouchableOpacity>
          {profileFullName.trim() ? (
            <Text style={[styles.profileNameHint, { color: sub }]} numberOfLines={2}>
              {tr('Perfil:', 'Profile:')} {profileFullName.trim()}
            </Text>
          ) : null}

          <Text style={[styles.label, { color: text, marginTop: 12 }]}>{tr('Logo del negocio', 'Business logo')}</Text>
          <Text style={[styles.subInline, { color: sub }]}>
            {tr(
              'Por defecto: tu foto de perfil. Sube una imagen; se recorta a cuadrado. Mismo logo para la tarjeta y el centro del QR (ECL H).',
              'Default: your profile photo. Upload an image; it is cropped square. Same logo for the card and QR center (ECL H).',
            )}
          </Text>
          <View style={styles.logoRow}>
            {displayLogoUri ? (
              <ExpoImage source={{ uri: displayLogoUri }} style={styles.logoThumb} cachePolicy="memory" />
            ) : (
              <View style={[styles.logoThumb, styles.logoThumbPh, { borderColor: border }]}>
                <MaterialCommunityIcons name="image-outline" size={28} color={sub} />
              </View>
            )}
            <View style={styles.logoActions}>
              <TouchableOpacity
                style={[styles.secondaryBtnSm, { borderColor: border }]}
                onPress={() => void pickBusinessLogo()}
                disabled={pickingLogo}
              >
                {pickingLogo ? (
                  <ActivityIndicator color={text} />
                ) : (
                  <Text style={[styles.secondaryBtnSmText, { color: text }]}>
                    {tr('Elegir imagen (cuadrada)', 'Pick image (square)')}
                  </Text>
                )}
              </TouchableOpacity>
              {(bcLogo || bcLogoUrl) && (
                <TouchableOpacity onPress={clearCustomLogo} style={styles.clearLogoBtn}>
                  <Text style={{ color: sub, fontSize: 13 }}>{tr('Usar solo avatar', 'Use avatar only')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={[styles.label, { color: text, marginTop: 12 }]}>{tr('Ubicación para búsqueda', 'Location for search')}</Text>
          <Text style={[styles.subInline, { color: sub }]}>
            {tr(
              'Escribe una dirección (como en mapas): el dispositivo la convierte en lat/lng (geocodificador del sistema, sin API de pago). En el Mercado solo se usa distancia aproximada, no tu calle.',
              'Type an address (like in maps): your device turns it into lat/lng (system geocoder, no paid API). The Market only uses approximate distance, not your street.',
            )}
          </Text>

          <Text style={[styles.label, { color: text, marginTop: 6 }]}>{tr('Dirección o lugar', 'Address or place')}</Text>
          <View style={styles.addressSearchRow}>
            <TextInput
              style={[styles.input, styles.addressInput, { backgroundColor: inputBg, color: text, borderColor: border }]}
              value={addressSearchQuery}
              onChangeText={(t) => {
                setAddressSearchQuery(t);
                if (geocodeCandidates.length > 0) {
                  setGeocodeCandidates([]);
                  setGeocodeLabels([]);
                }
              }}
              placeholder={tr('Calle, número, ciudad, país…', 'Street, number, city, country…')}
              placeholderTextColor={sub}
              returnKeyType="search"
              onSubmitEditing={() => void searchAddressOnMap()}
            />
            <TouchableOpacity
              style={[styles.searchAddrBtn, { borderColor: border, backgroundColor: inputBg }]}
              onPress={() => void searchAddressOnMap()}
              disabled={geocodingInProgress}
            >
              {geocodingInProgress ? (
                <ActivityIndicator color={text} size="small" />
              ) : (
                <MaterialCommunityIcons name="map-search-outline" size={22} color={border} />
              )}
            </TouchableOpacity>
          </View>

          {geocodeCandidates.length > 0 ? (
            <View style={[styles.geocodeListWrap, { borderColor: border }]}>
              <Text style={[styles.geocodeListTitle, { color: text }]}>
                {tr('Resultados en el mapa', 'Map results')}
              </Text>
              {geocodeCandidates.map((item, index) => (
                <TouchableOpacity
                  key={`geo-${index}-${item.latitude}-${item.longitude}`}
                  style={[styles.geocodeRow, { borderColor: border }]}
                  onPress={() => pickGeocodeCandidate(index)}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons name="map-marker-outline" size={20} color={border} />
                  <View style={styles.geocodeRowText}>
                    <Text style={[styles.geocodePrimary, { color: text }]} numberOfLines={2}>
                      {geocodeLabels[index] || `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`}
                    </Text>
                    <Text style={[styles.geocodeSecondary, { color: sub }]}>
                      {tr('Toca para fijar coordenadas', 'Tap to set coordinates')}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={sub} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <Text style={[styles.orDivider, { color: sub }]}>{tr('— o —', '— or —')}</Text>

          <TouchableOpacity
            style={[styles.locBtn, { borderColor: border, backgroundColor: inputBg }]}
            onPress={() => void useDeviceLocation()}
            disabled={locationLoading}
          >
            {locationLoading ? (
              <ActivityIndicator color={text} />
            ) : (
              <>
                <MaterialCommunityIcons name="crosshairs-gps" size={22} color={border} />
                <Text style={[styles.locBtnText, { color: text }]}>
                  {tr('Usar mi ubicación actual', 'Use my current location')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {latitude != null && longitude != null ? (
            <View style={[styles.resolvedBox, { borderColor: border, backgroundColor: inputBg }]}>
              <Text style={[styles.coords, { color: text }]}>
                {tr('Lat', 'Lat')}: {latitude.toFixed(5)} · {tr('Lng', 'Lng')}: {longitude.toFixed(5)}
              </Text>
              {resolvedAddressLabel ? (
                <Text style={[styles.resolvedLabel, { color: sub }]} numberOfLines={4}>
                  {resolvedAddressLabel}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={[styles.cardBlock, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.label, { color: text }]}>{tr('Palabras Clave (SEO)', 'Keywords (SEO)')}</Text>
          <BusinessCardKeywordTags
            tags={keywordTags}
            onTagsChange={setKeywordTags}
            tr={tr}
            textColor={text}
            subColor={sub}
            borderColor={border}
            inputBg={inputBg}
            chipBg={chipBg}
          />
        </View>

        <View style={[styles.cardBlock, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.label, { color: text }]}>{tr('Datos y tema', 'Data and theme')}</Text>
          <Text style={[styles.sub, { color: sub, marginBottom: 10 }]}>
            {tr(
              'Igual que en Smart Cards: elige ítems de la Bóveda y un tema visual.',
              'Same as Smart Cards: pick Vault items and a visual theme.',
            )}
          </Text>
          <View style={styles.bizFactoryActionRow}>
            <TouchableOpacity
              style={[styles.bizFactoryChip, { borderColor: border, backgroundColor: inputBg }]}
              onPress={openVaultLinkSelector}
              activeOpacity={0.82}
            >
              <MaterialCommunityIcons name="database-plus-outline" size={18} color={border} />
              <Text style={[styles.bizFactoryChipText, { color: text }]} numberOfLines={1}>
                {tr('Agregar DATA', 'Add DATA')}
              </Text>
              {selectedVaultLinkIds.size > 0 ? (
                <View style={styles.vaultChipBadge}>
                  <Text style={styles.vaultChipBadgeText}>{selectedVaultLinkIds.size}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bizFactoryChip, { borderColor: border, backgroundColor: inputBg }]}
              onPress={() => {
                void refreshThemes();
                setThemesPickerVisible(true);
              }}
              activeOpacity={0.82}
            >
              <MaterialCommunityIcons name="palette-outline" size={18} color={border} />
              <Text style={[styles.bizFactoryChipText, { color: text }]} numberOfLines={1}>
                {tr('Agregar TEMAS', 'Add THEMES')}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.themePickedHint, { color: sub }]}>
            {tr('Tema:', 'Theme:')}{' '}
            {getThemeById(businessThemeId)?.name ?? businessThemeId}
          </Text>
          {links.length === 0 ? (
            <Text style={[styles.vaultEmptyHint, { color: sub }]}>
              {tr('Sin enlaces en la nube. Agrega datos en Bóveda.', 'No cloud links yet. Add data in Vault.')}
            </Text>
          ) : null}
        </View>

        <View style={[styles.cardBlock, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>{tr('Términos y condiciones', 'Terms and conditions')}</Text>
          <ScrollView style={[styles.termsBox, { borderColor: border }]} nestedScrollEnabled showsVerticalScrollIndicator>
            <Text style={[styles.termsText, { color: sub }]}>
              {language === 'en' || language === 'de'
                ? `By creating a business card you agree not to use Card-Social to promote illegal gambling, explicit sexual content, hate speech, harassment, or deceptive scams. Keywords and visible content must comply with these rules. Card-Social may remove or restrict cards that violate policy. Payment and subscription terms will apply when billing is enabled; until then, trial/active/dull states are tracked for testing.`
                : `Al crear una tarjeta de negocio te comprometes a no usar Card-Social para promover apuestas ilegales, contenido sexual explícito, discurso de odio, acoso o estafas. Las palabras clave y el contenido visible deben cumplir estas reglas. Card-Social puede retirar o restringir tarjetas que incumplan. Los términos de pago y suscripción aplicarán cuando se active la facturación; hasta entonces, los estados prueba/activa/dull son de seguimiento y pruebas.`}
            </Text>
          </ScrollView>
          <TouchableOpacity
            style={[styles.kycRow, { borderColor: border }]}
            onPress={() => setBusinessTermsAccepted(!businessTermsAccepted)}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons
              name={businessTermsAccepted ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={24}
              color={border}
            />
            <Text style={[styles.kycText, { color: text }]}>
              {tr(
                'He leído y acepto los términos y la política de contenido de la tarjeta de negocio.',
                'I have read and accept the business card terms and content policy.',
              )}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtnOuter, { opacity: submitting || loadingExistingCard ? 0.6 : 1 }]}
          onPress={() => void handleCreate()}
          disabled={submitting || loadingExistingCard}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[...shell.luxuryCtaGradient]}
            locations={[0, 0.18, 0.45, 0.52, 0.75, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.primaryBtnGradient}
          >
            {submitting ? (
              <ActivityIndicator color={shell.emptyCtaText} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: shell.emptyCtaText }]}>
                {editingBId ? tr('Guardar cambios', 'Save changes') : tr('Crear tarjeta', 'Create card')}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {editingBId ? (
          <View style={[styles.cardBlock, { backgroundColor: card, borderColor: border, marginTop: 20 }]}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.label, { color: text }]}>{tr('Visibilidad en Social Market', 'Social Market visibility')}</Text>
                <Text style={[styles.sub, { color: sub, marginTop: 4 }]}>
                  {licenseActive
                    ? tr('Licencia anual activa (simulación).', 'Annual license active (simulation).')
                    : tr('Requiere licencia activa para publicar.', 'Active license required to publish.')}
                </Text>
              </View>
              <Switch value={marketVisible} onValueChange={(v) => void onToggleMarket(v)} disabled={!licenseActive} />
            </View>

            {!licenseActive ? (
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: border, opacity: activatingLicense ? 0.6 : 1 }]}
                onPress={() => void handleDemoLicense()}
                disabled={activatingLicense}
              >
                <Text style={[styles.secondaryBtnText, { color: text }]}>
                  {tr('Simular licencia anual (desarrollo)', 'Simulate annual license (dev)')}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: '#8B6914', opacity: simulatingDull ? 0.6 : 1, marginTop: 10 }]}
              onPress={() => void handleSimulateDull()}
              disabled={simulatingDull}
            >
              <Text style={[styles.secondaryBtnText, { color: text }]}>
                {tr('Simular estado Dull (desarrollo)', 'Simulate Dull state (dev)')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>

    <Modal
      visible={vaultSelectorVisible}
      transparent
      animationType="slide"
      onRequestClose={cancelVaultLinkSelector}
    >
      <View style={[styles.vaultModalOverlay, { backgroundColor: isNight ? 'rgba(0,0,0,0.58)' : 'rgba(7,33,54,0.38)' }]}>
        <View style={[styles.vaultSelectorModal, { backgroundColor: card, borderColor: border }]}>
          <View style={styles.vaultSelectorHeader}>
            <Text style={[styles.vaultSelectorTitle, { color: text }]}>
              {tr('Selecciona datos', 'Select data')}
            </Text>
            <View style={styles.vaultSelectorCounterWrap}>
              <Text
                style={[
                  styles.vaultSelectorCounter,
                  { color: tempVaultLinkIds.length >= MAX_BUSINESS_VAULT_DATA_SLOTS ? '#C44B55' : border },
                ]}
              >
                {tempVaultLinkIds.length} / {MAX_BUSINESS_VAULT_DATA_SLOTS}
              </Text>
            </View>
            <TouchableOpacity
              onPress={cancelVaultLinkSelector}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel={tr('Cerrar', 'Close')}
            >
              <MaterialCommunityIcons name="close" size={22} color={sub} />
            </TouchableOpacity>
          </View>

          {vaultSelectorLimitReached ? (
            <View
              style={[
                styles.vaultLimitBanner,
                {
                  backgroundColor: isNight ? 'rgba(196,75,85,0.16)' : '#FFF2F3',
                  borderColor: isNight ? 'rgba(229,164,168,0.35)' : '#E5A4A8',
                },
              ]}
            >
              <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#C44B55" />
              <Text style={styles.vaultLimitBannerText}>
                {tr(
                  `Máximo ${MAX_BUSINESS_VAULT_DATA_SLOTS} enlaces de bóveda`,
                  `Maximum ${MAX_BUSINESS_VAULT_DATA_SLOTS} vault links`,
                )}
              </Text>
            </View>
          ) : null}

          {links.length === 0 ? (
            <View style={styles.vaultSelectorEmpty}>
              <MaterialCommunityIcons name="database-off-outline" size={40} color={sub} />
              <Text style={[styles.vaultSelectorEmptyText, { color: sub }]}>
                {tr(
                  'Tu bóveda está vacía.\nAgrega datos primero en Bóveda.',
                  'Your Vault is empty.\nAdd data from Vault first.',
                )}
              </Text>
            </View>
          ) : (
            <FlatList
              data={links}
              keyExtractor={(item) => item.id}
              numColumns={3}
              bounces={false}
              overScrollMode="never"
              style={styles.vaultSelectorGrid}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = tempVaultLinkIds.includes(item.id);
                const tileBorder = isNight ? 'rgba(184,231,255,0.18)' : '#CFEFFF';
                const tileBg = isNight ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
                return (
                  <TouchableOpacity
                    style={[
                      styles.vaultTile,
                      { borderColor: tileBorder, backgroundColor: tileBg },
                      isSelected && [styles.vaultTileSelected, { backgroundColor: isNight ? 'rgba(197,160,101,0.14)' : '#FFFBF0' }],
                    ]}
                    onPress={() => toggleVaultLinkInSelector(item.id)}
                    activeOpacity={0.75}
                  >
                    {isSelected ? (
                      <View style={styles.vaultTileCheck}>
                        <MaterialCommunityIcons name="check-circle" size={17} color="#C5A065" />
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.vaultTileIconCircle,
                        { backgroundColor: isNight ? 'rgba(255,255,255,0.08)' : '#EAF7FF' },
                      ]}
                    >
                      {renderVaultLinkTileIcon(item, 26, iconVaultById, vaultTileIconColor)}
                    </View>
                    <Text style={[styles.vaultTileTitle, { color: text }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={[styles.vaultTileType, { color: sub }]} numberOfLines={1}>
                      {item.type}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <View style={[styles.vaultModalActions, { paddingBottom: modalFooterBottomPad }]}>
            <TouchableOpacity
              style={[styles.vaultGhostBtn, { backgroundColor: inputBg, borderColor: border }]}
              onPress={cancelVaultLinkSelector}
            >
              <Text style={[styles.vaultGhostBtnText, { color: text }]}>{tr('Cancelar', 'Cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.vaultConfirmBtn, { backgroundColor: border }]}
              onPress={confirmVaultLinkSelector}
            >
              <Text style={styles.vaultConfirmBtnText}>
                {tr('Confirmar', 'Confirm')} ({tempVaultLinkIds.length})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    <Modal
      visible={themesPickerVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setThemesPickerVisible(false)}
    >
      <TouchableWithoutFeedback onPress={() => setThemesPickerVisible(false)}>
        <View style={styles.themesPopupOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.themesPopupBox, { backgroundColor: card, borderColor: border }]}>
              <View style={[styles.bizThemeModalHeader, { borderBottomColor: border }]}>
                <Text style={[styles.vaultSelectorTitle, { color: text, flex: 1 }]}>
                  {tr('Temas de Tarjeta', 'Card Themes')}
                </Text>
                <TouchableOpacity
                  onPress={() => setThemesPickerVisible(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityLabel={tr('Cerrar', 'Close')}
                >
                  <MaterialCommunityIcons name="close" size={22} color={sub} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={{ maxHeight: 440 }}
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  if (w > 0) {
                    setBizThemesModalContentW((prev) => (Math.abs((prev ?? 0) - w) > 0.5 ? w : prev));
                  }
                }}
              >
                {(['fresh', 'moderno', 'luxury'] as ThemeTier[]).map((tier) => {
                  const meta = TIER_META[tier];
                  const tierThemes = getThemesByTier(tier);
                  return (
                    <View key={tier} style={styles.bizThemesTierSection}>
                      <View style={styles.bizThemesTierHeader}>
                        <Text style={styles.bizThemesTierEmoji}>{meta.emoji}</Text>
                        <Text style={[styles.bizThemesTierLabel, { color: text }]}>
                          {language === 'en' || language === 'de' ? meta.label[1] : meta.label[0]}
                        </Text>
                        <View
                          style={[
                            styles.bizThemesTierLine,
                            { backgroundColor: tier === 'luxury' ? '#D4AF37' : border },
                          ]}
                        />
                      </View>
                      <View style={[styles.bizThemesTierGrid, { gap: THEME_LOCKER_TILE_GAP }]}>
                        {tierThemes.map((t) => (
                          <ThemeLockerThemeTile
                            key={t.id}
                            theme={t}
                            isActive={businessThemeId === t.id}
                            isUnlocked={isChestThemeUnlocked(t)}
                            tileWidth={bizThemesTileWidth}
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
                              setBusinessThemeId(t.id);
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
                style={[styles.vaultConfirmBtn, { backgroundColor: border, marginTop: 12 }]}
                onPress={() => setThemesPickerVisible(false)}
              >
                <Text style={styles.vaultConfirmBtnText}>{tr('Aceptar', 'Accept')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 48 },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  heroCloseBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', marginTop: 10 },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  subInline: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  cardBlock: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  bizFactoryActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  bizFactoryChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 52,
    paddingHorizontal: 6,
    position: 'relative',
  },
  bizFactoryChipText: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  themePickedHint: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
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
  bizThemeModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bizThemesTierSection: {
    marginBottom: 16,
  },
  bizThemesTierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  bizThemesTierEmoji: {
    fontSize: 18,
  },
  bizThemesTierLabel: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  bizThemesTierLine: {
    flex: 1,
    height: 1,
    marginLeft: 8,
  },
  bizThemesTierGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignContent: 'flex-start',
  },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
  },
  previewWrap: {
    position: 'relative',
    borderRadius: 14,
    overflow: 'hidden',
  },
  previewSurface: {
    overflow: 'hidden',
  },
  previewInner: {
    padding: 14,
  },
  previewDullOuter: {
    opacity: 0.92,
  },
  previewDullInner: {
    opacity: 0.55,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  previewAvatarPh: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  previewTextCol: {
    flex: 1,
    minWidth: 0,
  },
  previewBiz: {
    fontSize: 16,
    fontWeight: '800',
  },
  previewOwner: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  previewQr: {
    width: 64,
    height: 64,
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dullOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,20,40,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  dullOverlayText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
  },
  statusLine: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 8,
  },
  logoThumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  logoThumbPh: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  logoActions: {
    flex: 1,
    gap: 8,
  },
  secondaryBtnSm: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryBtnSmText: {
    fontWeight: '700',
    fontSize: 13,
  },
  clearLogoBtn: {
    paddingVertical: 4,
  },
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  locBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  addressSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addressInput: {
    flex: 1,
    marginBottom: 0,
  },
  searchAddrBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  geocodeListWrap: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  geocodeListTitle: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  geocodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  geocodeRowText: {
    flex: 1,
    minWidth: 0,
  },
  geocodePrimary: {
    fontSize: 14,
    fontWeight: '600',
  },
  geocodeSecondary: {
    fontSize: 11,
    marginTop: 3,
    fontWeight: '500',
  },
  orDivider: {
    textAlign: 'center',
    marginVertical: 14,
    fontSize: 13,
    fontWeight: '600',
  },
  resolvedBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  coords: {
    fontSize: 12,
    fontWeight: '700',
  },
  resolvedLabel: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  profileNameChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  profileNameChipText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  profileNameHint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
  },
  vaultChipBadge: {
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
  vaultChipBadgeText: {
    color: '#0A2540',
    fontSize: 10,
    fontWeight: '800',
  },
  vaultEmptyHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
  },
  vaultModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  vaultSelectorModal: {
    width: '100%',
    maxHeight: '88%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  vaultSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  vaultSelectorTitle: {
    fontSize: 17,
    fontWeight: '800',
    flexShrink: 1,
  },
  vaultSelectorCounterWrap: {
    flex: 1,
    alignItems: 'flex-end',
    marginRight: 4,
  },
  vaultSelectorCounter: {
    fontSize: 14,
    fontWeight: '800',
  },
  vaultLimitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    marginBottom: 10,
  },
  vaultLimitBannerText: {
    flex: 1,
    color: '#C44B55',
    fontSize: 12,
    fontWeight: '700',
  },
  vaultSelectorEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  vaultSelectorEmptyText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
  },
  vaultSelectorGrid: {
    maxHeight: 360,
    marginBottom: 8,
  },
  vaultTile: {
    flex: 1,
    margin: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    position: 'relative',
    minHeight: 90,
  },
  vaultTileSelected: {
    borderColor: '#C5A065',
    borderWidth: 2,
  },
  vaultTileCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  vaultTileIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  vaultTileTitle: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 2,
  },
  vaultTileType: {
    fontSize: 10,
    textAlign: 'center',
  },
  vaultModalActions: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  vaultGhostBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultGhostBtnText: {
    fontWeight: '700',
    fontSize: 14,
  },
  vaultConfirmBtn: {
    flex: 1,
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultConfirmBtnText: {
    color: '#0A1A2F',
    fontWeight: '800',
    fontSize: 14,
  },
  termsBox: {
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  termsText: {
    fontSize: 12,
    lineHeight: 18,
  },
  kycRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  kycText: { flex: 1, fontSize: 14, lineHeight: 20, marginLeft: 10 },
  primaryBtnOuter: {
    marginTop: 18,
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryBtnGradient: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryBtnText: { fontWeight: '800', fontSize: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  secondaryBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryBtnText: { fontWeight: '700', fontSize: 14 },
});
