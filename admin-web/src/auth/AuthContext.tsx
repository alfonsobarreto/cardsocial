import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { AuthContext, type AuthContextValue } from './useAuth';

const SUPER_ADMIN_EMAIL = 'pochobs@gmail.com';
const ACCESS_DENIED_REDIRECT = '/login?error=access_denied';

function isSuperAdmin(user: User | null) {
  return user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (nextUser && !isSuperAdmin(nextUser)) {
        setUser(null);
        setLoading(false);
        void signOut(auth).finally(() => {
          window.history.replaceState(null, '', ACCESS_DENIED_REDIRECT);
          window.dispatchEvent(new PopStateEvent('popstate'));
        });
        return;
      }

      setUser(nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const credential = await signInWithEmailAndPassword(auth, email, password);

        if (!isSuperAdmin(credential.user)) {
          await signOut(auth);
          throw new Error('super-admin-access-denied');
        }
      },
      logout: () => signOut(auth),
      isSuperAdmin,
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
