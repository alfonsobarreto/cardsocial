/**
 * Retry utility with exponential backoff.
 * Used for network-dependent operations (uploads, Firestore writes, API calls).
 *
 * Pattern: 1s → 2s → 4s → 8s (configurable)
 */

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: any) => boolean;
  },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelayMs ?? 1000;
  const maxDelay = options?.maxDelayMs ?? 8000;
  const shouldRetry = options?.shouldRetry ?? defaultShouldRetry;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (attempt >= maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const waitMs = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      await delay(waitMs);
    }
  }

  throw lastError;
}

function defaultShouldRetry(error: any): boolean {
  // Don't retry moderation rejections, auth errors, or validation errors
  if (error?.name === 'ModerationRejectedError') return false;
  if (error?.code?.startsWith?.('auth/')) return false;
  if (error?.response?.status === 400) return false;
  if (error?.response?.status === 401) return false;
  if (error?.response?.status === 403) return false;
  if (error?.response?.status === 413) return false;

  // Retry network errors, timeouts, 5xx
  if (error?.code === 'ECONNABORTED') return true;
  if (error?.code === 'ERR_NETWORK') return true;
  if (error?.message?.includes?.('Network Error')) return true;
  if (error?.message?.includes?.('timeout')) return true;
  if (error?.response?.status >= 500) return true;

  // Retry Firestore unavailable/deadline errors
  if (error?.code === 'unavailable') return true;
  if (error?.code === 'deadline-exceeded') return true;

  return true;
}
