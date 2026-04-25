# Campañas VIP, entitlements y operación de plataforma

Documento maestro (Card-Social): visión técnica, **estrategia comercial**, decisiones de producto y alcance. **Ubicación:** `docs/VIP_CAMPAIGNS_Y_ENTITLEMENTS.md`.

---

## 0. Decisiones de producto (fuente de verdad; actualizado)

| Tema | Decisión |
|------|----------|
| **Límites (todos los tiers)** | **Ningún** tope de IconData, SmartCards o BusinessCards debe ir **fijo en código**. El sistema **consulta** los valores en una **colección de configuración global** (objetivo: **Firestore**), editable desde el **panel SuperAdmin** en **tiempo real** (ver **§2** y **§7**). Incluye **Gratis, Influencer, Negocio** y, para **Enterprise**, filas *custom* o overrides operativos. |
| **Modelo de negocio** | **Cuatro tiers**; números de referencia y beneficios de marketing en **§2**. |
| **Hardware NFC** | **Add-on** opcional, **independiente** del SaaS. Tiers de pago: **“Pedir tarjeta física”** desde el **Vault**; el usuario cubre **manufactura y envío**; margen vía producto *hardware* (ver **§8**). |
| **Campaña VIP (QR) + expiración** | Acceso inmediato a **Influencer/Negocio** por **365 días**; el **día 366** sin pago/renovación: **downgrade automático** a **Gratis** (ver **§4**). |
| **Datos al superar límite Free (post–día 366)** | Criterio comercial: el **exceso sobre el límite de IconData del Free** (hoy 8, configurable) entra en **“Modo lectura”** — **sigue visible al público**; para el **dueño** se muestra **bloqueado / gris / candado** (sin edición). Las **BusinessCards** que dejen de ser válidas (extra frente a lo permitido en Free) se **desactivan visualmente** (público/UX: sin tratamiento de “alta” activa). *SmartCards* en exceso del límite Free: **mismo patrón que IconData** (modo lectura público + candado en Vault) **salvo** que el producto defina otra excepción. |
| **Baneo / suspensión — público** | *“Perfil no disponible”* genérico. |
| **Baneo / suspensión — titular** | Motivo **específico** in-app (y Studio cuando aplique). |
| **Atribución y panel** | **§5** y **§10** (registro vía QR, listado con UID, avatar, nombre, referidos). |
| **Documentación** | Este archivo. |

*Si una versión anterior de este documento decía “ocultar extras en el perfil público al expirar”, queda **reemplazada** por el criterio de **modo lectura + candado** de **§4** y el párrafo de arriba.*

---

## 1. Visión y filosofía de producto

**Posicionamiento:** Card-Social se concibe como plataforma de identidad digital **“luxury”** (lujo): la monetización es **freemium** en **cuatro** niveles; el valor se expresa en **exclusividad** y en la **gestión y presentación** de los datos, no en “más de lo mismo” genérico.

- **Operador (SuperAdmin):** una sola cuenta con poder pleno; **§10**. Términos internos: *Platform owner* / *System operator*.
- **Campaña:** **tier** (Influencer/Negocio, etc.), **asientos (cupos)**, **T&C** versionados, **1 QR = 1 campaña** (**§3**, **§10**).
- **Entitlements y límites:** resueltos en **servidor** leyendo **config** en base de datos; el cliente nunca fija “techos oficiales”.
- **Ingeniería:** capa incremental, feature flags, fases ( **§9** ).

---

## 2. Definición de tiers, beneficios y límites (referencia; todo dinámico vía base de datos)

**IMPORTANTE (implementación):** Los máximos de **IconData, SmartCards y BusinessCards** para **cada** fila de tier deben leerse de la **configuración global** en **base de datos** (objetivo: **Firestore** en este proyecto: una colección de `platformTiers` / `tierLimits` o equivalente, más documento/segmento *Enterprise*), **nunca** como constantes “duro” en la app, para permitir ajuste **en vivo** desde **Admin (§7)**.

| Tier | IconData (max) | SmartCards (max) | BusinessCards (max) | Beneficios extra (comercial) |
| :--- | :---: | :---: | :---: | :--- |
| **Gratis (Free)** | 8 | 5 | 0 | Perfil básico, temas estándar. |
| **Influencer** | 20 | 10 | 1 | Temas premium, soporte priorizado, **1 año de gracia** vía **QR** (365 días). Add-on **NFC** disponible. |
| **Negocio (Business)** | 50 | 10 | 5 | Gestión de equipo, panel de **métricas básico**, **1 año de gracia** vía **QR**. NFC (equipo) como add-on. |
| **Enterprise** | Custom | Custom | Custom | Soporte dedicado, **base de datos** acorde al acuerdo, **integración CRM** (alcance al contrato). **UI pública (marketing):** *“Si eres un negocio grande, escríbenos para crear tu base de datos y dar acceso a tus empleados”* (sin self-serve de *custom* en app). |

