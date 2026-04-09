import { BusinessCardKeywordTags } from '@/components/BusinessCardKeywordTags';
import { ThemedSharedCardSurface } from '@/components/ThemedSharedCardSurface';
import { CARD_THEMES as CHEST_THEMES, getThemeById, TIER_META, type CardTheme as ChestCardTheme, type ThemeTier } from '@/constants/themeChest';
import { getActiveUserId } from '@/services/authSession';
import { generatePermanentBusinessLink } from '@/services/brandedQrService';
import {
    createBusinessCard,
    MAX_BUSINESS_VAULT_DATA_SLOTS,
    updateBusinessCard,
    updateBusinessCardMarketVisibility,
    updateBusinessCardSubscriptionStatus,
} from '@/services/businessCardService';
import { validateBusinessKeywordList } from '@/services/businessKeywordValidation';
import {
    activateOrRenewBusinessLicense,
    hasActiveBusinessLicense,
} from '@/services/businessLicenseService';
import { db } from '@/services/firebaseConfig';
import { getUserIconVaultMap, type IconVaultEntry } from '@/services/iconVaultService';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { ModerationRejectedError, uploadFileWithModeration } from '@/services/moderationApi';
import { upsertSmartCardInDb, type PublicCardSlotPayload } from '@/services/qrApi';
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
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
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
    View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Toast from 'react-native-toast-message';
import { sanitizeMaterialCommunityIconName } from '../components/iconNameValidation';
import palette from '../theme';

const DEFAULT_BIZ_THEME_ID = 'deep_teal';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Sync BusinessCard data → MongoDB smart_cards so /contacts/received finds it.
 * Phase 1: essential data (no Firestore reads, guaranteed).
 * Phase 2: vault slots enrichment (best-effort, can fail silently).
 */
