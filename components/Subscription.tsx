import LuxCtaButton from '@/components/LuxCtaButton';
import palette from '@/app/theme';
import { getActiveUserId } from '@/services/authSession';
import { Picker } from '@react-native-picker/picker';
import {
  loadBusinessCardPackageForPlatform,
  purchaseBusinessCard,
  type BusinessCardPackage,
} from '@/services/businessCardPaywallService';
import { getCommerceConfig } from '@/services/commerceConfigService';
import { intlLocaleTagForAppLanguage, useLanguage, useTr } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { getMarketRadarRemoteConfig } from '@/services/marketRadarConfigService';
import { getTiersConfig, type TierKey, type TiersConfig } from '@/services/tiersConfigService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Localization from 'expo-localization';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  InteractionManager,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Purchases from 'react-native-purchases';
import {
  describeCurrentOfferingPackages,
  formatRevenueCatPurchaseError,
  presentCardSocialProPaywall,
  presentCardSocialProPaywallIfNeeded,
  paywallResultIndicatesUnlock,
  presentRevenueCatCustomerCenter,
  refreshCardSocialProActive,
  syncRevenueCatWithFirebaseUid,
} from '@/services/revenueCatProSubscription';
import { userFacingAlertMessage } from '@/services/apiUserFacingError';
import type { SubscriptionScrollSection } from '@/services/subscriptionNavigationIntent';
import {
  NFC_PHYSICAL_CARD_SHIPPING_COUNTRY_CODES,
  nfcPhysicalCardCs,
  nfcPhysicalShippingCs,
  nfcPhysicalShippingUsd,
  resolveNfcPhysicalShippingZone,
  sortNfcShippingCountryCodesForLocale,
} from '@/services/nfcPhysicalCardShipping';

const { width } = Dimensions.get('window');

interface SubscriptionProps {
  onClose?: () => void;
  initialScrollSection?: SubscriptionScrollSection | null;
  onScrollIntentConsumed?: () => void;
}

/**
 * Tienda / planes: límites y tarifas desde configuración publicada;
 * compras in-app y licencia anual de tarjeta de negocio.
 */
