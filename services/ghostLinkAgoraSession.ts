/**
 * Sesión RTC Agora para Ghost-Link (audio + video).
 * En Expo Go no se carga react-native-agora (evita crash por módulo nativo no enlazado).
 */

import { isGhostLinkAgoraNativeAvailable } from '@/services/expoGoAgoraGuard';
import type { GhostLinkAgoraRtc } from '@/services/ghostLinkVoip';

type AgoraModule = typeof import('react-native-agora');
type IRtcEngine = import('react-native-agora').IRtcEngine;

let engine: IRtcEngine | null = null;
let videoEnabledState = false;
/** Motor creado solo para `startPreview` (sin `joinChannel`); `joinGhostLinkAgoraSession` reutiliza la misma instancia. */
let ghostLinkEnginePreviewOnly = false;
let lastPreviewAppId = '';

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
    audioScenario: AudioScenarioType.AudioScenarioChatroom,
  });
  if (initCode !== 0 && __DEV__) {
    console.warn('[Ghost-Link Agora] preview initialize code', initCode);
  }

  try {
    e.enableVideo();
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
      /** Chatroom: AEC/NS orientados a voz frecuente; reduce choque con otros usos del audio del sistema. */
      audioScenario: AudioScenarioType.AudioScenarioChatroom,
    });
    if (initCode !== 0 && __DEV__) {
      console.warn('[Ghost-Link Agora] initialize code', initCode);
    }
  }

  try {
    e.setAudioProfile(AudioProfileType.AudioProfileDefault, AudioScenarioType.AudioScenarioChatroom);
  } catch {
    /* native opcional */
  }

  e.enableAudio();
  await new Promise<void>((r) => setTimeout(r, 200));

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
    if (__DEV__) {
      console.warn('[Ghost-Link Agora] joinChannel code', joinCode);
    }
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
  try {
    engine?.setEnableSpeakerphone(speakerOn);
  } catch {
    /* ignore */
  }
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
