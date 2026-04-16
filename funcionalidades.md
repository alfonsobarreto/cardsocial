# Funcionalidades núcleo de Card-Social (MVP)

Este documento resume el núcleo funcional actual para mantener alineado el comportamiento del producto con la promesa de privacidad del Búnker.

**Última ampliación técnica (app): abril 2026** — tab Mis Tarjetas (scroll, reorden, preview, wireframe). Mantener esta sección al día al cambiar `app/(tabs)/cards.tsx`.

### Registro de cambios (6 abr 2026)

- **Web universal `/u/…`:** proyecto **Next.js** en `frontend-web/` (temas alineados con `constants/themeChest.ts`, vista de tarjeta con slots públicos). En Azure va empaquetado dentro de `backend/frontend-web/` (build standalone + estáticos).
- **Deploy Azure / GitHub Actions:** el workflow construye `frontend-web` y sube el artefacto `backend` con **`include-hidden-files: true`** para que la carpeta **`.next`** no se pierda al empaquetar (sin eso, el Log Stream muestra el error de Next sobre falta de build de producción).
- **App — Search / contactos recibidos:** modal de tarjeta recibida unificado hacia **SmartCardMirrorModal** + **IsolatedWireframeCard**; datos enriquecidos (`publicCardSlots`, `ownerOccupation`, `receivedIssuerNickname`, etc.) y orden de nombre mostrado alineado con Mis Tarjetas.
- **Backend:** dependencia **`@aws-sdk/client-s3`** para rutas que usan S3; ajustes de proxy / **`INTERNAL_API_URL`** para que Next llame al API local sin bucles.

## 1) Búnker / Vault de datos
- El usuario guarda datos sensibles (teléfono, email, links, documentos, texto) en `vault_data`.
- El valor sensible se usa como dato interno de identidad, no como dato de exposición directa.
- Aperturas de datos deben pasar por flujo enrutado y seguro (Ghost-Link / visor protegido).

## 2) Tarjetas inteligentes (Cards)
- El usuario compone tarjetas seleccionando ítems del Búnker.
- Las tarjetas se comparten por QR dinámico y permisos de relación.
- Al tocar un dato telefónico desde tarjeta, nunca debe abrir marcador nativo del sistema.

### QR universal (marketing, TTL 24h) — `https://cardsocial.me/u/…`

| Pieza | Comportamiento |
|--------|----------------|
| **URL del QR** | Base **`https://cardsocial.me`**, ruta **`/u/{token}`**, query recomendada **`source=qr_scan`** (analytics). Se genera vía backend `POST /api/qr/temporary-access/issue` (`issueTemporaryUniversalAccess` en `services/qrApi.ts`). |
| **Mongo** | Colección **`temporary_access`**: token opaco, `sid` / `bId`, `uid`, `expiresAt` (+24h), índice TTL. |
| **Validación en API** | `GET /u/:token` en Express valida el token antes de redirigir a la SPA; expirado → página HTML negra OLED con mensaje acordado. |
| **JSON para Expo Web** | `GET /api/public/universal-card?token=…` — sin JWT; solo datos públicos; **slots** desde **`publicCardSlots`** en `smart_cards` (el vault completo del dispositivo no se expone; ítems privados se excluyen al sincronizar `publicCardSlots` en el PUT de tarjeta). |
| **Deep links** | Universal Links / App Links: archivos en **`public/.well-known/`** (build web); `app.json` con `associatedDomains` e `intentFilters` para `https://cardsocial.me/u`. |
| **Infra** | Dominio **`cardsocial.me`**; **`/u/*`** puede servirse desde el mismo App Service que el API vía **Next.js** embebido (`frontend-web` → `backend/frontend-web` en el zip de deploy). Ver `README.md` y `backend/README.md`. |

### Tab **Mis Tarjetas** (`app/(tabs)/cards.tsx`) — comportamiento actual

