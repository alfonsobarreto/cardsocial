'use client';

import { motion, type Variants } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';

/* ─── tokens ──────────────────────────────────────────────────── */
const G = '#D4AF37';
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

/* ═══════════════════════════════════════════════════════════════ *
 *  F — COMPETITIVE ANALYSIS                                       *
 * ═══════════════════════════════════════════════════════════════ */
const competitors = [
  {
    name: 'Popl',
    chip: 'CRM Layer',
    theirWeapon: 'Directorio Corporativo — conectan contactos escaneados directamente con CRMs para equipos de ventas.',
    ourDestroyer:
      'Sincronización Corporativa en Tiempo Real: Popl es estático. En Card-Social, al tocar la tarjeta NFC el usuario elige en tiempo real cuál perfil comparte (personal, negocios, influencer). Nuestro nivel Enterprise usa bóvedas compartidas para que toda la fuerza de ventas tenga información homologada y controlada.',
    investorAngle: 'Ellos venden libretas de direcciones corporativas; nosotros vendemos infraestructura de comunicación controlada jerárquicamente.',
  },
  {
    name: 'Linq',
    chip: 'Link-in-bio',
    theirWeapon: 'Landing Pages Expuestas — incrustan catálogos y enlaces en el perfil digital, pero los datos personales quedan a la vista de todos.',
    ourDestroyer:
      '"The Vault" y Privacidad VoIP: Linq expone tu teléfono. Card-Social almacena todo en una Bóveda ("The Vault") y enmascara los datos visualmente usando "IconoDatas". Si alguien quiere llamarte, usa nuestro sistema VoIP App-to-App, protegiendo tu número real para que no caiga en bases de datos ajenas.',
    investorAngle: 'Ellos te exponen en una vitrina de cristal; nosotros te operamos desde una caja fuerte de alta seguridad (The Vault).',
  },
  {
    name: 'Blinq',
    chip: 'Frictionless QR',
    theirWeapon: 'Compartir sin Fricción — códigos QR rápidos para distribuir contactos masivamente en cualquier lugar.',
    ourDestroyer:
      'Smart Cards (QR de Expiración): Blinq regala tus datos permanentemente. Card-Social divide el juego: "Smart Cards" para contacto físico con QR temporal que expira en 2 minutos. "Business Cards" (QR permanente) para masificación en volantes, protegiendo el rostro e identidad del titular.',
    investorAngle: 'Ellos regalan el acceso a tu propiedad; nosotros emitimos pases de visitante con tiempo límite para máxima seguridad.',
  },
  {
    name: 'HiHello',
    chip: 'Paper Digitizer',
    theirWeapon: 'Escaneo de Papel y Software — aplicación pura para digitalizar contactos sin necesidad de hardware.',
    ourDestroyer:
      '"Social Market" (Buscador Hiperlocal): HiHello solo guarda contactos. Card-Social usa "Business Cards" con 20 palabras clave y ubicación GPS invisible para alimentar un motor de búsqueda en radio de 25 millas. Al buscar un servicio, el sistema escanea primero si un amigo o familiar lo ofrece — economía circular que elimina el costo de adquisición.',
    investorAngle: 'Ellos digitalizan el pasado (tarjetas de papel); nosotros creamos economías de vecindario que se mueven con el usuario.',
  },
  {
    name: 'V1CE',
    chip: 'Luxury Hardware',
    theirWeapon: 'Hardware de Lujo Físico — tarjetas premium de metal y madera para dar estatus visual.',
    ourDestroyer:
      'Evolución Dinámica y Card-Studio: V1CE vende un plástico estático. Las tarjetas NFC Premium de Card-Social se vinculan a un perfil que evoluciona ("Tú cambias, tu tarjeta cambia"). Además, generamos microtransacciones (In-App Purchases) vendiendo Skins, colores y estilos en nuestra tienda virtual para que personalicen su diseño para siempre.',
    investorAngle: 'Ellos ganan dinero vendiendo una tarjeta física una sola vez; nosotros vendemos el hardware y luego cobramos microtransacciones constantes por la estética digital.',
  },
];

