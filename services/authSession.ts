import { auth } from '@/services/firebaseConfig';

/**
 * Returns the signed-in Firebase user uid, or null if nobody is authenticated.
 * Does not create anonymous sessions — avoids attributing local/cloud data to the wrong identity.
 */
export const getActiveUserId = async (): Promise<string | null> => {
  return auth.currentUser?.uid ?? null;
};
