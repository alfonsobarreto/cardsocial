import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useGhostLinkCall } from '@/services/GhostLinkCallProvider';
import { getGhostLinkAgoraEngine } from '@/services/ghostLinkAgoraSession';
import { isGhostLinkAgoraNativeAvailable } from '@/services/expoGoAgoraGuard';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import palette from '@/app/theme';
import { brandCsLogo } from '@/constants/brandAssets';

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

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function AvatarCircle({ uri, size = 120 }: { uri: string | null; size?: number }) {
  const borderW = 4;
  return (
    <View
      style={[
        styles.avatarRing,
        { width: size + borderW * 2, height: size + borderW * 2, borderRadius: (size + borderW * 2) / 2 },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={[styles.avatarPlaceholder, { width: size, height: size, borderRadius: size / 2 }]}>
          <MaterialCommunityIcons name="account" size={size * 0.55} color="#fff" />
        </View>
      )}
    </View>
  );
}

function PulsingRing({ size, active, children }: { size: number; active: boolean; children: React.ReactNode }) {
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
  }, [active, scale, opacity]);

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
            borderColor: '#C8A84E',
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
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{label}</Text>
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
  return (
    <TouchableOpacity style={styles.controlBtn} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.controlCircle, active && styles.controlCircleActive]}>
        <MaterialCommunityIcons name={icon as any} size={28} color="#fff" />
      </View>
      <Text style={styles.controlLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ConfirmView() {
  const { callData, confirmCall, confirmVideoCall, cancelCall } = useGhostLinkCall();
  const tr = useTr();
  if (!callData) return null;

  const badgeLabel =
    callData.card.cardType === 'business'
      ? tr('Tarjeta de Negocio', 'Business Card')
      : tr('Tarjeta Social', 'Social Card');

  return (
    <View style={styles.centered}>
      <Image source={brandCsLogo} style={styles.logo} resizeMode="contain" />
      <AvatarCircle uri={callData.card.cardPhoto} size={130} />
      <Text style={styles.nameText}>{callData.card.cardName}</Text>
      <CardBadge label={badgeLabel} />
      <Text style={styles.subtitleText}>{tr('Conectar por Ghost-Link', 'Connect via Ghost-Link')}</Text>
      <View style={styles.confirmActions}>
        <TouchableOpacity style={styles.confirmBtn} onPress={confirmCall} activeOpacity={0.8}>
          <MaterialCommunityIcons name="phone" size={24} color="#fff" />
          <Text style={styles.confirmBtnText}>{tr('Llamada de voz', 'Voice Call')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#C8A84E' }]} onPress={confirmVideoCall} activeOpacity={0.8}>
          <MaterialCommunityIcons name="video" size={24} color="#fff" />
          <Text style={styles.confirmBtnText}>{tr('FaceCall', 'FaceCall')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={cancelCall} activeOpacity={0.8}>
          <Text style={styles.cancelBtnText}>{tr('Cancelar', 'Cancel')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.footerText}>{tr('Tu numero real esta 100% oculto', 'Your real number is 100% hidden')}</Text>
    </View>
  );
}

function OutgoingView() {
  const { phase, callData, muted, speaker, videoEnabled, callDurationSec, toggleMute, toggleSpeaker, toggleVideo, flipCamera, endCall } = useGhostLinkCall();
  const tr = useTr();
  if (!callData) return null;

  const isRinging = phase === 'ringing_outgoing';
  const isVideo = callData.callType === 'video' && videoEnabled;
  const statusText = isRinging
    ? tr('Llamando...', 'Calling...')
    : `${tr('En llamada', 'On call')} · ${formatDuration(callDurationSec)}`;

  if (isVideo && !isRinging && RtcSurfaceView) {
    return <ActiveVideoView />;
  }

  return (
    <View style={styles.centered}>
      <Image source={brandCsLogo} style={styles.logo} resizeMode="contain" />
      <PulsingRing size={130} active={isRinging}>
        <AvatarCircle uri={callData.card.cardPhoto} size={130} />
      </PulsingRing>
      <Text style={styles.nameText}>{callData.card.cardName}</Text>
      <CardBadge label={`${tr('Su Tarjeta', 'Their Card')}: ${callData.card.cardName}`} />
      <Text style={styles.statusText}>{statusText}</Text>

      <View style={styles.controls}>
        <ControlButton icon="microphone-off" label={tr('Silencio', 'Mute')} active={muted} onPress={toggleMute} />
        <ControlButton icon="volume-high" label={tr('Altavoz', 'Speaker')} active={speaker} onPress={toggleSpeaker} />
        <ControlButton icon="video" label={tr('Cámara', 'Camera')} active={videoEnabled} onPress={toggleVideo} />
      </View>

      <TouchableOpacity style={styles.endCallBtn} onPress={endCall} activeOpacity={0.8}>
        <MaterialCommunityIcons name="phone-hangup" size={28} color="#fff" />
        <Text style={styles.endCallText}>{tr('Colgar', 'End Call')}</Text>
      </TouchableOpacity>
      <Text style={styles.footerText}>{tr('Tu numero real esta 100% oculto', 'Your real number is 100% hidden')}</Text>
    </View>
  );
}

function IncomingView() {
  const { callData, acceptIncoming, rejectIncoming } = useGhostLinkCall();
  const tr = useTr();
  if (!callData) return null;

  const isVideo = callData.callType === 'video';
  const statusLabel = isVideo
    ? tr('Videollamada Entrante...', 'Incoming Video Call...')
    : tr('Llamada Entrante...', 'Incoming Call...');

  return (
    <View style={styles.centered}>
      <Image source={brandCsLogo} style={styles.logo} resizeMode="contain" />
      <PulsingRing size={130} active>
        <AvatarCircle uri={callData.peerPhotoUrl} size={130} />
      </PulsingRing>
      <Text style={styles.nameText}>@{callData.peerNickname}</Text>
      <Text style={styles.fullNameText}>{callData.peerName}</Text>
      {isVideo && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <MaterialCommunityIcons name="video" size={18} color="#C8A84E" />
          <Text style={{ color: '#C8A84E', fontSize: 13, fontWeight: '600' }}>FaceCall</Text>
        </View>
      )}
      <Text style={styles.statusText}>{statusLabel}</Text>
      <CardBadge label={`${tr('Desde tu tarjeta', 'From your card')}: ${callData.card.cardName}`} />

      <View style={styles.incomingActions}>
        <TouchableOpacity style={styles.acceptBtn} onPress={acceptIncoming} activeOpacity={0.8}>
          <MaterialCommunityIcons name={isVideo ? 'video' : 'phone'} size={20} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.acceptBtnText}>{tr('ACEPTAR', 'ACCEPT')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.rejectBtn} onPress={rejectIncoming} activeOpacity={0.8}>
          <Text style={styles.rejectBtnText}>{tr('RECHAZAR', 'DECLINE')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ActiveIncomingView() {
  const { callData, muted, speaker, videoEnabled, callDurationSec, toggleMute, toggleSpeaker, toggleVideo, flipCamera, endCall } = useGhostLinkCall();
  const tr = useTr();
  if (!callData) return null;

  const isVideo = callData.callType === 'video' && videoEnabled;
  if (isVideo && RtcSurfaceView) {
    return <ActiveVideoView />;
  }

  return (
    <View style={styles.centered}>
      <Image source={brandCsLogo} style={styles.logo} resizeMode="contain" />
      <AvatarCircle uri={callData.peerPhotoUrl} size={130} />
      <Text style={styles.nameText}>{callData.peerName}</Text>
      <CardBadge label={`${tr('Desde tu tarjeta', 'From your card')}: ${callData.card.cardName}`} />
      <Text style={styles.statusText}>{tr('En llamada', 'On call')} · {formatDuration(callDurationSec)}</Text>

      <View style={styles.controls}>
        <ControlButton icon="microphone-off" label={tr('Silencio', 'Mute')} active={muted} onPress={toggleMute} />
        <ControlButton icon="volume-high" label={tr('Altavoz', 'Speaker')} active={speaker} onPress={toggleSpeaker} />
        <ControlButton icon="video" label={tr('Cámara', 'Camera')} active={videoEnabled} onPress={toggleVideo} />
      </View>

      <TouchableOpacity style={styles.endCallBtn} onPress={endCall} activeOpacity={0.8}>
        <MaterialCommunityIcons name="phone-hangup" size={28} color="#fff" />
        <Text style={styles.endCallText}>{tr('Colgar', 'End Call')}</Text>
      </TouchableOpacity>
      <Text style={styles.footerText}>{tr('Tu numero real esta 100% oculto', 'Your real number is 100% hidden')}</Text>
    </View>
  );
}

function ActiveVideoView() {
  const { callData, muted, speaker, videoEnabled, callDurationSec, toggleMute, toggleSpeaker, toggleVideo, flipCamera, endCall } = useGhostLinkCall();
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
          <AvatarCircle uri={callData.peerPhotoUrl} size={100} />
          <Text style={videoStyles.waitingText}>{tr('Esperando video...', 'Waiting for video...')}</Text>
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
        <Image source={brandCsLogo} style={{ width: 28, height: 28 }} resizeMode="contain" />
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
      <Image source={brandCsLogo} style={styles.logo} resizeMode="contain" />
      <MaterialCommunityIcons
        name={reason === 'rejected' ? 'phone-missed' : reason === 'muted' ? 'volume-off' : reason === 'error' ? 'alert-circle-outline' : 'phone-hangup'}
        size={64}
        color="rgba(255,255,255,0.6)"
      />
      <Text style={[styles.nameText, { marginTop: 20 }]}>{msg}</Text>
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
      <LinearGradient colors={[...shell.ghostLinkPremiumGradient]} style={styles.root}>
        {content}
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
  },
  logo: {
    width: 48,
    height: 48,
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
  },
  avatarRing: {
    borderWidth: 4,
    borderColor: '#C8A84E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  avatarPlaceholder: {
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  fullNameText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 8,
  },
  statusText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    marginBottom: 12,
  },
  subtitleText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 24,
  },
  badge: {
    backgroundColor: '#1B6B3A',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginVertical: 8,
  },
  badgeText: {
    color: '#fff',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlCircleActive: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  controlLabel: {
    color: 'rgba(255,255,255,0.8)',
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
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 24,
  },
  confirmActions: {
    alignItems: 'center',
    gap: 14,
    width: '100%',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1B6B3A',
    borderRadius: 32,
    paddingVertical: 14,
    paddingHorizontal: 36,
    gap: 10,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  cancelBtnText: {
    color: 'rgba(255,255,255,0.6)',
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
    backgroundColor: '#1B6B3A',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  rejectBtn: {
    backgroundColor: '#E53935',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  rejectBtnText: {
    color: '#fff',
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
    borderColor: '#C8A84E',
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
