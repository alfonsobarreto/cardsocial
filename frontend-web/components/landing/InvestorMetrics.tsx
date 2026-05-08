'use client';

import { motion, useMotionValue, useTransform, animate, type Variants } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';

import {
  CompetitiveAnalysis,
  FinancialProjections,
  InvestorCTA,
  MarketSizing,
  TeamFounders,
  TractionSlide,
  extendedTocItems,
} from './InvestorExtended';

/* ─── Design tokens ─────────────────────────────────────────── */
const GOLD = '#D4AF37';
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

/* ─── Primitives ─────────────────────────────────────────────── */
function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.12 }} className={className}>
      {children}
    </motion.div>
  );
}

/** Animated counter — ticks up from 0 to `target` on enter-viewport */
function Counter({ target, prefix = '', suffix = '' }: { target: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const val = useMotionValue(0);
  const rounded = useTransform(val, (v) => `${prefix}${Math.round(v).toLocaleString('en-US')}${suffix}`);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          animate(val, target, { duration: 1.4, ease: 'easeOut' });
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, val]);

  return <motion.span ref={ref}>{rounded}</motion.span>;
}

/* ─────────────────────────────────────────────────────────────── *
 *  SECTION A — Capital Allocation                                 *
 * ─────────────────────────────────────────────────────────────── */
const capRows = [
  {
    code: 'T&I',
    label: 'Tech & Infrastructure',
    detail: 'Cloud scaling · Mapbox · VoIP APIs · Vault architecture',
    pct: 30,
    usd: 180_000,
    accent: GOLD,
  },
  {
    code: 'P&S',
    label: 'Penetration & Sales',
    detail: 'B2B sales force · Localized marketing in 6 languages',
    pct: 35,
    usd: 210_000,
    accent: GOLD_LIGHT,
  },
  {
    code: 'L&C',
    label: 'Legal & Compliance',
    detail: 'Corporate structuring · GDPR/LGPD compliance',
    pct: 15,
    usd: 90_000,
    accent: '#94A3B8',
  },
  {
    code: 'H&L',
    label: 'Hardware & Logistics',
    detail: 'Premium NFC manufacturing · Regional distribution',
    pct: 10,
    usd: 60_000,
    accent: '#7DD3FC',
  },
  {
    code: 'CR',
    label: 'Contingency Reserve',
    detail: 'Liquidity buffer · Runway extension',
    pct: 10,
    usd: 60_000,
    accent: '#86EFAC',
  },
];

