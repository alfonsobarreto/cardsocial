import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, NativeModules, Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { getActiveUserId } from '@/services/authSession';

const RINGTONE_AUDIO_ASSET = require('@/assets/sounds/ghost-link-ringtone.wav');
const RINGTONE_VIDEO_ASSET = require('@/assets/sounds/ghost-link-ringtone-video.wav');
const RINGBACK_AUDIO_ASSET = require('@/assets/sounds/ghost-link-ringback.wav');
const RINGBACK_VIDEO_ASSET = require('@/assets/sounds/ghost-link-ringback-video.wav');
const CONNECTED_BEEP_ASSET = require('@/assets/sounds/ghost-link-connected.wav');
import {
  getIncomingGhostLinkInvite,
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
import {
  getGhostLinkAgoraEngine,
  joinGhostLinkAgoraSession,
  leaveGhostLinkAgoraSession,
  setGhostLinkAgoraMuted,
  setGhostLinkAgoraSpeaker,
  setGhostLinkAgoraVideo,
  switchGhostLinkAgoraCamera,
} from '@/services/ghostLinkAgoraSession';
import { createCallLog } from '@/services/qrApi';

export type GhostCallPhase =
  | 'idle'
  | 'confirming'
  | 'ringing_outgoing'
  | 'ringing_incoming'
  | 'active'
  | 'ended'
  | 'rejected'
  | 'muted'
  | 'error';

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
  phase: GhostCallPhase;
  callData: GhostCallData | null;
  muted: boolean;
  speaker: boolean;
  videoEnabled: boolean;
  /** Seconds elapsed since the call was connected (active phase). */
  callDurationSec: number;
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

/** Evita import estático de expo-camera si el nativo no está en el dev client. */
async function requestGhostLinkCameraPermission(): Promise<'granted' | string> {
  try {
    const { Camera } = await import('expo-camera');
    const { status } = await Camera.requestCameraPermissionsAsync();
    return status;
  } catch {
    return 'denied';
  }
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
  const [phase, setPhase] = useState<GhostCallPhase>('idle');
  const [callData, setCallData] = useState<GhostCallData | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [callDurationSec, setCallDurationSec] = useState(0);

  const pendingParamsRef = useRef<GhostLinkCallStartParams | null>(null);
  const pollingRef = useRef(true);
  const activeStartRef = useRef<number | null>(null);
  const ringingStartRef = useRef<number | null>(null);
  const soundRef = useRef<{ stopAsync: () => Promise<void>; unloadAsync: () => Promise<void>; playAsync: () => Promise<unknown> } | null>(null);

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
      });
      const { sound } = await Audio.Sound.createAsync(asset, { isLooping: true, volume: 0.6 });
      soundRef.current = sound;
      await sound.playAsync();
    } catch {
      /* device without audio or native module missing */
    }
  }, [stopTone]);

  const playBeep = useCallback(async (asset: any) => {
    try {
      const av = await loadExpoAv();
      if (!av?.Audio) return;
      const { sound } = await av.Audio.Sound.createAsync(asset, { volume: 0.5 });
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((s: { didJustFinish?: boolean }) => {
        if ('didJustFinish' in s && s.didJustFinish) void sound.unloadAsync();
      });
    } catch { /* ignore */ }
  }, []);

  // ── Timer: cuenta segundos en fase active ──
  useEffect(() => {
    if (phase === 'active') {
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

  // ── Caller: poll invite status while ringing to detect reject/expire ──
  useEffect(() => {
    if (phase !== 'ringing_outgoing' && phase !== 'active') {
      ringingStartRef.current = null;
      return;
    }

    if (phase === 'ringing_outgoing' && !ringingStartRef.current) {
      ringingStartRef.current = Date.now();
    }

    if (phase !== 'ringing_outgoing') return;

    let cancelled = false;

    const checkStatus = async () => {
      if (cancelled) return;

      if (ringingStartRef.current && Date.now() - ringingStartRef.current > INVITE_TTL_MS) {
        await handleMissed();
        return;
      }

      try {
        const cd = callData;
        if (!cd?.inviteId || !cd.ownerUid) return;

        const invite = await getIncomingGhostLinkInvite({ ownerUid: cd.peerUid });

        if (cancelled) return;

        if (!invite || invite.inviteId !== cd.inviteId) {
          await handleRejectedByCaller();
          return;
        }
      } catch {
        /* network error — retry */
      }

      if (!cancelled) {
        setTimeout(checkStatus, CALLER_STATUS_POLL_MS);
      }
    };

    const handleMissed = async () => {
      try { await leaveGhostLinkAgoraSession(); } catch { /* ignore */ }
      logCall('outgoing', 'missed', 0);
      setPhase('ended');
      setTimeout(resetCall, 2000);
    };

    const handleRejectedByCaller = async () => {
      try { await leaveGhostLinkAgoraSession(); } catch { /* ignore */ }
      logCall('outgoing', 'rejected', 0);
      setPhase('rejected');
      setTimeout(resetCall, 2000);
    };

    setTimeout(checkStatus, CALLER_STATUS_POLL_MS);

    return () => { cancelled = true; };
  }, [phase, callData]);

  // ── Polling de llamadas entrantes ──
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const poll = async () => {
      if (cancelled || !pollingRef.current) return;
      if (phase !== 'idle') return;

      try {
        const ownerUid = await getActiveUserId();
        if (!ownerUid || cancelled) return;

        const invite = await getIncomingGhostLinkInvite({ ownerUid });
        if (cancelled || phase !== 'idle') return;

        if (invite) {
          pollingRef.current = false;
          const incomingCallType: GhostLinkCallType = invite.callType || 'audio';
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
          setPhase('ringing_incoming');
          Vibration.vibrate([0, 500, 400, 500, 400, 500], true);
          void playTone(incomingCallType === 'video' ? RINGTONE_VIDEO_ASSET : RINGTONE_AUDIO_ASSET);
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
      if (next === 'active' && phase === 'idle') {
        pollingRef.current = true;
        poll();
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      appSub.remove();
    };
  }, [phase]);

  // ── Push notification listener: incoming call triggers immediate poll ──
  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    try {
      sub = Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data as Record<string, unknown> | undefined;
        if (data?.type === 'ghost-link-incoming' && phase === 'idle') {
          pollingRef.current = true;
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
  }, [phase]);

  // ── Volume-down: silences vibration on first press, rejects on second ──
  const volumeSilencedRef = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const rejectIncomingRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (phase === 'ringing_incoming') {
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
        if (phaseRef.current !== 'ringing_incoming') return;

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

  // ── Agora: detect peer joined → transition caller to active ──
  useEffect(() => {
    if (phase !== 'ringing_outgoing') return;
    const eng = getGhostLinkAgoraEngine();
    if (!eng) return;
    let removed = false;
    const handler = {
      onUserJoined: () => {
        if (removed) return;
        void stopTone();
        setPhase('active');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        void playBeep(CONNECTED_BEEP_ASSET);
      },
    };
    try { eng.registerEventHandler(handler); } catch { /* no-op */ }
    return () => {
      removed = true;
      try { eng.unregisterEventHandler(handler); } catch { /* no-op */ }
    };
  }, [phase, stopTone, playBeep]);

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
  const resetCall = useCallback(() => {
    Vibration.cancel();
    void stopTone();
    setPhase('idle');
    setCallData(null);
    setMuted(false);
    setSpeaker(false);
    setVideoEnabled(false);
    setCallDurationSec(0);
    pendingParamsRef.current = null;
    pollingRef.current = true;
    activeStartRef.current = null;
    ringingStartRef.current = null;
  }, [stopTone]);

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
        card: { sourceCardName: params.sourceCardName, sourceCardId: params.sourceCardId },
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
      setPhase('confirming');
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

      if (pending.callType === 'video') {
        const status = await requestGhostLinkCameraPermission();
        if (status !== 'granted') {
          pending.callType = 'audio';
          setVideoEnabled(false);
          setCallData((prev) => (prev ? { ...prev, callType: 'audio' } : prev));
        }
      }

      pending.ownerUid = ownerUid;
      setPhase('ringing_outgoing');
      void playTone(pending.callType === 'video' ? RINGBACK_VIDEO_ASSET : RINGBACK_AUDIO_ASSET);

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

      if (started.agora) {
        try {
          await joinGhostLinkAgoraSession(started.agora, started.callType === 'video');
        } catch (e) {
          if (__DEV__) console.warn('[Ghost-Link] caller join error', e);
        }
      }
    } catch (error: any) {
      if (isGhostLinkExpoGoAbortError(error)) {
        resetCall();
        return;
      }
      const errMsg = String(error?.response?.data?.error || '').toLowerCase();
      if (error?.response?.status === 403 && errMsg.includes('muted')) {
        setPhase('muted');
      } else {
        setPhase('error');
      }
      setTimeout(resetCall, 3000);
    }
  }, [resetCall, playTone]);

  const confirmVideoCall = useCallback(async () => {
    if (pendingParamsRef.current) {
      pendingParamsRef.current.callType = 'video';
    }
    setCallData((prev) => (prev ? { ...prev, callType: 'video' } : prev));
    setVideoEnabled(true);
    await confirmCall();
  }, [confirmCall]);

  const cancelCall = useCallback(() => {
    if (callData?.inviteId && callData.ownerUid) {
      void respondGhostLinkInvite({
        ownerUid: callData.ownerUid,
        inviteId: callData.inviteId,
        action: 'end',
      }).catch(() => {});
    }
    resetCall();
  }, [callData, resetCall]);

  // ── Receptor: aceptar ──
  const acceptIncoming = useCallback(async () => {
    if (!callData?.inviteId || !callData.ownerUid) return;
    Vibration.cancel();
    void stopTone();

    const isVideo = callData.callType === 'video';
    if (isVideo) {
      const status = await requestGhostLinkCameraPermission();
      if (status !== 'granted') {
        setVideoEnabled(false);
      }
    }

    try {
      await respondGhostLinkInvite({
        ownerUid: callData.ownerUid,
        inviteId: callData.inviteId,
        action: 'accept',
      });

      if (callData.agora) {
        try {
          await joinGhostLinkAgoraSession(callData.agora, isVideo);
        } catch (e) {
          if (__DEV__) console.warn('[Ghost-Link] callee join error', e);
        }
      }

      setPhase('active');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void playBeep(CONNECTED_BEEP_ASSET);
    } catch {
      setPhase('error');
      setTimeout(resetCall, 3000);
    }
  }, [callData, resetCall]);

  // ── Receptor: rechazar ──
  const rejectIncoming = useCallback(async () => {
    if (!callData?.inviteId || !callData.ownerUid) return;

    logCall('incoming', 'rejected', 0);

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
  }, [callData, logCall, resetCall]);

  rejectIncomingRef.current = rejectIncoming;

  // ── Colgar (ambos lados) ──
  const endCall = useCallback(async () => {
    const duration = activeStartRef.current
      ? Math.floor((Date.now() - activeStartRef.current) / 1000)
      : 0;

    try {
      await leaveGhostLinkAgoraSession();
    } catch {
      /* ignore */
    }

    const dir = callData?.direction ?? 'outgoing';
    logCall(dir, 'completed', duration);

    if (callData?.inviteId && callData.ownerUid) {
      try {
        await respondGhostLinkInvite({
          ownerUid: callData.ownerUid,
          inviteId: callData.inviteId,
          action: 'end',
        });
      } catch {
        /* best effort */
      }
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    resetCall();
  }, [callData, logCall, resetCall]);

  // ── Audio controls ──
  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      setGhostLinkAgoraMuted(!prev);
      return !prev;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setSpeaker((prev) => {
      setGhostLinkAgoraSpeaker(!prev);
      return !prev;
    });
  }, []);

  const toggleVideo = useCallback(() => {
    setVideoEnabled((prev) => {
      setGhostLinkAgoraVideo(!prev);
      return !prev;
    });
  }, []);

  const flipCamera = useCallback(() => {
    switchGhostLinkAgoraCamera();
  }, []);

  const value: GhostLinkCallContextValue = {
    phase,
    callData,
    muted,
    speaker,
    videoEnabled,
    callDurationSec,
    requestCall,
    confirmCall,
    confirmVideoCall,
    cancelCall,
    acceptIncoming,
    rejectIncoming,
    endCall,
    toggleMute,
    toggleSpeaker,
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
