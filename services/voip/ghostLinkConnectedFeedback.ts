/**
 * Confirmación “conectado” sin expo-av: cumple la regla de oro una vez Agora posee la sesión RTC.
 * (iPhone en silencio: sin audio de sistema; la UX es háptica.)
 */

import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

export function triggerGhostLinkConnectedFeedback(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  try {
    if (Platform.OS === 'android') {
      Vibration.vibrate(45);
    } else {
      Vibration.vibrate(35);
    }
  } catch {
    /* sin vibrator */
  }
}
