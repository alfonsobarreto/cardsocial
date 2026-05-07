import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const pillars = [
  {
    title: 'El Búnker de tu Identidad.',
    text: 'Olvídate de regalar tus datos. Con "The Vault", tu información se enmascara visualmente. Si alguien quiere llamarte, lo hace a través de nuestro sistema VoIP integrado: llamas y recibes sin revelar jamás tu número real.',
  },
  {
    title: 'Tu Radar de Oportunidades.',
    text: 'Deja de gastar en anuncios a ciegas. Al entrar a Card-Social, te integras al Social Market: un motor de búsqueda hiperlocal a 25 millas. Si alguien busca tu servicio, nuestro mapa te pone en primera línea.',
  },
  {
    title: 'Monopolio de Datos Locales.',
    text: 'Una infraestructura B2B para equipos de ventas. Sincronización jerárquica a través de bóvedas compartidas. Acceso al "Heatmap" de intención de búsqueda para dominar el mercado.',
  },
];

const steps = [
  {
    label: 'TAP',
    title: 'Toca',
    text: 'Acerca tu tarjeta NFC Premium de Card-Social a cualquier teléfono inteligente. Cero aplicaciones requeridas para el receptor.',
  },
  {
    label: 'CONNECT',
    title: 'Conecta',
    text: 'Elige en tiempo real qué perfil compartir (Personal, Negocios, VIP) directamente desde tu app.',
  },
  {
    label: 'DOMINATE',
    title: 'Domina',
    text: 'Analiza en tu Dashboard Ejecutivo quién interactuó, desde qué código postal y qué servicios están buscando en tu red.',
  },
];

