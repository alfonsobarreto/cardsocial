/**
 * Contenido legal del sitio (Next.js en cardsocial.me).
 *
 * Importante (Next.js App Router): NO mezclar `process.env` solo-servidor con el valor
 * que Webpack inyecta en el cliente para `NEXT_PUBLIC_*` — provoca error de hidratación
 * y la página queda en blanco / negro. El correo debe ser el mismo en build y runtime.
 */
export const LEGAL_SUPPORT_EMAIL = 'support@cardsocial.me';

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

export const PRIVACY_SECTIONS_FR: PrivacySection[] = [
  {
    id: 'intro',
    title: '1. Responsable et champ d\'application',
    paragraphs: [
      'La présente Politique de confidentialité explique comment Card-Social (« nous ») traite les informations personnelles dans le cadre de l\'application mobile Card-Social et des services associés (notamment cartes numériques, place de marché et fonctionnalités sociales).',
      'En utilisant l\'application, vous reconnaissez les pratiques décrites ici. Si vous n\'y consentez pas, veuillez ne pas utiliser le service.',
    ],
  },
  {
    id: 'camera-mic',
    title: '2. Caméra et microphone',
    paragraphs: [
      'L\'application peut demander l\'accès à la caméra et au microphone de votre appareil uniquement pour activer des fonctionnalités que vous lancez ou approuvez explicitement :',
      '• Appels vidéo en temps réel et appels avec vidéo dans le cadre des fonctionnalités produit « FaceCall » et « Ghost-Link », fournis via la technologie de communication en temps réel Agora RTC.',
      '• Lecture de codes QR pour ajouter des contacts, échanger des invitations ou interagir avec des cartes et des parcours autorisés au sein de Card-Social.',
      'Nous n\'utilisons pas la caméra ni le microphone à des fins non divulguées ni pour enregistrer du contenu en dehors de ces parcours. Vous pouvez révoquer les autorisations à tout moment dans les réglages de l\'appareil.',
    ],
  },
  {
    id: 'voip',
    title: '3. Confidentialité des appels vocaux et vidéo (VoIP)',
    paragraphs: [
      'Les sessions vocales et vidéo FaceCall et Ghost-Link sont transmises en temps réel via l\'infrastructure Agora RTC pour connecter les participants.',
      'Card-Social ne stocke ni ne conserve, dans le cadre normal du service, d\'enregistrements audio ou vidéo de ces sessions sur nos serveurs. Le traitement relève principalement de la transmission en direct entre appareils ; nous n\'exploitons pas ces communications pour construire des profils publicitaires.',
      'Nous pouvons générer des métadonnées techniques minimales nécessaires au fonctionnement et à la sécurité de la plateforme (par exemple identifiants de session, horodatages ou signaux d\'erreur).',
    ],
  },
  {
    id: 'location',
    title: '4. Localisation',
    paragraphs: [
      'Si vous accordez l\'autorisation de localisation, nous l\'utilisons pour des fonctionnalités telles que la recherche d\'entreprises ou de profils à proximité sur la place de marché des cartes et l\'enregistrement de lieux d\'intérêt liés à votre carte ou à votre usage de l\'application lorsque vous le choisissez.',
      'Nous n\'effectuons pas de suivi de localisation en arrière-plan continu en tant que fonctionnalité produit. La localisation est utilisée dans le contexte de vos actions dans l\'application et des autorisations accordées dans le système d\'exploitation.',
    ],
  },
  {
    id: 'firebase',
    title: '5. Authentification du compte et données cloud',
    paragraphs: [
      'Nous utilisons Firebase et les services Google associés pour l\'authentification des utilisateurs, les bases de données et les capacités backend nécessaires au fonctionnement de Card-Social (par exemple profils, cartes et données liées à votre compte).',
      'Nous ne vendons pas vos informations personnelles à des tiers. Nous pouvons faire appel à des fournisseurs d\'infrastructure et de services cloud qui traitent les données sur nos instructions et sous obligations de confidentialité et de sécurité, uniquement dans la mesure nécessaire à la fourniture du service.',
    ],
  },
  {
    id: 'rights',
    title: '6. Conservation, sécurité et vos droits',
    paragraphs: [
      'Nous conservons les informations aussi longtemps que nécessaire aux finalités décrites, aux obligations légales et au traitement des incidents. Nous appliquons des mesures techniques et organisationnelles raisonnables pour protéger les données contre les accès non autorisés.',
      'Selon le droit applicable, vous pouvez demander l\'accès, la rectification, la suppression, la limitation ou vous opposer au traitement, et introduire une réclamation auprès de l\'autorité de contrôle compétente. Pour exercer vos droits, utilisez l\'adresse de contact indiquée à la fin de cette politique.',
    ],
  },
  {
    id: 'minors',
    title: '7. Mineurs',
    paragraphs: [
      'Card-Social ne s\'adresse pas aux utilisateurs de moins de l\'âge minimum requis par nos règles d\'application. Si vous pensez qu\'un enfant nous a fourni des données sans consentement parental valide, contactez-nous afin que nous puissions prendre les mesures appropriées.',
    ],
  },
  {
    id: 'changes',
    title: '8. Modifications de cette politique',
    paragraphs: [
      'Nous pouvons mettre à jour la présente Politique de confidentialité pour refléter des changements juridiques ou liés au produit. Nous publierons la version en vigueur à cette URL ou à une autre URL indiquée dans la fiche du magasin d\'applications. Nous vous invitons à la consulter régulièrement.',
    ],
  },
  {
    id: 'contact',
    title: '9. Contact',
    paragraphs: [
      `Pour toute question relative à la confidentialité, à la protection des données ou au support Card-Social, écrivez-nous à : ${LEGAL_SUPPORT_EMAIL}`,
    ],
  },
];

