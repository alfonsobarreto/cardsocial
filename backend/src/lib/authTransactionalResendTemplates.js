/**
 * Plantillas Resend para flujos de identidad (verificación, reset, cambio de correo).
 * ES / EN — alineadas con tono Card-Social y dominio cardsocial.me.
 */

const { wrapPremiumTransactionalEmail, escHtml } = require('./premiumTransactionalEmailShell');

const GOLD = '#E9C349';
const GOLD_TEXT = '#0a0a0a';

function ctaButton(url, label) {
  const safe = escHtml(url);
  const safeLabel = escHtml(label);
  return `<a href="${safe}" style="display:inline-block;padding:14px 28px;background:linear-gradient(90deg,#F6DA87,${GOLD},#a87b1f);color:${GOLD_TEXT};text-decoration:none;border-radius:999px;font-weight:800;font-size:14px;letter-spacing:0.06em;text-transform:uppercase;margin:18px 0;">${safeLabel}</a>`;
}

function linkFallback(url) {
  return `<small style="color:#a8a8a8;word-break:break-all;display:block;margin-top:14px;">${escHtml(url)}</small>`;
}

/**
 * @param {{ verificationUrl: string; displayName: string; locale: 'es' | 'en' }} p
 */
function buildVerificationEmail({ verificationUrl, displayName, locale }) {
  const es = locale === 'es';
  const name = String(displayName || '').trim();
  const greeting = name ? (es ? `Hola ${escHtml(name)},` : `Hello ${escHtml(name)},`) : es ? 'Hola,' : 'Hello,';
  const subject = es ? 'Verifica tu correo — Card-Social' : 'Verify your email — Card-Social';
  const headline = es ? 'Confirma tu correo' : 'Confirm your email';
  const innerHtml = es
    ? `${greeting}<br><br>Gracias por unirte a <strong>Card-Social</strong>. Verifica tu dirección con el botón o el enlace siguiente (válido por tiempo limitado):<br><br>${ctaButton(
        verificationUrl,
        'Verificar correo',
      )}<br>${linkFallback(verificationUrl)}<br><br><strong>Puedes contar con nosotros:</strong> si algo no cuadra, te ayudamos a resolverlo en <a href="https://cardsocial.me" style="color:${GOLD};">cardsocial.me</a> o vía soporte. Si no creaste una cuenta en Card-Social, puedes ignorar este mensaje.`
    : `${greeting}<br><br>Thank you for joining <strong>Card-Social</strong>. Verify your email using the button or link below (valid for a limited time):<br><br>${ctaButton(
        verificationUrl,
        'Verify email',
      )}<br>${linkFallback(verificationUrl)}<br><br><strong>We've got you covered:</strong> if anything looks off, we'll help you sort it out at <a href="https://cardsocial.me" style="color:${GOLD};">cardsocial.me</a> or through support. If you didn't create a Card-Social account, you can ignore this message.`;

  const text = es
    ? `${name ? `Hola ${name},` : 'Hola,'}\n\nGracias por unirte a Card-Social. Verifica tu correo:\n\n${verificationUrl}\n\nSi no ves el mensaje en la bandeja principal, revisa Spam o correo no deseado; como empresa nueva, algunos filtros son más estrictos al inicio.\n\nSi no creaste la cuenta, ignora este mensaje.\n\nCard-Social · cardsocial.me`
    : `${name ? `Hello ${name},` : 'Hello,'}\n\nThank you for joining Card-Social. Verify your email:\n\n${verificationUrl}\n\nIf you don't see this in your inbox, check Spam or Junk; as a newer company, some filters are stricter at first.\n\nIf you didn't create the account, you can ignore this message.\n\nCard-Social · cardsocial.me`;

  return { subject, html: wrapPremiumTransactionalEmail({ headline, innerHtml, locale }), text };
}

/**
 * @param {{ resetUrl: string; locale: 'es' | 'en' }} p
 */
