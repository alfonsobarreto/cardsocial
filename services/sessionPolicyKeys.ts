/** Claves persistencia — centralizadas para evitar imports circulares. */

/**
 * Candado biométrico (misma cadena en toda la app).
 * En iOS/Android el valor vive en Keychain/Keystore vía `appLockSecureStorage`; en web, AsyncStorage.
 */
export const APP_LOCK_ENABLED_STORAGE_KEY = 'APP_LOCK_ENABLED';

export function sessionLastActivityKey(uid: string): string {
  return `session_last_activity_at:${uid}`;
}

/** Si existe `'1'`, desactiva el cierre por inactividad (8 h) en este dispositivo. */
export function trustedDeviceSessionKey(uid: string): string {
  return `trusted_device_session:${uid}`;
}
