/** Misma detección que NewInfoForm (Texto Plain): http(s) y www. */
export const PLAIN_TEXT_URL_RE = /\b(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;

export type PlainTextUrlPart = { kind: 'text' | 'url'; s: string };

export function splitPlainTextByUrls(text: string): PlainTextUrlPart[] {
  if (!text) return [];
  const parts: PlainTextUrlPart[] = [];
  let last = 0;
  const re = new RegExp(PLAIN_TEXT_URL_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const full = m[0];
    if (!full) continue;
    if (m.index > last) parts.push({ kind: 'text', s: text.slice(last, m.index) });
    parts.push({ kind: 'url', s: full });
    last = m.index + full.length;
  }
  if (last < text.length) parts.push({ kind: 'text', s: text.slice(last) });
  return parts;
}

/** Href seguro para abrir en un <a> (recorta puntuación colgante). */
export function hrefPlainTextUrlToken(raw: string): string {
  const trimmed = raw.replace(/[),.;:!?]+$/g, '').trim();
  if (!trimmed) return '#';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
