/**
 * Diccionario maestro de errores técnicos → mensaje humano (6 idiomas).
 * Usar en App; Next puede importar vía `@card-social/services/machineErrorCatalog`.
 */

import machineErrorQrNfc from './i18n/machineErrorQrNfc.json';

export type MachineErrorLocale = 'es' | 'en' | 'it' | 'fr' | 'de' | 'pt';

/** Bloques A–F: copy homogéneo por familia de fallo. */
export const MACHINE_ERROR_BLOCKS: Record<
  'A' | 'B' | 'C' | 'D' | 'E' | 'F',
  Record<MachineErrorLocale, string>
> = {
  A: {
    es: 'Esta acción no está disponible para tu cuenta actual o no cuentas con los permisos necesarios.',
    en: 'This action is not available for your current account or you lack the required permissions.',
    it: "Questa azione non è disponibile per il tuo account attuale o non disponi dei permessi necessari.",
    pt: 'Esta ação não está disponível para sua conta atual ou você não possui as permissões necessárias.',
    fr: "Cette action n'est pas disponible pour votre compte actuel ou vous ne disposez pas des permissions requises.",
    de: 'Diese Aktion ist für Ihr aktuelles Konto nicht verfügbar oder Sie verfügen nicht über die erforderlichen Berechtigungen.',
  },
  B: {
    es: 'Esta función requiere una cuenta activa de nivel superior o una tarjeta de negocio vinculada.',
    en: 'This feature requires a higher-level active account or a linked business card.',
    it: 'Questa funzione richiede un account attivo di livello superiore o una business card collegata.',
    pt: 'Esta função requer uma conta ativa de nível superior ou um cartão de negócios vinculado.',
    fr: 'Cette fonctionnalité nécessite un compte actif de niveau supérieur ou une carte de visite liée.',
    de: 'Diese Funktion erfordert ein aktives Konto einer höheren Stufe oder eine verknüpfte Business-Karte.',
  },
  C: {
    es: 'El contenido o enlace no cumple con las políticas de seguridad y moderación de Card-Social.',
    en: "The content or link does not comply with Card-Social's security and moderation policies.",
    it: 'Il contenuto o il link non è conforme alle politiche di sicurezza e moderazione di Card-Social.',
    pt: 'O conteúdo ou link não cumpre as políticas de segurança e moderação da Card-Social.',
    fr: "Le contenu ou le lien n'est pas conforme aux politiques de sécurité et de modération de Card-Social.",
    de: 'Der Inhalt oder Link entspricht nicht den Sicherheits- und Moderationsrichtlinien von Card-Social.',
  },
  D: {
    es: 'Saldo de AirTime agotado o la línea se encuentra silenciada. Recarga en tu Dashboard.',
    en: 'AirTime balance depleted or the line is muted. Top up from your Dashboard.',
    it: 'Saldo AirTime esaurito o la linea è silenziata. Ricarica dal tuo Dashboard.',
    pt: 'Saldo de AirTime esgotado ou a linha está silenciada. Recarregue no seu Dashboard.',
    fr: 'Solde AirTime épuisé ou la ligne est muette. Rechargez depuis votre Dashboard.',
    de: 'AirTime-Guthaben abgelaufen oder die Leitung ist stummgeschaltet. Laden Sie es im Dashboard auf.',
  },
  E: {
    es: 'Esta actualización ya se realizó recientemente o el dato ingresado ya se encuentra en uso.',
    en: 'This update was recently made or the entered data is already in use.',
    it: "Questo aggiornamento è stato fatto di recente o i dati inseriti sono già in uso.",
    pt: 'Esta atualização foi feita recentemente ou o dado inserido já está em uso.',
    fr: 'Cette mise à jour a été effectuée récemment ou la donnée saisie est déjà utilisée.',
    de: 'Diese Aktualisierung wurde vor Kurzem vorgenommen oder die eingegebenen Daten werden bereits verwendet.',
  },
  F: {
    es: 'Servicio temporalmente no disponible. Estamos optimizando la conexión, por favor intenta en un momento.',
    en: 'Service temporarily unavailable. We are optimizing the connection, please try again in a moment.',
    it: 'Servizio temporaneamente non disponibile. Stiamo ottimizzando la connessione, riprova tra un momento.',
    pt: 'Serviço temporariamente indisponível. Estamos otimizando a conexão, por favor tente novamente em um momento.',
    fr: 'Service temporairement indisponible. Nous optimisons la connexion, veuillez réessayer dans un instant.',
    de: 'Dienst vorübergehend nicht verfügbar. Wir optimieren die Verbindung, bitte versuchen Sie es gleich noch einmal.',
  },
};

