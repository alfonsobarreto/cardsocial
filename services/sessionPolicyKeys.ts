/** Claves AsyncStorage — centralizadas para evitar imports circulares. */

export function sessionLastActivityKey(uid: string): string {
  return `session_last_activity_at:${uid}`;
}

/** Si existe `'1'`, desactiva el cierre por inactividad (8 h) en este dispositivo. */
export function trustedDeviceSessionKey(uid: string): string {
  return `trusted_device_session:${uid}`;
}
