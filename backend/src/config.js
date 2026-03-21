const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MB = 1024 * 1024;

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
  imageMaxBytes: 2 * MB,
  docMaxBytes: 20 * MB,
};

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
};
