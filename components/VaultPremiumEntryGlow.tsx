import React, { useLayoutEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

type Props = {
  /** Pulso de oro + entrada (solo ítems nuevos premium). */
  active: boolean;
  /** `vaultTheme.ctaAccent` / shell (#2F7BFF en tema claro). */
  accentColor: string;
  children: React.ReactNode;
};

/**
 * Micro-interacción Fase 8: escala + fade-in y ~500 ms de borde dorado en la celda del grid.
 */
export default function VaultPremiumEntryGlow({ active, accentColor, children }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const borderGlow = useRef(new Animated.Value(0)).current;
  const runGen = useRef(0);

  useLayoutEffect(() => {
    if (!active) {
      runGen.current += 1;
      scale.setValue(1);
      opacity.setValue(1);
      borderGlow.setValue(0);
      return;
    }

    const gen = ++runGen.current;
    scale.setValue(0.93);
    opacity.setValue(0.72);
    borderGlow.setValue(1);

    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 168,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(borderGlow, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      if (!finished || gen !== runGen.current) return;
      borderGlow.setValue(0);
    });
  }, [active, accentColor, borderGlow, opacity, scale]);

  const ringOpacity = borderGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.92],
  });

  return (
    <View style={styles.cellInner}>
      <Animated.View style={{ width: '100%', opacity, transform: [{ scale }] }}>{children}</Animated.View>
      {active ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              borderColor: accentColor,
              opacity: ringOpacity,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cellInner: {
    width: '100%',
    alignItems: 'center',
    position: 'relative',
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    borderWidth: 2.5,
    marginHorizontal: 2,
    marginVertical: 2,
  },
});
