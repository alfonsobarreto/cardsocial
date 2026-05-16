/**
 * Sesión RTC Agora para Ghost-Link (audio + video).
 * En Expo Go no se carga react-native-agora (evita crash por módulo nativo no enlazado).
 */

import { Platform } from 'react-native';

import { isGhostLinkAgoraNativeAvailable } from '@/services/expoGoAgoraGuard';
import type { GhostLinkAgoraRtc } from '@/services/ghostLinkVoip';
import { refreshIosAndroidAudioSessionForVoipRtcRouteChange } from '@/services/voip/voipExpoAvToAgoraAudioBridge';

type AgoraModule = typeof import('react-native-agora');
type IRtcEngine = import('react-native-agora').IRtcEngine;

let engine: IRtcEngine | null = null;
let videoEnabledState = false;
/** Motor creado solo para `startPreview` (sin `joinChannel`); `joinGhostLinkAgoraSession` reutiliza la misma instancia. */
let ghostLinkEnginePreviewOnly = false;
let lastPreviewAppId = '';

/** Última intención UI de altavoz; se re-aplica tras cambios de ruta del sistema (Bluetooth, etc.). */
let intendedSpeakerphoneOn = false;

let audioRouteSyncTimer: ReturnType<typeof setTimeout> | null = null;

function loadAgoraModule(): AgoraModule | null {
  if (!isGhostLinkAgoraNativeAvailable()) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-agora') as AgoraModule;
  } catch {
    return null;
  }
}

export function isGhostLinkAgoraActive(): boolean {
  return engine != null;
}

export function getGhostLinkAgoraEngine(): IRtcEngine | null {
  return engine;
}

export async function leaveGhostLinkAgoraSession(): Promise<void> {
  const e = engine;
  engine = null;
  videoEnabledState = false;
  ghostLinkEnginePreviewOnly = false;
  lastPreviewAppId = '';
  intendedSpeakerphoneOn = false;
  if (audioRouteSyncTimer != null) {
    clearTimeout(audioRouteSyncTimer);
    audioRouteSyncTimer = null;
  }
  if (!e) {
    return;
  }
  try {
    e.stopPreview();
  } catch {
    /* ignore */
  }
  try {
    e.leaveChannel();
  } catch {
    /* ignore */
  }
  try {
    e.release();
  } catch {
    /* ignore */
  }
}

/**
 * Motor Agora mínimo: solo `initialize` + `enableVideo` + `startPreview` (sin `joinChannel`).
 * En timbre antes del handoff. `joinGhostLinkAgoraSession` reutiliza este mismo `IRtcEngine` (mismo singleton)
 * para evitar `release()` intermedio y parpadeo de cámara.
 */
export async function startGhostLinkLocalVideoPreview(appId: string): Promise<void> {
  const agora = loadAgoraModule();
  const id = String(appId || '').trim();
  if (!agora || !id) {
    return;
  }

  await leaveGhostLinkAgoraSession();

  const { createAgoraRtcEngine, ChannelProfileType, AudioScenarioType } = agora;

  const e = createAgoraRtcEngine();
  const initCode = e.initialize({
    appId: id,
    channelProfile: ChannelProfileType.ChannelProfileCommunication,
    /** Reunión 1:1 / VoIP: perfil de audio más cercano a comunicación bidireccional con rutas externas (BT). */
    audioScenario: AudioScenarioType.AudioScenarioMeeting,
  });
  if (initCode !== 0 && __DEV__) {
    console.warn('[Ghost-Link Agora] preview initialize code', initCode);
  }

  try {
    e.enableVideo();
    // Preview-only phase: disable audio so Agora does NOT configure AVAudioSession
    // (ChannelProfileCommunication sets PlayAndRecord which kills expo-av ringback on iOS).
    // enableAudio() is called explicitly in joinGhostLinkAgoraSession before joinChannel.
    e.disableAudio();
    e.startPreview();
    videoEnabledState = true;
    engine = e;
    lastPreviewAppId = id;
    ghostLinkEnginePreviewOnly = true;
  } catch (err) {
    if (__DEV__) console.warn('[Ghost-Link Agora] preview start', err);
    try {
      e.release();
    } catch {
      /* noop */
    }
    engine = null;
    videoEnabledState = false;
    lastPreviewAppId = '';
    ghostLinkEnginePreviewOnly = false;
  }
}

