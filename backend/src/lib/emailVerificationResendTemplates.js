/**
 * @deprecated Import desde `authTransactionalResendTemplates.js` para trabajo nuevo.
 * Re-export para rutas que aún referencian este módulo.
 */

const { buildVerificationEmail } = require('./authTransactionalResendTemplates');

module.exports = { buildVerificationEmail };
