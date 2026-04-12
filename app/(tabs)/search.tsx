/**
 * Mercado Social / Social Market: búsqueda con sinónimos, contactos recibidos y tarjetas de negocio.
 */

import { normalizeMaterialIconName } from '@/app/components/iconNameValidation';
import { MyCardsPreviewModal, type MyCardsPayload } from '@/components/MyCards';
import ReceptorScreenModal from '@/components/ReceptorScreenModal';
import { SharedCardSkeletonList } from '@/components/SharedCardRowSkeleton';
import { type WireframeEditSlot } from '@/components/smartCard/IsolatedWireframeCard';
import { ThemedSharedCardSurface } from '@/components/ThemedSharedCardSurface';
import { MEDIA_PLACEHOLDER } from '@/constants/mediaPlaceholders';
import { adaptBusinessCardSearchResultToMyCardsPayload } from '@/services/adaptBusinessCardMarketPremium';
import { getActiveUserId } from '@/services/authSession';
import { hardLockCheck } from '@/services/biometricAuth';
import { ExportBusinessQR, generatePermanentBusinessLink } from '@/services/brandedQrService';
import { buildMirrorVaultItemsForContact } from '@/services/buildReceiverPreviewVaultItems';
import { hasActiveBusinessLicense } from '@/services/businessLicenseService';
import { myCardsPayloadFromQrPreview } from '@/services/incomingCardPreviewPayload';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { fetchPublicBusinessCardPreview, listCardSubscribers, listReceivedContacts, type CardSubscriberRow } from '@/services/qrApi';
import {
  mergeReceivedContactRows,
  receivedContactMergeKey,
} from '@/services/receivedContactsPresentationMerge';
import { inferMciIconFromContext, runSearchFacetQuickAction } from '@/services/searchFacetQuickAction';
import {
  isSearchLocationSessionActive,
  startSearchLocationSession,
  subscribeSearchLocationSession,
} from '@/services/searchLocationSession';
import { buildMarketCardSearchFacets, marketSearchStoryRingState } from '@/services/searchPhase2Logic';
import type { ReceivedContactForMarketSearch } from '@/services/searchService';
import { searchSocialMarket } from '@/services/searchService';
import {
  buildStoryLookupFromReceivedContacts,
  resolveSearchRowStoryState,
  storyChannelKey,
} from '@/services/storiesPhase1Logic';
import { getCardRowTheme } from '@/services/useActiveTheme';
import { BusinessCardSearchResult } from '@/types/businessCard';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import appPalette, { type AppShellTheme } from '../theme';

const CONTACT_META_STORAGE_KEY = 'contacts_meta_v2';
const GROUP_DEFAULT = 'Random';
/** Radio de negocios en millas (búsqueda con ubicación y modo orden por distancia). */
const MAX_MARKET_RADIUS_MILES = 20;

type ContactMetaLite = { group?: string; icons?: Array<{ name: string; url: string }> };

/**
 * Barra de búsqueda con texto en estado local: el padre no re-renderiza en cada tecla,
 * así el TextInput no pierde el foco ni se desmonta con el ListHeader del SectionList.
 */
