'use client';

import { motion, type Variants } from 'framer-motion';
import { Inter } from 'next/font/google';
import { Suspense, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { AuthEmailActionBanner } from './AuthEmailActionBanner';
import { getLandingCopy, type LandingLocale } from '@/lib/landingI18n';

export type { LandingLocale };
type InterestKey = 'personal' | 'business' | 'investor';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const reveal: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.72, ease: [0.22, 1, 0.36, 1] } },
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.22 }} className={className}>
      {children}
    </motion.div>
  );
}

function useSpanishAutoRedirect(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    if (window.location.pathname !== '/') return;
    if (window.localStorage.getItem('card-social-locale-choice')) return;
    const languages = Array.from(navigator.languages?.length ? navigator.languages : [navigator.language || '']);
    if (languages.some((lang) => String(lang).toLowerCase().startsWith('es'))) {
      window.location.replace('/es');
    }
  }, [enabled]);
}

function rememberLocaleChoice(locale: LandingLocale) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('card-social-locale-choice', locale);
}

function WaitlistForm({ locale }: { locale: LandingLocale }) {
  const c = getLandingCopy(locale);
  const [countryCode, setCountryCode] = useState(locale === 'es' ? '+1' : '+1');
  const [interest, setInterest] = useState<InterestKey | ''>('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  const interestOptions = useMemo(
    () =>
      (Object.entries(c.interests) as Array<[InterestKey, string]>).map(([value, label]) => ({
        value,
        label,
      })),
    [c.interests],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('sending');

    const form = new FormData(event.currentTarget);
    const phoneNational = String(form.get('phoneNational') || '').trim();
    const selectedInterest = String(form.get('interest') || '') as InterestKey;

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale,
          fullName: String(form.get('fullName') || '').trim(),
          email: String(form.get('email') || '')
            .trim()
            .toLowerCase(),
          phoneCountryCode: countryCode,
          phoneNational,
          phoneE164: `${countryCode}${phoneNational.replace(/\D/g, '')}`,
          interest: selectedInterest,
          interestLabel: c.interests[selectedInterest],
          pagePath: typeof window !== 'undefined' ? window.location.pathname : locale === 'es' ? '/es' : '/',
          company: String(form.get('company') || ''),
        }),
      });
      if (!res.ok) throw new Error('waitlist_failed');
      setStatus('success');
      event.currentTarget.reset();
      setInterest('');
    } catch {
      setStatus('error');
    }
  }

  return (
    <form className="grid gap-4" aria-label={c.waitlistFormAriaLabel} onSubmit={onSubmit}>
      <input name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <label className="grid gap-2">
        <span className="text-xs font-black uppercase tracking-[0.2em] text-white/55">{c.fullName}</span>
        <input
          type="text"
          name="fullName"
          required
          className="min-h-14 rounded-2xl border border-white/10 bg-[#050505]/70 px-5 text-white outline-none transition placeholder:text-white/28 focus:border-[#E9C349]/70 focus:ring-4 focus:ring-[#E9C349]/10"
          placeholder={c.fullName}
        />
      </label>
      <label className="grid gap-2">
        <span className="text-xs font-black uppercase tracking-[0.2em] text-white/55">{c.email}</span>
        <input
          type="email"
          name="email"
          required
          className="min-h-14 rounded-2xl border border-white/10 bg-[#050505]/70 px-5 text-white outline-none transition placeholder:text-white/28 focus:border-[#E9C349]/70 focus:ring-4 focus:ring-[#E9C349]/10"
          placeholder={c.email}
        />
      </label>
      <label className="grid gap-2">
        <span className="text-xs font-black uppercase tracking-[0.2em] text-white/55">{c.phone}</span>
        <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
          <select
            name="phoneCountryCode"
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value)}
            className="min-h-14 rounded-2xl border border-white/10 bg-[#050505]/70 px-4 text-white outline-none transition focus:border-[#E9C349]/70 focus:ring-4 focus:ring-[#E9C349]/10"
          >
            {c.countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.label}
              </option>
            ))}
          </select>
          <input
            type="tel"
            name="phoneNational"
            required
            className="min-h-14 rounded-2xl border border-white/10 bg-[#050505]/70 px-5 text-white outline-none transition placeholder:text-white/28 focus:border-[#E9C349]/70 focus:ring-4 focus:ring-[#E9C349]/10"
            placeholder={c.phone}
          />
        </div>
      </label>
      <label className="grid gap-2">
        <span className="text-xs font-black uppercase tracking-[0.2em] text-white/55">{c.interest}</span>
        <select
          name="interest"
          value={interest}
          required
          onChange={(event) => setInterest(event.target.value as InterestKey)}
          className="min-h-14 rounded-2xl border border-white/10 bg-[#050505]/70 px-5 text-white outline-none transition focus:border-[#E9C349]/70 focus:ring-4 focus:ring-[#E9C349]/10"
        >
          <option value="" disabled>
            {c.interest}
          </option>
          {interestOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={status === 'sending'}
        className="mt-3 min-h-14 w-full rounded-2xl bg-gradient-to-r from-[#F6DA87] via-[#E9C349] to-[#A87B1F] px-6 text-sm font-black uppercase tracking-[0.16em] text-black shadow-[0_0_44px_rgba(233,195,73,0.32)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_60px_rgba(233,195,73,0.48)] focus:outline-none focus:ring-2 focus:ring-[#F6DA87] focus:ring-offset-2 focus:ring-offset-[#050505] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'sending' ? c.sending : c.submit}
      </button>
      {status === 'success' ? <p className="text-center text-sm font-bold text-[#F6DA87]">{c.success}</p> : null}
      {status === 'error' ? <p className="text-center text-sm font-bold text-red-200">{c.error}</p> : null}
    </form>
  );
}

