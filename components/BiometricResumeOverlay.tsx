import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getPresidentialSecurityEnabled,
  hardLockCheck,
} from '@/services/biometricAuth';
import { isBiometricResumeSuppressed } from '@/services/biometricResumeSuppression';
import { useCoreT } from '@/services/coreI18n';
import { useLookMode } from '@/services/lookMode';
import { auth } from '@/services/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import palette from '@/app/theme';

/**
 * Bloqueo global al volver de background: depende solo de Seguridad Presidencial.
 * Vive en la raíz para no depender de la jerarquía de tabs.
 */
export default function BiometricResumeOverlay() {
  const t = useCoreT();
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];
  const [locked, setLocked] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const uidRef = useRef<string | null>(auth.currentUser?.uid ?? null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      uidRef.current = user?.uid ?? null;
      if (!user) {
        setLocked(false);
      }
    });

    const sub = AppState.addEventListener('change', (nextState) => {
      const wasBackgrounded = appStateRef.current.match(/inactive|background/) != null;
      appStateRef.current = nextState;
      if (!wasBackgrounded || nextState !== 'active' || !uidRef.current) {
        return;
      }
      void (async () => {
        if (isBiometricResumeSuppressed()) {
          return;
        }
        const policyOn = await getPresidentialSecurityEnabled();
        if (!policyOn || !auth.currentUser) {
          return;
        }
        setLocked(true);
        const ok = await hardLockCheck(t('biometric_resume_app'));
        if (ok) {
          setLocked(false);
        }
      })();
    });

    return () => {
      sub.remove();
      unsubAuth();
    };
  }, [t]);

  return (
    <Modal visible={locked} transparent={false} animationType="none" onRequestClose={() => {}}>
      <View
        style={[
          styles.fill,
          { backgroundColor: shell.backgroundSolid, alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        <MaterialCommunityIcons name="shield-lock-outline" size={64} color={shell.ctaAccent} />
        <Text style={{ marginTop: 24, fontSize: 18, fontWeight: '700', color: shell.textPrimary }}>
          {t('profile_presidential_title')}
        </Text>
        <TouchableOpacity
          style={{
            marginTop: 32,
            paddingVertical: 14,
            paddingHorizontal: 24,
            backgroundColor: shell.ctaAccent,
            borderRadius: 12,
          }}
          onPress={async () => {
            const unlocked = await hardLockCheck(t('biometric_resume_app'));
            if (unlocked) {
              setLocked(false);
            }
          }}
        >
          <Text style={{ color: shell.emptyCtaText, fontWeight: '700' }}>{t('cards_unlock')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
