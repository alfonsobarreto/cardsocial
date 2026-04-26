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
import { trEsEn, useLanguage } from '@/services/language';
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
import palette from './theme';

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function statusMeta(status: NfcCardStatus): {
  labelEs: string;
  labelEn: string;
  tone: 'good' | 'muted' | 'warn' | 'danger';
  icon: MaterialIconName;
} {
  if (status === 'active') {
    return { labelEs: 'Activa', labelEn: 'Active', tone: 'good', icon: 'check-circle-outline' };
  }
  if (status === 'paused') {
    return { labelEs: 'Pausada', labelEn: 'Paused', tone: 'muted', icon: 'pause-circle-outline' };
  }
  if (status === 'lost') {
    return { labelEs: 'Perdida', labelEn: 'Lost', tone: 'warn', icon: 'shield-alert-outline' };
  }
  if (status === 'blocked') {
    return { labelEs: 'Bloqueada', labelEn: 'Blocked', tone: 'danger', icon: 'lock-alert-outline' };
  }
  return { labelEs: 'Sin vincular', labelEn: 'Unclaimed', tone: 'muted', icon: 'link-off' };
}

function materialLabel(material: NfcCardDoc['material'], tr: (es: string, en: string) => string): string {
  if (material === 'metal') return tr('Metal', 'Metal');
  if (material === 'wood') return tr('Madera', 'Wood');
  if (material === 'plastic_matte') return tr('Plástico mate', 'Matte plastic');
  return tr('Material no definido', 'Unknown material');
}

