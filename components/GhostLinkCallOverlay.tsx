import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Image,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useGhostLinkCall, type GhostCallData } from '@/services/GhostLinkCallProvider';
import {
  outgoingMirrorFromGhostCallData,
  OUTGOING_CALL_EMPTY_LINE,
} from '@/services/outgoingCallUiMirror';
import { VoIPCallPhase } from '@/services/voip/VoIPCallPhase';
import { localGhostLinkTrialCapMinutes } from '@/services/ghostLinkVoip';

/** Tras `sessionId`, congela nombre/foto peer + tarjeta para que re-renders no sustituyan identidad en mitad de llamada. */
type GhostDisplayIdentity = Pick<GhostCallData, 'peerName' | 'peerNickname' | 'peerPhotoUrl' | 'card'>;
type GhostDisplayIdentityContextValue = { mergeDisplay: (cd: GhostCallData) => GhostCallData };
const GhostDisplayIdentityContext = createContext<GhostDisplayIdentityContextValue | null>(null);

function GhostDisplayIdentityProvider({ children }: { children: React.ReactNode }) {
  const { phase, callData } = useGhostLinkCall();
  const [identitySnap, setIdentitySnap] = useState<GhostDisplayIdentity | null>(null);

  useLayoutEffect(() => {
    if (
      phase === VoIPCallPhase.Idle ||
      phase === VoIPCallPhase.Ended ||
      phase === VoIPCallPhase.Rejected ||
      phase === VoIPCallPhase.Error ||
      phase === VoIPCallPhase.Muted ||
      phase === VoIPCallPhase.AirTimeExhausted
    ) {
      setIdentitySnap(null);
      return;
    }
    if (!callData?.sessionId) return;
    setIdentitySnap((prev) =>
      prev ?? {
        peerName: callData.peerName,
        peerNickname: callData.peerNickname,
        peerPhotoUrl: callData.peerPhotoUrl,
        card: { ...callData.card },
      },
    );
  }, [phase, callData]);

  const value = useMemo(
    () => ({
      mergeDisplay: (cd: GhostCallData): GhostCallData => {
        if (!identitySnap) return cd;
        return {
          ...cd,
          peerName: identitySnap.peerName,
          peerNickname: identitySnap.peerNickname,
          peerPhotoUrl: identitySnap.peerPhotoUrl,
          card: { ...identitySnap.card },
        };
      },
    }),
    [identitySnap],
  );

  return (
    <GhostDisplayIdentityContext.Provider value={value}>{children}</GhostDisplayIdentityContext.Provider>
  );
}

function useDisplayGhostCallData(): GhostCallData | null {
  const { callData } = useGhostLinkCall();
  const idCtx = useContext(GhostDisplayIdentityContext);
  if (!callData) return null;
  if (!idCtx) return callData;
  return idCtx.mergeDisplay(callData);
}
import { isGhostLinkAgoraNativeAvailable } from '@/services/expoGoAgoraGuard';
import { useCoreT } from '@/services/coreI18n';
import { useLookMode } from '@/services/lookMode';
import palette, { type AppShellTheme } from '@/app/theme';
import { brandCsIconLogoBgTransparent } from '@/constants/brandAssets';

/** Misma jerarquía visual que `app/signin.tsx` (`heroIconWrap` + `heroLogo`). */
const SIGNIN_HERO_ICON_WRAP = 86;
const SIGNIN_HERO_LOGO = 62;

const GhostLinkShellContext = createContext<AppShellTheme | null>(null);

function useGhostLinkShell(): AppShellTheme {
  const shell = useContext(GhostLinkShellContext);
  if (!shell) {
    throw new Error('GhostLinkCallOverlay: shell context missing');
  }
  return shell;
}

let RtcSurfaceView: React.ComponentType<any> | null = null;
let VideoSourceType: any = null;

if (isGhostLinkAgoraNativeAvailable()) {
  try {
    const agora = require('react-native-agora');
    RtcSurfaceView = agora.RtcSurfaceView;
    VideoSourceType = agora.VideoSourceType;
  } catch {
    /* Expo Go — skip */
  }
}

/**
 * Identidad en UI. **Outgoing:** `outgoingMirrorFromGhostCallData` (misma lista Calls).
 * **Incoming Smart (`personal`):** avatar = caller `userAvatarUrl`; título = **tu** `cardName`; subtítulo = caller `userFullName`.
 * **Incoming Business:** ver rama `business`.
 */
