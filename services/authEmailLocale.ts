import type { Auth } from 'firebase/auth';

/**
 * Idioma del correo transaccional de Firebase Auth (plantillas en consola).
 * Configura plantillas en inglés y español; lo demás usa inglés.
 */
export function applyAuthEmailLocale(auth: Auth, language: 'es' | 'en'): void {
  auth.languageCode = language;
}

/** Normaliza locales de la app (p. ej. Studio) a lo que Firebase suele tener como plantilla. */
export function authEmailLanguageFromAppLocale(locale: string): 'es' | 'en' {
  return String(locale || '').toLowerCase().startsWith('es') ? 'es' : 'en';
}
