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
  scheduleGhostLinkAgoraAudioRouteSync,
  setGhostLinkAgoraCameraZoom,
  setGhostLinkAgoraMuted,
  setGhostLinkAgoraSpeaker,
  setGhostLinkAgoraVideo,
  switchGhostLinkAgoraCamera,
} from '@/services/ghostLinkAgoraSession';
import { isGhostLinkAgoraNativeAvailable } from '@/services/expoGoAgoraGuard';
import {
  AgoraRemoteVideoState,
  AgoraRemoteVideoStateReason,
  type AgoraRtcEventHandler,
  type AgoraUserOfflineReason,
} from '@/services/voip/agoraSdkConstants';

function isRemoteVideoRendering(state: number, reason: number): boolean {
  if (state === AgoraRemoteVideoState.Decoding) return true;
  if (state === AgoraRemoteVideoState.Starting) return true;
  if (state === AgoraRemoteVideoState.Frozen) return false;
  if (state === AgoraRemoteVideoState.Failed) return false;
  if (state === AgoraRemoteVideoState.Stopped) {
    return reason === AgoraRemoteVideoStateReason.RemoteUnmuted;
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
  onRemoteUserOffline?: (remoteUid: number, reason: AgoraUserOfflineReason) => void;
  onLeaveChannel?: () => void;
  initialSpeakerphoneOn?: boolean;
  /** iOS/Android: el SDK notifica cambios de ruta (p. ej. AirPods conectados durante la llamada). */
  onAudioRoutingChanged?: (routing: number, previous: number | null) => void;
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
    onAudioRoutingChanged,
  } = params;

  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerphoneOn, setIsSpeakerphoneOn] = useState(initialSpeakerphoneOn);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [isRemoteVideoEnabled, setIsRemoteVideoEnabled] = useState(false);

  const remoteUidRef = useRef<number | null>(null);
  remoteUidRef.current = remoteUid;
  const localVideoOnRef = useRef(localVideoOn);
  localVideoOnRef.current = localVideoOn;

  /** Último valor para `joinGhostLinkAgoraSession` — no va en deps del efecto principal (evita teardown al cambiar modo vídeo UI). */
  const enableVideoRef = useRef(enableVideo);
  enableVideoRef.current = enableVideo;

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
  const onAudioRoutingRef = useRef(onAudioRoutingChanged);
  onJoinedRef.current = onRemoteUserJoined;
  onLocalJoinedRef.current = onLocalRtcJoined;
  onOfflineRef.current = onRemoteUserOffline;
  onLeaveRef.current = onLeaveChannel;
  onAudioRoutingRef.current = onAudioRoutingChanged;

  const lastSdkAudioRouteRef = useRef<number | null>(null);

  const prevShouldJoinRef = useRef(false);
  useEffect(() => {
    if (shouldJoin && !prevShouldJoinRef.current) {
      setIsMuted(false);
      /** No resetear `isSpeakerphoneOn` aquí: si el usuario activó altavoz en timbre (`ringing_*`),
       *  debe persistir al join; `initialSpeakerphoneOn` forzaría OFF y desincroniza UI ↔ hardware. */
    }
    if (!shouldJoin) {
      setRemoteUid(null);
      setIsRemoteVideoEnabled(false);
      lastSdkAudioRouteRef.current = null;
      localCameraZoomRef.current = 1;
      pinchAnchorZoomRef.current = 1;
      if (getGhostLinkAgoraEngine()) {
        setGhostLinkAgoraCameraZoom(1);
      }
    }
    prevShouldJoinRef.current = shouldJoin;
  }, [shouldJoin]);

  const endRtcSession = useCallback(async () => {
    await leaveGhostLinkAgoraSession();
    setRemoteUid(null);
    setIsRemoteVideoEnabled(false);
  }, []);

  /** Publicar / cortar vídeo local también si la llamada empezó en audio (upgrade a FaceCall). */
  useEffect(() => {
    if (!getGhostLinkAgoraEngine() || !shouldJoin) return;
    setGhostLinkAgoraVideo(localVideoOn);
  }, [localVideoOn, shouldJoin]);

  useEffect(() => {
    if (!isGhostLinkAgoraNativeAvailable() || !shouldJoin || !creds) {
      return undefined;
    }

    let cancelled = false;
    const handler: AgoraRtcEventHandler = {
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
      onAudioRoutingChanged: (routing) => {
        if (cancelled) return;
        const prev = lastSdkAudioRouteRef.current;
        lastSdkAudioRouteRef.current = routing;
        scheduleGhostLinkAgoraAudioRouteSync();
        onAudioRoutingRef.current?.(routing, prev);
      },
    };

    void (async () => {
      try {
        await joinGhostLinkAgoraSession(creds, enableVideoRef.current);
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
        setGhostLinkAgoraVideo(localVideoOnRef.current);
      } catch {
        /* noop */
      }

      if (!cancelled) {
        try {
          setGhostLinkAgoraSpeaker(isSpeakerphoneOnRef.current);
        } catch {
          /* noop */
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- join solo al armar creds/shouldJoin; no `enableVideo` (toggle cámara / modo no debe leaveChannel)
  }, [shouldJoin, creds?.appId, creds?.channelName, creds?.token, creds?.uid]);

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
      if (!shouldJoin || !localVideoOn) return;
      const next = pinchAnchorZoomRef.current * relativeScale;
      localCameraZoomRef.current = setGhostLinkAgoraCameraZoom(next);
    },
    [shouldJoin, localVideoOn],
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
