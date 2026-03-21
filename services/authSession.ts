import { signInAnonymously } from 'firebase/auth';
import { auth } from '@/services/firebaseConfig';

export const getActiveUserId = async (): Promise<string | null> => {
  try {
    if (auth.currentUser?.uid) {
      return auth.currentUser.uid;
    }

    const credential = await signInAnonymously(auth);
    return credential.user.uid;
  } catch (error) {
    console.warn('Unable to establish auth session:', error);
    return null;
  }
};
