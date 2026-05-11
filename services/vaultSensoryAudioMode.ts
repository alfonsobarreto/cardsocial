/**
 * Modo de audio explícito para SFX cortos (Bóveda / borrido) en Android + iOS.
 * Sin `interruptionMode*`, el modo puede quedar “ensuciado” por VoIP/Agora y el MP3 no suena.
 */
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';

export async function setVaultSensoryPlaybackAudioMode(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    interruptionModeIOS: InterruptionModeIOS.DuckOthers,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}
