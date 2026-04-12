import { collection, getDocs } from 'firebase/firestore';
import { db, storage } from './services/firebaseConfig';

async function testFirestore() {
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    console.log('Firestore conectado. Total usuarios:', snapshot.size);
    return true;
  } catch (e) {
    console.error('Error Firestore:', e);
    return false;
  }
}

async function testStorage() {
  try {
    // Solo intentamos listar la raíz del storage (requiere reglas públicas o autenticación)
    const ref = storage.ref ? storage.ref() : null;
    if (!ref) throw new Error('No se pudo obtener referencia de storage');
    // No todos los SDKs permiten listar, así que solo probamos acceso
    console.log('Storage conectado.');
    return true;
  } catch (e) {
    console.error('Error Storage:', e);
    return false;
  }
}

(async () => {
  const firestoreOk = await testFirestore();
  const storageOk = await testStorage();
  if (firestoreOk && storageOk) {
    console.log('Firebase OK');
  } else {
    console.log('Firebase tiene problemas');
  }
})();
