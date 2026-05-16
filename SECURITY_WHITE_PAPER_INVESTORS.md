# White Paper de Seguridad para Inversionistas  
## Card-Social — Arquitectura de privacidad de grado institucional (Módulo A)

**Clasificación:** material para inversores bajo NDA  
**Audiencia:** fondos de capital de riesgo, comités de due diligence, asesores financieros  
**Alcance técnico consolidado:** cifrado E2E con `@noble/ciphers` / AES-GCM-256, PBKDF2-HMAC-SHA256 (310.000 iteraciones), modelo fail-closed en sesión y material de claves

---

## 1. Resumen ejecutivo — la tesis de valor en privacidad

En el mercado actual, los datos de **alta sensibilidad** —información de salud, datos financieros personales, credenciales, identidad digital consolidada— ya no se tratan como un anexo al producto: son el **activo regulado** que define el techo de crecimiento y el piso de riesgo legal. Los escenarios de exposición ya no se limitan a un “ataque externo”; incluyen **espionaje corporativo** (insiders con acceso lógico), **filtraciones masivas** por mala configuración de infraestructura, copias de respaldo legibles y bases centralizadas donde un único incidente degrada la confianza de toda la base de usuarios.

Card-Social adopta una tesis deliberada: **aislamiento absoluto del contenido sensible respecto de la nube operada**. La aplicación no invita al usuario a “confiar en nuestros servidores”; invierte la ecuación de riesgo: **lo que la plataforma no puede leer no puede filtrarse desde sus bases de datos**, ni entregarse por coerción sobre el operador sin el material criptográfico que reside en el **hardware del cliente**. Así se neutraliza, en la práctica, gran parte del valor para un atacante que comprometa configuración, credenciales de despliegue o incluso la base de datos lógica: obtiene **ciphertext** y metadatos estructurales, no el contenido clínico, financiero o identitario que el mercado valora y el regulador exige proteger.

Para el inversionista, esto no es un discurso de cumplimiento accesorio: es un **moat** que reduce el costo esperado de incidentes, acelera la entrada en verticales sensibles y diferencia la propuesta frente a competidores que solo cifran en tránsito o en reposo “a nivel de volumen” sin segregar el contenido a nivel de aplicación.

---

## 2. Arquitectura de conocimiento cero y cifrado de extremo a extremo (E2E)

### 2.1 Visión conceptual: la nube como “buzón ciego”

En un modelo clásico, la infraestructura cloud —en nuestro stack, **Firebase y servicios asociados en el ecosistema Google**— almacena documentos que podrían, en principio, ser interpretados por quien disponga de privilegios suficientes en la capa de datos. En la arquitectura consolidada en **Módulo A**, la nube cumple una función distinta:

| Capa | Rol |
|------|-----|
| **Cliente (app móvil / Studio web)** | Donde vive la **semántica**: se compone el payload sensible, se deriva la clave y se ejecuta **AES-GCM-256** antes de cualquier persistencia remota. |
| **Red (TLS)** | Transporte íntegro y confidencial del **ciphertext**, no del texto claro. |
| **Firebase / almacenamiento lógico** | **Buzón ciego**: recibe blobs cifrados y campos estructurales mínimos para reglas de acceso e indexación prudente. |

Ni **Google** como proveedor de infraestructura, ni **Card-Social** como operador de la aplicación, ni un **atacante con lectura directa de la base de datos** en la nube puede reconstruir, sin más, el contenido de alergias, notas confidenciales, datos tipo credencial u otros secretos encapsulados en el payload protegido: **no existe en claro fuera del dispositivo** en el momento del diseño E2E.

### 2.2 Integración criptográfica: `@noble/ciphers` y AES-GCM-256

El motor emplea **AES-GCM-256** (modo autenticado que fusiona confidencialidad e integridad). En entornos **React Native / Hermes**, la implementación se apoya en **`@noble/ciphers`**: biblioteca **auditables**, portable y compatible con el bundler Metro, sin depender de extensiones nativas frágiles para cada plataforma. En **navegador** (Studio), la misma semántica puede ejecutarse vía **`window.crypto.subtle`**, manteniendo **paridad de algoritmo y parámetros** con la rama móvil donde procede.

Cada operación de cifrado utiliza un **vector de inicialización (IV) aleatorio de 12 bytes** por mensaje; el **tag de autenticación** impide que ciphertext manipulado sea aceptado silenciosamente. El resultado almacenado es **opaco** para la infraestructura: un inversionista puede visualizarlo, conceptualmente, como un sobre lacrado cuyo interior solo el dispositivo legítimo puede abrir con la llave correcta.

