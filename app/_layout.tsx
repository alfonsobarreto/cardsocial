import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Alert, AppState } from 'react-native';
import { auth, db } from '@/services/firebaseConfig';
import { authenticateWithBiometric, checkBiometricAvailability, hardLockCheck } from '@/services/biometricAuth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
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
        Alert.alert('Email no verificado', 'Debes verificar tu correo antes de entrar al panel privado.');
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
        'Protección biométrica',
        'Activa FaceID/TouchID para proteger tu Búnker y Tarjetas de Negocio.',
        [
          {
            text: 'Ahora no',
            style: 'cancel',
            onPress: async () => {
              await updateDoc(userRef, {
                biometricEnabled: false,
                biometricPreferenceAsked: true,
              });
            },
          },
          {
            text: 'Activar',
            onPress: async () => {
              const ok = await authenticateWithBiometric('Activa protección biométrica en Card-Social', true);
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
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack>
        {/* Forzamos a que la primera pantalla sea el Index (Bienvenida) */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="signin" options={{ title: 'Iniciar sesión' }} />
        <Stack.Screen name="register" options={{ title: 'Registro' }} />
        <Stack.Screen name="scan" options={{ title: 'Escanear Tarjeta', headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}