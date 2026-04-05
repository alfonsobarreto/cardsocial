# Card-Social Moderation Backend

## // DOCUMENT CLEANUP (2026-03-21)
// STATUS: Active backend documentation.
// INACTIVE: No deprecated block marked in this pass.

This microservice validates user content with Azure Content Safety before persisting files in MongoDB (DigitalOcean).

## What it does

1. Receives text or file uploads from the app.
2. Runs moderation against Azure Content Safety.
3. Blocks content when severity is high.
4. Stores allowed files in MongoDB GridFS.
5. Stores moderation logs in `moderation_audit` collection.
6. Enforces MongoDB validators/indexes for Smart Cards infrastructure.
7. Protects endpoints using API Gateway key + short-lived JWT.

## Endpoints

- `GET /api/health`
- `GET /u/:token` — QR universal: valida `temporary_access` (24h); expirado → HTML; válido → redirect a SPA (`README` raíz del monorepo).
- `GET /api/public/universal-card` — JSON público de tarjeta por token (sin gateway JWT).
- `POST /api/auth/token`
- `POST /api/auth/github/exchange`
- `POST /api/auth/email-otp/send`
- `POST /api/auth/email-otp/verify`
- `POST /api/auth/email-otp/expire`
- `POST /api/moderate/text`
- `POST /api/upload` (multipart form-data, field name: `file`)

## Security Model

- `x-api-gateway-key` header is mandatory for protected endpoints.
- `POST /api/auth/token` issues a JWT valid for 5 minutes.
- JWT scope `moderation.upload` is required for upload/moderation routes.
- Health endpoint is public for uptime probes.

## Limits

- Images: 2MB max
- Other docs: 20MB max

## Environment Variables

Create a `.env`-style environment in your host with:

- `PORT`
- `MONGO_URI`
- `MONGO_DB_NAME`
- `AZURE_CONTENT_SAFETY_ENDPOINT`
- `AZURE_CONTENT_SAFETY_KEY`
- `AZURE_CONTENT_SAFETY_API_VERSION`
- `API_GATEWAY_KEY`
- `MODERATION_JWT_SECRET`
- `MODERATION_JWT_ISSUER`
- `MODERATION_JWT_AUDIENCE`
- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET`
- `EMAIL_OTP_SECRET`
- `EMAIL_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`

Use `backend/.env.example` as reference.

## Run

```bash
npm run backend:start
```

## House Ad Seed (Mi Sueno Mexicano)

Seed de 3 propiedades con rotacion diaria para el slot de anuncios en Stories.

```bash
HOUSE_AD_OWNER_UID=user_123 npm run backend:seed:house-ad
```

Forzar la siguiente propiedad (simular manana):

```bash
HOUSE_AD_OWNER_UID=user_123 npm run backend:seed:house-ad:tomorrow
```

Tambien puedes pasar ownerUid por flag:

```bash
npm run backend:seed:house-ad -- --ownerUid=user_123
```

## Request examples

### Moderate text

```bash
curl -X POST http://localhost:4000/api/moderate/text \
  -H "Content-Type: application/json" \
  -d '{"text":"hello world"}'
```

### Upload file

```bash
curl -X POST http://localhost:4000/api/upload \
  -F "ownerUid=user_123" \
  -F "label=business-card" \
  -F "file=@./sample.jpg"
```
