const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MB = 1024 * 1024;

/** Host Spaces sin esquema (ej. `sfo3.digitaloceanspaces.com`) para S3 y URLs públicas. */
function normalizeSpacesEndpointHost(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  return s.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

const env = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGO_URI || "",
  mongoDbName: process.env.MONGO_DB_NAME || "cardsocial",
  azureEndpoint: (process.env.AZURE_CONTENT_SAFETY_ENDPOINT || "").replace(/\/+$/, ""),
  azureApiKey: process.env.AZURE_CONTENT_SAFETY_KEY || "",
  azureApiVersion: process.env.AZURE_CONTENT_SAFETY_API_VERSION || "2024-09-01",
  apiGatewayKey: process.env.API_GATEWAY_KEY || "",
  jwtSecret: process.env.MODERATION_JWT_SECRET || "",
  jwtIssuer: process.env.MODERATION_JWT_ISSUER || "cardsocial-gateway",
  jwtAudience: process.env.MODERATION_JWT_AUDIENCE || "cardsocial-moderation",
  githubClientId: process.env.GITHUB_OAUTH_CLIENT_ID || "",
  githubClientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET || "",
  emailOtpSecret: process.env.EMAIL_OTP_SECRET || "",
  emailFrom: process.env.EMAIL_FROM || "",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  revenueCatApiKey: process.env.REVENUECAT_API_KEY || "",
  imageMaxBytes: 5 * MB,
  docMaxBytes: 20 * MB,
  /** Base URL del sitio (Expo Web) para enlaces QR universales TTL; ej. https://cardsocial.me */
  publicUniversalCardBaseUrl: (process.env.PUBLIC_UNIVERSAL_CARD_BASE_URL || "https://cardsocial.me").replace(/\/+$/, ""),
  /**
   * Base URL del host donde Express sirve el proxy de vault (GET …/api/qr/vault-proxy/file/:id).
   * Si WAF no reenvía /api/vault/* al Node, usar el host del API (p. ej. https://api.cardsocial.me).
   */
  publicVaultFileBaseUrl: String(
    process.env.PUBLIC_VAULT_FILE_BASE_URL || process.env.PUBLIC_UNIVERSAL_CARD_BASE_URL || "https://cardsocial.me"
  ).replace(/\/+$/, ""),
  /**
   * Si es true, tras validar GET /u/:token se redirige a `/?universalToken=...` en lugar de `/u/...`.
   * Útil cuando el proxy envía todo `/u/*` al API y un 302 a `/u/` volvería al backend (bucle).
   */
  universalValidRedirectUseRoot: String(process.env.UNIVERSAL_VALID_REDIRECT_USE_ROOT || "").trim() === "1",

  /**
   * DigitalOcean Spaces — lee `DO_SPACES_*` del `.env` / Azure (mismo prefijo en App Settings).
   * Propiedades internas `spaces*` las consume `mongoStorage` y el S3Client.
   */
  spacesKey: String(process.env.DO_SPACES_KEY || "").trim(),
  spacesSecret: String(process.env.DO_SPACES_SECRET || "").trim(),
  spacesEndpoint: normalizeSpacesEndpointHost(process.env.DO_SPACES_ENDPOINT),
  spacesRegion: String(process.env.DO_SPACES_REGION || "").trim(),
  spacesBucket: String(process.env.DO_SPACES_BUCKET || "").trim(),
};

/** Lista nombres `DO_SPACES_*` ausentes o vacíos (todas obligatorias para inicializar S3). */
function getSpacesMissingEnvVars() {
  const missing = [];
  if (!env.spacesKey) missing.push("DO_SPACES_KEY");
  if (!env.spacesSecret) missing.push("DO_SPACES_SECRET");
  if (!env.spacesEndpoint) missing.push("DO_SPACES_ENDPOINT");
  if (!env.spacesRegion) missing.push("DO_SPACES_REGION");
  if (!env.spacesBucket) missing.push("DO_SPACES_BUCKET");
  return missing;
}

let spacesEnvLogged = false;

/** Una vez por proceso: Log Stream en Azure (KEY sí/no, valor de ENDPOINT, etc.). */
function logSpacesVariablesLoaded() {
  if (spacesEnvLogged) return;
  spacesEnvLogged = true;
  const keySi = env.spacesKey ? "SI" : "NO";
  const endpointVal = env.spacesEndpoint || "(vacío)";
  console.log(`Variables cargadas: KEY=[${keySi}], ENDPOINT=[${endpointVal}]`);
}

/** Mensaje para logs/respuestas cuando falta alguna variable `DO_SPACES_*`. */
function formatSpacesEnvMissingError() {
  const m = getSpacesMissingEnvVars();
  return `Spaces S3Client no inicializado. Variables ausentes o vacías: ${m.join(", ")}`;
}

function assertRequiredConfig() {
  const missing = [];
  if (!env.mongoUri) missing.push("MONGO_URI");
  if (!env.azureEndpoint) missing.push("AZURE_CONTENT_SAFETY_ENDPOINT");
  if (!env.azureApiKey) missing.push("AZURE_CONTENT_SAFETY_KEY");
  if (!env.apiGatewayKey) missing.push("API_GATEWAY_KEY");
  if (!env.jwtSecret) missing.push("MODERATION_JWT_SECRET");
  if (!env.emailOtpSecret) missing.push("EMAIL_OTP_SECRET");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

module.exports = {
  env,
  assertRequiredConfig,
  getSpacesMissingEnvVars,
  logSpacesVariablesLoaded,
  formatSpacesEnvMissingError,
};
