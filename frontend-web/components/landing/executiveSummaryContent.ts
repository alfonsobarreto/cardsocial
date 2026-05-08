/**
 * Contenido del documento estratégico (Business Model Canvas) — mismo orden que el texto fuente.
 * Imágenes opcionales: coloca archivos en public/legal/executive-summary/
 * y actualiza EXECUTIVE_IMAGE_PATHS más abajo.
 */

export type ExecutiveImageKey =
  | 'hero'
  | 'vaultUi'
  | 'nfcPremium'
  | 'businessCardPrint'
  | 'socialMarket'
  | 'cardStudio'
  | 'marketRadar'
  | 'dashboard';

/** Nombres de archivo sugeridos (añade tus propios .webp/.png/.jpg). */
export const EXECUTIVE_IMAGE_HINTS: Record<ExecutiveImageKey, { filename: string; caption: string }> = {
  hero: {
    filename: 'hero-cardsocial-bunker.webp',
    caption: 'Visual principal marca / bunker lux',
  },
  vaultUi: {
    filename: 'vault-real-ui.webp',
    caption: 'Captura real de The Vault',
  },
  nfcPremium: {
    filename: 'nfc-premium-card.webp',
    caption: 'Tarjeta física NFC premium',
  },
  businessCardPrint: {
    filename: 'business-card-print.webp',
    caption: 'QR permanente impreso / señalética',
  },
  socialMarket: {
    filename: 'social-market-ui.webp',
    caption: 'Social Market en app',
  },
  cardStudio: {
    filename: 'card-studio-skins.webp',
    caption: 'Card-Studio skins / tienda',
  },
  marketRadar: {
    filename: 'market-radar-heatmap.webp',
    caption: 'Market Radar heatmap',
  },
  dashboard: {
    filename: 'executive-dashboard.webp',
    caption: 'Dashboard ejecutivo',
  },
};

export type TierRow = { name: string; detail: string };

export type StrategicFlow = {
  queEs: string;
  comoFunciona: string;
  valorEstrategico: string[];
  modeloIngreso: string;
};

export type Section =
  | {
      kind: 'narrative';
      num: number;
      eyebrow: string;
      title: string;
      bullets: string[];
      image?: ExecutiveImageKey;
    }
  | {
      kind: 'segments';
      num: number;
      eyebrow: string;
      title: string;
      bullets: string[];
      establishedExamples: Array<{ sector: string; text: string }>;
    }
  | {
      kind: 'tiers';
      num: number;
      eyebrow: string;
      title: string;
      tiers: TierRow[];
    }
  | {
      kind: 'simpleLists';
      num: number;
      eyebrow: string;
      title: string;
      groups: Array<{ subtitle: string; items: string[] }>;
      image?: ExecutiveImageKey;
    }
  | {
      kind: 'strategicFlows';
      num: number;
      eyebrow: string;
      title: string;
      flows: StrategicFlow[];
      imageBetween?: ExecutiveImageKey;
    };

