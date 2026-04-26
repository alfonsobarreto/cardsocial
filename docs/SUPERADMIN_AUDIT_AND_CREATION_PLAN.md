# Auditoria y Plan de Creacion del SuperAdmin / Admin

Fecha base: 2026-04-26  
Objetivo: dejar una guia operativa para construir el Admin/SuperAdmin de Card-Social con control real sobre producto, usuarios, monetizacion, Studio, NFC, campanas y reglas de uso.

---

## 1. Resumen ejecutivo

Card-Social ya tiene piezas de administracion, pero todavia no existe un Admin unico como sistema central de operacion.

Hoy conviven:

- Admin movil dentro de la app (`app/admin/*`).
- Endpoints backend bajo `/api/admin`.
- Un `frontend-admin/` legacy.
- Documentacion de producto que pide mas capacidades que las actualmente implementadas.
- Diferentes fuentes de verdad para usuarios, cards, QR, compras, assets, NFC y configuracion.

La recomendacion tech lead es construir un Admin modular, con una base comun de autenticacion, roles, auditoria y permisos, y luego sumar modulos operativos.

El Admin no debe ser solo un dashboard. Debe ser el centro de control de plataforma.

---

## 2. Superficies admin existentes

### Admin movil

Rutas actuales:

- `app/admin/dashboard.tsx` - landing principal "The Mint".
- `app/admin/mint.tsx` - generacion e historial de QR gifts.
- `app/admin/stats.tsx` - usuarios, CS Coins, Student Pack y costos informativos.
- `app/admin/moderation.tsx` - reportes, revision, dismiss y ban.
- `app/admin/studio.tsx` - uploaders de iconos, wallpapers y fuentes.
- `app/admin/config.tsx` - broadcast y feature flags.

Servicios/componentes relacionados:

- `components/AdminDashboard.tsx`
- `services/adminAuthGuard.ts`
- `services/roleService.ts`
- `services/qrGiftService.ts`
- `services/studentPackAdminService.ts`

Estado actual:

- Es una buena base para consola movil.
- Tiene validacion de `super_admin`.
- El dashboard principal exige biometria, pero no todas las pantallas repiten el mismo nivel de seguridad.
- Sirve para operacion rapida, pero no es ideal para tablas grandes, finanzas, exportaciones, lotes NFC o creacion avanzada de themes.

### Backend admin

Archivos relevantes:

- `backend/src/routes/adminRoutes.js`
- `backend/src/routes/adminRoutes.ts`
- `backend/src/server.js`
- `backend/src/admin-panel.html`

Endpoints activos del router JS:

- `POST /api/admin/login`
- `POST /api/admin/mint_asset`
- `POST /api/admin/publish_asset`
- `GET /api/admin/stats`
- `GET /api/admin/billing-status`

Hallazgos:

- El runtime monta `adminRoutes.js`.
- `adminRoutes.ts` contiene logica mas seria para market assets, pero no esta montado.
- Algunas rutas del JS son mock o parciales.
- `/api/admin/billing-status` si contiene valor real para finanzas/costos cuando hay DB disponible.

### Admin web legacy

Archivo:

- `frontend-admin/README.md`

Estado:

- Marcado como legacy.
- No tiene `package.json` propio.
- No parece ser el panel admin principal servido en produccion.

Recomendacion:

- No construir el futuro Admin encima de una pieza legacy sin antes decidir si se conserva, se migra o se reemplaza.

---

## 3. Problema principal

Hay una diferencia clara entre:

1. Lo que el producto necesita controlar.
2. Lo que la documentacion ya promete.
3. Lo que el codigo actual administra de forma real.

El riesgo es crear pantallas nuevas sin resolver:

- Fuente de verdad.
- Permisos.
- Auditoria.
- Enforcement.
- Relacion Firestore / Mongo / RevenueCat / backend.
- Diferencia entre QR Gift, QR universal, QR VIP y NFC.

Por eso el Admin debe tratarse como una arquitectura propia, no como una suma de pantallas.

---

## 4. Modulos recomendados del Admin

### 4.1 Admin Core

Responsabilidad:

- Autenticacion.
- Roles.
- Permisos.
- Auditoria.
- Dashboard general.
- Acciones sensibles con confirmacion.

Debe soportar:

- `super_admin`
- `admin`
- `support`
- `finance`
- `studio_admin`
- `campaign_admin`

Decision pendiente:

- Definir si el Admin principal sera web, movil o dual.

Recomendacion:

- Web Admin como panel principal.
- Admin movil como consola rapida/emergencia.

---

### 4.2 Trust & Safety / Moderacion

Responsabilidad:

- Reportes de tarjeta.
- Reportes de perfil.
- Reportes de contenido.
- Reportes de Business Card.
- Baneos.
- Suspensiones.
- Bloqueo de tarjetas.
- Ocultamiento de contenido en Social Market.

