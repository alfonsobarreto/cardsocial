import type { ExecLocale } from './investorCopy';

/** PDF or external deck URL; falls back to email request if unset (no file in repo yet). */
export function investorPitchDeckHref(): string {
  const u = process.env.NEXT_PUBLIC_INVESTOR_PITCH_DECK_URL;
  if (u && u.length > 0) return u;
  return 'mailto:pochobs@gmail.com?subject=Card-Social%20%E2%80%94%20Pitch%20deck&body=Please%20send%20the%20latest%20investor%20deck.';
}

export function investorDemoHref(locale: ExecLocale): string {
  const u = process.env.NEXT_PUBLIC_INVESTOR_CALENDAR_URL;
  if (u && u.length > 0) return u;
  return locale === 'es' ? '/es#waitlist' : '/#waitlist';
}

export function pitchDeckOpensInNewTab(): boolean {
  const u = process.env.NEXT_PUBLIC_INVESTOR_PITCH_DECK_URL;
  return Boolean(u && u.length > 0 && !u.startsWith('mailto:'));
}
