# Card-Social — UI/UX Localization Master Plan

**Purpose:** Single source of truth for expanding app copy to **four languages**: English (default fallback), Spanish, French, and Italian.  
**Scope:** User-visible strings only (no code changes in this document).  
**As-of:** Repository snapshot used for line-number references below; line numbers may drift after edits.

**Legend — Current system**

| Tag | Meaning |
|-----|---------|
| `tr(es, en)` | Inline bilingual helper tied to `useLanguage()` (`language === 'en' ? en : es`). |
| `t('key')` | `react-i18next` / `useTranslation()` — keys from `locales/*.json`. **Not synced** with the header language toggle today. |
| **Hardcoded** | Single-language string or OS/API text not routed through `tr` or `t`. |
| **Blind spot** | Mixed or inconsistent behavior (e.g. Spanish-only prop, server message, or `tr(title, title)` with one language). |

---

## Cross-cutting architecture (audit context)

| Mechanism | Location | Notes for FR/IT |
|-----------|----------|-----------------|
| `LanguageProvider` | `services/language.tsx` | Persists `en` \| `es` only today; FR/IT will need resource bundles + resolution rules. |
| `i18n` bootstrap | `i18n.ts` | Initializes `i18next` with `lng: 'es'`; components using `t()` do not follow the header toggle until unified. |
| `FilePreviewModal` / `CircularPhotoCropper` | `app/components/FilePreviewModal.tsx`, `app/components/CircularPhotoCropper.tsx` | Use `t('…')` keys listed in `locales/en.json` (English-centric keys). |
| **Shared blind spot** | `services/GhostLinkCallProvider.tsx` ~L977 | Fallback string `'Tarjeta Social'` is **not** passed through `tr` (Spanish-only in code path). |

**Proposed shared namespaces (prefix all keys):** `common.*`, `calls.*`, `ghostlink.*`, `menu.*`, `settings.*`, `profile.*`, `contacts.*`, `search.*`, `market.*`, `stories.*`, `vault.*`, `cards.*`, `register.*`, `alerts.*`.

---

## 1. Calls & Ghostlink (lowest text load — pitch priority)

*Rough string count: ~15 (`calls.tsx`) + ~50 (`GhostLinkCallOverlay` + provider + consent hook).*

### 1.1 `app/(tabs)/calls.tsx`

| Lines | Current system | ES / EN (today) | Proposed key(s) | UI constraint |
|-------|----------------|-----------------|-----------------|---------------|
| 79–82 | `tr` | Saliente / Outgoing; Perdida / Missed; Entrante / Incoming | `calls.direction.outgoing`, `.missed`, `.incoming` | Short pills; FR/IT may need smaller font or wider chip. |
| 113, 159, 185 | `tr` | Negocio / Business; Smart Card | `calls.badge.business`, `calls.badge.smartCard` | Same. |
| 494 | `tr` + `error?.message` | No se pudo cargar Calls / Could not load Calls; Intenta de nuevo. / Try again. | `calls.error.loadFailed`, `common.tryAgain` | Alert width OK; server `error.message` may stay EN-only. |
| 533, 564, 575 | `tr` | Tarjeta Social / Social Card; Negocio / Business | `common.socialCardFallback`, `calls.fallback.business` | List row subtitles. |
| 659 | `tr` | · Vídeo / · Video | `calls.label.videoSuffix` | Small suffix next to title. |
| 684, 696 | `tr` | Videollamada / Video call; Llamada de voz / Voice call | `calls.a11y.videoCall`, `calls.a11y.voiceCall` | Accessibility only. |
| 740 | `tr` | Aun no hay llamadas registradas. / No calls registered yet. | `calls.empty` | Full-width empty state — OK for longer FR/IT. |
| 748 | `tr` | Cerrar / Close | `common.close` | Icon button. |

### 1.2 `components/GhostLinkCallOverlay.tsx`

