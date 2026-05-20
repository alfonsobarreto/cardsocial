import { ConfettiAnimation, ConfettiAnimationRef } from '@/components/ConfettiAnimation';
import { NotificationBell } from '@/components/NotificationBell';
import { brandCsIconLogo } from '@/constants/brandAssets';
import { CreditsIndicator } from '@/components/CreditsIndicator';
import LanguageToggle from '@/components/LanguageToggle';
import Subscription from '@/components/Subscription';
import {
  computeScheduledDeletionDeadline,
  formatDeletionDeadlineDisplay,
  markAccountPendingDeletionInFirestore,
} from '@/services/accountDeletionClient';
import { shareExportedUserProfileJson } from '@/services/exportUserProfileJson';
import { getActiveUserId } from '@/services/authSession';
import { subscribeMyBusinessCardsInventoryChanged } from '@/services/businessCardInventoryEvents';
import { listMyBusinessCards } from '@/services/businessCardsRepo';
import { auth, db } from '@/services/firebaseConfig';
import {
  firestoreUserFullNameWrite,
  firestoreUserNickNameWrite,
  readUserFullName,
  readUserNickName,
  readUserNickNameLower,
} from '@/services/userIdentityFields';
import { resolveProfileAvatarDisplayUri } from '@/services/userProfilePhoto';
import { requestLocationPermission } from '@/services/geolocationService';
import { userFacingAlertMessage, userFacingAlertMessageFromHttp } from '@/services/apiUserFacingError';
import { intlLocaleTagForAppLanguage, useLanguage } from '@/services/language';
import { coreTrEsEn } from '@/services/coreI18n';
import { useLookMode } from '@/services/lookMode';
import {
  listBlockedRelations,
  removeRelationship as removeRelationshipBackend,
  unblockRelationship,
} from '@/services/qrApi';
import { touchSessionActivityForNonTrusted } from '@/services/sessionInactivity';
import { requireBiometricIfPolicyEnabled } from '@/services/biometricAuth';
import { syncWaitlistOnAppVerified } from '@/services/syncWaitlistOnAppVerified';
import { resolveVaultMediaUrlForApp } from '@/services/resolveVaultMediaUrl';
import {
    type RelationshipEntry,
    type RelationshipStatus,
    listRelationshipsByStatus,
    removeRelationship as removeRelEntry
} from '@/services/relationshipService';
import { hasUnlimitedAdminUi, isSuperAdmin } from '@/services/roleService';
import { clearLocalCachesForSignOut } from '@/services/userScopedStorage';
import {
  subscribeSubscriptionPanelOpen,
  type SubscriptionScrollSection,
} from '@/services/subscriptionNavigationIntent';
import { subscribeMarketRadarRemoteConfig } from '@/services/marketRadarConfigService';
import { setRadarTrialEnabledCache } from '@/services/radarTrialEnabledCache';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, useRouter } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useNavigation } from '@react-navigation/native';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
} from 'firebase/firestore';
import { CreditCard, Database, Phone, Search, Users } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    AppState,
    DeviceEventEmitter,
    Image,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import { useTabBarBottomInset } from '@/hooks/useTabBarBottomInset';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import palette from '../theme';
import {
  formKeyboardScrollViewProps,
  SCROLL_CONTENT_MIN_FILL,
  verticalScrollInteractionProps,
} from '@/constants/scrollInteraction';

type BlockedUser = {
  uid: string;
  name: string;
  userAvatarUrl: string | null;
  createdAt: string | null;
};

type LucideTabGlyph = ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

/** Tab activo: icono en acento con glow suave (sin disco que tape el área ni compita con la etiqueta). */
function PremiumTabIcon({
  Icon,
  focused,
  accent,
  onAccent: _onAccent,
  inactiveColor = 'rgba(255,255,255,0.5)',
}: {
  Icon: LucideTabGlyph;
  focused: boolean;
  accent: string;
  onAccent: string;
  inactiveColor?: string;
}) {
  if (focused) {
    return (
      <View style={styles.tabBarIconFocusedWrap}>
        <View style={[styles.tabBarIconGlowWrap, { shadowColor: accent }]}>
          <Icon color={accent} size={25} strokeWidth={2.45} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.tabBarIconInactiveWrap}>
      <Icon color={inactiveColor} size={24} strokeWidth={2} />
    </View>
  );
}

function DashboardTabGlyph({ color, size }: { color?: string; size?: number; strokeWidth?: number }) {
  return <MaterialCommunityIcons name="chart-line-variant" size={size ?? 24} color={color ?? 'rgba(255,255,255,0.5)'} />;
}

function shouldShowDashboardTab(hasBusinessCardWithBId: boolean, radarTrialEnabled: boolean) {
  return hasBusinessCardWithBId || radarTrialEnabled;
}

type EditableProfile = {
  uid: string;
  userFullName: string;
  firstName: string;
  lastName: string;
  userNickName: string;
  userNickNameLower: string;
  email: string;
  phone: string;
  lastNicknameChange: string | null;
};

