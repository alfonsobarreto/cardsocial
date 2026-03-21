import React, { useEffect, useMemo } from 'react';
import {
  LayoutAnimation,
  Platform,
  StyleProp,
  UIManager,
  View,
  ViewStyle,
  StyleSheet,
} from 'react-native';

type GridScaleConfig = {
  columns: number;
  size: number;
  scale: number;
};

type FlexGridProps<T> = {
  items: T[];
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number, ui: { size: number; scale: number; columns: number }) => React.ReactNode;
  style?: StyleProp<ViewStyle>;
  animated?: boolean;
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function resolveGridScale(count: number): GridScaleConfig {
  if (count <= 1) {
    return { columns: 1, size: 94, scale: 1 };
  }
  if (count === 2) {
    return { columns: 2, size: 84, scale: 0.97 };
  }
  if (count <= 4) {
    return { columns: 2, size: 76, scale: 0.95 };
  }
  if (count <= 8) {
    return { columns: 4, size: 58, scale: 0.9 };
  }
  return { columns: 4, size: 52, scale: 0.88 };
}

function FlexGrid<T>({ items, getKey, renderItem, style, animated = true }: FlexGridProps<T>) {
  const signature = useMemo(
    () => items.map((item, index) => getKey(item, index)).join('|'),
    [items, getKey]
  );

  useEffect(() => {
    if (!animated) {
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [signature, animated]);

  const gridUi = useMemo(() => resolveGridScale(items.length), [items.length]);

  return (
    <View style={[styles.grid, style]}>
      {items.map((item, index) => {
        const key = getKey(item, index);
        return (
          <View
            key={key}
            style={[
              styles.cell,
              {
                width: `${100 / gridUi.columns}%`,
                transform: [{ scale: gridUi.scale }],
              },
            ]}
          >
            {renderItem(item, index, gridUi)}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
    rowGap: 8,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    marginBottom: 8,
  },
});

export default FlexGrid;