/** Mensajes que no encajan en A–F (p. ej. equipo interno). */
export const MACHINE_ERROR_EXTRA: Record<string, Record<MachineErrorLocale, string>> = {
  admin_restricted: {
    es: 'Acceso restringido. Esta sección es exclusiva para el equipo de desarrollo de Card-Social.',
    en: 'Restricted access. This section is exclusive to the Card-Social development team.',
    it: 'Accesso limitato. Questa sezione è esclusiva per il team di sviluppo di Card-Social.',
    pt: 'Acesso restrito. Esta seção é exclusiva para a equipe de desenvolvimento da Card-Social.',
    fr: "Accès restreint. Cette section est exclusive à l'équipe de développement de Card-Social.",
    de: 'Eingeschränkter Zugriff. Dieser Bereich ist exklusiv für das Entwicklungsteam von Card-Social.',
  },
  nfc_activation_pin_invalid: {
    es: 'El PIN de activación no es correcto. Verifícalo e inténtalo de nuevo.',
    en: 'The activation PIN is incorrect. Check it and try again.',
    it: 'Il PIN di attivazione non è corretto. Verificalo e riprova.',
    pt: 'O PIN de ativação está incorreto. Verifique e tente novamente.',
    fr: 'Le PIN d’activation est incorrect. Vérifiez-le et réessayez.',
    de: 'Die Aktivierungs-PIN ist falsch. Bitte prüfen und erneut versuchen.',
  },
  /** Registro / Auth: cuenta Firebase ya existe con ese correo — mensaje específico (no bloque E genérico). */
  register_email_already_in_use: {
    es: 'Ese correo ya tiene una cuenta. Inicia sesión o usa recuperar contraseña. No es posible duplicar usuarios.',
    en: 'That email already has an account. Sign in or use password recovery — duplicate registrations are not allowed.',
    it: 'Questa email ha già un account. Accedi o usa il recupero password: non sono ammessi duplicati.',
    pt: 'Esse e-mail já possui uma conta. Entre ou use recuperação de senha — não permitimos usuários duplicados.',
    fr: 'Cet e-mail possède déjà un compte. Connectez-vous ou utilisez la récupération du mot de passe — pas de doublon.',
    de: 'Diese E-Mail ist bereits registriert. Bitte anmelden oder Passwort zurücksetzen — keine doppelten Konten.',
  },
  relationship_blocked: {
    es: 'No puedes realizar esta acción con este contacto por restricciones de privacidad o bloqueo.',
    en: 'You cannot take this action with this contact due to privacy or blocking restrictions.',
    it: 'Non puoi eseguire questa azione con questo contatto a causa di restrizioni di privacy o blocco.',
    pt: 'Você não pode realizar esta ação com este contato devido a restrições de privacidade ou bloqueio.',
    fr: 'Vous ne pouvez pas effectuer cette action avec ce contact en raison de restrictions de confidentialité ou de blocage.',
    de: 'Sie können diese Aktion mit diesem Kontakt aufgrund von Datenschutz- oder Sperrbeschränkungen nicht ausführen.',
  },
  ...(machineErrorQrNfc as Record<string, Record<MachineErrorLocale, string>>),
};

