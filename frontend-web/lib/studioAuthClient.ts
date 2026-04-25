'use client';

import { STUDIO_AUTH_COOKIE } from '@/lib/studioAuthShared';
export { STUDIO_AUTH_COOKIE };

export function setStudioAuthCookie(active: boolean): void {
  if (typeof document === 'undefined') return;
  const maxAge = active ? 60 * 60 * 24 * 14 : 0;
  document.cookie = `${STUDIO_AUTH_COOKIE}=${active ? '1' : ''}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function readSafeNextPath(raw: string | null | undefined): string {
  const value = String(raw || '').trim();
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/studio/bunker';
  }
  return value;
}
