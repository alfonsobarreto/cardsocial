/**
 * Remitentes Resend por tipo de flujo (dominio cardsocial.me).
 * Override opcional vía Application Settings (Azure) sin tocar código.
 */

function trimEnv(name) {
  return String(process.env[name] || '').trim();
}

function firstNonEmpty(...candidates) {
  for (const c of candidates) {
    const v = String(c || '').trim();
    if (v) return v;
  }
  return '';
}

/** Verificación, OTP, enlaces de seguridad (reset, cambio de correo). Solo `EMAIL_SENDER_VERIFICATION` o default (evita legacy que apunte a soporte). */
const verificationSenderEnv = trimEnv('EMAIL_SENDER_VERIFICATION');
const verification = verificationSenderEnv || 'Card-Social Verification <verification@cardsocial.me>';

/** Soporte, recuperación de usuario, contacto. */
const support = firstNonEmpty(trimEnv('EMAIL_SENDER_SUPPORT'), 'Card-Social Support <support@cardsocial.me>');

/** Notificaciones, broadcast, bienvenidas genéricas. */
const notifications = firstNonEmpty(
  trimEnv('EMAIL_SENDER_NOTIFICATIONS'),
  trimEnv('EMAIL_FROM'),
  'Card-Social <notifications@cardsocial.me>',
);

module.exports = {
  EMAIL_SENDERS: {
    verification,
    support,
    notifications,
  },
  /** Default para `sendEmail` cuando no se pasa `from` (broadcast, tests). */
  getDefaultNotificationFrom: () => notifications,
};
