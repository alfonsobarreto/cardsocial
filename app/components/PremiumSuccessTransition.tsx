import React, { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { coreTrEsEn } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';

type PremiumSuccessTransitionProps = {
  visible: boolean;
  onDone: () => void;
  durationMs?: number;
};

export default function PremiumSuccessTransition({
  visible,
  onDone,
  durationMs = 1800,
}: PremiumSuccessTransitionProps) {
  const { language } = useLanguage();
  const tr = (es: string, en: string) => coreTrEsEn(es, en, language);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const burstScale = useRef(new Animated.Value(0.2)).current;
  const burstOpacity = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(0.7)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const shimmerX = useRef(new Animated.Value(-220)).current;

  useEffect(() => {
    if (!visible) {
      return;
    }

    overlayOpacity.setValue(0);
    burstScale.setValue(0.2);
    burstOpacity.setValue(0);
    badgeScale.setValue(0.7);
    badgeOpacity.setValue(0);
    shimmerX.setValue(-220);

    const shimmer = Animated.loop(
      Animated.timing(shimmerX, {
        toValue: 220,
        duration: 750,
        useNativeDriver: true,
      }),
      { iterations: 2 }
    );

    shimmer.start();

    const sequence = Animated.sequence([
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(burstOpacity, {
          toValue: 0.9,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(burstScale, {
          toValue: 1.45,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.spring(badgeScale, {
          toValue: 1,
          speed: 11,
          bounciness: 7,
          useNativeDriver: true,
        }),
        Animated.timing(badgeOpacity, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(Math.max(0, durationMs - 1100)),
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(badgeOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(burstOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]),
    ]);

    sequence.start(({ finished }) => {
      if (finished) {
        onDone();
      }
    });

    return () => {
      sequence.stop();
      shimmer.stop();
    };
  }, [
    badgeOpacity,
    badgeScale,
    burstOpacity,
    burstScale,
    durationMs,
    onDone,
    overlayOpacity,
    shimmerX,
    visible,
  ]);

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}> 
        <BlurView intensity={55} tint="dark" style={styles.blurFill}>
          <Animated.View
            style={[
              styles.burst,
              {
                opacity: burstOpacity,
                transform: [{ scale: burstScale }],
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(30,167,255,0.34)', 'rgba(188,236,255,0.9)', 'rgba(30,167,255,0.34)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.burstGradient}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.badgeWrap,
              {
                opacity: badgeOpacity,
                transform: [{ scale: badgeScale }],
              },
            ]}
          >
            <LinearGradient
              colors={['#0A2540', '#1EA7FF', '#0A2540']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.badgeGradient}
            >
              <Animated.View
                pointerEvents="none"
                style={[styles.shimmer, { transform: [{ translateX: shimmerX }] }]}
              />
              <MaterialCommunityIcons name="shield-check" size={46} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.title}>{tr('Verificación aprobada', 'Verification approved')}</Text>
            <Text style={styles.subtitle}>{tr('Abriendo tu bóveda premium...', 'Opening your premium vault...')}</Text>
          </Animated.View>
        </BlurView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 37, 64, 0.5)',
  },
  blurFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  burst: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    overflow: 'hidden',
  },
  burstGradient: {
    width: '100%',
    height: '100%',
  },
  badgeWrap: {
    alignItems: 'center',
  },
  badgeGradient: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#BEEAFF',
    overflow: 'hidden',
    shadowColor: '#1EA7FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 16,
  },
  shimmer: {
    position: 'absolute',
    width: 58,
    height: 120,
    backgroundColor: 'rgba(255,255,255,0.35)',
    transform: [{ rotate: '18deg' }],
  },
  title: {
    marginTop: 16,
    color: '#EAF7FF',
    fontSize: 23,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 6,
    color: '#BEEAFF',
    fontSize: 14,
    letterSpacing: 0.3,
  },
});
