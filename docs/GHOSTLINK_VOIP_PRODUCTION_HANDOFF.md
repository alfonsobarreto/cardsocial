# Ghost-Link VoIP — Handoff producción (Azure / builds)

Documento de cierre técnico: refactor Agora, Fases 8–9 (hardware + PiP in-app), endurecimiento Android/iOS y configuración Expo. Usa este documento como referencia antes de `eas build` y pipelines Azure.

---

## 1. Anti-patrón React corregido (`useAgoraRtc.ts`)

- **Problema:** `toggleMute` / `toggleSpeakerphone` llamaban a la API nativa de Agora dentro del *updater* de `setState`.
- **Solución:** Updaters puros: `setIsMuted((prev) => !prev)` y `setIsSpeakerphoneOn((prev) => !prev)`.
- **Sincronización:** Los `useEffect` que dependen de `isMuted` / `isSpeakerphoneOn` son la **única** fuente que llama a `setGhostLinkAgoraMuted` / `setGhostLinkAgoraSpeaker`.

---

## 2. Fase 8 — Pinch-to-Zoom (cámara local)

| Capa | Archivo | Detalle |
|------|---------|---------|
| Motor | `services/ghostLinkAgoraSession.ts` | `setGhostLinkAgoraCameraZoom(factor)` — clamp con `engine.getCameraMaxZoomFactor()` cuando es válido (`> 1`); mínimo 1; devuelve el factor aplicado. |
| Hook | `services/voip/useAgoraRtc.ts` | Refs `localCameraZoomRef` + `pinchAnchorZoomRef`; `onLocalCameraPinchStart` ancla zoom; `applyLocalCameraPinchScale(relativeScale)` aplica `ancla * scale`. Reset al cortar sesión y al voltear cámara. Expone `setSpeakerphoneOn` para reglas de producto. |
| UI | `components/GhostLinkCallOverlay.tsx` | PiP local (`uid: 0`) envuelto en `GestureDetector(Gesture.Pinch())` con `runOnJS` hacia los callbacks del contexto. |

---

## 3. Fase 9 — Multitarea in-app (burbuja) y altavoz automático

| Elemento | Implementación |
|----------|----------------|
| Estado global | `services/GhostLinkCallProvider.tsx`: `isMinimized`, `minimizeCall`, `maximizeCall`; reset en `resetCall` y cuando `phase !== Active`. |
| Auto-speaker (audio minimizado) | Si `isMinimized && callType === 'audio' && phase === Active`: `setGhostLinkAgoraSpeaker(true)` + `setSpeakerphoneOn(true)` para alinear motor y UI. |
| UI fullscreen | Botón minimizar (chevron abajo) en videollamada activa, llamada de voz saliente/entrante activa. |
| Burbuja | `FloatingCallBubble`: audio → avatar + tiempo + nombre; video → `RtcSurfaceView` remoto pequeño + tiempo si hay vídeo; tap → `maximizeCall()`. |

### Trampa del `Modal` en Android (corregida)

- **Problema:** Burbuja dentro de `<Modal transparent>` crea una *Window* nativa que intercepta toques y el botón Atrás.
- **Solución:** Si `minimizedUi`, **no** se usa `Modal`: se devuelve un `<View style={[StyleSheet.absoluteFill, { zIndex: 9999 }, …]} pointerEvents="box-none">` con la burbuja. Pantalla completa sigue usando `<Modal>` opaco.

### Z-index / elevación Android

- Contenedor `minimizedUi`: además de `zIndex: 9999`, `elevation: 12` en Android para orden de capas respecto al resto de la UI.

---

## 4. Raíz de gestos (RNGH)

- **`app/_layout.tsx`:** `GestureHandlerRootView` con `style={{ flex: 1 }}` envuelve **toda** la app bajo `ErrorBoundary` (incl. pantalla de búnker), no solo el stack desbloqueado.
- Pinch y demás gestos de `react-native-gesture-handler` tienen así un ancestro válido en Android/iOS.

---

## 5. Permisos Android (`app.json`)

En `expo.android.permissions` se declaran, entre otros:

- `android.permission.READ_PHONE_STATE` — coordinación audio con llamadas GSM / estado telefonía (Agora / sistema).
- `android.permission.BLUETOOTH_CONNECT` — Android 12+ para salida audio por auriculares BT.

**Play Console:** justificar uso de `READ_PHONE_STATE` en política / declaración de permisos sensibles.

---

## 6. Expo — plugin `react-native-permissions`

- **Error:** `INVALID_PLUGIN_TYPE` al usar `"react-native-permissions"` como plugin (resolvía al `main` del paquete, no al config plugin).
- **Fix:** entrada en `plugins`: `"react-native-permissions/app.plugin.js"` con la config (p. ej. `iosPermissions`).

---

## 7. Montaje global del overlay

- `GhostLinkCallOverlay` se renderiza en `app/_layout.tsx` **dentro** de `GhostLinkCallProvider`, **hermano** del `Stack`, para no desmontarse al navegar.

---

## 8. Archivos tocados (referencia rápida)

- `app/_layout.tsx` — `GestureHandlerRootView` raíz.
- `app.json` — permisos Android, plugin permissions.
- `components/GhostLinkCallOverlay.tsx` — pinch, PiP, burbuja sin Modal, `elevation`.
- `services/GhostLinkCallProvider.tsx` — minimizado, auto-speaker, wiring pinch al hook.
- `services/ghostLinkAgoraSession.ts` — zoom cámara, teardown/join (sesión Agora).
- `services/voip/useAgoraRtc.ts` — hook Agora, toggles puros, zoom pinch, `setSpeakerphoneOn`.
- Otros módulos VoIP / backend / tema según el mismo branch (ver `git log` y diff).

---

## 9. Próximos pasos operativos

1. `npx expo prebuild --clean` (si aplica) y verificar `AndroidManifest.xml` tras plugins.
2. Probar en dispositivo físico: pinch zoom, minimizar burbuja, navegación + Atrás Android, BT + interrupción GSM.
3. EAS / pipeline Azure: mismas variables de entorno que backend (tokens Agora, API).
4. Contrato UI Smart/Business en VoIP: `docs/GHOSTLINK_VOIP_FLOW.md` y `docs/CONTRACT_SMART_CARDS.md`; en local `npm run audit:identity` + `npx tsc --noEmit`; en GitHub Actions el workflow **Identity audit and TypeScript** (en **todo** PR; push a `main`/`develop`; ejecución manual).

---

*Última actualización: handoff ingeniería core — listo para build producción.*