/** Detiene preview y libera el engine (idéntico a teardown de sesión sin canal). */
export async function stopGhostLinkLocalVideoPreview(): Promise<void> {
  await leaveGhostLinkAgoraSession();
}

/**
 * Entra al canal RTC con credenciales emitidas por el backend.
 * @param enableVideo - true para habilitar video desde el inicio (FaceCall).
 */
export async function joinGhostLinkAgoraSession(creds: GhostLinkAgoraRtc, enableVideo = false): Promise<void> {
  const agora = loadAgoraModule();
  if (!agora) {
    return;
  }

  const {
    createAgoraRtcEngine,
    ChannelProfileType,
    ClientRoleType,
    ChannelMediaOptions,
    AudioScenarioType,
    AudioProfileType,
  } = agora;

  const credsAppId = String(creds.appId || '').trim();
  const reusePreviewEngine =
    engine != null &&
    ghostLinkEnginePreviewOnly &&
    credsAppId !== '' &&
    credsAppId === lastPreviewAppId;

  if (!reusePreviewEngine) {
    await leaveGhostLinkAgoraSession();
  }

  let e: IRtcEngine;

  if (reusePreviewEngine) {
    e = engine as IRtcEngine;
  } else {
    e = createAgoraRtcEngine();
    const initCode = e.initialize({
      appId: creds.appId,
      channelProfile: ChannelProfileType.ChannelProfileCommunication,
      audioScenario: AudioScenarioType.AudioScenarioMeeting,
    });
    if (initCode !== 0 && __DEV__) {
      console.warn('[Ghost-Link Agora] initialize code', initCode);
    }
  }

  try {
    e.setAudioProfile(AudioProfileType.AudioProfileDefault, AudioScenarioType.AudioScenarioMeeting);
  } catch {
    /* native opcional */
  }

  try {
    e.setAudioScenario(AudioScenarioType.AudioScenarioMeeting);
  } catch {
    /* p. ej. motor reutilizado desde preview con otro escenario */
  }

  e.enableAudio();
  await new Promise<void>((r) => setTimeout(r, 200));

  /**
   * Sin altavoz forzado por UI: default hacia auricular deja que BT/HFP tome la ruta cuando existe.
   * setGhostLinkAgoraSpeaker aplicará default+route cuando el usuario active el altavoz.
   */
  try {
    e.setDefaultAudioRouteToSpeakerphone(false);
  } catch {
    /* ignore */
  }
  if (Platform.OS === 'android') {
    try {
      e.setRouteInCommunicationMode(-1);
    } catch {
      /* ignore */
    }
  }

  if (enableVideo) {
    e.enableVideo();
    if (!reusePreviewEngine) {
      e.startPreview();
    }
    e.muteLocalVideoStream(false);
    videoEnabledState = true;
  }

  const options = new ChannelMediaOptions();
  options.channelProfile = ChannelProfileType.ChannelProfileCommunication;
  options.clientRoleType = ClientRoleType.ClientRoleBroadcaster;
  options.publishMicrophoneTrack = true;
  options.autoSubscribeAudio = true;

  if (enableVideo) {
    options.publishCameraTrack = true;
    options.autoSubscribeVideo = true;
  }

  if (!reusePreviewEngine) {
    engine = e;
  }

  const joinCode = e.joinChannel(creds.token, creds.channelName, creds.uid, options);
  if (joinCode !== 0) {
    await leaveGhostLinkAgoraSession();
    return;
  }

  ghostLinkEnginePreviewOnly = false;
  lastPreviewAppId = '';
}

