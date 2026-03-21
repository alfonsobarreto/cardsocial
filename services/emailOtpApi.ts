type EmailOtpSendResponse = {
  sessionId: string;
  expiresAt: string;
};

function getApiBaseUrl(): string {
  const explicitBackend = process.env.EXPO_PUBLIC_BACKEND_BASE_URL?.trim();
  const moderationApi = process.env.EXPO_PUBLIC_MODERATION_API_URL?.trim();
  const resolved = explicitBackend || moderationApi;
  if (!resolved) {
    throw new Error('Falta EXPO_PUBLIC_BACKEND_BASE_URL o EXPO_PUBLIC_MODERATION_API_URL.');
  }

  return resolved.replace(/\/+$/, '');
}

function getGatewayKey(): string {
  const key = process.env.EXPO_PUBLIC_MODERATION_GATEWAY_KEY?.trim();
  if (!key) {
    throw new Error('Falta EXPO_PUBLIC_MODERATION_GATEWAY_KEY para OTP email.');
  }

  return key;
}

async function postJson<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-gateway-key': getGatewayKey(),
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((json as any)?.error || 'Error en OTP email'));
  }

  return json as T;
}

export async function sendEmailOtp(email: string): Promise<EmailOtpSendResponse> {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Email requerido para enviar OTP.');
  }

  const response = await postJson<{ ok: boolean; sessionId: string; expiresAt: string }>('/api/auth/email-otp/send', {
    email: normalizedEmail,
  });

  return {
    sessionId: response.sessionId,
    expiresAt: response.expiresAt,
  };
}

export async function verifyEmailOtp(params: {
  email: string;
  code: string;
  sessionId: string;
}): Promise<void> {
  const normalizedEmail = String(params.email || '').trim().toLowerCase();
  const normalizedCode = String(params.code || '').trim();
  const normalizedSessionId = String(params.sessionId || '').trim();

  if (!normalizedEmail || !normalizedCode || !normalizedSessionId) {
    throw new Error('Datos incompletos para verificar OTP.');
  }

  await postJson('/api/auth/email-otp/verify', {
    email: normalizedEmail,
    code: normalizedCode,
    sessionId: normalizedSessionId,
  });
}

export async function expireEmailOtp(params: {
  email: string;
  sessionId: string;
}): Promise<void> {
  const normalizedEmail = String(params.email || '').trim().toLowerCase();
  const normalizedSessionId = String(params.sessionId || '').trim();

  if (!normalizedEmail || !normalizedSessionId) {
    return;
  }

  await postJson('/api/auth/email-otp/expire', {
    email: normalizedEmail,
    sessionId: normalizedSessionId,
  });
}
