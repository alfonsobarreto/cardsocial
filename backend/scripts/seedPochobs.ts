/**
 * SCRIPT DE SEEDING - CUENTA POCHOBS (CEO BÚNKER MASTER)
 * 
 * Este archivo documenta cómo crear la cuenta super_admin de Pochobs
 * en Firestore con créditos infinitos (999M) y acceso al AdminDashboard.
 * 
 * INSTRUCCIONES DE EJECUCIÓN:
 * 
 * 1. Desde Firebase Console (console.firebase.google.com):
 *    - Ir a tu proyecto Card-Social
 *    - Abrir Firestore Database
 *    - En la colección "users", crear un nuevo documento
 * 
 * 2. Configurar el documento con estos datos:
 *    - Document ID: (obtener del UID de Pochobs después del registro, o usar uno de prueba)
 *    - Copiar y pegar el JSON a continuación en formato raw
 * 
 * ==============================================================================
 * 
 * DOCUMENTO POCHOBS (Raw JSON para Firestore):
 * 
 * {
 *   "uid": "pochobs_super_admin_uid_12345",
 *   "fullName": "Alfonso Barreto",
 *   "firstName": "Alfonso",
 *   "lastName": "Barreto",
 *   "nickname": "Pochobs",
 *   "nicknameLower": "pochobs",
 *   "email": "pochobs@cardsocial.com",
 *   "phone": "+1-555-0100",
 *   "role": "super_admin",
 *   "creditsBalance": 999999999,
 *   "premiumUntil": "2099-12-31T23:59:59Z",
 *   "subscriptionStatus": "active",
 *   "verificationStatus": "verified",
 *   "photoUrl": "https://firebasestorage.googleapis.com/pochobs-profile-photo.jpg",
 *   "createdAt": "2024-01-01T00:00:00Z",
 *   "updatedAt": "2024-01-01T00:00:00Z",
 *   "lastLogin": "2024-12-20T12:00:00Z",
 *   "qrStats": {
 *     "totalGenerated": 0,
 *     "totalRedeemed": 0,
 *     "totalCreditsGifted": 0
 *   },
 *   "isActive": true,
 *   "biometricEnabled": true,
 *   "defaultCard": "Social",
 *   "blockedUsers": [],
 *   "starredContacts": []
 * }
 * 
 * ==============================================================================
 * 
 * ALTERNATIVA - Via Node.js Script (si tienes Firebase Admin SDK configurado):
 * 
 * import admin from 'firebase-admin';
 * 
 * const db = admin.firestore();
 * 
 * const pochobsData = {
 *   uid: 'pochobs_super_admin_uid_12345',
 *   fullName: 'Alfonso Barreto',
 *   firstName: 'Alfonso',
 *   lastName: 'Barreto',
 *   nickname: 'Pochobs',
 *   nicknameLower: 'pochobs',
 *   email: 'pochobs@cardsocial.com',
 *   phone: '+1-555-0100',
 *   role: 'super_admin',
 *   creditsBalance: 999999999,
 *   premiumUntil: new Date('2099-12-31'),
 *   subscriptionStatus: 'active',
 *   verificationStatus: 'verified',
 *   createdAt: admin.firestore.Timestamp.now(),
 *   updatedAt: admin.firestore.Timestamp.now(),
 *   qrStats: {
 *     totalGenerated: 0,
 *     totalRedeemed: 0,
 *     totalCreditsGifted: 0,
 *   },
 *   isActive: true,
 *   biometricEnabled: true,
 * };
 * 
 * async function seedPochobs() {
 *   try {
 *     const docRef = db.collection('users').doc('pochobs_super_admin_uid_12345');
 *     await docRef.set(pochobsData);
 *     console.log('✅ Pochobs account seeded successfully');
 *   } catch (error) {
 *     console.error('❌ Error seeding Pochobs:', error);
 *   }
 * }
 * 
 * seedPochobs();
 * 
 * ==============================================================================
 * 
 * VERIFICACIÓN DESPUÉS DE SEEDING:
 * 
 * En la app, después de hacer login con Pochobs:
 * 
 * 1. Abrir el drawer (hamburguesa)
 * 2. Si el rol es 'super_admin', verás "The Mint 👑" en el menú
 * 3. Al tocar "The Mint 👑", se abre el AdminDashboard con 3 tabs:
 *    - Mint: Crear nuevos QRs de regalo
 *    - QR History: Ver todos los QRs generados
 *    - Audit: Ver registro de todas las transacciones de regalo
 * 
 * 4. Verificar balance: Debe mostrar 999,999,999 CS
 * 5. Premium Status: Debe decir "Activo hasta 2099"
 * 
 * ==============================================================================
 * 
 * NOTAS DE SEGURIDAD:
 * 
 * - Este documento solo debe existir en ambiente de DEV/STAGING
 * - AI PRODUCTION, implementar autenticación de 2FA para Pochobs
 * - Los QRs generados por Pochobs tienen límites duros:
 *   * Máximo 3 meses de duración
 *   * Máximo 500 personas por código
 *   * Deducción INMEDIATA de créditos del balance
 * - Todas las transacciones se registran en qr_gifts/redemption_logs
 * 
 * ==============================================================================
 * 
 * PRÓXIMOS PASOS DESPUÉS DE SEEDING:
 * 
 * 1. Modificar app/(tabs)/_layout.tsx para:
 *    - Importar isSuperAdmin() de roleService
 *    - Agregar condición en el menú para mostrar "The Mint 👑"
 *    - Abrir AdminDashboard al presionar "The Mint"
 * 
 * 2. Probar flujo completo:
 *    - Login → Abre drawer → "The Mint 👑" visible
 *    - Generar QR de regalo → Verificar deducción en balance
 *    - Escanear QR con otro usuario → Verificar canje y auditoría
 * 
 * 3. Integrar con RevenueCat:
 *    - Webhook: Si Pochobs paga por publicidad/promoción,
 *      automáticamente genera créditos publicitarios
 */

export const POCHOBS_SEED_DATA = {
  uid: 'pochobs_super_admin_uid_12345',
  fullName: 'Alfonso Barreto',
  firstName: 'Alfonso',
  lastName: 'Barreto',
  nickname: 'Pochobs',
  nicknameLower: 'pochobs',
  email: 'pochobs@cardsocial.com',
  phone: '+1-555-0100',
  role: 'super_admin',
  creditsBalance: 999999999,
  premiumUntil: '2099-12-31T23:59:59Z',
  subscriptionStatus: 'active',
  verificationStatus: 'verified',
};
