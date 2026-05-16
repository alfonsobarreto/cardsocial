/**
 * Fase C — conector Firestore para publicar identidad, compartir llaves de cifrado de tarjeta
 * y recuperarlas en el receptor (sobre X25519 + HKDF + AES-GCM).
 */

import { Buffer } from 'buffer';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore';

import { auth, db } from '@/services/firebaseConfig';
import { VAULT_AES_KEY_BYTES } from '@/services/vaultCryptoConstants';
import {
  ensureLocalSharingIdentityKeyPair,
  loadLocalSharingSecretKey,
  openCardKeyEnvelope,
  sealCardKeyForRecipient,
  SHARING_SCHEME,
  type SharingKeyEnvelopeV1,
} from '@/services/keyPairService';

const SHARING_IDENTITY_DOC = 'sharing_identity';
const SHARED_VAULT_KEYS = 'shared_vault_keys';

function toSharingEnvelope(data: unknown): SharingKeyEnvelopeV1 {
  if (data == null || typeof data !== 'object') {
    throw new Error('Compartición: sobre ausente o inválido.');
  }
  const e = data as Record<string, unknown>;
  return {
    v: Number(e.v) as SharingKeyEnvelopeV1['v'],
    scheme: e.scheme as SharingKeyEnvelopeV1['scheme'],
    ephemPubB64: String(e.ephemPubB64 ?? ''),
    saltB64: String(e.saltB64 ?? ''),
    ivB64: String(e.ivB64 ?? ''),
    ctB64: String(e.ctB64 ?? ''),
  };
}

/** Sube la clave pública para que otros usuarios puedan cifrarte paquetes de compartición. */
export async function publishSharingPublicKey(
  uid: string,
  publicKey: Uint8Array,
  firestore: Firestore = db,
): Promise<void> {
  const publicKeyB64 = Buffer.from(publicKey).toString('base64');
  await setDoc(
    doc(firestore, 'users', uid, 'crypto', SHARING_IDENTITY_DOC),
    {
      uid,
      scheme: SHARING_SCHEME,
      publicKeyB64,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Lee la clave pública de compartición del receptor desde `users/{targetUid}/crypto/sharing_identity`. */
export async function fetchRecipientSharingPublicKey(
  targetUid: string,
  firestore: Firestore = db,
): Promise<Uint8Array> {
  const snap = await getDoc(doc(firestore, 'users', targetUid, 'crypto', SHARING_IDENTITY_DOC));
  if (!snap.exists()) {
    throw new Error('Compartición: el destinatario no ha publicado clave de compartición.');
  }
  const data = snap.data();
  const scheme = data.scheme;
  const b64 = data.publicKeyB64;
  if (typeof b64 !== 'string' || scheme !== SHARING_SCHEME) {
    throw new Error('Compartición: documento de clave pública incompatible.');
  }
  const pk = new Uint8Array(Buffer.from(String(b64).trim(), 'base64'));
  if (pk.length !== 32) {
    throw new Error('Compartición: clave pública con longitud incorrecta.');
  }
  return pk;
}

/**
 * Cifra `cardKey` hacia `targetUid` y la almacena en `shared_vault_keys` para que el receptor la descargue.
 * Devuelve el id del documento creado.
 */
export async function shareCardEncryptionKey(
  targetUid: string,
  cardKey: Uint8Array,
  firestore: Firestore = db,
): Promise<string> {
  const user = auth.currentUser;
  if (user == null || !user.uid) {
    throw new Error('Compartición: se requiere sesión.');
  }
  const fromUid = user.uid;
  if (targetUid === fromUid) {
    throw new Error('Compartición: el destino debe ser otro usuario.');
  }
  if (!(cardKey instanceof Uint8Array) || cardKey.length !== VAULT_AES_KEY_BYTES) {
    throw new Error('Compartición: cardKey debe ser Uint8Array de 32 bytes.');
  }
  const recipientPk = await fetchRecipientSharingPublicKey(targetUid, firestore);
  const envelope = sealCardKeyForRecipient(recipientPk, cardKey);
  const ref = await addDoc(collection(firestore, SHARED_VAULT_KEYS), {
    scheme: SHARING_SCHEME,
    fromUid,
    toUid: targetUid,
    envelope,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Descifra un sobre ya cargado con la clave privada X25519 local. */
export async function decryptIncomingSharedCardKey(envelope: SharingKeyEnvelopeV1): Promise<Uint8Array> {
  const sk = await loadLocalSharingSecretKey();
  if (sk == null) {
    throw new Error('Compartición: no hay identidad local; genere y publique un par primero.');
  }
  return openCardKeyEnvelope(sk, envelope);
}

/**
 * Descarga un paquete de `shared_vault_keys` y recupera la `cardKey` si el documento está dirigido
 * al usuario autenticado (las reglas de Firestore ya limitan la lectura).
 */
export async function loadAndDecryptSharedCardKeyForCurrentUser(
  sharedKeyDocId: string,
  firestore: Firestore = db,
): Promise<{ cardKey: Uint8Array; fromUid: string }> {
  const user = auth.currentUser;
  if (user == null) {
    throw new Error('Compartición: se requiere sesión.');
  }
  const snap = await getDoc(doc(firestore, SHARED_VAULT_KEYS, sharedKeyDocId));
  if (!snap.exists()) {
    throw new Error('Compartición: paquete de llave no encontrado.');
  }
  const data = snap.data();
  if (String(data.toUid ?? '') !== user.uid) {
    throw new Error('Compartición: este paquete no está dirigido al usuario actual.');
  }
  const envelopeRaw = data.envelope;
  const envelope = toSharingEnvelope(envelopeRaw);
  const cardKey = await decryptIncomingSharedCardKey(envelope);
  return { cardKey, fromUid: String(data.fromUid ?? '') };
}

export type SharedVaultKeyDoc = {
  id: string;
  fromUid: string;
  toUid: string;
  envelope: SharingKeyEnvelopeV1;
  createdAt?: unknown;
};

/** Lista entradas recientes dirigidas al uid indicado (p. ej. `auth.currentUser.uid`). */
export async function listIncomingSharedCardKeyDocs(
  toUid: string,
  firestore: Firestore = db,
  max: number = 50,
): Promise<SharedVaultKeyDoc[]> {
  const q = query(
    collection(firestore, SHARED_VAULT_KEYS),
    where('toUid', '==', toUid),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  const out: SharedVaultKeyDoc[] = [];
  snap.forEach((d) => {
    const data = d.data();
    out.push({
      id: d.id,
      fromUid: String(data.fromUid ?? ''),
      toUid: String(data.toUid ?? ''),
      envelope: toSharingEnvelope(data.envelope),
      createdAt: data.createdAt,
    });
  });
  return out;
}

/** Genera identidad local si hace falta y publica la clave pública en Firestore. */
export async function ensureSharingIdentityPublished(firestore: Firestore = db): Promise<void> {
  const user = auth.currentUser;
  if (user == null) {
    throw new Error('Compartición: se requiere sesión.');
  }
  const pk = await ensureLocalSharingIdentityKeyPair();
  await publishSharingPublicKey(user.uid, pk, firestore);
}
