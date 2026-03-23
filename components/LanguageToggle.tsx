import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLanguage } from '@/services/language';

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  const isEnglish = language === 'en';

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, isEnglish && styles.labelActive]}>EN</Text>

      <TouchableOpacity
        style={styles.switch}
        activeOpacity={0.85}
        onPress={() => setLanguage(isEnglish ? 'es' : 'en')}
      >
        <View style={styles.track}>
          <View style={[styles.half, styles.usaHalf]}>
            <Text style={styles.flagText}>🇺🇸</Text>
          </View>
          <View style={[styles.half, styles.esHalf]}>
            <Text style={styles.flagText}>🇪🇸</Text>
          </View>
        </View>
        <View style={[styles.knob, isEnglish ? styles.knobLeft : styles.knobRight]} />
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
  knobLeft: {
    left: 3,
  },
  knobRight: {
    right: 3,
  },
});
