/**
 * Diccionario maestro de errores (6 idiomas): `error` legible + `errorCode` estable.
 * Alineado con `services/machineErrorCatalog.ts` y `frontend-web/lib/userFacingApiMessages.ts`.
 *
 * Idioma: Accept-Language (primer tag; fallback EN).
 */

'use strict';

const path = require('path');
const fs = require('fs');

/**
 * Resolución robusta: el despliegue (p. ej. Azure wwwroot) a veces no incluye `services/i18n`
 * junto a `backend/`. Varias rutas candidatas + fallback `{}` evitan crash fatal (ENOENT → 503).
 */
function resolveExistingPath(label, relativeFromLib, cwdRelative) {
  const fileName = path.basename(String(cwdRelative || '').replace(/\\/g, '/'));
  const candidates = [
    path.join(__dirname, '..', 'i18n', fileName),
    path.join(process.cwd(), 'i18n', fileName),
    path.join(__dirname, relativeFromLib),
    path.join(process.cwd(), cwdRelative),
    path.join(process.cwd(), '..', cwdRelative),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  console.warn(`[userFacingErrors] ${label}: no file found in candidates, using empty catalog`);
  return candidates[0];
}

/**
 * @param {string} absPath
 * @param {string} label
 * @returns {Record<string, Record<string, string>>}
 */
function readLocalizedJsonSafe(absPath, label) {
  try {
    if (!fs.existsSync(absPath)) {
      console.warn(`[userFacingErrors] ${label} missing at ${absPath} — using {}`);
      return {};
    }
    const txt = fs.readFileSync(absPath, 'utf8');
    const parsed = JSON.parse(txt);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error(`[userFacingErrors] ${label} read/parse failed (${absPath}):`, err && err.message ? err.message : err);
    return {};
  }
}

const qrNfcPath = resolveExistingPath(
  'machineErrorQrNfc.json',
  '../../../services/i18n/machineErrorQrNfc.json',
  'services/i18n/machineErrorQrNfc.json',
);
/** @type {Record<string, Record<'es'|'en'|'it'|'fr'|'de'|'pt', string>>} */
const QR_NFC_LOCALIZED = readLocalizedJsonSafe(qrNfcPath, 'machineErrorQrNfc');

const successQrNfcPath = resolveExistingPath(
  'machineSuccessQrNfc.json',
  '../../../services/i18n/machineSuccessQrNfc.json',
  'services/i18n/machineSuccessQrNfc.json',
);
/** @type {Record<string, Record<'es'|'en'|'it'|'fr'|'de'|'pt', string>>} */
const SUCCESS_QR_NFC_LOCALIZED = readLocalizedJsonSafe(successQrNfcPath, 'machineSuccessQrNfc');

/** @type {Record<'A'|'B'|'C'|'D'|'E'|'F', Record<'es'|'en'|'it'|'fr'|'de'|'pt', string>>} */
const MACHINE_ERROR_BLOCKS = {
  A: {
    es: 'Esta acción no está disponible para tu cuenta actual o no cuentas con los permisos necesarios.',
    en: 'This action is not available for your current account or you lack the required permissions.',
    it: 'Questa azione non è disponibile per il tuo account attuale o non disponi dei permessi necessari.',
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
    it: 'Questo aggiornamento è stato fatto di recente o i dati inseriti sono già in uso.',
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

/** @type {Record<string, Record<'es'|'en'|'it'|'fr'|'de'|'pt', string>>} */
const MACHINE_ERROR_EXTRA = {
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
  relationship_blocked: {
    es: 'No puedes realizar esta acción con este contacto por restricciones de privacidad o bloqueo.',
    en: 'You cannot take this action with this contact due to privacy or blocking restrictions.',
    it: 'Non puoi eseguire questa azione con questo contatto a causa di restrizioni di privacy o blocco.',
    pt: 'Você não pode realizar esta ação com este contato devido a restrições de privacidade ou bloqueio.',
    fr: 'Vous ne pouvez pas effectuer cette action avec ce contact en raison de restrictions de confidentialité ou de blocage.',
    de: 'Sie können diese Aktion mit diesem Kontakt aufgrund von Datenschutz- oder Sperrbeschränkungen nicht ausführen.',
  },
  ...QR_NFC_LOCALIZED,
};

/** @type {Record<string, 'A'|'B'|'C'|'D'|'E'|'F'>} */
const MACHINE_ERROR_CODE_TO_BLOCK = {
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

  market_radar_requires_business_card: 'B',
  market_radar_pro_required: 'B',
  tier_not_met: 'B',
  tier_required: 'B',
  NO_ACTIVE_SHARE: 'B',
  market_radar_gate_failed: 'B',
  business_card_required: 'B',

  SECURITY_LINK_REJECTED: 'C',
  CONTENT_SAFETY_BLOCKED: 'C',
  'File blocked by Azure Content Safety': 'C',
  'URL scheme or host not allowed for QR encoding.': 'C',

  VOIP_MINUTES_EXHAUSTED: 'D',
  CALL_CARD_MUTED: 'D',
  'Call blocked: card is muted': 'D',

  USERNAME_CHANGE_COOLDOWN: 'E',
  'Solo puedes cambiar tu nombre de usuario cada 30 días': 'E',
  'Solo puedes cambiar tu nombre de usuario una vez cada 30 días.': 'E',
  same_email: 'E',
  email_already_in_use: 'E',
  invalid_new_email: 'E',
  email_mismatch_refresh_token: 'E',
  already_sent: 'E',
  skipped_already_sent: 'E',

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

/** @type {Record<string, keyof typeof MACHINE_ERROR_EXTRA>} */
const MACHINE_ERROR_CODE_TO_EXTRA_KEY = {
  RELATIONSHIP_BLOCKED: 'relationship_blocked',
  NFC_ACTIVATION_PIN_INVALID: 'nfc_activation_pin_invalid',
};

/** Legado: claves usadas solo como fallback si no hay errorCode. */
const MESSAGES = {
  ...MACHINE_ERROR_EXTRA,
  auth_forbidden: MACHINE_ERROR_BLOCKS.A,
  security_link: MACHINE_ERROR_BLOCKS.C,
  moderation_blocked: MACHINE_ERROR_BLOCKS.C,
  tier_required: MACHINE_ERROR_BLOCKS.B,
  relationship_blocked: MACHINE_ERROR_EXTRA.relationship_blocked,
  call_muted: MACHINE_ERROR_BLOCKS.D,
  nickname_change_cooldown: MACHINE_ERROR_BLOCKS.E,
  nfc_activation_pin_invalid: MACHINE_ERROR_EXTRA.nfc_activation_pin_invalid,
  voip_minutes_exhausted: MACHINE_ERROR_BLOCKS.D,
  business_card_required: MACHINE_ERROR_BLOCKS.B,
  admin_restricted: MACHINE_ERROR_EXTRA.admin_restricted,
};

/**
 * @param {import('express').Request | { headers?: Record<string, string | string[] | undefined> }} req
 * @returns {'es'|'en'|'it'|'fr'|'de'|'pt'}
 */
function pickLocale(req) {
  const raw = req?.headers
    ? String(req.headers['accept-language'] ?? req.headers['Accept-Language'] ?? 'en')
    : 'en';
  const first = raw.split(',')[0].trim().split(';')[0].trim().toLowerCase();
  if (first.startsWith('es')) return 'es';
  if (first.startsWith('it')) return 'it';
  if (first.startsWith('fr')) return 'fr';
  if (first.startsWith('de')) return 'de';
  if (first.startsWith('pt')) return 'pt';
  return 'en';
}

/** @param {string | undefined | null} raw */
function normalizeMachineCode(raw) {
  return String(raw ?? '').trim();
}

/** @param {string} code */
function blockForDynamicCode(code) {
  const lower = code.toLowerCase();
  if (lower.startsWith('http_')) return 'F';
  if (lower.startsWith('revenuecat_http_')) return 'F';
  if (lower.startsWith('stripe_http_')) return 'F';
  if (lower.startsWith('firebase_')) return 'F';
  return null;
}

/**
 * @param {import('express').Request | { headers?: Record<string, string | string[] | undefined> }} req
 * @param {string | undefined | null} errorCode
 * @param {string} [messageKeyFallback] — clave legada en MESSAGES
 */
function messageForMachineOrLegacy(req, errorCode, messageKeyFallback) {
  const locale = pickLocale(req);
  const c0 = normalizeMachineCode(errorCode);

  if (!c0 && messageKeyFallback && MESSAGES[messageKeyFallback]) {
    const row = MESSAGES[messageKeyFallback];
    return row[locale] || row.en;
  }
  if (!c0) {
    return MACHINE_ERROR_BLOCKS.F[locale] || MACHINE_ERROR_BLOCKS.F.en;
  }

  const extraByCode = MACHINE_ERROR_CODE_TO_EXTRA_KEY[c0] || MACHINE_ERROR_CODE_TO_EXTRA_KEY[c0.toUpperCase()];
  if (extraByCode && MACHINE_ERROR_EXTRA[extraByCode]) {
    const row = MACHINE_ERROR_EXTRA[extraByCode];
    return row[locale] || row.en;
  }

  const block =
    MACHINE_ERROR_CODE_TO_BLOCK[c0] ||
    MACHINE_ERROR_CODE_TO_BLOCK[c0.toUpperCase()] ||
    blockForDynamicCode(c0);
  if (block) {
    const row = MACHINE_ERROR_BLOCKS[block];
    return row[locale] || row.en;
  }

  if (MACHINE_ERROR_EXTRA[c0]) {
    const row = MACHINE_ERROR_EXTRA[c0];
    return row[locale] || row.en;
  }

  if (messageKeyFallback && MESSAGES[messageKeyFallback]) {
    const row = MESSAGES[messageKeyFallback];
    return row[locale] || row.en;
  }

  return MACHINE_ERROR_BLOCKS.F[locale] || MACHINE_ERROR_BLOCKS.F.en;
}

/**
 * @param {keyof typeof MESSAGES} messageKey
 * @param {'es'|'en'|'it'|'fr'|'de'|'pt'} locale
 */
function messageText(messageKey, locale) {
  const row = MESSAGES[messageKey];
  if (!row) return MACHINE_ERROR_BLOCKS.A[locale] || MACHINE_ERROR_BLOCKS.A.en;
  return row[locale] || row.en;
}

/**
 * @param {import('express').Request} req
 * @param {keyof typeof MESSAGES} messageKey
 * @param {string} [errorCode]
 * @param {Record<string, unknown>} [extraFields]
 */
function buildUserFacingJson(req, messageKey, errorCode, extraFields) {
  const codeRaw = normalizeMachineCode(errorCode);
  const human = messageForMachineOrLegacy(req, codeRaw || null, messageKey);

  /** @type {Record<string, unknown>} */
  const out = {
    ok: false,
    error: human,
    errorCode: String(codeRaw || messageKey),
  };
  if (extraFields && typeof extraFields === 'object') {
    for (const [k, v] of Object.entries(extraFields)) {
      if (v !== undefined) out[k] = v;
    }
  }
  return out;
}

/**
 * @param {import('express').Request | { headers?: Record<string, string | string[] | undefined> }} req
 * @param {string} successCode
 * @param {Record<string, unknown>} [extraFields]
 */
function buildUserFacingSuccessJson(req, successCode, extraFields) {
  const locale = pickLocale(req);
  const codeRaw = normalizeMachineCode(successCode);
  const row = SUCCESS_QR_NFC_LOCALIZED[codeRaw];
  const human = row ? (row[locale] || row.en) : codeRaw;

  /** @type {Record<string, unknown>} */
  const out = {
    ok: true,
    message: human,
    successCode: codeRaw,
  };
  if (extraFields && typeof extraFields === 'object') {
    for (const [k, v] of Object.entries(extraFields)) {
      if (v !== undefined) out[k] = v;
    }
  }
  return out;
}

/**
 * @param {import('express').Response} res
 * @param {import('express').Request} req
 * @param {number} status
 * @param {keyof typeof MESSAGES} messageKey
 * @param {string} [errorCode]
 * @param {Record<string, unknown>} [extraFields]
 */
function sendUserFacingError(res, req, status, messageKey, errorCode, extraFields) {
  return res.status(status).json(buildUserFacingJson(req, messageKey, errorCode, extraFields));
}

module.exports = {
  MACHINE_ERROR_BLOCKS,
  MACHINE_ERROR_CODE_TO_BLOCK,
  MESSAGES,
  pickLocale,
  messageText,
  messageForMachineOrLegacy,
  buildUserFacingJson,
  buildUserFacingSuccessJson,
  sendUserFacingError,
};
