/**
 * Modo pruebas (TESTING): gracia de dashboard hasta fecha fija para usuarios no privilegiados.
 * Desactivar con EXPO_PUBLIC_DASHBOARD_TESTING_GRACE_MODE distinto de `1` / `true` — vuelve la lógica normal.
 */
export function dashboardTestingGraceEndDate(): Date {
  return new Date(2026, 4, 31, 23, 59, 59, 999);
}

export function isDashboardTestingGraceModeEnabled(): boolean {
  const v = process.env.EXPO_PUBLIC_DASHBOARD_TESTING_GRACE_MODE;
  return v === '1' || v === 'true' || v === 'TRUE';
}

function daysUntil(date: Date | null): number {
  if (!date) return 999;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

/**
 * Fecha mostrada en el badge "Renueva:" cuando el modo pruebas está activo:
 * - Privilegiados: sin cambio (pero el caller suele no usar esto para superadmin).
 * - Sin fecha en datos: se asume acceso hasta el tope de gracia.
 * - Suscripción aún vigente (`raw >= now`): se muestra la fecha real.
 * - Suscripción caducada: se muestra el fin de gracia (31 may 2026).
 */
export function effectiveDashboardRenewalDate(
  rawRenewal: Date | null,
  isPrivilegedUser: boolean,
  testingGraceEnabled: boolean,
): Date | null {
  if (!testingGraceEnabled || isPrivilegedUser) {
    return rawRenewal;
  }
  const cap = dashboardTestingGraceEndDate();
  if (!rawRenewal) {
    return cap;
  }
  if (rawRenewal.getTime() >= Date.now()) {
    return rawRenewal;
  }
  return cap;
}

/**
 * Días efectivos para semáforo / badge. En modo pruebas nunca cae en franja CRITICAL (≤7) para no privilegiados.
 */
export function effectiveDashboardDaysLeft(
  rawRenewal: Date | null,
  isPrivilegedUser: boolean,
  testingGraceEnabled: boolean,
): number {
  if (isPrivilegedUser) {
    return 999;
  }
  const eff = effectiveDashboardRenewalDate(rawRenewal, isPrivilegedUser, testingGraceEnabled);
  let d = daysUntil(eff);
  if (testingGraceEnabled && d <= 7) {
    d = Math.max(d, 16);
  }
  return d;
}
