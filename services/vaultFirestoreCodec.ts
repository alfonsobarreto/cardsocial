import { isGhostLinkVaultType } from '../constants/ghostLinkVault';
import { decryptPayload, encryptPayload } from './cryptoService';
import { VAULT_AES_KEY_BYTES } from './vaultCryptoConstants';
import { deleteField, type FieldValue } from 'firebase/firestore';

export const VAULT_CIPHER_VERSION = 1;

/** Título mostrado cuando el búnker está bloqueado o el descifrado falla. */
export const VAULT_LINK_REDACTED_TITLE = '••••••••';

export type VaultLinkLogical = {
  id: string;
  /** Copiado en claro al documento Firestore cuando se provee (dueño de la bóveda). */
  uid?: string;
  title: string;
  type: string;
  value: string;
  iconName: string;
  icon?: string;
  /** isProtected en producto; campo Firestore: vaultProtected */
  vaultProtected?: boolean;
  isFavorite: boolean;
  createdAt?: string;
  updatedAt?: string;
  vaultMimeType?: string;
  iconVaultId?: string;
  category?: string;
};

/** Solo campos sensibles empaquetados en JSON antes de encryptPayload (paridad app ↔ Studio). */
type VaultSecureInnerV1 = {
  title: string;
  value: string;
  category: string;
  vaultMimeType: string;
};

type BaseStructural = {
  id: string;
  uid?: string;
  type: string;
  iconName: string;
  icon?: string;
  vaultProtected?: boolean;
  isFavorite: boolean;
  createdAt?: string;
  updatedAt?: string;
};

function baseStructural(id: string, data: Record<string, unknown>): BaseStructural {
  const uidRaw = data.uid;
  return {
    id,
    uid: uidRaw != null && String(uidRaw).trim() !== '' ? String(uidRaw) : undefined,
    type: String(data.type ?? ''),
    iconName: String(data.iconName ?? ''),
    icon: data.icon != null ? String(data.icon) : undefined,
    vaultProtected:
      data.vaultProtected === true ? true : data.vaultProtected === false ? false : undefined,
    isFavorite: Boolean(data.isFavorite),
    createdAt: data.createdAt != null ? String(data.createdAt) : undefined,
    updatedAt: data.updatedAt != null ? String(data.updatedAt) : undefined,
  };
}

function mergeLogical(
  st: BaseStructural,
  fields: {
    title: string;
    value: string;
    category?: string;
    vaultMimeType?: string;
    iconVaultId?: string;
  },
): VaultLinkLogical {
  return {
    ...st,
    title: fields.title,
    value: fields.value,
    category: fields.category,
    vaultMimeType: fields.vaultMimeType,
    iconVaultId: fields.iconVaultId,
  };
}

function redactedForLockedBunker(st: BaseStructural, plainIconVaultId?: string): VaultLinkLogical {
  return mergeLogical(st, {
    title: VAULT_LINK_REDACTED_TITLE,
    value: '',
    category: '',
    vaultMimeType: undefined,
    iconVaultId: plainIconVaultId,
  });
}

type FirestoreWrite = Record<string, unknown> & {
  uid?: string | FieldValue;
  title?: string | FieldValue;
  value?: string | FieldValue;
  category?: string | FieldValue;
  vaultMimeType?: string | FieldValue;
  iconVaultId?: string | FieldValue;
  securePayload?: string | FieldValue;
  secureIv?: string | FieldValue;
  vaultCipherVersion?: number | FieldValue;
};