export default function LuxWaitlistLanding({
  locale = 'en',
  autoDetectLocale = false,
}: {
  locale?: LandingLocale;
  autoDetectLocale?: boolean;
}) {
  const c = getLandingCopy(locale);
  useSpanishAutoRedirect(autoDetectLocale);

  return (
    <div
      className={`${inter.variable} min-h-screen overflow-hidden bg-[#050505] text-white antialiased selection:bg-[#E9C349] selection:text-black`}
      style={{ fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
    >
      <main className="relative">
        <Suspense fallback={null}>
          <AuthEmailActionBanner locale={locale} />
        </Suspense>
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_0%,rgba(233,195,73,0.16),transparent_30%),radial-gradient(circle_at_84%_10%,rgba(246,218,135,0.10),transparent_28%),linear-gradient(180deg,#050505_0%,#0A0A0A_46%,#050505_100%)]" />
        <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:72px_72px]" />

        <nav className="fixed left-0 right-0 top-0 z-40 border-b border-white/10 bg-[#050505]/72 backdrop-blur-2xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-8 lg:px-10">
            <a href={c.homeHref} className="text-sm font-black uppercase tracking-[0.28em] text-white">
              {c.brandName}
            </a>
            <div className="flex items-center gap-3">
              <a href="#waitlist" className="hidden rounded-full border border-[#E9C349]/35 bg-[#E9C349]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#F6DA87] sm:inline-flex">
                {c.navCta}
              </a>
              <a
                href={c.switchHref}
                onClick={() => rememberLocaleChoice(c.switchHref === '/es' ? 'es' : 'en')}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white/72 transition hover:border-[#E9C349]/45 hover:text-[#F6DA87]"
              >
                {c.switchTo}
              </a>
            </div>
          </div>
        </nav>

        <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col items-center justify-center px-6 pb-24 pt-32 text-center sm:px-8 lg:px-10">
          <Reveal>
            <p className="text-xs font-black uppercase tracking-[0.34em] text-[#F6DA87] drop-shadow-[0_0_18px_rgba(233,195,73,0.34)] sm:text-sm">
              {c.heroPretitle}
            </p>
            <h1 className="mx-auto mt-5 max-w-6xl bg-gradient-to-b from-white via-[#FFF3C8] to-[#E9C349] bg-clip-text text-5xl font-black leading-[0.95] tracking-[-0.065em] text-transparent sm:text-6xl md:text-7xl lg:text-8xl">
              {c.heroTitle}
            </h1>
            <p className="mx-auto mt-8 max-w-3xl text-base leading-8 text-white/64 sm:text-lg">{c.heroSubtitle}</p>
            <div className="mt-10">
              <a
                href="#waitlist"
                className="inline-flex min-h-14 items-center justify-center rounded-full bg-gradient-to-r from-[#F6DA87] via-[#E9C349] to-[#A87B1F] px-8 text-sm font-black uppercase tracking-[0.14em] text-black shadow-[0_0_34px_rgba(233,195,73,0.34)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_54px_rgba(233,195,73,0.54)] focus:outline-none focus:ring-2 focus:ring-[#F6DA87] focus:ring-offset-2 focus:ring-offset-[#050505]"
              >
                {c.heroButton}
              </a>
            </div>
          </Reveal>

          <Reveal className="mt-16 w-full max-w-6xl">
            {/* Video Player Placeholder: App walkthrough video container */}
            <div className="relative aspect-video overflow-hidden rounded-[2rem] border border-[#E9C349]/35 bg-[#111111]/70 shadow-[0_0_80px_rgba(233,195,73,0.16),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(233,195,73,0.18),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_36%)]" />
              <iframe
                className="absolute inset-0 h-full w-full"
                src="https://www.youtube-nocookie.com/embed/JHe60TQuCGc?start=26&rel=0&modestbranding=1"
                title={c.walkthroughIframeTitle}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </Reveal>
        </section>

        <section className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-24 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
          <Reveal className="flex flex-col justify-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#E9C349]">{c.vaultKicker}</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">{c.vaultTitle}</h2>
            <p className="mt-6 text-base leading-8 text-white/62">{c.vaultText}</p>
          </Reveal>

          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.18 }} className="grid gap-4 sm:grid-cols-2">
            {c.iconoDatas.map(([title, text, icon], index) => (
              <motion.article
                key={title}
                variants={reveal}
                className={`rounded-[1.6rem] border border-white/10 bg-[#111111]/72 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-[#E9C349]/45 ${
                  index === 4 ? 'sm:col-span-2' : ''
                }`}
              >
                <div className="mb-5 grid h-12 min-w-12 place-items-center rounded-2xl border border-[#E9C349]/30 bg-[#E9C349]/10 px-3 text-xs font-black text-[#F6DA87] shadow-[0_0_28px_rgba(233,195,73,0.14)]">
                  {icon}
                </div>
                <h3 className="text-xl font-black tracking-[-0.04em] text-white">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/62">{text}</p>
              </motion.article>
            ))}
          </motion.div>
        </section>

        <section className="relative mx-auto w-full max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
          <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#E9C349]/10 blur-3xl" />
          <Reveal>
            <div className="relative overflow-hidden rounded-[2.4rem] border border-[#E9C349]/30 bg-[#0A0A0A]/82 p-6 shadow-[0_0_110px_rgba(233,195,73,0.16),0_34px_120px_rgba(0,0,0,0.58)] backdrop-blur-2xl sm:p-10 lg:p-12">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(233,195,73,0.18),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.07),transparent_34%)]" />
              <div className="relative grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-[#E9C349]">{c.privateCallKicker}</p>
                  <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">{c.privateCallTitle}</h2>
                  <p className="mt-6 text-base leading-8 text-white/62">{c.privateCallText}</p>
                </div>

                <div className="mx-auto w-full max-w-sm">
                  <div className="relative rounded-[2.6rem] border border-white/15 bg-[#050505] p-4 shadow-[0_0_90px_rgba(233,195,73,0.18),0_26px_90px_rgba(0,0,0,0.66)]">
                    <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,#111111,#050505)] p-6">
                      <div className="mx-auto mb-8 h-1.5 w-20 rounded-full bg-white/12" />
                      <div className="text-center">
                        <p className="text-xs font-black uppercase tracking-[0.26em] text-[#F6DA87]">{c.privateCallKicker}</p>
                        <div className="mx-auto mt-8 grid h-28 w-28 place-items-center rounded-full border border-[#E9C349]/45 bg-[#E9C349]/12 text-4xl shadow-[0_0_52px_rgba(233,195,73,0.26)]">
                          {c.phoneMockInitials}
                        </div>
                        <h3 className="mt-7 text-2xl font-black tracking-[-0.04em] text-white">{c.incomingClient}</h3>
                        <p className="mt-2 text-sm text-white/44">{c.protectedNumber}</p>
                      </div>
                      <div className="mt-12 grid grid-cols-2 gap-4">
                        <button type="button" className="min-h-14 rounded-2xl border border-red-400/20 bg-red-500/12 text-sm font-black uppercase tracking-[0.16em] text-red-200">
                          {c.decline}
                        </button>
                        <button type="button" className="min-h-14 rounded-2xl border border-[#E9C349]/35 bg-[#E9C349]/18 text-sm font-black uppercase tracking-[0.16em] text-[#F6DA87] shadow-[0_0_28px_rgba(233,195,73,0.18)]">
                          {c.answer}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#E9C349]">{c.architectureKicker}</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">{c.architectureTitle}</h2>
          </Reveal>

          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.18 }} className="mt-12 grid gap-5 lg:grid-cols-3">
            {c.cardArchitecture.map(([title, text, badge], index) => (
              <motion.article
                key={title}
                variants={reveal}
                className={`h-full rounded-[2rem] border p-7 backdrop-blur-2xl transition duration-300 hover:-translate-y-1 ${
                  index === 2
                    ? 'border-[#E9C349]/40 bg-[linear-gradient(135deg,rgba(233,195,73,0.13),rgba(17,17,17,0.76)_42%,rgba(5,5,5,0.82))] shadow-[0_0_90px_rgba(233,195,73,0.14),0_30px_90px_rgba(0,0,0,0.42)]'
                    : 'border-white/10 bg-[#111111]/72 shadow-[0_30px_90px_rgba(0,0,0,0.42)] hover:border-[#E9C349]/40'
                }`}
              >
                <div className="mb-8 flex items-center justify-between gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E9C349]/35 bg-[#E9C349]/10 text-[#F6DA87] shadow-[0_0_32px_rgba(233,195,73,0.16)]">
                    0{index + 1}
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#F6DA87]">
                    {badge}
                  </span>
                </div>
                <h3 className="text-2xl font-black tracking-[-0.045em] text-white">{title}</h3>
                <p className="mt-5 text-sm leading-7 text-white/62">{text}</p>
              </motion.article>
            ))}
          </motion.div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-6 py-24 text-center sm:px-8 lg:px-10">
          <Reveal>
            <div className="mx-auto mb-8 grid h-16 w-16 place-items-center rounded-full border border-[#E9C349]/40 bg-[#E9C349]/12 text-lg font-black text-[#F6DA87] shadow-[0_0_42px_rgba(233,195,73,0.24)]">
              {c.privacySectionBadge}
            </div>
            <h2 className="text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">{c.privacyTitle}</h2>
            <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-white/62">{c.privacyText}</p>
          </Reveal>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
          <Reveal className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#E9C349]">{c.marketKicker}</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">{c.marketTitle}</h2>
            <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-white/62">{c.marketText}</p>
          </Reveal>

          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.18 }} className="mt-12 grid gap-5 lg:grid-cols-2">
            {c.useCases.map(([title, text, badge], index) => (
              <motion.article
                key={title}
                variants={reveal}
                className={`relative overflow-hidden rounded-[2.2rem] border p-7 shadow-[0_30px_100px_rgba(0,0,0,0.46)] backdrop-blur-2xl sm:p-8 ${
                  index === 0
                    ? 'border-[#E9C349]/35 bg-[linear-gradient(135deg,rgba(233,195,73,0.14),rgba(17,17,17,0.78)_46%,rgba(5,5,5,0.86))]'
                    : 'border-white/10 bg-[#111111]/72'
                }`}
              >
                <div className="pointer-events-none absolute right-[-5rem] top-[-5rem] h-56 w-56 rounded-full bg-[#E9C349]/10 blur-3xl" />
                <div className="relative">
                  <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E9C349]/35 bg-[#E9C349]/10 text-[#F6DA87] shadow-[0_0_32px_rgba(233,195,73,0.16)]">
                    {badge}
                  </div>
                  <h3 className="text-2xl font-black tracking-[-0.045em] text-white">{title}</h3>
                  <p className="mt-5 text-sm leading-7 text-white/62">{text}</p>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#E9C349]">{c.tiersKicker}</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">{c.tiersTitle}</h2>
          </Reveal>

          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.18 }} className="mt-12 grid gap-5 md:grid-cols-3">
            {c.tiers.map(([name, text], index) => (
              <motion.article
                key={name}
                variants={reveal}
                className={`rounded-[2rem] border p-7 backdrop-blur-2xl ${
                  index === 2
                    ? 'border-[#E9C349]/40 bg-[#17130B]/80 shadow-[0_0_80px_rgba(233,195,73,0.16)]'
                    : 'border-white/10 bg-[#111111]/72 shadow-[0_24px_80px_rgba(0,0,0,0.34)]'
                }`}
              >
                <p className="text-xs font-black uppercase tracking-[0.28em] text-[#F6DA87]">
                  {c.tierLabelPrefix} {index + 1}
                </p>
                <h3 className="mt-5 text-3xl font-black tracking-[-0.055em] text-white">{name}.</h3>
                <p className="mt-5 text-sm leading-7 text-white/62">{text}</p>
              </motion.article>
            ))}
          </motion.div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2.4rem] border border-[#E9C349]/30 bg-[#0A0A0A]/82 p-6 shadow-[0_0_100px_rgba(233,195,73,0.12),0_34px_120px_rgba(0,0,0,0.58)] backdrop-blur-2xl sm:p-10 lg:p-12">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(233,195,73,0.20),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.07),transparent_30%)]" />
              <div className="relative grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-[#E9C349]">{c.dashboardKicker}</p>
                  <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">{c.dashboardTitle}</h2>
                  <p className="mt-6 text-base leading-8 text-white/62">{c.dashboardText}</p>
                </div>
                <aside className="rounded-[2rem] border border-[#E9C349]/45 bg-[#E9C349]/10 p-7 shadow-[0_0_70px_rgba(233,195,73,0.18)] backdrop-blur-2xl">
                  <p className="text-sm leading-7 text-white/74">
                    <strong className="block text-lg font-black tracking-[-0.03em] text-[#F6DA87]">{c.radarTitle}</strong>
                    {c.radarText}
                  </p>
                </aside>
              </div>
            </div>
          </Reveal>
        </section>

        <section id="waitlist" className="mx-auto w-full max-w-4xl px-6 py-24 sm:px-8 lg:px-10">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2.25rem] border border-[#E9C349]/35 bg-[#111111]/76 p-6 shadow-[0_0_90px_rgba(233,195,73,0.18),0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-10">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(246,218,135,0.18),transparent_34%)]" />
              <div className="relative">
                <div className="mx-auto mb-9 max-w-2xl text-center">
                  <p className="text-xs font-black uppercase tracking-[0.34em] text-[#F6DA87]">{c.formKicker}</p>
                  <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">{c.formTitle}</h2>
                  <p className="mt-5 text-base leading-8 text-white/64">{c.formSubtitle}</p>
                </div>
                <WaitlistForm locale={locale} />
              </div>
            </div>
          </Reveal>
        </section>
      </main>
    </div>
  );
}