export function setGhostLinkAgoraMuted(muted: boolean): void {
  try {
    engine?.muteLocalAudioStream(muted);
  } catch {
    /* ignore */
  }
}

export function setGhostLinkAgoraSpeaker(speakerOn: boolean): void {
  intendedSpeakerphoneOn = speakerOn;
  try {
    engine?.setDefaultAudioRouteToSpeakerphone(speakerOn);
    engine?.setEnableSpeakerphone(speakerOn);
    if (Platform.OS === 'android' && engine) {
      try {
        engine.setRouteInCommunicationMode(speakerOn ? 3 : -1);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Coalesce: tras `onAudioRoutingChanged`, sincroniza expo-av + la intención de altavoz con el motor RTC.
 */
export function scheduleGhostLinkAgoraAudioRouteSync(): void {
  if (audioRouteSyncTimer != null) {
    clearTimeout(audioRouteSyncTimer);
  }
  audioRouteSyncTimer = setTimeout(() => {
    audioRouteSyncTimer = null;
    void (async () => {
      try {
        await refreshIosAndroidAudioSessionForVoipRtcRouteChange();
      } catch {
        /* noop */
      }
      try {
        if (!engine) return;
        engine.setDefaultAudioRouteToSpeakerphone(intendedSpeakerphoneOn);
        engine.setEnableSpeakerphone(intendedSpeakerphoneOn);
        if (Platform.OS === 'android') {
          try {
            engine.setRouteInCommunicationMode(intendedSpeakerphoneOn ? 3 : -1);
          } catch {
            /* noop */
          }
        }
      } catch {
        /* noop */
      }
    })();
  }, 120);
}

export function setGhostLinkAgoraVideo(enabled: boolean): void {
  try {
    if (!engine) return;
    const agora = loadAgoraModule();

    engine.enableLocalVideo(enabled);

    if (enabled) {
      engine.enableVideo();
      engine.startPreview();
      engine.muteLocalVideoStream(false);

      if (agora) {
        const opts = new agora.ChannelMediaOptions();
        opts.publishCameraTrack = true;
        opts.autoSubscribeVideo = true;
        engine.updateChannelMediaOptions(opts);
      }
    } else {
      engine.muteLocalVideoStream(true);
      engine.stopPreview();

      if (agora) {
        const opts = new agora.ChannelMediaOptions();
        opts.publishCameraTrack = false;
        engine.updateChannelMediaOptions(opts);
      }
    }
    videoEnabledState = enabled;
  } catch {
    /* ignore */
  }
}

export function switchGhostLinkAgoraCamera(): void {
  try {
    engine?.switchCamera();
  } catch {
    /* ignore */
  }
}

/**
 * Zoom de cámara local (captura). `factor` típicamente ≥ 1; se recorta al máximo del dispositivo vía `getCameraMaxZoomFactor()` cuando aplica.
 * @returns Factor efectivo aplicado (tras clamp), o 1 si no hay motor.
 */
export function setGhostLinkAgoraCameraZoom(factor: number): number {
  try {
    if (!engine) {
      return 1;
    }
    let maxZoom = Number.POSITIVE_INFINITY;
    try {
      const m = engine.getCameraMaxZoomFactor();
      if (typeof m === 'number' && Number.isFinite(m) && m > 1) {
        maxZoom = m;
      }
    } catch {
      /* iOS u builds sin dato — solo clamp inferior */
    }
    const clamped = Math.min(Math.max(factor, 1), maxZoom);
    try {
      engine.setCameraZoomFactor(clamped);
    } catch {
      /* ignore */
    }
    return clamped;
  } catch {
    return 1;
  }
}

export function isGhostLinkVideoEnabled(): boolean {
  return videoEnabledState;
}
