/**
 * Contenido legal del sitio (Next.js en cardsocial.me).
 *
 * Importante (Next.js App Router): NO mezclar `process.env` solo-servidor con el valor
 * que Webpack inyecta en el cliente para `NEXT_PUBLIC_*` — provoca error de hidratación
 * y la página queda en blanco / negro. El correo debe ser el mismo en build y runtime.
 */
export const LEGAL_SUPPORT_EMAIL = 'soporte@card-social.com';

export const SUPPORT_MAILTO =
  LEGAL_SUPPORT_EMAIL.includes('@') && !LEGAL_SUPPORT_EMAIL.startsWith('[')
    ? `mailto:${encodeURIComponent(LEGAL_SUPPORT_EMAIL)}?subject=${encodeURIComponent('Card-Social support')}`
    : '#';

export type PrivacySection = {
  id: string;
  title: string;
  paragraphs: string[];
};

/** URLs canónicas para Google Play Console y listados públicos */
export const LEGAL_URLS = {
  privacyEn: 'https://cardsocial.me/legal/privacy',
  privacyEs: 'https://cardsocial.me/legal/privacidad',
  termsEn: 'https://cardsocial.me/legal/terms',
  termsEs: 'https://cardsocial.me/legal/terminos',
  useEn: 'https://cardsocial.me/legal/use',
  useEs: 'https://cardsocial.me/legal/uso',
  about: 'https://cardsocial.me/legal/about',
  contactEn: 'https://cardsocial.me/legal/contact',
  contactEs: 'https://cardsocial.me/legal/contacto',
} as const;

export const PRIVACY_SECTIONS_ES: PrivacySection[] = [
  {
    id: 'intro',
    title: '1. Responsable y alcance',
    paragraphs: [
      'La presente Política de Privacidad describe cómo Card-Social (“nosotros”) trata la información personal asociada a la aplicación móvil Card-Social y los servicios relacionados (incluidas las tarjetas digitales, el mercado y las funciones sociales).',
      'Al utilizar la aplicación, usted reconoce la información aquí descrita. Si no está de acuerdo, le rogamos no utilizar el servicio.',
    ],
  },
  {
    id: 'camera-mic',
    title: '2. Cámara y micrófono',
    paragraphs: [
      'La aplicación puede solicitar acceso a la cámara y al micrófono del dispositivo exclusivamente para habilitar funciones que usted inicia o acepta explícitamente:',
      '• Videollamadas y llamadas con video en tiempo real bajo las marcas de producto “FaceCall” y “Ghost-Link”, implementadas mediante tecnología de comunicaciones en tiempo real Agora RTC.',
      '• Escaneo de códigos QR para añadir contactos, canjear invitaciones o interactuar con tarjetas y flujos autorizados dentro de Card-Social.',
      'No utilizamos la cámara ni el micrófono con fines ocultos ni para grabar contenido fuera de los flujos anteriores. Los permisos del sistema pueden revocarse en cualquier momento desde la configuración del dispositivo.',
    ],
  },
  {
    id: 'voip',
    title: '3. Privacidad de voz y videollamadas (VoIP)',
    paragraphs: [
      'Las sesiones de voz y video de FaceCall y Ghost-Link se transmiten en tiempo real a través de la infraestructura de Agora RTC para conectar a los participantes de la llamada.',
      'Card-Social no almacena ni conserva grabaciones del audio o el video de esas sesiones en nuestros servidores como parte normal del servicio. El tratamiento es principalmente de transmisión en directo entre dispositivos; no utilizamos estas comunicaciones para construir perfiles publicitarios.',
      'Podemos generar metadatos técnicos mínimos relacionados con la calidad del servicio o la seguridad (por ejemplo, identificadores de sesión, sellos de tiempo o señales de error) según sea necesario para operar y proteger la plataforma.',
    ],
  },
  {
    id: 'location',
    title: '4. Ubicación',
    paragraphs: [
      'Si usted concede permiso de ubicación, la utilizamos para funciones como la búsqueda de negocios o perfiles cercanos en el mercado de tarjetas y para guardar ubicaciones de interés asociadas a su tarjeta o experiencia en la app, cuando usted así lo solicite.',
      'No realizamos rastreo de ubicación continuo en segundo plano como función de producto. La ubicación se emplea en el contexto de las acciones que usted realiza en la aplicación y conforme a los permisos concedidos en el sistema operativo.',
    ],
  },
  {
    id: 'firebase',
    title: '5. Cuenta, autenticación y datos en la nube',
    paragraphs: [
      'Utilizamos Firebase y servicios relacionados de Google para autenticación de usuarios, bases de datos y funciones de backend necesarias para operar Card-Social (por ejemplo, perfiles, tarjetas y datos vinculados a su cuenta).',
      'No vendemos su información personal a terceros. Podemos encargar el tratamiento a proveedores de infraestructura y servicios en la nube que actúan bajo instrucciones y obligaciones de confidencialidad y seguridad, únicamente en la medida necesaria para prestar el servicio.',
    ],
  },
  {
    id: 'rights',
    title: '6. Conservación, seguridad y derechos',
    paragraphs: [
      'Conservamos la información el tiempo necesario para cumplir las finalidades descritas, las obligaciones legales y la resolución de incidencias. Aplicamos medidas técnicas y organizativas razonables para proteger los datos frente a accesos no autorizados.',
      'Según la legislación aplicable, usted puede solicitar acceso, rectificación, supresión, limitación u oposición al tratamiento, y presentar reclamaciones ante la autoridad de control que corresponda. Para ejercer sus derechos, utilice el correo de contacto indicado al final de este documento.',
    ],
  },
  {
    id: 'minors',
    title: '7. Menores',
    paragraphs: [
      'Card-Social no está dirigida a menores de edad según las reglas de uso de la aplicación. Si tiene conocimiento de que un menor nos ha proporcionado datos sin consentimiento parental válido, contacte con nosotros para adoptar las medidas oportunas.',
    ],
  },
  {
    id: 'changes',
    title: '8. Cambios de esta política',
    paragraphs: [
      'Podemos actualizar esta Política de Privacidad para reflejar cambios legales o en el producto. Publicaremos la versión vigente en esta u otra URL indicada en la tienda de aplicaciones. Le recomendamos revisarla periódicamente.',
    ],
  },
  {
    id: 'contact',
    title: '9. Contacto',
    paragraphs: [
      `Para consultas sobre privacidad, protección de datos o soporte relacionado con Card-Social, puede escribirnos a: ${LEGAL_SUPPORT_EMAIL}`,
    ],
  },
];

