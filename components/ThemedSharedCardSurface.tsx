import { getCardRowTheme } from '@/services/useActiveTheme';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Image,
  LayoutChangeEvent,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

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
      <LinearGradient
        colors={[...chest.gradient]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {wallpaperUrl ? (
        <Image source={{ uri: wallpaperUrl }} style={styles.wallpaper} resizeMode="cover" />
      ) : null}
      <View style={styles.foreground}>{children}</View>
    </View>
  );
}

const GRID_H_PAD = 10;
const SLOT_GAP = 8;

type SlotMetrics = {
  slotOuter: number;
  bubbleSide: number;
  justifyCenter: boolean;
};

/**
 * Columnas objetivo y límites de tamaño según cantidad (pocas = grandes y una fila; muchas = más columnas y burbuja menor).
 */
function pickColumnPlan(count: number): { startCols: number; minBubble: number; maxBubble: number; justifyCenter: boolean } {
  if (count <= 0) return { startCols: 1, minBubble: 36, maxBubble: 48, justifyCenter: true };
  if (count <= 3) {
    return { startCols: count, minBubble: 44, maxBubble: 58, justifyCenter: true };
  }
  if (count <= 6) {
    return { startCols: 3, minBubble: 34, maxBubble: 50, justifyCenter: false };
  }
  if (count <= 9) {
    return { startCols: 4, minBubble: 30, maxBubble: 46, justifyCenter: false };
  }
  return { startCols: count >= 12 ? 5 : 4, minBubble: 28, maxBubble: 42, justifyCenter: false };
}

/** Evita solape: tamaño de celda cabe en el ancho útil; si no, baja columnas. */
function computeSlotMetrics(innerWidth: number, count: number): SlotMetrics {
  if (count <= 0 || innerWidth <= 0) {
    return { slotOuter: 44, bubbleSide: 38, justifyCenter: true };
  }

  const { startCols, minBubble, maxBubble, justifyCenter } = pickColumnPlan(count);
  let columns = Math.min(startCols, count);

  for (let i = 0; i < 8; i++) {
    const gaps = SLOT_GAP * Math.max(0, columns - 1);
    const raw = (innerWidth - gaps) / Math.max(1, columns);
    let slotOuter = Math.floor(raw);
    slotOuter = Math.max(minBubble, Math.min(maxBubble, slotOuter));

    const needed = slotOuter * columns + gaps;
    if (needed <= innerWidth + 0.5 || columns <= 1) {
      const bubbleSide = Math.max(24, slotOuter - Math.max(4, Math.round(slotOuter * 0.12)));
      return { slotOuter, bubbleSide, justifyCenter };
    }
    columns = Math.max(1, columns - 1);
  }

  const slotOuter = Math.max(24, Math.min(minBubble, Math.floor((innerWidth - SLOT_GAP * (columns - 1)) / columns)));
  const bubbleSide = Math.max(22, slotOuter - 6);
  return { slotOuter, bubbleSide, justifyCenter };
}

type IconSlotGridProps = {
  themeId?: string | null;
  /** Un nodo por icono (p. ej. MaterialCommunityIcons o imagen envuelta). */
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Rejilla responsiva de slots dentro de una tarjeta temática.
 * - Pocos ítems: una fila, centrados, burbujas grandes.
 * - Muchos: flexWrap, gap uniforme, tamaño calculado para que no se superpongan.
 * Colores solo desde `themeId` (chest), sin modo Día/Noche global.
 */
export function ThemedSharedCardIconSlotGrid({ themeId, children, style }: IconSlotGridProps) {
  const chest = getCardRowTheme(themeId || undefined);
  const items = useMemo(() => React.Children.toArray(children).filter((c) => c != null), [children]);
  const count = items.length;

  const [innerW, setInnerW] = useState(0);

  const onGridLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width - 2 * GRID_H_PAD;
    setInnerW(Math.max(0, w));
  }, []);

  const metrics = useMemo(() => computeSlotMetrics(innerW, count), [innerW, count]);

  if (count === 0) {
    return null;
  }

  return (
    <View style={[styles.iconGridRoot, style]} onLayout={onGridLayout}>
      <View
        style={[
          styles.iconGridRow,
          {
            paddingHorizontal: GRID_H_PAD,
            gap: SLOT_GAP,
            justifyContent: metrics.justifyCenter ? 'center' : 'flex-start',
          },
        ]}
      >
        {items.map((child, index) => (
          <View
            key={index}
            style={[
              styles.iconSlotCell,
              {
                width: metrics.slotOuter,
                maxWidth: metrics.slotOuter,
                minWidth: metrics.slotOuter,
              },
            ]}
          >
            <View
              style={[
                styles.iconBubble,
                {
                  width: metrics.bubbleSide,
                  height: metrics.bubbleSide,
                  borderRadius: Math.min(chest.bubbleBorderRadius, metrics.bubbleSide / 2),
                  borderColor: chest.borderColor,
                  borderWidth: Math.max(1, chest.borderWidth),
                  backgroundColor: chest.bubbleBackgroundColor,
                },
              ]}
            >
              <View style={styles.iconBubbleInner}>{child}</View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Color de acento para glifos dentro de `ThemedSharedCardIconSlotGrid` (solo tema de tarjeta). */
export function themedSharedCardIconGlyphColor(themeId?: string | null): string {
  return getCardRowTheme(themeId || undefined).iconColor;
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
  iconGridRoot: {
    width: '100%',
    alignSelf: 'stretch',
  },
  iconGridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    alignContent: 'flex-start',
    width: '100%',
  },
  iconSlotCell: {
    alignItems: 'center',
  },
  iconBubble: {
    alignSelf: 'center',
    overflow: 'hidden',
  },
  iconBubbleInner: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
