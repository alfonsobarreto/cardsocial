/**
 * MedalRatingModal
 *
 * Smart cards  â†’ Insignias (mÃ¡x 2 votos) + Reporta usuario en incÃ³gnito
 * Business cards â†’ Medallas de negocio + Comentario incÃ³gnito RED ZONE
 *
 * Tema: dÃ­a/noche desde premiumTheme Â· BilingÃ¼e (es/en)
 */

import { MedalBadgeSelectionGrid } from '@/components/MedalBadgeSelectionGrid';
import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import { getActiveUserId } from '@/services/authSession';
import { db } from '@/services/firebaseConfig';
import { readUserFullName, readUserNickName } from '@/services/userIdentityFields';
import { coreTrEsEn } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import {
    BUSINESS_MEDALS,
    getMedalData,
    type MedalCounts,
    type MedalKey,
    SOCIAL_MEDALS,
    submitMedalVote,
} from '@/services/medalService';
import { fetchModerationPublicKeyX25519 } from '@/services/moderationIdentityConfig';
import { sealModerationEvidence } from '@/services/moderationReportEvidenceCrypto';
import { premiumTheme as PT } from '@/styles/_premiumTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { addDoc, collection, doc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Animated,
  BackHandler,
  InteractionManager,
  Keyboard,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
} from 'react-native-keyboard-controller';
import { FullWindowOverlay } from 'react-native-screens';
import Toast from 'react-native-toast-message';

// â”€â”€â”€ Props â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface MedalRatingModalProps {
  visible: boolean;
  onClose: () => void;
  cardType: 'smart' | 'business';
  /** Document id under `medals/` (smart `sid` or business `bId`). */
  sidOrBId: string;
  issuerUid: string;
  cardOwnerName: string;
  onCountsChanged?: (counts: MedalCounts) => void;
  /**
   * Android only: mount inside RN `Modal` so this layer stacks above another `Modal` (card preview).
   * Ignored on iOS (uses FullWindowOverlay). Defaults to true.
   */
  useNativeModalOnAndroid?: boolean;
}

// â”€â”€â”€ Componente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€



