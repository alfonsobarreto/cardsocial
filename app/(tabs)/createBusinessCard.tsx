import { db } from '@/services/firebaseConfig';
import { getActiveUserId } from '@/services/authSession';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import {
  createBusinessCard,
  updateBusinessCardMarketVisibility,
} from '@/services/businessCardService';
import {
  activateOrRenewBusinessLicense,
  hasActiveBusinessLicense,
} from '@/services/businessLicenseService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type VaultLinkRow = { id: string; title: string; type: string };

export default function CreateBusinessCardScreen() {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => (language === 'en' ? en : es);
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';

  const [links, setLinks] = useState<VaultLinkRow[]>([]);
  const [selectedVaultLinkIds, setSelectedVaultLinkIds] = useState<Set<string>>(new Set());
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [calendlyLink, setCalendlyLink] = useState('');
  const [permanentLink, setPermanentLink] = useState('');
  const [mapsLink, setMapsLink] = useState('');
  const [keywords, setKeywords] = useState('');
  const [kycTermsAccepted, setKycTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdCardId, setCreatedCardId] = useState<string | null>(null);
  const [marketVisible, setMarketVisible] = useState(false);
  const [licenseActive, setLicenseActive] = useState(false);
  const [activatingLicense, setActivatingLicense] = useState(false);

  useEffect(() => {
    void loadLinks();
  }, []);

  useEffect(() => {
    if (!createdCardId) return;
    void (async () => {
      const uid = await getActiveUserId();
      if (!uid) return;
      try {
        const snap = await getDoc(doc(db, 'businessCards', createdCardId));
        if (snap.exists()) {
          const d = snap.data() as { isPublishedToMarket?: boolean };
          setMarketVisible(Boolean(d.isPublishedToMarket));
        }
      } catch {
        /* ignore */
      }
      setLicenseActive(await hasActiveBusinessLicense(uid, createdCardId));
    })();
  }, [createdCardId]);

  const loadLinks = async () => {
    const uid = await getActiveUserId();
    if (!uid) return;
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'links'));
      setLinks(
        snap.docs.map((d) => {
          const row = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            title: row.title != null ? String(row.title) : d.id,
            type: row.type != null ? String(row.type) : '',
          };
        }),
      );
    } catch {
      setLinks([]);
    }
  };

  const toggleLink = (id: string) => {
    setSelectedVaultLinkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const parseKeywords = () =>
    keywords
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

  const handleCreate = async () => {
    const uid = await getActiveUserId();
    if (!uid) {
      Alert.alert(tr('Sesión', 'Session'), tr('Inicia sesión de nuevo.', 'Please sign in again.'));
      return;
    }
    if (!businessName.trim() || !ownerName.trim() || !ownerEmail.trim() || !ownerPhone.trim() || !physicalAddress.trim()) {
      Alert.alert(
        tr('Datos incompletos', 'Missing fields'),
        tr('Completa negocio, nombre, email, teléfono y dirección.', 'Fill business, name, email, phone and address.'),
      );
      return;
    }
    if (!kycTermsAccepted) {
      Alert.alert(tr('KYC', 'KYC'), tr('Debes aceptar los términos KYC.', 'You must accept KYC terms.'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await createBusinessCard({
        ownerUid: uid,
        vaultLinkIds: [...selectedVaultLinkIds],
        businessName: businessName.trim(),
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        ownerPhone: ownerPhone.trim(),
        physicalAddress: physicalAddress.trim(),
        calendlyLink: calendlyLink.trim(),
        permanent_business_link: permanentLink.trim(),
        mapsLink: mapsLink.trim(),
        keywords: parseKeywords(),
        kycDocumentUrl: '',
        kycTermsAccepted: true,
      });
      if (res.success && res.cardId) {
        setCreatedCardId(res.cardId);
        setMarketVisible(false);
        Alert.alert(tr('Listo', 'Done'), res.message);
      } else {
        Alert.alert(tr('Error', 'Error'), res.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLicense = async () => {
    const uid = await getActiveUserId();
    if (!uid || !createdCardId) return;
    setActivatingLicense(true);
    try {
      await activateOrRenewBusinessLicense({
        userId: uid,
        cardId: createdCardId,
        annualPriceUsd: 99,
        cashbackCreditsGranted: 0,
      });
      setLicenseActive(await hasActiveBusinessLicense(uid, createdCardId));
      Alert.alert(
        tr('Licencia activa', 'License active'),
        tr('Puedes activar la visibilidad en SocialMarket.', 'You can enable SocialMarket visibility.'),
      );
    } finally {
      setActivatingLicense(false);
    }
  };

  const onToggleMarket = async (value: boolean) => {
    const uid = await getActiveUserId();
    if (!uid || !createdCardId) return;
    const licensed = await hasActiveBusinessLicense(uid, createdCardId);
    if (!licensed) {
      Alert.alert(
        tr('Licencia requerida', 'License required'),
        tr('Se necesita licencia anual activa para este UUID.', 'An active annual license is required for this card UUID.'),
      );
      return;
    }
    const r = await updateBusinessCardMarketVisibility(uid, createdCardId, value);
    if (r.success) {
      setMarketVisible(value);
    } else {
      Alert.alert(tr('Error', 'Error'), r.message);
    }
  };

  const bg = isNight ? '#071828' : '#F5F9FF';
  const card = isNight ? '#0D2035' : '#FFFFFF';
  const text = isNight ? '#F0F4F8' : '#002D4B';
  const sub = isNight ? '#87A9C2' : '#5A7A8A';
  const border = '#D4AF37';
  const inputBg = isNight ? '#0A2540' : '#E8F4FC';

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <MaterialCommunityIcons name="card-account-details-outline" size={40} color={border} />
          <Text style={[styles.title, { color: text }]}>{tr('Tarjeta de negocio', 'Business card')}</Text>
          <Text style={[styles.sub, { color: sub }]}>
            {tr(
              'Nuevo UUID al guardar. Opcional: enlaces desde users/{uid}/links.',
              'New UUID on save. Optional: links from your vault.',
            )}
          </Text>
        </View>

        <View style={[styles.cardBlock, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.label, { color: text }]}>{tr('Nombre del negocio', 'Business name')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: text, borderColor: border }]}
            value={businessName}
            onChangeText={setBusinessName}
            placeholder={tr('Mi empresa', 'My company')}
            placeholderTextColor={sub}
          />

          <Text style={[styles.label, { color: text, marginTop: 12 }]}>{tr('Tu nombre', 'Your name')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: text, borderColor: border }]}
            value={ownerName}
            onChangeText={setOwnerName}
            placeholder={tr('Nombre completo', 'Full name')}
            placeholderTextColor={sub}
          />

          <Text style={[styles.label, { color: text, marginTop: 12 }]}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: text, borderColor: border }]}
            value={ownerEmail}
            onChangeText={setOwnerEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="email@ejemplo.com"
            placeholderTextColor={sub}
          />

          <Text style={[styles.label, { color: text, marginTop: 12 }]}>{tr('Teléfono', 'Phone')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: text, borderColor: border }]}
            value={ownerPhone}
            onChangeText={setOwnerPhone}
            keyboardType="phone-pad"
            placeholder="+1 …"
            placeholderTextColor={sub}
          />

          <Text style={[styles.label, { color: text, marginTop: 12 }]}>{tr('Dirección física', 'Physical address')}</Text>
          <TextInput
            style={[styles.input, styles.multiline, { backgroundColor: inputBg, color: text, borderColor: border }]}
            value={physicalAddress}
            onChangeText={setPhysicalAddress}
            multiline
            placeholder={tr('Calle, ciudad, CP', 'Street, city, postal')}
            placeholderTextColor={sub}
          />

          <Text style={[styles.label, { color: text, marginTop: 12 }]}>Calendly</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: text, borderColor: border }]}
            value={calendlyLink}
            onChangeText={setCalendlyLink}
            autoCapitalize="none"
            placeholder="https://"
            placeholderTextColor={sub}
          />

          <Text style={[styles.label, { color: text, marginTop: 12 }]}>{tr('Link permanente', 'Permanent link')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: text, borderColor: border }]}
            value={permanentLink}
            onChangeText={setPermanentLink}
            autoCapitalize="none"
            placeholder="https://"
            placeholderTextColor={sub}
          />

          <Text style={[styles.label, { color: text, marginTop: 12 }]}>Google Maps</Text>
          <TextInput
            style={[styles.input, { backgroundColor: inputBg, color: text, borderColor: border }]}
            value={mapsLink}
            onChangeText={setMapsLink}
            autoCapitalize="none"
            placeholder="https://maps…"
            placeholderTextColor={sub}
          />

          <Text style={[styles.label, { color: text, marginTop: 12 }]}>{tr('Palabras clave (coma)', 'Keywords (comma)')}</Text>
          <TextInput
            style={[styles.input, styles.multiline, { backgroundColor: inputBg, color: text, borderColor: border }]}
            value={keywords}
            onChangeText={setKeywords}
            multiline
            placeholder={tr('consultoría, logística…', 'consulting, logistics…')}
            placeholderTextColor={sub}
          />
        </View>

        <View style={[styles.cardBlock, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.label, { color: text }]}>{tr('Enlaces de la bóveda', 'Vault links')}</Text>
          <Text style={[styles.sub, { color: sub, marginBottom: 10 }]}>
            {tr('Selecciona filas de users/{uid}/links para vaultLinkIds.', 'Pick rows from your links collection.')}
          </Text>
          {links.length === 0 ? (
            <Text style={{ color: sub }}>{tr('Sin enlaces en la nube.', 'No cloud links yet.')}</Text>
          ) : (
            links.map((l) => {
              const on = selectedVaultLinkIds.has(l.id);
              return (
                <TouchableOpacity
                  key={l.id}
                  style={[styles.linkRow, { borderColor: border, backgroundColor: on ? inputBg : 'transparent' }]}
                  onPress={() => toggleLink(l.id)}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={border} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: text, fontWeight: '600' }} numberOfLines={1}>
                      {l.title}
                    </Text>
                    {l.type ? <Text style={{ color: sub, fontSize: 12 }}>{l.type}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <TouchableOpacity
          style={[styles.kycRow, { borderColor: border }]}
          onPress={() => setKycTermsAccepted(!kycTermsAccepted)}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name={kycTermsAccepted ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={24}
            color={border}
          />
          <Text style={[styles.kycText, { color: text }]}>
            {tr(
              'Acepto el envío de documentación KYC cuando esté disponible en la app.',
              'I accept KYC documentation flow when available in the app.',
            )}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: border, opacity: submitting ? 0.6 : 1 }]}
          onPress={() => void handleCreate()}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#0A1A2F" />
          ) : (
            <Text style={styles.primaryBtnText}>{tr('Crear tarjeta', 'Create card')}</Text>
          )}
        </TouchableOpacity>

        {createdCardId ? (
          <View style={[styles.cardBlock, { backgroundColor: card, borderColor: border, marginTop: 20 }]}>
            <Text style={[styles.label, { color: sub }]}>UUID</Text>
            <Text selectable style={[styles.uuid, { color: text }]}>
              {createdCardId}
            </Text>

            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.label, { color: text }]}>{tr('Visibilidad en SocialMarket', 'SocialMarket visibility')}</Text>
                <Text style={[styles.sub, { color: sub, marginTop: 4 }]}>
                  {licenseActive
                    ? tr('Licencia anual activa para este UUID.', 'Annual license active for this UUID.')
                    : tr('Requiere licencia anual activa (mismo UUID).', 'Requires active annual license (same UUID).')}
                </Text>
              </View>
              <Switch
                value={marketVisible}
                onValueChange={(v) => void onToggleMarket(v)}
                disabled={!licenseActive}
              />
            </View>

            {!licenseActive ? (
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: border, opacity: activatingLicense ? 0.6 : 1 }]}
                onPress={() => void handleDemoLicense()}
                disabled={activatingLicense}
              >
                <Text style={[styles.secondaryBtnText, { color: text }]}>
                  {tr('Simular licencia anual (desarrollo)', 'Simulate annual license (dev)')}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 48 },
  hero: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', marginTop: 10 },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  cardBlock: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  kycRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  kycText: { flex: 1, fontSize: 14, lineHeight: 20, marginLeft: 10 },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { fontWeight: '800', color: '#0A1A2F', fontSize: 16 },
  uuid: { fontSize: 13, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  secondaryBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryBtnText: { fontWeight: '700', fontSize: 14 },
});
