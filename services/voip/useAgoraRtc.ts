/**
 * Hook recomendado (Fase IN_CALL): ciclo de vida estricto del IRtcEngine + estado UI (audio + vídeo).
 *
 * - Join solo tras el handoff de audio (`shouldJoin=true` cuando CONNECTING haya terminado).
 * - leaveGhostLinkAgoraSession() hace leaveChannel + release en un solo sitio (sin motores zombie).
 *
 * Integración: `GhostLinkCallProvider` delega join/handlers aquí; feedback y fases vía callbacks.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GhostLinkAgoraRtc } from '@/services/ghostLinkVoip';
import {
  getGhostLinkAgoraEngine,
  joinGhostLinkAgoraSession,
  leaveGhostLinkAgoraSession,
  setGhostLinkAgoraCameraZoom,
  setGhostLinkAgoraMuted,
  setGhostLinkAgoraSpeaker,
  setGhostLinkAgoraVideo,
  switchGhostLinkAgoraCamera,
} from '@/services/ghostLinkAgoraSession';
import { isGhostLinkAgoraNativeAvailable } from '@/services/expoGoAgoraGuard';

import type { IRtcEngineEventHandler, UserOfflineReasonType } from 'react-native-agora';
import { RemoteVideoState, RemoteVideoStateReason } from 'react-native-agora';

function isRemoteVideoRendering(
  state: RemoteVideoState,
  reason: RemoteVideoStateReason,
): boolean {
  if (state === RemoteVideoState.RemoteVideoStateDecoding) return true;
  if (state === RemoteVideoState.RemoteVideoStateStarting) return true;
  if (state === RemoteVideoState.RemoteVideoStateFrozen) return false;
  if (state === RemoteVideoState.RemoteVideoStateFailed) return false;
  if (state === RemoteVideoState.RemoteVideoStateStopped) {
    return reason === RemoteVideoStateReason.RemoteVideoStateReasonRemoteUnmuted;
  }
  return false;
}

export type UseAgoraRtcParams = {
  creds: GhostLinkAgoraRtc | null;
  enableVideo: boolean;
  shouldJoin: boolean;
  /**
   * Cámara local encendida (UI). Solo aplica si `enableVideo`; sincronizado al engine al unirse y al cambiar.
   */
  localVideoOn: boolean;
  onRemoteUserJoined?: (remoteUid: number) => void;
  onLocalRtcJoined?: () => void;
  onRemoteUserOffline?: (remoteUid: number, reason: UserOfflineReasonType) => void;
  onLeaveChannel?: () => void;
  initialSpeakerphoneOn?: boolean;
};

export type UseAgoraRtcResult = {
  isMuted: boolean;
  isSpeakerphoneOn: boolean;
  remoteUid: number | null;
  /** El remoto está enviando vídeo decodificable; si false, evitar `RtcSurfaceView` remoto (avatar / fondo). */
  isRemoteVideoEnabled: boolean;
  toggleMute: () => void;
  toggleSpeakerphone: () => void;
  /** Alterna cámara frontal/trasera (IRtcEngine.switchCamera). */
  switchCamera: () => void;
  /** Fija altavoz (solo estado React; el efecto existente sincroniza con Agora). */
  setSpeakerphoneOn: (on: boolean) => void;
  /** Inicio de gesto pinch: ancla el zoom actual para multiplicar por `scale` del gesto. */
  onLocalCameraPinchStart: () => void;
  /** Actualiza zoom local como `zoomAncla * relativeScale` (p. ej. `event.scale` de Pinch). */
  applyLocalCameraPinchScale: (relativeScale: number) => void;
  endRtcSession: () => Promise<void>;
};

