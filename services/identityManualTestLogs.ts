/**
 * Logs de prueba manual para contrato de identidad (Smart/Business, VoIP).
 * Solo en __DEV__; desactivar cambiando ENABLED a false si hace falta.
 */
export const IDENTITY_MANUAL_TEST_LOGS_ENABLED = __DEV__;

const PREFIX = '[CS-identity-test]';

export function logIdentityTest(tag: string, payload: unknown): void {
  if (!IDENTITY_MANUAL_TEST_LOGS_ENABLED) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`${PREFIX} ${tag}`, payload);
}
