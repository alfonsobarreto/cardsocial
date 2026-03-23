/**
 * Create Business Card Screen
 * Formulario para que comerciantes creen sus tarjetas de negocio
 * Incluye: Dirección Física, Calendly, Keywords SEO, KYC, Contrato Ético
 * + Branded QR + licenciamiento anual por tarjeta
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { getActiveUserId } from '@/services/authSession';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import * as ImagePicker from 'expo-image-picker';
import { hardLockCheck } from '@/services/biometricAuth';
import {
  calculatePriceWithPremiumDiscount,
  purchaseBusinessCard,
  getMainBenefit,
} from '@/services/businessCardPaywallService';
import {
  ExportBusinessQR,
  generatePermanentBusinessLink,
} from '@/services/brandedQrService';
import { useLanguage } from '@/services/language';

interface BusinessCardFormData {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  physicalAddress: string;
  calendlyLink: string;
  elevatorPitch: string;
  contractPdfUrl: string;
  businessLogoUri: string | null;
  kycDocumentUri: string | null;
  acceptedTerms: boolean;
}

export default function CreateBusinessCardScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const tr = (es: string, en: string) => language === 'en' ? en : es;
  const [formData, setFormData] = useState<BusinessCardFormData>({
    businessName: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    physicalAddress: '',
    calendlyLink: '',
    elevatorPitch: '',
    contractPdfUrl: '',
    businessLogoUri: null,
    kycDocumentUri: null,
    acceptedTerms: false,
  });

  const [loading, setLoading] = useState(false);
  const [kycDocumentSelected, setKycDocumentSelected] = useState(false);
  const [isBusinessUnlocked, setIsBusinessUnlocked] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      const verifyAccess = async () => {
        const authenticated = await hardLockCheck('acceso a Business Cards');
        setIsBusinessUnlocked(authenticated);
      };

      void verifyAccess();
    }, [])
  );

  const countWords = (value: string): number =>
    String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

  const sanitizePitchWords = (value: string): string[] =>
    String(value || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.replace(/[^a-z0-9áéíóúñü]/gi, ''))
      .filter(Boolean)
      .slice(0, 20);

  const buildGoogleMapsLink = (address: string): string | null => {
    const cleanAddress = String(address || '').trim();
    if (!cleanAddress) {
      return null;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanAddress)}`;
  };

  /**
   * Validar que todos los campos requeridos estén completos
   */
  const validateForm = (): boolean => {
    if (!formData.businessName.trim()) {
      Alert.alert(tr('Error', 'Error'), tr('Nombre del negocio es requerido.', 'Business name is required.'));
      return false;
    }
    if (!formData.ownerName.trim()) {
      Alert.alert(tr('Error', 'Error'), tr('Nombre del propietario es requerido.', 'Owner name is required.'));
      return false;
    }
    if (!formData.ownerEmail.trim()) {
      Alert.alert(tr('Error', 'Error'), tr('Email es requerido.', 'Email is required.'));
      return false;
    }
    if (!formData.ownerPhone.trim()) {
      Alert.alert(tr('Error', 'Error'), tr('Teléfono es requerido.', 'Phone is required.'));
      return false;
    }
    const pitchWordCount = countWords(formData.elevatorPitch);
    if (pitchWordCount === 0 || pitchWordCount > 20) {
      Alert.alert(tr('Error', 'Error'), tr('El Elevator Pitch debe tener entre 1 y 20 palabras.', 'Elevator Pitch must have between 1 and 20 words.'));
      return false;
    }
    if (formData.contractPdfUrl.trim() && !/\.pdf(\?.*)?$/i.test(formData.contractPdfUrl.trim())) {
      Alert.alert(tr('Error', 'Error'), tr('El contrato debe ser un enlace PDF válido.', 'Contract must be a valid PDF link.'));
      return false;
    }
    if (!formData.kycDocumentUri) {
      Alert.alert(tr('Error', 'Error'), tr('Foto de ID es requerida para validación KYC.', 'ID photo is required for KYC validation.'));
      return false;
    }
    if (!formData.acceptedTerms) {
      Alert.alert(tr('Error', 'Error'), tr('Debes aceptar el contrato ético antes de continuar.', 'You must accept the ethical contract to continue.'));
      return false;
    }
    return true;
  };

  /**
   * Seleccionar imagen de documento KYC
   */
  const handleSelectKYCDocument = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setFormData((prev) => ({
        ...prev,
        kycDocumentUri: result.assets[0].uri,
      }));
      setKycDocumentSelected(true);
    }
  };

  const handleSelectBusinessLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (!result.canceled && result.assets.length > 0) {
      setFormData((prev) => ({
        ...prev,
        businessLogoUri: result.assets[0].uri,
      }));
    }
  };

  /**
   * Crear tarjeta de negocio + Paywall
   */
  const handleCreateBusinessCard = async () => {
    // Validar Hard Lock (biometría)
    const authenticated = await hardLockCheck('crear tu tarjeta de negocio');
    if (!authenticated) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const userId = await getActiveUserId();
      if (!userId) {
        Alert.alert(tr('Error', 'Error'), tr('Usuario no autenticado.', 'User not authenticated.'));
        setLoading(false);
        return;
      }

      const businessCardId = `bcard_${Date.now()}`;

      // PASO 1: MOSTRAR PRICING Y PAYWALL
      const platform = Platform.OS as 'ios' | 'android';
      const pricing = calculatePriceWithPremiumDiscount(49.99, false);

      // Mostrar modal de pricing
      const confirmPay = await new Promise<boolean>((resolve) => {
        Alert.alert(
          `${getMainBenefit(false)} 💳`,
          `Precio: $49.99 USD/año por tarjeta\nCashback al activar: 1,000 Monedas CS\n\nIncluye:\n✓ Publicación en Social Market\n✓ Stories VIP con CTA\n✓ QR Branded + Descarga\n✓ Analytics\n✓ Soporte Prioritario`,
          [
            {
              text: 'Cancelar',
              onPress: () => resolve(false),
              style: 'cancel',
            },
            {
              text: 'Confirmar Compra',
              onPress: () => resolve(true),
              style: 'default',
            },
          ]
        );
      });

      if (!confirmPay) {
        setLoading(false);
        return;
      }

      // PASO 2: PROCESAR PAGO CON REVENUCAT
      const purchaseResult = await purchaseBusinessCard(platform, false, businessCardId, userId);
      if (!purchaseResult.success) {
        Alert.alert(tr('Error', 'Error'), `${tr('Error en la compra: ', 'Purchase error: ')}${purchaseResult.message}`);
        setLoading(false);
        return;
      }

      // PASO 3: CREAR DOCUMENTO DE TARJETA DE NEGOCIO
      const businessCardRef = doc(db, 'businessCards', businessCardId);
      const permanentBusinessLink = generatePermanentBusinessLink(businessCardId, userId);
      const elevatorPitchWords = sanitizePitchWords(formData.elevatorPitch);
      const mapsLink = buildGoogleMapsLink(formData.physicalAddress);
      const contractList = formData.contractPdfUrl.trim() ? [formData.contractPdfUrl.trim()] : [];

      const businessCardData = {
        id: businessCardId,
        ownerUid: userId,
        type: 'business',
        businessName: formData.businessName,
        ownerName: formData.ownerName,
        ownerEmail: formData.ownerEmail,
        ownerPhone: formData.ownerPhone,
        physicalAddress: formData.physicalAddress,
        mapsLink,
        calendlyLink: formData.calendlyLink,
        businessLogo: formData.businessLogoUri,
        elevatorPitch: formData.elevatorPitch,
        elevatorPitchWords,
        keywords: elevatorPitchWords,
        professionalVault: {
          contractsPdf: contractList,
          mapsLink,
        },
        latitude: 0, // Se actualiza en backend
        longitude: 0,
        city: '',
        postalCode: '',
        kycDocumentUrl: formData.kycDocumentUri,
        kycVerified: false,
        kycApprovedAt: null,
        kycTermsAccepted: formData.acceptedTerms,
        averageRating: 5,
        totalRatings: 0,
        negativeRatingsCount: 0,
        isActive: true,
        isPublishedToMarket: false,
        createdAt: serverTimestamp(),
        publishedAt: null,
        viewCount: 0,
        permanent_business_link: permanentBusinessLink,
        // Información de compra
        purchaseId: purchaseResult.purchaseId,
        subscriptionExpires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 ano
        paidPrice: purchaseResult.finalPrice ?? pricing.finalPrice,
        premiumDiscount: purchaseResult.discountPercentage ?? 0,
      };

      await setDoc(businessCardRef, businessCardData);

      // PASO 4: OFRECER EXPORTAR QR PERMANENTE 300 DPI
      Alert.alert(
        '✅ ¡Tarjeta de Negocio Creada!',
        `Tu tarjeta fue creada exitosamente.\n\n💰 Pago procesado: $${(purchaseResult.finalPrice ?? pricing.finalPrice).toFixed(2)}${purchaseResult.discountPercentage ? ` (${purchaseResult.discountPercentage}% DESCUENTO)` : ''}\n\nEspera validación KYC (24-48 horas).\n\nID: ${businessCardId}`,
        [
          {
            text: 'Exportar QR (PNG 300 DPI)',
            onPress: async () => {
              const result = await ExportBusinessQR({
                businessId: businessCardId,
                businessName: formData.businessName,
                permanentBusinessLink,
                businessLogoUri: formData.businessLogoUri || undefined,
                format: 'png',
              });
              if (result.success) {
                Alert.alert(tr('✅ Éxito', '✅ Success'), result.message);
              } else {
                Alert.alert(tr('⚠️ Error', '⚠️ Error'), result.message);
              }
              router.back();
            },
          },
          {
            text: 'Exportar QR (PDF 300 DPI)',
            onPress: async () => {
              const result = await ExportBusinessQR({
                businessId: businessCardId,
                businessName: formData.businessName,
                permanentBusinessLink,
                businessLogoUri: formData.businessLogoUri || undefined,
                format: 'pdf',
              });
              if (result.success) {
                Alert.alert(tr('✅ Éxito', '✅ Success'), result.message);
              } else {
                Alert.alert(tr('⚠️ Error', '⚠️ Error'), result.message);
              }
              router.back();
            },
          },
          {
            text: 'Ir a Mis Tarjetas',
            onPress: () => {
              router.push('/(tabs)/cards');
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error creating business card:', error);
      Alert.alert(tr('Error', 'Error'), tr(`Error creando tarjeta: ${error.message}`, `Error creating card: ${error.message}`));
    } finally {
      setLoading(false);
    }
  };

  if (!isBusinessUnlocked) {
    return (
      <View style={[styles.container, styles.lockedContainer]}>
        <MaterialCommunityIcons name="shield-lock-outline" size={58} color="#0A2540" />
        <Text style={styles.lockedTitle}>Business Cards bloqueado</Text>
        <Text style={styles.lockedSubtitle}>Autoriza FaceID/TouchID para continuar.</Text>
        <TouchableOpacity
          style={styles.unlockButton}
          onPress={async () => {
            const authenticated = await hardLockCheck('acceso a Business Cards');
            setIsBusinessUnlocked(authenticated);
          }}
        >
          <MaterialCommunityIcons name="fingerprint" size={20} color="#FFFFFF" />
          <Text style={styles.unlockButtonText}>Desbloquear</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode="on-drag"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={28} color="#0A2540" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Crear Tarjeta de Negocio</Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Sección de Negocio */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📌 Información del Negocio</Text>

          <Text style={styles.label}>Nombre del Negocio *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Juan's Barbershop"
            value={formData.businessName}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, businessName: text }))
            }
            editable={!loading}
          />

          <Text style={styles.label}>Logo del Negocio (Opcional)</Text>
          <TouchableOpacity style={styles.kycButton} onPress={handleSelectBusinessLogo} disabled={loading}>
            <MaterialCommunityIcons name="image-plus" size={28} color="#C5A065" />
            <Text style={styles.kycButtonText}>Seleccionar Logo para QR</Text>
          </TouchableOpacity>
          {formData.businessLogoUri ? (
            <Image source={{ uri: formData.businessLogoUri }} style={styles.logoPreview} />
          ) : null}

          <Text style={styles.label}>Dirección Física (Opcional)</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Ej: Calle Principal 123, Apto 4B"
            value={formData.physicalAddress}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, physicalAddress: text }))
            }
            multiline
            numberOfLines={3}
            editable={!loading}
          />

          <Text style={styles.label}>Link de Calendly (Opcional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: https://calendly.com/tu-negocio"
            value={formData.calendlyLink}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, calendlyLink: text }))
            }
            editable={!loading}
          />

          <Text style={styles.label}>Escribe 20 palabras para que otros te encuentren (No se verá en tu tarjeta)</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Ej: barberia cortes estilo fades color barba grooming domicilio premium rapido"
            value={formData.elevatorPitch}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, elevatorPitch: text }))
            }
            multiline
            numberOfLines={2}
            editable={!loading}
          />
          <Text style={styles.helperText}>{`Palabras usadas: ${countWords(formData.elevatorPitch)} / 20`}</Text>

          <Text style={styles.label}>Contrato PDF (Opcional, solo .pdf)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: https://mi-negocio.com/contrato.pdf"
            value={formData.contractPdfUrl}
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, contractPdfUrl: text }))
            }
            editable={!loading}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧪 Mockup de Tarjeta (QR flotante)</Text>
          <View style={styles.mockupCard}>
            <View style={styles.floatingQrWrap}>
              <QRCode
                value={generatePermanentBusinessLink('preview-business-card', 'preview-owner')}
                size={76}
                color="#0A2540"
                backgroundColor="#FFFFFF"
                logo={formData.businessLogoUri ? { uri: formData.businessLogoUri } : undefined}
                logoSize={18}
                ecl="H"
              />
            </View>
            <Text style={styles.mockupName}>{formData.businessName || 'Nombre de Negocio'}</Text>
            <Text style={styles.mockupSub}>La tarjeta se mantiene limpia. El pitch y dirección no se muestran.</Text>
            <TouchableOpacity style={styles.exportBtnPreview}>
              <MaterialCommunityIcons name="download" size={16} color="#FFF" />
              <Text style={styles.exportBtnPreviewText}>Exportar QR 300 DPI</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.helperText}>Escala de impresión mínima garantizada: 2cm x 2cm.</Text>
        </View>

        {/* Sección de Propietario */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👤 Información del Propietario</Text>

          <Text style={styles.label}>Nombre Completo *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Juan Pérez García"
            value={formData.ownerName}
            onChangeText={(text) => setFormData((prev) => ({ ...prev, ownerName: text }))}
            editable={!loading}
          />

          <Text style={styles.label}>Email *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: juan@negocio.com"
            value={formData.ownerEmail}
            keyboardType="email-address"
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, ownerEmail: text }))
            }
            editable={!loading}
          />

          <Text style={styles.label}>Teléfono *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: +1234567890"
            value={formData.ownerPhone}
            keyboardType="phone-pad"
            onChangeText={(text) =>
              setFormData((prev) => ({ ...prev, ownerPhone: text }))
            }
            editable={!loading}
          />
        </View>

        {/* Sección KYC */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔐 Validación de Identidad (KYC)</Text>
          <Text style={styles.helperText}>
            Necesitamos una foto de tu ID (Cédula, Pasaporte o Licencia) para validar tu
            identidad.
          </Text>

          <TouchableOpacity
            style={[
              styles.kycButton,
              kycDocumentSelected && styles.kycButtonSelected,
            ]}
            onPress={handleSelectKYCDocument}
            disabled={loading}
          >
            <MaterialCommunityIcons
              name={kycDocumentSelected ? 'check-circle' : 'image-plus'}
              size={32}
              color={kycDocumentSelected ? '#2ECC71' : '#C5A065'}
            />
            <Text style={styles.kycButtonText}>
              {kycDocumentSelected ? 'Foto de ID Seleccionada ✓' : 'Subir Foto de ID'}
            </Text>
          </TouchableOpacity>

          {formData.kycDocumentUri && (
            <Image
              source={{ uri: formData.kycDocumentUri }}
              style={styles.documentPreview}
            />
          )}
        </View>

        {/* Sección Contrato Ético */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Contrato Ético</Text>

          <View style={styles.termsBox}>
            <MaterialCommunityIcons
              name="alert-circle"
              size={24}
              color="#C5A065"
              style={styles.termsIcon}
            />
            <Text style={styles.termsText}>
              Acepto que no utilizaré esta tarjeta de negocio para:
              {'\n\n'}
              • Estafas, fraudes o engaños{'\n'}
              • Contenido sexual explícito o pornografía{'\n'}
              • Violencia, sangre o contenido gore{'\n'}
              • Venta de sustancias ilegales o armas{'\n'}
              • Acoso, suplantación de identidad o abuso{'\n'}
              {'\n'}
              Incumplir esto resultará en bloqueo permanente de cuenta y reporte a
              autoridades.
            </Text>
          </View>

          <View style={styles.checkboxContainer}>
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() =>
                setFormData((prev) => ({ ...prev, acceptedTerms: !prev.acceptedTerms }))
              }
              disabled={loading}
            >
              {formData.acceptedTerms && (
                <MaterialCommunityIcons name="check" size={20} color="#FFF" />
              )}
            </TouchableOpacity>
            <Text style={styles.checkboxLabel}>
              Acepto el Contrato Ético y los Términos de Servicio *
            </Text>
          </View>
        </View>

        {/* Botón de Envío */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleCreateBusinessCard}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" size="large" />
            ) : (
              <>
                <MaterialCommunityIcons name="check-circle" size={24} color="#FFF" />
                <Text style={styles.submitButtonText}>Crear Tarjeta de Negocio</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  lockedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  lockedTitle: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '700',
    color: '#0A2540',
  },
  lockedSubtitle: {
    marginTop: 8,
    color: '#4A4A4A',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  unlockButton: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0A2540',
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  unlockButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0A2540',
  },
  section: {
    backgroundColor: '#FFF',
    marginHorizontal: 12,
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A2540',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A2540',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  multilineInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
    fontStyle: 'italic',
  },
  kycButton: {
    borderWidth: 2,
    borderColor: '#C5A065',
    borderRadius: 12,
    paddingVertical: 24,
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#F5F5F5',
  },
  kycButtonSelected: {
    borderColor: '#2ECC71',
    backgroundColor: '#F0FFF4',
  },
  kycButtonText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#0A2540',
  },
  documentPreview: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginTop: 12,
    backgroundColor: '#E0E0E0',
  },
  logoPreview: {
    width: 90,
    height: 90,
    borderRadius: 12,
    marginTop: 12,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#C5A065',
    backgroundColor: '#FFFFFF',
  },
  mockupCard: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6E9ED',
    padding: 16,
    minHeight: 180,
    justifyContent: 'center',
    shadowColor: '#0A2540',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  floatingQrWrap: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 88,
    height: 88,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 4,
  },
  mockupName: {
    marginTop: 22,
    marginLeft: 100,
    fontSize: 18,
    fontWeight: '700',
    color: '#0A2540',
  },
  mockupSub: {
    marginTop: 8,
    marginLeft: 100,
    fontSize: 12,
    color: '#4A4A4A',
    lineHeight: 17,
  },
  exportBtnPreview: {
    marginTop: 20,
    alignSelf: 'flex-end',
    backgroundColor: '#0A2540',
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  exportBtnPreviewText: {
    marginLeft: 8,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  termsBox: {
    backgroundColor: '#FFF9E6',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#C5A065',
    marginVertical: 12,
    flexDirection: 'row',
  },
  termsIcon: {
    marginRight: 12,
  },
  termsText: {
    flex: 1,
    fontSize: 12,
    color: '#333',
    lineHeight: 18,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#C5A065',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: '#F5F5F5',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    color: '#0A2540',
    fontWeight: '500',
    lineHeight: 20,
  },
  buttonContainer: {
    paddingHorizontal: 12,
    marginVertical: 12,
  },
  submitButton: {
    backgroundColor: '#0A2540',
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
});
