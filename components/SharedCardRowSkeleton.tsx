import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

type Props = {
  isDark?: boolean;
  /** Diámetro del círculo avatar (Contactos 90, Mercado ~68). */
  avatarSize?: number;
};

/**
 * Placeholder de fila tipo tarjeta temática (avatar + bloques) con pulso suave.
 */
export function SharedCardRowSkeleton({ isDark, avatarSize = 68 }: Props) {
  const pulse = useRef(new Animated.Value(0.38)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.62,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.38,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [pulse]);

  const bone = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(13,77,138,0.14)';
  const shell = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.65)';
  const avatarR = avatarSize / 2;

  return (
    <View
      style={[
        styles.shell,
        {
          backgroundColor: shell,
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(13,77,138,0.12)',
          minHeight: Math.max(118, avatarSize + 28),
        },
      ]}
    >
      <Animated.View
        style={[
          {
            width: avatarSize,
            height: avatarSize,
            borderRadius: avatarR,
            backgroundColor: bone,
            opacity: pulse,
          },
        ]}
      />
      <View style={styles.col}>
        <Animated.View style={[styles.lineLg, { backgroundColor: bone, opacity: pulse }]} />
        <Animated.View style={[styles.lineMd, { backgroundColor: bone, opacity: pulse }]} />
        <Animated.View style={[styles.lineSm, { backgroundColor: bone, opacity: pulse }]} />
        <View style={styles.row}>
          <Animated.View style={[styles.pill, { backgroundColor: bone, opacity: pulse }]} />
          <Animated.View style={[styles.lineXs, { backgroundColor: bone, opacity: pulse }]} />
        </View>
      </View>
    </View>
  );
}

export function SharedCardSkeletonList({
  count,
  isDark,
  avatarSize,
}: {
  count: number;
  isDark?: boolean;
  avatarSize?: number;
}) {
  return (
    <View style={styles.list} accessibilityRole="progressbar" accessibilityLabel="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <SharedCardRowSkeleton key={i} isDark={isDark} avatarSize={avatarSize} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    borderRadius: 15,
    borderWidth: 1,
  },
  col: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  lineLg: {
    height: 16,
    borderRadius: 6,
    width: '78%',
  },
  lineMd: {
    height: 13,
    borderRadius: 5,
    width: '55%',
  },
  lineSm: {
    height: 10,
    borderRadius: 4,
    width: '40%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  pill: {
    width: 56,
    height: 26,
    borderRadius: 999,
  },
  lineXs: {
    height: 10,
    borderRadius: 4,
    flex: 1,
    maxWidth: 120,
  },
});
