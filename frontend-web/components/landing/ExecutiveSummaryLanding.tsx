'use client';

import { motion, type Variants } from 'framer-motion';
import { Inter } from 'next/font/google';
import { useState, type ReactNode } from 'react';

import InvestorMetrics, { investorTocItems } from './InvestorMetrics';
import {
  EXECUTIVE_IMAGE_HINTS,
  executiveStrategicBlocks,
  executiveSummarySections,
  type ExecutiveImageKey,
  type Section,
  type StrategicFlow,
} from './executiveSummaryContent';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter-exec',
  display: 'swap',
});

const reveal: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
};

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} className={className}>
      {children}
    </motion.div>
  );
}

function imageSrc(key: ExecutiveImageKey): string {
  const f = EXECUTIVE_IMAGE_HINTS[key].filename;
  return `/legal/executive-summary/${f}`;
}

function ExecutiveFigure({
  assetKey,
  aspectClass = 'aspect-[16/10]',
}: {
  assetKey: ExecutiveImageKey;
  aspectClass?: string;
}) {
  const hint = EXECUTIVE_IMAGE_HINTS[assetKey];
  const [loadedOk, setLoadedOk] = useState(false);
  const [broken, setBroken] = useState(false);
  const showPlaceholder = broken || !loadedOk;

  return (
    <figure className={`group relative mx-auto mt-10 w-full max-w-5xl overflow-hidden rounded-[2rem] border border-[#D4AF37]/30 bg-[#0A0A0A]/80 shadow-[0_0_70px_rgba(212,175,55,0.12)] ${aspectClass}`}>
      <div
        aria-hidden={!showPlaceholder}
        className={`absolute inset-0 z-[1] flex flex-col items-center justify-center gap-4 bg-[linear-gradient(145deg,#0d0d0d_0%,#050505_48%,#111111_100%)] p-10 text-center transition-opacity duration-500 ${showPlaceholder ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        <div className="rounded-full border border-dashed border-[#D4AF37]/55 px-6 py-2 font-mono text-[11px] tracking-wider text-[#F6DA87]/80">
          DROP ASSET HERE
        </div>
        <p className="max-w-lg text-sm leading-relaxed text-white/45">
          <span className="block font-mono text-xs text-[#D4AF37]/85">frontend-web/public/legal/executive-summary/</span>
          <span className="mt-2 block font-bold text-white/70">{hint.filename}</span>
          <span className="mt-2 block italic text-white/40">{hint.caption}</span>
        </p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- archivos opcionales en `public`; no queremos coupling al build */}
      <img
        src={imageSrc(assetKey)}
        alt={hint.caption}
        decoding="async"
        className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-500 ${showPlaceholder ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => {
          setBroken(false);
          setLoadedOk(true);
        }}
        onError={() => {
          setBroken(true);
          setLoadedOk(false);
        }}
      />
      <figcaption className="sr-only">{hint.caption}</figcaption>
    </figure>
  );
}

function SectionHeader({ num, eyebrow, title }: { num: number; eyebrow: string; title: string }) {
  return (
    <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-10">
      <div className="flex h-[4.75rem] w-[4.75rem] shrink-0 skew-y-[-4deg] items-center justify-center rounded-3xl border-2 border-[#D4AF37]/55 bg-[#D4AF37]/14 text-2xl font-black text-[#F6DA87] shadow-[0_0_40px_rgba(212,175,55,0.22)]">
        <span className="skew-y-[4deg]">{num.toString().padStart(2, '0')}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.32em] text-[#D4AF37]">{eyebrow}</p>
        <h2 className="mt-3 text-[clamp(1.75rem,4vw,2.85rem)] font-black tracking-[-0.055em] text-white">{title}</h2>
      </div>
    </div>
  );
}

function FlowCard({ flow }: { flow: StrategicFlow }) {
  return (
    <div className="grid gap-6 rounded-[1.85rem] border border-white/[0.08] bg-[#111111]/60 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl sm:p-8">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#F6DA87]/75">Qué es</p>
          <p className="mt-3 text-sm leading-7 text-white/68">{flow.queEs}</p>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#F6DA87]/75">Cómo funciona</p>
          <p className="mt-3 text-sm leading-7 text-white/68">{flow.comoFunciona}</p>
        </div>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#D4AF37]/28 to-transparent" />
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#F6DA87]/75">Valor estratégico</p>
        <ul className="mt-4 grid gap-3 text-sm leading-7 text-white/66">
          {flow.valorEstrategico.map((line, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-2 inline-block h-1 w-8 shrink-0 rounded-full bg-gradient-to-r from-[#F6DA87] to-[#D4AF37]" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/06 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#F6DA87]/75">Modelo de ingreso</p>
        <p className="mt-3 text-sm font-semibold leading-7 text-white/74">{flow.modeloIngreso}</p>
      </div>
    </div>
  );
}

function renderSection(s: Section) {
  const id = `s${s.num}`;

  switch (s.kind) {
    case 'narrative':
      return (
        <Reveal key={s.num}>
          <section id={id} className="scroll-mt-36">
            <SectionHeader num={s.num} eyebrow={s.eyebrow} title={s.title} />
            {s.image ? <ExecutiveFigure assetKey={s.image} /> : null}
            <div className="mt-12 space-y-8">
              {s.bullets.map((bullet, idx) =>
                idx === 0 ? (
                  <p key={idx} className="border-l-[3px] border-[#D4AF37] pl-6 text-lg font-semibold leading-8 text-white/76">
                    {bullet}
                  </p>
                ) : (
                  <div key={idx} className="rounded-[1.5rem] border border-white/[0.07] bg-[#090909]/74 p-6 shadow-[0_26px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:p-7">
                    <p className="text-sm leading-8 text-white/65">{bullet}</p>
                  </div>
                ),
              )}
            </div>
          </section>
        </Reveal>
      );
    case 'segments':
      return (
        <Reveal key={s.num}>
          <section id={id} className="scroll-mt-36">
            <SectionHeader num={s.num} eyebrow={s.eyebrow} title={s.title} />
            <p className="-mt-2 max-w-3xl text-sm leading-7 text-white/48">
              El producto está estratificado meticulosamente para atender distintas necesidades de networking y distribución de información:
            </p>
            <ul className="mt-10 grid gap-5">
              {s.bullets.map((bullet, idx) => (
                <motion.li
                  key={idx}
                  variants={reveal}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className="rounded-[1.6rem] border border-[#D4AF37]/28 bg-[linear-gradient(120deg,rgba(212,175,55,0.11),transparent_55%)] p-7 text-sm leading-7 text-white/70 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl"
                >
                  {bullet}
                </motion.li>
              ))}
            </ul>
            <div className="mt-10 grid gap-5 lg:grid-cols-2">
              <h3 className="sr-only">Negocios establecidos (Business Tier)</h3>
              {s.establishedExamples.map((ex) => (
                <article key={ex.sector} className="rounded-[1.65rem] border border-white/[0.1] bg-[#111]/70 p-7 backdrop-blur-2xl">
                  <div className="mb-5 inline-flex rounded-full border border-[#F6DA87]/30 bg-[#D4AF37]/09 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-[#F6DA87]">
                    Negocios Establecidos
                  </div>
                  <h4 className="text-xl font-black tracking-tight text-white">{ex.sector}</h4>
                  <p className="mt-4 text-sm leading-7 text-white/62">{ex.text}</p>
                </article>
              ))}
            </div>
          </section>
        </Reveal>
      );
    case 'tiers':
      return (
        <Reveal key={s.num}>
          <section id={id} className="scroll-mt-36">
            <SectionHeader num={s.num} eyebrow={s.eyebrow} title={s.title} />
            <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid gap-4 md:grid-cols-2">
              {s.tiers.map((t, i) => (
                <motion.article
                  key={t.name}
                  variants={reveal}
                  className={`rounded-[2rem] border p-8 backdrop-blur-2xl ${
                    i === s.tiers.length - 1
                      ? 'border-[#D4AF37]/45 bg-[#18140B]/90 shadow-[0_0_80px_rgba(212,175,55,0.14)] md:col-span-2 md:flex md:flex-row md:items-center md:gap-14'
                      : 'border-white/[0.09] bg-[#101010]/80'
                  }`}
                >
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#D4AF37]/38 bg-[#D4AF37]/13 text-[#F6DA87] md:mb-0">
                    {(i + 1).toString()}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black tracking-[-0.04em] text-white">{t.name}</h3>
                    <p className="mt-4 text-sm leading-7 text-white/62">{t.detail}</p>
                  </div>
                </motion.article>
              ))}
            </motion.div>
          </section>
        </Reveal>
      );
    case 'simpleLists':
      return (
        <Reveal key={s.num}>
          <section id={id} className="scroll-mt-36">
            <SectionHeader num={s.num} eyebrow={s.eyebrow} title={s.title} />
            <div className="grid gap-10 lg:grid-cols-[1fr,minmax(0,1fr)] lg:items-start lg:gap-14">
              <div className="min-w-0">
                {s.groups.map((g, gi) => (
                  <div key={gi}>
                    {g.subtitle ? <h3 className="mb-6 text-xl font-black text-[#F6DA87]">{g.subtitle}</h3> : null}
                    <ul className="grid gap-4">
                      {g.items.map((item, ii) => (
                        <li
                          key={ii}
                          className="relative rounded-2xl border border-white/[0.07] bg-[#121212]/70 py-5 pl-[1.85rem] pr-6 text-sm leading-7 text-white/64 backdrop-blur-xl before:absolute before:left-6 before:top-6 before:h-2 before:w-2 before:-translate-x-px before:rounded-full before:bg-[#D4AF37]"
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {s.image ? (
                <div className="lg:sticky lg:top-44">
                  <ExecutiveFigure assetKey={s.image} aspectClass="aspect-[4/3] min-h-[14rem]" />
                </div>
              ) : null}
            </div>
          </section>
        </Reveal>
      );
    case 'strategicFlows':
      return (
        <Reveal key={s.num}>
          <section id={id} className="scroll-mt-36">
            <SectionHeader num={s.num} eyebrow={s.eyebrow} title={s.title} />
            {s.imageBetween ? (
              <>
                <p className="max-w-prose text-sm leading-7 text-white/48">
                  Flujo estratégico dentro del bunker de datos Card-Social:
                </p>
                <ExecutiveFigure assetKey={s.imageBetween} />
              </>
            ) : null}
            <div className="mt-12 grid gap-8">
              {s.flows.map((flow, fi) => (
                <FlowCard key={fi} flow={flow} />
              ))}
            </div>
          </section>
        </Reveal>
      );
    default:
      return null;
  }
}

export default function ExecutiveSummaryLanding() {
  const toc = [
    ...executiveSummarySections.map((sec) => ({ id: `s${sec.num}`, label: `${sec.num}. ${sec.title}` })),
    ...executiveStrategicBlocks.map((b) => ({ id: `s${b.num}`, label: `${b.num}. ${b.title}` })),
    { id: 'investor-divider', label: '─── Investor Relations ───', divider: true },
    ...investorTocItems,
  ].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i) as Array<{ id: string; label: string; divider?: boolean }>;

  return (
    <div
      className={`${inter.variable} min-h-screen bg-[#030303] text-white antialiased selection:bg-[#D4AF37] selection:text-black`}
      style={{ fontFamily: 'var(--font-inter-exec), ui-sans-serif, system-ui, sans-serif' }}
    >
      <div className="pointer-events-none fixed inset-0 -z-30 bg-[#030303]" />
      <div className="pointer-events-none fixed inset-0 -z-20 opacity-[0.45] bg-[radial-gradient(ellipse_90%_50%_at_50%_-10%,rgba(212,175,55,0.22),transparent_55%),radial-gradient(ellipse_60%_40%_at_100%_75%,rgba(246,218,135,0.08),transparent_50%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.065] [background-image:repeating-linear-gradient(-18deg,rgba(255,255,255,0.5)_0,rgba(255,255,255,0.5)_1px,transparent_1px,transparent_48px)]" />

      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.08] bg-[#050505]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-[4.05rem] max-w-[1480px] items-center justify-between px-6 sm:px-10">
          <a href="/" className="text-xs font-black uppercase tracking-[0.32em] text-white transition hover:text-[#F6DA87]">
            Card-Social
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/09 px-4 py-1.5 font-mono text-[10px] tracking-widest text-[#F6DA87]/90 sm:inline">
              BMC · INTERNAL STRATEGIC
            </span>
            <a
              href="/es#waitlist"
              className="rounded-full bg-gradient-to-r from-[#F6DA87] via-[#D4AF37] to-[#A87B1F] px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-black shadow-[0_0_24px_rgba(212,175,55,0.28)]"
            >
              Waitlist
            </a>
          </div>
        </div>
      </nav>

      <aside className="pointer-events-none fixed bottom-12 right-10 z-40 hidden xl:block xl:pointer-events-auto">
        <div className="max-h-[60vh] w-72 overflow-y-auto rounded-[1.85rem] border border-white/[0.08] bg-[#090909]/90 p-5 shadow-[0_34px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <p className="mb-5 text-[9px] font-black uppercase tracking-[0.42em] text-[#F6DA87]/80">Índice</p>
          <ol className="space-y-2.5 text-[11px] leading-snug">
            {toc.map((item) =>
              item.divider ? (
                <li key={item.id} className="pt-3 pb-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-[#D4AF37]/55">{item.label}</span>
                </li>
              ) : (
                <li key={item.id}>
                  <a className="text-white/52 transition hover:text-[#F6DA87]" href={`#${item.id}`}>
                    {item.label}
                  </a>
                </li>
              ),
            )}
          </ol>
        </div>
      </aside>

      <main className="relative mx-auto w-full max-w-[1180px] px-6 pb-40 pt-[7.75rem] sm:px-10">
        <motion.header
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto mb-28 max-w-5xl"
        >
          <div className="absolute -left-[14%] -top-[18%] h-[22rem] w-[22rem] rounded-full bg-[#D4AF37]/07 blur-[100px]" />
          <div className="absolute -bottom-[30%] -right-[8%] h-[18rem] w-[18rem] rounded-full bg-[#246]/10 blur-[90px]" />
          <div className="relative overflow-hidden rounded-[2.85rem] border border-[#D4AF37]/35 bg-[#080808]/90 p-10 shadow-[0_0_120px_rgba(212,175,55,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-3xl sm:p-14 lg:p-16">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(212,175,55,0.16)_0%,transparent_38%,transparent_62%,rgba(246,218,135,0.06)_100%)]" />
            <p className="relative text-xs font-black uppercase tracking-[0.42em] text-[#F6DA87]">Documento estratégico</p>
            <h1 className="relative mt-8 bg-gradient-to-br from-white via-[#fef7d9] to-[#c9a035] bg-clip-text text-[clamp(2.2rem,5.5vw,4.05rem)] font-black leading-[0.98] tracking-[-0.06em] text-transparent">
              Business Model Canvas
            </h1>
            <p className="relative mt-10 max-w-3xl border-l-[3px] border-[#D4AF37] pl-7 text-xl font-semibold leading-8 text-white/78">
              Card-Social — documento estratégico para equipo de marketing y desarrollo de marca.
            </p>
            <div className="relative mt-12 flex flex-wrap items-center gap-4">
              <div className="rounded-full border border-white/[0.1] px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.26em] text-white/52">
              Confidencial · Inversionistas · Q2 2026
              </div>
              <div className="h-px flex-1 min-w-[3rem] bg-gradient-to-r from-[#D4AF37]/50 to-transparent" />
            </div>
          </div>
        </motion.header>

        <div className="relative mb-36 overflow-hidden rounded-[2.75rem] border border-white/[0.07] bg-[#090909]/60 p-10 backdrop-blur-2xl sm:p-14">
          <Reveal>
            <p className="text-center text-xs font-black uppercase tracking-[0.34em] text-[#D4AF37]/90">Blueprint operativo — 01 → 09</p>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['VP', 'Propuesta'],
                ['CS', 'Segmentos'],
                ['RS', 'Ingresos'],
                ['CH', 'Canales'],
                ['CR', 'Relaciones'],
                ['KA', 'Actividades'],
                ['KR', 'Recursos'],
                ['KP', 'Alianzas'],
                ['$', 'Costos'],
              ].map(([code, word], idx) => (
                <motion.div
                  key={code}
                  variants={reveal}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className={`flex items-center gap-6 rounded-[1.85rem] border px-7 py-6 transition duration-300 hover:border-[#D4AF37]/45 ${
                    idx === 0 ? 'border-[#D4AF37]/42 bg-[#D4AF37]/07' : 'border-white/[0.08] bg-[#0c0c0c]/80'
                  }`}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl border border-[#D4AF37]/35 bg-black/40 font-mono text-sm font-black text-[#F6DA87]">{code}</span>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/42">Motor {idx + 1}</p>
                    <p className="mt-1 text-lg font-black text-white">{word}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </Reveal>
        </div>

        <div className="grid gap-[7.5rem]">{executiveSummarySections.map(renderSection)}</div>

        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mt-36 grid gap-[9rem]">
          {executiveStrategicBlocks.map((block) => (
            <motion.section key={block.num} variants={reveal} id={`s${block.num}`} className="scroll-mt-36">
              <SectionHeader num={block.num} eyebrow={block.eyebrow} title={block.title} />
              {block.image ? <ExecutiveFigure assetKey={block.image} /> : null}
              <div className="mt-14 grid gap-6 lg:grid-cols-[1fr,1fr]">
                <div className="rounded-[1.85rem] border border-white/[0.08] bg-[#111111]/72 p-7 backdrop-blur-2xl sm:p-8">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#F6DA87]/75">Qué es</p>
                  <p className="mt-4 text-sm leading-8 text-white/66">{block.queEs}</p>
                  <div className="mt-10 h-px bg-white/[0.06]" />
                  <p className="mt-8 text-[10px] font-black uppercase tracking-[0.24em] text-[#F6DA87]/75">Cómo funciona</p>
                  <p className="mt-4 text-sm leading-8 text-white/66">{block.comoFunciona}</p>
                </div>
                <div className="flex flex-col gap-6">
                  <div className="flex-1 rounded-[1.85rem] border border-[#D4AF37]/30 bg-[#18140e]/74 p-7 backdrop-blur-2xl sm:p-8">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#F6DA87]/75">Valor estratégico</p>
                    <ul className="mt-5 grid gap-4">
                      {block.valorBullets.map((v, vi) => (
                        <li key={vi} className="flex gap-3 text-sm leading-7 text-white/67">
                          <span className="font-black text-[#D4AF37]">{vi + 1}.</span>
                          {v}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-[1.85rem] border border-white/[0.08] bg-[#090909]/80 p-7 shadow-[inset_0_0_0_1px_rgba(212,175,55,0.08)] backdrop-blur-2xl sm:p-8">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#F6DA87]/75">Modelo de ingreso</p>
                    <p className="mt-5 text-base font-semibold leading-8 text-white/76">{block.modeloIngreso}</p>
                  </div>
                </div>
              </div>
            </motion.section>
          ))}
        </motion.div>

        <InvestorMetrics />

        <Reveal>
          <footer className="mt-44 border-t border-white/[0.08] pt-16 text-center text-sm text-white/38">
            <p className="font-bold text-white/55">Card-Social®</p>
            <p className="mt-4 max-w-xl mx-auto">
              Esta página es material de trabajo interno preparado para alineación de marca e inversionistas. Las imágenes de producto pueden añadirse en{' '}
              <span className="font-mono text-[#D4AF37]/85">frontend-web/public/legal/executive-summary/</span>.
            </p>
            <div className="mt-12 flex justify-center gap-6 text-xs uppercase tracking-[0.2em]">
              <a href="/legal/terms" className="text-[#F6DA87]/85 hover:underline">
                Legal
              </a>
              <a href="/" className="text-[#F6DA87]/85 hover:underline">
                Home
              </a>
              <a href="/es#waitlist" className="text-[#F6DA87]/85 hover:underline">
                Lista de espera
              </a>
            </div>
          </footer>
        </Reveal>
      </main>
    </div>
  );
}
