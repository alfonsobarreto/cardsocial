/**
 * Fragmentos de escenario full-bleed del visor de historias (Búnker: Negro OLED + Oro Champagne).
 * Usados por `app/(tabs)/stories.tsx` para mantener coherencia texto / imagen / video.
 */

import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Platform, Text, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

export type TextFontRole = 'serif' | 'sans';

/** Fondos lienzo texto: degradados Oro Champagne + Negro OLED */
export const TEXT_STORY_BACKGROUNDS: { id: string; colors: readonly [string, string, string] }[] = [
  { id: 'oled-deep', colors: ['#000000', '#0a0a0c', '#151018'] },
  { id: 'oled-gold-mist', colors: ['#050508', '#1a1410', '#2a2318'] },
  { id: 'champagne-ember', colors: ['#080604', '#2c2214', '#4a3d22'] },
  { id: 'champagne-soft', colors: ['#0d0b08', '#3d3220', '#5c4a2e'] },
  { id: 'oled-rose-gold', colors: ['#000000', '#1c1518', '#2e2620'] },
];

export function textStoryGradientColors(backgroundKey?: string): readonly [string, string, string] {
  const row = TEXT_STORY_BACKGROUNDS.find((b) => b.id === backgroundKey);
  return row ? row.colors : TEXT_STORY_BACKGROUNDS[0].colors;
}

export function storyTextFontFamily(role: TextFontRole | undefined): string | undefined {
  if (role === 'serif') {
    return 'Georgia';
  }
  return Platform.select({ ios: 'System', android: 'sans-serif', default: undefined });
}

type TheaterTextProps = {
  body: string;
  backgroundKey?: string;
  textFontRole?: TextFontRole;
  textStoryStyle: ViewStyle;
  textBodyStyle: TextStyle;
};

/** Texto (lienzo): degradado + tipografía premium centrada */
export function StoryTheaterTextCanvas({ body, backgroundKey, textFontRole, textStoryStyle, textBodyStyle }: TheaterTextProps) {
  return (
    <LinearGradient colors={[...textStoryGradientColors(backgroundKey)]} style={textStoryStyle}>
      <Text style={[textBodyStyle, { fontFamily: storyTextFontFamily(textFontRole) }]}>{body}</Text>
    </LinearGradient>
  );
}

type TheaterImageProps = { uri: string; style: ImageStyle };
type TheaterVideoProps = { uri: string; style: ViewStyle };

/** Imagen: cubre todo el escenario */
export function StoryTheaterFullBleedImage({ uri, style }: TheaterImageProps) {
  return <ExpoImage source={{ uri }} style={style} contentFit="cover" cachePolicy="disk" />;
}

/** Video: reproducción inmediata, sin loop, cubre el escenario */
export function StoryTheaterFullBleedVideo({ uri, style: videoStyle }: TheaterVideoProps) {
  const player = useVideoPlayer({ uri }, (instance) => {
    instance.loop = false;
    instance.currentTime = 0;
    instance.play();
  });

  return (
    <VideoView
      style={videoStyle}
      player={player}
      contentFit="cover"
      nativeControls={false}
      allowsFullscreen={false}
      allowsPictureInPicture={false}
    />
  );
}
