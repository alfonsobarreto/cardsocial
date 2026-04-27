import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth, type Persistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// `getReactNativePersistence` exists on the React Native `@firebase/auth` entry; the
// default `firebase/auth` TypeScript surface does not list it.
const { getReactNativePersistence } = require("@firebase/auth") as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};

/**
 * En React Native, el primer `getAuth()` sin dependencias puede inicializar Auth
 * con persistencia solo en memoria (mensaje NO_PERSISTENCE en el bundle RN de
 * `@firebase/auth`). Un cold start desde un deep link (p. ej. QR
 * `cardsocial://redeem?...`) deja entonces `currentUser === null` aunque el
 * usuario ya hubiera iniciado sesión.
 *
 * Registramos Auth con AsyncStorage. Tras Fast Refresh, `initializeAuth` ya
 * existe: usamos `getAuth`.
 */
const firebaseConfig = {
  apiKey: "AIzaSyBF-DGMoQAtaf49sMcsVgGJLtoAyTAHwgA",
  authDomain: "card-social-app.firebaseapp.com",
  projectId: "card-social-app",
  storageBucket: "card-social-app.appspot.com",
  messagingSenderId: "604587233093",
  appId: "1:604587233093:web:76abc315ea9326b5fdf82c",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function getOrCreateAuth() {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = getOrCreateAuth();
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