Estado actual:

- `app/admin/moderation.tsx` lee `reports`.
- Puede marcar reportes como `reviewed` o `dismissed`.
- Puede escribir `isBanned`, `bannedAt`, `banReason` en `users`.

Brecha:

- No basta con escribir un flag de ban.
- Debe existir enforcement real en app, backend, web publica y resolvers.

Recomendacion:

- Crear un flujo de moderacion con:
  - Motivo obligatorio.
  - Evidencia.
  - Severidad.
  - Accion tomada.
  - Duracion si es suspension temporal.
  - Auditoria.
  - Visibilidad publica controlada: "Perfil no disponible".
  - Mensaje especifico al titular.

---

### 4.3 Rules & Tiers

Responsabilidad:

- Reglas de uso de la app.
- Limites por tier.
- Feature flags por tier.
- Entitlements.
- Reglas de downgrade.
- Dia 366.
- Modo lectura.

Tension detectada:

- `admin.md` dice que los limites Free viven en codigo (`constants/freeTierPolicy.ts`) y el Admin solo los muestra.
- `docs/VIP_CAMPAIGNS_Y_ENTITLEMENTS.md` dice que ningun limite de IconData, SmartCards o BusinessCards debe estar fijo en codigo, y que todo debe vivir en configuracion editable por SuperAdmin.

Decision recomendada:

- Migrar a fuente de verdad dinamica para tiers y limites.
- El Admin debe editar esa configuracion.
- La app, backend y web deben leer la misma fuente.

Campos minimos:

- Tier: `free`, `influencer`, `business`, `enterprise`.
- Max IconData.
- Max SmartCards.
- Max BusinessCards.
- Acceso a Business Card.
- Acceso a Social Market.
- Acceso a NFC.
- Acceso a themes premium.
- Acceso a icon packs premium.
- Reglas de expiracion.
- Reglas de modo lectura.

---

### 4.4 Campaigns / QR VIP

Responsabilidad:

- Crear campanas VIP.
- Crear QR para influencers.
- Crear QR para negocios.
- Controlar cupos.
- Controlar vigencia.
- Medir atribucion.
- Gestionar grants.
- Preparar downgrades.

Estado actual:

- Existe `services/qrGiftService.ts`.
- Ese sistema genera QR gifts con CS Coins y meses premium.
- Usa Firestore `qr_gifts`.
- No equivale todavia a un sistema completo de campanas VIP.

Diferencia necesaria:

- QR Gift: regalo de creditos/meses.
- QR VIP Campaign: campana comercial con tier, cupos, T&C, atribucion y vigencia.

Modulo recomendado:

- Crear campana.
- Tipo de campana: Influencer, Business, Enterprise invite.
- Numero de asientos.
- Duracion.
- T&C versionados.
- QR unico de campana.
- Usuarios que escanearon.
- Usuarios que aceptaron.
- Referidos.
- Expiraciones proximas.
- Downgrade pendiente.

---

### 4.5 Studio / Marketplace Admin

Responsabilidad:

- Crear themes.
- Crear icon packs.
- Crear tipografias.
- Crear wallpapers.
- Crear coleccionables.
- Publicar/despublicar assets.
- Definir precio.
- Definir tier requerido.
- Ver ventas y compras.

Estado actual:

- `app/admin/studio.tsx` tiene tabs de iconos, wallpapers y fonts.
- Los docs `ICON_LIBRARY_SETUP.md` e `ICON_STORE_SETUP.md` describen libreria y tienda.
- Hay referencias a un admin web para themes completos con drag-and-drop y preview.
- El backend JS activo tiene endpoints mock/parciales para mint/publish.
- El backend TS no montado contiene logica mas cercana a `market_assets`.

Recomendacion:

- Convertir Studio en modulo completo de catalogo, no solo uploader.
- Unificar persistencia de assets.
- Definir si el marketplace vive en Firestore, Mongo o ambos con espejo controlado.

Campos minimos de asset:

- Tipo: theme, icon_pack, font, wallpaper, collectible.
- Nombre.
- Descripcion.
- Precio CS.
- Precio dinero real si aplica.
- Tier requerido.
- Estado: draft, published, archived.
- Autor/admin creador.
- Fecha de creacion.
- Fecha de publicacion.
- Compras totales.
- Revenue estimado.

---

### 4.6 Cards Control

Responsabilidad:

- Controlar tarjetas creadas.
- Ver Smart Cards.
- Ver Business Cards.
- Ver tarjetas reportadas.
- Ver tarjetas publicas.
- Ver tarjetas con QR universal.
- Ver tarjetas con comportamiento sospechoso.

Estado actual:

