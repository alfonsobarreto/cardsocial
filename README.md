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
| PUT | `/cards/:cardRef`, `/users/:uid/nickname`, `/stories/ads/house` |
| DELETE | `/cards/:cardRef`, `/cards/:cardRef/subscribers/:targetUid`, `/relationships/blocked/:targetUid` |
| POST | `/stories/state`, `/relationships/block`, `/relationships/remove`, `/calls/logs`, `/voip/ghost-link/start`, `/voip/ghost-link/respond`, `/cards/:cardRef/subscribers/:targetUid/mute`, … |
| PATCH | `/calls/logs/:callId` |
| GET | `/cards/:cardRef/subscribers` |

**Autenticación:** cabecera `x-api-gateway-key` y JWT con scope `qr.access` (vía `POST /api/auth/token` con `{ "uid": "…", "scope": "qr.access" }`), salvo que el middleware aplique otra regla a rutas concretas.

**Cliente Expo (`services/qrApi.ts`):** suele llamar rutas bajo `/api/cards/...` y `/api/stories/...` en la URL pública; en despliegues con **solo** este servidor, el prefijo real es **`/api/qr/...`** (p. ej. `/api/qr/cards`). Si la app no conecta en local, revisa gateway, proxy o variable `EXPO_PUBLIC_MODERATION_API_URL`.

## QR dinámico universal (24h) — `https://cardsocial.me/u/…`

- **Emisión (autenticado):** `POST /api/qr/temporary-access/issue` → devuelve `universalUrl` con base **`PUBLIC_UNIVERSAL_CARD_BASE_URL`** (por defecto `https://cardsocial.me`) y ruta **`/u/{token}?source=qr_scan`**.
- **Datos públicos (sin JWT):** `GET /api/public/universal-card?token=…&source=qr_scan` — payload filtrado; slots desde `publicCardSlots` en `smart_cards` (sin vault completo).
- **Entrada HTTP con validación en servidor:** En producción Azure, **`/u/*`** lo sirve **Next.js** empaquetado en `backend/frontend-web/` (`output: 'standalone'`). El proceso principal sigue siendo Express (`node src/server.js`): arranca un hijo `node server.js` con `cwd` en esa carpeta (puerto interno típico **3001**). Las rutas Express legacy `GET /u/:token` pueden coexistir o delegarse según el despliegue.
- **SSR / fetch interno:** Next usa **`INTERNAL_API_URL`** (p. ej. `http://127.0.0.1:<PORT_API>`) para llamar a `GET /api/public/universal-card` sin pasar por el dominio público (evita bucles de proxy).

### Azure (API en `api.cardsocial.me`, web en `cardsocial.me`)

1. Las peticiones **`https://cardsocial.me/u/*`** deben llegar al **mismo App Service** que ejecuta Express, de modo que Next responda **`/u/[token]`** con la build en `frontend-web/.next`.
2. **CI (GitHub Actions):** en `.github/workflows/main_card-social-api.yml` se ejecuta `npm ci` + **`npm run build`** en `frontend-web/`, se copia el **standalone** de Next a `backend/frontend-web/` junto con **`.next/static`** y `public`. El artefacto que sube el job de deploy debe incluir carpetas ocultas: **`actions/upload-artifact@v4` con `include-hidden-files: true`**; si no, Azure recibe el backend **sin** `.next` y Next falla con *Could not find a production build in the '.next' directory*.
3. **Arranque en Azure:** comando de inicio **`node src/server.js`** desde la raíz del paquete desplegado (carpeta `backend` del repo). No hace falta cambiar el startup solo por Next; el backend localiza `frontend-web` y arranca el hijo.
4. Variables en **`backend/.env`:** `PUBLIC_UNIVERSAL_CARD_BASE_URL`, `INTERNAL_API_URL`, `UNIVERSAL_VALID_REDIRECT_USE_ROOT` si aplica (ver `backend/.env.example`).

### Deep linking — `https://cardsocial.me/.well-known/`

En **producción (Azure)** el backend sirve AASA y assetlinks directamente (`backend/src/server.js`). También puedes publicar copias estáticas en `public/.well-known/` si hace falta.

- `apple-app-site-association` — sustituye **`APPLE_TEAM_ID`** por tu Team ID de Apple Developer.
- `assetlinks.json` — sustituye el **SHA-256** del certificado de firma de release (Play Console o `keytool`).

**App nativa (opcional):** `app.json` conserva `associatedDomains` / `intentFilters` para builds móviles legacy.

## Producción local (Azure stack)

```bash
npm install
cd frontend-web && npm ci && npm run build && cd ..
node scripts/bundle-frontend-web-into-backend.mjs
npm run backend:start
```

El sitio público (`cardsocial.me`) es **Next.js empaquetado en el backend** — ver CI en `.github/workflows/main_card-social-api.yml`.

## App móvil (opcional / legacy Expo)

Variables: **`.env.example`** en la raíz (`EXPO_PUBLIC_*`). No es el canal de build principal.

```bash
npm run start:mobile
```

**Contexto fresco para la app (lista Mis Tarjetas, scroll, reorden, preview, wireframe):** `funcionalidades.md` (sección *Mis Tarjetas* bajo Tarjetas inteligentes).

## Documentación adicional

- `backend/README.md` — moderación, uploads, variables de entorno del backend.
- `backend/DEPLOY_DETERMINISTIC_AZURE.md` — despliegue Azure del API.
- `funcionalidades.md` — MVP + tab Mis Tarjetas (historial abril 2026).
- `admin.md` — panel Promociones QR (`super_admin`, módulos, Firestore).
- `businesscard.md` — contrato Business Card (v1 freeze).
- `ICON_STORE_SETUP.md`, `ICON_LIBRARY_SETUP.md` — tienda / librería de iconos.
- `ONE_PAGER_CARD_SOCIAL_MUNDO.md`, `PATENTE_MARCA_CARD_SOCIAL_BRIEF.md` — comercial / legal (no son spec de código).

## Seguridad

- Conserva copias de secretos **fuera** del repo (gestor de contraseñas, vault).
- `.gitignore` ignora `.env` y similares; **no borra** tus archivos locales, solo evita que Git los trackee.
