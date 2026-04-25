'use client';

import { STUDIO_AUTH_COOKIE } from '@/lib/studioAuthShared';
export { STUDIO_AUTH_COOKIE };

export function setStudioAuthCookie(active: boolean): void {
  if (typeof document === 'undefined') return;
  const maxAge = active ? 60 * 60 * 24 * 14 : 0;
  document.cookie = `${STUDIO_AUTH_COOKIE}=${active ? '1' : ''}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

const DEFAULT_STUDIO = '/studio/bunker';

/**
 * Ruta relativa de retorno (solo bajo /studio) tras login.
 * Acepta path (`/studio/bunker`) o URL absoluta (dev `http://localhost:.../studio/...`, prod `https://cardsocial.me/...`)
 * y devuelve siempre un path + query del **origen actual** al navegar (nunca otra base como localhost:3001).
 */
export function readSafeNextPath(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  if (!s) return DEFAULT_STUDIO;
  if (s.startsWith('//')) return DEFAULT_STUDIO;

  let pathWithQuery: string;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      pathWithQuery = `${u.pathname || ''}${u.search || ''}`;
    } catch {
      return DEFAULT_STUDIO;
    }
  } else {
    pathWithQuery = s;
  }

  if (!pathWithQuery.startsWith('/')) return DEFAULT_STUDIO;
  if (pathWithQuery.startsWith('//')) return DEFAULT_STUDIO;
  if (pathWithQuery === '/login' || pathWithQuery.startsWith('/login?')) {
    return DEFAULT_STUDIO;
  }
  if (!pathWithQuery.startsWith('/studio')) {
    return DEFAULT_STUDIO;
  }
  return pathWithQuery;
}