| Lines | Current system | ES / EN (today) | Proposed key(s) | UI constraint |
|-------|----------------|-----------------|-----------------|---------------|
| 189, 229 | `tr` | Minimizar llamada / Minimize call; Volver a la llamada / Return to call | `ghostlink.a11y.minimize`, `ghostlink.a11y.return` | Small header icons. |
| 492–903 | `tr` (many) | Privacidad total / Total Privacy; Llamada de voz / Voice Call; FaceCall (brand); Cancelar / Cancel; Enlace exclusivo / Exclusive Link; Llamando… / Calling…; En llamada / On call; Silencio / Mute; Altavoz / Speaker; Cámara / Camera; Colgar / End Call; Incoming Video/Call…; Desde tu tarjeta / From your card; ACEPTAR / ACCEPT; RECHAZAR / DECLINE; Esperando video… / Waiting for video…; Cámara apagada / Camera off; Voltear / Flip; Llamada rechazada / Call declined; Tarjeta silenciada — no se puede llamar / Card muted — cannot call; Error de conexión / Connection error; Llamada finalizada / Call ended | `ghostlink.*` (mirror semantic names: `confirm.title`, `callStatus.*`, `controls.*`, `incoming.*`, `ended.*`) | **Pill buttons** (Mute, Speaker, Camera): FR/Italian often 30–50% longer — prefer icons + `numberOfLines={1}` or min width. |
| Brand | literal | FaceCall | `ghostlink.brand.faceCall` | Keep as product name or localize consistently. |

### 1.3 `services/GhostLinkCallProvider.tsx`

| Lines | Current system | ES / EN (today) | Proposed key(s) | UI constraint |
|-------|----------------|-----------------|-----------------|---------------|
| 937–944 | `tr` (Toast) | Permisos necesarios / Permissions required; mic+camera / mic-only variants for placing call | `ghostlink.toast.permissionsTitle`, `ghostlink.toast.enableMicCamera`, `ghostlink.toast.enableMic` | Toast two lines — OK. |
| 1032–1039 | `tr` | Same for answering; join video call variant | `ghostlink.toast.enableMicCameraAnswer`, `ghostlink.toast.enableMicAnswer` | Same. |
| ~977 | **Hardcoded** | `'Tarjeta Social'` (no `tr`) | `common.socialCardFallback` | Fix when localizing (blind spot). |

### 1.4 `hooks/useGhostLinkCameraConsent.ts`

| Lines | Current system | ES / EN (today) | Proposed key(s) | UI constraint |
|-------|----------------|-----------------|-----------------|---------------|
| 66–71 | `tr` (Alert) | Videollamada / Video call; consent body | `ghostlink.cameraConsent.title`, `ghostlink.cameraConsent.body` | Native alert — long FR/IT OK. |
| 74–85 | `tr` | Denegar / Deny; Aceptar / Allow | `common.deny`, `common.allow` | — |
| 92–96 | `tr` (Toast) | Permisos / Permissions; Se necesita permiso de cámara. / Camera permission is required. | `common.permissions`, `ghostlink.toast.cameraRequired` | — |
| 121–124 | `tr` | Cámara / Camera; contacto rechazó videollamada / contact declined video | `ghostlink.camera.deniedTitle`, `ghostlink.camera.deniedBody` | — |
| 157–161 | `tr` | Llamada / Call; Espera a que la llamada esté conectada. / Wait until… | `ghostlink.video.waitConnectedTitle`, `ghostlink.video.waitConnectedBody` | — |
| 183–187 | `tr` | Videollamada / Video; Esperando respuesta del contacto… / Waiting for your contact… | `ghostlink.video.waitingPeerTitle`, `ghostlink.video.waitingPeerBody` | — |

---

## 2. Menu, Settings & My Profile (medium load)

### 2.1 `app/(tabs)/_layout.tsx` — drawer, tabs, legal blurbs, profile modal

**Current system:** Predominantly `tr(es, en)` (~120 `tr(` occurrences in this file). Large blocks of **legal / policy** copy are arrays of `tr` lines (~219–299, ~702+).