function deriveCallFace(callData: GhostCallData): {
  avatar: string | null;
  title: string;
  subtitle: string | null;
  cardLabel: string;
} {
  if (callData.direction === 'incoming') {
    const callerFullName =
      String(callData.peerFullName ?? '').trim() || String(callData.peerName ?? '').trim();
    const cardNameRaw = String(callData.card.cardName || '').trim();
    if (callData.card.cardType === 'business') {
      const titleBiz = String(callData.card.bcName ?? callData.card.cardName ?? '').trim();
      const labelBiz = String(callData.card.bcName ?? callData.card.cardName ?? '').trim();
      return {
        avatar: callData.peerPhotoUrl ?? null,
        title: titleBiz || callerFullName,
        subtitle: callerFullName.length > 0 ? callerFullName : null,
        cardLabel: labelBiz || cardNameRaw,
      };
    }
    /** Smart entrante: sin pastilla duplicada (`cardLabel` vacío); título ya es la tarjeta. */
    return {
      avatar: callData.peerPhotoUrl ?? null,
      title: cardNameRaw || 'Tarjeta Social',
      subtitle: callerFullName.length > 0 ? callerFullName : null,
      cardLabel: '',
    };
  }
  const om = outgoingMirrorFromGhostCallData(callData);
  const cardLabel = String(callData.card.cardName || om.titleBold || '').trim();
  return {
    avatar: om.ringUrl,
    title: om.titleBold,
    subtitle: om.subtitleLine === OUTGOING_CALL_EMPTY_LINE ? null : om.subtitleLine,
    cardLabel,
  };
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function VoipTrialCapHintBar({
  capMinutes,
  elapsedSec,
  tcx,
  mutedColor,
}: {
  capMinutes: number;
  elapsedSec: number;
  tcx: ReturnType<typeof useCoreT>;
  mutedColor: string;
}) {
  const capSec = capMinutes * 60;
  const remaining = Math.max(0, capSec - elapsedSec);
  const remainLabel = formatDuration(remaining);
  return (
    <Text
      style={{
        fontSize: 12,
        color: mutedColor,
        marginTop: 6,
        textAlign: 'center',
        paddingHorizontal: 16,
        lineHeight: 18,
      }}
    >
      {tcx('ghost_airtime_session', { capMinutes, remain: remainLabel })}
    </Text>
  );
}

function VoipAudioRouteHintStrip({ videoChrome }: { videoChrome?: boolean }) {
  const { voipAudioRouteHint, dismissVoipAudioRouteHint } = useGhostLinkCall();
  const shell = useGhostLinkShell();
  const tcx = useCoreT();
  if (!voipAudioRouteHint) return null;
  const fg = videoChrome ? shell.ghostLinkVideoTopBarText : shell.ghostLinkTextPrimary;
  const muted = videoChrome ? shell.ghostLinkVideoWaitingText : shell.ghostLinkTextSecondary;
  return (
    <View
      style={[
        styles.audioRouteHint,
        {
          backgroundColor: videoChrome ? shell.ghostLinkVideoControlFrost : shell.typeBadgeBg,
          borderColor: shell.pillBorder,
        },
      ]}
    >
      <Text style={[styles.audioRouteHintText, { color: fg }]}>{voipAudioRouteHint}</Text>
      <View style={styles.audioRouteHintActions}>
        <TouchableOpacity onPress={() => void Linking.openSettings()} accessibilityRole="button">
          <Text style={[styles.audioRouteHintAction, { color: shell.tint }]}>
            {tcx('ghost_open_settings')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={dismissVoipAudioRouteHint} accessibilityRole="button">
          <Text style={[styles.audioRouteHintAction, { color: muted }]}>{tcx('ghost_got_it')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CallChromeMinimizeButton({ videoChrome }: { videoChrome?: boolean }) {
  const { minimizeCall } = useGhostLinkCall();
  const shell = useGhostLinkShell();
  const tcx = useCoreT();
  const color = videoChrome ? shell.ghostLinkVideoTopBarText : shell.ghostLinkTextPrimary;
  return (
    <TouchableOpacity
      onPress={minimizeCall}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={videoChrome ? videoStyles.minimizeTap : styles.minimizeTap}
      accessibilityRole="button"
      accessibilityLabel={tcx('ghost_a11y_minimize_call')}
    >
      <MaterialCommunityIcons name="chevron-down" size={28} color={color} />
    </TouchableOpacity>
  );
}

/** PiP in-app: tocar restaura pantalla completa. */
function FloatingCallBubble() {
  const { maximizeCall, remoteUid, isRemoteVideoEnabled, videoEnabled, callDurationSec } = useGhostLinkCall();
  const callData = useDisplayGhostCallData();
  const shell = useGhostLinkShell();
  const tcx = useCoreT();

  if (!callData) return null;

  /** Incluye FaceCall nativo y upgrade audio→video (`callType` sigue `audio`). */
  const showRemoteVideoInBubble = videoEnabled;
  const showRemoteSurface = remoteUid != null && isRemoteVideoEnabled;
  /** Burbuja representa al otro participante: caller si soy receptor, tarjeta si soy caller. */
  const face = deriveCallFace(callData);

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={maximizeCall}
      style={[
        bubbleStyles.wrap,
        Platform.select({
          ios: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.35,
            shadowRadius: 16,
          },
          android: { elevation: 14 },
          default: {},
        }),
      ]}
      accessibilityRole="button"
      accessibilityLabel={tcx('ghost_a11y_return_to_call')}
    >
      <View
        style={[
          bubbleStyles.card,
          {
            backgroundColor: shell.surface,
            borderColor: shell.ghostLinkLogoBubbleBorder,
          },
        ]}
      >
        {showRemoteVideoInBubble && showRemoteSurface && RtcSurfaceView ? (
          <View style={bubbleStyles.videoBox}>
            <RtcSurfaceView style={bubbleStyles.remoteVideo} canvas={{ uid: remoteUid! }} />
            <View style={[bubbleStyles.durationPill, { backgroundColor: shell.ghostLinkVideoControlFrost }]}>
              <Text style={[bubbleStyles.durationText, { color: shell.ghostLinkVideoTopBarText }]}>
                {formatDuration(callDurationSec)}
              </Text>
            </View>
          </View>
        ) : (
          <View style={bubbleStyles.audioCol}>
            <GoldAvatarRing uri={face.avatar} size={56} />
            <Text style={[bubbleStyles.timeText, { color: shell.ghostLinkTextPrimary }]}>
              {formatDuration(callDurationSec)}
            </Text>
            <Text numberOfLines={1} style={[bubbleStyles.nameSmall, { color: shell.ghostLinkTextMuted }]}>
              {face.title}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

/** Preview local Agora (`startPreview` sin join) durante timbre; detrás del contenido UI. */
function RingingLocalVideoBackdrop() {
  const { localPreviewActive } = useGhostLinkCall();
  const shell = useGhostLinkShell();
  if (!localPreviewActive || !RtcSurfaceView || !VideoSourceType) return null;
  return (
    <View style={[StyleSheet.absoluteFillObject, { zIndex: 0 }]} pointerEvents="none">
      <RtcSurfaceView
        style={StyleSheet.absoluteFillObject}
        canvas={{ uid: 0, sourceType: VideoSourceType.VideoSourceCamera }}
      />
      <View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: shell.ghostLinkRingingVideoScrim }]}
        pointerEvents="none"
      />
    </View>
  );
}

function GoldAvatarRing({ uri, size = 130 }: { uri: string | null; size?: number }) {
  const shell = useGhostLinkShell();
  const ringPad = 4;
  const outer = size + ringPad * 2;
  return (
    <LinearGradient
      colors={[...shell.luxuryFrameGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: outer,
        height: outer,
        borderRadius: outer / 2,
        alignItems: 'center',
        justifyContent: 'center',
        padding: ringPad,
      }}
    >
      {uri ? (
        <ExpoImage
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          cachePolicy="disk"
          contentFit="cover"
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: shell.ghostLinkAvatarInnerBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name="account" size={size * 0.55} color={shell.ghostLinkTextMuted} />
        </View>
      )}
    </LinearGradient>
  );
}

function BrandLogoMark({ compact }: { compact?: boolean }) {
  const shell = useGhostLinkShell();
  const wrap = compact ? Math.round(SIGNIN_HERO_ICON_WRAP / 2) : SIGNIN_HERO_ICON_WRAP;
  const logo = compact ? Math.round(SIGNIN_HERO_LOGO / 2) : SIGNIN_HERO_LOGO;
  const r = wrap / 2;
  return (
    <View
      style={[
        styles.logoBubble,
        {
          width: wrap,
          height: wrap,
          borderRadius: r,
          backgroundColor: shell.ghostLinkLogoBubbleBg,
          borderWidth: 1,
          borderColor: shell.ghostLinkLogoBubbleBorder,
        },
        Platform.select({
          ios: {
            shadowColor: shell.brandShadow,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.12,
            shadowRadius: 14,
          },
          android: { elevation: 6 },
          default: {},
        }),
      ]}
      accessibilityRole="image"
      accessibilityLabel="Card-Social"
    >
      <Image source={brandCsIconLogoBgTransparent} style={{ width: logo, height: logo }} resizeMode="contain" />
    </View>
  );
}

function PulsingRing({ size, active, children }: { size: number; active: boolean; children: React.ReactNode }) {
  const shell = useGhostLinkShell();
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      opacity.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.35, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5, duration: 300, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, scale, opacity, shell.tint]);

  const ringSize = size + 32;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {active && (
        <Animated.View
          style={{
            position: 'absolute',
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderWidth: 3,
            borderColor: shell.tint,
            transform: [{ scale }],
            opacity,
          }}
        />
      )}
      {children}
    </View>
  );
}

function CardBadge({ label }: { label: string }) {
  const shell = useGhostLinkShell();
  /** Si no hay etiqueta útil, no pintamos pastilla (Business sin `bcContactName`). */
  if (!String(label || '').trim()) return null;
  return (
    <View style={[styles.badge, { backgroundColor: shell.typeBadgeBg, borderColor: shell.pillBorder }]}>
      <Text
        style={[styles.badgeText, { color: shell.typeBadgeText }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
      </Text>
    </View>
  );
}

function ControlButton({
  icon,
  label,
  active,
  onPress,
  chrome = 'default',
}: {
  icon: string;
  label: string;
  active?: boolean;
  onPress: () => void;
  /** `onVideo`: contraste sobre stage de vídeo oscuro aunque el cascarón sea modo día. */
  chrome?: 'default' | 'onVideo';
}) {
  const shell = useGhostLinkShell();
  const frost = chrome === 'onVideo' ? shell.ghostLinkVideoControlFrost : shell.ghostLinkControlFrost;
  const frostActive =
    chrome === 'onVideo' ? shell.ghostLinkVideoControlFrostActive : shell.ghostLinkControlFrostActive;
  const iconColor = chrome === 'onVideo' ? shell.ghostLinkVideoControlIcon : shell.ghostLinkTextPrimary;
  const labelColor = chrome === 'onVideo' ? shell.ghostLinkVideoControlLabel : shell.ghostLinkTextSecondary;
  return (
    <TouchableOpacity style={styles.controlBtn} onPress={onPress} activeOpacity={0.7}>
      <View
        style={[
          styles.controlCircle,
          {
            backgroundColor: active ? frostActive : frost,
          },
        ]}
      >
        <MaterialCommunityIcons name={icon as any} size={28} color={iconColor} />
      </View>
      <Text style={[styles.controlLabel, { color: labelColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ConfirmView() {
  const { confirmCall, confirmVideoCall, cancelCall } = useGhostLinkCall();
  const callData = useDisplayGhostCallData();
  const shell = useGhostLinkShell();
  const tcx = useCoreT();

  if (!callData) return null;

  const om = outgoingMirrorFromGhostCallData(callData);
  /** Misma línea que entrante (`fullNameText`): Smart = persona; Business = `bcContactName` (ver `outgoingMirrorFromGhostCallData`). */
  const outgoingSubtitleLine =
    om.subtitleLine === OUTGOING_CALL_EMPTY_LINE ? null : om.subtitleLine;

  return (
    <View style={styles.centered}>
      <View style={styles.logoSlot}>
        <BrandLogoMark />
      </View>
      <GoldAvatarRing uri={(om.bcLogoUrl ?? om.userAvatarUrl) ?? om.ringUrl} size={130} />
      <Text style={[styles.nameText, { color: shell.ghostLinkTextPrimary }]}>
        {om.isBusiness ? om.bcName || om.displayCardName || om.titleBold : om.titleBold}
      </Text>
      {outgoingSubtitleLine ? (
        <Text style={[styles.fullNameText, { color: shell.ghostLinkTextSecondary }]}>{outgoingSubtitleLine}</Text>
      ) : null}
      <Text style={[styles.subtitleText, { color: shell.ghostLinkTextSecondary }]}>
        {tcx('ghost_privacy_total')}
      </Text>
      <View style={styles.confirmActions}>
        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: shell.ctaAccent }]}
          onPress={confirmCall}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="phone" size={24} color={shell.emptyCtaText} />
          <Text style={[styles.confirmBtnText, { color: shell.emptyCtaText }]}>{tcx('ghost_voice_call')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={confirmVideoCall} activeOpacity={0.85} style={styles.confirmBtnTouchable}>
          <LinearGradient
            colors={[...shell.luxuryCtaGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.confirmBtnGradient}
          >
            <MaterialCommunityIcons name="video" size={24} color={shell.emptyCtaText} />
            <Text style={[styles.confirmBtnText, { color: shell.emptyCtaText }]}>{tcx('ghost_facecall')}</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={cancelCall} activeOpacity={0.8}>
          <Text style={[styles.cancelBtnText, { color: shell.ghostLinkTextSecondary }]}>{tcx('common_cancel')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.footerText, { color: shell.ghostLinkTextMuted }]}>
        {tcx('ghost_exclusive_link')}
      </Text>
    </View>
  );
}

function OutgoingView() {
  const { phase, muted, speaker, videoEnabled, localPreviewActive, callDurationSec, toggleMute, toggleSpeaker, toggleVideo, flipCamera, endCall } =
    useGhostLinkCall();
  const callData = useDisplayGhostCallData();
  const shell = useGhostLinkShell();
  const tcx = useCoreT();

  if (!callData) return null;

  const isRinging = phase === VoIPCallPhase.RingingOutgoing;
  const showRingingLocalVideoBackdrop = callData.callType === 'video' && videoEnabled && isRinging;
  const statusText = isRinging
    ? tcx('ghost_calling')
    : `${tcx('ghost_on_call')} · ${formatDuration(callDurationSec)}`;
  const agoraCapMin = localGhostLinkTrialCapMinutes(callData.direction, callData.trialCap);
  const om = outgoingMirrorFromGhostCallData(callData);
  const outgoingSubtitleLine =
    om.subtitleLine === OUTGOING_CALL_EMPTY_LINE ? null : om.subtitleLine;

  if (videoEnabled && !isRinging && RtcSurfaceView) {
    return <ActiveVideoView />;
  }

  return (
    <View style={styles.fullScreenStack}>
      {showRingingLocalVideoBackdrop ? <RingingLocalVideoBackdrop /> : null}
      <View style={[styles.centered, styles.fullScreenForeground]}>
        <CallChromeMinimizeButton />
        <VoipAudioRouteHintStrip />
        <View style={styles.logoSlot}>
          <BrandLogoMark />
        </View>
        {!(showRingingLocalVideoBackdrop && localPreviewActive) ? (
          <PulsingRing size={130} active={isRinging}>
            <GoldAvatarRing uri={(om.bcLogoUrl ?? om.userAvatarUrl) ?? om.ringUrl} size={130} />
          </PulsingRing>
        ) : null}
        <Text style={[styles.nameText, { color: shell.ghostLinkTextPrimary }]}>
          {om.isBusiness ? om.bcName || om.displayCardName || om.titleBold : om.titleBold}
        </Text>
        {outgoingSubtitleLine ? (
          <Text style={[styles.fullNameText, { color: shell.ghostLinkTextSecondary }]}>{outgoingSubtitleLine}</Text>
        ) : null}
        <Text style={[styles.statusText, { color: shell.ghostLinkTextSecondary }]}>{statusText}</Text>
        {agoraCapMin != null && callData.agora ? (
          <VoipTrialCapHintBar
            capMinutes={agoraCapMin}
            elapsedSec={callDurationSec}
            tcx={tcx}
            mutedColor={shell.ghostLinkTextMuted}
          />
        ) : null}

        <View style={[styles.controls, styles.controlsWrap]}>
          <ControlButton
            icon={muted ? 'microphone-off' : 'microphone'}
            label={tcx('ghost_mute')}
            active={muted}
            onPress={toggleMute}
          />
          <ControlButton
            icon={speaker ? 'volume-high' : 'volume-low'}
            label={tcx('ghost_speaker')}
            active={speaker}
            onPress={toggleSpeaker}
          />
          <ControlButton
            icon={videoEnabled ? 'video' : 'video-off'}
            label={tcx('ghost_camera')}
            active={videoEnabled}
            onPress={() => void toggleVideo()}
          />
        </View>

        <TouchableOpacity
          style={[styles.endCallBtn, { backgroundColor: shell.danger }]}
          onPress={endCall}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="phone-hangup" size={28} color={shell.ghostLinkOnHangup} />
          <Text style={[styles.endCallText, { color: shell.ghostLinkOnHangup }]}>{tcx('ghost_end_call')}</Text>
        </TouchableOpacity>
        <Text style={[styles.footerText, { color: shell.ghostLinkTextMuted }]}>
          {tcx('ghost_exclusive_link')}
        </Text>
      </View>
    </View>
  );
}

function IncomingView() {
  const { acceptIncoming, rejectIncoming } = useGhostLinkCall();
  const callData = useDisplayGhostCallData();
  const shell = useGhostLinkShell();
  const tcx = useCoreT();
  if (!callData) return null;

  const isVideo = callData.callType === 'video';
  const statusLabel = isVideo
    ? tcx('ghost_incoming_video_call')
    : tcx('ghost_incoming_call');
  const agoraCapMin = localGhostLinkTrialCapMinutes('incoming', callData.trialCap);
  /** Receptor: avatar/nombre del **caller** (peer); badge con nombre de la tarjeta compartida. */
  const face = deriveCallFace(callData);
  const incomingBusiness = callData.card.cardType === 'business';

  return (
    <View style={styles.fullScreenStack}>
      {/* Entrante: sin Agora startPreview / RtcSurfaceView uid:0 hasta ACEPTAR (evita crash en bloqueo/segundo plano). */}
      <View style={[styles.centered, styles.fullScreenForeground]}>
        <View style={styles.logoSlot}>
          <BrandLogoMark />
        </View>
        <PulsingRing size={130} active>
          <GoldAvatarRing uri={face.avatar} size={130} />
        </PulsingRing>
        <Text style={[styles.nameText, { color: shell.ghostLinkTextPrimary }]}>{face.title || callData.peerName}</Text>
        {face.subtitle ? (
          <Text style={[styles.fullNameText, { color: shell.ghostLinkTextSecondary }]}>{face.subtitle}</Text>
        ) : null}
        {isVideo && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <MaterialCommunityIcons name="video" size={18} color={shell.tint} />
            <Text style={{ color: shell.tint, fontSize: 13, fontWeight: '600' }}>{tcx('ghost_facecall')}</Text>
          </View>
        )}
        <Text style={[styles.statusText, { color: shell.ghostLinkTextSecondary }]}>{statusLabel}</Text>
        {agoraCapMin != null && callData.agora ? (
          <VoipTrialCapHintBar capMinutes={agoraCapMin} elapsedSec={0} tcx={tcx} mutedColor={shell.ghostLinkTextMuted} />
        ) : null}
        {incomingBusiness && face.cardLabel ? (
          <CardBadge
            label={`${tcx('ghost_from_your_card')}: ${face.cardLabel}`}
          />
        ) : null}

        <View style={styles.incomingActions}>
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: shell.ctaAccent }]}
            onPress={acceptIncoming}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons
              name={isVideo ? 'video' : 'phone'}
              size={20}
              color={shell.emptyCtaText}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.acceptBtnText, { color: shell.emptyCtaText }]}>{tcx('ghost_accept')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rejectBtn, { backgroundColor: shell.surface, borderColor: shell.danger }]}
            onPress={rejectIncoming}
            activeOpacity={0.85}
          >
            <Text style={[styles.rejectBtnText, { color: shell.danger }]}>{tcx('ghost_decline')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function ActiveIncomingView() {
  const { muted, speaker, videoEnabled, callDurationSec, toggleMute, toggleSpeaker, toggleVideo, flipCamera, endCall } = useGhostLinkCall();
  const callData = useDisplayGhostCallData();
  const shell = useGhostLinkShell();
  const tcx = useCoreT();
  if (!callData) return null;

  if (videoEnabled && RtcSurfaceView) {
    return <ActiveVideoView />;
  }

  /** Receptor en activa: Smart = `cardName` + caller `userFullName`; Business = badge tarjeta. */
  const face = deriveCallFace(callData);
  const incomingBusiness = callData.card.cardType === 'business';
  const agoraCapMin = localGhostLinkTrialCapMinutes('incoming', callData.trialCap);

  return (
    <>
      <View style={styles.centered}>
        <CallChromeMinimizeButton />
        <VoipAudioRouteHintStrip />
        <View style={styles.logoSlot}>
          <BrandLogoMark />
        </View>
        <GoldAvatarRing uri={face.avatar} size={130} />
        <Text style={[styles.nameText, { color: shell.ghostLinkTextPrimary }]}>
          {face.title || callData.peerName}
        </Text>
        {face.subtitle ? (
          <Text style={[styles.fullNameText, { color: shell.ghostLinkTextSecondary }]}>{face.subtitle}</Text>
        ) : null}
        {incomingBusiness && face.cardLabel ? (
          <CardBadge
            label={`${tcx('ghost_from_your_card')}: ${face.cardLabel}`}
          />
        ) : null}
        <Text style={[styles.statusText, { color: shell.ghostLinkTextSecondary }]}>
          {tcx('ghost_on_call')} · {formatDuration(callDurationSec)}
        </Text>
        {agoraCapMin != null && callData.agora ? (
          <VoipTrialCapHintBar
            capMinutes={agoraCapMin}
            elapsedSec={callDurationSec}
            tcx={tcx}
            mutedColor={shell.ghostLinkTextMuted}
          />
        ) : null}

        <View style={[styles.controls, styles.controlsWrap]}>
          <ControlButton
            icon={muted ? 'microphone-off' : 'microphone'}
            label={tcx('ghost_mute')}
            active={muted}
            onPress={toggleMute}
          />
          <ControlButton
            icon={speaker ? 'volume-high' : 'volume-low'}
            label={tcx('ghost_speaker')}
            active={speaker}
            onPress={toggleSpeaker}
          />
          <ControlButton
            icon={videoEnabled ? 'video' : 'video-off'}
            label={tcx('ghost_camera')}
            active={videoEnabled}
            onPress={() => void toggleVideo()}
          />
        </View>

        <TouchableOpacity
          style={[styles.endCallBtn, { backgroundColor: shell.danger }]}
          onPress={endCall}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="phone-hangup" size={28} color={shell.ghostLinkOnHangup} />
          <Text style={[styles.endCallText, { color: shell.ghostLinkOnHangup }]}>{tcx('ghost_end_call')}</Text>
        </TouchableOpacity>
        <Text style={[styles.footerText, { color: shell.ghostLinkTextMuted }]}>
          {tcx('ghost_exclusive_link')}
        </Text>
      </View>
    </>
  );
}

function ActiveVideoView() {
  const {
    muted,
    speaker,
    remoteUid,
    isRemoteVideoEnabled,
    videoEnabled,
    callDurationSec,
    toggleMute,
    toggleSpeaker,
    toggleVideo,
    flipCamera,
    endCall,
    onLocalCameraPinchStart,
    applyLocalCameraPinchScale,
  } = useGhostLinkCall();
  const callData = useDisplayGhostCallData();
  const shell = useGhostLinkShell();
  const tcx = useCoreT();

  if (!callData || !RtcSurfaceView) return null;

  /**
   * Cara = lo que se pinta en placeholder (cámara remota apagada) y top bar.
   * Receptor (incoming) → caller; Caller (outgoing) → tarjeta del receptor.
   */
  const face = deriveCallFace(callData);

  const agoraCapMin = localGhostLinkTrialCapMinutes(callData.direction, callData.trialCap);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          runOnJS(onLocalCameraPinchStart)();
        })
        .onUpdate((e) => {
          runOnJS(applyLocalCameraPinchScale)(e.scale);
        }),
    [onLocalCameraPinchStart, applyLocalCameraPinchScale],
  );

  const showRemoteSurface = remoteUid != null && isRemoteVideoEnabled;
  const remotePlaceholderLabel = remoteUid == null
    ? tcx('ghost_waiting_video')
    : tcx('ghost_camera_off');

  return (
    <View style={[videoStyles.root, { backgroundColor: shell.ghostLinkVideoStageBg }]}>
      <View style={videoStyles.audioRouteHintVideoWrap}>
        <VoipAudioRouteHintStrip videoChrome />
      </View>
      {/* Remote: solo montar SurfaceView cuando el SDK reporta vídeo activo (evita frame congelado). */}
      {showRemoteSurface ? (
        <RtcSurfaceView style={videoStyles.remoteVideo} canvas={{ uid: remoteUid! }} />
      ) : (
        <View
          style={[videoStyles.remoteVideoPlaceholder, { backgroundColor: shell.ghostLinkRemoteVideoPlaceholderBg }]}
        >
          <GoldAvatarRing uri={face.avatar} size={100} />
          <Text style={[videoStyles.waitingText, { color: shell.ghostLinkVideoWaitingText }]}>
            {remotePlaceholderLabel}
          </Text>
        </View>
      )}

      {/* Local — PiP; al apagar cámara, ocultar vista y dejar solo controles + fondo remoto/placeholder. */}
      {videoEnabled && VideoSourceType && (
        <GestureDetector gesture={pinchGesture}>
          <View
            style={[
              videoStyles.pipContainer,
              {
                borderColor: shell.ghostLinkLogoBubbleBorder,
                ...Platform.select({
                  ios: {
                    shadowColor: shell.ghostLinkVideoPipShadow,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.4,
                    shadowRadius: 6,
                  },
                  android: { elevation: 8 },
                  default: {},
                }),
              },
            ]}
          >
            <RtcSurfaceView
              style={videoStyles.pipVideo}
              canvas={{ uid: 0, sourceType: VideoSourceType.VideoSourceCamera }}
              zOrderMediaOverlay
            />
          </View>
        </GestureDetector>
      )}

      {/* Top info bar */}
      <View style={videoStyles.topBar}>
        <BrandLogoMark compact />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[videoStyles.topName, { color: shell.ghostLinkVideoTopBarText }]}>
            {face.title || callData.peerName}
          </Text>
          <Text style={[videoStyles.topStatus, { color: shell.ghostLinkVideoTopBarMuted }]}>
            {face.subtitle
              ? `${face.subtitle} · ${formatDuration(callDurationSec)}`
              : formatDuration(callDurationSec)}
          </Text>
          {agoraCapMin != null && callData.agora ? (
            <Text style={[videoStyles.topTrialCap, { color: shell.ghostLinkVideoTopBarMuted }]}>
              {tcx('ghost_airtime_top_bar', {
                remain: formatDuration(Math.max(0, agoraCapMin * 60 - callDurationSec)),
              })}
            </Text>
          ) : null}
        </View>
        <CallChromeMinimizeButton videoChrome />
      </View>

      {/* Bottom controls */}
           <View style={videoStyles.bottomBar}>
        <ControlButton
          chrome="onVideo"
          icon={muted ? 'microphone-off' : 'microphone'}
          label={tcx('ghost_mute')}
          active={muted}
          onPress={toggleMute}
        />
        <ControlButton
          chrome="onVideo"
          icon={videoEnabled ? 'video' : 'video-off'}
          label={tcx('ghost_camera')}
          active={videoEnabled}
          onPress={() => void toggleVideo()}
        />
        <ControlButton chrome="onVideo" icon="camera-flip" label={tcx('ghost_flip')} onPress={flipCamera} />
        <ControlButton
          chrome="onVideo"
          icon={speaker ? 'volume-high' : 'volume-low'}
          label={tcx('ghost_speaker')}
          active={speaker}
          onPress={toggleSpeaker}
        />
      </View>

      <TouchableOpacity
        style={[videoStyles.endBtn, { backgroundColor: shell.danger }]}
        onPress={endCall}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="phone-hangup" size={28} color={shell.ghostLinkOnHangup} />
      </TouchableOpacity>
    </View>
  );
}

