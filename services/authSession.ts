import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/services/firebaseConfig";

/**
 * Returns the signed-in Firebase user uid, or null if nobody is authenticated.
 * Waits for the first `onAuthStateChanged` tick so cold starts (deep links) do not
 * read `currentUser` before AsyncStorage persistence has hydrated.
 */
export const getActiveUserId = async (): Promise<string | null> => {
  if (auth.currentUser?.uid) {
    return auth.currentUser.uid;
  }

  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user?.uid ?? null);
    });
  });
};