| Lines (representative) | ES / EN (today) | Proposed key namespace | UI constraint |
|------------------------|-----------------|------------------------|---------------|
| 219–228 | Panel titles: Perfil, Términos, Política de Uso, Acerca de, Privacidad, Suscripción, Estudio de Tarjetas, Locker de Estilos, Gestión de Relaciones, Menú | `menu.panel.*` | Modal title — allow 2 lines on small phones. |
| 234–254 | Long legal bullets (vault, external links, abuse, AI moderation, mission) | `legal.terms.*`, `legal.policy.*`, `legal.about.*` | **Scroll text** — FR/IT fine; avoid fixed height. |
| 285–286 | GPS permission messaging | `menu.gps.*` | Alert. |
| 334–351 | Restaurar usuario / Restore user dialog | `menu.blocked.restoreTitle`, `menu.blocked.restoreBody`, `common.restore` | — |
| 434–538 | Profile save / nickname errors | `profile.errors.*` | Alerts. |
| 627–637 | Bloqueado: date formatting | `relationships.blockedDate` + interpolation | Narrow column — short template. |
| 703–812 | Tab bar: Bóveda, Tarjetas, Contactos, Mercado (MS), Historias, Llamadas | `tabs.vault`, `tabs.cards`, `tabs.contacts`, `tabs.market`, `tabs.stories`, `tabs.calls` | **Tab labels:** “Mercado” → “MS” in EN — FR/IT need short labels or icon-only. |
| 859–1074 | Drawer: Cuenta, Suscripción, Estudio, Locker, Configuración, legal links, Apariencia Día/Noche, Cerrar Sesión, Política de Privacidad, Descarga de datos, Eliminar cuenta | `menu.drawer.*`, `menu.appearance.*` | List rows — OK for longer strings with `numberOfLines`. |
| 1052–1062 | Appearance helper uses keys `tr('auto_gps', …)` matching **i18n** keys | Mixed: duplicates `locales/en.json` keys | Unify under `appearance.status.*` (see §8). |
| 1205–1231 | Relationship tabs: Silenciados / Muted; Restringidos / Restricted; Bloqueados / Blocked | `relationships.tabs.*` | Three equal columns — **risk of truncation** in FR/IT. |
| 1251–1254 | Empty state for relationship list | `relationships.empty.*` | Centered paragraph. |
| 1284 | Restaurar / Restore | `common.restore` | Small button in row. |
| 1308 | Volver al menú / Back to menu | `menu.backToMenu` | Full-width secondary. |
| 1330–1368 | Profile modal labels | `profile.modal.*` | Form labels. |

### 2.2 `app/settings.tsx`

| Lines | Current system | ES / EN (today) | Proposed key(s) | UI constraint |
|-------|----------------|-----------------|-----------------|---------------|
| 178–183 | **Hardcoded** (support mail error) | `'Error'`, `'No se encontró una aplicación de correo…'` (Spanish-only body) | `settings.support.noMailAppTitle`, `settings.support.noMailAppBody` | Alert — blind spot. |
| 188–197 | `tr` | ¿Limpiar caché? / Clear Cache?; long explanation; Cancelar; Limpiar y salir / Clear & Sign out | `settings.cache.confirmTitle`, `settings.cache.confirmBody`, `settings.cache.clearSignOut` | Destructive — ensure button width. |
| 230–233 | Partially hardcoded title `'Error'` | Could not sign out message uses `tr` | `common.error` + `settings.signOutError` | — |

### 2.3 `app/(tabs)/myprofile.tsx`

**Current system:** `tr` throughout (~89 occurrences).

| Lines (representative) | Notes | Proposed keys | UI constraint |
|------------------------|-------|---------------|---------------|
| 243 | `Alert` fallback `e?.message \|\| 'No se pudo cargar el perfil.'` | **Hardcoded Spanish** if no `e.message` | `profile.error.loadFailed` | Blind spot. |
| 251–618 | Delete account, photo picker, permissions, name/nickname/password flows | `profile.*` | Standard alerts. |
| 639–1067 | Screen copy: Mi Perfil, Verificado, Tarjetas, Contactos, Créditos CS, Bio, form labels, Danger Zone | `profile.screen.*` | Long labels (e.g. “Cambiar contraseña”) — check **narrow columns** on small devices. |

---

