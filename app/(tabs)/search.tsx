/**
 * Mercado Social / Social Market: búsqueda con sinónimos, contactos recibidos y tarjetas de negocio.
 */

import { SharedCardSkeletonList } from '@/components/SharedCardRowSkeleton';
import { ThemedSharedCardSurface } from '@/components/ThemedSharedCardSurface';
import { getActiveUserId } from '@/services/authSession';
import { ExportBusinessQR, generatePermanentBusinessLink } from '@/services/brandedQrService';
import { hasActiveBusinessLicense } from '@/services/businessLicenseService';
import { useLanguage } from '@/services/language';
import {
  isSearchLocationSessionActive,
  startSearchLocationSession,
  subscribeSearchLocationSession,
} from '@/services/searchLocationSession';
import { useLookMode } from '@/services/lookMode';
import { listReceivedContacts } from '@/services/qrApi';
import { mergeReceivedContactRows } from '@/services/receivedContactsPresentationMerge';
import { getCardRowTheme } from '@/services/useActiveTheme';
import { searchSocialMarket } from '@/services/searchService';
import type { ReceivedContactForMarketSearch } from '@/services/searchService';
import { BusinessCardSearchResult } from '@/types/businessCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
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
    SectionList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { MEDIA_PLACEHOLDER } from '@/constants/mediaPlaceholders';
import QRCode from 'react-native-qrcode-svg';

const CONTACT_META_STORAGE_KEY = 'contacts_meta_v2';
const GROUP_DEFAULT = 'Random';
/** Radio de negocios en millas (búsqueda con ubicación y modo orden por distancia). */
const MAX_MARKET_RADIUS_MILES = 20;

type ContactMetaLite = { group?: string; icons?: Array<{ name: string; url: string }> };

type SearchPalette = {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  ctaPrimary: string;
  ctaAccent: string;
};

/**
 * Barra de búsqueda con texto en estado local: el padre no re-renderiza en cada tecla,
 * así el TextInput no pierde el foco ni se desmonta con el ListHeader del SectionList.
 */
