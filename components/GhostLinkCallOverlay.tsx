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
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useGhostLinkCall, type GhostCallData } from '@/services/GhostLinkCallProvider';

/** Tras `sessionId`, congela nombre/foto peer + tarjeta para que re-renders no sustituyan identidad en mitad de llamada. */
type GhostDisplayIdentity = Pick<GhostCallData, 'peerName' | 'peerNickname' | 'peerPhotoUrl' | 'card'>;
type GhostDisplayIdentityContextValue = { mergeDisplay: (cd: GhostCallData) => GhostCallData };
const GhostDisplayIdentityContext = createContext<GhostDisplayIdentityContextValue | null>(null);

function GhostDisplayIdentityProvider({ children }: { children: React.ReactNode }) {
  const { phase, callData } = useGhostLinkCall();
  const [identitySnap, setIdentitySnap] = useState<GhostDisplayIdentity | null>(null);

  useLayoutEffect(() => {
    if (
      phase === 'idle' ||
      phase === 'ended' ||
      phase === 'rejected' ||
      phase === 'error' ||
      phase === 'muted'
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
import { getGhostLinkAgoraEngine } from '@/services/ghostLinkAgoraSession';
import { isGhostLinkAgoraNativeAvailable } from '@/services/expoGoAgoraGuard';
import { useLanguage } from '@/services/language';
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

function useTr() {
  const { language } = useLanguage();
  return (es: string, en: string) => (language === 'en' ? en : es);
}

/** Pastilla bajo el título: nombre de la persona (social) o nombre del negocio (business). */
function ghostCallParticipantBadgeLabel(
  callData: GhostCallData,
  tr: (es: string, en: string) => string,
): string {
  if (callData.card.cardType === 'business') {
    const n = String(callData.card.cardName || '').trim();
    return n || tr('Negocio', 'Business');
  }
  const full = String(callData.peerName || '').trim();
  if (full) return full;
  const nick = String(callData.peerNickname || '').replace(/^@/, '').trim();
  return nick || tr('Contacto', 'Contact');
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Foto del contacto (VoIP) con prioridad sobre miniatura de tarjeta. */
function resolveCallAvatarUri(peerPhotoUrl: string | null | undefined, cardPhoto: string | null | undefined): string | null {
  const a = String(peerPhotoUrl || '').trim();
  if (a) return a;
  const b = String(cardPhoto || '').trim();
  return b || null;
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
  const wrap = compact ? Math.round(SIGNIN_HERO_ICON_WRAP / 2) : SIGNIN_HERO_ICON_WRAP;
  const logo = compact ? Math.round(SIGNIN_HERO_LOGO / 2) : SIGNIN_HERO_LOGO;
  const r = wrap / 2;
  return (
    <View
      style={[
        styles.logoBubble,
        styles.signinHeroIconWrap,
        {
          width: wrap,
          height: wrap,
          borderRadius: r,
        },
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
}: {
  icon: string;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const shell = useGhostLinkShell();
  return (
    <TouchableOpacity style={styles.controlBtn} onPress={onPress} activeOpacity={0.7}>
      <View
        style={[
          styles.controlCircle,
          {
            backgroundColor: active ? shell.ghostLinkControlFrostActive : shell.ghostLinkControlFrost,
          },
        ]}
      >
        <MaterialCommunityIcons name={icon as any} size={28} color={shell.ghostLinkTextPrimary} />
      </View>
      <Text style={[styles.controlLabel, { color: shell.ghostLinkTextSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ConfirmView() {
  const { confirmCall, confirmVideoCall, cancelCall } = useGhostLinkCall();
  const callData = useDisplayGhostCallData();
  const shell = useGhostLinkShell();
  const tr = useTr();
  if (!callData) return null;

  const badgeLabel = ghostCallParticipantBadgeLabel(callData, tr);
  const avatarUri = resolveCallAvatarUri(callData.peerPhotoUrl, callData.card.cardPhoto);

  return (
    <View style={styles.centered}>
      <View style={styles.logoSlot}>
        <BrandLogoMark />
      </View>
      <GoldAvatarRing uri={avatarUri} size={130} />
      <Text style={[styles.nameText, { color: shell.ghostLinkTextPrimary }]}>{callData.card.cardName}</Text>
      <CardBadge label={badgeLabel} />
      <Text style={[styles.subtitleText, { color: shell.ghostLinkTextSecondary }]}>
        {tr('Privacidad total', 'Total Privacy')}
      </Text>
      <View style={styles.confirmActions}>
        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: shell.ctaAccent }]}
          onPress={confirmCall}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="phone" size={24} color={shell.emptyCtaText} />
          <Text style={[styles.confirmBtnText, { color: shell.emptyCtaText }]}>{tr('Llamada de voz', 'Voice Call')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={confirmVideoCall} activeOpacity={0.85} style={styles.confirmBtnTouchable}>
          <LinearGradient
            colors={[...shell.luxuryCtaGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.confirmBtnGradient}
          >
            <MaterialCommunityIcons name="video" size={24} color={shell.emptyCtaText} />
            <Text style={[styles.confirmBtnText, { color: shell.emptyCtaText }]}>{tr('FaceCall', 'FaceCall')}</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={cancelCall} activeOpacity={0.8}>
          <Text style={[styles.cancelBtnText, { color: shell.ghostLinkTextSecondary }]}>{tr('Cancelar', 'Cancel')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.footerText, { color: shell.ghostLinkTextMuted }]}>
        {tr('Enlace exclusivo', 'Exclusive Link')}
      </Text>
    </View>
  );
}

function OutgoingView() {
  const { phase, muted, speaker, videoEnabled, callDurationSec, toggleMute, toggleSpeaker, toggleVideo, flipCamera, endCall } = useGhostLinkCall();
  const callData = useDisplayGhostCallData();
  const shell = useGhostLinkShell();
  const tr = useTr();
  if (!callData) return null;

  const isRinging = phase === 'ringing_outgoing';
  const isVideo = callData.callType === 'video' && videoEnabled;
  const statusText = isRinging
    ? tr('Llamando...', 'Calling...')
    : `${tr('En llamada', 'On call')} · ${formatDuration(callDurationSec)}`;
  const avatarUri = resolveCallAvatarUri(callData.peerPhotoUrl, callData.card.cardPhoto);

  if (isVideo && !isRinging && RtcSurfaceView) {
    return <ActiveVideoView />;
  }

  return (
    <View style={styles.centered}>
      <View style={styles.logoSlot}>
        <BrandLogoMark />
      </View>
      <PulsingRing size={130} active={isRinging}>
        <GoldAvatarRing uri={avatarUri} size={130} />
      </PulsingRing>
      <Text style={[styles.nameText, { color: shell.ghostLinkTextPrimary }]}>{callData.card.cardName}</Text>
      <CardBadge label={ghostCallParticipantBadgeLabel(callData, tr)} />
      <Text style={[styles.statusText, { color: shell.ghostLinkTextSecondary }]}>{statusText}</Text>

      <View style={styles.controls}>
        <ControlButton icon="microphone-off" label={tr('Silencio', 'Mute')} active={muted} onPress={toggleMute} />
        <ControlButton icon="volume-high" label={tr('Altavoz', 'Speaker')} active={speaker} onPress={toggleSpeaker} />
        <ControlButton icon="video" label={tr('Cámara', 'Camera')} active={videoEnabled} onPress={toggleVideo} />
      </View>

      <TouchableOpacity style={styles.endCallBtn} onPress={endCall} activeOpacity={0.8}>
        <MaterialCommunityIcons name="phone-hangup" size={28} color="#fff" />
        <Text style={styles.endCallText}>{tr('Colgar', 'End Call')}</Text>
      </TouchableOpacity>
      <Text style={[styles.footerText, { color: shell.ghostLinkTextMuted }]}>
        {tr('Enlace exclusivo', 'Exclusive Link')}
      </Text>
    </View>
  );
}

function IncomingView() {
  const { acceptIncoming, rejectIncoming } = useGhostLinkCall();
  const callData = useDisplayGhostCallData();
  const shell = useGhostLinkShell();
  const tr = useTr();
  if (!callData) return null;

  const isVideo = callData.callType === 'video';
  const statusLabel = isVideo
    ? tr('Videollamada Entrante...', 'Incoming Video Call...')
    : tr('Llamada Entrante...', 'Incoming Call...');

  return (
    <View style={styles.centered}>
      <View style={styles.logoSlot}>
        <BrandLogoMark />
      </View>
      <PulsingRing size={130} active>
        <GoldAvatarRing uri={resolveCallAvatarUri(callData.peerPhotoUrl, callData.card.cardPhoto)} size={130} />
      </PulsingRing>
      <Text style={[styles.nameText, { color: shell.ghostLinkTextPrimary }]}>@{callData.peerNickname}</Text>
      <Text style={[styles.fullNameText, { color: shell.ghostLinkTextSecondary }]}>{callData.peerName}</Text>
      {isVideo && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <MaterialCommunityIcons name="video" size={18} color={shell.tint} />
          <Text style={{ color: shell.tint, fontSize: 13, fontWeight: '600' }}>FaceCall</Text>
        </View>
      )}
      <Text style={[styles.statusText, { color: shell.ghostLinkTextSecondary }]}>{statusLabel}</Text>
      <CardBadge label={`${tr('Desde tu tarjeta', 'From your card')}: ${callData.card.cardName}`} />

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
          <Text style={[styles.acceptBtnText, { color: shell.emptyCtaText }]}>{tr('ACEPTAR', 'ACCEPT')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.rejectBtn, { backgroundColor: shell.surface, borderColor: shell.danger }]}
          onPress={rejectIncoming}
          activeOpacity={0.85}
        >
          <Text style={[styles.rejectBtnText, { color: shell.danger }]}>{tr('RECHAZAR', 'DECLINE')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ActiveIncomingView() {
  const { muted, speaker, videoEnabled, callDurationSec, toggleMute, toggleSpeaker, toggleVideo, flipCamera, endCall } = useGhostLinkCall();
  const callData = useDisplayGhostCallData();
  const shell = useGhostLinkShell();
  const tr = useTr();
  if (!callData) return null;

  const isVideo = callData.callType === 'video' && videoEnabled;
  if (isVideo && RtcSurfaceView) {
    return <ActiveVideoView />;
  }

  return (
    <View style={styles.centered}>
      <View style={styles.logoSlot}>
        <BrandLogoMark />
      </View>
      <GoldAvatarRing uri={resolveCallAvatarUri(callData.peerPhotoUrl, callData.card.cardPhoto)} size={130} />
      <Text style={[styles.nameText, { color: shell.ghostLinkTextPrimary }]}>{callData.peerName}</Text>
      <CardBadge label={`${tr('Desde tu tarjeta', 'From your card')}: ${callData.card.cardName}`} />
      <Text style={[styles.statusText, { color: shell.ghostLinkTextSecondary }]}>
        {tr('En llamada', 'On call')} · {formatDuration(callDurationSec)}
      </Text>

      <View style={styles.controls}>
        <ControlButton icon="microphone-off" label={tr('Silencio', 'Mute')} active={muted} onPress={toggleMute} />
        <ControlButton icon="volume-high" label={tr('Altavoz', 'Speaker')} active={speaker} onPress={toggleSpeaker} />
        <ControlButton icon="video" label={tr('Cámara', 'Camera')} active={videoEnabled} onPress={toggleVideo} />
      </View>

      <TouchableOpacity style={styles.endCallBtn} onPress={endCall} activeOpacity={0.8}>
        <MaterialCommunityIcons name="phone-hangup" size={28} color="#fff" />
        <Text style={styles.endCallText}>{tr('Colgar', 'End Call')}</Text>
      </TouchableOpacity>
      <Text style={[styles.footerText, { color: shell.ghostLinkTextMuted }]}>
        {tr('Enlace exclusivo', 'Exclusive Link')}
      </Text>
    </View>
  );
}

function ActiveVideoView() {
  const { muted, speaker, videoEnabled, callDurationSec, toggleMute, toggleSpeaker, toggleVideo, flipCamera, endCall } = useGhostLinkCall();
  const callData = useDisplayGhostCallData();
  const shell = useGhostLinkShell();
  const tr = useTr();
  const [remoteUid, setRemoteUid] = useState<number | null>(null);

  useEffect(() => {
    const e = getGhostLinkAgoraEngine();
    if (!e) return;
    const handler = {
      onUserJoined: (_conn: any, uid: number) => setRemoteUid(uid),
      onUserOffline: () => setRemoteUid(null),
    };
    e.registerEventHandler(handler);
    return () => {
      try { e.unregisterEventHandler(handler); } catch { /* ignore */ }
    };
  }, []);

  if (!callData || !RtcSurfaceView) return null;

  return (
    <View style={videoStyles.root}>
      {/* Remote video — full screen background */}
      {remoteUid != null ? (
        <RtcSurfaceView
          style={videoStyles.remoteVideo}
          canvas={{ uid: remoteUid }}
        />
      ) : (
        <View style={videoStyles.remoteVideoPlaceholder}>
          <GoldAvatarRing uri={resolveCallAvatarUri(callData.peerPhotoUrl, callData.card.cardPhoto)} size={100} />
          <Text style={[videoStyles.waitingText, { color: shell.ghostLinkTextMuted }]}>
            {tr('Esperando video...', 'Waiting for video...')}
          </Text>
        </View>
      )}

      {/* Local video — PiP (top right) */}
      {videoEnabled && VideoSourceType && (
        <View style={videoStyles.pipContainer}>
          <RtcSurfaceView
            style={videoStyles.pipVideo}
            canvas={{ uid: 0, sourceType: VideoSourceType.VideoSourceCamera }}
            zOrderMediaOverlay
          />
        </View>
      )}

      {/* Top info bar */}
      <View style={videoStyles.topBar}>
        <BrandLogoMark compact />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={videoStyles.topName}>{callData.peerName}</Text>
          <Text style={videoStyles.topStatus}>
            {callData.card.cardName} · {formatDuration(callDurationSec)}
          </Text>
        </View>
      </View>

      {/* Bottom controls */}
      <View style={videoStyles.bottomBar}>
        <ControlButton icon="microphone-off" label={tr('Silencio', 'Mute')} active={muted} onPress={toggleMute} />
        <ControlButton icon="video-off" label={tr('Cámara', 'Camera')} active={!videoEnabled} onPress={toggleVideo} />
        <ControlButton icon="camera-flip" label={tr('Voltear', 'Flip')} onPress={flipCamera} />
        <ControlButton icon="volume-high" label={tr('Altavoz', 'Speaker')} active={speaker} onPress={toggleSpeaker} />
      </View>

      <TouchableOpacity style={videoStyles.endBtn} onPress={endCall} activeOpacity={0.8}>
        <MaterialCommunityIcons name="phone-hangup" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

function EndedView({ reason }: { reason: 'ended' | 'rejected' | 'error' | 'muted' }) {
  const shell = useGhostLinkShell();
  const tr = useTr();
  const msg =
    reason === 'rejected'
      ? tr('Llamada rechazada', 'Call declined')
      : reason === 'muted'
        ? tr('Tarjeta silenciada — no se puede llamar', 'Card muted — cannot call')
        : reason === 'error'
          ? tr('No se pudo conectar', 'Could not connect')
          : tr('Llamada finalizada', 'Call ended');

  return (
    <View style={styles.centered}>
      <View style={styles.logoSlot}>
        <BrandLogoMark />
      </View>
      <MaterialCommunityIcons
        name={reason === 'rejected' ? 'phone-missed' : reason === 'muted' ? 'volume-off' : reason === 'error' ? 'alert-circle-outline' : 'phone-hangup'}
        size={64}
        color={shell.ghostLinkTextMuted}
      />
      <Text style={[styles.nameText, { marginTop: 20, color: shell.ghostLinkTextPrimary }]}>{msg}</Text>
    </View>
  );
}

export default function GhostLinkCallOverlay() {
  const { phase, callData } = useGhostLinkCall();
  const { resolvedMode } = useLookMode();
  const shell = palette[resolvedMode === 'noche' ? 'dark' : 'light'];

  if (phase === 'idle' || (!callData && phase !== 'ended' && phase !== 'rejected' && phase !== 'error')) return null;

  let content: React.ReactNode = null;
  switch (phase) {
    case 'confirming':
      content = <ConfirmView />;
      break;
    case 'ringing_outgoing':
    case 'active':
      content = callData?.direction === 'outgoing' ? <OutgoingView /> : <ActiveIncomingView />;
      break;
    case 'ringing_incoming':
      content = <IncomingView />;
      break;
    case 'ended':
      content = <EndedView reason="ended" />;
      break;
    case 'rejected':
      content = <EndedView reason="rejected" />;
      break;
    case 'muted':
      content = <EndedView reason="muted" />;
      break;
    case 'error':
      content = <EndedView reason="error" />;
      break;
    default:
      return null;
  }

  return (
    <Modal visible animationType="slide" statusBarTranslucent>
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
  /** Copiado de `app/signin.tsx` → `heroIconWrap` (sin depender del tema día/noche). */
  signinHeroIconWrap: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE9F2',
    ...Platform.select({
      ios: {
        shadowColor: '#0A2540',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
      default: {},
    }),
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
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 36,
    marginTop: 32,
    marginBottom: 28,
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
    backgroundColor: '#E53935',
    borderRadius: 32,
    paddingVertical: 14,
    paddingHorizontal: 40,
    gap: 10,
    marginTop: 8,
  },
  endCallText: {
    color: '#fff',
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
    backgroundColor: '#000',
  },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  remoteVideoPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
  },
  waitingText: {
    color: 'rgba(255,255,255,0.5)',
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
    borderColor: 'rgba(212, 175, 55, 0.85)',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
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
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  topStatus: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
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
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