## 3. Contacts & Search

### 3.1 `app/(tabs)/contacts.tsx`

**Current system:** `useCallback` + `tr` (~48 occurrences).

| Lines | ES / EN (today) | Proposed key(s) | UI constraint |
|-------|-----------------|-----------------|---------------|
| 506 | Tarjeta Social / Social Card | `common.socialCardFallback` | Inline fallback. |
| 825–943 | Toasts & alerts: Tarjeta quitada, block, mute channel, etc. | `contacts.toast.*`, `contacts.errors.*` | — |
| 992 | Mis Contactos / My Contacts | `contacts.title` | Header. |
| 1040–1055 | Empty states, no matches | `contacts.empty.*` | Multiline. |
| 1121–1182 | Row actions: Silenciar, Bloquear, Eliminar, Silenciado | `contacts.actions.*` | **Swipe labels** — short in IT/FR or icon. |
| 1405–1440 | Search placeholder, sort options | `contacts.search.*`, `contacts.sort.*` | Placeholder long in FR — use smaller font or scroll. |
| 1480–1718 | Sheet actions, block user | `contacts.sheet.*` | Bottom sheet. |

### 3.2 `app/(tabs)/search.tsx`

**Current system:** `tr` (~47 occurrences).

| Lines | ES / EN (today) | Proposed key(s) | UI constraint |
|-------|-----------------|-----------------|---------------|
| 102–151 | Errors, placeholder “Nails, Hair…”, IR / GO, clear | `market.search.*`, `market.go` | **GO button** — single word OK; FR “ALLER” still short. |
| 272, 420–426 | Tarjeta Social fallback; Conocidos primero; Mercado Social | `market.mode.contactsFirst`, `market.title` | Headers. |
| 535–536 | Search failure (multi-line `tr`) | `market.error.searchFailed` | Alert. |
| 638–724 | Filters, sort, results count, QR export | `market.*` | Chips — watch overflow. |
| 765–767 | Story unavailable | `market.story.unavailableTitle`, `market.story.unavailableBody` | Alert. |
| 1317–1332 | Empty / prompt copy | `market.empty.*` | — |

---

## 4. Social Market (hub: discovery, commerce, stories monetization)

*This audit groups **market-facing** surfaces: Search tab market UI (§3.2), **Stories** tab, **Icon Store**, **Subscription**, **Theme Chest**.*

### 4.1 `app/(tabs)/stories.tsx`

**Current system:** `tr` (**high count**, ~130+ lines with `tr`).

**Representative groups:**

| Line range | Content summary | Proposed namespace |
|------------|-----------------|-------------------|
| 693–718 | No cards / no icons alerts; navigation to My Cards | `stories.onboarding.*` |
| 961–1304 | Permissions, validation, publish flow, VIP, credits | `stories.publish.*`, `stories.errors.*` |
| 1191–1214 | CTA type labels; business license gating | `stories.cta.*`, `stories.paywall.*` |
| 1666–1779 | Hub title, empty list, dev/simulation rows (if shipped) | `stories.hub.*` |
| 1804–2126 | Create-story wizard: steps, pickers, VIP tiers, Publish | `stories.wizard.*` |

**UI constraint:** Story creation modal uses **dense button grids** (Foto galeria, etc.) — FR/IT will need abbreviated labels or two-line buttons.

### 4.2 `components/IconStore.tsx`

| Lines | ES / EN (today) | Proposed key(s) | UI constraint |
|-------|-----------------|-----------------|---------------|
| 245–410 | Loading, header “Estudio de Tarjetas”, drops copy, empty state, tips | `iconStore.*` | Header two lines — OK. |
| 359+ | Pack rows (grep truncated) | `iconStore.pack.*` | Price row. |

### 4.3 `components/Subscription.tsx`

| Lines | ES / EN (today) | Proposed key(s) | UI constraint |
|-------|-----------------|-----------------|---------------|
| 78–326 | Purchase success/errors, comparison table, credit packs, business card pitch, legal bullets, Restore Purchases | `subscription.*` | **Table layout:** FR/IT longer words — use flexible row height. |

