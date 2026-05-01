import type { User } from 'firebase/auth';

import { adminBearer, readErrBody } from './adminApiAuth';

export type NfcStatus = 'unclaimed' | 'active' | 'paused' | 'lost' | 'blocked';

export type NfcCard = {
  nfcCardId: string;
  activationPin?: string | null;
  status: NfcStatus;
  owner?: string | null;
  mountedUrl?: string | null;
  createdAt?: string | null;
};

export type NfcBatch = {
  batchId: string;
  cards: NfcCard[];
  source: 'api' | 'mock';
};

const API_PREFIX = '/api/admin/nfc';

function randomDigits(length: number) {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (byte) => String(byte % 10)).join('');
  }

  return Array.from({ length }, () => String(Math.floor(Math.random() * 10))).join('');
}

function randomToken(length: number) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const cryptoObj = globalThis.crypto;
  let out = '';

  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < length; i += 1) {
      out += chars[bytes[i] % chars.length];
    }
  } else {
    for (let i = 0; i < length; i += 1) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
  }

  return out;
}

function makeNfcCardId() {
  return `CS-NFC-${randomToken(10)}`;
}

function normalizeCard(raw: Partial<NfcCard> & Record<string, unknown>): NfcCard {
  const mountedTarget = raw.mountedTarget as { publicUrl?: string } | undefined;

  return {
    nfcCardId: String(raw.nfcCardId || makeNfcCardId()),
    activationPin: raw.activationPin ? String(raw.activationPin) : raw.pin ? String(raw.pin) : null,
    status: ['unclaimed', 'active', 'paused', 'lost', 'blocked'].includes(String(raw.status))
      ? (String(raw.status) as NfcStatus)
      : 'unclaimed',
    owner: raw.owner ? String(raw.owner) : raw.ownerUid ? String(raw.ownerUid) : null,
    mountedUrl: raw.mountedUrl ? String(raw.mountedUrl) : mountedTarget?.publicUrl ?? null,
    createdAt: raw.createdAt ? String(raw.createdAt) : null,
  };
}

async function nfcAdminFetch<T>(
  firebaseUser: User,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { base, key, token } = await adminBearer(firebaseUser, 'admin.system');
  const url = `${base}${API_PREFIX}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-gateway-key': key,
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`NFC admin API failed: ${response.status} ${await readErrBody(response)}`);
  }

  return response.json() as Promise<T>;
}

export function generateMockNfcBatch(quantity: number): NfcBatch {
  const count = Math.max(1, Math.min(5000, Math.floor(quantity)));
  const now = new Date().toISOString();

  return {
    batchId: `batch_${Date.now()}`,
    source: 'mock',
    cards: Array.from({ length: count }, () => ({
      nfcCardId: makeNfcCardId(),
      activationPin: randomDigits(6),
      status: 'unclaimed',
      owner: null,
      mountedUrl: null,
      createdAt: now,
    })),
  };
}

export async function generateNfcBatch(firebaseUser: User, quantity: number): Promise<NfcBatch> {
  try {
    const data = await nfcAdminFetch<{ batchId?: string; cards?: unknown[] }>(firebaseUser, '/batches', {
      method: 'POST',
      body: JSON.stringify({ quantity }),
    });

    return {
      batchId: String(data.batchId || `batch_${Date.now()}`),
      source: 'api',
      cards: Array.isArray(data.cards)
        ? data.cards.map((item) => normalizeCard(item as Partial<NfcCard> & Record<string, unknown>))
        : [],
    };
  } catch (error) {
    console.warn('[nfcService] Falling back to mock batch:', error);
    return generateMockNfcBatch(quantity);
  }
}

export async function listNfcCards(firebaseUser: User): Promise<NfcCard[]> {
  try {
    const data = await nfcAdminFetch<{ cards?: unknown[]; nfcCards?: unknown[] }>(firebaseUser, '/cards');
    const raw = Array.isArray(data.cards) ? data.cards : Array.isArray(data.nfcCards) ? data.nfcCards : [];
    return raw.map((item) => normalizeCard(item as Partial<NfcCard> & Record<string, unknown>));
  } catch (error) {
    console.warn('[nfcService] Falling back to mock inventory:', error);
    return [
      {
        nfcCardId: 'CS-NFC-DEMO001',
        activationPin: '120493',
        status: 'unclaimed',
        owner: null,
        mountedUrl: null,
        createdAt: new Date().toISOString(),
      },
      {
        nfcCardId: 'CS-NFC-DEMO002',
        activationPin: null,
        status: 'active',
        owner: 'founder@cardsocial.me',
        mountedUrl: 'https://cardsocial.me/b/demo-business-card',
        createdAt: new Date().toISOString(),
      },
      {
        nfcCardId: 'CS-NFC-DEMO003',
        activationPin: null,
        status: 'lost',
        owner: 'uid_demo_123',
        mountedUrl: 'https://cardsocial.me/u/demo',
        createdAt: new Date().toISOString(),
      },
    ];
  }
}

export async function updateNfcCardStatus(
  firebaseUser: User,
  nfcCardId: string,
  status: Extract<NfcStatus, 'lost' | 'blocked'>,
) {
  try {
    await nfcAdminFetch(firebaseUser, `/cards/${encodeURIComponent(nfcCardId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  } catch (error) {
    console.warn('[nfcService] status update failed:', error);
    throw error;
  }
}

export function nfcCardsToCsv(cards: NfcCard[]) {
  const rows = [
    ['nfcCardId', 'activationPin', 'status', 'owner', 'mountedUrl'],
    ...cards.map((card) => [
      card.nfcCardId,
      card.activationPin || '',
      card.status,
      card.owner || '',
      card.mountedUrl || '',
    ]),
  ];

  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}
