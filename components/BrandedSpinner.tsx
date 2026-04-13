import React, { useMemo, useState } from 'react';
import { ActivityIndicator as NativeActivityIndicator, ActivityIndicatorProps, StyleProp, View, ViewStyle, Image } from 'react-native';

type SpinnerSize = ActivityIndicatorProps['size'];

type BrandedSpinnerProps = Omit<ActivityIndicatorProps, 'animating'> & {
  style?: StyleProp<ViewStyle>;
};

function resolveSize(size: SpinnerSize) {
  if (typeof size === 'number') {
    return Math.max(16, size);
  }
  if (size === 'small') {
    return 20;
  }
  if (size === 'large') {
    return 42;
  }
  return 28;
}

export default function BrandedSpinner({ size = 'small', color = '#0A2540', style }: BrandedSpinnerProps) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const pixelSize = useMemo(() => resolveSize(size), [size]);
  const spinnerSources = useMemo(
    () => [
      require('../assets/images/Spinner/CS_spinner.gif'),
    ],
    []
  );

  const exhaustedAllGifSources = sourceIndex >= spinnerSources.length;

  if (exhaustedAllGifSources) {
    return <NativeActivityIndicator size={size} color={color} style={style} />;
  }

  return (
    <View style={[{ justifyContent: 'center', alignItems: 'center' }, style]}>
      <Image
        source={spinnerSources[sourceIndex]}
        style={{ width: pixelSize, height: pixelSize }}
        resizeMode="contain"
        onError={() => setSourceIndex((prev) => prev + 1)}
      />
    </View>
  );
}
