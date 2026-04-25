// email.service.js - Servicio centralizado de emails para Card-Social
const { EmailClient } = require('@azure/communication-email');

const CARD_SOCIAL_PRIMARY_COLOR = '#1EA7FF';
const CARD_SOCIAL_LOGO_URL = 'https://cardsocial.me/assets/logo-cardsocial.png'; // Cambia por la URL real si es diferente
const COMPANY_ADDRESS = 'Card-Social, CDMX, México'; // Actualiza si tienes dirección física oficial

const EMAIL_FROM = process.env.EMAIL_FROM || 'DoNotReply@cardsocial.me';
const AZURE_EMAIL_CONNECTION_STRING = process.env.AZURE_EMAIL_CONNECTION_STRING;

function getEmailClient() {
  if (!AZURE_EMAIL_CONNECTION_STRING) throw new Error('Falta AZURE_EMAIL_CONNECTION_STRING');
  return new EmailClient(AZURE_EMAIL_CONNECTION_STRING);
}

function renderButton(text, url) {
  return `<a href="${url}" style="display:inline-block;padding:14px 32px;background:${CARD_SOCIAL_PRIMARY_COLOR};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;margin:24px 0;">${text}</a>`;
}

function renderFooter() {
  return `<div style="margin-top:40px;font-size:13px;color:#888;text-align:center;line-height:1.6;">
    <div>${COMPANY_ADDRESS}</div>
    <div>Este es un correo automático, por favor no respondas.</div>
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

async function sendEmail({ to, subject, html, text }) {
  const client = getEmailClient();
  const message = {
    senderAddress: EMAIL_FROM,
    content: {
      subject,
      html,
      plainText: text || '',
    },
    recipients: {
      to: [{ address: to }],
    },
  };
  let result, logDoc;
  const { MongoClient } = require('mongodb');
  const mongoUri = process.env.MONGO_URI;
  const mongoDb = process.env.MONGO_DB_NAME || 'cardsocial';
  try {
    const poller = await client.beginSend(message);
    result = await poller.pollUntilDone();
    logDoc = {
      type: 'email',
      to,
      subject,
      status: result.status,
      azureId: result.id || result.messageId || null,
      sentAt: new Date(),
      payload: { html, text },
      error: null,
    };
  } catch (err) {
    logDoc = {
      type: 'email',
      to,
      subject,
      status: 'error',
      azureId: null,
      sentAt: new Date(),
      payload: { html, text },
      error: err.message || String(err),
    };
    throw err;
  } finally {
    if (mongoUri) {
      try {
        const mongo = new MongoClient(mongoUri);
        await mongo.connect();
        await mongo.db(mongoDb).collection('email_logs').insertOne(logDoc);
        await mongo.close();
      } catch (e) {
        // Logging de email falló, pero no interrumpe el envío
        console.error('Error guardando log de email:', e);
      }
    }
  }
  if (result.status !== 'Succeeded') {
    throw new Error(`Azure Email send failed: ${result.error?.message || result.status}`);
  }
  return result;
}

module.exports = {
  sendEmail,
  welcomeTemplate,
  passwordResetTemplate,
  usernameRecoveryTemplate,
};
