# Manual de Uso Admin (The Mint)

Este documento resume como usar el panel admin y que permisos tiene cada modulo en Card Social.

## 1) Acceso al Admin

### Requisitos obligatorios
- Usuario autenticado.
- Rol en Firestore: `super_admin`.
- Biometria obligatoria (Face ID / Huella).

### Flujo de validacion
1. Se obtiene el usuario activo.
2. Se valida rol `super_admin`.
3. Se pide validacion biometrica.
4. Si algo falla, se bloquea acceso y redirige al home.

### Archivo de referencia
- `app/admin/dashboard.tsx`
- `services/adminAuthGuard.ts`
- `services/roleService.ts`

## 2) Rutas Admin Disponibles

- `/admin/dashboard`  -> Landing principal (The Mint)
- `/admin/mint`       -> Generacion y control de QR gifts
- `/admin/stats`      -> Estadisticas de usuarios, coins y students
- `/admin/moderation` -> Reportes, revisiones y baneo
- `/admin/studio`     -> Uploaders de iconos, wallpapers y fuentes
- `/admin/config`     -> Broadcast, feature flags y lectura de limites

### Archivo de referencia
- `app/admin/_layout.tsx`

## 3) Permisos por Modulo

## MINT
Permite:
- Generar QR gifts.
- Ver historial de QRs emitidos.
- Ver auditoria de emisiones.

Impacta:
- Lectura de historial/auditoria desde servicios de QR.

Archivo:
- `app/admin/mint.tsx`

## ESTADISTICAS
Permite:
- Consultar distribucion de usuarios (total, premium, business, vacias).
- Ver metricas de CS Coins (mes, ano, historico).
- Auditar grants de Student Pack.
- Ver inventario de servicios/costos operativos (vista informativa).

Impacta:
- Lectura de `users`, `businessCards`, historial QR y auditoria Student Pack.

Archivo:
- `app/admin/stats.tsx`

## SOPORTE / MODERACION
Permite:
- Listar reportes por estado: `pending`, `reviewed`, `dismissed`.
- Marcar reporte como revisado.
- Desestimar reporte.
- Banear usuario reportado.

Impacta:
- Escritura en `reports/{id}`: status y reviewedAt.
- Escritura en `users/{reportedUserId}`: `isBanned`, `bannedAt`, `banReason`.

Archivo:
- `app/admin/moderation.tsx`

## CARD-STUDIO
Permite:
- Subir/administrar iconos (admin uploader).
- Subir/administrar wallpapers.
- Subir/administrar fuentes.

Impacta:
- Depende de uploaders admin (assets para tienda/estudio).

Archivo:
- `app/admin/studio.tsx`

## SYS CONFIG
Permite:
- Ver limites Free Tier (solo lectura en panel).
- Activar/desactivar broadcast global y editar mensaje.
- Activar/desactivar feature flags:
  - `studentPackEnabled`
  - `businessCardEnabled`
  - `iconStoreEnabled`
  - `maintenanceMode`

Impacta:
- Escritura en `system_config/main`:
  - `broadcast`
  - `featureFlags`

Archivo:
- `app/admin/config.tsx`

## 4) Politica de Limites (Free Tier)

Los limites base se leen desde codigo, no desde switches admin:
- Social Cards: 30
- Vault Items: 50

Fuente de verdad:
- `constants/freeTierPolicy.ts`

Nota:
- El panel solo los muestra. Para cambiarlos, se modifica codigo y se despliega.

## 5) Roles y Alcance

## Rol `super_admin`
- Acceso completo al panel admin y sus modulos.

## Rol `admin`
- Existe en tipos, pero las pantallas admin actuales validan especificamente `super_admin`.
- Si se quiere habilitar acceso parcial para `admin`, hay que ajustar guards por pantalla.

## 6) Colecciones Firestore tocadas por Admin

Lectura:
- `users`
- `businessCards`
- `reports`
- `system_config/main`

Escritura:
- `reports/{id}`
- `users/{uid}` (ban)
- `system_config/main`

## 7) Buenas Practicas Operativas

- Nunca activar `maintenanceMode` sin aviso previo en broadcast.
- Antes de banear, revisar razon, evidencia y usuario reportado.
- Mantener mensajes de broadcast cortos y con fecha/hora.
- Validar en app movil despues de cambiar flags criticos.

