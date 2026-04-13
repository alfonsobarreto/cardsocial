import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, NativeModules, Vibration } from 'react-native';
import type { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import Toast from 'react-native-toast-message';
import { getActiveUserId } from '@/services/authSession';

const RINGTONE_AUDIO_ASSET = require('@/assets/sounds/ghost-link-ringtone.wav');
const RINGTONE_VIDEO_ASSET = require('@/assets/sounds/ghost-link-ringtone-video.wav');
const RINGBACK_AUDIO_ASSET = require('@/assets/sounds/ghost-link-ringback.wav');
const RINGBACK_VIDEO_ASSET = require('@/assets/sounds/ghost-link-ringback-video.wav');
import {
  getIncomingGhostLinkInvite,
  getOutgoingGhostLinkInviteStatus,
  respondGhostLinkInvite,
  startGhostLinkVoipCall,
  isGhostLinkExpoGoAbortError,
} from '@/services/ghostLinkVoip';
import type {
  GhostLinkAgoraRtc,
  GhostLinkCallStartParams,
  GhostLinkCallType,
  GhostLinkSharedCard,
} from '@/services/ghostLinkVoip';
import { createCallLog } from '@/services/qrApi';
import { triggerGhostLinkConnectedFeedback } from '@/services/voip/ghostLinkConnectedFeedback';
import { runVoipConnectingAudioHandoff } from '@/services/voip/voipExpoAvToAgoraAudioBridge';
import { useAgoraRtc } from '@/services/voip/useAgoraRtc';
import { useGhostLinkRingingVideoPreview } from '@/services/voip/useGhostLinkRingingVideoPreview';
import { ensureVoipPermissions } from '@/services/voip/ensureVoipPermissions';
import { VoIPCallPhase } from '@/services/voip/VoIPCallPhase';
import { isGhostLinkAgoraNativeAvailable } from '@/services/expoGoAgoraGuard';
import { setGhostLinkAgoraSpeaker } from '@/services/ghostLinkAgoraSession';
import { useLanguage } from '@/services/language';

/** @deprecated Use `VoIPCallPhase` (enum) en código nuevo. */
export type GhostCallPhase = VoIPCallPhase;

export type GhostCallData = {
  inviteId?: string;
  sessionId?: string;
  direction: 'outgoing' | 'incoming';
  callType: GhostLinkCallType;
  card: GhostLinkSharedCard;
  peerName: string;
  peerNickname: string;
  peerPhotoUrl: string | null;
  peerUid: string;
  agora?: GhostLinkAgoraRtc;
  ownerUid: string;
  sourceCardId: string | null;
};

type GhostLinkCallContextValue = {
  phase: VoIPCallPhase;
  callData: GhostCallData | null;
  muted: boolean;
  speaker: boolean;
  /** Llamada VoIP minimizada a burbuja flotante (multitarea in-app). */
  isMinimized: boolean;
  minimizeCall: () => void;
  maximizeCall: () => void;
  /** UID remoto en el canal Agora (vídeo); null hasta que el peer entre. */
  remoteUid: number | null;
  /** Remoto enviando vídeo visible (evita frame congelado en `RtcSurfaceView`). */
  isRemoteVideoEnabled: boolean;
  /** Preview local Agora durante timbre (antes de `joinChannel`). */
  localPreviewActive: boolean;
  videoEnabled: boolean;
  /** Seconds elapsed since the call was connected (active phase). */
  callDurationSec: number;
  /** Pinch sobre PiP local (solo FaceCall); ancla + escala relativa del gesto. */
  onLocalCameraPinchStart: () => void;
  applyLocalCameraPinchScale: (relativeScale: number) => void;
  requestCall: (params: {
    targetUid: string;
    sourceCardId: string | null;
    sourceCardName: string;
    cardPhoto: string | null;
    cardType: 'business' | 'personal';
    callType?: GhostLinkCallType;
    peerName: string;
    peerNickname: string;
    peerPhotoUrl: string | null;
  }) => void;
  confirmCall: () => Promise<void>;
  confirmVideoCall: () => Promise<void>;
  cancelCall: () => void;
  acceptIncoming: () => Promise<void>;
  rejectIncoming: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleVideo: () => void;
  flipCamera: () => void;
};

const GhostLinkCallContext = createContext<GhostLinkCallContextValue | null>(null);

export function useGhostLinkCall(): GhostLinkCallContextValue {
  const ctx = useContext(GhostLinkCallContext);
  if (!ctx) {
    throw new Error('useGhostLinkCall must be used inside GhostLinkCallProvider');
  }
  return ctx;
}

const POLL_INTERVAL_MS = 4000;
const INVITE_TTL_MS = 45_000;
const CALLER_STATUS_POLL_MS = 3000;
/** Emisor tras `accepted` + handoff: si el remoto no entra al canal Agora, evitar “Llamando…” infinito. */
const OUTGOING_AGORA_JOIN_TIMEOUT_MS = 15_000;

/** Carga expo-av solo al reproducir tono; evita crash si el dev build no incluye ExponentAV. */
let expoAvModulePromise: Promise<typeof import('expo-av') | null> | undefined;
function loadExpoAv(): Promise<typeof import('expo-av') | null> {
  if (expoAvModulePromise === undefined) {
    expoAvModulePromise = import('expo-av')
      .then((m) => m)
      .catch(() => null);
  }
  return expoAvModulePromise;
}

// ── Imperative bridge for non-React code (ActionController) ──
type ImperativeRequestCall = GhostLinkCallContextValue['requestCall'] | null;
let _imperativeRequestCall: ImperativeRequestCall = null;

export function requestGhostLinkCallImperative(params: Parameters<NonNullable<ImperativeRequestCall>>[0]): void {
  if (_imperativeRequestCall) {
    _imperativeRequestCall(params);
  }
}

export function GhostLinkCallProvider({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const tr = useCallback((es: string, en: string) => (language === 'en' ? en : es), [language]);

  const [phase, setPhase] = useState<VoIPCallPhase>(VoIPCallPhase.Idle);
  const [callData, setCallData] = useState<GhostCallData | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [callDurationSec, setCallDurationSec] = useState(0);
  /** true tras `runVoipConnectingAudioHandoff`; el join RTC lo hace solo `useAgoraRtc`. */
  const [rtcHandoffComplete, setRtcHandoffComplete] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const pendingParamsRef = useRef<GhostLinkCallStartParams | null>(null);
  const pollingRef = useRef(true);
  const activeStartRef = useRef<number | null>(null);
  const ringingStartRef = useRef<number | null>(null);
  /** Emisor: evita doble handoff/join si el poll ve `accepted` dos veces antes de terminar el await. */
  const outgoingRtcPrimedRef = useRef(false);
  /** Emisor: salvavidas post-accept si `onRemoteUserJoined` nunca llega. */
  const outgoingJoinWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const callDataRef = useRef<GhostCallData | null>(null);
  callDataRef.current = callData;
  const directionRef = useRef<GhostCallData['direction'] | undefined>(undefined);
  directionRef.current = callData?.direction;
  const endingInProgressRef = useRef(false);
  /** Evita que `onLeaveChannel` duplique teardown tras colgar/cancelar local (misma salida del SDK). */
  const suppressLeaveFinalizeRef = useRef(false);
  const finalizeEndingRef = useRef<(kind: 'local' | 'remote' | 'leave_channel' | 'cancel') => Promise<void>>(async () => {});
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const stopTone = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch {
      soundRef.current = null;
    }
  }, []);

  const playTone = useCallback(async (asset: any) => {
    try {
      await stopTone();
      const av = await loadExpoAv();
      if (!av?.Audio) return;
      const { Audio } = av;
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: 0,
        interruptionModeAndroid: 2,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const { sound } = await Audio.Sound.createAsync(asset, { isLooping: true, volume: 0.72 });
      soundRef.current = sound;
      await sound.playAsync();
    } catch {
      /* device without audio or native module missing */
    }
  }, [stopTone]);

  // ── Timer: cuenta segundos en fase active ──
  useEffect(() => {
    if (phase === VoIPCallPhase.Active) {
      if (!activeStartRef.current) {
        activeStartRef.current = Date.now();
      }
      setCallDurationSec(0);
      const iv = setInterval(() => {
        if (activeStartRef.current) {
          setCallDurationSec(Math.floor((Date.now() - activeStartRef.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(iv);
    }
    activeStartRef.current = null;
    setCallDurationSec(0);
  }, [phase]);

  // ── Polling de llamadas entrantes ──
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const poll = async () => {
      if (cancelled || !pollingRef.current) return;
      if (phaseRef.current !== VoIPCallPhase.Idle) return;

      try {
        const ownerUid = await getActiveUserId();
        if (!ownerUid || cancelled) return;

        const invite = await getIncomingGhostLinkInvite({ ownerUid });
        if (cancelled || phaseRef.current !== VoIPCallPhase.Idle) return;

        if (invite) {
          const incomingCallType: GhostLinkCallType = invite.callType || 'audio';
          pollingRef.current = false;
          setCallData({
            inviteId: invite.inviteId,
            sessionId: invite.sessionId,
            direction: 'incoming',
            callType: incomingCallType,
            card: invite.card,
            peerName: invite.callerDisplay.name,
            peerNickname: invite.callerDisplay.nickname,
            peerPhotoUrl: invite.callerDisplay.photoUrl,
            peerUid: invite.ownerUid,
            agora: invite.agora,
            ownerUid,
            sourceCardId: invite.sourceCardId,
          });
          if (incomingCallType === 'video') setVideoEnabled(true);
          setPhase(VoIPCallPhase.RingingIncoming);
          Vibration.vibrate([0, 500, 400, 500, 400, 500], true);
          await playTone(incomingCallType === 'video' ? RINGTONE_VIDEO_ASSET : RINGTONE_AUDIO_ASSET);
        }
      } catch {
        /* network hiccup — retry next tick */
      }

      if (!cancelled) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();

    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && phaseRef.current === VoIPCallPhase.Idle) {
        pollingRef.current = true;
        poll();
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      appSub.remove();
    };
  }, [phase, playTone]);

  // ── Callee: durante INCOMING_RINGING, seguir consultando si la invitación sigue en “ringing” ──
  useEffect(() => {
    if (phase !== VoIPCallPhase.RingingIncoming) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const watch = async () => {
      if (cancelled) return;
      const cd = callDataRef.current;
      const expectId = cd?.inviteId;
      const ownerUid = cd?.ownerUid;
      if (!expectId || !ownerUid) {
        if (!cancelled) {
          timer = setTimeout(watch, CALLER_STATUS_POLL_MS);
        }
        return;
      }

      try {
        const current = await getIncomingGhostLinkInvite({ ownerUid });
        if (cancelled) return;
        if (!current || current.inviteId !== expectId) {
          void finalizeEndingRef.current('remote');
          return;
        }
      } catch {
        /* red intermitente — reintentar */
      }

      if (!cancelled) {
        timer = setTimeout(watch, CALLER_STATUS_POLL_MS);
      }
    };

    timer = setTimeout(watch, CALLER_STATUS_POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [phase]);

  /**
   * Push en primer plano: sin closures sobre `phase`/`callData` del render.
   * Siempre leemos `phaseRef`, `callDataRef` y `finalizeEndingRef` (mutados cada render / layout),
   * y el efecto tiene deps `[]` para no re-suscribir al listener con valores obsoletos.
   */
  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    const onNotificationReceived = (notification: Notifications.Notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      const type = data?.type != null ? String(data.type) : '';

      if (type === 'ghost-link-incoming' && phaseRef.current === VoIPCallPhase.Idle) {
        pollingRef.current = true;
      }

      if (type === 'ghost-link-cancelled' && phaseRef.current === VoIPCallPhase.RingingIncoming) {
        const nid = data?.inviteId != null ? String(data.inviteId) : '';
        if (!nid || nid === callDataRef.current?.inviteId) {
          void finalizeEndingRef.current('remote');
        }
      }
    };

    try {
      sub = Notifications.addNotificationReceivedListener(onNotificationReceived);
    } catch {
      return undefined;
    }
    return () => {
      try {
        sub?.remove();
      } catch {
        /* noop */
      }
    };
  }, []);

  // ── Volume-down: silences vibration on first press, rejects on second ──
  const volumeSilencedRef = useRef(false);
  const rejectIncomingRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (phase === VoIPCallPhase.RingingIncoming) {
      volumeSilencedRef.current = false;
    }
  }, [phase]);

  useEffect(() => {
    if (!NativeModules.VolumeManager) {
      return undefined;
    }
    let sub: { remove: () => void } | null = null;
    try {
      // Solo require si el nativo está registrado; el JS del paquete rompe al import si no hay enlace.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { VolumeManager } = require('react-native-volume-manager') as {
        VolumeManager: { addVolumeListener: (cb: () => void) => { remove: () => void } };
      };
      sub = VolumeManager.addVolumeListener(() => {
        if (phaseRef.current !== VoIPCallPhase.RingingIncoming) return;

        if (!volumeSilencedRef.current) {
          Vibration.cancel();
          void stopTone();
          volumeSilencedRef.current = true;
        } else {
          rejectIncomingRef.current();
        }
      });
    } catch {
      return undefined;
    }
    return () => {
      try {
        sub?.remove();
      } catch {
        /* noop */
      }
    };
  }, [stopTone]);

  // ── Call log helper ──
  const logCall = useCallback(
    (
      direction: 'incoming' | 'outgoing' | 'missed',
      status: 'completed' | 'missed' | 'rejected',
      durationSec: number,
    ) => {
      const cd = callData;
      if (!cd?.ownerUid) return;
      void createCallLog({
        ownerUid: cd.ownerUid,
        peerUid: cd.peerUid,
        direction,
        status,
        durationSec,
        tags: ['Ghost-Link'],
        sourceCardName: cd.card.cardName,
        sourceCardId: cd.sourceCardId ?? undefined,
        callChannel: 'ghost-link-voip',
        callType: cd.callType || 'audio',
      });
    },
    [callData],
  );

  // ── Reset helpers ──
  const minimizeCall = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const maximizeCall = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const resetCall = useCallback(() => {
    if (outgoingJoinWatchdogRef.current != null) {
      clearTimeout(outgoingJoinWatchdogRef.current);
      outgoingJoinWatchdogRef.current = null;
    }
    Vibration.cancel();
    void stopTone();
    setPhase(VoIPCallPhase.Idle);
    setCallData(null);
    setVideoEnabled(false);
    setCallDurationSec(0);
    setRtcHandoffComplete(false);
    setIsMinimized(false);
    pendingParamsRef.current = null;
    pollingRef.current = true;
    activeStartRef.current = null;
    ringingStartRef.current = null;
    outgoingRtcPrimedRef.current = false;
  }, [stopTone]);

  useEffect(() => {
    if (phase !== VoIPCallPhase.Active) {
      setIsMinimized(false);
    }
  }, [phase]);

  const shouldJoinRtc =
    rtcHandoffComplete &&
    !!callData?.agora &&
    (phase === VoIPCallPhase.RingingOutgoing ||
      phase === VoIPCallPhase.RingingIncoming ||
      phase === VoIPCallPhase.Active);

  /** Preview local sin join: solo emisor en RingingOutgoing (ya pasó permisos en confirm). Nunca en RingingIncoming (fondo/bloqueo → crash iOS). */
  const wantsRingingLocalPreview = useMemo(
    () =>
      isGhostLinkAgoraNativeAvailable() &&
      callData?.callType === 'video' &&
      videoEnabled &&
      !!callData?.agora?.appId &&
      phase === VoIPCallPhase.RingingOutgoing &&
      !rtcHandoffComplete,
    [callData?.callType, callData?.agora?.appId, videoEnabled, phase, rtcHandoffComplete],
  );

  const { localPreviewActive } = useGhostLinkRingingVideoPreview({
    appId: callData?.agora?.appId,
    active: wantsRingingLocalPreview,
  });

  const endRtcSessionRef = useRef<() => Promise<void>>(async () => {});
  const resetCallRef = useRef<() => void>(() => {});

  const {
    isMuted: muted,
    isSpeakerphoneOn: speaker,
    remoteUid,
    isRemoteVideoEnabled,
    toggleMute,
    toggleSpeakerphone,
    switchCamera,
    setSpeakerphoneOn,
    onLocalCameraPinchStart,
    applyLocalCameraPinchScale,
    endRtcSession,
  } = useAgoraRtc({
    creds: callData?.agora ?? null,
    enableVideo: callData?.callType === 'video',
    shouldJoin: shouldJoinRtc,
    localVideoOn: videoEnabled,
    onRemoteUserJoined: () => {
      if (outgoingJoinWatchdogRef.current != null) {
        clearTimeout(outgoingJoinWatchdogRef.current);
        outgoingJoinWatchdogRef.current = null;
      }
      void stopTone();
      if (directionRef.current === 'outgoing') {
        triggerGhostLinkConnectedFeedback();
        setPhase(VoIPCallPhase.Active);
      }
    },
    onLocalRtcJoined: () => {
      if (directionRef.current === 'incoming') {
        triggerGhostLinkConnectedFeedback();
        setPhase(VoIPCallPhase.Active);
      }
    },
    onRemoteUserOffline: () => {
      void finalizeEndingRef.current('remote');
    },
    onLeaveChannel: () => {
      if (suppressLeaveFinalizeRef.current) return;
      void finalizeEndingRef.current('leave_channel');
    },
    initialSpeakerphoneOn: false,
  });

  useLayoutEffect(() => {
    endRtcSessionRef.current = endRtcSession;
    resetCallRef.current = resetCall;
  }, [endRtcSession, resetCall]);

  useEffect(() => {
    if (!isMinimized) return;
    if (callData?.callType !== 'audio') return;
    if (phase !== VoIPCallPhase.Active) return;
    setGhostLinkAgoraSpeaker(true);
    setSpeakerphoneOn(true);
  }, [isMinimized, callData?.callType, phase, setSpeakerphoneOn]);

  const finalizeCallEnding = useCallback(
    async (kind: 'local' | 'remote' | 'leave_channel' | 'cancel') => {
      if (endingInProgressRef.current) return;
      if (!callDataRef.current && phaseRef.current === VoIPCallPhase.Idle) return;
      endingInProgressRef.current = true;
      const cdSnapshot = callDataRef.current;
      const suppressLeave = kind === 'local' || kind === 'cancel';
      if (suppressLeave) suppressLeaveFinalizeRef.current = true;
      try {
        await endRtcSession();
        if (kind === 'cancel') {
          if (cdSnapshot?.inviteId && cdSnapshot.ownerUid) {
            await respondGhostLinkInvite({
              ownerUid: cdSnapshot.ownerUid,
              inviteId: cdSnapshot.inviteId,
              action: 'end',
            }).catch(() => {});
          }
        } else if (kind === 'local' || kind === 'remote' || kind === 'leave_channel') {
          if (cdSnapshot?.inviteId && cdSnapshot.ownerUid) {
            await respondGhostLinkInvite({
              ownerUid: cdSnapshot.ownerUid,
              inviteId: cdSnapshot.inviteId,
              action: 'end',
            }).catch(() => {});
          }
          if (cdSnapshot?.ownerUid) {
            const duration = activeStartRef.current
              ? Math.floor((Date.now() - activeStartRef.current) / 1000)
              : 0;
            const dir = cdSnapshot.direction ?? 'outgoing';
            logCall(dir, 'completed', duration);
          }
          if (kind === 'local') {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        }
        resetCall();
      } finally {
        if (suppressLeave) suppressLeaveFinalizeRef.current = false;
        endingInProgressRef.current = false;
      }
    },
    [endRtcSession, logCall, resetCall],
  );

  useLayoutEffect(() => {
    finalizeEndingRef.current = finalizeCallEnding;
  });

  // ── Emisor: poll estado de invitación (signaling). Ringback sigue en expo-av hasta `accepted`; entonces handoff + join Agora.
  useEffect(() => {
    if (phase !== VoIPCallPhase.RingingOutgoing && phase !== VoIPCallPhase.Active) {
      ringingStartRef.current = null;
      return;
    }

    if (phase === VoIPCallPhase.RingingOutgoing && !ringingStartRef.current) {
      ringingStartRef.current = Date.now();
    }

    if (phase !== VoIPCallPhase.RingingOutgoing) return;

    let cancelled = false;

    const handleMissed = async () => {
      try {
        await endRtcSession();
      } catch {
        /* ignore */
      }
      logCall('outgoing', 'missed', 0);
      setPhase(VoIPCallPhase.Ended);
      setTimeout(resetCall, 2000);
    };

    const handleRejectedByCaller = async () => {
      try {
        await endRtcSession();
      } catch {
        /* ignore */
      }
      logCall('outgoing', 'rejected', 0);
      setPhase(VoIPCallPhase.Rejected);
      setTimeout(resetCall, 2000);
    };

    const checkStatus = async () => {
      if (cancelled) return;

      if (ringingStartRef.current && Date.now() - ringingStartRef.current > INVITE_TTL_MS) {
        await handleMissed();
        return;
      }

      try {
        const cd = callData;
        if (!cd?.inviteId || !cd.ownerUid) return;

        const status = await getOutgoingGhostLinkInviteStatus({
          ownerUid: cd.ownerUid,
          inviteId: cd.inviteId,
        });

        if (cancelled) return;

        if (status === 'accepted') {
          let handoffDone = outgoingRtcPrimedRef.current;
          if (!handoffDone) {
            outgoingRtcPrimedRef.current = true;
            try {
              await runVoipConnectingAudioHandoff(stopTone);
              if (callDataRef.current?.agora) {
                setRtcHandoffComplete(true);
                if (outgoingJoinWatchdogRef.current != null) {
                  clearTimeout(outgoingJoinWatchdogRef.current);
                }
                outgoingJoinWatchdogRef.current = setTimeout(() => {
                  outgoingJoinWatchdogRef.current = null;
                  if (
                    phaseRef.current !== VoIPCallPhase.Active &&
                    directionRef.current === 'outgoing'
                  ) {
                    void (async () => {
                      try {
                        await endRtcSessionRef.current();
                      } catch {
                        /* ignore */
                      }
                      setPhase(VoIPCallPhase.Error);
                      setTimeout(() => resetCallRef.current(), 3000);
                    })();
                  }
                }, OUTGOING_AGORA_JOIN_TIMEOUT_MS);
              }
              handoffDone = true;
            } catch (e) {
              outgoingRtcPrimedRef.current = false;
              if (__DEV__) console.warn('[Ghost-Link] caller post-accept handoff error', e);
            }
          }
          if (!handoffDone && !cancelled) {
            setTimeout(checkStatus, CALLER_STATUS_POLL_MS);
          }
          return;
        }

        if (status === 'ringing') {
          if (!cancelled) {
            setTimeout(checkStatus, CALLER_STATUS_POLL_MS);
          }
          return;
        }

        if (status === 'expired') {
          await handleMissed();
          return;
        }

        await handleRejectedByCaller();
      } catch {
        /* network error — retry */
      }

      if (!cancelled) {
        setTimeout(checkStatus, CALLER_STATUS_POLL_MS);
      }
    };

    setTimeout(checkStatus, CALLER_STATUS_POLL_MS);

    return () => {
      cancelled = true;
    };
  }, [phase, callData, endRtcSession, logCall, resetCall, stopTone]);

  // ── Caller: paso 1 — mostrar modal de confirmacion ──
  const requestCall = useCallback(
    (params: {
      targetUid: string;
      sourceCardId: string | null;
      sourceCardName: string;
      cardPhoto: string | null;
      cardType: 'business' | 'personal';
      callType?: GhostLinkCallType;
      peerName: string;
      peerNickname: string;
      peerPhotoUrl: string | null;
    }) => {
      const ct: GhostLinkCallType = params.callType || 'audio';
      pendingParamsRef.current = {
        ownerUid: '',
        targetUid: params.targetUid,
        card: {
          sourceCardName: params.sourceCardName,
          sourceCardId: params.sourceCardId,
          sourceCardKind: params.cardType,
          ...(params.cardPhoto ? { sourceCardPhotoUrl: params.cardPhoto } : {}),
        },
        callType: ct,
      };
      setCallData({
        direction: 'outgoing',
        callType: ct,
        card: {
          cardId: params.sourceCardId,
          cardName: params.sourceCardName,
          cardPhoto: params.cardPhoto,
          cardType: params.cardType,
        },
        peerName: params.peerName,
        peerNickname: params.peerNickname,
        peerPhotoUrl: params.peerPhotoUrl,
        peerUid: params.targetUid,
        ownerUid: '',
        sourceCardId: params.sourceCardId,
      });
      if (ct === 'video') setVideoEnabled(true);
      setPhase(VoIPCallPhase.Confirming);
    },
    [],
  );

  // ── Caller: paso 2 — confirmar e iniciar la llamada ──
  const confirmCall = useCallback(async () => {
    const pending = pendingParamsRef.current;
    if (!pending) return;

    try {
      const ownerUid = await getActiveUserId();
      if (!ownerUid) return;

      pending.ownerUid = ownerUid;

      const outgoingType: GhostLinkCallType = pending.callType || 'audio';
      const permitted = await ensureVoipPermissions(outgoingType);
      if (!permitted) {
        Toast.show({
          type: 'error',
          text1: tr('Permisos necesarios', 'Permissions required'),
          text2:
            outgoingType === 'video'
              ? tr(
                  'Activa el micrófono y la cámara para llamar.',
                  'Enable the microphone and camera to place a call.',
                )
              : tr('Activa el micrófono para llamar.', 'Enable the microphone to place a call.'),
        });
        return;
      }

      outgoingRtcPrimedRef.current = false;
      setPhase(VoIPCallPhase.RingingOutgoing);

      const started = await startGhostLinkVoipCall(pending);

      setCallData((prev) =>
        prev
          ? {
              ...prev,
              inviteId: started.inviteId,
              sessionId: started.sessionId,
              agora: started.agora,
              ownerUid,
              callType: started.callType,
              card: started.card,
              peerName: started.receiverDisplay.name,
              peerPhotoUrl: started.receiverDisplay.photoUrl,
            }
          : prev,
      );

      await playTone(outgoingType === 'video' ? RINGBACK_VIDEO_ASSET : RINGBACK_AUDIO_ASSET);
    } catch (error: any) {
      if (isGhostLinkExpoGoAbortError(error)) {
        resetCall();
        return;
      }
      const errMsg = String(error?.response?.data?.error || '').toLowerCase();
      if (error?.response?.status === 403 && errMsg.includes('muted')) {
        setPhase(VoIPCallPhase.Muted);
      } else {
        setPhase(VoIPCallPhase.Error);
      }
      setTimeout(resetCall, 3000);
    }
  }, [resetCall, playTone, stopTone, tr]);

  const confirmVideoCall = useCallback(async () => {
    if (pendingParamsRef.current) {
      pendingParamsRef.current.callType = 'video';
    }
    setCallData((prev) => (prev ? { ...prev, callType: 'video' } : prev));
    setVideoEnabled(true);
    await confirmCall();
  }, [confirmCall]);

  const cancelCall = useCallback(() => {
    void finalizeCallEnding('cancel');
  }, [finalizeCallEnding]);

  // ── Receptor: aceptar (permisos solo aquí, con UI ya en primer plano; no durante el poll IDLE) ──
  const acceptIncoming = useCallback(async () => {
    if (!callData?.inviteId || !callData.ownerUid) return;
    Vibration.cancel();

    const acceptType: GhostLinkCallType = callData.callType || 'audio';
    const permitted = await ensureVoipPermissions(acceptType);
    if (!permitted) {
      Toast.show({
        type: 'error',
        text1: tr('Permisos necesarios', 'Permissions required'),
        text2:
          acceptType === 'video'
            ? tr(
                'Activa el micrófono y la cámara para unirte a la videollamada.',
                'Enable the microphone and camera to join the video call.',
              )
            : tr('Activa el micrófono para contestar.', 'Enable the microphone to answer the call.'),
      });
      try {
        await respondGhostLinkInvite({
          ownerUid: callData.ownerUid,
          inviteId: callData.inviteId,
          action: 'reject',
        });
      } catch {
        /* best effort */
      }
      void stopTone();
      resetCall();
      return;
    }

    await runVoipConnectingAudioHandoff(stopTone);

    try {
      await respondGhostLinkInvite({
        ownerUid: callData.ownerUid,
        inviteId: callData.inviteId,
        action: 'accept',
      });

      if (callData.agora) {
        setRtcHandoffComplete(true);
      }
    } catch {
      setPhase(VoIPCallPhase.Error);
      setTimeout(resetCall, 3000);
    }
  }, [callData, resetCall, stopTone, tr]);

  // ── Receptor: rechazar ──
  const rejectIncoming = useCallback(async () => {
    if (!callData?.inviteId || !callData.ownerUid) return;

    logCall('incoming', 'rejected', 0);

    try {
      await endRtcSession();
    } catch {
      /* ignore */
    }
    try {
      await respondGhostLinkInvite({
        ownerUid: callData.ownerUid,
        inviteId: callData.inviteId,
        action: 'reject',
      });
    } catch {
      /* best effort */
    }
    resetCall();
  }, [callData, endRtcSession, logCall, resetCall]);

  rejectIncomingRef.current = rejectIncoming;

  // ── Colgar (ambos lados): Agora → backend `end` → IDLE (vía finalizeCallEnding) ──
  const endCall = useCallback(async () => {
    await finalizeCallEnding('local');
  }, [finalizeCallEnding]);

  const toggleVideo = useCallback(() => {
    setVideoEnabled((prev) => !prev);
  }, []);

  const flipCamera = useCallback(() => {
    switchCamera();
  }, [switchCamera]);

  const value: GhostLinkCallContextValue = {
    phase,
    callData,
    muted,
    speaker,
    isMinimized,
    minimizeCall,
    maximizeCall,
    remoteUid,
    isRemoteVideoEnabled,
    localPreviewActive,
    videoEnabled,
    callDurationSec,
    onLocalCameraPinchStart,
    applyLocalCameraPinchScale,
    requestCall,
    confirmCall,
    confirmVideoCall,
    cancelCall,
    acceptIncoming,
    rejectIncoming,
    endCall,
    toggleMute,
    toggleSpeaker: toggleSpeakerphone,
    toggleVideo,
    flipCamera,
  };

  useEffect(() => {
    _imperativeRequestCall = requestCall;
    return () => { _imperativeRequestCall = null; };
  }, [requestCall]);

  return (
    <GhostLinkCallContext.Provider value={value}>
      {children}
    </GhostLinkCallContext.Provider>
  );
}
