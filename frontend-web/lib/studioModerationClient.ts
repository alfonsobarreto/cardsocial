/**
 * Subida al mismo endpoint que `services/moderationApi.ts` (Expo), con `File` del navegador.
 */
function getApiBase(): string {
  const u =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MODERATION_API_URL?.trim()) ||
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL?.trim()) ||
    '';
  if (!u) {
    throw new Error('Set NEXT_PUBLIC_API_URL or NEXT_PUBLIC_MODERATION_API_URL for document upload.');
  }
  return u.replace(/\/+$/, '');
}

function getGatewayKey(): string {
  const k =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MODERATION_GATEWAY_KEY?.trim()) ||
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_GATEWAY_KEY?.trim()) ||
    '';
  if (!k) {
    throw new Error(
      'Falta la clave del API: define NEXT_PUBLIC_MODERATION_GATEWAY_KEY o NEXT_PUBLIC_API_GATEWAY_KEY (misma que en la app / build de Next).',
    );
  }
  return k;
}

async function getUploadJwtToken(baseUrl: string, uid: string, gatewayKey: string): Promise<string> {
  const r = await fetch(`${baseUrl}/api/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-gateway-key': gatewayKey },
    body: JSON.stringify({ uid, scope: 'moderation.upload' }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Token exchange failed: ${r.status} ${t}`);
  }
  const j = (await r.json()) as { token?: string };
  const token = String(j?.token || '').trim();
  if (!token) {
    throw new Error('Auth token empty');
  }
  return token;
}

export async function uploadVaultDocumentWeb(
  file: File,
  uid: string,
  label: string,
): Promise<{ fileId: string; publicUrl: string | null; mimeType: string | null }> {
  const baseUrl = getApiBase();
  const gatewayKey = getGatewayKey();
  const uploadToken = await getUploadJwtToken(baseUrl, uid, gatewayKey);
  const fd = new FormData();
  fd.append('uid', uid);
  fd.append('label', label);
  fd.append('file', file, file.name);

  const r = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: {
      'x-api-gateway-key': gatewayKey,
      Authorization: `Bearer ${uploadToken}`,
    },
    body: fd,
  });

  if (!r.ok) {
    const errText = await r.text();
    if (r.status === 403) {
      throw new Error('File blocked by content moderation');
    }
    throw new Error(errText || `Upload failed: ${r.status}`);
  }
  const data = (await r.json()) as { fileId?: string; publicUrl?: string | null; mimeType?: string | null };
  return {
    fileId: String(data.fileId || ''),
    publicUrl: data.publicUrl != null ? String(data.publicUrl) : null,
    mimeType: data.mimeType != null ? String(data.mimeType) : null,
  };
}

export async function uploadProfilePhotoWeb(
  file: File,
  uid: string,
): Promise<{ fileId: string; publicUrl: string | null; mimeType: string | null }> {
  return uploadVaultDocumentWeb(file, uid, 'profile_photo');
}
