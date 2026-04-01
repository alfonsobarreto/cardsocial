# Business Card Product Contract (ES/EN) - v1 Freeze

Last update: 2026-03-31  
Status: Approved for implementation

---

## 1) Scope / Alcance

### ES
Este documento congela las reglas funcionales y técnicas de `Business Card` en Card-Social.  
Todo lo aquí definido tiene prioridad para la implementación.

### EN
This document freezes the functional and technical rules for `Business Card` in Card-Social.  
Everything defined here is implementation source-of-truth.

---

## 2) Lifecycle states / Estados del ciclo de vida

`draft -> trial_active -> active_paid -> dull -> purged`

### ES
- `trial_active`: periodo gratis de 14 días.
- `active_paid`: contrato anual activo (365 días).
- `dull`: estado inactivo temporal (30 días) con visibilidad limitada.
- `purged`: borrado total e irreversible.

### EN
- `trial_active`: 14-day free trial.
- `active_paid`: active annual contract (365 days).
- `dull`: temporary inactive state (30 days) with limited visibility.
- `purged`: irreversible full deletion.

---

## 3) Trial policy / Política de trial

### ES
- Solo existe **1 trial por usuario** (estricto).
- El trial inicia al crear la primera Business Card.
- El usuario debe capturar método de pago para el flujo del trial.
- Si cancela durante trial: pasa a `dull` **inmediatamente** (con doble confirmación).
- Si no cancela: al finalizar trial se ejecuta el cobro anual y la tarjeta pasa a `active_paid`.

### EN
- Only **1 trial per user** (strict).
- Trial starts when creating the first Business Card.
- Payment method is required for trial flow.
- If user cancels during trial: card goes `dull` **immediately** (double confirmation).
- If user does not cancel: annual charge runs at trial end and card becomes `active_paid`.

---

## 4) Annual contract and autopay / Contrato anual y autopago

### ES
- El contrato anual es **por cada Business Card**.
- `autopay` se configura por tarjeta (no global).
- Si el usuario apaga autopago durante el año pagado:
  - mantiene beneficios hasta `expiresAt`,
  - al vencer pasa a `dull`.
- Si reactiva desde `dull`, se genera nuevo contrato de 365 días desde fecha/hora de reactivación.

### EN
- Annual contract is **per Business Card**.
- `autopay` is per-card (not global).
- If user turns off autopay during paid year:
  - benefits remain until `expiresAt`,
  - then card goes `dull`.
- If reactivated from `dull`, a new 365-day contract starts at reactivation date/time.

---

## 5) Dull mode / Modo Dull

### ES
- `dull` inicia:
  - cancelación en trial,
  - expiración anual sin renovación,
  - fallo de cobro al renovar.
- En `dull`:
  - la tarjeta sigue visible en "Mis Tarjetas" para su dueño,
  - vista previa en grande permitida pero en gris/borrosa,
  - QR no visible/legible (inactivo total),
  - no puede editar,
  - no recibe mensajes nuevos.
- Duración `dull`: 30 días.
- Si no reactiva dentro de 30 días: `purged`.

### EN
- `dull` starts on:
  - trial cancellation,
  - annual expiration without renewal,
  - failed renewal charge.
- In `dull`:
  - card remains visible in "My Cards" for owner,
  - large preview allowed but grayscale/blurred,
  - QR not readable/usable (fully inactive),
  - editing disabled,
  - no new messages are received.
- `dull` duration: 30 days.
- If not reactivated within 30 days: `purged`.

---

## 6) Purge policy / Política de purge

### ES
- Al cumplirse 30 días en `dull`, se elimina todo lo asociado a esa Business Card:
  - entidad de tarjeta,
  - QR y vínculo permanente,
  - logo y branding asociados,
  - condiciones y metadata de esa tarjeta,
  - assets adquiridos con créditos revocables de suscripción/trial para esa tarjeta.
- Si quiere una tarjeta nueva después del purge, debe crearla desde cero.

### EN
- After 30 days in `dull`, everything linked to that Business Card is removed:
  - card entity,
  - QR and permanent link,
  - linked logo/branding,
  - card-specific terms/metadata,
  - assets purchased with revocable subscription/trial credits for that card.
- If user wants a new card after purge, it must be created from scratch.

---

## 7) QR rules / Reglas de QR

### ES
- QR permanente en miniatura dentro de la tarjeta (2 cm x 2 cm).
- Swipe derecha muestra QR grande en modo atractivo.
- Actualización de link QR: máximo 1 vez cada 30 días.
- Mantener `lastQrUpdate` histórico (no se reinicia por reactivación).
- Si se intenta antes de 30 días:
  - botón deshabilitado,
  - mensaje "Podrás actualizar tu link permanente en X días",
  - opcional: abrir ticket soporte.