export default function TabLayout({ children }: { children: React.ReactNode }) {
  const { mode, resolvedMode, setMode, autoStatusText } = useLookMode();
  const { language } = useLanguage();
  const tr = (es: string, en: string) => coreTrEsEn(es, en, language);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activePanel, setActivePanel] = useState<'menu' | 'profile' | 'terms' | 'policy' | 'about' | 'privacy' | 'subscription' | 'blocked_users' | 'bunker'>('menu');
  const [subscriptionScrollSection, setSubscriptionScrollSection] = useState<SubscriptionScrollSection | null>(null);
  const [creditsRefreshTrigger, setCreditsRefreshTrigger] = useState(0);
  const [welcomeBonusApplied, setWelcomeBonusApplied] = useState(false);
  const [radarTrialRemote, setRadarTrialRemote] = useState(false);
  const [radarTrialToggling, setRadarTrialToggling] = useState(false);
  const [userIsSuperAdmin, setUserIsSuperAdmin] = useState(false);
  const [userHasBusinessCardWithBId, setUserHasBusinessCardWithBId] = useState(false);
  const [adminPendingReports, setAdminPendingReports] = useState(0);
  const [adminTotalUsers, setAdminTotalUsers] = useState<number | null>(null);
  const [adminTodayRevenue, setAdminTodayRevenue] = useState<number | null>(null);
  /** Usuarios / ingresos del día: solo visible al expandir (super_admin). */
  const [adminQuickStatsOpen, setAdminQuickStatsOpen] = useState(false);
  const confettiRef = useRef<ConfettiAnimationRef>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [privacyExporting, setPrivacyExporting] = useState(false);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  type RelTab = 'muted' | 'restricted' | 'blocked';
  const [relTab, setRelTab] = useState<RelTab>('blocked');
  const [relEntries, setRelEntries] = useState<RelationshipEntry[]>([]);
  const [loadingRel, setLoadingRel] = useState(false);
  const [bunkerEntries, setBunkerEntries] = useState<RelationshipEntry[]>([]);
  const [loadingBunker, setLoadingBunker] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileData, setProfileData] = useState<EditableProfile | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const router = useRouter();
  const navigation = useNavigation();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];
  const tabInactiveMuted = resolvedMode === 'noche' ? 'rgba(235,235,245,0.42)' : 'rgba(60,60,67,0.42)';
  const dashboardTabVisible = shouldShowDashboardTab(userHasBusinessCardWithBId, radarTrialRemote);
  const insets = useSafeAreaInsets();
  const tabBarInnerVerticalPad = 10;
  const tabBarBottomInset = useTabBarBottomInset();
  const modalFooterBottomPad = useModalFooterBottomPad();
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState<string | null>(null);
  const headerAvatarFsUnsubRef = useRef<(() => void) | undefined>(undefined);
  const appStateRef = useRef(AppState.currentState);

  const refreshHeaderAvatar = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setHeaderAvatarUrl(null);
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      setHeaderAvatarUrl(resolveProfileAvatarDisplayUri(data, user.photoURL));
    } catch {
      setHeaderAvatarUrl(resolveProfileAvatarDisplayUri(null, user.photoURL));
    }
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      headerAvatarFsUnsubRef.current?.();
      headerAvatarFsUnsubRef.current = undefined;
      if (!user) {
        setHeaderAvatarUrl(null);
        setUserIsSuperAdmin(false);
        setUserHasBusinessCardWithBId(false);
        return;
      }
      if (user.emailVerified) {
        void user.getIdToken().then((t) => syncWaitlistOnAppVerified(t)).catch(() => null);
      }
      headerAvatarFsUnsubRef.current = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
          setHeaderAvatarUrl(resolveProfileAvatarDisplayUri(data, auth.currentUser?.photoURL));
        },
        (err) => {
          console.warn('[tabs] header avatar snapshot', err);
          void refreshHeaderAvatar();
        }
      );
      void (async () => {
        try {
          const [isAdminUser, businessCards] = await Promise.all([
            hasUnlimitedAdminUi(user.uid),
            listMyBusinessCards(user.uid).catch(() => []),
          ]);
          setUserIsSuperAdmin(isAdminUser);
          setUserHasBusinessCardWithBId(businessCards.some((card) => String(card?.bId || '').trim().length > 0));
        } catch {
          setUserHasBusinessCardWithBId(false);
        }
      })();
    });
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        void refreshHeaderAvatar();
        const user = auth.currentUser;
        if (user) {
          void listMyBusinessCards(user.uid)
            .then((cards) =>
              setUserHasBusinessCardWithBId(cards.some((card) => String(card?.bId || '').trim().length > 0)),
            )
            .catch(() => undefined);
        }
      }
      appStateRef.current = nextAppState;
    });
    return () => {
      sub.remove();
      unsubAuth();
      headerAvatarFsUnsubRef.current?.();
      headerAvatarFsUnsubRef.current = undefined;
    };
  }, [refreshHeaderAvatar, tr]);

  /** Evita escrituras AsyncStorage en cada micro-cambio de navegación (reduce I/O y contienda en el hilo JS). */
  const lastNavSessionTouchRef = useRef(0);
  useEffect(() => {
    const bumpActivity = () => {
      const u = auth.currentUser?.uid;
      if (!u) return;
      const now = Date.now();
      if (now - lastNavSessionTouchRef.current < 45_000) return;
      lastNavSessionTouchRef.current = now;
      void touchSessionActivityForNonTrusted(u);
    };
    bumpActivity();
    const unsub = navigation.addListener('state', bumpActivity);
    return unsub;
  }, [navigation]);

  useEffect(() => {
    return subscribeSubscriptionPanelOpen((payload) => {
      setSubscriptionScrollSection(payload.scrollSection ?? null);
      setActivePanel('subscription');
      setDrawerVisible(true);
    });
  }, []);

  useEffect(() => {
    return subscribeMyBusinessCardsInventoryChanged(() => {
      const u = auth.currentUser;
      if (!u?.uid) return;
      void listMyBusinessCards(u.uid)
        .then((cards) => setUserHasBusinessCardWithBId(cards.some((card) => String(card?.bId || '').trim().length > 0)))
        .catch(() => undefined);
    });
  }, []);

  useEffect(() => {
    let cfgUnsub: (() => void) | undefined;
    const authUnsub = onAuthStateChanged(auth, (user) => {
      cfgUnsub?.();
      cfgUnsub = undefined;
      if (!user) {
        setRadarTrialEnabledCache(false);
        setRadarTrialRemote(false);
        return;
      }
      cfgUnsub = subscribeMarketRadarRemoteConfig((cfg) => {
        setRadarTrialRemote(cfg.radarTrialEnabled);
      });
    });
    return () => {
      cfgUnsub?.();
      authUnsub();
    };
  }, []);

  const panelTitle = useMemo(() => {
    if (activePanel === 'profile') return tr('Perfil', 'Profile');
    if (activePanel === 'terms') return tr('Términos y Condiciones', 'Terms & Conditions');
    if (activePanel === 'policy') return tr('Política de Uso', 'Usage Policy');
    if (activePanel === 'about') return tr('Acerca de Card-Social', 'About Card-Social');
    if (activePanel === 'privacy') return tr('Cumplimiento de datos Zero-Party y soberanía', 'Zero-Party Data Compliance & Sovereignty');
    if (activePanel === 'subscription') return tr('Suscripción', 'Subscription');
    if (activePanel === 'blocked_users') return tr('Gestión de Relaciones', 'Relationship Manager');
    if (activePanel === 'bunker') return tr('Búnker de Hibernación', 'Hibernation Bunker');
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

  const handleRadarTrialToggle = useCallback(
    async (next: boolean) => {
      if (radarTrialToggling) return;
      try {
        setRadarTrialToggling(true);
        await setDoc(
          doc(db, 'system_config', 'market_radar'),
          { radar_trial_enabled: next, updatedAt: serverTimestamp() },
          { merge: true },
        );
      } catch (e: any) {
        Alert.alert(
          tr('Error', 'Error'),
          userFacingAlertMessage(e, language, tr('No se pudo actualizar la prueba Radar.', 'Could not update Radar trial.')),
        );
      } finally {
        setRadarTrialToggling(false);
      }
    },
    [radarTrialToggling, tr, language],
  );

  const handleSignOut = async () => {
    try {
      const signingOutUid = auth.currentUser?.uid ?? null;
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
      const uid = await getActiveUserId();
      if (!uid) {
        setBlockedUsers([]);
        return;
      }

      const response = await listBlockedRelations({ uid });
      setBlockedUsers(
        response.blockedUsers.map((row) => ({
          uid: row.uid,
          name: row.name,
          userAvatarUrl: row.userAvatarUrl,
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
      const uid = await getActiveUserId();
      if (!uid) { setRelEntries([]); return; }
      const entries = await listRelationshipsByStatus(uid, tab as RelationshipStatus);
      setRelEntries(entries);
    } catch {
      setRelEntries([]);
    } finally {
      setLoadingRel(false);
    }
  };

  const loadBunkerEntries = async () => {
    try {
      setLoadingBunker(true);
      const uid = await getActiveUserId();
      if (!uid) {
        setBunkerEntries([]);
        return;
      }
      const entries = await listRelationshipsByStatus(uid, 'hibernating');
      setBunkerEntries(entries);
    } catch {
      setBunkerEntries([]);
    } finally {
      setLoadingBunker(false);
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
              const actorUid = await getActiveUserId();
              if (!actorUid) return;
              await removeRelEntry(actorUid, entry.uid, entry.status);
              setRelEntries((prev) => prev.filter((e) => e.uid !== entry.uid));
            } catch (err: any) {
              Alert.alert(
                tr('Error', 'Error'),
                userFacingAlertMessage(err, language, tr('No se pudo restaurar.', 'Could not restore.')),
              );
            }
          },
        },
      ]
    );
  };

  const handleBunkerRestore = async (entry: RelationshipEntry) => {
    try {
      const actorUid = await getActiveUserId();
      if (!actorUid) return;
      await removeRelEntry(actorUid, entry.uid, 'hibernating', { skipSensoryEvaporation: true });
      setBunkerEntries((prev) => prev.filter((e) => e.uid !== entry.uid));
      DeviceEventEmitter.emit('cardSocialHibernatingUidsRefresh');
      setDrawerVisible(false);
      setActivePanel('menu');
    } catch (err: any) {
      Alert.alert(
        tr('Error', 'Error'),
        userFacingAlertMessage(err, language, tr('No se pudo restaurar.', 'Could not restore.')),
      );
    }
  };

  const handleBunkerPermanentDelete = (entry: RelationshipEntry) => {
    Alert.alert(
      tr('Eliminar definitivamente', 'Permanently Delete'),
      tr(
        'Vas a eliminar definitivamente esta tarjeta. Esta acción no se puede deshacer.',
        'You are about to permanently delete this card. This action cannot be undone.',
      ),
      [
        { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        {
          text: tr('Aceptar', 'Accept'),
          style: 'destructive',
          onPress: async () => {
            try {
              const actorUid = await getActiveUserId();
              if (!actorUid) return;

              const biometricPassed = await requireBiometricIfPolicyEnabled(
                tr('Confirmar eliminación permanente', 'Confirm permanent deletion'),
              );
              if (!biometricPassed) return;

              const sid = entry.sid != null && String(entry.sid).trim() ? String(entry.sid).trim() : '';
              const bId = entry.bId != null && String(entry.bId).trim() ? String(entry.bId).trim() : '';
              await removeRelationshipBackend({
                uid: actorUid,
                targetUid: entry.uid,
                ...(sid ? { sid } : {}),
                ...(bId ? { bId } : {}),
              });
              await removeRelEntry(actorUid, entry.uid, 'hibernating');

              await loadBunkerEntries();
              DeviceEventEmitter.emit('cardSocialHibernatingUidsRefresh');

              Toast.show({
                type: 'success',
                text1: tr('Tarjeta eliminada permanentemente', 'Card permanently deleted'),
                position: 'bottom',
                visibilityTime: 2500,
              });
            } catch (error: any) {
              console.error('Error en borrado permanente del búnker:', error);
              Alert.alert(
                tr('Error', 'Error'),
                userFacingAlertMessage(error, language, tr('No se pudo eliminar.', 'Could not delete.')),
              );
            }
          },
        },
      ],
    );
  };

  const loadProfile = async () => {
    try {
      setProfileLoading(true);
      const uid = await getActiveUserId();
      if (!uid) {
        setProfileData(null);
        return;
      }

      const userDocRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userDocRef);
      if (!userSnap.exists()) {
        setProfileData(null);
        return;
      }

      const data = userSnap.data() as Record<string, unknown>;
      const firstName = String(data?.firstName || '').trim();
      const lastName = String(data?.lastName || '').trim();
      const userFullName = readUserFullName(data);
      const userNickName = readUserNickName(data);
      const userNickNameLower = readUserNickNameLower(data);
      const lastNicknameChangeRaw = data?.lastNicknameChange ?? data?.nicknameChangedAt;
      const lastNicknameChange =
        lastNicknameChangeRaw &&
        typeof lastNicknameChangeRaw === 'object' &&
        typeof (lastNicknameChangeRaw as { toDate?: () => Date }).toDate === 'function'
          ? (lastNicknameChangeRaw as { toDate: () => Date }).toDate().toISOString()
          : lastNicknameChangeRaw != null
            ? String(lastNicknameChangeRaw)
            : null;

      const nextProfile: EditableProfile = {
        uid,
        userFullName,
        firstName,
        lastName,
        userNickName,
        userNickNameLower,
        email: String(data?.email || auth.currentUser?.email || ''),
        phone: String(data?.phone || ''),
        lastNicknameChange,
      };

      setProfileData(nextProfile);
      setEditFullName(nextProfile.userFullName);
      setEditNickname(nextProfile.userNickName);
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
    return new Intl.DateTimeFormat(intlLocaleTagForAppLanguage(language), {
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
    setEditFullName(profileData.userFullName);
    setEditNickname(profileData.userNickName);
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

    const nicknameChanged = nextNicknameLower !== profileData.userNickNameLower;

    try {
      setProfileSaving(true);

      let nicknameChangeSuccess = true;

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
          const fallback = tr('No se pudo cambiar el nickname.', 'Could not change nickname.');
          const msg = userFacingAlertMessageFromHttp(response.status, data, language, fallback);
          const errCode = String((data as { errorCode?: string })?.errorCode || '').trim();
          if (errCode === 'USERNAME_CHANGE_COOLDOWN') {
            Alert.alert(tr('Cambio bloqueado', 'Change blocked'), msg);
          } else if (errCode === 'USERNAME_ALREADY_IN_USE') {
            Alert.alert(tr('Nickname en uso', 'Nickname taken'), msg);
          } else {
            Alert.alert(tr('No se pudo cambiar el nickname', 'Could not change nickname'), msg);
          }
        }
      }

      if (nicknameChanged && !nicknameChangeSuccess) {
        return;
      }

      // Actualizar nombre y otros campos en Firestore (si cambiaron)
      const splitParts = nextFullName.split(/\s+/).filter(Boolean);
      const nextFirstName = splitParts[0] || profileData.firstName || '';
      const nextLastName = splitParts.slice(1).join(' ') || profileData.lastName || '';

      const updates: Record<string, unknown> = {
        ...firestoreUserFullNameWrite(nextFullName),
        firstName: nextFirstName,
        lastName: nextLastName,
        updatedAt: serverTimestamp(),
      };
      if (nicknameChanged) {
        Object.assign(updates, firestoreUserNickNameWrite(nextNickname), {
          lastNicknameChange: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, 'users', profileData.uid), updates);

      setProfileData((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          userFullName: nextFullName,
          firstName: nextFirstName,
          lastName: nextLastName,
          userNickName: nicknameChanged ? nextNickname : prev.userNickName,
          userNickNameLower: nicknameChanged ? nextNicknameLower : prev.userNickNameLower,
          lastNicknameChange: nicknameChanged ? new Date().toISOString() : prev.lastNicknameChange,
        };
      });

      if (nicknameChanged && auth.currentUser) {
        await auth.currentUser.reload().catch(() => null);
      }

      setProfileModalVisible(false);
      Alert.alert(tr('Perfil actualizado', 'Profile updated'), tr('Los cambios se guardaron correctamente.', 'Changes saved successfully.'));
    } catch (error: any) {
      Alert.alert(
        tr('No se pudo guardar', 'Could not save'),
        userFacingAlertMessage(error, language, tr('Intenta nuevamente.', 'Try again.')),
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const handleUnblock = async (targetUid: string) => {
    try {
      const uid = await getActiveUserId();
      if (!uid) {
        throw new Error(tr('No se pudo validar tu sesión.', 'Could not validate your session.'));
      }

      await unblockRelationship({ uid, targetUid });
      setBlockedUsers((prev) => prev.filter((row) => row.uid !== targetUid));
    } catch (error: any) {
      Alert.alert(
        tr('No se pudo desbloquear', 'Could not unblock'),
        userFacingAlertMessage(error, language, tr('Inténtalo de nuevo.', 'Try again.')),
      );
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

  useEffect(() => {
    if (!drawerVisible) setAdminQuickStatsOpen(false);
  }, [drawerVisible]);

  const formatBlockedMonthYear = (isoDate: string | null) => {
    if (!isoDate) {
      return tr('Bloqueado: --', 'Blocked: --');
    }
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) {
      return tr('Bloqueado: --', 'Blocked: --');
    }
    const formatted = new Intl.DateTimeFormat(intlLocaleTagForAppLanguage(language), {
      month: 'short',
      year: 'numeric',
    }).format(parsed);
    return tr(`Bloqueado: ${formatted}`, `Blocked: ${formatted}`);
  };

  return (
    <View style={[styles.tabRootShell, { backgroundColor: shell.backgroundSolid }]}>
      <Tabs
        initialRouteName="cards"
        screenOptions={{
          tabBarActiveTintColor: shell.ctaAccent,
          tabBarInactiveTintColor: tabInactiveMuted,
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '800',
            letterSpacing: 0.55,
            marginTop: 2,
          },
          tabBarItemStyle: {
            paddingTop: 0,
            paddingBottom: 0,
            justifyContent: 'center',
          },
          tabBarStyle: {
            backgroundColor: shell.surface,
            minHeight:
              Platform.OS === 'ios'
                ? 72 + tabBarInnerVerticalPad * 2 + tabBarBottomInset
                : 64 + tabBarInnerVerticalPad * 2 + tabBarBottomInset,
            paddingTop: tabBarInnerVerticalPad,
            paddingBottom: tabBarInnerVerticalPad + tabBarBottomInset,
            borderTopWidth: 0,
            marginHorizontal: 0,
            width: '100%' as const,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.35,
            shadowRadius: 10,
            elevation: 16,
          },
          /**
           * Fila única: [menú + idioma] flex | [logo + CARD-SOCIAL] | [perfil] flex
           * La marca queda centrada en el hueco real entre toggle y perfil.
           */
          header: () => (
            <View
              style={[
                styles.headerBarRoot,
                {
                  backgroundColor: shell.backgroundSolid,
                  borderBottomColor: shell.modalBorder,
                  paddingTop: insets.top,
                },
              ]}
            >
              <View style={styles.headerBarRow}>
                <View style={[styles.headerBarEdge, styles.headerBarEdgeStart]}>
                  <TouchableOpacity
                    onPress={() => {
                      setActivePanel('menu');
                      setDrawerVisible(true);
                    }}
                    style={styles.headerIconHit}
                    accessibilityLabel={tr('Abrir menú', 'Open menu')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialCommunityIcons name="menu" size={26} color={shell.ctaAccent} />
                    {userIsSuperAdmin && adminPendingReports > 0 ? (
                      <View style={styles.menuBadge}>
                        <Text style={styles.menuBadgeText}>
                          {adminPendingReports > 99 ? '99+' : adminPendingReports}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                  <LanguageToggle />
                </View>
                <View style={styles.headerBrandCenter} pointerEvents="none">
                  <View style={styles.headerBrandWrap}>
                    <Image
                      source={brandCsIconLogo}
                      style={styles.headerBrandLogo}
                      resizeMode="contain"
                      accessibilityIgnoresInvertColors
                    />
                    <Text
                      style={[styles.headerBrandText, { color: shell.ctaAccent, flex: 1, minWidth: 0 }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                      allowFontScaling
                    >
                      {tr('Card-Social', 'Card-Social')}
                    </Text>
                  </View>
                </View>
                <View style={[styles.headerBarEdge, styles.headerBarEdgeEnd]}>
                  <View style={styles.headerBarEndCluster}>
                    <NotificationBell accent={shell.ctaAccent} />
                    <TouchableOpacity
                      onPress={() => {
                        setDrawerVisible(false);
                        router.push('/(tabs)/myprofile' as any);
                      }}
                      style={styles.headerIconHit}
                      accessibilityLabel={tr('Mi perfil', 'My profile')}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                    {headerAvatarUrl ? (
                      <ExpoImage
                        source={{ uri: headerAvatarUrl }}
                        style={[styles.headerProfileAvatar, { borderColor: shell.ctaAccent }]}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={120}
                        key={headerAvatarUrl}
                      />
                    ) : (
                      <MaterialCommunityIcons name="account-circle-outline" size={36} color={shell.ctaAccent} />
                    )}
                  </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          ),
        }}>
        <Tabs.Screen
          name="dashboard"
          options={{
            title: tr('Analítica', 'Analytics'),
            href: dashboardTabVisible ? undefined : null,
            tabBarIcon: ({ focused }) => (
              <PremiumTabIcon Icon={DashboardTabGlyph} focused={focused} accent={shell.ctaAccent} onAccent={shell.emptyCtaText} inactiveColor={tabInactiveMuted} />
            ),
          }}
        />
        <Tabs.Screen
          name="vault"
          options={{
            title: tr('Bóveda', 'Vault'),
            tabBarIcon: ({ focused }) => (
              <PremiumTabIcon Icon={Database} focused={focused} accent={shell.ctaAccent} onAccent={shell.emptyCtaText} inactiveColor={tabInactiveMuted} />
            ),
          }}
        />
        <Tabs.Screen
          name="cards"
          options={{
            title: tr('Tarjetas', 'Cards'),
            tabBarIcon: ({ focused }) => (
              <PremiumTabIcon Icon={CreditCard} focused={focused} accent={shell.ctaAccent} onAccent={shell.emptyCtaText} inactiveColor={tabInactiveMuted} />
            ),
          }}
        />
        <Tabs.Screen
          name="contacts"
          options={{
            title: tr('Contactos', 'Contacts'),
            tabBarIcon: ({ focused }) => (
              <PremiumTabIcon Icon={Users} focused={focused} accent={shell.ctaAccent} onAccent={shell.emptyCtaText} inactiveColor={tabInactiveMuted} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: tr('Mercado Social', 'Social Market'),
            tabBarIcon: ({ focused }) => (
              <PremiumTabIcon Icon={Search} focused={focused} accent={shell.ctaAccent} onAccent={shell.emptyCtaText} inactiveColor={tabInactiveMuted} />
            ),
          }}
        />
        <Tabs.Screen
          name="calls"
          options={{
            title: tr('Llamadas', 'Calls'),
            tabBarIcon: ({ focused }) => (
              <PremiumTabIcon Icon={Phone} focused={focused} accent={shell.ctaAccent} onAccent={shell.emptyCtaText} inactiveColor={tabInactiveMuted} />
            ),
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
          <BlurView intensity={resolvedMode === 'noche' ? 38 : 34} tint={resolvedMode === 'noche' ? 'dark' : 'light'} style={styles.drawerShell}>
            <LinearGradient
              colors={[...shell.luxuryFrameGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.drawerGradientBorder}
            >
              <View style={[styles.drawerInner, { backgroundColor: shell.modalBg }]}>
                <View style={[styles.drawerHeader, { borderBottomColor: shell.modalBorder }]}>
                  {activePanel !== 'menu' ? (
                    <TouchableOpacity
                      style={styles.drawerBackBtn}
                      onPress={() => setActivePanel('menu')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={tr('Volver al menú', 'Back to menu')}
                    >
                      <MaterialCommunityIcons name="chevron-left" size={24} color={shell.ctaAccent} />
                    </TouchableOpacity>
                  ) : null}
                  <Text style={[styles.drawerTitle, { color: shell.modalTitle }]}>{panelTitle}</Text>
                  <TouchableOpacity onPress={() => setDrawerVisible(false)} accessibilityLabel={tr('Cerrar menú', 'Close menu')}>
                    <MaterialCommunityIcons name="close" size={24} color={shell.ctaAccent} />
                  </TouchableOpacity>
                </View>

                {/* Créditos: sin caja clara; línea fina bajo el bloque */}
                {activePanel === 'menu' && (
                  <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
                    <CreditsIndicator userId={auth.currentUser?.uid || ''} refreshTrigger={creditsRefreshTrigger} />
                  </View>
                )}

                {/* Super admin: reportes solo si hay pendientes; resto tras "Estadísticas admin" */}
                {activePanel === 'menu' && userIsSuperAdmin && (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                    {adminPendingReports > 0 ? (
                      <View style={[styles.adminStatChip, styles.adminStatChipAlert, { alignSelf: 'flex-start', marginBottom: 8 }]}>
                        <MaterialCommunityIcons name="flag-outline" size={14} color={shell.danger} />
                        <Text style={[styles.adminStatLabel, { color: shell.danger }]}>
                          {`${adminPendingReports} ${tr('reportes', 'reports')}`}
                        </Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={styles.drawerItem}
                      onPress={() => setAdminQuickStatsOpen((o) => !o)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: adminQuickStatsOpen }}
                    >
                      <MaterialCommunityIcons name="chart-box-outline" size={20} color={shell.ctaAccent} />
                      <Text style={[styles.drawerItemText, { color: shell.text }]}>
                        {tr('Estadísticas admin', 'Admin statistics')}
                      </Text>
                      <MaterialCommunityIcons
                        name={adminQuickStatsOpen ? 'chevron-up' : 'chevron-down'}
                        size={22}
                        color={shell.textSecondary}
                      />
                    </TouchableOpacity>
                    {adminQuickStatsOpen ? (
                      <View style={[styles.adminStatsStrip, { paddingTop: 6, paddingHorizontal: 0 }]}>
                        <View style={styles.adminStatChip}>
                          <MaterialCommunityIcons name="account-group-outline" size={14} color={shell.ctaAccent} />
                          <Text style={[styles.adminStatLabel, { color: shell.ctaAccent }]}>
                            {adminTotalUsers !== null ? `${adminTotalUsers} ${tr('usuarios', 'users')}` : '...'}
                          </Text>
                        </View>
                        <View style={styles.adminStatChip}>
                          <MaterialCommunityIcons name="cash-multiple" size={14} color={shell.ctaAccent} />
                          <Text style={[styles.adminStatLabel, { color: shell.ctaAccent }]}>
                            {adminTodayRevenue !== null ? `$${adminTodayRevenue.toFixed(2)}` : '...'}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                    <View
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: shell.modalBorder,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={{ color: shell.text, fontWeight: '600', fontSize: 14 }}>
                          {tr('Prueba Radar (global)', 'Radar trial (global)')}
                        </Text>
                        <Text style={{ color: shell.textSecondary, fontSize: 12, marginTop: 4 }}>
                          {tr(
                            'Tier business y acceso Radar para todos. Studio omite gates Pro y tarjeta negocio.',
                            'Business tier and Radar access for everyone. Studio skips Pro and business-card gates.',
                          )}
                        </Text>
                      </View>
                      <Switch
                        value={radarTrialRemote}
                        disabled={radarTrialToggling}
                        onValueChange={(v) => void handleRadarTrialToggle(v)}
                        trackColor={{ false: shell.modalBorder, true: shell.ctaAccent }}
                      />
                    </View>
                  </View>
                )}

                <ConfettiAnimation ref={confettiRef} />

                {activePanel === 'menu' ? (
                  <ScrollView
                    style={styles.drawerMenuList}
                    {...verticalScrollInteractionProps}
                    contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, { paddingBottom: 16 + insets.bottom }]}
                  >
                    <TouchableOpacity
                      style={styles.drawerItem}
                      onPress={() => {
                        setDrawerVisible(false);
                        router.push('/(tabs)/myprofile' as any);
                      }}
                    >
                      <MaterialCommunityIcons name="account-circle-outline" size={20} color={shell.ctaAccent} />
                      <Text style={[styles.drawerItemText, { color: shell.text }]}>{tr('Cuenta', 'Account')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setDrawerVisible(false); router.push('/vault_store'); }}>
                      <MaterialCommunityIcons name="store" size={20} color={shell.ctaAccent} />
                      <Text style={[styles.drawerItemText, { color: shell.text }]}>{tr('Suscripción', 'Subscription')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setDrawerVisible(false); router.push('/nfc'); }}>
                      <MaterialCommunityIcons name="contactless-payment-circle-outline" size={20} color={shell.ctaAccent} />
                      <Text style={[styles.drawerItemText, { color: shell.text }]}>{tr('NFC', 'NFC')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setDrawerVisible(false); router.push('/settings'); }}>
                      <MaterialCommunityIcons name="cog-outline" size={20} color={shell.ctaAccent} />
                      <Text style={[styles.drawerItemText, { color: shell.text }]}>{tr('Configuración', 'Settings')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setActivePanel('terms'); }}>
                      <MaterialCommunityIcons name="file-document-outline" size={20} color={shell.ctaAccent} />
                      <Text style={[styles.drawerItemText, { color: shell.text }]}>{tr('Términos y Condiciones', 'Terms & Conditions')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setActivePanel('policy'); }}>
                      <MaterialCommunityIcons name="shield-lock-outline" size={20} color={shell.ctaAccent} />
                      <Text style={[styles.drawerItemText, { color: shell.text }]}>{tr('Política de Uso', 'Usage Policy')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setActivePanel('about'); }}>
                      <MaterialCommunityIcons name="information-outline" size={20} color={shell.ctaAccent} />
                      <Text style={[styles.drawerItemText, { color: shell.text }]}>{tr('Acerca de Card-Social', 'About Card-Social')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.drawerItem} onPress={() => { setActivePanel('privacy'); }}>
                      <MaterialCommunityIcons name="shield-account-outline" size={20} color={shell.ctaAccent} />
                      <Text style={[styles.drawerItemText, { color: shell.text }]}>
                        {tr('Cumplimiento de datos Zero-Party y soberanía', 'Zero-Party Data Compliance & Sovereignty')}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.drawerItem}
                      onPress={() => {
                        void (async () => {
                          const ok = await requireBiometricIfPolicyEnabled(
                            tr('Gestión de Relaciones', 'Relationship Manager'),
                          );
                          if (!ok) return;
                          setActivePanel('blocked_users');
                          void loadRelEntries('blocked');
                          setRelTab('blocked');
                        })();
                      }}
                    >
                      <MaterialCommunityIcons name="account-cancel-outline" size={20} color={shell.danger} />
                      <Text style={[styles.drawerItemText, { color: shell.danger }]}>{tr('Gestión de Relaciones', 'Relationship Manager')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.drawerItem}
                      onPress={() => {
                        setActivePanel('bunker');
                        void loadBunkerEntries();
                      }}
                    >
                      <MaterialCommunityIcons name="archive-lock-outline" size={20} color={shell.ctaAccent} />
                      <Text style={[styles.drawerItemText, { color: shell.text }]}>
                        {tr('Tarjetas Archivadas', 'Archived Cards')}
                      </Text>
                    </TouchableOpacity>

                    <View style={[styles.lookModeSection, { borderTopColor: shell.modalBorder }]}>
                      <View style={styles.lookModeHeaderRow}>
                        <MaterialCommunityIcons name="theme-light-dark" size={20} color={shell.ctaAccent} />
                        <Text style={[styles.lookModeTitle, { color: shell.text }]}>{tr('Apariencia', 'Appearance')}</Text>
                      </View>
                      <View style={styles.lookModeRow}>
                        <TouchableOpacity
                          style={[
                            styles.lookModeButton,
                            { borderColor: shell.modalBorder, backgroundColor: 'transparent' },
                            mode === 'dia' && { backgroundColor: shell.ctaAccent, borderColor: shell.ctaAccent },
                          ]}
                          onPress={() => setMode('dia')}
                        >
                          <Text
                            style={[
                              styles.lookModeButtonText,
                              { color: shell.text },
                              mode === 'dia' && { color: shell.emptyCtaText },
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.78}
                          >
                            {tr('Día', 'Day')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.lookModeButton,
                            { borderColor: shell.modalBorder, backgroundColor: 'transparent' },
                            mode === 'noche' && { backgroundColor: shell.ctaAccent, borderColor: shell.ctaAccent },
                          ]}
                          onPress={() => setMode('noche')}
                        >
                          <Text
                            style={[
                              styles.lookModeButtonText,
                              { color: shell.text },
                              mode === 'noche' && { color: shell.emptyCtaText },
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.78}
                          >
                            {tr('Noche', 'Night')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.lookModeButton,
                            { borderColor: shell.modalBorder, backgroundColor: 'transparent' },
                            mode === 'auto' && { backgroundColor: shell.ctaAccent, borderColor: shell.ctaAccent },
                          ]}
                          onPress={handleSelectAutoMode}
                        >
                          <Text
                            style={[
                              styles.lookModeButtonText,
                              { color: shell.text },
                              mode === 'auto' && { color: shell.emptyCtaText },
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.78}
                          >
                            {tr('Auto', 'Auto')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {mode === 'auto' ? (
                        <Text
                          style={[styles.lookModeHint, { color: shell.textSecondary }]}
                          numberOfLines={3}
                        >
                          {tr(
                            resolvedMode === 'noche' ? 'Aspecto actual: Noche' : 'Aspecto actual: Día',
                            resolvedMode === 'noche' ? 'Current look: Night' : 'Current look: Day',
                          )}
                          {' · '}
                          {autoStatusText}
                        </Text>
                      ) : null}
                    </View>

                    <TouchableOpacity style={styles.drawerItem} onPress={handleSignOut}>
                      <MaterialCommunityIcons name="logout" size={20} color={shell.ctaAccent} />
                      <Text style={[styles.drawerItemText, { color: shell.text }]}>{tr('Cerrar Sesión', 'Sign Out')}</Text>
                    </TouchableOpacity>
                  </ScrollView>
                ) : activePanel === 'privacy' ? (
                  <ScrollView
                    style={styles.legalScroll}
                    {...verticalScrollInteractionProps}
                    contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, styles.legalContentWrap]}
                  >
                    <Text style={[styles.legalTitle, { color: shell.ctaAccent }]}>
                      {tr('Cumplimiento de datos Zero-Party y soberanía', 'Zero-Party Data Compliance & Sovereignty')}
                    </Text>
                    <Text style={[styles.legalText, { color: shell.modalSubtitle }]}>
                      {tr(
                        'Tus datos personales (nombre, email, teléfono) solo se usan para el funcionamiento de Card-Social. No compartimos tu información con terceros sin tu consentimiento. Puedes solicitar la eliminación de tu cuenta y datos en cualquier momento. También puedes descargar una copia de tus datos personales.',
                        'Your personal data (name, email, phone) is only used for the operation of Card-Social. We do not share your information with third parties without your consent. You can request deletion of your account and data at any time. You can also download a copy of your personal data.'
                      )}
                    </Text>
                    <TouchableOpacity
                      style={[styles.editProfileBtn, { marginTop: 24, backgroundColor: shell.ctaAccent }]}
                      disabled={privacyExporting}
                      onPress={() => {
                        void (async () => {
                          setPrivacyExporting(true);
                          try {
                            await shareExportedUserProfileJson(
                              tr('Tus datos de Card-Social', 'Your Card-Social data'),
                            );
                          } catch {
                            Alert.alert(
                              tr('Error', 'Error'),
                              tr('No se pudieron exportar los datos.', 'Could not export data.'),
                            );
                          } finally {
                            setPrivacyExporting(false);
                          }
                        })();
                      }}
                    >
                      {privacyExporting ? (
                        <ActivityIndicator size="small" color={shell.emptyCtaText} />
                      ) : (
                        <MaterialCommunityIcons name="download" size={16} color={shell.emptyCtaText} />
                      )}
                      <Text style={[styles.editProfileBtnText, { color: shell.emptyCtaText }]}>{tr('Descargar mis datos', 'Download my data')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.editProfileBtn, { marginTop: 16, backgroundColor: '#B7343A' }]}
                      onPress={() => {
                        Alert.alert(
                          tr('Eliminar cuenta', 'Delete account'),
                          tr(
                            'Estás eliminando tu cuenta; tras confirmar, tus datos entrarán en hibernación 30 días. ¿Deseas continuar?',
                            'You are deleting your account; after you confirm, your data enters a 30-day hibernation. Continue?',
                          ),
                          [
                            { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
                            {
                              text: tr('Aceptar', 'Accept'),
                              style: 'destructive',
                              onPress: () => {
                                const user = auth.currentUser;
                                if (!user) return;
                                const scheduledDeadline = computeScheduledDeletionDeadline();
                                const deadlineStr = formatDeletionDeadlineDisplay(scheduledDeadline, language);
                                Alert.alert(
                                  tr('Confirmar eliminación', 'Confirm deletion'),
                                  tr(
                                    `¿Seguro? Tienes hasta 30 días para iniciar sesión y conservar todo. Fecha límite de borrado definitivo: ${deadlineStr}.`,
                                    `Are you sure? You have 30 days to sign in and keep everything. Final deletion date: ${deadlineStr}.`,
                                  ),
                                  [
                                    { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
                                    {
                                      text: tr('Aceptar', 'Accept'),
                                      style: 'destructive',
                                      onPress: () => {
                                        void (async () => {
                                          try {
                                            const userId = user.uid;
                                            const firstNameSrc =
                                              profileData?.userFullName ||
                                              user.displayName ||
                                              '';
                                            await markAccountPendingDeletionInFirestore({
                                              uid: userId,
                                              language,
                                              firstNameForEmail: firstNameSrc,
                                              deadlineDate: scheduledDeadline,
                                            });
                                            Alert.alert(
                                              tr('Cuenta marcada para eliminación', 'Account marked for deletion'),
                                              tr(
                                                `Tu cuenta está en hibernación. Si inicias sesión antes del ${deadlineStr}, se restaurará al instante. Revisa tu correo para los detalles.`,
                                                `Your account is in hibernation. If you sign in before ${deadlineStr}, it will be restored instantly. Check your email for details.`,
                                              ),
                                              [
                                                {
                                                  text: tr('Entendido', 'OK'),
                                                  onPress: () => {
                                                    void (async () => {
                                                      setDrawerVisible(false);
                                                      setActivePanel('menu');
                                                      await clearLocalCachesForSignOut(userId);
                                                      await signOut(auth);
                                                      router.replace('/signin');
                                                    })();
                                                  },
                                                },
                                              ],
                                            );
                                          } catch {
                                            Alert.alert(
                                              tr('Error', 'Error'),
                                              tr(
                                                'No se pudo marcar la cuenta para eliminación. Intenta nuevamente.',
                                                'Could not mark account for deletion. Please try again.',
                                              ),
                                            );
                                          }
                                        })();
                                      },
                                    },
                                  ],
                                );
                              },
                            },
                          ],
                        );
                      }}
                    >
                      <MaterialCommunityIcons name="delete" size={16} color="#FFFFFF" />
                      <Text style={styles.editProfileBtnText}>{tr('Eliminar mi cuenta', 'Delete my account')}</Text>
                    </TouchableOpacity>
                  </ScrollView>
                ) : activePanel === 'profile' ? (
                  <ScrollView
                    style={styles.legalScroll}
                    {...verticalScrollInteractionProps}
                    contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, styles.legalContentWrap]}
                  >
                              {profileLoading ? (
                                <Text style={[styles.legalText, { color: shell.modalSubtitle }]}>{tr('Cargando perfil...', 'Loading profile...')}</Text>
                              ) : !profileData ? (
                                <Text style={[styles.legalText, { color: shell.modalSubtitle }]}>{tr('No se pudo cargar tu perfil.', 'Could not load your profile.')}</Text>
                              ) : (
                                <>
                                  <View style={[styles.profileCard, { backgroundColor: shell.surfaceMuted, borderColor: shell.modalBorder }]}>
                                                  {/* ...existing code... */}
                          <Text style={[styles.profileLabel, { color: shell.ctaAccent }]}>{tr('Nombre', 'Name')}</Text>
                          <Text style={[styles.profileValue, { color: shell.text }]}>{profileData.userFullName}</Text>

                          <Text style={[styles.profileLabel, { color: shell.ctaAccent }]}>{tr('Nickname único', 'Unique Nickname')}</Text>
                          <Text style={[styles.profileValue, { color: shell.text }]}>@{profileData.userNickName}</Text>

                          <Text style={[styles.profileLabel, { color: shell.ctaAccent }]}>{tr('Email (solo lectura)', 'Email (read-only)')}</Text>
                          <Text style={[styles.profileReadonly, { color: shell.textSecondary }]}>{profileData.email || tr('No disponible', 'Not available')}</Text>

                          <Text style={[styles.profileLabel, { color: shell.ctaAccent }]}>{tr('Celular (solo lectura)', 'Phone (read-only)')}</Text>
                          <Text style={[styles.profileReadonly, { color: shell.textSecondary }]}>{profileData.phone || tr('No disponible', 'Not available')}</Text>

                          <Text style={[styles.profileHint, { color: shell.textSecondary }]}>
                            {tr('Puedes editar tu perfil excepto email y celular. El nickname solo se puede cambiar cada 4 semanas.', 'You can edit your profile except email and phone. Nickname can only be changed every 4 weeks.')}
                          </Text>
                        </View>

                        <TouchableOpacity style={[styles.editProfileBtn, { backgroundColor: shell.ctaAccent }]} onPress={openProfileEditor}>
                          <MaterialCommunityIcons name="pencil-outline" size={16} color={shell.emptyCtaText} />
                          <Text style={[styles.editProfileBtnText, { color: shell.emptyCtaText }]}>{tr('Modificar perfil', 'Edit Profile')}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </ScrollView>
                ) : activePanel === 'subscription' ? (
                  <Subscription
                    onClose={() => {
                      setSubscriptionScrollSection(null);
                      setActivePanel('menu');
                    }}
                    initialScrollSection={subscriptionScrollSection}
                    onScrollIntentConsumed={() => setSubscriptionScrollSection(null)}
                  />
                ) : activePanel === 'blocked_users' ? (
                  <View style={styles.legalScroll}>
                    {/* ── 3-tab selector ──────────────────────────────────────── */}
                    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: shell.modalBorder, marginBottom: 12 }}>
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
                            style={{
                              flex: 1,
                              alignItems: 'center',
                              paddingVertical: 10,
                              borderBottomWidth: active ? 2 : 0,
                              borderColor: active ? shell.ctaAccent : 'transparent',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: active ? '700' : '500',
                                color: active ? shell.ctaAccent : shell.textMuted,
                              }}
                            >
                              {tr(labels[tab][0], labels[tab][1])}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* ── List ────────────────────────────────────────────────── */}
                    <ScrollView
                      style={{ flex: 1 }}
                      {...verticalScrollInteractionProps}
                      contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, { paddingBottom: 12 + insets.bottom }]}
                    >
                      {loadingRel ? (
                        <Text style={{ color: shell.textSecondary, textAlign: 'center', marginTop: 24, fontSize: 14 }}>
                          {tr('Cargando…', 'Loading…')}
                        </Text>
                      ) : relEntries.length === 0 ? (
                        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                          <MaterialCommunityIcons
                            name={relTab === 'muted' ? 'volume-off' : relTab === 'restricted' ? 'eye-off-outline' : 'account-cancel-outline'}
                            size={48}
                            color="#B7343A"
                          />
                          <Text style={{ color: shell.text, fontSize: 14, fontWeight: '600', marginTop: 12, textAlign: 'center' }}>
                            {tr(
                              `No tienes usuarios ${relTab === 'muted' ? 'silenciados' : relTab === 'restricted' ? 'restringidos' : 'bloqueados'}.`,
                              `No ${relTab} users.`
                            )}
                          </Text>
                        </View>
                      ) : (
                        relEntries.map((entry) => (
                          <View
                            key={entry.uid}
                            style={[styles.blockedRow, { backgroundColor: shell.surfaceMuted, borderColor: shell.modalBorder }]}
                          >
                            <View style={styles.blockedIdentity}>
                              {entry.userAvatarUrl ? (
                                <Image
                                  source={{
                                    uri: resolveVaultMediaUrlForApp(entry.userAvatarUrl) ?? entry.userAvatarUrl,
                                  }}
                                  style={styles.blockedAvatar}
                                />
                              ) : (
                                <View style={[styles.blockedAvatarFallback, { backgroundColor: shell.inputBg, borderColor: shell.modalBorder }]}>
                                  <MaterialCommunityIcons name="account" size={15} color={shell.ctaAccent} />
                                </View>
                              )}
                              <View style={styles.blockedTextCol}>
                                <Text style={[styles.blockedName, { color: shell.text }]}>{entry.name}</Text>
                                <Text style={[styles.blockedDateText, { color: shell.textSecondary }]}>
                                  {entry.status === 'muted' ? '🔇' : entry.status === 'restricted' ? '👁️‍🗨️' : '🚫'}
                                </Text>
                              </View>
                            </View>
                            <TouchableOpacity style={[styles.unblockBtn, { backgroundColor: shell.ctaAccent }]} onPress={() => handleRelRemove(entry)}>
                              <Text style={[styles.unblockBtnText, { color: shell.emptyCtaText }]}>{tr('Restaurar', 'Restore')}</Text>
                            </TouchableOpacity>
                          </View>
                        ))
                      )}
                    </ScrollView>
                  </View>
                ) : activePanel === 'bunker' ? (
                  <View style={styles.legalScroll}>
                    <ScrollView
                      style={{ flex: 1 }}
                      {...verticalScrollInteractionProps}
                      contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, { paddingBottom: 12 + insets.bottom }]}
                    >
                      {loadingBunker ? (
                        <Text style={{ color: shell.textSecondary, textAlign: 'center', marginTop: 24, fontSize: 14 }}>
                          {tr('Cargando…', 'Loading…')}
                        </Text>
                      ) : bunkerEntries.length === 0 ? (
                        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                          <MaterialCommunityIcons name="archive-lock-outline" size={48} color={shell.ctaAccent} />
                          <Text style={{ color: shell.text, fontSize: 14, fontWeight: '600', marginTop: 12, textAlign: 'center' }}>
                            {tr('No hay tarjetas en el búnker.', 'No cards in the bunker.')}
                          </Text>
                        </View>
                      ) : (
                        bunkerEntries.map((entry) => (
                          <View
                            key={entry.uid}
                            style={[styles.blockedRow, { backgroundColor: shell.surfaceMuted, borderColor: shell.modalBorder }]}
                          >
                            <View style={styles.blockedIdentity}>
                              {entry.userAvatarUrl ? (
                                <Image
                                  source={{
                                    uri: resolveVaultMediaUrlForApp(entry.userAvatarUrl) ?? entry.userAvatarUrl,
                                  }}
                                  style={styles.blockedAvatar}
                                />
                              ) : (
                                <View style={[styles.blockedAvatarFallback, { backgroundColor: shell.inputBg, borderColor: shell.modalBorder }]}>
                                  <MaterialCommunityIcons name="account" size={15} color={shell.ctaAccent} />
                                </View>
                              )}
                              <View style={styles.blockedTextCol}>
                                <Text style={[styles.blockedName, { color: shell.text }]}>{entry.name}</Text>
                                <Text style={[styles.blockedDateText, { color: shell.textSecondary }]}>
                                  {tr('Hibernando', 'Hibernating')}
                                </Text>
                              </View>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <TouchableOpacity
                                style={[styles.unblockBtn, { backgroundColor: shell.ctaAccent }]}
                                onPress={() => void handleBunkerRestore(entry)}
                              >
                                <Text style={[styles.unblockBtnText, { color: shell.emptyCtaText }]}>
                                  {tr('Restaurar', 'Restore')}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleBunkerPermanentDelete(entry)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityRole="button"
                                accessibilityLabel={tr('Eliminar definitivamente', 'Permanently delete')}
                              >
                                <MaterialCommunityIcons name="trash-can-outline" size={24} color={shell.danger} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))
                      )}
                    </ScrollView>
                  </View>
                ) : (
                  <ScrollView
                    style={styles.legalScroll}
                    {...verticalScrollInteractionProps}
                    contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, styles.legalContentWrap]}
                  >
                    {legalContent.map((line, index) => (
                      <View style={styles.legalLine} key={`${activePanel}-${index}`}>
                        <MaterialCommunityIcons name="chevron-right" size={16} color={shell.ctaAccent} />
                        <Text style={[styles.legalText, { color: shell.modalSubtitle }]}>{line}</Text>
                      </View>
                    ))}
                  </ScrollView>
                )}

              </View>
            </LinearGradient>
          </BlurView>
          <Pressable style={[styles.drawerBackdrop, { backgroundColor: shell.overlayScrim }]} onPress={() => setDrawerVisible(false)} />
        </View>
      </Modal>

      <Modal
        visible={profileModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={[styles.profileModalOverlay, { backgroundColor: shell.overlayScrim }]}>
              <View style={[styles.profileModalCard, { backgroundColor: shell.modalBg, borderColor: shell.modalBorder }]}>
                <Text style={[styles.profileModalTitle, { color: shell.modalTitle }]}>{tr('Modificar Perfil', 'Edit Profile')}</Text>

                <KeyboardAwareScrollView
                  style={styles.profileModalKeyboardWrap}
                  {...formKeyboardScrollViewProps}
                  showsVerticalScrollIndicator={false}
                  bottomOffset={42}
                  contentContainerStyle={[SCROLL_CONTENT_MIN_FILL, styles.profileFormWrap]}
                >
                  <Text style={[styles.inputLabel, { color: shell.ctaAccent }]}>{tr('Nombre visible', 'Display Name')}</Text>
                  <TextInput
                    style={[styles.profileInput, { backgroundColor: shell.inputBg, color: shell.inputText, borderColor: shell.modalBorder }]}
                    value={editFullName}
                    onChangeText={setEditFullName}
                    placeholder={tr('Nombre completo', 'Full name')}
                    placeholderTextColor={shell.textMuted}
                  />

                  <Text style={[styles.inputLabel, { color: shell.ctaAccent }]}>{tr('Nickname único', 'Unique Nickname')}</Text>
                  <TextInput
                    style={[styles.profileInput, { backgroundColor: shell.inputBg, color: shell.inputText, borderColor: shell.modalBorder }]}
                    value={editNickname}
                    onChangeText={setEditNickname}
                    placeholder="nickname"
                    autoCapitalize="none"
                    placeholderTextColor={shell.textMuted}
                  />

                  <Text style={[styles.inputLabel, { color: shell.ctaAccent }]}>{tr('Email (bloqueado)', 'Email (locked)')}</Text>
                  <View style={[styles.profileReadOnlyInput, { backgroundColor: shell.surfaceMuted, borderColor: shell.modalBorder }]}>
                    <Text style={[styles.profileReadOnlyText, { color: shell.textSecondary }]}>{profileData?.email || tr('No disponible', 'Not available')}</Text>
                  </View>

                  <Text style={[styles.inputLabel, { color: shell.ctaAccent }]}>{tr('Celular (bloqueado)', 'Phone (locked)')}</Text>
                  <View style={[styles.profileReadOnlyInput, { backgroundColor: shell.surfaceMuted, borderColor: shell.modalBorder }]}>
                    <Text style={[styles.profileReadOnlyText, { color: shell.textSecondary }]}>{profileData?.phone || tr('No disponible', 'Not available')}</Text>
                  </View>

                  <Text style={[styles.profileHint, { color: shell.textSecondary }]}>
                    {tr('Regla activa: nickname no repetido globalmente y cambio permitido cada 4 semanas.', 'Active rule: nickname must be globally unique and can only be changed every 4 weeks.')}
                  </Text>

                  <View style={[styles.profileModalActions, { paddingBottom: modalFooterBottomPad }]}>
                    <TouchableOpacity
                      style={[styles.profileGhostBtn, { backgroundColor: shell.surfaceMuted, borderWidth: 1, borderColor: shell.modalBorder }]}
                      onPress={() => setProfileModalVisible(false)}
                      disabled={profileSaving}
                    >
                      <Text style={[styles.profileGhostBtnText, { color: shell.ctaAccent }]}>{tr('Cancelar', 'Cancel')}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.profileSaveBtn, { backgroundColor: shell.ctaAccent }]}
                      onPress={saveProfileChanges}
                      disabled={profileSaving}
                    >
                      <Text style={[styles.profileSaveBtnText, { color: shell.emptyCtaText }]}>
                        {profileSaving ? tr('Guardando...', 'Saving...') : tr('Guardar', 'Save')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </KeyboardAwareScrollView>
              </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  tabRootShell: {
    flex: 1,
  },
  tabBarIconFocusedWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 0,
  },
  /** Halo ligero alrededor del glifo; sin relleno sólido. */
  tabBarIconGlowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.38,
    shadowRadius: 8,
    elevation: 6,
  },
  tabBarIconInactiveWrap: {
    minHeight: 44,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBarRoot: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    elevation: 0,
    shadowOpacity: 0,
  },
  headerBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 4,
    paddingTop: 0,
    paddingBottom: 0,
  },
  /** Ancho mínimo simétrico: la marca vive en `headerBrandCenter` (flex 1) y no queda pegada al toggle. */
  headerBarEdge: {
    minWidth: 118,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: 4,
    zIndex: 2,
    elevation: 4,
  },
  headerBarEdgeStart: {
    justifyContent: 'flex-start',
  },
  headerBarEdgeEnd: {
    justifyContent: 'flex-end',
  },
  headerBarEndCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerBrandCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 4,
    overflow: 'hidden',
    zIndex: 0,
  },
  /** Misma huella que antes del agrandado del glifo; 36px cabe con borde dentro de 40. */
  headerIconHit: {
    position: 'relative',
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** Mismo tamaño que `headerBrandLogo` (36×36). */
  headerProfileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  headerBrandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    maxWidth: '100%',
    width: '100%',
  },
  headerBrandLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    flexShrink: 0,
  },
  headerBrandText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    textAlign: 'center',
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
    backgroundColor: 'transparent',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(233,195,73,0.35)',
  },
  adminStatChipAlert: {
    backgroundColor: 'rgba(255,68,68,0.10)',
    borderColor: 'rgba(255,68,68,0.35)',
  },
  adminStatLabel: {
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
  drawerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(233,195,73,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(233,195,73,0.35)',
    marginRight: 8,
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.2,
    flex: 1,
    paddingRight: 8,
  },
  drawerMenuList: {
    gap: 8,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  drawerItemText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  lookModeSection: {
    marginTop: 8,
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    backgroundColor: 'transparent',
    gap: 8,
  },
  lookModeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lookModeTitle: {
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  lookModeButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  lookModeHint: {
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
    color: '#E9C349',
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
    backgroundColor: '#E9C349',
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
    backgroundColor: '#E9C349',
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
    flex: 1,
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
    color: '#E9C349',
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
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  profileGhostBtnText: {
    color: '#E9C349',
    fontWeight: '700',
    fontSize: 13,
  },
  profileSaveBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#E9C349',
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
    color: '#E9C349',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
});