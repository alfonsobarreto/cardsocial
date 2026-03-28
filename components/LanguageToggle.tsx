import type { AppLanguage } from '@/services/language';
import { SUPPORTED_LANGUAGES, useLanguage } from '@/services/language';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  const [toastVisible, setToastVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === language) ?? SUPPORTED_LANGUAGES[0];

  const openToast = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setToastVisible(true);
  }, []);

  const closeToast = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  }, []);

  useEffect(() => {
    if (toastVisible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 8, tension: 65 }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [toastVisible]);

  const selectLanguage = (code: AppLanguage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLanguage(code);
    closeToast();
  };

  return (
    <>
      {/* ── Compact chip in header ── */}
      <TouchableOpacity
        style={styles.chip}
        activeOpacity={0.7}
        onPress={openToast}
        accessibilityLabel="Change language"
      >
        <Text style={styles.chipFlag}>{current.flag}</Text>
        <Text style={styles.chipCode}>{current.code.toUpperCase()}</Text>
      </TouchableOpacity>

      {/* ── Bottom toast modal ── */}
      <Modal visible={toastVisible} transparent animationType="none" statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={closeToast}>
          <Animated.View style={[styles.backdrop, { opacity: fadeAnim, backgroundColor: 'rgba(10,26,47,0.45)' }]} />
        </Pressable>

        <Animated.View style={[styles.toastContainer, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.toastHandle} />
          <Text style={styles.toastTitle}>🌐 Language</Text>

          {SUPPORTED_LANGUAGES.map((lang) => {
            const isActive = lang.code === language;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langRow, isActive && styles.langRowActive]}
                activeOpacity={0.7}
                onPress={() => selectLanguage(lang.code)}
              >
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <View style={styles.langTextCol}>
                  <Text style={[styles.langLabel, isActive && styles.langLabelActive]}>{lang.label}</Text>
                  <Text style={styles.langCode}>{lang.code.toUpperCase()}</Text>
                </View>
                {isActive && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  /* ── Chip ── */
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212,175,55,0.15)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 4,
  },
  chipFlag: {
    fontSize: 14,
  },
  chipCode: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0D4D8A',
    letterSpacing: 0.5,
  },

  /* ── Backdrop ── */
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },

  /* ── Toast ── */
  toastContainer: {
    position: 'absolute',
    bottom: 0,
    width: SCREEN_WIDTH,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingBottom: 34,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  toastHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0D5DD',
    alignSelf: 'center',
    marginBottom: 14,
  },
  toastTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A1A2F',
    marginBottom: 12,
    textAlign: 'center',
  },

  /* ── Language rows ── */
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  langRowActive: {
    backgroundColor: 'rgba(13,77,138,0.08)',
  },
  langFlag: {
    fontSize: 22,
    marginRight: 12,
  },
  langTextCol: {
    flex: 1,
  },
  langLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0A1A2F',
  },
  langLabelActive: {
    color: '#0D4D8A',
    fontWeight: '700',
  },
  langCode: {
    fontSize: 11,
    color: '#8AA8C0',
    fontWeight: '600',
    marginTop: 1,
  },
  checkmark: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0D4D8A',
  },
});
