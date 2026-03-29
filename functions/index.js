import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// Solo llama a initializeApp si no ha sido inicializado antes por otro archivo
if (!admin.apps.length) {
  admin.initializeApp();
}

export const purgeExpiredAccounts = functions.pubsub
  .schedule('every day 03:00')
  .timeZone('America/Chicago') // Zona horaria de Austin, Texas
  .onRun(async (context) => {
    const db = admin.firestore();
    
    // CORRECCIÓN CRÍTICA: Usar el objeto Timestamp de Firestore, no Date.now()
    const now = admin.firestore.Timestamp.now();

    const usersQuery = db
      .collection('users')
      .where('pendingDeletion', '==', true)
      .where('deletionDeadline', '<=', now);

    const snapshot = await usersQuery.get();

    if (snapshot.empty) {
      console.log('Operación de limpieza: Cero cuentas expiradas encontradas hoy.');
      return null;
    }

    const results = await Promise.allSettled(
      snapshot.docs.map(async (docSnap) => {
        const uid = docSnap.id;
        
        try {
          // 1. Destruir identidad en Auth
          await admin.auth().deleteUser(uid);
        } catch (authErr) {
          console.error(`Fallo al eliminar Auth del usuario ${uid}:`, authErr);
        }
        
        try {
          // 2. Destruir registro de datos en Firestore
          await db.collection('users').doc(uid).delete();
        } catch (firestoreErr) {
          console.error(`Fallo al eliminar Firestore del usuario ${uid}:`, firestoreErr);
        }
      })
    );

    // Auditoría de resultados
    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        console.error(`Error procesando la purga para el usuario ${snapshot.docs[idx].id}:`, result.reason);
      }
    });

    console.log(`Purga nocturna completada. Se procesaron y eliminaron ${snapshot.size} cuentas.`);
    return null;
  });
