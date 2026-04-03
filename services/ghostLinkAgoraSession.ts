/**
 * Sesión RTC Agora para Ghost-Link (solo audio).
 * En Expo Go no se carga react-native-agora (evita crash por módulo nativo no enlazado).
 */

import { isGhostLinkAgoraNativeAvailable } from '@/services/expoGoAgoraGuard';
import type { GhostLinkAgoraRtc } from '@/services/ghostLinkVoip';

type AgoraModule = typeof import('react-native-agora');
type IRtcEngine = import('react-native-agora').IRtcEngine;

let engine: IRtcEngine | null = null;

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

export async function leaveGhostLinkAgoraSession(): Promise<void> {
  const e = engine;
  engine = null;
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
 * Entra al canal RTC con credenciales emitidas por el backend (token + uid por participante).
 */
export async function joinGhostLinkAgoraSession(creds: GhostLinkAgoraRtc): Promise<void> {
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

  const options = new ChannelMediaOptions();
  options.channelProfile = ChannelProfileType.ChannelProfileCommunication;
  options.clientRoleType = ClientRoleType.ClientRoleBroadcaster;
  options.publishMicrophoneTrack = true;
  options.autoSubscribeAudio = true;

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
