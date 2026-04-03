import { BUSINESS_KEYWORD_BLOCKLIST } from '@/constants/businessKeywordBlocklist';

const MAX_KEYWORDS = 20;
const MAX_TAG_LENGTH = 48;

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function isKeywordBlocked(raw: string): boolean {
  const n = normalizeForMatch(raw);
  if (!n) return false;
  for (const blocked of BUSINESS_KEYWORD_BLOCKLIST) {
    const b = normalizeForMatch(blocked);
    if (b && n.includes(b)) return true;
  }
  return false;
}

export type KeywordValidationResult =
  | { ok: true; tags: string[] }
  | { ok: false; reason: 'empty' | 'too_many' | 'too_long' | 'blocked'; detail?: string };

/**
 * Normaliza lista: trim, dedupe case-insensitive, máx. 20, sin vacíos.
 */
export function validateBusinessKeywordList(input: string[]): KeywordValidationResult {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of input) {
    const t = String(raw || '').trim();
    if (!t) continue;
    if (t.length > MAX_TAG_LENGTH) {
      return { ok: false, reason: 'too_long', detail: t };
    }
    const key = normalizeForMatch(t);
    if (seen.has(key)) continue;
    if (isKeywordBlocked(t)) {
      return { ok: false, reason: 'blocked', detail: t };
    }
    seen.add(key);
    tags.push(t);
    if (tags.length > MAX_KEYWORDS) {
      return { ok: false, reason: 'too_many' };
    }
  }
  return { ok: true, tags };
}

export function parseKeywordsFromCommaText(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export { MAX_KEYWORDS as MAX_BUSINESS_KEYWORDS, MAX_TAG_LENGTH as MAX_BUSINESS_KEYWORD_LENGTH };
