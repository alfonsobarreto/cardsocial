# Card-Social Studio — Visión y propósito

## 1. El por qué

**Card-Studio** extiende el **Bóveda (Vault)** de Card-Social a un entorno de escritorio: el usuario gestiona su “búnker” de icon-datas con la precisión de un teclado y un ratón (copiar/pegar, arrastrar documentos, edición masiva) sin sustituir la app móvil. La soberanía de los datos y las reglas de negocio siguen alineadas con Firebase y el backend existentes.

## 2. Principios de producto

- **Alta fidelidad visual** con el shell “Luxurious” de la app (fondo oscuro, acentos dorados, tipografía clara), entendiendo que la paridad píxel-a-píxel entre React Native y web es un objetivo iterativo, no un único commit.
- **Un solo foco de trabajo**: flujo por columnas (Miller), no una jerarquía de muchas rutas de marketing.
- **Acceso restringido**: login obligatorio antes de ver el estudio; sin pie de “tabs” móviles; sin menú lateral de descubrimiento.
- **Paridad de idioma**: cadenas ES/EN desde el inicio; IT/FR/PT se documentan como fase posterior con mismos componentes de copy.

## 3. Público y entorno

- Usuarios que ya tienen cuenta Card-Social (mismo Firebase Auth que la app móvil).
- Navegador moderno; archivos y portapapeles vía APIs web estándar.

## 4. No objetivos (explícito)

- No reemplazar la app móvil ni forzar desinstalación de la misma.
- No ser una “versión recortada” a largo plazo: el roadmap apunta a paridad funcional de creación/gestión de items del bóveda donde el modelo de datos lo permita.
- No comprometer `vault.tsx` en móvil salvo refactors mínimos y acordados (por ejemplo utilidades compartidas).

## 5. Evidencia de diseño

Las capturas de Vault, “New Information” e “Icon selector” de la app son la referencia de layout y jerarquía; el estudio web organiza esas **tres superficies** como **columnas empujables** con scroll independiente y cabecera fija en cada columna.

---

*Documento maestro de visión. Arquitectura técnica: `CARD_STUDIO_ARCH.md`.*
