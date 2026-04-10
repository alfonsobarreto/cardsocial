/**
 * MedalRatingModal
 *
 * Smart cards  â†’ Insignias (mÃ¡x 2 votos) + Reporta usuario en incÃ³gnito
 * Business cards â†’ Medallas de negocio + Comentario incÃ³gnito RED ZONE
 *
 * Tema: dÃ­a/noche desde premiumTheme Â· BilingÃ¼e (es/en)
 */

import { premiumTheme as PT } from '@/app/_premiumTheme';
import { getActiveUserId } from '@/services/authSession';
import { db } from '@/services/firebaseConfig';
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    BackHandler,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import Toast from 'react-native-toast-message';

// â”€â”€â”€ Props â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface MedalRatingModalProps {
  visible: boolean;
  onClose: () => void;
  cardType: 'smart' | 'business';
  cardId: string;
  cardOwnerUid: string;
  cardOwnerName: string;
  onCountsChanged?: (counts: MedalCounts) => void;
}

// â”€â”€â”€ Componente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€



export function MedalRatingModal({
  visible,
  onClose,
  cardType,
  cardId,
  cardOwnerUid,
  cardOwnerName,
  onCountsChanged,
}: MedalRatingModalProps) {
  const { language } = useLanguage();
  const { resolvedMode } = useLookMode();
  const isDark = resolvedMode === 'noche';
  const P = isDark ? PT.dark : PT.light;

  const tr = (es: string, en: string) => (language === 'en' ? en : es);

  // â”€â”€ estado â”€â”€
  const [myUid, setMyUid]         = useState<string | null>(null);
  const [myVote, setMyVote]       = useState<MedalKey | null>(null);
  const [counts, setCounts]       = useState<MedalCounts>({});
  const [loadingData, setLoadingData] = useState(false);
  const [votingKey, setVotingKey] = useState<MedalKey | null>(null);
  const [reportText, setReportText] = useState('');
  const [sending, setSending]     = useState(false);
  const [ownerProfileName, setOwnerProfileName] = useState<string>('');

  const medals = cardType === 'business' ? BUSINESS_MEDALS : SOCIAL_MEDALS;

  // â”€â”€ cargar datos al abrir â”€â”€
  useEffect(() => {
    if (!visible || !cardId) return;
    setReportText('');
    void (async () => {
      setLoadingData(true);
      try {
        const uid = await getActiveUserId();
        setMyUid(uid);
        if (!uid) return;
        // Fetch profile name from users collection
        if (cardOwnerUid) {
          try {
            const profileSnap = await getDoc(doc(db, 'users', cardOwnerUid));
            const pData = profileSnap.data() as any;
            if (pData) {
              const fName = String(pData.firstName || '').trim();
              const lName = String(pData.lastName || '').trim();
              const full = String(pData.fullName || `${fName} ${lName}`.trim() || '').trim();
              const nick = String(pData.nickname || '').trim();
              setOwnerProfileName(nick ? `${full} (@${nick})` : full);
            }
          } catch { /* silencia */ }
        }
        const data = await getMedalData(cardId, uid);
        setCounts(data.counts);
        setMyVote(data.myVote);
      } catch {
        // silencia
      } finally {
        setLoadingData(false);
      }
    })();
  }, [visible, cardId, cardType]);

  // â”€â”€ cerrar â”€â”€
  const handleClose = useCallback(() => {
    setReportText('');
    onClose();
  }, [onClose]);


  // â”€â”€ votar medalla business (toggle Ãºnico) â”€â”€
  const handleBusinessMedalTap = useCallback(
    async (medal: MedalKey) => {
      if (!myUid || votingKey) return;
      setVotingKey(medal);
      try {
        const result = await submitMedalVote(cardId, myUid, medal);
        setMyVote(result.myVote);
        setCounts(result.counts);
        onCountsChanged?.(result.counts);
      } catch {
        Toast.show({ type: 'error', text1: tr('Error al votar', 'Vote error'), visibilityTime: 2000 });
      } finally {
        setVotingKey(null);
      }
    },
    [myUid, votingKey, cardId, tr],
  );

  // â”€â”€ enviar reporte incÃ³gnito â”€â”€
  const handleSendReport = useCallback(async () => {
    const text = reportText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'userReports'), {
        type: cardType === 'smart' ? 'user_report' : 'card_feedback',
        status: 'pending',
        targetCardId: cardId,
        targetOwnerUid: cardOwnerUid,
        details: text,
        anonymous: true,
        createdAt: serverTimestamp(),
      });
      Toast.show({
        type: 'success',
        text1: tr('Reporte enviado', 'Report sent'),
        text2: tr('Gracias por mantener la plataforma segura', 'Thanks for keeping the platform safe'),
        visibilityTime: 2500,
      });
      setReportText('');
    } catch {
      Toast.show({ type: 'error', text1: tr('Error al enviar', 'Send error'), visibilityTime: 2000 });
    } finally {
      setSending(false);
    }
  }, [reportText, sending, cardType, cardId, cardOwnerUid, tr]);

  // â”€â”€ confirmar â”€â”€
  const handleConfirm = useCallback(async () => {
    if (sending) return;
    if (reportText.trim().length > 0) {
      await handleSendReport();
    } else {
      handleClose();
    }
  }, [sending, reportText, handleSendReport, handleClose]);

  // â”€â”€ colores â”€â”€
  const accent      = P.accent;
  const textPrimary = P.text;
  const textSub     = isDark ? '#F5F0E1' : P.textSecondary;
  const surfaceBg   = P.surfaceElevated;
  const borderColor = P.border;
  const mutedColor  = isDark ? '#F5F0E1' : P.muted;

  // â”€â”€â”€ render de una insignia/medalla â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const renderItem = (item: typeof medals[number]) => {
    const isSelected = myVote === item.key;
    const isLoading  = votingKey === item.key;
    const count      = counts[item.key] ?? 0;
    const onTap      = () => void handleBusinessMedalTap(item.key);

    return (
      <TouchableOpacity
        key={item.key}
        style={[
          styles.medalBtn,
          {
            backgroundColor: isSelected ? `${accent}22` : surfaceBg,
            borderColor: isSelected ? accent : borderColor,
          },
        ]}
        onPress={onTap}
        activeOpacity={0.75}
        disabled={!!votingKey}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={language === 'en' ? item.labelEn : item.labelEs}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <MaterialCommunityIcons
            name={item.icon as any}
            size={36}
            color={isSelected ? accent : mutedColor}
          />
        )}
        <Text
          style={[styles.medalLabel, { color: isSelected ? accent : textPrimary }]}
          numberOfLines={2}
        >
          {language === 'en' ? item.labelEn : item.labelEs}
        </Text>
        {count > 0 && (
          <View style={[styles.medalCountBadge, { backgroundColor: isSelected ? accent : mutedColor }]}>
            <Text style={styles.medalCountText}>{count}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

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

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  // -- Android back button --
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, handleClose]);

  if (!visible) return null;

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });

  const content = (
    <View style={styles.overlay}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kavWrapper}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, { backgroundColor: P.background, transform: [{ translateY }] }]}>
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
                <ScrollView
                  contentContainerStyle={styles.scrollContent}
                  keyboardDismissMode="on-drag"
                  showsVerticalScrollIndicator={false}
                >
                  {/* Insignias / Medallas */}
                  <View style={styles.medalGrid}>
                    {medals.map(renderItem)}
                  </View>

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
                    />
                  </View>
                </ScrollView>
              )}

              {/* BotÃ³n Confirmar */}
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
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
  );

  if (Platform.OS === 'ios') {
    return <FullWindowOverlay>{content}</FullWindowOverlay>;
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
  kavWrapper: {
    flex: 1,
  },
  sheet: {
    flex: 1,
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
  medalGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  medalBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 6,
    position: 'relative',
  },
  medalLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
  },
  medalCountBadge: {
    position: 'absolute',
    top: 5,
    right: 6,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  medalCountText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '700',
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
  confirmBtn: {
    marginHorizontal: 16,
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
