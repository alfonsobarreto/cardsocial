import { ConfettiAnimation, ConfettiAnimationRef } from '@/components/ConfettiAnimation';
import { CreditsIndicator } from '@/components/CreditsIndicator';
import IconStore from '@/components/IconStore';
import LanguageToggle from '@/components/LanguageToggle';
import Subscription from '@/components/Subscription';
import ThemeChest from '@/components/ThemeChest';
import { getActiveUserId } from '@/services/authSession';
import { clearLocalCachesForSignOut } from '@/services/userScopedStorage';
import { auth, db } from '@/services/firebaseConfig';
import { requestLocationPermission } from '@/services/geolocationService';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { listBlockedRelations, unblockRelationship } from '@/services/qrApi';
import {
  type RelationshipEntry,
  type RelationshipStatus,
  listRelationshipsByStatus,
  removeRelationship as removeRelEntry
} from '@/services/relationshipService';
import { isSuperAdmin } from '@/services/roleService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { CreditCard, Database, Phone, PlayCircle, Search, Users } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

type BlockedUser = {
  uid: string;
  name: string;
  photoUrl: string | null;
  createdAt: string | null;
};

type EditableProfile = {
  uid: string;
  fullName: string;
  firstName: string;
  lastName: string;
  nickname: string;
  nicknameLower: string;
  email: string;
  phone: string;
  lastNicknameChange: string | null;
};

