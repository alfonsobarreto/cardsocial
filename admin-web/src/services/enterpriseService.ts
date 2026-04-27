import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export type Organization = {
  id: string;
  name: string;
  ownerEmail: string;
  allocatedSeats: number;
  usedSeats: number;
  joinCode: string;
  isActive: boolean;
  createdAt?: Date | { toDate?: () => Date; seconds?: number } | null;
};

export type CreateOrganizationInput = {
  name: string;
  ownerEmail: string;
  allocatedSeats: number;
};

const ORGANIZATIONS = collection(db, 'organizations');

function randomJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const length = 8;
  let output = '';
  const cryptoObj = globalThis.crypto;

  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < length; i += 1) {
      output += chars[bytes[i] % chars.length];
    }
  } else {
    for (let i = 0; i < length; i += 1) {
      output += chars[Math.floor(Math.random() * chars.length)];
    }
  }

  return output;
}

function toMillis(value: Organization['createdAt']) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function normalizeOrganization(id: string, data: Partial<Organization>): Organization {
  return {
    id,
    name: String(data.name || 'Empresa sin nombre'),
    ownerEmail: String(data.ownerEmail || ''),
    allocatedSeats: Math.max(0, Number(data.allocatedSeats) || 0),
    usedSeats: Math.max(0, Number(data.usedSeats) || 0),
    joinCode: String(data.joinCode || ''),
    isActive: data.isActive !== false,
    createdAt: data.createdAt,
  };
}

export async function getOrganizations(): Promise<Organization[]> {
  const snapshot = await getDocs(ORGANIZATIONS);

  return snapshot.docs
    .map((item) => normalizeOrganization(item.id, item.data() as Partial<Organization>))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function createOrganization(input: CreateOrganizationInput): Promise<string> {
  const docRef = await addDoc(ORGANIZATIONS, {
    name: input.name.trim(),
    ownerEmail: input.ownerEmail.trim().toLowerCase(),
    allocatedSeats: Math.max(1, Math.floor(input.allocatedSeats)),
    usedSeats: 0,
    joinCode: randomJoinCode(),
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function setOrganizationActive(organizationId: string, isActive: boolean): Promise<void> {
  await updateDoc(doc(db, 'organizations', organizationId), {
    isActive,
    updatedAt: serverTimestamp(),
  });
}
