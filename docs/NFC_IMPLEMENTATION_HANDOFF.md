# Card-Social NFC — Handoff de Implementación y Operación

Este documento resume **qué se hizo**, **por qué se hizo así**, **cómo operarlo**, **cómo probarlo** y **qué debe saber el equipo en el futuro** sobre el módulo NFC Dynamic Switching de Card-Social.

Fecha base: 2026-04-26  
Contexto: implementación inicial del ecosistema NFC oficial de Card-Social, con foco en hardware premium **Black & Gold Metal**.

---

## 1. Intención del Producto

Card-Social no quiere vender tarjetas NFC tradicionales que quedan casadas a un solo perfil. La visión aprobada es convertir el hardware físico en un **contenedor dinámico de identidad**.

La tarjeta física mantiene siempre el mismo enlace:

`https://cardsocial.me/n/{nfcCardId}`

Lo que cambia es el destino en servidor.

Ejemplos:

- Hoy Alfonso monta su **Family Card**.
- Mañana monta su **Business Card**.
- La tarjeta física es la misma.
- El chip no se reescribe.
- El backend resuelve el destino actual.

Esta lógica permite vender hardware de lujo con valor real de software: presencia física + control dinámico.

---

## 2. Terminología Oficial

- **Vincular:** reclamar una tarjeta física oficial usando `nfcCardId` + `activationPin`.
- **Montar:** elegir qué identidad digital abre la tarjeta física.
- **Destino montado:** perfil actualmente activo en la tarjeta física.
- **Fallback:** destino de respaldo cuando el destino montado es temporal.
- **Modo Perdida:** estado seguro que muestra una página de recuperación sin exponer el perfil completo.
- **Tarjeta pre-provisionada:** tarjeta creada previamente por operación/fundador en MongoDB, con PIN y `isClaimed: false`.

---

## 3. Decisiones Clave

### 3.1 No usar dependencia nativa NFC en V1

No se instaló `react-native-nfc-manager`.

Motivo:

- Evitar impacto en build nativo/dev client.
- Mantener V1 simple.
- Permitir prueba real con QR o ingreso manual del ID.

En V1, **Vincular** se hace ingresando o escaneando:

- `nfcCardId`
- `activationPin`

### 3.2 NFC vive en el Menu Drawer, no en el Tab Bar

El Tab Bar principal ya tiene demasiadas secciones:

- Vault
- Cards
- Contacts
- Search
- Stories
- Calls

Por eso NFC vive como pantalla standalone accesible desde el drawer/menu.

### 3.3 Redirector público en Express, no Middleware

La ruta pública `/n/:nfcCardId` se implementó en Express.

Motivos:

- Necesita acceso a MongoDB.
- Necesita lógica condicional: activa, pausada, perdida, fallback, no reclamada.
- Necesita control fuerte de `Cache-Control`.
- No debe depender de Next Middleware.

### 3.4 Redirección temporal obligatoria

El redirector usa:

- `302` por default.
- `307` opcional si se pasa `?code=307`.

Nunca debe usar `301`.

Motivo:

`301` puede quedar cacheado por teléfonos/navegadores y rompería el cambio dinámico de identidad.

### 3.5 SmartCards temporales requieren fallback

Cuando se monta una SmartCard, el backend crea un acceso temporal de 24 h en `temporary_access`.

Como ese token expira, el usuario debe tener fallback. En la UI actual, al montar una SmartCard se exige una BusinessCard disponible como fallback.

Regla:

> Una tarjeta física nunca debe quedar muerta frente a alguien.

### 3.6 PIN de activación

Una tarjeta solo puede vincularse si:

- existe en `nfc_cards`,
- `isClaimed` es `false`,
- no tiene `ownerUid`,
- `activationPin` coincide.

Al vincular:

- se asigna `ownerUid`,
- `isClaimed` pasa a `true`,
- se guarda `activatedAt`,
- se elimina `activationPin`.

Esto evita que una tarjeta robada o fotografiada pueda ser reclamada por otra cuenta después del comprador legítimo.

---

## 4. Archivos Creados

### Frontend / App

