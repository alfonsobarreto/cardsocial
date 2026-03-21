import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';

export interface VaultCollectibleCertificate {
  id: string;
  title: string;
  type: string;
  value: string;
  assetToken?: string;
  packId?: string;
  tradable?: boolean;
  createdAt?: string;
}

export async function findCollectibleCertificateByHint(params: {
  userId: string;
  hintText: string;
}): Promise<VaultCollectibleCertificate | null> {
  const hint = String(params.hintText || '').trim().toLowerCase();
  if (!hint) {
    return null;
  }

  const snap = await getDocs(collection(db, 'users', params.userId, 'vault_certificates'));
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as VaultCollectibleCertificate[];
  if (!rows.length) {
    return null;
  }

  const exact = rows.find((row) =>
    String(row.title || '').toLowerCase().includes(hint) ||
    String(row.value || '').toLowerCase().includes(hint),
  );
  return exact || rows[0] || null;
}