| Tema | Implementación |
|------|----------------|
| **Lista / scroll** | `FlatList` con `flex: 1` en el contenedor del tab. **Portrait:** scroll vertical + *pull to refresh*. **Landscape:** lista horizontal con `pagingEnabled` y snap entre tarjetas. |
| **Vista previa** | Un **toque** en el cuerpo de la fila abre el modal (Smart o Business). Se usa `TouchableOpacity` de **React Native** dentro de `Swipeable` (RNGH) para que el tap no compita con el swipe. `delayLongPress` ~420 ms separa tap de long press. |
| **Reordenar** | Long press → modo reordenar (solo **portrait**, búsqueda vacía). Banner *Cancelar* / *Listo*. Lista: `DraggableFlatList` (`react-native-draggable-flatlist`). **Layout:** banner + lista dentro de `View` `cardsReorderListWrap` (`flex: 1`, `minHeight: 0`); **no** usar Fragment `<>...</>` como único wrapper bajo el gradiente — sin eso la lista puede quedar con altura 0 (vacía). |
| **Orden persistido** | AsyncStorage: `cards_tab_feed_order:<uid>` (`cardsTabFeedOrderStorageKey` en `services/userScopedStorage.ts`); merge vía `applyCardsManualFeedOrder`. |
| **Wireframe / preview** | `IsolatedWireframeCard`. Rejilla iconos (spec Stitch): inset horizontal total **48** (`wireIconGridRoot` padding 24+24), **gap 12**, un icono lado máx. **112**; más iconos: fórmula por filas + tope por altura (`computeStitchWireframeBubbleSide`). Estilos wireframe en el `StyleSheet` de `cards.tsx`. |
| **Swipe** | Acciones Editar / QR / Favorito / Eliminar; swipe izquierda según fila dispara flujo QR. |

**Dependencia:** `react-native-draggable-flatlist`.

**Otros tabs:** `cards.tsx` no es el hub de Stories; solo texto de canal/suscriptores. Contactos y Stories comparten `storyState` vía `listReceivedContacts`. Search no muestra anillo de historia en negocios del market (pendiente si se requiere).

## 3) Contactos + Calls (Ghost-Link VoIP)
- La llamada se inicia por `Contacts`/`Calls` vía `ghost-link-voip`.
- Flujo backend:
  - `POST /api/qr/voip/ghost-link/start`
  - `GET /api/qr/voip/ghost-link/incoming`
  - `POST /api/qr/voip/ghost-link/respond`
- El número real del emisor no se revela al receptor.
- El campo teléfono funciona como identificador interno, no como destino de `tel:`.

## 4) Stories CTA
- CTA puede invocar email/link/documento/texto.
- CTA telefónico debe enrutarse por Ghost-Link, nunca por `tel:`.

## 5) Política de privacidad operativa
- Prohibido bypass al marcador nativo para datos de tipo Teléfono.
- Si falta `targetUid` para iniciar bridge Ghost-Link, la UI debe redirigir al flujo interno `Contacts`/`Calls`.
- Mensajería al usuario debe reforzar: “Tu número real permanece oculto.”

## 6) Estado técnico actual del VoIP
- Existe canal lógico `ghost-link-voip` con registro y control de invitaciones.
- Falta conexión de media engine en cliente (audio real de llamada):
  - No hay SDK de media VoIP integrado actualmente.
  - El backend hoy gestiona señalización/estado de invitación y bitácora de llamadas.
  - Recomendación: integrar SDK de Azure Communication Services Calling (o equivalente) para audio en tiempo real.

## 7) Stories (resumen para no duplicar contexto)
- Pantalla: `app/(tabs)/stories.tsx`, estilos `app/(tabs)/_stories.styles.ts` (prefijo `_` para que Expo Router no lo trate como ruta), tokens `stories*` en `app/theme.ts`.
- API cliente: `getMyStoryState`, `setMyStoryState`, `listReceivedContacts`, `getStoriesHouseAd` en `services/qrApi.ts`.
- Flujo creación: primero **tarjeta emisora** (carrusel), luego **mirror del Bunker filtrado** solo a `itemIds` de esa tarjeta; `setMyStoryState` siempre con `sid` / `bId`. En feed, `listReceivedContacts` devuelve `storyState` por canal **uid + sid/bId** del permiso recibido (sin mezclar historia global si ya hay tarjeta).
- Estados de anillo: `none` | `normal` (24h) | `vip` (7d/30d + créditos en flujo publicación). Contactos reutilizan `storyState` en avatar (`app/(tabs)/contacts.tsx`).
- Servicio **no cableado a la UI del tab**: `services/storiesFeedInjectionService.ts` (inyección de historias de negocio por distancia) — diseño futuro / market.
