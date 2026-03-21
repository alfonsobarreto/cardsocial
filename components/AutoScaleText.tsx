import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  maxLines?: number;
};

export default function AutoScaleText({ children, style, maxLines = 1 }: Props) {
  return (
    <Text
      numberOfLines={maxLines}
      adjustsFontSizeToFit
      minimumFontScale={0.72}
      style={style}
    >
      {children}
    </Text>
  );
}
