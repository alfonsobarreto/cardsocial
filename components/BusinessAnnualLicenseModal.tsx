/**
 * Licencia anual Social Market por tarjeta de negocio — contextual, no en hub de tiers.
 */
import LuxCtaButton from '@/components/LuxCtaButton';
import palette from '@/app/theme';
import { SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import { getActiveUserId } from '@/services/authSession';
import { useCoreT } from '@/services/coreI18n';
import { intlLocaleTagForAppLanguage, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import {
  loadBusinessCardPackageForPlatform,
  purchaseBusinessCard,
  type BusinessCardPackage,
} from '@/services/businessCardPaywallService';
import { notifyBusinessLicenseActivated } from '@/services/subscriptionNavigationIntent';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  bId: string;
  onClose: () => void;
  onActivated?: () => void;
};

export function BusinessAnnualLicenseModal({ visible, bId, onClose, onActivated }: Props) {
  const t = useCoreT();
  const { language } = useLanguage();
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const intlLocale = intlLocaleTagForAppLanguage(language);

  const fmtUsd = useCallback(
    (n: number) =>
      new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n),
    [intlLocale],
  );

  const [bizPackage, setBizPackage] = useState<BusinessCardPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void (async () => {
      setLoading(true);
      try {
        if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
          if (alive) setBizPackage(null);
          return;
        }
        const pkg = await loadBusinessCardPackageForPlatform(Platform.OS as 'ios' | 'android');
        if (alive) setBizPackage(pkg);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [visible]);

  const handlePurchase = async () => {
    const uid = await getActiveUserId();
    const cardId = String(bId || '').trim();
    if (!uid) {
      Alert.alert(t('sub_session_title'), t('sub_sign_in_to_continue'));
      return;
    }
    if (!cardId) {
      Alert.alert(t('common_error'), t('sub_annual_rate_unavailable'));
      return;
    }
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      Alert.alert(t('common_not_available'), t('sub_iap_native_only_body'));
      return;
    }
    try {
      setPurchasing(true);
      const result = await purchaseBusinessCard(Platform.OS as 'ios' | 'android', false, cardId, uid);
      if (result.success) {
        Alert.alert(
          t('sub_biz_card_activated_title'),
          t('sub_biz_card_activated_body', { credits: String(result.cashbackCredits ?? 0) }),
        );
        onActivated?.();
        notifyBusinessLicenseActivated(cardId);
        onClose();
      } else {
        Alert.alert(t('common_error'), result.message || t('cards_purchase_failed'));
      }
    } catch (error) {
      Alert.alert(
        t('common_error'),
        userFacingAlertMessage(error, language, t('cards_purchase_failed')),
      );
    } finally {
      setPurchasing(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
        sheet: {
          maxHeight: '88%',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          backgroundColor: shell.modalBg,
          borderWidth: 1,
          borderColor: shell.modalBorder,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 8,
        },
        title: { fontSize: 18, fontWeight: '700', color: shell.textPrimary, flex: 1 },
        hint: { fontSize: 13, color: shell.textSecondary, lineHeight: 20, marginBottom: 16 },
        card: {
          borderRadius: 16,
          padding: 16,
          backgroundColor: shell.surfaceMuted,
          borderWidth: 1,
          borderColor: shell.modalBorder,
        },
        tierName: { fontSize: 16, fontWeight: '700', color: shell.textPrimary },
        tierMeta: { fontSize: 13, color: shell.textSecondary, marginTop: 6, lineHeight: 20 },
        body: { fontSize: 13, color: shell.textSecondary, lineHeight: 20, marginTop: 14 },
        loadingRow: { paddingVertical: 24, alignItems: 'center' },
      }),
    [shell],
  );

  const priceLabel = bizPackage
    ? `${fmtUsd(bizPackage.priceUsd)} ${t('sub_per_year_app_store')}`
    : t('sub_annual_rate_unavailable');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('sub_activate_annual_license')}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <MaterialCommunityIcons name="close" size={22} color={shell.textMuted} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, { paddingHorizontal: 20, paddingBottom: 12 }]}
            {...verticalScrollInteractionProps}
          >
            <Text style={styles.hint}>{t('sub_business_nfc_section_hint')}</Text>
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={shell.ctaAccent} />
              </View>
            ) : (
              <View style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tierName}>{t('sub_pro_access')}</Text>
                    <Text style={styles.tierMeta}>{priceLabel}</Text>
                  </View>
                  <MaterialCommunityIcons name="badge-account" size={30} color={shell.ctaAccent} />
                </View>
                <Text style={styles.body}>{t('create_license_required_publishing_body')}</Text>
                <LuxCtaButton
                  label={purchasing ? t('sub_purchasing') : t('sub_activate_annual_license')}
                  onPress={() => void handlePurchase()}
                  disabled={purchasing || !bizPackage}
                  loading={purchasing}
                  icon={purchasing ? undefined : 'badge-account'}
                  style={{ width: '100%', marginTop: 16, minHeight: 48 }}
                />
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