#### `services/types/nfc.ts`

Contrato TypeScript del módulo NFC.

Incluye:

- `NfcCardDoc`
- `NfcCardStatus`
- `NfcMountedTarget`
- `NfcFallbackTarget`
- `NfcRecoveryContact`
- `NfcMountOption`
- inputs de vinculación, montaje y cambio de estado.

#### `services/nfcCardsRepo.ts`

Cliente REST de la app.

Responsabilidades:

- listar tarjetas NFC del usuario,
- listar destinos montables,
- vincular tarjeta con PIN,
- montar identidad,
- cambiar estado.

Usa:

- `getScopedJwtToken(uid, 'qr.access')`
- `x-api-gateway-key`
- `Authorization: Bearer ...`

#### `app/nfc.tsx`

Pantalla principal del módulo NFC.

Incluye:

- sección **Vincular nueva NFC**,
- modal de vínculo con `nfcCardId` y `activationPin`,
- lista real de tarjetas del usuario,
- estados visuales:
  - Activa
  - Pausada
  - Perdida
  - Bloqueada
  - Sin vincular
- botón **Montar**,
- modal de destinos montables,
- botón **Probar**,
- botón **Perdida / Activar**,
- botón **Pausar / Activar**.

#### `app/(tabs)/_layout.tsx`

Se agregó una entrada en el drawer/menu:

`NFC`

Navega a:

`/nfc`

No se tocó el Tab Bar.

#### `app/_layout.tsx`

Se registró la pantalla:

`<Stack.Screen name="nfc" options={{ headerShown: false }} />`

---

### Backend

#### `backend/src/lib/nfcCards.js`

Helpers puros del módulo NFC.

Incluye:

- normalización de `nfcCardId`,
- normalización de `activationPin`,
- serialización `toWireNfcCard`,
- construcción de destino BusinessCard,
- construcción de destino SmartCard temporal,
- creación de token en `temporary_access`,
- construcción de fallback,
- lógica `isExpired`,
- HTML minimal para páginas públicas,
- elección de redirect `302/307`.

#### `backend/src/routes/nfcRoutes.js`

Rutas autenticadas del módulo NFC.

Rutas implementadas:

- `GET /api/nfc/cards`
- `GET /api/nfc/mount-options`
- `POST /api/nfc/cards/link`
- `POST /api/nfc/cards/:nfcCardId/mount`
- `PATCH /api/nfc/cards/:nfcCardId/status`

Puntos importantes:

- `link` reclama una tarjeta pre-provisionada con PIN.
- `mount` valida propiedad y fallback.
- `status` permite `active`, `paused`, `lost`.
- `blocked` queda reservado para administración futura.

#### `backend/src/routes/nfcPublicRoutes.js`

Redirector público:

`GET /n/:nfcCardId`

Comportamiento:

- si no existe: página “tarjeta no vinculada”,
- si existe pero `isClaimed !== true`: página “tarjeta sin activar”,
- si `lost`: página de recuperación,
- si `paused`: página neutra,
- si `blocked`: perfil no disponible,
- si activa y destino válido: `302/307`,
- si activa y destino temporal expiró: redirige al fallback,
- si no hay destino: página “sin destino”.

Cabeceras:

- `Cache-Control: no-store, max-age=0`
- `Pragma: no-cache`
- `Expires: 0`

#### `backend/src/security/mongoHardening.js`

Se agregaron validadores e índices para:

- `nfc_cards`
- `nfc_card_events`

#### `backend/src/server.js`

Se montaron:

- `/n` con `createNfcPublicRoutes`
- `/api/nfc` con `gatewayKeyMiddleware`, `jwtAuthMiddleware`, `qrScopeMiddleware`, `createNfcRoutes`

#### `backend/scripts/generateNfcBatch.js`

Script de administración para generar lotes de tarjetas pre-provisionadas.

Uso:

```bash
node backend/scripts/generateNfcBatch.js 5
```

Desde `backend/`:

```bash
node scripts/generateNfcBatch.js 5
```

Genera:

