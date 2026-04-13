/**
 * Mapeo 1:1 entre fases Ghost-Link (`VoIPCallPhase`) y la FSM central (`VoIPFsmPhase`).
 *
 * Fuera de la máquina VoIP (agnóstica de UI):
 * - `Confirming` → no tiene fase FSM propia; la máquina permanece en IDLE hasta
 *   que el backend tiene invite y arranca ringback → OUTGOING_CALLING.
 *
 * Fase puente (no existe como VoIPCallPhase explícita hoy):
 * - CONNECTING: transición interna entre parar expo-av y joinChannel de Agora.
 *   GhostLink la ejecuta dentro de `confirmCall` / `acceptIncoming` sin estado UI dedicado.
 *   Para telemetría/reducer usar `isMediaConnecting === true` junto con ringing_*.
 */

import { VoIPCallPhase } from '@/services/voip/VoIPCallPhase';
import type { VoIPFsmPhase } from '@/services/voip/voipCallMachine.types';

export type GhostToVoipPhaseInput = {
  ghostPhase: VoIPCallPhase;
  /**
   * True solo en el tramo crítico: ringback/ringtone ya liberados (unloadAsync hecho)
   * y aún no hemos marcado `Active` / IN_CALL.
   */
  isMediaConnecting?: boolean;
};

/**
 * | VoIPCallPhase       | VoIPFsmPhase      | Notas |
 * |---------------------|-------------------|-------|
 * | Idle / Confirming   | IDLE              |       |
 * | RingingOutgoing     | OUTGOING_CALLING  | salvo isMediaConnecting → CONNECTING |
 * | RingingIncoming     | INCOMING_RINGING  | idem |
 * | Active              | IN_CALL           |       |
 * | Ended | Rejected | Muted | Error | ENDING | siguiente tick → IDLE tras teardown |
 */
export function ghostPhaseToVoIPPhase(input: GhostToVoipPhaseInput): VoIPFsmPhase {
  const { ghostPhase, isMediaConnecting } = input;

  if (ghostPhase === VoIPCallPhase.Idle || ghostPhase === VoIPCallPhase.Confirming) {
    return 'IDLE';
  }

  if (isMediaConnecting) {
    return 'CONNECTING';
  }

  switch (ghostPhase) {
    case VoIPCallPhase.RingingOutgoing:
      return 'OUTGOING_CALLING';
    case VoIPCallPhase.RingingIncoming:
      return 'INCOMING_RINGING';
    case VoIPCallPhase.Active:
      return 'IN_CALL';
    case VoIPCallPhase.Ended:
    case VoIPCallPhase.Rejected:
    case VoIPCallPhase.Muted:
    case VoIPCallPhase.Error:
      return 'ENDING';
    default:
      return 'IDLE';
  }
}

/** Fases Ghost-Link que cierran sesión y deben acabar en IDLE tras teardown. */
export function isGhostTerminalPhase(ghostPhase: VoIPCallPhase): boolean {
  return (
    ghostPhase === VoIPCallPhase.Ended ||
    ghostPhase === VoIPCallPhase.Rejected ||
    ghostPhase === VoIPCallPhase.Muted ||
    ghostPhase === VoIPCallPhase.Error
  );
}
