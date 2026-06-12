import React, { useState } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { brandColors } from '@/styles/brandTokens';

type Props = {
  children: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

/**
 * Título con gradiente Electric Blue → Digital Violet (Sistema Visual de Marca).
 * Mide el texto con un Text invisible y pinta el gradiente con react-native-svg.
 */
export function BrandGradientText({ children, style, numberOfLines = 1 }: Props) {
  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = typeof flat.fontSize === 'number' ? flat.fontSize : 16;
  const fontWeight = flat.fontWeight ?? '700';
  const lineHeight = typeof flat.lineHeight === 'number' ? flat.lineHeight : Math.round(fontSize * 1.15);
  const textAlign = flat.textAlign === 'center' ? 'middle' : flat.textAlign === 'right' ? 'end' : 'start';
  const anchor = textAlign === 'middle' ? 'middle' : textAlign === 'end' ? 'end' : 'start';
  const x = textAlign === 'middle' ? '50%' : textAlign === 'end' ? '100%' : '0%';

  const [box, setBox] = useState({ width: 0, height: lineHeight });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setBox({ width, height });
    }
  };

  return (
    <View style={{ alignSelf: flat.alignSelf, width: flat.width, maxWidth: flat.maxWidth }}>
      <Text
        style={[style, { opacity: 0 }]}
        numberOfLines={numberOfLines}
        onLayout={onLayout}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {children}
      </Text>
      {box.width > 0 ? (
        <Svg
          width={box.width}
          height={box.height}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        >
          <Defs>
            <LinearGradient id="brandTitleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={brandColors.electricBlue} />
              <Stop offset="100%" stopColor={brandColors.digitalViolet} />
            </LinearGradient>
          </Defs>
          <SvgText
            fill="url(#brandTitleGrad)"
            fontSize={fontSize}
            fontWeight={String(fontWeight)}
            x={x}
            y={fontSize}
            textAnchor={anchor}
          >
            {children}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}