export const executiveSummarySections: Section[] = [
  {
    kind: 'narrative',
    num: 1,
    eyebrow: 'Propuesta de Valor',
    title: 'Value Proposition',
    image: 'hero',
    bullets: [
      'Card-Social redefine la gestión de contactos y la comunicación de datos, evolucionando el concepto estático de las tarjetas tradicionales hacia un ecosistema dinámico y seguro.',
      'Evolución Dinámica ("Tú cambias, tu tarjeta cambia"): Elimina la obsolescencia de los datos de contacto. A medida que el usuario avanza profesional o personalmente (ej. transicionar de una etapa universitaria a una carrera corporativa), su tarjeta se actualiza instantáneamente. Todos los contactos conservan acceso a la versión más reciente de la información que el usuario elija compartir, permitiendo conexiones de por vida.',
      '"The Vault" (Bóveda de Datos): Un sistema de almacenamiento centralizado y altamente seguro donde los usuarios guardan correos, teléfonos y redes sociales. Estos datos se enmascaran visualmente a través de "IconoDatas" al momento de ser compartidos, protegiendo la información cruda hasta que el receptor interactúa con ella.',
      'Smart Cards (Interacción Segura y Controlada): Diseñadas para el contacto físico y personal. Permiten agrupar hasta 12 IconoDatas por tarjeta. Su ventaja competitiva es la privacidad: generan un código QR temporal con una expiración de 2 minutos. Esto garantiza que la información solo se entregue a la persona frente al usuario, previniendo la recolección indebida de datos.',
      'Business Cards (Proyección Comercial Expansiva): Diseñadas para la masificación. Utilizan un código QR permanente ideal para impresión en volantes, stickers o señalética. Ofrecen funcionalidades avanzadas como la integración de logotipos, ubicaciones invisibles en el mapa, 20 palabras clave orientadas a nicho y la capacidad de modificar el nombre del contacto o el eslogan. Operan protegiendo el rostro y la identidad personal del titular.',
      'Sincronización Corporativa (Bóvedas Compartidas): Un sistema jerárquico donde un equipo entero accede a un token unificado. Esto centraliza la información de la empresa (promociones, catálogos, PDFs, políticas) en una bóveda corporativa no pública, asegurando que todos los representantes de ventas compartan la información más actualizada y homologada según su nivel de autorización.',
    ],
  },
  {
    kind: 'segments',
    num: 2,
    eyebrow: 'Segmentos de Clientes',
    title: 'Customer Segments',
    bullets: [
      'Usuario Casual (Free Tier): Personas naturales sin un enfoque de promoción comercial. Individuos que buscan mantener sus círculos sociales, académicos y laborales organizados. Requieren una forma fluida de compartir sus perfiles básicos sin comprometer su privacidad ni saturar sus dispositivos con contactos irrelevantes.',
      'Emprendedor / Creador (Influencer Tier): Profesionales en crecimiento, creadores de contenido o individuos impulsando un nicho, producto o servicio. Dependen de su presencia digital (redes sociales, landing pages) y requieren métricas visuales de sus receptores, así como una herramienta masiva para captar suscriptores o clientes.',
      'Corporativos (Enterprise/Corporate Tier): Grandes organizaciones e instituciones (ej. desarrolladoras inmobiliarias como Ciudad Maderas) que manejan extensas fuerzas de ventas o departamentos con necesidades de comunicación jerárquica (ej. Recursos Humanos y Gerencia).',
    ],
    establishedExamples: [
      {
        sector: 'Sector Restaurantero',
        text:
          'Un restaurante que destina una tarjeta a menús y pagos en mesa, otra exclusiva para el área de bar, una tercera para servicios de catering y otra para eventos especiales.',
      },
      {
        sector: 'Sector Inmobiliario',
        text:
          'Un agente de bienes raíces que utiliza tarjetas diferenciadas para recorridos (open houses), otra para modelos de propiedades, atención al cliente y una específica para campañas agresivas de marketing.',
      },
    ],
  },
  {
    kind: 'tiers',
    num: 3,
    eyebrow: 'Flujos de Ingresos',
    title: 'Revenue Streams · Estructura de Tiers',
    tiers: [
      { name: 'Free Tier', detail: '1 Usuario · 8 IconoDatas · 5 Smart Cards · 0 Business Cards.' },
      { name: 'Influencer Tier', detail: '1 Usuario · 10 IconoDatas · 10 Smart Cards · 1 Business Card.' },
      { name: 'Business Tier', detail: '3 Usuarios · 50 IconoDatas · 10 Smart Cards · 5 Business Cards.' },
      {
        name: 'Corporate Tier',
        detail: 'Venta directa B2B · Múltiples usuarios bajo un mismo token · Bóvedas corporativas con permisos escalonados y distribución institucional.',
      },
    ],
  },
  {
    kind: 'simpleLists',
    num: 4,
    eyebrow: 'Canales',
    title: 'Channels',
    image: 'businessCardPrint',
    groups: [
      {
        subtitle: '',
        items: [
          'Interacción física directa (face-to-face) mediante escaneo en pantalla de QR de corta duración (Smart Cards).',
          'Puntos de contacto físicos impresos (stickers, folletos, menús, señalética comercial) mediante QR permanente (Business Cards).',
          'Distribución digital de enlaces y perfiles en redes sociales.',
          'Venta corporativa directa para el ecosistema Enterprise.',
        ],
      },
    ],
  },
  {
    kind: 'simpleLists',
    num: 5,
    eyebrow: 'Relaciones',
    title: 'Customer Relationships',
    groups: [
      {
        subtitle: '',
        items: [
          'Confianza y Privacidad Estricta: El usuario mantiene la autoridad total sobre quién, cómo y cuándo accede a sus datos personales o empresariales.',
          'Acompañamiento Transicional: La plataforma fomenta la lealtad a largo plazo al adaptarse a las distintas etapas de vida o cambios de giro comercial del usuario, asegurando que nunca pierda su red de contactos construida.',
        ],
      },
    ],
  },
  {
    kind: 'simpleLists',
    num: 6,
    eyebrow: 'Operación',
    title: 'Key Activities',
    groups: [
      {
        subtitle: '',
        items: [
          'Mantenimiento y seguridad criptográfica de "The Vault" y los datos personales.',
          'Generación dinámica de códigos QR con latencia precisa (expiración de 2 minutos).',
          'Gestión de la arquitectura de servidores para soportar búsquedas por palabras clave y geolocalización invisible.',
          'Desarrollo y mantenimiento del control de acceso jerárquico para el sector corporativo.',
        ],
      },
    ],
  },
  {
    kind: 'simpleLists',
    num: 7,
    eyebrow: 'Ventaja',
    title: 'Key Resources',
    image: 'vaultUi',
    groups: [
      {
        subtitle: '',
        items: [
          'Infraestructura tecnológica de bóvedas individuales y compartidas (tokens de acceso).',
          'Algoritmos de segmentación y privacidad de IconoDatas.',
          'Plataforma de interfaz de usuario para la asignación ágil de tarjetas y datos.',
        ],
      },
    ],
  },
  {
    kind: 'simpleLists',
    num: 8,
    eyebrow: 'Alianzas',
    title: 'Key Partnerships',
    groups: [
      {
        subtitle: '',
        items: [
          'Equipos de gestión de ventas corporativas y directores comerciales de grandes empresas para la integración del Tier Corporativo.',
          'Agencias de marketing y organizadores de eventos para la adopción inicial en los niveles Influencer y Business.',
        ],
      },
    ],
  },
  {
    kind: 'simpleLists',
    num: 9,
    eyebrow: 'Economía',
    title: 'Cost Structure',
    groups: [
      {
        subtitle: '',
        items: [
          'Alojamiento de bases de datos de alta seguridad y servidores en la nube.',
          'Desarrollo y actualización continua de la aplicación (Web y Mobile).',
          'Costos operativos asociados al cifrado de datos y mantenimiento de la infraestructura de los tokens jerárquicos.',
        ],
      },
    ],
  },
  {
    kind: 'strategicFlows',
    num: 10,
    eyebrow: 'Hardware',
    title: 'Tarjetas NFC Premium',
    imageBetween: 'nfcPremium',
    flows: [
      {
        queEs: 'Una tarjeta física de alta gama que se envía al domicilio del usuario y se vincula a su cuenta mediante un código de seguridad.',
        comoFunciona:
          'El usuario toca con su tarjeta NFC el teléfono del receptor (Tap) y la información se transfiere de inmediato. En la app, desde el menú NFC, elige en tiempo real cuál de sus tarjetas digitales (personal, negocios, influencer) se comparte al hacer el Tap.',
        valorEstrategico: [
          'Prestigio visual y táctil incomparable en reuniones presenciales.',
          'Reduce la fricción de compartir datos a cero.',
        ],
        modeloIngreso: 'Venta directa de producto físico (One-time purchase) y costos de envío.',
      },
    ],
  },
  {
    kind: 'strategicFlows',
    num: 11,
    eyebrow: 'Privacidad',
    title: 'Sistema VoIP Integrado',
    flows: [
      {
        queEs:
          'Llamadas de voz App a App, representadas por un IconoData genérico exclusivo para esta función.',
        comoFunciona:
          'Permite recibir y realizar llamadas con nuevos contactos sin revelar jamás el número de teléfono real.',
        valorEstrategico: [
          'Escudo definitivo de privacidad: el número personal no queda registrado en bases de datos ajenas.',
          'La comunicación y el tráfico de datos permanecen dentro del ecosistema Card-Social.',
        ],
        modeloIngreso:
          'Característica de alto valor que justifica la retención y hace más atractivas las suscripciones de pago.',
      },
    ],
  },
  {
    kind: 'strategicFlows',
    num: 12,
    eyebrow: 'Descubrimiento',
    title: 'Social Market',
    imageBetween: 'socialMarket',
    flows: [
      {
        queEs:
          'Motor de búsqueda hiperlocal en la raíz de la aplicación para conectar necesidades con servicios sin depender de algoritmos de redes sociales ni pautas publicitarias.',
        comoFunciona:
          'Utiliza las 20 palabras clave (JSON) de las Business Cards y la ubicación GPS invisible en un radio de 25 millas. Regla de oro: al buscar un servicio (ej. "Barbero"), primero se escanea la red del usuario; si un familiar u amigo ofrece ese servicio, aparece primero. Luego, resultados locales por proximidad.',
        valorEstrategico: [
          'Fomenta la economía circular y comunitaria.',
          'Compatible con trabajo remoto o nómada: actualiza ubicación en la app y Social Market recalibra el radio.',
          'Reduce el costo de adquisición de clientes para pequeños negocios.',
        ],
        modeloIngreso:
          'Principal gancho comercial para Business Tier — las empresas pagan la suscripción no solo por organización de datos sino por existir en este buscador local.',
      },
    ],
  },
  {
    kind: 'strategicFlows',
    num: 13,
    eyebrow: 'Activos virtuales',
    title: 'Card-Studio · Skins',
    imageBetween: 'cardStudio',
    flows: [
      {
        queEs: 'Tienda virtual dentro de la app dedicada a la personalización estética de las tarjetas.',
        comoFunciona:
          'Adquisición de paquetes de iconos, paletas de colores, estilos de diseño y temas visuales (Skins) para cambiar la apariencia del perfil.',
        valorEstrategico: [
          'Atiende la necesidad psicológica de personalización y diferenciación (branding personal y corporativo).',
          'La app se mantiene visualmente fresca sin rediseñar el código base.',
        ],
        modeloIngreso: 'Microtransacciones (In-App Purchases) — ingresos escalables independientes de la suscripción mensual.',
      },
    ],
  },
];

