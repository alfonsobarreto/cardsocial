import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';

export function shouldLogFirebaseAdmin(): boolean {
  if (process.env.DEBUG_FIREBASE_ADMIN === '1') return true;
  return process.env.NODE_ENV !== 'production';
}

/** PEM / encoding hints only — never logs key material. */
function serviceAccountPrivateKeyDiagnostics(credentials: Record<string, unknown>): Record<string, unknown> {
  const pk = credentials.private_key;
  if (typeof pk !== 'string') {
    return { private_key_type: typeof pk };
  }
  const out: Record<string, unknown> = {
    private_key_char_len: pk.length,
    newline_count: (pk.match(/\n/g) || []).length,
    cr_lf_count: (pk.match(/\r\n/g) || []).length,
    lone_cr_count: (pk.match(/\r/g) || []).length - (pk.match(/\r\n/g) || []).length,
    /** If true, JSON had "\\n" not converted — common .env bug */
    contains_backslash_n_literal: /\\n/.test(pk),
    starts_with_begin: pk.startsWith('-----BEGIN'),
  };
  const m = pk.match(/^-----BEGIN (?:RSA )?PRIVATE KEY-----\r?\n([\s\S]+?)\r?\n-----END (?:RSA )?PRIVATE KEY-----\r?\n?$/);
  if (m) {
    const body = m[1].replace(/\r/g, '').replace(/\n/g, '');
    out.pem_inner_b64_len = body.length;
    out.pem_inner_b64_mod4 = body.length % 4;
    out.pem_inner_lines = m[1].split(/\r?\n/).length;
  } else {
    out.pem_frame_ok = false;
    const idxB = pk.indexOf('-----BEGIN');
    const idxE = pk.indexOf('-----END');
    out.pem_begin_index = idxB;
    out.pem_end_index = idxE;
  }
  return out;
}

function logCertFailure(
  source: 'FIREBASE_SERVICE_ACCOUNT_JSON' | 'file',
  credentials: Record<string, unknown>,
  err: string,
): void {
  if (!shouldLogFirebaseAdmin()) return;
  console.error('[firebaseAdminStudio] cert() failed — diagnostics (no secret printed):', {
    source,
    project_id: credentials.project_id,
    client_email: credentials.client_email,
    private_key_id: credentials.private_key_id,
    error: err,
    ...serviceAccountPrivateKeyDiagnostics(credentials),
  });
}

export type ResolveAdminAppResult =
  | { ok: true; app: App }
  | { ok: false; code: FirebaseAdminErrorCode; detail?: string };

export type FirebaseAdminErrorCode =
  | 'firebase_credentials_missing'
  | 'firebase_json_malformed'
  | 'firebase_credentials_file_missing'
  | 'firebase_credentials_file_malformed'
  | 'firebase_private_key_invalid';

/**
 * Singleton Firebase Admin app for Card Studio API routes (service account JSON).
 * Same shape as `FIREBASE_SERVICE_ACCOUNT_JSON` on Azure / local `.env`.
 * Optional file: `FIREBASE_SERVICE_ACCOUNT_PATH` (relative to cwd), tried if env JSON is missing or cert() fails.
 */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  let s = raw.trim();
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    s = s.slice(1, -1);
  }
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function fixPrivateKeyNewlines(credentials: Record<string, unknown>): Record<string, unknown> {
  // Azure App Service and many CI/CD systems serialize the JSON in a single
  // env var and escape real newlines as the literal two-char sequence \n.
  // Node's crypto layer then receives a malformed PEM and throws
  // "Unparsed DER bytes remain after ASN.1 parsing".
  // Fix: unescape \n -> actual newline in private_key only.
  if (typeof credentials.private_key === 'string' && credentials.private_key.includes('\\n')) {
    return { ...credentials, private_key: credentials.private_key.replace(/\\n/g, '\n') };
  }
  return credentials;
}

function tryCert(credentials: Record<string, unknown>): App {
  const fixed = fixPrivateKeyNewlines(credentials);
  return initializeApp({
    credential: cert(fixed as Parameters<typeof cert>[0]),
    projectId: typeof fixed.project_id === 'string' ? fixed.project_id : undefined,
  });
}

/**
 * Resolves Firebase Admin app or a specific error code (for API responses and support).
 */
export function resolveAdminApp(): ResolveAdminAppResult {
  if (getApps().length > 0) {
    return { ok: true, app: getApps()[0]! };
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const pathRaw = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();

  if (!raw && !pathRaw) {
    if (shouldLogFirebaseAdmin()) {
      console.error('[firebaseAdminStudio] No credentials: set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH');
    }
    return { ok: false, code: 'firebase_credentials_missing' };
  }

  let lastCertError: string | undefined;
  let envJsonMalformed = false;

  if (raw) {
    const parsed = parseJsonObject(raw);
    if (!parsed) {
      envJsonMalformed = true;
      if (shouldLogFirebaseAdmin()) {
        console.error('[firebaseAdminStudio] FIREBASE_SERVICE_ACCOUNT_JSON: JSON.parse failed after quote strip', {
          raw_char_len: raw.length,
          raw_head_ascii: raw.slice(0, 24).replace(/[^\x20-\x7E]/g, '?'),
        });
      }
    } else {
      try {
        return { ok: true, app: tryCert(parsed) };
      } catch (e) {
        lastCertError = (e as Error)?.message || String(e);
        logCertFailure('FIREBASE_SERVICE_ACCOUNT_JSON', parsed, lastCertError);
      }
    }
  }

  if (pathRaw) {
    const abs = resolve(process.cwd(), pathRaw);
    if (!existsSync(abs)) {
      if (envJsonMalformed) {
        return { ok: false, code: 'firebase_json_malformed' };
      }
      if (lastCertError) {
        return { ok: false, code: 'firebase_private_key_invalid', detail: lastCertError };
      }
      if (shouldLogFirebaseAdmin()) {
        console.error('[firebaseAdminStudio] service account file not found', { path: pathRaw, cwd: process.cwd() });
      }
      return {
        ok: false,
        code: 'firebase_credentials_file_missing',
        detail: pathRaw,
      };
    }
    try {
      const parsed = JSON.parse(readFileSync(abs, 'utf8')) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') {
        return { ok: false, code: 'firebase_credentials_file_malformed' };
      }
      try {
        return { ok: true, app: tryCert(parsed) };
      } catch (e) {
        lastCertError = (e as Error)?.message || String(e);
        logCertFailure('file', parsed, lastCertError);
        return {
          ok: false,
          code: 'firebase_private_key_invalid',
          detail: lastCertError,
        };
      }
    } catch {
      if (shouldLogFirebaseAdmin()) {
        console.error('[firebaseAdminStudio] FIREBASE_SERVICE_ACCOUNT_PATH file: JSON.parse failed', { path: pathRaw });
      }
      return { ok: false, code: 'firebase_credentials_file_malformed' };
    }
  }

  if (envJsonMalformed) {
    return { ok: false, code: 'firebase_json_malformed' };
  }

  return {
    ok: false,
    code: 'firebase_private_key_invalid',
    detail: lastCertError,
  };
}

export function getAdminApp(): App | null {
  const r = resolveAdminApp();
  return r.ok ? r.app : null;
}
