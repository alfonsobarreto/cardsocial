/**
 * Fase 8.1 — “Evaporación de aire” al eliminar: swipe-delete + háptico ligero (todas las cuentas, sin tier).
 * Sustituir SWIPE_DELETE_AUDIO por otro asset sin tocar puntos de llamada.
 */
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

import { setVaultSensoryPlaybackAudioMode } from '@/services/vaultSensoryAudioMode';

const SWIPE_DELETE_AUDIO = require('../assets/sounds/sound-swipe-delete.mp3');

let deleteWhooshSound: Audio.Sound | null = null;

async function ensurePlaybackMode(): Promise<void> {
  try {
    await setVaultSensoryPlaybackAudioMode();
  } catch {
    /* no bloquear borrado */
  }
}

/** Precarga MP3 para latencia ~0 en swipe / confirmar borrado. Idempotente. */
export async function preloadAirEvaporationDeleteSound(): Promise<void> {
  if (deleteWhooshSound) return;
  try {
    await ensurePlaybackMode();
    const { sound } = await Audio.Sound.createAsync(SWIPE_DELETE_AUDIO, {
      shouldPlay: false,
      volume: 1,
      isLooping: false,
    });
    deleteWhooshSound = sound;
  } catch (e) {
    console.warn('[DeleteSensory] preload swipe-delete sound failed:', e);
  }
}

async function playDeleteFromStart(): Promise<void> {
  if (!deleteWhooshSound) return;
  try {
    await deleteWhooshSound.setPositionAsync(0);
    await deleteWhooshSound.playAsync();
  } catch (e) {
    console.warn('[DeleteSensory] play swipe-delete failed:', e);
  }
}

/**
 * Audio + háptico ligero en paralelo (contraste con el guardado premium “pesado”).
 */
export async function runAirEvaporationDeleteFeedback(): Promise<void> {
  await preloadAirEvaporationDeleteSound();
  await Promise.all([
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined),
    playDeleteFromStart(),
  ]);
}
