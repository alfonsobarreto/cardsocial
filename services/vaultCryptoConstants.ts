/**
 * Constantes de tamaño / PBKDF2 del vault E2E — sin WebCrypto, sin Noble, sin detección RN.
 * Usar desde módulos que deben cargarse en bundlers web (Next.js) sin efectos secundarios.
 */

export const VAULT_PBKDF2_ITERATIONS = 310_000;
export const VAULT_AES_KEY_BYTES = 32;
export const VAULT_SALT_BYTES = 16;
export const VAULT_GCM_IV_BYTES = 12;
