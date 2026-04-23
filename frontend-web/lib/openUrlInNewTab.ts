/**
 * Apertura directa de URL en el navegador (tarjetas públicas /b y /u).
 * Algunos navegadores bloquean `window.open` en ciertos contextos; el fallback
 * con `<a target="_blank">` suele respetar el gesto del usuario; si aún falla, navega en la misma pestaña.
 */
export function openUrlInNewTabReliably(url: string): void {
  if (typeof window === 'undefined' || !url) return;
  let opened: Window | null = null;
  try {
    opened = window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    // ignore
  }
  if (opened) {
    return;
  }
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  } catch {
    try {
      window.location.assign(url);
    } catch {
      // ignore
    }
  }
}
