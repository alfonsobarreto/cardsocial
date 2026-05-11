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
- `GET /u/:token` — QR universal (legacy Express): valida `temporary_access` (24h); expirado → HTML; válido → redirect. En producción con **Next.js**, la ruta **`/u/[token]`** la sirve el hijo en `backend/frontend-web` (ver sección siguiente).
- `GET /api/public/universal-card` — JSON público de tarjeta por token (sin gateway JWT).
- Identidad en contactos: si Mongo `users`/`profiles` solo tiene el fallback `User {uid6}`, se usan `ownerDisplayName`, `ownerNickname`, `ownerPhotoUrl` y `ownerOccupation` de `smart_cards` (`src/lib/contactIdentityMerge.js`).
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
- `RESEND_API_KEY` — API key de [Resend](https://resend.com) (correo transaccional: OTP, borrado de cuenta, broadcast, recuperación de usuario).
- `EMAIL_FROM` — remitente verificado en Resend (debe coincidir con el dashboard).
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`

Use `backend/.env.example` as reference.

## Next.js embebido (`frontend-web`)

- El código fuente del sitio universal vive en **`frontend-web/`** en la raíz del monorepo. En **CI**, tras `npm run build` ahí, el workflow copia **`frontend-web/.next/standalone`** a **`backend/frontend-web/`** y añade **`backend/frontend-web/.next/static`** (y `public` si existe).
- **`actions/upload-artifact@v4`** omite por defecto archivos y carpetas cuyo nombre empieza por **`.`**. El artefacto de deploy debe usar **`include-hidden-files: true`**; de lo contrario **`.next`** no llega a Azure y Next arranca con error de “no production build”.
- En runtime, **`src/server.js`** arranca **`node server.js`** con `cwd` en `backend/frontend-web` y puerto interno (p. ej. 3001). Define **`INTERNAL_API_URL`** apuntando al propio Express (`http://127.0.0.1:<PORT>` del API) para que el servidor Next pida `GET /api/public/universal-card` sin circular por el dominio público.

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

Tambien puedes pasar uid por flag:

```bash
npm run backend:seed:house-ad -- --uid=user_123
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
  -F "uid=user_123" \
  -F "label=business-card" \
  -F "file=@./sample.jpg"
```