/** Código de máquina (tal cual en JSON) → bloque A–F. */
export const MACHINE_ERROR_CODE_TO_BLOCK: Record<string, 'A' | 'B' | 'C' | 'D' | 'E' | 'F'> = {
  // —— A: identidad / permisos ——
  JWT_SCOPE_MISMATCH: 'A',
  ADMIN_CONSOLE_TOKEN_SCOPE_DENIED: 'A',
  ADMIN_ROLE_REQUIRED: 'A',
  ADMIN_ACCESS_REQUIRED: 'A',
  ADMIN_SYSTEM_STATS_UID_NOT_ALLOWED: 'A',
  NOT_AUTHORIZED_READ_CARD: 'A',
  UID_MISMATCH: 'A',
  UID_DOES_NOT_MATCH_AUTH_USER: 'A',
  CALLER_NOT_OWNER_OR_SUBSCRIBER: 'A',
  FORBIDDEN: 'A',
  missing_bearer_token: 'A',
  invalid_or_expired_id_token: 'A',
  missing_token: 'A',
  invalid_token: 'A',
  no_email_on_token: 'A',
  auth_forbidden: 'A',
  not_signed_in: 'A',
  AUTH_REQUIRED: 'A',

  // —— B: tiers / negocio / radar ——
  market_radar_requires_business_card: 'B',
  market_radar_pro_required: 'B',
  tier_not_met: 'B',
  tier_required: 'B',
  NO_ACTIVE_SHARE: 'B',
  market_radar_gate_failed: 'B',
  business_card_required: 'B',

  // —— C: seguridad / moderación / QR ——
  SECURITY_LINK_REJECTED: 'C',
  CONTENT_SAFETY_BLOCKED: 'C',
  'File blocked by Azure Content Safety': 'C',
  'URL scheme or host not allowed for QR encoding.': 'C',

  // —— D: VoIP / llamadas ——
  VOIP_MINUTES_EXHAUSTED: 'D',
  CALL_CARD_MUTED: 'D',
  'Call blocked: card is muted': 'D',

  // —— E: cooldown / duplicados ——
  USERNAME_CHANGE_COOLDOWN: 'E',
  'Solo puedes cambiar tu nombre de usuario cada 30 días': 'E',
  'Solo puedes cambiar tu nombre de usuario una vez cada 30 días.': 'E',
  same_email: 'E',
  email_already_in_use: 'E',
  invalid_new_email: 'E',
  email_mismatch_refresh_token: 'E',
  already_sent: 'E',
  skipped_already_sent: 'E',

  // —— F: infra / red / servidor ——
  verify_token_timeout: 'F',
  network_unreachable: 'F',
  http_403: 'F',
  http_404: 'F',
  http_500: 'F',
  http_502: 'F',
  http_503: 'F',
  http_504: 'F',
  promotions_qr_studio_bad_response: 'F',
  promotions_qr_request_timeout: 'F',
  server_error: 'F',
  bad_json: 'F',
  invalid_payload: 'F',
  send_failed: 'F',
  email_failed: 'F',
  firestore_admin_unavailable: 'F',
  revenuecat_request_failed: 'F',
  revenuecat_missing_params: 'F',
  revenuecat_no_revenue_metric: 'F',
  stripe_request_failed: 'F',
  stripe_missing_params: 'F',
  firebase_credentials_missing: 'F',
  firebase_json_malformed: 'F',
  firebase_private_key_invalid: 'F',
  firebase_credentials_file_missing: 'F',
  firebase_credentials_file_malformed: 'F',
  embed_secret_missing: 'F',
  embed_secret_too_short: 'F',
  service_unavailable: 'F',
  connection_timeout: 'F',
  custom_token_failed: 'F',
  missing_et: 'F',
  invalid_or_expired_et: 'F',
  email_unconfigured: 'F',
  invalid_milestone: 'F',
  studio_url_missing: 'F',
  // Firestore / beneficios / genéricos
  invalid_deadline_iso: 'F',
  not_marked_for_deletion: 'F',
  deadline_mismatch: 'F',
  invalid_body: 'F',
  invalid_event_type: 'F',
  rate_limited: 'F',
  not_found: 'F',
  server: 'F',
  invalid: 'F',
  unconfigured: 'F',
  link_failed: 'F',
  bId_required: 'F',
  card_not_found_or_forbidden: 'A',
  email_not_available_on_account: 'A',

  SERVER_INTERNAL_ERROR: 'F',
  GATEWAY_KEY_INVALID: 'A',
  GATEWAY_MISCONFIGURED: 'F',
  JWT_TOKEN_MISSING: 'A',
  JWT_TOKEN_INVALID: 'A',
};

