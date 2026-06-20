/**
 * Guardar vCard en Contactos del teléfono desde la web pública.
 * iOS Safari abre Contactos con `<a download>`; Android Chrome suele bajar el archivo.
 * En Android navegamos a una URL `.vcf` same-origin (Content-Disposition: inline) o Web Share.
 */

function isAndroidMobileWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

function downloadVcardBlob(body: string, filename: string): void {
  const blob = new Blob([body], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function openVcardOnAndroid(body: string, filename: string, serveUrl?: string): Promise<void> {
  if (serveUrl) {
    window.location.assign(serveUrl);
    return;
  }

  const blob = new Blob([body], { type: 'text/x-vcard;charset=utf-8' });
  const file = new File([blob], filename, { type: 'text/x-vcard' });

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  window.location.assign(url);
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

export function resolveAndroidVcardServeUrl(opts: {
  variant: 'business' | 'universal';
  bId?: string;
  uid?: string;
  token?: string;
}): string | undefined {
  if (!isAndroidMobileWeb()) return undefined;
  if (opts.variant === 'business') {
    const bId = String(opts.bId || '').trim();
    const uid = String(opts.uid || '').trim();
    if (!bId || !uid) return undefined;
    return `/api/public/business-card.vcf?bId=${encodeURIComponent(bId)}&uid=${encodeURIComponent(uid)}`;
  }
  const token = String(opts.token || '').trim();
  if (!token) return undefined;
  return `/api/public/universal-card.vcf?token=${encodeURIComponent(token)}`;
}

/** iOS/desktop: descarga blob. Android: URL `.vcf` inline o share / apertura directa. */
export function saveVcardToDeviceContacts(opts: {
  body: string;
  filename: string;
  serveUrl?: string;
}): void {
  const { body, filename, serveUrl } = opts;
  if (isAndroidMobileWeb()) {
    void openVcardOnAndroid(body, filename, serveUrl);
    return;
  }
  downloadVcardBlob(body, filename);
}