function EndedView({ reason }: { reason: 'ended' | 'rejected' | 'error' | 'muted' | 'airtime_exhausted' }) {
  const shell = useGhostLinkShell();
  const tcx = useCoreT();
  const msg =
    reason === 'rejected'
      ? tcx('ghost_ended_declined')
      : reason === 'muted'
        ? tcx('ghost_ended_card_muted')
        : reason === 'airtime_exhausted'
          ? tcx('ghost_ended_airtime')
          : reason === 'error'
            ? tcx('ghost_ended_error')
            : tcx('ghost_ended_default');

  return (
    <View style={styles.centered}>
      <View style={styles.logoSlot}>
        <BrandLogoMark />
      </View>
      <MaterialCommunityIcons
        name={
          reason === 'rejected'
            ? 'phone-missed'
            : reason === 'muted'
              ? 'volume-off'
              : reason === 'airtime_exhausted'
                ? 'timer-sand-empty'
                : reason === 'error'
                  ? 'alert-circle-outline'
                  : 'phone-hangup'
        }
        size={64}
        color={shell.ghostLinkTextMuted}
      />
      <Text style={[styles.nameText, { marginTop: 20, color: shell.ghostLinkTextPrimary }]}>{msg}</Text>
    </View>
  );
}

export default function GhostLinkCallOverlay() {
  const { phase, callData, isMinimized } = useGhostLinkCall();
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];
  const minimizedUi =
    isMinimized &&
    !!callData &&
    (phase === VoIPCallPhase.Active || phase === VoIPCallPhase.RingingOutgoing);

  if (
    phase === VoIPCallPhase.Idle ||
    (!callData &&
      phase !== VoIPCallPhase.Ended &&
      phase !== VoIPCallPhase.Rejected &&
      phase !== VoIPCallPhase.Error &&
      phase !== VoIPCallPhase.AirTimeExhausted)
  ) {
    return null;
  }

  if (minimizedUi) {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { zIndex: 9999 },
          Platform.OS === 'android' ? { elevation: 12 } : null,
        ]}
        pointerEvents="box-none"
      >
        <GhostLinkShellContext.Provider value={shell}>
          <GhostDisplayIdentityProvider>
            <FloatingCallBubble />
          </GhostDisplayIdentityProvider>
        </GhostLinkShellContext.Provider>
      </View>
    );
  }

  let content: React.ReactNode = null;
  switch (phase) {
    case VoIPCallPhase.Confirming:
      content = <ConfirmView />;
      break;
    case VoIPCallPhase.RingingOutgoing:
    case VoIPCallPhase.Active:
      content = callData?.direction === 'outgoing' ? <OutgoingView /> : <ActiveIncomingView />;
      break;
    case VoIPCallPhase.RingingIncoming:
      content = <IncomingView />;
      break;
    case VoIPCallPhase.Ended:
      content = <EndedView reason="ended" />;
      break;
    case VoIPCallPhase.Rejected:
      content = <EndedView reason="rejected" />;
      break;
    case VoIPCallPhase.Muted:
      content = <EndedView reason="muted" />;
      break;
    case VoIPCallPhase.Error:
      content = <EndedView reason="error" />;
      break;
    case VoIPCallPhase.AirTimeExhausted:
      content = <EndedView reason="airtime_exhausted" />;
      break;
    default:
      return null;
  }

  return (
    <Modal visible animationType="slide" transparent={false} statusBarTranslucent>
      <LinearGradient colors={[...shell.tabShellGradient]} style={styles.root}>
        <GhostLinkShellContext.Provider value={shell}>
          <GhostDisplayIdentityProvider>{content}</GhostDisplayIdentityProvider>
        </GhostLinkShellContext.Provider>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  minimizeTap: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 20,
    padding: 4,
    ...Platform.select({
      android: { elevation: 14 },
      default: {},
    }),
  },
  fullScreenStack: {
    flex: 1,
    width: '100%',
  },
  fullScreenForeground: {
    zIndex: 2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 96,
  },
  logoSlot: {
    position: 'absolute',
    top: 52,
    alignSelf: 'center',
    zIndex: 4,
  },
  logoBubble: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameText: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  fullNameText: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 16,
    marginBottom: 12,
  },
  subtitleText: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  badge: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginVertical: 8,
    borderWidth: 1,
    maxWidth: '92%',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  audioRouteHint: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  audioRouteHintText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  audioRouteHintActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 8,
  },
  audioRouteHintAction: {
    fontSize: 13,
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 36,
    marginTop: 32,
    marginBottom: 28,
  },
  controlsWrap: {
    flexWrap: 'wrap',
    maxWidth: 400,
    rowGap: 18,
    columnGap: 28,
    paddingHorizontal: 8,
  },
  controlBtn: {
    alignItems: 'center',
    gap: 6,
  },
  controlCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlLabel: {
    fontSize: 12,
  },
  endCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 32,
    paddingVertical: 14,
    paddingHorizontal: 40,
    gap: 10,
    marginTop: 8,
  },
  endCallText: {
    fontSize: 17,
    fontWeight: '700',
  },
  footerText: {
    fontSize: 12,
    marginTop: 24,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 16,
  },
  confirmActions: {
    alignItems: 'center',
    gap: 14,
    width: '100%',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    paddingVertical: 14,
    paddingHorizontal: 36,
    gap: 10,
    width: '100%',
    maxWidth: 400,
  },
  confirmBtnTouchable: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 32,
    overflow: 'hidden',
  },
  confirmBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 36,
    gap: 10,
  },
  confirmBtnText: {
    fontSize: 17,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  cancelBtnText: {
    fontSize: 15,
  },
  incomingActions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 32,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  acceptBtnText: {
    fontSize: 16,
    fontWeight: '800',
  },
  rejectBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderWidth: 1,
  },
  rejectBtnText: {
    fontSize: 16,
    fontWeight: '800',
  },
});

const videoStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  audioRouteHintVideoWrap: {
    position: 'absolute',
    top: 52,
    left: 12,
    right: 56,
    zIndex: 25,
    alignItems: 'center',
  },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  remoteVideoPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingText: {
    fontSize: 14,
    marginTop: 16,
  },
  pipContainer: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: 110,
    height: 150,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
  },
  pipVideo: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 140,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topName: {
    fontSize: 16,
    fontWeight: '700',
  },
  topStatus: {
    fontSize: 12,
  },
  topTrialCap: {
    fontSize: 11,
    marginTop: 2,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 110,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
  },
  endBtn: {
    position: 'absolute',
    bottom: 44,
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimizeTap: {
    padding: 6,
    marginLeft: 4,
  },
});

const bubbleStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 28,
    right: 16,
    zIndex: 9999,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    width: 120,
  },
  videoBox: {
    width: '100%',
    height: 148,
    position: 'relative',
  },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  durationPill: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  durationText: {
    fontSize: 12,
    fontWeight: '700',
  },
  audioCol: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 8,
  },
  nameSmall: {
    fontSize: 11,
    marginTop: 4,
    maxWidth: 108,
    textAlign: 'center',
  },
});