const SocialMarketSearchBar = React.memo(function SocialMarketSearchBar({
  loading,
  palette,
  tr,
  onSubmitQuery,
  onClearResults,
}: {
  loading: boolean;
  palette: SearchPalette;
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
    <View style={[styles.searchRow, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
      <MaterialCommunityIcons name="magnify" size={22} color={palette.textSecondary} style={styles.searchRowIcon} />
      <TextInput
        style={[styles.searchInputMinimal, { color: palette.textPrimary }]}
        placeholder={tr('Nails, Hair, Cosmetología…', 'Nails, hair, cosmetology…')}
        value={localSearchText}
        onChangeText={setLocalSearchText}
        onSubmitEditing={submit}
        placeholderTextColor={palette.textSecondary}
        returnKeyType="search"
        blurOnSubmit={false}
      />
      {localSearchText.length > 0 ? (
        <TouchableOpacity
          onPress={clear}
          hitSlop={12}
          accessibilityLabel={tr('Limpiar búsqueda', 'Clear search')}
        >
          <MaterialCommunityIcons name="close-circle-outline" size={22} color={palette.textSecondary} />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={[styles.goButton, { backgroundColor: palette.ctaPrimary }]}
        onPress={submit}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={tr('Buscar en el mercado', 'Search the market')}
      >
        <Text style={styles.goButtonText}>{tr('IR', 'GO')}</Text>
      </TouchableOpacity>
    </View>
  );
});

export default function SearchScreen() {
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const { language } = useLanguage();
  const tr = useCallback((es: string, en: string) => (language === 'en' ? en : es), [language]);
  /** Última consulta enviada (IR / Intro); el campo de texto vive en SocialMarketSearchBar. */
  const [submittedQuery, setSubmittedQuery] = useState('');
  const searchQueryRef = useRef('');
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

  const palette = useMemo<SearchPalette>(
    () => ({
      background: isDark ? '#06080B' : '#F9F9F9',
      surface: isDark ? '#10141A' : '#FFFFFF',
      surfaceMuted: isDark ? '#1B222C' : '#F5F5F5',
      border: isDark ? '#2A3340' : '#E8E8E8',
      textPrimary: isDark ? '#F5F8FC' : '#0A2540',
      textSecondary: isDark ? '#C8D0DA' : '#4A4A4A',
      ctaPrimary: '#0A2540',
      ctaAccent: '#C5A065',
    }),
    [isDark],
  );

  const displaySectionBusinesses = useMemo(() => {
    if (marketSortMode === 'distance') {
      const within = sectionBusinesses.filter((r) => {
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
    const withRating = sectionBusinesses.filter((r) => Number(r.card.averageRating) > 0);
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
  }, [sectionBusinesses, marketSortMode]);

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
        title: tr('Mis Contactos', 'My Contacts'),
        data: displaySectionContacts,
      });
    }
    if (displaySectionBusinesses.length) {
      sections.push({
        title: tr('Tarjetas de negocio', 'Business Cards'),
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
      const merged: ReceivedContactForMarketSearch[] = contacts.map((c) => ({
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
        metaGroup: meta[c.uid]?.group || GROUP_DEFAULT,
        metaIcons: meta[c.uid]?.icons,
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
      }));
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
          await performMarketSearch(q, r.latitude, r.longitude);
        } else {
          await performMarketSearch(q, undefined, undefined);
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
          const { contacts, businesses } = await searchSocialMarket(
            q,
            rows,
            undefined,
            undefined,
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
          void performMarketSearch(q, undefined, undefined);
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
    <View style={[styles.headerBlock, { backgroundColor: palette.background, borderBottomColor: palette.border }]}>
      <Text style={[styles.heroTitle, { color: palette.textPrimary }]} adjustsFontSizeToFit numberOfLines={2}>
        {tr('Mercado Social', 'Social Market')}
      </Text>

      <SocialMarketSearchBar
        loading={loading}
        palette={palette}
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
                color: palette.textPrimary,
                backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.72)',
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
              backgroundColor: isDark ? palette.surface : '#FFFFFF',
              borderColor: palette.border,
            },
          ]}
          onPress={() => setMarketSortModalVisible(true)}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel={tr('Ordenar resultados', 'Sort results')}
        >
          <Text style={[styles.marketSortBtnText, { color: palette.textPrimary }]}>
            {tr('Ordenar', 'Sort')}
          </Text>
        </TouchableOpacity>
      </View>

      {allMarketRows.length > 0 ? (
        <View style={styles.resultHeader}>
          <Text style={[styles.resultTitle, { color: palette.textPrimary }]}>
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

      const starsEl = (
        <View style={styles.mrStarRow}>
          {Array.from({ length: 5 }).map((_, index) => {
            const r = Math.max(0, Math.min(5, rating));
            const threshold = index + 1;
            let name: 'star' | 'star-half-full' | 'star-outline' = 'star-outline';
            if (r >= threshold) name = 'star';
            else if (r >= threshold - 0.5) name = 'star-half-full';
            return <MaterialCommunityIcons key={index} name={name} size={12} color="#C5A065" />;
          })}
        </View>
      );

      return (
        <Animated.View style={{ transform: [{ scale: pressScaleForRow(item.card.id) }] }}>
        <ThemedSharedCardSurface
          themeId={pres?.themeId}
          wallpaperUrl={pres?.wallpaperUrl || undefined}
          borderRadius={14}
          style={styles.marketReceivedSurfaceWrap}
        >
          <Pressable
            style={styles.marketReceivedPressable}
            onPressIn={() => rowPressIn(item.card.id)}
            onPressOut={() => rowPressOut(item.card.id)}
          >
            <View style={styles.marketReceivedMainRow}>
              {item.card.businessLogo ? (
                <ExpoImage source={{ uri: item.card.businessLogo }} style={styles.marketReceivedAvatar} cachePolicy="disk" />
              ) : (
                <View
                  style={[
                    styles.marketReceivedAvatar,
                    styles.cardImagePlaceholder,
                    {
                      backgroundColor: isDark ? MEDIA_PLACEHOLDER.personBgDark : MEDIA_PLACEHOLDER.personBgLight,
                      borderWidth: 1,
                      borderColor: isDark ? MEDIA_PLACEHOLDER.personBorderDark : MEDIA_PLACEHOLDER.personBorderLight,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={MEDIA_PLACEHOLDER.personIconName}
                    size={36}
                    color={isDark ? MEDIA_PLACEHOLDER.personIconDark : MEDIA_PLACEHOLDER.personIconLight}
                  />
                </View>
              )}
              <View style={styles.marketReceivedTextCol}>
                <Text
                  style={[
                    styles.mrPersonName,
                    { color: chest.titleColor },
                    pres?.fontFamily ? { fontFamily: pres.fontFamily } : null,
                  ]}
                  numberOfLines={2}
                >
                  {item.card.businessName}
                </Text>
                <Text
                  style={[
                    styles.mrCardName,
                    { color: chest.metaColor },
                    pres?.fontFamily ? { fontFamily: pres.fontFamily } : null,
                  ]}
                  numberOfLines={1}
                >
                  {cardTitle}
                </Text>
                <View style={styles.mrRowStatsRow}>
                  <View style={styles.mrRatingCluster}>
                    {starsEl}
                    <Text style={[styles.mrRatingCaption, { color: chest.metaColor }]}>
                      {rating.toFixed(1)} · {reviewCount} {tr('reseñas', 'reviews')}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.mrRecipientsPill,
                      { borderColor: chest.borderColor, backgroundColor: 'rgba(255,255,255,0.72)' },
                    ]}
                  >
                    <MaterialCommunityIcons name="account-group-outline" size={12} color={chest.titleColor} />
                    <Text style={[styles.mrRecipientsPillNum, { color: chest.titleColor }]}>{holders}</Text>
                  </View>
                </View>
              </View>
            </View>
            {showMiles && milesLabel ? (
              <View style={[styles.mrDistanceBadge, { borderColor: chest.metaColor, backgroundColor: 'rgba(255,255,255,0.55)' }]}>
                <Text style={[styles.mrDistanceText, { color: chest.titleColor }]}>{milesLabel}</Text>
              </View>
            ) : null}
          </Pressable>
        </ThemedSharedCardSurface>
        </Animated.View>
      );
    }

    return (
      <Animated.View style={{ transform: [{ scale: pressScaleForRow(item.card.id) }] }}>
      <Pressable
        onPressIn={() => rowPressIn(item.card.id)}
        onPressOut={() => rowPressOut(item.card.id)}
        style={({ pressed }) => [
          styles.resultCard,
          { backgroundColor: palette.surface, borderColor: palette.border },
          !hasLicense && isMarketBusiness && styles.dullCard,
          pressed && styles.pressedCard,
        ]}
      >
        <View style={[styles.floatingQrWrap, !hasLicense && styles.dullQrWrap]}>
          <QRCode
            value={permanentLink}
            size={76}
            color="#0A2540"
            backgroundColor="#FFFFFF"
            logo={item.card.businessLogo ? { uri: item.card.businessLogo } : undefined}
            logoSize={16}
            ecl="H"
          />
        </View>

        {item.card.businessLogo ? (
          <ExpoImage
            source={{ uri: item.card.businessLogo }}
            style={[styles.cardImage, !hasLicense && isMarketBusiness && styles.dullCardImage]}
            cachePolicy="disk"
          />
        ) : (
          <View
            style={[
              styles.cardImage,
              styles.cardImagePlaceholder,
              !hasLicense && isMarketBusiness && styles.dullCardImage,
              {
                backgroundColor: isDark ? MEDIA_PLACEHOLDER.businessBgDark : MEDIA_PLACEHOLDER.businessBgLight,
                borderWidth: 1,
                borderColor: isDark ? MEDIA_PLACEHOLDER.businessBorderDark : MEDIA_PLACEHOLDER.businessBorderLight,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={MEDIA_PLACEHOLDER.businessIconName}
              size={40}
              color={isDark ? MEDIA_PLACEHOLDER.businessIconDark : MEDIA_PLACEHOLDER.businessIconLight}
            />
          </View>
        )}

        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>{item.card.businessName}</Text>
          <Text style={[styles.cardSubtitle, { color: palette.textSecondary }]}>
            {item.card.businessDescription}
          </Text>

          {!hasLicense && isMarketBusiness ? (
            <View style={styles.dullPill}>
              <Text style={styles.dullPillText}>
                {tr('Modo tenue: anualidad pendiente', 'Dull mode: subscription pending')}
              </Text>
            </View>
          ) : null}

          <View style={styles.statsContainer}>
            <View style={styles.stat}>
              <MaterialCommunityIcons name="star" size={14} color="#C5A065" />
              <Text style={[styles.statText, { color: palette.textSecondary }]}>
                {(item.card.averageRating ?? 0).toFixed(1)}
              </Text>
            </View>

            {showMiles && milesLabel ? (
              <View style={styles.stat}>
                <MaterialCommunityIcons name="map-marker" size={14} color="#1EA7FF" />
                <Text style={[styles.statText, { color: palette.textSecondary }]}>{milesLabel}</Text>
              </View>
            ) : null}

            <View style={styles.stat}>
              <MaterialCommunityIcons name="check-circle" size={14} color="#2ECC71" />
              <Text style={[styles.statText, { color: palette.textSecondary }]}>
                {tr('Verificado', 'Verified')}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.ctaContainer, { borderLeftColor: palette.border }]}>
          <Pressable style={({ pressed }) => [styles.ctaButton, pressed && styles.pressedButton]}>
            <MaterialCommunityIcons name="phone" size={24} color="#1EA7FF" />
          </Pressable>
          <Pressable style={({ pressed }) => [styles.ctaButton, pressed && styles.pressedButton]}>
            <MaterialCommunityIcons name="message-text" size={24} color="#1EA7FF" />
          </Pressable>
          <Pressable style={({ pressed }) => [styles.ctaButton, pressed && styles.pressedButton]}>
            <MaterialCommunityIcons name="plus" size={24} color="#1EA7FF" />
          </Pressable>
          <Pressable style={({ pressed }) => [styles.exportButton, pressed && styles.pressedCta]} onPress={handleExportBusinessQr}>
            <MaterialCommunityIcons name="download" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.wrapper, { backgroundColor: palette.background }]}> 
      <SectionList
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        sections={listSections}
        keyExtractor={(item) => `${item.rowSource ?? 'm'}:${item.card.id}`}
        renderItem={renderResultCard}
        renderSectionHeader={({ section: { title } }) => (
          <View
            style={[
              styles.sectionHeader,
              { backgroundColor: palette.surfaceMuted, borderBottomColor: palette.border },
            ]}
          >
            <Text style={[styles.sectionHeaderText, { color: palette.textPrimary }]}>{title}</Text>
          </View>
        )}
        ListHeaderComponent={marketListHeader}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          listSections.length === 0 && loading && submittedQuery.trim().length > 0 ? (
            <View style={styles.marketSkeletonWrap}>
              <SharedCardSkeletonList count={5} isDark={isDark} />
            </View>
          ) : !loading && listSections.length === 0 ? (
            <Pressable onPress={Keyboard.dismiss} style={styles.emptyState}>
              <MaterialCommunityIcons name="magnify" size={64} color="#CCC" />
              {submittedQuery.trim().length > 0 ? (
                <>
                  <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>
                    {tr('Sin coincidencias', 'No matches')}
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: palette.textSecondary }]}>
                    {tr(
                      'Prueba con otras palabras o sinónimos. También puedes revisar tu conexión.',
                      'Try different words or synonyms. You can also check your connection.',
                    )}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>
                    {tr('Busca algo…', 'Search for something…')}
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: palette.textSecondary }]}>
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
        <View style={[styles.loadingOverlayLight, { backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.45)' }]}>
          <ActivityIndicator size="small" color="#54C1FB" />
        </View>
      ) : null}

      <Modal
        visible={marketSortModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMarketSortModalVisible(false)}
      >
        <Pressable style={styles.marketSortModalOverlay} onPress={() => setMarketSortModalVisible(false)}>
          <Pressable
            style={[styles.marketSortModalCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
            onPress={() => {}}
          >
            <Text style={[styles.marketSortModalTitle, { color: palette.textPrimary }]}>
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
                    backgroundColor: isDark ? palette.surfaceMuted : '#FFFFFF',
                    borderColor: palette.border,
                  },
                  marketSortMode === option.key && {
                    borderColor: palette.ctaPrimary,
                    backgroundColor: isDark ? '#1a2838' : '#EAF7FF',
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
                    { color: palette.textSecondary },
                    marketSortMode === option.key && { color: palette.textPrimary },
                  ]}
                >
                  {option.label}
                </Text>
                {marketSortMode === option.key ? (
                  <MaterialCommunityIcons name="check-circle" size={17} color={palette.ctaAccent} />
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
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#F9F9F9',
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
    color: '#FFFFFF',
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
    shadowColor: '#0D4D8A',
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
    backgroundColor: 'rgba(7,33,54,0.35)',
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
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 116,
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
    shadowColor: '#000',
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
    backgroundColor: '#F5F5F5',
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
  mrDistanceBadge: {
    position: 'absolute',
    right: 10,
    bottom: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  mrDistanceText: {
    fontSize: 11,
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
    backgroundColor: '#F5F5F5',
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
  dullCard: {
    backgroundColor: '#ECEFF3',
    borderColor: '#B9C0C9',
    shadowOpacity: 0,
    elevation: 0,
  },
  dullCardImage: {
    opacity: 0.55,
  },
  dullQrWrap: {
    backgroundColor: '#F1F1F1',
  },
  cardImage: {
    width: 80,
    height: 80,
    backgroundColor: '#F5F5F5',
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
    color: '#0A2540',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  dullPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#D6DADF',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 8,
  },
  dullPillText: {
    fontSize: 10,
    color: '#303846',
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
    color: '#666',
    fontWeight: '500',
  },
  ctaContainer: {
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderLeftWidth: 1,
    borderLeftColor: '#E8E8E8',
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
    backgroundColor: '#0A2540',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedButton: {
    backgroundColor: 'rgba(30,167,255,0.14)',
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
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
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
    color: '#0A2540',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
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
