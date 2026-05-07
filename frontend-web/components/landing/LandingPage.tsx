'use client';

import { Inter } from 'next/font/google';
import { motion, type Variants } from 'framer-motion';

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

const iconoDatas = [
  {
    title: 'URLs & Links',
    text: 'Social media and websites with auto-fetched icons.',
    icon: '↗',
  },
  {
    title: 'Emails',
    text: 'Direct, secure inbox routing.',
    icon: '@',
  },
  {
    title: 'Phones',
    text: 'Global country codes for direct dialing.',
    icon: '☎',
  },
  {
    title: 'Texts & Documents',
    text: 'Upload portfolios, menus, PDFs, and custom statements.',
    icon: '◇',
  },
  {
    title: 'The Ghost Link (VoIP)',
    text: 'Our crown jewel. Make and receive calls directly through the app without ever exposing your real phone number. Total privacy.',
    icon: '◌',
  },
];

const cardArchitecture = [
  {
    title: 'Smart Cards.',
    text: 'Max security, 2-minute expiring QR codes for face-to-face sharing.',
    badge: 'Security',
  },
  {
    title: 'Business Cards.',
    text: 'Permanent QR codes, SEO keywords, and GPS location to rank in your local area.',
    badge: 'Discovery',
  },
  {
    title: 'CardStudio.',
    text: 'Stand out from the crowd. Access our premium virtual store to purchase custom icon packs, luxury color palettes, and exclusive visual Themes (Skins). Your digital presence should look exactly as premium as the services you offer.',
    badge: 'Luxury UI',
  },
];

const socialMarketUseCases = [
  {
    title: 'The Real Estate Developer.',
    text: 'Dominate the housing market. Use the Market Radar to see exactly which zip codes are searching for "Property Investments" and position your agency directly in front of high-net-worth buyers.',
  },
  {
    title: 'The Neighborhood Creator.',
    text: 'Create a market out of thin air. Cook great food? Set up a "Home-Cooked Meals" Business Card. Offer lawn mowing or dog walking? Instantly become visible to hundreds of neighbors in your immediate radius, eliminating client acquisition costs.',
  },
];

const tiers = [
  {
    name: 'Free',
    text: 'For the casual user. Secure your Vault, create Smart Cards, and keep your social and academic circles organized.',
  },
  {
    name: 'Influencer',
    text: 'For creators and growing professionals. Unlock more data capacity and your first Business Card to start capturing an audience.',
  },
  {
    name: 'Business',
    text: 'For established professionals and local businesses. Multiple Business Cards for different services, advanced analytics, and full entry into the Social Market.',
  },
];

