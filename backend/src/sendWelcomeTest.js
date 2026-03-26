// Script para enviar un correo de bienvenida de prueba usando el servicio centralizado
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { sendEmail, welcomeTemplate } = require('./services/email.service');

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('USO: node sendWelcomeTest.js tu@email.com');
    process.exit(1);
  }
  const nombre = 'Alfonso';
  const url = 'https://cardsocial.me/setup';
  const html = welcomeTemplate({ nombre, url });
  const subject = `¡Bienvenido a la nueva era de tu red profesional, ${nombre}! 🚀`;
  try {
    await sendEmail({
      to,
      subject,
      html,
      text: `Hola ${nombre}, bienvenido a Card-Social. Configura tu tarjeta en: ${url}`
    });
    console.log('Correo de bienvenida enviado a', to);
  } catch (err) {
    console.error('Error enviando correo:', err);
    process.exit(2);
  }
}

main();
