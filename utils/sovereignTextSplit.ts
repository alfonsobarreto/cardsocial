/**
 * Primera línea = título; resto = cuerpo (misma regla en NewInfoForm y visores "Sovereign").
 */
export function splitSovereignText(raw: string): { headline: string; body: string } {
  const s = String(raw ?? '');
  const i = s.indexOf('\n');
  if (i === -1) {
    return { headline: s, body: '' };
  }
  return { headline: s.slice(0, i), body: s.slice(i + 1) };
}
