import { deriveKeyFromPasscode } from '@card-social/services/cryptoService';

const STORAGE_NS = 'cs_studio_vault_aes_b64_v1';

function keyForUid(uid: string): string {
  return `${STORAGE_NS}:${uid}`;
}

function u8ToB64(u8: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < u8.length; i++) {
    bin += String.fromCharCode(u8[i]!);
  }
  if (typeof btoa !== 'function') {
    throw new Error('btoa is not available');
  }
  return btoa(bin);
}

function b64ToU8(b64: string): Uint8Array | null {
  if (typeof atob !== 'function') {
    return null;
  }
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out.length === 32 ? out : null;
  } catch {
    return null;
  }
}

export function readStudioVaultE2eKey(uid: string): Uint8Array | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(keyForUid(uid));
    if (!raw) {
      return null;
    }
    return b64ToU8(raw);
  } catch {
    return null;
  }
}

export function storeStudioVaultE2eKey(uid: string, key: Uint8Array): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.setItem(keyForUid(uid), u8ToB64(key));
}

export function clearStudioVaultE2eKey(uid: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    sessionStorage.removeItem(keyForUid(uid));
  } catch {
    /* ignore */
  }
}

export async function unlockStudioVaultE2eWithPassphrase(uid: string, passphrase: string): Promise<void> {
  const key = await deriveKeyFromPasscode(passphrase, uid);
  storeStudioVaultE2eKey(uid, key);
}
