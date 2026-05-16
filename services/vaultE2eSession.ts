import { Buffer } from 'buffer';
import * as SecureStore from 'expo-secure-store';
import { deriveKeyFromPasscode } from './cryptoService';

const STORE_KEY_PREFIX = 'vault_e2e_aes_key_b64_v1_';

function storeKeyForUid(uid: string): string {
  return `${STORE_KEY_PREFIX}${uid}`;
}

export async function setVaultE2eDerivedKey(uid: string, key: Uint8Array): Promise<void> {
  const b64 = Buffer.from(key).toString('base64');
  await SecureStore.setItemAsync(storeKeyForUid(uid), b64);
}

export async function getVaultE2eDerivedKey(uid: string): Promise<Uint8Array | null> {
  try {
    const b64 = await SecureStore.getItemAsync(storeKeyForUid(uid));
    if (!b64) return null;
    const buf = Buffer.from(b64, 'base64');
    if (buf.length !== 32) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export async function clearVaultE2eDerivedKey(uid: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(storeKeyForUid(uid));
  } catch {
    /* item may be absent */
  }
}

export async function unlockVaultE2eWithPassphrase(uid: string, passphrase: string): Promise<void> {
  const key = await deriveKeyFromPasscode(passphrase, uid);
  await setVaultE2eDerivedKey(uid, key);
}
