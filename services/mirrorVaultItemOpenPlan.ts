/**
 * Plan de apertura al pulsar un ítem de espejo / slot público.
 * Misma prioridad que `openVaultPreviewItem` + detección social por `type` (WhatsApp, etc.).
 * Sin React Native: sirve para web universal y para refactor del cliente nativo.
 */

import { isGhostLinkVaultType } from '../constants/ghostLinkVault';

export type MirrorItemLike = {
  type: string;
  value: string;
  title: string;
};

export type MirrorOpenPlanContext = {
  /** Titular de la tarjeta (Ghost-Link target). */
  cardOwnerUid: string;
  cardId: string;
  sourceCardName: string;
};

export type MirrorOpenPlan =
  | { kind: 'ghost'; ctx: MirrorOpenPlanContext }
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string }
  | { kind: 'link'; url: string; title: string }
  | { kind: 'document'; value: string; title: string }
  | { kind: 'text'; value: string; title: string }
  | { kind: 'raw'; value: string; title: string };

export function ensureWebUrl(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) {
    return '';
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  return `https://${value}`;
}

function normalizeTypeKey(type: string): string {
  return String(type || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();
}

function isClassicPhoneVaultTypeLocal(type: string): boolean {
  if (isGhostLinkVaultType(type)) {
    return false;
  }
  const k = normalizeTypeKey(type);
  if (!k) {
    return false;
  }
  if (
    k === 'telefono' ||
    k === 'telephone' ||
    k === 'phone' ||
    k === 'movil' ||
    k === 'mobile' ||
    k === 'cell' ||
    k === 'celular'
  ) {
    return true;
  }
  if (k.includes('telefono') || k.includes('telephone')) {
    return true;
  }
  return false;
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isLikelyUrl(value: string): boolean {
  const raw = String(value || '').trim();
  return /^https?:\/\//i.test(raw) || /^(www\.)/i.test(raw) || /\.[a-z]{2,}(\/|\?|$)/i.test(raw);
}

function isPdfValue(value: string): boolean {
  return /\.pdf(\?|$)/i.test(String(value || ''));
}

function isImageValue(value: string): boolean {
  const v = String(value || '');
  return (
    /\.(jpg|jpeg|png|gif|webp|bmp|heic)(\?|$)/i.test(v) ||
    (v.startsWith('file://') && !v.toLowerCase().endsWith('.pdf'))
  );
}

/** URLs de app nativa primero (mismo criterio que vault `buildDeepLinkCandidates`), luego HTTPS. */
export function buildLinkOpenCandidates(rawUrl: string): string[] {
  const list: string[] = [];
  const safeUrl = ensureWebUrl(rawUrl);
  try {
    const parsed = new URL(safeUrl);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (host.includes('instagram.com')) {
      list.push('instagram://app');
    } else if (host.includes('wa.me') || host.includes('whatsapp.com')) {
      list.push('whatsapp://');
    } else if (host.includes('youtube.com') || host.includes('youtu.be')) {
      list.push('vnd.youtube://');
    } else if (host.includes('linkedin.com')) {
      list.push('linkedin://');
    } else if (host.includes('x.com') || host.includes('twitter.com')) {
      list.push('twitter://');
    }
  } catch {
    /* ignore */
  }
  list.push(safeUrl);
  return list;
}

function socialUrlFromType(typeNorm: string, rawValue: string): string | null {
  const v = String(rawValue || '').trim();
  if (!v) {
    return null;
  }
  if (typeNorm.includes('whatsapp')) {
    const digits = v.replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}` : null;
  }
  if (typeNorm.includes('instagram')) {
    const h = v.replace(/^@/, '').replace(/^\//, '');
    return h ? `https://instagram.com/${h}` : null;
  }
  if (typeNorm.includes('linkedin')) {
    return ensureWebUrl(v.includes('linkedin.com') ? v : `https://linkedin.com/in/${v}`);
  }
  if (typeNorm.includes('twitter') || typeNorm === 'x') {
    const h = v.replace(/^@/, '');
    return h ? `https://twitter.com/${h}` : null;
  }
  if (typeNorm.includes('facebook')) {
    return ensureWebUrl(v.includes('facebook.com') ? v : `https://facebook.com/${v}`);
  }
  if (typeNorm.includes('youtube')) {
    return ensureWebUrl(v.includes('youtube.com') || v.includes('youtu.be') ? v : `https://youtube.com/@${v.replace('@', '')}`);
  }
  if (typeNorm.includes('tiktok')) {
    const h = v.replace(/^@/, '');
    return h ? `https://tiktok.com/@${h}` : null;
  }
  if (typeNorm.includes('telegram')) {
    const h = v.replace(/^@/, '');
    return h ? `https://t.me/${h}` : null;
  }
  if (typeNorm.includes('snapchat')) {
    const h = v.replace(/^@/, '');
    return h ? `https://snapchat.com/add/${h}` : null;
  }
  return null;
}

/**
 * Resuelve qué hacer al abrir un slot público / ítem espejo (misma familia de reglas que la app).
 */
export function getMirrorVaultOpenPlan(item: MirrorItemLike, ctx: MirrorOpenPlanContext): MirrorOpenPlan {
  const type = String(item.type || '').toLowerCase();
  const typeNorm = normalizeTypeKey(item.type);
  const value = String(item.value || '').trim();
  const title = String(item.title || '').trim();

  if (isGhostLinkVaultType(item.type)) {
    return { kind: 'ghost', ctx };
  }

  if (type.includes('email') || isLikelyEmail(value)) {
    return { kind: 'email', value };
  }

  if (isClassicPhoneVaultTypeLocal(item.type)) {
    return { kind: 'phone', value };
  }

  const social = socialUrlFromType(typeNorm, value);
  if (social) {
    return { kind: 'link', url: social, title: title || 'Enlace' };
  }

  if (
    typeNorm.includes('ubicacion') ||
    typeNorm.includes('location') ||
    typeNorm.includes('direccion') ||
    typeNorm.includes('address')
  ) {
    return {
      kind: 'link',
      url: `https://maps.google.com/?q=${encodeURIComponent(value)}`,
      title: title || 'Ubicación',
    };
  }

  if (typeNorm.includes('enlace') || typeNorm.includes('link') || typeNorm.includes('web') || isLikelyUrl(value)) {
    return { kind: 'link', url: ensureWebUrl(value), title: title || 'Enlace' };
  }

  if (
    typeNorm.includes('documento') ||
    typeNorm.includes('pdf') ||
    isPdfValue(value) ||
    isImageValue(value) ||
    (value.startsWith('http') && (isPdfValue(value) || isImageValue(value)))
  ) {
    return { kind: 'document', value, title: title || 'Documento' };
  }

  if (typeNorm.includes('texto')) {
    return { kind: 'text', value, title: title || 'Texto' };
  }

  return { kind: 'raw', value, title: title || 'Dato' };
}

/** Normaliza número para `tel:` (misma regla que ActionController.normalizeTelDialString). */
export function normalizeTelDialString(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }
  const compact = raw.replace(/\s+/g, '');
  if (!/^\+?\d{7,15}$/.test(compact)) {
    return null;
  }
  return compact;
}
