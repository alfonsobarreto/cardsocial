/**
 * Upsell contextual de Market Radar Pro — no vive en el hub de Suscripciones.
 */
import LuxCtaButton from '@/components/LuxCtaButton';
import palette from '@/app/theme';
import { SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import { useCoreT } from '@/services/coreI18n';
import { intlLocaleTagForAppLanguage, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import {
  getMarketRadarRemoteConfig,
  subscribeMarketRadarRemoteConfig,
} from '@/services/marketRadarConfigService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function MarketRadarProUpsellModal({ visible, onClose }: Props) {
  const t = useCoreT();
  const { language } = useLanguage();
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const intlLocale = intlLocaleTagForAppLanguage(language);

  const fmtUsd = useCallback(
    (n: number) =>
      new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n),
    [intlLocale],
  );

  const [radarProPriceUsd, setRadarProPriceUsd] = useState(0);
  const [radarProEquivalentCs, setRadarProEquivalentCs] = useState(0);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void (async () => {
      const cfg = await getMarketRadarRemoteConfig();
      if (!alive) return;
      setRadarProPriceUsd(cfg.proPriceUsd);
      setRadarProEquivalentCs(cfg.proEquivalentCs);
    })();
    const unsub = subscribeMarketRadarRemoteConfig((cfg) => {
      setRadarProPriceUsd(cfg.proPriceUsd);
      setRadarProEquivalentCs(cfg.proEquivalentCs);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [visible]);

  const priceLine = useMemo(() => {
    if (radarProPriceUsd > 0 || radarProEquivalentCs > 0) {
      return [
        radarProPriceUsd > 0 ? `${fmtUsd(radarProPriceUsd)} USD` : null,
        radarProEquivalentCs > 0 ? `${radarProEquivalentCs.toLocaleString()} CS` : null,
      ]
        .filter(Boolean)
        .join(' · ');
    }
    return t('sub_coming_soon_app');
  }, [fmtUsd, radarProEquivalentCs, radarProPriceUsd, t]);

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
      }),
    [shell],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => undefined}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('sub_market_radar_pro_title')}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <MaterialCommunityIcons name="close" size={22} color={shell.textMuted} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, { paddingHorizontal: 20, paddingBottom: 12 }]}
            {...verticalScrollInteractionProps}
          >
            <Text style={styles.hint}>{t('sub_radar_section_hint')}</Text>
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tierName}>{t('sub_pro_access')}</Text>
                  <Text style={styles.tierMeta}>{priceLine}</Text>
                </View>
                <MaterialCommunityIcons name="radar" size={30} color={shell.ctaAccent} />
              </View>
              <Text style={styles.body}>{t('sub_radar_full_access_body')}</Text>
              <LuxCtaButton
                variant="outline"
                label={t('common_close')}
                onPress={onClose}
                icon="check"
                style={{ width: '100%', marginTop: 16, minHeight: 48 }}
              />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
