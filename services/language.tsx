import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type AppLanguage = 'en' | 'es' | 'zh' | 'tl' | 'vi';

export const SUPPORTED_LANGUAGES: { code: AppLanguage; flag: string; label: string }[] = [
  { code: 'en', flag: '🇺🇸', label: 'English' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'zh', flag: '🇨🇳', label: '中文' },
  { code: 'tl', flag: '🇵🇭', label: 'Tagalog' },
  { code: 'vi', flag: '🇻🇳', label: 'Tiếng Việt' },
];

const LANGUAGE_STORAGE_KEY = 'card-social:app-language';

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (next: AppLanguage) => void;
  toggleLanguage: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');

  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored)) {
          setLanguageState(stored as AppLanguage);
        }
      } catch {
        // Ignore storage read failures and keep default language.
      }
    })();
  }, []);

  const setLanguage = (next: AppLanguage) => {
    setLanguageState(next);
    void AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, next).catch(() => null);
  };

  const toggleLanguage = () => {
    setLanguage(language === 'es' ? 'en' : 'es');
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider');
  }
  return context;
}
