/**
 * Módulo A — motor criptográfico isomórfico (React Native / Hermes + Web / Next.js Studio).
 *
 * Inspección de dependencias (package.json raíz):
 * - @noble/ciphers, @noble/hashes: PBKDF2 + AES-GCM en JS puro (Metro / Hermes).
 * - buffer: codificación Base64 en todos los entornos.
 * - No usamos crypto-js ni expo-crypto para este módulo: la rama Web delega en la API estándar
 *   globalThis.crypto.subtle; la rama nativa evita depender de subtle (no portable en RN).
 *
 * Nota PBKDF2: el estándar de trabajo (ej. OWASP) recomienda iteraciones altas y crecientes.
 * El valor VAULT_PBKDF2_ITERATIONS está fijado en 310_000 como contrato criptográfico con datos
 * de bóveda ya persistidos; cambiarlo invalidaría llaves derivadas existentes.
 */

import { gcm } from '@noble/ciphers/aes.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { Buffer } from 'buffer';

import {
  VAULT_AES_KEY_BYTES,
  VAULT_GCM_IV_BYTES,
  VAULT_PBKDF2_ITERATIONS,
  VAULT_SALT_BYTES,
} from './vaultCryptoConstants';

export {
  VAULT_AES_KEY_BYTES,
  VAULT_GCM_IV_BYTES,
  VAULT_PBKDF2_ITERATIONS,
  VAULT_SALT_BYTES,
} from './vaultCryptoConstants';

/** Copia a `ArrayBuffer` propio para compatibilidad con `SubtleCrypto` y lib DOM/TS estricto. */
function u8ToArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u8.length);
  new Uint8Array(ab).set(u8);
  return ab;
}

function getSubtle(): SubtleCrypto | null {
  const c = globalThis.crypto;
  const s = c?.subtle;
  return typeof s?.importKey === 'function' && typeof s?.deriveBits === 'function' ? s : null;
}

/** Entorno React Native (Hermes): forzar Noble y no depender de polyfills frágiles de subtle. */
function isReactNativeRuntime(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator as { product?: string }).product === 'ReactNative'
  );
}

function useWebSubtleCrypto(): boolean {
  return !isReactNativeRuntime() && getSubtle() !== null;
}

function normalizeKey(key: unknown): Uint8Array {
  if (!(key instanceof Uint8Array) || key.length !== VAULT_AES_KEY_BYTES) {
    throw new Error('Vault crypto: expected 32-byte AES key (Uint8Array).');
  }
  return key;
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  let s = String(b64 || '').trim();
  if (!s) {
    return new Uint8Array(0);
  }
  try {
    return new Uint8Array(Buffer.from(s, 'base64'));
  } catch {
    throw new Error('Vault crypto: invalid Base64 encoding.');
  }
}

/** Sal determinista a partir del discriminador de cuenta (típicamente Firebase UID o cadena persistida). */
export function deriveVaultSaltFromUid(uid: string): Uint8Array {
  const h = sha256(utf8ToBytes(`card-social|vault-e2e-v1|${uid}`));
  return h.subarray(0, VAULT_SALT_BYTES);
}

function wrapCryptoFailure(context: string, cause: unknown): Error {
  const prev = cause instanceof Error ? cause.message : String(cause);
  return new Error(
    `Vault crypto: ${context} — authentication tag mismatch, wrong key/passcode, corrupted data, or tampering. (${prev})`,
  );
}

