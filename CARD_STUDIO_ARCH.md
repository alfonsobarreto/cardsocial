# Card-Studio — Arquitectura técnica (expansive focus)

## 1. Ubicación en el monorepo

- **Aplicación web**: `frontend-web/` (Next.js App Router).
- **Ruta pública del estudio**: `/studio` (login + layout de columnas). No convive con el footer de tabs de la app Expo.
- **App móvil**: sin cambios obligatorios; la fuente de verdad de datos sigue en Firebase / servicios existentes. El estudio **consume** los mismos contratos cuando se implemente persistencia (Firestore `users/{uid}/links`, etc.).

## 2. Autenticación (Pantalla 0)

- **Firebase Auth** (mismo `projectId` / credenciales web que el cliente móvil, expuestas como configuración pública de Firebase en el JS SDK).
- Flujo: email + contraseña (scaffold). Extensiones futuras: OAuth, reset password, 2FA según app.
- Tras `onAuthStateChanged`, el shell muestra el layout de columnas. Sin sesión → solo formulario de login y marca Card-Social.

## 3. Sistema de enfoque dinámico (centrado)

**Estados de columnas visibles** (n = 1…3):

1. **Solo bóveda** (Vault): una columna centrada en el viewport.
2. **Bóveda + formulario** (“New Information”): dos columnas como grupo; el contenedor del grupo se centra horizontalmente.
3. **Bóveda + formulario + selector de iconos**: tres columnas; el grupo de tres se centra.

**Implementación**: contenedor flex horizontal con `justify-content: center` en el viewport; ancho fijo o máximo por columna (p. ej. 360–420px); `min-height: 100vh` con **scroll independiente** por columna (`overflow-y: auto` en el cuerpo de cada columna, cabecera `flex-shrink: 0`).

**Transiciones**: `transform` + `transition` en CSS (sin obligar Framer Motion en v1). Opcional: Framer Motion en fases posteriores.

**Miller**: las columnas **no se superponen**; se empujan de izquierda a derecha al abrir 2 y 3.

## 4. Componentes (modulares)

| Componente | Rol |
|------------|-----|
| `StudioShell` | Estado global de auth, locale, apertura de columnas, sign-out. |
| `StudioLogin` | Formulario de login y errores. |
| `VaultColumn` | Lista / búsqueda / contador; FAB `+` abre formulario. |
| `FormColumn` | Tipos de dato, nombre, data, drop zone, botón crear/cerrar. |
| `IconSelectorColumn` | Placeholder de biblioteca; “Change” en formulario abre columna. |

Cada columna es **independiente** y recibe callbacks del shell (abrir/cerrar, dirty state futuro).

## 5. Internacionalización

- Tipo de locale del estudio: `es` | `en` en fase 1.
- `?lang=es` | `?lang=en` y persistencia opcional en `localStorage` para repetir preferencia.
- Mapa de strings en `lib/studioI18n.ts` (o equivalente) con helper `t(key)` — preparado para añadir `it` | `fr` | `pt` sin reescribir UI.

## 6. Persistencia y sincronización (roadmap, no bloquea scaffold)

- **Tiempo real**: al usar las mismas colecciones Firestore y reglas que la app, `onSnapshot` en web puede reflejar cambios móviles. El scaffold **no** exige aún escucha en vivo; la primera iteración de datos puede ser lectura/escritura bajo demanda.
- **Guards de dirty state**: al cerrar formulario o volver a estado 1 con inputs pendientes, modal “Cambios sin guardar” (especificación al integrar formulario con datos reales).

## 7. Seguridad

- CORS y reglas de Firestore/Storage: mismas reglas que la app; el cliente web no introduce nuevos agujeros por sí solo, pero cualquier regla asumida “solo móvil” debe revisarse antes de producción pública.
- No almacenar contraseñas en `localStorage`; solo sesión gestionada por Firebase Auth.

## 8. Stack técnico (scaffold)

- Next.js 14, React 18, TypeScript.
- `firebase` (Auth; Firestore/Storage en iteraciones posteriores).
- Sin barra de navegación inferior; posible enlace a legal existente bajo `frontend-web/app/legal/*` de forma discreta si se requiere compliance.

## 9. Estado de implementación (scaffold)

- Ruta activa: **`/studio`** en `frontend-web` (Next.js App Router).
- **Login** con email/contraseña vía **Firebase Auth** (mismo proyecto que la app móvil).
- **Tres columnas** (Vault → Form “New Information” → Icon selector) con **centraje del grupo** y apertura/cierre; **modal de dirty state** al cerrar el formulario con cambios.
- **i18n**: ES/EN con toggle y `?lang=`; persistencia en `localStorage`.
- **Pendiente de iteraciones**: listado real de items Firestore, subida a Storage, icon library completa, y refuerzo de reglas/seguridad para tráfico web.

---

*Este documento es la base para PRs de Card-Studio. Los cambios de contrato o reglas de Firebase deben reflejarse aquí y en `CARD_STUDIO_VISION.md`.*
