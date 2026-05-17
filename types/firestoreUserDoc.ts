/**
 * Campos opcionales del documento raíz `users/{uid}` usados por la app.
 * El esquema completo incluye uid, nicknameLower, emailLower, phoneNormalized, etc.
 */
export type FirestoreUserAppFields = {
  /** Versión del onboarding completada por el usuario (>= CURRENT_ONBOARDING_VERSION). */
  onboardingVersion?: number;
};