const SocialMarketSearchBar = React.memo(function SocialMarketSearchBar({
  loading,
  shell,
  tr,
  onSubmitQuery,
  onClearResults,
}: {
  loading: boolean;
  shell: AppShellTheme;
  tr: (es: string, en: string) => string;
  onSubmitQuery: (trimmed: string) => void;
  onClearResults: () => void;
}) {
  const [localSearchText, setLocalSearchText] = useState('');

  const submit = useCallback(() => {
    const q = localSearchText.trim();
    if (!q) {
      Alert.alert(tr('Error', 'Error'), tr('Ingresa palabras clave para buscar', 'Enter keywords to search'));
      return;
    }
    onSubmitQuery(q);
  }, [localSearchText, onSubmitQuery, tr]);

  const clear = useCallback(() => {
    setLocalSearchText('');
    Keyboard.dismiss();
    onClearResults();
  }, [onClearResults]);

  return (
    <View style={[styles.searchRow, { backgroundColor: shell.surfaceMuted, borderColor: shell.border }]}>
      <MaterialCommunityIcons name="magnify" size={22} color={shell.textSecondary} style={styles.searchRowIcon} />
      <TextInput
        style={[styles.searchInputMinimal, { color: shell.textPrimary }]}
        placeholder={tr('Nails, Hair, Cosmetología…', 'Nails, hair, cosmetology…')}
        value={localSearchText}
        onChangeText={setLocalSearchText}
        onSubmitEditing={submit}
        placeholderTextColor={shell.textMuted}
        returnKeyType="search"
        blurOnSubmit={false}
      />
      {localSearchText.length > 0 ? (
        <TouchableOpacity
          onPress={clear}
          hitSlop={12}
          accessibilityLabel={tr('Limpiar búsqueda', 'Clear search')}
        >
          <MaterialCommunityIcons name="close-circle-outline" size={22} color={shell.textMuted} />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={[styles.goButton, { backgroundColor: shell.ctaPrimary }]}
        onPress={submit}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={tr('Buscar en el mercado', 'Search the market')}
      >
        <Text style={[styles.goButtonText, { color: shell.btnPrimaryText }]}>{tr('IR', 'GO')}</Text>
      </TouchableOpacity>
    </View>
  );
});

export default function SearchScreen() {
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const shell = appPalette[isDark ? 'dark' : 'light'];
  const { language } = useLanguage();
  const tr = useCallback((es: string, en: string) => (language === 'en' ? en : es), [language]);
  /** Última consulta enviada (IR / Intro); el campo de texto vive en SocialMarketSearchBar. */
  const [submittedQuery, setSubmittedQuery] = useState('');
  const searchQueryRef = useRef('');
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const [, setLocationSessionUiRev] = useState(0);
  const sessionWasActiveRef = useRef(false);
  const [sectionContacts, setSectionContacts] = useState<BusinessCardSearchResult[]>([]);
  const [sectionBusinesses, setSectionBusinesses] = useState<BusinessCardSearchResult[]>([]);
  /** Orden global Mercado: distancia (≤20 mi) o valoración. */
  const [marketSortMode, setMarketSortMode] = useState<'distance' | 'rating'>('distance');
  const [marketSortModalVisible, setMarketSortModalVisible] = useState(false);
  const [, setReceivedContactsForMarket] = useState<ReceivedContactForMarketSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<Record<string, boolean>>({});
  const rowPressScaleRef = useRef<Map<string, Animated.Value>>(new Map());
  const sectionListRef = useRef<SectionList<BusinessCardSearchResult>>(null);
  const searchScrollYRef = useRef(0);
  const savedSearchScrollYRef = useRef(0);

  /* Receptor modal state */
  const [receptorModalVisible, setReceptorModalVisible] = useState(false);
  const [receptorItem, setReceptorItem] = useState<BusinessCardSearchResult | null>(null);
  const [receptorSubscribers, setReceptorSubscribers] = useState<CardSubscriberRow[]>([]);
  const [receptorLoading, setReceptorLoading] = useState(false);

  const openReceptorModal = async (item: BusinessCardSearchResult) => {
    const cardId = item.receivedSourceCardId ?? '';
    const uid = item.card?.ownerUid ?? '';
    if (!uid || !cardId) return;
    setReceptorItem(item);
    setReceptorModalVisible(true);
    setReceptorLoading(true);
    try {
      const r = await listCardSubscribers({ ownerUid: uid, cardId });
      setReceptorSubscribers(r.subscribers);
    } catch {
      setReceptorSubscribers([]);
    } finally {
      setReceptorLoading(false);
    }
  };

  const restoreSearchListScroll = useCallback(() => {
    const y = savedSearchScrollYRef.current;
    const list = sectionListRef.current as unknown as
      | { scrollToOffset?: (o: { offset: number; animated?: boolean }) => void }
      | null;
    list?.scrollToOffset?.({ offset: Math.max(0, y), animated: false });
  }, []);

  const [receivedContactsLookupRows, setReceivedContactsLookupRows] = useState<ReceivedContactForMarketSearch[]>([]);
  const [receivedCardDetail, setReceivedCardDetail] = useState<BusinessCardSearchResult | null>(null);
  const [marketCardDetail, setMarketCardDetail] = useState<BusinessCardSearchResult | null>(null);
  /** Payload real obtenido de MongoDB (Single Source of Truth). */
  const [marketFetchedPayload, setMarketFetchedPayload] = useState<MyCardsPayload | null>(null);
  const [marketFetching, setMarketFetching] = useState(false);

  const [viewerUid, setViewerUid] = useState<string | null>(null);
  useEffect(() => { void getActiveUserId().then(setViewerUid); }, []);

  const storyLookupMaps = useMemo(
    () =>
      buildStoryLookupFromReceivedContacts(
        receivedContactsLookupRows.map((r) => ({
          uid: r.uid,
          cardId: r.cardId,
          channelMuted: r.channelMuted,
          storyState: r.storyState ?? 'none',
        }))
      ),
    [receivedContactsLookupRows]
  );

  const closeReceivedCardDetail = useCallback(() => {
    setReceivedCardDetail(null);
    requestAnimationFrame(restoreSearchListScroll);
  }, [restoreSearchListScroll]);

  const closeMarketCardDetail = useCallback(() => {
    setMarketCardDetail(null);
    setMarketFetchedPayload(null);
    requestAnimationFrame(restoreSearchListScroll);
  }, [restoreSearchListScroll]);

  const searchMirrorPreviewSlots = useMemo<WireframeEditSlot[]>(() => {
    if (!receivedCardDetail || receivedCardDetail.rowSource !== 'received_contact') {
      return [];
    }
    const d = receivedCardDetail;
    const items = buildMirrorVaultItemsForContact({
      itemIds: d.issuerPresentation?.itemIds,
      publicCardSlots: d.receivedPublicCardSlots,
      searchFacets: d.receivedContactFacets,
    });
    return items.map((item, index) => ({
      id: `search-rx-${item.id}-${index}`,
      index,
      item,
    }));
  }, [receivedCardDetail]);

  const searchReceivedPayload = useMemo<MyCardsPayload | null>(() => {
    if (!receivedCardDetail || receivedCardDetail.rowSource !== 'received_contact') return null;
    const d = receivedCardDetail;
    const isBusiness = d.card.type === 'business';
    const nickRaw = String(d.receivedIssuerNickname || 'user').trim() || 'user';
    const cardNm = String(d.receivedContactCardName || '').trim();
    const person = String(d.card.businessName || d.card.ownerName || '').trim();
    const occ = String(d.receivedOwnerOccupation || '').trim();
    // Business: subtitle = ownerName (no @). Personal: @nickname.
    const subtitle = isBusiness
      ? String(d.card.ownerName || occ || '').trim()
      : nickRaw.startsWith('@') ? nickRaw : `@${nickRaw}`;
    return {
      cardName: (cardNm || person || occ || tr('Tarjeta Social', 'Social Card')).trim(),
      subtitle,
      avatarUrl: d.card.businessLogo ?? null,
      themeId: d.issuerPresentation?.themeId || '',
      wallpaperUrl: d.issuerPresentation?.wallpaperUrl ?? undefined,
      layout: d.issuerPresentation?.layout === 'horizontal' ? 'horizontal' : 'vertical',
      holdersCount: Math.max(0, Math.floor(Number(d.receivedHoldersCount ?? 0))),
      ratingAvg: Number(d.card.averageRating),
      totalRatings: Math.max(0, Math.floor(Number(d.card.totalRatings ?? 0))),
      enableParallax: Boolean(d.issuerPresentation?.enableParallax),
      slots: searchMirrorPreviewSlots,
    };
  }, [receivedCardDetail, searchMirrorPreviewSlots, tr]);

  const marketPremiumPayload = useMemo<MyCardsPayload | null>(() => {
    // Single Source of Truth: preferir el payload real de MongoDB.
    // Fallback a adaptBusinessCardSearchResult solo si el fetch falla.
    if (marketFetchedPayload) return marketFetchedPayload;
    if (!marketCardDetail) return null;
    return adaptBusinessCardSearchResultToMyCardsPayload(marketCardDetail, tr);
  }, [marketFetchedPayload, marketCardDetail, tr]);

  const onSearchScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    searchScrollYRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  const pressScaleForRow = (key: string) => {
    let v = rowPressScaleRef.current.get(key);
    if (!v) {
      v = new Animated.Value(1);
      rowPressScaleRef.current.set(key, v);
    }
    return v;
  };

  const rowPressIn = (key: string) => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      /* opcional */
    }
    Animated.spring(pressScaleForRow(key), {
      toValue: 0.98,
      useNativeDriver: true,
      friction: 7,
      tension: 220,
    }).start();
  };

  const rowPressOut = (key: string) => {
    Animated.spring(pressScaleForRow(key), {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
      tension: 220,
    }).start();
  };

  const displaySectionBusinesses = useMemo(() => {
    // 1. ELIMINAR DUPLICADOS: Filtramos los negocios del Market que ya están en Contactos.
    // Los contactos usan card.id = "received-contact:uid:cardId", por eso comparamos
    // con receivedSourceCardId (el cardId real) vs el Firestore doc id del negocio.
    const contactCardIds = new Set(
      sectionContacts.map((c) => c.receivedSourceCardId).filter(Boolean)
    );
    // 2. ELIMINAR PROPIAS: No mostrar tarjetas cuyo ownerUid sea el usuario activo.
    const uniqueBusinesses = sectionBusinesses.filter(
      (business) =>
        !contactCardIds.has(business.card.id) &&
        (viewerUid == null || business.card.ownerUid !== viewerUid)
    );

    // 2. APLICAR ORDENAMIENTO (Distancia o Valoración) a la lista limpia
    if (marketSortMode === 'distance') {
      const within = uniqueBusinesses.filter((r) => {
        const d = r.distanceMiles;
        if (d == null || !Number.isFinite(d)) {
          return true;
        }
        return d <= MAX_MARKET_RADIUS_MILES;
      });
      return [...within].sort((a, b) => {
        const da = a.distanceMiles ?? 1e9;
        const db_ = b.distanceMiles ?? 1e9;
        return da - db_;
      });
    }
    
    const withRating = uniqueBusinesses.filter((r) => Number(r.card.averageRating) > 0);
    return [...withRating].sort((a, b) => {
      const rb = Number(b.card.averageRating) || 0;
      const ra = Number(a.card.averageRating) || 0;
      if (rb !== ra) {
        return rb - ra;
      }
      const da = a.distanceMiles ?? 1e9;
      const db_ = b.distanceMiles ?? 1e9;
      return da - db_;
    });
  }, [sectionBusinesses, sectionContacts, marketSortMode, viewerUid]);

  const displaySectionContacts = useMemo(() => {
    if (marketSortMode === 'rating') {
      return [...sectionContacts].sort((a, b) => {
        const rb = Number(b.card.averageRating) || 0;
        const ra = Number(a.card.averageRating) || 0;
        return rb - ra;
      });
    }
    return sectionContacts;
  }, [sectionContacts, marketSortMode]);

  const allMarketRows = useMemo(
    () => [...displaySectionContacts, ...displaySectionBusinesses],
    [displaySectionContacts, displaySectionBusinesses],
  );

  useEffect(() => {
    let cancelled = false;

    const loadLicenseStatus = async () => {
      const marketOnly = allMarketRows.filter(
        (r) => r.rowSource === 'social_market' && r.card.ownerUid && r.card.ownerUid !== '__vault_local__',
      );
      if (!marketOnly.length) {
        setLicenseStatus({});
        return;
      }

      const statuses = await Promise.all(
        marketOnly.map(async (result) => {
          const active = await hasActiveBusinessLicense(result.card.ownerUid, result.card.id);
          return [result.card.id, active] as const;
        }),
      );

      if (!cancelled) {
        setLicenseStatus(Object.fromEntries(statuses));
      }
    };

    void loadLicenseStatus();

    return () => {
      cancelled = true;
    };
  }, [allMarketRows]);

  const listSections = useMemo(() => {
    const sections: { title: string; data: BusinessCardSearchResult[] }[] = [];
    if (displaySectionContacts.length) {
      sections.push({
        title: tr('Conocidos primero (Contactos)', 'Contacts first'),
        data: displaySectionContacts,
      });
    }
    if (displaySectionBusinesses.length) {
      sections.push({
        title: tr('Mercado Social', 'Social Market'),
        data: displaySectionBusinesses,
      });
    }
    return sections;
  }, [displaySectionContacts, displaySectionBusinesses, language]);

  const loadReceivedContactsForMarket = useCallback(async (): Promise<ReceivedContactForMarketSearch[]> => {
    const empty: ReceivedContactForMarketSearch[] = [];
    try {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        setReceivedContactsForMarket(empty);
        return empty;
      }
      let meta: Record<string, ContactMetaLite> = {};
      try {
        const raw = await AsyncStorage.getItem(CONTACT_META_STORAGE_KEY);
        if (raw) {
          meta = JSON.parse(raw) as Record<string, ContactMetaLite>;
        }
      } catch {
        meta = {};
      }
      const { contacts } = await listReceivedContacts({ ownerUid });
      const merged: ReceivedContactForMarketSearch[] = contacts.map((c) => {
        const mk = receivedContactMergeKey({ uid: c.uid, cardId: c.cardId });
        return {
        uid: c.uid,
        cardId: c.cardId,
        name: c.name,
        nickname: c.nickname,
        cardName: c.cardName,
        photoUrl: c.photoUrl,
        ratingAvg: c.ratingAvg,
        totalRatings: c.totalRatings,
        holdersCount: c.holdersCount,
        searchFacets: c.searchFacets || [],
        metaGroup: meta[mk]?.group || meta[c.uid]?.group || GROUP_DEFAULT,
        metaIcons: meta[mk]?.icons || meta[c.uid]?.icons,
        themeId: c.themeId,
        layout: c.layout,
        fontId: c.fontId,
        fontName: c.fontName,
        fontFamily: c.fontFamily,
        fontTier: c.fontTier,
        wallpaperId: c.wallpaperId,
        wallpaperUrl: c.wallpaperUrl,
        wallpaperThumbUrl: c.wallpaperThumbUrl,
        wallpaperTier: c.wallpaperTier,
        wallpaperPriceCredits: c.wallpaperPriceCredits,
        enableParallax: c.enableParallax,
        itemIds: c.itemIds,
        cardUpdatedAt: c.cardUpdatedAt,
        storyState: c.storyState ?? 'none',
        channelMuted: Boolean(c.channelMuted),
        publicCardSlots: Array.isArray(c.publicCardSlots) ? c.publicCardSlots : [],
        ownerOccupation: c.ownerOccupation ?? null,
      };
      });
      setReceivedContactsLookupRows(merged);
      setReceivedContactsForMarket((prev) => {
        if (!prev.length) {
          return merged;
        }
        return mergeReceivedContactRows<ReceivedContactForMarketSearch>(prev, merged);
      });
      return merged;
    } catch (error) {
      if (__DEV__) {
        console.warn('loadReceivedContactsForMarket:', error);
      }
      setReceivedContactsForMarket(empty);
      return empty;
    }
  }, []);

  useEffect(() => {
    void loadReceivedContactsForMarket();
  }, [loadReceivedContactsForMarket]);

  const performMarketSearch = useCallback(
    async (query: string, latitude?: number, longitude?: number) => {
      const q = query.trim();
      if (!q) {
        return;
      }
      searchQueryRef.current = q;
      setSubmittedQuery(q);
      setLoading(true);
      try {
        const receivedRows = await loadReceivedContactsForMarket();
        const { contacts, businesses } = await searchSocialMarket(
          q,
          receivedRows,
          latitude,
          longitude,
          MAX_MARKET_RADIUS_MILES,
        );
        setSectionContacts(contacts);
        setSectionBusinesses(businesses);
        setMarketSortMode('distance');
      } catch (error) {
        console.error('Error searching:', error);
        Alert.alert(
          tr('No se pudo completar la búsqueda', 'Search could not finish'),
          tr(
            'Revisa tu conexión a internet e inténtalo de nuevo. Si el fallo continúa, prueba más tarde.',
            'Check your internet connection and try again. If it keeps failing, try again later.',
          ),
        );
      } finally {
        Keyboard.dismiss();
        setLoading(false);
      }
    },
    [loadReceivedContactsForMarket, tr],
  );

  const onSubmitMarketQuery = useCallback(
    (q: string) => {
      void (async () => {
        const r = await startSearchLocationSession();
        if (r.ok) {
          lastLocationRef.current = { lat: r.latitude, lng: r.longitude };
          await performMarketSearch(q, r.latitude, r.longitude);
        } else {
          const cached = lastLocationRef.current;
          await performMarketSearch(q, cached?.lat, cached?.lng);
        }
      })();
    },
    [performMarketSearch],
  );

  const onClearMarketSearch = useCallback(() => {
    searchQueryRef.current = '';
    setSubmittedQuery('');
    setSectionContacts([]);
    setSectionBusinesses([]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const rows = await loadReceivedContactsForMarket();
        if (cancelled) {
          return;
        }
        const q = searchQueryRef.current.trim();
        if (!q) {
          return;
        }
        try {
          const cached = lastLocationRef.current;
          const { contacts, businesses } = await searchSocialMarket(
            q,
            rows,
            cached?.lat,
            cached?.lng,
            MAX_MARKET_RADIUS_MILES,
          );
          if (cancelled) {
            return;
          }
          setSectionContacts(contacts);
          setSectionBusinesses(businesses);
        } catch {
          /* mantener resultados previos */
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [loadReceivedContactsForMarket]),
  );

  useEffect(() => {
    const unsub = subscribeSearchLocationSession(() => {
      const active = isSearchLocationSessionActive();
      if (sessionWasActiveRef.current && !active) {
        const q = searchQueryRef.current.trim();
        if (q) {
          const cached = lastLocationRef.current;
          void performMarketSearch(q, cached?.lat, cached?.lng);
        } else {
          setSectionBusinesses([]);
        }
      }
      sessionWasActiveRef.current = active;
      setLocationSessionUiRev((n) => n + 1);
    });
    sessionWasActiveRef.current = isSearchLocationSessionActive();
    return () => {
      unsub();
    };
  }, [loadReceivedContactsForMarket, performMarketSearch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReceivedContactsForMarket();
    setRefreshing(false);
  };

  const marketListHeader = (
    <View style={[styles.headerBlock, { backgroundColor: shell.background, borderBottomColor: shell.border }]}>
      <Text style={[styles.heroTitle, { color: shell.textPrimary }]} adjustsFontSizeToFit numberOfLines={2}>
        {tr('Mercado Social', 'Social Market')}
      </Text>

      <SocialMarketSearchBar
        loading={loading}
        shell={shell}
        tr={tr}
        onSubmitQuery={onSubmitMarketQuery}
        onClearResults={onClearMarketSearch}
      />

      <View style={styles.marketSortToolbar}>
        <View style={styles.marketSortPillCol}>
          <Text
            style={[
              styles.marketActiveSortPill,
              {
                color: shell.textPrimary,
                backgroundColor: isDark ? shell.surfaceMuted : shell.filterPillBg,
              },
              Platform.OS === 'android' ? { includeFontPadding: false } : null,
            ]}
            numberOfLines={2}
          >
            {tr('Filtro activo:', 'Active filter:')}{' '}
            {marketSortMode === 'distance' ? tr('Distancia', 'Distance') : tr('Valoración', 'Rating')}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.marketSortBtn,
            {
              backgroundColor: shell.surface,
              borderColor: shell.border,
              shadowColor: shell.brandShadow,
            },
          ]}
          onPress={() => setMarketSortModalVisible(true)}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel={tr('Ordenar resultados', 'Sort results')}
        >
          <Text style={[styles.marketSortBtnText, { color: shell.textPrimary }]}>
            {tr('Ordenar', 'Sort')}
          </Text>
        </TouchableOpacity>
      </View>

      {allMarketRows.length > 0 ? (
        <View style={styles.resultHeader}>
          <Text style={[styles.resultTitle, { color: shell.textPrimary }]}>
            {allMarketRows.length}{' '}
            {allMarketRows.length !== 1 ? tr('resultados', 'results') : tr('resultado', 'result')}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderResultCard = ({ item }: { item: BusinessCardSearchResult }) => {
    const isMarketBusiness = item.rowSource === 'social_market';
    const hasLicense = licenseStatus[item.card.id] ?? true;
    const dm = item.distanceMiles;
    /** Sin NaN, sin ∞, sin 0.0 mi (solo distancia estrictamente positiva). */
    const milesOk = typeof dm === 'number' && Number.isFinite(dm) && dm > 0;
    const showMiles = item.showDistance === true && milesOk;
    const permanentLink = !isMarketBusiness
      ? 'https://cardsocial.app'
      : (item.card as any).permanent_business_link ||
        generatePermanentBusinessLink(item.card.id, item.card.ownerUid || 'owner');

    const handleExportBusinessQr = async () => {
      if (!isMarketBusiness) {
        return;
      }
      try {
        const result = await ExportBusinessQR({
          businessId: item.card.id,
          businessName: item.card.businessName,
          permanentBusinessLink: permanentLink,
          businessLogoUri: item.card.businessLogo,
          format: 'png',
        });

        Alert.alert(tr('QR Exportado', 'QR Exported'), result.message);
      } catch (error: any) {
        Alert.alert(tr('Error', 'Error'), error?.message || tr('No fue posible exportar el QR.', 'Could not export QR.'));
      }
    };

    const milesLabel =
      showMiles && milesOk
        ? dm < 1
          ? tr('<1 mi', '<1 mi')
          : `${dm.toFixed(1)} ${tr('mi', 'mi')}`
        : '';

    if (!isMarketBusiness) {
      const pres = item.issuerPresentation;
      const chest = getCardRowTheme(pres?.themeId);
      const reviewCount = Number(item.card.totalRatings) || 0;
      const rating = reviewCount > 0 ? Number(item.card.averageRating) || 0 : 0;
      const holders = item.receivedHoldersCount ?? 0;
      const cardTitle = String(item.receivedContactCardName || '').trim() || item.card.businessName;

      const ringState = resolveSearchRowStoryState(
        {
          uid: item.card.ownerUid,
          cardId: item.receivedSourceCardId ?? null,
          channelMuted: item.receivedChannelMuted,
        },
        storyLookupMaps
      );

      const openStoryFromAvatar = () => {
        if (ringState === 'none') {
          return;
        }
        const sourceCardId = String(item.receivedSourceCardId || '').trim();
        if (!sourceCardId) {
          Alert.alert(
            tr('Historia no disponible', 'Story unavailable'),
            tr('Falta la tarjeta de origen para abrir esta historia.', 'Missing source card to open this story.'),
          );
          return;
        }
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({
          pathname: '/(tabs)/stories',
          params: { openStory: storyChannelKey(item.card.ownerUid, sourceCardId) },
        });
      };

      const openCardBody = () => {
        void (async () => {
          const ok = await hardLockCheck('ver tarjeta desde busqueda');
          if (!ok) {
            return;
          }
          savedSearchScrollYRef.current = searchScrollYRef.current;
          setReceivedCardDetail(item);
        })();
      };

      const ringStyle =
        ringState === 'vip'
          ? {
              borderWidth: 2.6,
              borderColor: shell.ctaAccent,
              backgroundColor: isDark ? 'rgba(212,175,55,0.22)' : 'rgba(212,175,55,0.12)',
              shadowColor: shell.ctaAccent,
              shadowOpacity: 0.45,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 2 },
              elevation: 5,
            }
          : ringState === 'normal'
            ? {
                borderWidth: 2.5,
                borderColor: shell.success,
                backgroundColor: isDark ? 'rgba(48,209,88,0.14)' : 'rgba(52,199,89,0.1)',
                shadowColor: shell.success,
                shadowOpacity: 0.28,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
                elevation: 3,
              }
            : {
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.1)',
                backgroundColor: 'transparent',
              };

      const facets = item.receivedContactFacets || [];

      return (
        <Animated.View style={{ transform: [{ scale: pressScaleForRow(item.card.id) }] }}>
          <ThemedSharedCardSurface
            themeId={pres?.themeId}
            wallpaperUrl={pres?.wallpaperUrl || undefined}
            borderRadius={14}
            style={[styles.marketReceivedSurfaceWrap, { shadowColor: shell.subtleShadow }]}
          >
            <View style={styles.marketReceivedPressable}>
              <View style={styles.marketReceivedMainRow}>
                <TouchableOpacity
                  activeOpacity={ringState === 'none' ? 1 : 0.88}
                  onPress={openStoryFromAvatar}
                  disabled={ringState === 'none'}
                  accessibilityLabel={tr('Abrir historia', 'Open story')}
                >
                  <View style={[styles.searchAvatarRing, ringStyle]}>
                    {item.card.businessLogo ? (
                      <ExpoImage
                        source={{ uri: item.card.businessLogo }}
                        style={[styles.searchAvatarInner, { backgroundColor: shell.avatarPlaceholderBg }]}
                        cachePolicy="disk"
                      />
                    ) : (
                      <View
                        style={[
                          styles.searchAvatarInner,
                          styles.cardImagePlaceholder,
                          {
                            backgroundColor: MEDIA_PLACEHOLDER.personBgLight,
                            borderWidth: 1,
                            borderColor: MEDIA_PLACEHOLDER.personBorderLight,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={MEDIA_PLACEHOLDER.personIconName}
                          size={34}
                          color={MEDIA_PLACEHOLDER.personIconLight}
                        />
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                <Pressable
                  style={[styles.marketReceivedTextCol, { flex: 1 }]}
                  onPress={openCardBody}
                  onPressIn={() => rowPressIn(item.card.id)}
                  onPressOut={() => rowPressOut(item.card.id)}
                >
                  <Text
                    style={[
                      styles.mrPersonName,
                      {
                        color: chest.titleColor,
                        fontWeight: chest.titleFontWeight,
                        fontStyle: chest.titleFontStyle,
                      },
                      pres?.fontFamily ? { fontFamily: pres.fontFamily } : null,
                    ]}
                    numberOfLines={2}
                  >
                    {item.card.businessName}
                  </Text>
                  <Text
                    style={[
                      styles.mrCardName,
                      {
                        color: chest.metaColor,
                        fontWeight: chest.subtitleFontWeight,
                        fontStyle: chest.subtitleFontStyle,
                      },
                      pres?.fontFamily ? { fontFamily: pres.fontFamily } : null,
                    ]}
                    numberOfLines={1}
                  >
                    {cardTitle}
                  </Text>
                  <View style={styles.mrRowStatsRow}>
                    {showMiles && milesLabel ? (
                      <View style={[styles.mrDistancePill, { backgroundColor: 'rgba(255,255,255,0.72)', borderColor: chest.borderColor }]}>
                        <MaterialCommunityIcons name="map-marker-radius-outline" size={11} color={chest.titleColor} />
                        <Text style={[styles.mrDistancePillText, { color: chest.titleColor }]}>{milesLabel}</Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={[
                        styles.mrRecipientsPill,
                        { borderColor: chest.borderColor, backgroundColor: 'rgba(255,255,255,0.72)' },
                      ]}
                      onPress={() => { void openReceptorModal(item); }}
                    >
                      <MaterialCommunityIcons name="account-group-outline" size={12} color={chest.titleColor} />
                      <Text style={[styles.mrRecipientsPillNum, { color: chest.titleColor }]}>{holders}</Text>
                    </TouchableOpacity>
                  </View>
                </Pressable>
              </View>
              {facets.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.searchFacetRow}
                >
                  {facets.slice(0, 14).map((f, idx) => (
                    <TouchableOpacity
                      key={`${f.type}-${idx}-${f.label}`}
                      style={[styles.searchFacetIconBtn, { borderColor: 'rgba(197,160,101,0.45)' }]}
                      onPress={() =>
                        runSearchFacetQuickAction({
                          type: f.type,
                          label: f.label,
                          value: f.value,
                          issuerUid: item.card.ownerUid,
                          issuerCardName: cardTitle,
                          issuerCardId: item.receivedSourceCardId ?? null,
                          issuerDisplayName: item.card.businessName,
                        })
                      }
                      accessibilityLabel={f.label}
                    >
                      <MaterialCommunityIcons
                        name={normalizeMaterialIconName(inferMciIconFromContext(f.type, f.label, f.value), 'card-account-details-outline') as 'help-circle'}
                        size={22}
                        color="rgba(212,175,55,0.95)"
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}
            </View>
          </ThemedSharedCardSurface>
        </Animated.View>
      );
    }

    const card = item.card;
    const marketRingState = marketSearchStoryRingState(card);
    const marketFacets = buildMarketCardSearchFacets(card);
    const chest = getCardRowTheme(card.themeId);
    const reviewCount = Number(card.totalRatings) || 0;
    const ratingRaw = Number(card.averageRating ?? 0);
    const rating = reviewCount > 0 && Number.isFinite(ratingRaw) ? Math.max(0, Math.min(5, ratingRaw)) : 0;
    const holders = (card as any).holdersCount ?? 0;
    const marketRingStyle =
      marketRingState === 'vip'
        ? {
            borderWidth: 2.6,
            borderColor: shell.ctaAccent,
            backgroundColor: isDark ? 'rgba(212,175,55,0.22)' : 'rgba(212,175,55,0.12)',
            shadowColor: shell.ctaAccent,
            shadowOpacity: 0.45,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 2 },
            elevation: 5,
          }
        : marketRingState === 'normal'
          ? {
              borderWidth: 2.5,
              borderColor: shell.success,
              backgroundColor: isDark ? 'rgba(48,209,88,0.14)' : 'rgba(52,199,89,0.1)',
              shadowColor: shell.success,
              shadowOpacity: 0.28,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            }
          : {
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)',
              backgroundColor: 'transparent',
            };

    const openMarketStoryFromLogo = () => {
      if (marketRingState === 'none') {
        return;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: '/(tabs)/stories',
        params: { openMarketVip: card.id },
      });
    };

    const openMarketCardBody = () => {
      void (async () => {
        const ok = await hardLockCheck('ver tarjeta desde busqueda');
        if (!ok) {
          return;
        }
        savedSearchScrollYRef.current = searchScrollYRef.current;
        // Abrir modal inmediatamente con el resultado de búsqueda (UX: sin wait).
        setMarketCardDetail(item);
        setMarketFetchedPayload(null);
        // Fetch real: Single Source of Truth desde MongoDB (publicCardSlots reales).
        try {
          setMarketFetching(true);
          const res = await fetchPublicBusinessCardPreview({
            ownerUid: card.ownerUid,
            cardId: card.id,
            locale: language === 'es' ? 'es' : 'en',
          });
          if (res.ok) {
            const realPayload = myCardsPayloadFromQrPreview(res.preview, tr);
            // Preservar datos de Firestore que el preview público no tiene.
            realPayload.avatarUrl = realPayload.avatarUrl || card.businessLogo || null;
            realPayload.cardName = realPayload.cardName || String(card.businessName || '').trim() || tr('Negocio', 'Business');
            if (!realPayload.subtitle) {
              realPayload.subtitle =
                String(card.ownerName || '').trim().slice(0, 60) ||
                String(card.businessDescription || '').trim().slice(0, 120) ||
                tr('Mercado Social', 'Social Market');
            }
            realPayload.noAvatarIcon = 'storefront-outline';
            setMarketFetchedPayload(realPayload);
          }
        } catch {
          // Fetch falló — el modal sigue con el fallback de marketFacets.
        } finally {
          setMarketFetching(false);
        }
      })();
    };

    const runMarketPhone = () => {
      const phone = String(card.ownerPhone || '').trim();
      if (!phone) {
        Alert.alert(tr('Dato no disponible', 'Not available'), tr('Este negocio no publicó teléfono.', 'This business has no phone listed.'));
        return;
      }
      runSearchFacetQuickAction({
        type: 'teléfono',
        label: tr('Teléfono', 'Phone'),
        value: phone,
        issuerUid: card.ownerUid,
        issuerCardName: card.businessName,
        issuerCardId: card.id,
        issuerDisplayName: card.businessName,
      });
    };

    const runMarketWhatsapp = () => {
      const phone = String(card.ownerPhone || '').trim();
      if (!phone) {
        Alert.alert(tr('Dato no disponible', 'Not available'), tr('Sin número para WhatsApp.', 'No number for WhatsApp.'));
        return;
      }
      const digits = phone.replace(/\D/g, '');
      runSearchFacetQuickAction({
        type: 'whatsapp',
        label: 'WhatsApp',
        value: digits ? `https://wa.me/${digits}` : phone,
        issuerUid: card.ownerUid,
        issuerCardName: card.businessName,
        issuerCardId: card.id,
        issuerDisplayName: card.businessName,
      });
    };

    return (
      <Animated.View style={{ transform: [{ scale: pressScaleForRow(item.card.id) }] }}>
        <ThemedSharedCardSurface
          themeId={card.themeId}
          borderRadius={14}
          style={[styles.marketReceivedSurfaceWrap, { shadowColor: shell.subtleShadow }]}
        >
          <Pressable
            style={styles.marketReceivedPressable}
            onPress={openMarketCardBody}
            onPressIn={() => rowPressIn(item.card.id)}
            onPressOut={() => rowPressOut(item.card.id)}
          >
            <View style={styles.marketReceivedMainRow}>
              {/* Logo (square) */}
              <TouchableOpacity
                activeOpacity={marketRingState === 'none' ? 1 : 0.88}
                onPress={openMarketStoryFromLogo}
                disabled={marketRingState === 'none'}
                accessibilityLabel={tr('Abrir historia', 'Open story')}
              >
                <View style={[styles.searchAvatarRing, marketRingStyle]}>
                  {item.card.businessLogo ? (
                    <ExpoImage
                      source={{ uri: item.card.businessLogo }}
                      style={[
                        styles.searchMarketLogoInner,
                        { backgroundColor: shell.avatarPlaceholderBg },
                        !hasLicense && styles.dullCardImage,
                      ]}
                      cachePolicy="disk"
                    />
                  ) : (
                    <View
                      style={[
                        styles.searchMarketLogoInner,
                        styles.cardImagePlaceholder,
                        !hasLicense && styles.dullCardImage,
                        {
                          backgroundColor: MEDIA_PLACEHOLDER.businessBgLight,
                          borderWidth: 1,
                          borderColor: MEDIA_PLACEHOLDER.businessBorderLight,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={MEDIA_PLACEHOLDER.businessIconName}
                        size={32}
                        color={MEDIA_PLACEHOLDER.businessIconLight}
                      />
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              {/* Text column */}
              <View style={[styles.marketReceivedTextCol, { flex: 1 }]}>
                <Text
                  style={[
                    styles.mrPersonName,
                    { color: chest.titleColor, fontWeight: chest.titleFontWeight, fontStyle: chest.titleFontStyle },
                  ]}
                  numberOfLines={2}
                >
                  {card.businessName}
                </Text>
                <Text
                  style={[
                    styles.mrCardName,
                    { color: chest.metaColor, fontWeight: chest.subtitleFontWeight, fontStyle: chest.subtitleFontStyle },
                  ]}
                  numberOfLines={1}
                >
                  {card.ownerName?.trim() || card.businessDescription || ''}
                </Text>
                <View style={styles.mrRowStatsRow}>
                  {showMiles && milesLabel ? (
                    <View style={[styles.mrDistancePill, { backgroundColor: 'rgba(255,255,255,0.72)', borderColor: chest.borderColor }]}>
                      <MaterialCommunityIcons name="map-marker-radius-outline" size={11} color={chest.titleColor} />
                      <Text style={[styles.mrDistancePillText, { color: chest.titleColor }]}>{milesLabel}</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={[
                      styles.mrRecipientsPill,
                      { borderColor: chest.borderColor, backgroundColor: 'rgba(255,255,255,0.72)' },
                    ]}
                    onPress={() => { void openReceptorModal(item); }}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  >
                    <MaterialCommunityIcons name="account-group-outline" size={12} color={chest.titleColor} />
                    <Text style={[styles.mrRecipientsPillNum, { color: chest.titleColor }]}>{holders}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* QR — right side */}
              <View style={styles.bizSearchQrWrap} pointerEvents="none">
                <QRCode
                  value={permanentLink}
                  size={64}
                  color="#0A2540"
                  backgroundColor="#FFFFFF"
                  ecl="H"
                  {...(item.card.businessLogo
                    ? { logo: { uri: item.card.businessLogo }, logoSize: 14, logoMargin: 2, logoBackgroundColor: '#FFFFFF' }
                    : {})}
                />
              </View>
            </View>

            {/* Facet icons — scrollable row (same as SmartCards) */}
            {marketFacets.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.searchFacetRow}
              >
                {marketFacets.slice(0, 14).map((f, idx) => (
                  <TouchableOpacity
                    key={`m-${f.type}-${idx}-${f.label}`}
                    style={[styles.searchFacetIconBtn, { borderColor: 'rgba(197,160,101,0.45)' }]}
                    onPress={() =>
                      runSearchFacetQuickAction({
                        type: f.type,
                        label: f.label,
                        value: f.value,
                        issuerUid: card.ownerUid,
                        issuerCardName: card.businessName,
                        issuerCardId: card.id,
                        issuerDisplayName: card.businessName,
                      })
                    }
                    accessibilityLabel={f.label}
                  >
                    <MaterialCommunityIcons
                      name={(normalizeMaterialIconName(f.iconName, '') || normalizeMaterialIconName(inferMciIconFromContext(f.type, f.label, f.value), 'card-account-details-outline')) as 'card-account-details-outline'}
                      size={22}
                      color="rgba(212,175,55,0.95)"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}
          </Pressable>
        </ThemedSharedCardSurface>
      </Animated.View>
    );
  };

  return (
    <>
    <View style={[styles.wrapper, { backgroundColor: shell.background }]}> 
      <SectionList
        ref={sectionListRef}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        sections={listSections}
        onScroll={onSearchScroll}
        scrollEventThrottle={16}
        keyExtractor={(item) => `${item.rowSource ?? 'm'}:${item.card.id}`}
        renderItem={renderResultCard}
        renderSectionHeader={({ section: { title } }) => (
          <View
            style={[
              styles.sectionHeader,
              { backgroundColor: shell.surfaceMuted, borderBottomColor: shell.border },
            ]}
          >
            <Text style={[styles.sectionHeaderText, { color: shell.textPrimary }]}>{title}</Text>
          </View>
        )}
        ListHeaderComponent={marketListHeader}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={shell.refreshAccent}
            colors={[shell.refreshAccent]}
          />
        }
        ListEmptyComponent={
          listSections.length === 0 && loading && submittedQuery.trim().length > 0 ? (
            <View style={styles.marketSkeletonWrap}>
              <SharedCardSkeletonList count={5} isDark={isDark} />
            </View>
          ) : !loading && listSections.length === 0 ? (
            <Pressable onPress={Keyboard.dismiss} style={styles.emptyState}>
              <MaterialCommunityIcons name="magnify" size={64} color={shell.emptyIconMuted} />
              {submittedQuery.trim().length > 0 ? (
                <>
                  <Text style={[styles.emptyTitle, { color: shell.textPrimary }]}>
                    {tr('Sin coincidencias', 'No matches')}
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: shell.textSecondary }]}>
                    {tr(
                      'Prueba con otras palabras o sinónimos. También puedes revisar tu conexión.',
                      'Try different words or synonyms. You can also check your connection.',
                    )}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.emptyTitle, { color: shell.textPrimary }]}>
                    {tr('Busca algo…', 'Search for something…')}
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: shell.textSecondary }]}>
                    {tr(
                      'Tus tarjetas recibidas y el Mercado Social',
                      'Your received cards and the Social Market',
                    )}
                  </Text>
                </>
              )}
            </Pressable>
          ) : null
        }
      />

      {loading && listSections.length > 0 ? (
        <View style={[styles.loadingOverlayLight, { backgroundColor: isDark ? shell.loadingOverlayDimDark : shell.loadingOverlayDim }]}>
          <ActivityIndicator size="small" color={shell.refreshAccent} />
        </View>
      ) : null}

      <MyCardsPreviewModal
        key={receivedCardDetail ? `search-received-${receivedCardDetail.card.id}` : 'search-received-closed'}
        visible={Boolean(receivedCardDetail && receivedCardDetail.rowSource === 'received_contact')}
        onClose={closeReceivedCardDetail}
        variant="receiver"
        payload={searchReceivedPayload}
        ghostTargetUid={receivedCardDetail?.card?.ownerUid}
        sourceCardId={receivedCardDetail?.receivedSourceCardId ?? null}
        sourceCardName={
          String(receivedCardDetail?.receivedContactCardName || '').trim() ||
          receivedCardDetail?.card?.businessName ||
          undefined
        }
        peerDisplayName={
          String(receivedCardDetail?.receivedIssuerNickname || '').trim() ||
          receivedCardDetail?.card?.businessName ||
          undefined
        }
        ratingCardType='business'
      />

      <MyCardsPreviewModal
        key={marketCardDetail ? `search-market-${marketCardDetail.card.id}` : 'search-market-closed'}
        visible={Boolean(marketCardDetail)}
        onClose={closeMarketCardDetail}
        variant="incoming"
        payload={marketPremiumPayload}
        ghostTargetUid={marketCardDetail?.card.ownerUid ?? null}
        sourceCardId={marketCardDetail?.card.id ?? null}
        sourceCardName={marketCardDetail?.card.businessName}
        peerDisplayName={
          String(marketCardDetail?.card.businessName || '').trim() ||
          tr('Negocio', 'Business')
        }
        incomingRedeem={marketCardDetail ? {
          mode: 'business_permanent',
          token: '',
          ownerUid: marketCardDetail.card.ownerUid ?? '',
          cardId: marketCardDetail.card.id ?? '',
          receiverUid: viewerUid ?? '',
          onSuccess: closeMarketCardDetail,
        } : null}
        ratingCardType='business'
      />

      <Modal
        visible={marketSortModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMarketSortModalVisible(false)}
      >
        <Pressable style={[styles.marketSortModalOverlay, { backgroundColor: shell.overlayScrim }]} onPress={() => setMarketSortModalVisible(false)}>
          <Pressable
            style={[styles.marketSortModalCard, { backgroundColor: shell.surface, borderColor: shell.border }]}
            onPress={() => {}}
          >
            <Text style={[styles.marketSortModalTitle, { color: shell.textPrimary }]}>
              {tr('Ordenar Mercado', 'Sort market')}
            </Text>
            {(
              [
                { key: 'distance' as const, label: tr('Distancia', 'Distance') },
                { key: 'rating' as const, label: tr('Valoración', 'Rating') },
              ] as const
            ).map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.marketSortOptionRow,
                  {
                    backgroundColor: isDark ? shell.surfaceMuted : shell.surface,
                    borderColor: shell.border,
                  },
                  marketSortMode === option.key && {
                    borderColor: shell.ctaPrimary,
                    backgroundColor: shell.storiesControlActiveBg,
                  },
                ]}
                onPress={() => {
                  setMarketSortMode(option.key);
                  setMarketSortModalVisible(false);
                }}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.marketSortOptionText,
                    { color: shell.textSecondary },
                    marketSortMode === option.key && { color: shell.textPrimary },
                  ]}
                >
                  {option.label}
                </Text>
                {marketSortMode === option.key ? (
                  <MaterialCommunityIcons name="check-circle" size={17} color={shell.ctaAccent} />
                ) : null}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Account Recovery Modal */}
      <Modal visible={showRecoveryModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          {/* TODO: Renderizar AccountRecoveryScreen */}
        </View>
      </Modal>
    </View>

    <ReceptorScreenModal
      visible={receptorModalVisible}
      onClose={() => { setReceptorModalVisible(false); setReceptorItem(null); setReceptorSubscribers([]); }}
      owner={{
        displayName: receptorItem?.card?.businessName || tr('Tarjeta', 'Card'),
        occupation: receptorItem?.receivedContactCardName || '',
        photoUrl: receptorItem?.card?.businessLogo || null,
      }}
      subscribers={receptorSubscribers}
      totalCount={receptorItem?.receivedHoldersCount ?? receptorSubscribers.length}
      loading={receptorLoading}
      isDark={isDark}
      tr={tr}
    />
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  headerBlock: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.35,
    textAlign: 'center',
    marginBottom: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
    marginBottom: 10,
  },
  searchRowIcon: {
    marginRight: -4,
  },
  searchInputMinimal: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
    paddingHorizontal: 4,
    minHeight: 44,
  },
  goButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goButtonText: {
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.8,
  },
  marketSortToolbar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  marketSortPillCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'flex-start',
  },
  marketSortBtn: {
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  marketSortBtnText: {
    fontWeight: '700',
    fontSize: 12.5,
  },
  marketActiveSortPill: {
    alignSelf: 'flex-start',
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '700',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6.5,
  },
  marketSortModalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  marketSortModalCard: {
    width: '92%',
    borderRadius: 15,
    borderWidth: 1,
    padding: 14,
  },
  marketSortModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 9,
  },
  marketSortOptionRow: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  marketSortOptionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  resultHeader: {
    paddingTop: 2,
    paddingBottom: 4,
  },
  resultTitle: {
    fontSize: 11,
    fontWeight: '600',
  },
  sectionHeader: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeaderText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  resultCard: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 116,
  },
  marketResultCardColumn: {
    flexDirection: 'column',
    minHeight: 0,
  },
  marketResultTopRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 116,
  },
  searchAvatarRing: {
    borderRadius: 999,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchAvatarInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: 'hidden',
  },
  searchMarketLogoInner: {
    width: 74,
    height: 74,
    borderRadius: 12,
    overflow: 'hidden',
  },
  searchFacetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 6,
    paddingTop: 2,
  },
  searchFacetRowMarket: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 4,
  },
  searchFacetIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  resultCardReceived: {
    flexDirection: 'column',
    alignItems: 'stretch',
    minHeight: 0,
  },
  marketReceivedSurfaceWrap: {
    marginHorizontal: 20,
    marginVertical: 8,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  marketReceivedPressable: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 104,
    position: 'relative',
  },
  marketReceivedMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  marketReceivedAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  marketReceivedTextCol: {
    flex: 1,
    minWidth: 0,
  },
  mrPersonName: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
  },
  mrCardName: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '600',
  },
  /** Fila 3: valoración + pastilla de receptores (misma línea que Contactos). */
  mrRowStatsRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
  },
  mrRatingCluster: {
    alignItems: 'flex-start',
    flexShrink: 1,
    minWidth: 0,
  },
  mrStarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  mrRatingCaption: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
  },
  mrRecipientsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  mrRecipientsPillNum: {
    fontSize: 10,
    fontWeight: '800',
  },
  mrDistancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  mrDistancePillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  receivedCardColumn: {
    width: '100%',
  },
  receivedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
  },
  receivedAvatar: {
    width: 72,
    height: 72,
    borderRadius: 12,
  },
  cardContentFlat: {
    flex: 1,
    paddingLeft: 12,
    paddingRight: 8,
    justifyContent: 'center',
  },
  pressedCard: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
  dullCardImage: {
    opacity: 0.55,
  },
  cardImage: {
    width: 80,
    height: 80,
  },
  cardImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    marginBottom: 8,
  },
  dullPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 8,
  },
  dullPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 11,
    fontWeight: '500',
  },
  ctaContainer: {
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderLeftWidth: 1,
  },
  ctaButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  exportButton: {
    marginTop: 6,
    marginHorizontal: 6,
    minHeight: 44,
    minWidth: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedCta: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  floatingQrWrap: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 10,
    width: 84,
    height: 84,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    marginTop: 8,
  },
  /* ── Business Card QR (search, right-aligned) ── */
  bizSearchQrWrap: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    overflow: 'hidden',
  },
  marketSkeletonWrap: {
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 32,
    minHeight: 280,
  },
  loadingOverlayLight: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});
