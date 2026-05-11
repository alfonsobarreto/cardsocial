'use client';

import { motion, useMotionValue, useTransform, animate, type Variants } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import {
  CompetitiveAnalysis,
  FinancialProjections,
  InvestorCTA,
  MarketSizing,
  TeamFounders,
  TractionSlide,
  getExtendedTocItems,
} from './InvestorExtended';
import copy, { type ExecLocale } from './investorCopy';

/* ─── Design tokens ─────────────────────────────────────────── */
const GOLD = '#E9C349';
const GOLD_LIGHT = '#F6DA87';
const GOLD_DARK = '#A87B1F';

const reveal: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};
const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const PCTS   = [30, 35, 15, 10, 10] as const;
const USDS   = [150_000, 175_000, 75_000, 50_000, 50_000] as const;
const ACCENTS = [GOLD, GOLD_LIGHT, '#94A3B8', '#7DD3FC', '#86EFAC'] as const;

const MILESTONE_CONTACTS = [500, 750, 1_000] as const;
const MILESTONE_COLORS   = ['#94A3B8', GOLD_LIGHT, GOLD] as const;

const STREAM_COLORS = [GOLD, '#7DD3FC', '#C084FC', '#86EFAC'] as const;
const CAC_COLORS    = ['#F87171', GOLD, GOLD_LIGHT, '#86EFAC'] as const;

/* ─── Primitives ─────────────────────────────────────────────── */
function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.12 }} className={className}>
      {children}
    </motion.div>
  );
}

function Counter({ target, prefix = '', suffix = '' }: { target: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const val = useMotionValue(0);
  const rounded = useTransform(val, (v) => `${prefix}${Math.round(v).toLocaleString('en-US')}${suffix}`);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { animate(val, target, { duration: 1.4, ease: 'easeOut' }); observer.disconnect(); }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, val]);
  return <motion.span ref={ref}>{rounded}</motion.span>;
}

