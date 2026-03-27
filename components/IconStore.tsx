/**
 * Icon Store - Tienda de Iconos
 * Los usuarios gratis compran packs de iconos con créditos CS
 * Los usuarios premium ven todos los packs como "Ya Desbloqueado"
 * 
 * Interfaz:
 * - Grid de packs disponibles con preview
 * - Precio en créditos
 * - Indicador de "Comprado" o "Premium"
 * - Botón de compra con validación de créditos
 * - Loader durante transacción
 */

import { getActiveUserId } from '@/services/authSession';
import { getUserCreditsBalance } from '@/services/creditsService';
import { getAvailableIconPacks, getUserPurchasedPacks, IconPack, purchaseIconPack } from '@/services/iconPackService';
import { useLookMode } from '@/services/lookMode';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 32) / 2; // 2 columnas con padding

interface IconStoreCardProps {
  pack: IconPack;
  isOwned: boolean;
  userCredits: number;
  onPurchase: (packId: string) => Promise<void>;
  loading: boolean;
}

type StoreSection = 'featured' | 'newest' | 'most_popular' | 'collectible' | 'out_of_stock' | 'retail';

const STORE_SECTIONS: Array<{ id: StoreSection; label: string }> = [
  { id: 'featured', label: 'Featured' },
  { id: 'newest', label: 'Newest' },
  { id: 'most_popular', label: 'Most Popular' },
  { id: 'collectible', label: 'Collectible' },
  { id: 'out_of_stock', label: 'Out of Stock' },
  { id: 'retail', label: 'Retail' },
];

/**
 * Card individual de un pack de iconos
 */
