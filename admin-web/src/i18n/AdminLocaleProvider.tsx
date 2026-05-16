import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type AdminLocale = 'es' | 'en' | 'it' | 'pt' | 'fr' | 'de';

const STORAGE_KEY = 'admin_locale';

export const ADMIN_LOCALE_ORDER: AdminLocale[] = ['es', 'en', 'it', 'pt', 'fr', 'de'];

function parseStored(): AdminLocale {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s && ADMIN_LOCALE_ORDER.includes(s as AdminLocale)) return s as AdminLocale;
  } catch {
    /* ignore */
  }
  return 'es';
}

type AdminLocaleCtx = {
  locale: AdminLocale;
  setLocale: (l: AdminLocale) => void;
};

const AdminLocaleStateContext = createContext<AdminLocaleCtx | null>(null);

export function AdminLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AdminLocale>(() =>
    typeof window !== 'undefined' ? parseStored() : 'es',
  );

  const setLocale = useCallback((l: AdminLocale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <AdminLocaleStateContext.Provider value={value}>{children}</AdminLocaleStateContext.Provider>
  );
}

export function useAdminLocale(): AdminLocaleCtx {
  const ctx = useContext(AdminLocaleStateContext);
  if (!ctx) {
    return {
      locale: 'es',
      setLocale: () => {},
    };
  }
  return ctx;
}

/** BCP 47 tag for Intl formatters (dates, numbers). */
export function adminLocaleToBcp47(locale: AdminLocale): string {
  const m: Record<AdminLocale, string> = {
    es: 'es-ES',
    en: 'en-US',
    it: 'it-IT',
    pt: 'pt-BR',
    fr: 'fr-FR',
    de: 'de-DE',
  };
  return m[locale];
}
