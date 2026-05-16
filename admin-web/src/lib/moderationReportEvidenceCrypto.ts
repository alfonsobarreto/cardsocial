/**
 * Descifrado local (RAM) de evidencia de denuncias — mismo esquema que `services/moderationReportEvidenceCrypto.ts` en la app.
 */

import { gcm } from '@noble/ciphers/aes.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

const MODERATION_EVIDENCE_KDF_INFO = utf8ToBytes('card-social|moderation-report-evidence|v1');

const X25519_PK_LEN = 32;
const HKDF_SALT_BYTES = 32;
const GCM_IV_BYTES = 12;
const AES_KEY_BYTES = 32;

function base64ToBytes(b64: string): Uint8Array {
  const s = String(b64 || '').trim();
  if (!s) return new Uint8Array(0);
  const binary = atob(s);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function deriveAesKey(sharedSecret: Uint8Array, salt: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedSecret, salt, MODERATION_EVIDENCE_KDF_INFO, AES_KEY_BYTES);
}

export type ModerationEvidenceSealed = {
  evidenceCiphertext: string;
  evidenceIv: string;
  evidenceEphemPub: string;
};

export function openModerationEvidence(recipientSecretKey: Uint8Array, fields: ModerationEvidenceSealed): string {
  if (!(recipientSecretKey instanceof Uint8Array) || recipientSecretKey.length !== X25519_PK_LEN) {
    throw new Error('Clave privada X25519 inválida (se esperan 32 bytes).');
  }
  const ephemPub = base64ToBytes(fields.evidenceEphemPub);
  const iv = base64ToBytes(fields.evidenceIv);
  const packed = base64ToBytes(fields.evidenceCiphertext);
  if (ephemPub.length !== X25519_PK_LEN || iv.length !== GCM_IV_BYTES) {
    throw new Error('Campos de evidencia corruptos.');
  }
  if (packed.length < HKDF_SALT_BYTES + 16) {
    throw new Error('Ciphertext demasiado corto.');
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
    throw new Error(`Descifrado fallido — ${msg}`);
  }
}