### EN
- Permanent QR shown as mini version in-card (2 cm x 2 cm).
- Right swipe reveals larger attractive QR.
- QR link update limited to once every 30 days.
- Keep `lastQrUpdate` history (not reset on reactivation).
- If attempted before 30 days:
  - button disabled,
  - message "You can update your permanent link in X days",
  - optional support ticket flow.

---

## 8) QR logo safety / Seguridad del logo en QR

### ES
- Logo central permitido solo si:
  - ocupa max 20% del area del QR,
  - QR usa Error Correction Level `H`,
  - logo cuadrado (o ajuste/crop a cuadrado),
  - peso/tamano de imagen controlado.

### EN
- Center logo is allowed only if:
  - max 20% of total QR area,
  - QR uses Error Correction Level `H`,
  - square logo (or auto-cropped square),
  - controlled file size/dimensions.

---

## 9) Identity/photo rules / Reglas de identidad/foto

### ES
- Free/Smart cards: usan solo avatar del perfil (sin upload custom).
- Business cards: permiten logo/foto custom con fallback al avatar.

### EN
- Free/Smart cards: profile avatar only (no custom upload).
- Business cards: custom logo/photo allowed with avatar fallback.

---

## 10) Keywords and moderation / Keywords y moderacion

### ES
- Maximo 20 keywords, separadas por coma.
- Componente `Tags` con validacion de limite.
- Keywords invisibles en UI publica.
- Keywords activas para ranking en Social Market.
- Filtro de palabras prohibidas (profanity/explicit/hate/gambling) en cliente y backend.

### EN
- Maximum 20 keywords, comma-separated.
- `Tags` component with hard limit validation.
- Keywords are invisible on public UI.
- Keywords remain active for Social Market ranking.
- Prohibited-word filter (profanity/explicit/hate/gambling) on client and backend.

---

## 11) Address privacy / Privacidad de direccion

### ES
- Direccion exacta obligatoria en creacion.
- Se convierte a lat/lng para ranking por cercania.
- UI publica solo muestra distancia aproximada o sector/barrio.
- Nunca mostrar calle/casa por defecto.

### EN
- Exact address is required at creation.
- Converted to lat/lng for proximity ranking.
- Public UI shows only approximate distance or area/neighborhood.
- Street/house number is never shown by default.

---

## 12) Credits policy / Politica de monedas CS

### ES
- Se separan fondos en dos bolsillos:
  - `credits_subscription_revocable` (trial/suscripcion),
  - `credits_iap_permanent` (compra real en app).
- Regla: **nunca mezclar** fuentes en una misma compra.
- Compras hechas con monedas permanentes no se tocan al cancelar.
- Si cancela en trial:
  - fondos revocables se congelan/revierten,
  - assets comprados con fondos revocables pasan a `dull` por 30 dias.
- Si reactiva dentro de 30 dias:
  - recupera assets `dull` y saldo revocable no consumido,
  - se suma el nuevo credito correspondiente al pago/activacion.
- Despues del trial, no recibe el mismo bono inicial nuevamente por esa tarjeta.

### EN
- Funds are split into two wallets:
  - `credits_subscription_revocable` (trial/subscription),
  - `credits_iap_permanent` (real in-app purchase).
- Rule: **never mix** sources in a single purchase.
- Purchases made with permanent credits are never affected by cancellation.
- If user cancels during trial:
  - revocable funds are frozen/reverted,
  - assets bought with revocable funds go `dull` for 30 days.
- If user reactivates within 30 days:
  - recovers `dull` assets and unused revocable balance,
  - receives new credit corresponding to payment/activation.
- After trial, initial trial bonus is not granted again for that card.

---

## 13) Payments quarantine / Cuarentena de pagos

### ES
- Se implementa la logica completa de pagos/suscripcion.
- Ejecucion real de cobros queda en cuarentena hasta fase final.
- Integracion final de cobro real sera ultimo paso.

### EN
- Full subscription/payment logic is implemented now.
- Real charge execution remains quarantined until final phase.
- Live payment activation is the final implementation step.

---

## 14) UI bilingual requirements / Requisito bilingue UI

### ES
- Toda etiqueta nueva de Business Card debe incluir texto ES/EN.

### EN
- Every new Business Card label must support ES/EN text.

---

## 15) Non-negotiable acceptance checklist / Checklist de aceptacion innegociable

- Trial unico por usuario.
- Autopago por tarjeta.
- Dull inmediato al cancelar trial.
- Dull = sin QR + sin edicion + sin mensajes.
- Ventana Dull de 30 dias.
- Purge total despues de 30 dias.
- `lastQrUpdate` persistente.
- QR con logo max 20% + ECL H.
- Keywords invisibles max 20 + profanity filter.
- Direccion privada; solo distancia/sector publico.
- Wallet dual de creditos sin mezcla.
- Pagos reales en cuarentena hasta fase final.

