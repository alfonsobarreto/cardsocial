/**
 * Studio / Market Radar: solo lectura de `EXPO_PUBLIC_*`.
 * Sin imports externos. Solo `default export` para minimizar errores interop Hermes/named bindings.
 */
export default function marketRadarStudioBaseFromEnv(): string | null {
  const raw =
    process.env.EXPO_PUBLIC_MARKET_RADAR_WEB_ORIGIN ??
    process.env.EXPO_PUBLIC_STUDIO_WEB_URL ??
    '';
  const s = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
  return s.length > 0 ? s : null;
}