- `nfcCardId` secuencial: `CS-METAL-001`, `CS-METAL-002`, etc.
- `activationPin` aleatorio de 6 caracteres.
- documentos en `nfc_cards`.
- CSV en `backend/nfc_batch_results.csv`.

---

## 5. Modelo de Datos

### Colección `nfc_cards`

Campos principales:

- `nfcCardId`
- `activationPin`
- `isClaimed`
- `activatedAt`
- `ownerUid`
- `label`
- `material`
- `status`
- `mountedTarget`
- `fallbackTarget`
- `recoveryContact`
- `lastMountedAt`
- `lastConfirmedAt`
- `lastResolvedAt`
- `createdAt`
- `updatedAt`
- `version`

### Pre-provisionada

Antes de vender/entregar:

```js
{
  nfcCardId: 'CS-METAL-001',
  activationPin: 'X7K9AB',
  isClaimed: false,
  activatedAt: null,
  ownerUid: null,
  label: 'Black & Gold Metal 001',
  material: 'metal',
  status: 'unclaimed',
  mountedTarget: null,
  fallbackTarget: null,
  recoveryContact: null,
  createdAt: Date,
  updatedAt: Date,
  version: 0
}
```

### Después de vincular

Después de que el usuario reclama:

```js
{
  nfcCardId: 'CS-METAL-001',
  isClaimed: true,
  activatedAt: Date,
  ownerUid: '<uid>',
  status: 'active',
  activationPin: undefined
}
```

El PIN queda invalidado.

---

## 6. Estados de Tarjeta

### `unclaimed`

Tarjeta pre-provisionada, todavía sin dueño.

### `active`

Tarjeta reclamada y lista para redirigir al destino montado.

### `paused`

Tarjeta desactivada temporalmente. No muestra identidad pública.

### `lost`

Modo recuperación. Muestra canal elegido por el usuario, sin exponer el perfil completo.

### `blocked`

Reservado para bloqueo administrativo o seguridad extrema.

---

## 7. Flujo Operativo de Venta

### 1. Generar lote

```bash
node backend/scripts/generateNfcBatch.js 5
```

Esto crea documentos en MongoDB y genera:

`backend/nfc_batch_results.csv`

### 2. Escribir chip NFC

Con NFC Tools:

```txt
https://cardsocial.me/n/CS-METAL-001
```

### 3. Bloquear chip

Aplicar **Lock Tag / Solo Lectura**.

Esto evita que alguien borre la URL oficial.

### 4. Grabar físicamente

En el metal:

- logo Card-Social o logo cliente,
- QR con la misma URL,
- opcional: ID parcial o completo.

### 5. Preparar caja

Incluir tarjeta de bienvenida con:

- `nfcCardId`
- `activationPin`
- instrucciones:
  - abrir app,
  - menú NFC,
  - Vincular,
  - ingresar ID + PIN.

### 6. Usuario reclama

En app:

- Menú Drawer → NFC.
- Vincular tarjeta física.
- Ingresa ID + PIN.
- Backend valida y reclama.

### 7. Usuario monta identidad

En app:

- Montar.
- Elegir BusinessCard o SmartCard.
- Si SmartCard es 24 h, fallback obligatorio.

---

## 8. Flujo Técnico del Redirector

Cuando alguien escanea:

```txt
GET /n/CS-METAL-001
```

El servidor:

1. Busca `nfc_cards.nfcCardId`.
2. Si no existe, muestra página neutral.
3. Si `isClaimed !== true`, muestra “tarjeta sin activar”.
4. Si `status = lost`, muestra recuperación.
5. Si `status = paused`, muestra pausa.
6. Si `status = blocked`, muestra perfil no disponible.
7. Si tiene destino temporal vigente, redirige.
8. Si destino temporal expiró, usa fallback.
9. Si destino permanente válido, redirige.

---

## 9. Comandos Útiles

### Generar 5 tarjetas

```bash
node backend/scripts/generateNfcBatch.js 5
```

### Revisar sintaxis backend NFC

```bash
node --check backend/src/lib/nfcCards.js
node --check backend/src/routes/nfcRoutes.js
node --check backend/src/routes/nfcPublicRoutes.js
node --check backend/src/server.js
node --check backend/src/security/mongoHardening.js
node --check backend/scripts/generateNfcBatch.js
```

