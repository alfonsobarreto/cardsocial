// Script para enviar los 3 correos principales a pochobs@gmail.com
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { sendEmail, welcomeTemplate, passwordResetTemplate } = require('./services/email.service');
const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require('mongodb');

const email = 'pochobs@gmail.com';
const nombre = 'Alfonso';
const setupUrl = 'https://cardsocial.me/setup';
const resetBaseUrl = 'https://cardsocial.me/reset-password?token=';

async function main() {
  // 1. Bienvenida
  const htmlWelcome = welcomeTemplate({ nombre, url: setupUrl });
  const subjectWelcome = `¡Bienvenido a la nueva era de tu red profesional, ${nombre}! 🚀`;
  const resultWelcome = await sendEmail({
    to: email,
    subject: subjectWelcome,
    html: htmlWelcome,
    text: `Hola ${nombre}, bienvenido a Card-Social. Configura tu tarjeta en: ${setupUrl}`
  });
  console.log('Azure Send ID (Bienvenida):', resultWelcome.id || resultWelcome.messageId || JSON.stringify(resultWelcome));

  // 2. Recuperación de contraseña (token real)
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos
  // Guardar token en MongoDB
  const mongo = new MongoClient(process.env.MONGO_URI);
  await mongo.connect();
  const db = mongo.db(process.env.MONGO_DB_NAME || 'cardsocial');
  await db.collection('action_tokens').insertOne({
    type: 'reset-password',
    userId: 'pochobs_admin',
    email,
    token,
    expiresAt,
    used: false,
    createdAt: new Date(),
  });
  await mongo.close();
  const htmlReset = passwordResetTemplate({ url: resetBaseUrl + token });
  const subjectReset = 'Restablece tu contraseña de Card-Social 🛡️';
  const resultReset = await sendEmail({
    to: email,
    subject: subjectReset,
    html: htmlReset,
    text: `Recibimos una solicitud para restablecer tu contraseña. Enlace: ${resetBaseUrl + token}`
  });
  console.log('Azure Send ID (Recuperación):', resultReset.id || resultReset.messageId || JSON.stringify(resultReset));

  // 3. Confirmación de seguridad (cambio de datos)
  const subjectSecurity = 'Aviso de seguridad: Cambio de datos en tu cuenta';
  const htmlSecurity = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:16px;color:#222;">
    Hola ${nombre},<br><br>
    Detectamos un cambio reciente en los datos de tu cuenta Card-Social.<br>
    Si fuiste tú, no necesitas hacer nada.<br>
    Si no reconoces este cambio, por favor contacta a soporte de inmediato.<br><br>
    <div style="margin-top:32px;font-size:13px;color:#888;">Este es un correo automático, por favor no respondas.</div>
  </div>`;
  const resultSecurity = await sendEmail({
    to: email,
    subject: subjectSecurity,
    html: htmlSecurity,
    text: `Hola ${nombre}, detectamos un cambio en tu cuenta. Si no fuiste tú, contacta a soporte.`
  });
  console.log('Azure Send ID (Seguridad):', resultSecurity.id || resultSecurity.messageId || JSON.stringify(resultSecurity));
}

main().catch(err => { console.error('Error en envío de prueba:', err); process.exit(1); });
