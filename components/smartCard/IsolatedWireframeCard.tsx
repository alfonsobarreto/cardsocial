import { wireframeLayoutStyles as wf } from '@/components/smartCard/wireframeLayoutStyles';
import {
    computeStitchWireframeBubbleSide,
    getWireframeIconRowPlan,
    WIREFRAME_STITCH_GAP,
    WIREFRAME_STITCH_HORIZONTAL_INSET,
    WIREFRAME_STITCH_HORIZONTAL_INSET_PREVIEW,
} from '@/components/smartCard/wireframeMath';
import { brandCsIconLogo } from '@/constants/brandAssets';
import type { CardTheme as ChestCardTheme } from '@/constants/themeChest';
import { resolvePillForegroundColor } from '@/services/pillForegroundColor';
import { getWallpaperResizeMode } from '@/services/wallpaperService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Animated, Image, Text, TouchableOpacity, View } from 'react-native';

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
  vaultMimeType?: string;
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
  tr: (es: string, en: string) => string;
  /** Solo modo espejo (modal): escala 0–1 de la cápsula de rating (estrellas + texto + paddings). Ej. 0.8 = 4/5. */
  mirrorStatsCapsuleScale?: number;
  /**
   * Modo medallas: si se provee, la cápsula reemplaza las estrellas por pills de medallas.
   * Cada pill: { key, icon (MaterialCommunityIcons), count }.
   */
  medalPills?: { key: string; icon: string; count: number }[];
  /** Callback para abrir el modal de calificación (solo visible cuando !editable). */
  onRate?: () => void;
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
    noAvatarIconName,
    enableParallax,
    parallaxX,
    parallaxY,
    renderSlotContent,
    tr,
    mirrorStatsCapsuleScale,
    medalPills,
    onRate,
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

  /** Modal / espejo: alineado con web (`BusinessCardWeb`): cabecera compacta, cápsula de rating, rejilla centrada. */
  const mirror = !editable;
  const mStatsScale = mirror ? (mirrorStatsCapsuleScale ?? 1) : 1;
  const thin = mirror ? { fontWeight: '300' as const } : {};
  const iconsBoxMirror = mirror ? { marginTop: 12 } : {};
  const MIRROR_AVATAR = 96;
  const MIRROR_AVATAR_R = 21;

  const renderMirrorStatsCapsule = (starSizeBase: number, captionSizeBase: number) => {
    const s = mStatsScale;
    const starSize = Math.max(12, Math.round(starSizeBase * s));
    const captionSize = Math.max(7, Math.round(captionSizeBase * s));
    const holdersIconSize = starSize;
    const holdersCountFontSize = Math.max(10, Math.round(holdersIconSize * 0.75));
    const mirrorReceiversFg = resolvePillForegroundColor({
      cardGradient: theme.background,
      pillBackground: 'rgba(255,255,255,0.12)',
      preferredColor: iconMeta.color,
    });
    const mirrorPlusFg = resolvePillForegroundColor({
      cardGradient: theme.background,
      pillBackground: 'rgba(255,255,255,0.22)',
      preferredColor: iconMeta.color,
    });

    const capsuleStyle = {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderWidth: Math.max(1, bd.width),
      borderColor: bd.color,
      paddingVertical: Math.max(6, Math.round(10 * s)),
      paddingHorizontal: Math.max(8, Math.round(14 * s)),
    };

    // ── Modo medallas ──────────────────────────────────────────────────────
    if (medalPills !== undefined) {
      // Siempre mostrar las 5 medallas con su número (aunque sea 0)
      const visiblePills = medalPills;
      return (
        <View
          style={{
            width: '100%',
            marginTop: Math.max(4, Math.round(6 * s)),
            paddingHorizontal: Math.max(2, Math.round(4 * s)),
          }}
        >
          <View
            style={[
              capsuleStyle,
              { justifyContent: onRate ? 'space-between' : 'space-evenly' },
            ]}
          >
            {/* Pills de medallas */}
            {visiblePills.length === 0 ? (
              <Text style={{ color: extraStyle.color, fontSize: captionSize, fontWeight: '300' }}>
                {tr('Sin calificaciones', 'No ratings yet')}
              </Text>
            ) : (
              visiblePills.map((p) => (
                <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: Math.max(2, Math.round(3 * s)) }}>
                  <MaterialCommunityIcons name={p.icon as any} size={Math.round(starSizeBase * 1.5)} color={mirrorReceiversFg} />
                  <Text style={{ color: mirrorReceiversFg, fontSize: Math.round(captionSizeBase * 1.5), fontWeight: '600' }}>{p.count}</Text>
                </View>
              ))
            )}
            {/* Botón + a la derecha — solo contactos */}
            {onRate ? (
              <TouchableOpacity
                onPress={onRate}
                style={{
                  width: Math.max(22, Math.round(captionSize * 2)),
                  height: Math.max(22, Math.round(captionSize * 2)),
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.22)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: Math.max(4, Math.round(6 * s)),
                  flexShrink: 0,
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={tr('Calificar', 'Rate')}
              >
                <Text style={{ color: mirrorPlusFg, fontSize: Math.max(14, Math.round(captionSize * 1.2)), fontWeight: '700', lineHeight: Math.max(16, Math.round(captionSize * 1.4)) }}>+</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      );
    }

    // ── Modo por defecto: solo receptores ────────────────────────────────
    return (
      <View
        style={{
          width: '100%',
          marginTop: Math.max(4, Math.round(6 * s)),
          paddingHorizontal: Math.max(2, Math.round(4 * s)),
        }}
      >
        <View style={[capsuleStyle, { justifyContent: 'center', gap: Math.max(3, Math.round(4 * s)) }]}>
          <MaterialCommunityIcons name="account-outline" size={holdersIconSize} color={mirrorReceiversFg} />
          <Text style={{ color: mirrorReceiversFg, fontSize: holdersCountFontSize, fontWeight: '300' }}>{dispHolders}</Text>
        </View>
      </View>
    );
  };

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
          <Image source={brandCsIconLogo} style={{ width: hBrandLogoSize, height: hBrandLogoSize }} />
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
            {/*
              Modo mirror (preview): cápsula de medallas / receivers
              (`renderMirrorStatsCapsule`). En modo editor (editable=true) NO
              se muestra ninguna fila de stats: la tarjeta aún no se ha
              publicado, así que no tiene sentido enseñar rating ni holders.
              El rating oficial son las `medalPills` del mirror.
            */}
            {mirror ? renderMirrorStatsCapsule(hWireStarSize, hReviewCaptionSize) : null}
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
        <Image source={brandCsIconLogo} style={{ width: brandLogoSize, height: brandLogoSize }} />
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
              <Text style={[{ color: subStyle.color, fontSize: 15 }, thin]} numberOfLines={1}>
                {dispSub}
              </Text>
            ) : null}
            {renderMirrorStatsCapsule(24, 9)}
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
            {/*
              Editor vertical (editable=true): sin fila de stats. El rating
              oficial son las `medalPills` del mirror (ver la rama `mirror`
              más arriba y `renderMirrorStatsCapsule`).
            */}
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
                /** `flex-start`: igual que edición; `center` + overflow:hidden recortaba la fila superior al centrar rejillas altas (3–4 filas). */
                paddingTop: 10,
                paddingBottom: 22,
                justifyContent: 'flex-start',
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
            mirror && { flex: 0, flexGrow: 0, justifyContent: 'flex-start' },
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
