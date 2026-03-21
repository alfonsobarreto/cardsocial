import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';

export interface StudentPackGrantAudit {
  uid: string;
  emailLower: string;
  provider: string;
  amount: number;
  granted: boolean;
  source: string;
  grantedAtText: string;
}

export async function getStudentPackGrantAudits(maxRows: number = 100): Promise<StudentPackGrantAudit[]> {
  try {
    const ref = collection(db, 'student_pack_grants');
    const q = query(ref, orderBy('grantedAt', 'desc'), limit(maxRows));
    const snap = await getDocs(q);

    return snap.docs.map((row) => {
      const data = row.data() as Record<string, any>;
      const grantedAtValue = data.grantedAt?.toDate ? data.grantedAt.toDate() : null;
      return {
        uid: String(data.uid || row.id),
        emailLower: String(data.emailLower || ''),
        provider: String(data.provider || ''),
        amount: Number(data.amount || 0),
        granted: Boolean(data.granted),
        source: String(data.source || 'signup'),
        grantedAtText: grantedAtValue ? grantedAtValue.toLocaleString() : 'N/A',
      };
    });
  } catch (error) {
    console.error('Error loading student pack audits:', error);
    return [];
  }
}
