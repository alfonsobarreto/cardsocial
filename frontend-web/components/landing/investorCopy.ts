/** All bilingual copy for the Investor Relations sections (A–J + page chrome). */

export type ExecLocale = 'en' | 'es';

const copy = {
  en: {
    /* ── Page chrome ────────────────────────────────────────── */
    navBadge: 'BMC · INTERNAL STRATEGIC',
    navWaitlist: 'Waitlist',
    navSwitch: 'ES',
    tocLabel: 'Index',
    tocBubbleOpen: 'Open index',
    tocBubbleClose: 'Close index',
    tocPanelDismiss: 'Close',
    headerEyebrow: 'Strategic document',
    headerTitle: 'Business Model Canvas',
    headerSubtitle: 'Card-Social — strategic document for marketing and brand development team.',
    headerStamp: 'Confidential · Investors · Q2 2026',
    blueprintLabel: 'Operational Blueprint — 01 → 09',
    blueprintMotors: [
      ['VP', 'Proposition'],
      ['CS', 'Segments'],
      ['RS', 'Revenue'],
      ['CH', 'Channels'],
      ['CR', 'Relationships'],
      ['KA', 'Activities'],
      ['KR', 'Resources'],
      ['KP', 'Partnerships'],
      ['$', 'Costs'],
    ] as [string, string][],
    footerBody: 'This page is internal working material prepared for brand alignment and investors. Product images can be added in',
    footerLegal: 'Legal',
    footerHome: 'Home',
    footerWaitlist: 'Waitlist',
    investorDivider: 'Investor Relations',

    /* ── InvestorMetrics hero ───────────────────────────────── */
    invHeroEyebrow: 'Financial Intelligence · Q2 2026',
    invHeroTitle: 'Why This Investment\nCannot Lose.',
    invHeroBody:
      "Five data-driven sections answering the only question that matters to capital: how does my money multiply, and what is the exit?",
    invHeroStats: [
      { label: 'Seed Ask', value: '$600K' },
      { label: 'Revenue Pillars', value: '4' },
      { label: 'Blended CAC', value: '≈ $0' },
      { label: 'Data Moat', value: 'Yr 3+' },
    ],

    /* ── A — Capital Allocation ─────────────────────────────── */
    capEyebrow: 'Seed Round · $600k',
    capTitle: 'Capital Allocation',
    capTerminalLabel: 'ALLOCATION · SEED ROUND · Q2-2026',
    capColCode: 'Code',
    capColItem: 'Line Item',
    capColPct: '% Allocation',
    capColUsd: 'USD',
    capTotalLabel: 'Total Seed Round',
    capRows: [
      { code: 'T&I', label: 'Tech & Infrastructure', detail: 'Cloud scaling · Mapbox · VoIP APIs · Vault architecture' },
      { code: 'P&S', label: 'Penetration & Sales', detail: 'B2B sales force · Localized marketing in 6 languages' },
      { code: 'L&C', label: 'Legal & Compliance', detail: 'Corporate structuring · GDPR/LGPD compliance' },
      { code: 'H&L', label: 'Hardware & Logistics', detail: 'Premium NFC manufacturing · Regional distribution' },
      { code: 'CR', label: 'Contingency Reserve', detail: 'Liquidity buffer · Runway extension' },
    ],

    /* ── B — Revenue Streams ────────────────────────────────── */
    revEyebrow: 'Monetization Engine',
    revTitle: 'Revenue Streams',
    revStreams: [
      {
        eyebrow: 'Recurring · Monthly',
        title: 'SaaS Subscriptions',
        desc: 'MRR locked-in from Influencer, Business, and Corporate tiers. Predictable, compounding baseline revenue insulated from campaign volatility.',
        metrics: [
          { label: 'Free → Influencer Conv.', value: '~12%' },
          { label: 'Avg. MRR per Business user', value: '$29' },
          { label: 'Corporate contract floor', value: '$499/mo' },
        ],
      },
      {
        eyebrow: 'Upsell · Premium',
        title: 'Market Radar',
        desc: '"Supreme" access — 25-mile heatmap + keyword analytics. High-margin B2B add-on for businesses that need market intelligence, not just contact management.',
        metrics: [
          { label: 'Add-on conversion est.', value: '~22%' },
          { label: 'Margin', value: '>85%' },
        ],
      },
      {
        eyebrow: 'Microtransactions',
        title: 'Card-Studio',
        desc: 'Skins, luxury icon packs, and visual themes. Constant, frictionless cash flow that scales with the user base independent of subscription conversions.',
        metrics: [
          { label: 'Avg basket size', value: '$4.99' },
          { label: 'Purchase frequency', value: '~2×/yr' },
        ],
      },
      {
        eyebrow: 'One-time · Hardware',
        title: 'Premium NFC Cards',
        desc: 'Physical product revenue from premium card sales. Upfront capital that also drives user activation — hardware ownership correlates with 4× higher retention.',
        metrics: [
          { label: 'Unit price', value: '$34.99' },
          { label: 'Gross margin target', value: '~60%' },
        ],
      },
    ],

    /* ── C — Legacy Program ─────────────────────────────────── */
    legacyEyebrow: 'Organic Growth Engine',
    legacyTitle: 'The Legacy Program',
    legacyIntro:
      'Normal users pay with virality instead of cash. Each milestone creates a self-reinforcing loop: users recruit contacts to unlock premium features — turning the product into its own distribution channel.',
    legacyMilestones: [
      {
        eyebrow: 'Milestone I',
        badge: 'Elite Status',
        unlocks: [
          'Exclusive "Elite" profile badge visible to all contacts',
          'Premium Card-Studio Skin pack (limited edition)',
        ],
      },
      {
        eyebrow: 'Milestone II',
        badge: 'Analytics Pro',
        unlocks: [
          'Advanced Personal Analytics Dashboard',
          'Full conversion funnel for all Smart & Business Cards',
          'Historical data export (CSV)',
        ],
      },
      {
        eyebrow: 'Milestone III · Final',
        badge: 'Supreme',
        unlocks: [
          'Free lifetime "Supreme Market Radar" — 25-mile heatmap',
          'Full keyword analytics & local demand intelligence',
          'Permanent "Supreme" badge — highest social proof on the network',
        ],
        note: "Supreme Market Radar is the product's most powerful feature. Making it the reward for 2,000 contacts turns every user into a salesperson with skin in the game.",
      },
    ],

    /* ── D — Network Effect ─────────────────────────────────── */
    netEyebrow: 'Why investors win · CAC',
    netTitle: 'The Network Effect',
    netMoatLabel: 'Competitive Moat #1',
    netHeadline: 'CAC ≈ $0.\nUsers are the sales force.',
    netBody1: 'Traditional SaaS companies burn between $3–$30 acquiring each mobile user through paid media. Card-Social inverts this model entirely.',
    netBody2:
      'Every user who wants Supreme Market Radar for free must network 2,000 people into the platform. That is 2,000 new registered users — acquired at zero media spend. The Legacy Program is not a loyalty gimmick; it is a structured viral engine with a quantifiable output per user.',
    netBody3:
      "As the network grows, each additional user increases the value of the Social Market for every existing user — a classic Metcalfe's Law compounding loop. The product gets more valuable the more people use it, without incremental infrastructure cost.",
    netTerminalLabel: 'CAC Benchmark · Live Calc',
    netFooter: 'With a 1:8 referral ratio and zero paid acquisition at scale, CAC remains near zero while LTV compounds with each subscription upsell.',
    netMetrics: [
      { label: 'Industry avg. mobile app CAC', value: '$3.52', sub: 'Meta / Google Ads' },
      { label: 'Card-Social blended CAC', value: '~$0', sub: 'Legacy Program virality' },
      { label: 'Legacy-driven contacts per user', value: '2,000', sub: 'before Supreme unlock' },
      { label: 'Projected organic referral ratio', value: '1 : 8', sub: 'one user brings ~8 others' },
    ],

    /* ── E — Data Moat ──────────────────────────────────────── */
    moatEyebrow: 'Exit Strategy · Valuation Driver',
    moatTitle: 'The Moat: "Digital Land"',
    moatQuote: 'V1CE and Popl sell plastic. We are acquiring the most accurate hyper-local dataset in the world — and we do it with user consent, at zero cost.',
    moatCompHeader: 'Competitive Landscape',
    moatThesisLabel: 'The Thesis',
    moatThesis1:
      'A real estate investor understands the value of land. Card-Social is buying digital land — hyper-local intent data that doesn\'t exist anywhere else, collected with full user consent (Zero-Party Data). After 3 years of user activity, our Social Market will hold the most precise real-time map of local economic demand ever assembled: who is searching for what, exactly where, right now.',
    moatThesis2:
      "In year 3+, our company won't be valued on subscriptions — it will be valued on data. The comps for that transaction are in the hundreds of millions.",
    moatAcquirersLabel: 'Potential Strategic Acquirers (Yr 3–5)',
    moatCompetitors: [
      { name: 'V1CE / Popl', what: 'Sell premium NFC plastic', moat: 'None — no data layer', chip: 'Hardware', highlight: false },
      { name: 'HiHello', what: 'Digital business card app', moat: 'Contact management only', chip: 'Contact Mgmt', highlight: false },
      { name: 'Linktree', what: 'Link-in-bio aggregator', moat: 'Passive link clicks', chip: 'Links', highlight: false },
      { name: 'Card-Social', what: 'Hyper-local Zero-Party Data OS', moat: '★ The land beneath the market', chip: 'Data Moat', highlight: true },
    ],
    moatAcquirers: [
      { name: 'Zillow', reason: 'Local real estate demand signals — most precise geolocation data commercially available.' },
      { name: 'Salesforce', reason: 'Intent-rich, consent-first contact data at scale, replacing expensive third-party data enrichment.' },
      { name: 'Google / Apple', reason: 'Hyper-local keyword demand maps that compete directly with Google Maps Business Profiles.' },
    ],

    /* ── F — Competitive Analysis ───────────────────────────── */
    compEyebrow: 'Market Positioning',
    compTitle: 'Competitive Landscape',
    compQuote: 'Five incumbents. Five structural weaknesses. One platform that destroys each of them on their own battlefield.',
    compColCompetitor: 'Competitor',
    compColWeapon: 'Their Best Weapon',
    compColDestroyer: 'Card-Social Destroyer',
    compColAngle: 'Investor Translation',
    compFooter: 'Card-Social — the only platform competing across all five dimensions simultaneously',
    compWeaponLabel: 'Their weapon',
    compDestroyerLabel: 'Card-Social destroyer',
    compAngleLabel: 'Investor angle',
    competitors: [
      {
        name: 'Popl', chip: 'CRM Layer',
        weapon: 'Corporate Directory — connects scanned contacts directly to CRMs for sales teams.',
        destroyer: 'Real-Time Corporate Sync: Popl is static. In Card-Social, when tapping the NFC card the user chooses in real time which profile to share (personal, business, influencer). Our Enterprise tier uses shared vaults so the entire sales force always has homologated, controlled information.',
        angle: 'They sell corporate address books; we sell hierarchically controlled communication infrastructure.',
      },
      {
        name: 'Linq', chip: 'Link-in-bio',
        weapon: 'Exposed Landing Pages — embed catalogs and links in the digital profile, but personal data is visible to everyone.',
        destroyer: '"The Vault" & VoIP Privacy: Linq exposes your phone number. Card-Social stores everything in an encrypted Vault and visually masks data via "IconoDatas". If someone wants to call you, our App-to-App VoIP protects your real number from ending up in third-party databases.',
        angle: 'They expose you in a glass display case; we operate you from a high-security vault (The Vault).',
      },
      {
        name: 'Blinq', chip: 'Frictionless QR',
        weapon: 'Frictionless Sharing — fast QR codes to distribute contacts massively anywhere.',
        destroyer: 'Smart Cards (Expiring QR): Blinq gives away your data permanently. Card-Social splits the game: "Smart Cards" for face-to-face contact with a QR that expires in 2 minutes. "Business Cards" (permanent QR) for mass distribution in flyers, protecting the holder\'s face and identity.',
        angle: 'They give away access to your property; we issue visitor passes with a time limit for maximum security.',
      },
      {
        name: 'HiHello', chip: 'Paper Digitizer',
        weapon: 'Paper Scanning & Software — pure app to digitize contacts without hardware.',
        destroyer: '"Social Market" (Hyper-Local Search): HiHello only stores contacts. Card-Social uses "Business Cards" with 20 keywords and invisible GPS location to power a 25-mile search engine. When searching for a service, the system first scans the user\'s network — circular economy that eliminates client acquisition costs.',
        angle: 'They digitize the past (paper cards); we create neighborhood economies that move with the user.',
      },
      {
        name: 'V1CE', chip: 'Luxury Hardware',
        weapon: 'Physical Luxury Hardware — premium metal and wood business cards for visual status.',
        destroyer: 'Dynamic Evolution & Card-Studio: V1CE sells static plastic. Card-Social\'s Premium NFC cards link to an evolving profile ("You change, your card changes"). We also generate microtransactions (In-App Purchases) selling Skins and visual themes so users personalize their digital design forever.',
        angle: 'They earn money selling one physical card once; we sell the hardware and then charge constant microtransactions for digital aesthetics.',
      },
    ],

    /* ── G — Market Sizing ──────────────────────────────────── */
    mktEyebrow: 'Opportunity Size',
    mktTitle: 'Market Sizing — TAM / SAM / SOM',
    mktFunnelLabel: 'Market Capture Funnel',
    mktMarkets: [
      {
        label: 'TAM', name: 'Total Addressable Market', value: '$243B',
        sub: 'Professional networking + Local commerce + SaaS contact management (Global)',
        sources: ['Digital business card market CAGR 26% → $14.7B by 2029', 'Local commerce intent advertising ~$180B', 'B2B SaaS contact management ~$48B'],
      },
      {
        label: 'SAM', name: 'Serviceable Addressable Market', value: '$18.4B',
        sub: 'North America + Latin America — digital-first SMBs + mobile-native professionals',
        sources: ['~22M SMBs in target geographies', 'Avg. $840/yr addressable spend on networking + local marketing'],
      },
      {
        label: 'SOM', name: 'Serviceable Obtainable Market', value: '$420M',
        sub: 'Realistic 3-year target — 250k paying users × $140 ARPU/yr + Enterprise contracts',
        sources: ['Conservative 1.4% SAM capture by Y3', 'Based on comparable SaaS comps at seed stage'],
      },
    ],

    /* ── H — Financial Projections ──────────────────────────── */
    projEyebrow: 'Conservative Model · Seed Stage',
    projTitle: 'Financial Projections Y1 – Y3',
    projIntro: 'Conservative model. No viral outlier assumptions. Based on 1.4% SAM capture by Year 3 and comparable SaaS CAC/LTV ratios at seed stage.',
    projLabelUsers: 'Paid Users',
    projLabelMrr: 'MRR',
    projLabelArr: 'ARR',
    projLabelMix: 'Revenue Mix',
    projLabelNfc: 'NFC Hardware',
    projLabelStudio: 'Card-Studio',
    projLabelRadar: 'Market Radar',
    projLabelEnt: 'Enterprise',
    projBarLabel: 'ARR Trajectory',
    projTargetBadge: 'Target Exit',
    projYears: [
      { year: 'Year 1', tag: '2026 — Activation', note: 'Seed capital deployed. Focus: product-market fit + first 10 Enterprise accounts.' },
      { year: 'Year 2', tag: '2027 — Scale', note: 'Series A target. Social Market user density creates compounding local value.' },
      { year: 'Year 3', tag: '2028 — Dominance', note: 'Data asset valuation thesis kicks in. Strategic acquirer conversations begin.' },
    ],

    /* ── I — Team ───────────────────────────────────────────── */
    teamEyebrow: 'The People',
    teamTitle: 'Team & Advisors',
    teamUpdateNote: 'To complete: replace data in',
    teamUpdateSuffix: '→ array TEAM_MEMBERS. Add photo in',
    teamPlaceholderBio: 'Replace with 2–3 sentences: background, domain expertise, why this problem.',
    teamPlaceholderCto: 'Replace with 2–3 sentences: engineering background, tech stack mastery, relevant exits or projects.',
    teamPlaceholderAdvisor: 'Replace with 2–3 sentences: corporate sales experience, network in target verticals.',
    teamMembers: [
      { initials: 'YN', name: 'Your Name', role: 'CEO & Co-Founder', tags: ['Vision', 'Product', 'Sales'] },
      { initials: 'CT', name: 'CTO / Co-Founder', role: 'Chief Technology Officer', tags: ['Engineering', 'Architecture', 'Security'] },
      { initials: 'CA', name: 'Commercial Advisor', role: 'Enterprise & Partnerships', tags: ['B2B', 'Enterprise', 'Real Estate'] },
    ],

    /* ── J — Traction ───────────────────────────────────────── */
    tracEyebrow: 'Proof of Demand · As of Q2 2026',
    tracTitle: 'Traction & Roadmap',
    tracUpdateNote: 'To complete: update values in TRACTION_STATS with real numbers before sending to investors.',
    tracStats: [
      { label: 'Waitlist Signups', note: 'UPDATE with real count', highlight: true },
      { label: 'Countries Represented', note: 'UPDATE', highlight: false },
      { label: 'Beta Invites Sent', note: 'UPDATE', highlight: false },
      { label: 'Enterprise Pilots', note: 'UPDATE', highlight: false },
    ],
    tracMilestones: [
      { date: 'Q4 2024', label: 'Concept & Architecture', desc: 'Core Vault architecture designed. Smart / Business Card system prototyped.', future: false },
      { date: 'Q1 2025', label: 'MVP Build', desc: 'First functional build. The Vault, QR expiry, Business Cards, Social Market search engine.', future: false },
      { date: 'Q3 2025', label: 'Private Beta', desc: 'First closed beta cohort. NFC card prototype finalized. Card-Studio v1 launched.', future: false },
      { date: 'Q1 2026', label: 'Web Platform Launch', desc: 'Investor landing, waitlist system, and Executive Summary published. Seed round initiated.', future: false },
      { date: 'Q3 2026 →', label: 'Seed Deployment', desc: 'B2B sales team activation. Enterprise pipeline. Regional marketing across 6 languages.', future: true },
    ],

    /* ── CTA ────────────────────────────────────────────────── */
    ctaEyebrow: 'The Ask',
    ctaTitle: '$600,000 Seed Round.',
    ctaBody1: 'This is not a feature. This is infrastructure. We are building the operating system for local commerce and professional identity — a network that grows itself, and a data asset that appreciates with every user interaction.',
    ctaBody2: 'In 3 years, when Zillow or Salesforce calls, they will want to buy the land.',
    ctaBody2Gold: 'You own a piece of that land today.',
    ctaBtnMeeting: 'Schedule a Meeting',
    ctaBtnEmail: 'Send Direct Inquiry',
    ctaStats: [
      { val: '$600K', label: 'Seed Ask' },
      { val: '18 mo', label: 'Runway' },
      { val: '≈ $0', label: 'CAC' },
      { val: '4 Pillars', label: 'Revenue Streams' },
    ],
  },

  /* ════════════════════════════════════════════════════════════ *
   *  ES                                                           *
   * ════════════════════════════════════════════════════════════ */
  es: {
    /* ── Page chrome ────────────────────────────────────────── */
    navBadge: 'BMC · ESTRATÉGICO INTERNO',
    navWaitlist: 'Lista de espera',
    navSwitch: 'EN',
    tocLabel: 'Índice',
    tocBubbleOpen: 'Abrir índice',
    tocBubbleClose: 'Cerrar índice',
    tocPanelDismiss: 'Cerrar',
    headerEyebrow: 'Documento estratégico',
    headerTitle: 'Business Model Canvas',
    headerSubtitle: 'Card-Social — documento estratégico para equipo de marketing y desarrollo de marca.',
    headerStamp: 'Confidencial · Inversionistas · Q2 2026',
    blueprintLabel: 'Blueprint operativo — 01 → 09',
    blueprintMotors: [
      ['VP', 'Propuesta'],
      ['CS', 'Segmentos'],
      ['RS', 'Ingresos'],
      ['CH', 'Canales'],
      ['CR', 'Relaciones'],
      ['KA', 'Actividades'],
      ['KR', 'Recursos'],
      ['KP', 'Alianzas'],
      ['$', 'Costos'],
    ] as [string, string][],
    footerBody: 'Esta página es material de trabajo interno preparado para alineación de marca e inversionistas. Las imágenes de producto pueden añadirse en',
    footerLegal: 'Legal',
    footerHome: 'Inicio',
    footerWaitlist: 'Lista de espera',
    investorDivider: 'Relaciones con Inversionistas',

    /* ── InvestorMetrics hero ───────────────────────────────── */
    invHeroEyebrow: 'Inteligencia Financiera · Q2 2026',
    invHeroTitle: 'Por Qué Esta Inversión\nNo Puede Perder.',
    invHeroBody: 'Cinco secciones basadas en datos que responden la única pregunta que importa al capital: ¿cómo se multiplica mi dinero y cuál es la salida?',
    invHeroStats: [
      { label: 'Ronda Semilla', value: '$600K' },
      { label: 'Fuentes de Ingreso', value: '4' },
      { label: 'CAC Combinado', value: '≈ $0' },
      { label: 'Foso de Datos', value: 'Año 3+' },
    ],

    /* ── A — Capital Allocation ─────────────────────────────── */
    capEyebrow: 'Ronda Semilla · $600k',
    capTitle: 'Asignación de Capital',
    capTerminalLabel: 'ASIGNACIÓN · RONDA SEMILLA · Q2-2026',
    capColCode: 'Código',
    capColItem: 'Partida',
    capColPct: '% Asignación',
    capColUsd: 'USD',
    capTotalLabel: 'Total Ronda Semilla',
    capRows: [
      { code: 'T&I', label: 'Tecnología e Infraestructura', detail: 'Escala en la nube · Mapbox · APIs VoIP · Arquitectura Vault' },
      { code: 'P&V', label: 'Penetración y Ventas', detail: 'Fuerza de ventas B2B · Marketing localizado en 6 idiomas' },
      { code: 'L&C', label: 'Legal y Compliance', detail: 'Estructuración corporativa · Cumplimiento GDPR/LGPD' },
      { code: 'H&L', label: 'Hardware y Logística', detail: 'Fabricación NFC premium · Distribución regional' },
      { code: 'RR', label: 'Reserva de Contingencia', detail: 'Colchón de liquidez · Extensión de runway' },
    ],

    /* ── B — Revenue Streams ────────────────────────────────── */
    revEyebrow: 'Motor de Monetización',
    revTitle: 'Fuentes de Ingreso',
    revStreams: [
      {
        eyebrow: 'Recurrente · Mensual',
        title: 'Suscripciones SaaS',
        desc: 'MRR asegurado de los tiers Influencer, Business y Corporativo. Ingreso base predecible y compuesto, aislado de la volatilidad de campañas.',
        metrics: [
          { label: 'Conv. Free → Influencer est.', value: '~12%' },
          { label: 'MRR promedio por usuario Business', value: '$29' },
          { label: 'Piso de contrato Corporativo', value: '$499/mes' },
        ],
      },
      {
        eyebrow: 'Upsell · Premium',
        title: 'Market Radar',
        desc: 'Acceso "Supreme" — mapa de calor 25 millas + analítica de palabras clave. Add-on B2B de alto margen para negocios que necesitan inteligencia de mercado, no solo gestión de contactos.',
        metrics: [
          { label: 'Conv. add-on est.', value: '~22%' },
          { label: 'Margen', value: '>85%' },
        ],
      },
      {
        eyebrow: 'Microtransacciones',
        title: 'Card-Studio',
        desc: 'Skins, packs de iconos de lujo y temas visuales. Flujo de caja constante y sin fricción que escala con la base de usuarios, independiente de la conversión a suscripciones.',
        metrics: [
          { label: 'Ticket promedio', value: '$4.99' },
          { label: 'Frecuencia de compra', value: '~2×/año' },
        ],
      },
      {
        eyebrow: 'Único · Hardware',
        title: 'Tarjetas NFC Premium',
        desc: 'Ingreso de producto físico en venta única. Capital inicial que además impulsa la activación — la propiedad de hardware correlaciona con 4× mayor retención.',
        metrics: [
          { label: 'Precio unitario', value: '$34.99' },
          { label: 'Margen bruto objetivo', value: '~60%' },
        ],
      },
    ],

    /* ── C — Legacy Program ─────────────────────────────────── */
    legacyEyebrow: 'Motor de Crecimiento Orgánico',
    legacyTitle: 'El Programa Legacy',
    legacyIntro:
      'Los usuarios normales pagan con viralidad en lugar de dinero. Cada milestone crea un ciclo autorreforzante: los usuarios reclutan contactos para desbloquear funciones premium, convirtiendo el producto en su propio canal de distribución.',
    legacyMilestones: [
      {
        eyebrow: 'Milestone I',
        badge: 'Estado Elite',
        unlocks: [
          'Insignia exclusiva "Elite" visible para todos sus contactos',
          'Pack de Skin premium de Card-Studio (edición limitada)',
        ],
      },
      {
        eyebrow: 'Milestone II',
        badge: 'Analytics Pro',
        unlocks: [
          'Dashboard de Analítica Personal Avanzada',
          'Embudo de conversión completo de todas las Smart & Business Cards',
          'Exportación de datos históricos (CSV)',
        ],
      },
      {
        eyebrow: 'Milestone III · Final',
        badge: 'Supreme',
        unlocks: [
          '"Supreme Market Radar" de por vida gratis — mapa de calor 25 millas',
          'Analítica completa de palabras clave e inteligencia de demanda local',
          'Insignia permanente "Supreme" — la mayor prueba social de la red',
        ],
        note: 'El Market Radar Supreme es la función más poderosa del producto. Convertirlo en la recompensa de 2,000 contactos transforma a cada usuario en un vendedor con incentivos reales.',
      },
    ],

    /* ── D — Network Effect ─────────────────────────────────── */
    netEyebrow: 'Por qué ganan los inversionistas · CAC',
    netTitle: 'El Efecto de Red',
    netMoatLabel: 'Foso Competitivo #1',
    netHeadline: 'CAC ≈ $0.\nLos usuarios son la fuerza de ventas.',
    netBody1: 'Las empresas SaaS tradicionales gastan entre $3 y $30 adquiriendo cada usuario móvil a través de medios pagados. Card-Social invierte completamente este modelo.',
    netBody2:
      'Cada usuario que quiere el Supreme Market Radar gratis debe traer 2,000 personas a la plataforma. Eso son 2,000 nuevos usuarios registrados, adquiridos con gasto en medios igual a cero. El Programa Legacy no es un truco de lealtad; es un motor viral estructurado con una producción cuantificable por usuario.',
    netBody3:
      'A medida que la red crece, cada usuario adicional aumenta el valor del Social Market para todos los usuarios existentes — un clásico ciclo compuesto de la Ley de Metcalfe. El producto se vuelve más valioso cuanto más personas lo usan, sin costo incremental de infraestructura.',
    netTerminalLabel: 'Benchmark CAC · Cálculo en Vivo',
    netFooter: 'Con una tasa de referidos 1:8 y adquisición pagada nula a escala, el CAC permanece cerca de cero mientras el LTV se compone con cada upsell de suscripción.',
    netMetrics: [
      { label: 'CAC promedio app móvil (industria)', value: '$3.52', sub: 'Meta / Google Ads' },
      { label: 'CAC combinado Card-Social', value: '~$0', sub: 'Viralidad Programa Legacy' },
      { label: 'Contactos por usuario (Legacy)', value: '2,000', sub: 'antes del desbloqueo Supreme' },
      { label: 'Ratio de referidos orgánicos proyectado', value: '1 : 8', sub: 'un usuario trae ~8 más' },
    ],

    /* ── E — Data Moat ──────────────────────────────────────── */
    moatEyebrow: 'Estrategia de Salida · Motor de Valuación',
    moatTitle: 'El Foso: "Tierra Digital"',
    moatQuote: 'V1CE y Popl venden plástico. Nosotros estamos adquiriendo el conjunto de datos hiperlocales más preciso del mundo — y lo hacemos con el consentimiento del usuario, a costo cero.',
    moatCompHeader: 'Panorama Competitivo',
    moatThesisLabel: 'La Tesis',
    moatThesis1: 'Un inversionista inmobiliario entiende el valor de la tierra. Card-Social está comprando "tierra digital" — datos de intención hiperlocal que no existen en ningún otro lugar, recolectados con pleno consentimiento del usuario (Zero-Party Data). Después de 3 años de actividad, nuestro Social Market tendrá el mapa en tiempo real más preciso de la demanda económica local jamás construido: quién busca qué, exactamente dónde, ahora mismo.',
    moatThesis2: 'En el año 3+, nuestra empresa no se valuará por las suscripciones — se valuará por los datos. Las comparaciones para esa transacción están en cientos de millones.',
    moatAcquirersLabel: 'Posibles Adquirentes Estratégicos (Año 3–5)',
    moatCompetitors: [
      { name: 'V1CE / Popl', what: 'Venden plástico NFC premium', moat: 'Ninguno — sin capa de datos', chip: 'Hardware', highlight: false },
      { name: 'HiHello', what: 'App de tarjeta digital', moat: 'Solo gestión de contactos', chip: 'Contactos', highlight: false },
      { name: 'Linktree', what: 'Agregador de links', moat: 'Clics pasivos de enlace', chip: 'Links', highlight: false },
      { name: 'Card-Social', what: 'SO de Datos Zero-Party Hiperlocal', moat: '★ La tierra bajo el mercado', chip: 'Foso de Datos', highlight: true },
    ],
    moatAcquirers: [
      { name: 'Zillow', reason: 'Señales de demanda inmobiliaria local — los datos de geolocalización más precisos disponibles comercialmente.' },
      { name: 'Salesforce', reason: 'Datos de contacto ricos en intención y con consentimiento a escala, reemplazando costoso enriquecimiento de datos de terceros.' },
      { name: 'Google / Apple', reason: 'Mapas de demanda de palabras clave hiperlocales que compiten directamente con los Perfiles de Negocio de Google Maps.' },
    ],

    /* ── F — Competitive Analysis ───────────────────────────── */
    compEyebrow: 'Posicionamiento en el Mercado',
    compTitle: 'Panorama Competitivo',
    compQuote: 'Cinco competidores establecidos. Cinco debilidades estructurales. Una plataforma que destruye a cada uno en su propio campo.',
    compColCompetitor: 'Competidor',
    compColWeapon: 'Su Mejor Arma',
    compColDestroyer: 'El Destructor Card-Social',
    compColAngle: 'Traducción para Inversionistas',
    compFooter: 'Card-Social — la única plataforma que compite en las cinco dimensiones simultáneamente',
    compWeaponLabel: 'Su arma',
    compDestroyerLabel: 'El destructor Card-Social',
    compAngleLabel: 'Ángulo para inversionistas',
    competitors: [
      {
        name: 'Popl', chip: 'Capa CRM',
        weapon: 'Directorio Corporativo — conectan los contactos escaneados directamente con CRMs para equipos de ventas.',
        destroyer: 'Sincronización Corporativa en Tiempo Real: Popl es estático. En Card-Social, al tocar la tarjeta NFC el usuario elige en tiempo real cuál perfil comparte (personal, negocios, influencer). Nuestro nivel Enterprise usa bóvedas compartidas para que toda la fuerza de ventas tenga información homologada y controlada.',
        angle: 'Ellos venden libretas de direcciones corporativas; nosotros vendemos infraestructura de comunicación controlada jerárquicamente.',
      },
      {
        name: 'Linq', chip: 'Link-in-bio',
        weapon: 'Landing Pages Expuestas — incrustan catálogos y enlaces en el perfil digital, pero los datos personales quedan a la vista de todos.',
        destroyer: '"The Vault" y Privacidad VoIP: Linq expone tu teléfono. Card-Social almacena todo en una Bóveda ("The Vault") y enmascara los datos visualmente usando "IconoDatas". Si alguien quiere llamarte, usa nuestro VoIP App a App, protegiendo tu número real para que no caiga en bases de datos ajenas.',
        angle: 'Ellos te exponen en una vitrina de cristal; nosotros te operamos desde una caja fuerte de alta seguridad (The Vault).',
      },
      {
        name: 'Blinq', chip: 'QR sin fricción',
        weapon: 'Compartir sin Fricción — códigos QR rápidos para compartir contactos masivamente en cualquier lugar.',
        destroyer: 'Smart Cards (QR de Expiración): Blinq regala tus datos permanentemente. Card-Social divide el juego: "Smart Cards" para contacto físico con QR temporal que expira en 2 minutos. "Business Cards" (QR permanente) para masificación en volantes, protegiendo el rostro e identidad del titular.',
        angle: 'Ellos regalan el acceso a tu propiedad; nosotros emitimos pases de visitante con tiempo límite para máxima seguridad.',
      },
      {
        name: 'HiHello', chip: 'Digitalizador',
        weapon: 'Escaneo de Papel y Software — aplicación pura para digitalizar contactos sin necesidad de hardware.',
        destroyer: '"Social Market" (Buscador Hiperlocal): HiHello solo guarda contactos. Card-Social usa "Business Cards" con 20 palabras clave y ubicación invisible para alimentar un motor de búsqueda en radio de 25 millas. Al buscar un servicio, el sistema escanea primero si un amigo o familiar lo ofrece — economía circular que elimina el costo de adquisición.',
        angle: 'Ellos digitalizan el pasado (tarjetas de papel); nosotros creamos economías de vecindario que se mueven con el usuario.',
      },
      {
        name: 'V1CE', chip: 'Hardware de Lujo',
        weapon: 'Hardware de Lujo Físico — tarjetas premium de metal y madera para dar estatus visual.',
        destroyer: 'Evolución Dinámica y Card-Studio: V1CE vende un plástico estático. Las tarjetas NFC Premium de Card-Social se vinculan a un perfil que evoluciona ("Tú cambias, tu tarjeta cambia"). Además, generamos microtransacciones (In-App Purchases) vendiendo Skins, colores y estilos en nuestra tienda virtual para que personalicen su diseño para siempre.',
        angle: 'Ellos ganan dinero vendiendo una tarjeta física una sola vez; nosotros vendemos el hardware y luego cobramos microtransacciones constantes por la estética digital.',
      },
    ],

    /* ── G — Market Sizing ──────────────────────────────────── */
    mktEyebrow: 'Tamaño de la Oportunidad',
    mktTitle: 'Tamaño de Mercado — TAM / SAM / SOM',
    mktFunnelLabel: 'Embudo de Captura de Mercado',
    mktMarkets: [
      {
        label: 'TAM', name: 'Mercado Total Disponible', value: '$243B',
        sub: 'Networking profesional + Comercio local + Gestión de contactos SaaS (Global)',
        sources: ['Mercado de tarjetas digitales CAGR 26% → $14.7B en 2029', 'Publicidad de intención en comercio local ~$180B', 'SaaS de gestión de contactos B2B ~$48B'],
      },
      {
        label: 'SAM', name: 'Mercado Disponible a Servir', value: '$18.4B',
        sub: 'Norteamérica + Latinoamérica — PYMEs digital-first + profesionales nativos móviles',
        sources: ['~22M PYMEs en geografías objetivo', 'Gasto promedio de $840/año en networking + marketing local'],
      },
      {
        label: 'SOM', name: 'Mercado Obtenible a Servir', value: '$420M',
        sub: 'Meta realista a 3 años — 250k usuarios de pago × $140 ARPU/año + contratos Enterprise',
        sources: ['Captura conservadora del 1.4% del SAM en Año 3', 'Basado en comparables SaaS en etapa seed'],
      },
    ],

    /* ── H — Financial Projections ──────────────────────────── */
    projEyebrow: 'Modelo Conservador · Etapa Seed',
    projTitle: 'Proyecciones Financieras Año 1 – 3',
    projIntro: 'Modelo conservador. Sin supuestos de viralidad extrema. Basado en captura del 1.4% del SAM en Año 3 y ratios comparables de CAC/LTV SaaS en etapa seed.',
    projLabelUsers: 'Usuarios de Pago',
    projLabelMrr: 'MRR',
    projLabelArr: 'ARR',
    projLabelMix: 'Mix de Ingresos',
    projLabelNfc: 'Hardware NFC',
    projLabelStudio: 'Card-Studio',
    projLabelRadar: 'Market Radar',
    projLabelEnt: 'Enterprise',
    projBarLabel: 'Trayectoria ARR',
    projTargetBadge: 'Salida Objetivo',
    projYears: [
      { year: 'Año 1', tag: '2026 — Activación', note: 'Capital semilla desplegado. Foco: product-market fit + primeras 10 cuentas Enterprise.' },
      { year: 'Año 2', tag: '2027 — Escala', note: 'Meta Serie A. La densidad de usuarios del Social Market crea valor local compuesto.' },
      { year: 'Año 3', tag: '2028 — Dominancia', note: 'La tesis de valuación por activo de datos se activa. Inician conversaciones con adquirentes estratégicos.' },
    ],

    /* ── I — Team ───────────────────────────────────────────── */
    teamEyebrow: 'Las Personas',
    teamTitle: 'Equipo y Asesores',
    teamUpdateNote: 'Para completar: reemplaza los datos en',
    teamUpdateSuffix: '→ array TEAM_MEMBERS. Añade foto en',
    teamPlaceholderBio: 'Reemplaza con 2–3 oraciones: trayectoria, dominio del problema, por qué esta persona.',
    teamPlaceholderCto: 'Reemplaza con 2–3 oraciones: experiencia en ingeniería, stack tecnológico, proyectos o salidas relevantes.',
    teamPlaceholderAdvisor: 'Reemplaza con 2–3 oraciones: experiencia en ventas corporativas, red en verticales objetivo.',
    teamMembers: [
      { initials: 'TN', name: 'Tu Nombre', role: 'CEO y Co-Fundador', tags: ['Visión', 'Producto', 'Ventas'] },
      { initials: 'CT', name: 'CTO / Co-Fundador', role: 'Director de Tecnología', tags: ['Ingeniería', 'Arquitectura', 'Seguridad'] },
      { initials: 'AC', name: 'Asesor Comercial', role: 'Enterprise y Alianzas', tags: ['B2B', 'Enterprise', 'Inmobiliario'] },
    ],

    /* ── J — Traction ───────────────────────────────────────── */
    tracEyebrow: 'Prueba de Demanda · Q2 2026',
    tracTitle: 'Tracción y Hoja de Ruta',
    tracUpdateNote: 'Para completar: actualiza los valores en TRACTION_STATS con los números reales antes de enviar a inversionistas.',
    tracStats: [
      { label: 'Registros en Lista de Espera', note: 'ACTUALIZAR con número real', highlight: true },
      { label: 'Países Representados', note: 'ACTUALIZAR', highlight: false },
      { label: 'Invitaciones Beta Enviadas', note: 'ACTUALIZAR', highlight: false },
      { label: 'Pilotos Enterprise', note: 'ACTUALIZAR', highlight: false },
    ],
    tracMilestones: [
      { date: 'Q4 2024', label: 'Concepto y Arquitectura', desc: 'Arquitectura central del Vault diseñada. Sistema Smart / Business Card prototipado.', future: false },
      { date: 'Q1 2025', label: 'Build MVP', desc: 'Primer build funcional. The Vault, expiración QR, Business Cards, motor de búsqueda Social Market.', future: false },
      { date: 'Q3 2025', label: 'Beta Privada', desc: 'Primer cohorte de beta cerrada. Prototipo de tarjeta NFC finalizado. Card-Studio v1 lanzado.', future: false },
      { date: 'Q1 2026', label: 'Lanzamiento Plataforma Web', desc: 'Landing de inversionistas, sistema de lista de espera y Resumen Ejecutivo publicados. Ronda seed iniciada.', future: false },
      { date: 'Q3 2026 →', label: 'Despliegue del Seed', desc: 'Activación del equipo de ventas B2B. Pipeline Enterprise. Marketing regional en 6 idiomas.', future: true },
    ],

    /* ── CTA ────────────────────────────────────────────────── */
    ctaEyebrow: 'La Propuesta',
    ctaTitle: 'Ronda Semilla: $600,000.',
    ctaBody1: 'Esto no es una función. Es infraestructura. Estamos construyendo el sistema operativo para el comercio local y la identidad profesional — una red que crece sola, y un activo de datos que se aprecia con cada interacción de usuario.',
    ctaBody2: 'En 3 años, cuando llamen Zillow o Salesforce, van a querer comprar la tierra.',
    ctaBody2Gold: 'Tú posees una parte de esa tierra hoy.',
    ctaBtnMeeting: 'Agendar una Reunión',
    ctaBtnEmail: 'Enviar Consulta Directa',
    ctaStats: [
      { val: '$600K', label: 'Ronda Seed' },
      { val: '18 meses', label: 'Runway' },
      { val: '≈ $0', label: 'CAC' },
      { val: '4 Pilares', label: 'Fuentes de Ingreso' },
    ],
  },
} as const;

export default copy;
