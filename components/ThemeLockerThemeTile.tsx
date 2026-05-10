/**
 * Mini-tarjeta de theme igual al Locker de Estilos (ThemeChest).
 * Reutilizable en theme_locker y en el modal "Temas de Tarjeta" (cards factory).
 */

import { type CardTheme } from '@/constants/themeChest';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const BORDER_RADIUS = 22;

export const THEME_LOCKER_TILE_GAP = 10;

/** Ancho de cada tile en una fila de 3 dentro de un contenedor con padding ya restado. */
export function computeThemeLockerTileWidth(containerContentWidth: number): number {
  const w = Math.max(0, containerContentWidth);
  // Floor evita que 3 tiles + 2 gaps excedan el ancho por decimales y pasen a 2 columnas.
  return Math.max(76, Math.floor((w - THEME_LOCKER_TILE_GAP * 2) / 3));
}

type Props = {
  theme: CardTheme;
  isActive: boolean;
  isUnlocked: boolean;
  /** Ancho de la tarjeta (misma lógica que CARD_WIDTH en ThemeChest). */
  tileWidth: number;
  onPress: () => void;
  onLongPress?: () => void;
  /** Muestra el nombre del theme bajo la tarjeta (como en Locker). */
  showNameBelow?: boolean;
};

export function ThemeLockerThemeTile({
  theme,
  isActive,
  isUnlocked,
  tileWidth,
  onPress,
  onLongPress,
  showNameBelow = true,
}: Props) {
  const cardHeight = tileWidth * 1.22;

  const shadowProps =
    theme.shadowStyle === 'drop'
      ? {
          shadowColor: theme.border.color,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
          elevation: 6,
        }
      : theme.shadowStyle === 'inner'
        ? {
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.5,
            shadowRadius: 4,
            elevation: 3,
          }
        : {};

  return (
    <View style={[styles.cardCol, { width: tileWidth }]}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        {...(onLongPress ? { onLongPress, delayLongPress: 400 } : {})}
        accessibilityLabel={`${theme.name} theme`}
        accessibilityRole="button"
        style={[
          styles.cardWrap,
          {
            width: tileWidth,
            height: cardHeight,
            borderColor: theme.border.color,
            borderWidth: theme.border.width,
            ...shadowProps,
          },
          isActive && styles.cardActive,
        ]}
      >
        <LinearGradient
          colors={[...theme.background]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.cardGradient}
        >
          <View style={styles.cardTopBar}>
            <View style={{ flex: 1 }} />
            {isActive ? (
              <MaterialCommunityIcons name="check-circle" size={16} color={theme.border.color} />
            ) : (
              <View style={{ width: 16, height: 16 }} />
            )}
          </View>

          <View style={styles.cardBodyCenter}>
            <Text
              style={[
                styles.cardTitle,
                {
                  color: theme.title.color,
                  fontSize: theme.title.fontSize * 0.58,
                  fontWeight: theme.title.fontWeight,
                  fontStyle: theme.title.fontStyle,
                },
              ]}
              numberOfLines={1}
            >
              Card
            </Text>

            <Text
              style={[
                styles.cardSubtitle,
                {
                  color: theme.subtitle.color,
                  fontSize: theme.subtitle.fontSize * 0.78,
                  fontWeight: theme.subtitle.fontWeight,
                  fontStyle: theme.subtitle.fontStyle,
                },
              ]}
              numberOfLines={1}
            >
              Social
            </Text>

            <View
              style={[
                styles.cardIconBubble,
                {
                  backgroundColor: theme.bubble.backgroundColor,
                  borderRadius: Math.min(theme.bubble.borderRadius, 20),
                  borderColor: theme.border.color,
                  borderWidth: Math.max(1, Math.min(2, theme.border.width)),
                },
              ]}
            >
              <MaterialCommunityIcons
                name={theme.icon.name as any}
                size={theme.icon.size * 0.72}
                color={theme.icon.color}
              />
            </View>

            <Text
              style={[
                styles.cardIconLabel,
                {
                  color: theme.iconLabel.color,
                  fontSize: theme.iconLabel.fontSize * 0.85,
                  fontWeight: theme.iconLabel.fontWeight,
                  fontStyle: theme.iconLabel.fontStyle,
                },
              ]}
              numberOfLines={1}
            >
              Icon
            </Text>
          </View>

          {!isUnlocked && (
            <View style={styles.lockedOverlay}>
              {Platform.OS === 'ios' ? (
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
              )}
              <MaterialCommunityIcons name="lock" size={22} color="#FFFFFF" />
              <Text style={styles.lockedPrice}>{theme.price}</Text>
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
      {showNameBelow ? (
        <Text style={styles.cardName} numberOfLines={1}>
          {theme.name}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cardCol: {
    alignItems: 'center',
    gap: 4,
  },
  cardWrap: {
    borderRadius: BORDER_RADIUS,
    overflow: 'hidden',
  },
  cardGradient: {
    flex: 1,
    paddingHorizontal: 4,
    paddingBottom: 6,
    paddingTop: 4,
  },
  cardTopBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    width: '100%',
    minHeight: 18,
  },
  cardBodyCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    minHeight: 0,
  },
  cardTitle: {
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  cardSubtitle: {},
  cardIconBubble: {
    width: 36,
    height: 36,
    marginTop: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconLabel: {
    marginTop: 3,
    textAlign: 'center',
  },
  cardActive: {
    borderWidth: 4,
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS - 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  lockedPrice: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  cardName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#5A6A7A',
    textAlign: 'center',
  },
});
