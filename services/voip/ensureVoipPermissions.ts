import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import { PERMISSIONS, RESULTS, request } from 'react-native-permissions';

import type { GhostLinkCallType } from '@/services/ghostLinkVoip';

/**
 * Permisos VoIP sin `expo-camera` (evita el stack de vista/hardware de Expo Camera; Agora sigue siendo quien captura).
 *
 * - Micrófono: `expo-av` `Audio.requestPermissionsAsync()` — solo diálogo de grabación, sin componente Camera.
 * - Cámara (solo video): `react-native-permissions` `request(CAMERA)` — API nativa de permisos, sin montar vista de cámara.
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
      const cameraPerm = Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;
      const camResult = await request(cameraPerm);
      if (camResult !== RESULTS.GRANTED) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
