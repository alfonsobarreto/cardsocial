# Infra y estado: Stories (media), VoIP Agora, Firebase, DigitalOcean

Documento para contexto de nuevos chats / planificación de fases. **Abril 2026.**

---

## Pregunta frecuente: ¿El backend ya sube y entrega assets de Story vinculados a `storyState`?

**Respuesta corta:** Los endpoints de **Stories bajo `/api/qr`** hoy gestionan **solo metadatos de estado** (`none` | `normal` | `vip`), expiración, `sid` / `bId` opcional y flags VIP. **No** incluyen subida de archivo ni un campo estándar `mediaUrl` enlazado a esa fila en la misma operación.

**Qué sí existe para archivos (genérico, no específico de Story):**

- `POST /api/upload` (rutas de moderación montadas en `/api` en `backend/src/server.js`).
- Flujo: multipart `file` + moderación **Azure Content Safety** → con credenciales **DigitalOcean Spaces** (API S3-compatible), sube el binario a un prefijo privado (`vault-proxy/...`), registra metadatos en Mongo (`vault_file_registry`) y devuelve **`publicUrl`** = URL del **proxy** (`GET /api/vault/file/:fileId`, ver `vaultFileProxyRoutes.js`). Sin Spaces configurado, el upload responde error (no hay fallback local).
- Código: `backend/src/routes/moderationRoutes.js`, almacenamiento `backend/src/services/mongoStorage.js` (`uploadVaultFilePrivate`, `pipeVaultFileToResponse`, `saveFileToSpaces` para otros flujos públicos).

**Fase 1 razonable:** Sincronizar **metadatos** (URLs absolutas, `expiresAt` alineado al asset, tipo MIME, etc.) **asumiendo** que el binario ya está en Spaces (vía `/api/upload` o flujo futuro dedicado) **o** extender el modelo Mongo (`story_states` / `story_card_states` o colección nueva `story_assets`) y un endpoint que una `uid` + `sid` / `bId` + URL. Eso **no está implementado** hoy como contrato único “Story upload”.

**App móvil (`app/(tabs)/stories.tsx`):** el contenido visible en demo suele ser **`LocalStory` en AsyncStorage** (`stories_hub_v1_<uid>`) con `mediaUri` local; el backend confirma estado con `setMyStoryState` / `getMyStoryState` pero **no** entrega el binario de la historia por esos endpoints.

---

## Dónde está cada tecnología en el repo

### Firebase (app móvil)

| Uso | Ubicación |
|-----|-----------|
| Auth (persistencia RN), Firestore, Storage inicializado | `services/firebaseConfig.ts` |
| Lecturas directas Firestore en pantallas | p. ej. `app/(tabs)/cards.tsx` (`auth`, `db`) |

`getStorage` está exportado; el flujo principal de QR/contactos pasa por **API propia** (`services/qrApi.ts`), no asumir que todo el media de producto vive solo en Firebase Storage.

### DigitalOcean Spaces (backend)

| Uso | Ubicación |
|-----|-----------|
| Cliente S3, `PutObject`, objetos vault privados + stream vía proxy | `backend/src/services/mongoStorage.js` — `createSpacesClient()`, `uploadVaultFilePrivate()`, `pipeVaultFileToResponse()`; rutas `vaultFileProxyRoutes.js` |
| Variables | `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_BUCKET`, `DO_SPACES_ENDPOINT`, `DO_SPACES_REGION` |
| Script de prueba | `backend/testUpload.js` |

**No** es Azure Blob para user-uploads de imágenes moderadas: es **Spaces** (compatible S3).

### Azure (backend)

| Uso | Ubicación |
|-----|-----------|
| Content Safety (imagen/texto) en upload | `backend/src/services/azureSafety.js`, `moderationRoutes` |
| Email (Communication Services) | `backend/src/services/azureEmail.js`, `email.service.js`, `AZURE_EMAIL_CONNECTION_STRING` |
| Variables moderación | `AZURE_CONTENT_SAFETY_*` en `backend/src/config.js` |

### MongoDB (backend)

| Uso | Ubicación |
|-----|-----------|
| Estados de story, anuncios casa, contactos enriquecidos | `backend/src/routes/qrRoutes.js`, índices TTL en `backend/src/security/mongoHardening.js` |
| Registro vault (metadatos + `spacesKey`, sin binario en Mongo) | `mongoStorage.js` — colección `vault_file_registry` |

### Stories API (solo metadatos)

| Método | Ruta (tras prefijo `/api/qr`) | Notas |
|--------|-------------------------------|--------|
| POST | `/stories/state` | Upsert `story_states` o `story_card_states`; TTL 24h normal / 7d VIP (constantes en `qrRoutes.js`) |
| GET | `/stories/state` | Lee estado vigente o expirado → `none` |
| POST | `/stories/vip/manual` | VIP manual / partner |
| GET/PUT | `/stories/ads/house` | Anuncio casa rotativo |

**No** hay aquí multipart de video/imagen de story.

---

## VoIP Ghost-Link + Agora (implementado, activación condicionada)

| Capa | Ubicación |
|------|-----------|
| Tokens RTC (App ID + certificado **solo servidor**) | `backend/src/lib/agoraGhostLink.js` — requiere `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` |
| Invitaciones en rutas QR | `backend/src/routes/qrRoutes.js` — adjunta `agora: { appId, channelName, token, uid }` si el builder devuelve datos; si faltan env vars, `engine: 'signaling-only'` |
| Cliente: unirse / mute / speaker | `services/ghostLinkAgoraSession.ts` (`react-native-agora`) |
| Guard Expo Go (módulo nativo no cargado) | `services/expoGoAgoraGuard.ts` |
| Tipos y parseo de respuesta API | `services/ghostLinkVoip.ts` |
| UI llamadas | `app/(tabs)/contacts.tsx`, acciones en `services/ActionController.ts` |

**Comportamiento “dormido”:** Sin `AGORA_APP_ID` / `AGORA_APP_CERTIFICATE` en el backend, **no** se generan tokens ni payload Agora: el flujo sigue como señalización/backend sin audio RTC. En el cliente, **Expo Go** desactiva el `require` de Agora para no crashear; hace falta **dev build / TestFlight / store** con módulo nativo linkeado. Restricciones de **Apple** (Push VoIP, fondos, permisos micrófono, provisioning) deben estar resueltas para experiencia de llamada estable en iOS producción; el código del repo ya contempla el camino Agora cuando las variables y el binario nativo existen.

---

## Resumen para planificación

1. **Story multimedia end-to-end:** Hoy = **estado en API + contenido local en app**. Para Fase 1 “solo metadatos” con URLs: coherente con el backend actual; habría que **definir contrato** (campos + quién llama a `/api/upload` y cuándo se hace `POST /stories/state`).
2. **Almacenamiento “ya existe”** a nivel código: **Sí** para uploads genéricos moderados → **DO Spaces** (privado) + **proxy** `/api/vault/file/:id`. **No** está cableado automáticamente a `storyState`.
3. **Firebase + DO + Azure + Mongo** conviven: Firebase en app; DO Spaces y Mongo en API Node; Azure para moderación (y email).

---

## Referencias cruzadas en documentación del repo

- Comportamiento tab Mis Tarjetas y Stories resumido: `funcionalidades.md`.
- Arranque backend y prefijos API: `README.md`.
