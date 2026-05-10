/**
 * “Cierre magnético”: audio metálico + Heavy (premium cuenta) ó Light solo (cuenta estándar).
 * Para sustituir por WAV HQ, cambia solo `MAGNETIC_CLOSURE_METAL` o el `createAsync` inferior.
 */
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

/** Extensión `.mp3` en minúsculas: Metro solo registra `mp3` como asset (`.MP3` no resuelve). */
const MAGNETIC_CLOSURE_METAL = require('../assets/sounds/Sound_Metal_Cool.mp3');

let metalSound: Audio.Sound | null = null;

async function ensurePlaybackMode(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    /* no bloquear guardado */
  }
}

/** Precarga MP3 para latencia mínima en el guardado. Idempotente. */
export async function preloadMagneticVaultClosureSound(): Promise<void> {
  if (metalSound) return;
  try {
    await ensurePlaybackMode();
    const { sound } = await Audio.Sound.createAsync(MAGNETIC_CLOSURE_METAL, {
      shouldPlay: false,
      volume: 1,
      isLooping: false,
    });
    metalSound = sound;
  } catch (e) {
    console.warn('[VaultSensory] preload metal sound failed:', e);
  }
}

async function playMetalFromStart(): Promise<void> {
  if (!metalSound) return;
  try {
    await metalSound.setPositionAsync(0);
    await metalSound.playAsync();
  } catch (e) {
    console.warn('[VaultSensory] play metal failed:', e);
  }
}

/**
 * Premium (Business / Influencer / Legacy Platino+): Heavy + audio en paralelo.
 * Free: solo Light, sin audio.
 */
export async function runVaultMagneticSaveFeedback(isPremiumAccount: boolean): Promise<void> {
  if (isPremiumAccount) {
    await preloadMagneticVaultClosureSound();
    await Promise.all([
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined),
      playMetalFromStart(),
    ]);
  } else {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }
}
