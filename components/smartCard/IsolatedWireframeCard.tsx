import type { CardTheme as ChestCardTheme } from '@/constants/themeChest';
import { getWallpaperResizeMode } from '@/services/wallpaperService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Animated, Image, Text, View } from 'react-native';
import {
  computeStitchWireframeBubbleSide,
  getWireframeIconRowPlan,
  WIREFRAME_STITCH_GAP,
  WIREFRAME_STITCH_HORIZONTAL_INSET,
  WIREFRAME_STITCH_HORIZONTAL_INSET_PREVIEW,
} from '@/components/smartCard/wireframeMath';
import { wireframeLayoutStyles as wf } from '@/components/smartCard/wireframeLayoutStyles';

export type WireframeVaultItem = {
  id: string;
  title: string;
  type: string;
  value: string;
  iconName: string;
  icon?: string;
  iconVaultId?: string;
  vaultProtected?: boolean;
  isFavorite: boolean;
};

export type WireframeEditSlot = {
  id: string;
  index: number;
  item: WireframeVaultItem | null;
};

export type IsolatedWireframeCardProps = {
  layout: 'vertical' | 'horizontal';
  slots: WireframeEditSlot[];
  editable: boolean;
  theme: ChestCardTheme;
  wallpaperUrl?: string;
  dispName: string;
  dispSub: string;
  dispAvatar: string | null;
  dispHolders: number;
  dispReviewCount: number;
  dispStarsValue: number;
  noAvatarIconName: 'account' | 'storefront-outline';
  enableParallax: boolean;
  parallaxX: Animated.Value;
  parallaxY: Animated.Value;
  renderSlotContent: (
    slot: WireframeEditSlot,
    ui: { size: number },
    editable: boolean,
    chestTheme: ChestCardTheme,
  ) => React.ReactNode;
  renderDetailedRatingStars: (rating: number, starSize: number, starColor: string) => React.ReactNode;
  tr: (es: string, en: string) => string;
};

