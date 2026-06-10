import LuxCtaButton from '@/components/LuxCtaButton';
import palette from '@/app/theme';
import { SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import { getActiveUserId } from '@/services/authSession';
import { Picker } from '@react-native-picker/picker';
import {
  loadBusinessCardPackageForPlatform,
  purchaseBusinessCard,
  type BusinessCardPackage,
} from '@/services/businessCardPaywallService';
import { getCommerceConfig } from '@/services/commerceConfigService';
import { useCoreT } from '@/services/coreI18n';
import { intlLocaleTagForAppLanguage, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import {
  getMarketRadarRemoteConfig,
  subscribeMarketRadarRemoteConfig,
} from '@/services/marketRadarConfigService';
import { getRadarTrialEnabledSync } from '@/services/radarTrialEnabledCache';
import { getTiersConfig, type TierKey, type TiersConfig } from '@/services/tiersConfigService';
import {
  createMercadoPagoCheckoutSession,
  fetchMercadoPagoPublicConfig,
  isMercadoPagoMarketRegion,
  type MercadoPagoBillingPeriod,
  type MercadoPagoCurrencyId,
  type MercadoPagoPublicConfig,
} from '@/services/mercadopagoCheckoutService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Localization from 'expo-localization';
import * as WebBrowser from 'expo-web-browser';
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
  const t = useCoreT();
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
  /** Alineado con `system_config/market_radar.radar_trial_enabled` para la lista de beneficios por tier. */
  const [radarTrialBenefitListed, setRadarTrialBenefitListed] = useState(() => getRadarTrialEnabledSync());
  const [mpConfig, setMpConfig] = useState<MercadoPagoPublicConfig | null>(null);
  const [mpCheckoutLoading, setMpCheckoutLoading] = useState(false);
  const regionCode = Localization.getLocales?.()?.[0]?.regionCode?.toUpperCase?.() ?? '';
  const isPeruMarket = isMercadoPagoMarketRegion(regionCode);
  const mpCheckoutAvailable = Boolean(mpConfig?.enabled);

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
        setRadarTrialBenefitListed(r.radarTrialEnabled);
      }
    })();
    return () => {
      m = false;
    };
  }, []);

  useEffect(() => {
    const unsub = subscribeMarketRadarRemoteConfig((cfg) => {
      setRadarTrialBenefitListed(cfg.radarTrialEnabled);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let m = true;
    void (async () => {
      const cfg = await fetchMercadoPagoPublicConfig();
      if (m) setMpConfig(cfg);
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
    if (key === 'free') return t('sub_tier_free');
    if (key === 'influencer') return t('sub_tier_influencer');
    return t('sub_tier_business');
  };

  const tierSummary = useCallback(
    (key: TierKey, tiersCfg: TiersConfig) => {
      const lim = tiersCfg[key];
      const bits = [
        `${lim.iconDataLimit} IconData · ${lim.smartCardsLimit} Smart`,
        `${lim.businessCardsLimit} ${t('core_word_business')}`,
        `${lim.voipMinutesIncluded} ${t('sub_min_per_month')}${lim.premiumThemes ? ' · ' + t('sub_themes_plus') : ''}`,
      ];
      if (radarTrialBenefitListed) {
        bits.push(t('sub_tier_market_radar_pro_included'));
      }
      return bits.join('\n');
    },
    [t, radarTrialBenefitListed],
  );

  const onRadarProInfo = useCallback(() => {
    Alert.alert(t('sub_market_radar_pro_title'), t('sub_radar_full_access_body'));
  }, [t]);

  const startMercadoPagoCheckout = useCallback(
    async (
      tierKey: Exclude<TierKey, 'free'>,
      billingPeriod: MercadoPagoBillingPeriod,
      currencyId: MercadoPagoCurrencyId,
    ) => {
      if (!userId) {
        Alert.alert(t('sub_session_title'), t('sub_sign_in_to_continue'));
        return;
      }
      try {
        setMpCheckoutLoading(true);
        const session = await createMercadoPagoCheckoutSession({ tierKey, billingPeriod, currencyId });
        await WebBrowser.openBrowserAsync(session.initPoint, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          enableBarCollapsing: true,
        });
        Alert.alert(t('sub_mp_return_title'), t('sub_mp_return_body'));
      } catch (error) {
        const code = String((error as Error)?.message || '');
        if (code === 'mp_not_configured' || code === 'tier_price_unavailable') {
          Alert.alert(t('common_error'), t('sub_mp_not_configured'));
        } else if (code === 'AUTH_REQUIRED' || code === 'invalid_or_expired_id_token') {
          Alert.alert(t('sub_session_title'), t('sub_sign_in_to_continue'));
        } else {
          Alert.alert(
            t('common_error'),
            userFacingAlertMessage(error, language, t('sub_purchase_process_failed')),
          );
        }
      } finally {
        setMpCheckoutLoading(false);
      }
    },
    [userId, t, language],
  );

  const onTierCta = (key: TierKey) => {
    if (key === 'free') {
      Alert.alert(t('sub_free_plan_title'), t('sub_free_plan_body'));
      return;
    }
    if (!mpCheckoutAvailable) {
      Alert.alert(t('common_error'), t('sub_mp_not_configured'));
      return;
    }
    const currencyId: MercadoPagoCurrencyId = isPeruMarket ? 'PEN' : 'USD';
    void startMercadoPagoCheckout(key, 'monthly', currencyId);
  };

  const handleBuyCreditPack = async (pack: { id: string; productId: string; credits: number }) => {
    try {
      setSubscribingPack(pack.id);
      const purchaseResult = await Purchases.purchaseProduct(pack.productId);
      if (purchaseResult.customerInfo.entitlements.active[pack.productId]) {
        Alert.alert(t('sub_credit_pack_success_title'), t('sub_credit_pack_success_body', { credits: pack.credits }));
      }
    } catch (error: any) {
      if (!error.userCancelled) {
        Alert.alert(t('common_error'), t('sub_purchase_process_failed'));
        console.error('Purchase error:', error);
      }
    } finally {
      setSubscribingPack(null);
    }
  };

  const handleUpgradeBusinessCard = async () => {
    if (!userId) {
      Alert.alert(t('sub_session_title'), t('sub_sign_in_to_continue'));
      return;
    }
    try {
      setUpgradeLoading(true);
      const platform = Platform.OS as 'ios' | 'android';
      const result = await purchaseBusinessCard(platform, false, `business_annual_${Date.now()}`, userId);
      if (result.success) {
        Alert.alert(
          t('sub_biz_card_activated_title'),
          t('sub_biz_card_activated_body', { credits: String(result.cashbackCredits ?? 0) }),
        );
      } else {
        Alert.alert(t('common_error'), t('cards_purchase_failed'));
      }
    } catch (error) {
      console.error('Business card purchase error:', error);
      Alert.alert(t('common_error'), t('sub_purchase_process_failed'));
    } finally {
      setUpgradeLoading(false);
    }
  };

  const handleRestorePurchases = async () => {
    try {
      await Purchases.restorePurchases();
      const active = await refreshCardSocialProActive();
      setProActive(active);
      Alert.alert(t('sub_restore_success_title'), t('sub_restore_success_body'));
    } catch (error) {
      console.error('Restore purchases error:', error);
      Alert.alert(t('common_error'), t('sub_restore_failed'));
    }
  };

  const runProPaywall = async (mode: 'ifNeeded' | 'always') => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      Alert.alert(t('common_not_available'), t('sub_iap_native_only_body'));
      return;
    }
    try {
      setProActionLoading(true);
      const result =
        mode === 'ifNeeded' ? await presentCardSocialProPaywallIfNeeded() : await presentCardSocialProPaywall();
      const active = await refreshCardSocialProActive();
      setProActive(active);
      if (paywallResultIndicatesUnlock(result)) {
        Alert.alert(t('sub_pro_title'), t('sub_pro_updated_body'));
      }
    } catch (error) {
      const { cancelled } = formatRevenueCatPurchaseError(error);
      if (!cancelled) {
        Alert.alert(
          t('common_error'),
          userFacingAlertMessage(error, language, t('sub_operation_failed')),
        );
      }
    } finally {
      setProActionLoading(false);
    }
  };

  const runCustomerCenter = async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      Alert.alert(t('common_not_available'), t('sub_native_app_only_body'));
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
          t('common_error'),
          userFacingAlertMessage(error, language, t('sub_subscription_center_failed')),
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
        return t('sub_other_countries_intl');
      }
      try {
        return new Intl.DisplayNames([intlLocale], { type: 'region' }).of(code) ?? code;
      } catch {
        return code;
      }
    },
    [intlLocale, t],
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
      t('sub_payment_summary_title'),
      [
        `${t('sub_card_price')}: ${fmtUsd(nfcCheckout.cardUsd)}`,
        `${t('sub_shipping_handling')}: ${fmtUsd(nfcCheckout.shipUsd)}`,
        `${t('sub_total')}: ${fmtUsd(nfcCheckout.totalUsd)}`,
        `${t('sub_cs_credits_equivalent')}: ${t('sub_nfc_cs_equivalent_line', {
          cardCs: nfcCheckout.cardCs.toLocaleString(),
          shipCs: nfcCheckout.shipCs.toLocaleString(),
          totalCs: nfcCheckout.totalCs.toLocaleString(),
        })}`,
      ].join('\n'),
    );
  }, [fmtUsd, nfcCheckout, t]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      {...verticalScrollInteractionProps}
      contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, styles.content]}
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
              accessibilityLabel={t('common_close')}
            >
              <MaterialCommunityIcons name="close" size={24} color={shell.fabText} />
            </TouchableOpacity>
          </View>
        ) : null}
        <MaterialCommunityIcons name="storefront-outline" size={30} color={shell.ctaAccent} />
        <Text style={styles.headerTitle}>{t('sub_plans_header_title')}</Text>
        <Text style={styles.headerSubtitle}>{t('sub_plans_header_subtitle')}</Text>
      </LinearGradient>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('sub_pro_title')}</Text>
        <Text style={styles.sectionHint}>{t('sub_pro_section_hint')}</Text>
        <View style={[styles.tierCard, proActive && styles.tierCardHighlight]}>
          {proLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={shell.ctaAccent} />
            </View>
          ) : (
            <>
              <Text style={styles.tierName}>{proActive ? t('sub_pro_active') : t('sub_pro_inactive')}</Text>
              <Text style={styles.tierMeta}>
                {userId ? t('sub_purchases_linked') : t('sub_sign_in_sync_purchases')}
              </Text>
              <View style={{ marginTop: 16, gap: 12 }}>
                <LuxCtaButton
                  label={proActionLoading ? t('sub_opening') : t('sub_upgrade_subscription')}
                  onPress={() => void runProPaywall('ifNeeded')}
                  icon="crown-outline"
                  disabled={proActionLoading}
                  loading={proActionLoading}
                  style={{ width: '100%' }}
                />
                <LuxCtaButton
                  variant="outline"
                  label={proActionLoading ? t('sub_opening') : t('sub_view_plans')}
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
                  <Text style={styles.nfcBtnText}>{t('sub_subscription_center_btn')}</Text>
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
          <Text style={styles.sectionTitle}>{t('sub_market_radar_pro_title')}</Text>
          <Text style={styles.sectionHint}>{t('sub_radar_section_hint')}</Text>
          <View style={styles.tierCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tierName}>{t('sub_pro_access')}</Text>
                <Text style={[styles.tierMeta, { marginTop: 6 }]}>
                  {radarProPriceUsd > 0 || radarProEquivalentCs > 0
                    ? [
                        radarProPriceUsd > 0 ? `${fmtUsd(radarProPriceUsd)} USD` : null,
                        radarProEquivalentCs > 0 ? `${radarProEquivalentCs.toLocaleString()} CS` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : t('sub_coming_soon_app')}
                </Text>
              </View>
              <MaterialCommunityIcons name="radar" size={30} color={shell.ctaAccent} />
            </View>
            <LuxCtaButton
              variant="outline"
              label={t('sub_details_btn')}
              onPress={onRadarProInfo}
              icon="information-outline"
              style={{ width: '100%', marginTop: 14, minHeight: 48 }}
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('sub_subscriptions_section_title')}</Text>
        <Text style={styles.sectionHint}>{t('sub_subscriptions_section_hint')}</Text>
        {mpCheckoutAvailable ? (
          <Text style={[styles.sectionHint, { marginTop: -8, marginBottom: 12, color: shell.ctaAccent }]}>
            {t('sub_mp_peru_hint')}
          </Text>
        ) : null}
        {tiersLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={shell.ctaAccent} />
          </View>
        ) : !cfg ? (
          <View style={styles.emptyCallout}>
            <Text style={styles.tierMeta}>{t('sub_rates_unavailable')}</Text>
          </View>
        ) : (
          (['free', 'influencer', 'business'] as TierKey[]).map((key) => (
            <View key={key} style={[styles.tierCard, key === 'business' && styles.tierCardHighlight]}>
              <Text style={styles.tierName}>{tierLabel(key)}</Text>
              <Text style={styles.tierPrice}>
                {key === 'free'
                  ? fmtUsd(0)
                  : `${fmtUsd(cfg[key].monthlyPriceUsd)} ${t('sub_per_month')}`}
                {key !== 'free' && cfg[key].monthlyEquivalentCs > 0
                  ? ` · ${cfg[key].monthlyEquivalentCs.toLocaleString()} CS`
                  : ''}
                {key !== 'free'
                  ? ` · ${fmtUsd(cfg[key].annualPriceUsd)} ${t('sub_per_year')}`
                  : ''}
                {key !== 'free' && cfg[key].annualEquivalentCs > 0
                  ? ` · ${cfg[key].annualEquivalentCs.toLocaleString()} CS`
                  : ''}
                {cfg[key].freeTrialDays > 0
                  ? ` · ${cfg[key].freeTrialDays} ${t('sub_trial_days_suffix')}`
                  : ''}
              </Text>
              <Text style={styles.tierMeta}>{tierSummary(key, cfg)}</Text>
              <TouchableOpacity
                style={[styles.tierCta, mpCheckoutLoading && key !== 'free' ? { opacity: 0.65 } : null]}
                onPress={() => onTierCta(key)}
                disabled={mpCheckoutLoading && key !== 'free'}
                activeOpacity={0.85}
              >
                {mpCheckoutLoading && key !== 'free' ? (
                  <ActivityIndicator size="small" color={shell.emptyCtaText} />
                ) : (
                  <Text style={styles.tierCtaText}>
                    {key === 'free' ? t('sub_included') : t('sub_continue')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View onLayout={(e) => setPhysicalSectionY(e.nativeEvent.layout.y)}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('sub_business_nfc_section_title')}</Text>
        <Text style={styles.sectionHint}>{t('sub_business_nfc_section_hint')}</Text>
        {cfg ? (
          <>
            <View style={styles.addonRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addonTitle}>{t('sub_addon_extra_business_card')}</Text>
                <Text style={styles.addonNote}>{t('sub_addon_per_extra_card')}</Text>
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
                <Text style={styles.addonTitle}>{t('sub_addon_nfc_pvc')}</Text>
                <Text style={styles.addonNote}>{t('sub_addon_inventory_ops')}</Text>
              </View>
              <Text style={styles.addonPrice}>
                {fmtUsd(cfg.addOns.physicalPvcCardUsd)}
                {cfg.addOns.physicalPvcCardCs > 0 ? ` · ${cfg.addOns.physicalPvcCardCs.toLocaleString()} CS` : ''}
              </Text>
            </View>
            <View style={styles.addonRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addonTitle}>{t('sub_addon_nfc_metal')}</Text>
                <Text style={styles.addonNote}>{t('sub_addon_stock_support')}</Text>
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
            <Text style={styles.physicalNfcTitle}>{t('sub_nfc_physical_title')}</Text>
            <Text style={[styles.sectionHint, { marginBottom: 12 }]}>
              {t('sub_nfc_physical_hint')}
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
                  {t('nfc_material_metal')}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.countryLabel}>{t('sub_ship_to_country')}</Text>
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
                <Text style={styles.breakdownLabel}>{t('sub_card_price')}</Text>
                <Text style={styles.breakdownValue}>{fmtUsd(nfcCheckout.cardUsd)}</Text>
              </View>
              <View style={styles.breakdownLine}>
                <Text style={styles.breakdownLabel}>{t('sub_shipping_handling')}</Text>
                <Text style={styles.breakdownValue}>{fmtUsd(nfcCheckout.shipUsd)}</Text>
              </View>
              <View style={[styles.breakdownLine, styles.breakdownTotalLine]}>
                <Text style={styles.breakdownTotalLabel}>{t('sub_total')}</Text>
                <Text style={styles.breakdownTotalValue}>{fmtUsd(nfcCheckout.totalUsd)}</Text>
              </View>
              {(nfcCheckout.cardCs > 0 || nfcCheckout.shipCs > 0) && (
                <View style={[styles.breakdownLine, { marginTop: 6 }]}>
                  <Text style={styles.breakdownLabel}>{t('sub_equivalent_cs_short')}</Text>
                  <Text style={styles.breakdownValue}>
                    {nfcCheckout.totalCs.toLocaleString()} CS
                  </Text>
                </View>
              )}
            </View>
            <LuxCtaButton
              variant="outline"
              label={t('sub_confirm_total')}
              onPress={confirmNfcPhysicalTotal}
              icon="receipt"
              style={{ width: '100%', marginTop: 8, minHeight: 48 }}
            />
          </View>
        ) : null}

        <TouchableOpacity style={styles.nfcBtn} onPress={() => router.push('/nfc' as never)} activeOpacity={0.85}>
          <Text style={styles.nfcBtnText}>{t('sub_nfc_operations_link')}</Text>
        </TouchableOpacity>

        <LinearGradient colors={[...shell.vipBannerGradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.businessBlock}>
          <View style={styles.businessInner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialCommunityIcons name="briefcase-check" size={26} color={shell.ctaAccent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.businessTitle}>{t('sub_annual_license_title')}</Text>
                <Text style={styles.businessSub}>
                  {bizPackage
                    ? `${fmtUsd(bizPackage.priceUsd)} ${t('sub_per_year_app_store')}`
                    : t('sub_annual_rate_unavailable')}
                </Text>
              </View>
            </View>
            <LuxCtaButton
              label={upgradeLoading ? t('sub_purchasing') : t('sub_activate_annual_license')}
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
        <Text style={styles.sectionTitle}>{t('sub_cs_coins_section_title')}</Text>
        <Text style={styles.sectionHint}>{t('sub_cs_coins_section_hint')}</Text>
        {commerceLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={shell.ctaAccent} />
          </View>
        ) : commerceIssue === 'no_document' ? (
          <View style={styles.emptyCallout}>
            <Text style={styles.tierMeta}>{t('sub_catalog_unavailable')}</Text>
          </View>
        ) : commerceIssue === 'read_error' ? (
          <View style={styles.emptyCallout}>
            <Text style={styles.tierMeta}>{t('sub_catalog_load_error')}</Text>
          </View>
        ) : commerceCreditPacks.length === 0 ? (
          <View style={styles.emptyCallout}>
            <Text style={styles.tierMeta}>{t('sub_no_bundles')}</Text>
          </View>
        ) : (
          <View style={styles.packGrid}>
            {commerceCreditPacks.map((pack) => (
              <View key={pack.id} style={[styles.packCard, pack.popular && styles.packPopular]}>
                {pack.popular ? (
                  <Text style={{ fontSize: 10, fontWeight: '800', color: shell.ctaAccent, marginBottom: 4, letterSpacing: 0.6 }}>
                    {t('sub_popular_badge')}
                  </Text>
                ) : null}
                <Text style={styles.packCredits}>{pack.credits}</Text>
                <Text style={styles.packLabel}>{t('sub_credits_label')}</Text>
                <Text style={styles.packPrice}>{fmtUsd(pack.priceUsd)}</Text>
                <LuxCtaButton
                  label={subscribingPack === pack.id ? t('sub_purchasing') : t('sub_buy')}
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
        <Text style={styles.legalTitle}>{t('sub_commercial_terms_title')}</Text>
        <Text style={styles.legalText}>
          • {t('sub_terms_amounts_may_differ')}
          {'\n'}• {t('sub_terms_accept_tac')}
          {'\n'}• {t('sub_terms_restore_policy')}
        </Text>
        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestorePurchases}>
          <MaterialCommunityIcons name="history" size={18} color={shell.emptyCtaText} />
          <Text style={styles.restoreTxt}>{t('sub_restore_purchases')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default Subscription;
