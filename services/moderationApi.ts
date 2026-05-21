import { retryWithBackoff } from '@/services/retryWithBackoff';
import { resolveExpoPublicApiBaseUrl } from '@/services/expoPublicApiBaseUrl';
import axios from 'axios';

/** Token + multipart hacia Azure; redes móviles lentas o imágenes grandes pueden tardar. */
const MODERATION_HTTP_TIMEOUT_MS = 180_000;

export class ModerationRejectedError extends Error {
  maxSeverity?: number;

  constructor(message: string, maxSeverity?: number) {
    super(message);
    this.name = 'ModerationRejectedError';
    this.maxSeverity = maxSeverity;
  }
}

function getApiBaseUrl(): string {
  return resolveExpoPublicApiBaseUrl();
}

function getGatewayKey(): string {
  const key =
    process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim() ||
    process.env.EXPO_PUBLIC_API_GATEWAY_KEY?.trim() ||
    process.env.EXPO_PUBLIC_GATEWAY_KEY?.trim();
  if (!key) {
    throw new Error(
      'Missing gateway key. Set EXPO_PUBLIC_MODERATION_GATEWAY_KEY, EXPO_PUBLIC_API_GATEWAY_KEY, or EXPO_PUBLIC_GATEWAY_KEY (same value as API_GATEWAY_KEY on the backend).',
    );
  }
  return key;
}

async function getUploadJwtToken(baseUrl: string, uid: string, gatewayKey: string): Promise<string> {
  const response = await axios.post(
    `${baseUrl}/api/auth/token`,
    { uid },
    {
      headers: {
        'x-api-gateway-key': gatewayKey,
      },
      timeout: MODERATION_HTTP_TIMEOUT_MS,
    }
  );

  const token = String(response?.data?.token || '').trim();
  if (!token) {
    throw new Error('Auth token exchange failed: empty token');
  }
  return token;
}

export async function uploadFileWithModeration(params: {
  fileUri: string;
  uid: string;
  label: string;
  fileName: string;
  mimeType: string;
}): Promise<{ fileId: string; filename: string; publicUrl: string | null; mimeType: string | null }> {
  return retryWithBackoff(async () => {
    const formData = new FormData();
    formData.append('uid', params.uid);
    formData.append('label', params.label);
    const partMime = String(params.mimeType || '').trim() || 'application/octet-stream';
    formData.append('file', {
      uri: params.fileUri,
      name: params.fileName || 'upload.bin',
      type: partMime,
    } as any);

  try {
    const baseUrl = getApiBaseUrl();
    const gatewayKey = getGatewayKey();
    if (params.label === 'business_logo') {
      // Metro / consola: confirma que el guardado disparó red (no confundir con GET /api/.../vault)
      console.log('[moderationApi] POST /api/upload', params.label, '→', `${baseUrl}/api/upload`, params.fileName);
    }
    const uploadToken = await getUploadJwtToken(baseUrl, params.uid, gatewayKey);

    const response = await axios.post(`${baseUrl}/api/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'x-api-gateway-key': gatewayKey,
        Authorization: `Bearer ${uploadToken}`,
      },
      timeout: MODERATION_HTTP_TIMEOUT_MS,
    });

    if (params.label === 'business_logo') {
      console.log('[moderationApi] upload respuesta OK', {
        fileId: response.data?.fileId,
        publicUrl: response.data?.publicUrl,
      });
    }
    return {
      fileId: response.data.fileId,
      filename: response.data.filename,
      publicUrl: response.data.publicUrl ?? null,
      mimeType: response.data.mimeType != null ? String(response.data.mimeType) : null,
    };
  } catch (error: any) {
    const rawMessage = String(error?.message || '').toLowerCase();
    if (error?.code === 'ECONNABORTED' || rawMessage.includes('timeout')) {
      throw new Error(
        'Timeout conectando con el escudo de seguridad (Azure). Revisa red; la base debe ser EXPO_PUBLIC_BACKEND_BASE_URL o EXPO_PUBLIC_MODERATION_API_URL y el backend debe estar accesible.',
      );
    }

    if (rawMessage.includes('network error') || rawMessage.includes('failed to fetch')) {
      throw new Error(
        'No se pudo conectar con el escudo de seguridad (Azure). Revisa red/LAN y EXPO_PUBLIC_BACKEND_BASE_URL (o EXPO_PUBLIC_MODERATION_API_URL).',
      );
    }

    const status = error?.response?.status;
    if (params.label === 'business_logo') {
      console.error('[moderationApi] upload falló', status, error?.response?.data || error?.message);
    }
    if (status === 403) {
      throw new ModerationRejectedError(
        error?.response?.data?.error || 'File blocked by Content Safety',
        error?.response?.data?.maxSeverity
      );
    }

    throw new Error(error?.response?.data?.error || error?.message || 'Upload request failed');
  }
  }, { maxRetries: 2, baseDelayMs: 1500 });
}

const VAULT_PROXY_FILE_RE = /\/vault-proxy\/file\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

export function extractVaultProxyFileId(value: string | null | undefined): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(VAULT_PROXY_FILE_RE);
  return match?.[1] ?? null;
}

export async function deleteVaultFileWithModeration(params: {
  fileIdOrUrl: string;
  uid: string;
}): Promise<{ deleted: boolean }> {
  const fileId = extractVaultProxyFileId(params.fileIdOrUrl) ?? String(params.fileIdOrUrl || '').trim();
  if (!fileId) return { deleted: false };

  const baseUrl = getApiBaseUrl();
  const gatewayKey = getGatewayKey();
  const uploadToken = await getUploadJwtToken(baseUrl, params.uid, gatewayKey);
  const response = await axios.delete(`${baseUrl}/api/upload/vault-file/${encodeURIComponent(fileId)}`, {
    headers: {
      'x-api-gateway-key': gatewayKey,
      Authorization: `Bearer ${uploadToken}`,
    },
    data: { uid: params.uid },
    timeout: MODERATION_HTTP_TIMEOUT_MS,
  });

  return { deleted: Boolean(response.data?.deleted) };
}
