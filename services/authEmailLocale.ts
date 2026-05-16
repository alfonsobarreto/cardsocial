/**
 * Forma mínima de Auth del cliente Firebase usada solo para `languageCode`.
 * Evita importar `firebase/auth` aquí: el web (Next) compila `@card-social/services/*`
 * y la resolución del módulo no siempre coincide con el árbol de `node_modules`.
 */
export interface AuthWithEmailLocale {
  languageCode: string | null;
}

/**
 * Idioma del correo transaccional de Firebase Auth (plantillas en consola).
 * Configura plantillas en inglés y español; lo demás usa inglés.
 */
export function applyAuthEmailLocale(auth: AuthWithEmailLocale, language: 'es' | 'en'): void {
  auth.languageCode = language;
}

/** Normaliza locales de la app (p. ej. Studio) a lo que Firebase suele tener como plantilla. */
export function authEmailLanguageFromAppLocale(locale: string): 'es' | 'en' {
  return String(locale || '').toLowerCase().startsWith('es') ? 'es' : 'en';
}
