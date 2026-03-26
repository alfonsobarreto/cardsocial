// Script para enviar un correo de prueba con Azure Communication Services
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { sendAzureEmail } = require('./services/azureEmail');

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('USO: node sendTestEmail.js tu@email.com');
    process.exit(1);
  }
  const from = process.env.EMAIL_FROM;
  const connectionString = process.env.AZURE_EMAIL_CONNECTION_STRING;
  if (!from || !connectionString) {
    throw new Error('Falta EMAIL_FROM o AZURE_EMAIL_CONNECTION_STRING en el .env');
  }
  try {
    await sendAzureEmail({
      to,
      from,
      subject: 'Prueba de Azure Email (Card-Social)',
      text: '¡Éxito! Este correo fue enviado usando Azure Communication Services.',
      html: '<h2>¡Éxito!</h2><p>Este correo fue enviado usando <b>Azure Communication Services</b>.</p>',
      connectionString,
    });
    console.log('Correo de prueba enviado a', to);
  } catch (err) {
    console.error('Error enviando correo:', err);
    process.exit(2);
  }
}

main();