export const PRIVACY_SECTIONS_EN: PrivacySection[] = [
  {
    id: 'intro',
    title: '1. Data controller and scope',
    paragraphs: [
      'This Privacy Policy explains how Card-Social (“we”, “us”) processes personal information in connection with the Card-Social mobile application and related services (including digital cards, marketplace features, and social functionality).',
      'By using the app, you acknowledge the practices described here. If you do not agree, please do not use the service.',
    ],
  },
  {
    id: 'camera-mic',
    title: '2. Camera and microphone',
    paragraphs: [
      'The app may request access to your device camera and microphone solely to enable features that you start or explicitly approve:',
      '• Real-time video calls and video-enabled calling under the “FaceCall” and “Ghost-Link” product features, delivered using Agora RTC real-time communication technology.',
      '• Scanning QR codes to add contacts, redeem invitations, or interact with cards and authorized flows inside Card-Social.',
      'We do not use the camera or microphone for undisclosed purposes or to record content outside these flows. You can revoke permissions at any time in your device settings.',
    ],
  },
  {
    id: 'voip',
    title: '3. Voice and video calling (VoIP) privacy',
    paragraphs: [
      'FaceCall and Ghost-Link voice and video sessions are transmitted in real time through Agora RTC infrastructure to connect call participants.',
      'Card-Social does not, as a normal part of the service, store or retain recordings of the audio or video from those sessions on our servers. Processing is primarily live transmission between endpoints; we do not use these communications to build advertising profiles.',
      'We may generate minimal technical metadata required to operate and secure the platform (for example, session identifiers, timestamps, or error signals).',
    ],
  },
  {
    id: 'location',
    title: '4. Location',
    paragraphs: [
      'If you grant location permission, we use it for features such as searching for nearby businesses or profiles in the card marketplace and saving places of interest linked to your card or in-app experience when you choose to do so.',
      'We do not perform continuous background location tracking as a product feature. Location is used in connection with actions you take in the app and the permissions you grant in the operating system.',
    ],
  },
  {
    id: 'firebase',
    title: '5. Account authentication and cloud data',
    paragraphs: [
      'We use Firebase and related Google services for user authentication, databases, and backend capabilities needed to run Card-Social (for example, profiles, cards, and data associated with your account).',
      'We do not sell your personal information to third parties. We may rely on infrastructure and cloud service providers who process data on our instructions under confidentiality and security obligations, only as needed to provide the service.',
    ],
  },
  {
    id: 'rights',
    title: '6. Retention, security, and your rights',
    paragraphs: [
      'We keep information for as long as necessary for the purposes described, legal obligations, and issue resolution. We apply reasonable technical and organizational measures to protect data against unauthorized access.',
      'Depending on applicable law, you may request access, correction, deletion, restriction, or object to processing, and lodge a complaint with your supervisory authority. To exercise your rights, use the contact email at the end of this policy.',
    ],
  },
  {
    id: 'minors',
    title: '7. Children',
    paragraphs: [
      'Card-Social is not intended for users below the minimum age required by our app rules. If you believe a child has provided us data without valid parental consent, contact us so we can take appropriate steps.',
    ],
  },
  {
    id: 'changes',
    title: '8. Changes to this policy',
    paragraphs: [
      'We may update this Privacy Policy to reflect legal or product changes. We will publish the current version at this URL or another URL referenced in the app store listing. Please review it periodically.',
    ],
  },
  {
    id: 'contact',
    title: '9. Contact',
    paragraphs: [
      `For privacy inquiries, data-protection questions, or Card-Social support, contact us at: ${LEGAL_SUPPORT_EMAIL}`,
    ],
  },
];