function Reveal({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={reveal}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.22 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function LandingPage() {
  return (
    <div
      className={`${inter.variable} min-h-screen overflow-hidden bg-[#050505] text-white antialiased selection:bg-[#D4AF37] selection:text-black`}
      style={{ fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
    >
      <main className="relative">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_0%,rgba(212,175,55,0.16),transparent_30%),radial-gradient(circle_at_84%_10%,rgba(246,218,135,0.10),transparent_28%),linear-gradient(180deg,#050505_0%,#0A0A0A_46%,#050505_100%)]" />
        <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:72px_72px]" />

        <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col items-center justify-center px-6 py-24 text-center sm:px-8 lg:px-10">
          <Reveal>
            <p className="text-xs font-black uppercase tracking-[0.34em] text-[#F6DA87] drop-shadow-[0_0_18px_rgba(212,175,55,0.34)] sm:text-sm">
              THE EVOLUTION OF NETWORKING &amp; LOCAL INTELLIGENCE.
            </p>
            <h1 className="mx-auto mt-5 max-w-6xl bg-gradient-to-b from-white via-[#FFF3C8] to-[#D4AF37] bg-clip-text text-5xl font-black leading-[0.95] tracking-[-0.065em] text-transparent sm:text-6xl md:text-7xl lg:text-8xl">
              Your Identity Protected. Your Market Dominated.
            </h1>
            <p className="mx-auto mt-8 max-w-3xl text-base leading-8 text-white/64 sm:text-lg">
              More than a digital business card. Card-Social is a data-governance ecosystem. Secure your privacy in an encrypted vault, control what you share, and discover exactly where the demand for your business is in real-time. You evolve, your card evolves.
            </p>
            <div className="mt-10">
              <a
                href="#waitlist"
                className="inline-flex min-h-14 items-center justify-center rounded-full bg-gradient-to-r from-[#F6DA87] via-[#D4AF37] to-[#A87B1F] px-8 text-sm font-black uppercase tracking-[0.14em] text-black shadow-[0_0_34px_rgba(212,175,55,0.34)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_54px_rgba(212,175,55,0.54)] focus:outline-none focus:ring-2 focus:ring-[#F6DA87] focus:ring-offset-2 focus:ring-offset-[#050505]"
              >
                Join the Private Waitlist
              </a>
            </div>
          </Reveal>

          <Reveal className="mt-16 w-full max-w-6xl">
            {/* Video Player Placeholder: App walkthrough video container */}
            <div className="relative aspect-video overflow-hidden rounded-[2rem] border border-[#D4AF37]/35 bg-[#111111]/70 shadow-[0_0_80px_rgba(212,175,55,0.16),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(212,175,55,0.18),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_36%)]" />
              <iframe
                className="absolute inset-0 h-full w-full"
                src="https://www.youtube-nocookie.com/embed/JHe60TQuCGc?start=26&rel=0&modestbranding=1"
                title="Card-Social app walkthrough"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </Reveal>
        </section>

        <section className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-24 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
          <Reveal className="flex flex-col justify-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#D4AF37]">The Vault</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">
              The Vault: Your Data Doesn&apos;t Float on the Internet.
            </h2>
            <p className="mt-6 text-base leading-8 text-white/62">
              Stop giving away your raw information. Your data lives in a highly secure, centralized Vault. When you share a profile, your information is visually masked behind &quot;IconoDatas&quot;.
            </p>
          </Reveal>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.18 }}
            className="grid gap-4 sm:grid-cols-2"
          >
            {iconoDatas.map((item, index) => (
              <motion.article
                key={item.title}
                variants={reveal}
                className={`rounded-[1.6rem] border border-white/10 bg-[#111111]/72 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-[#D4AF37]/45 ${
                  index === 4 ? 'sm:col-span-2' : ''
                }`}
              >
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-lg font-black text-[#F6DA87] shadow-[0_0_28px_rgba(212,175,55,0.14)]">
                  {item.icon}
                </div>
                <h3 className="text-xl font-black tracking-[-0.04em] text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/62">{item.text}</p>
              </motion.article>
            ))}
          </motion.div>
        </section>

        <section className="relative mx-auto w-full max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
          <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#D4AF37]/10 blur-3xl" />
          <Reveal>
            <div className="relative overflow-hidden rounded-[2.4rem] border border-[#D4AF37]/30 bg-[#0A0A0A]/82 p-6 shadow-[0_0_110px_rgba(212,175,55,0.16),0_34px_120px_rgba(0,0,0,0.58)] backdrop-blur-2xl sm:p-10 lg:p-12">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(212,175,55,0.18),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.07),transparent_34%)]" />
              <div className="relative grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-[#D4AF37]">Private Call</p>
                  <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">
                    Never Give Your Number Away Again.
                  </h2>
                  <p className="mt-6 text-base leading-8 text-white/62">
                    Protect your ultimate boundary. With Card-Social&apos;s integrated Private Call (VoIP), you make and receive calls directly through the app. Whether you are dealing with a new client or a local vendor, communicate flawlessly without ever exposing your real phone number.
                  </p>
                </div>

                <div className="mx-auto w-full max-w-sm">
                  <div className="relative rounded-[2.6rem] border border-white/15 bg-[#050505] p-4 shadow-[0_0_90px_rgba(212,175,55,0.18),0_26px_90px_rgba(0,0,0,0.66)]">
                    <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,#111111,#050505)] p-6">
                      <div className="mx-auto mb-8 h-1.5 w-20 rounded-full bg-white/12" />
                      <div className="text-center">
                        <p className="text-xs font-black uppercase tracking-[0.26em] text-[#F6DA87]">Private Call</p>
                        <div className="mx-auto mt-8 grid h-28 w-28 place-items-center rounded-full border border-[#D4AF37]/45 bg-[#D4AF37]/12 text-4xl shadow-[0_0_52px_rgba(212,175,55,0.26)]">
                          ◌
                        </div>
                        <h3 className="mt-7 text-2xl font-black tracking-[-0.04em] text-white">Incoming Client</h3>
                        <p className="mt-2 text-sm text-white/44">Number protected by Ghost Link</p>
                      </div>
                      <div className="mt-12 grid grid-cols-2 gap-4">
                        <button className="min-h-14 rounded-2xl border border-red-400/20 bg-red-500/12 text-sm font-black uppercase tracking-[0.16em] text-red-200">
                          Decline
                        </button>
                        <button className="min-h-14 rounded-2xl border border-[#D4AF37]/35 bg-[#D4AF37]/18 text-sm font-black uppercase tracking-[0.16em] text-[#F6DA87] shadow-[0_0_28px_rgba(212,175,55,0.18)]">
                          Answer
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
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#D4AF37]">Dynamic Card System</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">
              Visually Stunning. Functionally Effective.
            </h2>
          </Reveal>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.18 }}
            className="mt-12 grid gap-5 lg:grid-cols-3"
          >
            {cardArchitecture.map((card, index) => (
              <motion.article
                key={card.title}
                variants={reveal}
                className={`h-full rounded-[2rem] border p-7 backdrop-blur-2xl transition duration-300 hover:-translate-y-1 ${
                  index === 2
                    ? 'border-[#D4AF37]/40 bg-[linear-gradient(135deg,rgba(212,175,55,0.13),rgba(17,17,17,0.76)_42%,rgba(5,5,5,0.82))] shadow-[0_0_90px_rgba(212,175,55,0.14),0_30px_90px_rgba(0,0,0,0.42)]'
                    : 'border-white/10 bg-[#111111]/72 shadow-[0_30px_90px_rgba(0,0,0,0.42)] hover:border-[#D4AF37]/40'
                }`}
              >
                <div className="mb-8 flex items-center justify-between gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D4AF37]/35 bg-[#D4AF37]/10 text-[#F6DA87] shadow-[0_0_32px_rgba(212,175,55,0.16)]">
                    0{index + 1}
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#F6DA87]">
                    {card.badge}
                  </span>
                </div>
                <h3 className="text-2xl font-black tracking-[-0.045em] text-white">{card.title}</h3>
                <p className="mt-5 text-sm leading-7 text-white/62">{card.text}</p>
              </motion.article>
            ))}
          </motion.div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-6 py-24 text-center sm:px-8 lg:px-10">
          <Reveal>
            <div className="mx-auto mb-8 grid h-16 w-16 place-items-center rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/12 text-2xl text-[#F6DA87] shadow-[0_0_42px_rgba(212,175,55,0.24)]">
              ⬡
            </div>
            <h2 className="text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">You Save the Card, Not the User.</h2>
            <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-white/62">
              In traditional apps, you save a person&apos;s entire profile. In Card-Social, you only retain what was specifically shared with you. A user might have 20 different cards for 20 different businesses, but your contact list only holds the specific, curated card they handed you. Absolute segmentation. Zero clutter.
            </p>
          </Reveal>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
          <Reveal className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#D4AF37]">Social Market Ecosystem</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">
              From Penthouses to Neighborhood Kitchens.
            </h2>
            <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-white/62">
              The Social Market is a 25-mile local search engine powered by your Business Cards. It creates micro-economies where local demand meets instant supply.
            </p>
          </Reveal>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.18 }}
            className="mt-12 grid gap-5 lg:grid-cols-2"
          >
            {socialMarketUseCases.map((useCase, index) => (
              <motion.article
                key={useCase.title}
                variants={reveal}
                className={`relative overflow-hidden rounded-[2.2rem] border p-7 shadow-[0_30px_100px_rgba(0,0,0,0.46)] backdrop-blur-2xl sm:p-8 ${
                  index === 0
                    ? 'border-[#D4AF37]/35 bg-[linear-gradient(135deg,rgba(212,175,55,0.14),rgba(17,17,17,0.78)_46%,rgba(5,5,5,0.86))]'
                    : 'border-white/10 bg-[#111111]/72'
                }`}
              >
                <div className="pointer-events-none absolute right-[-5rem] top-[-5rem] h-56 w-56 rounded-full bg-[#D4AF37]/10 blur-3xl" />
                <div className="relative">
                  <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D4AF37]/35 bg-[#D4AF37]/10 text-[#F6DA87] shadow-[0_0_32px_rgba(212,175,55,0.16)]">
                    {index === 0 ? 'RE' : 'NC'}
                  </div>
                  <h3 className="text-2xl font-black tracking-[-0.045em] text-white">{useCase.title}</h3>
                  <p className="mt-5 text-sm leading-7 text-white/62">{useCase.text}</p>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
          <Reveal className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#D4AF37]">Growth Tiers</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">Scale Your Network.</h2>
          </Reveal>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.18 }}
            className="mt-12 grid gap-5 md:grid-cols-3"
          >
            {tiers.map((tier, index) => (
              <motion.article
                key={tier.name}
                variants={reveal}
                className={`rounded-[2rem] border p-7 backdrop-blur-2xl ${
                  index === 2
                    ? 'border-[#D4AF37]/40 bg-[#17130B]/80 shadow-[0_0_80px_rgba(212,175,55,0.16)]'
                    : 'border-white/10 bg-[#111111]/72 shadow-[0_24px_80px_rgba(0,0,0,0.34)]'
                }`}
              >
                <p className="text-xs font-black uppercase tracking-[0.28em] text-[#F6DA87]">Tier {index + 1}</p>
                <h3 className="mt-5 text-3xl font-black tracking-[-0.055em] text-white">{tier.name}.</h3>
                <p className="mt-5 text-sm leading-7 text-white/62">{tier.text}</p>
              </motion.article>
            ))}
          </motion.div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2.4rem] border border-[#D4AF37]/30 bg-[#0A0A0A]/82 p-6 shadow-[0_0_100px_rgba(212,175,55,0.12),0_34px_120px_rgba(0,0,0,0.58)] backdrop-blur-2xl sm:p-10 lg:p-12">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(212,175,55,0.20),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.07),transparent_30%)]" />
              <div className="relative grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-[#D4AF37]">Business Intelligence</p>
                  <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">The Executive Dashboard.</h2>
                  <p className="mt-6 text-base leading-8 text-white/62">
                    Every Business Card comes with baseline analytics. Track your card&apos;s conversions, visitor traffic, and most importantly, discover &quot;Lost Sales&quot;—instances where locals searched for your specific niche, but your card wasn&apos;t fully optimized to catch them.
                  </p>
                </div>

                <aside className="rounded-[2rem] border border-[#D4AF37]/45 bg-[#D4AF37]/10 p-7 shadow-[0_0_70px_rgba(212,175,55,0.18)] backdrop-blur-2xl">
                  <p className="text-sm leading-7 text-white/74">
                    <strong className="block text-lg font-black tracking-[-0.03em] text-[#F6DA87]">
                      Premium Add-On: The Market Radar
                    </strong>
                    Take it a step further. For a small additional fee, unlock the city-wide Heatmap. Type in any keyword—like &quot;bathroom cleaning&quot; or &quot;real estate&quot;—and see a visual heatmap of exactly where the demand is in a 25-mile radius. Discover new market gaps before your competitors even know they exist.
                  </p>
                </aside>
              </div>
            </div>
          </Reveal>
        </section>

        <section id="waitlist" className="mx-auto w-full max-w-4xl px-6 py-24 sm:px-8 lg:px-10">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2.25rem] border border-[#D4AF37]/35 bg-[#111111]/76 p-6 shadow-[0_0_90px_rgba(212,175,55,0.18),0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-10">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(246,218,135,0.18),transparent_34%)]" />
              <div className="relative">
                <div className="mx-auto mb-9 max-w-2xl text-center">
                  <p className="text-xs font-black uppercase tracking-[0.34em] text-[#F6DA87]">Private Beta</p>
                  <h2 className="mt-4 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">Be the First to Dominate.</h2>
                  <p className="mt-5 text-base leading-8 text-white/64">
                    We are opening limited spots for our Beta phase. Secure your place in the Social Market or request our Investor Deck.
                  </p>
                </div>

                <form className="grid gap-4" aria-label="Private waitlist form">
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-white/55">Full Name</span>
                    <input
                      type="text"
                      name="fullName"
                      className="min-h-14 rounded-2xl border border-white/10 bg-[#050505]/70 px-5 text-white outline-none transition placeholder:text-white/28 focus:border-[#D4AF37]/70 focus:ring-4 focus:ring-[#D4AF37]/10"
                      placeholder="Full Name"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-white/55">Email Address</span>
                    <input
                      type="email"
                      name="email"
                      className="min-h-14 rounded-2xl border border-white/10 bg-[#050505]/70 px-5 text-white outline-none transition placeholder:text-white/28 focus:border-[#D4AF37]/70 focus:ring-4 focus:ring-[#D4AF37]/10"
                      placeholder="Email Address"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-white/55">Phone/WhatsApp</span>
                    <input
                      type="tel"
                      name="phone"
                      className="min-h-14 rounded-2xl border border-white/10 bg-[#050505]/70 px-5 text-white outline-none transition placeholder:text-white/28 focus:border-[#D4AF37]/70 focus:ring-4 focus:ring-[#D4AF37]/10"
                      placeholder="Phone/WhatsApp"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-white/55">What is your primary interest?</span>
                    <select
                      name="interest"
                      defaultValue=""
                      className="min-h-14 rounded-2xl border border-white/10 bg-[#050505]/70 px-5 text-white outline-none transition focus:border-[#D4AF37]/70 focus:ring-4 focus:ring-[#D4AF37]/10"
                    >
                      <option value="" disabled>
                        What is your primary interest?
                      </option>
                      <option>Secure my personal card</option>
                      <option>I am a Business Owner</option>
                      <option>I am an Investor</option>
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="mt-3 min-h-14 w-full rounded-2xl bg-gradient-to-r from-[#F6DA87] via-[#D4AF37] to-[#A87B1F] px-6 text-sm font-black uppercase tracking-[0.16em] text-black shadow-[0_0_44px_rgba(212,175,55,0.32)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_60px_rgba(212,175,55,0.48)] focus:outline-none focus:ring-2 focus:ring-[#F6DA87] focus:ring-offset-2 focus:ring-offset-[#050505]"
                  >
                    Request Early Access
                  </button>
                </form>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
    </div>
  );
}