- Los **números** de la tabla son **iniciales de negocio**; la **fuente de verdad** viva es la **base de datos** leída por `getEffectiveLimits` y el **Admin**.
- **Campañas con QR (Influencer/Negocio):** p. ej. `Influencers_Austin_001` con **N asientos**; el tier otorgado por la campaña aplica el **mismo techo** que la fila de producto, según su tipo.

---

## 3. Modelo de datos (backend) — Campañas, asientos, grants, Firestore

**Principio:** el documento de usuario no concentra toda la lógica. Entidades separadas; **configuración de tiers** en **Firestore (o servicio unificado con la misma semántica)**.

- **Campaña:** `id`, nombre, `tierEfectivo`, `cuposTotal`, consumo de asientos, ventana T&C, estado.
- **QR / canje:** **1:1** con campaña; comprobar **cupo** antes de emitir/activar grant.
- **Grant de usuario:** `userId`, `campaignId`, vigencia (p. ej. **desde aceptación** 365 días; **día 366** inicia lógica de downgrade), `status`.
- **Config global de límites:** documento o subcolecciones con **por tier** (y overrides Enterprise) los campos `maxIconData`, `maxSmartCards`, `maxBusinessCards` + metadatos de producto (orden de visualización, feature flags, etc. si aplica).

`getEffectiveLimits(uid)` = f(**config actual en Firestore/DB**, tier efectivo, grants, Enterprise, …).

**Composición de varias campañas:** aún a precisar en implementación; flujo asumido: un grant de campaña con vigencia y **downgrade a Free** a expirar.

---

## 4. Adquisición (QR) y expiración: “día 366” y downgrade

- **Campaña VIP (QR):** acceso **inmediato** a **Influencer** o **Negocio** con duración de **365 días** (1 año de gracia según oferta y T&C).
- **Día 366:** si **no** hay pago, renovación o arreglo comercial, **downgrade automático** al tier **Gratis** (límites leídos de config, no hardcode).
- **Dentro del límite Free (según config):** esos recursos: **edición y uso** completos, público y privado.
- **Exceso sobre el límite Free (IconData, y SmartCards por la misma regla salvo excepción de producto):** **“Modo lectura”** — el **público sigue viendo** el contenido; el **dueño** lo ve **bloqueado** (gris, candado), sin mutaciones, con CTA de **renovar/actualizar plan** en Vault.
- **BusinessCards** que queden como **extra** frente a lo permitido en **Free** (0 en la referencia de tabla): **desactivación visual**; sin comportamiento de “BC activa” hasta que el producto/entitlement lo permita de nuevo.
- **Persistencia:** no se borra la DB por mero vencimiento; aplica lógica de **modo** y **derechos**.

**Comunicación:** preavisos 30/7/1 (canales **TBD**).

---

## 5. Atribución y panel de operador

- **Métrica de negocio / Atribución:** vinculación a **campaña** y **T&C** en el flujo de **alta/aceptación** del **QR** (idempotente según reglas).
- **Panel (por campaña):** quienes **escanearon y aceptaron**: **UID, avatar, nombre completo** y **contador de referidos** (nuevas cuentas atribuibles) — alinear modelo de *referral* con backend.
- V1: no *analytics* fino de “cada impresión sin aceptar”.

---

## 6. Suspensión, baneo y visibilidad

| Audiencia | Comportamiento |
| :--- | :--- |
| **Público** | *“Perfil no disponible”* (genérico). |
| **Titular** | Motivo **específico**; acciones de **SuperAdmin** con confirmación ( **§10** ). |

**SmartCard física:** el resolver aplica baneo/suspensión.

---

## 7. Configuración global en Admin (SuperAdmin)

- **Requisito comercial/ técnico:** sección de **“Configuración global”** en el **panel** donde el operador edite, **en tiempo real**, los **límites de cada tier** (IconData, SmartCards, BusinessCards) y, para **Enterprise**, **valores *custom*** o pistas operativas según se diseñe (sin romper B2B cerrado en UI pública).
- **Origen de datos:** **Firestore** (u origen unificado) como **verdad** para la API y las apps; **auditoría** de cambios (quién, cuándo, valor previo).
- `getEffectiveLimits` y toda la UI (app, web, resolvers públicos) usan la **misma** lectura, evitando constantes *hardcoded* y “double source of truth”.

---

## 8. Hardware NFC (add-on opcional)

