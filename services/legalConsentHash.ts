import {
  LEGAL_CONSENT_BUNDLE_VERSION,
  LEGAL_URLS,
  PRIVACY_SECTIONS_DE,
  PRIVACY_SECTIONS_EN,
  PRIVACY_SECTIONS_ES,
  PRIVACY_SECTIONS_FR,
  PRIVACY_SECTIONS_IT,
  PRIVACY_SECTIONS_PT,
  TERMS_LINES_DE,
  TERMS_LINES_EN,
  TERMS_LINES_ES,
  TERMS_LINES_FR,
  TERMS_LINES_IT,
  TERMS_LINES_PT,
  USAGE_LINES_DE,
  USAGE_LINES_EN,
  USAGE_LINES_ES,
  USAGE_LINES_FR,
  USAGE_LINES_IT,
  USAGE_LINES_PT,
  type PrivacySection,
} from '@/constants/legalConsent';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

type SupportedLegalLocale = 'de' | 'en' | 'es' | 'fr' | 'it' | 'pt';

export type LegalConsentSnapshot = {
  schemaVersion: 1;
  bundleVersion: string;
  locale: SupportedLegalLocale;
  canonicalUrls: typeof LEGAL_URLS;
  documents: {
    terms: readonly string[];
    privacy: readonly PrivacySection[];
    usage: readonly string[];
  };
};

export type LegalConsentHashBundle = {
  hashAlgorithm: 'SHA-256';
  canonicalization: 'json-stable-v1';
  termsHash: string;
  privacyHash: string;
  usageHash: string;
  bundleHash: string;
  legalTextSnapshot: LegalConsentSnapshot;
};

const LEGAL_BUNDLES: Record<
  SupportedLegalLocale,
  { terms: readonly string[]; privacy: readonly PrivacySection[]; usage: readonly string[] }
> = {
  de: { terms: TERMS_LINES_DE, privacy: PRIVACY_SECTIONS_DE, usage: USAGE_LINES_DE },
  en: { terms: TERMS_LINES_EN, privacy: PRIVACY_SECTIONS_EN, usage: USAGE_LINES_EN },
  es: { terms: TERMS_LINES_ES, privacy: PRIVACY_SECTIONS_ES, usage: USAGE_LINES_ES },
  fr: { terms: TERMS_LINES_FR, privacy: PRIVACY_SECTIONS_FR, usage: USAGE_LINES_FR },
  it: { terms: TERMS_LINES_IT, privacy: PRIVACY_SECTIONS_IT, usage: USAGE_LINES_IT },
  pt: { terms: TERMS_LINES_PT, privacy: PRIVACY_SECTIONS_PT, usage: USAGE_LINES_PT },
};

function normalizeLegalLocale(locale: string | null | undefined): SupportedLegalLocale {
  const normalized = String(locale || '').trim().toLowerCase().slice(0, 2);
  if (normalized === 'de' || normalized === 'en' || normalized === 'es' || normalized === 'fr' || normalized === 'it' || normalized === 'pt') {
    return normalized;
  }
  return 'en';
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function hashLegalValue(value: unknown): string {
  return `sha256:${bytesToHex(sha256(utf8ToBytes(stableJson(value))))}`;
}

export function buildLegalConsentHashBundle(locale: string | null | undefined): LegalConsentHashBundle {
  const legalLocale = normalizeLegalLocale(locale);
  const documents = LEGAL_BUNDLES[legalLocale];
  const legalTextSnapshot: LegalConsentSnapshot = {
    schemaVersion: 1,
    bundleVersion: LEGAL_CONSENT_BUNDLE_VERSION,
    locale: legalLocale,
    canonicalUrls: LEGAL_URLS,
    documents,
  };

  return {
    hashAlgorithm: 'SHA-256',
    canonicalization: 'json-stable-v1',
    termsHash: hashLegalValue(documents.terms),
    privacyHash: hashLegalValue(documents.privacy),
    usageHash: hashLegalValue(documents.usage),
    bundleHash: hashLegalValue(legalTextSnapshot),
    legalTextSnapshot,
  };
}
