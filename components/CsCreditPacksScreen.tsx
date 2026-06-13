/**
 * Compra contextual de packs CS (monedas). No forma parte del hub de Suscripciones.
 */
import LuxCtaButton from '@/components/LuxCtaButton';
import palette from '@/app/theme';
import { SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import { getCommerceConfig } from '@/services/commerceConfigService';
import { useCoreT } from '@/services/coreI18n';
import { intlLocaleTagForAppLanguage, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { userFacingAlertMessage } from '@/services/apiUserFacingError';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Purchases from 'react-native-purchases';

type CreditPackRow = {
  id: string;
  productId: string;
  priceUsd: number;
  popular?: boolean;
  credits: number;
};

type Props = {
  onClose?: () => void;
};

export default function CsCreditPacksScreen({ onClose }: Props) {
  const t = useCoreT();
  const { language } = useLanguage();
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];
  const intlLocale = intlLocaleTagForAppLanguage(language);
  const { width } = Dimensions.get('window');

  const fmtUsd = useCallback(
    (n: number) =>
      new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n),
    [intlLocale],
  );

  const [commerceLoading, setCommerceLoading] = useState(true);
  const [commerceCreditPacks, setCommerceCreditPacks] = useState<CreditPackRow[]>([]);
  const [commerceIssue, setCommerceIssue] = useState<'none' | 'no_document' | 'read_error'>('none');
  const [subscribingPack, setSubscribingPack] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setCommerceLoading(true);
      try {
        const res = await getCommerceConfig();
        if (!alive) return;
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
        if (alive) setCommerceLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleBuyCreditPack = async (pack: CreditPackRow) => {
    try {
      setSubscribingPack(pack.id);
      const purchaseResult = await Purchases.purchaseProduct(pack.productId);
      if (purchaseResult.customerInfo.entitlements.active[pack.productId]) {
        Alert.alert(t('sub_credit_pack_success_title'), t('sub_credit_pack_success_body', { credits: pack.credits }));
      }
    } catch (error: unknown) {
      const err = error as { userCancelled?: boolean };
      if (!err.userCancelled) {
        Alert.alert(
          t('common_error'),
          userFacingAlertMessage(error, language, t('sub_purchase_process_failed')),
        );
      }
    } finally {
      setSubscribingPack(null);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: shell.backgroundSolid },
        hero: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
        headerCloseRow: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
        headerCloseHit: { padding: 6 },
        headerTitle: { fontSize: 24, fontWeight: '700', color: shell.fabText, marginTop: 10, textAlign: 'center', letterSpacing: 0.3 },
        headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.88)', marginTop: 8, textAlign: 'center', lineHeight: 20 },
        section: { paddingHorizontal: 20, marginBottom: 28 },
        sectionTitle: { fontSize: 18, fontWeight: '700', color: shell.textPrimary, marginBottom: 8, letterSpacing: 0.2 },
        sectionHint: { fontSize: 13, color: shell.textSecondary, marginBottom: 16, lineHeight: 20 },
        loadingRow: { paddingVertical: 20, alignItems: 'center' },
        emptyCallout: {
          borderRadius: 16,
          padding: 18,
          borderWidth: 1,
          borderColor: shell.modalBorder,
          borderStyle: 'dashed',
          backgroundColor: shell.surfaceMuted,
        },
        tierMeta: { fontSize: 12, color: shell.textSecondary, lineHeight: 18 },
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
      }),
    [shell, width],
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={SCROLL_CONTENT_MIN_FILL}
      {...verticalScrollInteractionProps}
    >
      <LinearGradient colors={[...shell.vipBannerGradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        {onClose ? (
          <View style={styles.headerCloseRow}>
            <TouchableOpacity style={styles.headerCloseHit} onPress={onClose} accessibilityRole="button">
              <MaterialCommunityIcons name="close" size={22} color={shell.fabText} />
            </TouchableOpacity>
          </View>
        ) : null}
        <MaterialCommunityIcons name="circle-multiple" size={40} color={shell.fabText} style={{ alignSelf: 'center' }} />
        <Text style={styles.headerTitle}>{t('sub_cs_coins_section_title')}</Text>
        <Text style={styles.headerSubtitle}>{t('sub_cs_coins_section_hint')}</Text>
      </LinearGradient>

      <View style={styles.section}>
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
    </ScrollView>
  );
}
