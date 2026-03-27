import { authenticateWithBiometric, checkBiometricAvailability, hardLockCheck } from '@/services/biometricAuth';
import { auth, db } from '@/services/firebaseConfig';
import { LanguageProvider, useLanguage } from '@/services/language';
import { LookModeProvider } from '@/services/lookMode';
import { Stack, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';

export default function RootLayout() {
  return (
    <LanguageProvider>
      <LookModeProvider>
        <RootNavigator />
      </LookModeProvider>
    </LanguageProvider>
  );
}

function RootNavigator() {
  const router = useRouter();
  const segments = useSegments();
  const { language } = useLanguage();
  const tr = (es: string, en: string) => (language === 'en' ? en : es);
  const lastAppState = useRef(AppState.currentState);
  const biometricPromptShownForUid = useRef<string | null>(null);

  useEffect(() => {
    const inProtectedTabs = segments[0] === '(tabs)';
    if (!inProtectedTabs) {
      return;
    }

    const enforceGuard = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        router.replace('/signin' as never);
        return;
      }

      await currentUser.reload().catch(() => null);
      const refreshedUser = auth.currentUser;
      if (!refreshedUser?.emailVerified) {
        await signOut(auth).catch(() => null);
        Alert.alert(
          tr('Email no verificado', 'Email not verified'),
          tr('Debes verificar tu correo antes de entrar al panel privado.', 'You must verify your email before entering the private dashboard.')
        );
        router.replace('/signin' as never);
      }
    };

    void enforceGuard();
  }, [router, segments]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      const wasBackground = lastAppState.current === 'background' || lastAppState.current === 'inactive';
      lastAppState.current = nextState;

      if (!wasBackground || nextState !== 'active') {
        return;
      }

      if (!auth.currentUser) {
        return;
      }

      const unlocked = await hardLockCheck('reanudar tu sesión');
      if (!unlocked) {
        await signOut(auth);
        router.replace('/signin' as never);
      }
    });

    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        biometricPromptShownForUid.current = null;
        return;
      }

      if (biometricPromptShownForUid.current === user.uid) {
        return;
      }

      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        return;
      }

      const userData = userSnap.data() as { biometricEnabled?: boolean; biometricPreferenceAsked?: boolean };
      if (userData.biometricPreferenceAsked) {
        biometricPromptShownForUid.current = user.uid;
        return;
      }

      const biometric = await checkBiometricAvailability();
      biometricPromptShownForUid.current = user.uid;

      if (!biometric.available) {
        await updateDoc(userRef, {
          biometricEnabled: false,
          biometricPreferenceAsked: true,
        });
        return;
      }

      Alert.alert(
        tr('Protección biométrica', 'Biometric protection'),
        tr('Activa FaceID/TouchID para proteger tu Búnker y Tarjetas de Negocio.', 'Enable FaceID/TouchID to protect your Vault and Business Cards.'),
        [
          {
            text: tr('Ahora no', 'Not now'),
            style: 'cancel',
            onPress: async () => {
              await updateDoc(userRef, {
                biometricEnabled: false,
                biometricPreferenceAsked: true,
              });
            },
          },
          {
            text: tr('Activar', 'Enable'),
            onPress: async () => {
              const ok = await authenticateWithBiometric(
                tr('Activa protección biométrica en Card-Social', 'Enable biometric protection in Card-Social'),
                true
              );
              await updateDoc(userRef, {
                biometricEnabled: ok,
                biometricPreferenceAsked: true,
              });
            },
          },
        ]
      );
    });

    return () => unsubscribe();
  }, [tr]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack>
        {/* Forzamos a que la primera pantalla sea el Index (Bienvenida) */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen 
          name="signin" 
          options={{ 
            title: language === 'en' ? 'Sign In' : 'Iniciar sesion',
            headerStyle: { backgroundColor: '#fff' } // Puedes personalizar el color si quieres
          }} 
        />
        <Stack.Screen name="register" options={{ title: language === 'en' ? 'Sign Up' : 'Registro' }} />
        <Stack.Screen name="scan" options={{ title: language === 'en' ? 'Scan Card' : 'Escanear Tarjeta', headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <Toast />
    </GestureHandlerRootView>
  );
}