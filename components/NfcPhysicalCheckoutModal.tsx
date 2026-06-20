/**
 * Compra contextual de tarjeta física NFC (PVC/metal + envío).
 * Se abre desde NFC u otros flujos — no desde el hub de Suscripciones.
 */
import LuxCtaButton from '@/components/LuxCtaButton';
import palette from '@/app/theme';
import { SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import { useCoreT } from '@/services/coreI18n';
import { intlLocaleTagForAppLanguage, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import {
  NFC_PHYSICAL_CARD_SHIPPING_COUNTRY_CODES,
  nfcPhysicalCardCs,
  nfcPhysicalShippingCs,
  nfcPhysicalShippingUsd,
  resolveNfcPhysicalShippingZone,
  sortNfcShippingCountryCodesForLocale,
} from '@/services/nfcPhysicalCardShipping';
import { getTiersConfig, type TiersConfig } from '@/services/tiersConfigService';
import { shouldShowCsPaymentPrice, normalizePricePair } from '@/services/subscriptionPriceVisibility';
import { useUserCsBalance } from '@/hooks/useUserCsBalance';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as Localization from 'expo-localization';
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
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function NfcPhysicalCheckoutModal({ visible, onClose }: Props) {
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

  const [tiers, setTiers] = useState<TiersConfig | null>(null);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [nfcMaterial, setNfcMaterial] = useState<'pvc' | 'metal'>('pvc');
  const [nfcShipCountry, setNfcShipCountry] = useState('US');
  const { balance: userCsBalance } = useUserCsBalance(visible);

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    void (async () => {
      setTiersLoading(true);
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
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const allowed = new Set(NFC_PHYSICAL_CARD_SHIPPING_COUNTRY_CODES);
    const r = Localization.getLocales?.()?.[0]?.regionCode?.toUpperCase?.() ?? '';
    if (r && allowed.has(r)) setNfcShipCountry(r);
    else if (r) setNfcShipCountry('ZZ');
    else setNfcShipCountry('US');
  }, [visible]);

  const sortedNfcCountryCodes = useMemo(
    () => sortNfcShippingCountryCodesForLocale(NFC_PHYSICAL_CARD_SHIPPING_COUNTRY_CODES, intlLocale),
    [intlLocale],
  );

  const nfcCountryPickerLabel = useCallback(
    (code: string) => {
      if (code === 'ZZ') return t('sub_other_countries_intl');
      try {
        return new Intl.DisplayNames([intlLocale], { type: 'region' }).of(code) ?? code;
      } catch {
        return code;
      }
    },
    [intlLocale, t],
  );

  const nfcCheckout = useMemo(() => {
    if (!tiers) return null;
    const cardUsd = nfcMaterial === 'pvc' ? tiers.addOns.physicalPvcCardUsd : tiers.addOns.physicalMetalCardUsd;
    const zone = resolveNfcPhysicalShippingZone(nfcShipCountry);
    const shipUsd = nfcPhysicalShippingUsd(zone, tiers.addOns);
    const cardCs = nfcPhysicalCardCs(nfcMaterial, tiers.addOns);
    const shipCs = nfcPhysicalShippingCs(zone, tiers.addOns);
    return {
      cardUsd,
      shipUsd,
      totalUsd: cardUsd + shipUsd,
      cardCs,
      shipCs,
      totalCs: cardCs + shipCs,
    };
  }, [tiers, nfcMaterial, nfcShipCountry]);

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

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: shell.modalOverlay, justifyContent: 'flex-end' },
        sheet: {
          maxHeight: '92%',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          backgroundColor: shell.modalBg,
          borderWidth: 1,
          borderColor: shell.modalBorder,
          paddingBottom: Math.max(insets.bottom, 16),
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: shell.modalBorder,
        },
        title: { fontSize: 18, fontWeight: '700', color: shell.textPrimary, flex: 1, paddingRight: 12 },
        body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
        hint: { fontSize: 13, color: shell.textSecondary, lineHeight: 20, marginBottom: 14 },
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
        materialChipActive: { borderColor: shell.ctaAccent, borderWidth: 2 },
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
          marginTop: 4,
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
        emptyCallout: {
          borderRadius: 14,
          padding: 16,
          borderWidth: 1,
          borderColor: shell.modalBorder,
          borderStyle: 'dashed',
          backgroundColor: shell.surfaceMuted,
        },
        emptyText: { fontSize: 13, color: shell.textSecondary, textAlign: 'center', lineHeight: 20 },
        loadingRow: { paddingVertical: 28, alignItems: 'center' },
      }),
    [shell, insets.bottom],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('sub_nfc_physical_title')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <MaterialCommunityIcons name="close" size={24} color={shell.sectionLabel} />
            </TouchableOpacity>
          </View>
          <ScrollView
            {...verticalScrollInteractionProps}
            contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, styles.body]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.hint}>{t('sub_nfc_physical_hint')}</Text>
            {tiersLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={shell.ctaAccent} />
              </View>
            ) : !tiers || !nfcCheckout || (nfcCheckout.cardUsd <= 0 && nfcCheckout.shipUsd <= 0) ? (
              <View style={styles.emptyCallout}>
                <Text style={styles.emptyText}>{t('sub_rates_unavailable')}</Text>
              </View>
            ) : (
              <>
                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.materialChip, nfcMaterial === 'pvc' && styles.materialChipActive]}
                    onPress={() => setNfcMaterial('pvc')}
                  >
                    <Text style={[styles.materialChipText, nfcMaterial === 'pvc' && styles.materialChipTextActive]}>
                      PVC
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.materialChip, nfcMaterial === 'metal' && styles.materialChipActive]}
                    onPress={() => setNfcMaterial('metal')}
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
                  {nfcCheckout.totalCs > 0 &&
                  shouldShowCsPaymentPrice(normalizePricePair(0, nfcCheckout.totalCs), userCsBalance) ? (
                    <View style={[styles.breakdownLine, { marginTop: 6 }]}>
                      <Text style={styles.breakdownLabel}>{t('sub_equivalent_cs_short')}</Text>
                      <Text style={styles.breakdownValue}>{nfcCheckout.totalCs.toLocaleString()} CS</Text>
                    </View>
                  ) : null}
                </View>
                <LuxCtaButton
                  variant="outline"
                  label={t('sub_confirm_total')}
                  onPress={confirmNfcPhysicalTotal}
                  icon="receipt"
                  style={{ width: '100%', marginTop: 12, minHeight: 48 }}
                />
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
