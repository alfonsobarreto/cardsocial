'use client';

import { PremiumButton } from '@/components/suscripciones/PremiumButton';
import { getCommerceConfigForWeb, type CommerceCreditPackWeb } from '@/lib/commerceConfigWeb';
import { fetchPublicMarketRadarConfig } from '@/lib/publicSystemConfig';
import {
  intlLocaleTagForSuscripcion,
  suscripcionPathForLocale,
  SUSCRIPCION_LOCALES,
  tr,
  type SuscripcionLocale,
} from '@/lib/suscripcionesI18n';
import { getTiersConfigForWeb, type TierKey, type TiersConfig } from '@/lib/tiersConfigWeb';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const reveal = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
};

function fmtUsd(locale: SuscripcionLocale, n: number): string {
  return new Intl.NumberFormat(intlLocaleTagForSuscripcion(locale), {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

function tierTitleKey(k: TierKey): string {
  return `tier.${k}.name`;
}

function tierBlurbKey(k: TierKey): string {
  return `tier.${k}.blurb`;
}

export default function SuscripcionesClient({ locale }: { locale: SuscripcionLocale }) {
  const [tiers, setTiers] = useState<TiersConfig | null>(null);
  const [packs, setPacks] = useState<CommerceCreditPackWeb[]>([]);
  const [radar, setRadar] = useState({ proPriceUsd: 0, proEquivalentCs: 0 });
  const [loading, setLoading] = useState(true);

  const landingHome = locale === 'es' ? '/es' : '/';
  const waitlistHref = locale === 'es' ? '/es#waitlist' : '/#waitlist';

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [ti, co, ra] = await Promise.all([
          getTiersConfigForWeb(),
          getCommerceConfigForWeb(),
          fetchPublicMarketRadarConfig(),
        ]);
        if (!alive) return;
        setTiers(ti);
        setPacks(co.creditPacks);
        setRadar(ra);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const tierKeys: TierKey[] = useMemo(() => ['free', 'influencer', 'business'], []);

  return (
    <div
      className={`${inter.variable} min-h-screen bg-transparent text-white antialiased selection:bg-[#2F7BFF] selection:text-black`}
      style={{ fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
    >
      <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#071226]/80 backdrop-blur-2xl">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3 sm:px-8 lg:px-10">
          <Link
            href={landingHome}
            className="text-xs font-black uppercase tracking-[0.28em] text-white transition hover:text-[#4D8FFF]"
          >
            {tr(locale, 'nav.brand')}
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <span className="hidden text-[10px] font-black uppercase tracking-[0.2em] text-white/40 sm:inline">
              {tr(locale, 'nav.lang')}
            </span>
            {SUSCRIPCION_LOCALES.map((code) => {
              const path = suscripcionPathForLocale(code);
              const active = code === locale;
              return (
                <Link
                  key={code}
                  href={path}
                  className={[
                    'rounded-full px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] transition sm:px-3',
                    active
                      ? 'border border-[#2F7BFF]/50 bg-[#2F7BFF]/15 text-[#4D8FFF]'
                      : 'border border-white/10 bg-white/[0.03] text-white/60 hover:border-[#2F7BFF]/40 hover:text-[#4D8FFF]',
                  ].join(' ')}
                  hrefLang={code}
                >
                  {code}
                </Link>
              );
            })}
            <PremiumButton href="/studio" variant="outline" className="!min-h-11 !px-4 !text-[10px] sm:!px-6">
              {tr(locale, 'hero.ctaPrimary')}
            </PremiumButton>
          </div>
        </div>
      </nav>

      <header className="mx-auto max-w-6xl px-6 pb-16 pt-16 sm:px-8 lg:px-10 lg:pb-24 lg:pt-20">
        <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }}>
          <motion.p variants={reveal} className="text-xs font-black uppercase tracking-[0.32em] text-[#4D8FFF]">
            {tr(locale, 'hero.kicker')}
          </motion.p>
          <motion.h1
            variants={reveal}
            className="mt-6 max-w-5xl bg-gradient-to-b from-white via-[#FFF3C8] to-[#2F7BFF] bg-clip-text text-4xl font-black leading-[1.05] tracking-[-0.05em] text-transparent sm:text-5xl md:text-6xl lg:text-7xl"
          >
            {tr(locale, 'hero.title')}
          </motion.h1>
          <motion.p variants={reveal} className="mt-8 max-w-2xl text-base leading-8 text-white/62 sm:text-lg">
            {tr(locale, 'hero.subtitle')}
          </motion.p>
          <motion.div variants={reveal} className="mt-10 flex flex-wrap gap-4">
            <PremiumButton href="/studio">{tr(locale, 'hero.ctaPrimary')}</PremiumButton>
            <PremiumButton href={waitlistHref} variant="outline">
              {tr(locale, 'hero.ctaSecondary')}
            </PremiumButton>
          </motion.div>
        </motion.div>
      </header>

      <main className="mx-auto max-w-6xl space-y-24 px-6 pb-28 sm:px-8 lg:space-y-32 lg:px-10">
        {loading ? (
          <p className="text-center text-sm font-medium uppercase tracking-[0.2em] text-white/45">{tr(locale, 'loading')}</p>
        ) : (
          <>
            <Section title={tr(locale, 'section.plans')} lead={tr(locale, 'section.plansLead')}>
              {!tiers ? (
                <Empty>{tr(locale, 'labels.emptyTiers')}</Empty>
              ) : (
                <div className="grid gap-6 lg:gap-8">
                  {tierKeys.map((k) => {
                    const row = tiers[k];
                    const featured = k === 'influencer';
                    return (
                      <article
                        key={k}
                        className={[
                          'relative overflow-hidden rounded-[2rem] border p-8 backdrop-blur-2xl transition duration-300 hover:-translate-y-1 lg:p-10',
                          featured
                            ? 'border-[#2F7BFF]/40 bg-[linear-gradient(135deg,rgba(47,123,255,0.12),rgba(17,17,17,0.72)_40%,rgba(5,5,5,0.86))] shadow-[0_0_90px_rgba(47,123,255,0.12)]'
                            : 'border-white/10 bg-[#111111]/68 shadow-[0_30px_90px_rgba(0,0,0,0.42)] hover:border-[#2F7BFF]/35',
                        ].join(' ')}
                      >
                        {featured ? (
                          <span className="absolute right-6 top-6 rounded-full border border-[#2F7BFF]/45 bg-[#2F7BFF]/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#4D8FFF]">
                            Pro
                          </span>
                        ) : null}
                        <p className="text-xs font-black uppercase tracking-[0.26em] text-[#2F7BFF]/90">{k}</p>
                        <h3 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
                          {tr(locale, tierTitleKey(k))}
                        </h3>
                        <p className="mt-4 max-w-prose text-sm leading-7 text-white/58">{tr(locale, tierBlurbKey(k))}</p>

                        <div className="mt-8 space-y-2 border-t border-white/10 pt-8">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                            {tr(locale, 'limits.title')}
                          </p>
                          <ul className="grid gap-2 text-sm text-white/72 sm:grid-cols-2">
                            <li>
                              <span className="text-white/45">{tr(locale, 'limits.iconData')}:</span>{' '}
                              <span className="font-semibold text-white">{row.iconDataLimit}</span>
                            </li>
                            <li>
                              <span className="text-white/45">{tr(locale, 'limits.smartCards')}:</span>{' '}
                              <span className="font-semibold text-white">{row.smartCardsLimit}</span>
                            </li>
                            <li>
                              <span className="text-white/45">{tr(locale, 'limits.businessCards')}:</span>{' '}
                              <span className="font-semibold text-white">{row.businessCardsLimit}</span>
                            </li>
                            <li>
                              <span className="text-white/45">{tr(locale, 'limits.voip')}:</span>{' '}
                              <span className="font-semibold text-white">{row.voipMinutesIncluded}</span>
                            </li>
                            <li>
                              <span className="text-white/45">{tr(locale, 'limits.themes')}:</span>{' '}
                              <span className="font-semibold text-white">
                                {row.premiumThemes ? tr(locale, 'labels.yes') : tr(locale, 'labels.no')}
                              </span>
                            </li>
                            <li>
                              <span className="text-white/45">{tr(locale, 'limits.giftAnnual')}:</span>{' '}
                              <span className="font-semibold text-white">{row.annualWelcomeGiftCs}</span>
                            </li>
                          </ul>
                        </div>

                        {k !== 'free' ? (
                          <div className="mt-8 space-y-3 rounded-2xl border border-white/10 bg-black/30 p-6">
                            <PriceLine
                              label={tr(locale, 'labels.monthly')}
                              usd={row.monthlyPriceUsd}
                              cs={row.monthlyEquivalentCs}
                              locale={locale}
                              suffix=""
                            />
                            <PriceLine
                              label={tr(locale, 'labels.annual')}
                              usd={row.annualPriceUsd}
                              cs={row.annualEquivalentCs}
                              locale={locale}
                              suffix=""
                            />
                            {row.freeTrialDays > 0 ? (
                              <p className="text-xs text-white/48">
                                {tr(locale, 'labels.trial')}:{' '}
                                <span className="font-semibold text-[#4D8FFF]">{row.freeTrialDays}</span>
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </Section>

            {tiers &&
            (tiers.business.annualPriceUsd > 0 || tiers.business.annualEquivalentCs > 0 || tiers.business.annualWelcomeGiftCs > 0) ? (
              <Section title={tr(locale, 'section.business')} lead={tr(locale, 'section.businessLead')}>
                <div className="rounded-[2rem] border border-[#2F7BFF]/35 bg-[#101E34]/85 p-8 shadow-[0_0_80px_rgba(47,123,255,0.12)] lg:p-10">
                  <PriceLine
                    label={tr(locale, 'labels.annual')}
                    usd={tiers.business.annualPriceUsd}
                    cs={tiers.business.annualEquivalentCs}
                    locale={locale}
                    suffix=""
                  />
                  {tiers.business.annualWelcomeGiftCs > 0 ? (
                    <p className="mt-4 text-sm text-white/58">
                      {tr(locale, 'limits.giftAnnual')}:{' '}
                      <span className="font-semibold text-[#4D8FFF]">
                        {tiers.business.annualWelcomeGiftCs.toLocaleString(intlLocaleTagForSuscripcion(locale))}
                      </span>{' '}
                      {tr(locale, 'labels.cs')}
                    </p>
                  ) : null}
                </div>
              </Section>
            ) : null}

            <Section title={tr(locale, 'section.packs')} lead={tr(locale, 'section.packsLead')}>
              {packs.length === 0 ? (
                <Empty>{tr(locale, 'section.packsEmpty')}</Empty>
              ) : (
                <div className="grid gap-4">
                  {packs.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col justify-between gap-4 rounded-[1.6rem] border border-white/10 bg-[#111111]/72 p-6 backdrop-blur-xl sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="font-mono text-xs text-[#4D8FFF]/70">{tr(locale, 'labels.productId')}</p>
                        <p className="mt-1 font-mono text-sm text-white/88">{p.productId}</p>
                        {p.popular ? (
                          <span className="mt-2 inline-block rounded-full border border-[#2F7BFF]/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#4D8FFF]">
                            {tr(locale, 'labels.popular')}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-right sm:min-w-[220px]">
                        <p className="text-lg font-black text-white">{fmtUsd(locale, p.priceUsd)}</p>
                        <p className="mt-1 text-sm text-white/58">
                          {p.equivalentCs.toLocaleString(intlLocaleTagForSuscripcion(locale))} {tr(locale, 'labels.cs')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title={tr(locale, 'section.radar')} lead={tr(locale, 'section.radarLead')}>
              {radar.proPriceUsd <= 0 && radar.proEquivalentCs <= 0 ? (
                <Empty>{tr(locale, 'labels.noPriceRow')}</Empty>
              ) : (
                <div className="rounded-[2rem] border border-white/10 bg-[#111111]/72 p-8 lg:p-10">
                  <p className="text-2xl font-black text-white">{fmtUsd(locale, radar.proPriceUsd)}</p>
                  {radar.proEquivalentCs > 0 ? (
                    <p className="mt-2 text-sm text-white/62">
                      {radar.proEquivalentCs.toLocaleString(intlLocaleTagForSuscripcion(locale))} {tr(locale, 'labels.cs')}
                    </p>
                  ) : null}
                </div>
              )}
            </Section>

            {tiers ? (
              <Section title={tr(locale, 'section.nfc')} lead={tr(locale, 'section.nfcLead')}>
                <div className="grid gap-4 md:grid-cols-2">
                  <NfcCell title={tr(locale, 'nfc.extraSlot')} usd={tiers.addOns.singleBusinessCardExtraUsd} cs={tiers.addOns.singleBusinessCardExtraCs} locale={locale} />
                  <NfcCell title={tr(locale, 'nfc.pvc')} usd={tiers.addOns.physicalPvcCardUsd} cs={tiers.addOns.physicalPvcCardCs} locale={locale} />
                  <NfcCell title={tr(locale, 'nfc.metal')} usd={tiers.addOns.physicalMetalCardUsd} cs={tiers.addOns.physicalMetalCardCs} locale={locale} />
                </div>
                <ul className="mt-6 space-y-3 text-sm text-white/65">
                  <li>
                    <span className="text-white/40">{tr(locale, 'nfc.shipUs')}:</span>{' '}
                    {fmtUsd(locale, tiers.addOns.shippingUsDomesticUsd)} ·{' '}
                    {tiers.addOns.shippingUsDomesticCs.toLocaleString(intlLocaleTagForSuscripcion(locale))}{' '}
                    {tr(locale, 'labels.cs')}
                  </li>
                  <li>
                    <span className="text-white/40">{tr(locale, 'nfc.shipMxCa')}:</span>{' '}
                    {fmtUsd(locale, tiers.addOns.shippingMxCaUsd)} · {tiers.addOns.shippingMxCaCs.toLocaleString(intlLocaleTagForSuscripcion(locale))}{' '}
                    {tr(locale, 'labels.cs')}
                  </li>
                  <li>
                    <span className="text-white/40">{tr(locale, 'nfc.shipIntl')}:</span>{' '}
                    {fmtUsd(locale, tiers.addOns.shippingInternationalUsd)} ·{' '}
                    {tiers.addOns.shippingInternationalCs.toLocaleString(intlLocaleTagForSuscripcion(locale))}{' '}
                    {tr(locale, 'labels.cs')}
                  </li>
                </ul>
              </Section>
            ) : null}
          </>
        )}

        <footer className="border-t border-white/10 pt-16">
          <p className="mx-auto max-w-3xl text-center text-sm leading-7 text-white/48">{tr(locale, 'footer.note')}</p>
        </footer>
      </main>
    </div>
  );
}

function Section({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-black uppercase tracking-[0.28em] text-[#2F7BFF]">{title}</h2>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-white/55">{lead}</p>
      <div className="mt-10">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[1.6rem] border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center text-sm text-white/48">
      {children}
    </div>
  );
}

function PriceLine({
  label,
  usd,
  cs,
  locale,
  suffix,
}: {
  label: string;
  usd: number;
  cs: number;
  locale: SuscripcionLocale;
  suffix: string;
}) {
  if (usd <= 0 && cs <= 0) {
    return (
      <p className="text-sm text-white/45">
        {label}: {tr(locale, 'labels.noPriceRow')}
      </p>
    );
  }
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className="mt-1 text-xl font-black text-white">
        {usd > 0 ? fmtUsd(locale, usd) : '—'}
        {suffix}
      </p>
      {cs > 0 ? (
        <p className="mt-1 text-sm text-white/60">
          {cs.toLocaleString(intlLocaleTagForSuscripcion(locale))} {tr(locale, 'labels.cs')}
        </p>
      ) : null}
    </div>
  );
}

function NfcCell({ title, usd, cs, locale }: { title: string; usd: number; cs: number; locale: SuscripcionLocale }) {
  return (
    <div className="rounded-[1.6rem] border border-white/10 bg-[#111111]/72 p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#4D8FFF]/80">{title}</p>
      <p className="mt-3 text-lg font-black text-white">{fmtUsd(locale, usd)}</p>
      <p className="mt-1 text-sm text-white/55">
        {cs.toLocaleString(intlLocaleTagForSuscripcion(locale))} {tr(locale, 'labels.cs')}
      </p>
    </div>
  );
}
