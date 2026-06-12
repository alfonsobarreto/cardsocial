import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, Line, RadialGradient, Stop } from 'react-native-svg';
import {
  BRAND_NODES_MESH_DAY,
  BRAND_NODES_MESH_NIGHT,
  brandNodesBaseColor,
  type BrandNodesMode,
} from '@/styles/brandNodesMesh';

type Props = {
  mode: BrandNodesMode;
  style?: StyleProp<ViewStyle>;
  /** Opacidad de la malla (no del lienzo base). */
  meshOpacity?: number;
};

const VIEW = 100;
const DEFAULT_MESH_OPACITY = { day: 0.28, night: 0.36 } as const;

export default function BrandNodesBackground({ mode, style, meshOpacity }: Props) {
  const mesh = useMemo(() => (mode === 'night' ? BRAND_NODES_MESH_NIGHT : BRAND_NODES_MESH_DAY), [mode]);
  const base = brandNodesBaseColor(mode);
  const svgOpacity = meshOpacity ?? DEFAULT_MESH_OPACITY[mode];

  return (
    <View
      style={[StyleSheet.absoluteFillObject, styles.wallpaper, { backgroundColor: base }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW} ${VIEW}`} preserveAspectRatio="none" opacity={svgOpacity}>
        <Defs>
          {mesh.orbs.map((orb, i) => (
            <RadialGradient key={`orb-grad-${i}`} id={`orb-grad-${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={orb.fill} stopOpacity="1" />
              <Stop offset="100%" stopColor={orb.fill} stopOpacity="0" />
            </RadialGradient>
          ))}
        </Defs>

        {mesh.orbs.map((orb, i) => (
          <Circle
            key={`orb-${i}`}
            cx={orb.cx * VIEW}
            cy={orb.cy * VIEW}
            r={orb.r}
            fill={`url(#orb-grad-${i})`}
          />
        ))}

        <G>
          {mesh.edges.map((edge, i) => (
            <Line
              key={`edge-${i}`}
              x1={edge.x1 * VIEW}
              y1={edge.y1 * VIEW}
              x2={edge.x2 * VIEW}
              y2={edge.y2 * VIEW}
              stroke={edge.stroke}
              strokeWidth={mode === 'night' ? 0.35 : 0.28}
              strokeOpacity={edge.opacity}
            />
          ))}
        </G>

        <G>
          {mesh.nodes.map((node, i) => (
            <G key={`node-${i}`}>
              {node.glow ? (
                <Circle
                  cx={node.x * VIEW}
                  cy={node.y * VIEW}
                  r={node.r * 2.2}
                  fill={node.fill}
                  opacity={0.1}
                />
              ) : null}
              <Circle
                cx={node.x * VIEW}
                cy={node.y * VIEW}
                r={node.r}
                fill={node.fill}
                opacity={mode === 'night' ? 0.7 : 0.55}
              />
            </G>
          ))}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wallpaper: {
    zIndex: 0,
    elevation: 0,
  },
});
