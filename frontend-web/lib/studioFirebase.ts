/**
 * Cliente Firebase solo para el browser (Auth; Firestore/Storage en fases posteriores).
 * Misma app que `services/firebaseConfig.ts` en el cliente móvil.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBF-DGMoQAtaf49sMcsVgGJLtoAyTAHwgA',
  authDomain: 'card-social-app.firebaseapp.com',
  projectId: 'card-social-app',
  storageBucket: 'card-social-app.appspot.com',
  messagingSenderId: '604587233093',
  appId: '1:604587233093:web:76abc315ea9326b5fdf82c',
} as const;

let app: FirebaseApp | null = null;

function getOrInitApp(): FirebaseApp {
  if (app) return app;
  if (getApps().length) {
    app = getApp();
    return app;
  }
  app = initializeApp(firebaseConfig);
  return app;
}

export function getStudioAuth(): Auth {
  return getAuth(getOrInitApp());
}

export function getStudioDb(): Firestore {
  return getFirestore(getOrInitApp());
}
