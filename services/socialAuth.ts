import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {
  AuthProvider,
  GithubAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  UserCredential,
  signInWithCredential,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '@/services/firebaseConfig';

WebBrowser.maybeCompleteAuthSession();

export type SocialProviderId = 'google.com' | 'apple.com' | 'github.com';

const providerLabelMap: Record<SocialProviderId, string> = {
  'google.com': 'Google',
  'apple.com': 'Apple',
  'github.com': 'GitHub',
};

export const getProviderLabel = (providerId: SocialProviderId): string => providerLabelMap[providerId];

const buildProvider = (providerId: SocialProviderId): AuthProvider => {
  if (providerId === 'google.com') {
    return new GoogleAuthProvider();
  }
  if (providerId === 'github.com') {
    return new GithubAuthProvider();
  }
  return new OAuthProvider('apple.com');
};

const getGoogleClientId = (): string => {
  const web = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  const ios = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const android = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();

  const byPlatform = Platform.OS === 'ios' ? ios : Platform.OS === 'android' ? android : web;
  const resolved = byPlatform || web || ios || android;
  if (!resolved) {
    throw new Error('Falta configurar GOOGLE CLIENT ID (EXPO_PUBLIC_GOOGLE_*_CLIENT_ID).');
  }

  return resolved;
};

const getBackendBaseUrl = (): string => {
  const explicitBackend = process.env.EXPO_PUBLIC_BACKEND_BASE_URL?.trim();
  const moderationApi = process.env.EXPO_PUBLIC_MODERATION_API_URL?.trim();
  const resolved = explicitBackend || moderationApi;
  if (!resolved) {
    throw new Error('Falta EXPO_PUBLIC_BACKEND_BASE_URL o EXPO_PUBLIC_MODERATION_API_URL.');
  }

  return resolved.replace(/\/+$/, '');
};

const getGatewayKey = (): string => {
  const key = process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim();
  if (!key) {
    throw new Error('Falta EXPO_PUBLIC_MODERATION_GATEWAY_KEY para intercambio seguro de GitHub OAuth.');
  }
  return key;
};

const runGoogleNativeSignIn = async (): Promise<UserCredential> => {
  const clientId = getGoogleClientId();
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'cardsocial' });
  const discovery: AuthSession.DiscoveryDocument = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  };

  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.IdToken,
    scopes: ['openid', 'profile', 'email'],
    extraParams: { prompt: 'select_account' },
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success') {
    throw new Error('Autenticación con Google cancelada o fallida.');
  }

  const idToken = result.params.id_token;
  const accessToken = result.params.access_token;
  if (!idToken) {
    throw new Error('Google no devolvió id_token.');
  }

  const credential = GoogleAuthProvider.credential(idToken, accessToken);
  return signInWithCredential(auth, credential);
};

const getGithubClientConfig = () => {
  const clientId = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID?.trim();

  if (!clientId) {
    throw new Error('Falta EXPO_PUBLIC_GITHUB_CLIENT_ID.');
  }

  return { clientId };
};

const runGitHubNativeSignIn = async (): Promise<UserCredential> => {
  const { clientId } = getGithubClientConfig();
  const backendBaseUrl = getBackendBaseUrl();
  const gatewayKey = getGatewayKey();
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'cardsocial' });
  const discovery: AuthSession.DiscoveryDocument = {
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
  };

  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    scopes: ['read:user', 'user:email'],
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) {
    throw new Error('Autenticación con GitHub cancelada o fallida.');
  }

  const exchangeResponse = await fetch(`${backendBaseUrl}/api/auth/github/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-gateway-key': gatewayKey,
    },
    body: JSON.stringify({
      code: result.params.code,
      redirectUri,
    }),
  });

  const exchangeJson = await exchangeResponse.json().catch(() => ({}));
  if (!exchangeResponse.ok) {
    throw new Error(String(exchangeJson?.error || 'Fallo el intercambio seguro de token en backend.'));
  }

  const accessToken = String(exchangeJson?.accessToken || '').trim();
  if (!accessToken) {
    throw new Error('GitHub no devolvió access_token.');
  }

  const credential = GithubAuthProvider.credential(accessToken);
  return signInWithCredential(auth, credential);
};

const runAppleNativeSignIn = async (): Promise<UserCredential> => {
  if (Platform.OS !== 'ios') {
    throw new Error('Apple Sign-In nativo solo está disponible en iOS.');
  }

  const isAvailable = await AppleAuthentication.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Apple Sign-In no está disponible en este dispositivo.');
  }

  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!appleCredential.identityToken) {
    throw new Error('Apple no devolvió identityToken.');
  }

  const provider = new OAuthProvider('apple.com');
  const firebaseCredential = provider.credential({
    idToken: appleCredential.identityToken,
  });

  return signInWithCredential(auth, firebaseCredential);
};

export const signInWithSocialProvider = async (providerId: SocialProviderId): Promise<UserCredential> => {
  if (Platform.OS === 'web') {
    const provider = buildProvider(providerId);
    return signInWithPopup(auth, provider);
  }

  if (providerId === 'google.com') {
    return runGoogleNativeSignIn();
  }
  if (providerId === 'github.com') {
    return runGitHubNativeSignIn();
  }
  return runAppleNativeSignIn();
};

export const getEmailFromCredential = (credential: UserCredential): string | null => {
  const userEmail = credential.user.email?.trim().toLowerCase();
  if (userEmail) {
    return userEmail;
  }

  for (const profile of credential.user.providerData) {
    const providerEmail = profile.email?.trim().toLowerCase();
    if (providerEmail) {
      return providerEmail;
    }
  }

  return null;
};

export const credentialHasProvider = (credential: UserCredential, providerId: SocialProviderId): boolean => {
  return credential.user.providerData.some((p) => p.providerId === providerId);
};
