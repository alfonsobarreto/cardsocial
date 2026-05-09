import { isGhostLinkVaultType } from '@card-social/constants/ghostLinkVault';
import { buildLinkOpenCandidates, ensureWebUrl } from '@card-social/services/mirrorVaultItemOpenPlan';
import { isVaultDocumentImage, isVaultDocumentPdf } from '@card-social/services/vaultMimeGuards';
import { resolvePublicVaultUrlForWeb } from '@/lib/resolvePublicVaultMediaUrl';
import { openUrlInNewTabReliably } from '@/lib/openUrlInNewTab';
import type { StudioVaultLink } from '@/lib/studioVaultTypes';
import type { StudioLocale } from '@/lib/studioI18n';

/** `t()` para claves Studio (`vault.preview.*`, `vault.action.*`). */
export type VaultPrimaryT = (key: string) => string;

export type VaultPrimaryHandlers = {
  locale: StudioLocale;
  /** Claves definidas en `studioI18n` (fallback EN si falta idioma). */
  t: VaultPrimaryT;
  openImageLightbox: (opts: { url: string; title: string }) => void;
  openTextSheet: (opts: { title: string; body: string }) => void;
};

function normalizeType(type: string, dataType?: string): string {
  return String(type || dataType || '')
    .trim()
    .toLowerCase();
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isLikelyUrl(value: string): boolean {
  const raw = String(value || '').trim();
  return /^https?:\/\//i.test(raw) || /^(www\.)/i.test(raw) || /\.[a-z]{2,}(\/|\?|$)/i.test(raw);
}

/** Igual cadena NFC que usa `mirrorVaultItemOpenPlan` para tipos teléfono. */
function normalizeTypeKeyForPhone(type: string): string {
  return String(type || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();
}

/** Paridad `isClassicPhoneVaultType` / `mirrorVaultItemOpenPlan` sin importar `@/services` desde Next. */
function isClassicPhoneVaultTypeWeb(type: string | null | undefined): boolean {
  if (isGhostLinkVaultType(type)) return false;
  const k = normalizeTypeKeyForPhone(String(type || ''));
  if (!k) return false;
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
  return k.includes('telefono') || k.includes('telephone');
}

/** Misma validación que `ActionController.ActionTelefono`. */
function normalizeTelDialString(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, '');
  if (!/^\+?\d{7,15}$/.test(compact)) {
    return null;
  }
  return compact;
}

function ghostCopy(localeIsEs: boolean): { title: string; body: string } {
  return {
    title: 'Ghost-Link',
    body: localeIsEs
      ? 'Este ítem activa una llamada VoIP privada cuando alguien lo usa en tu tarjeta compartida. No guarda número en el Búnker.'
      : 'This item starts a private VoIP call when someone uses it on your shared card. It does not store a phone number in the Vault.',
  };
}

/**
 * Igual orden que `handleCardAction` en `app/(tabs)/vault.tsx` (tap en IconData).
 * Web: sin biometría, sin QR en visor de imagen; PDF/enlaces → pestaña; imagen/texto → callbacks.
 */
function openWebUrlCandidates(rawUrl: string): boolean {
  if (typeof window === 'undefined') return false;

  const candidates = buildLinkOpenCandidates(rawUrl);
  for (const candidate of candidates) {
    try {
      const w = window.open(candidate, '_blank', 'noopener,noreferrer');
      if (w) return true;
    } catch {
      /* siguiente */
    }
    if (/^https?:\/\//i.test(candidate)) {
      openUrlInNewTabReliably(candidate);
      return true;
    }
  }

  try {
    const browserUrl = ensureWebUrl(rawUrl);
    openUrlInNewTabReliably(browserUrl);
    return true;
  } catch {
    return false;
  }
}

export function runStudioVaultItemPrimaryAction(link: StudioVaultLink, h: VaultPrimaryHandlers): void {
  const { t, locale, openImageLightbox, openTextSheet } = h;
  const localeIsEs = locale === 'es';

  try {
    const rawValue = String(link.value || '').trim();
    const normalizedType = normalizeType(link.type, (link as { dataType?: string }).dataType);

    if (isGhostLinkVaultType(link.type)) {
      const ctx = ghostCopy(localeIsEs);
      window.alert(`${ctx.title}\n\n${ctx.body}`);
      return;
    }

    if (!rawValue) {
      window.alert(`${t('vault.action.errorTitle')}\n\n${t('vault.action.emptyValue')}`);
      return;
    }

    if (normalizedType === 'email' || isLikelyEmail(rawValue)) {
      const mailtoTarget = `mailto:${rawValue}`;
      try {
        window.location.href = mailtoTarget;
      } catch {
        window.alert(t('vault.action.mailFailed'));
      }
      return;
    }

    if (normalizedType === 'enlaces' || isLikelyUrl(rawValue)) {
      const ok = openWebUrlCandidates(rawValue);
      if (!ok) {
        window.alert(t('vault.action.linkFailed'));
      }
      return;
    }

    if (
      normalizedType === 'documento' ||
      normalizedType === 'imagen' ||
      isVaultDocumentImage(rawValue, link.vaultMimeType) ||
      isVaultDocumentPdf(rawValue, link.vaultMimeType)
    ) {
      const resolved = resolvePublicVaultUrlForWeb(rawValue)?.trim() || rawValue.trim();
      const openInTab = /^https?:\/\//i.test(resolved);

      if (isVaultDocumentPdf(rawValue, link.vaultMimeType)) {
        if (openInTab) {
          openUrlInNewTabReliably(resolved);
          return;
        }
        window.alert(t('vault.action.pdfNoUrl'));
        return;
      }

      /* Imagen / visor tipo imagen (sin PDF): lightbox React */
      if (isVaultDocumentImage(rawValue, link.vaultMimeType) || normalizedType === 'imagen') {
        if (!openInTab) {
          window.alert(t('vault.action.imageNoUrl'));
          return;
        }
        openImageLightbox({ url: resolved, title: link.title?.trim() || t('vault.action.imageFallbackTitle') });
        return;
      }

      /* Fallback documento como enlace público si hay URL */
      if (openInTab) {
        openUrlInNewTabReliably(resolved);
      } else {
        window.alert(t('vault.action.documentUnknown'));
      }
      return;
    }

    if (isClassicPhoneVaultTypeWeb(link.type) || normalizedType === 'teléfono' || normalizedType === 'telefono') {
      const tel = normalizeTelDialString(rawValue);
      if (!tel) {
        window.alert(t('vault.action.invalidPhone'));
        return;
      }
      try {
        window.location.href = `tel:${tel}`;
      } catch {
        window.alert(t('vault.action.invalidPhone'));
      }
      return;
    }

    /* Texto / residual → panel soberano (modal web) */
    openTextSheet({
      title: link.title?.trim() || t('vault.action.textFallbackTitle'),
      body: rawValue || '—',
    });
  } catch {
    window.alert(`${h.t('vault.action.runFailedTitle')}\n\n${h.t('vault.action.runFailed')}`);
  }
}
