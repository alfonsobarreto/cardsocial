import { getActiveUserId } from '@/services/authSession';
import { purchaseBusinessCard } from '@/services/businessCardPaywallService';
import { useLanguage } from '@/services/language';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Dimensions,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Purchases from 'react-native-purchases';
import GoldenRingButton from './GoldenRingButton';

const { width } = Dimensions.get('window');

// Traducción local
const useTr = () => {
  const { language } = useLanguage();
  return (es: string, en: string) => language === 'en' ? en : es;
};

interface SubscriptionProps {
  onClose?: () => void;
}

/**
 * Tienda del Búnker / Vault Store - Panel comercial
 * Muestra Base Gratis vs Licencia Anual por Tarjeta, packs de créditos y activación de negocio
 */
const Subscription: React.FC<SubscriptionProps> = ({ onClose }) => {
  const tr = useTr();
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
        Alert.alert('✅ ' + tr('¡Éxito!', 'Success!'), tr('Se acreditaron', 'You received') + ` ${pack.credits} CS ` + tr('a tu cuenta', 'to your account'));
        // TODO: Call backend to add credits to user account
      }
    } catch (error: any) {
      if (error.userCancelled) {
        // User cancelled
      } else {
        Alert.alert(tr('Error', 'Error'), tr('No se pudo procesar la compra', 'Could not process purchase'));
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
          '✅ ' + tr('¡Tarjeta de Negocio Activada!', 'Business Card Activated!'),
          tr('Tu licencia anual quedó activa. Recibiste', 'Your annual license is now active. You received') +
            ` ${result.cashbackCredits || 1000} ` +
            tr('Monedas CS para gastar en tienda.', 'CS Coins to spend in the store.')
        );
      } else {
        Alert.alert(tr('Error', 'Error'), result.message);
      }
    } catch (error) {
      console.error('Business card purchase error:', error);
      Alert.alert(tr('Error', 'Error'), tr('No se pudo procesar la compra', 'Could not process purchase'));
    } finally {
      setUpgradeLoading(false);
    }
  };

  const handleRestorePurchases = async () => {
    try {
      await Purchases.restorePurchases();
      Alert.alert('✅ ' + tr('Restaurado', 'Restored'), tr('Se han restaurado tus compras anteriores', 'Your previous purchases have been restored'));
    } catch (error) {
      console.error('Restore purchases error:', error);
      Alert.alert(tr('Error', 'Error'), tr('No se pudieron restaurar las compras', 'Could not restore purchases'));
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
        <Text style={styles.headerTitle}>{tr('Tienda del Búnker', 'Vault Store')}</Text>
        <Text style={styles.headerSubtitle}>{tr('Créditos y Licencias Anuales por Tarjeta', 'Credits and Annual Licenses per Card')}</Text>
      </LinearGradient>

      {/* COMPARISON TABLE: Base Gratis vs Licencia Anual */}
      <View style={styles.tableSection}>
        <Text style={styles.sectionTitle}>{tr('Compara tu Acceso', 'Compare your Access')}</Text>

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
              <Text style={styles.tableCellHeader}>{tr('Gratuito', 'Free')}</Text>
            </LinearGradient>
            <LinearGradient
              colors={['#C5A065', '#B8944C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.tableCell, styles.tableCellPremium]}
            >
              <Text style={[styles.tableCellHeader, { color: '#0A2540', fontWeight: 'bold' }]}>{tr('Licencia Anual', 'Annual License')}</Text>
            </LinearGradient>
          </View>

          {/* Feature Rows */}
          {[
            { feature: tr('Editor y Constructor', 'Editor & Builder'), free: tr('Completo', 'Full'), premium: tr('Completo', 'Full') },
            { feature: tr('Skins/Íconos comprados', 'Purchased Skins/Icons'), free: tr('Activos', 'Active'), premium: tr('Activos', 'Active') },
            { feature: tr('Stories CTA de Negocio', 'Business CTA Stories'), free: tr('No', 'No'), premium: tr('Sí', 'Yes') },
            { feature: tr('Prioridad Social Market', 'Social Market Priority'), free: tr('No', 'No'), premium: tr('Sí', 'Yes') },
            { feature: tr('QR Branded + Descarga', 'Branded QR + Download'), free: tr('No', 'No'), premium: tr('Sí', 'Yes') },
            { feature: tr('Cashback por Activación', 'Activation Cashback'), free: '0 CS', premium: '1,000 CS' },
            { feature: tr('Modelo de Cobro', 'Billing Model'), free: tr('Sin suscripción global', 'No global subscription'), premium: tr('$49.99/año por tarjeta', '$49.99/year per card') },
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
        <Text style={styles.sectionTitle}>{tr('Packs de Créditos', 'Credit Packs')}</Text>
        <Text style={styles.sectionSubtitle}>{tr('$1 USD = 10 CS • Úsalos en Stories VIP y más', '$1 USD = 10 CS • Use them in VIP Stories and more')}</Text>

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
                  <Text style={styles.popularBadgeText}>{tr('POPULAR', 'POPULAR')}</Text>
                </LinearGradient>
              )}

              <Text style={styles.packCredits}>{pack.credits}</Text>
              <Text style={styles.packCreditsLabel}>{tr('Créditos', 'Credits')}</Text>

              <View style={styles.packDivider} />

              <Text style={styles.packPrice}>{pack.displayPrice}</Text>

              <GoldenRingButton
                label={subscribingPack === pack.id ? tr('Comprando...', 'Purchasing...') : tr('Comprar', 'Buy')}
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
              <Text style={styles.businessTitle}>{tr('Tarjeta de Negocio Anual', 'Annual Business Card')}</Text>
              <Text style={styles.businessSubtitle}>{tr('Acceso prioritario a Social Market', 'Priority access to Social Market')}</Text>
            </View>
          </View>

          <View style={styles.businessDetails}>
            <View style={styles.businessBenefit}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#2ECC71" />
              <Text style={styles.businessBenefitText}>{tr('Presencia en Social Market', 'Presence in Social Market')}</Text>
            </View>
            <View style={styles.businessBenefit}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#2ECC71" />
              <Text style={styles.businessBenefitText}>{tr('Geolocalización automática', 'Automatic geolocation')}</Text>
            </View>
            <View style={styles.businessBenefit}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#2ECC71" />
              <Text style={styles.businessBenefitText}>{tr('Analytics y métricas', 'Analytics and metrics')}</Text>
            </View>
            <View style={styles.businessBenefit}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#2ECC71" />
              <Text style={styles.businessBenefitText}>{tr('Calificaciones de clientes', 'Customer ratings')}</Text>
            </View>
            <View style={styles.businessBenefit}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#2ECC71" />
              <Text style={styles.businessBenefitText}>{tr('Cashback inmediato: 1,000 Monedas CS', 'Instant cashback: 1,000 CS Coins')}</Text>
            </View>
          </View>

          <View style={styles.businessPricingContainer}>
            <View style={styles.businessPricingRow}>
              <Text style={styles.businessPriceLabel}>{tr('Pago anual único:', 'One-time annual payment:')}</Text>
              <Text style={styles.businessPriceRegular}>{`$${businessCardPriceAnnual.toFixed(2)}`}{tr('/año', '/year')}</Text>
            </View>
            <View
              style={[
                styles.businessPricingRow,
                { backgroundColor: 'rgba(46, 204, 113, 0.2)', paddingVertical: 8, marginVertical: 8, borderRadius: 8 },
              ]}
            >
              <Text style={styles.businessPriceLabel}>{tr('Retorno en CS:', 'Return in CS:')}</Text>
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
            label={upgradeLoading ? tr('Comprando...', 'Purchasing...') : tr('Activar Negocio', 'Activate Business')}
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
        <Text style={styles.legalTitle}>{tr('Términos Comerciales', 'Commercial Terms')}</Text>
        <Text style={styles.legalText}>
          • {tr('Cada tarjeta de negocio se licencia por 12 meses desde su activación.', 'Each business card is licensed for 12 months from activation.')} {'\n'}
          • {tr('Los precios pueden variar según tu país y tipo de dispositivo.', 'Prices may vary depending on your country and device type.')} {'\n'}
          • {tr('Al comprar, aceptas nuestros Términos y Condiciones.', 'By purchasing, you accept our Terms and Conditions.')} {'\n'}
          • {tr('Los créditos no son reembolsables ni transferibles.', 'Credits are non-refundable and non-transferable.')} {'\n'}
          • {tr('Card-Social se reserva el derecho de cambiar precios con notificación previa.', 'Card-Social reserves the right to change prices with prior notice.')}
        </Text>

        <TouchableOpacity style={styles.restoreButton} onPress={handleRestorePurchases}>
          <MaterialCommunityIcons name="history" size={18} color="#0A2540" />
          <Text style={styles.restoreButtonText}>{tr('Restaurar Compras (Obligatorio Apple)', 'Restore Purchases (Apple Required)')}</Text>
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
