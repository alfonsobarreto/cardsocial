/**
 * Cliente Mercado Pago (Checkout Pro / Preferences API).
 * Token: `MERCADOPAGO_ACCESS_TOKEN` (producción o sandbox APP_USR-…).
 */

const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

let preferenceClient = null;
let paymentClient = null;

function getAccessToken() {
  return String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
}

function isMercadoPagoConfigured() {
  return Boolean(getAccessToken());
}

function getPublicKey() {
  return String(process.env.MERCADOPAGO_PUBLIC_KEY || '').trim();
}

function useSandboxCheckout() {
  const raw = String(process.env.MERCADOPAGO_SANDBOX || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function getClient() {
  const accessToken = getAccessToken();
  if (!accessToken) {
    const err = new Error('Mercado Pago access token not configured');
    err.code = 'mp_not_configured';
    throw err;
  }
  return new MercadoPagoConfig({ accessToken });
}

function getPreferenceClient() {
  if (!preferenceClient) {
    preferenceClient = new Preference(getClient());
  }
  return preferenceClient;
}

function getPaymentClient() {
  if (!paymentClient) {
    paymentClient = new Payment(getClient());
  }
  return paymentClient;
}

module.exports = {
  getAccessToken,
  getPublicKey,
  isMercadoPagoConfigured,
  useSandboxCheckout,
  getPreferenceClient,
  getPaymentClient,
};
