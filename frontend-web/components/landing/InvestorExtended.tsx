'use client';

import { motion, type Variants } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';

import copy, { type ExecLocale } from './investorCopy';
import { investorDemoHref, investorPitchDeckHref, pitchDeckOpensInNewTab } from './investorUrls';

/* ─── tokens ──────────────────────────────────────────────────── */
const G = '#E9C349';
const GL = '#F6DA87';
const GD = '#A87B1F';

const rv: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};
const st: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const STREAM_COLORS = [G, '#7DD3FC', '#C084FC', '#86EFAC'] as const;

function Rev({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={rv} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} className={className}>
      {children}
    </motion.div>
  );
}

function SL({ letter, eyebrow, title }: { letter: string; eyebrow: string; title: string }) {
  return (
    <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-10">
      <div className="flex h-[4.75rem] w-[4.75rem] shrink-0 items-center justify-center rounded-3xl border-2 border-[#E9C349]/55 bg-gradient-to-br from-[#E9C349]/22 to-transparent text-2xl font-black text-[#F6DA87] shadow-[0_0_40px_rgba(233,195,73,0.22)]">
        {letter}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.32em] text-[#E9C349]">{eyebrow}</p>
        <h2 className="mt-3 text-[clamp(1.75rem,4vw,2.85rem)] font-black tracking-[-0.055em] text-white">{title}</h2>
      </div>
    </div>
  );
}

function Ticker({ target, prefix = '', suffix = '' }: { target: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        let start: number | null = null;
        const tick = (ts: number) => {
          if (!start) start = ts;
          const p = Math.min((ts - start) / 1400, 1);
          const e = 1 - Math.pow(1 - p, 3);
          if (el) el.textContent = `${prefix}${Math.round(e * target).toLocaleString('en-US')}${suffix}`;
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, prefix, suffix]);
  return <span ref={ref}>{prefix}0{suffix}</span>;
}

/* ═══════════════════════════════════════════════════════════════ *
 *  F — COMPETITIVE ANALYSIS                                       *
 * ═══════════════════════════════════════════════════════════════ */
