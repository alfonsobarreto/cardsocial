import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enBase from './locales/en.json';
import enUi from './locales/_generated/en.fragment.json';
import esBase from './locales/es.json';
import esUi from './locales/_generated/es.fragment.json';
import frBase from './locales/fr.json';
import frUi from './locales/_generated/fr.fragment.json';
import itBase from './locales/it.json';
import itUi from './locales/_generated/it.fragment.json';
import ptBase from './locales/pt.json';
import ptUi from './locales/_generated/pt.fragment.json';

const resources = {
  en: { translation: { ...enBase, ...enUi } },
  es: { translation: { ...esBase, ...esUi } },
  fr: { translation: { ...frBase, ...frUi } },
  it: { translation: { ...itBase, ...itUi } },
  pt: { translation: { ...ptBase, ...ptUi } },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  /** Sin traducción o idioma raro: inglés (recursos en en.json + en.fragment.json). */
  fallbackLng: 'en',
  supportedLngs: ['en', 'es', 'fr', 'it', 'pt'],
  nonExplicitSupportedLngs: true,
  load: 'languageOnly',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export default i18n;
