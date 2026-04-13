/**
 * Esqueleto: VoIP In-App state machine + regla de oro audio (expo-av vs Agora).
 *
 * Integración pendiente: sustituir o envolver la lógica actual de GhostLinkCallProvider
 * manteniendo el mismo backend (ghost_link_invites, respond, start, incoming).
 *
 * Regla de oro (expo-av y Agora no compiten):
 * - OUTGOING_CALLING / INCOMING_RINGING → solo expo-av (ringback / ringtone).
 * - CONNECTING → expo-av debe haber hecho stop + unloadAsync antes de joinChannel.
 * - IN_CALL → solo IRtcEngine (Agora); no recrear Sound de expo-av para tonos de llamada.
 */

import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import type {
  VoIPCallContextValue,
  VoIPFsmPhase,
  VoIPCallSession,
  VoIPAudioOwner,
  VoIPReleaseExpoAvRingFn,
} from '@/services/voip/voipCallMachine.types';
import { runVoipConnectingAudioHandoff } from '@/services/voip/voipExpoAvToAgoraAudioBridge';

type State = {
  phase: VoIPFsmPhase;
  audioOwner: VoIPAudioOwner;
  session: VoIPCallSession | null;
};

const initialState: State = {
  phase: 'IDLE',
  audioOwner: 'none',
  session: null,
};

type Action =
  | { type: 'RESET' }
  | { type: 'OUTGOING_RINGING'; session: VoIPCallSession }
  | { type: 'INCOMING_RINGING'; session: VoIPCallSession }
  | { type: 'ENTER_CONNECTING' }
  | { type: 'ENTER_IN_CALL' }
  | { type: 'ENTER_ENDING' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'RESET':
      return initialState;
    case 'OUTGOING_RINGING':
      return {
        phase: 'OUTGOING_CALLING',
        audioOwner: 'expo_av_ring',
        session: action.session,
      };
    case 'INCOMING_RINGING':
      return {
        phase: 'INCOMING_RINGING',
        audioOwner: 'expo_av_ring',
        session: action.session,
      };
    case 'ENTER_CONNECTING':
      return {
        ...state,
        phase: 'CONNECTING',
        audioOwner: 'none',
      };
    case 'ENTER_IN_CALL':
      return {
        ...state,
        phase: 'IN_CALL',
        audioOwner: 'agora_rtc',
      };
    case 'ENTER_ENDING':
      return {
        ...state,
        phase: 'ENDING',
        audioOwner: 'none',
      };
    default:
      return state;
  }
}

const VoIPCallContext = createContext<VoIPCallContextValue | null>(null);

export function useVoIPCall(): VoIPCallContextValue {
  const ctx = useContext(VoIPCallContext);
  if (!ctx) {
    throw new Error('useVoIPCall must be used within VoIPCallProvider');
  }
  return ctx;
}

/** Alias pedagógico (mismo hook). */
export const useVoIPContext = useVoIPCall;

/**
 * Provider esqueleto: enlaza aquí
 * - loadExpoAv + Sound.createAsync / stopAsync / unloadAsync en OUTGOING_CALLING / INCOMING_RINGING
 * - runVoipConnectingAudioHandoff(releaseExpoAvRing) al entrar CONNECTING
 * - joinGhostLinkAgoraSession / leaveGhostLinkAgoraSession en CONNECTING / ENDING
 * - startGhostLinkVoipCall / getIncomingGhostLinkInvite / respondGhostLinkInvite (qr API)
 */
export function VoIPCallProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const enterOutgoingCalling = useCallback((session: VoIPCallSession) => {
    dispatch({ type: 'OUTGOING_RINGING', session });
    // TODO: await stopTone previo si hubiera; luego playTone(RINGBACK) — solo si phase === OUTGOING_CALLING
  }, []);

  const enterIncomingRinging = useCallback((session: VoIPCallSession) => {
    dispatch({ type: 'INCOMING_RINGING', session });
    // TODO: playTone(RINGTONE) en bucle
  }, []);

  const acceptIncoming = useCallback(async (releaseExpoAvRing: VoIPReleaseExpoAvRingFn) => {
    dispatch({ type: 'ENTER_CONNECTING' });
    await runVoipConnectingAudioHandoff(releaseExpoAvRing);
    // Integrador: respondGhostLinkInvite('accept') → joinGhostLinkAgoraSession → markInCall()
  }, []);

  const beginMediaConnect = useCallback(async (releaseExpoAvRing: VoIPReleaseExpoAvRingFn) => {
    dispatch({ type: 'ENTER_CONNECTING' });
    await runVoipConnectingAudioHandoff(releaseExpoAvRing);
    // Integrador: joinGhostLinkAgoraSession → markInCall() al unirse al canal
  }, []);

  const markInCall = useCallback(() => {
    dispatch({ type: 'ENTER_IN_CALL' });
  }, []);

  const hangup = useCallback(async () => {
    dispatch({ type: 'ENTER_ENDING' });
    // TODO: await leaveGhostLinkAgoraSession(); respondGhostLinkInvite('end'); await stopTone/unload
    // TODO: dispatch({ type: 'RESET' }) solo al finalizar teardown
  }, []);

  const value = useMemo<VoIPCallContextValue>(
    () => ({
      phase: state.phase,
      audioOwner: state.audioOwner,
      session: state.session,
      enterOutgoingCalling,
      enterIncomingRinging,
      acceptIncoming,
      beginMediaConnect,
      markInCall,
      hangup,
    }),
    [
      state.phase,
      state.audioOwner,
      state.session,
      enterOutgoingCalling,
      enterIncomingRinging,
      acceptIncoming,
      beginMediaConnect,
      markInCall,
      hangup,
    ],
  );

  return <VoIPCallContext.Provider value={value}>{children}</VoIPCallContext.Provider>;
}
