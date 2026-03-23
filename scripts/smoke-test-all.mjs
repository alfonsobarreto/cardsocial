import axios from 'axios';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, limit, getDocs } from 'firebase/firestore';

function nowMs() {
  return Date.now();
}

function elapsed(start) {
  return `${Date.now() - start}ms`;
}

function mask(value, keep = 4) {
  const str = String(value || '');
  if (!str) return '(empty)';
  if (str.length <= keep) return '*'.repeat(str.length);
  return `${'*'.repeat(str.length - keep)}${str.slice(-keep)}`;
}

function getEnv(name, fallback = '') {
  const v = process.env[name];
  if (typeof v !== 'string') return fallback;
  return v.trim() || fallback;
}

const firebaseConfig = {
  apiKey: getEnv('EXPO_PUBLIC_FIREBASE_API_KEY', 'AIzaSyBF-DGMoQAtaf49sMcsVgGJLtoAyTAHwgA'),
  authDomain: getEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', 'card-social-app.firebaseapp.com'),
  projectId: getEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'card-social-app'),
  storageBucket: getEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', 'card-social-app.firebasestorage.app'),
  messagingSenderId: getEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', '604587233093'),
  appId: getEnv('EXPO_PUBLIC_FIREBASE_APP_ID', '1:604587233093:web:76abc315ea9326b5fdf82c'),
};

const baseUrl = (
  getEnv('EXPO_PUBLIC_MODERATION_API_URL') ||
  getEnv('EXPO_PUBLIC_BACKEND_BASE_URL') ||
  'https://card-social-api.azurewebsites.net'
).replace(/\/+$/, '');

const gatewayKey = getEnv('EXPO_PUBLIC_MODERATION_GATEWAY_KEY', 'cardsocial_gateway_dev_2026_local');
const testTimeoutMs = Number(getEnv('SMOKE_TIMEOUT_MS', '15000'));

const checks = [];

async function runCheck(name, fn) {
  const start = nowMs();
  try {
    const detail = await fn();
    checks.push({ name, ok: true, detail, took: elapsed(start) });
  } catch (error) {
    const message = error?.response?.data
      ? JSON.stringify(error.response.data)
      : error?.message || String(error);
    checks.push({ name, ok: false, detail: message, took: elapsed(start) });
  }
}

async function checkAuth() {
  const email = `smoke_${Date.now()}@cardsocial.dev`;
  const password = 'Ghost#123456';
  const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`;

  const signUp = await axios.post(
    signUpUrl,
    { email, password, returnSecureToken: true },
    { timeout: testTimeoutMs }
  );

  const idToken = String(signUp?.data?.idToken || '');
  const localId = String(signUp?.data?.localId || '');
  if (!idToken || !localId) {
    throw new Error('Auth sign-up returned empty idToken/localId');
  }

  const deleteUrl = `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${firebaseConfig.apiKey}`;
  await axios.post(deleteUrl, { idToken }, { timeout: testTimeoutMs });

  return `created+deleted test user ${email} (uid=${localId})`;
}

async function checkFirestoreRead() {
  const app = initializeApp(firebaseConfig, `smoke-${Date.now()}`);
  const db = getFirestore(app);
  const snap = await getDocs(query(collection(db, 'users'), limit(1)));
  return `users read ok (docs=${snap.size})`;
}

async function checkHealthEndpoint() {
  const response = await axios.get(`${baseUrl}/api/health`, { timeout: testTimeoutMs });
  return `status=${response.status} body=${JSON.stringify(response.data)}`;
}

async function checkTokenEndpoint() {
  const response = await axios.post(
    `${baseUrl}/api/auth/token`,
    { ownerUid: `smoke_owner_${Date.now()}` },
    {
      headers: {
        'x-api-gateway-key': gatewayKey,
      },
      timeout: testTimeoutMs,
    }
  );

  const token = String(response?.data?.token || '');
  if (!token) {
    throw new Error('token endpoint returned empty token');
  }

  return `status=${response.status} token=${mask(token, 8)}`;
}

function printReport() {
  console.log('=== Card-Social Smoke Test ===');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Gateway Key: ${mask(gatewayKey, 6)}`);
  console.log(`Timeout per check: ${testTimeoutMs}ms`);
  console.log('');

  for (const c of checks) {
    const badge = c.ok ? 'PASS' : 'FAIL';
    console.log(`[${badge}] ${c.name} (${c.took})`);
    console.log(`       ${c.detail}`);
  }

  console.log('');
  const mandatoryNames = [
    'Firebase Auth sign-up + delete',
    'Firestore read',
    'Endpoint /api/health',
    'Endpoint /api/auth/token',
  ];

  const mandatory = checks.filter((c) => mandatoryNames.includes(c.name));
  const passed = mandatory.filter((c) => c.ok).length;
  const failed = mandatory.length - passed;

  console.log(`Summary: ${passed}/${mandatory.length} PASS, ${failed} FAIL`);
  console.log(failed === 0 ? 'OVERALL: PASS' : 'OVERALL: FAIL');

  process.exitCode = failed === 0 ? 0 : 1;
}

async function main() {
  await runCheck('Firebase Auth sign-up + delete', checkAuth);
  await runCheck('Firestore read', checkFirestoreRead);
  await runCheck('Endpoint /api/health', checkHealthEndpoint);
  await runCheck('Endpoint /api/auth/token', checkTokenEndpoint);
  printReport();
}

main().catch((error) => {
  console.error('FATAL:', error?.message || String(error));
  process.exit(1);
});
