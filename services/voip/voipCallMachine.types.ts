/**
 * Máquina de estados In-App para VoIP (Ghost-Link / futuras llamadas).
 * Signaling: backend propio (Mongo ghost_link_invites + push/polling). Sin Agora RTM.
 *
 * Fase 2 (fuera de alcance hoy): CallKit / ConnectionService.
 */

/**
 * Fases de la máquina finita central (audio owner + transiciones VoIP).
 * Distinto de `VoIPCallPhase` (Ghost-Link UI): ver `VoIPCallPhase.ts`.
 */
export type VoIPFsmPhase =
  | 'IDLE'
  /** Emisor: invite creado en backend; solo expo-av ringback (nunca Agora activo aquí). */
  | 'OUTGOING_CALLING'
  /** Receptor: push/polling; solo expo-av ringtone en bucle. */
  | 'INCOMING_RINGING'
  /**
   * Ventana crítica: cero audio expo-av (unloadAsync terminado) → luego joinChannel.
   * Aquí se obtiene/refresca token Agora y se inicializa IRtcEngine si aplica.
   */
  | 'CONNECTING'
  /** Ambos en canal RTC; IRtcEngine es dueño de captura/reproducción VoIP. */
  | 'IN_CALL'
  /** Teardown: leaveChannel/release Agora; al terminar → IDLE. */
  | 'ENDING';

/** Qué subsistema “posee” la sesión de audio del sistema (regla de oro: un solo dueño). */
export type VoIPAudioOwner = 'none' | 'expo_av_ring' | 'agora_rtc';

export type VoIPCallDirection = 'outgoing' | 'incoming';

/** Snapshot mínimo para UI y logs (ampliar según producto). */
export type VoIPCallSession = {
  direction: VoIPCallDirection;
  /** inviteId / sessionId del backend (ghost_link_invites). */
  inviteId?: string;
  sessionId?: string;
  peerUid: string;
  callType: 'audio' | 'video';
};

/**
 * Debe hacer stopAsync + unloadAsync de todos los Sound de tono (y dejar soundRef en null).
 * Idempotente si ya no hay nada que reproducir.
 */
export type VoIPReleaseExpoAvRingFn = () => Promise<void>;

export type VoIPCallContextValue = {
  phase: VoIPFsmPhase;
  audioOwner: VoIPAudioOwner;
  session: VoIPCallSession | null;

  // Transiciones (implementación real en VoIPCallProvider)
  /** IDLE → OUTGOING_CALLING tras crear invite en backend; luego iniciar ringback expo-av. */
  enterOutgoingCalling: (session: VoIPCallSession) => void;
  /** IDLE | background → INCOMING_RINGING al recibir invite; iniciar ringtone expo-av. */
  enterIncomingRinging: (session: VoIPCallSession) => void;
  /**
   * INCOMING_RINGING → CONNECTING: `releaseExpoAvRing` (await completo) → AudioMode VoIP;
   * luego el integrador llama respond + joinChannel.
   */
  acceptIncoming: (releaseExpoAvRing: VoIPReleaseExpoAvRingFn) => Promise<void>;
  /**
   * OUTGOING_CALLING → CONNECTING: misma secuencia estricta que acceptIncoming.
   * Tras resolver esta promesa, el integrador debe joinChannel y luego markInCall().
   */
  beginMediaConnect: (releaseExpoAvRing: VoIPReleaseExpoAvRingFn) => Promise<void>;
  /** Tras join exitoso / onUserJoined → IN_CALL. */
  markInCall: () => void;
  /** Cualquier fase → ENDING → teardown Agora → IDLE. */
  hangup: () => Promise<void>;
};