---

## 3. Protocolo avanzado de derivación de llaves (anti–fuerza bruta)

La clave simétrica que protege el payload **no se envía ni se guarda en claro en la nube**. Se obtiene en el cliente mediante **PBKDF2 con PRF HMAC-SHA256** sobre el **passcode** (o passphrase) del usuario.

**Parámetros de diseño ya consolidados en código (Módulo A):**

- **Iteraciones: 310.000** — estándar de trabajo alineado con recomendaciones de endurecimiento frente a ataques de diccionario y GPU; constituye un **contrato criptográfico** con los datos ya persistidos (elevar o reducir iteraciones sin versión implicaría migración explícita).
- **Sal determinística por cuenta** — derivada de un identificador estable de cuenta (p. ej. UID), mezclada con un prefijo de dominio fijo, y reducida a un vector de sal de longitud fija. Así la derivación es **reproducible** en todos los dispositivos autorizados del mismo usuario **sin almacenar la sal como un documento público adicional**, pero sin convertir el passcode en la única entropía contra rainbow tables entre cuentas.

Efecto económico y de seguridad para el modelo de negocio: un adversario que exfiltre bases de datos en la nube enfrenta **millones de operaciones PBKDF2 por intento de passcode por usuario**, desplazando el ataque desde la “descarga masiva legible” hacia un costo computacional **desalineado** con el valor esperado del ciphertext agregado. Las **frases de acceso permanecen locales** en el sentido estratégico: el servidor nunca las necesita en claro para operar el cifrado de campo.

---

## 4. Defensa física y hardware encriptado (fail-closed nativo)

Más allá de la criptografía en software, la superficie de amenaza incluye **extracción de credenciales de sesión**, backups ingenuos y **acceso físico breve** al dispositivo. La arquitectura migró parámetros críticos de control hacia primitivas del sistema operativo: en la práctica, el material que habilita el descifrado en sesión se ancla a **Keychain (iOS)** y **Android Keystore**, capas respaldadas por **módulos de seguridad hardware** donde el fabricante y el SO lo proveen (p. ej. **Secure Enclave** en el ecosistema Apple).

El principio operativo es **fail-closed** (fallo cerrado): ante anomalías de desbloqueo, sesión o integridad —biometría fallida, bloqueo de pantalla, cierre explícito de sesión— la aplicación **no sustituye** el flujo sensible por modos permisivos que degraden la confidencialidad. Sin el camino aprobado para el material de claves, el contenido permanece en forma **cifrada e inaccesible**, alineando el UX de seguridad con las expectativas de usuarios enterprise y de auditores externos.

---

## 5. Impacto en la valuación y mitigación de riesgos (métricas VC)

- **Cumplimiento y riesgo legal (GDPR, HIPAA y analogías sectoriales):** Al no custodiar en claro el núcleo de datos de la Bóveda, Card-Social **reduce la superficie de “datos personales legibles”** atribuibles a un incidente en infraestructura central —argumento material en negociaciones con DPO, aseguradoras de ciberriesgo y compradores estratégicos en salud o RH.

- **Incidente en servidores centrales — impacto financiero y reputacional acotado:** Un atacante que comprometa la capa cloud se lleva, para esos campos, **texto cifrado sin llave maestra del operador**; el daño económico y de marca se compara favorablemente con filtraciones clásicas de millones de registros en texto plano, frecuentemente valoradas en **cientos de millones** en litigio y remedios.

- **Propiedad intelectual y multiplicador de valuación:** La combinación **E2E + derivación endurecida + integración hardware-backed + política fail-closed** constituye un **paquete de IP defensible y narrable** en rondas growth y en M&A: diferencia técnica que los fondos traducen en **premium de múltiplo** frente a apps “solo TLS” o cifrado puramente declarativo.

---

## Cierre

Este documento sintetiza la arquitectura **ya anclada en el código del Módulo A** —noble/subtle según entorno, **AES-GCM-256**, **PBKDF2-HMAC-SHA256 a 310.000 iteraciones**, sal por cuenta, y postura **fail-closed** en la capa de sesión— en un lenguaje que permite a un **comité de inversión** evaluar no solo la profundidad técnica, sino el **foso comercial y regulatorio** que esa profundidad habilita.

**Card-Social · Seguridad y privacidad como activo balanceado, no como costo de cumplimiento.**

---

*Documento generado como artefacto ejecutivo para pitch deck y data room. Versión 1.1 — Módulo A consolidado.*
