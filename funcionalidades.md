# Funcionalidades núcleo de Card-Social (MVP)

Este documento resume el núcleo funcional actual para mantener alineado el comportamiento del producto con la promesa de privacidad del Búnker.

## 1) Búnker / Vault de datos
- El usuario guarda datos sensibles (teléfono, email, links, documentos, texto) en `vault_data`.
- El valor sensible se usa como dato interno de identidad, no como dato de exposición directa.
- Aperturas de datos deben pasar por flujo enrutado y seguro (Ghost-Link / visor protegido).

## 2) Tarjetas inteligentes (Cards)
- El usuario compone tarjetas seleccionando ítems del Búnker.
- Las tarjetas se comparten por QR dinámico y permisos de relación.
- Al tocar un dato telefónico desde tarjeta, nunca debe abrir marcador nativo del sistema.

## 3) Contactos + Calls (Ghost-Link VoIP)
- La llamada se inicia por `Contacts`/`Calls` vía `ghost-link-voip`.
- Flujo backend:
  - `POST /api/qr/voip/ghost-link/start`
  - `GET /api/qr/voip/ghost-link/incoming`
  - `POST /api/qr/voip/ghost-link/respond`
- El número real del emisor no se revela al receptor.
- El campo teléfono funciona como identificador interno, no como destino de `tel:`.

## 4) Stories CTA
- CTA puede invocar email/link/documento/texto.
- CTA telefónico debe enrutarse por Ghost-Link, nunca por `tel:`.

## 5) Política de privacidad operativa
- Prohibido bypass al marcador nativo para datos de tipo Teléfono.
- Si falta `targetUid` para iniciar bridge Ghost-Link, la UI debe redirigir al flujo interno `Contacts`/`Calls`.
- Mensajería al usuario debe reforzar: “Tu número real permanece oculto.”

## 6) Estado técnico actual del VoIP
- Existe canal lógico `ghost-link-voip` con registro y control de invitaciones.
- Falta conexión de media engine en cliente (audio real de llamada):
  - No hay SDK de media VoIP integrado actualmente.
  - El backend hoy gestiona señalización/estado de invitación y bitácora de llamadas.
  - Recomendación: integrar SDK de Azure Communication Services Calling (o equivalente) para audio en tiempo real.
