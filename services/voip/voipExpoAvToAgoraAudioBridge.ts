/**
 * Puente estricto expo-av (tonos de llamada) → sesión lista para Agora RTC.
 *
 * Orden obligatorio:
 * 1) await liberar Sound (stopAsync + unloadAsync) — sin solapamiento con IRtcEngine.
 * 2) await Audio.setAudioModeAsync(...) — modo llamada tras el unmount del tono.
 * 3) Breve delay para que iOS/Android apliquen categoría / modo comunicación.
 * 4) Recién entonces el llamador debe initialize/joinChannel en Agora.
 *
 * iOS: allowsRecordingIOS + DoNotMix aproxima PlayAndRecord (.voiceChat) y toma el foco de sesión;
 *    el stack nativo de expo-av incluye opciones que permiten enrutar por Bluetooth HFP cuando
 *    corresponde (no exponen un flag JS explícito; el modo PlayAndRecord + VoIP es el hook).
 * Android: DoNotMix + playThroughEarpieceAndroid alinea con enfoque comunicación / auricular.
 */

import { Platform } from 'react-native';

export type ExpoAvCallTone = {
  stopAsync: () => Promise<void>;
  unloadAsync: () => Promise<void>;
} | null;

let expoAvModulePromise: Promise<typeof import('expo-av') | null> | undefined;

function loadExpoAv(): Promise<typeof import('expo-av') | null> {
  if (expoAvModulePromise === undefined) {
    expoAvModulePromise = import('expo-av')
      .then((m) => m)
      .catch(() => null);
  }
  return expoAvModulePromise;
}

/** Modo expo-av idéntico en preparación inicial y en refrescos tras cambio de ruta (AirPods, etc.). */
async function applyExpoAvAudioModeForVoipRtcHandoff(): Promise<void> {
  const av = await loadExpoAv();
  if (!av?.Audio) return;

  const { Audio, InterruptionModeIOS, InterruptionModeAndroid } = av;

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: true,
    /** VoIP por defecto hacia auricular; con BT conectado el sistema suele preferir HFP hasta que el usuario pide altavoz. */
    playThroughEarpieceAndroid: true,
  });
}

/** Solo stop + unload de un Sound concreto (sin tocar AudioMode). */
export async function unloadExpoAvCallTone(sound: ExpoAvCallTone): Promise<void> {
  if (!sound) return;
  try {
    await sound.stopAsync();
  } catch {
    /* ya parado */
  }
  try {
    await sound.unloadAsync();
  } catch {
    /* ya liberado */
  }
}

/**
 * Tras dejar expo-av sin tonos activos: fija modo de audio para VoIP antes de Agora.
 *
 * expo-av `AudioMode` (no existe `shouldRouteThroughEarpieceAndroid`; el equivalente es
 * `playThroughEarpieceAndroid`).
 *
 * - playsInSilentModeIOS: true → el timbre/tonos con expo-av pueden oírse con el interruptor
 *   de silencio; aquí lo mantenemos true para la sesión post-handoff por si queda playback auxiliar.
 * - staysActiveInBackground: true → alineado con llamada prolongada (requiere UIBackgroundModes en iOS nativo).
 */
export async function prepareIosAndroidAudioSessionForVoipRtc(): Promise<void> {
  await applyExpoAvAudioModeForVoipRtcHandoff();

  await new Promise<void>((r) => setTimeout(r, Platform.OS === 'ios' ? 180 : 80));
}

/**
 * Tras `onAudioRoutingChanged` (p. ej. AirPods conectados en mitad de llamada): reaplica el modo expo-av
 * para que AVAudioSession / AudioManager reevalúen rutas Bluetooth sin quedar en estado intermedio con Agora.
 */
export async function refreshIosAndroidAudioSessionForVoipRtcRouteChange(): Promise<void> {
  await applyExpoAvAudioModeForVoipRtcHandoff();
  await new Promise<void>((r) => setTimeout(r, Platform.OS === 'ios' ? 90 : 50));
}

/**
 * Secuencia CONNECTING para audio: callback debe hacer stop+unload de todos los Sound de tono.
 * (En Ghost-Link: misma lógica que `stopTone` cuando soundRef aglutina el ringback/ringtone.)
 *
 * Si `releaseExpoAvRing` falla, no se bloquea el handoff: se registra y se intenta igualmente
 * preparar la sesión para Agora (el motor RTC puede recuperar el mic aunque el unload haya fallado).
 */
export async function runVoipConnectingAudioHandoff(releaseExpoAvRing: () => Promise<void>): Promise<void> {
  try {
    await releaseExpoAvRing();
  } catch {
    /* continuar: preparar sesión de audio */
  }

  try {
    await prepareIosAndroidAudioSessionForVoipRtc();
  } catch {
    /* No relanzar: el join de Agora puede reconfigurar la sesión; evitar dejar la UI colgada. */
  }
}