export const PRIVACY_SECTIONS_IT: PrivacySection[] = [
  {
    id: 'intro',
    title: '1. Titolare del trattamento e ambito',
    paragraphs: [
      'La presente Informativa sulla privacy descrive come Card-Social (« noi ») tratta le informazioni personali in relazione all\'applicazione mobile Card-Social e ai servizi connessi (incluse carte digitali, marketplace e funzionalità sociali).',
      'Utilizzando l\'app, l\'utente riconosce le pratiche qui descritte. Se non si è d\'accordo, si prega di non utilizzare il servizio.',
    ],
  },
  {
    id: 'camera-mic',
    title: '2. Fotocamera e microfono',
    paragraphs: [
      'L\'app può richiedere l\'accesso alla fotocamera e al microfono del dispositivo esclusivamente per abilitare funzioni avviate dall\'utente o approvate esplicitamente:',
      '• Videochiamate in tempo reale e chiamate con video nell\'ambito delle funzionalità « FaceCall » e « Ghost-Link », erogate mediante la tecnologia di comunicazione in tempo reale Agora RTC.',
      '• Scansione di codici QR per aggiungere contatti, riscattare inviti o interagire con carte e flussi autorizzati all\'interno di Card-Social.',
      'Non utilizziamo fotocamera o microfono per finalità non dichiarate né per registrare contenuti al di fuori di questi flussi. Le autorizzazioni possono essere revocate in qualsiasi momento nelle impostazioni del dispositivo.',
    ],
  },
  {
    id: 'voip',
    title: '3. Privacy di chiamate vocali e video (VoIP)',
    paragraphs: [
      'Le sessioni vocali e video FaceCall e Ghost-Link sono trasmesse in tempo reale tramite l\'infrastruttura Agora RTC per collegare i partecipanti.',
      'Card-Social non archivia né conserva, come parte normale del servizio, registrazioni audio o video di tali sessioni sui nostri server. Il trattamento riguarda principalmente la trasmissione in diretta tra gli endpoint; non utilizziamo tali comunicazioni per costruire profili pubblicitari.',
      'Possiamo generare metadati tecnici minimi necessari per operare e proteggere la piattaforma (ad esempio identificatori di sessione, timestamp o segnali di errore).',
    ],
  },
  {
    id: 'location',
    title: '4. Posizione',
    paragraphs: [
      'Se concedi l\'autorizzazione alla posizione, la utilizziamo per funzioni come la ricerca di attività o profili nelle vicinanze nel marketplace delle carte e per salvare luoghi di interesse collegati alla tua carta o all\'esperienza nell\'app quando lo scegli.',
      'Non effettuiamo tracciamento continuo della posizione in background come funzionalità di prodotto. La posizione è usata in relazione alle azioni che compi nell\'app e alle autorizzazioni concesse nel sistema operativo.',
    ],
  },
  {
    id: 'firebase',
    title: '5. Autenticazione dell\'account e dati cloud',
    paragraphs: [
      'Utilizziamo Firebase e servizi Google correlati per l\'autenticazione degli utenti, i database e le capacità di backend necessarie per operare Card-Social (ad esempio profili, carte e dati associati al tuo account).',
      'Non vendiamo le tue informazioni personali a terzi. Possiamo avvalerci di fornitori di infrastruttura e cloud che trattano i dati alle nostre istruzioni e obblighi di riservatezza e sicurezza, solo nella misura necessaria a fornire il servizio.',
    ],
  },
  {
    id: 'rights',
    title: '6. Conservazione, sicurezza e diritti',
    paragraphs: [
      'Conserviamo le informazioni per il tempo necessario alle finalità descritte, agli obblighi legali e alla gestione delle segnalazioni. Applichiamo misure tecniche e organizzative ragionevoli per proteggere i dati da accessi non autorizzati.',
      'In base alla legge applicabile, puoi richiedere accesso, rettifica, cancellazione, limitazione o opporti al trattamento e presentare reclamo all\'autorità di controllo. Per esercitare i diritti, usa l\'email di contatto indicata alla fine di questa informativa.',
    ],
  },
  {
    id: 'minors',
    title: '7. Minori',
    paragraphs: [
      'Card-Social non è destinata a utenti al di sotto dell\'età minima richiesta dalle nostre regole. Se ritieni che un minore ci abbia fornito dati senza valido consenso dei genitori, contattaci per le misure appropriate.',
    ],
  },
  {
    id: 'changes',
    title: '8. Modifiche alla presente informativa',
    paragraphs: [
      'Possiamo aggiornare questa Informativa sulla privacy per riflettere cambiamenti legali o di prodotto. Pubblicheremo la versione vigente a questo URL o a un altro URL indicato nella scheda dello store. Ti invitiamo a consultarla periodicamente.',
    ],
  },
  {
    id: 'contact',
    title: '9. Contatto',
    paragraphs: [
      `Per questioni privacy, protezione dei dati o supporto Card-Social, contattaci a: ${LEGAL_SUPPORT_EMAIL}`,
    ],
  },
];

