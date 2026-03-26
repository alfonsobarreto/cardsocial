// Azure Email Service for Card-Social
const { EmailClient } = require('@azure/communication-email');

function createAzureEmailClient(connectionString) {
  return new EmailClient(connectionString);
}

async function sendAzureEmail({
  to,
  subject,
  text,
  html,
  from,
  connectionString,
}) {
  const client = createAzureEmailClient(connectionString);
  const message = {
    senderAddress: from,
    content: {
      subject,
      plainText: text,
      html: html || text,
    },
    recipients: {
      to: [{ address: to }],
    },
  };
  const poller = await client.beginSend(message);
  const result = await poller.pollUntilDone();
  if (result.status !== 'Succeeded') {
    throw new Error(`Azure Email send failed: ${result.error?.message || result.status}`);
  }
  return result;
}

module.exports = {
  sendAzureEmail,
};
