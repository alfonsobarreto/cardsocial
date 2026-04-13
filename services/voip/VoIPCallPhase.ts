/**
 * Fases de UI / ciclo de vida Ghost-Link (signaling, tonos, RTC).
 * Valores = strings históricos para compatibilidad con API/backend y logs.
 */
export enum VoIPCallPhase {
  Idle = 'idle',
  Confirming = 'confirming',
  RingingOutgoing = 'ringing_outgoing',
  RingingIncoming = 'ringing_incoming',
  Active = 'active',
  Ended = 'ended',
  Rejected = 'rejected',
  Muted = 'muted',
  Error = 'error',
}