- `docs/PHASE_A_CARDS_INVENTORY.md` documenta persistencia y consumo de Smart Cards y Business Cards.
- Existen analytics por tarjeta a nivel producto.
- El Admin no tiene vista global unificada de tarjetas.

Modulo recomendado:

- Listado global de cards.
- Filtros por tipo: Smart / Business.
- Filtros por owner.
- Estado publico.
- Reportes asociados.
- Visualizaciones.
- QR emitidos.
- Accion: revisar, ocultar, bloquear, abrir detalle.

Importante:

- Respetar la regla de oro Smart vs Business.
- Smart = perfil / tarjeta inteligente.
- Business = `bId` / documento de negocio.

---

### 4.7 Analytics

Responsabilidad:

- Medir crecimiento y uso real.

Debe incluir:

- Usuarios activos.
- Tarjetas creadas.
- Visualizaciones de tarjetas.
- Scans QR.
- Aperturas `/u/:token`.
- Taps NFC / aperturas `/n/:nfcCardId`.
- Conversion QR -> registro.
- Conversion Business Card -> contacto.
- Top Business Cards.
- Top themes.
- Top icon packs.
- Top campanas.

Estado actual:

- Hay stats moviles basicos.
- Hay analytics de tarjeta en servicios.
- No hay dashboard global consolidado.

Recomendacion:

- Crear agregados de plataforma.
- Evitar exponer datos personales innecesarios.
- Separar analytics operativos de finanzas.

---

### 4.8 Finance / Billing / Sales

Responsabilidad:

- Ventas.
- Gastos.
- Facturas.
- RevenueCat.
- CS Coins.
- Costos de infraestructura.
- Reconciliacion.

Estado actual:

- `GET /api/admin/billing-status` contiene logica util.
- La app movil muestra costos de forma mas informativa que operativa.
- RevenueCat existe en el stack, pero no hay panel financiero completo.

Modulo recomendado:

- Ventas diarias/mensuales.
- Suscripciones activas.
- Compras de themes/icons.
- Compras de CS Coins.
- Ingresos por NFC/hardware.
- Costos Azure/Firebase/Mongo/EAS.
- Margen estimado.
- Export CSV.
- Facturas o referencias de factura.
- Reconciliacion RevenueCat -> Firestore -> Mongo.

Decision pendiente:

- Definir si V1 necesita facturas reales o solo dashboard/export.

---

### 4.9 NFC Operations

Responsabilidad:

- Control operativo de tarjetas NFC fisicas.

Modelo documentado:

- La tarjeta fisica mantiene una URL fija:

`https://cardsocial.me/n/{nfcCardId}`

- El chip no se reescribe para cambiar perfil.
- El backend resuelve el destino montado.
- El redirect debe ser temporal (`302`/`307`), nunca `301`.

Estado actual segun docs:

- Colecciones Mongo esperadas: `nfc_cards`, `nfc_card_events`.
- Estados: `unclaimed`, `active`, `paused`, `lost`, `blocked`.
- V1 puede vincular por `nfcCardId` + `activationPin`.

Modulo recomendado:

- Crear lotes NFC.
- Ver inventario.
- Exportar CSV para manufactura.
- Reimprimir PIN.
- Ver dueno actual.
- Ver destino montado.
- Ver fallback.
- Bloquear tarjeta.
- Poner en estado perdida.
- Reasignar bajo soporte.
- Ver eventos.

Acciones sensibles:

- `blocked`
- Reasignacion de owner.
- Reimpresion de PIN.
- Cambio manual de destino.

Todas deben exigir auditoria.

---

## 5. Fuentes de verdad que hay que decidir

Antes de implementar mas pantallas, hay que decidir que sistema manda en cada dominio.

| Dominio | Fuentes actuales o candidatas | Decision necesaria |
|---|---|---|
| Usuarios | Firestore `users`, Mongo `users`, Firebase Auth | Cual es master y cual es espejo |
| Tiers/limites | Codigo `freeTierPolicy.ts`, Firestore config | Migrar a config dinamica |
| QR Gifts | Firestore `qr_gifts` | Mantener separado de QR VIP |
| QR universal | Mongo `temporary_access` / rutas `/u` | Mantener como share/token temporal |
| QR VIP | No consolidado | Crear modelo propio de campaigns/grants |
| Cards | Mongo `smart_cards`, Business APIs, Firestore legacy | Definir panel de lectura unificada |
| Reports | Firestore `reports` | Agregar enforcement y auditoria |
| Assets Studio | Firestore/Storage/Mongo `market_assets` parcial | Unificar |
| Compras | RevenueCat, Firestore, Mongo | Reconciliacion |
| NFC | Mongo `nfc_cards`, `nfc_card_events` | Admin operativo sobre Mongo |
| Config sistema | Firestore `system_config/main` | Ampliar o separar por dominio |

