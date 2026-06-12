import { SCROLL_CONTENT_MIN_FILL, verticalScrollInteractionProps } from '@/constants/scrollInteraction';
import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
  Share,
  Dimensions,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { useCoreT } from '@/services/coreI18n';
import { userFacingAlertMessage } from '@/services/apiUserFacingError';
import { requireBiometricIfPolicyEnabled } from '@/services/biometricAuth';
import { useLanguage } from '@/services/language';
import { generateQRGift } from '@/services/qrGiftService';
import GoldenRingButton from './GoldenRingButton';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const { width } = Dimensions.get('window');

interface PromotionsQrGeneratorProps {
  onClose?: () => void;
  pochobsUid: string;
}

/**
 * Promociones QR: generación segura de códigos regalo CS / Premium para Pochobs.
 */
const PromotionsQrGenerator: React.FC<PromotionsQrGeneratorProps> = ({ onClose: _onClose, pochobsUid }) => {
  const { language } = useLanguage();
  const t = useCoreT();
  const [creditsAmount, setCreditsAmount] = useState('500');
  const [monthsAmount, setMonthsAmount] = useState('1');
  const [maxPeople, setMaxPeople] = useState('100');
  const [expiresInDays, setExpiresInDays] = useState('7');

  const [loading, setLoading] = useState(false);
  const [generatedQR, setGeneratedQR] = useState<string | null>(null);
  const [qrModalVisible, setQRModalVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const modalFooterBottomPad = useModalFooterBottomPad();

  const qrCodeRef = useRef<any>(null);

  const validateInputs = (): boolean => {
    const credits = parseInt(creditsAmount);
    const months = parseInt(monthsAmount);
    const people = parseInt(maxPeople);
    const days = parseInt(expiresInDays);

    if (!credits || credits <= 0) {
      Alert.alert(t('common_error'), t('promotions_qr_invalid_credits'));
      return false;
    }

    if (!months || months <= 0 || months > 3) {
      Alert.alert(t('common_error'), t('promotions_qr_max_months_gift'));
      return false;
    }

    if (!people || people <= 0 || people > 500) {
      Alert.alert(t('common_error'), t('promotions_qr_max_people'));
      return false;
    }

    if (!days || days <= 0 || days > 90) {
      Alert.alert(t('common_error'), t('promotions_qr_max_validity_days'));
      return false;
    }

    return true;
  };

  const handleGenerateQR = async () => {
    if (!validateInputs()) return;

    try {
      setLoading(true);

      const biometricValid = await requireBiometricIfPolicyEnabled(t('common_auth_required'));
      if (!biometricValid) {
        Alert.alert(t('promotions_qr_access_denied_title'), t('promotions_qr_face_only_body'));
        setLoading(false);
        return;
      }

      const qrGift = await generateQRGift(
        pochobsUid,
        parseInt(creditsAmount),
        parseInt(monthsAmount),
        parseInt(maxPeople),
        parseInt(expiresInDays),
      );

      setGeneratedQR(qrGift.id);
      setQRModalVisible(true);

      const totalCreditsOut = parseInt(creditsAmount) * parseInt(maxPeople);
      Alert.alert(
        t('promotions_qr_qr_generated_title'),
        t('promotions_qr_qr_generated_body', { code: qrGift.id, totalCs: totalCreditsOut }),
      );
    } catch (error: unknown) {
      Alert.alert(t('common_error'), userFacingAlertMessage(error, language, t('promotions_qr_generate_failed')));
      console.error('Generate QR error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadQR = async (format: 'png' | 'pdf') => {
    if (!generatedQR || !qrCodeRef.current) return;

    try {
      setDownloading(true);

      qrCodeRef.current.toDataURL(async (data: string) => {
        try {
          const base64Data = data.split(',')[1];
          const fileName = `QR_${generatedQR}_Pochobs.${format === 'pdf' ? 'png' : 'png'}`;
          const filePath = `${FileSystem.documentDirectory}${fileName}`;

          await FileSystem.writeAsStringAsync(filePath, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });

          if (Platform.OS === 'ios') {
            await Sharing.shareAsync(filePath, {
              mimeType: 'image/png',
              dialogTitle: t('promotions_qr_share_dialog_title'),
            });
          } else {
            await Share.share({
              url: `file://${filePath}`,
              title: t('promotions_qr_share_title'),
              message: t('promotions_qr_share_message'),
            });
          }

          Alert.alert(t('promotions_qr_downloaded_title'), t('promotions_qr_qr_saved_as', { fileName }));
        } catch (error) {
          console.error('Download error:', error);
          Alert.alert(t('common_error'), t('promotions_qr_download_fail'));
        } finally {
          setDownloading(false);
        }
      });
    } catch (error) {
      console.error('QR export error:', error);
      Alert.alert(t('common_error'), t('promotions_qr_export_fail'));
      setDownloading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, styles.contentContainer]}
      {...verticalScrollInteractionProps}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={['#070226', '#1A3D5C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <MaterialCommunityIcons name="crown" size={32} color="#7A42FF" />
        <Text style={styles.headerTitle}>{t('promotions_qr_header_title')}</Text>
        <Text style={styles.headerSubtitle}>{t('promotions_qr_header_subtitle')}</Text>
      </LinearGradient>

      <View style={styles.formSection}>
        <View style={styles.formGroup}>
          <Text style={styles.label}>{t('promotions_qr_credits_per_person')}</Text>
          <TextInput
            style={styles.input}
            placeholder="500"
            value={creditsAmount}
            onChangeText={setCreditsAmount}
            keyboardType="numeric"
            placeholderTextColor="#999"
          />
          <Text style={styles.hint}>{t('promotions_qr_credits_hint')}</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>{t('promotions_qr_months_premium')}</Text>
          <View style={styles.monthsSelector}>
            {[1, 2, 3].map((month) => (
              <TouchableOpacity
                key={month}
                style={[styles.monthButton, parseInt(monthsAmount) === month && styles.monthButtonActive]}
                onPress={() => setMonthsAmount(month.toString())}
              >
                <Text
                  style={[
                    styles.monthButtonText,
                    parseInt(monthsAmount) === month && styles.monthButtonTextActive,
                  ]}
                >
                  {month}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>{t('promotions_qr_max_months_austerity')}</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>{t('promotions_qr_num_people_label')}</Text>
          <TextInput
            style={styles.input}
            placeholder="100"
            value={maxPeople}
            onChangeText={setMaxPeople}
            keyboardType="numeric"
            placeholderTextColor="#999"
          />
          <Text style={styles.hint}>{t('promotions_qr_max_people')}</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>{t('promotions_qr_validity_days_label')}</Text>
          <View style={styles.expirySelector}>
            {[7, 30, 90].map((day) => (
              <TouchableOpacity
                key={day}
                style={[styles.expiryButton, parseInt(expiresInDays) === day && styles.expiryButtonActive]}
                onPress={() => setExpiresInDays(day.toString())}
              >
                <Text
                  style={[
                    styles.expiryButtonText,
                    parseInt(expiresInDays) === day && styles.expiryButtonTextActive,
                  ]}
                >
                  {day}d
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>{t('promotions_qr_max_90_days')}</Text>
        </View>

        <LinearGradient colors={['#E8EAED', '#F5F5F5']} style={styles.estimateBox}>
          <View style={styles.estimateRow}>
            <Text style={styles.estimateLabel}>{t('promotions_qr_total_credits_label')}</Text>
            <Text style={styles.estimateValue}>
              {(parseInt(creditsAmount || '0') * parseInt(maxPeople || '0')).toLocaleString()} CS
            </Text>
          </View>
          <View style={styles.estimateRow}>
            <Text style={styles.estimateLabel}>{t('promotions_qr_people_colon')}</Text>
            <Text style={styles.estimateValue}>{maxPeople}</Text>
          </View>
          <View style={styles.estimateRow}>
            <Text style={styles.estimateLabel}>{t('promotions_qr_valid_for_label')}</Text>
            <Text style={styles.estimateValue}>
              {expiresInDays} {t('promotions_qr_days')}
            </Text>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.buttonContainer}>
        <GoldenRingButton
          label={loading ? t('promotions_qr_validating_biometric') : t('promotions_qr_generate_button')}
          onPress={handleGenerateQR}
          icon={loading ? 'loading' : 'qrcode'}
          disabled={loading}
          loading={loading}
          style={{ width: '100%' }}
        />
        <Text style={styles.warningText}>{t('promotions_qr_face_key_warning')}</Text>
      </View>

      <View style={styles.securityBox}>
        <MaterialCommunityIcons name="shield-lock" size={20} color="#2ECC71" />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.securityTitle}>{t('promotions_qr_security_title')}</Text>
          <Text style={styles.securityText}>{t('promotions_qr_security_body')}</Text>
        </View>
      </View>

      <Modal visible={qrModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { paddingBottom: modalFooterBottomPad }]}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setQRModalVisible(false)}>
              <MaterialCommunityIcons name="close" size={24} color="#070226" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>{t('promotions_qr_modal_title')}</Text>

            {generatedQR && (
              <View style={styles.qrContainer}>
                <View style={styles.qrSvgBox} collapsable={false}>
                  <LinearGradient
                    colors={['#7A42FF', '#E8C547']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.qrFrame}
                  >
                    <QRCode
                      ref={qrCodeRef}
                      value={`cardsocial://redeem?code=${generatedQR}`}
                      size={256}
                      color="#070226"
                      backgroundColor="#FFF"
                      ecl="H"
                    />
                  </LinearGradient>
                </View>

                <Text style={styles.qrCodeText}>{generatedQR}</Text>
                <Text style={styles.qrLabel}>{t('promotions_qr_scan_or_share')}</Text>
              </View>
            )}

            <View style={styles.downloadOptions}>
              <TouchableOpacity
                style={[styles.downloadBtn, { marginRight: 8 }]}
                onPress={() => handleDownloadQR('png')}
                disabled={downloading}
              >
                {downloading ? (
                  <ActivityIndicator size="small" color="#070226" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="image-multiple" size={18} color="#070226" />
                    <Text style={styles.downloadBtnText}>{t('promotions_qr_download_png')}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.downloadBtn}
                onPress={() => handleDownloadQR('pdf')}
                disabled={downloading}
              >
                {downloading ? (
                  <ActivityIndicator size="small" color="#070226" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="file-pdf-box" size={18} color="#070226" />
                    <Text style={styles.downloadBtnText}>{t('promotions_qr_for_pdf')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.shareBtn}>
              <MaterialCommunityIcons name="share-variant" size={18} color="#FFF" />
              <Text style={styles.shareBtnText}>{t('promotions_qr_share_whatsapp_telegram')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => {
                setQRModalVisible(false);
                setGeneratedQR(null);
              }}
            >
              <Text style={styles.closeBtnText}>{t('common_close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  contentContainer: {
    paddingBottom: 20,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#070226',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  formSection: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#070226',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#070226',
    marginBottom: 6,
  },
  hint: {
    fontSize: 11,
    color: '#999',
  },
  monthsSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  monthButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  monthButtonActive: {
    backgroundColor: '#7A42FF',
    borderColor: '#7A42FF',
  },
  monthButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  monthButtonTextActive: {
    color: '#FFF',
  },
  expirySelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  expiryButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  expiryButtonActive: {
    backgroundColor: '#070226',
    borderColor: '#070226',
  },
  expiryButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  expiryButtonTextActive: {
    color: '#FFF',
  },
  estimateBox: {
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  estimateLabel: {
    fontSize: 12,
    color: '#666',
  },
  estimateValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#070226',
  },
  buttonContainer: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  warningText: {
    fontSize: 11,
    color: '#7A42FF',
    fontWeight: '500',
    marginTop: 12,
    textAlign: 'center',
  },
  securityBox: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2ECC71',
    marginHorizontal: 16,
  },
  securityTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#070226',
  },
  securityText: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxHeight: '85%',
  },
  modalClose: {
    alignSelf: 'flex-end',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#070226',
    marginBottom: 20,
    textAlign: 'center',
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  qrSvgBox: {
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  qrFrame: {
    width: 280,
    height: 280,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCodeText: {
    fontSize: 11,
    color: '#999',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  qrLabel: {
    fontSize: 11,
    color: '#666',
  },
  downloadOptions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  downloadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 6,
  },
  downloadBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#070226',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#070226',
    borderRadius: 8,
    gap: 8,
    marginBottom: 12,
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  closeBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#070226',
  },
});

export default PromotionsQrGenerator;
