/** Copy compartido: Next route `legacy-path/benefit-notify` + documentación server. */

import { emailT, type EmailLocale } from './emailI18n';

export type BenefitMilestone = 'pvc_or_higher' | 'metal_card';

/** @deprecated Usar `legacyBenefitSubject(locale)`. */
export const LEGACY_PHYSICAL_BENEFIT_SUBJECT_ES = '¡Tu beneficio físico de Card-Social está listo!';

export function minReferralsMetForBenefitNotify(milestone: BenefitMilestone): number {
  if (milestone === 'metal_card') return 1000;
  return 750;
}

export function legacyBenefitSubject(locale: EmailLocale): string {
  return emailT(locale, 'legacy_benefit_subject');
}

export function buildLegacyBenefitPlainText(
  locale: EmailLocale,
  displayName: string,
  milestone: BenefitMilestone,
  count: number,
): string {
  const name = String(displayName || '').trim() || emailT(locale, 'legacy_fallback_display_name');
  const greeting = emailT(locale, 'legacy_benefit_greeting', { name });
  const referrals = emailT(locale, 'legacy_benefit_referrals_line', { count });
  const signoff = emailT(locale, 'legacy_benefit_signoff');

  if (milestone === 'metal_card') {
    return [
      greeting,
      '',
      emailT(locale, 'legacy_benefit_metal_p1'),
      referrals,
      '',
      emailT(locale, 'legacy_benefit_metal_closing'),
      '',
      signoff,
    ].join('\n');
  }

  return [
    greeting,
    '',
    emailT(locale, 'legacy_benefit_pvc_p1'),
    referrals,
    '',
    emailT(locale, 'legacy_benefit_pvc_closing'),
    '',
    signoff,
  ].join('\n');
}

/** @deprecated Usar `buildLegacyBenefitPlainText('es', ...)`. */
export function buildLegacyBenefitPlainTextEs(
  displayName: string,
  milestone: BenefitMilestone,
  count: number,
): string {
  return buildLegacyBenefitPlainText('es', displayName, milestone, count);
}
