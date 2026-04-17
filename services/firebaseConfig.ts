import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

/**
 * Firebase v12 removed the `getReactNativePersistence` helper: the React
 * Native build now ships AsyncStorage persistence *by default* when
 * `getAuth(app)` runs inside a RN environment. Calling `initializeAuth` with
 * the old helper throws `TypeError: getReactNativePersistence is not a function`
 * at runtime and the old `.d.ts` no longer exports it — so we rely on
 * `getAuth(app)`, which is the documented v12 pattern for both web and RN.
 *
 * Refs:
 *   https://firebase.google.com/docs/reference/js/auth#getauth
 *   Firebase JS SDK v12 release notes (auth RN persistence default)
 */
const firebaseConfig = {
  apiKey: "AIzaSyBF-DGMoQAtaf49sMcsVgGJLtoAyTAHwgA",
  authDomain: "card-social-app.firebaseapp.com",
  projectId: "card-social-app",
  storageBucket: "card-social-app.appspot.com",
  messagingSenderId: "604587233093",
  appId: "1:604587233093:web:76abc315ea9326b5fdf82c"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