function CapitalAllocation() {
  return (
    <Reveal>
      <section id="inv-capital" className="scroll-mt-36">
        <SectionLabel letter="A" eyebrow="Seed Round · $600k" title="Capital Allocation" />

        <div className="overflow-hidden rounded-[1.85rem] border border-white/[0.08] bg-[#0a0a0a]/80 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          {/* Terminal header bar */}
          <div className="flex items-center justify-between border-b border-white/[0.07] px-7 py-4">
            <div className="flex gap-2">
              {['#F87171', '#FBBF24', '#34D399'].map((c) => (
                <span key={c} style={{ background: c }} className="inline-block h-3 w-3 rounded-full opacity-60" />
              ))}
            </div>
            <span className="font-mono text-[10px] tracking-[0.28em] text-white/28 uppercase">ALLOCATION · SEED ROUND · Q2-2026</span>
            <span className="font-mono text-[10px] text-[#F6DA87]/60">$600,000</span>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[3rem_1fr_auto_auto] gap-x-6 border-b border-white/[0.06] px-7 py-3 text-[9px] font-black uppercase tracking-[0.28em] text-white/30 sm:grid-cols-[3.5rem_1fr_8rem_7rem]">
            <span>Code</span>
            <span>Line Item</span>
            <span className="hidden text-right sm:block">% Allocation</span>
            <span className="text-right">USD</span>
          </div>

          {/* Rows */}
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }}>
            {capRows.map((row, i) => (
              <motion.div
                key={row.code}
                variants={reveal}
                className={`group grid grid-cols-[3rem_1fr_auto] gap-x-6 border-b border-white/[0.05] px-7 py-5 transition-colors duration-200 hover:bg-[#D4AF37]/[0.04] sm:grid-cols-[3.5rem_1fr_8rem_7rem] ${i === capRows.length - 1 ? 'border-b-0' : ''}`}
              >
                {/* Code pill */}
                <div className="flex items-start pt-0.5">
                  <span
                    style={{ borderColor: row.accent + '55', color: row.accent }}
                    className="rounded-lg border px-2 py-0.5 font-mono text-[10px] font-black"
                  >
                    {row.code}
                  </span>
                </div>

                {/* Label + bar */}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white group-hover:text-[#F6DA87]">{row.label}</p>
                  <p className="mt-1 text-xs leading-5 text-white/38">{row.detail}</p>
                  {/* Progress bar */}
                  <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
                    <motion.div
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, ease: 'easeOut', delay: i * 0.1 }}
                      style={{ originX: 0, width: `${row.pct}%`, background: `linear-gradient(90deg, ${GOLD_DARK}, ${row.accent})` }}
                      className="h-full rounded-full"
                    />
                  </div>
                </div>

                {/* % */}
                <p className="hidden self-center text-right font-mono text-sm font-semibold text-white/55 sm:block">
                  {row.pct}%
                </p>

                {/* USD */}
                <p className="self-center text-right font-mono text-sm font-bold text-[#F6DA87]">
                  $<Counter target={row.usd} />
                </p>
              </motion.div>
            ))}
          </motion.div>

          {/* Footer total */}
          <div className="flex items-center justify-between border-t border-[#D4AF37]/22 bg-[#D4AF37]/[0.04] px-7 py-5">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#F6DA87]/70">Total Seed Round</p>
            <p className="font-mono text-xl font-black text-[#F6DA87]">$600,000</p>
          </div>
        </div>
      </section>
    </Reveal>
  );
}

/* ─────────────────────────────────────────────────────────────── *
 *  SECTION B — Revenue Streams                                    *
 * ─────────────────────────────────────────────────────────────── */
const revenueStreams = [
  {
    id: 'saas',
    eyebrow: 'Recurring · Monthly',
    title: 'SaaS Subscriptions',
    desc: 'MRR locked-in from Influencer, Business, and Corporate tiers. Predictable, compounding baseline revenue insulated from campaign volatility.',
    metrics: [
      { label: 'Free → Influencer Conv.', value: '~12%' },
      { label: 'Avg. MRR per Business user', value: '$29' },
      { label: 'Corporate contract floor', value: '$499/mo' },
    ],
    color: GOLD,
    colSpan: 'lg:col-span-2',
  },
  {
    id: 'radar',
    eyebrow: 'Upsell · Premium',
    title: 'Market Radar',
    desc: '"Supreme" access — 25-mile heatmap + keyword analytics. High-margin B2B add-on for businesses that need market intelligence, not just contact management.',
    metrics: [
      { label: 'Add-on conversion est.', value: '~22%' },
      { label: 'Margin', value: '>85%' },
    ],
    color: '#7DD3FC',
    colSpan: '',
  },
  {
    id: 'studio',
    eyebrow: 'Microtransactions',
    title: 'Card-Studio',
    desc: 'Skins, luxury icon packs, and visual themes. Constant, frictionless cash flow that scales with the user base independent of subscription conversions.',
    metrics: [
      { label: 'Avg basket size', value: '$4.99' },
      { label: 'Purchase frequency', value: '~2×/yr' },
    ],
    color: '#C084FC',
    colSpan: '',
  },
  {
    id: 'nfc',
    eyebrow: 'One-time · Hardware',
    title: 'Premium NFC Cards',
    desc: 'Physical product revenue from premium card sales. Upfront capital injection that also drives user activation — hardware ownership correlates with 4× higher retention.',
    metrics: [
      { label: 'Unit price', value: '$34.99' },
      { label: 'Gross margin target', value: '~60%' },
    ],
    color: '#86EFAC',
    colSpan: '',
  },
];

