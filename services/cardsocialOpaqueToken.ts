/**
 * Tokens opacos emitidos por el backend (hex desde randomBytes): universal + QR dinámico.
 * Rango alineado con validación pública 16–128 en `/api/public/*`.
 */
export function isLikelyCardsocialOpaqueToken(raw: string): boolean {
  const s = String(raw || '').trim();
  if (s.length < 32 || s.length > 128) {
    return false;
  }
  return /^[a-f0-9]+$/i.test(s);
}
