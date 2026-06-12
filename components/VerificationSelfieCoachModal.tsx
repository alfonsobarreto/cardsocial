import type { VerificationSelfieStrings } from '@/constants/verificationSelfieI18n';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  strings: VerificationSelfieStrings;
  onClose: () => void;
  /** Tras cerrar el modal (p. ej. abrir cámara del sistema). */
  onContinue: () => void;
  isNight: boolean;
};

export default function VerificationSelfieCoachModal({
  visible,
  strings,
  onClose,
  onContinue,
  isNight,
}: Props) {
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(1)).current;
  const emojiSwap = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.035, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
      ]),
    );
    const e = Animated.loop(
      Animated.sequence([
        Animated.timing(emojiSwap, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(emojiSwap, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    p.start();
    e.start();
    return () => {
      p.stop();
      e.stop();
    };
  }, [visible, pulse, emojiSwap]);

  const smileOpacity = emojiSwap.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] });
  const winkOpacity = emojiSwap.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });

  const chrome = isNight
    ? {
        overlay: 'rgba(0,0,0,0.72)',
        cardBg: ['#14110C', '#0D0B08'] as const,
        cardBorder: 'rgba(47,123,255,0.45)',
        title: '#F6E6C8',
        headline: '#2F7BFF',
        body: 'rgba(246,230,200,0.88)',
        tip: 'rgba(246,230,200,0.72)',
        chipBg: 'rgba(47,123,255,0.12)',
        ctaGradient: ['#2F7BFF', '#C9A227', '#8A6B18'] as const,
        ctaText: '#1B1205',
        secondary: 'rgba(246,230,200,0.55)',
      }
    : {
        overlay: 'rgba(20,16,12,0.45)',
        cardBg: ['#FFFBF5', '#F3EDE3'] as const,
        cardBorder: 'rgba(180,145,60,0.38)',
        title: '#1B1205',
        headline: '#7A5A12',
        body: 'rgba(27,18,5,0.88)',
        tip: 'rgba(27,18,5,0.72)',
        chipBg: 'rgba(47,123,255,0.18)',
        ctaGradient: ['#4D8FFF', '#2F7BFF', '#6235E0'] as const,
        ctaText: '#1B1205',
        secondary: 'rgba(27,18,5,0.5)',
      };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: chrome.overlay, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityRole="button" accessibilityLabel={strings.coachLater} />
        <Animated.View style={[styles.cardWrap, { transform: [{ scale: pulse }] }]} pointerEvents="box-none">
          <LinearGradient colors={[...chrome.cardBg]} style={[styles.card, { borderColor: chrome.cardBorder }]}>
            <View style={styles.iconHalo}>
              <MaterialCommunityIcons name="face-recognition" size={36} color={chrome.headline} />
            </View>
            <Text style={[styles.title, { color: chrome.title }]}>{strings.coachTitle}</Text>
            <Text style={[styles.headline, { color: chrome.headline }]}>{strings.coachHeadline}</Text>
            <Text style={[styles.body, { color: chrome.body }]}>{strings.coachBody}</Text>

            <View style={styles.emojiRow} accessibilityLabel={strings.coachHeadline}>
              <Animated.Text style={[styles.emoji, { opacity: smileOpacity }]}>😊</Animated.Text>
              <Animated.Text style={[styles.emoji, { opacity: winkOpacity }]}>😉</Animated.Text>
            </View>

            <View style={[styles.tip, { backgroundColor: chrome.chipBg }]}>
              <MaterialCommunityIcons name="white-balance-sunny" size={18} color={chrome.headline} />
              <Text style={[styles.tipText, { color: chrome.tip }]}>{strings.coachTipLight}</Text>
            </View>
            <View style={[styles.tip, { backgroundColor: chrome.chipBg }]}>
              <MaterialCommunityIcons name="focus-auto" size={18} color={chrome.headline} />
              <Text style={[styles.tipText, { color: chrome.tip }]}>{strings.coachTipExpression}</Text>
            </View>

            <Pressable
              onPress={onContinue}
              style={({ pressed }) => [styles.ctaPress, pressed && styles.ctaPressed]}
              accessibilityRole="button"
              accessibilityLabel={strings.coachCta}
            >
              <LinearGradient colors={[...chrome.ctaGradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ctaGrad}>
                <MaterialCommunityIcons name="camera-front-variant" size={22} color={chrome.ctaText} />
                <Text style={[styles.ctaText, { color: chrome.ctaText }]}>{strings.coachCta}</Text>
              </LinearGradient>
            </Pressable>

            <Pressable onPress={onClose} hitSlop={12} style={styles.laterBtn}>
              <Text style={[styles.laterText, { color: chrome.secondary }]}>{strings.coachLater}</Text>
            </Pressable>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  cardWrap: {
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    borderRadius: 22,
    borderWidth: 1.5,
    paddingHorizontal: 22,
    paddingVertical: 24,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  iconHalo: {
    alignSelf: 'center',
    marginBottom: 10,
    padding: 12,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(47,123,255,0.35)',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 6,
  },
  headline: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 14,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 28,
    marginBottom: 16,
    minHeight: 52,
  },
  emoji: {
    fontSize: 44,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  ctaPress: {
    marginTop: 8,
    borderRadius: 14,
    overflow: 'hidden',
  },
  ctaPressed: { opacity: 0.92 },
  ctaGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
  },
  laterBtn: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 6,
  },
  laterText: {
    fontSize: 15,
  },
});
