import { retryWithBackoff } from '@/services/retryWithBackoff';
import { resolveExpoPublicApiBaseUrl } from '@/services/expoPublicApiBaseUrl';
import axios from 'axios';

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
  const key = process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim();
  if (!key) {
    throw new Error('Missing EXPO_PUBLIC_MODERATION_GATEWAY_KEY. Set it in your Expo environment.');
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
      timeout: 120000,
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
      timeout: 120000,
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
        'Timeout conectando con el escudo de seguridad (Azure). Verifica que el backend de moderacion este activo y accesible en EXPO_PUBLIC_MODERATION_API_URL.'
      );
    }

    if (rawMessage.includes('network error') || rawMessage.includes('failed to fetch')) {
      throw new Error(
        'No se pudo conectar con el escudo de seguridad (Azure). Revisa red/LAN y la URL de EXPO_PUBLIC_MODERATION_API_URL.'
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