/** Códigos que conservan copy específico (no bloque A–F genérico). */
const MACHINE_ERROR_CODE_TO_EXTRA_KEY: Partial<Record<string, keyof typeof MACHINE_ERROR_EXTRA>> = {
  RELATIONSHIP_BLOCKED: 'relationship_blocked',
  NFC_ACTIVATION_PIN_INVALID: 'nfc_activation_pin_invalid',
  email_already_in_use: 'register_email_already_in_use',
};

function normalizeMachineErrorCode(raw: string | undefined | null): string {
  return String(raw ?? '').trim();
}

function blockForDynamicCode(code: string): 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | null {
  const lower = code.toLowerCase();
  if (lower.startsWith('http_')) return 'F';
  if (lower.startsWith('revenuecat_http_')) return 'F';
  if (lower.startsWith('stripe_http_')) return 'F';
  if (lower.startsWith('firebase_')) return 'F';
  return null;
}

/**
 * Resuelve el mensaje legible para un código de error estable.
 * @param messageKeyFallback clave legada (p. ej. `sign_in_required`) cuando no hay mapeo por código.
 */
export function machineErrorUserMessage(
  code: string | undefined | null,
  locale: MachineErrorLocale,
  messageKeyFallback?: string,
): string {
  const c0 = normalizeMachineErrorCode(code);
  if (!c0 && messageKeyFallback && MACHINE_ERROR_EXTRA[messageKeyFallback]) {
    return MACHINE_ERROR_EXTRA[messageKeyFallback][locale] ?? MACHINE_ERROR_EXTRA[messageKeyFallback].en;
  }
  if (!c0) {
    return MACHINE_ERROR_BLOCKS.F[locale];
  }

  const extraByCode =
    MACHINE_ERROR_CODE_TO_EXTRA_KEY[c0] || MACHINE_ERROR_CODE_TO_EXTRA_KEY[c0.toUpperCase()];
  if (extraByCode && MACHINE_ERROR_EXTRA[extraByCode]) {
    const row = MACHINE_ERROR_EXTRA[extraByCode];
    return row[locale] ?? row.en;
  }

  const block = MACHINE_ERROR_CODE_TO_BLOCK[c0] || MACHINE_ERROR_CODE_TO_BLOCK[c0.toUpperCase()] || blockForDynamicCode(c0);
  if (block) {
    return MACHINE_ERROR_BLOCKS[block][locale] ?? MACHINE_ERROR_BLOCKS[block].en;
  }

  if (MACHINE_ERROR_EXTRA[c0]) {
    return MACHINE_ERROR_EXTRA[c0][locale] ?? MACHINE_ERROR_EXTRA[c0].en;
  }

  if (messageKeyFallback && MACHINE_ERROR_EXTRA[messageKeyFallback]) {
    return MACHINE_ERROR_EXTRA[messageKeyFallback][locale] ?? MACHINE_ERROR_EXTRA[messageKeyFallback].en;
  }

  return MACHINE_ERROR_BLOCKS.F[locale];
}
