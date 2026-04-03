/**
 * Mercado Social / Social Market: búsqueda con sinónimos, contactos recibidos y tarjetas de negocio.
 */

import { ActionController } from '@/services/ActionController';
import { getActiveUserId } from '@/services/authSession';
import { hardLockCheck } from '@/services/biometricAuth';
import { ExportBusinessQR, generatePermanentBusinessLink } from '@/services/brandedQrService';
import { hasActiveBusinessLicense } from '@/services/businessLicenseService';
import { startGhostLinkVoipCall } from '@/services/ghostLinkVoip';
import { useLanguage } from '@/services/language';
import {
    endSearchLocationSession,
    getSearchSessionCoordinates,
    getSearchSessionExpiresAt,
    isSearchLocationSessionActive,
    SEARCH_LOCATION_SESSION_MS,
    startSearchLocationSession,
    subscribeSearchLocationSession,
} from '@/services/searchLocationSession';
import { useLookMode } from '@/services/lookMode';
import { createCallLog, listReceivedContacts } from '@/services/qrApi';
import { findNearbyBusinesses, searchSocialMarket } from '@/services/searchService';
import type { ReceivedContactForMarketSearch } from '@/services/searchService';
import { BusinessCardSearchResult } from '@/types/businessCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    Linking,
    Modal,
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
import { extractEmailFromFacets, extractWhatsAppUrlFromFacets } from '@/services/receivedContactFacets';
import QRCode from 'react-native-qrcode-svg';

const CONTACT_META_STORAGE_KEY = 'contacts_meta_v2';
const GROUP_DEFAULT = 'Random';

type ContactMetaLite = { group?: string; icons?: Array<{ name: string; url: string }> };