### 4.4 `components/ThemeChest.tsx`

| Lines | ES / EN (today) | Proposed key(s) | UI constraint |
|-------|-----------------|-----------------|---------------|
| 74–310 | Theme locked dialog, applied toast, Locker title, Forge placeholder, tier labels, reviews | `themeChest.*` | Card previews — short subtitles. |

---

## 5. Vault & folder management

### 5.1 `app/(tabs)/vault.tsx`

**Current system:** `tr` (~54 occurrences) + **badge** data `tr(badge.label, badge.labelEn)` at ~1313.

| Lines | ES / EN (today) | Proposed key(s) | UI constraint |
|-------|-----------------|-----------------|---------------|
| 173–375 | Offline toasts, protected folder, delete/favorite | `vault.sync.*`, `vault.folder.*` |
| 460–681 | Email/PDF/Ghost-Link alerts | `vault.open.*`, `vault.ghostlink.*` |
| 1313 | Type badges from data | Move to i18n `vault.types.*` or keep data-driven locale fields | Small pill. |
| 1370–1763 | Empty state, search, download, context menu, copy | `vault.ui.*` | FAB + search bar. |

### 5.2 `app/components/CardStudioVault.tsx`

| Lines | ES / EN (today) | Proposed key(s) | UI constraint |
|-------|-----------------|-----------------|---------------|
| 548–1033 | Unlock icon, purchase errors, delete icon, balance lines | `cardStudio.*` | Modal + grid. |

### 5.3 `components/VaultDocumentViewerModal.tsx`

| Lines | ES / EN (today) | Proposed key(s) | UI constraint |
|-------|-----------------|-----------------|---------------|
| 174–309 | Save/download dialogs, PDF errors | `vault.viewer.*` | Footer buttons. |

---

## 6. Cards tab & registration (highest load)

### 6.1 `app/(tabs)/cards.tsx`

**Current system:** `tr` (**~90+ call sites** in grep snapshot; file is very large).

**Grouped inventory (see line refs in repo):**

| Topic | Lines (approx.) | ES / EN themes | Proposed keys |
|-------|-----------------|----------------|---------------|
| Session / validation errors | 1166–1722 | Generic errors | `cards.errors.*` |
| QR issue (dev checklist in message!) | 1792–1796 | Long diagnostic string | `cards.qr.errorNetwork`, `cards.qr.errorGeneric` | 
| QR create / universal 24h | 1829–1952, 2057–2065 | Create QR dialogs; sync toasts | `cards.qr.*` |
| Business delete / purchase | 2088–2190 | | `cards.business.*` |
| Reorder mode | 2343–2351, 3383–3402 | Banner + buttons | `cards.reorder.*` |
| Ghost-Link / open URL alerts | 2570–2600 | | `cards.dataActions.*` |
| Swipe actions (both card types) | 2742–2994 | Edit, Silence, Favorite, Delete | `cards.swipe.*` |
| Header / empty / search | 3342–3538 | Mis Tarjetas, business CTA, placeholders | `cards.header.*`, `cards.empty.*`, `cards.search.*` |

**UI constraints:** Reorder banner holds **two buttons + sentence** — highest risk for FR/IT width; swipe actions are **narrow vertical labels**.

### 6.2 `app/register.tsx`

**Current system:** Mostly `tr` (~110 occurrences) + **known blind spots** on `LuxuryModerationModal` (see §7).

**Grouped:**

| Lines | Content | Proposed keys |
|-------|---------|---------------|
| 142–145 | Legal/social helper (multi-line) | `register.intro.*` |
| 200–1020 | Validation, permissions, alerts, API errors | `register.validation.*`, `register.alerts.*` |
| 1048–1313 | Form labels, placeholders, buttons | `register.form.*` |
| 1386–1395 | Luxury modal props | See §7 |

### 6.3 `app/components/NewInfoForm.tsx` & `app/components/LuxuryModerationModal.tsx`

- **`NewInfoForm.tsx`:** Uses `tr` for modal `title` and moderation messages (aligned with language).
- **`LuxuryModerationModal.tsx`:** Default title `'Acceso Premium Protegido'`; body is **`message` prop** (not translated inside modal). Buttons use `tr`.

