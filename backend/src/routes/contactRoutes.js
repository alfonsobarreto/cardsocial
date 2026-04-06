/**
 * Rutas HTTP de contactos comparten lógica con `qrRoutes.js` bajo `/api/qr/*`.
 * La fusión perfil Mongo → identidad en smart_cards vive en `lib/contactIdentityMerge.js`.
 */

module.exports = {
  ...require('../lib/contactIdentityMerge'),
};
