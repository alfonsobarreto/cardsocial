import { getActiveUserId } from '@/services/authSession';
import {
  createBusinessCard,
  normalizeBusinessKeywords,
  updateBusinessCard,
  updateBusinessCardPermanentLink,
} from '@/services/businessCardService';
import { useLanguage } from '@/services/language';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { db } from '@/services/firebaseConfig';

const KEYWORD_MAX = 20;

function parseKeywordsInput(raw: string): string[] {
  return normalizeBusinessKeywords(String(raw || '').split(',').map((value) => value.trim()));
}

type ExistingBusinessCard = {
  id: string;
  businessName?: string;
  physicalAddress?: string;
  mapsLink?: string;
  calendlyLink?: string;
  businessLogo?: string;
  elevatorPitchWords?: string[];
  permanent_business_link?: string;
  nextQrUpdateAllowedAt?: string;
};

export default function CreateBusinessCardScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const tr = (es: string, en: string) => (language === 'en' ? en : es);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ownerUid, setOwnerUid] = useState('');
  const [existingCard, setExistingCard] = useState<ExistingBusinessCard | null>(null);

  const [businessName, setBusinessName] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [mapsLink, setMapsLink] = useState('');
  const [calendlyLink, setCalendlyLink] = useState('');
  const [businessLogo, setBusinessLogo] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
  const [permanentLink, setPermanentLink] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const parsedKeywords = useMemo(() => parseKeywordsInput(keywordsInput), [keywordsInput]);
  const keywordsCount = parsedKeywords.length;
  const isEditing = Boolean(existingCard);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const uid = await getActiveUserId();
        if (!uid) {
          Alert.alert(tr('Error', 'Error'), tr('No se pudo validar tu sesión.', 'Could not validate your session.'));
          router.back();
          return;
        }
        if (cancelled) return;
        setOwnerUid(uid);

        const snap = await getDocs(
          query(
            collection(db, 'businessCards'),
            where('ownerUid', '==', uid),
            where('type', '==', 'business'),
          ),
        );

        if (!cancelled && !snap.empty) {
          const card = snap.docs[0].data() as ExistingBusinessCard;
          setExistingCard(card);
          setBusinessName(String(card.businessName || ''));
          setPhysicalAddress(String(card.physicalAddress || ''));
          setMapsLink(String(card.mapsLink || ''));
          setCalendlyLink(String(card.calendlyLink || ''));
          setBusinessLogo(String(card.businessLogo || ''));
          setPermanentLink(String(card.permanent_business_link || ''));
          setKeywordsInput(String((card.elevatorPitchWords || []).join(', ')));
          setTermsAccepted(true);
        }
      } catch (error: any) {
        Alert.alert(tr('Error', 'Error'), error?.message || tr('No se pudo cargar el módulo.', 'Could not load the module.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router, tr]);

  const canSubmit =
    ownerUid.length > 0 &&
    businessName.trim().length >= 2 &&
    physicalAddress.trim().length >= 8 &&
    parsedKeywords.length > 0 &&
    parsedKeywords.length <= KEYWORD_MAX &&
    termsAccepted;

  const submitBusinessCard = async () => {
    if (!canSubmit) {
      Alert.alert(
        tr('Faltan datos', 'Missing data'),
        tr('Completa todos los campos obligatorios y acepta términos.', 'Complete required fields and accept terms.'),
      );
      return;
    }
    setSaving(true);
    try {
      if (!isEditing) {
        const result = await createBusinessCard({
          ownerUid,
          businessName: businessName.trim(),
          ownerName: tr('Dueño del negocio', 'Business owner'),
          ownerEmail: '',
          ownerPhone: '',
          physicalAddress: physicalAddress.trim(),
          calendlyLink: calendlyLink.trim(),
          elevatorPitchWords: parsedKeywords,
          keywords: parsedKeywords,
          permanent_business_link: permanentLink.trim(),
          mapsLink: mapsLink.trim(),
          businessLogo: businessLogo.trim(),
          kycDocumentUrl: '',
          kycTermsAccepted: true,
        });
        if (!result.success) {
          Alert.alert(tr('No se pudo crear', 'Could not create'), result.message);
          return;
        }
        Alert.alert(tr('Business Card creada', 'Business Card created'), result.message);
      } else if (existingCard) {
        const result = await updateBusinessCard({
          cardId: existingCard.id,
          ownerUid,
          businessName: businessName.trim(),
          physicalAddress: physicalAddress.trim(),
          calendlyLink: calendlyLink.trim(),
          elevatorPitchWords: parsedKeywords,
          mapsLink: mapsLink.trim(),
          businessLogo: businessLogo.trim(),
          kycTermsAccepted: true,
        });
        if (!result.success) {
          Alert.alert(tr('No se pudo actualizar', 'Could not update'), result.message);
          return;
        }
        if (permanentLink.trim() && permanentLink.trim() !== String(existingCard.permanent_business_link || '').trim()) {
          const qrUpdate = await updateBusinessCardPermanentLink({
            cardId: existingCard.id,
            ownerUid,
            permanentBusinessLink: permanentLink.trim(),
          });
          if (!qrUpdate.success) {
            Alert.alert(tr('Link QR no actualizado', 'QR link not updated'), qrUpdate.message);
          }
        }
        Alert.alert(tr('Business Card actualizada', 'Business Card updated'), result.message);
      }
      router.back();
    } catch (error: any) {
      Alert.alert(tr('Error', 'Error'), error?.message || tr('No se pudo guardar.', 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0A2540" />
        <Text style={styles.centeredText}>{tr('Cargando módulo Business Card...', 'Loading Business Card module...')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name="briefcase-check-outline" size={28} color="#0A2540" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{tr(isEditing ? 'Editar Business Card' : 'Crear Business Card', isEditing ? 'Edit Business Card' : 'Create Business Card')}</Text>
          <Text style={styles.subtitle}>
            {tr('Todo campo nuevo debe ser claro, privado y seguro.', 'Every new field must stay clear, private and secure.')}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{tr('Nombre del negocio *', 'Business name *')}</Text>
        <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} placeholder={tr('Ej: Ana Beauty Studio', 'Ex: Ana Beauty Studio')} />

        <Text style={styles.label}>{tr('Dirección exacta (privada) *', 'Exact address (private) *')}</Text>
        <TextInput style={styles.input} value={physicalAddress} onChangeText={setPhysicalAddress} placeholder={tr('Solo se usará para distancia/sector público', 'Used only for public distance/area')} />

        <Text style={styles.helper}>
          {tr('Privacidad: nunca mostramos calle/casa por defecto en Social Market.', 'Privacy: street/house is never shown by default in Social Market.')}
        </Text>

        <Text style={styles.label}>{tr('Google Maps link (opcional)', 'Google Maps link (optional)')}</Text>
        <TextInput style={styles.input} value={mapsLink} onChangeText={setMapsLink} placeholder="https://maps.google.com/..." />

        <Text style={styles.label}>{tr('Calendly link (opcional)', 'Calendly link (optional)')}</Text>
        <TextInput style={styles.input} value={calendlyLink} onChangeText={setCalendlyLink} placeholder="https://calendly.com/..." />

        <Text style={styles.label}>{tr('Logo URL (opcional)', 'Logo URL (optional)')}</Text>
        <TextInput style={styles.input} value={businessLogo} onChangeText={setBusinessLogo} placeholder={tr('URL del logo cuadrado', 'Square logo URL')} />

        <Text style={styles.label}>{tr('Keywords invisibles (máx 20) *', 'Invisible keywords (max 20) *')}</Text>
        <TextInput
          style={[styles.input, styles.multiInput]}
          multiline
          value={keywordsInput}
          onChangeText={setKeywordsInput}
          placeholder={tr('nails, salon, manicure, beauty', 'nails, salon, manicure, beauty')}
        />
        <Text style={styles.helper}>
          {tr(`Keywords: ${keywordsCount}/${KEYWORD_MAX} (separadas por coma).`, `Keywords: ${keywordsCount}/${KEYWORD_MAX} (comma separated).`)}
        </Text>

        <Text style={styles.label}>{tr('Link QR permanente', 'Permanent QR link')}</Text>
        <TextInput
          style={styles.input}
          value={permanentLink}
          onChangeText={setPermanentLink}
          placeholder={tr('card-social://business/...', 'card-social://business/...')}
        />
        <Text style={styles.helper}>
          {tr('Regla QR: actualización permitida cada 30 días.', 'QR rule: update is allowed every 30 days.')}
        </Text>

        <View style={styles.termsRow}>
          <Switch value={termsAccepted} onValueChange={setTermsAccepted} />
          <Text style={styles.termsText}>
            {tr(
              'Acepto T&C (prohibido contenido explícito, apuestas, odio, fraude, etc.).',
              'I accept T&C (explicit content, gambling, hate, fraud, etc. is prohibited).',
            )}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={submitBusinessCard}
          disabled={!canSubmit || saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>
              {tr(isEditing ? 'Guardar Business Card' : 'Crear Business Card', isEditing ? 'Save Business Card' : 'Create Business Card')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 36,
    gap: 14,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
  },
  centeredText: {
    color: '#0A2540',
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: '#0A2540',
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    color: '#486273',
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE7EF',
    padding: 14,
    gap: 8,
  },
  label: {
    color: '#0A2540',
    fontWeight: '700',
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CFE0EB',
    borderRadius: 10,
    backgroundColor: '#FDFEFE',
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: '#0A2540',
  },
  multiInput: {
    minHeight: 82,
    textAlignVertical: 'top',
  },
  helper: {
    color: '#587386',
    fontSize: 11,
    marginTop: -2,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  termsText: {
    flex: 1,
    color: '#1E425B',
    fontSize: 12,
    fontWeight: '600',
  },
  submitBtn: {
    marginTop: 10,
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: '#0A2540',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
