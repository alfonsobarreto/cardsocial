# Firma HTML de correo para Business Cards

Guía de producto y notas técnicas para la función **«Copiar firma HTML (correo)»** / **«Copy HTML email signature»**.

---

## Resumen

Los dueños de **tarjetas de negocio** pueden generar una **firma de correo en HTML** que reproduce el diseño de la fila en la lista (logo, nombre, subtítulo, QR con el mismo enlace público web y logo centrado). El HTML se copia al **portapapeles** desde el **Dashboard** de la app móvil.

No se crea una tarjeta nueva ni un segundo enlace: el QR y el enlace apuntan a la **misma URL pública** que ya usa la tarjeta (`generatePublicBusinessWebUrl` → ruta web `/b/{bId}?uid=…`).

---

## Cómo lo usa el usuario (app móvil)

### Dónde está

1. Abre la app **Card-Social**.
2. Ve a la pestaña **Dashboard** (panel de analítica de negocio / tarjetas de negocio).
3. Asegúrate de tener al menos **una tarjeta de negocio** creada.
4. En la parte superior verás un **carrusel horizontal** con tus tarjetas. **Desliza** hasta la tarjeta cuya firma quieras copiar (esa es la «tarjeta activa»).
5. Justo **debajo de los puntos** del carrusel (paginación) aparece el botón:
   - **«Copiar firma HTML (correo)»** (español)
   - **«Copy HTML email signature»** (inglés)
6. Toca el botón. Debería mostrarse un mensaje de confirmación y el **HTML queda copiado** al portapapeles del dispositivo.

Requisitos: sesión iniciada y permisos de portapapeles habituales del sistema.

### Cómo pegarlo en el correo

Los clientes de correo suelen tener un editor de **firma** que acepta HTML enriquecido.

**Gmail (web)**

1. En el engranaje → **Ver todos los ajustes** → pestaña **General**.
2. Baja hasta **Firma** y crea o edita una firma.
3. Algunas versiones permiten pegar HTML directamente; si el editor solo muestra texto plano, prueba **pegar** después de activar el formato enriquecido o usa el truco de pegar en un borrador, seleccionar y copiar de nuevo según la interfaz actual de Gmail.
4. Guarda los cambios.

**Outlook (web / Microsoft 365)**

1. **Ajustes** → **Correo** → **Redactar y responder** → **Firma de correo electrónico**.
2. Pega el contenido; si el editor interpreta HTML, verás logo, textos y QR.
3. Guarda.

**Apple Mail (Mac)**

1. **Mail** → **Ajustes** → **Firmas**.
2. Crea o edita una firma; en muchos casos puedes pegar desde el portapapeles y conservar imágenes si el origen es HTML.

**Notas importantes**

- La firma incluye **imágenes remotas** (logo de la marca, si existe, y el QR servido desde tu sitio web). El correo debe poder **cargar URLs HTTPS** desde el dominio configurado en `EXPO_PUBLIC_BUSINESS_WEB_BASE` (o el dominio de producción equivalente).
- Si las imágenes no cargan, revisa que el sitio Next.js con la ruta `/api/qr/generate` esté publicado y accesible públicamente.
- Prueba siempre enviando un correo de prueba a ti mismo.

---

## Cómo funciona técnicamente

### Flujo en la app (Expo)

1. **Entrada:** tarjeta activa en el Dashboard (`activeCard`) y `sessionUid`.
2. Se calcula la **URL pública** con `generatePublicBusinessWebUrl(bId, sessionUid)` (misma que el QR de **Mis tarjetas**).
3. **Subtítulo** de la firma: igual criterio que la lista / Dashboard (`bcContactName` o nombre del tema o «Tarjeta de negocio»).
4. **Logo:** `toRenderableImageUri(bcLogoUrl)` para cabecera de firma y para el centro del QR en el servidor.
5. Se llama a `buildBusinessCardEmailSignatureHtml` (`services/businessCardEmailSignatureHtml.ts`), que:
   - Aplica colores y bordes con **`getCardRowTheme(themeId)`** (paridad con la lista).
   - Monta una tabla HTML accesible para clientes de correo (`role="presentation"`, estilos **inline**).
   - Inserta un `<img>` del QR cuyo `src` apunta al **frontend Next.js**.

6. **Portapapeles:** `expo-clipboard` → `Clipboard.setStringAsync(html)`.

### Generación del PNG del QR (Next.js)

- Ruta: **`GET /api/qr/generate`** en `frontend-web`.
- Parámetros principales:
  - **`url`** (obligatorio, URL-encoded): cadena codificada en el QR (**la misma URL web de la tarjeta**).
  - **`logoUrl`** (opcional): URL HTTPS del logo; el servidor reproduce el centrado proporcional al **`QRCode` de la lista** (referencia 64 px, logo 16 px, margen 2, colores `#0A2540` / blanco, `ecl='H'`).
  - **`width`**, **`format`** (`png` | `svg`; con logo solo `png`).
- Librerías: **`qrcode`** (+ **`sharp`** para componer el logo sobre el PNG).
- No se sube el QR a almacenamiento: se genera **bajo demanda** en cada petición GET (con cabeceras de caché razonables).

### Archivos relevantes

| Pieza | Ubicación |
|--------|-----------|
| Botón Dashboard y copiar | `app/(tabs)/dashboard.tsx` |
| Plantilla HTML | `services/businessCardEmailSignatureHtml.ts` |
| URL web + enlaces | `services/brandedQrService.ts` (`generatePublicBusinessWebUrl`, `getSignatureQrImageBaseUrl`) |
| API QR (canónica prod) | **`backend/src/routes/publicEmailSignatureQrRoutes.js`** → `GET /api/qr/generate` en Express |
| API QR (opcional / dev Next solo) | `frontend-web/app/api/qr/generate/route.ts` |

### Despliegue

Para que las imágenes del QR en la firma funcionen en clientes de correo, el `src` del `<img>` debe apuntar al **mismo host donde Card-Social expone públicamente** `GET /api/qr/generate`:

- En muchos despliegues el enlace de la tarjeta es `https://cardsocial.me/b/...` pero el **PNG del QR** se sirve desde **`https://api.cardsocial.me/api/qr/generate`** (Express), porque el subdominio API es el que recibe el backend.
- La app usa por defecto **`getSignatureQrImageBaseUrl()`** (`EXPO_PUBLIC_BACKEND_BASE_URL` / `EXPO_PUBLIC_MODERATION_API_URL`, o `EXPO_PUBLIC_SIGNATURE_QR_IMAGE_BASE_URL` para forzar). Solo si no hay API configurada cae a `getPublicBusinessWebBaseUrl()`.

El enlace clicable de la firma sigue siendo la **URL pública de la tarjeta** (`generatePublicBusinessWebUrl` → `cardsocial.me`).