/** Texto breve para modales / vistas compactas (footer embebido). */
export const PRIVACY_SUMMARY_ES = `Card-Social trata sus datos para operar la app y sus funciones (tarjetas, mercado, Ghost-Link, FaceCall). La cámara y el micrófono se usan para videollamadas en tiempo real (Agora RTC) y para escanear códigos QR. El audio y el video de las llamadas no se graban ni almacenan en nuestros servidores como parte normal del servicio. La ubicación, si la autoriza, sirve para búsquedas en el mercado y para guardar ubicaciones de interés, sin rastreo continuo en segundo plano. Utilizamos Firebase para autenticación y bases de datos; no vendemos sus datos. Contacto: ${LEGAL_SUPPORT_EMAIL}. Política completa: ${LEGAL_URLS.privacyEs}`;

export const PRIVACY_SUMMARY_EN = `Card-Social processes your data to operate the app and its features (cards, marketplace, Ghost-Link, FaceCall). Camera and microphone are used for real-time video calling (Agora RTC) and QR scanning. Call audio and video are not recorded or stored on our servers as part of the normal service. Location, if you allow it, powers marketplace discovery and saving places of interest—no continuous background tracking. We use Firebase for authentication and databases; we do not sell your data. Contact: ${LEGAL_SUPPORT_EMAIL}. Full policy: ${LEGAL_URLS.privacyEn}`;

export const TERMS_LINES_ES = [
  'Card-Social funciona como una bóveda digital para compartir acceso, no para exponer datos sensibles.',
  'Si un usuario decide abrir enlaces externos (wa.me, mailto, etc.), acepta que su información puede quedar visible fuera del ecosistema protegido.',
  'El uso de llamadas y herramientas de contacto está prohibido para acoso, spam, fraude o suplantación de identidad.',
  'Al usar FaceCall, Ghost-Link u otras funciones que requieren cámara o micrófono, autoriza el acceso en el dispositivo necesario para prestar el servicio, conforme a la Política de Privacidad publicada en cardsocial.me.',
  'Card-Social puede suspender cuentas con comportamiento abusivo y aplicar bloqueo permanente de dispositivo en casos graves.',
] as const;

export const TERMS_LINES_EN = [
  'Card-Social works as a digital vault to share access, not to expose sensitive data.',
  'If a user opens external links (wa.me, mailto, etc.), they accept their information may be visible outside the protected ecosystem.',
  'Using calls and contact tools for harassment, spam, fraud, or identity theft is prohibited.',
  'By using FaceCall, Ghost-Link, or other features that require camera or microphone access, you authorize the on-device access needed to provide the service, as described in the Privacy Policy published on cardsocial.me.',
  'Card-Social may suspend accounts with abusive behavior and apply permanent device blocks in severe cases.',
] as const;

export const USAGE_LINES_ES = [
  'Todo archivo o selfie pasa por validación de seguridad con IA antes de guardarse en la nube.',
  'Está prohibido subir contenido sexual explícito, gore, violencia extrema o material ilegal.',
  'Intentos repetidos de contenido prohibido activan controles de seguridad, incluyendo bloqueo temporal de reintentos.',
  'El sistema puede rechazar contenido que no cumpla estándares de seguridad y confianza de la comunidad.',
] as const;

export const USAGE_LINES_EN = [
  'Every file or selfie goes through AI security validation before being saved to the cloud.',
  'Uploading explicit sexual content, gore, extreme violence, or illegal material is prohibited.',
  'Repeated attempts with prohibited content trigger security controls, including temporary retry blocks.',
  'The system may reject content that does not meet community security and trust standards.',
] as const;

export const ABOUT_LINES_ES = [
  'Card-Social nació para devolver al usuario el control total de su información personal y profesional.',
  'Nuestra misión es reemplazar el intercambio inseguro de datos por accesos inteligentes, verificados y actualizados en tiempo real.',
  'Confianza, elegancia y simplicidad: esa es la base del diseño y de toda la experiencia de producto.',
] as const;

export const ABOUT_LINES_EN = [
  'Card-Social was born to give users full control of their personal and professional information.',
  'Our mission is to replace insecure data exchange with smart, verified, real-time access.',
  'Trust, elegance, and simplicity: that is the foundation of the design and the entire product experience.',
] as const;
