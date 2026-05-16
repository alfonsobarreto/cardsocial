/**
 * Texto para Firebase Console → Authentication → Templates → Email address verification.
 *
 * Pasos:
 * 1. Abre cada idioma (English / Spanish) si usas localización de plantillas.
 * 2. Pega el asunto y el cuerpo correspondientes.
 * 3. Conserva el marcador %LINK% tal cual (Firebase sustituye el enlace de verificación).
 *    Si tu consola muestra otro marcador (p. ej. en plantillas nuevas), cámbialo según la ayuda de Firebase.
 *
 * Envío real en la app (alta / reenvío): backend `POST /api/auth/send-verification-email` + Resend;
 * plantillas en `backend/src/lib/authTransactionalResendTemplates.js` (export legacy en `emailVerificationResendTemplates.js`).
 * Cambio de correo (Studio web): `POST /api/auth/send-email-change-link` + Resend + `generateVerifyAndChangeEmailLink`.
 */

export const FIREBASE_VERIFICATION_EMAIL_SUBJECT_EN = 'Verify your email — Card-Social';

export const FIREBASE_VERIFICATION_EMAIL_SUBJECT_ES = 'Verifica tu correo — Card-Social';

/** Cuerpo en texto plano (si la consola no permite HTML). Mantén %LINK% en una línea propia. */
export const FIREBASE_VERIFICATION_EMAIL_BODY_TEXT_EN = `Hello,

Thank you for joining Card-Social. Please verify your email address using the link below:

%LINK%

**If you don't see this email in your inbox, please check your Spam or Junk folder.** As a newer company, we send a modest volume from our domain at first; some providers filter unfamiliar senders more strictly until reputation builds. Adding Card-Social to your contacts—or marking this message as "Not spam"—helps future messages reach your primary inbox.

**We've got you covered:** if anything looks off, we'll help you sort it out. If you didn't create a Card-Social account, you can safely ignore this message.

Best regards,
The Card-Social team`;

export const FIREBASE_VERIFICATION_EMAIL_BODY_TEXT_ES = `Hola,

Gracias por unirte a Card-Social. Verifica tu dirección de correo con el enlace siguiente:

%LINK%

**Si no ves este mensaje en tu bandeja de entrada, revisa Spam o Correo no deseado.** Como empresa en crecimiento, al principio enviamos pocos correos desde nuestro dominio; algunos proveedores filtran con más cautela hasta generar reputación. Añadir Card-Social a tus contactos o marcar el mensaje como «No es spam» ayuda a que los siguientes lleguen a la bandeja principal.

**Puedes contar con nosotros:** si algo no cuadra, te ayudamos a resolverlo. Si no creaste una cuenta en Card-Social, puedes ignorar este mensaje con tranquilidad.

Un saludo,
El equipo de Card-Social`;

/** Cuerpo HTML si la consola lo permite (negritas con <strong>). */
export const FIREBASE_VERIFICATION_EMAIL_BODY_HTML_EN = `<p>Hello,</p>
<p>Thank you for joining <strong>Card-Social</strong>. Please verify your email address using the link below:</p>
<p>%LINK%</p>
<p><strong>If you don't see this email in your inbox, please check your Spam or Junk folder.</strong> As a newer company, we send a modest volume from our domain at first; some providers filter unfamiliar senders more strictly until reputation builds. Adding Card-Social to your contacts—or marking this message as &quot;Not spam&quot;—helps future messages reach your primary inbox.</p>
<p><strong>We've got you covered:</strong> if anything looks off, we'll help you sort it out. If you didn't create a Card-Social account, you can safely ignore this message.</p>
<p>Best regards,<br/>The Card-Social team</p>`;

export const FIREBASE_VERIFICATION_EMAIL_BODY_HTML_ES = `<p>Hola,</p>
<p>Gracias por unirte a <strong>Card-Social</strong>. Verifica tu dirección de correo con el enlace siguiente:</p>
<p>%LINK%</p>
<p><strong>Si no ves este mensaje en tu bandeja de entrada, revisa Spam o Correo no deseado.</strong> Como empresa en crecimiento, al principio enviamos pocos correos desde nuestro dominio; algunos proveedores filtran con más cautela hasta generar reputación. Añadir Card-Social a tus contactos o marcar el mensaje como &laquo;No es spam&raquo; ayuda a que los siguientes lleguen a la bandeja principal.</p>
<p><strong>Puedes contar con nosotros:</strong> si algo no cuadra, te ayudamos a resolverlo. Si no creaste una cuenta en Card-Social, puedes ignorar este mensaje con tranquilidad.</p>
<p>Un saludo,<br/>El equipo de Card-Social</p>`;
