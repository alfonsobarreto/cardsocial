import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

type Props = {
  /** Pulse breve dorado tipo destello Ferrari (borde inset, no clipping del Swipeable). */
  visible: boolean;
  /** Preferir `shell.ctaAccent` (≈ #2F7BFF en tema ligero). */
  accentColor: string;
  /** Radio alineado a `ThemedSharedCardSurface` en Contactos. */
  borderRadius?: number;
  children: React.ReactNode;
};

/**
 * Borde pulsante dorado dentro del contenedor de la tarjeta (Fase 8 — diferenciación háptico/sensorial).
 */
export default function BunkerContactPremiumGlow({
  visible,
  accentColor,
  borderRadius = 16,
  children,
}: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const runRef = useRef(0);

  useEffect(() => {
    if (!visible) {
      runRef.current += 1;
      pulse.stopAnimation(() => {});
      pulse.setValue(0);
      return;
    }

    const runId = ++runRef.current;

    pulse.setValue(0);
    const burst = Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 340, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0.35, duration: 280, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 1, duration: 300, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0, duration: 520, useNativeDriver: false }),
    ]);

    burst.start(({ finished }) => {
      if (!finished || runId !== runRef.current) return;
      pulse.setValue(0);
    });

    return () => {
      runRef.current += 1;
      burst.stop();
    };
  }, [visible, pulse]);

  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.95],
  });

  return (
    <View style={styles.wrap}>
      {visible ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              borderRadius,
              borderColor: accentColor,
              opacity: ringOpacity,
            },
          ]}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    width: '100%',
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2.5,
  },
});