function structuralWrite(link: VaultLinkLogical): Omit<FirestoreWrite, 'title' | 'value' | 'category' | 'vaultMimeType'> {
  const w: FirestoreWrite = {
    id: link.id,
    type: link.type,
    icon: link.icon,
    iconName: link.iconName,
    isFavorite: link.isFavorite,
    vaultProtected: link.vaultProtected,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
  if (link.uid != null && String(link.uid).trim() !== '') {
    w.uid = link.uid;
  }
  if (link.iconVaultId != null && String(link.iconVaultId).trim() !== '') {
    w.iconVaultId = link.iconVaultId;
  }
  return w;
}

/**
 * Interceptor de escritura: empaqueta title/value/category/vaultMimeType en securePayload cuando hay clave.
 * iconVaultId, type, icon*, favorito y fechas permanecen en claro. Elimina rastro del texto sensible con deleteField().
 */
export async function encodeVaultLink(
  link: VaultLinkLogical,
  vaultEncryptionKey: Uint8Array | null,
): Promise<FirestoreWrite> {
  const structural = structuralWrite(link);

  if (isGhostLinkVaultType(link.type)) {
    return {
      ...structural,
      title: link.title,
      value: link.value,
      ...(link.category ? { category: link.category } : {}),
      ...(link.vaultMimeType ? { vaultMimeType: link.vaultMimeType } : {}),
    };
  }

  if (!vaultEncryptionKey || vaultEncryptionKey.length !== VAULT_AES_KEY_BYTES) {
    return {
      ...structural,
      title: link.title,
      value: link.value,
      ...(link.category != null && link.category !== '' ? { category: link.category } : {}),
      ...(link.vaultMimeType != null && link.vaultMimeType !== ''
        ? { vaultMimeType: link.vaultMimeType }
        : {}),
      securePayload: deleteField(),
      secureIv: deleteField(),
      vaultCipherVersion: deleteField(),
    };
  }

  const inner: VaultSecureInnerV1 = {
    title: link.title,
    value: link.value,
    category: link.category ?? '',
    vaultMimeType: link.vaultMimeType ?? '',
  };
  const { ciphertext, iv } = await encryptPayload(JSON.stringify(inner), vaultEncryptionKey);
  return {
    ...structural,
    securePayload: ciphertext,
    secureIv: iv,
    vaultCipherVersion: VAULT_CIPHER_VERSION,
    title: deleteField(),
    value: deleteField(),
    category: deleteField(),
    vaultMimeType: deleteField(),
  };
}

/** @deprecated Usar encodeVaultLink. */
export const encodeVaultLinkForFirestoreWrite = encodeVaultLink;

/**
 * Interceptor de lectura: descifra securePayload o devuelve título ofuscado y valores vacíos si no hay clave.
 */
export async function decodeVaultLink(
  id: string,
  data: Record<string, unknown>,
  vaultEncryptionKey: Uint8Array | null,
): Promise<VaultLinkLogical> {
  const st = baseStructural(id, data);
  const iconVaultPlain =
    data.iconVaultId != null && String(data.iconVaultId).trim() !== ''
      ? String(data.iconVaultId)
      : undefined;

  if (isGhostLinkVaultType(st.type)) {
    return mergeLogical(st, {
      title: String(data.title ?? ''),
      value: String(data.value ?? ''),
      category: data.category != null ? String(data.category) : undefined,
      vaultMimeType: data.vaultMimeType != null ? String(data.vaultMimeType) : undefined,
      iconVaultId: iconVaultPlain,
    });
  }

  const versionRaw = data.vaultCipherVersion;
  const version = typeof versionRaw === 'number' ? versionRaw : Number(versionRaw);
  const payload = typeof data.securePayload === 'string' ? data.securePayload.trim() : '';
  const secureIv = typeof data.secureIv === 'string' ? data.secureIv.trim() : '';

  if (payload.length > 0 && secureIv.length > 0) {
    if (version !== VAULT_CIPHER_VERSION) {
      return redactedForLockedBunker(st, iconVaultPlain);
    }
    if (!vaultEncryptionKey || vaultEncryptionKey.length !== VAULT_AES_KEY_BYTES) {
      return redactedForLockedBunker(st, iconVaultPlain);
    }
    try {
      const plain = await decryptPayload(payload, secureIv, vaultEncryptionKey);
      const inner = JSON.parse(plain) as VaultSecureInnerV1 & { iconVaultId?: string };
      const iconVaultFromLegacyInner =
        inner.iconVaultId != null && String(inner.iconVaultId).trim() !== ''
          ? String(inner.iconVaultId)
          : undefined;
      return mergeLogical(st, {
        title: String(inner.title ?? ''),
        value: String(inner.value ?? ''),
        category: inner.category ? String(inner.category) : undefined,
        vaultMimeType: inner.vaultMimeType ? String(inner.vaultMimeType) : undefined,
        iconVaultId: iconVaultPlain ?? iconVaultFromLegacyInner,
      });
    } catch {
      return redactedForLockedBunker(st, iconVaultPlain);
    }
  }

  return mergeLogical(st, {
    title: String(data.title ?? ''),
    value: String(data.value ?? ''),
    category: data.category != null ? String(data.category) : undefined,
    vaultMimeType: data.vaultMimeType != null ? String(data.vaultMimeType) : undefined,
    iconVaultId: iconVaultPlain,
  });
}

/** @deprecated Usar decodeVaultLink. */
export const decodeVaultFirestoreDoc = decodeVaultLink;

export async function decodeVaultFirestoreQueryDocs(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>,
  getKey: () => Promise<Uint8Array | null>,
): Promise<VaultLinkLogical[]> {
  const key = await getKey();
  return Promise.all(
    docs.map((d) => decodeVaultLink(d.id, d.data() as Record<string, unknown>, key)),
  );
}

/** App Expo: siempre datos en claro en Firestore (sin passphrase E2E). Studio Web sigue usando su propia clave. */
export function vaultAppEncryptionKeyNever(): Promise<Uint8Array | null> {
  return Promise.resolve(null);
}