/** Secciones 14–16 con estructura extendida — se renderizan en el componente. */
export const executiveStrategicBlocks: Array<{
  num: number;
  eyebrow: string;
  title: string;
  queEs: string;
  comoFunciona: string;
  valorBullets: string[];
  modeloIngreso: string;
  image?: ExecutiveImageKey;
}> = [
  {
    num: 14,
    eyebrow: 'Zero-Party Data',
    title: 'Market Radar (Heatmap)',
    image: 'marketRadar',
    queEs: 'Una herramienta premium de visualización geográfica e inteligencia predictiva basada en la demanda local.',
    comoFunciona:
      'El sistema recopila búsquedas anónimas dentro del Social Market y las convierte en un mapa de calor dinámico. Los negocios ingresan palabras clave y visualizan en qué códigos postales, dentro de su radio de 25 millas, se originan esas búsquedas.',
    valorBullets: [
      'Transiciona la plataforma de gestor de contactos a herramienta de inteligencia de mercado.',
      'Orienta marketing, ventas y expansión física hacia donde existe demanda en tiempo real, eliminando especulación financiera.',
    ],
    modeloIngreso:
      'Upsell premium — complemento de pago al Business Tier, alto margen B2B por datos de mercado exclusivos.',
  },
  {
    num: 15,
    eyebrow: 'Inteligencia de Negocios',
    title: 'Dashboard Ejecutivo · Ventas Perdidas',
    image: 'dashboard',
    queEs:
      'Panel analítico exclusivo para usuarios con Business Cards, para medir el rendimiento del perfil en el mercado local.',
    comoFunciona:
      'Recopila y despliega métricas de interacción: tráfico al perfil, tasas de conversión (quién guardó la tarjeta) y métricas de posicionamiento SEO local.',
    valorBullets: [
      'Justifica tangiblemente el ROI de la suscripción con datos de alcance.',
      'Introduce "Ventas Perdidas": alertas cuando consumidores locales buscaron el nicho del usuario pero su Business Card no apareció por falta de optimización de keywords.',
    ],
    modeloIngreso:
      'Incentivo constante para mejorar perfil y mantener la suscripción activa.',
  },
  {
    num: 16,
    eyebrow: 'Alto valor corporativo',
    title: 'Sincronización B2B · Caso Ciudad Maderas',
    queEs:
      'Infraestructura jerárquica para sincronizar equipos de ventas, agencias o franquicias bajo una misma entidad de control.',
    comoFunciona:
      'Bóvedas Compartidas (Enterprise): un administrador central sube documentos corporativos. Ejemplo: en Ciudad Maderas, actualizar planos, catálogos o presupuestos de modelos Aura, Alba, Nova, Stella y Lucero en la bóveda central; en segundos, Smart Cards y Business Cards de todos los asesores reciben la versión nueva.',
    valorBullets: [
      'Homologación total de info corporativa; sin material obsoleto ni precios desactualizados en la fuerza de ventas.',
      'Control sobre activos digitales y revocación de acceso sin perder clientes ganados cuando alguien deja el equipo.',
    ],
    modeloIngreso: 'Contratos Enterprise (SaaS B2B) — mayor volumen y retención a largo plazo.',
  },
];