export function useAgoraRtc(params: UseAgoraRtcParams): UseAgoraRtcResult {
  const {
    creds,
    enableVideo,
    shouldJoin,
    localVideoOn,
    onRemoteUserJoined,
    onLocalRtcJoined,
    onRemoteUserOffline,
    onLeaveChannel,
    initialSpeakerphoneOn = false,
  } = params;

  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerphoneOn, setIsSpeakerphoneOn] = useState(initialSpeakerphoneOn);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [isRemoteVideoEnabled, setIsRemoteVideoEnabled] = useState(false);

  const remoteUidRef = useRef<number | null>(null);
  remoteUidRef.current = remoteUid;
  const localVideoOnRef = useRef(localVideoOn);
  localVideoOnRef.current = localVideoOn;

  const localCameraZoomRef = useRef(1);
  const pinchAnchorZoomRef = useRef(1);

  const isMutedRef = useRef(isMuted);
  const isSpeakerphoneOnRef = useRef(isSpeakerphoneOn);
  isMutedRef.current = isMuted;
  isSpeakerphoneOnRef.current = isSpeakerphoneOn;

  const onJoinedRef = useRef(onRemoteUserJoined);
  const onLocalJoinedRef = useRef(onLocalRtcJoined);
  const onOfflineRef = useRef(onRemoteUserOffline);
  const onLeaveRef = useRef(onLeaveChannel);
  onJoinedRef.current = onRemoteUserJoined;
  onLocalJoinedRef.current = onLocalRtcJoined;
  onOfflineRef.current = onRemoteUserOffline;
  onLeaveRef.current = onLeaveChannel;

  const prevShouldJoinRef = useRef(false);
  useEffect(() => {
    if (shouldJoin && !prevShouldJoinRef.current) {
      setIsMuted(false);
      setIsSpeakerphoneOn(initialSpeakerphoneOn);
    }
    if (!shouldJoin) {
      setRemoteUid(null);
      setIsRemoteVideoEnabled(false);
      localCameraZoomRef.current = 1;
      pinchAnchorZoomRef.current = 1;
      if (getGhostLinkAgoraEngine()) {
        setGhostLinkAgoraCameraZoom(1);
      }
    }
    prevShouldJoinRef.current = shouldJoin;
  }, [shouldJoin, initialSpeakerphoneOn]);

  const endRtcSession = useCallback(async () => {
    await leaveGhostLinkAgoraSession();
    setRemoteUid(null);
    setIsRemoteVideoEnabled(false);
  }, []);

  useEffect(() => {
    if (!getGhostLinkAgoraEngine() || !enableVideo || !shouldJoin) return;
    setGhostLinkAgoraVideo(localVideoOn);
  }, [localVideoOn, enableVideo, shouldJoin]);

  useEffect(() => {
    if (!isGhostLinkAgoraNativeAvailable() || !shouldJoin || !creds) {
      return undefined;
    }

    let cancelled = false;
    const handler: IRtcEngineEventHandler = {
      onUserJoined: (_connection, uid) => {
        if (cancelled || uid === 0) return;
        setRemoteUid(uid);
        setIsRemoteVideoEnabled(false);
        onJoinedRef.current?.(uid);
      },
      onUserOffline: (_connection, uid, reason) => {
        if (cancelled) return;
        setRemoteUid(null);
        setIsRemoteVideoEnabled(false);
        onOfflineRef.current?.(uid, reason);
      },
      onLeaveChannel: (_connection, _stats) => {
        if (cancelled) return;
        onLeaveRef.current?.();
      },
      onRemoteVideoStateChanged: (_connection, uid, state, reason, _elapsed) => {
        if (cancelled || uid !== remoteUidRef.current) return;
        setIsRemoteVideoEnabled(isRemoteVideoRendering(state, reason));
      },
      onUserMuteVideo: (_connection, uid, muted) => {
        if (cancelled || uid !== remoteUidRef.current) return;
        setIsRemoteVideoEnabled(!muted);
      },
      onUserEnableVideo: (_connection, uid, enabled) => {
        if (cancelled || uid !== remoteUidRef.current) return;
        if (!enabled) setIsRemoteVideoEnabled(false);
      },
    };

    void (async () => {
      try {
        await joinGhostLinkAgoraSession(creds, enableVideo);
      } catch {
        return;
      }
      if (cancelled) {
        await leaveGhostLinkAgoraSession();
        return;
      }
      const engine = getGhostLinkAgoraEngine();
      if (!engine || cancelled) return;

      try {
        engine.registerEventHandler(handler);
      } catch {
        /* noop */
      }

      try {
        setGhostLinkAgoraMuted(isMutedRef.current);
        setGhostLinkAgoraSpeaker(isSpeakerphoneOnRef.current);
        if (enableVideo) {
          setGhostLinkAgoraVideo(localVideoOnRef.current);
        }
      } catch {
        /* noop */
      }

      if (!cancelled) {
        onLocalJoinedRef.current?.();
      }
    })();

    return () => {
      cancelled = true;
      const engine = getGhostLinkAgoraEngine();
      if (engine) {
        try {
          engine.unregisterEventHandler(handler);
        } catch {
          /* noop */
        }
      }
      void leaveGhostLinkAgoraSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- join solo al armar creds/shouldJoin/video
  }, [shouldJoin, creds?.appId, creds?.channelName, creds?.token, creds?.uid, enableVideo]);

  useEffect(() => {
    if (!getGhostLinkAgoraEngine()) return;
    setGhostLinkAgoraMuted(isMuted);
  }, [isMuted]);

  useEffect(() => {
    if (!getGhostLinkAgoraEngine()) return;
    setGhostLinkAgoraSpeaker(isSpeakerphoneOn);
  }, [isSpeakerphoneOn]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const toggleSpeakerphone = useCallback(() => {
    setIsSpeakerphoneOn((prev) => !prev);
  }, []);

  const switchCamera = useCallback(() => {
    switchGhostLinkAgoraCamera();
    localCameraZoomRef.current = setGhostLinkAgoraCameraZoom(1);
    pinchAnchorZoomRef.current = localCameraZoomRef.current;
  }, []);

  const setSpeakerphoneOn = useCallback((on: boolean) => {
    setIsSpeakerphoneOn(on);
  }, []);

  const onLocalCameraPinchStart = useCallback(() => {
    pinchAnchorZoomRef.current = localCameraZoomRef.current;
  }, []);

  const applyLocalCameraPinchScale = useCallback(
    (relativeScale: number) => {
      if (!enableVideo || !shouldJoin) return;
      const next = pinchAnchorZoomRef.current * relativeScale;
      localCameraZoomRef.current = setGhostLinkAgoraCameraZoom(next);
    },
    [enableVideo, shouldJoin],
  );

  return {
    isMuted,
    isSpeakerphoneOn,
    remoteUid,
    isRemoteVideoEnabled,
    toggleMute,
    toggleSpeakerphone,
    switchCamera,
    setSpeakerphoneOn,
    onLocalCameraPinchStart,
    applyLocalCameraPinchScale,
    endRtcSession,
  };
}

export const useAgoraRTC = useAgoraRtc;