function buildPasswordResetEmail({ resetUrl, locale }) {
  const es = locale === 'es';
  const subject = es ? 'Restablece tu contraseña — Card-Social' : 'Reset your password — Card-Social';
  const headline = es ? 'Recuperación de contraseña' : 'Password recovery';
  const innerHtml = es
    ? `Hola,<br><br>Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>Card-Social</strong>. Usa el botón (válido por tiempo limitado):<br><br>${ctaButton(
        resetUrl,
        'Elegir nueva contraseña',
      )}<br>${linkFallback(resetUrl)}<br><br>Si no fuiste tú, ignora este correo; tu contraseña actual no cambia. Para ayuda: <a href="mailto:support@cardsocial.me" style="color:${GOLD};">support@cardsocial.me</a>.`
    : `Hello,<br><br>We received a request to reset the password for your <strong>Card-Social</strong> account. Use the button below (valid for a limited time):<br><br>${ctaButton(
        resetUrl,
        'Choose a new password',
      )}<br>${linkFallback(resetUrl)}<br><br>If you didn't request this, you can ignore this email; your current password stays the same. For help: <a href="mailto:support@cardsocial.me" style="color:${GOLD};">support@cardsocial.me</a>.`;

  const text = es
    ? `Hola,\n\nRestablece tu contraseña de Card-Social con este enlace (tiempo limitado):\n\n${resetUrl}\n\nSi no fuiste tú, ignora el mensaje.\n\nSoporte: support@cardsocial.me`
    : `Hello,\n\nReset your Card-Social password with this link (time-limited):\n\n${resetUrl}\n\nIf you didn't request this, ignore this message.\n\nSupport: support@cardsocial.me`;

  return { subject, html: wrapPremiumTransactionalEmail({ headline, innerHtml, locale }), text };
}

/**
 * Correo al **nuevo** correo: confirmar titularidad antes del cambio.
 * @param {{ confirmUrl: string; newEmail: string; locale: 'es' | 'en' }} p
 */
function buildEmailChangeEmail({ confirmUrl, newEmail, locale }) {
  const es = locale === 'es';
  const subject = es ? 'Confirma tu nuevo correo — Card-Social' : 'Confirm your new email — Card-Social';
  const headline = es ? 'Cambio de correo' : 'Email change';
  const masked = escHtml(newEmail);
  const innerHtml = es
    ? `Hola,<br><br>Alguien con acceso a tu cuenta de <strong>Card-Social</strong> solicitó usar <strong>${masked}</strong> como nuevo correo. Confirma con el botón (válido por tiempo limitado):<br><br>${ctaButton(
        confirmUrl,
        'Confirmar nuevo correo',
      )}<br>${linkFallback(confirmUrl)}<br><br>Si no reconoces este cambio, contacta de inmediato a <a href="mailto:support@cardsocial.me" style="color:${GOLD};">support@cardsocial.me</a>.`
    : `Hello,<br><br>Someone with access to your <strong>Card-Social</strong> account requested to use <strong>${masked}</strong> as the new email. Confirm with the button below (valid for a limited time):<br><br>${ctaButton(
        confirmUrl,
        'Confirm new email',
      )}<br>${linkFallback(confirmUrl)}<br><br>If you don't recognize this change, contact <a href="mailto:support@cardsocial.me" style="color:${GOLD};">support@cardsocial.me</a> right away.`;

  const text = es
    ? `Hola,\n\nConfirma el nuevo correo ${newEmail} para tu cuenta Card-Social:\n\n${confirmUrl}\n\nSi no fuiste tú, escribe a support@cardsocial.me.`
    : `Hello,\n\nConfirm the new email ${newEmail} for your Card-Social account:\n\n${confirmUrl}\n\nIf this wasn't you, email support@cardsocial.me.`;

  return { subject, html: wrapPremiumTransactionalEmail({ headline, innerHtml, locale }), text };
}

module.exports = {
  buildVerificationEmail,
  buildPasswordResetEmail,
  buildEmailChangeEmail,
};
