import LuxCtaButton from '@/components/LuxCtaButton';
import palette from '@/app/theme';
import { SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import { getActiveUserId } from '@/services/authSession';
import { useCoreT } from '@/services/coreI18n';
import { intlLocaleTagForAppLanguage, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import {
  createMercadoPagoCheckoutSession,
  fetchMercadoPagoPublicConfig,
  openMercadoPagoCheckoutUrl,
  type MercadoPagoBillingPeriod,
  type MercadoPagoCurrencyId,
  type MercadoPagoPublicConfig,
} from '@/services/mercadopagoCheckoutService';
import { getTiersConfig, type TierKey, type TiersConfig } from '@/services/tiersConfigService';
import {
  formatCsPaymentPriceLine,
  formatUsdPriceLine,
  joinPriceSegments,
  normalizePricePair,
  shouldShowUsdPrice,
} from '@/services/subscriptionPriceVisibility';
import { userFacingAlertMessage } from '@/services/apiUserFacingError';
import { useUserCsBalance } from '@/hooks/useUserCsBalance';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  formatRevenueCatPurchaseError,
  presentCardSocialProPaywall,
  paywallResultIndicatesUnlock,
  syncRevenueCatWithFirebaseUid,
} from '@/services/revenueCatProSubscription';

interface SubscriptionProps {
  onClose?: () => void;
}

/** Hub de membresía: únicamente tiers (Free / Influencer / Business). */
const Subscription: React.FC<SubscriptionProps> = ({ onClose }) => {
  const t = useCoreT();
  const { language } = useLanguage();
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];
  const intlLocale = intlLocaleTagForAppLanguage(language);

  const fmtUsd = useCallback(
    (n: number) =>
      new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n),
    [intlLocale],
  );

  const [userId, setUserId] = useState('');
  const [tiers, setTiers] = useState<TiersConfig | null>(null);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [mpConfig, setMpConfig] = useState<MercadoPagoPublicConfig | null>(null);
  const [mpCheckoutLoading, setMpCheckoutLoading] = useState(false);
  const [manageLoading, setManageLoading] = useState(false);
  const mpCheckoutAvailable = Boolean(mpConfig?.enabled);
  const { balance: userCsBalance } = useUserCsBalance();

  const paidTierCtaLabel = language === 'es' ? 'Adquirir' : 'Acquire';

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const uid = await getActiveUserId();
        if (mounted && uid) setUserId(uid);
      } finally {
        /* no loading gate */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
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
        section: { paddingHorizontal: 20, marginBottom: 28 },
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

  const tierPriceLine = useCallback(
    (key: TierKey, tiersCfg: TiersConfig) => {
      if (key === 'free') return fmtUsd(0);
      const lim = tiersCfg[key];
      const monthly = normalizePricePair(lim.monthlyPriceUsd, lim.monthlyEquivalentCs);
      const annual = normalizePricePair(lim.annualPriceUsd, lim.annualEquivalentCs);
      const segments = [
        formatUsdPriceLine(monthly, { formatUsd: fmtUsd, suffix: ` ${t('sub_per_month')}` }),
        formatCsPaymentPriceLine(monthly, userCsBalance, { locale: intlLocale }),
        formatUsdPriceLine(annual, { formatUsd: fmtUsd, suffix: ` ${t('sub_per_year')}` }),
        formatCsPaymentPriceLine(annual, userCsBalance, { locale: intlLocale }),
        lim.annualTrialDays > 0 ? `${lim.annualTrialDays} ${t('sub_trial_days_suffix')}` : null,
      ];
      const joined = joinPriceSegments(segments);
      return joined || t('sub_rates_unavailable');
    },
    [fmtUsd, intlLocale, t, userCsBalance],
  );

  const mpTierUsdAvailable = useCallback(
    (tierKey: Exclude<TierKey, 'free'>, billingPeriod: MercadoPagoBillingPeriod) => {
      if (!tiers) return false;
      const usd =
        billingPeriod === 'annual' ? tiers[tierKey].annualPriceUsd : tiers[tierKey].monthlyPriceUsd;
      return shouldShowUsdPrice(normalizePricePair(usd, 0));
    },
    [tiers],
  );

  const tierSummary = useCallback(
    (key: TierKey, tiersCfg: TiersConfig) => {
      const lim = tiersCfg[key];
      return [
        `${lim.iconDataLimit} IconData · ${lim.smartCardsLimit} Smart`,
        `${lim.businessCardsLimit} ${t('core_word_business')}`,
        `${lim.voipMinutesIncluded} ${t('sub_min_per_month')}${lim.premiumThemes ? ' · ' + t('sub_themes_plus') : ''}`,
      ].join('\n');
    },
    [t],
  );

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
        await openMercadoPagoCheckoutUrl(session.initPoint);
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

  const mpCheckoutAmountLabel = useCallback(
    (
      tierKey: Exclude<TierKey, 'free'>,
      billingPeriod: MercadoPagoBillingPeriod,
      currencyId: MercadoPagoCurrencyId,
    ) => {
      if (!tiers) return '';
      const usd =
        billingPeriod === 'annual' ? tiers[tierKey].annualPriceUsd : tiers[tierKey].monthlyPriceUsd;
      if (currencyId === 'USD') return fmtUsd(usd);
      const rate = mpConfig?.usdToPenRate && mpConfig.usdToPenRate > 0 ? mpConfig.usdToPenRate : 3.75;
      return `S/ ${(usd * rate).toFixed(2)}`;
    },
    [tiers, mpConfig?.usdToPenRate, fmtUsd],
  );

  const promptMercadoPagoAcquire = useCallback(
    (tierKey: Exclude<TierKey, 'free'>) => {
      const options: { text: string; onPress?: () => void; style?: 'cancel' }[] = [];
      if (mpTierUsdAvailable(tierKey, 'monthly')) {
        options.push({
          text: `${t('sub_mp_billing_monthly_pen')} · ${mpCheckoutAmountLabel(tierKey, 'monthly', 'PEN')}`,
          onPress: () => void startMercadoPagoCheckout(tierKey, 'monthly', 'PEN'),
        });
      }
      if (mpTierUsdAvailable(tierKey, 'annual')) {
        options.push({
          text: `${t('sub_mp_billing_annual_pen')} · ${mpCheckoutAmountLabel(tierKey, 'annual', 'PEN')}`,
          onPress: () => void startMercadoPagoCheckout(tierKey, 'annual', 'PEN'),
        });
      }
      if (mpTierUsdAvailable(tierKey, 'monthly')) {
        options.push({
          text: `${t('sub_mp_billing_monthly_usd')} · ${mpCheckoutAmountLabel(tierKey, 'monthly', 'USD')}`,
          onPress: () => void startMercadoPagoCheckout(tierKey, 'monthly', 'USD'),
        });
      }
      if (mpTierUsdAvailable(tierKey, 'annual')) {
        options.push({
          text: `${t('sub_mp_billing_annual_usd')} · ${mpCheckoutAmountLabel(tierKey, 'annual', 'USD')}`,
          onPress: () => void startMercadoPagoCheckout(tierKey, 'annual', 'USD'),
        });
      }
      options.push({ text: t('common_cancel'), style: 'cancel' });
      if (options.length === 1) {
        Alert.alert(t('common_error'), t('sub_rates_unavailable'));
        return;
      }
      Alert.alert(t('sub_mp_checkout_title'), t('sub_mp_checkout_body'), options);
    },
    [mpCheckoutAmountLabel, mpTierUsdAvailable, startMercadoPagoCheckout, t],
  );

  const runStorePaywall = useCallback(async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      Alert.alert(t('common_not_available'), t('sub_iap_native_only_body'));
      return;
    }
    try {
      setManageLoading(true);
      await syncRevenueCatWithFirebaseUid(userId.trim() ? userId : null);
      const result = await presentCardSocialProPaywall();
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
      setManageLoading(false);
    }
  }, [userId, t, language]);

  const onTierCta = useCallback(
    (key: TierKey) => {
      if (key === 'free') {
        Alert.alert(t('sub_free_plan_title'), t('sub_free_plan_body'));
        return;
      }
      if (mpCheckoutAvailable) {
        promptMercadoPagoAcquire(key);
        return;
      }
      void runStorePaywall();
    },
    [mpCheckoutAvailable, promptMercadoPagoAcquire, runStorePaywall, t],
  );

  const cfg = tiers ?? null;

  return (
    <ScrollView
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
        <MaterialCommunityIcons name="card-account-details-outline" size={30} color={shell.ctaAccent} />
        <Text style={styles.headerTitle}>{t('sub_plans_header_title')}</Text>
        <Text style={styles.headerSubtitle}>{t('sub_subscriptions_section_hint')}</Text>
      </LinearGradient>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('sub_subscriptions_section_title')}</Text>
        {mpCheckoutAvailable ? (
          <Text style={[styles.sectionHint, { color: shell.ctaAccent }]}>{t('sub_mp_peru_hint')}</Text>
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
            <View key={key} style={[styles.tierCard, key === 'influencer' && styles.tierCardHighlight]}>
              <Text style={styles.tierName}>{tierLabel(key)}</Text>
              <Text style={styles.tierPrice}>{tierPriceLine(key, cfg)}</Text>
              <Text style={styles.tierMeta}>{tierSummary(key, cfg)}</Text>
              <TouchableOpacity
                style={[styles.tierCta, (mpCheckoutLoading || manageLoading) && key !== 'free' ? { opacity: 0.65 } : null]}
                onPress={() => onTierCta(key)}
                disabled={(mpCheckoutLoading || manageLoading) && key !== 'free'}
                activeOpacity={0.85}
              >
                {mpCheckoutLoading && key !== 'free' ? (
                  <ActivityIndicator size="small" color={shell.emptyCtaText} />
                ) : (
                  <Text style={styles.tierCtaText}>
                    {key === 'free' ? t('sub_included') : paidTierCtaLabel}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

export default Subscription;
