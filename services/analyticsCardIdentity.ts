/** Identidad única por evento: smart → sid; negocio → bId (evita cruce entre tarjetas). */
export function resolveAnalyticsCardIdentity(
  cardId: string,
  sourceSid?: string | null,
  sourceBId?: string | null,
): { sid: string; bId: string } {
  const cid = String(cardId || '').trim();
  const sidHint = String(sourceSid || '').trim();
  const bIdHint = String(sourceBId || '').trim();

  if (cid && cid === sidHint) {
    return { sid: sidHint, bId: '' };
  }
  if (cid && cid === bIdHint) {
    return { sid: '', bId: bIdHint };
  }
  if (sidHint && !bIdHint) {
    return { sid: sidHint, bId: '' };
  }
  if (bIdHint && !sidHint) {
    return { sid: '', bId: bIdHint };
  }
  if (sidHint) {
    return { sid: sidHint, bId: '' };
  }
  if (bIdHint) {
    return { sid: '', bId: bIdHint };
  }
  return { sid: cid, bId: '' };
}
