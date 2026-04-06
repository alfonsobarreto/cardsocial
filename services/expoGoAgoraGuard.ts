/**
 * Expo Go no enlaza módulos nativos como react-native-agora.
 * Usar antes de require('react-native-agora').
 */

import Constants, { ExecutionEnvironment } from 'expo-constants';

/** `appOwnership === 'expo'` + StoreClient (Expo Go cuando appOwnership es null). */
export function isGhostLinkAgoraNativeAvailable(): boolean {
  if (Constants.appOwnership === 'expo') {
    return false;
  }
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return false;
  }
  return true;
}
