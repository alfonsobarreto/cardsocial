/**
 * Compra contextual de cupos extra IconData (Bóveda).
 */
import LuxCtaButton from '@/components/LuxCtaButton';
import palette from '@/app/theme';
import { SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import { getActiveUserId } from '@/services/authSession';
import { getCommerceConfig, type CommerceIconDataSlotPack } from '@/services/commerceConfigService';
import { useCoreT } from '@/services/coreI18n';
import { intlLocaleTagForAppLanguage, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { redeemIconDataSlotPack } from '@/services/qrApi';
import { requestSubscriptionPanel } from '@/services/subscriptionNavigationIntent';
import { userFacingAlertMessage } from '@/services/apiUserFacingError';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Purchases from 'react-native-purchases';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function IconDataSlotsCheckoutModal({ visible, onClose }: Props) {
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

  const [loading, setLoading] = useState(true);
  const [packs, setPacks] = useState<CommerceIconDataSlotPack[]>([]);
  const [issue, setIssue] = useState<'none' | 'no_document' | 'read_error'>('none');
  const [buyingId, setBuyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void (async () => {
      setLoading(true);
      try {
        const res = await getCommerceConfig();
        if (!alive) return;
        if (res.ok) {
          setIssue('none');
          setPacks(res.data.iconDataSlotPacks);
        } else {
          setPacks([]);
          setIssue(res.reason === 'no_document' ? 'no_document' : 'read_error');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [visible]);

  const handleBuy = async (pack: CommerceIconDataSlotPack) => {
    const uid = await getActiveUserId();
    if (!uid) {
      Alert.alert(t('sub_session_title'), t('sub_sign_in_to_continue'));
      return;
    }
    try {
      setBuyingId(pack.id);
      await Purchases.purchaseProduct(pack.productId);
      const redeemed = await redeemIconDataSlotPack({
        uid,
        packId: pack.id,
        productId: pack.productId,
      });
      if (redeemed.ok) {
        Alert.alert(
          t('sub_icondata_pack_success_title'),
          t('sub_icondata_pack_success_body', { slots: String(pack.slots) }),
        );
        onClose();
      } else {
        Alert.alert(t('common_error'), t('sub_purchase_process_failed'));
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
      setBuyingId(null);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
        sheet: {
          maxHeight: '90%',
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
        packCard: {
          borderRadius: 14,
          padding: 14,
          marginBottom: 12,
          backgroundColor: shell.surfaceMuted,
          borderWidth: 1,
          borderColor: shell.modalBorder,
        },
        packPopular: { borderColor: shell.ctaAccent, borderWidth: 2 },
        packSlots: { fontSize: 22, fontWeight: '800', color: shell.ctaAccent },
        packMeta: { fontSize: 12, color: shell.textSecondary, marginTop: 4 },
        tierLink: { marginTop: 16, alignSelf: 'center', paddingVertical: 8 },
        tierLinkText: { fontSize: 12, fontWeight: '600', color: shell.ctaAccent, textDecorationLine: 'underline' },
        emptyCallout: {
          borderRadius: 16,
          padding: 18,
          borderWidth: 1,
          borderColor: shell.modalBorder,
          borderStyle: 'dashed',
          backgroundColor: shell.surfaceMuted,
        },
        loadingRow: { paddingVertical: 24, alignItems: 'center' },
      }),
    [shell],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('sub_icondata_slots_section_title')}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <MaterialCommunityIcons name="close" size={22} color={shell.textMuted} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, { paddingHorizontal: 20, paddingBottom: 12 }]}
            {...verticalScrollInteractionProps}
          >
            <Text style={styles.hint}>{t('sub_icondata_slots_section_hint')}</Text>
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={shell.ctaAccent} />
              </View>
            ) : issue !== 'none' || packs.length === 0 ? (
              <View style={styles.emptyCallout}>
                <Text style={styles.packMeta}>{t('sub_no_bundles')}</Text>
              </View>
            ) : (
              packs.map((pack) => (
                <View key={pack.id} style={[styles.packCard, pack.popular && styles.packPopular]}>
                  <Text style={styles.packSlots}>
                    +{pack.slots} IconData
                  </Text>
                  <Text style={styles.packMeta}>{fmtUsd(pack.priceUsd)}</Text>
                  <LuxCtaButton
                    label={buyingId === pack.id ? t('sub_purchasing') : t('sub_buy')}
                    onPress={() => void handleBuy(pack)}
                    disabled={buyingId !== null}
                    loading={buyingId === pack.id}
                    icon={buyingId === pack.id ? undefined : 'safe-square-outline'}
                    style={{ width: '100%', marginTop: 12, minHeight: 48 }}
                  />
                </View>
              ))
            )}
            <TouchableOpacity
              style={styles.tierLink}
              onPress={() => {
                onClose();
                requestSubscriptionPanel({ delayMs: 250 });
              }}
            >
              <Text style={styles.tierLinkText}>{t('sub_icondata_see_tier_plans')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
