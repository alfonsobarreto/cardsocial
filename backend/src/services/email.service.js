// email.service.js - Envío centralizado vía Resend (https://resend.com/docs/api-reference/emails/send-email)
const { Resend } = require('resend');
const { getDefaultNotificationFrom } = require('../config/emailSenders');

const CARD_SOCIAL_PRIMARY_COLOR = '#1EA7FF';
const CARD_SOCIAL_LOGO_URL = 'https://cardsocial.me/assets/logo-cardsocial.png'; // Cambia por la URL real si es diferente
const COMPANY_ADDRESS = 'Card-Social, CDMX, México'; // Actualiza si tienes dirección física oficial

const RESEND_API_KEY = String(process.env.RESEND_API_KEY ?? '').trim();
/** Remitente por defecto (notificaciones / broadcast) si no se pasa `from`. */
const EMAIL_FROM_DEFAULT = String(process.env.EMAIL_FROM ?? '').trim() || getDefaultNotificationFrom();

let resendSingleton = null;
function getResendClient() {
  if (!RESEND_API_KEY) {
    throw new Error('Falta RESEND_API_KEY');
  }
  if (!resendSingleton) {
    resendSingleton = new Resend(RESEND_API_KEY);
  }
  return resendSingleton;
}

function renderButton(text, url) {
  return `<a href="${url}" style="display:inline-block;padding:14px 32px;background:${CARD_SOCIAL_PRIMARY_COLOR};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;margin:24px 0;">${text}</a>`;
}

function renderFooter() {
  return `<div style="margin-top:40px;font-size:13px;color:#888;text-align:center;line-height:1.6;">
    <div style="margin-bottom:10px;">Si no ves este mensaje en la bandeja principal, revisa <strong>Spam</strong> / If you don't see this in your inbox, check <strong>Spam</strong>. Como empresa nueva, algunos filtros son más estrictos con <strong>cardsocial.me</strong> al inicio.</div>
    <div>${COMPANY_ADDRESS}</div>
    <div>Este es un correo automático de Card-Social, por favor no respondas.</div>
  </div>`;
}

function renderBaseTemplate({ subject, bodyHtml }) {
  return `
  <div style="background:#fff;padding:32px 0;font-family:Segoe UI,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;border:1px solid #eee;border-radius:12px;box-shadow:0 2px 8px #0001;overflow:hidden;">
      <div style="padding:32px 32px 16px 32px;text-align:center;">
        <img src="${CARD_SOCIAL_LOGO_URL}" alt="Card-Social" style="width:120px;margin-bottom:24px;" />
        <div style="font-size:22px;font-weight:700;color:#222;margin-bottom:8px;">${subject}</div>
        <div style="font-size:16px;color:#333;text-align:left;">${bodyHtml}</div>
        ${renderFooter()}
      </div>
    </div>
  </div>
  `;
}

function welcomeTemplate({ nombre, url }) {
  return renderBaseTemplate({
    subject: `¡Bienvenido a la nueva era de tu red profesional, ${nombre}! 🚀`,
    bodyHtml: `Hola ${nombre}, bienvenido a Card-Social.<br><br>
Tu forma de conectar con el mundo acaba de cambiar para siempre. Ya no necesitas tarjetas de papel; ahora tu red profesional vive en tu bolsillo.<br><br>
<b>¿Qué puedes hacer ahora mismo?</b><br><ul style="margin:12px 0 24px 24px;padding:0;color:#222;font-size:15px;">
<li>Crea tu tarjeta digital: Personalízala con tus redes y contacto.</li>
<li>Comparte con un toque: Usa tu código QR o enlace único.</li>
<li>Mira quién te visita: Analiza el impacto de tu red en tiempo real.</li>
</ul>
${renderButton('CONFIGURAR MI TARJETA AHORA', url)}<br>
Si tienes alguna duda, nuestro equipo está aquí para impulsarte.<br><br>
El equipo de Card-Social.`
  });
}

function passwordResetTemplate({ url }) {
  return renderBaseTemplate({
    subject: 'Restablece tu contraseña de Card-Social 🛡️',
    bodyHtml: `Hola,<br><br>
Recibimos una solicitud para restablecer la contraseña de tu cuenta en Card-Social.<br><br>
Para proteger tu seguridad, este enlace caducará en <b>15 minutos</b>. Haz clic en el botón de abajo para elegir una nueva contraseña:<br><br>
${renderButton('RESTABLECER MI CONTRASEÑA', url)}<br><br>
¿No fuiste tú? Si no solicitaste este cambio, puedes ignorar este correo de forma segura. Tu contraseña actual seguirá siendo la misma.`
  });
}

function usernameRecoveryTemplate({ username }) {
  return renderBaseTemplate({
    subject: 'Tu usuario de Card-Social',
    bodyHtml: `Hola,<br><br>
Recibimos una solicitud para recordar el usuario asociado a este correo.<br><br>
Tu usuario de Card-Social es:<br><br>
<div style="font-size:22px;font-weight:700;color:#222;background:#f4f8fb;border-radius:8px;padding:14px 18px;text-align:center;">@${username}</div><br>
Si no solicitaste esta ayuda, puedes ignorar este correo.`
  });
}

