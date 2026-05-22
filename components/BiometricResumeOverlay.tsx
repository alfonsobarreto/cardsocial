import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getPresidentialSecurityEnabled } from '@/services/biometricAuth';
import { beginBiometricResumeSuppression, isBiometricResumeSuppressed } from '@/services/biometricResumeSuppression';
import { useCoreT } from '@/services/coreI18n';
import { useLookMode } from '@/services/lookMode';
import { auth } from '@/services/firebaseConfig';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, Text, View } from 'react-native';
import palette from '@/app/theme';

/**
 * Bloqueo biométrico automático: cold boot + swipe-up (AppState background→active).
 *
 * Flujo:
 *   1. Modal opaco aparece al instante (sin botón de desbloqueo).
 *   2. LocalAuthentication.authenticateAsync se dispara inmediatamente.
 *   3. Si pasa → modal desaparece.
 *   4. Si falla / cancela → signOut() + redirect a /signin.
 *
 * isAuthenticatingRef previene llamadas concurrentes.
 * Solo dispara en cold-boot si el usuario ya estaba autenticado (primera emisión de
 * onAuthStateChanged con user != null sin haber visto null primero).
 */
export default function BiometricResumeOverlay() {
  const t = useCoreT();
  const router = useRouter();
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];

  const [locked, setLocked] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const isAuthenticatingRef = useRef(false);
  /** Evita re-disparar al volver del sheet biométrico del sistema (inactive→active). */
  const resumeCooldownUntilRef = useRef(0);

  // Refs to avoid stale closures in async callbacks
  const routerRef = useRef(router);
  routerRef.current = router;
  const tRef = useRef(t);
  tRef.current = t;

  const triggerBiometric = useCallback(async () => {
    if (isAuthenticatingRef.current) return;
    if (Date.now() < resumeCooldownUntilRef.current) return;
    if (!auth.currentUser) return;
    if (isBiometricResumeSuppressed()) return;

    const policyOn = await getPresidentialSecurityEnabled();
    if (!policyOn) return;

    if (!auth.currentUser) return;

    isAuthenticatingRef.current = true;
    setLocked(true);
    const endSuppression = beginBiometricResumeSuppression();

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: tRef.current('biometric_resume_app'),
        fallbackLabel: 'PIN / Contraseña',
        disableDeviceFallback: false,
      });

      resumeCooldownUntilRef.current = Date.now() + 2500;

      if (result.success) {
        setLocked(false);
      } else {
        setLocked(false);
        try { await signOut(auth); } catch { /* ignore */ }
        routerRef.current.replace('/signin' as never);
      }
    } catch {
      resumeCooldownUntilRef.current = Date.now() + 2500;
      setLocked(false);
      try { await signOut(auth); } catch { /* ignore */ }
      routerRef.current.replace('/signin' as never);
    } finally {
      endSuppression();
      isAuthenticatingRef.current = false;
    }
  }, []);

  useEffect(() => {
    /**
     * seenNullFirst: si la primera emisión de onAuthStateChanged fue null (usuario
     * no autenticado al montar), el siguiente user != null es un login normal y NO
     * debe disparar biometría (el usuario ya se autenticó en ese momento).
     */
    let seenNullFirst = false;
    let coldBootHandled = false;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // Sign-out or unauthenticated state
        setLocked(false);
        isAuthenticatingRef.current = false;
        seenNullFirst = true;
        return;
      }
      // Cold boot: first emission with logged-in user (app opened while already authenticated)
      if (!coldBootHandled && !seenNullFirst) {
        coldBootHandled = true;
        void triggerBiometric();
      }
    });

    // Swipe-up / return from background
    const sub = AppState.addEventListener('change', (nextState) => {
      const wasBackgrounded = /inactive|background/.test(appStateRef.current);
      appStateRef.current = nextState;
      if (wasBackgrounded && nextState === 'active') {
        void triggerBiometric();
      }
    });

    return () => {
      sub.remove();
      unsubAuth();
    };
  }, [triggerBiometric]);

  return (
    <Modal
      visible={locked}
      transparent={false}
      animationType="none"
      onRequestClose={() => {
        // Android back button while locked → sign out
        void (async () => {
          try { await signOut(auth); } catch { /* ignore */ }
          routerRef.current.replace('/signin' as never);
        })();
      }}
    >
      <View
        style={[
          styles.fill,
          { backgroundColor: shell.backgroundSolid, alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        <MaterialCommunityIcons name="shield-lock-outline" size={72} color={shell.ctaAccent} />
        <Text
          style={{
            marginTop: 24,
            fontSize: 18,
            fontWeight: '700',
            color: shell.textPrimary,
            textAlign: 'center',
            paddingHorizontal: 32,
          }}
        >
          {t('profile_presidential_title')}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