export function CompetitiveAnalysis({ locale }: { locale: ExecLocale }) {
  const c = copy[locale];
  return (
    <Rev>
      <section id="inv-competitive" className="scroll-mt-36">
        <SL letter="F" eyebrow={c.compEyebrow} title={c.compTitle} />
        <p className="mb-10 max-w-3xl border-l-[3px] border-[#E9C349] pl-7 text-base font-semibold leading-8 text-white/68">
          {c.compQuote}
        </p>

        {/* Desktop table */}
        <div className="hidden overflow-hidden rounded-[1.85rem] border border-white/[0.08] bg-[#080808]/92 shadow-[0_30px_90px_rgba(0,0,0,0.5)] backdrop-blur-2xl lg:block">
          <div className="grid grid-cols-[9rem_1fr_1fr_1fr] gap-px border-b border-white/[0.07] bg-white/[0.04]">
            {[c.compColCompetitor, c.compColWeapon, c.compColDestroyer, c.compColAngle].map((h, i) => (
              <div key={h} className={`px-6 py-4 text-[9px] font-black uppercase tracking-[0.28em] ${i === 2 ? 'text-[#E9C349]/70' : 'text-white/28'}`}>{h}</div>
            ))}
          </div>
          <motion.div variants={st} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.05 }} className="divide-y divide-white/[0.05]">
            {c.competitors.map((comp) => (
              <motion.div key={comp.name} variants={rv} className="group grid grid-cols-[9rem_1fr_1fr_1fr] gap-px transition-colors duration-200 hover:bg-[#E9C349]/[0.035]">
                <div className="flex flex-col justify-center gap-2 px-6 py-6">
                  <p className="text-base font-black text-white/80 group-hover:text-white">{comp.name}</p>
                  <span className="w-fit rounded-full border border-white/10 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white/30">{comp.chip}</span>
                </div>
                <div className="px-6 py-6"><p className="text-xs leading-6 text-white/40">{comp.weapon}</p></div>
                <div className="border-l border-[#E9C349]/15 bg-[#E9C349]/[0.025] px-6 py-6 group-hover:bg-[#E9C349]/[0.05]">
                  <p className="text-xs leading-6 text-white/65">{comp.destroyer}</p>
                </div>
                <div className="px-6 py-6"><p className="text-xs font-semibold italic leading-6 text-[#F6DA87]/75">&ldquo;{comp.angle}&rdquo;</p></div>
              </motion.div>
            ))}
          </motion.div>
          <div className="border-t border-[#E9C349]/18 bg-[#E9C349]/[0.04] px-7 py-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#F6DA87]/55">{c.compFooter}</p>
          </div>
        </div>

        {/* Mobile cards */}
        <motion.div variants={st} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid gap-5 lg:hidden">
          {c.competitors.map((comp) => (
            <motion.article key={comp.name} variants={rv} className="overflow-hidden rounded-[1.85rem] border border-white/[0.09] bg-[#0d0d0d]/85 backdrop-blur-2xl">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
                <div className="flex items-center gap-3">
                  <p className="font-black text-white">{comp.name}</p>
                  <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white/30">{comp.chip}</span>
                </div>
              </div>
              <div className="divide-y divide-white/[0.06]">
                <div className="px-6 py-5">
                  <p className="mb-2 text-[9px] font-black uppercase tracking-[0.26em] text-white/28">{c.compWeaponLabel}</p>
                  <p className="text-xs leading-6 text-white/45">{comp.weapon}</p>
                </div>
                <div className="bg-[#E9C349]/[0.04] px-6 py-5">
                  <p className="mb-2 text-[9px] font-black uppercase tracking-[0.26em] text-[#E9C349]/70">{c.compDestroyerLabel}</p>
                  <p className="text-xs leading-6 text-white/65">{comp.destroyer}</p>
                </div>
                <div className="px-6 py-5">
                  <p className="mb-2 text-[9px] font-black uppercase tracking-[0.26em] text-white/28">{c.compAngleLabel}</p>
                  <p className="text-xs font-semibold italic leading-6 text-[#F6DA87]/75">&ldquo;{comp.angle}&rdquo;</p>
                </div>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </section>
    </Rev>
  );
}

/* ═══════════════════════════════════════════════════════════════ *
 *  G — MARKET SIZING                                             *
 * ═══════════════════════════════════════════════════════════════ */
const MKT_COLORS = ['#334155', GD, G] as const;

export function MarketSizing({ locale }: { locale: ExecLocale }) {
  const c = copy[locale];
  return (
    <Rev>
      <section id="inv-market" className="scroll-mt-36">
        <SL letter="G" eyebrow={c.mktEyebrow} title={c.mktTitle} />

        <div className="grid gap-5 lg:grid-cols-3">
          {c.mktMarkets.map((m, i) => {
            const color = MKT_COLORS[i];
            return (
              <motion.article
                key={m.label}
                variants={rv}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                style={{ '--m-color': color } as React.CSSProperties}
                className="relative overflow-hidden rounded-[1.85rem] border border-white/[0.09] bg-[#0a0a0a]/88 p-8 backdrop-blur-2xl transition duration-300 hover:border-[var(--m-color)]/45"
              >
                <div className="mb-6 flex gap-3">
                  {Array.from({ length: 3 }).map((_, ri) => (
                    <div key={ri} style={{ background: ri < 3 - i ? color : 'transparent', borderColor: color + '66' }} className="h-3 w-3 rounded-full border" />
                  ))}
                </div>
                <p style={{ color }} className="font-mono text-xs font-black uppercase tracking-[0.34em]">{m.label}</p>
                <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">{m.value}</p>
                <p className="mt-1 text-[11px] font-bold text-white/35">{m.name}</p>
                <div className="my-6 h-px bg-white/[0.07]" />
                <p style={{ color: i === 2 ? GL : 'rgba(255,255,255,0.6)' }} className="text-sm leading-7">{m.sub}</p>
                <ul className="mt-5 grid gap-2">
                  {m.sources.map((s) => (
                    <li key={s} className="flex gap-2 text-[11px] leading-5 text-white/35">
                      <span style={{ color }} className="mt-[3px] shrink-0 text-[8px]">◆</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </motion.article>
            );
          })}
        </div>

        <div className="mt-10 overflow-hidden rounded-[1.5rem] border border-white/[0.07] bg-[#080808]/80 p-6">
          <p className="mb-5 text-[9px] font-black uppercase tracking-[0.3em] text-white/28">{c.mktFunnelLabel}</p>
          <div className="grid gap-3">
            {[
              { label: 'TAM', pct: 100, value: '$243B', color: '#334155' },
              { label: 'SAM', pct: 7.6, value: '$18.4B', color: GD },
              { label: locale === 'es' ? 'SOM (meta año 3)' : 'SOM (Y3 target)', pct: 0.17, value: '$420M', color: G },
            ].map((bar) => (
              <div key={bar.label} className="flex items-center gap-5">
                <span className="w-32 shrink-0 font-mono text-[11px] text-white/45">{bar.label}</span>
                <div className="relative flex-1 overflow-hidden rounded-full bg-white/[0.05]" style={{ height: '10px' }}>
                  <motion.div
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    style={{ originX: 0, width: `${Math.max(bar.pct, 0.4)}%`, background: bar.color, minWidth: '2rem' }}
                    className="h-full rounded-full"
                  />
                </div>
                <span className="w-16 shrink-0 text-right font-mono text-xs font-bold" style={{ color: bar.color }}>{bar.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Rev>
  );
}

/* ═══════════════════════════════════════════════════════════════ *
 *  H — FINANCIAL PROJECTIONS                                     *
 * ═══════════════════════════════════════════════════════════════ */
const PROJ_DATA = [
  { users: '8,500',   mrr: '$42K',   arr: '$504K',  nfc: '$85K',   studio: '$18K',  radar: '$6K',   enterprise: '$0',    highlight: false },
  { users: '42,000',  mrr: '$210K',  arr: '$2.52M', nfc: '$320K',  studio: '$140K', radar: '$95K',  enterprise: '$180K', highlight: false },
  { users: '185,000', mrr: '$925K',  arr: '$11.1M', nfc: '$1.1M',  studio: '$780K', radar: '$640K', enterprise: '$2.4M', highlight: true  },
];

export function FinancialProjections({ locale }: { locale: ExecLocale }) {
  const c = copy[locale];
  return (
    <Rev>
      <section id="inv-projections" className="scroll-mt-36">
        <SL letter="H" eyebrow={c.projEyebrow} title={c.projTitle} />
        <p className="mb-12 max-w-2xl text-sm leading-7 text-white/42">{c.projIntro}</p>

        <div className="grid gap-5 lg:grid-cols-3">
          {PROJ_DATA.map((d, i) => {
            const yr = c.projYears[i];
            return (
              <motion.article
                key={yr.year}
                variants={rv}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className={`relative overflow-hidden rounded-[1.85rem] border p-8 backdrop-blur-2xl ${
                  d.highlight
                    ? 'border-[#E9C349]/45 bg-[linear-gradient(145deg,rgba(233,195,73,0.13),rgba(10,10,10,0.92)_55%)] shadow-[0_0_90px_rgba(233,195,73,0.13)]'
                    : 'border-white/[0.08] bg-[#0e0e0e]/80'
                }`}
              >
                {d.highlight && (
                  <div className="absolute right-6 top-6 rounded-full border border-[#E9C349]/50 bg-[#E9C349]/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.3em] text-[#F6DA87]">
                    {c.projTargetBadge}
                  </div>
                )}
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#E9C349]/75">{yr.tag}</p>
                <p className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">{yr.year}</p>
                <div className="my-7 grid grid-cols-2 gap-3">
                  {[
                    { label: c.projLabelUsers, val: d.users },
                    { label: c.projLabelMrr, val: d.mrr },
                    { label: c.projLabelArr, val: d.arr },
                  ].map((stat) => (
                    <div key={stat.label} className={`rounded-2xl border px-4 py-4 ${d.highlight ? 'border-[#E9C349]/22 bg-[#E9C349]/06' : 'border-white/[0.07] bg-white/[0.02]'}`}>
                      <p className="text-[9px] uppercase tracking-[0.22em] text-white/30">{stat.label}</p>
                      <p className={`mt-1.5 font-mono text-xl font-black ${d.highlight ? 'text-[#F6DA87]' : 'text-white'}`}>{stat.val}</p>
                    </div>
                  ))}
                </div>
                <div className="h-px bg-white/[0.07]" />
                <div className="mt-6 grid gap-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.24em] text-white/28">{c.projLabelMix}</p>
                  {[
                    [c.projLabelNfc, d.nfc],
                    [c.projLabelStudio, d.studio],
                    [c.projLabelRadar, d.radar],
                    [c.projLabelEnt, d.enterprise],
                  ].map(([label, val]) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-xs text-white/38">{label}</span>
                      <span className={`font-mono text-xs font-bold ${d.highlight ? 'text-[#F6DA87]/80' : 'text-white/55'}`}>{val}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-[11px] leading-5 text-white/38">{yr.note}</p>
                </div>
              </motion.article>
            );
          })}
        </div>

        <div className="mt-10 overflow-hidden rounded-[1.5rem] border border-white/[0.07] bg-[#080808]/80 p-7">
          <p className="mb-8 text-[9px] font-black uppercase tracking-[0.3em] text-white/28">{c.projBarLabel}</p>
          <div className="flex items-end gap-6" style={{ height: '120px' }}>
            {[504_000, 2_520_000, 11_100_000].map((arr, idx) => (
              <div key={idx} className="flex flex-1 flex-col items-center gap-3">
                <p className="font-mono text-[10px] text-[#F6DA87]/60">${(arr / 1_000_000).toFixed(1)}M</p>
                <div className="relative w-full overflow-hidden rounded-t-xl bg-white/[0.05]" style={{ height: '90px' }}>
                  <motion.div
                    initial={{ scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: idx * 0.1 }}
                    style={{
                      originY: 1,
                      height: `${(arr / 11_100_000) * 100}%`,
                      background: arr === 11_100_000 ? `linear-gradient(180deg, ${GL}, ${G})` : `linear-gradient(180deg,rgba(233,195,73,0.5),rgba(168,123,31,0.5))`,
                    }}
                    className="absolute bottom-0 left-0 right-0 rounded-t-xl"
                  />
                </div>
                <p className="font-mono text-xs font-black text-white/45">{c.projYears[idx].year.replace('Year ', 'Y').replace('Año ', 'A')}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Rev>
  );
}

/* ═══════════════════════════════════════════════════════════════ *
 *  I — TEAM                                                       *
 * ═══════════════════════════════════════════════════════════════ */
export function TeamFounders({ locale }: { locale: ExecLocale }) {
  const c = copy[locale];
  const bios = c.teamBios;
  return (
    <Rev>
      <section id="inv-team" className="scroll-mt-36">
        <SL letter="I" eyebrow={c.teamEyebrow} title={c.teamTitle} />
        <p className="mb-10 max-w-2xl text-[11px] leading-6 text-white/28">
          <span className="font-mono text-white/38">public/legal/executive-summary/</span>{' '}
          — {locale === 'es' ? 'fotos opcionales por miembro (team-[nombre].webp).' : 'optional headshots per member (team-[name].webp).'}
        </p>
        <motion.div variants={st} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {c.teamMembers.map((m, i) => (
            <motion.article key={m.initials} variants={rv} className="group relative overflow-hidden rounded-[1.85rem] border border-white/[0.09] bg-[#0d0d0d]/85 p-7 backdrop-blur-2xl transition duration-300 hover:border-[#E9C349]/35">
              <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[#E9C349]/05 blur-3xl" />
              <div className="relative">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[1.5rem] border-2 border-[#E9C349]/35 bg-gradient-to-br from-[#E9C349]/20 to-transparent text-2xl font-black text-[#F6DA87] shadow-[0_0_32px_rgba(233,195,73,0.18)]">
                  {m.initials}
                </div>
                <p className="text-xl font-black tracking-tight text-white">{m.name}</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#E9C349]/75">{m.role}</p>
                <p className="mt-5 text-sm leading-7 text-white/62">{bios[i] ?? ''}</p>
                <div className="mt-7 flex flex-wrap gap-2">
                  {m.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35 group-hover:border-[#E9C349]/25 group-hover:text-[#F6DA87]/55">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </section>
    </Rev>
  );
}

/* ═══════════════════════════════════════════════════════════════ *
 *  J — TRACTION                                                   *
 * ═══════════════════════════════════════════════════════════════ */

/** ⚠️  UPDATE THESE with real numbers before sending to investors */
const TRACTION_VALUES = [0, 0, 0, 0];
const TRACTION_SUFFIXES = ['+', '', '', ''];

export function TractionSlide({ locale }: { locale: ExecLocale }) {
  const c = copy[locale];
  return (
    <Rev>
      <section id="inv-traction" className="scroll-mt-36">
        <SL letter="J" eyebrow={c.tracEyebrow} title={c.tracTitle} />
        <motion.div
          variants={rv}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-12 grid gap-6 overflow-hidden rounded-[1.85rem] border border-emerald-500/25 bg-[linear-gradient(115deg,rgba(16,185,129,0.14),rgba(10,10,10,0.95))] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:gap-10 lg:p-10"
        >
          <div>
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.34em] text-emerald-300/85">{c.tracLoiEyebrow}</p>
            <h3 className="mt-4 text-2xl font-black tracking-[-0.04em] text-white">{c.tracLoiTitle}</h3>
          </div>
          <p className="text-sm leading-8 text-white/62">{c.tracLoiBody}</p>
        </motion.div>
        <div className="mb-10 rounded-[1.5rem] border border-[#E9C349]/25 bg-[#E9C349]/05 px-7 py-5">
          <p className="text-xs leading-6 text-[#F6DA87]/70">
            <strong className="font-black">{locale === 'es' ? 'Para completar:' : 'To complete:'}</strong>{' '}
            {c.tracUpdateNote.replace('Para completar: ', '').replace('To complete: ', '')}
          </p>
        </div>

        <motion.div variants={st} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mb-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {c.tracStats.map((s, i) => (
            <motion.div
              key={s.label}
              variants={rv}
              className={`group relative overflow-hidden rounded-[1.85rem] border p-8 backdrop-blur-2xl transition duration-300 ${
                s.highlight
                  ? 'border-[#E9C349]/45 bg-[linear-gradient(145deg,rgba(233,195,73,0.13),rgba(10,10,10,0.92))] shadow-[0_0_60px_rgba(233,195,73,0.12)]'
                  : 'border-white/[0.08] bg-[#0e0e0e]/80 hover:border-[#E9C349]/25'
              }`}
            >
              <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-[#E9C349]/06 blur-3xl" />
              <p className={`relative font-mono text-5xl font-black ${s.highlight ? 'text-[#F6DA87]' : 'text-white'}`}>
                <Ticker target={TRACTION_VALUES[i]} suffix={TRACTION_SUFFIXES[i]} />
              </p>
              <p className="relative mt-4 text-sm font-bold text-white/55">{s.label}</p>
              <p className="relative mt-1.5 font-mono text-[10px] italic text-white/22">{s.note}</p>
            </motion.div>
          ))}
        </motion.div>

        <div className="relative">
          <div className="absolute bottom-0 left-[1.75rem] top-0 w-[2px] bg-gradient-to-b from-[#E9C349]/50 via-[#E9C349]/25 to-transparent sm:left-[2rem]" />
          <div className="grid gap-5">
            {c.tracMilestones.map((m, i) => (
              <motion.div key={m.date} variants={rv} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-[3.5rem_1fr] gap-6 sm:grid-cols-[4rem_1fr] sm:gap-10">
                <div className="flex flex-col items-center">
                  <div
                    style={
                      m.future
                        ? { borderColor: `${G}66`, borderStyle: 'dashed' }
                        : { background: `linear-gradient(135deg, ${GD}, ${G})`, boxShadow: `0 0 24px ${G}44` }
                    }
                    className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border-2 text-[10px] font-black text-black"
                  >
                    {m.future ? <span className="text-[#E9C349] opacity-60">→</span> : <span>{String(i + 1).padStart(2, '0')}</span>}
                  </div>
                </div>
                <div
                  className={`mb-5 rounded-[1.6rem] border p-6 backdrop-blur-xl ${
                    m.future ? 'border-dashed border-[#E9C349]/28 bg-[#E9C349]/[0.04]' : 'border-white/[0.08] bg-[#0f0f0f]/80'
                  }`}
                >
                  <p className={`font-mono text-[10px] font-black uppercase tracking-[0.28em] ${m.future ? 'text-[#E9C349]' : 'text-white/35'}`}>{m.date}</p>
                  <p className={`mt-2 text-lg font-black tracking-tight ${m.future ? 'text-[#F6DA87]' : 'text-white'}`}>{m.label}</p>
                  <p className="mt-3 text-sm leading-7 text-white/50">{m.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </Rev>
  );
}

/* ═══════════════════════════════════════════════════════════════ *
 *  CLOSING CTA                                                    *
 * ═══════════════════════════════════════════════════════════════ */
export function InvestorCTA({ locale }: { locale: ExecLocale }) {
  const c = copy[locale];
  return (
    <Rev>
      <section id="inv-cta" className="scroll-mt-36">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[2.85rem] border border-[#E9C349]/40 bg-[#080808]/92 p-10 shadow-[0_0_160px_rgba(233,195,73,0.14),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-3xl sm:p-14 lg:p-16"
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(233,195,73,0.18)_0%,transparent_40%,rgba(246,218,135,0.06)_100%)]" />
          <div className="relative mx-auto max-w-4xl text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.44em] text-[#F6DA87]/65">{c.ctaEyebrow}</p>
            <h2 className="mt-8 bg-gradient-to-br from-white via-[#fef7d9] to-[#c9a035] bg-clip-text text-[clamp(2rem,5vw,3.75rem)] font-black leading-[1.02] tracking-[-0.06em] text-transparent">
              {c.ctaTitle}
            </h2>
            <p className="mx-auto mt-8 max-w-2xl text-base leading-8 text-white/58">{c.ctaBody1}</p>
            <p className="mx-auto mt-5 max-w-2xl text-base font-semibold leading-8 text-white/75">
              {c.ctaBody2}{' '}
              <span className="text-[#F6DA87]">{c.ctaBody2Gold}</span>
            </p>
            <div className="mt-14 flex flex-wrap justify-center gap-4">
              <a
                href={investorDemoHref(locale)}
                className="inline-flex min-h-14 items-center justify-center rounded-full bg-gradient-to-r from-[#F6DA87] via-[#E9C349] to-[#A87B1F] px-10 text-sm font-black uppercase tracking-[0.16em] text-black shadow-[0_0_44px_rgba(233,195,73,0.38)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_70px_rgba(233,195,73,0.55)]"
              >
                {c.ctaBtnMeeting}
              </a>
              <a
                href={investorPitchDeckHref()}
                {...(pitchDeckOpensInNewTab() ? { target: '_blank' as const, rel: 'noopener noreferrer' } : {})}
                className="inline-flex min-h-14 items-center justify-center rounded-full border border-[#E9C349]/50 bg-[#E9C349]/12 px-10 text-sm font-black uppercase tracking-[0.16em] text-[#F6DA87] transition duration-300 hover:border-[#F6DA87]/60 hover:bg-[#E9C349]/18"
              >
                {c.ctaBtnDeck}
              </a>
              <a
                href="mailto:pochobs@gmail.com?subject=Card-Social Seed Round — Investment Inquiry"
                className="inline-flex min-h-14 items-center justify-center rounded-full border border-[#E9C349]/40 bg-[#E9C349]/08 px-10 text-sm font-black uppercase tracking-[0.16em] text-[#F6DA87] transition duration-300 hover:border-[#E9C349]/70 hover:bg-[#E9C349]/14"
              >
                {c.ctaBtnEmail}
              </a>
            </div>
            <div className="mt-14 grid grid-cols-2 gap-4 border-t border-white/[0.07] pt-12 sm:grid-cols-4">
              {c.ctaStats.map((s) => (
                <div key={s.label} className="text-center">
                  <p className="font-mono text-2xl font-black text-[#F6DA87]">{s.val}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/32">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>
    </Rev>
  );
}

/* ─── Revenue streams colors kept stable ─────────────────────── */
export { STREAM_COLORS };

/* ─── TOC items (locale-aware) ──────────────────────────────── */
export function getExtendedTocItems(locale: ExecLocale) {
  const c = copy[locale];
  return [
    { id: 'inv-competitive', label: `F. ${c.compTitle}` },
    { id: 'inv-market', label: `G. ${locale === 'es' ? 'TAM / SAM / SOM' : 'Market Sizing'}` },
    { id: 'inv-projections', label: `H. ${locale === 'es' ? 'Proyecciones' : 'Projections'}` },
    { id: 'inv-team', label: `I. ${c.teamTitle}` },
    { id: 'inv-traction', label: `J. ${locale === 'es' ? 'Tracción' : 'Traction'}` },
    { id: 'inv-cta', label: `↗ ${c.ctaEyebrow}` },
  ];
}

/** Static export for backwards compat (defaults to ES). */
export const extendedTocItems = getExtendedTocItems('es');
