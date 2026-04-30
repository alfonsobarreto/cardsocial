import type { User } from 'firebase/auth';

/**
 * Guard de acceso al panel admin web.
 * Debe mantenerse alineado con `firestore.rules` → `isSuperAdmin()` (rol en doc `users/{uid}`),
 * y con la lista de correos autorizados para entrar a esta SPA.
 */
const SUPER_ADMIN_EMAIL = 'pochobs@gmail.com';

export function getSuperAdminEmail(): string {
  return SUPER_ADMIN_EMAIL;
}

/** Acceso estricto a la consola web (Firebase Auth). */
export function isSuperAdminUser(user: User | null): boolean {
  return user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}
