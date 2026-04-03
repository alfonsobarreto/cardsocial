import { getCardRowTheme } from '@/services/useActiveTheme';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  themeId?: string | null;
  wallpaperUrl?: string | null;
  /** Borde redondeado del contenedor (coherente con la fila). */
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * Fondo temático (gradiente chest + wallpaper opcional) para filas de tarjetas ajenas.
 */
export function ThemedSharedCardSurface({ themeId, wallpaperUrl, borderRadius = 15, style, children }: Props) {
  const chest = getCardRowTheme(themeId || undefined);
  return (
    <View
      style={[
        styles.wrap,
        {
          borderColor: chest.borderColor,
          borderWidth: chest.borderWidth,
          borderRadius,
        },
        style,
      ]}
    >
      <LinearGradient colors={chest.gradient} style={StyleSheet.absoluteFillObject} />
      {wallpaperUrl ? (
        <Image source={{ uri: wallpaperUrl }} style={styles.wallpaper} resizeMode="cover" />
      ) : null}
      <View style={styles.foreground}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    position: 'relative',
  },
  wallpaper: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  foreground: {
    position: 'relative',
    zIndex: 1,
  },
});
