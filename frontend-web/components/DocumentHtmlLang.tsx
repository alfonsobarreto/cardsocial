'use client';

import { useLayoutEffect } from 'react';
import type { PublicLocale } from '@/lib/resolvePublicLocale';

/**
 * Sincroniza <html lang> con el locale servido (lectura/screen readers) en vistas públicas.
 */
export default function DocumentHtmlLang({ locale }: { locale: PublicLocale }) {
  useLayoutEffect(() => {
    const el = document.documentElement;
    const prev = el.getAttribute('lang');
    el.setAttribute('lang', locale === 'es' ? 'es' : 'en');
    return () => {
      if (prev) el.setAttribute('lang', prev);
    };
  }, [locale]);
  return null;
}
