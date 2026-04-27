import GoldenRingButton from '@/components/GoldenRingButton';
import palette from '@/app/theme';
import { getActiveUserId } from '@/services/authSession';
import {
  getBusinessCardPackageForPlatform,
  purchaseBusinessCard,
} from '@/services/businessCardPaywallService';
import { useLanguage, useTr } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { getTiersConfig, type TierKey, type TiersConfig } from '@/services/tiersConfigService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Purchases from 'react-native-purchases';

const { width } = Dimensions.get('window');

interface SubscriptionProps {
  onClose?: () => void;
}

/**
 * Tienda / planes: precios y límites desde `system_config/tiers` (CMS admin),
 * más compras in-app (RevenueCat) y licencia anual de tarjeta de negocio.
 */
const Subscription: React.FC<SubscriptionProps> = ({ onClose }) => {
  const tr = useTr();
  const { language } = useLanguage();
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];
  const router = useRouter();
  const intlLocale = language === 'en' ? 'en-US' : 'es-MX';

  const fmtUsd = useCallback(
    (n: number) =>
      new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n),
    [intlLocale],
  );

  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [tiers, setTiers] = useState<TiersConfig | null>(null);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [subscribingPack, setSubscribingPack] = useState<string | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const creditPacks = [
    { id: 'pack_100', credits: 100, price: 9.99, displayPrice: '$9.99', productId: 'card_social_credits_100' },
    { id: 'pack_500', credits: 500, price: 39.99, displayPrice: '$39.99', productId: 'card_social_credits_500' },
    { id: 'pack_1000', credits: 1000, price: 79.99, displayPrice: '$79.99', productId: 'card_social_credits_1000', popular: true },
    { id: 'pack_5000', credits: 5000, price: 349.99, displayPrice: '$349.99', productId: 'card_social_credits_5000' },
  ];

  const bizPackage = useMemo(() => getBusinessCardPackageForPlatform(Platform.OS as 'ios' | 'android'), []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const uid = await getActiveUserId();
        if (mounted && uid) setUserId(uid);
      } catch {
        /* ignore */
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await getTiersConfig();
        if (mounted) setTiers(cfg);
      } finally {
        if (mounted) setTiersLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: shell.backgroundSolid },
        content: { paddingBottom: 32 },
        header: {
          paddingHorizontal: 20,
          paddingVertical: 22,
          alignItems: 'center',
          marginBottom: 16,
        },
        headerCloseRow: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
        headerCloseHit: { padding: 6 },
        headerTitle: { fontSize: 22, fontWeight: '700', color: shell.fabText, marginTop: 10, textAlign: 'center' },
        headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.88)', marginTop: 6, textAlign: 'center' },
        section: { paddingHorizontal: 16, marginBottom: 22 },
        sectionTitle: { fontSize: 17, fontWeight: '700', color: shell.textPrimary, marginBottom: 10 },
        sectionHint: { fontSize: 12, color: shell.textSecondary, marginBottom: 12, lineHeight: 18 },
        tierCard: {
          borderRadius: 14,
          padding: 14,
          marginBottom: 10,
          backgroundColor: shell.surfaceMuted,
          borderWidth: 1,
          borderColor: shell.modalBorder,
        },
        tierCardHighlight: {
          borderColor: shell.ctaAccent,
          borderWidth: 2,
        },
        tierName: { fontSize: 16, fontWeight: '700', color: shell.textPrimary },
        tierPrice: { fontSize: 15, fontWeight: '600', color: shell.ctaAccent, marginTop: 4 },
        tierMeta: { fontSize: 12, color: shell.textSecondary, marginTop: 8, lineHeight: 18 },
        tierCta: {
          marginTop: 10,
          alignSelf: 'flex-start',
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: 10,
          backgroundColor: shell.ctaAccent,
        },
        tierCtaText: { fontSize: 12, fontWeight: '700', color: shell.emptyCtaText },
        addonRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: shell.modalBorder,
        },
        addonTitle: { fontSize: 14, fontWeight: '600', color: shell.textPrimary, flex: 1, paddingRight: 8 },
        addonPrice: { fontSize: 14, fontWeight: '700', color: shell.ctaAccent },
        addonNote: { fontSize: 11, color: shell.textMuted, marginTop: 4, flex: 1 },
        businessBlock: {
          borderRadius: 14,
          overflow: 'hidden',
          marginTop: 8,
        },
        businessInner: { padding: 16 },
        businessTitle: { fontSize: 16, fontWeight: '700', color: shell.fabText },
        businessSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
        legalBox: {
          marginTop: 8,
          padding: 12,
          borderRadius: 12,
          backgroundColor: shell.surfaceMuted,
          borderWidth: 1,
          borderColor: shell.modalBorder,
        },
        legalTitle: { fontSize: 13, fontWeight: '700', color: shell.textPrimary, marginBottom: 6 },
        legalText: { fontSize: 11, color: shell.textSecondary, lineHeight: 17 },
        restoreBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 12,
          marginTop: 14,
          backgroundColor: shell.ctaAccent,
          borderRadius: 10,
        },
        restoreTxt: { fontSize: 13, fontWeight: '600', color: shell.emptyCtaText },
        packGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
        packCard: {
          width: (width - 52) / 2,
          borderRadius: 12,
          paddingVertical: 14,
          paddingHorizontal: 10,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: shell.modalBorder,
          backgroundColor: shell.surfaceMuted,
        },
        packPopular: { borderColor: shell.ctaAccent, borderWidth: 2 },
        packCredits: { fontSize: 22, fontWeight: '700', color: shell.ctaAccent, marginTop: 6 },
        packLabel: { fontSize: 11, color: shell.textSecondary, marginBottom: 8 },
        packPrice: { fontSize: 16, fontWeight: '700', color: shell.textPrimary, marginBottom: 8 },
        nfcBtn: {
          marginTop: 12,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: shell.ctaAccent,
          alignSelf: 'flex-start',
        },
        nfcBtnText: { fontSize: 13, fontWeight: '600', color: shell.ctaAccent },
        loadingRow: { paddingVertical: 20, alignItems: 'center' },
      }),
    [shell],
  );

  const tierLabel = (key: TierKey) => {
    if (key === 'free') return tr('Gratis', 'Free');
    if (key === 'influencer') return tr('Influencer', 'Influencer');
    return tr('Business', 'Business');
  };

  const tierLines = (key: TierKey, t: TiersConfig) => {
    const lim = t[key];
    return [
      tr('Iconos (IconData)', 'Icons (IconData)') + `: ${lim.iconDataLimit}`,
      tr('Smart Cards', 'Smart Cards') + `: ${lim.smartCardsLimit}`,
      tr('Tarjetas negocio', 'Business cards') + `: ${lim.businessCardsLimit}`,
      lim.premiumThemes ? tr('Temas premium', 'Premium themes') : tr('Temas premium', 'Premium themes') + ': —',
    ].join('\n');
  };

  const onTierCta = (key: TierKey) => {
    if (key === 'free') {
      Alert.alert(tr('Plan Gratis', 'Free plan'), tr('Ya incluido con tu cuenta.', 'Already included with your account.'));
      return;
    }
    Alert.alert(
      tr('Ascenso de plan', 'Upgrade plan'),
      tr(
        `Precio publicado: ${fmtUsd(tiers?.[key].monthlyPriceUsd ?? 0)} / mes (prueba ${tiers?.[key].freeTrialDays ?? 0} días según CMS). La compra nativa por tier se conectará a RevenueCat; también puedes canjear un QR VIP de campaña si tu equipo te lo envió.`,
        `Listed price: ${fmtUsd(tiers?.[key].monthlyPriceUsd ?? 0)} / month (${tiers?.[key].freeTrialDays ?? 0}-day trial per CMS). Native tier purchase will link to RevenueCat; you can also redeem a VIP campaign QR from your team.`,
      ),
    );
  };

  const handleBuyCreditPack = async (pack: (typeof creditPacks)[0]) => {
    try {
      setSubscribingPack(pack.id);
      const purchaseResult = await Purchases.purchaseProduct(pack.productId);
      if (purchaseResult.customerInfo.entitlements.active[pack.productId]) {
        Alert.alert(
          '✅ ' + tr('¡Éxito!', 'Success!'),
          tr('Se acreditaron', 'You received') + ` ${pack.credits} CS ` + tr('a tu cuenta', 'to your account'),
        );
      }
    } catch (error: any) {
      if (!error.userCancelled) {
        Alert.alert(tr('Error', 'Error'), tr('No se pudo procesar la compra', 'Could not process purchase'));
        console.error('Purchase error:', error);
      }
    } finally {
      setSubscribingPack(null);
    }
  };

  const handleUpgradeBusinessCard = async () => {
    if (!userId) {
      Alert.alert(tr('Sesión', 'Session'), tr('Inicia sesión para continuar.', 'Sign in to continue.'));
      return;
    }
    try {
      setUpgradeLoading(true);
      const platform = Platform.OS as 'ios' | 'android';
      const result = await purchaseBusinessCard(platform, false, `business_annual_${Date.now()}`, userId);
      if (result.success) {
        Alert.alert(
          '✅ ' + tr('¡Tarjeta de Negocio Activada!', 'Business Card Activated!'),
          tr('Tu licencia anual quedó activa. Recibiste', 'Your annual license is now active. You received') +
            ` ${result.cashbackCredits || 1000} ` +
            tr('Monedas CS para gastar en tienda.', 'CS Coins to spend in the store.'),
        );
      } else {
        const msg = String(result.message || '').trim();
        Alert.alert(tr('Error', 'Error'), msg || tr('No se pudo completar la compra.', 'Could not complete the purchase.'));
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
      Alert.alert(
        '✅ ' + tr('Restaurado', 'Restored'),
        tr('Se han restaurado tus compras anteriores', 'Your previous purchases have been restored'),
      );
    } catch (error) {
      console.error('Restore purchases error:', error);
      Alert.alert(tr('Error', 'Error'), tr('No se pudieron restaurar las compras', 'Could not restore purchases'));
    }
  };

  const cfg = tiers ?? null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} bounces={false} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={[...shell.vipBannerGradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        {onClose ? (
          <View style={styles.headerCloseRow}>
            <TouchableOpacity
              style={styles.headerCloseHit}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={tr('Cerrar', 'Close')}
            >
              <MaterialCommunityIcons name="close" size={24} color={shell.fabText} />
            </TouchableOpacity>
          </View>
        ) : null}
        <MaterialCommunityIcons name="storefront-outline" size={30} color={shell.ctaAccent} />
        <Text style={styles.headerTitle}>{tr('Planes y tienda', 'Plans & store')}</Text>
        <Text style={styles.headerSubtitle}>
          {tr('Precios y límites desde el panel admin (Firestore). Compras reales vía App Store / Play.', 'Pricing and limits from the admin CMS (Firestore). Purchases via App Store / Play.')}
        </Text>
      </LinearGradient>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{tr('Suscripciones (tiers)', 'Subscriptions (tiers)')}</Text>
        <Text style={styles.sectionHint}>
          {tr(
            'Gratis, Influencer y Business: límites y precio mensual publicados. Los SKUs de tier en RevenueCat se pueden enlazar en una siguiente iteración.',
            'Free, Influencer and Business: published limits and monthly price. RevenueCat tier SKUs can be wired in a follow-up.',
          )}
        </Text>
        {tiersLoading || !cfg ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={shell.ctaAccent} />
          </View>
        ) : (
          (['free', 'influencer', 'business'] as TierKey[]).map((key) => (
            <View key={key} style={[styles.tierCard, key === 'business' && styles.tierCardHighlight]}>
              <Text style={styles.tierName}>{tierLabel(key)}</Text>
              <Text style={styles.tierPrice}>
                {key === 'free'
                  ? fmtUsd(0)
                  : `${fmtUsd(cfg[key].monthlyPriceUsd)} ${tr('/ mes', '/ month')}`}
                {cfg[key].freeTrialDays > 0
                  ? ` · ${cfg[key].freeTrialDays} ${tr('días prueba', 'day trial')}`
                  : ''}
              </Text>
              <Text style={styles.tierMeta}>{tierLines(key, cfg)}</Text>
              <TouchableOpacity style={styles.tierCta} onPress={() => onTierCta(key)} activeOpacity={0.85}>
                <Text style={styles.tierCtaText}>
                  {key === 'free' ? tr('Incluido', 'Included') : tr('Cómo obtenerlo', 'How to get it')}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{tr('Tarjetas de negocio y NFC', 'Business cards & NFC')}</Text>
        <Text style={styles.sectionHint}>
          {tr(
            'Precios de add-ons desde el CMS (hardware y slots extra). La licencia anual de negocio sigue pasando por la tienda nativa.',
            'Add-on prices from CMS (hardware and extra slots). Annual business license still goes through native store.',
          )}
        </Text>
        {cfg ? (
          <>
            <View style={styles.addonRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addonTitle}>{tr('Tarjeta de negocio adicional', 'Extra business card slot')}</Text>
                <Text style={styles.addonNote}>{tr('Por slot según CMS (facturación en app cuando aplique).', 'Per slot per CMS (in-app billing when applicable).')}</Text>
              </View>
              <Text style={styles.addonPrice}>{fmtUsd(cfg.addOns.singleBusinessCardExtraUsd)}</Text>
            </View>
            <View style={styles.addonRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addonTitle}>{tr('NFC PVC (tarjeta física)', 'NFC PVC (physical card)')}</Text>
                <Text style={styles.addonNote}>{tr('Precio orientativo; inventario y envío vía operaciones.', 'Guide price; inventory and shipping via ops.')}</Text>
              </View>
              <Text style={styles.addonPrice}>{fmtUsd(cfg.addOns.physicalPvcCardUsd)}</Text>
            </View>
            <View style={styles.addonRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addonTitle}>{tr('NFC metal (tarjeta física)', 'NFC metal (physical card)')}</Text>
                <Text style={styles.addonNote}>{tr('Premium físico; consulta stock en soporte.', 'Physical premium; check stock with support.')}</Text>
              </View>
              <Text style={styles.addonPrice}>{fmtUsd(cfg.addOns.physicalMetalCardUsd)}</Text>
            </View>
          </>
        ) : null}

        <TouchableOpacity style={styles.nfcBtn} onPress={() => router.push('/nfc' as never)} activeOpacity={0.85}>
          <Text style={styles.nfcBtnText}>{tr('Operaciones NFC en la app', 'NFC operations in the app')}</Text>
        </TouchableOpacity>

        <LinearGradient colors={[...shell.vipBannerGradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.businessBlock}>
          <View style={styles.businessInner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialCommunityIcons name="briefcase-check" size={26} color={shell.ctaAccent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.businessTitle}>{tr('Licencia anual — Tarjeta de negocio', 'Annual license — Business card')}</Text>
                <Text style={styles.businessSub}>
                  {bizPackage
                    ? `${fmtUsd(bizPackage.priceUsd)} ${tr('/ año vía tienda', '/ year via store')}`
                    : tr('Precio en tienda', 'Store price')}
                </Text>
              </View>
            </View>
            <GoldenRingButton
              label={upgradeLoading ? tr('Comprando...', 'Purchasing...') : tr('Activar negocio (tienda)', 'Activate business (store)')}
              onPress={handleUpgradeBusinessCard}
              icon={upgradeLoading ? 'loading' : 'badge-account'}
              disabled={upgradeLoading || loading || !userId}
              loading={upgradeLoading}
              style={{ width: '100%', marginTop: 14 }}
            />
          </View>
        </LinearGradient>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{tr('Packs de créditos CS', 'CS credit packs')}</Text>
        <Text style={styles.sectionHint}>{tr('$1 USD ≈ 10 CS · RevenueCat', '$1 USD ≈ 10 CS · RevenueCat')}</Text>
        <View style={styles.packGrid}>
          {creditPacks.map((pack) => (
            <View key={pack.id} style={[styles.packCard, pack.popular && styles.packPopular]}>
              {pack.popular ? (
                <Text style={{ fontSize: 10, fontWeight: '800', color: shell.ctaAccent, marginBottom: 4 }}>POPULAR</Text>
              ) : null}
              <Text style={styles.packCredits}>{pack.credits}</Text>
              <Text style={styles.packLabel}>{tr('Créditos', 'Credits')}</Text>
              <Text style={styles.packPrice}>{pack.displayPrice}</Text>
              <GoldenRingButton
                label={subscribingPack === pack.id ? tr('Comprando...', 'Purchasing...') : tr('Comprar', 'Buy')}
                onPress={() => void handleBuyCreditPack(pack)}
                icon={subscribingPack === pack.id ? 'loading' : 'shopping-outline'}
                disabled={subscribingPack !== null}
                loading={subscribingPack === pack.id}
                style={{ width: '100%' }}
              />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{tr('Próximamente en tienda', 'Coming soon in store')}</Text>
        <View style={styles.legalBox}>
          <Text style={styles.legalText}>
            {tr(
              '• Fuente / tipografía premium del Studio\n• Paquetes de iconos del mercado\n• Wallpapers animados\n• Diamantes (moneda comprada) junto a CS Coins\n• Más SKUs NFC por lote',
              '• Premium fonts from Studio\n• Icon packs from marketplace\n• Animated wallpapers\n• Diamonds (purchased currency) alongside CS Coins\n• More NFC batch SKUs',
            )}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.legalTitle}>{tr('Términos comerciales', 'Commercial terms')}</Text>
        <Text style={styles.legalText}>
          • {tr('Los precios del CMS son orientativos; el cobro final es el de la tienda.', 'CMS prices are indicative; final charge is from the store.')} {'\n'}
          • {tr('Al comprar, aceptas los Términos y Condiciones.', 'By purchasing, you accept the Terms & Conditions.')} {'\n'}
          • {tr('Restaurar compras (requerido por Apple).', 'Restore purchases (Apple requirement).')}
        </Text>
        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestorePurchases}>
          <MaterialCommunityIcons name="history" size={18} color={shell.emptyCtaText} />
          <Text style={styles.restoreTxt}>{tr('Restaurar compras', 'Restore purchases')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default Subscription;
