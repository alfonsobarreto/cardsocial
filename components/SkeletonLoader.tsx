/**
 * SkeletonLoader — animated placeholder for loading states.
 * Usage: <SkeletonLoader width={120} height={16} /> or <SkeletonLoader circle size={48} />
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';

type SkeletonProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  circle?: boolean;
  size?: number;
  style?: ViewStyle;
};

export function SkeletonLoader({
  width = '100%',
  height = 16,
  borderRadius = 8,
  circle = false,
  size = 48,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  const resolvedStyle: ViewStyle = circle
    ? { width: size, height: size, borderRadius: size / 2 }
    : { width: width as any, height, borderRadius };

  return <Animated.View style={[styles.base, resolvedStyle, { opacity }, style]} />;
}

/** Row of skeleton lines — quick helper for list placeholders */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLoader key={i} width={i === lines - 1 ? '60%' : '100%'} height={14} style={{ marginBottom: 10 }} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#E0E0E0',
  },
});