const IconPackCard: React.FC<IconStoreCardProps> = ({
  pack,
  isOwned,
  userCredits,
  onPurchase,
  loading,
}) => {
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const isLimitedEdition = Boolean(pack.isLimitedEdition);
  const stockRemaining = Math.max(0, Number(pack.current_supply ?? pack.stockRemaining ?? 0));
  const stockMax = Math.max(stockRemaining, Number(pack.max_supply ?? pack.stockTotal ?? 0));
  const isSoldOut = isLimitedEdition && stockRemaining <= 0;
  const hasEnoughCredits = userCredits >= pack.creditsPrice;
  const canPurchase = !isOwned && !loading && !isSoldOut;

  const rarityColors = {
    common: '#A9A9A9',
    rare: '#4169E1',
    epic: '#8B00FF',
    legendary: '#FFD700',
  };

  return (
    <LinearGradient
      colors={isNight ? ['#0F2C50', '#0A2540'] : ['#F8F9FA', '#FFFFFF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.packCard}
    >
      {/* Preview Image */}
      {pack.previewImages && pack.previewImages.length > 0 ? (
        <Image
          source={{ uri: pack.previewImages[0] }}
          style={styles.packPreview}
          resizeMode='cover'
        />
      ) : (
        <View style={[styles.packPreview, { backgroundColor: '#E0E0E0', justifyContent: 'center', alignItems: 'center' }]}>
          <Ionicons name='image-outline' size={40} color='#999' />
        </View>
      )}

      {/* Rarity Badge */}
      <View
        style={[
          styles.rarityBadge,
          { backgroundColor: rarityColors[pack.rarity] },
        ]}
      >
        <Text style={styles.rarityText}>{pack.rarity.toUpperCase()}</Text>
      </View>

      {/* Pack Info */}
      <View style={styles.packInfo}>
        <Text style={styles.packName}>{pack.name}</Text>
        <Text style={styles.packDescription} numberOfLines={2}>
          {pack.description}
        </Text>

        {/* Icon Count */}
        <View style={styles.iconCountBadge}>
          <Ionicons name='image-outline' size={14} color='#0A2540' />
          <Text style={styles.iconCountText}>{pack.iconCount} iconos</Text>
        </View>

        {isLimitedEdition && (
          <View style={[styles.stockBadge, isSoldOut && styles.stockBadgeSoldOut]}>
            <Ionicons
              name={isSoldOut ? 'close-circle-outline' : 'flame-outline'}
              size={13}
              color={isSoldOut ? '#FFFFFF' : '#7C4D00'}
            />
            <Text style={[styles.stockText, isSoldOut && styles.stockTextSoldOut]}>
              {isSoldOut ? 'Agotado' : `Solo quedan ${stockRemaining} de ${stockMax}`}
            </Text>
          </View>
        )}

        {/* Status or Price */}
        {isOwned ? (
          <View style={styles.ownedBadge}>
            <Ionicons name='checkmark-circle' size={16} color='#2ECC71' />
            <Text style={styles.ownedText}>Comprado</Text>
          </View>
        ) : (
          <View style={styles.priceContainer}>
            <Text style={styles.priceText}>{pack.creditsPrice} CS</Text>
            {!hasEnoughCredits && (
              <Text style={styles.insufficientText}>
                Necesitas {pack.creditsPrice - userCredits} CS más
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Purchase Button */}
      {canPurchase && (
        <TouchableOpacity
          style={[
            styles.purchaseButton,
            { opacity: hasEnoughCredits ? 1 : 0.5 },
          ]}
          onPress={() => onPurchase(pack.id)}
          disabled={!hasEnoughCredits || loading}
        >
          {loading ? (
            <ActivityIndicator size='small' color='#FFFFFF' />
          ) : (
            <>
              <Ionicons name='cart-outline' size={16} color='#FFFFFF' />
              <Text style={styles.purchaseButtonText}>Comprar</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {(isOwned || isSoldOut) && (
        <View style={styles.unlockedOverlay}>
          <Ionicons
            name={isSoldOut ? 'time-outline' : 'checkmark-done'}
            size={32}
            color={isSoldOut ? '#FFD27D' : '#2ECC71'}
          />
        </View>
      )}
    </LinearGradient>
  );
};

/**
 * Icon Store Screen Principal
 */
export default function IconStore() {
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const [packs, setPacks] = useState<IconPack[]>([]);
  const [userPurchased, setUserPurchased] = useState<string[]>([]);
  const [userCredits, setUserCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<StoreSection>('featured');

  useEffect(() => {
    const init = async () => {
      const uid = await getActiveUserId();
      setUserId(uid);
    };
    init();
  }, []);

  useEffect(() => {
    if (userId) {
      void loadIconStore(userId);
    }
  }, [userId]);

  const loadIconStore = async (resolvedUserId: string) => {
    try {
      setLoading(true);

      // 1. Obtener packs disponibles
      const availablePacks = await getAvailableIconPacks(resolvedUserId);
      setPacks(availablePacks);

      // 2. Obtener packs comprados por el usuario
      const purchased = await getUserPurchasedPacks(resolvedUserId);
      setUserPurchased(purchased.map((p) => p.packId));

      // 3. Obtener balance de créditos
      const credits = await getUserCreditsBalance(resolvedUserId);
      setUserCredits(credits);

    } catch (error) {
      console.error('Error loading icon store:', error);
      Alert.alert('Error', 'No se pudo cargar la tienda de iconos');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchasePack = async (packId: string) => {
    try {
      if (!userId) return;

      setPurchasing(packId);

      const success = await purchaseIconPack(userId, packId);

      if (success) {
        Alert.alert('✅ ¡Éxito!', 'Pack de iconos desbloqueado. Ya puedes usarlo en tus tarjetas.', [
          {
            text: 'Ir a Mi Bóveda',
            onPress: () => {
              // TODO: Navegar a Vault tab
            },
          },
          { text: 'OK', onPress: () => {} },
        ]);

        // Actualizar la lista de comprados
        const updated = await getUserPurchasedPacks(userId);
        setUserPurchased(updated.map((p) => p.packId));

        // Actualizar créditos
        const newCredits = await getUserCreditsBalance(userId);
        setUserCredits(newCredits);
      } else {
        Alert.alert('⚠️ Error', 'No tienes suficientes créditos o la compra falló.');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      Alert.alert('Error', 'Hubo un error al comprar el pack.');
    } finally {
      setPurchasing(null);
    }
  };

  const visiblePacks = useMemo(() => {
    const all = [...packs];
    const newest = [...all].sort((a, b) => {
      const aTs = Date.parse(String((a as any).createdAt || '')) || 0;
      const bTs = Date.parse(String((b as any).createdAt || '')) || 0;
      return bTs - aTs;
    });
    const mostPopular = [...all].sort((a, b) => Number(b.totalSales || 0) - Number(a.totalSales || 0));

    if (selectedSection === 'newest') return newest;
    if (selectedSection === 'most_popular') return mostPopular;
    if (selectedSection === 'collectible') {
      return all.filter((p) => Boolean((p as any).isCollectible) || Boolean(p.isLimitedEdition));
    }
    if (selectedSection === 'out_of_stock') {
      return all.filter((p) => Boolean(p.isLimitedEdition) && Math.max(0, Number((p as any).current_supply ?? p.stockRemaining ?? 0)) <= 0);
    }
    if (selectedSection === 'retail') {
      return all.filter((p) => !Boolean((p as any).isCollectible) && !Boolean(p.isLimitedEdition));
    }
    return all.filter((p) => p.storeSection === 'featured' || p.rarity === 'legendary' || p.rarity === 'epic');
  }, [packs, selectedSection]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size='large' color='#0A2540' />
        <Text style={styles.loadingText}>Cargando tienda de iconos...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: isNight ? '#0A2540' : '#F8F9FA' }]} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <LinearGradient
        colors={['#0A2540', '#1A4E7F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>🎨 Tienda de Iconos</Text>
        <Text style={styles.headerSubtitle}>Diseños exclusivos de Pochobs para tus tarjetas</Text>

        {/* Credits Display */}
        <View style={styles.creditsBar}>
          <Ionicons name='wallet-outline' size={20} color='#C5A065' />
          <Text style={styles.creditsText}>{userCredits} Créditos CS</Text>
          <TouchableOpacity style={styles.addCreditsButton}>
            <Ionicons name='add-circle-outline' size={18} color='#C5A065' />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Info Banner */}
      <View style={[styles.infoBanner, { backgroundColor: isNight ? '#0F2C50' : undefined }]}>
        <Ionicons name='sparkles-outline' size={20} color={isNight ? '#C5A065' : '#0A2540'} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.infoBannerTitle}>Drops de Edición Limitada</Text>
          <Text style={styles.infoBannerText}>Cuando el stock llega a 0, el drop queda agotado automáticamente</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionTabsWrap}>
        {STORE_SECTIONS.map((section) => (
          <TouchableOpacity
            key={section.id}
            style={[styles.sectionTab, selectedSection === section.id && styles.sectionTabActive]}
            onPress={() => setSelectedSection(section.id)}
          >
            <Text style={[styles.sectionTabText, selectedSection === section.id && styles.sectionTabTextActive]}>
              {section.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Icon Packs Grid */}
      <View style={styles.gridContainer}>
        <FlatList
          data={visiblePacks}
          keyExtractor={(item) => item.id}
          numColumns={2}
          scrollEnabled={false}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <IconPackCard
              pack={item}
              isOwned={userPurchased.includes(item.id)}
              userCredits={userCredits}
              onPurchase={handlePurchasePack}
              loading={purchasing === item.id}
            />
          )}
        />
      </View>

      {/* Empty State */}
      {visiblePacks.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name='search-outline' size={48} color='#CCC' />
          <Text style={styles.emptyStateText}>No hay packs disponibles en este momento</Text>
          <Text style={styles.emptyStateSubtext}>Vuelve pronto para nuevos diseños 🎨</Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Consejo: los drops legendarios se compran por orden de llegada.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },

  // Header
  header: {
    padding: 20,
    paddingTop: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 16,
  },
  creditsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  creditsText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#C5A065',
    marginHorizontal: 8,
  },
  addCreditsButton: {
    padding: 4,
  },

  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#E8F4F8',
    borderLeftWidth: 4,
    borderLeftColor: '#0A2540',
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 8,
  },
  infoBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A2540',
  },
  infoBannerText: {
    fontSize: 12,
    color: '#4A4A4A',
    marginTop: 2,
  },

  // Grid
  gridContainer: {
    paddingHorizontal: 16,
  },
  sectionTabsWrap: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 10,
  },
  sectionTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C4D7E2',
    backgroundColor: '#FFFFFF',
  },
  sectionTabActive: {
    borderColor: '#0A2540',
    backgroundColor: '#0A2540',
  },
  sectionTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4A4A4A',
  },
  sectionTabTextActive: {
    color: '#FFFFFF',
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  // Pack Card
  packCard: {
    width: CARD_WIDTH,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  packPreview: {
    width: '100%',
    height: 120,
    backgroundColor: '#E0E0E0',
  },
  rarityBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rarityText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  packInfo: {
    padding: 12,
  },
  packName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A2540',
    marginBottom: 4,
  },
  packDescription: {
    fontSize: 12,
    color: '#4A4A4A',
    marginBottom: 8,
    lineHeight: 16,
  },
  iconCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  iconCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0A2540',
    marginLeft: 4,
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 209, 102, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  stockBadgeSoldOut: {
    backgroundColor: '#BF360C',
  },
  stockText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7C4D00',
  },
  stockTextSoldOut: {
    color: '#FFFFFF',
  },
  priceContainer: {
    marginBottom: 8,
  },
  priceText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#C5A065',
  },
  insufficientText: {
    fontSize: 10,
    color: '#E74C3C',
    marginTop: 2,
  },
  ownedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  ownedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2ECC71',
    marginLeft: 6,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  premiumText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#C5A065',
    marginLeft: 6,
  },
  purchaseButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A2540',
    paddingVertical: 10,
    borderRadius: 8,
    marginHorizontal: 12,
    marginBottom: 12,
  },
  purchaseButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 6,
  },
  unlockedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A4A4A',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: '#999',
    marginTop: 8,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    fontSize: 14,
    color: '#4A4A4A',
    marginTop: 12,
  },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});