export default function LandingPage() {
  return (
    <div
      className={`${inter.variable} min-h-screen overflow-hidden bg-[#050505] text-white antialiased selection:bg-[#D4AF37] selection:text-black`}
      style={{ fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
    >
      <main className="relative">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_0%,rgba(212,175,55,0.16),transparent_32%),radial-gradient(circle_at_80%_12%,rgba(246,218,135,0.10),transparent_28%),linear-gradient(180deg,#050505_0%,#0A0A0A_52%,#050505_100%)]" />
        <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.65)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.65)_1px,transparent_1px)] [background-size:64px_64px]" />

        <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col items-center justify-center px-6 py-24 text-center sm:px-8 lg:px-10">
          <div className="absolute left-1/2 top-12 h-24 w-px -translate-x-1/2 bg-gradient-to-b from-[#D4AF37]/0 via-[#D4AF37]/60 to-[#D4AF37]/0" />

          <p className="mb-5 animate-[fadeInUp_0.7s_ease-out_both] text-xs font-black uppercase tracking-[0.34em] text-[#F6DA87] drop-shadow-[0_0_18px_rgba(212,175,55,0.34)] sm:text-sm">
            LA EVOLUCIÓN DEL NETWORKING Y LA INTELIGENCIA LOCAL.
          </p>

          <h1 className="max-w-5xl animate-[fadeInUp_0.85s_ease-out_120ms_both] bg-gradient-to-b from-white via-[#FFF3C8] to-[#D4AF37] bg-clip-text text-5xl font-black leading-[0.96] tracking-[-0.06em] text-transparent sm:text-6xl md:text-7xl lg:text-8xl">
            Tu Identidad Protegida. Tu Mercado Dominado.
          </h1>

          <p className="mt-8 max-w-2xl animate-[fadeInUp_0.85s_ease-out_220ms_both] text-base leading-8 text-white/62 sm:text-lg">
            Más que una tarjeta de presentación digital. Card-Social es el ecosistema donde los usuarios protegen su privacidad y los negocios descubren exactamente dónde está la demanda de sus servicios en tiempo real. &quot;Tú cambias, tu tarjeta cambia&quot;.
          </p>

          <div className="mt-10 flex animate-[fadeInUp_0.85s_ease-out_320ms_both] flex-col items-center gap-4 sm:flex-row">
            <a
              href="#waitlist"
              className="group inline-flex min-h-14 items-center justify-center rounded-full bg-gradient-to-r from-[#F6DA87] via-[#D4AF37] to-[#A87B1F] px-8 text-sm font-black uppercase tracking-[0.14em] text-black shadow-[0_0_32px_rgba(212,175,55,0.32)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_46px_rgba(212,175,55,0.52)] focus:outline-none focus:ring-2 focus:ring-[#F6DA87] focus:ring-offset-2 focus:ring-offset-[#050505]"
            >
              Únete a la Lista de Espera Privada
            </a>
            <a
              href="#demo"
              className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] px-8 text-sm font-black uppercase tracking-[0.14em] text-white backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37]/70 hover:bg-[#D4AF37]/10 focus:outline-none focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-[#050505]"
            >
              Ver el Video Demo ▶
            </a>
          </div>

          <div className="relative mt-16 w-full max-w-4xl animate-[fadeInUp_0.9s_ease-out_420ms_both]">
            {/* Media Placeholder: floating NFC card over an iPhone map */}
            <div className="relative mx-auto h-[420px] max-w-[760px] overflow-hidden rounded-[2.4rem] border border-white/10 bg-[#0A0A0A]/70 p-5 shadow-[0_26px_100px_rgba(0,0,0,0.6)] backdrop-blur-2xl sm:h-[500px]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(212,175,55,0.20),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_38%)]" />
              <div className="absolute left-1/2 top-12 h-[360px] w-[190px] -translate-x-1/2 rounded-[2.2rem] border border-white/15 bg-[#111111] p-3 shadow-[0_0_70px_rgba(212,175,55,0.18)] sm:h-[420px] sm:w-[220px]">
                <div className="h-full overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#050505]">
                  <div className="h-full bg-[radial-gradient(circle_at_35%_28%,rgba(246,218,135,0.34),transparent_13%),radial-gradient(circle_at_68%_54%,rgba(212,175,55,0.22),transparent_15%),linear-gradient(135deg,rgba(246,218,135,0.12)_0_1px,transparent_1px_22px),linear-gradient(45deg,rgba(255,255,255,0.06)_0_1px,transparent_1px_20px)]" />
                </div>
              </div>
              <div className="absolute left-[9%] top-[42%] h-40 w-64 rotate-[-10deg] rounded-3xl border border-[#F6DA87]/30 bg-gradient-to-br from-[#17130B]/95 via-[#0A0A0A]/95 to-[#050505]/95 p-5 shadow-[0_18px_80px_rgba(212,175,55,0.34)] backdrop-blur-xl sm:left-[14%] sm:h-48 sm:w-80">
                <div className="mb-12 flex items-center justify-between">
                  <span className="h-9 w-12 rounded-xl border border-[#F6DA87]/30 bg-[#D4AF37]/20" />
                  <span className="text-xs font-black tracking-[0.28em] text-[#F6DA87]">NFC</span>
                </div>
                <div className="text-left">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-white/45">Card-Social</p>
                  <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">Vault Access</p>
                </div>
              </div>
              <div className="absolute bottom-7 right-7 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#F6DA87] shadow-[0_0_26px_rgba(212,175,55,0.18)]">
                Social Market Live
              </div>
            </div>
          </div>
        </section>

        <section id="demo" className="mx-auto w-full max-w-6xl px-6 py-24 sm:px-8 lg:px-10">
          <div className="animate-[fadeInUp_0.85s_ease-out_both]">
            <div className="group relative aspect-video overflow-hidden rounded-[2rem] border border-[#D4AF37]/35 bg-white/[0.04] shadow-[0_0_70px_rgba(212,175,55,0.12),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl">
              <iframe
                className="absolute inset-0 h-full w-full"
                src="https://www.youtube-nocookie.com/embed/JHe60TQuCGc?start=26&rel=0&modestbranding=1"
                title="Video demo de Card-Social"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
            <p className="mx-auto mt-7 max-w-2xl text-center text-lg font-semibold leading-8 text-white/68">
              Descubre cómo convertimos un simple escaneo en Zero-Party Data para tu negocio.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
          <div className="grid gap-5 md:grid-cols-3">
            {pillars.map((pillar, index) => (
              <article
                key={pillar.title}
                className="animate-[fadeInUp_0.85s_ease-out_both] rounded-[2rem] border border-white/10 bg-[#111111]/70 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:border-[#D4AF37]/45 hover:shadow-[0_30px_90px_rgba(212,175,55,0.12)]"
                style={{ animationDelay: `${index * 110}ms` }}
              >
                <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 text-sm font-black text-[#F6DA87] shadow-[0_0_26px_rgba(212,175,55,0.14)]">
                  0{index + 1}
                </div>
                <h2 className="text-2xl font-black tracking-[-0.04em] text-white">{pillar.title}</h2>
                <p className="mt-5 text-sm leading-7 text-white/62">{pillar.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-24 sm:px-8 lg:px-10">
          <div className="rounded-[2rem] border border-white/10 bg-[#0A0A0A]/70 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:p-8 lg:p-10">
            <div className="grid gap-5 md:grid-cols-3">
              {steps.map((step, index) => (
                <article key={step.label} className="relative rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-6">
                  {index < steps.length - 1 ? (
                    <div className="absolute left-1/2 top-10 hidden h-px w-full bg-gradient-to-r from-[#D4AF37]/55 to-transparent md:block" />
                  ) : null}
                  <div className="relative z-10 mb-7 grid h-14 w-14 place-items-center rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/12 text-[#F6DA87] shadow-[0_0_34px_rgba(212,175,55,0.22)]">
                    <span className="text-lg font-black">{index + 1}</span>
                  </div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-[#F6DA87]">{step.label}</p>
                  <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">{step.title}</h2>
                  <p className="mt-4 text-sm leading-7 text-white/62">{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="waitlist" className="mx-auto w-full max-w-4xl px-6 py-24 sm:px-8 lg:px-10">
          <div className="relative overflow-hidden rounded-[2.25rem] border border-[#D4AF37]/35 bg-[#111111]/76 p-6 shadow-[0_0_90px_rgba(212,175,55,0.18),0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(246,218,135,0.18),transparent_34%)]" />
            <div className="relative">
              <div className="mx-auto mb-9 max-w-2xl text-center">
                <p className="text-xs font-black uppercase tracking-[0.34em] text-[#F6DA87]">Waitlist privada</p>
                <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl">Sé de los primeros en acceder.</h2>
                <p className="mt-5 text-base leading-8 text-white/64">
                  Estamos abriendo cupos limitados para nuestra fase Beta. Asegura tu lugar en el Social Market o solicita nuestro Deck de inversión.
                </p>
              </div>

              <form className="grid gap-4" aria-label="Formulario de lista de espera privada">
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-white/55">Nombre Completo</span>
                  <input
                    type="text"
                    name="fullName"
                    className="min-h-14 rounded-2xl border border-white/10 bg-[#050505]/70 px-5 text-white outline-none transition placeholder:text-white/28 focus:border-[#D4AF37]/70 focus:ring-4 focus:ring-[#D4AF37]/10"
                    placeholder="Nombre Completo"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-white/55">Correo Electrónico</span>
                  <input
                    type="email"
                    name="email"
                    className="min-h-14 rounded-2xl border border-white/10 bg-[#050505]/70 px-5 text-white outline-none transition placeholder:text-white/28 focus:border-[#D4AF37]/70 focus:ring-4 focus:ring-[#D4AF37]/10"
                    placeholder="Correo Electrónico"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-white/55">WhatsApp / Teléfono</span>
                  <input
                    type="tel"
                    name="phone"
                    className="min-h-14 rounded-2xl border border-white/10 bg-[#050505]/70 px-5 text-white outline-none transition placeholder:text-white/28 focus:border-[#D4AF37]/70 focus:ring-4 focus:ring-[#D4AF37]/10"
                    placeholder="WhatsApp / Teléfono"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-white/55">¿Qué te interesa?</span>
                  <select
                    name="interest"
                    defaultValue=""
                    className="min-h-14 rounded-2xl border border-white/10 bg-[#050505]/70 px-5 text-white outline-none transition focus:border-[#D4AF37]/70 focus:ring-4 focus:ring-[#D4AF37]/10"
                  >
                    <option value="" disabled>
                      ¿Qué te interesa?
                    </option>
                    <option>Quiero mi tarjeta personal</option>
                    <option>Soy Dueño de Negocio</option>
                    <option>Soy Inversionista</option>
                  </select>
                </label>
                <button
                  type="submit"
                  className="mt-3 min-h-14 w-full rounded-2xl bg-gradient-to-r from-[#F6DA87] via-[#D4AF37] to-[#A87B1F] px-6 text-sm font-black uppercase tracking-[0.16em] text-black shadow-[0_0_44px_rgba(212,175,55,0.32)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_60px_rgba(212,175,55,0.48)] focus:outline-none focus:ring-2 focus:ring-[#F6DA87] focus:ring-offset-2 focus:ring-offset-[#050505]"
                >
                  Solicitar Acceso Temprano
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
