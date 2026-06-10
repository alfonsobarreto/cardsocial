const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

/** Raíz del monorepo donde Expo suele tener `.env` con `EXPO_PUBLIC_*`. El backend sólo cargaba `backend/.env`. */
const repoRootEnvPath = path.resolve(__dirname, '../../.env');
const backendEnvPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(repoRootEnvPath)) {
  dotenv.config({ path: repoRootEnvPath });
}
dotenv.config({ path: backendEnvPath, override: true });

const { bootstrapMongoDns } = require('./lib/mongoDnsBootstrap');
bootstrapMongoDns();

const MB = 1024 * 1024;

/** `localhost`/loopback no sirven para QRs escaneados desde el móvil (no es la máquina del dev). */
function isLoopbackOriginUrl(candidate) {
  try {
    const u = new URL(String(candidate || '').trim());
    if (!/^https?:$/i.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch {
    return true;
  }
}

/**
 * Base `/u/{token}` devuelta por POST `/api/qr/temporary-access/issue`.
 * Respeta PUBLIC_UNIVERSAL_CARD_BASE_URL; si es localhost, usa EXPO_PUBLIC_BUSINESS_WEB_BASE (LAN) desde la `.env` raíz.
 */
function resolveUniversalQrPublicBaseUrl() {
  const DEFAULT = 'https://cardsocial.me';
  const candidates = [
    process.env.PUBLIC_UNIVERSAL_CARD_BASE_URL,
    process.env.EXPO_PUBLIC_BUSINESS_WEB_BASE,
    DEFAULT,
  ];

  for (const raw of candidates) {
    const s = String(raw ?? '')
      .trim()
      .replace(/\/+$/, '');
    if (!s) continue;
    if (isLoopbackOriginUrl(s)) continue;
    return s;
  }

  return DEFAULT;
}

const universalQrPublicBaseUrl = resolveUniversalQrPublicBaseUrl();

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
  /**
   * Azure AI Content Safety (REST). Canónicos: AZURE_CONTENT_SAFETY_ENDPOINT / KEY.
   * Alias por si en App Settings usaron otros nombres: CONTENT_SAFETY_ENDPOINT / CONTENT_SAFETY_KEY.
   */
  azureEndpoint: (
    process.env.AZURE_CONTENT_SAFETY_ENDPOINT ||
    process.env.CONTENT_SAFETY_ENDPOINT ||
    ""
  ).replace(/\/+$/, ""),
  azureApiKey: String(
    process.env.AZURE_CONTENT_SAFETY_KEY || process.env.CONTENT_SAFETY_KEY || "",
  ).trim(),
  azureApiVersion: process.env.AZURE_CONTENT_SAFETY_API_VERSION || "2024-09-01",
  /**
   * Header `x-api-gateway-key` en rutas protegidas. Azure App Service / Container Apps:
   * definir **Application setting** `API_GATEWAY_KEY` (mismo nombre; sin prefijo VITE).
   * Se normaliza con trim por si el portal guarda espacios finales.
   */
  apiGatewayKey: String(process.env.API_GATEWAY_KEY ?? "").trim(),
  jwtSecret: process.env.MODERATION_JWT_SECRET || "",
  jwtIssuer: process.env.MODERATION_JWT_ISSUER || "cardsocial-gateway",
  jwtAudience: process.env.MODERATION_JWT_AUDIENCE || "cardsocial-moderation",
  githubClientId: process.env.GITHUB_OAUTH_CLIENT_ID || "",
  githubClientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET || "",
  emailOtpSecret: process.env.EMAIL_OTP_SECRET || "",
  /** Resend → API Keys. Debe coincidir con lo que usa `email.service.js`. */
  resendApiKey: String(process.env.RESEND_API_KEY ?? '').trim(),
  /** Remitente verificado en Resend (FROM). */
  emailFrom: process.env.EMAIL_FROM || "",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  revenueCatApiKey: process.env.REVENUECAT_API_KEY || "",
  /** Mercado Pago Checkout Pro (Perú / LATAM). Access token = credencial privada; public key = frontend Checkout Bricks. */
  mercadopagoAccessToken: String(process.env.MERCADOPAGO_ACCESS_TOKEN ?? '').trim(),
  mercadopagoPublicKey: String(process.env.MERCADOPAGO_PUBLIC_KEY ?? '').trim(),
  imageMaxBytes: 5 * MB,
  docMaxBytes: 20 * MB,
  /** Base URL del sitio (Next/Expo Web) para enlaces QR universales TTL; fuerza LAN si la explícita es loopback */
  publicUniversalCardBaseUrl: universalQrPublicBaseUrl,
  /**
   * Base URL del host donde Express sirve el proxy de vault (GET …/api/qr/vault-proxy/file/:id).
   * Si WAF no reenvía /api/vault/* al Node, usar el host del API (p. ej. https://api.cardsocial.me).
   */
  publicVaultFileBaseUrl: String(
    process.env.PUBLIC_VAULT_FILE_BASE_URL || universalQrPublicBaseUrl || "https://cardsocial.me",
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

  /** OpenAI / Gemini — embeddings para Atlas Vector Search (opcionales hasta que actives el mercado semántico). */
  embeddingProvider: String(process.env.EMBEDDING_PROVIDER || "openai").toLowerCase(),
  openAiApiKey: String(process.env.OPENAI_API_KEY || "").trim(),
  openAiEmbeddingModel: String(process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small").trim(),
  geminiApiKey: String(process.env.GEMINI_API_KEY || "").trim(),
  geminiEmbeddingModel: String(process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004").trim(),
  /** Forzar dimensión del vector (p. ej. 768 con Gemini); si vacío, la infiere el proveedor. */
  embeddingDimensions: (() => {
    const n = Number(process.env.EMBEDDING_DIMENSIONS);
    return Number.isFinite(n) && n > 0 ? n : null;
  })(),
  atlasVectorIndexBusinessCards: String(
    process.env.ATLAS_VECTOR_INDEX_BUSINESS_CARDS || "business_cards_vector",
  ).trim(),
  atlasVectorIndexSmartCards: String(process.env.ATLAS_VECTOR_INDEX_SMART_CARDS || "smart_cards_vector").trim(),
  marketEmbeddingField: String(process.env.MARKET_EMBEDDING_FIELD || "marketEmbedding").trim(),
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
  if (!env.azureEndpoint) {
    missing.push("AZURE_CONTENT_SAFETY_ENDPOINT or CONTENT_SAFETY_ENDPOINT");
  }
  if (!env.azureApiKey) {
    missing.push("AZURE_CONTENT_SAFETY_KEY or CONTENT_SAFETY_KEY");
  }
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
