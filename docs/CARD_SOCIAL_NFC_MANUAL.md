# Card-Social NFC: Manual de Estrategia y Operación Técnica

Este documento centraliza la visión de negocio y la arquitectura técnica para el ecosistema de hardware de Card-Social, específicamente para la línea de ultra-lujo **Black & Gold Metal**.

---

## 1. Visión del Producto

- **Material:** acero o latón con recubrimiento negro mate, buscando resistencia y percepción premium.
- **Estética:** grabado láser en dorado, revelando el metal base o mediante técnica de marcado.
- **Ecosistema:** cerrado y exclusivo. Solo hardware oficial de Card-Social puede vincularse a la aplicación.
- **Principio de producto:** la tarjeta física es un objeto de lujo, pero su identidad es dinámica. El usuario cambia el destino desde la app sin reescribir el chip.

---

## 2. Arquitectura de Redirección Dinámica

A diferencia de las tarjetas tradicionales, las NFC de Card-Social son **inteligentes y dinámicas**. El hardware nunca cambia; lo que cambia es el destino en el servidor.

- **Chip NFC / Código QR:** ambos contienen la misma URL permanente:

  `https://cardsocial.me/n/{nfcCardId}`

- **Redirector público:** backend Express bajo:

  `GET /n/:nfcCardId`

- **Redirección:** usar códigos **302** o **307** (*Temporary Redirect*).

- **Regla crítica:** nunca usar **301**, para evitar que el teléfono o navegador guarde en caché un perfil antiguo.

### Lógica de Redirección

1. **Activa:** redirige al perfil montado, sea BusinessCard o SmartCard.
2. **Pausada:** muestra una página neutra sin identidad.
3. **Perdida:** muestra una página de recuperación con un canal elegido por el usuario, por ejemplo WhatsApp o email.
4. **Fallback:** si una SmartCard de 24 h expira, el sistema redirige automáticamente al perfil de respaldo para que la tarjeta nunca quede “muerta”.
5. **Sin activar:** si la tarjeta existe en base de datos pero aún no fue reclamada, muestra una página neutral de activación pendiente.

---

## 3. Modelo de Seguridad: PIN de Activación

Para garantizar que solo el comprador legítimo pueda usar la tarjeta, Card-Social usa una contraseña de un solo uso.

- **`nfcCardId`:** identificador único grabado en el metal o impreso en el QR, por ejemplo `metal-001`.
- **`activationPin`:** código aleatorio de activación, por ejemplo `X7K9`.
- **`isClaimed`:** booleano que indica si la tarjeta ya tiene dueño.
- **`activatedAt`:** timestamp de la activación.
- **`ownerUid`:** usuario dueño después de vincular la tarjeta.

### Flujo de Reclamo

1. El fundador o sistema de lotes pre-provisiona la tarjeta en MongoDB con `isClaimed: false` y `activationPin`.
2. El usuario recibe la tarjeta física.
3. El usuario abre **NFC** en la app.
4. Ingresa o escanea `nfcCardId`.
5. Ingresa el `activationPin`.
6. El backend valida que:
   - la tarjeta existe,
   - `isClaimed` es `false`,
   - no tiene `ownerUid`,
   - el `activationPin` coincide.
7. Si todo es correcto:
   - asigna `ownerUid`,
   - marca `isClaimed: true`,
   - guarda `activatedAt`,
   - invalida el PIN eliminando `activationPin`.

Una tarjeta ya reclamada no puede volver a vincularse con otro usuario salvo proceso administrativo futuro.

---

## 4. Guía de Operación para el Fundador

### Paso A: Preparación del Hardware

1. **Compra de blanks:** adquirir tarjetas de metal negro mate de alta calidad.
2. **Escritura del chip con NFC Tools:**
   - Escribir URL: `https://cardsocial.me/n/ID_UNICO`.
   - Aplicar **Lock Tag / Solo Lectura** para que nadie pueda borrar la URL oficial de Card-Social.
3. **Grabado físico:**
   - Logo de Card-Social o del cliente.
   - QR con la misma URL permanente.
   - Opcional: ID parcial visible para soporte o activación.

### Paso B: Registro Digital

1. Usar script generador de lotes para crear entradas en MongoDB.
2. Exportar CSV con `nfcCardId` y `activationPin`.
3. Imprimir el código de activación en una tarjeta de bienvenida dentro de la caja.
4. Entregar la tarjeta física al comprador.

---

## 5. Implementación Técnica

### Base de Datos

Colección principal:

`nfc_cards`

Campos relevantes:

- `nfcCardId`
- `ownerUid`
- `label`
- `material`
- `status`
- `activationPin`
- `isClaimed`
- `activatedAt`
- `mountedTarget`
- `fallbackTarget`
- `recoveryContact`
- `lastMountedAt`
- `lastConfirmedAt`
- `lastResolvedAt`
- `createdAt`
- `updatedAt`
- `version`

Colección de auditoría:

`nfc_card_events`

Eventos:

- `linked`
- `mounted`
- `fallback_used`
- `lost_enabled`
- `lost_disabled`
- `paused`
- `blocked`
- `resolved`

### Repositorio Frontend

La app usa:

`services/nfcCardsRepo.ts`

Responsabilidades:

- listar tarjetas NFC del usuario,
- listar destinos montables,
- vincular hardware con PIN,
- montar identidad,
- cambiar estado de tarjeta.

### Rutas de API Autenticadas

Implementación actual:

- `GET /api/nfc/cards`
- `GET /api/nfc/mount-options`
- `POST /api/nfc/cards/link`
- `POST /api/nfc/cards/:nfcCardId/mount`
- `PATCH /api/nfc/cards/:nfcCardId/status`

> Nota: aunque conceptualmente hablamos de `/api/nfc/bind` y `/api/nfc/mount`, la implementación actual usa rutas REST más específicas bajo `/api/nfc/cards/*`.

### Ruta Pública de Redirección

Implementación actual:

- `GET /n/:nfcCardId`

Esta ruta no requiere login ni API key. Debe ser rápida, pública y sin caché persistente.

Cabeceras:

- `Cache-Control: no-store, max-age=0`
- `Pragma: no-cache`
- `Expires: 0`

---

## 6. Terminología Oficial

- **Vincular:** proceso de reclamar la propiedad del hardware mediante `nfcCardId` + `activationPin`.
- **Montar:** acto de elegir qué identidad digital vive en la tarjeta física en ese momento.
- **Destino montado:** BusinessCard, SmartCard o URL pública activa.
- **Fallback:** destino de respaldo cuando el destino temporal expira.
- **Modo Perdida:** estado seguro que muestra una página de recuperación sin exponer el perfil completo.

---

## 7. Reglas No Negociables

- El chip NFC y el QR siempre deben apuntar a `/n/{nfcCardId}`.
- Nunca escribir directamente un perfil final en el chip.
- Nunca usar redirect `301`.
- SmartCards temporales requieren fallback obligatorio.
- Una tarjeta no reclamada requiere `activationPin`.
- Una tarjeta reclamada invalida su PIN para siempre.
- El modo **Perdida** debe mostrar solo el canal de recuperación elegido, no el perfil completo.

---

*Documento generado para Alfonso Barreto Saa — Card-Social Strategy 2026.*