---

## 7. Special audit — Alerts & server messages (“stuck” or mixed language)

| Source | Lines | Issue | ES / EN today | Proposed action |
|--------|-------|-------|---------------|-----------------|
| `register.tsx` | 408–410 | `setModerationAlertMessage` uses **Spanish-only** literal | Parece que tu sonrisa… | Use same `tr` as `NewInfoForm` + key `register.moderation.retrySmile` |
| `register.tsx` | 1386–1388 | `title="Exclusividad de Seguridad"` (Spanish only) | Fixed ES | `title={tr('…','…')}` or key `register.moderation.title` |
| `LuxuryModerationModal.tsx` | 29, 55–56 | Default title ES; `tr(title, title)` duplicates single-language title; `message` raw | Mixed | Pass **resolved** strings from parent or use i18n keys inside modal |
| `settings.tsx` | 182 | Mail error alert | Spanish-only body | `settings.support.noMailAppBody` |
| `settings.tsx` | 230–231 | Title `'Error'` hardcoded | EN word | `common.error` |
| `myprofile.tsx` | 243 | Fallback profile load | `'No se pudo cargar el perfil.'` ES only | `profile.error.loadFailed` |
| `myprofile.tsx` | 576 | Password save error fallback | `'No se pudo guardar.'` ES only | `profile.error.saveFailed` |
| `cards.tsx` / APIs | various | `Alert.alert(..., error?.message)` | Server-dependent | Document which endpoints return locale; fallback EN |
| `GhostLinkCallProvider.tsx` | ~977 | Smart card name fallback | `'Tarjeta Social'` | `common.socialCardFallback` |

---

## 8. `t('key')` inventory (react-i18next — separate from `tr`)

| File | Keys (from `locales/en.json` + usage) | FR/IT note |
|------|----------------------------------------|------------|
| `app/components/FilePreviewModal.tsx` | `preview_*`, upload pipeline strings | Extend `fr.json` / `it.json` when unified. |
| `app/components/CircularPhotoCropper.tsx` | `crop_*` | Short UI on crop overlay. |
| Root `locales/en.json` | Also `auto_*`, `manual_*`, `icon_store`, `vault_store` | Duplicated conceptually with `_layout.tsx` `tr('auto_gps',…)` — **merge keys** to avoid double maintenance. |

---

## 9. Implementation checklist (for later — not code now)

1. Add `fr`, `it` resource files; keep **English** as `fallbackLng`.  
2. Replace `tr(es, en)` with `t('namespace:key')` incrementally; extract **shared** strings (`common.cancel`, etc.) once.  
3. Sync `i18n.changeLanguage` with `LanguageProvider` OR remove duplicate `t()` usage.  
4. Fix **§7 blind spots** so FR/IT never read Spanish-only literals.  
5. QA **tab bar**, **swipe actions**, and **relationship tabs** with longest FR/IT glossaries.

---

## 10. Appendix — approximate `tr(` density by file (for translation workload)

| File | Approx. `tr(` sites |
|------|---------------------|
| `app/(tabs)/cards.tsx` | ~90+ |
| `app/(tabs)/_layout.tsx` | ~120 |
| `app/components/NewInfoForm.tsx` | ~121 |
| `app/register.tsx` | ~110 |
| `app/(tabs)/createBusinessCard.tsx` | ~105 (not expanded above — same pattern) |
| `app/(tabs)/stories.tsx` | ~130+ |
| `app/(tabs)/myprofile.tsx` | ~89 |
| `app/(tabs)/vault.tsx` | ~54 |
| `app/(tabs)/search.tsx` | ~47 |
| `app/(tabs)/contacts.tsx` | ~48 |
| `components/GhostLinkCallOverlay.tsx` | ~37 |
| `components/Subscription.tsx` | ~44 |
| `components/IconStore.tsx` | ~15+ |
| `app/(tabs)/calls.tsx` | ~15 |

---

*End of `localization_master_plan.md` — ready for collaborative key naming and FR/IT translation passes.*
