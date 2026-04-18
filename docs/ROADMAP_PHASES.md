# Roadmap por fases (A–F) con **D** al inicio y **D** repetida tras **C**

Este documento fija el **orden** de trabajo y el **doble paso de auditoría**, para que los refactors (sobre todo tras cambios de datos) no acumulen variables y aliases sueltos. Las letras **A–F** son contenedores: el detalle de identidad y VoIP sigue en [Fase D — Reglas de identidad](./IDENTITY_PHASE_D_AUDIT.md) y en [Regla de oro Smart vs Business](./GOLDEN_RULE_SMART_VS_BUSINESS.md).

## Orden obligatorio

```text
D₁  →  A  →  B  →  C  →  D₂  →  E  →  F
 ↑                          ↑
 primera auditoría          re-auditoría tras cambios que suelen multiplicar variables
```

| Fase | Nombre corto | Qué es (en este repo) |
|------|----------------|----------------------|
| **D₁** | Auditoría inicial | Reglas canónicas, `npm run audit:identity`, `npx tsc --noEmit`, revisión de contratos. **Antes** de abrir mucho código nuevo. |
| **A** | Base / inventario modelo | [PHASE_A_CARDS_INVENTORY.md](./PHASE_A_CARDS_INVENTORY.md): emisor `cards.tsx`, persistencia (`smart_cards`, AsyncStorage), `SmartCardPayload`, bóveda, business mirror. |
| **B** | Consumidores | [PHASE_B_CONSUMERS.md](./PHASE_B_CONSUMERS.md): contactos, búsqueda, stories, **calls**, scan, Ghost-Link / `outgoingCallUiMirror`, web universal. |
| **C** | Datos / API / payloads | Backend `backend/src/routes/qrRoutes.js` (y rutas QR relacionadas), Mongo, dual-write o aliases en REST público; ver *Huecos y riesgos* en fase B. **Aquí suelen multiplicarse variables.** |
| **D₂** | Re-auditoría post‑C | Igual que D₁ + revisar diff de C: espejos únicos (`OutgoingCallUiMirror`, `deriveCallFace`, `incomingCardPreviewPayload`), sin nuevos `userAvatarUrl \|\| ownerPhotoUrl` para persona. |
| **E** | Cierre técnico / QA | Dispositivo real: VoIP ([GHOSTLINK_VOIP_FLOW.md](./GHOSTLINK_VOIP_FLOW.md)), pinch/burbuja, Atrás Android, BT/GSM ([GHOSTLINK_VOIP_PRODUCTION_HANDOFF.md](./GHOSTLINK_VOIP_PRODUCTION_HANDOFF.md)); `expo prebuild`/EAS según toque el cambio. |
| **F** | Entrega | Deploy API (Azure), variables Agora/API, docs finales: [GHOSTLINK_VOIP_PRODUCTION_HANDOFF.md](./GHOSTLINK_VOIP_PRODUCTION_HANDOFF.md), contratos [CONTRACT_SMART_CARDS.md](./CONTRACT_SMART_CARDS.md) / [CONTRACT_BUSINESS_CARDS.md](./CONTRACT_BUSINESS_CARDS.md). |

### Detalle por fase (card-social)

- **A** no es “opcional”: es el mapa de **dónde vive cada dato** antes de renombrar campos en B o C. Si solo tocás un consumidor, igual conviene contrastar la tabla de fase A.
- **B** alinea **pantallas que leen** los mismos contratos; VoIP y llamadas comparten `services/outgoingCallUiMirror.ts` y `GhostLinkCallOverlay.tsx` — evitar duplicar allí otra capa de nombres.
- **C** incluye **frontend-web** si el contrato público (`/api/public/universal-card`, tipos en `frontend-web/lib/universalCardTypes.ts`) cambia en paralelo al móvil.
- **E** puede incluir **frontend-web** build (`frontend-web`) si el PR tocó web.
- **F** incluye pipeline **Build and deploy** del backend en `.github/workflows/main_card-social-api.yml` cuando sube API.

## Por qué **D₂** después de **C**

La fase **C** tiende a añadir **muchos nombres** para el mismo concepto (`peer*` vs `user*` vs snapshots). El segundo **D** no es opcional: es el momento de **detectar** (audit + revisión humana) y **recortar** variables antes de seguir a E/F.

## Checklist mínima **D** (D₁ y D₂)

1. `npm run audit:identity` (script: `scripts/audit-identity-phase-d.mjs`).
2. `npx tsc --noEmit` en la raíz del monorepo app.
3. Revisar el diff de **C**: símbolos nuevos; ¿ya existe un campo en el [contrato](./CONTRACT_SMART_CARDS.md) / [Business](./CONTRACT_BUSINESS_CARDS.md)?
4. Buscar patrones frágiles descritos en [IDENTITY_PHASE_D_AUDIT.md](./IDENTITY_PHASE_D_AUDIT.md) (p. ej. `userAvatarUrl \|\| ownerPhotoUrl` para persona).

## CI

El workflow **Identity audit and TypeScript** (`.github/workflows/identity-audit.yml`) ejecuta el audit y TypeScript en PRs y en push a `main`/`develop`; no sustituye la revisión humana de **D₂**.

## Variantes por carpeta

Si un cambio es **solo app**, puedes acortar A→B y saltar C; si es **solo backend**, C es el grueso y B solo afecta consumidores que lean la nueva forma (actualizar tipos en `services/qrApi.ts` / web). El esqueleto **D₁ → … → C → D₂** sigue aplicando cuando **C** toca payloads o Mongo: no omitas **D₂**.
