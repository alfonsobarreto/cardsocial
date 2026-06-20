import { getActiveUserId } from '@/services/authSession';
import { getUserCreditsBalance } from '@/services/creditsService';
import { useEffect, useState } from 'react';

/** Saldo CS del usuario activo (0 si no hay sesión o falla la lectura). */
export function useUserCsBalance(enabled = true): { balance: number; loading: boolean } {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setBalance(0);
      setLoading(false);
      return;
    }
    let alive = true;
    void (async () => {
      setLoading(true);
      try {
        const uid = await getActiveUserId();
        const n = uid ? await getUserCreditsBalance(uid) : 0;
        if (alive) setBalance(Math.max(0, Math.floor(n) || 0));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  return { balance, loading };
}