export const PRIVACY_SECTIONS_PT: PrivacySection[] = [
  {
    id: 'intro',
    title: '1. Responsável e âmbito',
    paragraphs: [
      'Esta Política de Privacidade explica como a Card-Social (« nós ») trata informações pessoais no âmbito da aplicação móvel Card-Social e dos serviços relacionados (incluindo cartões digitais, mercado e funcionalidades sociais).',
      'Ao utilizar a aplicação, o utilizador reconhece as práticas aqui descritas. Se não concordar, não utilize o serviço.',
    ],
  },
  {
    id: 'camera-mic',
    title: '2. Câmara e microfone',
    paragraphs: [
      'A aplicação pode solicitar acesso à câmara e ao microfone do dispositivo apenas para permitir funcionalidades que o utilizador inicia ou aprova explicitamente:',
      '• Videochamadas em tempo real e chamadas com vídeo no âmbito das funcionalidades « FaceCall » e « Ghost-Link », prestadas com a tecnologia de comunicação em tempo real Agora RTC.',
      '• Leitura de códigos QR para adicionar contactos, resgatar convites ou interagir com cartões e fluxos autorizados dentro da Card-Social.',
      'Não utilizamos a câmara nem o microfone para fins não divulgados nem para gravar conteúdo fora destes fluxos. Pode revogar as permissões a qualquer momento nas definições do dispositivo.',
    ],
  },
  {
    id: 'voip',
    title: '3. Privacidade de chamadas de voz e vídeo (VoIP)',
    paragraphs: [
      'As sessões de voz e vídeo FaceCall e Ghost-Link são transmitidas em tempo real através da infraestrutura Agora RTC para ligar os participantes.',
      'A Card-Social não armazena nem conserva, como parte normal do serviço, gravações de áudio ou vídeo dessas sessões nos nossos servidores. O tratamento é sobretudo transmissão em direto entre dispositivos; não utilizamos essas comunicações para construir perfis publicitários.',
      'Podemos gerar metadados técnicos mínimos necessários para operar e proteger a plataforma (por exemplo identificadores de sessão, carimbos de data/hora ou sinais de erro).',
    ],
  },
  {
    id: 'location',
    title: '4. Localização',
    paragraphs: [
      'Se conceder permissão de localização, utilizamo-la para funcionalidades como pesquisa de negócios ou perfis próximos no mercado de cartões e para guardar locais de interesse associados ao seu cartão ou experiência na aplicação quando assim o decidir.',
      'Não realizamos rastreio contínuo de localização em segundo plano como funcionalidade de produto. A localização é utilizada no contexto das suas ações na aplicação e das permissões concedidas no sistema operativo.',
    ],
  },
  {
    id: 'firebase',
    title: '5. Autenticação da conta e dados na nuvem',
    paragraphs: [
      'Utilizamos o Firebase e serviços Google relacionados para autenticação de utilizadores, bases de dados e capacidades de backend necessárias para operar a Card-Social (por exemplo perfis, cartões e dados associados à sua conta).',
      'Não vendemos as suas informações pessoais a terceiros. Podemos recorrer a fornecedores de infraestrutura e serviços na nuvem que tratam dados segundo as nossas instruções e obrigações de confidencialidade e segurança, apenas na medida necessária para prestar o serviço.',
    ],
  },
  {
    id: 'rights',
    title: '6. Retenção, segurança e os seus direitos',
    paragraphs: [
      'Conservamos as informações pelo tempo necessário às finalidades descritas, às obrigações legais e à resolução de incidentes. Aplicamos medidas técnicas e organizativas razoáveis para proteger os dados contra acessos não autorizados.',
      'Conforme a lei aplicável, pode solicitar acesso, retificação, apagamento, limitação ou opor-se ao tratamento e apresentar reclamação à autoridade de controlo. Para exercer os seus direitos, utilize o email de contacto indicado no final desta política.',
    ],
  },
  {
    id: 'minors',
    title: '7. Menores',
    paragraphs: [
      'A Card-Social não se destina a utilizadores abaixo da idade mínima exigida pelas regras da aplicação. Se acredita que uma criança nos forneceu dados sem consentimento parental válido, contacte-nos para medidas adequadas.',
    ],
  },
  {
    id: 'changes',
    title: '8. Alterações a esta política',
    paragraphs: [
      'Podemos atualizar esta Política de Privacidade para refletir alterações legais ou de produto. Publicaremos a versão vigente neste URL ou noutro URL referenciado na ficha da loja de aplicações. Recomendamos que a reveja periodicamente.',
    ],
  },
  {
    id: 'contact',
    title: '9. Contacto',
    paragraphs: [
      `Para questões de privacidade, proteção de dados ou suporte Card-Social, contacte-nos em: ${LEGAL_SUPPORT_EMAIL}`,
    ],
  },
];

