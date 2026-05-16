/**
 * Fase C — identidad asimétrica para intercambio de llaves de tarjeta (X25519 + HKDF + AES-GCM).
 * Implementación isomórfica: @noble/curves + @noble/hashes + @noble/ciphers (Hermes / browser).
 *
 * Clave privada: SecureStore en nativo; sessionStorage en web (pestaña).
 * Clave pública: publicar en Firestore vía `keySharingService` (no en este módulo).
 */

import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { Buffer } from 'buffer';

import { VAULT_AES_KEY_BYTES } from '@/services/vaultCryptoConstants';

const SHARING_KDF_INFO = utf8ToBytes('card-social|shared-card-key|v1');
const SHARING_SCHEME = 'x25519-hkdf-aesgcm-v1' as const;
const SHARING_ENVELOPE_VERSION = 1 as const;
const X25519_PK_LEN = 32;
const HKDF_SALT_BYTES = 32;
const GCM_IV_BYTES = 12;

/** Misma convención que `cryptoService` para RN vs Web con Subtle. */
function isReactNativeRuntime(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator as { product?: string }).product === 'ReactNative'
  );
}

const SHARING_SK_SESSION_KEY = 'card_social_sharing_x25519_sk_b64';

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  const s = String(b64 || '').trim();
  if (!s) {
    return new Uint8Array(0);
  }
  try {
    return new Uint8Array(Buffer.from(s, 'base64'));
  } catch {
    throw new Error('KeyPair: Base64 inválido.');
  }
}

export { SHARING_SCHEME, SHARING_ENVELOPE_VERSION };

export type SharingKeyEnvelopeV1 = {
  v: typeof SHARING_ENVELOPE_VERSION;
  scheme: typeof SHARING_SCHEME;
  ephemPubB64: string;
  saltB64: string;
  ivB64: string;
  ctB64: string;
};

export function generateSharingKeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
  const { publicKey, secretKey } = x25519.keygen();
  return { publicKey, secretKey };
}

function normalizeX25519PublicKey(pk: Uint8Array): Uint8Array {
  if (!(pk instanceof Uint8Array) || pk.length !== X25519_PK_LEN) {
    throw new Error('KeyPair: se esperaba clave pública X25519 (32 bytes).');
  }
  return pk;
}

function normalizeCardKey(cardKey: Uint8Array): Uint8Array {
  if (!(cardKey instanceof Uint8Array) || cardKey.length !== VAULT_AES_KEY_BYTES) {
    throw new Error('KeyPair: se esperaba cardKey de 32 bytes (AES-256 de bóveda).');
  }
  return cardKey;
}

function deriveAesKeyFromSharedSecret(sharedSecret: Uint8Array, salt: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedSecret, salt, SHARING_KDF_INFO, VAULT_AES_KEY_BYTES);
}

/** Cifrado ECIES-style: ephemeral X25519, HKDF-SHA256, AES-256-GCM sobre la clave simétrica en bruto. */
export function sealCardKeyForRecipient(recipientPublicKey: Uint8Array, cardKey: Uint8Array): SharingKeyEnvelopeV1 {
  const peerPk = normalizeX25519PublicKey(recipientPublicKey);
  const plain = normalizeCardKey(cardKey);
  const ephem = x25519.keygen();
  const shared = x25519.getSharedSecret(ephem.secretKey, peerPk);
  const salt = randomBytes(HKDF_SALT_BYTES);
  const aesKey = deriveAesKeyFromSharedSecret(shared, salt);
  const iv = randomBytes(GCM_IV_BYTES);
  const aes = gcm(aesKey, iv);
  const ct = aes.encrypt(plain);
  return {
    v: SHARING_ENVELOPE_VERSION,
    scheme: SHARING_SCHEME,
    ephemPubB64: bytesToBase64(ephem.publicKey),
    saltB64: bytesToBase64(salt),
    ivB64: bytesToBase64(iv),
    ctB64: bytesToBase64(ct),
  };
}

