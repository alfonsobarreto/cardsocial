import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Tu configuración de Firebase (SIN Analytics)
const firebaseConfig = {
  apiKey: "AIzaSyBF-DGMoQAtaf49sMcsVgGJLtoAyTAHwgA",
  authDomain: "card-social-app.firebaseapp.com",
  projectId: "card-social-app",
  storageBucket: "card-social-app.firebasestorage.app",
  messagingSenderId: "604587233093",
  appId: "1:604587233093:web:76abc315ea9326b5fdf82c"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Exportar servicios para usar en toda la app
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;