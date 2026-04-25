import { resolveEmailFromUsername } from '@/lib/resolveEmailFromUsername';

/**
 * 1) Si parece email (`@`) → Firebase Auth directo.
 * 2) POST `/api/studio/resolve-username` (Admin Firestore; requiere `FIREBASE_SERVICE_ACCOUNT_JSON`).
 * 3) Fallback: lectura cliente (falla con reglas actuales salvo pruebas locales).
 */
export async function resolveSignInEmail(raw: string): Promise<string | null> {
  const t = raw.trim();
  if (!t) {
    return null;
  }
  if (t.includes('@')) {
    return t.toLowerCase();
  }

  if (typeof window !== 'undefined') {
    try {
      const r = await fetch('/api/studio/resolve-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: t }),
      });
      if (r.ok) {
        const j = (await r.json()) as { email?: string };
        const e = String(j?.email || '')
          .trim()
          .toLowerCase();
        if (e) {
          return e;
        }
      }
    } catch {
      /* sigue al fallback */
    }
  }

  return resolveEmailFromUsername(t);
}