- La **tarjeta NFC física** es un producto **independiente** del **SaaS** (cobro y margen vía **manufactura + envío**).
- Usuarios en **tiers de pago** (según reglas de la config): acción **“Pedir / solicitar tarjeta física”** desde el **Vault** (y flujos de pago/fulfillment a definir en ops).
- En UI es posible mostrar al usuario **doble partida** (suscripción / software vs **pedido de hardware**).

---

## 9. Vault, perfil público y alineación con “modo lectura”

- Tras el **día 366** y con **exceso** sobre el **Free**, hace falta **ordenar** o **puntuar** qué recursos compiten por los 8+5+0 (u otros límites leídos de config): *qué* entra en “dentro de cuota” vs “modo lectura / candado” (regla de *ranking* o *FIFO*: **TBD** de implementación, pero el **estado** visual es: público = lectura; dueño = candado/CTA).
- **NFC (§8):** el **pedido** de hardware queda alineado con tiers vía la misma config/ *feature availability* en servidor.

---

## 10. Fases de rollout (cirugía no invasiva)

1. **Colección de config** (Firestore) + `getEffectiveLimits` en sombra.
2. **Escritura acotada** en API según techos; **día 366** + *modo lectura* y BC desactivadas.
3. **Público / baneo** ( **§6** ) y *resolver* con límites dinámicos.
4. **Admin** (móvil + web): **config global** por **tier**, campañas, QR, asientos, listados ( **§5** ).
5. **Enterprise** (onboarding) y **NFC** (pedidos, estados).

---

## 11. SuperAdmin: decisiones finales (producto y UX)

| Tema | Decisión |
|------|----------|
| **Creador de QR** | **Accesible en la app móvil** (menú **Admin**), no solo web, para agilidad en eventos. Web puede **complementar**; móvil es requisito. |
| **Campaña ↔ QR ↔ asientos** | **Un QR por campaña** con **asientos (cupos)** (p. ej. `Influencers_Austin_001` con 50). Agotado el cupo: canje no admitido (copy en implementación). |
| **Listado de campaña** | Quienes **escanearon y aceptaron** (T&C) con: **UID, avatar, nombre completo** y **contador de referidos** (nuevas cuentas) — **§5**. |
| **Rol** | **Solo una cuenta** **SuperAdmin**; sin RBAC de equipo en esta fase. |
| **Acciones destructivas** (ban, eliminación) | **Obligatorio** modal: el operador **escribe el *username* exacto** afectado (p. ej. *“Escribe `nanobanano21` para confirmar”*). No basta *OK* sin verificación. |
| **Configuración global (§7)** | Editar **límites de cada tier** (IconData, SmartCards, BusinessCards) y valores **custom** *Enterprise* según el diseño de datos, **en tiempo real**, leyendo/escribiendo en **Firestore** (u API equivalente), **sin** depender de constantes en la app. |

**Mapa de pantallas (mínimo):** Dashboard; **Configuración global (todos los tiers)**; **Campañas (CRUD + asientos)**; **QR (prioridad móvil)**; listado y métrica de **referidos**; **Usuarios** (búsqueda, ban con modal arriba); **Legales/T&C** según el flujo de QR. **Web** como complemento; **móvil** no opcional para QR en evento.

---

## 12. Preguntas técnicas / secundarias

- Orden (FIFO / pin / manual) al **elegir** qué 8 / 5 slots permanecen “editables” y cuáles pasan a *modo lectura*.
- **Canales** de preaviso (día 366).
- **Normalización** del *username* en el modal de destrucción.
- Múltiples *grants* simultáneos (futuro).

---

## 13. Próximos pasos (checklist)

- [x] Alinear documento con **estrategia comercial** (límites dinámicos, Firestore, modo lectura, BC extra, add-on, Admin global).
- [ ] **Esquema** Firestore: `tierLimits` / *platform config*, campañas, grants, *referrals*.
- [ ] **API** `getEffectiveLimits` + resolución de *modo lectura* (público) vs *candado* (dueño) + BC desactivada.
- [ ] **Admin** — **config global de todos los tiers** + campañas/QR; **móvil**; confirmación destrucción.
- [ ] **NFC** — pedido, pago, fulfillment.
- [ ] **Enterprise** — contrato, límites *custom* en la misma config o colección aislada.
- [ ] **Observabilidad** y auditoría.

---

*Última actualización: **Firestore** como fuente de límites por **todos** los tiers; filosofía *luxury* / **freemium 4 niveles**; **día 366** + **modo lectura** (público ve, dueño con candado) + **BusinessCards** extra desactivadas visualmente; **Configuración global** en Admin (límites en tiempo real); **NFC** como add-on (coste de manufactura y envío a cargo del usuario).*
