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
  const envUrl = process.env.EXPO_PUBLIC_MODERATION_API_URL?.trim();
  if (!envUrl) {
    throw new Error('Missing EXPO_PUBLIC_MODERATION_API_URL. Set it in your Expo environment.');
  }
  return envUrl.replace(/\/+$/, '');
}

function getGatewayKey(): string {
  const key = process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim();
  if (!key) {
    throw new Error('Missing EXPO_PUBLIC_MODERATION_GATEWAY_KEY. Set it in your Expo environment.');
  }
  return key;
}

async function getUploadJwtToken(baseUrl: string, ownerUid: string, gatewayKey: string): Promise<string> {
  const response = await axios.post(
    `${baseUrl}/api/auth/token`,
    { ownerUid },
    {
      headers: {
        'x-api-gateway-key': gatewayKey,
      },
      timeout: 15000,
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
  ownerUid: string;
  label: string;
  fileName: string;
  mimeType: string;
}): Promise<{ fileId: string; filename: string }> {
  const formData = new FormData();
  formData.append('ownerUid', params.ownerUid);
  formData.append('label', params.label);
  formData.append('file', {
    uri: params.fileUri,
    name: params.fileName,
    type: params.mimeType,
  } as any);

  try {
    const baseUrl = getApiBaseUrl();
    const gatewayKey = getGatewayKey();
    const uploadToken = await getUploadJwtToken(baseUrl, params.ownerUid, gatewayKey);

    const response = await axios.post(`${baseUrl}/api/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'x-api-gateway-key': gatewayKey,
        Authorization: `Bearer ${uploadToken}`,
      },
      timeout: 60000,
    });

    return {
      fileId: response.data.fileId,
      filename: response.data.filename,
    };
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 403) {
      throw new ModerationRejectedError(
        error?.response?.data?.error || 'File blocked by Content Safety',
        error?.response?.data?.maxSeverity
      );
    }

    throw new Error(error?.response?.data?.error || error?.message || 'Upload request failed');
  }
}