function RevenueStreams() {
  return (
    <Reveal>
      <section id="inv-revenue" className="scroll-mt-36">
        <SectionLabel letter="B" eyebrow="Monetization Engine" title="Revenue Streams" />

        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} className="grid gap-4 lg:grid-cols-3">
          {revenueStreams.map((s) => (
            <motion.article
              key={s.id}
              variants={reveal}
              style={{ '--stream-color': s.color } as React.CSSProperties}
              className={`group relative overflow-hidden rounded-[1.85rem] border border-white/[0.09] bg-[#0d0d0d]/85 p-7 shadow-[0_28px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl transition duration-300 hover:border-[var(--stream-color)]/35 sm:p-8 ${s.colSpan}`}
            >
              {/* Ambient glow */}
              <div
                style={{ background: `radial-gradient(circle at 80% 0%, ${s.color}18, transparent 55%)` }}
                className="pointer-events-none absolute inset-0"
              />
              {/* Top accent line */}
              <div
                style={{ background: `linear-gradient(90deg, ${s.color}, transparent)` }}
                className="absolute left-0 right-0 top-0 h-[2px] rounded-t-[1.85rem]"
              />

              <div className="relative">
                <p
                  style={{ color: s.color }}
                  className="text-[9px] font-black uppercase tracking-[0.36em]"
                >
                  {s.eyebrow}
                </p>
                <h3 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">{s.title}</h3>
                <p className="mt-5 text-sm leading-7 text-white/55">{s.desc}</p>

                {/* Metrics mini-table */}
                <div className="mt-8 grid gap-2">
                  {s.metrics.map((m) => (
                    <div
                      key={m.label}
                      className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-5 py-3 transition duration-200 group-hover:border-[var(--stream-color)]/22 group-hover:bg-[var(--stream-color)]/[0.04]"
                    >
                      <span className="text-xs text-white/45">{m.label}</span>
                      <span style={{ color: s.color }} className="font-mono text-sm font-black">
                        {m.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </section>
    </Reveal>
  );
}

/* ─────────────────────────────────────────────────────────────── *
 *  SECTION C — The Legacy Program                                 *
 * ─────────────────────────────────────────────────────────────── */
const milestones = [
  {
    contacts: 250,
    badge: 'Elite Status',
    eyebrow: 'Milestone I',
    unlocks: ['Exclusive "Elite" profile badge visible to all contacts', 'Premium Card-Studio Skin pack (limited edition)'],
    color: '#94A3B8',
  },
  {
    contacts: 1_000,
    badge: 'Analytics Pro',
    eyebrow: 'Milestone II',
    unlocks: ['Advanced Personal Analytics Dashboard', 'Full conversion funnel for all Smart & Business Cards', 'Historical data export (CSV)'],
    color: GOLD_LIGHT,
  },
  {
    contacts: 2_000,
    badge: 'Supreme',
    eyebrow: 'Milestone III · Final',
    unlocks: [
      'Free lifetime "Supreme Market Radar" — 25-mile heatmap',
      'Full keyword analytics & local demand intelligence',
      'Permanent "Supreme" badge — highest social proof on the network',
    ],
    color: GOLD,
    highlight: true,
  },
];

function LegacyProgram() {
  return (
    <Reveal>
      <section id="inv-legacy" className="scroll-mt-36">
        <SectionLabel letter="C" eyebrow="Organic Growth Engine" title="The Legacy Program" />

        <p className="mb-14 max-w-3xl text-sm leading-7 text-white/46">
          Normal users pay with <em className="not-italic text-[#F6DA87]/80">virality</em> instead of cash.
          Each milestone creates a self-reinforcing loop: users recruit contacts to unlock premium features —
          turning the product into its own distribution channel.
        </p>

        <div className="relative">
          {/* Vertical connector line */}
          <div className="absolute bottom-0 left-[1.85rem] top-0 w-[2px] bg-gradient-to-b from-[#D4AF37]/55 via-[#D4AF37]/30 to-[#D4AF37]/08 sm:left-[2.1rem]" />

          <div className="grid gap-6">
            {milestones.map((m, i) => (
              <motion.article
                key={m.contacts}
                variants={reveal}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className={`relative grid grid-cols-[4.2rem_1fr] gap-6 sm:grid-cols-[4.8rem_1fr] sm:gap-10`}
              >
                {/* Node */}
                <div className="flex flex-col items-center">
                  <div
                    style={{
                      background: m.highlight
                        ? `linear-gradient(135deg, ${GOLD_DARK}, ${GOLD}, ${GOLD_LIGHT})`
                        : 'transparent',
                      borderColor: m.color + '88',
                      color: m.highlight ? '#000' : m.color,
                      boxShadow: m.highlight ? `0 0 42px ${GOLD}55` : undefined,
                    }}
                    className="relative z-10 flex h-[3.75rem] w-[3.75rem] flex-col items-center justify-center rounded-2xl border-2 text-center"
                  >
                    <span className="font-mono text-[10px] font-black leading-none">{i + 1 < 3 ? `0${i + 1}` : '★'}</span>
                  </div>
                  {i < milestones.length - 1 && (
                    <div className="mt-1 h-full w-[2px] flex-1 bg-transparent" />
                  )}
                </div>

                {/* Card */}
                <div
                  style={
                    m.highlight
                      ? { borderColor: `${GOLD}55`, background: 'linear-gradient(145deg,rgba(212,175,55,0.14),rgba(10,10,10,0.92) 55%)' }
                      : {}
                  }
                  className={`mb-6 rounded-[1.85rem] border p-7 backdrop-blur-2xl sm:p-8 ${
                    m.highlight
                      ? 'shadow-[0_0_80px_rgba(212,175,55,0.14)]'
                      : 'border-white/[0.08] bg-[#0e0e0e]/80 shadow-[0_24px_70px_rgba(0,0,0,0.38)]'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p style={{ color: m.color }} className="text-[9px] font-black uppercase tracking-[0.36em]">
                        {m.eyebrow}
                      </p>
                      <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">
                        <Counter target={m.contacts} /> contacts
                      </h3>
                    </div>
                    <div
                      style={{ borderColor: m.color + '55', color: m.color }}
                      className="rounded-full border px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.22em]"
                    >
                      {m.badge}
                    </div>
                  </div>

                  <div className="mt-8 grid gap-3">
                    {m.unlocks.map((u) => (
                      <div key={u} className="flex gap-3 text-sm leading-6 text-white/62">
                        <span style={{ color: m.color }} className="mt-[5px] shrink-0 text-[10px] font-black">▸</span>
                        <span>{u}</span>
                      </div>
                    ))}
                  </div>

                  {m.highlight && (
                    <div className="mt-8 rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/06 px-6 py-4">
                      <p className="text-xs font-bold text-[#F6DA87]/80">
                        Supreme Market Radar is the product&apos;s most powerful feature. Making it the reward for 2,000 contacts turns every user into a salesperson with skin in the game.
                      </p>
                    </div>
                  )}
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
    </Reveal>
  );
}

/* ─────────────────────────────────────────────────────────────── *
 *  SECTION D — Network Effect & Zero CAC                          *
 * ─────────────────────────────────────────────────────────────── */
const cacMetrics = [
  { label: 'Industry avg. mobile app CAC', value: '$3.52', sub: 'Meta / Google Ads', color: '#F87171' },
  { label: 'Card-Social blended CAC', value: '~$0', sub: 'Legacy Program virality', color: GOLD },
  { label: 'Legacy-driven contacts per user', value: '2,000', sub: 'before Supreme unlock', color: GOLD_LIGHT },
  { label: 'Projected organic referral ratio', value: '1 : 8', sub: 'one user brings ~8 others', color: '#86EFAC' },
];

function NetworkEffect() {
  return (
    <Reveal>
      <section id="inv-network" className="scroll-mt-36">
        <SectionLabel letter="D" eyebrow="Why investors win · CAC" title="The Network Effect" />

        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          {/* Text block */}
          <div className="rounded-[1.85rem] border border-[#D4AF37]/28 bg-[linear-gradient(135deg,rgba(212,175,55,0.12),rgba(10,10,10,0.92))] p-8 shadow-[0_0_80px_rgba(212,175,55,0.10)] backdrop-blur-2xl sm:p-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#F6DA87]/70">Competitive Moat #1</p>
            <h3 className="mt-5 text-3xl font-black tracking-[-0.05em] text-white">
              CAC ≈ $0.<br />
              <span className="text-[#F6DA87]">Users are the sales force.</span>
            </h3>
            <p className="mt-8 text-sm leading-8 text-white/62">
              Traditional SaaS companies burn between <span className="font-bold text-white">$3–$30</span> acquiring each mobile user through paid media. Card-Social inverts this model entirely.
            </p>
            <p className="mt-5 text-sm leading-8 text-white/62">
              Every user who wants <strong className="text-[#F6DA87]">Supreme Market Radar for free</strong> must network 2,000 people into the platform. That is 2,000 new registered users — acquired at zero media spend. The Legacy Program is not a loyalty gimmick; it is a structured viral engine with a quantifiable output per user.
            </p>
            <p className="mt-5 text-sm leading-8 text-white/62">
              As the network grows, each additional user increases the value of the Social Market for every existing user — a classic <em className="font-bold not-italic text-white">Metcalfe&apos;s Law</em> compounding loop. The product gets more valuable the more people use it, without incremental infrastructure cost.
            </p>
          </div>

          {/* Metrics terminal */}
          <div className="overflow-hidden rounded-[1.85rem] border border-white/[0.08] bg-[#080808]/90 backdrop-blur-2xl">
            <div className="border-b border-white/[0.07] px-7 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">CAC Benchmark · Live Calc</p>
            </div>
            <div className="grid gap-0 divide-y divide-white/[0.06]">
              {cacMetrics.map((m) => (
                <div key={m.label} className="group flex items-center justify-between px-7 py-6 transition-colors duration-150 hover:bg-[#D4AF37]/[0.04]">
                  <div>
                    <p className="text-sm font-semibold text-white/70 group-hover:text-white">{m.label}</p>
                    <p className="mt-0.5 text-[11px] text-white/30">{m.sub}</p>
                  </div>
                  <p style={{ color: m.color }} className="ml-6 shrink-0 font-mono text-xl font-black">
                    {m.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="border-t border-[#D4AF37]/18 bg-[#D4AF37]/[0.03] px-7 py-5">
              <p className="text-xs leading-6 text-[#F6DA87]/65">
                With a 1:8 referral ratio and zero paid acquisition at scale, CAC remains near zero while LTV compounds with each subscription upsell.
              </p>
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
const competitorRows = [
  { name: 'V1CE / Popl', what: 'Sell premium NFC plastic', moat: 'None — no data layer', chip: 'Hardware' },
  { name: 'HiHello', what: 'Digital business card app', moat: 'Contact management only', chip: 'Contact Mgmt' },
  { name: 'Linktree', what: 'Link-in-bio aggregator', moat: 'Passive link clicks', chip: 'Links' },
  { name: 'Card-Social', what: 'Hyper-local Zero-Party Data OS', moat: '★ The land beneath the market', chip: 'Data Moat', highlight: true },
];

const acquirers = [
  { name: 'Zillow', reason: 'Local real estate demand signals — most precise geolocation data commercially available.' },
  { name: 'Salesforce', reason: 'Intent-rich, consent-first contact data at scale, replacing expensive third-party data enrichment.' },
  { name: 'Google / Apple', reason: 'Hyper-local keyword demand maps that compete directly with Google Maps Business Profiles.' },
];

function DataMoat() {
  return (
    <Reveal>
      <section id="inv-moat" className="scroll-mt-36">
        <SectionLabel letter="E" eyebrow="Exit Strategy · Valuation Driver" title='The Moat: "Digital Land"' />

        <p className="mb-14 max-w-3xl border-l-[3px] border-[#D4AF37] pl-7 text-lg font-semibold leading-8 text-white/72">
          V1CE and Popl sell plastic. We are acquiring the most accurate hyper-local dataset in the world — and we do it with user consent, at zero cost.
        </p>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Competitor table */}
          <div className="overflow-hidden rounded-[1.85rem] border border-white/[0.08] bg-[#080808]/90 backdrop-blur-2xl">
            <div className="border-b border-white/[0.07] px-7 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">Competitive Landscape</p>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {competitorRows.map((r) => (
                <div
                  key={r.name}
                  style={r.highlight ? { borderLeftColor: GOLD, borderLeftWidth: '3px' } : {}}
                  className={`group flex items-start gap-5 px-7 py-5 transition-colors duration-150 hover:bg-[#D4AF37]/[0.04] ${r.highlight ? 'bg-[#D4AF37]/[0.06]' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className={`text-sm font-bold ${r.highlight ? 'text-[#F6DA87]' : 'text-white/75'}`}>{r.name}</p>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${r.highlight ? 'border-[#D4AF37]/50 text-[#D4AF37]' : 'border-white/10 text-white/30'}`}>
                        {r.chip}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-white/35">{r.what}</p>
                    <p className={`mt-1.5 text-xs font-semibold ${r.highlight ? 'text-[#F6DA87]/85' : 'text-white/30'}`}>{r.moat}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Data moat explanation + acquirers */}
          <div className="flex flex-col gap-5">
            <div className="rounded-[1.85rem] border border-[#D4AF37]/28 bg-[linear-gradient(145deg,rgba(212,175,55,0.11),rgba(8,8,8,0.92))] p-8 backdrop-blur-2xl sm:p-9">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#F6DA87]/70">The Thesis</p>
              <p className="mt-5 text-sm leading-8 text-white/62">
                A real estate investor understands the value of land. Card-Social is buying <strong className="text-white">digital land</strong> — hyper-local intent data that doesn&apos;t exist anywhere else, collected with full user consent (Zero-Party Data). After 3 years of user activity, our Social Market will hold the most precise real-time map of local economic demand ever assembled: who is searching for what, exactly where, right now.
              </p>
              <p className="mt-5 text-sm leading-8 text-white/62">
                In year 3+, <strong className="text-[#F6DA87]">our company won&apos;t be valued on subscriptions — it will be valued on data.</strong> The comps for that transaction are in the hundreds of millions.
              </p>
            </div>

            {/* Potential acquirers */}
            <div className="overflow-hidden rounded-[1.85rem] border border-white/[0.08] bg-[#090909]/85 backdrop-blur-2xl">
              <div className="border-b border-white/[0.07] px-7 py-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">Potential Strategic Acquirers (Yr 3–5)</p>
              </div>
              <div className="divide-y divide-white/[0.05]">
                {acquirers.map((a) => (
                  <div key={a.name} className="group px-7 py-5 transition-colors hover:bg-[#D4AF37]/[0.04]">
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
 *  Shared heading component                                        *
 * ─────────────────────────────────────────────────────────────── */
function SectionLabel({ letter, eyebrow, title }: { letter: string; eyebrow: string; title: string }) {
  return (
    <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-10">
      <div className="flex h-[4.75rem] w-[4.75rem] shrink-0 items-center justify-center rounded-3xl border-2 border-[#D4AF37]/55 bg-gradient-to-br from-[#D4AF37]/22 to-transparent text-2xl font-black text-[#F6DA87] shadow-[0_0_40px_rgba(212,175,55,0.22)]">
        {letter}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.32em] text-[#D4AF37]">{eyebrow}</p>
        <h2 className="mt-3 text-[clamp(1.75rem,4vw,2.85rem)] font-black tracking-[-0.055em] text-white">{title}</h2>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── *
 *  Entry point                                                     *
 * ─────────────────────────────────────────────────────────────── */
export default function InvestorMetrics() {
  return (
    <>
      {/* ── Divider ─────────────────────────────────────────────── */}
      <Reveal>
        <div className="my-36 flex items-center gap-6">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#D4AF37]/35 to-transparent" />
          <div className="shrink-0 rounded-full border border-[#D4AF37]/45 bg-[#D4AF37]/09 px-7 py-2.5 text-[10px] font-black uppercase tracking-[0.36em] text-[#F6DA87]">
            Investor Relations
          </div>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-[#D4AF37]/35 to-transparent" />
        </div>
      </Reveal>

      {/* ── Hero strip ──────────────────────────────────────────── */}
      <Reveal>
        <div className="relative mb-28 overflow-hidden rounded-[2.4rem] border border-[#D4AF37]/35 bg-[#080808]/90 p-10 shadow-[0_0_120px_rgba(212,175,55,0.10),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-3xl sm:p-14">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(212,175,55,0.14)_0%,transparent_40%,rgba(246,218,135,0.05)_100%)]" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.44em] text-[#F6DA87]/70">Financial Intelligence · Q2 2026</p>
              <h2 className="mt-6 bg-gradient-to-br from-white via-[#fef7d9] to-[#c9a035] bg-clip-text text-[clamp(2rem,4.5vw,3.5rem)] font-black leading-[1.02] tracking-[-0.06em] text-transparent">
                Why This Investment<br />Cannot Lose.
              </h2>
              <p className="mt-7 max-w-2xl text-sm leading-8 text-white/55">
                Five data-driven sections answering the only question that matters to capital: <em className="font-bold not-italic text-white/80">how does my money multiply, and what is the exit?</em>
              </p>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-2">
              {[
                { label: 'Seed Ask', value: '$600K' },
                { label: 'Revenue Pillars', value: '4' },
                { label: 'Blended CAC', value: '≈ $0' },
                { label: 'Data Moat', value: 'Yr 3+' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-[1.4rem] border border-white/[0.08] bg-white/[0.03] px-5 py-4 text-center">
                  <p className="font-mono text-2xl font-black text-[#F6DA87]">{stat.value}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-white/36">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      {/* ── A–E: core investor sections ──────────────────────── */}
      <div className="grid gap-[7.5rem]">
        <CapitalAllocation />
        <RevenueStreams />
        <LegacyProgram />
        <NetworkEffect />
        <DataMoat />
      </div>

      {/* ── F–J + CTA: extended sections ─────────────────────── */}
      <div className="mt-[7.5rem] grid gap-[7.5rem]">
        <CompetitiveAnalysis />
        <MarketSizing />
        <FinancialProjections />
        <TeamFounders />
        <TractionSlide />
        <InvestorCTA />
      </div>
    </>
  );
}

export const investorTocItems = [
  { id: 'inv-capital', label: 'A. Capital Allocation' },
  { id: 'inv-revenue', label: 'B. Revenue Streams' },
  { id: 'inv-legacy', label: 'C. Legacy Program' },
  { id: 'inv-network', label: 'D. Network Effect · CAC' },
  { id: 'inv-moat', label: 'E. The Moat · Exit' },
  ...extendedTocItems,
];
