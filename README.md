# Card-Social

Monorepo: app móvil (Expo), backend Node (Express + Mongo) y utilidades.

## Encender el backend

El servidor lee **`backend/.env`** (ruta fija en `backend/src/config.js`). No sustituye por el `.env` de la raíz del monorepo.

### Opción A — desde la raíz del repo (`card-social/`)

```bash
npm run backend:start
```

Equivale a ejecutar `node backend/src/server.js` (puerto por defecto **4000**, ver `PORT` en `backend/.env`).

### Opción B — desde la carpeta `backend/`

```bash
cd backend
npm install
npm run dev
```

`dev` usa nodemon y reinicia al cambiar archivos en `src/`. `npm start` arranca sin nodemon.

**Nota:** En la carpeta `backend` **no** existe el script `backend:start` ni `npm run backend`; esos nombres aplican al `package.json` de la **raíz**.

### Comprobar que responde

- Salud: `GET http://localhost:4000/api/health` (ajusta host/puerto si usas otro `PORT`).
- Requiere variables obligatorias en `backend/.env`: ver `backend/.env.example` y `backend/README.md`.

## API `/api/qr` (QR, tarjetas, relaciones, historias, llamadas)

En `server.js` las rutas QR se montan así:

```text
app.use("/api/qr", …middleware…, createQrRoutes({ storage }));
```

Todas las rutas definidas en `backend/src/routes/qrRoutes.js` llevan prefijo **`/api/qr`**. Ejemplos (método + sufijo):

| Método | Ruta (después de `/api/qr`) |
|--------|-----------------------------|
| POST | `/issue`, `/consume` |
| GET | `/cards`, `/contacts/received`, `/stories/state`, `/stories/ads/house`, `/calls/history`, … |
| PUT | `/cards/:cardId`, `/users/:uid/nickname`, `/stories/ads/house` |
| DELETE | `/cards/:cardId`, `/cards/:cardId/subscribers/:targetUid`, `/relationships/blocked/:targetUid` |
| POST | `/stories/state`, `/relationships/block`, `/relationships/remove`, `/calls/logs`, `/voip/ghost-link/start`, `/voip/ghost-link/respond`, `/cards/:cardId/subscribers/:targetUid/mute`, … |
| PATCH | `/calls/logs/:callId` |
| GET | `/cards/:cardId/subscribers` |

**Autenticación:** cabecera `x-api-gateway-key` y JWT con scope `qr.access` (vía `POST /api/auth/token` con `{ "ownerUid": "…", "scope": "qr.access" }`), salvo que el middleware aplique otra regla a rutas concretas.

**Cliente Expo (`services/qrApi.ts`):** suele llamar rutas bajo `/api/cards/...` y `/api/stories/...` en la URL pública; en despliegues con **solo** este servidor, el prefijo real es **`/api/qr/...`** (p. ej. `/api/qr/cards`). Si la app no conecta en local, revisa gateway, proxy o variable `EXPO_PUBLIC_MODERATION_API_URL`.

## QR dinámico universal (24h) — `https://cardsocial.me/u/…`

- **Emisión (autenticado):** `POST /api/qr/temporary-access/issue` → devuelve `universalUrl` con base **`PUBLIC_UNIVERSAL_CARD_BASE_URL`** (por defecto `https://cardsocial.me`) y ruta **`/u/{token}?source=qr_scan`**.
- **Datos públicos (sin JWT):** `GET /api/public/universal-card?token=…&source=qr_scan` — payload filtrado; slots desde `publicCardSlots` en `smart_cards` (sin vault completo).
- **Entrada HTTP con validación en servidor:** `GET /u/:token` en el mismo proceso Express (`universalEntryHttpRoutes.js`). Comprueba `temporary_access` en Mongo (TTL 24h). Si el token no es válido o expiró → **HTML** fondo negro + mensaje de expiración; si es válido → **302** a `https://cardsocial.me/u/{token}?source=qr_scan` (o a `/?universalToken=…` si `UNIVERSAL_VALID_REDIRECT_USE_ROOT=1` en `backend/.env` para evitar bucles de proxy).

### Azure (API en `api.cardsocial.me`, web en `cardsocial.me`)

1. Configura una regla de **enrutamiento** (Front Door, Application Gateway, nginx, etc.) para que las peticiones **`https://cardsocial.me/u/*`** lleguen al **mismo backend Node** que sirve `/api/*`, de modo que se ejecute `GET /u/:token`.
2. Tras un token válido el navegador recibe el **302** hacia la SPA en `cardsocial.me` (estática Expo Web). Asegúrate de que esa segunda petición **no** se reenvíe otra vez solo al API sin archivos estáticos, o activa **`UNIVERSAL_VALID_REDIRECT_USE_ROOT=1`** y implementa en Expo Web la lectura de `universalToken` en la raíz.
3. Variables en **`backend/.env`:** `PUBLIC_UNIVERSAL_CARD_BASE_URL`, `UNIVERSAL_VALID_REDIRECT_USE_ROOT` (ver `backend/.env.example`).

### Deep linking — archivos en `https://cardsocial.me/.well-known/`

En el monorepo, al hacer **Expo Web** (`npx expo export --platform web` o flujo EAS), la carpeta **`public/.well-known/`** se copia al sitio:

- `apple-app-site-association` — sustituye **`APPLE_TEAM_ID`** por tu Team ID de Apple Developer.
- `assetlinks.json` — sustituye el **SHA-256** del certificado de firma de release (Play Console o `keytool`).

**Cabeceras:** donde sea posible, sirve `apple-app-site-association` con `Content-Type: application/json` (algunos hosts lo exigen para Universal Links).

**App nativa:** `app.json` incluye `ios.associatedDomains` (`applinks:cardsocial.me`) e `android.intentFilters` para `https://cardsocial.me/u`.

## App móvil (Expo)

Variables: copia **`.env.example`** en la raíz a **`.env`** y rellena `EXPO_PUBLIC_*` (ver comentarios en el ejemplo). Nunca subas `.env` con secretos al repositorio.

```bash
npm install
npx expo start
```

**Contexto fresco para la app (lista Mis Tarjetas, scroll, reorden, preview, wireframe):** `funcionalidades.md` (sección *Mis Tarjetas* bajo Tarjetas inteligentes).

## Documentación adicional

- `backend/README.md` — moderación, uploads, variables de entorno del backend.
- `backend/DEPLOY_DETERMINISTIC_AZURE.md` — despliegue Azure del API.
- `funcionalidades.md` — MVP + **tab Mis Tarjetas** y resumen Stories (actualizado abril 2026).
- `docs/INFRA_ESTADO_STORIES_VOIP.md` — Stories (metadatos vs media), Spaces/GridFS, Firebase en app, Agora Ghost-Link y activación.
- `admin.md` — panel The Mint (`super_admin`, módulos, Firestore).
- `businesscard.md` — contrato Business Card (v1 freeze).
- `ICON_STORE_SETUP.md`, `ICON_LIBRARY_SETUP.md` — tienda / librería de iconos.
- `ONE_PAGER_CARD_SOCIAL_MUNDO.md`, `PATENTE_MARCA_CARD_SOCIAL_BRIEF.md` — comercial / legal (no son spec de código).

## Seguridad

- Conserva copias de secretos **fuera** del repo (gestor de contraseñas, vault).
- `.gitignore` ignora `.env` y similares; **no borra** tus archivos locales, solo evita que Git los trackee.