### Revisar TypeScript app

```bash
npx tsc --noEmit --pretty false
```

---

## 10. Notas de Prueba Manual

Para probar en celular:

1. Correr script batch.
2. Copiar del CSV:
   - `nfcCardId`
   - `activationPin`
3. Abrir app.
4. Menú Drawer → NFC.
5. Vincular tarjeta física.
6. Ingresar ID + PIN.
7. Montar una BusinessCard.
8. Abrir:

```txt
https://cardsocial.me/n/{nfcCardId}
```

Debe redirigir al destino montado.

Para probar SmartCard 24 h:

1. Montar una SmartCard.
2. Confirmar que exige fallback si no hay BusinessCard.
3. Escanear `/n/{nfcCardId}`.
4. Debe redirigir al token temporal `/u/{token}`.
5. Cuando expire, debe ir al fallback.

---

## 11. Cosas Importantes Para El Futuro

### 11.1 Selector real de IconData para modo perdida

La estructura ya soporta `recoveryContact`, pero falta una UI fina para elegir desde IconData real del usuario.

Hoy, si se activa modo perdida sin contacto, la app usa un fallback simple de email.

Futuro:

- abrir selector de IconData,
- filtrar tipos seguros,
- permitir WhatsApp/email/teléfono/link,
- guardar `recoveryContact`.

### 11.2 Panel Admin para provisionar lotes

Hoy existe script CLI.

Futuro:

- panel SuperAdmin,
- generación batch desde UI,
- export CSV,
- reimpresión de PIN,
- bloqueo administrativo,
- reasignación bajo proceso manual.

### 11.3 Reclamación de tarjetas vendidas

Regla actual:

> Una tarjeta reclamada no se puede reclamar de nuevo.

Si un cliente pierde acceso a su cuenta, hará falta un proceso administrativo seguro.

### 11.4 Cache distribuido

El resolver ya usa `no-store`, pero no se añadió Redis/Upstash.

Futuro:

- cache write-through por `nfcCardId`,
- invalidación inmediata al montar,
- fallback a Mongo.

### 11.5 Dependencia nativa NFC

V1 no usa dependencia nativa.

Futuro posible:

- `react-native-nfc-manager`,
- lectura NFC por tap,
- escritura/validación in-app,
- solo si se acepta el costo de build nativo.

### 11.6 QR y chip deben coincidir

El chip NFC y el QR físico deben llevar exactamente:

`https://cardsocial.me/n/{nfcCardId}`

No escribir:

- `/u/{token}`
- `/b/{bId}`
- link directo a perfil
- URL con datos personales

---

## 12. Archivos Relacionados

Documentos:

- `docs/CARD_SOCIAL_NFC_MANUAL.md`
- `docs/NFC_IMPLEMENTATION_HANDOFF.md`
- `docs/VIP_CAMPAIGNS_Y_ENTITLEMENTS.md`

App:

- `app/nfc.tsx`
- `app/_layout.tsx`
- `app/(tabs)/_layout.tsx`
- `services/types/nfc.ts`
- `services/nfcCardsRepo.ts`

Backend:

- `backend/src/lib/nfcCards.js`
- `backend/src/routes/nfcRoutes.js`
- `backend/src/routes/nfcPublicRoutes.js`
- `backend/src/security/mongoHardening.js`
- `backend/src/server.js`
- `backend/scripts/generateNfcBatch.js`

Output operativo:

- `backend/nfc_batch_results.csv`

---

## 13. Resumen Ejecutivo

El módulo NFC convierte una tarjeta física Card-Social en hardware inteligente:

- se provisiona oficialmente,
- se reclama con PIN,
- se vincula a un usuario,
- monta una identidad dinámica,
- soporta fallback,
- soporta modo perdida,
- redirige con 302/307,
- nunca usa 301,
- nunca requiere reescribir el chip para cambiar de perfil.

Esta es la base técnica para vender la línea **Black & Gold Metal** como hardware de identidad premium.
