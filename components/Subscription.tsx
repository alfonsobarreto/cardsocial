import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getActiveUserId } from '@/services/authSession';
import GoldenRingButton from './GoldenRingButton';
import { purchaseBusinessCard } from '@/services/businessCardPaywallService';
import Purchases from '@/services/purchasesStub';
import { Platform } from 'react-native';

const { width } = Dimensions.get('window');

interface SubscriptionProps {
  onClose?: () => void;
}

/**
 * Tienda del Búnker - Panel comercial
 * Muestra Base Gratis vs Licencia Anual por Tarjeta, packs de créditos y activación de negocio
 */
const Subscription: React.FC<SubscriptionProps> = ({ onClose }) => {
  const [userId, setUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [subscribingPack, setSubscribingPack] = useState<string | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  // Credit packs: $1 = 10 CS
  const creditPacks = [
    { id: 'pack_100', credits: 100, price: 9.99, displayPrice: '$9.99', productId: 'card_social_credits_100' },
    { id: 'pack_500', credits: 500, price: 39.99, displayPrice: '$39.99', productId: 'card_social_credits_500' },
    { id: 'pack_1000', credits: 1000, price: 79.99, displayPrice: '$79.99', productId: 'card_social_credits_1000', popular: true },
    { id: 'pack_5000', credits: 5000, price: 349.99, displayPrice: '$349.99', productId: 'card_social_credits_5000' },
  ];

  const businessCardPriceAnnual = 49.99;

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const uid = await getActiveUserId();
      if (!uid) return;

      setUserId(uid);
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBuyCreditPack = async (pack: typeof creditPacks[0]) => {
    try {
      setSubscribingPack(pack.id);

      // Use RevenueCat to purchase the credit pack
      const purchaseResult = await Purchases.purchaseProduct(pack.productId);
      
      if (purchaseResult.customerInfo.entitlements.active[pack.productId]) {
        Alert.alert('✅ ¡Éxito!', `Se acreditaron ${pack.credits} CS a tu cuenta`);
        // TODO: Call backend to add credits to user account
      }
    } catch (error: any) {
      if (error.userCancelled) {
        // User cancelled
      } else {
        Alert.alert('Error', 'No se pudo procesar la compra');
        console.error('Purchase error:', error);
      }
    } finally {
      setSubscribingPack(null);
    }
  };

  const handleUpgradeBusinessCard = async () => {
    try {
      setUpgradeLoading(true);
      const platform = Platform.OS as 'ios' | 'android';
      
      const result = await purchaseBusinessCard(
        platform,
        false,
        `business_annual_${Date.now()}`,
        userId
      );

      if (result.success) {
        Alert.alert(
          '✅ ¡Tarjeta de Negocio Activada!',
          `Tu licencia anual quedó activa. Recibiste ${result.cashbackCredits || 1000} Monedas CS para gastar en tienda.`
        );
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      console.error('Business card purchase error:', error);
      Alert.alert('Error', 'No se pudo procesar la compra');
    } finally {
      setUpgradeLoading(false);
    }
  };

  const handleRestorePurchases = async () => {
    try {
      await Purchases.restorePurchases();
      Alert.alert('✅ Restaurado', 'Se han restaurado tus compras anteriores');
    } catch (error) {
      console.error('Restore purchases error:', error);
      Alert.alert('Error', 'No se pudieron restaurar las compras');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      bounces={false}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <LinearGradient colors={['#0A2540', '#1A3D5C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <MaterialCommunityIcons name="store" size={32} color="#C5A065" />
        <Text style={styles.headerTitle}>Tienda del Búnker</Text>
        <Text style={styles.headerSubtitle}>Créditos y Licencias Anuales por Tarjeta</Text>
      </LinearGradient>

      {/* COMPARISON TABLE: Base Gratis vs Licencia Anual */}
      <View style={styles.tableSection}>
        <Text style={styles.sectionTitle}>Compara tu Acceso</Text>

        <View style={styles.comparisonTable}>
          {/* Header Row */}
          <View style={styles.tableRow}>
            <View style={[styles.tableCell, { flex: 2 }]}>
              {/* Empty cell */}
            </View>
            <LinearGradient
              colors={['#F8F9FA', '#E8EAED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.tableCell, styles.tableCellFree]}
            >
              <Text style={styles.tableCellHeader}>Gratuito</Text>
            </LinearGradient>
            <LinearGradient
              colors={['#C5A065', '#B8944C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.tableCell, styles.tableCellPremium]}
            >
              <Text style={[styles.tableCellHeader, { color: '#0A2540', fontWeight: 'bold' }]}>Licencia Anual</Text>
            </LinearGradient>
          </View>

          {/* Feature Rows */}
          {[
            { feature: 'Editor y Constructor', free: 'Completo', premium: 'Completo' },
            { feature: 'Skins/Íconos comprados', free: 'Activos', premium: 'Activos' },
            { feature: 'Stories CTA de Negocio', free: 'No', premium: 'Sí' },
            { feature: 'Prioridad Social Market', free: 'No', premium: 'Sí' },
            { feature: 'QR Branded + Descarga', free: 'No', premium: 'Sí' },
            { feature: 'Cashback por Activación', free: '0 CS', premium: '1,000 CS' },
            { feature: 'Modelo de Cobro', free: 'Sin suscripción global', premium: '$49.99/año por tarjeta' },
          ].map((row, idx) => (
            <View key={idx} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
              <View style={[styles.tableCell, { flex: 2 }]}>
                <Text style={styles.featureName}>{row.feature}</Text>
              </View>
              <View style={[styles.tableCell, styles.tableCellFree]}>
                <Text style={styles.featureValue}>{row.free}</Text>
              </View>
              <View style={[styles.tableCell, styles.tableCellPremium]}>
                <Text style={[styles.featureValue, { color: '#0A2540', fontWeight: '600' }]}>{row.premium}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* CREDIT PACKS SECTION */}
      <View style={styles.creditsSection}>
        <Text style={styles.sectionTitle}>Packs de Créditos</Text>
        <Text style={styles.sectionSubtitle}>$1 USD = 10 CS • Úsalos en Stories VIP y más</Text>

        <View style={styles.packGrid}>
          {creditPacks.map((pack) => (
            <View
              key={pack.id}
              style={[
                styles.packCard,
                pack.popular && styles.packCardPopular,
              ]}
            >
              {pack.popular && (
                <LinearGradient
                  colors={['#C5A065', '#E8C547']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.popularBadge}
                >
                  <Text style={styles.popularBadgeText}>POPULAR</Text>
                </LinearGradient>
              )}

              <Text style={styles.packCredits}>{pack.credits}</Text>
              <Text style={styles.packCreditsLabel}>Créditos</Text>

              <View style={styles.packDivider} />

              <Text style={styles.packPrice}>{pack.displayPrice}</Text>

              <GoldenRingButton
                label={subscribingPack === pack.id ? 'Comprando...' : 'Comprar'}
                onPress={() => handleBuyCreditPack(pack)}
                icon={subscribingPack === pack.id ? 'loading' : 'shopping-outline'}
                disabled={subscribingPack !== null}
                loading={subscribingPack === pack.id}
                style={styles.packButton}
              />
            </View>
          ))}
        </View>
      </View>

      {/* BUSINESS CARD UPGRADE */}
      <View style={styles.businessSection}>
        <LinearGradient colors={['#1A3D5C', '#0A2540']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.businessCard}>
          <View style={styles.businessHeader}>
            <MaterialCommunityIcons name="briefcase-check" size={28} color="#C5A065" />
            <View style={{ flex: 1 }}>
              <Text style={styles.businessTitle}>Tarjeta de Negocio Anual</Text>
              <Text style={styles.businessSubtitle}>Acceso prioritario a Social Market</Text>
            </View>
          </View>

          <View style={styles.businessDetails}>
            <View style={styles.businessBenefit}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#2ECC71" />
              <Text style={styles.businessBenefitText}>Presencia en Social Market</Text>
            </View>
            <View style={styles.businessBenefit}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#2ECC71" />
              <Text style={styles.businessBenefitText}>Geolocalización automática</Text>
            </View>
            <View style={styles.businessBenefit}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#2ECC71" />
              <Text style={styles.businessBenefitText}>Analytics y métricas</Text>
            </View>
            <View style={styles.businessBenefit}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#2ECC71" />
              <Text style={styles.businessBenefitText}>Calificaciones de clientes</Text>
            </View>
            <View style={styles.businessBenefit}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#2ECC71" />
              <Text style={styles.businessBenefitText}>Cashback inmediato: 1,000 Monedas CS</Text>
            </View>
          </View>

          <View style={styles.businessPricingContainer}>
            <View style={styles.businessPricingRow}>
              <Text style={styles.businessPriceLabel}>Pago anual único:</Text>
              <Text style={styles.businessPriceRegular}>${businessCardPriceAnnual.toFixed(2)}/año</Text>
            </View>
            <View
              style={[
                styles.businessPricingRow,
                { backgroundColor: 'rgba(46, 204, 113, 0.2)', paddingVertical: 8, marginVertical: 8, borderRadius: 8 },
              ]}
            >
              <Text style={styles.businessPriceLabel}>Retorno en CS:</Text>
              <Text
                style={[
                  styles.businessPrice,
                  { color: '#2ECC71', fontWeight: '700', fontSize: 18 },
                ]}
              >
                +1000 CS (100%)
              </Text>
            </View>
          </View>

          <GoldenRingButton
            label={upgradeLoading ? 'Comprando...' : 'Activar Negocio'}
            onPress={handleUpgradeBusinessCard}
            icon={upgradeLoading ? 'loading' : 'badge-account'}
            disabled={upgradeLoading}
            loading={upgradeLoading}
            style={styles.businessButton}
          />
        </LinearGradient>
      </View>

      {/* LEGAL & RESTORE */}
      <View style={styles.legalSection}>
        <Text style={styles.legalTitle}>Términos Comerciales</Text>
        <Text style={styles.legalText}>
          • Cada tarjeta de negocio se licencia por 12 meses desde su activación.{"\n"}
          • Los precios pueden variar según tu país y tipo de dispositivo.{'\n'}
          • Al comprar, aceptas nuestros Términos y Condiciones.{'\n'}
          • Los créditos no son reembolsables ni transferibles.{'\n'}
          • Card-Social se reserva el derecho de cambiar precios con notificación previa.
        </Text>

        <TouchableOpacity style={styles.restoreButton} onPress={handleRestorePurchases}>
          <MaterialCommunityIcons name="history" size={18} color="#0A2540" />
          <Text style={styles.restoreButtonText}>Restaurar Compras (Obligatorio Apple)</Text>
        </TouchableOpacity>
      </View>

      {/* FOOTER PADDING */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  contentContainer: {
    paddingBottom: 20,
  },

  // HEADER
  header: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0A2540',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },

  // COMPARISON TABLE
  tableSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0A2540',
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  comparisonTable: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  tableRow: {
    flexDirection: 'row',
    minHeight: 44,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EAED',
  },
  tableRowAlt: {
    backgroundColor: '#F5F5F5',
  },
  tableCell: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
  },
  tableCellFree: {
    backgroundColor: '#F8F9FA',
  },
  tableCellPremium: {
    backgroundColor: 'rgba(197, 160, 101, 0.15)',
  },
  tableCellHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0A2540',
  },
  featureName: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
    textAlign: 'left',
  },
  featureValue: {
    fontSize: 12,
    color: '#666',
  },

  // CREDIT PACKS
  creditsSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  packGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  packCard: {
    width: (width - 52) / 2,
    borderRadius: 12,
    backgroundColor: '#FFF',
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    position: 'relative',
  },
  packCardPopular: {
    borderColor: '#C5A065',
    borderWidth: 2,
    shadowColor: '#C5A065',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  popularBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0A2540',
    letterSpacing: 1,
  },
  packCredits: {
    fontSize: 24,
    fontWeight: '700',
    color: '#C5A065',
    marginTop: 8,
  },
  packCreditsLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 12,
  },
  packDivider: {
    width: '80%',
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 12,
  },
  packPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0A2540',
    marginBottom: 10,
  },
  packButton: {
    width: '90%',
    marginTop: 10,
  },

  // BUSINESS CARD
  businessSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  businessCard: {
    borderRadius: 16,
    padding: 20,
    overflow: 'hidden',
  },
  businessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  businessTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  businessSubtitle: {
    fontSize: 12,
    color: '#CCC',
    marginTop: 2,
  },
  businessDetails: {
    marginVertical: 16,
    gap: 8,
  },
  businessBenefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  businessBenefitText: {
    fontSize: 12,
    color: '#E8EAED',
  },
  businessPricingContainer: {
    marginVertical: 16,
    paddingHorizontal: 12,
  },
  businessPricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  businessPriceLabel: {
    fontSize: 12,
    color: '#CCC',
    fontWeight: '500',
  },
  businessPriceRegular: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
    textDecorationLine: 'line-through',
  },
  businessPrice: {
    fontSize: 16,
    color: '#C5A065',
    fontWeight: '700',
  },
  businessButton: {
    width: '100%',
    marginTop: 12,
  },

  // LEGAL
  legalSection: {
    paddingHorizontal: 16,
  },
  legalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A2540',
    marginBottom: 8,
  },
  legalText: {
    fontSize: 11,
    color: '#666',
    lineHeight: 18,
    marginBottom: 16,
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#C5A065',
    borderRadius: 8,
  },
  restoreButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0A2540',
  },
});

export default Subscription;