/** PBKDF2-HMAC-SHA256 → 256 bits (Web Crypto). */
async function deriveKeySubtle(passcode: string, saltBytes: Uint8Array): Promise<Uint8Array> {
  const subtle = getSubtle()!;
  const enc = new TextEncoder();
  const pw = new Uint8Array(enc.encode(passcode));
  const keyMaterial = await subtle.importKey('raw', u8ToArrayBuffer(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: u8ToArrayBuffer(saltBytes),
      iterations: VAULT_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    VAULT_AES_KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** PBKDF2-HMAC-SHA256 → 256 bits (@noble/hashes). */
function deriveKeyNoble(passcode: string, saltBytes: Uint8Array): Uint8Array {
  return pbkdf2(sha256, utf8ToBytes(passcode), saltBytes, {
    c: VAULT_PBKDF2_ITERATIONS,
    dkLen: VAULT_AES_KEY_BYTES,
  });
}

/**
 * Deriva una clave AES-256 a partir del passcode y un salt string (p. ej. UID).
 * Sal interna: hash SHA-256 acotado a 16 bytes (ver deriveVaultSaltFromUid).
 */
export async function deriveKeyFromPasscode(passcode: string, salt: string): Promise<Uint8Array> {
  const saltBytes = deriveVaultSaltFromUid(salt);
  if (useWebSubtleCrypto()) {
    return deriveKeySubtle(passcode, saltBytes);
  }
  return deriveKeyNoble(passcode, saltBytes);
}

async function encryptSubtle(plainText: string, key: Uint8Array): Promise<{ ciphertext: string; iv: string }> {
  const subtle = getSubtle()!;
  const iv = new Uint8Array(VAULT_GCM_IV_BYTES);
  globalThis.crypto.getRandomValues(iv);
  const enc = new TextEncoder();
  const cryptoKey = await subtle.importKey('raw', u8ToArrayBuffer(key), 'AES-GCM', false, ['encrypt']);
  const plainBuf = u8ToArrayBuffer(new Uint8Array(enc.encode(plainText)));
  const ct = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: u8ToArrayBuffer(iv), tagLength: 128 }, cryptoKey, plainBuf),
  );
  return { ciphertext: bytesToBase64(ct), iv: bytesToBase64(iv) };
}

function encryptNoble(plainText: string, key: Uint8Array): { ciphertext: string; iv: string } {
  const iv = randomBytes(VAULT_GCM_IV_BYTES);
  const aes = gcm(key, iv);
  const ct = aes.encrypt(utf8ToBytes(plainText));
  return { ciphertext: bytesToBase64(ct), iv: bytesToBase64(iv) };
}

/**
 * AES-GCM-256: IV aleatorio 12 bytes por operación; salida Base64 (ciphertext incluye tag de autenticación).
 */
export async function encryptPayload(
  plainText: string,
  key: any,
): Promise<{ ciphertext: string; iv: string }> {
  const k = normalizeKey(key);
  try {
    if (useWebSubtleCrypto()) {
      return encryptSubtle(plainText, k);
    }
    return encryptNoble(plainText, k);
  } catch (e) {
    throw wrapCryptoFailure('encryptPayload failed', e);
  }
}

async function decryptSubtle(ciphertext: string, iv: string, key: Uint8Array): Promise<string> {
  const subtle = getSubtle()!;
  const nonce = base64ToBytes(iv);
  const data = base64ToBytes(ciphertext);
  if (nonce.length !== VAULT_GCM_IV_BYTES) {
    throw new Error('Invalid IV length (expected 12 bytes for AES-GCM).');
  }
  const cryptoKey = await subtle.importKey('raw', u8ToArrayBuffer(key), 'AES-GCM', false, ['decrypt']);
  try {
    const pt = await subtle.decrypt(
      { name: 'AES-GCM', iv: u8ToArrayBuffer(nonce), tagLength: 128 },
      cryptoKey,
      u8ToArrayBuffer(data),
    );
    return Buffer.from(pt).toString('utf8');
  } catch (e) {
    throw wrapCryptoFailure('AES-GCM decrypt (subtle)', e);
  }
}

function decryptNoble(ciphertext: string, iv: string, key: Uint8Array): string {
  const nonce = base64ToBytes(iv);
  const data = base64ToBytes(ciphertext);
  if (nonce.length !== VAULT_GCM_IV_BYTES) {
    throw new Error('Invalid IV length (expected 12 bytes for AES-GCM).');
  }
  try {
    const aes = gcm(key, nonce);
    const pt = aes.decrypt(data);
    return Buffer.from(pt).toString('utf8');
  } catch (e) {
    throw wrapCryptoFailure('AES-GCM decrypt (noble)', e);
  }
}

export async function decryptPayload(ciphertext: string, iv: string, key: any): Promise<string> {
  const k = normalizeKey(key);
  if (useWebSubtleCrypto()) {
    return decryptSubtle(ciphertext, iv, k);
  }
  return decryptNoble(ciphertext, iv, k);
}

/** @deprecated Use encryptPayload; alias mantenido para interceptores de bóveda. */
export async function encryptData(
  plainText: string,
  key: any,
): Promise<{ ciphertext: string; iv: string }> {
  return encryptPayload(plainText, key);
}

/** @deprecated Use decryptPayload; alias mantenido para interceptores de bóveda. */
export async function decryptData(ciphertext: string, iv: string, key: any): Promise<string> {
  return decryptPayload(ciphertext, iv, key);
}
