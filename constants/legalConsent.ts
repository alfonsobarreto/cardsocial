/**
 * Consentimiento legal en alta (mobile).
 * Bump `LEGAL_CONSENT_BUNDLE_VERSION` cuando cambie el contenido en
 * `frontend-web/lib/legalContent.ts` o las URLs canónicas de referencia,
 * para mantener auditoría clara entre app y cardsocial.me.
 */
export const LEGAL_CONSENT_BUNDLE_VERSION = '2026-05-19';

/** Re-export: fuente única de texto legal con el sitio público */
export {
  ABOUT_LINES_EN,
  ABOUT_LINES_ES,
  LEGAL_SUPPORT_EMAIL,
  LEGAL_URLS,
  PRIVACY_SECTIONS_EN,
  PRIVACY_SECTIONS_ES,
  PRIVACY_SUMMARY_EN,
  PRIVACY_SUMMARY_ES,
  TERMS_LINES_EN,
  TERMS_LINES_ES,
  USAGE_LINES_EN,
  USAGE_LINES_ES,
  type PrivacySection,
} from '../frontend-web/lib/legalContent';