## 8) Troubleshooting Rapido

## Error: "The query requires an index"
- Causa tipica: consultas compuestas con filtros incompatibles.
- Accion: simplificar query y filtrar en cliente, o crear indice en Firebase.

## Error: "Property 'Vibration' doesn't exist"
- Causa: uso de Vibration sin import o API no disponible.
- Accion: usar `expo-haptics` para feedback tactil.

## Fallo al abrir galeria/camara
- Causa tipica: API de `expo-image-picker` desactualizada.
- Accion: usar `mediaTypes: ['images']` con la version actual.

---

## 9) Matriz de Permisos por Accion (SOP)

| Modulo | Ver | Crear | Editar | Eliminar | Banear | Activar/Desactivar |
|---|---|---|---|---|---|---|
| Dashboard | Si | No | No | No | No | No |
| Mint | Si | Si (QR gifts) | No directo | No directo | No | No |
| Estadisticas | Si | No | No | No | No | No |
| Moderacion | Si | No | Si (estado reporte) | No fisico (desestimar) | Si | No |
| Card-Studio | Si | Si (assets) | Si (reemplazos) | Segun uploader | No | No |
| Sys Config | Si | Si (broadcast) | Si (broadcast/flags) | No fisico | No | Si (feature flags) |

Notas operativas:
- Todo el panel requiere `super_admin` + biometria.
- `admin` existe como rol tipado, pero hoy no entra al panel protegido.
- Los limites Free Tier no se cambian desde UI; son solo lectura en Admin.

## 10) Checklist Antes de Tocar Produccion

## A) Seguridad
- Confirmar cuenta correcta y sesion activa de super admin.
- Validar biometria funcional antes de acciones sensibles.
- Verificar que no hay sesiones compartidas en dispositivo.

## B) Cambios en SYS CONFIG
- Si activas `maintenanceMode`, preparar broadcast antes.
- Redactar broadcast con fecha/hora y alcance.
- Guardar y verificar lectura de `system_config/main` en Firestore.
- Probar en app real que el banner/flag se refleja.

## C) Moderacion
- Revisar evidencia y razon del reporte antes de ban.
- Aplicar ban solo cuando haya criterio claro y trazable.
- Confirmar que el reporte pasa a `reviewed` despues del ban.

## D) Card-Studio
- Probar assets subidos (icono/wallpaper/font) en flujo real.
- Verificar tiempos de carga y fallback visual.
- Evitar subir assets sin metadata minima (nombre/tier/categoria).

## E) Validacion final
- Abrir app movil y probar: Vault, Cards, Store, Admin.
- Revisar que no aparezca LogBox/Console Error en device.
- Confirmar que no se rompieron limites base:
  - Social Cards = 30
  - Vault Items = 50

## 11) Playbook de Incidentes de Moderacion

## Severidad P0 (bloqueo total o abuso masivo)
1. Activar `maintenanceMode` solo si hay impacto global.
2. Publicar broadcast corto: incidente, alcance, ETA inicial.
3. Congelar acciones no urgentes del panel.
4. Priorizar contencion: deshabilitar feature flag comprometido.
5. Registrar timeline (hora, accion, resultado).

## Severidad P1 (error importante sin caida total)
1. Mantener app activa.
2. Desactivar solo modulo afectado via feature flag.
3. Publicar broadcast informativo sin alarmar.
4. Monitorear reportes nuevos durante 30-60 min.

## Flujo de decision para reportes
1. Validar tipo de reporte (`card`, `profile`, `support`).
2. Revisar razon + detalles + usuario reportado.
3. Elegir accion:
   - Sin evidencia: `dismissed`.
   - Evidencia leve: `reviewed` + seguimiento.
   - Evidencia grave/reincidencia: ban + `reviewed`.
4. Confirmar escritura en Firestore y reflejo en UI.

## Post-mortem minimo (obligatorio)
- Que paso.
- Impacto real.
- Causa raiz.
- Mitigacion aplicada.
- Accion preventiva para que no se repita.

---

SOP v2 listo. Si quieres, puedo crear una v3 con anexos de:
- plantillas de mensajes de broadcast (mantenimiento, incidente, recuperacion),
- catalogo de decisiones de moderacion (casos ejemplo),
- checklist rapido de 60 segundos para guardia nocturna.