export function IsolatedWireframeCard(props: IsolatedWireframeCardProps) {
  const {
    layout,
    slots,
    editable,
    theme,
    wallpaperUrl,
    dispName,
    dispSub,
    dispAvatar,
    dispHolders,
    dispReviewCount,
    dispStarsValue,
    noAvatarIconName,
    enableParallax,
    parallaxX,
    parallaxY,
    renderSlotContent,
    renderDetailedRatingStars,
    tr,
  } = props;

  const [vertAvatarBoxH, setVertAvatarBoxH] = useState(0);
  const [vertIconGridLayout, setVertIconGridLayout] = useState({ w: 0, h: 0 });
  const [vertInfoBoxLayout, setVertInfoBoxLayout] = useState({ w: 0, h: 0 });
  const [vertHeaderH, setVertHeaderH] = useState(0);
  const [horizHeaderH, setHorizHeaderH] = useState(0);
  const [horizAvatarBoxLayout, setHorizAvatarBoxLayout] = useState({ w: 0, h: 0 });
  const [horizInfoBoxLayout, setHorizInfoBoxLayout] = useState({ w: 0, h: 0 });
  const [horizIconGridLayout, setHorizIconGridLayout] = useState({ w: 0, h: 0 });
  const [stitchUsableW, setStitchUsableW] = useState(0);

  useEffect(() => {
    setStitchUsableW(0);
  }, [layout]);

  const dataSlots = slots.filter((slot) => slot.item !== null);
  const feed = editable ? slots : dataSlots;
  const bg3 = theme.background;
  const bd = theme.border;
  const titleStyle = theme.title;
  const subStyle = theme.subtitle;
  const extraStyle = theme.extraText;
  const iconMeta = theme.icon;

  /** Modal / espejo: alineado con web (`WireframeUniversalCard`): cabecera compacta, cápsula de rating, rejilla centrada. */
  const mirror = !editable;
  const thin = mirror ? { fontWeight: '300' as const } : {};
  const iconsBoxMirror = mirror ? { marginTop: 12 } : {};
  const MIRROR_AVATAR = 96;
  const MIRROR_AVATAR_R = 21;

  const renderMirrorStatsCapsule = (
    starSize: number,
    captionSize: number,
    holdersIconSize: number,
  ) => (
    <View style={{ width: '100%', marginTop: 6, paddingHorizontal: 4 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: 999,
          backgroundColor: 'rgba(255,255,255,0.12)',
          borderWidth: Math.max(1, bd.width),
          borderColor: bd.color,
          paddingVertical: 10,
          paddingHorizontal: 14,
        }}
      >
        <View style={{ flex: 1, alignItems: 'center', gap: 3, minWidth: 0 }}>
          {renderDetailedRatingStars(dispStarsValue, starSize, iconMeta.color)}
          <Text
            style={{
              color: extraStyle.color,
              fontSize: captionSize,
              fontWeight: '300',
              fontStyle: extraStyle.fontStyle,
              textAlign: 'center',
            }}
            numberOfLines={1}
          >
            {dispStarsValue.toFixed(1)} · {dispReviewCount} {tr('reseñas', 'reviews')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 6 }}>
          <MaterialCommunityIcons name="account-outline" size={holdersIconSize} color={iconMeta.color} />
          <Text style={{ color: titleStyle.color, fontSize: holdersIconSize, fontWeight: '300' }}>{dispHolders}</Text>
        </View>
      </View>
    </View>
  );

  if (layout === 'horizontal') {
    const H_PAD = 8;
    const horizAvatarSide = horizAvatarBoxLayout.h > 0 ? horizAvatarBoxLayout.h - H_PAD * 2 : 0;
    const horizAvatarRadius = horizAvatarSide > 0 ? Math.round(horizAvatarSide * 0.15) : 0;

    const hNameFontSize = horizInfoBoxLayout.h > 0 ? Math.round(horizInfoBoxLayout.h * 0.28) : 18;
    const hNickFontSize = horizInfoBoxLayout.h > 0 ? Math.round(horizInfoBoxLayout.h * 0.18) : 12;
    const hStatsFontSize = horizInfoBoxLayout.h > 0 ? Math.round(horizInfoBoxLayout.h * 0.12) : 10;
    const hWireStarSize = Math.max(18, Math.min(26, Math.round(hStatsFontSize * 2.05)));
    const hReviewCaptionSize = Math.max(8, Math.round(hStatsFontSize * 0.68));

    const hBrandFontSize = horizHeaderH > 0 ? Math.round(horizHeaderH * 0.45) : 13;
    const hBrandLogoSize = horizHeaderH > 0 ? Math.round(horizHeaderH * 0.55) : 18;

  const hFeed = feed;
  const hRowPlan = getWireframeIconRowPlan(hFeed.length);
  let hCursor = 0;
  const hIconRows = hRowPlan.map((n) => {
    const row = hFeed.slice(hCursor, hCursor + n);
    hCursor += n;
    return row;
  });
  const hGridInset = editable ? WIREFRAME_STITCH_HORIZONTAL_INSET : WIREFRAME_STITCH_HORIZONTAL_INSET_PREVIEW;
  const hIconSize =
    stitchUsableW > 0 && horizIconGridLayout.h > 0
      ? computeStitchWireframeBubbleSide(
            stitchUsableW,
            horizIconGridLayout.h,
            hRowPlan,
            WIREFRAME_STITCH_GAP,
            WIREFRAME_STITCH_GAP,
            theme.iconLabel.fontSize,
          )
        : 0;

    return (
      <LinearGradient colors={bg3} style={[wf.wireHorizCard, { borderColor: bd.color, borderWidth: bd.width }]}>
        {wallpaperUrl ? (
          <Animated.Image
            source={{ uri: wallpaperUrl }}
            style={[
              wf.wallpaperFill,
              enableParallax ? { transform: [{ translateX: parallaxX }, { translateY: parallaxY }, { scale: 1.06 }] } : null,
            ]}
            resizeMode={getWallpaperResizeMode()}
          />
        ) : null}

        <View style={wf.wireCardContentInset}>
        <View style={wf.horizHeader} onLayout={(e) => setHorizHeaderH(e.nativeEvent.layout.height)}>
          <Image source={require('../../assets/images/CS Icon Logo.png')} style={{ width: hBrandLogoSize, height: hBrandLogoSize }} />
          <Text style={[wf.horizBrandingText, { color: subStyle.color, fontSize: hBrandFontSize }, thin]}>Card-Social</Text>
        </View>

        <View style={wf.horizMiddleRow}>
          <View
            style={wf.horizAvatarBox}
            onLayout={(e) => setHorizAvatarBoxLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          >
            {horizAvatarSide > 0 ? (
              dispAvatar ? (
                <ExpoImage
                  source={{ uri: dispAvatar }}
                  style={{
                    width: horizAvatarSide,
                    height: horizAvatarSide,
                    borderRadius: horizAvatarRadius,
                    borderWidth: bd.width,
                    borderColor: bd.color,
                  }}
                  cachePolicy="disk"
                />
              ) : (
                <View
                  style={{
                    width: horizAvatarSide,
                    height: horizAvatarSide,
                    borderRadius: horizAvatarRadius,
                    borderWidth: bd.width,
                    borderColor: bd.color,
                    backgroundColor: theme.bubble.backgroundColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MaterialCommunityIcons name={noAvatarIconName} size={Math.round(horizAvatarSide * 0.5)} color={titleStyle.color} />
                </View>
              )
            ) : null}
          </View>

          <View
            style={wf.horizInfoBox}
            onLayout={(e) => setHorizInfoBoxLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          >
            <Text style={[wf.horizName, { color: titleStyle.color, fontSize: hNameFontSize }, thin]} numberOfLines={1} adjustsFontSizeToFit>
              {dispName}
            </Text>
            <Text style={[wf.horizNick, { color: subStyle.color, fontSize: hNickFontSize }, thin]} numberOfLines={1} adjustsFontSizeToFit>
              {dispSub}
            </Text>
            {mirror ? (
              renderMirrorStatsCapsule(hWireStarSize, hReviewCaptionSize, 11)
            ) : (
              <View style={wf.wireStatsRowInline}>
                <View style={wf.wireStatsRatingStack}>
                  {renderDetailedRatingStars(dispStarsValue, hWireStarSize, iconMeta.color)}
                  <Text
                    style={[
                      wf.wireStatsReviewCaption,
                      {
                        color: extraStyle.color,
                        fontSize: hReviewCaptionSize,
                        fontWeight: extraStyle.fontWeight,
                        fontStyle: extraStyle.fontStyle,
                        textAlign: 'center',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {dispStarsValue.toFixed(1)} · {dispReviewCount} {tr('reseñas', 'reviews')}
                  </Text>
                </View>
                <View style={[wf.wireUsersPill, { borderColor: bd.color, backgroundColor: theme.bubble.backgroundColor }]}>
                  <MaterialCommunityIcons name="account-outline" size={hStatsFontSize} color={iconMeta.color} />
                  <Text style={[wf.wireUsersPillText, { color: titleStyle.color, fontSize: hStatsFontSize }]}>{dispHolders}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        <View
          style={[wf.horizIconsBox, iconsBoxMirror]}
          onLayout={(e) => setHorizIconGridLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        >
          <View
            style={[wf.wireIconGridRoot, !editable && { paddingHorizontal: hGridInset / 2 }]}
            onLayout={(e) => {
              const lw = e.nativeEvent.layout.width;
              setStitchUsableW(Math.max(0, lw - hGridInset));
            }}
          >
            {hIconSize > 0 ? (
              <View style={wf.wireIconRowsStack}>
                {hIconRows.map((rowSlots, ri) => {
                  const cellW = hIconSize;
                  return (
                    <View key={`h-ir-${ri}`} style={[wf.wireIconRow, !editable && { justifyContent: 'center' }]}>
                      {rowSlots.map((slot) => (
                        <View
                          key={slot.id}
                          style={[wf.wireIconCell, { width: cellW, maxWidth: cellW, flexBasis: cellW }]}
                        >
                          {renderSlotContent(slot, { size: cellW }, editable, theme)}
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>
        </View>
      </LinearGradient>
    );
  }

  const VERT_AVATAR_PAD_TOP = 4;
  const VERT_AVATAR_PAD_BOTTOM = 10;
  const vertAvatarSide = vertAvatarBoxH > 0 ? vertAvatarBoxH - VERT_AVATAR_PAD_TOP - VERT_AVATAR_PAD_BOTTOM : 0;

  const nameFontSize = vertInfoBoxLayout.h > 0 ? Math.round(vertInfoBoxLayout.h * 0.28) : 18;
  const nickFontSize = vertInfoBoxLayout.h > 0 ? Math.round(vertInfoBoxLayout.h * 0.18) : 12;
  const statsFontSize = vertInfoBoxLayout.h > 0 ? Math.round(vertInfoBoxLayout.h * 0.12) : 10;
  const vWireStarSize = Math.max(20, Math.min(28, Math.round(statsFontSize * 2.15)));
  const vReviewCaptionSize = Math.max(8, Math.round(statsFontSize * 0.65));
  const brandFontSize = vertHeaderH > 0 ? Math.round(vertHeaderH * 0.45) : 13;
  const brandLogoSize = vertHeaderH > 0 ? Math.round(vertHeaderH * 0.55) : 18;

  const vFeed = feed;
  const vRowPlan = getWireframeIconRowPlan(vFeed.length);
  let vCursor = 0;
  const vIconRows = vRowPlan.map((n) => {
    const row = vFeed.slice(vCursor, vCursor + n);
    vCursor += n;
    return row;
  });
  const vGridInset = editable ? WIREFRAME_STITCH_HORIZONTAL_INSET : WIREFRAME_STITCH_HORIZONTAL_INSET_PREVIEW;
  const vertIconCellSize =
    stitchUsableW > 0 && vertIconGridLayout.h > 0
      ? computeStitchWireframeBubbleSide(
          stitchUsableW,
          vertIconGridLayout.h,
          vRowPlan,
          WIREFRAME_STITCH_GAP,
          WIREFRAME_STITCH_GAP,
          theme.iconLabel.fontSize,
        )
      : 0;

  return (
    <LinearGradient colors={bg3} style={[wf.wireVerticalCard, { borderColor: bd.color, borderWidth: bd.width }]}>
      {wallpaperUrl ? (
        <Animated.Image
          source={{ uri: wallpaperUrl }}
          style={[
            wf.wallpaperFill,
            enableParallax ? { transform: [{ translateX: parallaxX }, { translateY: parallaxY }, { scale: 1.06 }] } : null,
          ]}
          resizeMode={getWallpaperResizeMode()}
        />
      ) : null}

      <View style={wf.wireCardContentInset}>
      <View style={wf.vertHeader} onLayout={(e) => setVertHeaderH(e.nativeEvent.layout.height)}>
        <Image source={require('../../assets/images/CS Icon Logo.png')} style={{ width: brandLogoSize, height: brandLogoSize }} />
        <Text style={[wf.vertBrandingText, { color: subStyle.color, fontSize: brandFontSize }, thin]}>Card-Social</Text>
      </View>

      {mirror ? (
        <View style={{ width: '100%', flexShrink: 0, flexGrow: 0 }}>
          <View
            style={{
              minHeight: 96,
              paddingHorizontal: 8,
              paddingTop: 4,
              paddingBottom: 10,
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            {dispAvatar ? (
              <ExpoImage
                source={{ uri: dispAvatar }}
                style={{
                  width: MIRROR_AVATAR,
                  height: MIRROR_AVATAR,
                  borderRadius: MIRROR_AVATAR_R,
                  borderWidth: bd.width + 1,
                  borderColor: bd.color,
                }}
                cachePolicy="disk"
              />
            ) : (
              <View
                style={{
                  width: MIRROR_AVATAR,
                  height: MIRROR_AVATAR,
                  borderRadius: MIRROR_AVATAR_R,
                  borderWidth: bd.width + 1,
                  borderColor: bd.color,
                  backgroundColor: theme.bubble.backgroundColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: bd.color,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.35,
                  shadowRadius: 6,
                  elevation: 5,
                }}
              >
                <MaterialCommunityIcons name={noAvatarIconName} size={48} color={titleStyle.color} />
              </View>
            )}
          </View>
          <View
            style={{
              width: '100%',
              paddingHorizontal: 8,
              paddingTop: 8,
              paddingBottom: 12,
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Text
              style={[
                wf.vertName,
                { color: titleStyle.color, fontSize: 22, lineHeight: 26 },
                thin,
              ]}
              numberOfLines={1}
            >
              {dispName}
            </Text>
            {dispSub ? (
              <Text style={[{ color: subStyle.color, fontSize: 13 }, thin]} numberOfLines={1}>
                {dispSub}
              </Text>
            ) : null}
            {renderMirrorStatsCapsule(24, 9, 11)}
          </View>
        </View>
      ) : (
        <View style={wf.vertTop}>
          <View style={wf.vertAvatarBox} onLayout={(e) => setVertAvatarBoxH(e.nativeEvent.layout.height)}>
            {vertAvatarSide > 0 ? (
              dispAvatar ? (
                <ExpoImage
                  source={{ uri: dispAvatar }}
                  style={{
                    width: vertAvatarSide,
                    height: vertAvatarSide,
                    borderRadius: Math.round(vertAvatarSide * 0.22),
                    borderWidth: bd.width + 1,
                    borderColor: bd.color,
                  }}
                  cachePolicy="disk"
                />
              ) : (
                <View
                  style={{
                    width: vertAvatarSide,
                    height: vertAvatarSide,
                    borderRadius: Math.round(vertAvatarSide * 0.22),
                    borderWidth: bd.width + 1,
                    borderColor: bd.color,
                    backgroundColor: theme.bubble.backgroundColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: bd.color,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.35,
                    shadowRadius: 6,
                    elevation: 5,
                  }}
                >
                  <MaterialCommunityIcons name={noAvatarIconName} size={Math.round(vertAvatarSide * 0.52)} color={titleStyle.color} />
                </View>
              )
            ) : null}
          </View>

          <View style={wf.vertInfoBox} onLayout={(e) => setVertInfoBoxLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            <Text style={[wf.vertName, { color: titleStyle.color, fontSize: nameFontSize }]} numberOfLines={1} adjustsFontSizeToFit>
              {dispName}
            </Text>
            <Text style={[wf.vertNick, { color: subStyle.color, fontSize: nickFontSize }]} numberOfLines={1} adjustsFontSizeToFit>
              {dispSub}
            </Text>
            <View style={wf.wireStatsRowInline}>
              <View style={wf.wireStatsRatingStack}>
                {renderDetailedRatingStars(dispStarsValue, vWireStarSize, iconMeta.color)}
                <Text
                  style={[
                    wf.wireStatsReviewCaption,
                    {
                      color: extraStyle.color,
                      fontSize: vReviewCaptionSize,
                      fontWeight: extraStyle.fontWeight,
                      fontStyle: extraStyle.fontStyle,
                      textAlign: 'center',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {dispStarsValue.toFixed(1)} · {dispReviewCount} {tr('reseñas', 'reviews')}
                </Text>
              </View>
              <View style={[wf.wireUsersPill, { borderColor: bd.color, backgroundColor: theme.bubble.backgroundColor }]}>
                <MaterialCommunityIcons name="account-outline" size={statsFontSize} color={iconMeta.color} />
                <Text style={[wf.wireUsersPillText, { color: titleStyle.color, fontSize: statsFontSize }]}>{dispHolders}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      <View
        style={[
          wf.vertIconsBox,
          mirror
            ? {
                flex: 1,
                flexGrow: 1,
                minHeight: 200,
                marginTop: 12,
                paddingTop: 2,
                paddingBottom: 22,
                justifyContent: 'center',
              }
            : iconsBoxMirror,
        ]}
        onLayout={(e) => setVertIconGridLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        <View
          style={[
            wf.wireIconGridRoot,
            wf.wireVertIconGridRoot,
            !editable && { paddingHorizontal: vGridInset / 2 },
            mirror && { flex: 0, flexGrow: 0, justifyContent: 'center' },
          ]}
          onLayout={(e) => {
            const lw = e.nativeEvent.layout.width;
            setStitchUsableW(Math.max(0, lw - vGridInset));
          }}
        >
          {vertIconCellSize > 0 ? (
            <View style={wf.wireIconRowsStack}>
              {vIconRows.map((rowSlots, ri) => {
                const cellW = vertIconCellSize;
                return (
                  <View key={`v-ir-${ri}`} style={[wf.wireIconRow, !editable && { justifyContent: 'center' }]}>
                    {rowSlots.map((slot) => (
                      <View
                        key={slot.id}
                        style={[wf.wireIconCell, { width: cellW, maxWidth: cellW, flexBasis: cellW }]}
                      >
                        {renderSlotContent(slot, { size: cellW }, editable, theme)}
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
      </View>
    </LinearGradient>
  );
}