const Subscription: React.FC<SubscriptionProps> = ({
  onClose,
  initialScrollSection = null,
  onScrollIntentConsumed,
}) => {
  const tr = useTr();
  const { language } = useLanguage();
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];
  const router = useRouter();
  const intlLocale = intlLocaleTagForAppLanguage(language);

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
  const [proActive, setProActive] = useState(false);
  const [proLoading, setProLoading] = useState(false);
  const [proActionLoading, setProActionLoading] = useState(false);
  const [offeringDebugLines, setOfferingDebugLines] = useState<string[]>([]);
  const [nfcMaterial, setNfcMaterial] = useState<'pvc' | 'metal'>('pvc');
  const [nfcShipCountry, setNfcShipCountry] = useState('US');
  const scrollRef = useRef<ScrollView>(null);
  const [physicalSectionY, setPhysicalSectionY] = useState(0);
  const [radarSectionY, setRadarSectionY] = useState(0);
  const [bizPackage, setBizPackage] = useState<BusinessCardPackage | null>(null);
  const [commerceLoading, setCommerceLoading] = useState(true);
  const [commerceCreditPacks, setCommerceCreditPacks] = useState<
    { id: string; productId: string; priceUsd: number; popular?: boolean; credits: number }[]
  >([]);
  const [commerceIssue, setCommerceIssue] = useState<'none' | 'no_document' | 'read_error'>('none');
  const [radarProPriceUsd, setRadarProPriceUsd] = useState(0);
  const [radarProEquivalentCs, setRadarProEquivalentCs] = useState(0);

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
        if (!cfg) {
          if (mounted) setBizPackage(null);
        } else {
          const biz = await loadBusinessCardPackageForPlatform(Platform.OS as 'ios' | 'android');
          if (mounted) setBizPackage(biz);
        }
      } finally {
        if (mounted) setTiersLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let m = true;
    (async () => {
      try {
        const res = await getCommerceConfig();
        if (!m) return;
        if (res.ok) {
          setCommerceIssue('none');
          setCommerceCreditPacks(
            res.data.creditPacks.map((p) => ({
              ...p,
              credits: Math.max(0, Math.floor(p.equivalentCs)),
            })),
          );
        } else {
          setCommerceCreditPacks([]);
          setCommerceIssue(res.reason === 'no_document' ? 'no_document' : 'read_error');
        }
      } finally {
        if (m) setCommerceLoading(false);
      }
    })();
    return () => {
      m = false;
    };
  }, []);

  useEffect(() => {
    let m = true;
    (async () => {
      const r = await getMarketRadarRemoteConfig();
      if (m) {
        setRadarProPriceUsd(r.proPriceUsd);
        setRadarProEquivalentCs(r.proEquivalentCs);
      }
    })();
    return () => {
      m = false;
    };
  }, []);

  useEffect(() => {
    const allowed = new Set(NFC_PHYSICAL_CARD_SHIPPING_COUNTRY_CODES);
    const r = Localization.getLocales?.()?.[0]?.regionCode?.toUpperCase?.() ?? '';
    if (r && allowed.has(r)) setNfcShipCountry(r);
    else if (r) setNfcShipCountry('ZZ');
    else setNfcShipCountry('US');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProLoading(true);
      try {
        await syncRevenueCatWithFirebaseUid(userId.trim() ? userId : null);
        const active = await refreshCardSocialProActive();
        if (!cancelled) setProActive(active);
        if (__DEV__) {
          const lines = await describeCurrentOfferingPackages();
          if (!cancelled) setOfferingDebugLines(lines);
        }
      } finally {
        if (!cancelled) setProLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (initialScrollSection !== 'physical_cards' || physicalSectionY <= 0) {
      return;
    }
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, physicalSectionY - 12), animated: true });
      onScrollIntentConsumed?.();
    });
    return () => cancelAnimationFrame(id);
  }, [initialScrollSection, physicalSectionY, onScrollIntentConsumed]);

  useEffect(() => {
    if (initialScrollSection !== 'market_radar' || radarSectionY <= 0) {
      return;
    }
    const task = InteractionManager.runAfterInteractions(() => {
      const y = Math.max(0, radarSectionY - 16);
      scrollRef.current?.scrollTo({ y, animated: true });
      onScrollIntentConsumed?.();
    });
    return () => task.cancel();
  }, [initialScrollSection, radarSectionY, onScrollIntentConsumed]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: shell.backgroundSolid },
        content: { paddingBottom: 48 },
        header: {
          paddingHorizontal: 22,
          paddingVertical: 28,
          alignItems: 'center',
          marginBottom: 24,
        },
        headerCloseRow: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
        headerCloseHit: { padding: 6 },
        headerTitle: { fontSize: 24, fontWeight: '700', color: shell.fabText, marginTop: 10, textAlign: 'center', letterSpacing: 0.3 },
        headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.88)', marginTop: 8, textAlign: 'center', lineHeight: 20 },
        section: { paddingHorizontal: 20, marginBottom: 36 },
        sectionTitle: { fontSize: 18, fontWeight: '700', color: shell.textPrimary, marginBottom: 8, letterSpacing: 0.2 },
        sectionHint: { fontSize: 13, color: shell.textSecondary, marginBottom: 16, lineHeight: 20 },
        tierCard: {
          borderRadius: 16,
          padding: 16,
          marginBottom: 14,
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
        packGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between' },
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
        physicalNfcBox: {
          marginTop: 14,
          padding: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: shell.ctaAccent,
          backgroundColor: shell.surfaceMuted,
        },
        physicalNfcTitle: { fontSize: 15, fontWeight: '700', color: shell.textPrimary, marginBottom: 6 },
        chipRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
        materialChip: {
          flex: 1,
          paddingVertical: 10,
          borderRadius: 10,
          borderWidth: 1,
          alignItems: 'center',
          borderColor: shell.modalBorder,
          backgroundColor: shell.surface,
        },
        materialChipActive: {
          borderColor: shell.ctaAccent,
          borderWidth: 2,
          backgroundColor: shell.surface,
        },
        materialChipText: { fontSize: 13, fontWeight: '700', color: shell.textSecondary },
        materialChipTextActive: { color: shell.ctaAccent },
        countryLabel: { fontSize: 12, fontWeight: '600', color: shell.textPrimary, marginBottom: 6 },
        countryPickerWrap: {
          borderWidth: 1,
          borderColor: shell.modalBorder,
          borderRadius: 10,
          marginBottom: 12,
          backgroundColor: shell.surface,
          overflow: 'hidden',
        },
        breakdownBox: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: shell.modalBorder,
          paddingTop: 12,
          marginBottom: 4,
        },
        breakdownLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
        breakdownLabel: { fontSize: 13, color: shell.textSecondary, flex: 1, paddingRight: 8 },
        breakdownValue: { fontSize: 13, fontWeight: '600', color: shell.textPrimary },
        breakdownTotalLine: {
          marginTop: 4,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: shell.modalBorder,
        },
        breakdownTotalLabel: { fontSize: 15, fontWeight: '800', color: shell.textPrimary },
        breakdownTotalValue: { fontSize: 15, fontWeight: '800', color: shell.ctaAccent },
        loadingRow: { paddingVertical: 20, alignItems: 'center' },
        emptyCallout: {
          borderRadius: 16,
          padding: 18,
          borderWidth: 1,
          borderColor: shell.modalBorder,
          borderStyle: 'dashed',
          backgroundColor: shell.surfaceMuted,
        },
      }),
    [shell],
  );

  const tierLabel = (key: TierKey) => {
    if (key === 'free') return tr('Gratis', 'Free');
    if (key === 'influencer') return tr('Influencer', 'Influencer');
    return tr('Business', 'Business');
  };

  const tierSummary = (key: TierKey, t: TiersConfig) => {
    const lim = t[key];
    const bits = [
      `${lim.iconDataLimit} IconData · ${lim.smartCardsLimit} Smart`,
      `${lim.businessCardsLimit} ${tr('negocio', 'business')}`,
      `${lim.voipMinutesIncluded} ${tr('min/mes', 'min/mo')}${lim.premiumThemes ? ' · ' + tr('Temas+', 'Themes+') : ''}`,
    ];
    return bits.join('\n');
  };

  const onRadarProInfo = useCallback(() => {
    Alert.alert(
      tr('Market Radar Pro', 'Market Radar Pro'),
      tr(
        'El acceso completo se confirma al abrir el radar desde la app.',
        'Full access is confirmed when you open the radar from the app.',
      ),
    );
  }, [tr]);

  const onTierCta = (key: TierKey) => {
    if (key === 'free') {
      Alert.alert(tr('Plan Gratis', 'Free plan'), tr('Ya incluido con tu cuenta.', 'Already included with your account.'));
      return;
    }
    Alert.alert(
      tr('Ascenso de plan', 'Upgrade plan'),
      tr(
        `${fmtUsd(tiers?.[key].monthlyPriceUsd ?? 0)} / mes · ${(tiers?.[key].monthlyEquivalentCs ?? 0).toLocaleString()} CS · ${fmtUsd(tiers?.[key].annualPriceUsd ?? 0)} / año · ${(tiers?.[key].annualEquivalentCs ?? 0).toLocaleString()} CS. Prueba: ${tiers?.[key].freeTrialDays ?? 0} días. La compra se completa en la tienda de la app.`,
        `${fmtUsd(tiers?.[key].monthlyPriceUsd ?? 0)} / mo · ${(tiers?.[key].monthlyEquivalentCs ?? 0).toLocaleString()} CS · ${fmtUsd(tiers?.[key].annualPriceUsd ?? 0)} / yr · ${(tiers?.[key].annualEquivalentCs ?? 0).toLocaleString()} CS. Trial: ${tiers?.[key].freeTrialDays ?? 0} days. Purchase completes in your app’s store.`,
      ),
    );
  };

  const handleBuyCreditPack = async (pack: { id: string; productId: string; credits: number }) => {
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
            ` ${String(result.cashbackCredits ?? 0)} ` +
            tr('Monedas CS para gastar en tienda.', 'CS Coins to spend in the store.'),
        );
      } else {
        Alert.alert(
          tr('Error', 'Error'),
          tr('No se pudo completar la compra.', 'Could not complete the purchase.'),
        );
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
      const active = await refreshCardSocialProActive();
      setProActive(active);
      Alert.alert(
        '✅ ' + tr('Restaurado', 'Restored'),
        tr('Se han restaurado tus compras anteriores', 'Your previous purchases have been restored'),
      );
    } catch (error) {
      console.error('Restore purchases error:', error);
      Alert.alert(tr('Error', 'Error'), tr('No se pudieron restaurar las compras', 'Could not restore purchases'));
    }
  };

  const runProPaywall = async (mode: 'ifNeeded' | 'always') => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      Alert.alert(tr('No disponible', 'Not available'), tr('Compras in-app solo en iOS/Android.', 'In-app purchases on iOS/Android only.'));
      return;
    }
    try {
      setProActionLoading(true);
      const result =
        mode === 'ifNeeded' ? await presentCardSocialProPaywallIfNeeded() : await presentCardSocialProPaywall();
      const active = await refreshCardSocialProActive();
      setProActive(active);
      if (paywallResultIndicatesUnlock(result)) {
        Alert.alert(
          tr('Card-Social Pro', 'Card-Social Pro'),
          tr('Suscripción actualizada. ¡Gracias!', 'Subscription updated. Thank you!'),
        );
      }
    } catch (error) {
      const { cancelled } = formatRevenueCatPurchaseError(error);
      if (!cancelled) {
        Alert.alert(
          tr('Error', 'Error'),
          userFacingAlertMessage(
            error,
            language,
            tr('No se pudo completar la operación.', 'Could not complete the operation.'),
          ),
        );
      }
    } finally {
      setProActionLoading(false);
    }
  };

  const runCustomerCenter = async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      Alert.alert(tr('No disponible', 'Not available'), tr('Solo en app iOS/Android.', 'iOS/Android app only.'));
      return;
    }
    try {
      setProActionLoading(true);
      await presentRevenueCatCustomerCenter();
      const active = await refreshCardSocialProActive();
      setProActive(active);
    } catch (error) {
      const { cancelled } = formatRevenueCatPurchaseError(error);
      if (!cancelled) {
        Alert.alert(
          tr('Error', 'Error'),
          userFacingAlertMessage(
            error,
            language,
            tr('No se pudo abrir el centro de suscripciones.', 'Could not open subscription management.'),
          ),
        );
      }
    } finally {
      setProActionLoading(false);
    }
  };

  const cfg = tiers ?? null;

  const sortedNfcCountryCodes = useMemo(
    () => sortNfcShippingCountryCodesForLocale(NFC_PHYSICAL_CARD_SHIPPING_COUNTRY_CODES, intlLocale),
    [intlLocale],
  );

  const nfcCountryPickerLabel = useCallback(
    (code: string) => {
      if (code === 'ZZ') {
        return tr('Otros países (internacional)', 'Other countries (international)');
      }
      try {
        return new Intl.DisplayNames([intlLocale], { type: 'region' }).of(code) ?? code;
      } catch {
        return code;
      }
    },
    [intlLocale, tr],
  );

  const nfcCheckout = useMemo(() => {
    if (!cfg) return null;
    const cardUsd = nfcMaterial === 'pvc' ? cfg.addOns.physicalPvcCardUsd : cfg.addOns.physicalMetalCardUsd;
    const zone = resolveNfcPhysicalShippingZone(nfcShipCountry);
    const shipUsd = nfcPhysicalShippingUsd(zone, cfg.addOns);
    const cardCs = nfcPhysicalCardCs(nfcMaterial, cfg.addOns);
    const shipCs = nfcPhysicalShippingCs(zone, cfg.addOns);
    return {
      cardUsd,
      shipUsd,
      totalUsd: cardUsd + shipUsd,
      cardCs,
      shipCs,
      totalCs: cardCs + shipCs,
      zone,
    };
  }, [cfg, nfcMaterial, nfcShipCountry]);

  const confirmNfcPhysicalTotal = useCallback(() => {
    if (!nfcCheckout) return;
    Alert.alert(
      tr('Resumen para pago', 'Payment summary'),
      [
        `${tr('Precio de la tarjeta', 'Card price')}: ${fmtUsd(nfcCheckout.cardUsd)}`,
        `${tr('Shipping & Handling', 'Shipping & Handling')}: ${fmtUsd(nfcCheckout.shipUsd)}`,
        `${tr('Total final', 'Total')}: ${fmtUsd(nfcCheckout.totalUsd)}`,
        `${tr('Equivalente en créditos CS', 'CS credits equivalent')}: ${nfcCheckout.cardCs.toLocaleString()} + ${nfcCheckout.shipCs.toLocaleString()} = ${nfcCheckout.totalCs.toLocaleString()} CS`,
      ].join('\n'),
    );
  }, [fmtUsd, nfcCheckout, tr]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      bounces={false}
      showsVerticalScrollIndicator={false}
    >
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
        <Text style={styles.headerTitle}>{tr('Planes y membresía', 'Plans & membership')}</Text>
        <Text style={styles.headerSubtitle}>
          {tr(
            'Pagos seguros con tu cuenta de App Store o Google Play.',
            'Secure billing with your App Store or Google Play account.',
          )}
        </Text>
      </LinearGradient>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{tr('Card-Social Pro', 'Card-Social Pro')}</Text>
        <Text style={styles.sectionHint}>
          {tr('Membresía integral. Elige tu plan dentro de la app.', 'All-in membership. Choose your plan inside the app.')}
        </Text>
        <View style={[styles.tierCard, proActive && styles.tierCardHighlight]}>
          {proLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={shell.ctaAccent} />
            </View>
          ) : (
            <>
              <Text style={styles.tierName}>{proActive ? tr('Pro activo', 'Pro active') : tr('Pro inactivo', 'Pro inactive')}</Text>
              <Text style={styles.tierMeta}>
                {userId
                  ? tr('Compras enlazadas a tu cuenta.', 'Purchases linked to your account.')
                  : tr('Inicia sesión para sincronizar compras.', 'Sign in to sync purchases.')}
              </Text>
              <View style={{ marginTop: 16, gap: 12 }}>
                <LuxCtaButton
                  label={
                    proActionLoading
                      ? tr('Abriendo…', 'Opening…')
                      : tr('Mejorar suscripción', 'Upgrade subscription')
                  }
                  onPress={() => void runProPaywall('ifNeeded')}
                  icon="crown-outline"
                  disabled={proActionLoading}
                  loading={proActionLoading}
                  style={{ width: '100%' }}
                />
                <LuxCtaButton
                  variant="outline"
                  label={proActionLoading ? tr('Abriendo…', 'Opening…') : tr('Ver planes', 'View plans')}
                  onPress={() => void runProPaywall('always')}
                  icon="cart-outline"
                  disabled={proActionLoading}
                  loading={proActionLoading}
                  style={{ width: '100%' }}
                />
                <TouchableOpacity
                  style={styles.nfcBtn}
                  onPress={() => void runCustomerCenter()}
                  disabled={proActionLoading}
                  activeOpacity={0.85}
                >
                  <Text style={styles.nfcBtnText}>{tr('Centro de suscripciones', 'Subscription management')}</Text>
                </TouchableOpacity>
              </View>
              {__DEV__ && offeringDebugLines.length > 0 ? (
                <Text style={[styles.sectionHint, { marginTop: 12 }]}>{offeringDebugLines.join('\n')}</Text>
              ) : null}
            </>
          )}
        </View>
      </View>

      <View
        collapsable={Platform.OS === 'android' ? false : undefined}
        onLayout={(e) => setRadarSectionY(e.nativeEvent.layout.y)}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{tr('Market Radar Pro', 'Market Radar Pro')}</Text>
          <Text style={styles.sectionHint}>
            {tr('Mapa ejecutivo de mercado. Importe mostrado debajo.', 'Executive market map. Amount shown below.')}
          </Text>
          <View style={styles.tierCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tierName}>{tr('Acceso Pro', 'Pro access')}</Text>
                <Text style={[styles.tierMeta, { marginTop: 6 }]}>
                  {radarProPriceUsd > 0 || radarProEquivalentCs > 0
                    ? [
                        radarProPriceUsd > 0 ? `${fmtUsd(radarProPriceUsd)} USD` : null,
                        radarProEquivalentCs > 0 ? `${radarProEquivalentCs.toLocaleString()} CS` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : tr('Disponible próximamente en la app.', 'Coming soon in the app.')}
                </Text>
              </View>
              <MaterialCommunityIcons name="radar" size={30} color={shell.ctaAccent} />
            </View>
            <LuxCtaButton
              variant="outline"
              label={tr('Detalles', 'Details')}
              onPress={onRadarProInfo}
              icon="information-outline"
              style={{ width: '100%', marginTop: 14, minHeight: 48 }}
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{tr('Suscripciones', 'Subscriptions')}</Text>
        <Text style={styles.sectionHint}>
          {tr('Límites y tarifas de referencia.', 'Reference limits and rates.')}
        </Text>
        {tiersLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={shell.ctaAccent} />
          </View>
        ) : !cfg ? (
          <View style={styles.emptyCallout}>
            <Text style={styles.tierMeta}>
              {tr(
                'Las tarifas de membresía no están disponibles en este momento. Inténtalo más tarde.',
                'Membership rates are not available right now. Please try again later.',
              )}
            </Text>
          </View>
        ) : (
          (['free', 'influencer', 'business'] as TierKey[]).map((key) => (
            <View key={key} style={[styles.tierCard, key === 'business' && styles.tierCardHighlight]}>
              <Text style={styles.tierName}>{tierLabel(key)}</Text>
              <Text style={styles.tierPrice}>
                {key === 'free'
                  ? fmtUsd(0)
                  : `${fmtUsd(cfg[key].monthlyPriceUsd)} ${tr('/ mes', '/ month')}`}
                {key !== 'free' && cfg[key].monthlyEquivalentCs > 0
                  ? ` · ${cfg[key].monthlyEquivalentCs.toLocaleString()} CS`
                  : ''}
                {key !== 'free'
                  ? ` · ${fmtUsd(cfg[key].annualPriceUsd)} ${tr('/ año', '/ yr')}`
                  : ''}
                {key !== 'free' && cfg[key].annualEquivalentCs > 0
                  ? ` · ${cfg[key].annualEquivalentCs.toLocaleString()} CS`
                  : ''}
                {cfg[key].freeTrialDays > 0
                  ? ` · ${cfg[key].freeTrialDays} ${tr('días prueba', 'day trial')}`
                  : ''}
              </Text>
              <Text style={styles.tierMeta}>{tierSummary(key, cfg)}</Text>
              <TouchableOpacity style={styles.tierCta} onPress={() => onTierCta(key)} activeOpacity={0.85}>
                <Text style={styles.tierCtaText}>
                  {key === 'free' ? tr('Incluido', 'Included') : tr('Cómo obtenerlo', 'How to get it')}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View onLayout={(e) => setPhysicalSectionY(e.nativeEvent.layout.y)}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{tr('Tarjetas de negocio y NFC', 'Business cards & NFC')}</Text>
        <Text style={styles.sectionHint}>
          {tr(
            'Complementos y envío. Licencia anual a través de la tienda de la app.',
            'Add-ons and shipping. Annual license through your app’s store.',
          )}
        </Text>
        {cfg ? (
          <>
            <View style={styles.addonRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addonTitle}>{tr('Tarjeta de negocio adicional', 'Extra business card slot')}</Text>
                <Text style={styles.addonNote}>{tr('Por cada tarjeta adicional.', 'Per additional card.')}</Text>
              </View>
              <Text style={styles.addonPrice}>
                {fmtUsd(cfg.addOns.singleBusinessCardExtraUsd)}
                {cfg.addOns.singleBusinessCardExtraCs > 0
                  ? ` · ${cfg.addOns.singleBusinessCardExtraCs.toLocaleString()} CS`
                  : ''}
              </Text>
            </View>
            <View style={styles.addonRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addonTitle}>{tr('NFC PVC (tarjeta física)', 'NFC PVC (physical card)')}</Text>
                <Text style={styles.addonNote}>{tr('Inventario / ops.', 'Inventory / ops.')}</Text>
              </View>
              <Text style={styles.addonPrice}>
                {fmtUsd(cfg.addOns.physicalPvcCardUsd)}
                {cfg.addOns.physicalPvcCardCs > 0 ? ` · ${cfg.addOns.physicalPvcCardCs.toLocaleString()} CS` : ''}
              </Text>
            </View>
            <View style={styles.addonRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addonTitle}>{tr('NFC metal (tarjeta física)', 'NFC metal (physical card)')}</Text>
                <Text style={styles.addonNote}>{tr('Stock vía soporte.', 'Stock via support.')}</Text>
              </View>
              <Text style={styles.addonPrice}>
                {fmtUsd(cfg.addOns.physicalMetalCardUsd)}
                {cfg.addOns.physicalMetalCardCs > 0 ? ` · ${cfg.addOns.physicalMetalCardCs.toLocaleString()} CS` : ''}
              </Text>
            </View>
          </>
        ) : null}

        {cfg && nfcCheckout ? (
          <View style={styles.physicalNfcBox}>
            <Text style={styles.physicalNfcTitle}>
              {tr('Compra tarjeta física NFC — total estimado', 'NFC physical card — estimated total')}
            </Text>
            <Text style={[styles.sectionHint, { marginBottom: 12 }]}>
              {tr('Material y país de envío. Envío según zona publicada.', 'Material and ship-to country. Shipping per published zone.')}
            </Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.materialChip, nfcMaterial === 'pvc' && styles.materialChipActive]}
                onPress={() => setNfcMaterial('pvc')}
                accessibilityRole="button"
                accessibilityState={{ selected: nfcMaterial === 'pvc' }}
              >
                <Text style={[styles.materialChipText, nfcMaterial === 'pvc' && styles.materialChipTextActive]}>PVC</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.materialChip, nfcMaterial === 'metal' && styles.materialChipActive]}
                onPress={() => setNfcMaterial('metal')}
                accessibilityRole="button"
                accessibilityState={{ selected: nfcMaterial === 'metal' }}
              >
                <Text style={[styles.materialChipText, nfcMaterial === 'metal' && styles.materialChipTextActive]}>
                  {tr('Metal', 'Metal')}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.countryLabel}>{tr('País de envío', 'Ship-to country')}</Text>
            <View style={styles.countryPickerWrap}>
              <Picker
                selectedValue={nfcShipCountry}
                onValueChange={(v) => setNfcShipCountry(String(v))}
                mode={Platform.OS === 'android' ? 'dropdown' : undefined}
                dropdownIconColor={Platform.OS === 'android' ? shell.ctaAccent : undefined}
                style={{ color: shell.textPrimary }}
              >
                {sortedNfcCountryCodes.map((code) => (
                  <Picker.Item key={code} label={nfcCountryPickerLabel(code)} value={code} />
                ))}
              </Picker>
            </View>
            <View style={styles.breakdownBox}>
              <View style={styles.breakdownLine}>
                <Text style={styles.breakdownLabel}>{tr('Precio de la tarjeta', 'Card price')}</Text>
                <Text style={styles.breakdownValue}>{fmtUsd(nfcCheckout.cardUsd)}</Text>
              </View>
              <View style={styles.breakdownLine}>
                <Text style={styles.breakdownLabel}>{tr('Shipping & Handling', 'Shipping & Handling')}</Text>
                <Text style={styles.breakdownValue}>{fmtUsd(nfcCheckout.shipUsd)}</Text>
              </View>
              <View style={[styles.breakdownLine, styles.breakdownTotalLine]}>
                <Text style={styles.breakdownTotalLabel}>{tr('Total final', 'Total')}</Text>
                <Text style={styles.breakdownTotalValue}>{fmtUsd(nfcCheckout.totalUsd)}</Text>
              </View>
              {(nfcCheckout.cardCs > 0 || nfcCheckout.shipCs > 0) && (
                <View style={[styles.breakdownLine, { marginTop: 6 }]}>
                  <Text style={styles.breakdownLabel}>{tr('Equivalente CS', 'CS equivalent')}</Text>
                  <Text style={styles.breakdownValue}>
                    {nfcCheckout.totalCs.toLocaleString()} CS
                  </Text>
                </View>
              )}
            </View>
            <LuxCtaButton
              variant="outline"
              label={tr('Confirmar total', 'Confirm total')}
              onPress={confirmNfcPhysicalTotal}
              icon="receipt"
              style={{ width: '100%', marginTop: 8, minHeight: 48 }}
            />
          </View>
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
                    ? `${fmtUsd(bizPackage.priceUsd)} ${tr('/ año · tienda de la app', '/ yr · app store')}`
                    : tr('Tarifa anual no disponible por ahora.', 'Annual rate not available yet.')}
                </Text>
              </View>
            </View>
            <LuxCtaButton
              label={upgradeLoading ? tr('Comprando...', 'Purchasing...') : tr('Activar licencia anual', 'Activate annual license')}
              onPress={handleUpgradeBusinessCard}
              disabled={upgradeLoading || loading || !userId || !bizPackage}
              loading={upgradeLoading}
              icon={upgradeLoading ? undefined : 'badge-account'}
              style={{ width: '100%', marginTop: 16 }}
            />
          </View>
        </LinearGradient>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{tr('Monedas CS', 'CS coins')}</Text>
        <Text style={styles.sectionHint}>
          {tr(
            'Paquetes de créditos CS en dólares y monedas Card-Social.',
            'CS credit bundles in dollars and Card-Social coins.',
          )}
        </Text>
        {commerceLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={shell.ctaAccent} />
          </View>
        ) : commerceIssue === 'no_document' ? (
          <View style={styles.emptyCallout}>
            <Text style={styles.tierMeta}>
              {tr(
                'El catálogo de monedas no está disponible todavía.',
                'The coin catalog is not available yet.',
              )}
            </Text>
          </View>
        ) : commerceIssue === 'read_error' ? (
          <View style={styles.emptyCallout}>
            <Text style={styles.tierMeta}>
              {tr(
                'No pudimos cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.',
                'We could not load the catalog. Check your connection and try again.',
              )}
            </Text>
          </View>
        ) : commerceCreditPacks.length === 0 ? (
          <View style={styles.emptyCallout}>
            <Text style={styles.tierMeta}>
              {tr(
                'No hay paquetes disponibles en este momento.',
                'No bundles are available at the moment.',
              )}
            </Text>
          </View>
        ) : (
          <View style={styles.packGrid}>
            {commerceCreditPacks.map((pack) => (
              <View key={pack.id} style={[styles.packCard, pack.popular && styles.packPopular]}>
                {pack.popular ? (
                  <Text style={{ fontSize: 10, fontWeight: '800', color: shell.ctaAccent, marginBottom: 4, letterSpacing: 0.6 }}>
                    POPULAR
                  </Text>
                ) : null}
                <Text style={styles.packCredits}>{pack.credits}</Text>
                <Text style={styles.packLabel}>{tr('Créditos', 'Credits')}</Text>
                <Text style={styles.packPrice}>{fmtUsd(pack.priceUsd)}</Text>
                <LuxCtaButton
                  label={subscribingPack === pack.id ? tr('Comprando...', 'Purchasing...') : tr('Comprar', 'Buy')}
                  onPress={() => void handleBuyCreditPack(pack)}
                  disabled={subscribingPack !== null}
                  loading={subscribingPack === pack.id}
                  icon={subscribingPack === pack.id ? undefined : 'shopping-outline'}
                  style={{ width: '100%', minHeight: 48 }}
                />
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.legalTitle}>{tr('Términos comerciales', 'Commercial terms')}</Text>
        <Text style={styles.legalText}>
          •{' '}
          {tr(
            'Los importes mostrados pueden diferir del cargo final en App Store o Google Play.',
            'Amounts shown may differ from your final charge in the App Store or Google Play.',
          )}
          {'\n'}• {tr('Al comprar, aceptas los Términos y Condiciones.', 'By purchasing, you accept the Terms & Conditions.')}
          {'\n'}•{' '}
          {tr(
            'Puedes restaurar compras según las políticas de App Store o Google Play.',
            'You can restore purchases according to App Store or Google Play policies.',
          )}
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