export default function TabLayout({ children }: { children: React.ReactNode }) {
  const { mode, resolvedMode, setMode, autoStatusText } = useLookMode();
  const { language } = useLanguage();
  const tr = (es: string, en: string) => (language === 'en' ? en : es);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activePanel, setActivePanel] = useState<'menu' | 'profile' | 'terms' | 'policy' | 'about' | 'privacy' | 'subscription' | 'icon_store' | 'blocked_users' | 'theme_chest'>('menu');
  const [creditsRefreshTrigger, setCreditsRefreshTrigger] = useState(0);
  const [welcomeBonusApplied, setWelcomeBonusApplied] = useState(false);
  const [userIsSuperAdmin, setUserIsSuperAdmin] = useState(false);
  const [adminPendingReports, setAdminPendingReports] = useState(0);
  const [adminTotalUsers, setAdminTotalUsers] = useState<number | null>(null);
  const [adminTodayRevenue, setAdminTodayRevenue] = useState<number | null>(null);
  const confettiRef = useRef<ConfettiAnimationRef>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  type RelTab = 'muted' | 'restricted' | 'blocked';
  const [relTab, setRelTab] = useState<RelTab>('blocked');
  const [relEntries, setRelEntries] = useState<RelationshipEntry[]>([]);
  const [loadingRel, setLoadingRel] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileData, setProfileData] = useState<EditableProfile | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const router = useRouter();

  const panelTitle = useMemo(() => {
    if (activePanel === 'profile') return tr('Perfil', 'Profile');
    if (activePanel === 'terms') return tr('Términos y Condiciones', 'Terms & Conditions');
    if (activePanel === 'policy') return tr('Política de Uso', 'Usage Policy');
    if (activePanel === 'about') return tr('Acerca de Card-Social', 'About Card-Social');
    if (activePanel === 'privacy') return tr('Privacidad', 'Privacy');
    if (activePanel === 'subscription') return tr('Suscripción', 'Subscription');
    if (activePanel === 'icon_store') return `🎨 ${tr('Estudio de Tarjetas', 'Card Studio')}`;
    if (activePanel === 'theme_chest') return tr('🔒 Locker de Estilos', '🔒 Theme Locker');
    if (activePanel === 'blocked_users') return tr('Gestión de Relaciones', 'Relationship Manager');
    return tr('Menú', 'Menu');
  }, [activePanel, language]);

  const legalContent = useMemo(() => {
    if (activePanel === 'terms') {
      return [
        tr('Card-Social funciona como una bóveda digital para compartir acceso, no para exponer datos sensibles.', 'Card-Social works as a digital vault to share access, not to expose sensitive data.'),
        tr('Si un usuario decide abrir enlaces externos (wa.me, mailto, etc.), acepta que su información puede quedar visible fuera del ecosistema protegido.', 'If a user opens external links (wa.me, mailto, etc.), they accept their information may be visible outside the protected ecosystem.'),
        tr('El uso de llamadas y herramientas de contacto está prohibido para acoso, spam, fraude o suplantación de identidad.', 'Using calls and contact tools for harassment, spam, fraud, or identity theft is prohibited.'),
        tr('Card-Social puede suspender cuentas con comportamiento abusivo y aplicar bloqueo permanente de dispositivo en casos graves.', 'Card-Social may suspend accounts with abusive behavior and apply permanent device blocks in severe cases.'),
      ];
    }

    if (activePanel === 'policy') {
      return [
        tr('Todo archivo o selfie pasa por validación de seguridad con IA antes de guardarse en la nube.', 'Every file or selfie goes through AI security validation before being saved to the cloud.'),
        tr('Está prohibido subir contenido sexual explícito, gore, violencia extrema o material ilegal.', 'Uploading explicit sexual content, gore, extreme violence, or illegal material is prohibited.'),
        tr('Intentos repetidos de contenido prohibido activan controles de seguridad, incluyendo bloqueo temporal de reintentos.', 'Repeated attempts with prohibited content trigger security controls, including temporary retry blocks.'),
        tr('El sistema puede rechazar contenido que no cumpla estándares de seguridad y confianza de la comunidad.', 'The system may reject content that does not meet community security and trust standards.'),
      ];
    }

    if (activePanel === 'about') {
      return [
        tr('Card-Social nació para devolver al usuario el control total de su información personal y profesional.', 'Card-Social was born to give users full control of their personal and professional information.'),
        tr('Nuestra misión es reemplazar el intercambio inseguro de datos por accesos inteligentes, verificados y actualizados en tiempo real.', 'Our mission is to replace insecure data exchange with smart, verified, real-time access.'),
        tr('Confianza, elegancia y simplicidad: esa es la base del diseño y de toda la experiencia de producto.', 'Trust, elegance, and simplicity: that is the foundation of the design and the entire product experience.'),
      ];
    }

    return [];
  }, [activePanel, language]);

  const handleSignOut = async () => {
    try {
      const signingOutUid = auth.currentUser?.uid ?? null;
      // Limpieza de memoria: elimina el flag de bloqueo biométrico y otras claves sensibles
      try {
        await AsyncStorage.removeItem('@app_lock_enabled');
        // Ejemplo: await AsyncStorage.removeItem('OTRA_CLAVE_SENSIBLE');
      } catch {}
      await clearLocalCachesForSignOut(signingOutUid);
      await signOut(auth);
    } catch {
      // Keep UX smooth even if session was already anonymous or expired.
    } finally {
      setDrawerVisible(false);
      setActivePanel('menu');
      router.replace('/');
    }
  };

  const handleSelectAutoMode = async () => {
    if (mode !== 'auto') {
      const granted = await requestLocationPermission();
      if (!granted) {
        Alert.alert(
          tr('Permiso de GPS no otorgado', 'GPS permission not granted'),
          tr('Auto seguirá funcionando con precisión limitada (sin ubicación exacta).', 'Auto will keep working with limited precision (no exact location).')
        );
      }
    }
    setMode('auto');
  };

  const loadBlockedUsers = async () => {
    try {
      setLoadingBlocked(true);
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        setBlockedUsers([]);
        return;
      }

      const response = await listBlockedRelations({ ownerUid });
      setBlockedUsers(
        response.blockedUsers.map((row) => ({
          uid: row.uid,
          name: row.name,
          photoUrl: row.photoUrl,
          createdAt: row.createdAt,
        }))
      );
    } catch {
      setBlockedUsers([]);
    } finally {
      setLoadingBlocked(false);
    }
  };

  const loadRelEntries = async (tab: RelTab = relTab) => {
    try {
      setLoadingRel(true);
      const ownerUid = await getActiveUserId();
      if (!ownerUid) { setRelEntries([]); return; }
      const entries = await listRelationshipsByStatus(ownerUid, tab as RelationshipStatus);
      setRelEntries(entries);
    } catch {
      setRelEntries([]);
    } finally {
      setLoadingRel(false);
    }
  };

  const handleRelRemove = async (entry: RelationshipEntry) => {
    Alert.alert(
      tr('Restaurar usuario', 'Restore user'),
      tr(
        `¿Quitar a ${entry.name} de ${entry.status === 'muted' ? 'silenciados' : entry.status === 'restricted' ? 'restringidos' : 'bloqueados'}?`,
        `Remove ${entry.name} from ${entry.status}?`
      ),
      [
        { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        {
          text: tr('Restaurar', 'Restore'),
          style: 'destructive',
          onPress: async () => {
            try {
              const ownerUid = await getActiveUserId();
              if (!ownerUid) return;
              await removeRelEntry(ownerUid, entry.uid, entry.status);
              setRelEntries((prev) => prev.filter((e) => e.uid !== entry.uid));
            } catch (err: any) {
              Alert.alert('Error', err?.message || tr('No se pudo restaurar.', 'Could not restore.'));
            }
          },
        },
      ]
    );
  };

  const loadProfile = async () => {
    try {
      setProfileLoading(true);
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        setProfileData(null);
        return;
      }

      const userDocRef = doc(db, 'users', ownerUid);
      const userSnap = await getDoc(userDocRef);
      if (!userSnap.exists()) {
        setProfileData(null);
        return;
      }

      const data = userSnap.data() as any;
      const firstName = String(data?.firstName || '').trim();
      const lastName = String(data?.lastName || '').trim();
      const fullName = String(data?.fullName || `${firstName} ${lastName}`.trim() || 'Usuario').trim();
      const nickname = String(data?.nickname || '').trim();
      const lastNicknameChangeRaw = data?.lastNicknameChange || data?.nicknameChangedAt;
      const lastNicknameChange = lastNicknameChangeRaw?.toDate
        ? lastNicknameChangeRaw.toDate().toISOString()
        : lastNicknameChangeRaw
          ? String(lastNicknameChangeRaw)
          : null;

      const nextProfile: EditableProfile = {
        uid: ownerUid,
        fullName,
        firstName,
        lastName,
        nickname,
        nicknameLower: String(data?.nicknameLower || nickname.toLowerCase()),
        email: String(data?.email || auth.currentUser?.email || ''),
        phone: String(data?.phone || ''),
        lastNicknameChange,
      };

      setProfileData(nextProfile);
      setEditFullName(nextProfile.fullName);
      setEditNickname(nextProfile.nickname);
    } catch {
      setProfileData(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const computeNicknameUnlockDate = (changedAtIso: string | null) => {
    if (!changedAtIso) {
      return null;
    }
    const base = new Date(changedAtIso);
    if (Number.isNaN(base.getTime())) {
      return null;
    }
    return new Date(base.getTime() + 28 * 24 * 60 * 60 * 1000);
  };

  const formatCooldownDate = (date: Date) => {
    return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  };

  const openProfileEditor = () => {
    if (!profileData) {
      Alert.alert(tr('Perfil no disponible', 'Profile unavailable'), tr('No se pudo cargar tu perfil en este momento.', 'Could not load your profile right now.'));
      return;
    }
    setEditFullName(profileData.fullName);
    setEditNickname(profileData.nickname);
    setProfileModalVisible(true);
  };

  const saveProfileChanges = async () => {
    if (!profileData) {
      return;
    }

    const nextFullName = editFullName.trim();
    const nextNickname = editNickname.trim();
    const nextNicknameLower = nextNickname.toLowerCase();

    if (!nextFullName) {
      Alert.alert(tr('Nombre requerido', 'Name required'), tr('Debes mantener un nombre visible en tu perfil.', 'You must keep a visible name in your profile.'));
      return;
    }
    if (!nextNickname) {
      Alert.alert(tr('Nickname requerido', 'Nickname required'), tr('El nickname es obligatorio y unico.', 'Nickname is required and unique.'));
      return;
    }

    const nicknameChanged = nextNicknameLower !== profileData.nicknameLower;

    try {
      setProfileSaving(true);

      let nicknameChangeSuccess = true;
      let backendNicknameError = '';

      if (nicknameChanged) {
        // Lógica robusta: llamar al endpoint backend
        const apiBase =
          (process.env.EXPO_PUBLIC_BACKEND_BASE_URL ?? process.env.EXPO_PUBLIC_MODERATION_API_URL ?? '').trim().replace(/\/+$/, '');
        const response = await fetch(`${apiBase}/api/users/${profileData.uid}/nickname`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ nickname: nextNickname }),
        });
        if (!response.ok) {
          nicknameChangeSuccess = false;
          const data = await response.json().catch(() => ({}));
          backendNicknameError = data?.error || tr('No se pudo cambiar el nickname.', 'Could not change nickname.');
        }
      }

      if (nicknameChanged && !nicknameChangeSuccess) {
        if (backendNicknameError.includes('cooldown')) {
          Alert.alert(tr('Cambio bloqueado', 'Change blocked'), tr('No puedes cambiar tu nickname todavía. Intenta más tarde.', 'You cannot change your nickname yet. Try later.'));
        } else if (backendNicknameError.includes('taken')) {
          Alert.alert(tr('Nickname en uso', 'Nickname taken'), tr('Ese nickname ya pertenece a otro usuario.', 'That nickname belongs to another user.'));
        } else {
          Alert.alert(tr('No se pudo cambiar el nickname', 'Could not change nickname'), backendNicknameError);
        }
        return;
      }

      // Actualizar nombre y otros campos en Firestore (si cambiaron)
      const splitParts = nextFullName.split(/\s+/).filter(Boolean);
      const nextFirstName = splitParts[0] || profileData.firstName || '';
      const nextLastName = splitParts.slice(1).join(' ') || profileData.lastName || '';

      const updates: Record<string, any> = {
        fullName: nextFullName,
        firstName: nextFirstName,
        lastName: nextLastName,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'users', profileData.uid), updates);

      setProfileData((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          fullName: nextFullName,
          firstName: nextFirstName,
          lastName: nextLastName,
          nickname: nicknameChanged ? nextNickname : prev.nickname,
          nicknameLower: nicknameChanged ? nextNicknameLower : prev.nicknameLower,
          lastNicknameChange: nicknameChanged ? new Date().toISOString() : prev.lastNicknameChange,
        };
      });

      if (nicknameChanged && auth.currentUser) {
        await auth.currentUser.reload().catch(() => null);
      }

      setProfileModalVisible(false);
      Alert.alert(tr('Perfil actualizado', 'Profile updated'), tr('Los cambios se guardaron correctamente.', 'Changes saved successfully.'));
    } catch (error: any) {
      Alert.alert(tr('No se pudo guardar', 'Could not save'), error?.message || tr('Intenta nuevamente.', 'Try again.'));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleUnblock = async (targetUid: string) => {
    try {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        throw new Error(tr('No se pudo validar tu sesión.', 'Could not validate your session.'));
      }

      await unblockRelationship({ ownerUid, targetUid });
      setBlockedUsers((prev) => prev.filter((row) => row.uid !== targetUid));
    } catch (error: any) {
      Alert.alert(tr('No se pudo desbloquear', 'Could not unblock'), error?.message || tr('Inténtalo de nuevo.', 'Try again.'));
    }
  };

  // Check super_admin + load admin quick-stats when drawer opens
  useEffect(() => {
    const checkSuperAdminAndLoadStats = async () => {
      try {
        const uid = await getActiveUserId();
        if (!uid) return;
        const isSuperAdminUser = await isSuperAdmin(uid);
        setUserIsSuperAdmin(isSuperAdminUser);
        if (!isSuperAdminUser) return;

        // ── Pending reports ────────────────────────────
        try {
          const reportsSnap = await getDocs(
            query(collection(db, 'reports'), where('status', '==', 'pending'))
          );
          setAdminPendingReports(reportsSnap.size);
        } catch { /* collection might not exist yet */ }

        // ── Total users ────────────────────────────────
        try {
          const usersSnap = await getDocs(collection(db, 'users'));
          setAdminTotalUsers(usersSnap.size);
        } catch { /* ignore */ }

        // ── Revenue today (sum of today's payment_events) ─
        try {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const revenueSnap = await getDocs(
            query(
              collection(db, 'payment_events'),
              where('createdAt', '>=', todayStart),
              where('status', '==', 'completed')
            )
          );
          const total = revenueSnap.docs.reduce(
            (acc, d) => acc + (Number(d.data().amountUSD) || 0),
            0
          );
          setAdminTodayRevenue(total);
        } catch { /* ignore */ }
      } catch (error) {
        console.error('Error checking super_admin status:', error);
      }
    };

    if (drawerVisible) {
      checkSuperAdminAndLoadStats();
    }
  }, [drawerVisible]);

  useEffect(() => {
    if (!drawerVisible) {
      return;
    }
    if (activePanel === 'privacy') {
      loadBlockedUsers();
    }
    if (activePanel === 'profile') {
      loadProfile();
    }
  }, [drawerVisible, activePanel]);

  const formatBlockedMonthYear = (isoDate: string | null) => {
    if (!isoDate) {
      return tr('Bloqueado: --', 'Blocked: --');
    }
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) {
      return tr('Bloqueado: --', 'Blocked: --');
    }
    const formatted = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-MX', {
      month: 'short',
      year: 'numeric',
    }).format(parsed);
    return tr(`Bloqueado: ${formatted}`, `Blocked: ${formatted}`);
  };

  return (
    <LinearGradient
      colors={['#EAF7FF', '#CDEFFF', '#B8E7FF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#54C1FB',
          tabBarInactiveTintColor: '#F1F1F1',
          tabBarStyle: {
            backgroundColor: '#0A1A2F',
            height: 90,
            paddingTop: 8,
            paddingBottom: 14,
            borderTopColor: 'rgba(212,175,55,0.25)',
            borderTopWidth: 1,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.2,
            shadowRadius: 6,
            elevation: 8,
          },
          headerStyle: { backgroundColor: '#0A1A2F', height: 90 },
          headerTintColor: '#D4AF37',
          headerTitleAlign: 'center',
          headerLeft: () => (
            <View style={styles.headerLeftLogoWrap}>
              <View style={styles.logoFrame}>
                <Image source={require('../../assets/images/CS Icon Logo.png')} style={styles.headerLogo} />
              </View>
            </View>
          ),
          headerTitle: () => (
            <View style={styles.headerBrandWrap}>
              <Text style={styles.headerBrandText}>Card-Social</Text>
            </View>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 12 }}>
              <LanguageToggle />
              <TouchableOpacity
                onPress={() => {
                  setActivePanel('menu');
                  setDrawerVisible(true);
                }}
                style={styles.headerMenuButton}
                accessibilityLabel={tr('Abrir menú', 'Open menu')}
              >
                <MaterialCommunityIcons name="menu" size={24} color="#D4AF37" />
                {/* Red badge — only visible when admin has pending reports */}
                {userIsSuperAdmin && adminPendingReports > 0 ? (
                  <View style={styles.menuBadge}>
                    <Text style={styles.menuBadgeText}>
                      {adminPendingReports > 99 ? '99+' : adminPendingReports}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>
          ),
        }}>
        <Tabs.Screen
          name="vault"
          options={{
            title: tr('Bóveda', 'Vault'),
            tabBarIcon: ({ color }) => <Database color={color} size={24} />,
          }}
        />
        <Tabs.Screen
          name="cards"
          options={{
            title: tr('Tarjetas', 'Cards'),
            tabBarIcon: ({ color }) => <CreditCard color={color} size={24} />,
          }}
        />
        <Tabs.Screen
          name="contacts"
          options={{
            title: tr('Contactos', 'Contacts'),
            tabBarIcon: ({ color }) => <Users color={color} size={24} />,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: tr('Mercado', 'MS'),
            tabBarIcon: ({ color }) => <Search color={color} size={24} />,
          }}
        />
        <Tabs.Screen
          name="stories"
          options={{
            title: tr('Historias', 'Stories'),
            tabBarIcon: ({ color }) => <PlayCircle color={color} size={24} />,
          }}
        />
        <Tabs.Screen
          name="calls"
          options={{
            title: tr('Llamadas', 'Calls'),
            tabBarIcon: ({ color }) => <Phone color={color} size={24} />,
          }}
        />
        <Tabs.Screen
          name="myprofile"
          options={{
            href: null,
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="accountRecovery"
          options={{
            href: null,
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="createBusinessCard"
          options={{
            href: null,
            headerShown: false,
          }}
        />
      </Tabs>

      <Modal
        visible={drawerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawerVisible(false)}
      >
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerVisible(false)} />
          <BlurView intensity={50} tint="light" style={styles.drawerShell}>
            <LinearGradient
              colors={['rgba(164,220,255,0.95)', 'rgba(255,255,255,0.98)', 'rgba(173,230,255,0.95)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.drawerGradientBorder}
            >
              <View style={styles.drawerInner}>
                <View style={styles.drawerHeader}>
                  <Text style={styles.drawerTitle}>{panelTitle}</Text>
                  <TouchableOpacity onPress={() => setDrawerVisible(false)} accessibilityLabel={tr('Cerrar menú', 'Close menu')}>
                    <MaterialCommunityIcons name="close" size={24} color="#0D4D8A" />
                  </TouchableOpacity>
                </View>

                {/* Credits Indicator - Always Visible in Menu */}
                {activePanel === 'menu' && (
                  <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                    <CreditsIndicator userId={auth.currentUser?.uid || ''} refreshTrigger={creditsRefreshTrigger} />
                  </View>
                )}

                {/* ── Admin Quick-Stats Strip (solo super_admin) ── */}
                {activePanel === 'menu' && userIsSuperAdmin && (
                  <View style={styles.adminStatsStrip}>
                    {/* Pending reports */}
                    <View style={[styles.adminStatChip, adminPendingReports > 0 && styles.adminStatChipAlert]}>
                      <MaterialCommunityIcons
                        name="flag-outline"
                        size={14}
                        color={adminPendingReports > 0 ? '#FF4444' : '#C5A065'}
                      />
                      <Text style={[styles.adminStatLabel, adminPendingReports > 0 && { color: '#FF4444' }]}>
                        {adminPendingReports > 0 ? `${adminPendingReports} ${tr('reportes', 'reports')}` : tr('Sin reportes', 'No reports')}
                      </Text>
                    </View>
                    {/* Total users */}
                    <View style={styles.adminStatChip}>
                      <MaterialCommunityIcons name="account-group-outline" size={14} color="#C5A065" />
                      <Text style={styles.adminStatLabel}>
                        {adminTotalUsers !== null ? `${adminTotalUsers} ${tr('usuarios', 'users')}` : '...'}
                      </Text>
                    </View>
                    {/* Revenue today */}
                    <View style={styles.adminStatChip}>
                      <MaterialCommunityIcons name="cash-multiple" size={14} color="#C5A065" />
                      <Text style={styles.adminStatLabel}>
                        {adminTodayRevenue !== null ? `$${adminTodayRevenue.toFixed(2)}` : '...'}
                      </Text>
                    </View>
                  </View>
                )}

                <ConfettiAnimation ref={confettiRef} />

                {activePanel === 'menu' ? (
                  <ScrollView style={styles.drawerMenuList} contentContainerStyle={{ paddingBottom: 32 }}>
                    <TouchableOpacity
                      style={[styles.drawerItem, styles.drawerItemHighlight]}
                      onPress={() => {
                        setDrawerVisible(false);
                        router.push('/(tabs)/myprofile' as any);
                      }}
                    >
                      <MaterialCommunityIcons name="account-circle-outline" size={18} color="#C5A065" />
                      <Text style={[styles.drawerItemText, { color: '#C5A065', fontWeight: '700' }]}>{tr('Cuenta', 'Account')}</Text>
                    </TouchableOpacity>




                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setDrawerVisible(false); router.push('/vault_store'); }}>
                      <MaterialCommunityIcons name="store" size={18} color="#C5A065" />
                      <Text style={[styles.drawerItemText, { color: '#C5A065', fontWeight: '600' }]}>{tr('Suscripción', 'Subscription')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setDrawerVisible(false); router.push('/icon_store'); }}>
                      <MaterialCommunityIcons name="palette-outline" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>{`🎨 ${tr('Estudio de Tarjetas', 'Card Studio')}`}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setDrawerVisible(false); router.push('/theme_locker'); }}>
                      <MaterialCommunityIcons name="treasure-chest" size={18} color="#C5A065" />
                      <Text style={[styles.drawerItemText, { color: '#C5A065', fontWeight: '600' }]}>{tr('🔒 Locker de Estilos', '🔒 Theme Locker')}</Text>
                    </TouchableOpacity>

                    {userIsSuperAdmin && (
                      <TouchableOpacity 
                        style={[styles.drawerItem, styles.mintItem]} 
                        onPress={() => {
                          setDrawerVisible(false); // Cierra el drawer primero
                          router.push('/admin/dashboard'); // Navega a ruta protegida
                        }}
                      >
                        <MaterialCommunityIcons name="crown" size={18} color="#C5A065" />
                        <Text style={[styles.drawerItemText, { color: '#C5A065', fontWeight: '700' }]}>The Mint 👑</Text>
                      </TouchableOpacity>
                    )}


                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setDrawerVisible(false); router.push('/settings'); }}>
                      <MaterialCommunityIcons name="cog-outline" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>{tr('Configuración', 'Settings')}</Text>
                    </TouchableOpacity>

                    {/* Botones legales restaurados */}
                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setActivePanel('terms'); }}>
                      <MaterialCommunityIcons name="file-document-outline" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>{tr('Términos y Condiciones', 'Terms & Conditions')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setActivePanel('policy'); }}>
                      <MaterialCommunityIcons name="shield-lock-outline" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>{tr('Política de Uso', 'Usage Policy')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setActivePanel('about'); }}>
                      <MaterialCommunityIcons name="information-outline" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>{tr('Acerca de Card-Social', 'About Card-Social')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setActivePanel('privacy'); }}>
                      <MaterialCommunityIcons name="shield-account-outline" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>{tr('Privacidad', 'Privacy')}</Text>
                    </TouchableOpacity>


                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setActivePanel('blocked_users'); void loadRelEntries('blocked'); setRelTab('blocked'); }}>
                      <MaterialCommunityIcons name="account-cancel-outline" size={18} color="#B7343A" />
                      <Text style={[styles.drawerItemText, { color: '#B7343A' }]}>{tr('Gestión de Relaciones', 'Relationship Manager')}</Text>
                    </TouchableOpacity>

                    <View style={styles.lookModeSection}>
                      <View style={styles.lookModeHeaderRow}>
                        <MaterialCommunityIcons name="theme-light-dark" size={18} color="#0D4D8A" />
                        <Text style={styles.lookModeTitle}>{tr('Apariencia', 'Appearance')}</Text>
                      </View>
                      <View style={styles.lookModeRow}>
                        <TouchableOpacity
                          style={[styles.lookModeButton, mode === 'dia' && styles.lookModeButtonActive]}
                          onPress={() => setMode('dia')}
                        >
                          <Text style={[styles.lookModeButtonText, mode === 'dia' && styles.lookModeButtonTextActive]}>{tr('Dia', 'Day')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.lookModeButton, mode === 'noche' && styles.lookModeButtonActive]}
                          onPress={() => setMode('noche')}
                        >
                          <Text style={[styles.lookModeButtonText, mode === 'noche' && styles.lookModeButtonTextActive]}>{tr('Noche', 'Night')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.lookModeButton, mode === 'auto' && styles.lookModeButtonActive]}
                          onPress={handleSelectAutoMode}
                        >
                          <Text style={[styles.lookModeButtonText, mode === 'auto' && styles.lookModeButtonTextActive]}>Auto</Text>
                        </TouchableOpacity>
                      </View>
                      {mode === 'auto' ? (
                        <Text style={styles.lookModeHint}>
                          {(() => {
                            if (mode === 'auto') {
                              if (autoStatusText.includes('GPS')) return tr('auto_gps', 'auto_gps');
                              if (autoStatusText.includes('ubicacion en cache')) return tr('auto_cached', 'auto_cached');
                              if (autoStatusText.includes('cache sin red')) return tr('auto_cache_offline', 'auto_cache_offline');
                              if (autoStatusText.includes('sin GPS')) return tr('auto_fallback', 'auto_fallback');
                              return tr('auto_inactive', 'auto_inactive');
                            }
                            if (mode === 'dia') return tr('manual_day', 'manual_day');
                            if (mode === 'noche') return tr('manual_night', 'manual_night');
                            return '';
                          })()}
                          {mode === 'auto' ? `. ${tr('Resuelto', 'Resolved')}: ${tr(resolvedMode === 'noche' ? 'Noche' : 'Día', resolvedMode === 'noche' ? 'Night' : 'Day')}.` : ''}
                        </Text>
                      ) : null}
                    </View>

                    <TouchableOpacity style={styles.drawerItem}>
                      <MaterialCommunityIcons name="qrcode-scan" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>{tr('Mis QR (Próximamente)', 'My QR (Coming Soon)')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.drawerItem} onPress={handleSignOut}>
                      <MaterialCommunityIcons name="logout" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>{tr('Cerrar Sesión', 'Sign Out')}</Text>
                    </TouchableOpacity>
                  </ScrollView>
                ) : activePanel === 'privacy' ? (
                  <ScrollView style={styles.legalScroll} contentContainerStyle={styles.legalContentWrap}>
                    <Text style={styles.legalTitle}>{tr('Política de Privacidad', 'Privacy Policy')}</Text>
                    <Text style={styles.legalText}>
                      {tr(
                        'Tus datos personales (nombre, email, teléfono) solo se usan para el funcionamiento de Card-Social. No compartimos tu información con terceros sin tu consentimiento. Puedes solicitar la eliminación de tu cuenta y datos en cualquier momento. También puedes descargar una copia de tus datos personales.',
                        'Your personal data (name, email, phone) is only used for the operation of Card-Social. We do not share your information with third parties without your consent. You can request deletion of your account and data at any time. You can also download a copy of your personal data.'
                      )}
                    </Text>
                    <TouchableOpacity
                      style={[styles.editProfileBtn, { marginTop: 24, backgroundColor: '#0A2540' }]}
                      onPress={() => {
                        Alert.alert(
                          tr('Descarga de datos', 'Download Data'),
                          tr('Recibirás un archivo con tus datos personales próximamente.', 'You will receive a file with your personal data soon.')
                        );
                      }}
                    >
                      <MaterialCommunityIcons name="download" size={16} color="#FFFFFF" />
                      <Text style={styles.editProfileBtnText}>{tr('Descargar mis datos', 'Download my data')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.editProfileBtn, { marginTop: 16, backgroundColor: '#B7343A' }]}
                      onPress={async () => {
                        // Primer mensaje
                        Alert.alert(
                          tr('Eliminar cuenta', 'Delete account'),
                          tr('Estás eliminando tu cuenta, esto puede borrar para siempre tus datos. ¿Deseas continuar?', 'You are deleting your account, this may permanently erase your data. Continue?'),
                          [
                            { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
                            {
                              text: tr('Aceptar', 'Accept'),
                              style: 'destructive',
                              onPress: async () => {
                                // Segundo mensaje
                                const now = new Date();
                                const deadline = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                                const deadlineStr = deadline.toLocaleDateString(language === 'en' ? 'en-US' : 'es-MX', { year: 'numeric', month: 'long', day: '2-digit' });
                                Alert.alert(
                                  tr('Confirmar eliminación', 'Confirm deletion'),
                                  tr(
                                    `¿Seguro? Pensamos en ti: tienes hasta 30 días para volver a iniciar sesión y no perderás tus datos. Fecha límite: ${deadlineStr}.`,
                                    `Are you sure? You have up to 30 days to log in again and keep your data. Deadline: ${deadlineStr}.`
                                  ),
                                  [
                                    { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
                                    {
                                      text: tr('Aceptar', 'Accept'),
                                      style: 'destructive',
                                      onPress: async () => {
                                        try {
                                          const user = auth.currentUser;
                                          if (user) {
                                            const userId = user.uid;
                                            // Marcar en Firestore como pendiente de eliminación
                                            await updateDoc(doc(db, 'users', userId), {
                                              pendingDeletion: true,
                                              deletionRequestedAt: now,
                                              deletionDeadline: deadline,
                                            });
                                            Alert.alert(
                                              tr('Cuenta marcada para eliminación', 'Account marked for deletion'),
                                              tr(
                                                `Tu cuenta está marcada para eliminación. Si vuelves a iniciar sesión antes del ${deadlineStr}, tu cuenta será restaurada automáticamente.`,
                                                `Your account is marked for deletion. If you log in again before ${deadlineStr}, your account will be automatically restored.`
                                              )
                                            );
                                            setDrawerVisible(false);
                                            setActivePanel('menu');
                                            router.replace('/');
                                          }
                                        } catch (err) {
                                          Alert.alert(tr('Error', 'Error'), tr('No se pudo marcar la cuenta para eliminación. Intenta nuevamente.', 'Could not mark account for deletion. Please try again.'));
                                        }
                                      },
                                    },
                                  ]
                                );
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <MaterialCommunityIcons name="delete" size={16} color="#FFFFFF" />
                      <Text style={styles.editProfileBtnText}>{tr('Eliminar mi cuenta', 'Delete my account')}</Text>
                    </TouchableOpacity>
                  </ScrollView>
                ) : activePanel === 'profile' ? (
                  <ScrollView style={styles.legalScroll} contentContainerStyle={styles.legalContentWrap}>
                              {profileLoading ? (
                                <Text style={styles.legalText}>{tr('Cargando perfil...', 'Loading profile...')}</Text>
                              ) : !profileData ? (
                                <Text style={styles.legalText}>{tr('No se pudo cargar tu perfil.', 'Could not load your profile.')}</Text>
                              ) : (
                                <>
                                  <View style={styles.profileCard}>
                                                  {/* ...existing code... */}
                          <Text style={styles.profileLabel}>{tr('Nombre', 'Name')}</Text>
                          <Text style={styles.profileValue}>{profileData.fullName}</Text>

                          <Text style={styles.profileLabel}>{tr('Nickname único', 'Unique Nickname')}</Text>
                          <Text style={styles.profileValue}>@{profileData.nickname}</Text>

                          <Text style={styles.profileLabel}>{tr('Email (solo lectura)', 'Email (read-only)')}</Text>
                          <Text style={styles.profileReadonly}>{profileData.email || tr('No disponible', 'Not available')}</Text>

                          <Text style={styles.profileLabel}>{tr('Celular (solo lectura)', 'Phone (read-only)')}</Text>
                          <Text style={styles.profileReadonly}>{profileData.phone || tr('No disponible', 'Not available')}</Text>

                          <Text style={styles.profileHint}>
                            {tr('Puedes editar tu perfil excepto email y celular. El nickname solo se puede cambiar cada 4 semanas.', 'You can edit your profile except email and phone. Nickname can only be changed every 4 weeks.')}
                          </Text>
                        </View>

                        <TouchableOpacity style={styles.editProfileBtn} onPress={openProfileEditor}>
                          <MaterialCommunityIcons name="pencil-outline" size={16} color="#FFFFFF" />
                          <Text style={styles.editProfileBtnText}>{tr('Modificar perfil', 'Edit Profile')}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </ScrollView>
                ) : activePanel === 'subscription' ? (
                  <Subscription onClose={() => setActivePanel('menu')} />
                ) : activePanel === 'icon_store' ? (
                  <IconStore />
                ) : activePanel === 'theme_chest' ? (
                  <ThemeChest onNavigateToForge={() => setActivePanel('subscription')} />
                ) : activePanel === 'blocked_users' ? (
                  <View style={styles.legalScroll}>
                    {/* ── 3-tab selector ──────────────────────────────────────── */}
                    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#E0E0E0', marginBottom: 12 }}>
                      {(['muted', 'restricted', 'blocked'] as RelTab[]).map((tab) => {
                        const labels: Record<RelTab, [string, string]> = {
                          muted: ['Silenciados', 'Muted'],
                          restricted: ['Restringidos', 'Restricted'],
                          blocked: ['Bloqueados', 'Blocked'],
                        };
                        const active = relTab === tab;
                        return (
                          <TouchableOpacity
                            key={tab}
                            onPress={() => { setRelTab(tab); void loadRelEntries(tab); }}
                            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: active ? 2 : 0, borderColor: active ? '#0D4D8A' : 'transparent' }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? '#0D4D8A' : '#999' }}>
                              {tr(labels[tab][0], labels[tab][1])}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* ── List ────────────────────────────────────────────────── */}
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
                      {loadingRel ? (
                        <Text style={{ color: '#0D4D8A', textAlign: 'center', marginTop: 24, fontSize: 14 }}>
                          {tr('Cargando…', 'Loading…')}
                        </Text>
                      ) : relEntries.length === 0 ? (
                        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                          <MaterialCommunityIcons
                            name={relTab === 'muted' ? 'volume-off' : relTab === 'restricted' ? 'eye-off-outline' : 'account-cancel-outline'}
                            size={48}
                            color="#B7343A"
                          />
                          <Text style={{ color: '#0D4D8A', fontSize: 14, fontWeight: '600', marginTop: 12, textAlign: 'center' }}>
                            {tr(
                              `No tienes usuarios ${relTab === 'muted' ? 'silenciados' : relTab === 'restricted' ? 'restringidos' : 'bloqueados'}.`,
                              `No ${relTab} users.`
                            )}
                          </Text>
                        </View>
                      ) : (
                        relEntries.map((entry) => (
                          <View key={entry.uid} style={styles.blockedRow}>
                            <View style={styles.blockedIdentity}>
                              {entry.photoUrl ? (
                                <Image source={{ uri: entry.photoUrl }} style={styles.blockedAvatar} />
                              ) : (
                                <View style={styles.blockedAvatarFallback}>
                                  <MaterialCommunityIcons name="account" size={15} color="#0D4D8A" />
                                </View>
                              )}
                              <View style={styles.blockedTextCol}>
                                <Text style={styles.blockedName}>{entry.name}</Text>
                                <Text style={styles.blockedDateText}>
                                  {entry.status === 'muted' ? '🔇' : entry.status === 'restricted' ? '👁️‍🗨️' : '🚫'}
                                </Text>
                              </View>
                            </View>
                            <TouchableOpacity style={styles.unblockBtn} onPress={() => handleRelRemove(entry)}>
                              <Text style={styles.unblockBtnText}>{tr('Restaurar', 'Restore')}</Text>
                            </TouchableOpacity>
                          </View>
                        ))
                      )}
                    </ScrollView>
                  </View>
                ) : (
                  <ScrollView style={styles.legalScroll} contentContainerStyle={styles.legalContentWrap}>
                    {legalContent.map((line, index) => (
                      <View style={styles.legalLine} key={`${activePanel}-${index}`}>
                        <MaterialCommunityIcons name="chevron-right" size={16} color="#0D4D8A" />
                        <Text style={styles.legalText}>{line}</Text>
                      </View>
                    ))}
                  </ScrollView>
                )}

                {activePanel !== 'menu' ? (
                  <TouchableOpacity style={styles.backToMenuBtn} onPress={() => setActivePanel('menu')}>
                    <MaterialCommunityIcons name="arrow-left" size={16} color="#0D4D8A" />
                    <Text style={styles.backToMenuText}>{tr('Volver al menú', 'Back to menu')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </LinearGradient>
          </BlurView>
        </View>
      </Modal>

      <Modal
        visible={profileModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.profileModalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.profileModalKeyboardWrap}
            >
              <View style={styles.profileModalCard}>
                <Text style={styles.profileModalTitle}>{tr('Modificar Perfil', 'Edit Profile')}</Text>

                <ScrollView
                  keyboardDismissMode="on-drag"
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.profileFormWrap}
                >
                  <Text style={styles.inputLabel}>{tr('Nombre visible', 'Display Name')}</Text>
                  <TextInput
                    style={styles.profileInput}
                    value={editFullName}
                    onChangeText={setEditFullName}
                    placeholder={tr('Nombre completo', 'Full name')}
                    placeholderTextColor="#7AA6C1"
                  />

                  <Text style={styles.inputLabel}>{tr('Nickname único', 'Unique Nickname')}</Text>
                  <TextInput
                    style={styles.profileInput}
                    value={editNickname}
                    onChangeText={setEditNickname}
                    placeholder="nickname"
                    autoCapitalize="none"
                    placeholderTextColor="#7AA6C1"
                  />

                  <Text style={styles.inputLabel}>{tr('Email (bloqueado)', 'Email (locked)')}</Text>
                  <View style={styles.profileReadOnlyInput}>
                    <Text style={styles.profileReadOnlyText}>{profileData?.email || tr('No disponible', 'Not available')}</Text>
                  </View>

                  <Text style={styles.inputLabel}>{tr('Celular (bloqueado)', 'Phone (locked)')}</Text>
                  <View style={styles.profileReadOnlyInput}>
                    <Text style={styles.profileReadOnlyText}>{profileData?.phone || tr('No disponible', 'Not available')}</Text>
                  </View>

                  <Text style={styles.profileHint}>
                    {tr('Regla activa: nickname no repetido globalmente y cambio permitido cada 4 semanas.', 'Active rule: nickname must be globally unique and can only be changed every 4 weeks.')}
                  </Text>
                </ScrollView>

                <View style={styles.profileModalActions}>
                  <TouchableOpacity
                    style={styles.profileGhostBtn}
                    onPress={() => setProfileModalVisible(false)}
                    disabled={profileSaving}
                  >
                    <Text style={styles.profileGhostBtnText}>{tr('Cancelar', 'Cancel')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.profileSaveBtn}
                    onPress={saveProfileChanges}
                    disabled={profileSaving}
                  >
                    <Text style={styles.profileSaveBtnText}>{profileSaving ? tr('Guardando...', 'Saving...') : tr('Guardar', 'Save')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  headerLeftLogoWrap: {
    marginLeft: 6,
  },
  headerBrandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFrame: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    padding: 4,
    borderWidth: 1.5,
    borderColor: '#D4AF37',
  },
  headerLogo: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  headerBrandText: {
    color: '#D4AF37',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  headerMenuButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(212,175,55,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#0A1A2F',
  },
  menuBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 12,
  },
  adminStatsStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  adminStatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(197,160,101,0.10)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(197,160,101,0.25)',
  },
  adminStatChipAlert: {
    backgroundColor: 'rgba(255,68,68,0.10)',
    borderColor: 'rgba(255,68,68,0.35)',
  },
  adminStatLabel: {
    color: '#C5A065',
    fontSize: 11,
    fontWeight: '600',
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(145, 188, 214, 0.35)',
  },
  drawerShell: {
    width: '84%',
    maxWidth: 360,
    overflow: 'hidden',
  },
  drawerGradientBorder: {
    flex: 1,
    padding: 1.6,
  },
  drawerInner: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 16,
    paddingTop: 42,
    paddingBottom: 20,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(13,77,138,0.2)',
    paddingBottom: 12,
  },
  drawerTitle: {
    color: '#0D4D8A',
    fontSize: 20,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  drawerMenuList: {
    gap: 8,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  drawerItemHighlight: {
    backgroundColor: 'rgba(197, 160, 101, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(197, 160, 101, 0.45)',
  },
  mintItem: {
    backgroundColor: 'rgba(197, 160, 101, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(197, 160, 101, 0.3)',
  },
  drawerItemText: {
    color: '#184B76',
    fontSize: 14,
    fontWeight: '500',
  },
  lookModeSection: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.15)',
    gap: 8,
  },
  lookModeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lookModeTitle: {
    color: '#184B76',
    fontSize: 13,
    fontWeight: '700',
  },
  lookModeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  lookModeButton: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.3)',
    backgroundColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  lookModeButtonActive: {
    backgroundColor: '#0D4D8A',
    borderColor: '#0D4D8A',
  },
  lookModeButtonText: {
    color: '#0D4D8A',
    fontSize: 12,
    fontWeight: '700',
  },
  lookModeButtonTextActive: {
    color: '#FFFFFF',
  },
  lookModeHint: {
    color: '#346489',
    fontSize: 11,
    fontStyle: 'italic',
  },
  legalScroll: {
    flex: 1,
  },
  legalContentWrap: {
    gap: 10,
    paddingBottom: 12,
  },
  legalLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  legalText: {
    color: '#24587F',
    fontSize: 14,
    lineHeight: 21,
    flex: 1,
  },
  backToMenuBtn: {
    marginTop: 12,
    borderRadius: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#E8F6FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  backToMenuText: {
    color: '#0D4D8A',
    fontWeight: '700',
  },
  blockedRow: {
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  blockedIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  blockedTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  blockedAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  blockedAvatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F6FF',
    borderWidth: 1,
    borderColor: '#C2E9FF',
  },
  blockedName: {
    color: '#184B76',
    fontSize: 13,
    fontWeight: '700',
  },
  blockedDateText: {
    color: '#7DA7C3',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  unblockBtn: {
    borderRadius: 10,
    backgroundColor: '#0D4D8A',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  unblockBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11,
  },
  profileCard: {
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.16)',
    padding: 12,
    gap: 6,
  },
  profileLabel: {
    color: '#3D6B8A',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  profileValue: {
    color: '#184B76',
    fontSize: 14,
    fontWeight: '700',
  },
  profileReadonly: {
    color: '#5C86A3',
    fontSize: 13,
    fontWeight: '500',
  },
  profileHint: {
    color: '#5A84A1',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  editProfileBtn: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: '#0D4D8A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  editProfileBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  profileModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 44, 69, 0.28)',
  },
  profileModalKeyboardWrap: {
    width: '100%',
  },
  profileModalCard: {
    backgroundColor: '#F6FBFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.12)',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    maxHeight: '86%',
  },
  profileModalTitle: {
    color: '#0D4D8A',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  profileFormWrap: {
    paddingBottom: 8,
    gap: 6,
  },
  inputLabel: {
    color: '#3A6685',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  profileInput: {
    borderWidth: 1,
    borderColor: '#B9DCEF',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    color: '#1A4F76',
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 14,
  },
  profileReadOnlyInput: {
    borderWidth: 1,
    borderColor: '#D6E8F4',
    borderRadius: 10,
    backgroundColor: '#EEF6FC',
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  profileReadOnlyText: {
    color: '#6D8EA6',
    fontSize: 14,
  },
  profileModalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  profileGhostBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  profileGhostBtnText: {
    color: '#0D4D8A',
    fontWeight: '700',
    fontSize: 13,
  },
  profileSaveBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#0D4D8A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  profileSaveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  legalTitle: {
    color: '#0D4D8A',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
});