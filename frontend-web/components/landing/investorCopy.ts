import investorLocales from '@/locales/investorLocales.json';

export type ExecLocale = 'en' | 'es';

export type InvestorLocaleBundle = (typeof investorLocales)['en'];

const copy = investorLocales as { en: InvestorLocaleBundle; es: InvestorLocaleBundle };

export default copy;
