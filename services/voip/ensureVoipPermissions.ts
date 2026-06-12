import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { GhostLinkCallType } from '@/services/ghostLinkVoip';

/**
 * Permisos VoIP con APIs de Expo (compatibles con Expo Go y dev client).
 *
 * - Micrófono: `expo-av` `Audio.requestPermissionsAsync()`.
 * - Cámara (solo video): `expo-image-picker` — solo diálogo de permiso, sin montar vista de cámara.
 */
export async function ensureVoipPermissions(callType: GhostLinkCallType): Promise<boolean> {
  try {
    const audioPerm = await Audio.requestPermissionsAsync();
    if (audioPerm.status !== 'granted') {
      return false;
    }

    if (callType === 'video') {
      if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        return false;
      }
      const camPerm = await ImagePicker.requestCameraPermissionsAsync();
      if (camPerm.status !== 'granted') {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
