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
  if (!e) {
    return;
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
 * Entra al canal RTC con credenciales emitidas por el backend.
 * @param enableVideo - true para habilitar video desde el inicio (FaceCall).
 */
export async function joinGhostLinkAgoraSession(creds: GhostLinkAgoraRtc, enableVideo = false): Promise<void> {
  const agora = loadAgoraModule();
  if (!agora) {
    return;
  }

  await leaveGhostLinkAgoraSession();

  const { createAgoraRtcEngine, ChannelProfileType, ClientRoleType, ChannelMediaOptions } = agora;

  const e = createAgoraRtcEngine();
  const initCode = e.initialize({
    appId: creds.appId,
    channelProfile: ChannelProfileType.ChannelProfileCommunication,
  });
  if (initCode !== 0 && __DEV__) {
    console.warn('[Ghost-Link Agora] initialize code', initCode);
  }

  e.enableAudio();

  if (enableVideo) {
    e.enableVideo();
    e.startPreview();
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

  const joinCode = e.joinChannel(creds.token, creds.channelName, creds.uid, options);
  if (joinCode !== 0 && __DEV__) {
    console.warn('[Ghost-Link Agora] joinChannel code', joinCode);
  }

  engine = e;
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

export function isGhostLinkVideoEnabled(): boolean {
  return videoEnabledState;
}