export function MedalRatingModal({
  visible,
  onClose,
  cardType,
  sidOrBId,
  issuerUid,
  cardOwnerName,
  onCountsChanged,
  useNativeModalOnAndroid = true,
}: MedalRatingModalProps) {
  const maxEvidenceDataUriChars = 280_000;
  const { language } = useLanguage();
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const P = isDark ? PT.dark : PT.light;
  const modalFooterBottomPad = useModalFooterBottomPad();
  /** Colchón sobre el teclado + altura del botón CONFIRMAR para que el input no quede tapado. */
  const reportKeyboardBottomOffset = 42 + 56;
  const scrollRef = useRef<React.ComponentRef<typeof KeyboardAwareScrollView>>(null);
  /** Evita doble apertura del picker y mantiene el modal oculto hasta que termine la galería. */
  const pickerActiveRef = useRef(false);
  const [pickingEvidence, setPickingEvidence] = useState(false);

  const tr = (es: string, en: string) => coreTrEsEn(es, en, language);

  const restoreModalAfterPicker = useCallback(() => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        pickerActiveRef.current = false;
        setPickingEvidence(false);
      }, Platform.OS === 'android' ? 320 : 160);
    });
  }, []);

  const waitForModalDismissBeforePicker = useCallback(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          setTimeout(resolve, Platform.OS === 'android' ? 300 : 140);
        });
      }),
    [],
  );

  const scrollReportIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, Platform.OS === 'android' ? 120 : 80);
    });
  }, []);

  // â”€â”€ estado â”€â”€
  const [myUid, setMyUid]         = useState<string | null>(null);
  const [myVote, setMyVote]       = useState<MedalKey | null>(null);
  const [counts, setCounts]       = useState<MedalCounts>({});
  const [loadingData, setLoadingData] = useState(false);
  const [votingKey, setVotingKey] = useState<MedalKey | null>(null);
  const [reportText, setReportText] = useState('');
  const [evidenceImageDataUri, setEvidenceImageDataUri] = useState<string | null>(null);
  const [sending, setSending]     = useState(false);
  const [ownerProfileName, setOwnerProfileName] = useState<string>('');

  const medals = cardType === 'business' ? BUSINESS_MEDALS : SOCIAL_MEDALS;

  // â”€â”€ cargar datos al abrir â”€â”€
  useEffect(() => {
    if (!visible || !sidOrBId) return;
    setReportText('');
    setEvidenceImageDataUri(null);
    void (async () => {
      setLoadingData(true);
      try {
        const uid = await getActiveUserId();
        setMyUid(uid);
        if (!uid) return;
        // Fetch profile name from users collection
        if (issuerUid) {
          try {
            const profileSnap = await getDoc(doc(db, 'users', issuerUid));
            const pData = profileSnap.data() as Record<string, unknown>;
            if (pData) {
              const full = readUserFullName(pData);
              const nick = readUserNickName(pData);
              setOwnerProfileName(nick ? `${full} (@${nick})` : full);
            }
          } catch { /* silencia */ }
        }
        const data = await getMedalData(sidOrBId, uid);
        setCounts(data.counts);
        setMyVote(data.myVote);
      } catch {
        // silencia
      } finally {
        setLoadingData(false);
      }
    })();
  }, [visible, sidOrBId, cardType, issuerUid]);

  useEffect(() => {
    if (!visible) {
      pickerActiveRef.current = false;
      setPickingEvidence(false);
    }
  }, [visible]);

  // â”€â”€ cerrar â”€â”€
  const handleClose = useCallback(() => {
    setReportText('');
    setEvidenceImageDataUri(null);
    onClose();
  }, [onClose]);


  // â”€â”€ votar medalla business (toggle Ãºnico) â”€â”€
  const handleBusinessMedalTap = useCallback(
    async (medal: MedalKey) => {
      if (!myUid || votingKey) return;
      setVotingKey(medal);
      try {
        const result = await submitMedalVote(sidOrBId, myUid, medal);
        setMyVote(result.myVote);
        setCounts(result.counts);
        onCountsChanged?.(result.counts);
      } catch {
        Toast.show({ type: 'error', text1: tr('Error al votar', 'Vote error'), visibilityTime: 2000 });
      } finally {
        setVotingKey(null);
      }
    },
    [myUid, votingKey, sidOrBId, tr],
  );

  const pickEvidenceScreenshot = useCallback(async () => {
    if (sending || pickerActiveRef.current) return;
    pickerActiveRef.current = true;
    setPickingEvidence(true);

    let pickedDataUri: string | null = null;
    try {
      await waitForModalDismissBeforePicker();

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Toast.show({
          type: 'error',
          text1: tr('Permiso de galería denegado.', 'Photo library permission denied.'),
          visibilityTime: 2500,
        });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.3,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.base64) {
        Toast.show({
          type: 'error',
          text1: tr('No se pudo leer la imagen.', 'Could not read the image.'),
          visibilityTime: 2500,
        });
        return;
      }
      const mime =
        asset.mimeType && /^image\//i.test(asset.mimeType) ? asset.mimeType : 'image/jpeg';
      const dataUri = `data:${mime};base64,${asset.base64}`;
      if (dataUri.length > maxEvidenceDataUriChars) {
        Toast.show({
          type: 'error',
          text1: tr(
            'La imagen sigue siendo demasiado grande. Recorta más o elige otra.',
            'Image is still too large after compression. Crop more or pick another.',
          ),
          visibilityTime: 3000,
        });
        return;
      }
      pickedDataUri = dataUri;
    } catch {
      Toast.show({
        type: 'error',
        text1: tr('No se pudo abrir la galería.', 'Could not open the photo library.'),
        visibilityTime: 2000,
      });
    } finally {
      if (pickedDataUri) {
        setEvidenceImageDataUri(pickedDataUri);
      }
      restoreModalAfterPicker();
    }
  }, [sending, tr, maxEvidenceDataUriChars, waitForModalDismissBeforePicker, restoreModalAfterPicker]);

  // â”€â”€ enviar reporte incÃ³gnito â”€â”€
  const handleSendReport = useCallback(async () => {
    const text = reportText.trim();
    const hasImage = Boolean(evidenceImageDataUri);
    if ((!text && !hasImage) || sending) return;
    const uid = await getActiveUserId();
    if (!uid) {
      Toast.show({ type: 'error', text1: tr('Inicia sesión para reportar.', 'Sign in to report.'), visibilityTime: 2000 });
      return;
    }
    setSending(true);
    try {
      let evidenceImageBase64: string | undefined;
      if (hasImage && evidenceImageDataUri) {
        if (evidenceImageDataUri.length > maxEvidenceDataUriChars) {
          Toast.show({
            type: 'error',
            text1: tr(
              'La evidencia es demasiado grande para guardarla. Elige otra imagen.',
              'Evidence is too large to store. Choose another image.',
            ),
            visibilityTime: 3000,
          });
          return;
        }
        evidenceImageBase64 = evidenceImageDataUri.startsWith('data:')
          ? evidenceImageDataUri
          : `data:image/jpeg;base64,${evidenceImageDataUri}`;
      }

      const detailsForFirestore =
        text || (hasImage ? tr('[Evidencia visual adjunta]', '[Screenshot evidence attached]') : '');

      const ownerLabel = (ownerProfileName || cardOwnerName || '').trim();
      const evidencePlain = {
        v: 1 as const,
        cardType,
        targetCardId: sidOrBId,
        reportedUserId: issuerUid,
        reporterUserId: uid,
        reporterSummary: text,
        cardOwnerLabel: ownerLabel || undefined,
        observedAtIso: new Date().toISOString(),
        ...(evidenceImageBase64 ? { evidenceImageBase64 } : {}),
      };
      const evidencePlainJson = JSON.stringify(evidencePlain);

      let evidenceStatus: 'present' | 'missing' = 'missing';
      let evidenceCiphertext = '';
      let evidenceIv = '';
      let evidenceEphemPub = '';
      try {
        const modPk = await fetchModerationPublicKeyX25519();
        if (modPk) {
          const sealed = sealModerationEvidence(modPk, evidencePlainJson);
          evidenceCiphertext = sealed.evidenceCiphertext;
          evidenceIv = sealed.evidenceIv;
          evidenceEphemPub = sealed.evidenceEphemPub;
          evidenceStatus = 'present';
        }
      } catch {
        evidenceStatus = 'missing';
      }

      const expiresAt = Timestamp.fromMillis(Date.now() + 36 * 60 * 60 * 1000);

      await addDoc(collection(db, 'reports'), {
        type: 'card',
        status: 'pending',
        targetCardId: sidOrBId,
        reportedUserId: issuerUid,
        reporterUserId: uid,
        reason: cardType === 'smart' ? 'smart_card_report' : 'business_card_report',
        details: detailsForFirestore,
        anonymous: true,
        source: 'medal_rating_modal',
        createdAt: serverTimestamp(),
        evidenceStatus,
        evidenceCiphertext,
        evidenceIv,
        evidenceEphemPub,
        evidenceVersion: 1,
        expiresAt,
      });
      Toast.show({
        type: 'success',
        text1: tr('Reporte enviado', 'Report sent'),
        text2: tr('Gracias por mantener la plataforma segura', 'Thanks for keeping the platform safe'),
        visibilityTime: 2500,
      });
      setReportText('');
      setEvidenceImageDataUri(null);
    } catch {
      Toast.show({ type: 'error', text1: tr('Error al enviar', 'Send error'), visibilityTime: 2000 });
    } finally {
      setSending(false);
    }
  }, [
    reportText,
    evidenceImageDataUri,
    sending,
    cardType,
    sidOrBId,
    issuerUid,
    tr,
    ownerProfileName,
    cardOwnerName,
    maxEvidenceDataUriChars,
  ]);

  // â”€â”€ confirmar â”€â”€
  const handleConfirm = useCallback(async () => {
    if (sending) return;
    if (reportText.trim().length > 0 || evidenceImageDataUri) {
      await handleSendReport();
    } else {
      handleClose();
    }
  }, [sending, reportText, evidenceImageDataUri, handleSendReport, handleClose]);

  // â”€â”€ colores â”€â”€
  const accent      = P.accent;
  const textPrimary = P.text;
  const textSub     = isDark ? '#F5F0E1' : P.textSecondary;
  const surfaceBg   = P.surfaceElevated;
  const borderColor = P.border;
  const mutedColor  = isDark ? '#F5F0E1' : P.muted;

  const medalLabel = (item: (typeof medals)[number]) => tr(item.labelEs, item.labelEn);

  // â”€â”€â”€ tÃ­tulo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const displayName = ownerProfileName || cardOwnerName;
  const title = cardType === 'business'
    ? tr('Califica esta Business Card', 'Rate this Business Card')
    : `${tr('Insignias de', 'Badges of')} ${displayName}`;

  const subtitle = cardType === 'business'
    ? tr('Elige la medalla que mejor refleja tu experiencia', 'Choose the medal that best reflects your experience')
    : tr('Elige 1 insignia · Destaca en el perfil público', 'Choose 1 badge · Shown on the public profile');

  // â”€â”€â”€ render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // -- slide animation --
  const slideAnim = useRef(new Animated.Value(0)).current;

  const presentationVisible = visible && !pickingEvidence;

  useEffect(() => {
    if (presentationVisible) {
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [presentationVisible, slideAnim]);

  // -- Android back button --
  useEffect(() => {
    if (!presentationVisible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [presentationVisible, handleClose]);

  if (!visible) return null;
  if (!presentationVisible) return null;

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });

  const content = (
    <View style={styles.overlay}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>
        <Animated.View style={[styles.sheet, { backgroundColor: P.background, transform: [{ translateY }] }]}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoiding}
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          >
              {/* Handle + Close */}
              <View style={styles.topRow}>
                <View style={[styles.handle, { backgroundColor: accent }]} />
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={handleClose}
                  activeOpacity={0.7}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <MaterialCommunityIcons name="close" size={22} color={mutedColor} />
                </TouchableOpacity>
              </View>

              {/* Header */}
              <View style={styles.header}>
                <Text style={[styles.title, { color: accent }]}>{title}</Text>
                <Text style={[styles.subtitle, { color: textSub }]}>{subtitle}</Text>
              </View>

              {loadingData ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="large" color={accent} />
                </View>
              ) : (
                <KeyboardAwareScrollView
                  ref={scrollRef}
                  style={styles.scroll}
                  contentContainerStyle={[
                    styles.scrollContent,
                    {
                      flexGrow: 1,
                      paddingBottom: modalFooterBottomPad + 16,
                    },
                  ]}
                  bottomOffset={reportKeyboardBottomOffset}
                  extraKeyboardSpace={modalFooterBottomPad}
                  keyboardDismissMode="on-drag"
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {/* Insignias / Medallas — cuadrícula 2×3 (business + smart) */}
                  <MedalBadgeSelectionGrid
                    medals={medals}
                    selectedKey={myVote}
                    counts={counts}
                    votingKey={votingKey}
                    onSelect={(key) => void handleBusinessMedalTap(key)}
                    resolveLabel={medalLabel}
                    accent={accent}
                    surfaceBg={surfaceBg}
                    borderColor={borderColor}
                    textPrimary={textPrimary}
                    mutedColor={mutedColor}
                    variant={cardType === 'business' ? 'business' : 'social'}
                  />

                  {/* Separador */}
                  <View style={[styles.separator, { backgroundColor: borderColor }]} />

                  {/* Reporte incÃ³gnito */}
                  <View style={[styles.reportSection, { backgroundColor: surfaceBg, borderColor }]}>
                    <View style={styles.reportHeader}>
                      <MaterialCommunityIcons
                        name="shield-account-outline"
                        size={20}
                        color={accent}
                      />
                      <Text style={[styles.reportTitle, { color: accent }]}>
                        {tr('¡Reporta en incógnito!', 'Report anonymously!')}
                      </Text>
                    </View>
                    <Text style={[styles.reportInstruction, { color: mutedColor }]}>
                      {tr(
                        '¿Tienes algo que informar? Mantener la plataforma segura es misión de todos.',
                        'Something to report? Keeping the platform safe is everyone\'s mission.',
                      )}
                    </Text>
                    <TextInput
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                          color: textPrimary,
                          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        },
                      ]}
                      value={reportText}
                      onChangeText={setReportText}
                      placeholder={tr('Describe el problema de forma anónima...', 'Describe the issue anonymously...')}
                      placeholderTextColor={mutedColor}
                      multiline
                      maxLength={500}
                      returnKeyType="done"
                      blurOnSubmit
                      onFocus={scrollReportIntoView}
                    />
                    <TouchableOpacity
                      style={[
                        styles.evidenceAttachBtn,
                        { borderColor, opacity: sending ? 0.55 : 1 },
                      ]}
                      onPress={() => void pickEvidenceScreenshot()}
                      disabled={sending}
                      activeOpacity={0.85}
                    >
                      <MaterialCommunityIcons name="image-plus" size={20} color={accent} />
                      <Text style={[styles.evidenceAttachLabel, { color: accent }]}>
                        {tr(
                          'Adjuntar captura de pantalla (opcional)',
                          'Attach screenshot (optional)',
                        )}
                      </Text>
                    </TouchableOpacity>
                    {evidenceImageDataUri ? (
                      <View style={styles.evidencePreviewRow}>
                        <Image source={{ uri: evidenceImageDataUri }} style={styles.evidenceThumb} />
                        <TouchableOpacity
                          onPress={() => !sending && setEvidenceImageDataUri(null)}
                          disabled={sending}
                          style={styles.evidenceRemoveBtn}
                        >
                          <Text style={[styles.evidenceRemoveLabel, { color: mutedColor }]}>
                            {tr('Quitar imagen', 'Remove image')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    style={[styles.confirmBtn, { backgroundColor: accent, opacity: sending ? 0.6 : 1 }]}
                    onPress={() => void handleConfirm()}
                    disabled={sending}
                    activeOpacity={0.85}
                  >
                    {sending ? (
                      <ActivityIndicator size="small" color={P.onAccent} />
                    ) : (
                      <Text style={[styles.confirmBtnText, { color: P.onAccent }]}>
                        {tr('CONFIRMAR', 'CONFIRM')}
                      </Text>
                    )}
                  </TouchableOpacity>
                </KeyboardAwareScrollView>
              )}
          </KeyboardAvoidingView>
            </Animated.View>
        </View>
  );

  if (Platform.OS === 'ios') {
    return <FullWindowOverlay>{content}</FullWindowOverlay>;
  }

  if (Platform.OS === 'android' && useNativeModalOnAndroid) {
    return (
      <Modal
        visible={presentationVisible}
        transparent
        animationType="none"
        onRequestClose={handleClose}
        statusBarTranslucent
      >
        {content}
      </Modal>
    );
  }

  return content;
}

// â”€â”€â”€ Estilos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.95)',
    zIndex: 99999,
    elevation: 99999,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  sheet: {
    flex: 1,
    paddingTop: 40,
    paddingBottom: 36,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    marginTop: 12,
    opacity: 0.6,
  },
  topRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 12,
  },
  closeBtn: {
    position: 'absolute' as const,
    right: 14,
    top: 8,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  loadingWrap: {
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 16,
  },
  separator: {
    height: 1,
    opacity: 0.25,
  },
  reportSection: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  reportInstruction: {
    fontSize: 12,
    lineHeight: 18,
  },
  textInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 13,
    minHeight: 80,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  evidenceAttachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  evidenceAttachLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  evidencePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  evidenceThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  evidenceRemoveBtn: {
    flex: 1,
    paddingVertical: 8,
  },
  evidenceRemoveLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  confirmBtn: {
    marginTop: 14,
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
});
