import { FREE_TIER_POLICY } from '@/constants/freeTierPolicy';
import { getActiveUserId } from '@/services/authSession';
import { db } from '@/services/firebaseConfig';
import { isSuperAdmin } from '@/services/roleService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { coreTrEsEn } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';

interface FeatureFlags {
  studentPackEnabled: boolean;
  businessCardEnabled: boolean;
  iconStoreEnabled: boolean;
  maintenanceMode: boolean;
}

export default function AdminConfigScreen() {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => coreTrEsEn(es, en, language);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastActive, setBroadcastActive] = useState(false);
  const [flags, setFlags] = useState<FeatureFlags>({
    studentPackEnabled: true,
    businessCardEnabled: true,
    iconStoreEnabled: true,
    maintenanceMode: false,
  });

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const uid = await getActiveUserId();
      if (!uid || !(await isSuperAdmin(uid))) {
        router.replace('/');
        return;
      }

      // Load system config from Firestore
      const configDoc = await getDoc(doc(db, 'system_config', 'main'));
      if (configDoc.exists()) {
        const data = configDoc.data();
        if (data.broadcast) {
          setBroadcastMsg(data.broadcast.message || '');
          setBroadcastActive(data.broadcast.active || false);
        }
        if (data.featureFlags) {
          setFlags({
            studentPackEnabled: data.featureFlags.studentPackEnabled ?? true,
            businessCardEnabled: data.featureFlags.businessCardEnabled ?? true,
            iconStoreEnabled: data.featureFlags.iconStoreEnabled ?? true,
            maintenanceMode: data.featureFlags.maintenanceMode ?? false,
          });
        }
      }

      setAuthorized(true);
    } catch (err) {
      console.error('[AdminConfig] init error:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveBroadcast = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'system_config', 'main'), {
        broadcast: {
          message: broadcastMsg,
          active: broadcastActive,
          updatedAt: serverTimestamp(),
        },
      }, { merge: true });
      Alert.alert(
        tr('✅ Guardado', '✅ Saved'),
        tr('Mensaje de broadcast actualizado.', 'Broadcast message updated.'),
      );
    } catch {
      Alert.alert(tr('Error', 'Error'), tr('No se pudo guardar el mensaje.', 'Could not save the message.'));
    } finally {
      setSaving(false);
    }
  };

  const saveFlags = async (newFlags: FeatureFlags) => {
    setFlags(newFlags);
    try {
      await setDoc(doc(db, 'system_config', 'main'), {
        featureFlags: {
          ...newFlags,
          updatedAt: serverTimestamp(),
        },
      }, { merge: true });
    } catch {
      Alert.alert(tr('Error', 'Error'), tr('No se pudo actualizar el flag.', 'Could not update the flag.'));
    }
  };

  const FLAG_CONFIG = useMemo(
    () =>
      [
        {
          key: 'studentPackEnabled' as const,
          label: 'Student Pack',
          desc: tr('Permite grants automáticos a emails .edu', 'Allows automatic grants to .edu emails'),
          icon: 'school' as const,
          danger: false,
        },
        {
          key: 'businessCardEnabled' as const,
          label: 'Business Cards',
          desc: tr('Permite crear tarjetas de negocio', 'Allows creating business cards'),
          icon: 'card-account-details' as const,
          danger: false,
        },
        {
          key: 'iconStoreEnabled' as const,
          label: 'Icon Store',
          desc: tr('Permite comprar packs de íconos', 'Allows buying icon packs'),
          icon: 'store' as const,
          danger: false,
        },
        {
          key: 'maintenanceMode' as const,
          label: tr('Modo Mantenimiento', 'Maintenance mode'),
          desc: tr('Bloquea acceso general a la app', 'Blocks general access to the app'),
          icon: 'wrench' as const,
          danger: true,
        },
      ] as const,
    [language],
  );

  const toggleFlag = (key: keyof FeatureFlags) => {
    if (key === 'maintenanceMode' && !flags[key]) {
      Alert.alert(
        tr('⚠️ Modo mantenimiento', '⚠️ Maintenance mode'),
        tr(
          '¿Activar modo mantenimiento? Los usuarios verán una pantalla de mantenimiento.',
          'Enable maintenance mode? Users will see a maintenance screen.',
        ),
        [
          { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
          {
            text: tr('Activar', 'Enable'),
            style: 'destructive',
            onPress: () => saveFlags({ ...flags, [key]: true }),
          },
        ]
      );
    } else {
      saveFlags({ ...flags, [key]: !flags[key] });
    }
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#C5A065" /></View>;
  }
  if (!authorized) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* HEADER */}
      <LinearGradient colors={['#1A1A2E', '#020D1A']} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#C5A065" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <MaterialCommunityIcons name="cog" size={18} color="#C5A065" />
          <Text style={styles.headerTitle}>{tr('CONFIG SIST', 'SYS CONFIG')}</Text>
        </View>
        <View style={{ width: 36 }} />
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentPad} showsVerticalScrollIndicator={false}>

        {/* ── FREE TIER LIMITS (read-only) ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="lock-outline" size={16} color="#E9C349" />
            <Text style={styles.cardTitle}>{tr('Límites Free Tier', 'Free tier limits')}</Text>
            <View style={styles.readOnlyBadge}>
              <Text style={styles.readOnlyText}>{tr('Sólo código', 'Code only')}</Text>
            </View>
          </View>
          <Text style={styles.cardNote}>
            {tr('Para cambiar estos valores edita', 'To change these values, edit')}{' '}
            <Text style={styles.codeRef}>constants/freeTierPolicy.ts</Text>
            {tr(' y redeploya.', ' and redeploy.')}
          </Text>
          <View style={styles.limitRow}>
            <View style={styles.limitBox}>
              <MaterialCommunityIcons name="cards" size={20} color="#E9C349" />
              <Text style={styles.limitValue}>{FREE_TIER_POLICY.cards}</Text>
              <Text style={styles.limitLabel}>{tr('Tarjetas sociales', 'Social cards')}</Text>
            </View>
            <View style={styles.limitBox}>
              <MaterialCommunityIcons name="database" size={20} color="#E9C349" />
              <Text style={styles.limitValue}>{FREE_TIER_POLICY.vaultItems}</Text>
              <Text style={styles.limitLabel}>{tr('Items en Búnker', 'Bunker items')}</Text>
            </View>
          </View>
        </View>

        {/* ── BROADCAST MESSAGE ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="bullhorn" size={16} color="#E67E22" />
            <Text style={styles.cardTitle}>{tr('Mensaje de Broadcast', 'Broadcast message')}</Text>
          </View>
          <Text style={styles.cardNote}>
            {tr('Aparecerá como banner en la app para todos los usuarios activos.', 'Shown as a banner in the app for all active users.')}
          </Text>
          <View style={styles.activeRow}>
            <Text style={styles.activeLabel}>{tr('Mostrar mensaje', 'Show message')}</Text>
            <Switch
              value={broadcastActive}
              onValueChange={(v) => setBroadcastActive(v)}
              trackColor={{ false: '#E0E0E0', true: '#C5A065' }}
              thumbColor="#FFF"
            />
          </View>
          <TextInput
            style={[styles.textInput, !broadcastActive && styles.textInputDisabled]}
            value={broadcastMsg}
            onChangeText={setBroadcastMsg}
            placeholder={tr('Ej: Mantenimiento programado el viernes...', 'E.g. Scheduled maintenance Friday...')}
            placeholderTextColor="#BBB"
            multiline
            numberOfLines={3}
            editable={broadcastActive}
            maxLength={280}
          />
          <Text style={styles.charCount}>{broadcastMsg.length}/280</Text>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={saveBroadcast}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Text style={styles.saveBtnText}>{tr('Guardar Broadcast', 'Save broadcast')}</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── FEATURE FLAGS ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="toggle-switch" size={16} color="#9B59B6" />
            <Text style={styles.cardTitle}>{tr('Feature Flags', 'Feature flags')}</Text>
          </View>
          <Text style={styles.cardNote}>
            {tr('Los cambios se aplican en tiempo real sin redeploy.', 'Changes apply in real time without redeploy.')}
          </Text>
          {FLAG_CONFIG.map(flag => (
            <View key={flag.key} style={[styles.flagRow, flag.danger && styles.flagRowDanger]}>
              <View style={[styles.flagIcon, flag.danger && styles.flagIconDanger]}>
                <MaterialCommunityIcons name={flag.icon as any} size={18} color={flag.danger ? '#E74C3C' : '#9B59B6'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.flagLabel, flag.danger && styles.flagLabelDanger]}>{flag.label}</Text>
                <Text style={styles.flagDesc}>{flag.desc}</Text>
              </View>
              <Switch
                value={flags[flag.key]}
                onValueChange={() => toggleFlag(flag.key)}
                trackColor={{ false: '#E0E0E0', true: flag.danger ? '#E74C3C' : '#9B59B6' }}
                thumbColor="#FFF"
              />
            </View>
          ))}
        </View>

        {/* ── DANGER ZONE ── */}
        <View style={[styles.card, styles.dangerCard]}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="alert-octagon" size={16} color="#E74C3C" />
            <Text style={[styles.cardTitle, { color: '#E74C3C' }]}>{tr('Zona de Peligro', 'Danger zone')}</Text>
          </View>
          <Text style={styles.dangerNote}>
            {tr(
              'Las siguientes acciones son irreversibles. Para operaciones destructivas usa la consola de Firebase directamente.',
              'The following actions are irreversible. For destructive operations use the Firebase console directly.',
            )}
          </Text>
          <View style={styles.dangerLinks}>
            {[
              { es: 'Consola Firebase', en: 'Firebase Console', icon: 'firebase' as const },
              { es: 'Azure Portal', en: 'Azure Portal', icon: 'microsoft-azure' as const },
              { es: 'Expo Dashboard', en: 'Expo Dashboard', icon: 'cellphone-arrow-down' as const },
            ].map(link => (
              <View key={link.en} style={styles.dangerLink}>
                <MaterialCommunityIcons name={link.icon as any} size={16} color="#E74C3C" />
                <Text style={styles.dangerLinkText}>{tr(link.es, link.en)}</Text>
                <MaterialCommunityIcons name="open-in-new" size={13} color="#E74C3C" />
              </View>
            ))}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#020D1A' },
  loadingContainer: { flex: 1, backgroundColor: '#020D1A', justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(197,160,101,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: '#C5A065', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  content: { flex: 1, backgroundColor: '#F5F7FA' },
  contentPad: { padding: 16, paddingBottom: 40, gap: 14 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    gap: 12,
  },
  dangerCard: { borderColor: 'rgba(231,76,60,0.3)', backgroundColor: '#FFF8F8' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#0A2540', flex: 1 },
  cardNote: { fontSize: 12, color: '#888', lineHeight: 17 },
  readOnlyBadge: { backgroundColor: '#F0F0F0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  readOnlyText: { fontSize: 10, fontWeight: '600', color: '#999' },
  codeRef: { fontFamily: 'monospace', color: '#E9C349', fontWeight: '700' },
  limitRow: { flexDirection: 'row', gap: 12 },
  limitBox: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  limitValue: { fontSize: 28, fontWeight: '900', color: '#0A2540' },
  limitLabel: { fontSize: 11, color: '#888', textAlign: 'center' },
  activeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activeLabel: { fontSize: 13, fontWeight: '600', color: '#0A2540' },
  textInput: {
    backgroundColor: '#F5F7FA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E6EF',
    padding: 12,
    fontSize: 13,
    color: '#0A2540',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  textInputDisabled: { opacity: 0.4 },
  charCount: { fontSize: 11, color: '#BBB', textAlign: 'right' },
  saveBtn: {
    backgroundColor: '#C5A065',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  flagRowDanger: { borderTopColor: 'rgba(231,76,60,0.15)' },
  flagIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(155,89,182,0.1)', justifyContent: 'center', alignItems: 'center' },
  flagIconDanger: { backgroundColor: 'rgba(231,76,60,0.08)' },
  flagLabel: { fontSize: 13, fontWeight: '600', color: '#0A2540' },
  flagLabelDanger: { color: '#E74C3C' },
  flagDesc: { fontSize: 11, color: '#999', marginTop: 2 },
  dangerNote: { fontSize: 12, color: '#E74C3C', lineHeight: 17 },
  dangerLinks: { gap: 8 },
  dangerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(231,76,60,0.06)',
    borderRadius: 8,
    padding: 12,
  },
  dangerLinkText: { flex: 1, fontSize: 13, color: '#E74C3C', fontWeight: '600' },
});
