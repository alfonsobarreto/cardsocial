import { useLanguage } from '@/services/language';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const KNOB_LEFT = 3;
const KNOB_RIGHT = 31; // 58 (track) - 24 (knob) - 3 (padding)

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  const isEnglish = language === 'en';
  const knobAnim = useRef(new Animated.Value(isEnglish ? KNOB_LEFT : KNOB_RIGHT)).current;

  useEffect(() => {
    Animated.spring(knobAnim, {
      toValue: isEnglish ? KNOB_LEFT : KNOB_RIGHT,
      useNativeDriver: false,
      friction: 7,
      tension: 60,
    }).start();
  }, [isEnglish]);

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLanguage(isEnglish ? 'es' : 'en');
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, isEnglish && styles.labelActive]}>EN</Text>

      <TouchableOpacity
        style={styles.switch}
        activeOpacity={0.85}
        onPress={handleToggle}
      >
        <View style={styles.track}>
          <View style={[styles.half, styles.usaHalf]}>
            <Text style={styles.flagText}>🇺🇸</Text>
          </View>
          <View style={[styles.half, styles.esHalf]}>
            <Text style={styles.flagText}>🇪🇸</Text>
          </View>
        </View>
        <Animated.View style={[styles.knob, { left: knobAnim }]} />
      </TouchableOpacity>

      <Text style={[styles.label, !isEnglish && styles.labelActive]}>ES</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8AA8C0',
  },
  labelActive: {
    color: '#0D4D8A',
  },
  switch: {
    width: 58,
    height: 30,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.3)',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  track: {
    flexDirection: 'row',
    width: '100%',
    height: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  half: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  usaHalf: {
    backgroundColor: '#1F4E8A',
  },
  esHalf: {
    backgroundColor: '#C73B2A',
  },
  flagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  knob: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(13,77,138,0.45)',
    top: 3,
  },
});