function formatIsoForUi(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

export default function NfcScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];
  const tr = useCallback((es: string, en: string) => trEsEn(es, en, language), [language]);
  const [cards, setCards] = useState<NfcCardDoc[]>([]);
  const [mountOptions, setMountOptions] = useState<NfcMountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [mountModalCard, setMountModalCard] = useState<NfcCardDoc | null>(null);
  const [pendingSmartMount, setPendingSmartMount] = useState<{ card: NfcCardDoc; option: NfcMountOption } | null>(null);
  const [newNfcId, setNewNfcId] = useState('');
  const [newActivationPin, setNewActivationPin] = useState('');
  const [newNfcLabel, setNewNfcLabel] = useState('Tarjeta 1');

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
        subtitle: card.bcContactName || tr('Permanente', 'Permanent'),
        isTemporary: false,
        expiresInLabel: null,
      }));
      const smartOptions: NfcMountOption[] = smartCardsResult.cards
        .filter((card) => (card.cardType || 'smart') !== 'business' && card.sid)
        .map((card) => ({
          type: 'smartCard',
          id: String(card.sid || ''),
          displayName: card.scName || card.ownerDisplayName || card.sid || 'SmartCard',
          subtitle: tr('Temporal - 24h', 'Temporary - 24h'),
          isTemporary: true,
          expiresInLabel: '24h',
        }));
      setCards(nextCards);
      setMountOptions([...businessOptions, ...smartOptions]);
    } catch (error: any) {
      Alert.alert(tr('No se pudo cargar NFC', 'Could not load NFC'), error?.message || tr('Intenta nuevamente.', 'Try again.'));
    } finally {
      setLoading(false);
    }
  }, [tr, uid]);

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
          backgroundColor: shell.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: shell.border,
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
          color: shell.textPrimary,
          fontSize: 24,
          fontWeight: '800',
          letterSpacing: 0.2,
        },
        subtitle: {
          color: shell.textSecondary,
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
    [insets.bottom, insets.top, shell],
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
      Alert.alert(tr('ID requerido', 'ID required'), tr('Escanea o escribe el identificador NFC.', 'Scan or type the NFC identifier.'));
      return;
    }
    const activationPin = newActivationPin.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(activationPin)) {
      Alert.alert(tr('PIN requerido', 'PIN required'), tr('Escribe el PIN de activación impreso con tu tarjeta.', 'Enter the activation PIN printed with your card.'));
      return;
    }
    try {
      setBusyCardId('__link__');
      const card = await linkNfcCard(uid, {
        nfcCardId,
        activationPin,
        label: newNfcLabel.trim() || 'Tarjeta NFC',
        material: 'unknown',
      });
      replaceCard(card);
      setLinkModalOpen(false);
      setNewNfcId('');
      setNewActivationPin('');
      Alert.alert(tr('Tarjeta vinculada', 'Card linked'), tr('Ahora puedes montar una identidad.', 'Now you can mount an identity.'));
    } catch (error: any) {
      Alert.alert(tr('No se pudo vincular', 'Could not link'), error?.message || tr('Intenta nuevamente.', 'Try again.'));
    } finally {
      setBusyCardId(null);
    }
  };

  const openMountedUrl = async (card: NfcCardDoc) => {
    const url = card.status === 'lost' ? `https://cardsocial.me/n/${encodeURIComponent(card.nfcCardId)}` : card.mountedTarget?.publicUrl;
    if (!url) {
      Alert.alert(tr('Sin destino', 'No destination'), tr('Esta tarjeta aún no tiene identidad montada.', 'This card has no mounted identity yet.'));
      return;
    }
    await Linking.openURL(url).catch(() => {
      Alert.alert(tr('No se pudo abrir', 'Could not open'), url);
    });
  };

  const mountSelectedOption = async (card: NfcCardDoc, option: NfcMountOption, fallback: NfcMountOption) => {
    if (!uid) return;
    if (fallback.type !== 'businessCard') {
      Alert.alert(
        tr('Fallback requerido', 'Fallback required'),
        tr('Crea o selecciona una BusinessCard permanente antes de montar una SmartCard 24 h.', 'Create or select a permanent BusinessCard before mounting a 24h SmartCard.'),
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
      Alert.alert(tr('No se pudo montar', 'Could not mount'), error?.message || tr('Intenta nuevamente.', 'Try again.'));
    } finally {
      setBusyCardId(null);
    }
  };

  const chooseMountOption = async (card: NfcCardDoc, option: NfcMountOption) => {
    if (option.isTemporary) {
      if (businessMountOptions.length === 0) {
        Alert.alert(
          tr('Fallback requerido', 'Fallback required'),
          tr('Crea una BusinessCard permanente antes de montar una SmartCard 24 h.', 'Create a permanent BusinessCard before mounting a 24h SmartCard.'),
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
      Alert.alert(tr('No se pudo actualizar', 'Could not update'), error?.message || tr('Intenta nuevamente.', 'Try again.'));
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
            accessibilityLabel={tr('Volver', 'Back')}
          >
            <MaterialCommunityIcons name="chevron-left" size={24} color={shell.ctaAccent} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{tr('Menú NFC', 'NFC Menu')}</Text>
            <Text style={styles.title}>{tr('Hardware inteligente', 'Smart hardware')}</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          {tr(
            'Vincula tarjetas físicas y monta la identidad que deben abrir ahora mismo. La tarjeta conserva un enlace fijo; Card-Social cambia el destino.',
            'Link physical cards and mount the identity they should open right now. The card keeps one fixed link; Card-Social changes the destination.',
          )}
        </Text>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{tr('Vincular nueva NFC', 'Link new NFC')}</Text>
          <Text style={styles.heroText}>
            {tr(
                'Escanea el QR o ingresa el ID de la tarjeta junto con su PIN de activación.',
                'Scan the QR or enter the card ID together with its activation PIN.',
            )}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setLinkModalOpen(true)} accessibilityRole="button">
            <MaterialCommunityIcons name="qrcode-scan" size={18} color={shell.emptyCtaText} />
            <Text style={styles.primaryBtnText}>{tr('Vincular tarjeta física', 'Link physical card')}</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator color={shell.ctaAccent} />
            <Text style={styles.heroText}>{tr('Cargando tarjetas NFC...', 'Loading NFC cards...')}</Text>
          </View>
        ) : cards.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="contactless-payment-circle-outline" size={42} color={shell.ctaAccent} />
            <Text style={styles.heroTitle}>{tr('No hay tarjetas vinculadas', 'No linked cards')}</Text>
            <Text style={[styles.heroText, { textAlign: 'center' }]}>
              {tr(
                'Vincula la primera tarjeta física usando el ID impreso o el QR de manufactura.',
                'Link the first physical card using the printed ID or manufacturing QR.',
              )}
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
                    {materialLabel(card.material, tr)} · /n/{card.nfcCardId}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                  <MaterialCommunityIcons name={meta.icon} size={13} color={tone.fg} />
                  <Text style={[styles.statusText, { color: tone.fg }]}>{tr(meta.labelEs, meta.labelEn)}</Text>
                </View>
              </View>

              <View style={styles.routeBox}>
                <Text style={styles.label}>{tr('Montado ahora', 'Mounted now')}</Text>
                <Text style={styles.routeTitle}>
                  {card.status === 'lost'
                    ? tr('Página de recuperación segura', 'Secure recovery page')
                    : card.mountedTarget?.displayName || tr('Sin destino', 'No destination')}
                </Text>
                <Text style={styles.routeText}>
                  {card.status === 'lost'
                    ? tr(
                        `Canal elegido: ${card.recoveryContact?.label || 'pendiente'}. No se expone el perfil completo.`,
                        `Selected channel: ${card.recoveryContact?.label || 'pending'}. Full profile is not exposed.`,
                      )
                    : card.mountedTarget?.isTemporary
                      ? tr(
                          `${card.mountedTarget.expiresAt}. Fallback obligatorio: ${card.fallbackTarget?.displayName || 'pendiente'}.`,
                          `${card.mountedTarget.expiresAt}. Required fallback: ${card.fallbackTarget?.displayName || 'pending'}.`,
                        )
                      : tr(
                          `Destino permanente. Fallback: ${card.fallbackTarget?.displayName || 'mismo destino'}.`,
                          `Permanent destination. Fallback: ${card.fallbackTarget?.displayName || 'same destination'}.`,
                        )}
                </Text>
                <Text style={styles.routeText}>
                  {formatIsoForUi(card.lastConfirmedAt)
                    ? tr(`Confirmado por servidor: ${formatIsoForUi(card.lastConfirmedAt)}`, `Server confirmed: ${formatIsoForUi(card.lastConfirmedAt)}`)
                    : tr('Pendiente de confirmación del servidor.', 'Pending server confirmation.')}
                </Text>
                {formatIsoForUi(card.lastResolvedAt) ? (
                  <Text style={styles.routeText}>
                    {tr(`Último escaneo: ${formatIsoForUi(card.lastResolvedAt)}`, `Last scan: ${formatIsoForUi(card.lastResolvedAt)}`)}
                  </Text>
                ) : null}
              </View>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMountModalCard(card)} accessibilityRole="button" disabled={busy}>
                  <MaterialCommunityIcons name="swap-horizontal" size={16} color={shell.ctaAccent} />
                  <Text style={styles.secondaryBtnText}>{tr('Montar', 'Mount')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => openMountedUrl(card)} accessibilityRole="button">
                  <MaterialCommunityIcons name="open-in-new" size={16} color={shell.ctaAccent} />
                  <Text style={styles.secondaryBtnText}>{tr('Probar', 'Test')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setCardStatus(card, card.status === 'lost' ? 'active' : 'lost')}
                  accessibilityRole="button"
                  disabled={busy}
                >
                  <MaterialCommunityIcons name="shield-alert-outline" size={16} color={shell.ctaAccent} />
                  <Text style={styles.secondaryBtnText}>{card.status === 'lost' ? tr('Activar', 'Activate') : tr('Perdida', 'Lost')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setCardStatus(card, card.status === 'paused' ? 'active' : 'paused')}
                  accessibilityRole="button"
                  disabled={busy}
                >
                  <MaterialCommunityIcons name={card.status === 'paused' ? 'play-circle-outline' : 'pause-circle-outline'} size={16} color={shell.ctaAccent} />
                  <Text style={styles.secondaryBtnText}>{card.status === 'paused' ? tr('Activar', 'Activate') : tr('Pausar', 'Pause')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <Text style={styles.footnote}>
          {tr(
            'Backend integrado: /api/nfc administra tarjetas y /n/{nfcCardId} resuelve con redirección temporal.',
            'Backend integrated: /api/nfc manages cards and /n/{nfcCardId} resolves with temporary redirects.',
          )}
        </Text>
      </ScrollView>

      <Modal visible={linkModalOpen} transparent animationType="slide" onRequestClose={() => setLinkModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{tr('Vincular tarjeta física', 'Link physical card')}</Text>
            <Text style={styles.heroText}>
              {tr('Pega el ID o la URL /n impresa en la tarjeta y escribe el PIN de activación.', 'Paste the ID or /n URL printed on the card and enter the activation PIN.')}
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
              placeholder={tr('PIN de activación', 'Activation PIN')}
              placeholderTextColor={shell.textMuted}
              autoCapitalize="characters"
              maxLength={12}
            />
            <TextInput
              style={styles.input}
              value={newNfcLabel}
              onChangeText={setNewNfcLabel}
              placeholder={tr('Tarjeta 1', 'Card 1')}
              placeholderTextColor={shell.textMuted}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={submitLinkCard} disabled={busyCardId === '__link__'}>
              <Text style={styles.primaryBtnText}>
                {busyCardId === '__link__' ? tr('Vinculando...', 'Linking...') : tr('Vincular', 'Link')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setLinkModalOpen(false)}>
              <Text style={styles.secondaryBtnText}>{tr('Cancelar', 'Cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(mountModalCard)} transparent animationType="slide" onRequestClose={() => setMountModalCard(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{tr('Montar identidad', 'Mount identity')}</Text>
            <Text style={styles.heroText}>
              {tr('BusinessCards aparecen primero. Las SmartCards generan URL temporal de 24 h y requieren fallback.', 'BusinessCards appear first. SmartCards generate a 24h temporary URL and require fallback.')}
            </Text>
            <ScrollView style={{ marginTop: 6 }}>
              {mountOptions.length === 0 ? (
                <Text style={[styles.heroText, { marginTop: 14 }]}>
                  {tr('No hay tarjetas disponibles para montar.', 'No cards available to mount.')}
                </Text>
              ) : (
                <>
                  {businessMountOptions.length > 0 ? (
                    <Text style={[styles.label, { marginTop: 10 }]}>{tr('BusinessCards permanentes', 'Permanent BusinessCards')}</Text>
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
                        <Text style={styles.routeText}>{option.subtitle || tr('Permanente', 'Permanent')}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={shell.textSecondary} />
                    </TouchableOpacity>
                  ))}

                  {smartMountOptions.length > 0 ? (
                    <Text style={[styles.label, { marginTop: 14 }]}>{tr('SmartCards temporales', 'Temporary SmartCards')}</Text>
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
                          {tr('Temporal - 24h · requiere fallback permanente', 'Temporary - 24h · permanent fallback required')}
                        </Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={shell.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMountModalCard(null)}>
              <Text style={styles.secondaryBtnText}>{tr('Cancelar', 'Cancel')}</Text>
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
            <Text style={styles.modalTitle}>{tr('Elegir fallback', 'Choose fallback')}</Text>
            <Text style={styles.heroText}>
              {pendingSmartMount
                ? tr(
                    `La SmartCard "${pendingSmartMount.option.displayName}" expira en 24 h. Elige una BusinessCard permanente para cuando venza.`,
                    `The SmartCard "${pendingSmartMount.option.displayName}" expires in 24h. Choose a permanent BusinessCard for when it expires.`,
                  )
                : null}
            </Text>
            <ScrollView style={{ marginTop: 6 }}>
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
                    <Text style={styles.routeText}>{tr('Fallback permanente', 'Permanent fallback')}</Text>
                  </View>
                  <MaterialCommunityIcons name="check" size={20} color={shell.textSecondary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setPendingSmartMount(null)}>
              <Text style={styles.secondaryBtnText}>{tr('Cancelar', 'Cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
