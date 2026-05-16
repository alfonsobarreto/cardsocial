import { doc, getDoc } from 'firebase/firestore';

import { db } from '@/services/firebaseConfig';
import { MODERATION_EVIDENCE_SCHEME } from '@/services/moderationReportEvidenceCrypto';

export const MODERATION_IDENTITY_DOC_ID = 'moderation_identity' as const;

/** Lee la identidad X25519 de moderación publicada en Firestore. */
export async function fetchModerationPublicKeyX25519(): Promise<Uint8Array | null> {
  const snap = await getDoc(doc(db, 'system_config', MODERATION_IDENTITY_DOC_ID));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  const scheme = typeof data.scheme === 'string' ? data.scheme : '';
  if (scheme !== MODERATION_EVIDENCE_SCHEME) return null;
  const b64 = typeof data.publicKeyB64 === 'string' ? data.publicKeyB64.trim() : '';
  if (!b64) return null;
  try {
    const buf = Uint8Array.from(Buffer.from(b64, 'base64'));
    if (buf.length !== 32) return null;
    return buf;
  } catch {
    return null;
  }
}