export const PRIVACY_SECTIONS_DE: PrivacySection[] = [
  {
    id: 'intro',
    title: '1. Verantwortlicher und Geltungsbereich',
    paragraphs: [
      'Diese Datenschutzerklärung erläutert, wie Card-Social („wir“) personenbezogene Daten im Zusammenhang mit der Card-Social-Mobile-App und verwandten Diensten verarbeitet (einschließlich digitaler Karten, Marktplatzfunktionen und sozialer Funktionen).',
      'Durch die Nutzung der App erkennen Sie die hier beschriebenen Verfahren an. Wenn Sie nicht einverstanden sind, nutzen Sie den Dienst bitte nicht.',
    ],
  },
  {
    id: 'camera-mic',
    title: '2. Kamera und Mikrofon',
    paragraphs: [
      'Die App kann den Zugriff auf Kamera und Mikrofon Ihres Geräts ausschließlich anfordern, um Funktionen zu ermöglichen, die Sie starten oder ausdrücklich bestätigen:',
      '• Echtzeit-Videos und Videoanrufe im Rahmen der Produktfunktionen „FaceCall“ und „Ghost-Link“, bereitgestellt mit Agora-RTC-Echtzeitkommunikation.',
      '• Scannen von QR-Codes, um Kontakte hinzuzuzufügen, Einladungen einzulösen oder mit Karten und autorisierten Abläufen innerhalb von Card-Social zu interagieren.',
      'Wir nutzen Kamera und Mikrofon nicht für nicht offengelegte Zwecke und nicht zur Aufzeichnung von Inhalten außerhalb dieser Abläufe. Berechtigungen können Sie jederzeit in den Geräteeinstellungen widerrufen.',
    ],
  },
  {
    id: 'voip',
    title: '3. Datenschutz bei Sprach- und Videoanrufen (VoIP)',
    paragraphs: [
      'FaceCall- und Ghost-Link-Sprach- und Videositzungen werden in Echtzeit über die Agora-RTC-Infrastruktur übertragen, um die Teilnehmer zu verbinden.',
      'Card-Social speichert im Rahmen des normalen Betriebs keine Audio- oder Videoaufzeichnungen dieser Sitzungen auf unseren Servern. Die Verarbeitung besteht vor allem in der Live-Übertragung zwischen Endpunkten; wir nutzen diese Kommunikation nicht zum Aufbau von Werbeprofilen.',
      'Wir können minimale technische Metadaten erzeugen, die zum Betrieb und zur Absicherung der Plattform erforderlich sind (z. B. Sitzungskennungen, Zeitstempel oder Fehlersignale).',
    ],
  },
  {
    id: 'location',
    title: '4. Standort',
    paragraphs: [
      'Wenn Sie die Standortberechtigung erteilen, nutzen wir sie für Funktionen wie die Suche nach nahegelegenen Unternehmen oder Profilen im Karten-Marktplatz und zum Speichern von Orten von Interesse in Verbindung mit Ihrer Karte oder In-App-Erfahrung, wenn Sie dies wählen.',
      'Wir führen kein durchgehendes Standort-Tracking im Hintergrund als Produktfunktion durch. Der Standort wird im Zusammenhang mit Ihren Aktionen in der App und den im Betriebssystem erteilten Berechtigungen verwendet.',
    ],
  },
  {
    id: 'firebase',
    title: '5. Kontenauthentifizierung und Cloud-Daten',
    paragraphs: [
      'Wir nutzen Firebase und zugehörige Google-Dienste für Nutzerauthentifizierung, Datenbanken und Backend-Fähigkeiten, die zum Betrieb von Card-Social erforderlich sind (z. B. Profile, Karten und mit Ihrem Konto verbundene Daten).',
      'Wir verkaufen Ihre personenbezogenen Daten nicht an Dritte. Wir können auf Infrastruktur- und Cloud-Anbieter zurückgreifen, die Daten nach unseren Weisungen und unter Vertraulichkeits- und Sicherheitspflichten verarbeiten, nur soweit dies zur Erbringung des Dienstes erforderlich ist.',
    ],
  },
  {
    id: 'rights',
    title: '6. Aufbewahrung, Sicherheit und Ihre Rechte',
    paragraphs: [
      'Wir bewahren Informationen so lange auf, wie es für die beschriebenen Zwecke, gesetzliche Pflichten und die Bearbeitung von Vorfällen erforderlich ist. Wir treffen angemessene technische und organisatorische Maßnahmen zum Schutz der Daten vor unbefugtem Zugriff.',
      'Je nach anwendbarem Recht können Sie Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung oder Widerspruch verlangen und Beschwerde bei Ihrer Aufsichtsbehörde einlegen. Zur Ausübung Ihrer Rechte nutzen Sie die am Ende dieser Erklärung angegebene Kontakt-E-Mail.',
    ],
  },
  {
    id: 'minors',
    title: '7. Kinder',
    paragraphs: [
      'Card-Social richtet sich nicht an Nutzer unter dem gemäß unseren App-Regeln erforderlichen Mindestalter. Wenn Sie der Meinung sind, dass uns ein Kind ohne gültige elterliche Einwilligung Daten übermittelt hat, kontaktieren Sie uns, damit wir geeignete Schritte unternehmen können.',
    ],
  },
  {
    id: 'changes',
    title: '8. Änderungen dieser Erklärung',
    paragraphs: [
      'Wir können diese Datenschutzerklärung anpassen, um rechtliche oder produktbezogene Änderungen widerzuspiegeln. Die gültige Version veröffentlichen wir unter dieser URL oder einer anderen im App-Store-Eintrag genannten URL. Wir empfehlen eine regelmäßige Prüfung.',
    ],
  },
  {
    id: 'contact',
    title: '9. Kontakt',
    paragraphs: [
      `Fragen zum Datenschutz, zum Datenschutzrecht oder zum Card-Social-Support richten Sie bitte an: ${LEGAL_SUPPORT_EMAIL}`,
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

export const TERMS_LINES_FR = [
  'Card-Social fonctionne comme un coffre-fort numérique pour partager l\'accès, et non pour exposer des données sensibles.',
  'Si un utilisateur ouvre des liens externes (wa.me, mailto, etc.), il accepte que ses informations puissent être visibles en dehors de l\'écosystème protégé.',
  'L\'utilisation des appels et des outils de contact à des fins de harcèlement, de spam, de fraude ou d\'usurpation d\'identité est interdite.',
  'En utilisant FaceCall, Ghost-Link ou d\'autres fonctionnalités nécessitant l\'accès à la caméra ou au microphone, vous autorisez l\'accès sur l\'appareil requis pour fournir le service, conformément à la politique de confidentialité publiée sur cardsocial.me.',
  'Card-Social peut suspendre les comptes présentant un comportement abusif et appliquer un blocage permanent d\'appareil dans les cas graves.',
] as const;

export const TERMS_LINES_IT = [
  'Card-Social funge da cassaforte digitale per condividere l\'accesso, non per esporre dati sensibili.',
  'Se un utente apre link esterni (wa.me, mailto, ecc.), accetta che le sue informazioni possano essere visibili al di fuori dell\'ecosistema protetto.',
  'È vietato utilizzare chiamate e strumenti di contatto per molestie, spam, frode o furto di identità.',
  'Utilizzando FaceCall, Ghost-Link o altre funzioni che richiedono accesso a fotocamera o microfono, autorizzi l\'accesso sul dispositivo necessario per erogare il servizio, come descritto nell\'Informativa sulla privacy pubblicata su cardsocial.me.',
  'Card-Social può sospendere account con comportamento abusivo e applicare il blocco permanente del dispositivo nei casi gravi.',
] as const;

export const TERMS_LINES_PT = [
  'A Card-Social funciona como um cofre digital para compartilhar acesso, não para expor dados sensíveis.',
  'Se o utilizador abrir links externos (wa.me, mailto, etc.), aceita que as suas informações possam ficar visíveis fora do ecossistema protegido.',
  'É proibido usar chamadas e ferramentas de contacto para assédio, spam, fraude ou furto de identidade.',
  'Ao usar FaceCall, Ghost-Link ou outras funcionalidades que exigem câmara ou microfone, autoriza o acesso no dispositivo necessário para prestar o serviço, de acordo com a Política de Privacidade publicada em cardsocial.me.',
  'A Card-Social pode suspender contas com comportamento abusivo e aplicar bloqueio permanente do dispositivo em casos graves.',
] as const;

export const TERMS_LINES_DE = [
  'Card-Social dient als digitaler Tresor zum kontrollierten Teilen von Zugriff – nicht dazu, sensible Daten offenzulegen.',
  'Wenn ein Nutzer externe Links (wa.me, mailto usw.) öffnet, erkennt er an, dass seine Informationen außerhalb des geschützten Ökosystems sichtbar werden können.',
  'Die Nutzung von Anrufen und Kontakttools zu Belästigung, Spam, Betrug oder Identitätsdiebstahl ist untersagt.',
  'Durch die Nutzung von FaceCall, Ghost-Link oder anderer Funktionen, die Kamera- oder Mikrofonzugriff erfordern, willigen Sie in den geräteseitigen Zugriff ein, der zur Erbringung des Dienstes erforderlich ist, gemäß der auf cardsocial.me veröffentlichten Datenschutzerklärung.',
  'Card-Social kann Konten bei missbräuchlichem Verhalten sperren und in schwerwiegenden Fällen eine dauerhafte Gerätesperre verhängen.',
] as const;

export const USAGE_LINES_FR = [
  'Chaque fichier ou selfie fait l\'objet d\'une validation de sécurité par intelligence artificielle (IA) avant d\'être enregistré dans le cloud.',
  'Le téléchargement de contenu sexuellement explicite, de gore, de violence extrême ou de matériel illégal est interdit.',
  'Des tentatives répétées avec du contenu interdit déclenchent des contrôles de sécurité, y compris un blocage temporaire des nouvelles tentatives.',
  'Le système peut rejeter tout contenu qui ne répond pas aux normes de sécurité et de confiance de la communauté.',
] as const;

export const USAGE_LINES_IT = [
  'Ogni file o selfie è sottoposto a convalida di sicurezza tramite intelligenza artificiale (IA) prima di essere salvato nel cloud.',
  'È vietato caricare contenuti sessualmente espliciti, gore, violenza estrema o materiale illegale.',
  'Tentativi ripetuti con contenuti vietati attivano controlli di sicurezza, inclusi blocchi temporanei dei nuovi tentativi.',
  'Il sistema può rifiutare contenuti che non rispettano gli standard di sicurezza e fiducia della comunità.',
] as const;

export const USAGE_LINES_PT = [
  'Cada ficheiro ou selfie é sujeito a validação de segurança por inteligência artificial (IA) antes de ser guardado na nuvem.',
  'É proibido carregar conteúdo sexual explícito, violência extrema (gore) ou material ilegal.',
  'Tentativas repetidas com conteúdo proibido activam controlos de segurança, incluindo bloqueio temporário de novas tentativas.',
  'O sistema pode rejeitar conteúdo que não cumpra os padrões de segurança e confiança da comunidade.',
] as const;

export const USAGE_LINES_DE = [
  'Jede Datei und jedes Selfie durchläuft vor der Speicherung in der Cloud eine Sicherheitsprüfung mittels Künstlicher Intelligenz (KI).',
  'Das Hochladen von eindeutig sexuellen Inhalten, Gore, extremer Gewalt oder illegalem Material ist untersagt.',
  'Wiederholte Versuche mit verbotenen Inhalten lösen Sicherheitskontrollen aus, einschließlich vorübergehender Sperren für weitere Upload-Versuche.',
  'Das System kann Inhalte ablehnen, die den Sicherheits- und Vertrauensstandards der Community nicht entsprechen.',
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
