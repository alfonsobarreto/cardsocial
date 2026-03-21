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
import { getActiveUserId } from '@/services/authSession';
import { hardLockCheck } from '@/services/biometricAuth';
import { generateQRGift } from '@/services/qrGiftService';
import GoldenRingButton from './GoldenRingButton';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const { width } = Dimensions.get('window');

interface MintQRGeneratorProps {
  onClose?: () => void;
  pochobsUid: string;
}

/**
 * Componente para que Pochobs genere QRs de regalo
 * Genera, descarga y comparte códigos exclusivos
 */
const MintQRGenerator: React.FC<MintQRGeneratorProps> = ({ onClose, pochobsUid }) => {
  const [creditsAmount, setCreditsAmount] = useState('500');
  const [monthsAmount, setMonthsAmount] = useState('1');
  const [maxPeople, setMaxPeople] = useState('100');
  const [expiresInDays, setExpiresInDays] = useState('7');

  const [loading, setLoading] = useState(false);
  const [generatedQR, setGeneratedQR] = useState<string | null>(null);
  const [qrModalVisible, setQRModalVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const qrCodeRef = useRef<any>(null);

  const validateInputs = (): boolean => {
    const credits = parseInt(creditsAmount);
    const months = parseInt(monthsAmount);
    const people = parseInt(maxPeople);
    const days = parseInt(expiresInDays);

    if (!credits || credits <= 0) {
      Alert.alert('Error', 'Ingresa una cantidad válida de créditos');
      return false;
    }

    if (!months || months <= 0 || months > 3) {
      Alert.alert('Error', 'Máximo 3 meses de Premium por regalo');
      return false;
    }

    if (!people || people <= 0 || people > 500) {
      Alert.alert('Error', 'Máximo 500 personas por código');
      return false;
    }

    if (!days || days <= 0 || days > 90) {
      Alert.alert('Error', 'Máximo 90 días de validez');
      return false;
    }

    return true;
  };

  const handleGenerateQR = async () => {
    if (!validateInputs()) return;

    try {
      setLoading(true);

      // 1. FaceID Hard Lock - Validación biométrica OBLIGATORIA
      const biometricValid = await hardLockCheck(pochobsUid);
      if (!biometricValid) {
        Alert.alert('❌ Acceso Denegado', 'Solo tu cara puede acuñar monedas. Intenta de nuevo.');
        setLoading(false);
        return;
      }

      // 2. Generar QR gift
      const qrGift = await generateQRGift(
        pochobsUid,
        parseInt(creditsAmount),
        parseInt(monthsAmount),
        parseInt(maxPeople),
        parseInt(expiresInDays)
      );

      setGeneratedQR(qrGift.id);
      setQRModalVisible(true);

      Alert.alert(
        '✅ ¡QR Generado!',
        `Código: ${qrGift.id}\nTotal invertido: ${(parseInt(creditsAmount) * parseInt(maxPeople))} CS`
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo generar el código');
      console.error('Generate QR error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadQR = async (format: 'png' | 'pdf') => {
    if (!generatedQR || !qrCodeRef.current) return;

    try {
      setDownloading(true);

      // Generar código QR como datos SVG
      qrCodeRef.current.toDataURL(async (data: string) => {
        try {
          const base64Data = data.split(',')[1]; // Remove data:image/png;base64, prefix
          const fileName = `QR_${generatedQR}_Pochobs.${format === 'pdf' ? 'png' : 'png'}`;
          const filePath = `${FileSystem.documentDirectory}${fileName}`;

          // Guardar en filesystem
          await FileSystem.writeAsStringAsync(filePath, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });

          // Compartir o guardar
          if (Platform.OS === 'ios') {
            await Sharing.shareAsync(filePath, {
              mimeType: 'image/png',
              dialogTitle: `Comparte tu QR de Regalo`,
            });
          } else {
            await Share.share({
              url: `file://${filePath}`,
              title: 'QR de Regalo Exclusivo',
              message: `¡Pochobs te regala créditos! Escanea este código en Card-Social`,
            });
          }

          Alert.alert('✅ Descargado', `QR guardado como: ${fileName}`);
        } catch (error) {
          console.error('Download error:', error);
          Alert.alert('Error', 'No se pudo descargar el QR');
        } finally {
          setDownloading(false);
        }
      });
    } catch (error) {
      console.error('QR export error:', error);
      Alert.alert('Error', 'No se pudo exportar el QR');
      setDownloading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}
      <LinearGradient colors={['#0A2540', '#1A3D5C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <MaterialCommunityIcons name="crown" size={32} color="#C5A065" />
        <Text style={styles.headerTitle}>Acuñador de Monedas (Mint)</Text>
        <Text style={styles.headerSubtitle}>Regala CS y Premium instantáneamente</Text>
      </LinearGradient>

      {/* FORM SECTION */}
      <View style={styles.formSection}>
        <View style={styles.formGroup}>
          <Text style={styles.label}>Créditos por Persona</Text>
          <TextInput
            style={styles.input}
            placeholder="500"
            value={creditsAmount}
            onChangeText={setCreditsAmount}
            keyboardType="numeric"
            placeholderTextColor="#999"
          />
          <Text style={styles.hint}>Cada usuario recibirá esta cantidad de CS</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Meses de Premium</Text>
          <View style={styles.monthsSelector}>
            {[1, 2, 3].map((month) => (
              <TouchableOpacity
                key={month}
                style={[
                  styles.monthButton,
                  parseInt(monthsAmount) === month && styles.monthButtonActive,
                ]}
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
          <Text style={styles.hint}>Máximo 3 meses (regla de austeridad)</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Cantidad de Personas</Text>
          <TextInput
            style={styles.input}
            placeholder="100"
            value={maxPeople}
            onChangeText={setMaxPeople}
            keyboardType="numeric"
            placeholderTextColor="#999"
          />
          <Text style={styles.hint}>Máximo 500 personas por código</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Validez (Días)</Text>
          <View style={styles.expirySelector}>
            {[7, 30, 90].map((day) => (
              <TouchableOpacity
                key={day}
                style={[
                  styles.expiryButton,
                  parseInt(expiresInDays) === day && styles.expiryButtonActive,
                ]}
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
          <Text style={styles.hint}>Máximo 90 días</Text>
        </View>

        {/* ESTIMATE */}
        <LinearGradient colors={['#E8EAED', '#F5F5F5']} style={styles.estimateBox}>
          <View style={styles.estimateRow}>
            <Text style={styles.estimateLabel}>Total de Créditos:</Text>
            <Text style={styles.estimateValue}>
              {(parseInt(creditsAmount || '0') * parseInt(maxPeople || '0')).toLocaleString()} CS
            </Text>
          </View>
          <View style={styles.estimateRow}>
            <Text style={styles.estimateLabel}>Personas:</Text>
            <Text style={styles.estimateValue}>{maxPeople}</Text>
          </View>
          <View style={styles.estimateRow}>
            <Text style={styles.estimateLabel}>Válido por:</Text>
            <Text style={styles.estimateValue}>{expiresInDays} días</Text>
          </View>
        </LinearGradient>
      </View>

      {/* GENERATE BUTTON */}
      <View style={styles.buttonContainer}>
        <GoldenRingButton
          label={loading ? 'Validando biometría...' : 'Generar QR de Regalo'}
          onPress={handleGenerateQR}
          icon={loading ? 'loading' : 'qrcode'}
          disabled={loading}
          loading={loading}
          style={{ width: '100%' }}
        />
        <Text style={styles.warningText}>
          ⚠️ Tu cara es la llave. FaceID validará antes de acuñar.
        </Text>
      </View>

      {/* SECURITY INFO */}
      <View style={styles.securityBox}>
        <MaterialCommunityIcons name="shield-lock" size={20} color="#2ECC71" />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.securityTitle}>Seguridad Máxima</Text>
          <Text style={styles.securityText}>
            Solo tú (Pochobs) puedes generar QRs. Cada código es único, caducable y auditable.
          </Text>
        </View>
      </View>

      {/* QR RESULT MODAL */}
      <Modal visible={qrModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setQRModalVisible(false)}>
              <MaterialCommunityIcons name="close" size={24} color="#0A2540" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>🎁 QR de Regalo Generado</Text>

            {generatedQR && (
              <View style={styles.qrContainer}>
                <LinearGradient colors={['#C5A065', '#E8C547']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.qrFrame}>
                  <QRCode
                    ref={qrCodeRef}
                    value={`cardsocial://redeem?code=${generatedQR}`}
                    size={256}
                    color="#0A2540"
                    backgroundColor="#FFF"
                    logoSize={60}
                    logoBackgroundColor="#FFF"
                    ecl="H"
                  />
                </LinearGradient>

                <Text style={styles.qrCodeText}>{generatedQR}</Text>
                <Text style={styles.qrLabel}>Escanea o comparte este código</Text>
              </View>
            )}

            {/* DOWNLOAD OPTIONS */}
            <View style={styles.downloadOptions}>
              <TouchableOpacity
                style={[styles.downloadBtn, { marginRight: 8 }]}
                onPress={() => handleDownloadQR('png')}
                disabled={downloading}
              >
                {downloading ? (
                  <ActivityIndicator size="small" color="#0A2540" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="image-multiple" size={18} color="#0A2540" />
                    <Text style={styles.downloadBtnText}>Descargar PNG</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.downloadBtn}
                onPress={() => handleDownloadQR('pdf')}
                disabled={downloading}
              >
                {downloading ? (
                  <ActivityIndicator size="small" color="#0A2540" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="file-pdf-box" size={18} color="#0A2540" />
                    <Text style={styles.downloadBtnText}>Para PDF</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.shareBtn}>
              <MaterialCommunityIcons name="share-variant" size={18} color="#FFF" />
              <Text style={styles.shareBtnText}>Compartir a WhatsApp/Telegram</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => {
                setQRModalVisible(false);
                setGeneratedQR(null);
              }}
            >
              <Text style={styles.closeBtnText}>Cerrar</Text>
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

  // HEADER
  header: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0A2540',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },

  // FORM
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
    color: '#0A2540',
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
    color: '#0A2540',
    marginBottom: 6,
  },
  hint: {
    fontSize: 11,
    color: '#999',
  },

  // SELECTORS
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
    backgroundColor: '#C5A065',
    borderColor: '#C5A065',
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
    backgroundColor: '#0A2540',
    borderColor: '#0A2540',
  },
  expiryButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  expiryButtonTextActive: {
    color: '#FFF',
  },

  // ESTIMATE
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
    color: '#0A2540',
  },

  // BUTTON
  buttonContainer: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  warningText: {
    fontSize: 11,
    color: '#C5A065',
    fontWeight: '500',
    marginTop: 12,
    textAlign: 'center',
  },

  // SECURITY BOX
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
    color: '#0A2540',
  },
  securityText: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },

  // MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
    color: '#0A2540',
    marginBottom: 20,
    textAlign: 'center',
  },

  qrContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  qrFrame: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
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
    color: '#0A2540',
  },

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#0A2540',
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
    color: '#0A2540',
  },
});

export default MintQRGenerator;