/** escape mínimo para nombre en HTML */
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Confirmación de solicitud de eliminación (hibernación 30 días).
 * @param {{ firstName: string; deadlineFormatted: string; locale: 'es' | 'en' }} p
 * @returns {{ html: string; text: string; subject: string }}
 */
function accountDeletionScheduledTemplate({ firstName, deadlineFormatted, locale }) {
  const es = locale === 'es';
  const name = escHtml(firstName).trim();
  const subject = es
    ? 'Solicitud de eliminación de cuenta — Card-Social'
    : 'Account deletion request — Card-Social';

  const greeting = name ? (es ? `Hola ${name},` : `Hello ${name},`) : es ? 'Hola,' : 'Hello,';

  const bodyHtml = es
    ? `${greeting}<br><br>Hemos recibido tu solicitud de eliminación. Tu cuenta y todos tus datos personales asociados entrarán en un periodo de hibernación de 30 días y se borrarán definitivamente el día <b>${escHtml(
        deadlineFormatted
      )}</b>.<br><br><b>Soberanía total:</b> si cambias de opinión, no tienes que escribirnos ni abrir tickets; tu cuenta sigue viva y solo necesitas iniciar sesión con tu contraseña antes de la fecha límite para restaurar todo instantáneamente.`
    : `${greeting}<br><br>We have received your deletion request. Your account and all associated personal data will enter a 30-day hibernation period and will be permanently deleted on <b>${escHtml(
        deadlineFormatted
      )}</b>.<br><br><b>Full sovereignty:</b> if you change your mind, you do not need to email us or open a support ticket — your account remains active; simply sign in with your password before the deadline to restore everything instantly.`;

  const plainName = String(firstName || '').trim();
  const text = es
    ? `${plainName ? `Hola ${plainName},` : 'Hola,'}\n\nHemos recibido tu solicitud de eliminación. Tu cuenta y todos tus datos personales asociados entrarán en un periodo de hibernación de 30 días y se borrarán definitivamente el día ${deadlineFormatted}.\n\nSoberanía total: si cambias de opinión, no tienes que escribirnos ni abrir tickets; tu cuenta sigue viva y solo necesitas iniciar sesión con tu contraseña antes de la fecha límite para restaurar todo instantáneamente.`
    : `${plainName ? `Hello ${plainName},` : 'Hello,'}\n\nWe have received your deletion request. Your account and all associated personal data will enter a 30-day hibernation period and will be permanently deleted on ${deadlineFormatted}.\n\nFull sovereignty: if you change your mind, you do not need to email us or open a support ticket — your account remains active; simply sign in with your password before the deadline to restore everything instantly.`;

  return {
    subject,
    html: renderBaseTemplate({ subject, bodyHtml }),
    text,
  };
}

/**
 * @param {{ to: string; subject: string; html: string; text?: string; from?: string }} opts
 */
async function sendEmail({ to, subject, html, text, from }) {
  const sender = String(from || EMAIL_FROM_DEFAULT).trim();
  if (!sender) {
    throw new Error('Falta EMAIL_FROM (remitente verificado en Resend)');
  }
  const recipient = String(to || '').trim();
  if (!recipient) {
    throw new Error('Falta destinatario');
  }

  const client = getResendClient();
  let logDoc;

  try {
    const { data, error } = await client.emails.send({
      from: sender,
      to: recipient,
      subject,
      html,
      ...(text ? { text } : {}),
    });

    if (error) {
      throw new Error(typeof error === 'object' ? error.message || JSON.stringify(error) : String(error));
    }

    logDoc = {
      type: 'email',
      provider: 'resend',
      to: recipient,
      subject,
      status: 'sent',
      messageId: data?.id ?? null,
      sentAt: new Date(),
      payload: { html, text },
      error: null,
    };

    const { MongoClient } = require('mongodb');
    const mongoUri = process.env.MONGO_URI;
    const mongoDb = process.env.MONGO_DB_NAME || 'cardsocial';
    if (mongoUri) {
      try {
        const mongo = new MongoClient(mongoUri);
        await mongo.connect();
        await mongo.db(mongoDb).collection('email_logs').insertOne(logDoc);
        await mongo.close();
      } catch (e) {
        console.error('Error guardando log de email:', e);
      }
    }

    return data;
  } catch (err) {
    logDoc = {
      type: 'email',
      provider: 'resend',
      to: recipient,
      subject,
      status: 'error',
      messageId: null,
      sentAt: new Date(),
      payload: { html, text },
      error: err.message || String(err),
    };

    const { MongoClient } = require('mongodb');
    const mongoUri = process.env.MONGO_URI;
    const mongoDb = process.env.MONGO_DB_NAME || 'cardsocial';
    if (mongoUri) {
      try {
        const mongo = new MongoClient(mongoUri);
        await mongo.connect();
        await mongo.db(mongoDb).collection('email_logs').insertOne(logDoc);
        await mongo.close();
      } catch (e) {
        console.error('Error guardando log de email:', e);
      }
    }

    throw err;
  }
}

/** True si el backend puede enviar correo transaccional. */
function isEmailSendConfigured() {
  return Boolean(RESEND_API_KEY && String(EMAIL_FROM_DEFAULT || '').trim());
}

module.exports = {
  sendEmail,
  isEmailSendConfigured,
  welcomeTemplate,
  passwordResetTemplate,
  usernameRecoveryTemplate,
  accountDeletionScheduledTemplate,
};