/** Recupera la clave simétrica de la tarjeta a partir de la identidad local y el sobre. */
export function openCardKeyEnvelope(recipientSecretKey: Uint8Array, envelope: SharingKeyEnvelopeV1): Uint8Array {
  if (envelope.v !== SHARING_ENVELOPE_VERSION || envelope.scheme !== SHARING_SCHEME) {
    throw new Error('KeyPair: sobre de compartición incompatible.');
  }
  const ephemPub = base64ToBytes(envelope.ephemPubB64);
  const salt = base64ToBytes(envelope.saltB64);
  const iv = base64ToBytes(envelope.ivB64);
  const ct = base64ToBytes(envelope.ctB64);
  if (salt.length !== HKDF_SALT_BYTES || iv.length !== GCM_IV_BYTES || ephemPub.length !== X25519_PK_LEN) {
    throw new Error('KeyPair: campos del sobre corruptos o truncados.');
  }
  const shared = x25519.getSharedSecret(recipientSecretKey, ephemPub);
  const aesKey = deriveAesKeyFromSharedSecret(shared, salt);
  try {
    const aes = gcm(aesKey, iv);
    const pt = aes.decrypt(ct);
    return normalizeCardKey(pt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`KeyPair: descifrado del sobre fallido — ${msg}`);
  }
}

async function loadExpoSecureStore(): Promise<typeof import('expo-secure-store')> {
  return import('expo-secure-store');
}

/** Persiste la clave privada X25519 local (rotación: sobrescribe). */
export async function persistLocalSharingSecretKey(secretKey: Uint8Array): Promise<void> {
  if (!(secretKey instanceof Uint8Array) || secretKey.length !== X25519_PK_LEN) {
    throw new Error('KeyPair: clave privada X25519 inválida.');
  }
  const b64 = bytesToBase64(secretKey);
  if (isReactNativeRuntime()) {
    const SecureStore = await loadExpoSecureStore();
    const opts = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
    await SecureStore.setItemAsync(SHARING_SK_SESSION_KEY, b64, opts);
    return;
  }
  if (typeof sessionStorage === 'undefined') {
    throw new Error('KeyPair: sessionStorage no disponible (¿SSR?).');
  }
  sessionStorage.setItem(SHARING_SK_SESSION_KEY, b64);
}

export async function loadLocalSharingSecretKey(): Promise<Uint8Array | null> {
  let b64: string | null = null;
  if (isReactNativeRuntime()) {
    const SecureStore = await loadExpoSecureStore();
    const opts = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
    b64 = await SecureStore.getItemAsync(SHARING_SK_SESSION_KEY, opts);
  } else if (typeof sessionStorage !== 'undefined') {
    b64 = sessionStorage.getItem(SHARING_SK_SESSION_KEY);
  }
  if (b64 == null || String(b64).trim() === '') {
    return null;
  }
  const sk = base64ToBytes(b64);
  if (sk.length !== X25519_PK_LEN) {
    return null;
  }
  return sk;
}

/** Obtiene la clave pública local derivada de la clave privada persistida. */
export async function getLocalSharingPublicKeyBytes(): Promise<Uint8Array | null> {
  const sk = await loadLocalSharingSecretKey();
  if (sk == null) {
    return null;
  }
  return x25519.getPublicKey(sk);
}

/**
 * Genera (si no existe) un par X25519, persiste solo la clave privada y devuelve la clave pública en bruto.
 * El caller debe subir la pública a Firestore cuando se desee compartir tarjetas.
 */
export async function ensureLocalSharingIdentityKeyPair(): Promise<Uint8Array> {
  const existing = await loadLocalSharingSecretKey();
  if (existing != null) {
    return x25519.getPublicKey(existing);
  }
  const { publicKey, secretKey } = generateSharingKeyPair();
  await persistLocalSharingSecretKey(secretKey);
  return publicKey;
}