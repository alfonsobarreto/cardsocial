// Prueba de envío Resend (misma pila que producción).
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { sendEmail } = require('./services/email.service');

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('USO: node sendTestEmail.js tu@email.com');
    process.exit(1);
  }
  try {
    await sendEmail({
      to,
      subject: 'Prueba Card-Social (Resend)',
      html: '<h2>OK</h2><p>Este correo usa <b>RESEND_API_KEY</b> + <b>EMAIL_FROM</b>.</p>',
      text: 'Este correo usa RESEND_API_KEY + EMAIL_FROM.',
    });
    console.log('Correo enviado a', to);
  } catch (err) {
    console.error('Error enviando:', err.message || err);
    process.exit(2);
  }
}

main();
