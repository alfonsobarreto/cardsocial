import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';

/**
 * Singleton Firebase Admin app for Card Studio API routes (service account JSON).
 * Same shape as `FIREBASE_SERVICE_ACCOUNT_JSON` on Azure / local `.env`.
 */
export function getAdminApp(): App | null {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    return null;
  }
  try {
    const credentials = JSON.parse(raw) as Record<string, unknown>;
    return initializeApp({
      credential: cert(credentials as Parameters<typeof cert>[0]),
      projectId: typeof credentials.project_id === 'string' ? credentials.project_id : undefined,
    });
  } catch {
    return null;
  }
}
