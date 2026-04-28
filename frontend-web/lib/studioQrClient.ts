function getApiBase(): string {
  const raw =
    process.env.NEXT_PUBLIC_MODERATION_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    '';
  if (!raw) throw new Error('Set NEXT_PUBLIC_API_URL or NEXT_PUBLIC_MODERATION_API_URL.');
  return raw.replace(/\/+$/, '');
}

function getGatewayKey(): string {
  const raw = process.env.NEXT_PUBLIC_MODERATION_GATEWAY_KEY?.trim() || process.env.NEXT_PUBLIC_API_GATEWAY_KEY?.trim() || '';
  if (!raw) throw new Error('Set NEXT_PUBLIC_MODERATION_GATEWAY_KEY.');
  return raw;
}

export async function getJwt(uid: string, scope: 'qr.access' | 'moderation.upload' = 'qr.access') {
  const baseUrl = getApiBase();
  const gatewayKey = getGatewayKey();
  const r = await fetch(`${baseUrl}/api/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-gateway-key': gatewayKey,
    },
    body: JSON.stringify({ uid, scope }),
  });
  if (!r.ok) throw new Error(`Token exchange failed (${r.status})`);
  const j = (await r.json()) as { token?: string };
  const token = String(j.token || '').trim();
  if (!token) throw new Error('Token exchange returned empty token');
  return { baseUrl, gatewayKey, token };
}

export async function updateNicknameViaBackend(uid: string, nickname: string): Promise<void> {
  const baseUrl = getApiBase();
  const r = await fetch(`${baseUrl}/api/qr/users/${encodeURIComponent(uid)}/nickname`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Nickname update failed (${r.status})`);
  }
}

export async function syncProfileAvatarUrlToMongoWeb(uid: string, userAvatarUrl: string): Promise<void> {
  const auth = await getJwt(uid, 'qr.access');
  const r = await fetch(`${auth.baseUrl}/api/qr/users/${encodeURIComponent(uid)}/profile-avatar`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
    },
    body: JSON.stringify({ userAvatarUrl }),
  });
  if (!r.ok) throw new Error(`Avatar sync failed (${r.status})`);
}

export async function propagateUserIdentityAcrossSmartCardsWeb(uid: string): Promise<void> {
  const auth = await getJwt(uid, 'qr.access');
  const r = await fetch(`${auth.baseUrl}/api/smart-cards/propagate-identity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-gateway-key': auth.gatewayKey,
      Authorization: `Bearer ${auth.token}`,
    },
    body: JSON.stringify({}),
  });
  if (!r.ok) throw new Error(`Identity propagation failed (${r.status})`);
}