---

## 6. Recomendacion de arquitectura

### Web Admin como panel principal

Recomendado para:

- Studio avanzado.
- Tablas grandes.
- Finanzas.
- Campanas.
- NFC por lotes.
- Export CSV.
- Auditorias.
- Busqueda y filtros.

### Admin movil como consola rapida

Recomendado para:

- Ver estado rapido.
- Moderacion urgente.
- Activar mantenimiento.
- Ver reportes criticos.
- Acciones de emergencia.

### Seguridad

Recomendado:

- Un modelo de roles unico.
- Auditoria obligatoria para acciones sensibles.
- Confirmaciones fuertes para:
  - Ban permanente.
  - Modo mantenimiento.
  - Bloqueo NFC.
  - Reasignacion NFC.
  - Cambios de limites por tier.
  - Grants manuales.
  - Downgrades manuales.

---

## 7. Orden recomendado de implementacion

### Fase 0 - Decision y limpieza

- Elegir web admin como principal o no.
- Elegir fuente de verdad por dominio.
- Decidir roles iniciales.
- Decidir si `adminRoutes.ts` se monta, se migra o se descarta.
- Alinear `admin.md` con `VIP_CAMPAIGNS_Y_ENTITLEMENTS.md`.

### Fase 1 - Admin Core

- Auth.
- Roles.
- Dashboard.
- Auditoria.
- Acciones sensibles.
- Layout principal.

### Fase 2 - Trust & Safety

- Reportes.
- Bans.
- Suspensiones.
- Enforcement.
- Auditoria.

### Fase 3 - Rules & Tiers

- Config dinamica de limites.
- Feature flags.
- Entitlements.
- Downgrade rules.
- Dia 366.

### Fase 4 - Campaigns / QR VIP

- Campanas.
- QR VIP.
- Cupos.
- Grants.
- Atribucion.
- Expiraciones.

### Fase 5 - Studio Admin

- Themes.
- Icon packs.
- Fonts.
- Wallpapers.
- Publicacion.
- Compras.

### Fase 6 - Cards Control + Analytics

- Inventario de Smart/Business Cards.
- Visualizaciones.
- Reportes por card.
- Top cards.
- Conversiones.

### Fase 7 - Finance

- Ventas.
- Costos.
- RevenueCat.
- CS Coins.
- Export.

### Fase 8 - NFC Operations

- Inventario NFC.
- Lotes.
- PINs.
- Bloqueos.
- Eventos.
- Soporte.

Nota: NFC puede adelantarse si el hardware fisico se vuelve prioridad comercial inmediata.

---

## 8. Preguntas pendientes para cerrar antes de construir

1. El Admin principal sera web, movil o dual?
2. Que roles reales tendra V1?
3. Los limites por tier se migran oficialmente a Firestore/config dinamica?
4. QR Gift y QR VIP quedan como sistemas separados?
5. Los bans bloquean login completo, visibilidad publica, creacion de cards o todo?
6. Studio Admin vendera por CS Coins, dinero real, tier requerido o combinacion?
7. NFC Admin creara lotes/PINs desde UI o solo gestionara lotes creados por script?
8. Finance necesita facturas reales en V1 o basta con dashboard/export CSV?
9. Enterprise tendra overrides manuales desde Admin?
10. RevenueCat sera la fuente final de suscripciones o solo un proveedor sincronizado?

---

## 9. Riesgos si se implementa sin resolver lo anterior

- Admin con pantallas bonitas pero sin enforcement real.
- Bans que no bloquean la app/web/backend.
- Limites distintos entre app, web y backend.
- QR VIP mezclado con QR Gift.
- Finanzas incompletas por falta de reconciliacion.
- Studio publicando assets que la app no consume correctamente.
- NFC sin soporte operativo cuando haya problemas con tarjetas fisicas.
- Acciones sensibles sin auditoria.
- Doble fuente de verdad entre Firestore y Mongo.

---

## 10. Recomendacion final

Construir el SuperAdmin como un producto interno serio.

No debe empezar por "hacer mas pantallas", sino por:

1. Unificar seguridad y roles.
2. Definir fuentes de verdad.
3. Crear auditoria comun.
4. Implementar modulos por prioridad.

Prioridad recomendada para empezar:

1. Admin Core.
2. Trust & Safety.
3. Rules & Tiers.
4. Campaigns / QR VIP.

Luego:

5. Studio Admin.
6. Cards Control + Analytics.
7. Finance.
8. NFC Operations.

Esta ruta permite que el Admin controle primero lo que puede romper la plataforma: usuarios, politicas, limites, campanas y seguridad. Despues se expanden los modulos comerciales y operativos.