function SectionLabel({ letter, eyebrow, title }: { letter: string; eyebrow: string; title: string }) {
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

/* ─────────────────────────────────────────────────────────────── *
 *  SECTION A — Capital Allocation                                 *
 * ─────────────────────────────────────────────────────────────── */
function CapitalAllocation({ locale }: { locale: ExecLocale }) {
  const c = copy[locale];
  return (
    <Reveal>
      <section id="inv-capital" className="scroll-mt-36">
        <SectionLabel letter="A" eyebrow={c.capEyebrow} title={c.capTitle} />
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
          <div className="min-w-[36rem] overflow-hidden rounded-[1.85rem] border border-white/[0.08] bg-[#0a0a0a]/80 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:min-w-0">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4 sm:px-7">
            <div className="flex gap-2">
              {['#F87171', '#FBBF24', '#34D399'].map((col) => (
                <span key={col} style={{ background: col }} className="inline-block h-3 w-3 rounded-full opacity-60" />
              ))}
            </div>
            <span className="hidden truncate text-center font-mono text-[10px] uppercase tracking-[0.28em] text-white/28 sm:block">{c.capTerminalLabel}</span>
            <span className="font-mono text-[10px] text-[#F6DA87]/60">$500,000</span>
          </div>
          <div className="grid grid-cols-[3rem_1fr_auto_auto] gap-x-6 border-b border-white/[0.06] px-5 py-3 text-[9px] font-black uppercase tracking-[0.28em] text-white/30 sm:grid-cols-[3.5rem_1fr_8rem_7rem] sm:px-7">
            <span>{c.capColCode}</span>
            <span>{c.capColItem}</span>
            <span className="hidden text-right sm:block">{c.capColPct}</span>
            <span className="text-right">{c.capColUsd}</span>
          </div>
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }}>
            {c.capRows.map((row, i) => (
              <motion.div
                key={row.code}
                variants={reveal}
                className={`group grid grid-cols-[3rem_1fr_auto] gap-x-6 border-b border-white/[0.05] px-5 py-5 transition-colors duration-200 hover:bg-[#E9C349]/[0.04] sm:grid-cols-[3.5rem_1fr_8rem_7rem] sm:px-7 ${i === 4 ? 'border-b-0' : ''}`}
              >
                <div className="flex items-start pt-0.5">
                  <span style={{ borderColor: ACCENTS[i] + '55', color: ACCENTS[i] }} className="rounded-lg border px-2 py-0.5 font-mono text-[10px] font-black">{row.code}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white group-hover:text-[#F6DA87]">{row.label}</p>
                  <p className="mt-1 text-xs leading-5 text-white/38">{row.detail}</p>
                  <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
                    <motion.div
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, ease: 'easeOut', delay: i * 0.1 }}
                      style={{ originX: 0, width: `${PCTS[i]}%`, background: `linear-gradient(90deg, ${GOLD_DARK}, ${ACCENTS[i]})` }}
                      className="h-full rounded-full"
                    />
                  </div>
                </div>
                <p className="hidden self-center text-right font-mono text-sm font-semibold text-white/55 sm:block">{PCTS[i]}%</p>
                <p className="self-center text-right font-mono text-sm font-bold text-[#F6DA87]">
                  $<Counter target={USDS[i]} />
                </p>
              </motion.div>
            ))}
          </motion.div>
          <div className="flex items-center justify-between gap-4 border-t border-[#E9C349]/22 bg-[#E9C349]/[0.04] px-5 py-5 sm:px-7">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#F6DA87]/70">{c.capTotalLabel}</p>
            <p className="font-mono text-xl font-black text-[#F6DA87]">$500,000</p>
          </div>
        </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
          className="relative mt-10 overflow-hidden rounded-[1.85rem] border border-[#E9C349]/30 bg-[linear-gradient(135deg,rgba(233,195,73,0.14),rgba(10,10,10,0.95))] p-8 shadow-[0_0_70px_rgba(233,195,73,0.12)] backdrop-blur-xl sm:p-10"
        >
          <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[#E9C349]/12 blur-3xl" />
          <div className="relative">
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.36em] text-[#F6DA87]/75">{c.capMilestoneEyebrow}</p>
            <h3 className="mt-4 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">{c.capMilestoneTitle}</h3>
            <p className="mt-5 max-w-3xl text-sm leading-8 text-white/60">{c.capMilestoneBody}</p>
            <div className="mt-10 flex flex-col items-stretch gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-wrap items-end justify-center gap-4 sm:gap-10">
                <div className="text-center">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/32">{c.capMilestoneTimeframe}</p>
                  <p className="mt-2 font-mono text-4xl font-black text-white/90">{c.capMilestoneFrom}</p>
                </div>
                <div className="hidden h-px w-12 bg-gradient-to-r from-transparent via-[#E9C349]/55 to-transparent sm:block sm:h-16 sm:w-auto sm:bg-gradient-to-b" />
                <div className="flex items-center justify-center gap-2 sm:hidden">
                  <span className="text-2xl text-[#F6DA87]">↓</span>
                </div>
                <div className="text-center">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#F6DA87]/70">{c.capMilestoneUnit}</p>
                  <p className="mt-2 font-mono text-5xl font-black text-[#F6DA87]">{c.capMilestoneTo}</p>
                </div>
              </div>
              <div className="mx-auto h-3 w-full max-w-md overflow-hidden rounded-full bg-white/[0.06] sm:mx-0 sm:w-48">
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.1, ease: 'easeOut' }}
                  className="h-full origin-left rounded-full bg-gradient-to-r from-[#A87B1F] via-[#E9C349] to-[#F6DA87]"
                />
              </div>
            </div>
            <p className="mt-8 text-[11px] leading-6 text-white/38">{c.capMilestoneFoot}</p>
          </div>
        </motion.div>
      </section>
    </Reveal>
  );
}

function ComplianceStrip({ locale }: { locale: ExecLocale }) {
  const c = copy[locale];
  return (
    <Reveal>
      <section id="inv-compliance" className="scroll-mt-36 mb-16">
        <div className="relative overflow-hidden rounded-[1.85rem] border border-cyan-500/25 bg-[linear-gradient(125deg,rgba(34,211,238,0.12),rgba(8,8,8,0.92))] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.4)] backdrop-blur-2xl sm:p-9">
          <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative max-w-4xl">
            <p className="inline-flex rounded-full border border-cyan-400/35 bg-cyan-500/10 px-4 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200/90">
              {c.complianceEyebrow}
            </p>
            <h3 className="mt-6 text-xl font-black tracking-[-0.03em] text-white sm:text-2xl">{c.complianceTitle}</h3>
            <p className="mt-4 text-sm leading-8 text-white/58">{c.complianceBody}</p>
          </div>
        </div>
      </section>
    </Reveal>
  );
}

