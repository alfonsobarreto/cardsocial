function getApiBase(): string {
  return (
    process.env.NEXT_PUBLIC_MODERATION_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    ''
  ).replace(/\/+$/, '');
}

function getGatewayKey(): string {
  return process.env.NEXT_PUBLIC_MODERATION_GATEWAY_KEY?.trim() || '';
}

export function extractDomainFromLink(rawValue: string): string {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return '';
  try {
    const urlObj = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return urlObj.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export async function fetchStudioFavicon(url: string): Promise<string | null> {
  const safeUrl = String(url || '').trim();
  if (!safeUrl) return null;

  const base = getApiBase();
  const gatewayKey = getGatewayKey();
  if (base && gatewayKey) {
    try {
      const qs = new URLSearchParams({ url: safeUrl });
      const response = await fetch(`${base}/api/favicon/fetch?${qs.toString()}`, {
        headers: {
          'x-api-gateway-key': gatewayKey,
        },
      });
      if (response.ok) {
        const data = (await response.json()) as { iconUrl?: string };
        const iconUrl = String(data?.iconUrl || '').trim();
        if (iconUrl) return iconUrl;
      }
    } catch {
      /* fall back to Google favicon endpoint */
    }
  }

  const domain = extractDomainFromLink(safeUrl);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
}
