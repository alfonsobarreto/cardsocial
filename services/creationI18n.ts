import creationLocales from '@/services/i18n/creationLocales.json';
import { getCurrentI18nAppLanguage, type AppLanguage, useLanguageOptional } from '@/services/language';
import { useCallback } from 'react';

type LangRow = { es: string; en: string; it: string; pt: string; fr: string; de: string };

export type CreationLocaleKey = keyof typeof creationLocales;

export function creationT(key: CreationLocaleKey, lang: AppLanguage, vars?: Record<string, string | number>): string {
  const row = creationLocales[key] as LangRow | undefined;
  if (!row) return String(key);
  let s = row[lang] ?? row.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{{${k}}}`).join(String(v));
    }
  }
  return s;
}

/** Creación / Bóveda / Card-studio dentro de `LanguageProvider`. */
export function useCreationT(): (key: CreationLocaleKey, vars?: Record<string, string | number>) => string {
  const ctx = useLanguageOptional();
  const lang = ctx?.language ?? getCurrentI18nAppLanguage();
  return useCallback((key: CreationLocaleKey, vars?: Record<string, string | number>) => creationT(key, lang, vars), [lang]);
}

/** Etiqueta traducida del tipo de dato en Bóveda (clave interna ES → i18n). */
export function vaultDataTypeCreationLabel(
  type: string,
  tcx: (key: CreationLocaleKey, vars?: Record<string, string | number>) => string,
): string {
  switch (String(type || '').trim()) {
    case 'Enlaces':
    case 'link':
      return tcx('form_type_link');
    case 'Email':
      return tcx('form_type_email');
    case 'Teléfono':
      return tcx('form_type_phone');
    case 'Texto Plain':
      return tcx('form_type_text');
    case 'Documento':
      return tcx('form_type_document');
    case 'Ghost-Link':
      return tcx('form_type_ghost');
    default:
      return String(type || '').trim() || tcx('form_type_link');
  }
}
