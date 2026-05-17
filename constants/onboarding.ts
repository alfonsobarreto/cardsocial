/** Versión del carrusel de onboarding; al subir el contenido, incrementar y tratar usuarios sin esa versión. */
export const CURRENT_ONBOARDING_VERSION = 2 as const;

/**
 * Clave AsyncStorage: onboarding completado para `CURRENT_ONBOARDING_VERSION`.
 * Al cambiar la versión del carrusel, cambia la clave y los usuarios volverán a ver el flujo si no está en Firestore.
 */
export const ONBOARDING_STORAGE_KEY = `@onboarding_v${CURRENT_ONBOARDING_VERSION}_done`;
