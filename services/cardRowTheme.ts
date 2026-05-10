/**
 * Theme resolution for card rows (lists, previews, firma HTML) sin depender del hook/useActiveTheme.
 */

import type { ThemeFontStyle, ThemeFontWeight } from '../constants/themeChest';
import { DEFAULT_CARD_THEME_ID, getThemeById } from '../constants/themeChest';

export type CardRowThemeResolved = {
  gradient: [string, string, string];
  borderColor: string;
  borderWidth: number;
  titleColor: string;
  titleFontWeight: ThemeFontWeight;
  titleFontStyle: ThemeFontStyle;
  metaColor: string;
  subtitleFontWeight: ThemeFontWeight;
  subtitleFontStyle: ThemeFontStyle;
  extraColor: string;
  extraFontSize: number;
  extraFontWeight: ThemeFontWeight;
  extraFontStyle: ThemeFontStyle;
  iconColor: string;
  bubbleBackgroundColor: string;
  bubbleBorderRadius: number;
};

const FALLBACK_CARD_ROW: CardRowThemeResolved = {
  gradient: ['#F2F2F7', '#F2F2F7', '#F2F2F7'],
  borderColor: 'rgba(233,195,73,0.35)',
  borderWidth: 1,
  titleColor: '#1C1C1E',
  titleFontWeight: '800',
  titleFontStyle: 'normal',
  metaColor: '#636366',
  subtitleFontWeight: '600',
  subtitleFontStyle: 'normal',
  extraColor: '#8E8E93',
  extraFontSize: 11,
  extraFontWeight: '500',
  extraFontStyle: 'italic',
  iconColor: '#E9C349',
  bubbleBackgroundColor: 'rgba(255,255,255,0.82)',
  bubbleBorderRadius: 14,
};

export function getCardRowTheme(themeId: string | undefined): CardRowThemeResolved {
  const t = getThemeById(themeId ?? DEFAULT_CARD_THEME_ID);
  if (!t) {
    return FALLBACK_CARD_ROW;
  }
  return {
    gradient: [t.background[0], t.background[1], t.background[2]],
    borderColor: t.border.color,
    borderWidth: t.border.width,
    titleColor: t.title.color,
    titleFontWeight: t.title.fontWeight,
    titleFontStyle: t.title.fontStyle,
    metaColor: t.subtitle.color,
    subtitleFontWeight: t.subtitle.fontWeight,
    subtitleFontStyle: t.subtitle.fontStyle,
    extraColor: t.extraText.color,
    extraFontSize: t.extraText.fontSize,
    extraFontWeight: t.extraText.fontWeight,
    extraFontStyle: t.extraText.fontStyle,
    iconColor: t.icon.color,
    bubbleBackgroundColor: t.bubble.backgroundColor,
    bubbleBorderRadius: t.bubble.borderRadius,
  };
}
