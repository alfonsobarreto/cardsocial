# Infra: Stories (legacy backend), VoIP Agora, Firebase, DigitalOcean

Documento histórico y de contexto infra. **Actualizado mayo 2026.**

**Cliente móvil:** el producto **ya no** incluye el tab Stories ni llamadas cliente a `services/qrApi.ts` relacionadas con historias. Las rutas de backend siguen disponibles opcionalmente para datos legacy.

---

## Estado producto vs backend (Stories)

- **App RN:** pantalla Stories, estilos, `AsyncStorage stories_hub_*` y helpers de cliente **eliminados**; no existe flujo nuevo que publique ni consuma Stories.
- **Backend:** las rutas bajo **`/api/qr/stories/*`** pueden permanecer activas como **noop / compatibilidad** (Mongo `story_states`, anuncios house, etc.). No asumir que clientes nuevos las invoquen.
- **Histórico (antes del retiro del tab):** los endpoints Stories gestionaban **solo metadatos** (`none` | `normal` | `vip`), expiración, `sid` / `bId` y VIP; **no** subían multipart de story en la misma operación.


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

### Stories API (legacy, solo metadatos en servidor)


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

1. ~~**Story multimedia end-to-end:**~~ fuera del alcance actual del cliente; backend puede conservar colecciones por migración gradual.
2. **Almacenamiento “ya existe”** a nivel código: **Sí** para uploads genéricos moderados → **DO Spaces** (privado) + **proxy** `/api/vault/file/:id`. **No** está cableado automáticamente a `storyState`.
3. **Firebase + DO + Azure + Mongo** conviven: Firebase en app; DO Spaces y Mongo en API Node; Azure para moderación (y email).

---

## Referencias cruzadas en documentación del repo

- Comportamiento tab Mis Tarjetas resumido: `funcionalidades.md`.
- Arranque backend y prefijos API: `README.md`.
