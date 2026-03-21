import AsyncStorage from '@react-native-async-storage/async-storage';

const CREDENTIAL_EMAIL_KEY = 'auth_email_cached';
const CREDENTIAL_PASSWORD_KEY = 'auth_password_cached';

export type StoredCredential = {
  email: string;
  password: string;
};

export async function saveCachedCredentials(email: string, password: string): Promise<void> {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');
  if (!normalizedEmail || !normalizedPassword) {
    return;
  }

  await AsyncStorage.multiSet([
    [CREDENTIAL_EMAIL_KEY, normalizedEmail],
    [CREDENTIAL_PASSWORD_KEY, normalizedPassword],
  ]);
}

export async function getCachedCredentials(): Promise<StoredCredential | null> {
  const [email, password] = await AsyncStorage.multiGet([
    CREDENTIAL_EMAIL_KEY,
    CREDENTIAL_PASSWORD_KEY,
  ]).then((pairs) => pairs.map((entry) => entry[1] || ''));

  if (!email || !password) {
    return null;
  }

  return {
    email: email.trim().toLowerCase(),
    password,
  };
}

export async function clearCachedCredentials(): Promise<void> {
  await AsyncStorage.multiRemove([CREDENTIAL_EMAIL_KEY, CREDENTIAL_PASSWORD_KEY]);
}
