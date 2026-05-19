import type { AuthLocaleKey } from '@/services/authI18n';
import type { AppLanguage } from '@/services/language';
import {
  LEGAL_CONSENT_BUNDLE_VERSION,
  PRIVACY_SECTIONS_EN,
  PRIVACY_SECTIONS_ES,
  TERMS_LINES_EN,
  TERMS_LINES_ES,
  USAGE_LINES_EN,
  USAGE_LINES_ES,
} from '@/constants/legalConsent';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export type LegalDocTab = 'terms' | 'privacy' | 'usage';

type Palette = {
  modalBg: string;
  overlay: string;
  titleColor: string;
  bodyMuted: string;
  bodyText: string;
  chipBg: string;
  chipBgActive: string;
  chipBorder: string;
  chipText: string;
  chipTextActive: string;
  primaryBtnBg: string;
  primaryBtnText: string;
  secondaryText: string;
  confirmRowBg: string;
  confirmBorder: string;
};

type Props = {
  visible: boolean;
  palette: Palette;
  language: AppLanguage;
  t: (key: AuthLocaleKey, vars?: Record<string, string | number>) => string;
  onClose: () => void;
  onConfirm: () => void;
};

({ visible, palette, language, t, onClose, onConfirm }: Props) {
  const [tab, setTab] = useState<LegalDocTab>('terms');
  const [ack, setAck] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setTab('terms');
      setAck(false);
    }
  }, [visible]);

  const privacySections = useMemo(() => (language === 'es' ? PRIVACY_SECTIONS_ES : PRIVACY_SECTIONS_EN), [language]);

  const termsLines = language === 'es' ? TERMS_LINES_ES : TERMS_LINES_EN;
  const usageLines = language === 'es' ? USAGE_LINES_ES : USAGE_LINES_EN;

  const canAccept = ack;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: palette.overlay }]}>
        <View style={[styles.card, { backgroundColor: palette.modalBg }]}>
          <Text style={[styles.sheetTitle, { color: palette.titleColor }]}>{t('register_legal_modal_title')}</Text>
          <Text style={[styles.bundleHint, { color: palette.bodyMuted }]}>
            {t('register_legal_bundle_version_hint', { version: LEGAL_CONSENT_BUNDLE_VERSION })}
          </Text>

          <View style={styles.tabRow}>
            {(
              [
                ['terms', t('register_legal_tab_terms')],
                ['privacy', t('register_legal_tab_privacy')],
                ['usage', t('register_legal_tab_usage')],
              ] as const
            ).map(([key, label]) => {
              const active = tab === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setTab(key)}
                  style={[
                    styles.chip,
                    {
                      borderColor: palette.chipBorder,
                      backgroundColor: active ? palette.chipBgActive : palette.chipBg,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? palette.chipTextActive : palette.chipText }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner} nestedScrollEnabled>
            {tab === 'terms'
              ? termsLines.map((line) => (
                  <Text key={line} style={[styles.bulletPara, { color: palette.bodyText }]}>
                    {'\u2022 '}
                    {line}
                  </Text>
                ))
              : null}

            {tab === 'privacy'
              ? privacySections.map((sec) => (
                  <View key={sec.id} style={styles.secBlock}>
                    <Text style={[styles.secTitle, { color: palette.titleColor }]}>{sec.title}</Text>
                    {sec.paragraphs.map((p) => (
                      <Text key={p.slice(0, 40)} style={[styles.para, { color: palette.bodyText }]}>
                        {p}
                      </Text>
                    ))}
                  </View>
                ))
              : null}

            {tab === 'usage'
              ? usageLines.map((line) => (
                  <Text key={line} style={[styles.bulletPara, { color: palette.bodyText }]}>
                    {'\u2022 '}
                    {line}
                  </Text>
                ))
              : null}
          </ScrollView>

          <TouchableOpacity
            style={[styles.confirmRow, { borderColor: palette.confirmBorder, backgroundColor: palette.confirmRowBg }]}
            onPress={() => setAck((v) => !v)}
            activeOpacity={0.85}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ack }}
          >
            <View style={[styles.box, { borderColor: palette.chipBorder }, ack && { backgroundColor: palette.chipBgActive, borderColor: palette.primaryBtnBg }]}>
              {ack ? <Text style={[styles.tick, { color: palette.primaryBtnText }]}>✓</Text> : null}
            </View>
            <Text style={[styles.confirmText, { color: palette.bodyText }]}>{t('register_legal_confirm_row')}</Text>
          </TouchableOpacity>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: palette.primaryBtnBg }]} disabled={!canAccept} onPress={onConfirm}>
              <Text style={[styles.primaryBtnText, { color: palette.primaryBtnText }]}>{t('register_legal_cta_accept')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.cancel, { color: palette.secondaryText }]}>{t('register_go_back')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  card: {
    maxHeight: '92%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 24,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  bundleHint: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 16,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  scroll: {
    maxHeight: 360,
    marginBottom: 12,
  },
  scrollInner: {
    paddingBottom: 14,
    paddingHorizontal: 2,
    gap: 10,
  },
  secBlock: {
    marginBottom: 14,
  },
  secTitle: {
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 8,
  },
  para: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 6,
  },
  bulletPara: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  box: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  tick: {
    fontSize: 14,
    fontWeight: '900',
  },
  confirmText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  actions: {
    gap: 12,
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  cancel: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 8,
  },
});
