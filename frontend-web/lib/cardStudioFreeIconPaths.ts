/**
 * Iconos vectoriales del Card Studio (carpeta Esenciales en CardStudioVault).
 * Rutas MDI (@mdi/js) para que la web coincida con MaterialCommunityIcons en la app.
 * Mantener alineado con `app/components/CardStudioVault.tsx` → STUDIO_FOLDERS esenciales.
 */

import type { SlotIconDef } from '@/lib/slotIcons';
import {
  mdiAndroid,
  mdiApple,
  mdiAt,
  mdiCardText,
  mdiCellphone,
  mdiCertificate,
  mdiContacts,
  mdiCrown,
  mdiDiamondStone,
  mdiEmail,
  mdiEmailOpen,
  mdiEmailOutline,
  mdiEyeOutline,
  mdiFacebook,
  mdiFileDocument,
  mdiFileExcel,
  mdiFileImage,
  mdiFileMusic,
  mdiFilePdfBox,
  mdiFileVideo,
  mdiFileWord,
  mdiFingerprint,
  mdiFlash,
  mdiFolderLock,
  mdiFolderZip,
  mdiGmail,
  mdiHeart,
  mdiHelpCircle,
  mdiInstagram,
  mdiKey,
  mdiLinkedin,
  mdiLinkVariant,
  mdiLock,
  mdiMailbox,
  mdiMicrosoftOutlook,
  mdiMusicNote,
  mdiPhone,
  mdiPhoneClassic,
  mdiPhoneInTalk,
  mdiPhoneVoip,
  mdiPresentation,
  mdiSend,
  mdiShieldCheck,
  mdiSnapchat,
  mdiStar,
  mdiTabletCellphone,
  mdiTwitter,
  mdiVibrate,
  mdiWeb,
  mdiWhatsapp,
  mdiYahoo,
  mdiYoutube,
  mdiZipBox,
} from '@mdi/js';

/** Mismos alias que `app/components/iconNameValidation.ts` ICON_NAME_ALIASES (resolución web). */
const ICON_NAME_ALIASES: Record<string, string> = {
  'file-presentation': 'presentation',
  'alternate-email': 'email',
  gmail: 'gmail',
  stamp: 'certificate',
  sello: 'certificate',
  classic: 'card-text',
  clasico: 'card-text',
  'clásico': 'card-text',
};

/** Variantes habituales guardadas en slots (misma forma visual que en estudio). */
const EXTRA_ALIASES: Record<string, string> = {
  tiktok: 'music-note',
};

const MDI_VIEW = '0 0 24 24';

function toLookupKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^mdi-/, '');
}

function applyAliases(key: string): string {
  const k = toLookupKey(key);
  return EXTRA_ALIASES[k] ?? ICON_NAME_ALIASES[k] ?? ICON_NAME_ALIASES[key.trim().toLowerCase()] ?? k;
}

/**
 * Claves canónicas (post-alias) → path MDI.
 * Una entrada por icono distinto en Esenciales (sin duplicar whatsapp).
 */
const PATH_BY_KEY: Record<string, string> = {
  linkedin: mdiLinkedin,
  instagram: mdiInstagram,
  facebook: mdiFacebook,
  whatsapp: mdiWhatsapp,
  twitter: mdiTwitter,
  'music-note': mdiMusicNote,
  youtube: mdiYoutube,
  snapchat: mdiSnapchat,
  web: mdiWeb,
  'link-variant': mdiLinkVariant,
  'phone-in-talk': mdiPhoneInTalk,
  apple: mdiApple,
  android: mdiAndroid,
  phone: mdiPhone,
  'phone-classic': mdiPhoneClassic,
  cellphone: mdiCellphone,
  'tablet-cellphone': mdiTabletCellphone,
  vibrate: mdiVibrate,
  'phone-voip': mdiPhoneVoip,
  contacts: mdiContacts,
  gmail: mdiGmail,
  'email-outline': mdiEmailOutline,
  'email-open': mdiEmailOpen,
  'microsoft-outlook': mdiMicrosoftOutlook,
  yahoo: mdiYahoo,
  mailbox: mdiMailbox,
  send: mdiSend,
  certificate: mdiCertificate,
  at: mdiAt,
  email: mdiEmail,
  key: mdiKey,
  'shield-check': mdiShieldCheck,
  lock: mdiLock,
  'folder-lock': mdiFolderLock,
  'eye-outline': mdiEyeOutline,
  fingerprint: mdiFingerprint,
  star: mdiStar,
  'diamond-stone': mdiDiamondStone,
  crown: mdiCrown,
  heart: mdiHeart,
  flash: mdiFlash,
  'file-pdf-box': mdiFilePdfBox,
  'file-image': mdiFileImage,
  'file-video': mdiFileVideo,
  'file-word': mdiFileWord,
  'file-excel': mdiFileExcel,
  'file-document': mdiFileDocument,
  presentation: mdiPresentation,
  'file-music': mdiFileMusic,
  'zip-box': mdiZipBox,
  'folder-zip': mdiFolderZip,
  'card-text': mdiCardText,
  'help-circle': mdiHelpCircle,
};

function defFromPath(path: string): SlotIconDef {
  return { path, viewBox: MDI_VIEW };
}

/** Definición MDI para iconos desconocidos (alineado con normalizeMaterialIconName fallback en app). */
export const CARD_STUDIO_FALLBACK_ICON_DEF: SlotIconDef = defFromPath(mdiHelpCircle);

/**
 * Resuelve nombre Material / alias a SVG si pertenece al set gratuito del estudio.
 */
export function resolveCardStudioFreeIconDef(iconName: string | null | undefined): SlotIconDef | null {
  const raw = String(iconName || '').trim();
  if (!raw) return null;

  const normalized = raw.toLowerCase().replace(/\s+/g, '-');
  const candidates = [raw, normalized, ICON_NAME_ALIASES[raw.toLowerCase()], ICON_NAME_ALIASES[normalized]].filter(
    (x): x is string => Boolean(x),
  );

  for (const c of candidates) {
    let key = applyAliases(c);
    key = toLookupKey(key);
    const path = PATH_BY_KEY[key];
    if (path) return defFromPath(path);
  }

  return null;
}

/** Lista de claves canónicas (útil para tests / documentación). */
export const CARD_STUDIO_FREE_ICON_KEYS = Object.freeze(Object.keys(PATH_BY_KEY).filter((k) => k !== 'help-circle'));
