import { resolveEmailCandidatesFromUsername } from '@/lib/resolveEmailFromUsername';

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 1) Si parece email (`@`) → Firebase Auth directo.
 * 2) POST `/api/studio/resolve-username` (Admin Firestore; requiere `FIREBASE_SERVICE_ACCOUNT_JSON`).
 * 3) Fallback: lectura cliente (falla con reglas actuales salvo pruebas locales).
 */
export async function resolveSignInEmailCandidates(raw: string): Promise<string[] | null> {
  const t = raw.trim();
  if (!t) {
    return null;
  }
  if (t.includes('@')) {
    const lower = t.toLowerCase();
    if (!EMAIL_LIKE.test(lower)) return null;
    return [lower];
  }

  if (typeof window !== 'undefined') {
    try {
      const r = await fetch('/api/studio/resolve-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: t }),
      });
      if (r.ok) {
        const j = (await r.json()) as { emails?: unknown; email?: string };
        if (Array.isArray(j?.emails) && j.emails.length) {
          const list = j.emails
            .map((e) => String(e).trim().toLowerCase())
            .filter((e) => EMAIL_LIKE.test(e));
          if (list.length) return list;
        }
        const e = String(j?.email || '')
          .trim()
          .toLowerCase();
        if (e && EMAIL_LIKE.test(e)) {
          return [e];
        }
      }
    } catch {
      /* sigue al fallback */
    }
  }

  return resolveEmailCandidatesFromUsername(t);
}
