# REGLA DE ORO — Smart Cards vs Business Cards

Documento canónico para **auditorías por fases** y cualquier feature que toque tarjetas. Léelo **antes** de implementar o revisar Contactos, Calls, Search, VoIP, QR o mercado.

---

## REGLA DE ORO (NO NEGOCIABLE)

### SMART CARDS (`cardType: 'smart'`)

- **= DATOS DE PERFIL** (y lo que la tarjeta personal enlaza: bóveda, facets, tema, etc.).
- **No hay un “registro” de identidad de persona aparte** fuera de perfil + espejos en `smart_cards` coherente con ese modelo.
- **NADA DE MIS BUSINESS CARDS:** ningún `bId`, `bcName`, `bcLogoUrl`, colección `business_cards`, ni lógica de marca negocio debe colarse en pantallas o payloads pensados **solo** para Smart.

### BUSINESS CARDS (`cardType: 'business'`, `bId`)

- **= DATOS DE ESE `bId` CREADOS EN / PARA ESA TARJETA** (documento de negocio: Mongo `business_cards`, Firestore, y espejo mínimo donde aplique).
- **En el frontend (vista receptor / presentación pública de negocio): NADA DE DATOS DE MI PERFIL** como sustituto de marca, logo, nombre comercial o contacto. Si falta un campo en la tarjeta de negocio, **no** rellenar con `userFullName`, `userAvatarUrl`, `userNickName`, etc.
- **No hay “registro” en frontend** que mezcle perfil personal con la UI de negocio: la verdad de lo que se muestra es **lo guardado en esa tarjeta de negocio**, no el perfil.

---

## Cómo usarla al retomar fases

- **Fase / pantalla Smart:** revisar que no se importe ni condicione por `business_cards` / `bId` salvo routing explícito (p. ej. navegación).
- **Fase / pantalla Business:** revisar que **cada** texto/avatar/logo venga de campos `bc*` / doc negocio / API que ya separó perfil; listar explícitamente prohibidos: `userAvatarUrl`, `userFullName` como fallback, `owner*` del espejo `smart_cards` para identidad de marca.

---

## Contratos detallados

| Documento | Rol |
|-----------|-----|
| `docs/CONTRACT_SMART_CARDS.md` | Perfil, `smart_cards`, `issuerSnapshot`, receptores |
| `docs/CONTRACT_BUSINESS_CARDS.md` | `bId`, `business_cards`, receptor, Calls, privacidad |

Ambos deben seguir esta **REGLA DE ORO** sin contradecirla.

---

## Tema visual (Chest) — sin confundir con “wallpaper”

- **`themeId`** es el identificador en catálogo (`constants/themeChest.ts`, tipo `CardTheme`).
- El **nombre legible del tema** es **`CardTheme.name`** (resolución: `getThemeById(themeId).name`). Ese es el único “nombre de estilo” que debe documentarse para el shell base.
- **Business Cards:** la superficie del modal/lista **no** usa capa premium de imagen de fondo: en API `GET /contacts/received` los campos `wallpaper*` van **anulados** para `cardType === 'business'`. El shell es **`themeId` → gradiente/colores del catálogo**.
- **Smart Cards:** pueden llevar campos `wallpaperId` / `wallpaperUrl` como capa opcional además del tema; sigue siendo distinto del **nombre** del tema (`CardTheme.name`).
