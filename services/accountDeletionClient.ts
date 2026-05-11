import { doc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/services/firebaseConfig';
import type { AppLanguage } from '@/services/language';
import { intlLocaleTagForAppLanguage, emailCopyLocaleFromAppLanguage } from '@/services/language';

export const ACCOUNT_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export function computeScheduledDeletionDeadline(from: Date = new Date()): Date {
  return new Date(from.getTime() + ACCOUNT_DELETION_GRACE_MS);
}

export function formatDeletionDeadlineDisplay(deadlineDate: Date, language: AppLanguage): string {
  return deadlineDate.toLocaleDateString(intlLocaleTagForAppLanguage(language), {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  });
}

function pickFirstNameForEmail(displayName: string | undefined): string {
  const s = String(displayName || '')
    .trim()
    .split(/\s+/)[0];
  return s || '';
}

async function postDeletionScheduledEmail(params: {
  deadlineDate: Date;
  emailCopyLocale: 'es' | 'en';
  intlLocaleTag: string;
  firstName: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  let idToken: string;
  try {
    idToken = await user.getIdToken();
  } catch {
    return;
  }
  const apiBase = (
    process.env.EXPO_PUBLIC_BACKEND_BASE_URL ??
    process.env.EXPO_PUBLIC_MODERATION_API_URL ??
    ''
  )
    .trim()
    .replace(/\/+$/, '');
  const gatewayKey = process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim();
  if (!apiBase || !gatewayKey) {
    if (__DEV__) console.warn('[accountDeletion] Missing API base or gateway key; email skipped');
    return;
  }
  try {
    const res = await fetch(`${apiBase}/api/account/deletion-scheduled-notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-gateway-key': gatewayKey,
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        locale: params.emailCopyLocale,
        deadlineIso: params.deadlineDate.toISOString(),
        intlLocaleTag: params.intlLocaleTag,
        firstName: params.firstName,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn('[accountDeletion] Email notify failed', res.status, txt);
    }
  } catch (e) {
    console.warn('[accountDeletion] Email notify error', e);
  }
}

/**
 * Persiste `pendingDeletion` + `deletionDeadline` (misma fecha que mostró el UI/email) y dispara el correo.
 * No cierra sesión.
 */
export async function markAccountPendingDeletionInFirestore(params: {
  uid: string;
  language: AppLanguage;
  firstNameForEmail: string;
  /** Fecha exacta ya acordada con el usuario en los Alerts (Hoy + 30 días). */
  deadlineDate: Date;
}): Promise<{ deadlineDate: Date; deadlineStr: string }> {
  const deadlineTimestamp = Timestamp.fromDate(params.deadlineDate);
  const deadlineStr = formatDeletionDeadlineDisplay(params.deadlineDate, params.language);
  const emailCopyLocale = emailCopyLocaleFromAppLanguage(params.language);

  await updateDoc(doc(db, 'users', params.uid), {
    pendingDeletion: true,
    deletionRequestedAt: serverTimestamp(),
    deletionDeadline: deadlineTimestamp,
    deletionRequestLocale: emailCopyLocale,
  });

  await postDeletionScheduledEmail({
    deadlineDate: params.deadlineDate,
    emailCopyLocale,
    intlLocaleTag: intlLocaleTagForAppLanguage(params.language),
    firstName: pickFirstNameForEmail(params.firstNameForEmail),
  });

  return { deadlineDate: params.deadlineDate, deadlineStr };
}