async function syncBusinessCardToMongo(params: {
  ownerUid: string;
  cardId: string;
  businessName: string;
  ownerName: string;
  themeId: string;
  businessLogo: string;
  vaultLinkIds: string[];
}) {
  const { ownerUid, cardId, businessName, ownerName, themeId, businessLogo, vaultLinkIds } = params;

  const basePayload = {
    cardId,
    name: businessName,
    layout: 'vertical' as const,
    themeId: themeId || 'deep_teal',
    ownerDisplayName: ownerName || undefined,
    ownerNickname: ownerName || undefined,
    ownerPhotoUrl: businessLogo || null,
    itemIds: [...vaultLinkIds],
    holdersCount: 0,
    ratingAvg: 5,
    totalRatings: 0,
    enableParallax: false,
    isFavorite: false,
  };

  // Phase 1 — essential data (no vault reads needed)
  try {
    await upsertSmartCardInDb({ ownerUid, card: basePayload });
  } catch (e) {
    console.log('[BusinessCard] syncToMongo essentials FAILED', e);
    return;
  }

  // Phase 2 — enrich with public card slots (vault + icons)
  try {
    const vaultSnap = await getDocs(collection(db, 'users', ownerUid, 'links'));
    const vaultAll = vaultSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
    const iconMap: Record<string, IconVaultEntry> = await getUserIconVaultMap(ownerUid)
      .then((m) => Object.fromEntries(m))
      .catch(() => ({} as Record<string, IconVaultEntry>));
    const slots: PublicCardSlotPayload[] = vaultLinkIds.slice(0, 24).flatMap((lid) => {
      const it = vaultAll.find((v) => v.id === lid);
      if (!it) return [];
      const iconEntry = (it.iconVaultId as string | undefined) && iconMap[it.iconVaultId as string];
      const glyphName = iconEntry?.materialIconName
        ? sanitizeMaterialCommunityIconName(iconEntry.materialIconName)
        : (it.iconName as string | undefined)
          ? sanitizeMaterialCommunityIconName(it.iconName as string)
          : undefined;
      const iconUrl = /^https?:\/\//i.test(String(it.icon || '')) ? String(it.icon) : undefined;
      return [{
        itemId: String(it.id),
        type: String(it.type || 'link'),
        label: String(it.title || ''),
        value: String(it.value || ''),
        ...(glyphName ? { iconName: glyphName } : {}),
        ...(iconUrl ? { icon: iconUrl } : {}),
      } as PublicCardSlotPayload];
    });
    if (slots.length > 0) {
      await upsertSmartCardInDb({ ownerUid, card: { ...basePayload, publicCardSlots: slots } });
    }
  } catch (e) {
    console.log('[BusinessCard] syncToMongo slots FAILED (essentials already saved)', e);
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

async function optimizePhoto(uri: string): Promise<string> {
  const initialSize = await getFileSize(uri);
  if (initialSize <= MAX_LOGO_BYTES) return uri;
  const attempts = [
    { width: 1024, compress: 0.82 },
    { width: 800, compress: 0.72 },
    { width: 512, compress: 0.62 },
  ];
  let best = uri;
  for (const a of attempts) {
    const r = await ImageManipulator.manipulateAsync(
      best,
      [{ resize: { width: a.width } }],
      { compress: a.compress, format: ImageManipulator.SaveFormat.JPEG },
    );
    const size = await getFileSize(r.uri);
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

async function cropImageToSquare(uri: string): Promise<string> {
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
  });
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

export default function CreateBusinessCardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ cardId?: string }>();
  const paramCardId = typeof params.cardId === 'string' ? params.cardId : params.cardId?.[0] || '';
  const { language } = useLanguage();
  const tr = (es: string, en: string) => (language === 'en' ? en : es);
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const shell = palette[isNight ? 'dark' : 'light'];
  const { unlockedIds, refreshThemes } = useActiveTheme();
  const isChestThemeUnlocked = (t: ChestCardTheme) => !t.locked || unlockedIds.has(t.id);

  const [links, setLinks] = useState<VaultLinkRow[]>([]);
  const [iconVaultById, setIconVaultById] = useState<Record<string, IconVaultEntry>>({});
  const [selectedVaultLinkIds, setSelectedVaultLinkIds] = useState<Set<string>>(new Set());
  const [vaultSelectorVisible, setVaultSelectorVisible] = useState(false);
  const [tempVaultLinkIds, setTempVaultLinkIds] = useState<string[]>([]);
  const [vaultSelectorLimitReached, setVaultSelectorLimitReached] = useState(false);
  const [profileFullName, setProfileFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [addressSearchQuery, setAddressSearchQuery] = useState('');
  const [geocodeCandidates, setGeocodeCandidates] = useState<Location.LocationGeocodedLocation[]>([]);
  const [geocodeLabels, setGeocodeLabels] = useState<string[]>([]);
  const [resolvedAddressLabel, setResolvedAddressLabel] = useState('');
  const [geocodingInProgress, setGeocodingInProgress] = useState(false);
  const [keywordTags, setKeywordTags] = useState<string[]>([]);
  const [businessTermsAccepted, setBusinessTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdCardId, setCreatedCardId] = useState<string | null>(null);
  const [ownerUidState, setOwnerUidState] = useState<string | null>(null);
  const [marketVisible, setMarketVisible] = useState(false);
  const [licenseActive, setLicenseActive] = useState(false);
  const [activatingLicense, setActivatingLicense] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionUi>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [pendingSquareLogoUri, setPendingSquareLogoUri] = useState<string | null>(null);
  const [uploadedLogoUrl, setUploadedLogoUrl] = useState<string | null>(null);
  const [pickingLogo, setPickingLogo] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationCoordSource, setLocationCoordSource] = useState<'device_gps' | 'geocode_forward' | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [simulatingDull, setSimulatingDull] = useState(false);
  const [businessThemeId, setBusinessThemeId] = useState<string>(DEFAULT_BIZ_THEME_ID);
  const [themesPickerVisible, setThemesPickerVisible] = useState(false);
  const [loadingExistingCard, setLoadingExistingCard] = useState(false);

  const loadLinks = useCallback(async () => {
    const uid = await getActiveUserId();
    if (!uid) return;
    setOwnerUidState(uid);
    try {
      const vaultMap = await getUserIconVaultMap(uid);
      setIconVaultById(Object.fromEntries(vaultMap));

      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) {
        const u = userSnap.data() as {
          photoUrl?: string;
          fullName?: string;
          firstName?: string;
          lastName?: string;
        };
        setProfilePhotoUrl(toRenderableImageUri(u.photoUrl));
        const fn = u.firstName != null ? String(u.firstName).trim() : '';
        const ln = u.lastName != null ? String(u.lastName).trim() : '';
        const full = String(u.fullName || '').trim() || [fn, ln].filter(Boolean).join(' ').trim();
        setProfileFullName(full);
      } else {
        setProfileFullName('');
      }
      const snap = await getDocs(collection(db, 'users', uid, 'links'));
      setLinks(
        snap.docs.map((d) => {
          const row = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            title: row.title != null ? String(row.title) : d.id,
            type: row.type != null ? String(row.type) : '',
            iconName: row.iconName != null ? String(row.iconName) : 'link-variant',
            icon: row.icon != null ? String(row.icon) : undefined,
            iconVaultId: row.iconVaultId != null ? String(row.iconVaultId) : undefined,
          };
        }),
      );
    } catch {
      setLinks([]);
      setIconVaultById({});
      setProfileFullName('');
    }
  }, []);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const refreshCreatedCardMeta = useCallback(async () => {
    if (!createdCardId) return;
    const uid = await getActiveUserId();
    if (!uid) return;
    try {
      const snap = await getDoc(doc(db, 'businessCards', createdCardId));
      if (snap.exists()) {
        const d = snap.data() as { isPublishedToMarket?: boolean; subscriptionStatus?: string };
        setMarketVisible(Boolean(d.isPublishedToMarket));
        const st = d.subscriptionStatus;
        if (st === 'trial' || st === 'active' || st === 'dull') {
          setSubscriptionStatus(st);
        }
      }
    } catch {
      /* ignore */
    }
    setLicenseActive(await hasActiveBusinessLicense(uid, createdCardId));
  }, [createdCardId]);

  useEffect(() => {
    void refreshCreatedCardMeta();
  }, [refreshCreatedCardMeta]);

  useEffect(() => {
    if (!paramCardId) return;
    let cancelled = false;
    setLoadingExistingCard(true);
    void (async () => {
      const uid = await getActiveUserId();
      if (!uid) {
        setLoadingExistingCard(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'businessCards', paramCardId));
        if (cancelled || !snap.exists()) return;
        const d = snap.data() as Record<string, unknown>;
        if (String(d.ownerUid) !== uid) {
          Alert.alert(tr('Acceso', 'Access'), tr('Esta tarjeta no es tuya.', 'This card is not yours.'));
          return;
        }
        if (cancelled) return;
        setCreatedCardId(paramCardId);
        setOwnerUidState(uid);
        setBusinessName(String(d.businessName ?? ''));
        setOwnerName(String(d.ownerName ?? ''));
        setKeywordTags(Array.isArray(d.keywords) ? (d.keywords as string[]).map(String) : []);
        setBusinessThemeId(String(d.themeId ?? DEFAULT_BIZ_THEME_ID).trim() || DEFAULT_BIZ_THEME_ID);
      const vids = Array.isArray(d.vaultLinkIds) ? (d.vaultLinkIds as unknown[]).map(String) : [];
      setSelectedVaultLinkIds(new Set(vids.slice(0, MAX_BUSINESS_VAULT_DATA_SLOTS)));
        const lat = d.latitude;
        const lng = d.longitude;
        setLatitude(typeof lat === 'number' ? lat : null);
        setLongitude(typeof lng === 'number' ? lng : null);
        setResolvedAddressLabel(String(d.physicalAddress ?? ''));
        const ls = d.locationSource;
        setLocationCoordSource(ls === 'device_gps' || ls === 'geocode_forward' ? ls : null);
        const logo = d.businessLogo;
        if (typeof logo === 'string' && logo.trim()) {
          setUploadedLogoUrl(logo.trim());
        } else {
          setUploadedLogoUrl(null);
        }
        setPendingSquareLogoUri(null);
        setBusinessTermsAccepted(Boolean(d.businessTermsAccepted));
        const st = d.subscriptionStatus;
        if (st === 'trial' || st === 'active' || st === 'dull') {
          setSubscriptionStatus(st);
        } else {
          setSubscriptionStatus(null);
        }
        // Auto-migrate: denormalize vault facets if missing
        if (vids.length > 0 && !Array.isArray(d.marketFacets)) {
          void updateBusinessCard(uid, paramCardId, { vaultLinkIds: vids }).catch(() => {});
        }
      } finally {
        if (!cancelled) setLoadingExistingCard(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paramCardId]);

  const editingCardId = paramCardId || createdCardId;

  const openVaultLinkSelector = () => {
    const valid = [...selectedVaultLinkIds].filter((id) => links.some((l) => l.id === id));
    setTempVaultLinkIds(valid);
    setVaultSelectorLimitReached(false);
    setVaultSelectorVisible(true);
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
    setOwnerName(n);
  };

  const displayLogoUri = useMemo(() => {
    return pendingSquareLogoUri || uploadedLogoUrl || profilePhotoUrl || null;
  }, [pendingSquareLogoUri, uploadedLogoUrl, profilePhotoUrl]);

  const qrPayload = useMemo(() => {
    const uid = ownerUidState || 'owner';
    if (createdCardId) {
      return generatePermanentBusinessLink(createdCardId, uid);
    }
    return `card-social://business/preview?owner=${encodeURIComponent(uid)}&mode=draft`;
  }, [createdCardId, ownerUidState]);

  const isDullPreview = subscriptionStatus === 'dull';

  const pickBusinessLogo = async () => {
    setPickingLogo(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          tr('Permiso', 'Permission'),
          tr('Necesitamos acceso a fotos para elegir el logo.', 'We need photo access to pick a logo.'),
        );
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const square = await cropImageToSquare(res.assets[0].uri);
      setPendingSquareLogoUri(square);
      setUploadedLogoUrl(null);
    } catch (e: any) {
      Alert.alert(tr('Error', 'Error'), e?.message || tr('No se pudo procesar la imagen.', 'Could not process image.'));
    } finally {
      setPickingLogo(false);
    }
  };

  const clearCustomLogo = () => {
    setPendingSquareLogoUri(null);
    setUploadedLogoUrl(null);
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
        setResolvedAddressLabel(formatReverseAddress(rev[0]) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      } catch {
        setResolvedAddressLabel(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
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
    setResolvedAddressLabel(geocodeLabels[index] || `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}`);
    setGeocodeCandidates([]);
    setGeocodeLabels([]);
  };

  const resolveLogoForSave = async (uid: string): Promise<string> => {
    if (pendingSquareLogoUri) {
      const optimized = await optimizePhoto(pendingSquareLogoUri);
      const result = await uploadFileWithModeration({
        fileUri: optimized,
        ownerUid: uid,
        label: 'business_logo',
        fileName: `business_logo_${uid}_${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      });
      const url = toRenderableImageUri(result.publicUrl);
      if (url) {
        setUploadedLogoUrl(url);
        setPendingSquareLogoUri(null);
        return url;
      }
    }
    return uploadedLogoUrl || profilePhotoUrl || '';
  };

  const handleCreate = async () => {
    const uid = await getActiveUserId();
    if (!uid) {
      Alert.alert(tr('Sesión', 'Session'), tr('Inicia sesión de nuevo.', 'Please sign in again.'));
      return;
    }
    if (!businessName.trim() || !ownerName.trim()) {
      Alert.alert(
        tr('Datos incompletos', 'Missing fields'),
        tr('Indica nombre del negocio y tu nombre.', 'Enter business name and your name.'),
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
      let businessLogo = '';
      try {
        businessLogo = await resolveLogoForSave(uid);
      } catch (e: any) {
        if (e instanceof ModerationRejectedError) {
          Alert.alert(tr('Imagen rechazada', 'Image rejected'), tr('El logo no pasó la moderación.', 'Logo did not pass moderation.'));
          setSubmitting(false);
          return;
        }
        const msg = String(e?.message || '');
        if (msg.includes('EXPO_PUBLIC_MODERATION')) {
          businessLogo = profilePhotoUrl || '';
          if (!businessLogo) {
            Alert.alert(
              tr('Subida no disponible', 'Upload unavailable'),
              tr(
                'Configura el servicio de moderación o usa foto de perfil.',
                'Configure the moderation service or use profile photo.',
              ),
            );
            setSubmitting(false);
            return;
          }
        } else {
          throw e;
        }
      }

      const kwTags = kw.ok ? kw.tags : [];

      if (editingCardId) {
        const res = await updateBusinessCard(uid, editingCardId, {
          businessName: businessName.trim(),
          ownerName: ownerName.trim(),
          vaultLinkIds: [...selectedVaultLinkIds],
          themeId: businessThemeId,
          keywords: kwTags,
          businessLogo,
          physicalAddress: resolvedAddressLabel.trim(),
          latitude,
          longitude,
          locationSource: locationCoordSource || 'device_gps',
        });
        if (res.success) {
          void syncBusinessCardToMongo({
            ownerUid: uid,
            cardId: editingCardId!,
            businessName: businessName.trim(),
            ownerName: ownerName.trim(),
            themeId: businessThemeId || 'deep_teal',
            businessLogo,
            vaultLinkIds: [...selectedVaultLinkIds],
          });
          Alert.alert(tr('Listo', 'Done'), tr('Cambios guardados.', 'Changes saved.'), [
            {
              text: tr('OK', 'OK'),
              onPress: () => router.replace('/(tabs)/cards' as any),
            },
          ]);
          void refreshCreatedCardMeta();
        } else {
          Alert.alert(tr('Error', 'Error'), res.message);
        }
      } else {
        const res = await createBusinessCard({
          ownerUid: uid,
          vaultLinkIds: [...selectedVaultLinkIds],
          businessName: businessName.trim(),
          ownerName: ownerName.trim(),
          physicalAddress: resolvedAddressLabel.trim(),
          latitude,
          longitude,
          locationSource: locationCoordSource || 'device_gps',
          keywords: kwTags,
          businessLogo,
          kycDocumentUrl: '',
          kycTermsAccepted: businessTermsAccepted,
          businessTermsAccepted,
          themeId: businessThemeId,
        });
        if (res.success && res.cardId) {
          setCreatedCardId(res.cardId);
          setOwnerUidState(uid);
          setMarketVisible(false);
          setSubscriptionStatus('trial');
          void syncBusinessCardToMongo({
            ownerUid: uid,
            cardId: res.cardId!,
            businessName: businessName.trim(),
            ownerName: ownerName.trim(),
            themeId: businessThemeId || 'deep_teal',
            businessLogo,
            vaultLinkIds: [...selectedVaultLinkIds],
          });
          Alert.alert(tr('Listo', 'Done'), res.message, [
            {
              text: tr('OK', 'OK'),
              onPress: () => router.replace('/(tabs)/cards' as any),
            },
          ]);
          void refreshCreatedCardMeta();
        } else {
          Alert.alert(tr('Error', 'Error'), res.message);
        }
      }
    } catch (e: any) {
      Alert.alert(tr('Error', 'Error'), e?.message || '');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLicense = async () => {
    const uid = await getActiveUserId();
    if (!uid || !createdCardId) return;
    setActivatingLicense(true);
    try {
      const lic = await activateOrRenewBusinessLicense({
        userId: uid,
        cardId: createdCardId,
        annualPriceUsd: 99,
        cashbackCreditsGranted: 0,
      });
      const exp = Date.parse(String(lic.expiresAt || ''));
      await updateBusinessCardSubscriptionStatus(uid, createdCardId, 'active', {
        subscriptionExpiresAt: Number.isFinite(exp) ? new Date(exp) : null,
      });
      setSubscriptionStatus('active');
      setLicenseActive(await hasActiveBusinessLicense(uid, createdCardId));
      Alert.alert(
        tr('Licencia activa', 'License active'),
        tr('Estado en Firestore: active. Puedes publicar en Social Market.', 'Firestore status: active. You can publish to Social Market.'),
      );
    } finally {
      setActivatingLicense(false);
    }
  };

  const handleSimulateDull = async () => {
    const uid = await getActiveUserId();
    if (!uid || !createdCardId) return;
    setSimulatingDull(true);
    try {
      const r = await updateBusinessCardSubscriptionStatus(uid, createdCardId, 'dull');
      if (r.success) {
        setSubscriptionStatus('dull');
        Alert.alert(
          tr('Modo Dull', 'Dull mode'),
          tr('La vista previa muestra la tarjeta atenuada.', 'Preview shows the dimmed card state.'),
        );
      } else {
        Alert.alert(tr('Error', 'Error'), r.message);
      }
    } finally {
      setSimulatingDull(false);
    }
  };

  const onToggleMarket = async (value: boolean) => {
    const uid = await getActiveUserId();
    if (!uid || !createdCardId) return;
    const licensed = await hasActiveBusinessLicense(uid, createdCardId);
    if (!licensed) {
      Alert.alert(
        tr('Licencia requerida', 'License required'),
        tr('Activa la licencia (simulación) antes de publicar.', 'Activate license (simulation) before publishing.'),
      );
      return;
    }
    const r = await updateBusinessCardMarketVisibility(uid, createdCardId, value);
    if (r.success) {
      setMarketVisible(value);
    } else {
      Alert.alert(tr('Error', 'Error'), r.message);
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
          <MaterialCommunityIcons name="card-account-details-outline" size={40} color={border} />
          <Text style={[styles.title, { color: text }]}>{tr('Tarjeta de negocio', 'Business card')}</Text>
          <Text style={[styles.sub, { color: sub }]}>
            {tr(
              'Email, teléfono, enlaces y mapa salen de tu Bóveda. Aquí solo identidad de negocio, logo, ubicación GPS y palabras clave.',
              'Email, phone, links and maps come from your Vault. Here: business identity, logo, GPS location and keywords only.',
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
                    <ExpoImage source={{ uri: displayLogoUri }} style={styles.previewAvatar} cachePolicy="disk" />
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
                      {businessName.trim() || tr('Nombre del negocio', 'Business name')}
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
                      {ownerName.trim() || tr('Tu nombre', 'Your name')}
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
          <Text style={[styles.label, { color: text }]}>{tr('Nombre del negocio', 'Business name')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: text, borderColor: border }]}
            value={businessName}
            onChangeText={setBusinessName}
            placeholder={tr('Mi empresa', 'My company')}
            placeholderTextColor={sub}
          />

          <Text style={[styles.label, { color: text, marginTop: 12 }]}>{tr('Tu nombre', 'Your name')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: text, borderColor: border }]}
            value={ownerName}
            onChangeText={setOwnerName}
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
              <ExpoImage source={{ uri: displayLogoUri }} style={styles.logoThumb} cachePolicy="disk" />
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
              {(pendingSquareLogoUri || uploadedLogoUrl) && (
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
          <Text style={[styles.label, { color: text }]}>{tr('Palabras clave', 'Keywords')}</Text>
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
              {language === 'en'
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
                {editingCardId ? tr('Guardar cambios', 'Save changes') : tr('Crear tarjeta', 'Create card')}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {editingCardId ? (
          <View style={[styles.cardBlock, { backgroundColor: card, borderColor: border, marginTop: 20 }]}>
            <Text style={[styles.label, { color: sub }]}>UUID</Text>
            <Text selectable style={[styles.uuid, { color: text }]}>
              {editingCardId}
            </Text>

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

          <View style={styles.vaultModalActions}>
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
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {(['fresh', 'moderno', 'luxury'] as ThemeTier[]).map((tier) => {
                  const meta = TIER_META[tier];
                  const tierThemes = CHEST_THEMES.filter((t) => t.tier === tier);
                  return (
                    <View key={tier} style={{ marginBottom: 12 }}>
                      <Text style={[styles.themeTierLabel, { color: text }]}>
                        {meta.emoji} {language === 'en' ? meta.label[1] : meta.label[0]}
                      </Text>
                      <View style={styles.themesPlaceholderGrid}>
                        {tierThemes.map((t) => (
                          <TouchableOpacity
                            key={t.id}
                            style={[
                              styles.themePlaceholderTile,
                              businessThemeId === t.id && { borderWidth: 3, borderColor: '#C5A065', borderRadius: 14 },
                              !isChestThemeUnlocked(t) ? { opacity: 0.5 } : null,
                            ]}
                            onPress={() => {
                              if (!isChestThemeUnlocked(t)) {
                                Toast.show({
                                  type: 'info',
                                  text1: tr('Tema bloqueado', 'Theme locked'),
                                  text2: tr(
                                    'Desbloquéalo en Card-Studio (boutique).',
                                    'Unlock it in Card-Studio (boutique).',
                                  ),
                                  position: 'bottom',
                                  visibilityTime: 2800,
                                });
                                return;
                              }
                              setBusinessThemeId(t.id);
                              void Haptics.selectionAsync();
                            }}
                            activeOpacity={0.75}
                          >
                            <LinearGradient
                              colors={t.background}
                              style={[
                                styles.themePlaceholderSwatch,
                                { borderColor: t.border.color, borderWidth: t.border.width, borderRadius: 12 },
                              ]}
                            />
                            <View style={styles.themePlaceholderIconRow}>
                              <MaterialCommunityIcons name={t.icon.name as any} size={18} color={t.icon.color} />
                              {t.locked && !unlockedIds.has(t.id) ? (
                                <MaterialCommunityIcons name="lock-outline" size={12} color={t.border.color} />
                              ) : null}
                            </View>
                            <Text style={[styles.themePlaceholderName, { color: t.title.color }]} numberOfLines={1}>
                              {t.name}
                            </Text>
                            {businessThemeId === t.id ? (
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
    textAlign: 'center',
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
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 8,
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
  uuid: { fontSize: 13, fontWeight: '600' },
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