export default function SearchScreen() {
  const router = useRouter();
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const { language } = useLanguage();
  const tr = (es: string, en: string) => language === 'en' ? en : es;
  const [searchQuery, setSearchQuery] = useState('');
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
  const [, setSessionTick] = useState(0);
  const sessionWasActiveRef = useRef(false);
  const [sectionContacts, setSectionContacts] = useState<BusinessCardSearchResult[]>([]);
  const [sectionBusinesses, setSectionBusinesses] = useState<BusinessCardSearchResult[]>([]);
  /** Orden del bloque Business Cards: distancia (Haversine) por defecto; estrellas filtra sin rating y ordena por rating. */
  const [businessSortMode, setBusinessSortMode] = useState<'distance' | 'rating'>('distance');
  const [, setReceivedContactsForMarket] = useState<ReceivedContactForMarketSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<Record<string, boolean>>({});

  const palette = {
    background: isDark ? '#06080B' : '#F9F9F9',
    surface: isDark ? '#10141A' : '#FFFFFF',
    surfaceMuted: isDark ? '#1B222C' : '#F5F5F5',
    border: isDark ? '#2A3340' : '#E8E8E8',
    textPrimary: isDark ? '#F5F8FC' : '#0A2540',
    textSecondary: isDark ? '#C8D0DA' : '#4A4A4A',
    ctaPrimary: '#0A2540',
    ctaAccent: '#C5A065',
  };

  const displaySectionBusinesses = useMemo(() => {
    if (businessSortMode === 'distance') {
      return sectionBusinesses;
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
  }, [sectionBusinesses, businessSortMode]);

  const allMarketRows = useMemo(
    () => [...sectionContacts, ...sectionBusinesses],
    [sectionContacts, sectionBusinesses],
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
    if (sectionContacts.length) {
      sections.push({
        title: tr('Mis Contactos', 'My Contacts'),
        data: sectionContacts,
      });
    }
    if (displaySectionBusinesses.length) {
      sections.push({
        title: tr('Tarjetas de negocio', 'Business Cards'),
        data: displaySectionBusinesses,
      });
    }
    return sections;
  }, [sectionContacts, displaySectionBusinesses, language]);

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
        searchFacets: c.searchFacets || [],
        metaGroup: meta[c.uid]?.group || GROUP_DEFAULT,
        metaIcons: meta[c.uid]?.icons,
      }));
      setReceivedContactsForMarket(merged);
      return merged;
    } catch (error) {
      console.error('Error loading received contacts for market:', error);
      setReceivedContactsForMarket(empty);
      return empty;
    }
  }, []);

  useEffect(() => {
    void loadReceivedContactsForMarket();
  }, [loadReceivedContactsForMarket]);

  useEffect(() => {
    const unsub = subscribeSearchLocationSession(() => {
      const active = isSearchLocationSessionActive();
      if (sessionWasActiveRef.current && !active) {
        const q = searchQueryRef.current.trim();
        if (q) {
          void (async () => {
            setLoading(true);
            try {
              const receivedRows = await loadReceivedContactsForMarket();
              const { contacts, businesses } = await searchSocialMarket(
                q,
                receivedRows,
                undefined,
                undefined,
                5,
              );
              setSectionContacts(contacts);
              setSectionBusinesses(businesses);
              setBusinessSortMode('distance');
            } catch {
              /* keep previous rows */
            } finally {
              setLoading(false);
            }
          })();
        } else {
          setSectionBusinesses([]);
        }
      }
      sessionWasActiveRef.current = active;
      setSessionTick((n) => n + 1);
    });
    sessionWasActiveRef.current = isSearchLocationSessionActive();
    const id = setInterval(() => {
      if (getSearchSessionExpiresAt()) {
        setSessionTick((n) => n + 1);
      }
    }, 1000);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [loadReceivedContactsForMarket]);

  const openReceivedPrivateCall = async (item: BusinessCardSearchResult) => {
    const targetUid = String(item.card.ownerUid || '').trim();
    const sourceCardName = String(item.receivedContactCardName || item.card.businessName || 'Tarjeta Social').trim();
    if (!targetUid) {
      return;
    }
    const ownerUid = await getActiveUserId();
    if (!ownerUid) {
      Alert.alert(
        tr('Sesión requerida', 'Session required'),
        tr('Inicia sesión para usar Llamada privada.', 'Sign in to use Private call.'),
      );
      return;
    }
    const authenticated = await hardLockCheck('iniciar llamada Ghost-Link');
    if (!authenticated) {
      return;
    }
    try {
      await startGhostLinkVoipCall({
        ownerUid,
        targetUid,
        card: { sourceCardName, sourceCardId: null },
      });
      await createCallLog({
        ownerUid,
        peerUid: targetUid,
        direction: 'outgoing',
        status: 'completed',
        durationSec: 0,
        tags: ['Ghost-Link'],
        sourceCardName,
        sourceCardId: null,
        callChannel: 'ghost-link-voip',
      });
      Alert.alert(
        tr('Ghost-Link', 'Ghost-Link'),
        tr('Conectando. Tu número real permanece oculto.', 'Connecting. Your real number stays hidden.'),
      );
    } catch (error: any) {
      Alert.alert(
        tr('No se pudo iniciar la llamada', 'Could not start call'),
        error?.message || tr('Intenta de nuevo.', 'Try again.'),
      );
    }
  };

  const sessionMinutes = Math.round(SEARCH_LOCATION_SESSION_MS / 60000);

  const performMarketSearch = async (latitude?: number, longitude?: number) => {
    const q = searchQueryRef.current.trim();
    if (!q) {
      return;
    }
    setLoading(true);
    try {
      const receivedRows = await loadReceivedContactsForMarket();
      const { contacts, businesses } = await searchSocialMarket(
        q,
        receivedRows,
        latitude,
        longitude,
        5,
      );
      setSectionContacts(contacts);
      setSectionBusinesses(businesses);
      setBusinessSortMode('distance');
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
  };

  /** Cada Buscar fuerza nueva lectura GPS: startSearchLocationSession limpia sesión y getCurrentPositionAsync. */
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert(tr('Error', 'Error'), tr('Ingresa palabras clave para buscar', 'Enter keywords to search'));
      return;
    }
    const r = await startSearchLocationSession();
    if (r.ok) {
      await performMarketSearch(r.latitude, r.longitude);
    } else {
      await performMarketSearch(undefined, undefined);
    }
  };

  /** Mismo flujo que Buscar (GPS primero); atajo en la barra de búsqueda. */
  const handleSearchWithDistance = () => void handleSearch();

  const runNearbyWithCoords = async (latitude: number, longitude: number) => {
    setLoading(true);
    try {
      const nearby = await findNearbyBusinesses(latitude, longitude, 5);
      setSectionContacts([]);
      setSectionBusinesses(nearby);
      setBusinessSortMode('distance');
      if (nearby.length === 0) {
        Alert.alert(
          tr('Sin negocios cercanos', 'No nearby businesses'),
          tr('No encontramos negocios en un radio de 5 millas.', 'We found no businesses within 5 miles.')
        );
      }
    } catch (error) {
      console.error('Error finding nearby:', error);
      Alert.alert(
        tr('Error', 'Error'),
        tr('Error buscando negocios cercanos', 'Error searching nearby businesses')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleNearby = async () => {
    const existing = getSearchSessionCoordinates();
    if (existing) {
      await runNearbyWithCoords(existing.latitude, existing.longitude);
      return;
    }
    const r = await startSearchLocationSession();
    if (r.ok) {
      await runNearbyWithCoords(r.latitude, r.longitude);
    } else {
      Alert.alert(
        tr('Ubicación no disponible', 'Location unavailable'),
        tr('Activa el permiso de ubicación para usar Cercanos.', 'Enable location permission to use Nearby.'),
      );
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReceivedContactsForMarket();
    setRefreshing(false);
  };

  const handleCreateBusinessCard = async () => {
    // [CUARENTENA] Flujo de business card deshabilitado temporalmente
    // const authenticated = await hardLockCheck('crear una tarjeta de negocio');
    // if (!authenticated) {
    //   return;
    // }
    // router.push('/createBusinessCard');
  };

  const renderHeader = () => (
    <View style={styles.container}>
      {/* Búsqueda Principal */}
      <View style={styles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={20} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder={tr('Busca: Nails, Hair, Cosmetología...', 'Search: Nails, Hair, Cosmetology...')}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          placeholderTextColor="#999"
        />
        {searchQuery.trim().length > 0 ? (
          <TouchableOpacity
            onPress={handleSearchWithDistance}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={tr('Buscar (ubicación)', 'Search (location)')}
          >
            <MaterialCommunityIcons name="map-marker-radius" size={22} color={palette.ctaPrimary} />
          </TouchableOpacity>
        ) : null}
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              Keyboard.dismiss();
              setSearchQuery('');
            }}
            accessibilityLabel={tr('Limpiar búsqueda', 'Clear search')}
          >
            <MaterialCommunityIcons name="close" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Botones de Acción */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, styles.searchButton]}
          onPress={handleSearch}
          disabled={loading}
        >
          <MaterialCommunityIcons name="magnify" size={16} color="#FFF" />
          <Text style={styles.actionButtonText}>{tr('Buscar', 'Search')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.locationButton]}
          onPress={handleNearby}
          disabled={loading}
        >
          <MaterialCommunityIcons
            name={isSearchLocationSessionActive() ? 'map-marker' : 'map-marker-outline'}
            size={16}
            color="#FFF"
          />
          <Text style={styles.actionButtonText}>{tr('Cercanos', 'Nearby')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.createButton]}
          onPress={handleCreateBusinessCard}
          disabled={loading}
        >
          <MaterialCommunityIcons name="plus-circle" size={16} color="#FFF" />
          <Text style={styles.actionButtonText}>{tr('Crear', 'Create')}</Text>
        </TouchableOpacity>
      </View>

      {sectionBusinesses.length > 0 ? (
        <View style={[styles.sortRow, { borderColor: palette.border, backgroundColor: palette.surfaceMuted }]}>
          <MaterialCommunityIcons name="sort-variant" size={18} color={palette.textSecondary} />
          <Text style={[styles.sortRowLabel, { color: palette.textSecondary }]}>
            {tr('Orden · Tarjetas de negocio', 'Sort · Business Cards')}
          </Text>
          <TouchableOpacity
            onPress={() => setBusinessSortMode('distance')}
            style={[
              styles.sortChip,
              { borderColor: palette.border },
              businessSortMode === 'distance' && { backgroundColor: palette.ctaPrimary, borderColor: palette.ctaPrimary },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: businessSortMode === 'distance' }}
          >
            <Text
              style={[
                styles.sortChipText,
                { color: businessSortMode === 'distance' ? '#FFFFFF' : palette.textPrimary },
              ]}
            >
              {tr('Distancia', 'Distance')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setBusinessSortMode('rating')}
            style={[
              styles.sortChip,
              { borderColor: palette.border },
              businessSortMode === 'rating' && { backgroundColor: palette.ctaPrimary, borderColor: palette.ctaPrimary },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: businessSortMode === 'rating' }}
          >
            <Text
              style={[
                styles.sortChipText,
                { color: businessSortMode === 'rating' ? '#FFFFFF' : palette.textPrimary },
              ]}
            >
              {tr('Estrellas', 'Stars')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {(() => {
        const exp = getSearchSessionExpiresAt();
        const remainingSec = exp ? Math.max(0, Math.ceil((exp - Date.now()) / 1000)) : 0;
        const mm = Math.floor(remainingSec / 60);
        const ss = remainingSec % 60;
        const clock = `${mm}:${String(ss).padStart(2, '0')}`;
        return exp ? (
          <View style={[styles.sessionBanner, { borderColor: palette.border, backgroundColor: palette.surfaceMuted }]}>
            <MaterialCommunityIcons name="map-marker-radius" size={20} color={palette.ctaAccent} />
            <View style={styles.sessionBannerTextCol}>
              <Text style={[styles.gpsInfoHeadline, { color: palette.textPrimary }]}>
                {tr('Ubicación: solo al usar la app', 'Location: only while you use the app')}
              </Text>
              <Text style={[styles.sessionBannerText, { color: palette.textSecondary }]}>
                {tr(
                  `Activa para esta pantalla. Tiempo restante ${clock} (máx. ${sessionMinutes} min). Sin rastreo en segundo plano.`,
                  `Active for this screen. Time left ${clock} (max ${sessionMinutes} min). No background tracking.`,
                )}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => endSearchLocationSession()}
              accessibilityRole="button"
              accessibilityLabel={tr('Dejar de usar ubicación', 'Stop using location')}
            >
              <Text style={[styles.sessionBannerEnd, { color: palette.ctaPrimary }]}>{tr('Detener', 'Stop')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.gpsInfo, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
            <MaterialCommunityIcons name="shield-lock-outline" size={20} color={palette.ctaPrimary} />
            <View style={styles.gpsInfoTextCol}>
              <Text style={[styles.gpsInfoHeadline, { color: palette.textPrimary }]}>
                {tr('Ubicación: solo al usar la app', 'Location: only while you use the app')}
              </Text>
              <Text style={[styles.gpsInfoText, { color: palette.textSecondary }]}>
                {tr(
                  `La búsqueda por texto no requiere GPS. Si usas el icono de ubicación o «Cercanos», compartes posición solo en primer plano; dejamos de usarla a los ${sessionMinutes} min. Puedes revocar el permiso en Ajustes.`,
                  `Text search does not need GPS. If you use the location icon or «Nearby», you share position in the foreground only; we stop after ${sessionMinutes} min. You can revoke permission in Settings.`,
                )}
              </Text>
            </View>
          </View>
        );
      })()}

      {allMarketRows.length > 0 ? (
        <View style={styles.resultHeader}>
          <Text style={[styles.resultTitle, { color: palette.textPrimary }]}>
            {allMarketRows.length}{' '}
            {allMarketRows.length !== 1
              ? tr('resultados', 'results')
              : tr('resultado', 'result')}
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

    const facets = item.receivedContactFacets ?? [];
    const emailAddr = extractEmailFromFacets(facets);
    const waUrl = extractWhatsAppUrlFromFacets(facets);

    if (!isMarketBusiness) {
      return (
        <Pressable
          style={({ pressed }) => [
            styles.resultCard,
            styles.resultCardReceived,
            { backgroundColor: palette.surface, borderColor: palette.border },
            pressed && styles.pressedCard,
          ]}
        >
          <View style={styles.receivedCardColumn}>
            <View style={styles.receivedTopRow}>
              {item.card.businessLogo ? (
                <ExpoImage
                  source={{ uri: item.card.businessLogo }}
                  style={styles.receivedAvatar}
                  cachePolicy="disk"
                />
              ) : (
                <View
                  style={[
                    styles.receivedAvatar,
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
              <View style={styles.cardContentFlat}>
                <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>{item.card.businessName}</Text>
                <Text style={[styles.cardSubtitle, { color: palette.textSecondary }]} numberOfLines={2}>
                  {item.card.businessDescription}
                </Text>
              </View>
            </View>
            <View style={[styles.contactHeroRow, { borderTopColor: palette.border }]}>
              <Pressable
                style={({ pressed }) => [
                  styles.contactHeroBtn,
                  styles.contactHeroBtnCall,
                  !item.card.ownerUid && styles.contactHeroBtnDisabled,
                  pressed && styles.pressedCta,
                ]}
                disabled={!item.card.ownerUid}
                onPress={() => void openReceivedPrivateCall(item)}
                accessibilityRole="button"
                accessibilityLabel={tr('Llamada privada', 'Private call')}
              >
                <MaterialCommunityIcons name="phone-in-talk" size={26} color="#0A2540" />
                <Text style={[styles.contactHeroLabel, { color: palette.textPrimary }]}>
                  {tr('Llamada\nprivada', 'Private\ncall')}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.contactHeroBtn,
                  styles.contactHeroBtnWa,
                  !waUrl && styles.contactHeroBtnDisabled,
                  pressed && styles.pressedCta,
                ]}
                onPress={() => {
                  if (!waUrl) {
                    Alert.alert(
                      tr('WhatsApp', 'WhatsApp'),
                      tr('No hay enlace de WhatsApp en la tarjeta compartida.', 'No WhatsApp link on this shared card.'),
                    );
                    return;
                  }
                  Linking.openURL(waUrl).catch(() =>
                    Alert.alert(tr('Error', 'Error'), tr('No se pudo abrir WhatsApp.', 'Could not open WhatsApp.')),
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel={tr('WhatsApp', 'WhatsApp')}
              >
                <MaterialCommunityIcons name="whatsapp" size={26} color="#128C7E" />
                <Text style={[styles.contactHeroLabel, { color: palette.textPrimary }]}>{tr('WhatsApp', 'WhatsApp')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.contactHeroBtn,
                  styles.contactHeroBtnMail,
                  !emailAddr && styles.contactHeroBtnDisabled,
                  pressed && styles.pressedCta,
                ]}
                onPress={() => {
                  if (!emailAddr) {
                    Alert.alert(
                      tr('Correo', 'Email'),
                      tr('No hay correo en la tarjeta compartida.', 'No email on this shared card.'),
                    );
                    return;
                  }
                  void ActionController.ActionEmail({ value: emailAddr });
                }}
                accessibilityRole="button"
                accessibilityLabel={tr('Correo', 'Email')}
              >
                <MaterialCommunityIcons name="email-outline" size={26} color="#1EA7FF" />
                <Text style={[styles.contactHeroLabel, { color: palette.textPrimary }]}>{tr('Correo', 'Email')}</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      );
    }

    return (
      <Pressable
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
    );
  };

  return (
    <View style={[styles.wrapper, { backgroundColor: palette.background }]}> 
      <SectionList
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
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
        ListHeaderComponent={renderHeader}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !loading && listSections.length === 0 ? (
            <Pressable onPress={Keyboard.dismiss} style={styles.emptyState}>
              <MaterialCommunityIcons name="magnify" size={64} color="#CCC" />
              {searchQuery.trim().length > 0 ? (
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

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#1EA7FF" />
        </View>
      )}

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
  container: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 14,
    color: '#0A2540',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 8,
    gap: 6,
  },
  searchButton: {
    backgroundColor: '#1EA7FF',
  },
  locationButton: {
    backgroundColor: '#2ECC71',
  },
  createButton: {
    backgroundColor: '#C5A065',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  sortRowLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  sortChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  gpsWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  gpsWarningText: {
    flex: 1,
    fontSize: 12,
    color: '#FF6B6B',
    fontWeight: '500',
  },
  sessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  sessionBannerTextCol: {
    flex: 1,
    gap: 2,
  },
  sessionBannerText: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  gpsInfoTextCol: {
    flex: 1,
    gap: 4,
  },
  gpsInfoHeadline: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  sessionBannerEnd: {
    fontSize: 12,
    fontWeight: '800',
  },
  gpsInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  gpsInfoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  resultHeader: {
    paddingVertical: 8,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
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
  contactHeroRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  contactHeroBtn: {
    flex: 1,
    minHeight: 78,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  contactHeroBtnCall: {
    backgroundColor: 'rgba(197, 160, 101, 0.22)',
  },
  contactHeroBtnWa: {
    backgroundColor: 'rgba(37, 211, 102, 0.18)',
  },
  contactHeroBtnMail: {
    backgroundColor: 'rgba(30, 167, 255, 0.16)',
  },
  contactHeroBtnDisabled: {
    opacity: 0.38,
  },
  contactHeroLabel: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 13,
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});
