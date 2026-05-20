import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type SecondaryStackHeaderVariant = 'back' | 'close';

type Props = {
  title?: string;
  onDismiss?: () => void;
  /** Default: router.back() */
  variant?: SecondaryStackHeaderVariant;
  accentColor: string;
  backgroundColor: string;
  borderColor: string;
  titleColor: string;
  style?: ViewStyle;
};

/**
 * Barra superior consistente para pantallas fuera del stack nativo (`headerShown: false`):
 * útil en Android para no depender solo del gesto “atrás” del sistema.
 */
export function SecondaryStackHeader({
  title,
  onDismiss,
  variant = 'back',
  accentColor,
  backgroundColor,
  borderColor,
  titleColor,
  style,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const iconName = variant === 'close' ? 'close' : Platform.OS === 'ios' ? 'chevron-left' : 'arrow-left';

  return (
    <View
      style={[
        styles.row,
        {
          paddingTop: insets.top + 6,
          paddingBottom: 10,
          backgroundColor,
          borderBottomColor: borderColor,
        },
        style,
      ]}
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={variant === 'close' ? 'Cerrar' : 'Atrás'}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={styles.hit}
        onPress={() => {
          if (onDismiss) {
            onDismiss();
            return;
          }
          router.back();
        }}
      >
        <MaterialCommunityIcons name={iconName} size={26} color={accentColor} />
      </TouchableOpacity>
      {title ? (
        <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.titleSpacer} />
      )}
      <View style={styles.trailPlaceholder} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  hit: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  titleSpacer: {
    flex: 1,
  },
  trailPlaceholder: {
    width: 40,
    height: 40,
  },
});
