/**
 * Improved Search Screen with Social Market
 * Búsqueda Fuzzy + Geolocalización + Business Cards
 */

import { getActiveUserId } from '@/services/authSession';
import { ExportBusinessQR, generatePermanentBusinessLink } from '@/services/brandedQrService';
import { deriveBusinessCardLifecycleSnapshot } from '@/services/businessCardLifecycleService';
import { hasActiveBusinessLicense } from '@/services/businessLicenseService';
import { db } from '@/services/firebaseConfig';
import {
    getCurrentLocation,
    hasLocationPermission,
    requestLocationPermission,
} from '@/services/geolocationService';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { findNearbyBusinesses, searchSocialMarket } from '@/services/searchService';
import { BusinessCardSearchResult, GeoLocation } from '@/types/businessCard';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

interface MyContact {
  id: string;
  title: string;
  type: string;
  value: string;
}

export default function SearchScreen() {
  const router = useRouter();
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const { language } = useLanguage();
  const tr = (es: string, en: string) => language === 'en' ? en : es;
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [results, setResults] = useState<BusinessCardSearchResult[]>([]);
  const [myContacts, setMyContacts] = useState<MyContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState<GeoLocation | null>(null);
  const [hasLocationAccess, setHasLocationAccess] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [cardLifecycleState, setCardLifecycleState] = useState<Record<string, string>>({});
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

  useEffect(() => {
    loadMyContacts();
    checkLocationPermission();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadLicenseStatus = async () => {
      if (!results.length) {
        setLicenseStatus({});
        return;
      }

      const statuses = await Promise.all(
        results.map(async (result) => {
          const active = await hasActiveBusinessLicense(result.card.ownerUid, result.card.id);
          return [result.card.id, active] as const;
        })
      );
      const lifecycleEntries = results.map((result) => {
        const lifecycle = deriveBusinessCardLifecycleSnapshot(result.card);
        return [result.card.id, lifecycle.state] as const;
      });

      if (!cancelled) {
        setLicenseStatus(Object.fromEntries(statuses));
        setCardLifecycleState(Object.fromEntries(lifecycleEntries));
      }
    };

    void loadLicenseStatus();

    return () => {
      cancelled = true;
    };
  }, [results]);

  const loadMyContacts = async () => {
    try {
      const userId = await getActiveUserId();
      if (userId) {
        const contactsSnapshot = await getDocs(
          collection(db, 'users', userId, 'links')
        );
        const contacts = contactsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as MyContact[];
        setMyContacts(contacts);
      }
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  const checkLocationPermission = async () => {
    const hasPermission = await hasLocationPermission();
    setHasLocationAccess(hasPermission);
  };

  const handleLocationRequest = async () => {
    try {
      const granted = await requestLocationPermission();
      if (granted) {
        setHasLocationAccess(true);
        const location = await getCurrentLocation();
        if (location) {
          setUserLocation(location);
          Alert.alert(tr('✅ GPS Activado', '✅ GPS Activated'), tr('Ahora buscaremos negocios cercanos', 'Now we will search nearby businesses'));
        }
      } else {
        Alert.alert(tr('❌ Permiso Denegado', '❌ Permission Denied'), tr('Sin GPS no puedo buscar negocios cercanos', 'Without GPS I cannot search nearby businesses'));
      }
    } catch (error) {
      console.error('Error requesting location:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert(tr('Error', 'Error'), tr('Ingresa palabras clave para buscar', 'Enter keywords to search'));
      return;
    }

    setLoading(true);
    try {
      // Si no tenemos ubicación pero hay permiso, intentar obtenerla
      let location = userLocation;
      if (hasLocationAccess && !location) {
        location = await getCurrentLocation();
        if (location) setUserLocation(location);
      }

      const terms = searchQuery.split(' ').filter((t) => t.length > 0);

      const searchResults = await searchSocialMarket(
        terms,
        myContacts as any, // Type casting - same structure, different interface
        location?.latitude,
        location?.longitude,
        5 // radiusMiles
      );

      setResults(searchResults);

      if (searchResults.length === 0) {
        Alert.alert(tr('Sin Resultados', 'No Results'), tr('No encontramos coincidencias con esa búsqueda', 'We found no matches for that search'));
      }
    } catch (error) {
      console.error('Error searching:', error);
      Alert.alert(tr('Error', 'Error'), tr('Error en la búsqueda', 'Search error'));
    } finally {
      setLoading(false);
    }
  };

  const handleNearby = async () => {
    if (!hasLocationAccess) {
      Alert.alert(
        'GPS Requerido',
        '¿Activar GPS para encontrar negocios cercanos?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Activar GPS', onPress: handleLocationRequest },
        ]
      );
      return;
    }

    setLoading(true);
    try {
      let location = userLocation;
      if (!location) {
        location = await getCurrentLocation();
        if (location) setUserLocation(location);
      }

      if (!location) {
        Alert.alert(tr('Error', 'Error'), tr('No se pudo obtener tu ubicación', 'Could not get your location'));
        setLoading(false);
        return;
      }

      const nearby = await findNearbyBusinesses(
        location.latitude,
        location.longitude,
        5 // 5 millas
      );

      setResults(nearby);

      if (nearby.length === 0) {
        Alert.alert(
          'Sin Negocios Cercanos',
          'No encontramos negocios en un radio de 5 millas'
        );
      }
    } catch (error) {
      console.error('Error finding nearby:', error);
      Alert.alert(tr('Error', 'Error'), tr('Error buscando negocios cercanos', 'Error searching nearby businesses'));
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMyContacts();
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
          onChangeText={(text) => {
            setSearchQuery(text);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (text.trim().length >= 2) {
              debounceRef.current = setTimeout(() => { void handleSearch(); }, 400);
            }
          }}
          onSubmitEditing={handleSearch}
          placeholderTextColor="#999"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityLabel={tr('Limpiar búsqueda', 'Clear search')}>
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
          <Text style={styles.actionButtonText}>Buscar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.locationButton]}
          onPress={handleNearby}
          disabled={loading}
        >
          <MaterialCommunityIcons
            name={hasLocationAccess ? 'map-marker' : 'map-marker-outline'}
            size={16}
            color="#FFF"
          />
          <Text style={styles.actionButtonText}>Cercanos</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.createButton]}
          onPress={handleCreateBusinessCard}
          disabled={loading}
        >
          <MaterialCommunityIcons name="plus-circle" size={16} color="#FFF" />
          <Text style={styles.actionButtonText}>Crear</Text>
        </TouchableOpacity>
      </View>

      {/* GPS Status */}
      {!hasLocationAccess && (
        <Pressable
          style={styles.gpsWarning}
          onPress={handleLocationRequest}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="information" size={16} color="#FF6B6B" />
          <Text style={styles.gpsWarningText}>Activa GPS para búsqueda por proximidad</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color="#FF6B6B" />
          </Pressable>
      )}

      {/* Resultados Header */}
      {results.length > 0 && (
        <View style={styles.resultHeader}>
          <Text style={styles.resultTitle}>
            {results.length} Resultado{results.length !== 1 ? 's' : ''} Encontrado
            {results.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}
    </View>
  );

  const renderResultCard = ({ item }: { item: BusinessCardSearchResult }) => {
    const lifecycleState = cardLifecycleState[item.card.id] || deriveBusinessCardLifecycleSnapshot(item.card).state;
    const hasLicense = licenseStatus[item.card.id] ?? (lifecycleState === 'trial_active' || lifecycleState === 'active_paid');
    const isDull = lifecycleState === 'dull';
    const canRenderQr = lifecycleState === 'trial_active' || lifecycleState === 'active_paid';
    const permanentLink = (item.card as any).permanent_business_link
      || generatePermanentBusinessLink(item.card.id, item.card.ownerUid || 'owner');

    const handleExportBusinessQr = async () => {
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

    return (
      <Pressable
        style={({ pressed }) => [
          styles.resultCard,
          { backgroundColor: palette.surface, borderColor: palette.border },
          isDull && styles.dullCard,
          pressed && styles.pressedCard,
        ]}
      >
        <View style={[styles.floatingQrWrap, isDull && styles.dullQrWrap]}>
          {canRenderQr ? (
            <QRCode
              value={permanentLink}
              size={76}
              color="#0A2540"
              backgroundColor="#FFFFFF"
              logo={item.card.businessLogo ? { uri: item.card.businessLogo } : undefined}
              logoSize={16}
              ecl="H"
            />
          ) : (
            <View style={styles.dullQrMask}>
              <MaterialCommunityIcons name="qrcode-remove" size={30} color="#4F5A68" />
              <Text style={styles.dullQrMaskText}>QR OFF</Text>
            </View>
          )}
        </View>

        {item.card.businessLogo ? (
          <ExpoImage
            source={{ uri: item.card.businessLogo }}
            style={[styles.cardImage, isDull && styles.dullCardImage]}
            cachePolicy="disk"
          />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder, isDull && styles.dullCardImage]}>
            <MaterialCommunityIcons name="store" size={40} color="#C5A065" />
          </View>
        )}

        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>{item.card.businessName}</Text>
          <Text style={[styles.cardSubtitle, { color: palette.textSecondary }]}> 
            {item.card.businessDescription}
          </Text>

          {isDull ? (
            <View style={styles.dullPill}>
              <Text style={styles.dullPillText}>{tr('Dull: inactiva (30 días)', 'Dull: inactive (30 days)')}</Text>
            </View>
          ) : null}

          <View style={styles.statsContainer}>
            <View style={styles.stat}>
              <MaterialCommunityIcons name="star" size={14} color="#C5A065" />
              <Text style={[styles.statText, { color: palette.textSecondary }]}>{item.card.averageRating.toFixed(1)}</Text>
            </View>

            {item.distanceMiles > 0 && (
              <View style={styles.stat}>
                <MaterialCommunityIcons name="map-marker" size={14} color="#1EA7FF" />
                <Text style={[styles.statText, { color: palette.textSecondary }]}>
                  {item.distanceMiles < 1 ? '<1 mi' : `${item.distanceMiles.toFixed(1)} mi`}
                </Text>
              </View>
            )}

            <View style={styles.stat}>
              <MaterialCommunityIcons name="check-circle" size={14} color="#2ECC71" />
              <Text style={[styles.statText, { color: palette.textSecondary }]}>Verificado</Text>
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
      <FlatList
        data={results}
        renderItem={renderResultCard}
        keyExtractor={(item) => item.card.id}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          !loading && results.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="magnify"
                size={64}
                color="#CCC"
              />
              <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>Busca algo...</Text>
              <Text style={styles.emptySubtitle}>
                Encuentra contactos o negocios cercanos
              </Text>
            </View>
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
  resultHeader: {
    paddingVertical: 8,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A2540',
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
  dullQrMask: {
    width: 76,
    height: 76,
    borderRadius: 10,
    backgroundColor: '#D3D8DE',
    borderWidth: 1,
    borderColor: '#AAB4BF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dullQrMaskText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4F5A68',
    letterSpacing: 0.5,
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
