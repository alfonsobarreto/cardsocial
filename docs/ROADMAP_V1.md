# Roadmap Card-Social: Versión 1.0

Este documento detalla las prioridades críticas para el lanzamiento inicial (V1) y las funciones que se mantendrán inactivas para la siguiente etapa de desarrollo.

---

## Hoy — Prioridad máxima (cerrar V1)

**Objetivo:** terminar hoy los bloques que desbloquean revisión en tiendas y uso real del producto.

| Área | Qué cerrar hoy |
|------|----------------|
| **Vault** | PDFs: guardado + visualización correcta en la bóveda. |
| **Vault** | Imágenes: renderizado y carga fluida en la bóveda. |
| **Red / contactos** | Pantalla de **receptores** (quién tiene la tarjeta guardada). |
| **Red / contactos** | **Filtro de aceptación:** vista previa de la tarjeta antes de aceptar al contacto. |
| **Web** | **Landing** para escaneos QR externos. |
| **Web / legal** | Footer en la tarjeta visual (token 24h): Aviso de Privacidad, Términos, Soporte (requisito Apple/Google). |
| **Web** | **CTA** a descarga de la app (funciones avanzadas: VoIP, guardado directo). |

**Fuera del cierre de hoy (pero en V1):** monetización Business Card + directorio Social Market (sección 2). **VoIP (Agora):** sigue en pruebas internas / TestFlight hasta registro Apple + CallKit (sección 1 y notas técnicas).

---

## Orden de ataque sugerido (de más fácil → más exigente)

**Criterio:** menos dependencias nuevas, menos superficie backend, y quick wins legales/UX primero. Así acumulas momentum y dejas lo más acoplado al final del día.

| # | Tema | Por qué este orden |
|---|------|---------------------|
| 1 | **Footer legal en la vista token 24h** (Privacidad, Términos, Soporte, tipografía fina) | Casi solo UI + enlaces (o rutas estáticas). Alto impacto tiendas, bajo riesgo técnico. |
| 2 | **CTA “Descargar app”** en esa misma superficie web | Mismo contexto que el footer: botones, URLs de tiendas, deeplink opcional. Poco backend. |
| 3 | **Optimización de imágenes en Vault** | El vault ya usa `expo-image` y listas; aquí suele bastar tamaños, `contentFit`, caché, placeholders y evitar trabajo en el hilo principal. Menos fricción que PDF en todos los dispositivos. |
| 4 | **Landing para QR externo** | Puede ser página/host existente o una ruta nueva; implica routing, diseño y enlazar al flujo del token. Más trabajo que el footer, pero acotado. |
| 5 | **PDF en Vault** (guardado + visualización fiable) | Ya hay piezas de preview (`FilePreviewModal`); cerrar el ciclo implica URI/almacenamiento, visor nativo y casos borde (iOS/Android, archivos grandes). |
| 6 | **Pantalla de receptores** (quién tiene la tarjeta) | Nueva pantalla o evolución de lo que ya muestres como “holders”; suele exigir consultas/agregación y permisos en backend o Firestore. |
| 7 | **Vista previa antes de aceptar contacto** | Cambia el flujo de solicitudes: estados, UI del receptor y coherencia con notificaciones. Es el más sensible en producto y regresiones. |

**Lo más fácil hoy:** el bloque **legal + CTA en web (token 24h)** — máximo cumplimiento y conversión con el mínimo de lógica nueva.

**Después del cierre “hoy” (sigue siendo V1):** monetización Business Card + directorio (sección 2), en paralelo o justo cuando la red y la web estén estables.

---

## 1. Prioridades críticas — Versión 1 (para terminar hoy)

### Sistema de Bóveda (Vault)

- **Corrección de PDFs:** Implementar la lógica de guardado y visualización de documentos PDF en el Vault. Es vital para que perfiles profesionales puedan mostrar portafolios o catálogos.
- **Optimización de imágenes:** Ajustar el renderizado de imágenes dentro de la bóveda para asegurar una carga fluida y visualización correcta.

### Gestión de contactos y red

- **Visualización de receptores:** Implementar la pantalla que permite al usuario ver exactamente quién tiene su tarjeta guardada. Este es el motor de validación y tracción de la app.
- **Filtro de aceptación:** Activar la visualización previa de la tarjeta antes de que el usuario acepte un contacto. El receptor debe poder ver quién le está enviando la tarjeta antes de integrarlo a su red.

### Presencia web (landing page)

- **Página de aterrizaje:** Crear una interfaz de destino para escaneos de QR externos.
- **Cumplimiento legal:** Integrar secciones de Aviso de Privacidad, Términos de Servicio y Soporte Técnico (requisito obligatorio para Apple y Google). Agregarlo en el footer con letras finas en la tarjeta visual que abre con el token 24h.
- **Conversión de usuarios:** Implementar el llamado a la acción (CTA) para invitar a usuarios web a descargar la app para acceder a funciones avanzadas (VoIP y guardado directo).

### Funciones VoIP (Agora)

La integración de llamadas de voz se mantendrá en fase de pruebas internas (TestFlight) hasta completar el registro como desarrollador de Apple y cumplir con los requisitos de CallKit.

---

## 2. Monetización V1: Business Card en Social Market

A diferencia de otras funciones, la monetización inicial se centrará en la **visibilidad**:

- **Estatus Business Card:** Los usuarios podrán adquirir este estatus para que su perfil sea visible y destacado dentro del Social Market.
- **Acceso al directorio:** El Social Market se abrirá para que perfiles de negocios puedan ser encontrados por cualquier usuario de la plataforma.

---

## 3. Funciones silenciadas — Versión 2 (post-lanzamiento)

Para optimizar el rendimiento y asegurar un lanzamiento limpio, se comentarán o desactivarán los siguientes módulos:

- **Historias (Stories):** Se desactiva el componente de historias para simplificar la interfaz y reducir carga en servidores hasta tener una base de usuarios mayor.
- **Marketplace de estética:** La venta de temas personalizados e iconos especiales queda pausada para una fase posterior de monetización.

---

## 4. Notas técnicas finales

- **Despliegue:** Una vez corregidos los PDFs y la visualización de receptores, y las llamadas VoIP, la app estará lista para el proceso de revisión en las tiendas.
- **Testing interno:** Se recomienda el uso de TestFlight para validar la estabilidad de las funciones de red antes de la publicación oficial.
