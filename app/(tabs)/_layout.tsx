import { Tabs } from 'expo-router';
import { Database, CreditCard, Users, Search, PlayCircle, Phone } from 'lucide-react-native';
import { useEffect, useMemo, useState, useRef } from 'react';
import {
  Alert,
  Image,
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
  Keyboard,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { auth } from '@/services/firebaseConfig';
import { signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { getActiveUserId } from '@/services/authSession';
import { listBlockedRelations, unblockRelationship } from '@/services/qrApi';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';
import { CreditsIndicator } from '@/components/CreditsIndicator';
import { ConfettiAnimation, ConfettiAnimationRef } from '@/components/ConfettiAnimation';
import Subscription from '@/components/Subscription';
import { applyWelcomeBonus, initializeUserCredits } from '@/services/creditsService';
import { isSuperAdmin } from '@/services/roleService';
import IconStore from '@/components/IconStore';

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
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activePanel, setActivePanel] = useState<'menu' | 'profile' | 'terms' | 'policy' | 'about' | 'privacy' | 'subscription' | 'icon_store'>('menu');
  const [creditsRefreshTrigger, setCreditsRefreshTrigger] = useState(0);
  const [welcomeBonusApplied, setWelcomeBonusApplied] = useState(false);
  const [userIsSuperAdmin, setUserIsSuperAdmin] = useState(false);
  const confettiRef = useRef<ConfettiAnimationRef>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileData, setProfileData] = useState<EditableProfile | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const router = useRouter();

  const panelTitle = useMemo(() => {
    if (activePanel === 'profile') return 'Perfil';
    if (activePanel === 'terms') return 'Términos y Condiciones';
    if (activePanel === 'policy') return 'Política de Uso';
    if (activePanel === 'about') return 'Acerca de Card-Social';
    if (activePanel === 'privacy') return 'Privacidad';
    if (activePanel === 'subscription') return 'Tienda del Búnker';
    if (activePanel === 'icon_store') return '🎨 Tienda de Iconos';
    return 'Menú';
  }, [activePanel]);

  const legalContent = useMemo(() => {
    if (activePanel === 'terms') {
      return [
        'Card-Social funciona como una bóveda digital para compartir acceso, no para exponer datos sensibles.',
        'Si un usuario decide abrir enlaces externos (wa.me, mailto, etc.), acepta que su información puede quedar visible fuera del ecosistema protegido.',
        'El uso de llamadas y herramientas de contacto está prohibido para acoso, spam, fraude o suplantación de identidad.',
        'Card-Social puede suspender cuentas con comportamiento abusivo y aplicar bloqueo permanente de dispositivo en casos graves.',
      ];
    }

    if (activePanel === 'policy') {
      return [
        'Todo archivo o selfie pasa por validación de seguridad con IA antes de guardarse en la nube.',
        'Está prohibido subir contenido sexual explícito, gore, violencia extrema o material ilegal.',
        'Intentos repetidos de contenido prohibido activan controles de seguridad, incluyendo bloqueo temporal de reintentos.',
        'El sistema puede rechazar contenido que no cumpla estándares de seguridad y confianza de la comunidad.',
      ];
    }

    if (activePanel === 'about') {
      return [
        'Card-Social nació para devolver al usuario el control total de su información personal y profesional.',
        'Nuestra misión es reemplazar el intercambio inseguro de datos por accesos inteligentes, verificados y actualizados en tiempo real.',
        'Confianza, elegancia y simplicidad: esa es la base del diseño y de toda la experiencia de producto.',
      ];
    }

    return [];
  }, [activePanel]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch {
      // Keep UX smooth even if session was already anonymous or expired.
    } finally {
      setDrawerVisible(false);
      setActivePanel('menu');
      router.replace('/');
    }
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
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  };

  const openProfileEditor = () => {
    if (!profileData) {
      Alert.alert('Perfil no disponible', 'No se pudo cargar tu perfil en este momento.');
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
      Alert.alert('Nombre requerido', 'Debes mantener un nombre visible en tu perfil.');
      return;
    }
    if (!nextNickname) {
      Alert.alert('Nickname requerido', 'El nickname es obligatorio y unico.');
      return;
    }

    const nicknameChanged = nextNicknameLower !== profileData.nicknameLower;
    const unlockDate = computeNicknameUnlockDate(profileData.lastNicknameChange);

    if (nicknameChanged && unlockDate && Date.now() < unlockDate.getTime()) {
      Alert.alert(
        'Cambio bloqueado',
        `No puedes cambiar tu nickname todavia. Podras modificarlo de nuevo el ${formatCooldownDate(unlockDate)}.`
      );
      return;
    }

    try {
      setProfileSaving(true);

      if (nicknameChanged) {
        const usersRef = collection(db, 'users');
        const nicknameSnap = await getDocs(query(usersRef, where('nicknameLower', '==', nextNicknameLower), limit(1)));
        const takenByAnother = nicknameSnap.docs.some((docSnap) => docSnap.id !== profileData.uid);
        if (takenByAnother) {
          Alert.alert('Nickname en uso', 'Ese nickname ya pertenece a otro usuario.');
          return;
        }
      }

      const splitParts = nextFullName.split(/\s+/).filter(Boolean);
      const nextFirstName = splitParts[0] || profileData.firstName || '';
      const nextLastName = splitParts.slice(1).join(' ') || profileData.lastName || '';

      const updates: Record<string, any> = {
        fullName: nextFullName,
        firstName: nextFirstName,
        lastName: nextLastName,
        updatedAt: serverTimestamp(),
      };

      if (nicknameChanged) {
        updates.nickname = nextNickname;
        updates.nicknameLower = nextNicknameLower;
        updates.lastNicknameChange = serverTimestamp();
        updates.nicknameChangedAt = serverTimestamp();
      }

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
      Alert.alert('Perfil actualizado', 'Los cambios se guardaron correctamente.');
    } catch (error: any) {
      Alert.alert('No se pudo guardar', error?.message || 'Intenta nuevamente.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleUnblock = async (targetUid: string) => {
    try {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) {
        throw new Error('No se pudo validar tu sesión.');
      }

      await unblockRelationship({ ownerUid, targetUid });
      setBlockedUsers((prev) => prev.filter((row) => row.uid !== targetUid));
    } catch (error: any) {
      Alert.alert('No se pudo desbloquear', error?.message || 'Inténtalo de nuevo.');
    }
  };

  // Check if user is super_admin when drawer opens
  useEffect(() => {
    const checkSuperAdmin = async () => {
      try {
        const uid = await getActiveUserId();
        if (uid) {
          const isSuperAdminUser = await isSuperAdmin(uid);
          setUserIsSuperAdmin(isSuperAdminUser);
        }
      } catch (error) {
        console.error('Error checking super_admin status:', error);
      }
    };

    if (drawerVisible) {
      checkSuperAdmin();
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
      return 'Bloqueado: --';
    }
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) {
      return 'Bloqueado: --';
    }
    const formatted = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      year: 'numeric',
    }).format(parsed);
    return `Bloqueado: ${formatted}`;
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
            backgroundColor: 'rgba(255,255,255,0.85)',
            height: 60,
            borderTopColor: 'rgba(13,77,138,0.18)',
          },
          headerStyle: { backgroundColor: '#0A1A2F', height: 90 },
          headerTintColor: '#D4AF37',
          headerTitleAlign: 'center',
          headerTitle: () => (
            <View style={styles.headerBrandWrap}>
              <View style={styles.logoFrame}>
                <Image source={require('../../assets/images/CS Icon Logo.png')} style={styles.headerLogo} />
              </View>
              <Text style={styles.headerBrandText}>Card-Social</Text>
            </View>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                setActivePanel('menu');
                setDrawerVisible(true);
              }}
              style={styles.headerMenuButton}
            >
              <MaterialCommunityIcons name="menu" size={24} color="#D4AF37" />
            </TouchableOpacity>
          ),
        }}>
        <Tabs.Screen
          name="vault"
          options={{
            title: 'Bóveda',
            tabBarIcon: ({ color }) => <Database color={color} size={24} />,
          }}
        />
        <Tabs.Screen
          name="cards"
          options={{
            title: 'Tarjetas',
            tabBarIcon: ({ color }) => <CreditCard color={color} size={24} />,
          }}
        />
        <Tabs.Screen
          name="contacts"
          options={{
            title: 'Contactos',
            tabBarIcon: ({ color }) => <Users color={color} size={24} />,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Buscar',
            tabBarIcon: ({ color }) => <Search color={color} size={24} />,
          }}
        />
        <Tabs.Screen
          name="stories"
          options={{
            title: 'Historias',
            tabBarIcon: ({ color }) => <PlayCircle color={color} size={24} />,
          }}
        />
        <Tabs.Screen
          name="calls"
          options={{
            title: 'Llamadas',
            tabBarIcon: ({ color }) => <Phone color={color} size={24} />,
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
                  <TouchableOpacity onPress={() => setDrawerVisible(false)}>
                    <MaterialCommunityIcons name="close" size={24} color="#0D4D8A" />
                  </TouchableOpacity>
                </View>

                {/* Credits Indicator - Always Visible in Menu */}
                {activePanel === 'menu' && (
                  <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                    <CreditsIndicator userId={auth.currentUser?.uid || ''} refreshTrigger={creditsRefreshTrigger} />
                  </View>
                )}

                <ConfettiAnimation ref={confettiRef} />

                {activePanel === 'menu' ? (
                  <View style={styles.drawerMenuList}>
                    <TouchableOpacity style={styles.drawerItem} onPress={() => setActivePanel('terms')}>
                      <MaterialCommunityIcons name="file-document-outline" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>Términos y Condiciones</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.drawerItem} onPress={() => setActivePanel('policy')}>
                      <MaterialCommunityIcons name="shield-lock-outline" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>Política de Uso</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.drawerItem} onPress={() => setActivePanel('about')}>
                      <MaterialCommunityIcons name="information-outline" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>Acerca de Card-Social</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.drawerItem} onPress={() => setActivePanel('privacy')}>
                      <MaterialCommunityIcons name="shield-account-outline" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>Privacidad</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.drawerItem} onPress={() => setActivePanel('profile')}>
                      <MaterialCommunityIcons name="account-circle-outline" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>Mi Perfil</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.drawerItem} onPress={() => setActivePanel('subscription')}>
                      <MaterialCommunityIcons name="store" size={18} color="#C5A065" />
                      <Text style={[styles.drawerItemText, { color: '#C5A065', fontWeight: '600' }]}>Tienda del Búnker</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.drawerItem} onPress={() => setActivePanel('icon_store')}>
                      <MaterialCommunityIcons name="palette-outline" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>🎨 Tienda de Iconos</Text>
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

                    <TouchableOpacity style={styles.drawerItem}>
                      <MaterialCommunityIcons name="cog-outline" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>Configuración</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.drawerItem}>
                      <MaterialCommunityIcons name="qrcode-scan" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>Mis QR (Próximamente)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.drawerItem} onPress={handleSignOut}>
                      <MaterialCommunityIcons name="logout" size={18} color="#0D4D8A" />
                      <Text style={styles.drawerItemText}>Cerrar Sesión</Text>
                    </TouchableOpacity>
                  </View>
                ) : activePanel === 'privacy' ? (
                  <ScrollView style={styles.legalScroll} contentContainerStyle={styles.legalContentWrap}>
                    {loadingBlocked ? (
                      <Text style={styles.legalText}>Cargando bloqueados...</Text>
                    ) : blockedUsers.length === 0 ? (
                      <Text style={styles.legalText}>No tienes usuarios bloqueados.</Text>
                    ) : (
                      blockedUsers.map((user) => (
                        <View key={user.uid} style={styles.blockedRow}>
                          <View style={styles.blockedIdentity}>
                            {user.photoUrl ? (
                              <Image source={{ uri: user.photoUrl }} style={styles.blockedAvatar} />
                            ) : (
                              <View style={styles.blockedAvatarFallback}>
                                <MaterialCommunityIcons name="account" size={15} color="#0D4D8A" />
                              </View>
                            )}
                            <View style={styles.blockedTextCol}>
                              <Text style={styles.blockedName}>{user.name}</Text>
                              <Text style={styles.blockedDateText}>{formatBlockedMonthYear(user.createdAt)}</Text>
                            </View>
                          </View>

                          <TouchableOpacity
                            style={styles.unblockBtn}
                            onPress={() => {
                              Alert.alert('Desbloquear usuario', 'Al desbloquear, este contacto podra escanear tus QR nuevamente.', [
                                { text: 'Cancelar', style: 'cancel' },
                                {
                                  text: 'Desbloquear',
                                  style: 'destructive',
                                  onPress: () => handleUnblock(user.uid),
                                },
                              ]);
                            }}
                          >
                            <Text style={styles.unblockBtnText}>Desbloquear</Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </ScrollView>
                ) : activePanel === 'profile' ? (
                  <ScrollView style={styles.legalScroll} contentContainerStyle={styles.legalContentWrap}>
                    {profileLoading ? (
                      <Text style={styles.legalText}>Cargando perfil...</Text>
                    ) : !profileData ? (
                      <Text style={styles.legalText}>No se pudo cargar tu perfil.</Text>
                    ) : (
                      <>
                        <View style={styles.profileCard}>
                          <Text style={styles.profileLabel}>Nombre</Text>
                          <Text style={styles.profileValue}>{profileData.fullName}</Text>

                          <Text style={styles.profileLabel}>Nickname único</Text>
                          <Text style={styles.profileValue}>@{profileData.nickname}</Text>

                          <Text style={styles.profileLabel}>Email (solo lectura)</Text>
                          <Text style={styles.profileReadonly}>{profileData.email || 'No disponible'}</Text>

                          <Text style={styles.profileLabel}>Celular (solo lectura)</Text>
                          <Text style={styles.profileReadonly}>{profileData.phone || 'No disponible'}</Text>

                          <Text style={styles.profileHint}>
                            Puedes editar tu perfil excepto email y celular. El nickname solo se puede cambiar cada 4 semanas.
                          </Text>
                        </View>

                        <TouchableOpacity style={styles.editProfileBtn} onPress={openProfileEditor}>
                          <MaterialCommunityIcons name="pencil-outline" size={16} color="#FFFFFF" />
                          <Text style={styles.editProfileBtnText}>Modificar perfil</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </ScrollView>
                ) : activePanel === 'subscription' ? (
                  <Subscription onClose={() => setActivePanel('menu')} />
                ) : activePanel === 'icon_store' ? (
                  <IconStore />
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
                    <Text style={styles.backToMenuText}>Volver al menú</Text>
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
                <Text style={styles.profileModalTitle}>Modificar Perfil</Text>

                <ScrollView
                  keyboardDismissMode="on-drag"
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.profileFormWrap}
                >
                  <Text style={styles.inputLabel}>Nombre visible</Text>
                  <TextInput
                    style={styles.profileInput}
                    value={editFullName}
                    onChangeText={setEditFullName}
                    placeholder="Nombre completo"
                    placeholderTextColor="#7AA6C1"
                  />

                  <Text style={styles.inputLabel}>Nickname único</Text>
                  <TextInput
                    style={styles.profileInput}
                    value={editNickname}
                    onChangeText={setEditNickname}
                    placeholder="nickname"
                    autoCapitalize="none"
                    placeholderTextColor="#7AA6C1"
                  />

                  <Text style={styles.inputLabel}>Email (bloqueado)</Text>
                  <View style={styles.profileReadOnlyInput}>
                    <Text style={styles.profileReadOnlyText}>{profileData?.email || 'No disponible'}</Text>
                  </View>

                  <Text style={styles.inputLabel}>Celular (bloqueado)</Text>
                  <View style={styles.profileReadOnlyInput}>
                    <Text style={styles.profileReadOnlyText}>{profileData?.phone || 'No disponible'}</Text>
                  </View>

                  <Text style={styles.profileHint}>
                    Regla activa: nickname no repetido globalmente y cambio permitido cada 4 semanas.
                  </Text>
                </ScrollView>

                <View style={styles.profileModalActions}>
                  <TouchableOpacity
                    style={styles.profileGhostBtn}
                    onPress={() => setProfileModalVisible(false)}
                    disabled={profileSaving}
                  >
                    <Text style={styles.profileGhostBtnText}>Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.profileSaveBtn}
                    onPress={saveProfileChanges}
                    disabled={profileSaving}
                  >
                    <Text style={styles.profileSaveBtnText}>{profileSaving ? 'Guardando...' : 'Guardar'}</Text>
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
  headerBrandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    marginRight: 14,
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(212,175,55,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
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
});