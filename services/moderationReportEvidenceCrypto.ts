/**
 * Sobre criptográfico para evidencia de denuncias (X25519 + HKDF-SHA256 + AES-256-GCM).
 * Dominio separado del intercambio de llaves de tarjeta; empaqueta HKDF-salt || ciphertext en evidenceCiphertext.
 */

import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { Buffer } from 'buffer';

const MODERATION_EVIDENCE_KDF_INFO = utf8ToBytes('card-social|moderation-report-evidence|v1');
export const MODERATION_EVIDENCE_SCHEME = 'x25519-hkdf-aesgcm-v1' as const;
export const MODERATION_EVIDENCE_VERSION = 1 as const;

const X25519_PK_LEN = 32;
const HKDF_SALT_BYTES = 32;
const GCM_IV_BYTES = 12;
const AES_KEY_BYTES = 32;

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  const s = String(b64 || '').trim();
  if (!s) return new Uint8Array(0);
  try {
    return new Uint8Array(Buffer.from(s, 'base64'));
  } catch {
    throw new Error('ModerationEvidence: Base64 inválido.');
  }
}

function normalizeX25519PublicKey(pk: Uint8Array): Uint8Array {
  if (!(pk instanceof Uint8Array) || pk.length !== X25519_PK_LEN) {
    throw new Error('ModerationEvidence: se esperaba clave pública X25519 (32 bytes).');
  }
  return pk;
}

function deriveAesKey(sharedSecret: Uint8Array, salt: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedSecret, salt, MODERATION_EVIDENCE_KDF_INFO, AES_KEY_BYTES);
}

export type ModerationEvidenceSealed = {
  evidenceCiphertext: string;
  evidenceIv: string;
  evidenceEphemPub: string;
};

/** Cifra texto UTF-8 para el superadmin (clave pública X25519 en bruto, 32 bytes). */
export function sealModerationEvidence(recipientPublicKey: Uint8Array, plaintextUtf8: string): ModerationEvidenceSealed {
  const peerPk = normalizeX25519PublicKey(recipientPublicKey);
  const plain = utf8ToBytes(plaintextUtf8);
  const ephem = x25519.keygen();
  const shared = x25519.getSharedSecret(ephem.secretKey, peerPk);
  const salt = randomBytes(HKDF_SALT_BYTES);
  const aesKey = deriveAesKey(shared, salt);
  const iv = randomBytes(GCM_IV_BYTES);
  const aes = gcm(aesKey, iv);
  const ct = aes.encrypt(plain);
  const packed = new Uint8Array(salt.length + ct.length);
  packed.set(salt, 0);
  packed.set(ct, salt.length);
  return {
    evidenceEphemPub: bytesToBase64(ephem.publicKey),
    evidenceIv: bytesToBase64(iv),
    evidenceCiphertext: bytesToBase64(packed),
  };
}

/** Descifra en RAM; `recipientSecretKey` = X25519 sk (32 bytes). */
export function openModerationEvidence(
  recipientSecretKey: Uint8Array,
  fields: ModerationEvidenceSealed,
): string {
  if (!(recipientSecretKey instanceof Uint8Array) || recipientSecretKey.length !== X25519_PK_LEN) {
    throw new Error('ModerationEvidence: clave privada X25519 inválida.');
  }
  const ephemPub = base64ToBytes(fields.evidenceEphemPub);
  const iv = base64ToBytes(fields.evidenceIv);
  const packed = base64ToBytes(fields.evidenceCiphertext);
  if (ephemPub.length !== X25519_PK_LEN || iv.length !== GCM_IV_BYTES) {
    throw new Error('ModerationEvidence: iv o clave efímera corruptos.');
  }
  if (packed.length < HKDF_SALT_BYTES + 16) {
    throw new Error('ModerationEvidence: ciphertext demasiado corto.');
  }
  const salt = packed.slice(0, HKDF_SALT_BYTES);
  const ct = packed.slice(HKDF_SALT_BYTES);
  const shared = x25519.getSharedSecret(recipientSecretKey, ephemPub);
  const aesKey = deriveAesKey(shared, salt);
  try {
    const aes = gcm(aesKey, iv);
    const pt = aes.decrypt(ct);
    return new TextDecoder('utf-8', { fatal: true }).decode(pt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`ModerationEvidence: descifrado fallido — ${msg}`);
  }
}
