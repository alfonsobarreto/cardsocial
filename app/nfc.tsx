import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { auth } from '@/services/firebaseConfig';
import { userFacingAlertMessage } from '@/services/apiUserFacingError';
import { useCoreT, type CoreLocaleKey } from '@/services/coreI18n';
import { useLanguage, type AppLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { listMyBusinessCards } from '@/services/businessCardsRepo';
import { listSmartCardsFromDb } from '@/services/qrApi';
import {
  linkNfcCard,
  listMyNfcCards,
  mountNfcCard,
  updateNfcCardStatus,
} from '@/services/nfcCardsRepo';
import type { NfcCardDoc, NfcCardStatus, NfcMountOption } from '@/services/types/nfc';
import { requestSubscriptionPhysicalCardsSection } from '@/services/subscriptionNavigationIntent';
import { SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import palette from './theme';

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type CoreT = (key: CoreLocaleKey, vars?: Record<string, string | number>) => string;

function statusMeta(status: NfcCardStatus): {
  labelKey: CoreLocaleKey;
  tone: 'good' | 'muted' | 'warn' | 'danger';
  icon: MaterialIconName;
} {
  if (status === 'active') {
    return { labelKey: 'nfc_status_active', tone: 'good', icon: 'check-circle-outline' };
  }
  if (status === 'paused') {
    return { labelKey: 'nfc_status_paused', tone: 'muted', icon: 'pause-circle-outline' };
  }
  if (status === 'lost') {
    return { labelKey: 'nfc_status_lost', tone: 'warn', icon: 'shield-alert-outline' };
  }
  if (status === 'blocked') {
    return { labelKey: 'nfc_status_blocked', tone: 'danger', icon: 'lock-alert-outline' };
  }
  return { labelKey: 'nfc_status_unclaimed', tone: 'muted', icon: 'link-off' };
}

function materialLabel(material: NfcCardDoc['material'], t: CoreT): string {
  if (material === 'metal') return t('nfc_material_metal');
  if (material === 'wood') return t('nfc_material_wood');
  if (material === 'plastic_matte') return t('nfc_material_plastic_matte');
  return t('nfc_material_unknown');
}

function formatIsoForUi(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}


function nfcRecoveryRouteText(label: string, t: CoreT): string {
  return t('nfc_recovery_route', { label });
}

function nfcTemporaryTargetText(expiresAt: string | null | undefined, fallbackName: string, t: CoreT): string {
  const expires = formatIsoForUi(expiresAt) ?? t('nfc_expiration_pending');
  return t('nfc_temp_route', { expires, fallback: fallbackName });
}

function nfcPermanentTargetText(fallbackName: string, t: CoreT): string {
  return t('nfc_perm_route', { fallback: fallbackName });
}

function nfcServerConfirmedText(value: string, t: CoreT): string {
  return t('nfc_server_confirmed', { value });
}

function nfcLastScanText(value: string, t: CoreT): string {
  return t('nfc_last_scan_fmt', { value });
}

export default function NfcScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];
  const headerOnBanner = '#FFFFFF';
  const headerOnBannerMuted = 'rgba(255,255,255,0.78)';
  const headerBackButtonBg = 'rgba(255,255,255,0.14)';
  const headerBackButtonBorder = 'rgba(255,255,255,0.18)';
  const t = useCoreT();
  const [cards, setCards] = useState<NfcCardDoc[]>([]);
  const [mountOptions, setMountOptions] = useState<NfcMountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [mountModalCard, setMountModalCard] = useState<NfcCardDoc | null>(null);
  const [pendingSmartMount, setPendingSmartMount] = useState<{ card: NfcCardDoc; option: NfcMountOption } | null>(null);
  const [newNfcId, setNewNfcId] = useState('');
  const [newActivationPin, setNewActivationPin] = useState('');
  const [newNfcLabel, setNewNfcLabel] = useState('');

  const uid = auth.currentUser?.uid || '';

  const replaceCard = useCallback((next: NfcCardDoc) => {
    setCards((prev) => {
      const exists = prev.some((row) => row.nfcCardId === next.nfcCardId);
      if (!exists) return [next, ...prev];
      return prev.map((row) => (row.nfcCardId === next.nfcCardId ? next : row));
    });
  }, []);

  const businessMountOptions = useMemo(
    () => mountOptions.filter((row) => row.type === 'businessCard'),
    [mountOptions],
  );

  const smartMountOptions = useMemo(
    () => mountOptions.filter((row) => row.type === 'smartCard'),
    [mountOptions],
  );

  const loadNfc = useCallback(async () => {
    if (!uid) {
      setCards([]);
      setMountOptions([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [nextCards, businessCards, smartCardsResult] = await Promise.all([
        listMyNfcCards(uid),
        listMyBusinessCards(uid),
        listSmartCardsFromDb({ uid }),
      ]);
      const businessOptions: NfcMountOption[] = businessCards.map((card) => ({
        type: 'businessCard',
        id: card.bId,
        displayName: card.bcName || 'Business Card',
        subtitle: card.bcContactName || t('nfc_permanent'),
        isTemporary: false,
        expiresInLabel: null,
      }));
      const smartOptions: NfcMountOption[] = smartCardsResult.cards
        .filter((card) => (card.cardType || 'smart') !== 'business' && card.sid)
        .map((card) => ({
          type: 'smartCard',
          id: String(card.sid || ''),
          displayName: card.scName || card.ownerDisplayName || card.sid || 'SmartCard',
          subtitle: t('nfc_temporal_24h'),
          isTemporary: true,
          expiresInLabel: '24h',
        }));
      setCards(nextCards);
      setMountOptions([...businessOptions, ...smartOptions]);
    } catch (error: any) {
      Alert.alert(
        t('nfc_load_fail_title'),
        userFacingAlertMessage(error, language, t('common_try_again')),
      );
    } finally {
      setLoading(false);
    }
  }, [t, uid, language]);

  useEffect(() => {
    void loadNfc();
  }, [loadNfc]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: shell.backgroundSolid,
        },
        header: {
          paddingTop: insets.top + 12,
          paddingHorizontal: 18,
          paddingBottom: 18,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: shell.modalBorder,
        },
        headerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        },
        backButton: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: headerBackButtonBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: headerBackButtonBorder,
        },
        headerCopy: {
          flex: 1,
        },
        eyebrow: {
          color: shell.ctaAccent,
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          marginBottom: 4,
        },
        title: {
          color: headerOnBanner,
          fontSize: 24,
          fontWeight: '800',
          letterSpacing: 0.2,
        },
        subtitle: {
          color: headerOnBannerMuted,
          fontSize: 13,
          lineHeight: 19,
          marginTop: 8,
        },
        body: {
          padding: 18,
          paddingBottom: 38 + insets.bottom,
          gap: 14,
        },
        heroCard: {
          borderRadius: 22,
          padding: 16,
          borderWidth: 1,
          borderColor: shell.modalBorder,
          backgroundColor: shell.surface,
          overflow: 'hidden',
        },
        physicalUpsell: {
          borderRadius: 22,
          padding: 16,
          borderWidth: 2,
          borderColor: shell.ctaAccent,
          backgroundColor: shell.surface,
        },
        physicalUpsellTitle: {
          color: shell.textPrimary,
          fontSize: 17,
          fontWeight: '800',
          marginBottom: 6,
        },
        physicalUpsellText: {
          color: shell.textSecondary,
          fontSize: 13,
          lineHeight: 19,
        },
        physicalUpsellBtn: {
          marginTop: 14,
          borderRadius: 14,
          paddingVertical: 13,
          alignItems: 'center',
          backgroundColor: shell.ctaAccent,
        },
        physicalUpsellBtnText: {
          color: shell.emptyCtaText,
          fontSize: 14,
          fontWeight: '800',
        },
        heroTitle: {
          color: shell.textPrimary,
          fontSize: 16,
          fontWeight: '800',
          marginBottom: 6,
        },
        heroText: {
          color: shell.textSecondary,
          fontSize: 13,
          lineHeight: 19,
        },
        input: {
          borderRadius: 14,
          borderWidth: 1,
          borderColor: shell.border,
          backgroundColor: shell.inputBg,
          color: shell.inputText,
          paddingHorizontal: 12,
          paddingVertical: 11,
          fontSize: 14,
          marginTop: 10,
        },
        primaryBtn: {
          marginTop: 14,
          borderRadius: 14,
          paddingVertical: 13,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: shell.ctaAccent,
        },
        primaryBtnText: {
          color: shell.emptyCtaText,
          fontSize: 14,
          fontWeight: '800',
        },
        card: {
          borderRadius: 22,
          borderWidth: 1,
          borderColor: shell.modalBorder,
          backgroundColor: shell.modalBg,
          padding: 14,
          gap: 12,
        },
        cardTop: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
        },
        cardIcon: {
          width: 48,
          height: 48,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: shell.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: shell.border,
        },
        cardIdentity: {
          flex: 1,
          minWidth: 0,
        },
        cardTitle: {
          color: shell.textPrimary,
          fontSize: 16,
          fontWeight: '800',
        },
        cardMeta: {
          color: shell.textSecondary,
          fontSize: 12,
          marginTop: 3,
        },
        statusPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          borderRadius: 999,
          paddingHorizontal: 9,
          paddingVertical: 5,
          borderWidth: StyleSheet.hairlineWidth,
        },
        statusText: {
          fontSize: 11,
          fontWeight: '800',
        },
        routeBox: {
          borderRadius: 16,
          padding: 12,
          backgroundColor: shell.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: shell.border,
          gap: 8,
        },
        label: {
          color: shell.ctaAccent,
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        },
        routeTitle: {
          color: shell.textPrimary,
          fontSize: 14,
          fontWeight: '800',
        },
        routeText: {
          color: shell.textSecondary,
          fontSize: 12,
          lineHeight: 18,
        },
        actions: {
          flexDirection: 'row',
          gap: 8,
          flexWrap: 'wrap',
        },
        secondaryBtn: {
          flexGrow: 1,
          minWidth: '30%',
          borderRadius: 13,
          borderWidth: 1,
          borderColor: shell.border,
          paddingVertical: 10,
          paddingHorizontal: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          backgroundColor: shell.surface,
        },
        secondaryBtnText: {
          color: shell.textPrimary,
          fontSize: 12,
          fontWeight: '800',
        },
        footnote: {
          color: shell.textMuted,
          fontSize: 11,
          lineHeight: 16,
          textAlign: 'center',
          marginTop: 4,
        },
        emptyBox: {
          borderRadius: 22,
          borderWidth: 1,
          borderColor: shell.border,
          backgroundColor: shell.surface,
          padding: 18,
          alignItems: 'center',
          gap: 10,
        },
        modalOverlay: {
          flex: 1,
          backgroundColor: shell.overlayScrim,
          justifyContent: 'flex-end',
        },
        modalCard: {
          backgroundColor: shell.modalBg,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderWidth: 1,
          borderColor: shell.modalBorder,
          padding: 16,
          paddingBottom: 20 + insets.bottom,
          maxHeight: '82%',
        },
        modalTitle: {
          color: shell.modalTitle,
          fontSize: 18,
          fontWeight: '800',
          marginBottom: 4,
        },
        optionRow: {
          borderRadius: 16,
          borderWidth: 1,
          borderColor: shell.border,
          backgroundColor: shell.surface,
          padding: 12,
          marginTop: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        optionTextCol: {
          flex: 1,
          minWidth: 0,
        },
      }),
    [headerBackButtonBg, headerBackButtonBorder, headerOnBanner, headerOnBannerMuted, insets.bottom, insets.top, shell],
  );

  const toneColors: Record<'good' | 'muted' | 'warn' | 'danger', { fg: string; bg: string; border: string }> = {
    good: { fg: shell.success, bg: `${shell.success}22`, border: `${shell.success}55` },
    muted: { fg: shell.textSecondary, bg: `${shell.textSecondary}18`, border: shell.border },
    warn: { fg: shell.ctaAccent, bg: `${shell.ctaAccent}22`, border: `${shell.ctaAccent}55` },
    danger: { fg: shell.danger, bg: `${shell.danger}22`, border: `${shell.danger}55` },
  };

  const submitLinkCard = async () => {
    if (!uid) return;
    const nfcCardId = newNfcId.trim();
    if (!nfcCardId) {
      Alert.alert(t('nfc_id_required_title'), t('nfc_id_required_body'));
      return;
    }
    const activationPin = newActivationPin.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(activationPin)) {
      Alert.alert(t('nfc_pin_required_title'), t('nfc_pin_required_body'));
      return;
    }
    try {
      setBusyCardId('__link__');
      const card = await linkNfcCard(uid, {
        nfcCardId,
        activationPin,
        label: newNfcLabel.trim() || t('nfc_default_link_label'),
        material: 'unknown',
      });
      replaceCard(card);
      setLinkModalOpen(false);
      setNewNfcId('');
      setNewActivationPin('');
      Alert.alert(t('nfc_linked_title'), t('nfc_linked_body'));
    } catch (error: any) {
      Alert.alert(
        t('nfc_link_fail_title'),
        userFacingAlertMessage(error, language, t('common_try_again')),
      );
    } finally {
      setBusyCardId(null);
    }
  };

  const openMountedUrl = async (card: NfcCardDoc) => {
    const url = card.status === 'lost' ? `https://cardsocial.me/n/${encodeURIComponent(card.nfcCardId)}` : card.mountedTarget?.publicUrl;
    if (!url) {
      Alert.alert(t('nfc_no_dest_title'), t('nfc_no_dest_body'));
      return;
    }
    await Linking.openURL(url).catch(() => {
      Alert.alert(
        t('nfc_open_fail_title'),
        t('nfc_open_link_fail'),
      );
    });
  };

  const mountSelectedOption = async (card: NfcCardDoc, option: NfcMountOption, fallback: NfcMountOption) => {
    if (!uid) return;
    if (fallback.type !== 'businessCard') {
      Alert.alert(
        t('nfc_fallback_required_title'),
        t('nfc_fallback_smart_long'),
      );
      return;
    }
    try {
      setBusyCardId(card.nfcCardId);
      const next = await mountNfcCard(uid, card.nfcCardId, {
        targetType: option.type,
        targetId: option.id,
        fallbackTargetType: 'businessCard',
        fallbackTargetId: fallback.id,
        fallbackPublicUrl: null,
        fallbackDisplayName: fallback.displayName,
      });
      replaceCard(next);
      setMountModalCard(null);
      setPendingSmartMount(null);
    } catch (error: any) {
      Alert.alert(
        t('nfc_mount_fail_title'),
        userFacingAlertMessage(error, language, t('common_try_again')),
      );
    } finally {
      setBusyCardId(null);
    }
  };

  const chooseMountOption = async (card: NfcCardDoc, option: NfcMountOption) => {
    if (option.isTemporary) {
      if (businessMountOptions.length === 0) {
        Alert.alert(
          t('nfc_fallback_required_title'),
          t('nfc_fallback_smart_short'),
        );
        return;
      }
      setPendingSmartMount({ card, option });
      setMountModalCard(null);
      return;
    }
    await mountSelectedOption(card, option, option);
  };

  const setCardStatus = async (card: NfcCardDoc, status: 'active' | 'paused' | 'lost') => {
    if (!uid) return;
    try {
      setBusyCardId(card.nfcCardId);
      const next = await updateNfcCardStatus(uid, card.nfcCardId, {
        status,
        recoveryContact: status === 'lost'
          ? (card.recoveryContact || {
              iconDataId: 'manual-recovery',
              label: 'Email',
              type: 'email',
              value: auth.currentUser?.email || 'support@cardsocial.me',
            })
          : undefined,
      });
      replaceCard(next);
    } catch (error: any) {
      Alert.alert(
        t('nfc_update_fail_title'),
        userFacingAlertMessage(error, language, t('common_try_again')),
      );
    } finally {
      setBusyCardId(null);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[...shell.vipBannerGradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('common_back')}
          >
            <MaterialCommunityIcons name="chevron-left" size={24} color={headerOnBanner} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{t('nfc_menu_eyebrow')}</Text>
            <Text style={styles.title}>{t('nfc_menu_title')}</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          {t('nfc_menu_subtitle')}
        </Text>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        {...verticalScrollInteractionProps}
        contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, styles.body]}
      >
        <View style={styles.physicalUpsell}>
          <Text style={styles.physicalUpsellTitle}>
            {t('nfc_buy_cards_title')}
          </Text>
          <Text style={styles.physicalUpsellText}>
            {t('nfc_buy_cards_body')}
          </Text>
          <TouchableOpacity
            style={styles.physicalUpsellBtn}
            onPress={() => {
              router.back();
              requestSubscriptionPhysicalCardsSection({ delayMs: 380 });
            }}
            accessibilityRole="button"
            accessibilityLabel={t('nfc_shop_cards_cta')}
          >
            <Text style={styles.physicalUpsellBtnText}>
              {t('nfc_shop_cards_cta')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{t('nfc_link_new_title')}</Text>
          <Text style={styles.heroText}>
            {t('nfc_link_new_sub')}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => {
          setNewNfcLabel(t('nfc_placeholder_card_label'));
          setLinkModalOpen(true);
        }} accessibilityRole="button">
            <MaterialCommunityIcons name="qrcode-scan" size={18} color={shell.emptyCtaText} />
            <Text style={styles.primaryBtnText}>{t('nfc_link_physical_cta')}</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator color={shell.ctaAccent} />
            <Text style={styles.heroText}>{t('nfc_loading_cards')}</Text>
          </View>
        ) : cards.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="contactless-payment-circle-outline" size={42} color={shell.ctaAccent} />
            <Text style={styles.heroTitle}>{t('nfc_no_cards_title')}</Text>
            <Text style={[styles.heroText, { textAlign: 'center' }]}>
              {t('nfc_no_cards_sub')}
            </Text>
          </View>
        ) : null}

        {cards.map((card) => {
          const meta = statusMeta(card.status);
          const tone = toneColors[meta.tone];
          const busy = busyCardId === card.nfcCardId;
          return (
            <View key={card.nfcCardId} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardIcon}>
                  <MaterialCommunityIcons name="contactless-payment-circle-outline" size={28} color={shell.ctaAccent} />
                </View>
                <View style={styles.cardIdentity}>
                  <Text style={styles.cardTitle}>{card.label}</Text>
                  <Text style={styles.cardMeta}>
                    {materialLabel(card.material, t)} · /n/{card.nfcCardId}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                  <MaterialCommunityIcons name={meta.icon} size={13} color={tone.fg} />
                  <Text style={[styles.statusText, { color: tone.fg }]}>{t(meta.labelKey)}</Text>
                </View>
              </View>

              <View style={styles.routeBox}>
                <Text style={styles.label}>{t('nfc_mounted_now')}</Text>
                <Text style={styles.routeTitle}>
                  {card.status === 'lost'
                    ? t('nfc_recovery_page')
                    : card.mountedTarget?.displayName || t('nfc_no_dest_title')}
                </Text>
                <Text style={styles.routeText}>
                  {card.status === 'lost'
                    ? nfcRecoveryRouteText(card.recoveryContact?.label || t('nfc_pending'), t)
                    : card.mountedTarget?.isTemporary
                      ? nfcTemporaryTargetText(card.mountedTarget.expiresAt, card.fallbackTarget?.displayName || t('nfc_pending'), t)
                      : nfcPermanentTargetText(card.fallbackTarget?.displayName || t('nfc_same_destination'), t)}
                </Text>
                <Text style={styles.routeText}>
                  {formatIsoForUi(card.lastConfirmedAt)
                    ? nfcServerConfirmedText(formatIsoForUi(card.lastConfirmedAt) || '', t)
                    : t('nfc_server_pending')}
                </Text>
                {formatIsoForUi(card.lastResolvedAt) ? (
                  <Text style={styles.routeText}>
                    {nfcLastScanText(formatIsoForUi(card.lastResolvedAt) || '', t)}
                  </Text>
                ) : null}
              </View>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMountModalCard(card)} accessibilityRole="button" disabled={busy}>
                  <MaterialCommunityIcons name="swap-horizontal" size={16} color={shell.ctaAccent} />
                  <Text style={styles.secondaryBtnText}>{t('nfc_btn_mount')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => openMountedUrl(card)} accessibilityRole="button">
                  <MaterialCommunityIcons name="open-in-new" size={16} color={shell.ctaAccent} />
                  <Text style={styles.secondaryBtnText}>{t('nfc_btn_test')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setCardStatus(card, card.status === 'lost' ? 'active' : 'lost')}
                  accessibilityRole="button"
                  disabled={busy}
                >
                  <MaterialCommunityIcons name="shield-alert-outline" size={16} color={shell.ctaAccent} />
                  <Text style={styles.secondaryBtnText}>{card.status === 'lost' ? t('nfc_activate') : t('nfc_lost')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setCardStatus(card, card.status === 'paused' ? 'active' : 'paused')}
                  accessibilityRole="button"
                  disabled={busy}
                >
                  <MaterialCommunityIcons name={card.status === 'paused' ? 'play-circle-outline' : 'pause-circle-outline'} size={16} color={shell.ctaAccent} />
                  <Text style={styles.secondaryBtnText}>{card.status === 'paused' ? t('nfc_activate') : t('nfc_pause')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <Text style={styles.footnote}>
          {t('nfc_footnote_backend')}
        </Text>
      </ScrollView>

      <Modal visible={linkModalOpen} transparent animationType="slide" onRequestClose={() => setLinkModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('nfc_link_physical_cta')}</Text>
            <Text style={styles.heroText}>
              {t('nfc_modal_link_pin_instructions')}
            </Text>
            <TextInput
              style={styles.input}
              value={newNfcId}
              onChangeText={setNewNfcId}
              placeholder="nfc-metal-001"
              placeholderTextColor={shell.textMuted}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              value={newActivationPin}
              onChangeText={(v) => setNewActivationPin(v.toUpperCase())}
              placeholder={t('nfc_placeholder_pin')}
              placeholderTextColor={shell.textMuted}
              autoCapitalize="characters"
              maxLength={12}
            />
            <TextInput
              style={styles.input}
              value={newNfcLabel}
              onChangeText={setNewNfcLabel}
              placeholder={t('nfc_placeholder_card_label')}
              placeholderTextColor={shell.textMuted}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={submitLinkCard} disabled={busyCardId === '__link__'}>
              <Text style={styles.primaryBtnText}>
                {busyCardId === '__link__' ? t('nfc_linking') : t('nfc_link_verb')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setLinkModalOpen(false)}>
              <Text style={styles.secondaryBtnText}>{t('common_cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(mountModalCard)} transparent animationType="slide" onRequestClose={() => setMountModalCard(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('nfc_mount_modal_title')}</Text>
            <Text style={styles.heroText}>
              {t('nfc_mount_modal_sub')}
            </Text>
            <ScrollView style={{ marginTop: 6 }}>
              {mountOptions.length === 0 ? (
                <Text style={[styles.heroText, { marginTop: 14 }]}>
                  {t('nfc_no_mount_options')}
                </Text>
              ) : (
                <>
                  {businessMountOptions.length > 0 ? (
                    <Text style={[styles.label, { marginTop: 10 }]}>{t('nfc_bc_permanent_header')}</Text>
                  ) : null}
                  {businessMountOptions.map((option) => (
                    <TouchableOpacity
                      key={`${option.type}:${option.id}`}
                      style={styles.optionRow}
                      onPress={() => mountModalCard && chooseMountOption(mountModalCard, option)}
                      disabled={Boolean(busyCardId)}
                    >
                      <MaterialCommunityIcons name="briefcase-outline" size={22} color={shell.ctaAccent} />
                      <View style={styles.optionTextCol}>
                        <Text style={styles.routeTitle}>{option.displayName}</Text>
                        <Text style={styles.routeText}>{option.subtitle || t('nfc_permanent')}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={shell.textSecondary} />
                    </TouchableOpacity>
                  ))}

                  {smartMountOptions.length > 0 ? (
                    <Text style={[styles.label, { marginTop: 14 }]}>{t('nfc_smart_temp_header')}</Text>
                  ) : null}
                  {smartMountOptions.map((option) => (
                    <TouchableOpacity
                      key={`${option.type}:${option.id}`}
                      style={styles.optionRow}
                      onPress={() => mountModalCard && chooseMountOption(mountModalCard, option)}
                      disabled={Boolean(busyCardId)}
                    >
                      <MaterialCommunityIcons name="card-account-details-outline" size={22} color={shell.ctaAccent} />
                      <View style={styles.optionTextCol}>
                        <Text style={styles.routeTitle}>{option.displayName}</Text>
                        <Text style={styles.routeText}>
                          {t('nfc_temp_fallback_line')}
                        </Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={shell.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMountModalCard(null)}>
              <Text style={styles.secondaryBtnText}>{t('common_cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(pendingSmartMount)}
        transparent
        animationType="slide"
        onRequestClose={() => setPendingSmartMount(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('nfc_choose_fallback_title')}</Text>
            <Text style={styles.heroText}>
              {pendingSmartMount
                ? t('nfc_smart_fallback_prompt', { name: pendingSmartMount.option.displayName })
                : null}
            </Text>
            <ScrollView
              style={{ marginTop: 6, flexGrow: 1 }}
              {...verticalScrollInteractionProps}
              contentContainerStyle={SCROLL_CONTENT_MIN_FILL}
            >
              {businessMountOptions.map((fallback) => (
                <TouchableOpacity
                  key={`fallback:${fallback.id}`}
                  style={styles.optionRow}
                  onPress={() => pendingSmartMount && mountSelectedOption(pendingSmartMount.card, pendingSmartMount.option, fallback)}
                  disabled={Boolean(busyCardId)}
                >
                  <MaterialCommunityIcons name="shield-check-outline" size={22} color={shell.ctaAccent} />
                  <View style={styles.optionTextCol}>
                    <Text style={styles.routeTitle}>{fallback.displayName}</Text>
                    <Text style={styles.routeText}>{t('nfc_fallback_permanent_sub')}</Text>
                  </View>
                  <MaterialCommunityIcons name="check" size={20} color={shell.textSecondary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setPendingSmartMount(null)}>
              <Text style={styles.secondaryBtnText}>{t('common_cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