/* ─────────────────────────────────────────────────────────────── *
 *  SECTION B — Revenue Streams                                    *
 * ─────────────────────────────────────────────────────────────── */
const STREAM_COL_SPANS = ['lg:col-span-2', '', '', ''] as const;

function RevenueStreams({ locale }: { locale: ExecLocale }) {
  const c = copy[locale];
  return (
    <Reveal>
      <section id="inv-revenue" className="scroll-mt-36">
        <SectionLabel letter="B" eyebrow={c.revEyebrow} title={c.revTitle} />
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} className="grid gap-4 lg:grid-cols-3">
          {c.revStreams.map((s, i) => {
            const color = STREAM_COLORS[i];
            return (
              <motion.article
                key={s.title}
                variants={reveal}
                style={{ '--sc': color } as React.CSSProperties}
                className={`group relative overflow-hidden rounded-[1.85rem] border border-white/[0.09] bg-[#0d0d0d]/85 p-7 shadow-[0_28px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl transition duration-300 hover:border-[var(--sc)]/35 sm:p-8 ${STREAM_COL_SPANS[i]}`}
              >
                <div style={{ background: `radial-gradient(circle at 80% 0%, ${color}18, transparent 55%)` }} className="pointer-events-none absolute inset-0" />
                <div style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[1.85rem]" />
                <div className="relative">
                  <p style={{ color }} className="text-[9px] font-black uppercase tracking-[0.36em]">{s.eyebrow}</p>
                  <h3 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">{s.title}</h3>
                  <p className="mt-5 text-sm leading-7 text-white/55">{s.desc}</p>
                  <div className="mt-8 grid gap-2">
                    {s.metrics.map((m) => (
                      <div key={m.label} className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-5 py-3 transition duration-200 group-hover:border-[var(--sc)]/22 group-hover:bg-[var(--sc)]/[0.04]">
                        <span className="text-xs text-white/45">{m.label}</span>
                        <span style={{ color }} className="font-mono text-sm font-black">{m.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.article>
            );
          })}
        </motion.div>
      </section>
    </Reveal>
  );
}

/* ─────────────────────────────────────────────────────────────── *
 *  SECTION C — Legacy Program                                     *
 * ─────────────────────────────────────────────────────────────── */
function LegacyProgram({ locale }: { locale: ExecLocale }) {
  const c = copy[locale];
  return (
    <Reveal>
      <section id="inv-legacy" className="scroll-mt-36">
        <SectionLabel letter="C" eyebrow={c.legacyEyebrow} title={c.legacyTitle} />
        <p className="mb-14 max-w-3xl text-sm leading-7 text-white/46">{c.legacyIntro}</p>
        <div className="relative">
          <div className="absolute bottom-0 left-[1.85rem] top-0 w-[2px] bg-gradient-to-b from-[#E9C349]/55 via-[#E9C349]/30 to-[#E9C349]/08 sm:left-[2.1rem]" />
          <div className="grid gap-6">
            {c.legacyMilestones.map((m, i) => {
              const color = MILESTONE_COLORS[i];
              const highlight = i === 2;
              return (
                <motion.article key={MILESTONE_CONTACTS[i]} variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true }} className="relative grid grid-cols-[4.2rem_1fr] gap-6 sm:grid-cols-[4.8rem_1fr] sm:gap-10">
                  <div className="flex flex-col items-center">
                    <div
                      style={{
                        background: highlight ? `linear-gradient(135deg, ${GOLD_DARK}, ${GOLD}, ${GOLD_LIGHT})` : 'transparent',
                        borderColor: color + '88',
                        color: highlight ? '#000' : color,
                        boxShadow: highlight ? `0 0 42px ${GOLD}55` : undefined,
                      }}
                      className="relative z-10 flex h-[3.75rem] w-[3.75rem] flex-col items-center justify-center rounded-2xl border-2 text-center"
                    >
                      <span className="font-mono text-[10px] font-black leading-none">{i < 2 ? `0${i + 1}` : '★'}</span>
                    </div>
                  </div>
                  <div
                    style={highlight ? { borderColor: `${GOLD}55`, background: 'linear-gradient(145deg,rgba(233,195,73,0.14),rgba(10,10,10,0.92) 55%)' } : {}}
                    className={`mb-6 rounded-[1.85rem] border p-7 backdrop-blur-2xl sm:p-8 ${highlight ? 'shadow-[0_0_80px_rgba(233,195,73,0.14)]' : 'border-white/[0.08] bg-[#0e0e0e]/80 shadow-[0_24px_70px_rgba(0,0,0,0.38)]'}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p style={{ color }} className="text-[9px] font-black uppercase tracking-[0.36em]">{m.eyebrow}</p>
                        <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
                          <Counter target={MILESTONE_CONTACTS[i]} /> {locale === 'es' ? 'contactos' : 'contacts'}
                        </h3>
                      </div>
                      <div style={{ borderColor: color + '55', color }} className="rounded-full border px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.22em]">{m.badge}</div>
                    </div>
                    <div className="mt-8 grid gap-3">
                      {m.unlocks.map((u) => (
                        <div key={u} className="flex gap-3 text-sm leading-6 text-white/62">
                          <span style={{ color }} className="mt-[5px] shrink-0 text-[10px] font-black">▸</span>
                          <span>{u}</span>
                        </div>
                      ))}
                    </div>
                    {'note' in m && m.note && (
                      <div className="mt-8 rounded-2xl border border-[#E9C349]/30 bg-[#E9C349]/06 px-6 py-4">
                        <p className="text-xs font-bold text-[#F6DA87]/80">{m.note}</p>
                      </div>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>
    </Reveal>
  );
}

/* ─────────────────────────────────────────────────────────────── *
 *  SECTION D — Network Effect & Zero CAC                          *
 * ─────────────────────────────────────────────────────────────── */
function NetworkEffect({ locale }: { locale: ExecLocale }) {
  const c = copy[locale];
  const [line1, line2] = c.netHeadline.split('\n');
  return (
    <Reveal>
      <section id="inv-network" className="scroll-mt-36">
        <SectionLabel letter="D" eyebrow={c.netEyebrow} title={c.netTitle} />
        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <div className="rounded-[1.85rem] border border-[#E9C349]/28 bg-[linear-gradient(135deg,rgba(233,195,73,0.12),rgba(10,10,10,0.92))] p-8 shadow-[0_0_80px_rgba(233,195,73,0.10)] backdrop-blur-2xl sm:p-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#F6DA87]/70">{c.netMoatLabel}</p>
            <h3 className="mt-5 text-3xl font-black tracking-[-0.05em] text-white">
              {line1}<br /><span className="text-[#F6DA87]">{line2}</span>
            </h3>
            <p className="mt-8 text-sm leading-8 text-white/62">{c.netBody1}</p>
            <p className="mt-5 text-sm leading-8 text-white/62">{c.netBody2}</p>
            <p className="mt-5 text-sm leading-8 text-white/62">{c.netBody3}</p>
          </div>
          <div className="overflow-hidden rounded-[1.85rem] border border-white/[0.08] bg-[#080808]/90 backdrop-blur-2xl">
            <div className="border-b border-white/[0.07] px-7 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">{c.netTerminalLabel}</p>
            </div>
            <div className="grid gap-0 divide-y divide-white/[0.06]">
              {c.netMetrics.map((m, i) => (
                <div key={m.label} className="group flex items-center justify-between px-7 py-6 transition-colors duration-150 hover:bg-[#E9C349]/[0.04]">
                  <div>
                    <p className="text-sm font-semibold text-white/70 group-hover:text-white">{m.label}</p>
                    <p className="mt-0.5 text-[11px] text-white/30">{m.sub}</p>
                  </div>
                  <p style={{ color: CAC_COLORS[i] }} className="ml-6 shrink-0 font-mono text-xl font-black">{m.value}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-[#E9C349]/18 bg-[#E9C349]/[0.03] px-7 py-5">
              <p className="text-xs leading-6 text-[#F6DA87]/65">{c.netFooter}</p>
            </div>
          </div>
        </div>
      </section>
    </Reveal>
  );
}

/* ─────────────────────────────────────────────────────────────── *
 *  SECTION E — The Moat (Defensive Data Asset)                    *
 * ─────────────────────────────────────────────────────────────── */
function defaultMoatIndex(rows: readonly { highlight: boolean }[]) {
  const i = rows.findIndex((r) => r.highlight);
  return i >= 0 ? i : rows.length - 1;
}

function MoatCardSocialThesis({ locale }: { locale: ExecLocale }) {
  const c = copy[locale];
  const goldEs = 'no se valuará por las suscripciones — se valuará por los datos.';
  return (
    <>
      <p className="mt-5 text-sm leading-8 text-white/62">{c.moatThesis1}</p>
      <p className="mt-5 text-sm leading-8 text-white/62">
        {locale === 'es' ? (
          (() => {
            const [before, rest] = c.moatThesis2.split(goldEs);
            let after = (rest ?? '').trimStart();
            if (after.startsWith('.')) after = after.slice(1).trimStart();
            return (
              <>
                {before}
                <strong className="text-[#F6DA87]">{goldEs}</strong>
                {after ? `. ${after}` : null}
              </>
            );
          })()
        ) : (
          <>
            {c.moatThesis2.split('won\'t').join('won\u2019t').split('subscriptions —')[0]}
            <strong className="text-[#F6DA87]">won&apos;t be valued on subscriptions — it will be valued on data.</strong>
            {' '}The comps for that transaction are in the hundreds of millions.
          </>
        )}
      </p>
    </>
  );
}

function DataMoat({ locale }: { locale: ExecLocale }) {
  const c = copy[locale];
  const [selectedMoatIdx, setSelectedMoatIdx] = useState(() => defaultMoatIndex(c.moatCompetitors));

  useEffect(() => {
    setSelectedMoatIdx(defaultMoatIndex(copy[locale].moatCompetitors));
  }, [locale]);

  const sel = c.moatCompetitors[selectedMoatIdx];
  const showCardsocialThesis = Boolean(sel.highlight);

  return (
    <Reveal>
      <section id="inv-moat" className="scroll-mt-36">
        <SectionLabel letter="E" eyebrow={c.moatEyebrow} title={c.moatTitle} />
        <p className="mb-14 max-w-3xl border-l-[3px] border-[#E9C349] pl-7 text-lg font-semibold leading-8 text-white/72">{c.moatQuote}</p>
        <p className="mb-10 font-mono text-[10px] uppercase tracking-[0.28em] text-[#F6DA87]/55">{c.moatInteractHint}</p>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-[1.85rem] border border-white/[0.08] bg-[#080808]/90 backdrop-blur-2xl">
            <div className="border-b border-white/[0.07] px-7 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">{c.moatCompHeader}</p>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {c.moatCompetitors.map((r, i) => {
                const active = selectedMoatIdx === i;
                return (
                  <button
                    key={r.name}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedMoatIdx(i)}
                    style={{ borderLeftColor: active ? GOLD : 'transparent', borderLeftWidth: '3px' }}
                    className={`group flex w-full cursor-pointer items-start gap-5 px-7 py-5 text-left transition-colors duration-150 hover:bg-[#E9C349]/[0.04] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#E9C349]/70 ${
                      active ? 'bg-[#E9C349]/[0.06]' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className={`text-sm font-bold ${active ? 'text-[#F6DA87]' : 'text-white/75'}`}>{r.name}</p>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                            active ? 'border-[#E9C349]/50 text-[#E9C349]' : 'border-white/10 text-white/30'
                          }`}
                        >
                          {r.chip}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-white/35">{r.what}</p>
                      <p className={`mt-1.5 text-xs font-semibold ${active ? 'text-[#F6DA87]/85' : 'text-white/30'}`}>{r.moat}</p>
                      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/22 group-hover:text-[#F6DA87]/50">
                        {active ? (
                          <span className="text-[#F6DA87]/80">{locale === 'es' ? 'Seleccionado' : 'Selected'}</span>
                        ) : (
                          <span className="opacity-90">{locale === 'es' ? 'Ver tesis comparada →' : 'View comparative thesis →'}</span>
                        )}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-5">
            <div className="rounded-[1.85rem] border border-[#E9C349]/28 bg-[linear-gradient(145deg,rgba(233,195,73,0.11),rgba(8,8,8,0.92))] p-8 backdrop-blur-2xl sm:p-9">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.08] pb-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#F6DA87]/70">{c.moatThesisLabel}</p>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/38">{sel.name}</p>
              </div>
              <motion.div
                key={`${locale}-${selectedMoatIdx}-${sel.name}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {showCardsocialThesis ? (
                  <MoatCardSocialThesis locale={locale} />
                ) : (
                  <>
                    <p className="mt-5 text-sm leading-8 text-white/62">{sel.thesisP1}</p>
                    <p className="mt-5 text-sm leading-8 text-white/62">{sel.thesisP2}</p>
                  </>
                )}
              </motion.div>
            </div>
            <div className="overflow-hidden rounded-[1.85rem] border border-white/[0.08] bg-[#090909]/85 backdrop-blur-2xl">
              <div className="border-b border-white/[0.07] px-7 py-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">{c.moatAcquirersLabel}</p>
              </div>
              <div className="divide-y divide-white/[0.05]">
                {c.moatAcquirers.map((a) => (
                  <div key={a.name} className="group px-7 py-5 transition-colors hover:bg-[#E9C349]/[0.04]">
                    <p className="text-sm font-bold text-white/80 group-hover:text-[#F6DA87]">{a.name}</p>
                    <p className="mt-1.5 text-xs leading-5 text-white/38">{a.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </Reveal>
  );
}

/* ─────────────────────────────────────────────────────────────── *
 *  Entry point                                                     *
 * ─────────────────────────────────────────────────────────────── */
export default function InvestorMetrics({ locale = 'es' }: { locale?: ExecLocale }) {
  const c = copy[locale];
  const [heroLine1, heroLine2] = c.invHeroTitle.split('\n');

  return (
    <>
      <Reveal>
        <div className="my-36 flex items-center gap-6">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#E9C349]/35 to-transparent" />
          <div className="shrink-0 rounded-full border border-[#E9C349]/45 bg-[#E9C349]/09 px-7 py-2.5 text-[10px] font-black uppercase tracking-[0.36em] text-[#F6DA87]">
            {c.investorDivider}
          </div>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-[#E9C349]/35 to-transparent" />
        </div>
      </Reveal>

      <Reveal>
        <div className="relative mb-28 overflow-hidden rounded-[2.4rem] border border-[#E9C349]/35 bg-[#080808]/90 p-10 shadow-[0_0_120px_rgba(233,195,73,0.10),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-3xl sm:p-14">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(233,195,73,0.14)_0%,transparent_40%,rgba(246,218,135,0.05)_100%)]" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.44em] text-[#F6DA87]/70">{c.invHeroEyebrow}</p>
              <h2 className="mt-6 bg-gradient-to-br from-white via-[#fef7d9] to-[#c9a035] bg-clip-text text-[clamp(2rem,4.5vw,3.5rem)] font-black leading-[1.02] tracking-[-0.06em] text-transparent">
                {heroLine1}<br />{heroLine2}
              </h2>
              <p className="mt-7 max-w-2xl text-sm leading-8 text-white/55">{c.invHeroBody}</p>
              <div className="mt-8 flex flex-wrap gap-2">
                {c.execThesisChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-[#E9C349]/25 bg-[#E9C349]/08 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#F6DA87]/90"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-2">
              {c.invHeroStats.map((stat) => (
                <div key={stat.label} className="rounded-[1.4rem] border border-white/[0.08] bg-white/[0.03] px-5 py-4 text-center">
                  <p className="font-mono text-2xl font-black text-[#F6DA87]">{stat.value}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-white/36">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      <div className="grid gap-[7.5rem]">
        <ComplianceStrip locale={locale} />
        <CapitalAllocation locale={locale} />
        <RevenueStreams locale={locale} />
        <LegacyProgram locale={locale} />
        <NetworkEffect locale={locale} />
        <DataMoat locale={locale} />
      </div>

      <div className="mt-[7.5rem] grid gap-[7.5rem]">
        <CompetitiveAnalysis locale={locale} />
        <MarketSizing locale={locale} />
        <FinancialProjections locale={locale} />
        <TeamFounders locale={locale} />
        <TractionSlide locale={locale} />
        <InvestorCTA locale={locale} />
      </div>
    </>
  );
}

export function getInvestorTocItems(locale: ExecLocale) {
  const c = copy[locale];
  return [
    { id: 'inv-compliance', label: `✦ ${c.complianceNavLabel}` },
    { id: 'inv-capital', label: `A. ${c.capTitle}` },
    { id: 'inv-revenue', label: `B. ${c.revTitle}` },
    { id: 'inv-legacy', label: `C. ${c.legacyTitle}` },
    { id: 'inv-network', label: `D. ${c.netTitle}` },
    { id: 'inv-moat', label: `E. ${c.moatTitle}` },
    ...getExtendedTocItems(locale),
  ];
}

/** Backwards compat */
export const investorTocItems = getInvestorTocItems('es');