export function CompetitiveAnalysis() {
  return (
    <Rev>
      <section id="inv-competitive" className="scroll-mt-36">
        <SL letter="F" eyebrow="Market Positioning" title="Competitive Landscape" />
        <p className="mb-10 max-w-3xl border-l-[3px] border-[#D4AF37] pl-7 text-base font-semibold leading-8 text-white/68">
          Five incumbents. Five structural weaknesses. One platform that destroys each of them on their own battlefield.
        </p>

        {/* Desktop: full table */}
        <div className="hidden overflow-hidden rounded-[1.85rem] border border-white/[0.08] bg-[#080808]/92 shadow-[0_30px_90px_rgba(0,0,0,0.5)] backdrop-blur-2xl lg:block">
          {/* Header */}
          <div className="grid grid-cols-[9rem_1fr_1fr_1fr] gap-px border-b border-white/[0.07] bg-white/[0.04] px-0">
            {['Competitor', 'Their Best Weapon', 'Card-Social Destroyer', 'Investor Translation'].map((h, i) => (
              <div key={h} className={`px-6 py-4 text-[9px] font-black uppercase tracking-[0.28em] ${i === 2 ? 'text-[#D4AF37]/70' : 'text-white/28'}`}>
                {h}
              </div>
            ))}
          </div>

          <motion.div variants={st} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.05 }} className="divide-y divide-white/[0.05]">
            {competitors.map((c) => (
              <motion.div
                key={c.name}
                variants={rv}
                className="group grid grid-cols-[9rem_1fr_1fr_1fr] gap-px transition-colors duration-200 hover:bg-[#D4AF37]/[0.035]"
              >
                {/* Name */}
                <div className="flex flex-col justify-center gap-2 px-6 py-6">
                  <p className="text-base font-black text-white/80 group-hover:text-white">{c.name}</p>
                  <span className="w-fit rounded-full border border-white/10 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white/30">
                    {c.chip}
                  </span>
                </div>
                {/* Their weapon */}
                <div className="px-6 py-6">
                  <p className="text-xs leading-6 text-white/40">{c.theirWeapon}</p>
                </div>
                {/* Destroyer */}
                <div className="border-l border-[#D4AF37]/15 bg-[#D4AF37]/[0.025] px-6 py-6 group-hover:bg-[#D4AF37]/[0.05]">
                  <p className="text-xs leading-6 text-white/65">{c.ourDestroyer}</p>
                </div>
                {/* Investor angle */}
                <div className="px-6 py-6">
                  <p className="text-xs font-semibold italic leading-6 text-[#F6DA87]/75">&ldquo;{c.investorAngle}&rdquo;</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Bottom bar */}
          <div className="border-t border-[#D4AF37]/18 bg-[#D4AF37]/[0.04] px-7 py-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#F6DA87]/55">Card-Social — the only platform competing across all five dimensions simultaneously</p>
          </div>
        </div>

        {/* Mobile: cards */}
        <motion.div variants={st} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid gap-5 lg:hidden">
          {competitors.map((c) => (
            <motion.article key={c.name} variants={rv} className="overflow-hidden rounded-[1.85rem] border border-white/[0.09] bg-[#0d0d0d]/85 backdrop-blur-2xl">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
                <div className="flex items-center gap-3">
                  <p className="font-black text-white">{c.name}</p>
                  <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white/30">{c.chip}</span>
                </div>
              </div>
              <div className="grid gap-0 divide-y divide-white/[0.06]">
                <div className="px-6 py-5">
                  <p className="mb-2 text-[9px] font-black uppercase tracking-[0.26em] text-white/28">Their weapon</p>
                  <p className="text-xs leading-6 text-white/45">{c.theirWeapon}</p>
                </div>
                <div className="bg-[#D4AF37]/[0.04] px-6 py-5">
                  <p className="mb-2 text-[9px] font-black uppercase tracking-[0.26em] text-[#D4AF37]/70">Card-Social destroyer</p>
                  <p className="text-xs leading-6 text-white/65">{c.ourDestroyer}</p>
                </div>
                <div className="px-6 py-5">
                  <p className="mb-2 text-[9px] font-black uppercase tracking-[0.26em] text-white/28">Investor angle</p>
                  <p className="text-xs font-semibold italic leading-6 text-[#F6DA87]/75">&ldquo;{c.investorAngle}&rdquo;</p>
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
const markets = [
  {
    label: 'TAM',
    name: 'Total Addressable Market',
    value: '$243B',
    sub: 'Professional networking + Local commerce + SaaS contact management (Global)',
    sources: ['Digital business card market CAGR 26% → $14.7B by 2029', 'Local commerce intent advertising ~$180B', 'B2B SaaS contact management ~$48B'],
    ring: 3,
    color: '#334155',
    textColor: 'text-white/38',
  },
  {
    label: 'SAM',
    name: 'Serviceable Addressable Market',
    value: '$18.4B',
    sub: 'North America + Latin America — digital-first SMBs + mobile-native professionals',
    sources: ['~22M SMBs in target geographies', 'Avg. $840/yr addressable spend on networking + local marketing'],
    ring: 2,
    color: GD,
    textColor: 'text-white/60',
  },
  {
    label: 'SOM',
    name: 'Serviceable Obtainable Market',
    value: '$420M',
    sub: 'Realistic 3-year target — 250k paying users × $140 ARPU/yr + Enterprise contracts',
    sources: ['Conservative 1.4% SAM capture by Y3', 'Based on comparable SaaS comps at seed stage'],
    ring: 1,
    color: G,
    textColor: 'text-[#F6DA87]',
  },
];

export function MarketSizing() {
  return (
    <Rev>
      <section id="inv-market" className="scroll-mt-36">
        <SL letter="G" eyebrow="Opportunity Size" title="Market Sizing — TAM / SAM / SOM" />

        <div className="grid gap-5 lg:grid-cols-3">
          {markets.map((m, i) => (
            <motion.article
              key={m.label}
              variants={rv}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              style={{ '--m-color': m.color } as React.CSSProperties}
              className="relative overflow-hidden rounded-[1.85rem] border border-white/[0.09] bg-[#0a0a0a]/88 p-8 backdrop-blur-2xl transition duration-300 hover:border-[var(--m-color)]/45"
            >
              {/* Depth ring indicator */}
              <div className="mb-6 flex items-center gap-3">
                {Array.from({ length: 3 }).map((_, ri) => (
                  <div
                    key={ri}
                    style={{ background: ri < 3 - i ? m.color : 'transparent', borderColor: m.color + '66' }}
                    className="h-3 w-3 rounded-full border"
                  />
                ))}
              </div>

              <p style={{ color: m.color }} className="font-mono text-xs font-black uppercase tracking-[0.34em]">
                {m.label}
              </p>
              <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">{m.value}</p>
              <p className="mt-1 text-[11px] font-bold text-white/35">{m.name}</p>

              <div className="my-6 h-px bg-white/[0.07]" />

              <p className={`text-sm leading-7 ${m.textColor}`}>{m.sub}</p>

              <ul className="mt-5 grid gap-2">
                {m.sources.map((s) => (
                  <li key={s} className="flex gap-2 text-[11px] leading-5 text-white/35">
                    <span style={{ color: m.color }} className="mt-[3px] shrink-0 text-[8px]">◆</span>
                    {s}
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
        </div>

        {/* Visual funnel bar */}
        <div className="mt-10 overflow-hidden rounded-[1.5rem] border border-white/[0.07] bg-[#080808]/80 p-6">
          <p className="mb-5 text-[9px] font-black uppercase tracking-[0.3em] text-white/28">Market Capture Funnel</p>
          <div className="grid gap-3">
            {[
              { label: 'TAM', pct: 100, value: '$243B', color: '#334155' },
              { label: 'SAM', pct: 7.6, value: '$18.4B', color: GD },
              { label: 'SOM (Y3 target)', pct: 0.17, value: '$420M', color: G },
            ].map((bar) => (
              <div key={bar.label} className="flex items-center gap-5">
                <span className="w-28 shrink-0 font-mono text-[11px] text-white/45">{bar.label}</span>
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
const projYears = [
  {
    year: 'Year 1',
    tag: '2026 — Activation',
    users: '8,500',
    mrr: '$42K',
    arr: '$504K',
    driver: 'Waitlist conversion + Product-led growth',
    nfc: '$85K',
    studio: '$18K',
    radar: '$6K',
    enterprise: '$0',
    note: 'Seed capital deployed. Focus: product-market fit + first 10 Enterprise accounts.',
    highlight: false,
  },
  {
    year: 'Year 2',
    tag: '2027 — Scale',
    users: '42,000',
    mrr: '$210K',
    arr: '$2.52M',
    driver: 'Legacy Program virality + Enterprise pipeline',
    nfc: '$320K',
    studio: '$140K',
    radar: '$95K',
    enterprise: '$180K',
    note: 'Series A target. Social Market user density creates compounding local value.',
    highlight: false,
  },
  {
    year: 'Year 3',
    tag: '2028 — Dominance',
    users: '185,000',
    mrr: '$925K',
    arr: '$11.1M',
    driver: 'Enterprise SaaS + Data licensing + Market Radar upsell',
    nfc: '$1.1M',
    studio: '$780K',
    radar: '$640K',
    enterprise: '$2.4M',
    note: 'Data asset valuation thesis kicks in. Strategic acquirer conversations begin.',
    highlight: true,
  },
];

export function FinancialProjections() {
  return (
    <Rev>
      <section id="inv-projections" className="scroll-mt-36">
        <SL letter="H" eyebrow="Conservative Model · Seed Stage" title="Financial Projections Y1 – Y3" />

        <p className="mb-12 max-w-2xl text-sm leading-7 text-white/42">
          Conservative model. No viral outlier assumptions. Based on 1.4% SAM capture by Year 3 and comparable SaaS CAC/LTV ratios at seed stage.
        </p>

        {/* Year cards */}
        <div className="grid gap-5 lg:grid-cols-3">
          {projYears.map((y) => (
            <motion.article
              key={y.year}
              variants={rv}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className={`relative overflow-hidden rounded-[1.85rem] border p-8 backdrop-blur-2xl ${
                y.highlight
                  ? 'border-[#D4AF37]/45 bg-[linear-gradient(145deg,rgba(212,175,55,0.13),rgba(10,10,10,0.92)_55%)] shadow-[0_0_90px_rgba(212,175,55,0.13)]'
                  : 'border-white/[0.08] bg-[#0e0e0e]/80'
              }`}
            >
              {y.highlight && (
                <div className="absolute right-6 top-6 rounded-full border border-[#D4AF37]/50 bg-[#D4AF37]/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.3em] text-[#F6DA87]">
                  Target Exit
                </div>
              )}
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#D4AF37]/75">{y.tag}</p>
              <p className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">{y.year}</p>

              <div className="my-7 grid grid-cols-2 gap-3">
                {[
                  { label: 'Paid Users', val: y.users },
                  { label: 'MRR', val: y.mrr },
                  { label: 'ARR', val: y.arr },
                  { label: 'Primary Driver', val: '' },
                ].map((stat) =>
                  stat.label === 'Primary Driver' ? null : (
                    <div key={stat.label} className={`rounded-2xl border px-4 py-4 ${y.highlight ? 'border-[#D4AF37]/22 bg-[#D4AF37]/06' : 'border-white/[0.07] bg-white/[0.02]'}`}>
                      <p className="text-[9px] uppercase tracking-[0.22em] text-white/30">{stat.label}</p>
                      <p className={`mt-1.5 font-mono text-xl font-black ${y.highlight ? 'text-[#F6DA87]' : 'text-white'}`}>{stat.val}</p>
                    </div>
                  ),
                )}
              </div>

              <div className="h-px bg-white/[0.07]" />

              {/* Revenue breakdown */}
              <div className="mt-6 grid gap-2">
                <p className="text-[9px] font-black uppercase tracking-[0.24em] text-white/28">Revenue Mix</p>
                {[
                  { label: 'NFC Hardware', val: y.nfc },
                  { label: 'Card-Studio', val: y.studio },
                  { label: 'Market Radar', val: y.radar },
                  { label: 'Enterprise', val: y.enterprise },
                ].map((r) => (
                  <div key={r.label} className="flex items-center justify-between">
                    <span className="text-xs text-white/38">{r.label}</span>
                    <span className={`font-mono text-xs font-bold ${y.highlight ? 'text-[#F6DA87]/80' : 'text-white/55'}`}>{r.val}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <p className="text-[11px] leading-5 text-white/38">{y.note}</p>
              </div>
            </motion.article>
          ))}
        </div>

        {/* Bar chart visual */}
        <div className="mt-10 overflow-hidden rounded-[1.5rem] border border-white/[0.07] bg-[#080808]/80 p-7">
          <p className="mb-8 text-[9px] font-black uppercase tracking-[0.3em] text-white/28">ARR Trajectory</p>
          <div className="flex items-end gap-6" style={{ height: '120px' }}>
            {[
              { label: 'Y1', arr: 504_000, max: 11_100_000 },
              { label: 'Y2', arr: 2_520_000, max: 11_100_000 },
              { label: 'Y3', arr: 11_100_000, max: 11_100_000 },
            ].map((bar) => (
              <div key={bar.label} className="flex flex-1 flex-col items-center gap-3">
                <p className="font-mono text-[10px] text-[#F6DA87]/60">
                  ${(bar.arr / 1_000_000).toFixed(1)}M
                </p>
                <div className="relative w-full overflow-hidden rounded-t-xl bg-white/[0.05]" style={{ height: '90px' }}>
                  <motion.div
                    initial={{ scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 * [0, 1, 2].indexOf(bar.label === 'Y1' ? 0 : bar.label === 'Y2' ? 1 : 2) }}
                    style={{
                      originY: 1,
                      height: `${(bar.arr / bar.max) * 100}%`,
                      background: bar.arr === bar.max
                        ? `linear-gradient(180deg, ${GL}, ${G})`
                        : `linear-gradient(180deg, rgba(212,175,55,0.5), rgba(168,123,31,0.5))`,
                    }}
                    className="absolute bottom-0 left-0 right-0 rounded-t-xl"
                  />
                </div>
                <p className="font-mono text-xs font-black text-white/45">{bar.label}</p>
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

/** Replace TEAM_MEMBERS with real data. */
const TEAM_MEMBERS = [
  {
    initials: 'AB',
    name: 'Alfonso Barreto',
    role: 'CEO & Co-Founder',
    bio: 'Replace with 2–3 sentences: background, domain expertise, why this problem.',
    tags: ['Vision', 'Product', 'Sales'],
    placeholder: true,
  },
  {
    initials: 'CT',
    name: 'CTO / Co-Founder',
    role: 'Chief Technology Officer',
    bio: 'Replace with 2–3 sentences: engineering background, tech stack mastery, relevant exits or projects.',
    tags: ['Engineering', 'Architecture', 'Security'],
    placeholder: true,
  },
  {
    initials: 'RR',
    name: 'Renzo Reyes Rocha',
    role: 'Enterprise & Partnerships',
    bio: 'Replace with 2–3 sentences: corporate sales experience, network in target verticals.',
    tags: ['B2B', 'Enterprise', 'Real Estate'],
    placeholder: true,
  },
];

export function TeamFounders() {
  return (
    <Rev>
      <section id="inv-team" className="scroll-mt-36">
        <SL letter="I" eyebrow="The People" title="Team & Advisors" />

        <div className="mb-10 rounded-[1.5rem] border border-[#D4AF37]/25 bg-[#D4AF37]/05 px-7 py-5">
          <p className="text-xs leading-6 text-[#F6DA87]/70">
            <strong className="font-black">Para completar:</strong> reemplaza los datos en{' '}
            <span className="font-mono">components/landing/InvestorExtended.tsx</span> → array{' '}
            <span className="font-mono">TEAM_MEMBERS</span>. Añade foto en{' '}
            <span className="font-mono">public/legal/executive-summary/team-[name].webp</span>.
          </p>
        </div>

        <motion.div variants={st} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {TEAM_MEMBERS.map((m) => (
            <motion.article
              key={m.initials}
              variants={rv}
              className="group relative overflow-hidden rounded-[1.85rem] border border-white/[0.09] bg-[#0d0d0d]/85 p-7 backdrop-blur-2xl transition duration-300 hover:border-[#D4AF37]/35"
            >
              <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[#D4AF37]/05 blur-3xl" />

              <div className="relative">
                {/* Avatar */}
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[1.5rem] border-2 border-[#D4AF37]/35 bg-gradient-to-br from-[#D4AF37]/20 to-transparent text-2xl font-black text-[#F6DA87] shadow-[0_0_32px_rgba(212,175,55,0.18)]">
                  {m.initials}
                </div>

                <p className="text-xl font-black tracking-tight text-white">{m.name}</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#D4AF37]/75">{m.role}</p>

                <p className={`mt-5 text-sm leading-7 ${m.placeholder ? 'italic text-white/28' : 'text-white/58'}`}>{m.bio}</p>

                <div className="mt-7 flex flex-wrap gap-2">
                  {m.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35 group-hover:border-[#D4AF37]/25 group-hover:text-[#F6DA87]/55">
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

/** Animated number ticker */
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
        const duration = 1400;
        const tick = (ts: number) => {
          if (!start) start = ts;
          const progress = Math.min((ts - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          if (el) el.textContent = `${prefix}${Math.round(eased * target).toLocaleString('en-US')}${suffix}`;
          if (progress < 1) requestAnimationFrame(tick);
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

/** ⚠️  UPDATE THESE with real numbers before sending to investors */
const TRACTION_STATS = [
  { label: 'Waitlist Signups', value: 7, suffix: '+', note: 'UPDATE with real count', highlight: true },
  { label: 'Countries Represented', value: 1, note: 'UPDATE', highlight: false },
  { label: 'Beta Invites Sent', value: 7, note: 'UPDATE', highlight: false },
  { label: 'Enterprise Pilots', value: 0, note: 'UPDATE', highlight: false },
];

const TIMELINE_MILESTONES = [
  { date: 'Q4 2024', label: 'Concept & Architecture', desc: 'Core Vault architecture designed. Smart / Business Card system prototyped.' },
  { date: 'Q1 2025', label: 'MVP Build', desc: 'First functional build. The Vault, QR expiry, Business Cards, Social Market search engine.' },
  { date: 'Q3 2025', label: 'Private Beta', desc: 'First closed beta cohort. NFC card prototype finalized. Card-Studio v1 launched.' },
  { date: 'Q1 2026', label: 'Web Platform Launch', desc: 'Investor landing, waitlist system, and Executive Summary published. Seed round initiated.' },
  { date: 'Q3 2026 →', label: 'Seed Deployment', desc: 'B2B sales team activation. Enterprise pipeline. Regional marketing across 6 languages.', future: true },
];

export function TractionSlide() {
  return (
    <Rev>
      <section id="inv-traction" className="scroll-mt-36">
        <SL letter="J" eyebrow="Proof of Demand · As of Q2 2026" title="Traction & Roadmap" />

        {/* Stats grid */}
        <div className="mb-10 rounded-[1.5rem] border border-[#D4AF37]/25 bg-[#D4AF37]/05 px-7 py-5">
          <p className="text-xs leading-6 text-[#F6DA87]/70">
            <strong className="font-black">Para completar:</strong> actualiza los valores en{' '}
            <span className="font-mono">TRACTION_STATS</span> con los números reales antes de enviar a inversionistas.
          </p>
        </div>

        <motion.div variants={st} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mb-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRACTION_STATS.map((s) => (
            <motion.div
              key={s.label}
              variants={rv}
              className={`group relative overflow-hidden rounded-[1.85rem] border p-8 backdrop-blur-2xl transition duration-300 ${
                s.highlight
                  ? 'border-[#D4AF37]/45 bg-[linear-gradient(145deg,rgba(212,175,55,0.13),rgba(10,10,10,0.92))] shadow-[0_0_60px_rgba(212,175,55,0.12)]'
                  : 'border-white/[0.08] bg-[#0e0e0e]/80 hover:border-[#D4AF37]/25'
              }`}
            >
              <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-[#D4AF37]/06 blur-3xl" />
              <p className={`relative font-mono text-5xl font-black ${s.highlight ? 'text-[#F6DA87]' : 'text-white'}`}>
                <Ticker target={s.value} suffix={s.suffix ?? ''} />
              </p>
              <p className="relative mt-4 text-sm font-bold text-white/55">{s.label}</p>
              <p className="relative mt-1.5 font-mono text-[10px] italic text-white/22">{s.note}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Timeline */}
        <div className="relative">
          <div className="absolute bottom-0 left-[1.75rem] top-0 w-[2px] bg-gradient-to-b from-[#D4AF37]/50 via-[#D4AF37]/25 to-transparent sm:left-[2rem]" />
          <div className="grid gap-5">
            {TIMELINE_MILESTONES.map((m, i) => (
              <motion.div
                key={m.date}
                variants={rv}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="grid grid-cols-[3.5rem_1fr] gap-6 sm:grid-cols-[4rem_1fr] sm:gap-10"
              >
                {/* Node */}
                <div className="flex flex-col items-center">
                  <div
                    style={
                      m.future
                        ? { borderColor: `${G}66`, borderStyle: 'dashed' }
                        : { background: `linear-gradient(135deg, ${GD}, ${G})`, boxShadow: `0 0 24px ${G}44` }
                    }
                    className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border-2 text-[10px] font-black text-black"
                  >
                    {m.future ? <span className="text-[#D4AF37] opacity-60">→</span> : <span>{String(i + 1).padStart(2, '0')}</span>}
                  </div>
                </div>

                {/* Content */}
                <div
                  className={`mb-5 rounded-[1.6rem] border p-6 backdrop-blur-xl ${
                    m.future
                      ? 'border-dashed border-[#D4AF37]/28 bg-[#D4AF37]/[0.04]'
                      : 'border-white/[0.08] bg-[#0f0f0f]/80'
                  }`}
                >
                  <p className={`font-mono text-[10px] font-black uppercase tracking-[0.28em] ${m.future ? 'text-[#D4AF37]' : 'text-white/35'}`}>
                    {m.date}
                  </p>
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
 *  CLOSING CTA — The Ask                                          *
 * ═══════════════════════════════════════════════════════════════ */
export function InvestorCTA() {
  return (
    <Rev>
      <section id="inv-cta" className="scroll-mt-36">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[2.85rem] border border-[#D4AF37]/40 bg-[#080808]/92 p-10 shadow-[0_0_160px_rgba(212,175,55,0.14),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-3xl sm:p-14 lg:p-16"
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(212,175,55,0.18)_0%,transparent_40%,rgba(246,218,135,0.06)_100%)]" />

          <div className="relative mx-auto max-w-4xl text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.44em] text-[#F6DA87]/65">The Ask</p>
            <h2 className="mt-8 bg-gradient-to-br from-white via-[#fef7d9] to-[#c9a035] bg-clip-text text-[clamp(2rem,5vw,3.75rem)] font-black leading-[1.02] tracking-[-0.06em] text-transparent">
              $600,000 Seed Round.
            </h2>
            <p className="mx-auto mt-8 max-w-2xl text-base leading-8 text-white/58">
              This is not a feature. This is infrastructure. We are building the operating system for local commerce and professional identity — a network that grows itself, and a data asset that appreciates with every user interaction.
            </p>
            <p className="mx-auto mt-5 max-w-2xl text-base font-semibold leading-8 text-white/75">
              In 3 years, when Zillow or Salesforce calls, they will want to buy the land. <span className="text-[#F6DA87]">You own a piece of that land today.</span>
            </p>

            <div className="mt-14 flex flex-wrap justify-center gap-4">
              <a
                href="/es#waitlist"
                className="inline-flex min-h-14 items-center justify-center rounded-full bg-gradient-to-r from-[#F6DA87] via-[#D4AF37] to-[#A87B1F] px-10 text-sm font-black uppercase tracking-[0.16em] text-black shadow-[0_0_44px_rgba(212,175,55,0.38)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_70px_rgba(212,175,55,0.55)]"
              >
                Schedule a Meeting
              </a>
              <a
                href="mailto:pochobs@gmail.com?subject=Card-Social Seed Round — Investment Inquiry"
                className="inline-flex min-h-14 items-center justify-center rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/08 px-10 text-sm font-black uppercase tracking-[0.16em] text-[#F6DA87] transition duration-300 hover:border-[#D4AF37]/70 hover:bg-[#D4AF37]/14"
              >
                Send Direct Inquiry
              </a>
            </div>

            {/* Closing metrics strip */}
            <div className="mt-14 grid grid-cols-2 gap-4 border-t border-white/[0.07] pt-12 sm:grid-cols-4">
              {[
                { val: '$600K', label: 'Seed Ask' },
                { val: '18 mo', label: 'Runway' },
                { val: '≈ $0', label: 'CAC' },
                { val: '4 Pillars', label: 'Revenue Streams' },
              ].map((s) => (
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

/* ─── TOC items export ────────────────────────────────────────── */
export const extendedTocItems = [
  { id: 'inv-competitive', label: 'F. Competitive Analysis' },
  { id: 'inv-market', label: 'G. Market Sizing (TAM/SAM/SOM)' },
  { id: 'inv-projections', label: 'H. Financial Projections' },
  { id: 'inv-team', label: 'I. Team & Advisors' },
  { id: 'inv-traction', label: 'J. Traction & Roadmap' },
  { id: 'inv-cta', label: '↗ The Ask' },
];
