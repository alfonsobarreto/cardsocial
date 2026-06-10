/**
 * Espejo de enums/tipos de `react-native-agora` sin importar el paquete nativo
 * (Expo Go crashea al evaluar `react-native-agora/src/specs/index.ts`).
 */

export const AgoraRemoteVideoState = {
  Stopped: 0,
  Starting: 1,
  Decoding: 2,
  Frozen: 3,
  Failed: 4,
} as const;

export const AgoraRemoteVideoStateReason = {
  RemoteUnmuted: 6,
} as const;

export type AgoraUserOfflineReason = number;

export type AgoraRtcEventHandler = {
  onUserJoined?: (connection: unknown, uid: number, elapsed?: number) => void;
  onUserOffline?: (connection: unknown, uid: number, reason: AgoraUserOfflineReason) => void;
  onLeaveChannel?: (connection: unknown, stats?: unknown) => void;
  onRemoteVideoStateChanged?: (
    connection: unknown,
    uid: number,
    state: number,
    reason: number,
    elapsed?: number,
  ) => void;
  onUserMuteVideo?: (connection: unknown, uid: number, muted: boolean) => void;
  onUserEnableVideo?: (connection: unknown, uid: number, enabled: boolean) => void;
  onAudioRoutingChanged?: (routing: number) => void;
};
