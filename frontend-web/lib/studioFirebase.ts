/**
 * Cliente Firebase solo para el browser (Auth; Firestore/Storage en fases posteriores).
 * Misma app que `services/firebaseConfig.ts` en el cliente móvil.
 *
 * Las claves `NEXT_PUBLIC_FIREBASE_*` se sustituyen en `next build` (GitHub Actions / local).
 * En Azure, la UI del browser usa los valores *empaquetados* en el JS; cámbialos en el job de
 * build (secrets + env del workflow) o vuelve a desplegar tras un build nuevo.
 * El servidor de Next para `/api/studio/*` usa `FIREBASE_SERVICE_ACCOUNT_JSON` (no NEXT_PUBLIC),
 * definida en Application settings del App Service (la hereda el proceso Node del API).
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const defaultWebConfig = {
  apiKey: 'AIzaSyBF-DGMoQAtaf49sMcsVgGJLtoAyTAHwgA',
  authDomain: 'card-social-app.firebaseapp.com',
  projectId: 'card-social-app',
  storageBucket: 'card-social-app.appspot.com',
  messagingSenderId: '604587233093',
  appId: '1:604587233093:web:76abc315ea9326b5fdf82c',
} as const;

function readPublicEnv(key: `NEXT_PUBLIC_FIREBASE_${string}`): string {
  if (typeof process === 'undefined' || !process.env) return '';
  return String(process.env[key] || '').trim();
}

const firebaseConfig = {
  apiKey: readPublicEnv('NEXT_PUBLIC_FIREBASE_API_KEY') || defaultWebConfig.apiKey,
  authDomain: readPublicEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN') || defaultWebConfig.authDomain,
  projectId: readPublicEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID') || defaultWebConfig.projectId,
  storageBucket: readPublicEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET') || defaultWebConfig.storageBucket,
  messagingSenderId:
    readPublicEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') || defaultWebConfig.messagingSenderId,
  appId: readPublicEnv('NEXT_PUBLIC_FIREBASE_APP_ID') || defaultWebConfig.appId,
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
