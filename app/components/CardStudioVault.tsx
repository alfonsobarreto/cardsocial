/**
 * CardStudioVault
 * ─────────────────────────────────────────────────────────────────────────────
 * Galería categorizada de íconos para el Vault y Card-Studio.
 * Todos los íconos activos son vectoriales (MaterialCommunityIcons) — cero PNGs.
 * Al añadir un icono a STUDIO_FOLDERS (nombre en `icon:`), añade su path en
 * `frontend-web/lib/cardStudioFreeIconPaths` y vuelve a generar `backend/…/cardStudioMatPaths.js` (build-cardStudioMatPaths.cjs) para business/web y smart HTML.
 * Secciones premium vacías se muestran como colecciones futuras con badge 🔒.
 */

import { useModalFooterBottomPad } from '@/hooks/useModalFooterBottomPad';
import { STUDIO_CATALOG_VECTOR_ICONS_PAID, STUDIO_ICON_CREDIT_PRICE } from '@/constants/studioEconomy';
import { TEXAS_LONGHORNS_ICON_SEEDS } from '@/constants/texasLonghornsPack';
import { getActiveUserId } from '@/services/authSession';
import {
    isFreeStarterIconKey,
    purchaseStudioIconUnlock,
    stableKeyForCatalogIcon,
} from '@/services/iconVaultService';
import { trEsEn, useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import {
    purchaseThemeBundle,
    THEME_BUNDLES,
    userOwnsThemeBundle,
} from '@/services/themeBundleService';
import {
    readRecentIconsJsonWithLegacyMigration,
    readVaultJsonWithLegacyMigration,
    vaultRecentIconsStorageKey,
    vaultStorageKey,
} from '@/services/userScopedStorage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    InteractionManager,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    SectionList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { sanitizeMaterialIconName } from './iconNameValidation';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAX_RECENTS = 5;

// Alturas fijas para getItemLayout — medidas desde los StyleSheet de este archivo.
// sectionHeader: paddingVertical:8×2=16 + fontSize:12 lineHeight≈17 + hairlineWidth≈1 = 34
// icon row:      row.paddingVertical:4×2=8 + iconCellWrap.margin:4×2=8 + iconItem.minHeight:72 = 88
// emptySection:  paddingVertical:14×2=28 + icon:28 = 56
const SECTION_HEADER_H = 34;
const ICON_ROW_H = 88;
const EMPTY_FOOTER_H = 56;

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type VaultDataType =
  | 'Enlaces'
  | 'Teléfono'
  | 'Ghost-Link'
  | 'Email'
  | 'Texto Plain'
  | 'Documento';

export interface IconItem {
  id: string;
  label: string;    // Español
  labelEn: string;  // English
  icon: string;
}

interface IconSection {
  title: string;
  titleEn?: string;
  data: IconItem[][];   // SectionList rows — cada row es un array de hasta 5 items
  isEmpty?: boolean;
  isPremium?: boolean;
  emptyLabel?: string;
  emptyLabelEn?: string;
  /** Coincide con dataType para auto-scroll (sin prefijo de carpeta). */
  scrollAnchor?: string;
}

type RawSectionDef = {
  title: string;
  titleEn: string;
  items?: Array<{ label: string; labelEn: string; icon: string }>;
  isEmpty?: boolean;
  isPremium?: boolean;
  emptyLabel?: string;
  emptyLabelEn?: string;
  scrollAnchor?: string;
};

type StudioFolderDef = {
  id: string;
  title: string;
  titleEn: string;
  sections: RawSectionDef[];
};

const STUDIO_FOLDERS: StudioFolderDef[] = [
  {
    id: 'esenciales',
    title: 'Esenciales',
    titleEn: 'Essentials',
    sections: [
      {
        title: 'Enlaces',
        titleEn: 'Links',
        scrollAnchor: 'Enlaces',
        items: [
          { label: 'LinkedIn', labelEn: 'LinkedIn', icon: 'linkedin' },
          { label: 'Instagram', labelEn: 'Instagram', icon: 'instagram' },
          { label: 'Facebook', labelEn: 'Facebook', icon: 'facebook' },
          { label: 'WhatsApp', labelEn: 'WhatsApp', icon: 'whatsapp' },
          { label: 'Twitter/X', labelEn: 'Twitter/X', icon: 'twitter' },
          { label: 'TikTok', labelEn: 'TikTok', icon: 'music-note' },
          { label: 'YouTube', labelEn: 'YouTube', icon: 'youtube' },
          { label: 'Snapchat', labelEn: 'Snapchat', icon: 'snapchat' },
          { label: 'Web', labelEn: 'Web', icon: 'web' },
          { label: 'Enlace', labelEn: 'Link', icon: 'link-variant' },
        ],
      },
      {
        title: 'Teléfonos',
        titleEn: 'Phones',
        scrollAnchor: 'Teléfonos',
        items: [
          { label: 'Llamada', labelEn: 'Call', icon: 'phone-in-talk' },
          { label: 'Apple', labelEn: 'Apple', icon: 'apple' },
          { label: 'Android', labelEn: 'Android', icon: 'android' },
          { label: 'Teléfono', labelEn: 'Phone', icon: 'phone' },
          { label: 'Clásico', labelEn: 'Classic', icon: 'phone-classic' },
          { label: 'Celular', labelEn: 'Mobile', icon: 'cellphone' },
          { label: 'WhatsApp', labelEn: 'WhatsApp', icon: 'whatsapp' },
          { label: 'Tablet', labelEn: 'Tablet', icon: 'tablet-cellphone' },
          { label: 'Vibrar', labelEn: 'Vibrate', icon: 'vibrate' },
          { label: 'VoIP', labelEn: 'VoIP', icon: 'phone-voip' },
          { label: 'Contactos', labelEn: 'Contacts', icon: 'contacts' },
        ],
      },
      {
        title: 'Emails',
        titleEn: 'Emails',
        scrollAnchor: 'Emails',
        items: [
          { label: 'Gmail', labelEn: 'Gmail', icon: 'gmail' },
          { label: 'Email', labelEn: 'Email', icon: 'email-outline' },
          { label: 'Abierto', labelEn: 'Open', icon: 'email-open' },
          { label: 'Outlook', labelEn: 'Outlook', icon: 'microsoft-outlook' },
          { label: 'Yahoo', labelEn: 'Yahoo', icon: 'yahoo' },
          { label: 'Buzón', labelEn: 'Mailbox', icon: 'mailbox' },
          { label: 'Enviar', labelEn: 'Send', icon: 'send' },
          { label: 'Sello', labelEn: 'Stamp', icon: 'certificate' },
          { label: 'Arroba', labelEn: 'At Sign', icon: 'at' },
          { label: 'Alt Email', labelEn: 'Alt Email', icon: 'email' },
        ],
      },
      {
        title: 'Texto',
        titleEn: 'Text',
        scrollAnchor: 'Texto',
        items: [
          { label: 'Cuadro Texto', labelEn: 'Text Box', icon: 'text-box-outline' },
          { label: 'Formato', labelEn: 'Format', icon: 'format-text' },
          { label: 'Nota', labelEn: 'Note', icon: 'note-text-outline' },
          { label: 'Mensaje', labelEn: 'Message', icon: 'message-text-outline' },
          { label: 'Portapapeles', labelEn: 'Clipboard', icon: 'clipboard-text-outline' },
          { label: 'Texto', labelEn: 'Text', icon: 'text' },
          { label: 'Párrafo', labelEn: 'Paragraph', icon: 'format-paragraph' },
          { label: 'Cita', labelEn: 'Quote', icon: 'format-quote-close' },
          { label: 'Pluma', labelEn: 'Pen', icon: 'pen' },
          { label: 'Lápiz', labelEn: 'Pencil', icon: 'pencil-outline' },
        ],
      },
      {
        title: 'Seguridad / Estilo',
        titleEn: 'Security / Style',
        items: [
          { label: 'Llave', labelEn: 'Key', icon: 'key' },
          { label: 'Escudo', labelEn: 'Shield', icon: 'shield-check' },
          { label: 'Candado', labelEn: 'Lock', icon: 'lock' },
          { label: 'Carpeta', labelEn: 'Folder', icon: 'folder-lock' },
          { label: 'Ojo', labelEn: 'Eye', icon: 'eye-outline' },
          { label: 'Huella', labelEn: 'Fingerprint', icon: 'fingerprint' },
          { label: 'Estrella', labelEn: 'Star', icon: 'star' },
          { label: 'Diamante', labelEn: 'Diamond', icon: 'diamond-stone' },
          { label: 'Corona', labelEn: 'Crown', icon: 'crown' },
          { label: 'Corazón', labelEn: 'Heart', icon: 'heart' },
          { label: 'Rayo', labelEn: 'Flash', icon: 'flash' },
        ],
      },
      {
        title: 'Documentos',
        titleEn: 'Documents',
        scrollAnchor: 'Documentos',
        items: [
          { label: 'PDF', labelEn: 'PDF', icon: 'file-pdf-box' },
          { label: 'Imagen', labelEn: 'Image', icon: 'file-image' },
          { label: 'Video', labelEn: 'Video', icon: 'file-video' },
          { label: 'Word', labelEn: 'Word', icon: 'file-word' },
          { label: 'Excel', labelEn: 'Excel', icon: 'file-excel' },
          { label: 'Doc', labelEn: 'Doc', icon: 'file-document' },
          { label: 'PPT', labelEn: 'PPT', icon: 'presentation' },
          { label: 'Música', labelEn: 'Music', icon: 'file-music' },
          { label: 'ZIP', labelEn: 'ZIP', icon: 'zip-box' },
          { label: 'Carpeta', labelEn: 'Folder', icon: 'folder-zip' },
        ],
      },
      {
        title: 'Mis Iconos Personalizados',
        titleEn: 'My Custom Icons',
        isEmpty: true,
        isPremium: false,
        emptyLabel: 'Próximamente: Sube tus propios iconos',
        emptyLabelEn: 'Coming soon: Upload your own icons',
      },
    ],
  },
  {
    id: 'luxury',
    title: 'Luxury',
    titleEn: 'Luxury',
    sections: [
      {
        title: 'Colección Luxury',
        titleEn: 'Luxury collection',
        isEmpty: true,
        isPremium: true,
        emptyLabel: 'Iconos vector luxury — Próximamente en boutique',
        emptyLabelEn: 'Luxury vector icons — Coming soon to the boutique',
      },
    ],
  },
  {
    id: 'animated',
    title: 'Animados',
    titleEn: 'Animated',
    sections: [
      {
        title: 'GIF / Lottie',
        titleEn: 'GIF / Lottie',
        isEmpty: true,
        isPremium: true,
        emptyLabel: 'Iconos animados — Próximamente',
        emptyLabelEn: 'Animated icons — Coming soon',
      },
    ],
  },
  {
    id: 'd3',
    title: '3D',
    titleEn: '3D',
    sections: [
      {
        title: 'Iconos 3D',
        titleEn: '3D icons',
        isEmpty: true,
        isPremium: true,
        emptyLabel: 'Pack 3D — Próximamente',
        emptyLabelEn: '3D pack — Coming soon',
      },
    ],
  },
  {
    id: 'collectibles',
    title: 'Coleccionables',
    titleEn: 'Collectibles',
    sections: [
      {
        title: 'Ediciones limitadas',
        titleEn: 'Limited editions',
        isEmpty: true,
        isPremium: true,
        emptyLabel: 'Coleccionables — Próximamente',
        emptyLabelEn: 'Collectibles — Coming soon',
      },
    ],
  },
  {
    id: 'themes',
    title: 'Themes temáticos',
    titleEn: 'Thematic themes',
    sections: [
      {
        title: 'Texas Longhorns',
        titleEn: 'Texas Longhorns',
        items: TEXAS_LONGHORNS_ICON_SEEDS.map((s) => ({
          label: s.label,
          labelEn: s.labelEn,
          icon: s.icon,
        })),
      },
      {
        title: 'Más bundles',
        titleEn: 'More bundles',
        isEmpty: true,
        isPremium: true,
        emptyLabel: 'Nuevos packs temáticos — Próximamente',
        emptyLabelEn: 'New theme packs — Coming soon',
      },
    ],
  },
];

let _globalId = 1;
function buildIconSections(): IconSection[] {
  const out: IconSection[] = [];
  for (const folder of STUDIO_FOLDERS) {
    for (const sec of folder.sections) {
      const title = `${folder.title} · ${sec.title}`;
      const titleEn = `${folder.titleEn} · ${sec.titleEn}`;
      if (sec.isEmpty || !sec.items) {
        out.push({
          title,
          titleEn,
          data: [],
          isEmpty: true,
          isPremium: sec.isPremium,
          emptyLabel: sec.emptyLabel,
          emptyLabelEn: sec.emptyLabelEn,
          scrollAnchor: sec.scrollAnchor,
        });
        continue;
      }
      const items: IconItem[] = sec.items.map((i) => ({
        id: String(_globalId++),
        label: i.label,
        labelEn: i.labelEn,
        icon: sanitizeMaterialIconName(i.icon),
      }));
      const rows: IconItem[][] = [];
      for (let i = 0; i < items.length; i += 5) rows.push(items.slice(i, i + 5));
      out.push({ title, titleEn, data: rows, scrollAnchor: sec.scrollAnchor });
    }
  }
  return out;
}

const ICON_SECTIONS: IconSection[] = buildIconSections();

const STUDIO_SECTION_TITLE_SEP = ' · ';

/** Pares ES/EN del catálogo → `tr()` para pt/fr/it (antes solo EN fuera de ES). */
function translateStudioSectionTitle(section: IconSection, tr: (es: string, en: string) => string): string {
  const enTitle = section.titleEn ?? section.title;
  if (section.title.includes(STUDIO_SECTION_TITLE_SEP) && enTitle.includes(STUDIO_SECTION_TITLE_SEP)) {
    const esParts = section.title.split(STUDIO_SECTION_TITLE_SEP);
    const enParts = enTitle.split(STUDIO_SECTION_TITLE_SEP);
    if (esParts.length === enParts.length && esParts.length > 1) {
      return esParts.map((es, i) => tr(es.trim(), enParts[i].trim())).join(STUDIO_SECTION_TITLE_SEP);
    }
  }
  return tr(section.title, enTitle);
}

export const ICON_GALLERY: IconItem[] = ICON_SECTIONS.flatMap((sec) =>
  sec.data.flatMap((row) => row),
);

interface CardStudioVaultProps {
  visible: boolean;
  onClose: () => void;
  onSelectIcon: (iconId: string) => void;
  dataType: VaultDataType;
  selectedIcon: string;
  /** Claves poseídas en Firestore icon_vault (incluye compras y packs). */
  ownedIconVaultKeys: Set<string>;
  creditsBalance: number;
  iconCreditPrice?: number;
  onEconomyUpdated?: () => void;
}

function isIconUnlockedForUser(item: IconItem, ownedKeys: Set<string>): boolean {
  if (!STUDIO_CATALOG_VECTOR_ICONS_PAID) {
    return true;
  }
  const stable = stableKeyForCatalogIcon(item);
  return isFreeStarterIconKey(stable) || ownedKeys.has(stable);
}

export default function CardStudioVault({
  visible,
  onClose,
  onSelectIcon,
  dataType,
  selectedIcon,
  ownedIconVaultKeys,
  creditsBalance,
  iconCreditPrice = STUDIO_ICON_CREDIT_PRICE,
  onEconomyUpdated,
}: CardStudioVaultProps) {
  const { resolvedMode } = useLookMode();
  const isNight = resolvedMode === 'noche';
  const { language } = useLanguage();
  const tr = (es: string, en: string) => trEsEn(es, en, language);
  const modalFooterBottomPad = useModalFooterBottomPad();
  const [storeModalVisible, setStoreModalVisible] = useState(false);
  const [recentIconIds, setRecentIconIds] = useState<string[]>([]);
  const [bundleOwnedFlags, setBundleOwnedFlags] = useState<Record<string, boolean>>({});
  const [bundlePurchasingId, setBundlePurchasingId] = useState<string | null>(null);
  const sectionListRef = useRef<SectionList<IconItem[], IconSection>>(null);
  const pendingScrollSectionRef = useRef<number | null>(null);
  // Ref que siempre apunta a displaySections actual — evita stale closures en onShow
  const displaySectionsRef = useRef<IconSection[]>([]);

  useEffect(() => {
    if (!visible && storeModalVisible) {
      setStoreModalVisible(false);
    }
  }, [visible, storeModalVisible]);

  useEffect(() => {
    if (!storeModalVisible) return;
    void (async () => {
      const uid = await getActiveUserId();
      if (!uid) return;
      const next: Record<string, boolean> = {};
      for (const b of THEME_BUNDLES) {
        next[b.id] = await userOwnsThemeBundle(uid, b.id);
      }
      setBundleOwnedFlags(next);
    })();
  }, [storeModalVisible]);

  // Cargar recientes de AsyncStorage al montar — diferido para no bloquear la animación
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          const uid = await getActiveUserId();
          if (!uid) return;
          const raw = await readRecentIconsJsonWithLegacyMigration(uid);
          if (raw) setRecentIconIds(JSON.parse(raw));
        } catch { /* ignore */ }
      })();
    });
    return () => task.cancel();
  }, []);

  const catalogSections = ICON_SECTIONS;

  const studioHeaderSuffix = useMemo(() => {
    const t = (es: string, en: string) => trEsEn(es, en, language);
    switch (dataType) {
      case 'Enlaces':
        return t('Enlaces', 'Links');
      case 'Teléfono':
        return t('Teléfono', 'Phone');
      case 'Ghost-Link':
        return t('Ghost Link', 'Ghost Link');
      case 'Email':
        return t('Email', 'Email');
      case 'Texto Plain':
        return t('Texto', 'Text');
      case 'Documento':
        return t('Documento', 'Document');
      default:
        return String(dataType);
    }
  }, [dataType, language]);

  const recentItemsResolved = useMemo(() => {
    return recentIconIds
      .map((rawId) => {
        const byLegacy = ICON_GALLERY.find((i) => i.id === rawId);
        const item = byLegacy || ICON_GALLERY.find((i) => stableKeyForCatalogIcon(i) === rawId);
        return item;
      })
      .filter((item): item is IconItem => {
        if (!item) return false;
        return isIconUnlockedForUser(item, ownedIconVaultKeys);
      });
  }, [recentIconIds, ownedIconVaultKeys]);

  // Mantener ref sincronizada con displaySections
  // (se actualiza antes de onShow porque el render ocurre primero)
  useEffect(() => {
    displaySectionsRef.current = displaySections;
  });

  // Secciones dinámicas — antepone "Recientes" si existen
  const displaySections = useMemo((): IconSection[] => {
    if (recentItemsResolved.length === 0) return catalogSections;
    const recentItems = recentItemsResolved;
    const recentRows: IconItem[][] = [];
    for (let i = 0; i < recentItems.length; i += 5)
      recentRows.push(recentItems.slice(i, i + 5));
    const recentSection: IconSection = {
      title: 'Recientes',
      titleEn: 'Recent',
      data: recentRows,
    };
    return [recentSection, ...catalogSections];
  }, [recentItemsResolved, catalogSections]);

  // Mapa plano de offsets para getItemLayout — VirtualizedSectionList cuenta 1 header + N rows + 1 footer por sección.
  const sectionLayouts = useMemo(() => {
    const arr: Array<{ length: number; offset: number }> = [];
    let offset = 0;
    for (const section of displaySections) {
      // header
      arr.push({ length: SECTION_HEADER_H, offset });
      offset += SECTION_HEADER_H;
      // data rows
      for (let i = 0; i < section.data.length; i++) {
        arr.push({ length: ICON_ROW_H, offset });
        offset += ICON_ROW_H;
      }
      // footer (slot siempre existe; height 0 para secciones no-empty)
      const footerH = section.isEmpty ? EMPTY_FOOTER_H : 0;
      arr.push({ length: footerH, offset });
      offset += footerH;
    }
    return arr;
  }, [displaySections]);

  const TITLE_MAP: Record<string, string> = {
    'Enlaces': 'Enlaces',
    'Teléfono': 'Teléfonos',
    'Ghost-Link': 'Teléfonos',
    'Email': 'Emails',
    'Texto Plain': 'Texto',
    'Documento': 'Documentos',
  };

  // Lee displaySectionsRef.current en el momento del scroll (nunca stale)
  const doAutoScroll = useCallback(() => {
    const target = TITLE_MAP[dataType];
    if (!target) return;
    const sections = displaySectionsRef.current;
    const sectionIndex = sections.findIndex(
      (s) => s.scrollAnchor === target || s.title.includes(`· ${target}`),
    );
    console.log('[IconPicker] auto-scroll → dataType:', dataType, '| target:', target, '| sectionIndex:', sectionIndex, '| total sections:', sections.length);
    if (sectionIndex < 0) return;
    pendingScrollSectionRef.current = sectionIndex;
    sectionListRef.current?.scrollToLocation({
      sectionIndex,
      itemIndex: 0,
      animated: true,
      viewPosition: 0,
      // viewOffset = altura del section header: hace que el header quede visible
      // justo encima del primer row, en lugar de quedar cortado fuera del viewport.
      viewOffset: SECTION_HEADER_H,
    });
  }, [dataType]);

  const handleSelectCatalogItem = (item: IconItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const stable = stableKeyForCatalogIcon(item);
    onSelectIcon(stable);
    onClose();
    InteractionManager.runAfterInteractions(() => {
      void (async () => {
        const next = [stable, ...recentIconIds.filter((id) => id !== stable)].slice(0, MAX_RECENTS);
        setRecentIconIds(next);
        try {
          const uid = await getActiveUserId();
          if (uid) {
            await AsyncStorage.setItem(vaultRecentIconsStorageKey(uid), JSON.stringify(next));
          }
        } catch { /* ignore */ }
      })();
    });
  };

  const promptPurchaseIcon = (item: IconItem) => {
    void (async () => {
      const uid = await getActiveUserId();
      if (!uid) return;
      Alert.alert(
        tr('Desbloquear icono', 'Unlock icon'),
        tr(
          `Incluye este icono en tu bóveda por ${iconCreditPrice} Créditos CS.`,
          `Add this icon to your vault for ${iconCreditPrice} CS credits.`,
        ),
        [
          { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
          {
            text: tr('Comprar', 'Buy'),
            onPress: () => {
              void (async () => {
                const ok = await purchaseStudioIconUnlock(
                  uid,
                  {
                    id: item.id,
                    icon: item.icon,
                    label: item.label,
                    labelEn: item.labelEn,
                  },
                  iconCreditPrice,
                );
                if (ok) {
                  onEconomyUpdated?.();
                  handleSelectCatalogItem(item);
                } else {
                  Alert.alert(
                    tr('No se pudo comprar', 'Purchase failed'),
                    tr('Revisa tu saldo de Créditos CS.', 'Check your CS credit balance.'),
                  );
                }
              })();
            },
          },
        ],
      );
    })();
  };

  const onPressCatalogIcon = (item: IconItem) => {
    if (isIconUnlockedForUser(item, ownedIconVaultKeys)) {
      handleSelectCatalogItem(item);
    } else {
      promptPurchaseIcon(item);
    }
  };

  const onPurchaseThemeBundlePress = (bundleId: string) => {
    void (async () => {
      const uid = await getActiveUserId();
      if (!uid) return;
      setBundlePurchasingId(bundleId);
      try {
        const ok = await purchaseThemeBundle(uid, bundleId);
        if (ok) {
          setBundleOwnedFlags((p) => ({ ...p, [bundleId]: true }));
          onEconomyUpdated?.();
          Alert.alert(
            tr('Bundle desbloqueado', 'Bundle unlocked'),
            tr(
              'Tus 3 variantes de tema y el pack de iconos ya están disponibles.',
              'Your 3 theme variants and icon pack are now available.',
            ),
          );
        } else {
          Alert.alert(
            tr('No se pudo comprar', 'Purchase failed'),
            tr('Saldo insuficiente u error de red.', 'Insufficient balance or network error.'),
          );
        }
      } finally {
        setBundlePurchasingId(null);
      }
    })();
  };

  /** Alineado con NewInfoForm: lujo día/noche (oro, sin azul “app antigua”). */
  const theme = useMemo(
    () => ({
      sheetBg: isNight ? '#121212' : '#FAF8F4',
      border: '#E9C349',
      labelGold: '#E9C349',
      titleColor: isNight ? '#FFFFFF' : '#1A1510',
      textPrimary: isNight ? '#F2F0EB' : '#1C180F',
      textSecondary: isNight ? '#9A9388' : '#5C5346',
      /** Opaco #000: evita bleed-through bajo cabeceras sticky (día y noche). */
      sectionHeaderBg: '#000000',
      sectionHeaderBorder: 'rgba(233,195,73,0.32)',
      tileInactiveBg: isNight ? '#161616' : '#FFFFFF',
      tileInactiveBorder: isNight ? 'rgba(153,144,124,0.4)' : 'rgba(92,77,50,0.22)',
      selectedFillGradient: (isNight
        ? (['#5A4820', '#C9A227', '#FFF2C4', '#E8D4A3', '#B8942E', '#5A4820'] as const)
        : (['#7A6528', '#E0C068', '#FFF8E8', '#F0D878', '#C9A227', '#7A6528'] as const)) as readonly [string, string, ...string[]],
      selectedText: '#0C0C0C',
      selectedIcon: '#0C0C0C',
      premiumBadgeBg: isNight ? '#221C12' : '#F3EBD4',
      premiumBadgeText: '#E9C349',
      headerAccentGradient: (isNight
        ? (['#3D3018', '#C9A227', '#F2CA50', '#C9A227', '#3D3018'] as const)
        : (['#8B7349', '#E9C349', '#F5E6C8', '#E9C349', '#9A8048'] as const)) as readonly [string, string, ...string[]],
      storeSheetBg: isNight ? '#141210' : '#FFFCF7',
      storeSubtitle: isNight ? '#B5ADA2' : '#5C5346',
      bundleMeta: isNight ? '#A8A090' : '#6B6258',
      ctaGradient: (isNight
        ? (['#6B5420', '#B8942E', '#FFEFD0', '#F2CA50', '#E9C349', '#6B5420'] as const)
        : (['#8B7340', '#E9C349', '#FFF4D8', '#F2CA50', '#C9A227', '#7A6228'] as const)) as readonly [string, string, ...string[]],
    }),
    [isNight],
  );

  const handleLongPress = (item: IconItem) => {
    Alert.alert(
      tr(`Eliminar icono "${item.label}"`, `Delete icon "${item.labelEn}"`),
      tr(
        'Si lo eliminas, los datos del B\u00fanker que usen este \u00edcono quedar\u00e1n con el \u00edcono por defecto. \u00bfDeseas continuar?',
        'If you delete it, Vault items using this icon will revert to the default icon. Continue?'
      ),
      [
        { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
        {
          text: tr('Eliminar', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const uid = await getActiveUserId();
              if (!uid) return;
              const raw = await readVaultJsonWithLegacyMigration(uid);
              if (!raw) return;
              const data: any[] = JSON.parse(raw);
              const updated = data.map((entry) =>
                entry.iconName === item.label
                  ? { ...entry, icon: 'file-document', iconName: 'Documento' }
                  : entry
              );
              await AsyncStorage.setItem(vaultStorageKey(uid), JSON.stringify(updated));
            } catch {
              // silent
            }
          },
        },
      ]
    );
  };

  const renderSectionHeader = ({ section }: { section: IconSection }) => (
    <View
      style={[
        styles.sectionHeader,
        {
          backgroundColor: theme.sectionHeaderBg,
          borderBottomColor: theme.sectionHeaderBorder,
        },
        styles.sectionHeaderSticky,
      ]}
    >
      <Text style={[styles.sectionTitle, { color: theme.labelGold }]}>
        {translateStudioSectionTitle(section, tr)}
      </Text>
      {section.isPremium && (
        <View style={[styles.premiumBadge, { backgroundColor: theme.premiumBadgeBg }]}>
          <MaterialCommunityIcons name="crown" color="#E9C349" size={12} />
          <Text style={[styles.premiumBadgeText, { color: theme.premiumBadgeText }]}>
            {' '}Premium
          </Text>
        </View>
      )}
    </View>
  );

  const renderItem = ({ item: row, section }: { item: IconItem[]; section: IconSection }) => {
    if (section.isEmpty) return null;
    return (
      <View style={styles.row} collapsable={false}>
        {row.map((item) => {
          const stable = stableKeyForCatalogIcon(item);
          const active = selectedIcon === stable || selectedIcon === item.id;
          const unlocked = isIconUnlockedForUser(item, ownedIconVaultKeys);
          const iconColor = active
            ? theme.selectedIcon
            : unlocked
              ? theme.textPrimary
              : theme.textSecondary;
          const labelColor = active ? theme.selectedText : theme.textSecondary;
          const cellInner = (
            <>
              {!unlocked && (
                <View style={styles.lockBadge}>
                  <MaterialCommunityIcons name="lock" size={11} color="#0A1A2F" />
                </View>
              )}
              {!unlocked && <Text style={styles.priceBadge}>{iconCreditPrice}</Text>}
              <MaterialCommunityIcons
                name={sanitizeMaterialIconName(item.icon) as any}
                color={iconColor}
                size={28}
                style={!unlocked ? { opacity: 0.55 } : undefined}
              />
              <Text style={[styles.iconLabel, { color: labelColor }]} numberOfLines={1}>
                {tr(item.label, item.labelEn)}
              </Text>
            </>
          );
          return (
            <View key={stable} style={styles.iconCellWrap}>
              {active ? (
                <LinearGradient
                  colors={theme.selectedFillGradient}
                  locations={[0, 0.2, 0.45, 0.55, 0.8, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.iconItemGradientOuter,
                    Platform.select({
                      ios: {
                        shadowColor: '#C9A227',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.45,
                        shadowRadius: 10,
                      },
                      /** Por debajo de cabeceras sticky (elevation ~24). */
                      android: { elevation: 3 },
                      default: {},
                    }),
                  ]}
                >
                  <TouchableOpacity
                    style={styles.iconItemInner}
                    onPress={() => onPressCatalogIcon(item)}
                    onLongPress={unlocked ? () => handleLongPress(item) : undefined}
                    delayLongPress={1200}
                    activeOpacity={0.75}
                  >
                    {cellInner}
                  </TouchableOpacity>
                </LinearGradient>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.iconItem,
                    {
                      borderColor: theme.tileInactiveBorder,
                      backgroundColor: theme.tileInactiveBg,
                    },
                  ]}
                  onPress={() => onPressCatalogIcon(item)}
                  onLongPress={unlocked ? () => handleLongPress(item) : undefined}
                  delayLongPress={1200}
                  activeOpacity={0.75}
                >
                  {cellInner}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderEmptySection = (section: IconSection) => {
    if (!section.isEmpty) return null;
    return (
      <View style={styles.emptySection}>
        <MaterialCommunityIcons
          name={section.isPremium ? 'lock' : 'image-plus'}
          color="#E9C349"
          size={28}
        />
        <Text style={[styles.emptyLabel, { color: theme.textSecondary }]}>
          {section.emptyLabel != null
            ? tr(section.emptyLabel, section.emptyLabelEn ?? section.emptyLabel)
            : ''}
        </Text>
      </View>
    );
  };

  const ListFooter = () => (
    <TouchableOpacity
      style={styles.storeButtonOuter}
      onPress={() => setStoreModalVisible(true)}
      activeOpacity={0.88}
    >
      <LinearGradient
        colors={theme.ctaGradient}
        locations={[0, 0.18, 0.45, 0.52, 0.75, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.storeButtonGradient}
      >
        <MaterialCommunityIcons name="store" color={theme.selectedText} size={22} />
        <Text style={[styles.storeButtonText, { color: theme.selectedText }]}>{tr('Card-Studio', 'Card-Studio')}</Text>
        <MaterialCommunityIcons name="chevron-right" color={theme.selectedText} size={20} />
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
        onShow={() => {
          // onShow dispara DESPUÉS de que la animación del Modal termina.
          // Solo un setTimeout de 50ms — sin InteractionManager para no bloquear scroll manual.
          setTimeout(() => doAutoScroll(), 50);
        }}
      >
        <View style={styles.overlay}>
              <View
                style={[
                  styles.sheet,
                  {
                    maxHeight: SCREEN_HEIGHT * 0.88,
                    backgroundColor: theme.sheetBg,
                    borderTopColor: theme.border,
                    paddingBottom: modalFooterBottomPad,
                  },
                ]}
              >
                {/* Drag handle + acento oro (misma línea visual que NewInfoForm) */}
                <View style={styles.dragHandleWrap}>
                  <View style={styles.dragHandle} />
                </View>
                <LinearGradient
                  colors={theme.headerAccentGradient}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.headerGoldLine}
                />

                {/* Header */}
                <View style={styles.header}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: theme.titleColor }]}>
                      {tr('Card-Studio', 'Card-Studio')} — {studioHeaderSuffix}
                    </Text>
                    {STUDIO_CATALOG_VECTOR_ICONS_PAID ? (
                      <Text style={[styles.creditsLine, { color: theme.textSecondary }]}>
                        {tr(`Créditos CS: ${creditsBalance}`, `CS credits: ${creditsBalance}`)}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={onClose}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <MaterialCommunityIcons name="close" color="#E9C349" size={24} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.hint, { color: theme.textSecondary }]}>
                  {STUDIO_CATALOG_VECTOR_ICONS_PAID
                    ? tr(
                        'Candado: compra con CS. Mantén presionado (icono desbloqueado) para quitar del Bóveda.',
                        'Lock: buy with CS. Long press (unlocked icon) to remove from Vault.',
                      )
                    : tr(
                        'Toca un icono para elegirlo. Mantén presionado para quitarlo de tu Bóveda (si aplica).',
                        'Tap an icon to choose it. Long press to remove from your Vault (if applicable).',
                      )}
                </Text>

                {/* SectionList categorizado */}
                <View style={[styles.listViewport, { backgroundColor: theme.sheetBg }]}>
                <SectionList
                  ref={sectionListRef}
                  style={[styles.sectionListFlex, { backgroundColor: theme.sheetBg }]}
                  sections={displaySections}
                  keyExtractor={(row, idx) =>
                    Array.isArray(row) && row.length > 0
                      ? stableKeyForCatalogIcon(row[0])
                      : `empty-${idx}`
                  }
                  renderSectionHeader={renderSectionHeader}
                  renderItem={({ item, section }) => {
                    if (section.isEmpty) return renderEmptySection(section);
                    return renderItem({ item, section });
                  }}
                  renderSectionFooter={({ section }) =>
                    section.isEmpty ? renderEmptySection(section) : null
                  }
                  ListFooterComponent={<ListFooter />}
                  stickySectionHeadersEnabled
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.listContent,
                    { flexGrow: 1, backgroundColor: theme.sheetBg },
                  ]}
                  keyboardShouldPersistTaps="handled"
                  scrollEventThrottle={16}
                  removeClippedSubviews={false}
                  windowSize={12}
                  maxToRenderPerBatch={20}
                  initialNumToRender={50}
                  bounces={false}
                  overScrollMode="never"
                  nestedScrollEnabled
                  getItemLayout={(_, flatIndex) => {
                    const item = sectionLayouts[flatIndex];
                    if (!item) return { length: 0, offset: 0, index: flatIndex };
                    return { length: item.length, offset: item.offset, index: flatIndex };
                  }}
                  onScrollToIndexFailed={() => {
                    const idx = pendingScrollSectionRef.current;
                    if (idx === null) return;
                    setTimeout(() => {
                      sectionListRef.current?.scrollToLocation({
                        sectionIndex: idx,
                        itemIndex: 0,
                        animated: false,
                        viewPosition: 0,
                      });
                    }, 300);
                  }}
                />
                </View>
              </View>
          </View>
      </Modal>

      <Modal
        visible={storeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStoreModalVisible(false)}
      >
        <View style={styles.storeOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('Cerrar fondo', 'Dismiss')}
            style={StyleSheet.absoluteFillObject}
            onPress={() => setStoreModalVisible(false)}
          />
          <View
            style={[
              styles.storeSheet,
              {
                backgroundColor: theme.storeSheetBg,
                borderColor: theme.border,
                paddingBottom: modalFooterBottomPad,
                zIndex: 1,
                elevation: 8,
              },
            ]}
          >
                <MaterialCommunityIcons name="store" color={theme.labelGold} size={48} />
                <Text style={[styles.storeTitle, { color: theme.labelGold }]}>{tr('Card-Studio', 'Card-Studio')}</Text>
                <Text style={[styles.storeSubtitle, { marginBottom: 8, color: theme.textPrimary }]}>
                  {tr(`Saldo: ${creditsBalance} CS`, `Balance: ${creditsBalance} CS`)}
                </Text>
                <Text style={[styles.storeSubtitle, { color: theme.storeSubtitle }]}>
                  {tr(
                    'Bundles temáticos: 3 estilos de tarjeta + pack de iconos vinculado.',
                    'Theme bundles: 3 card styles + linked icon pack.',
                  )}
                </Text>
                <ScrollView
                  style={{
                    maxHeight: SCREEN_HEIGHT * 0.42,
                    width: '100%',
                    marginTop: 16,
                    backgroundColor: theme.storeSheetBg,
                  }}
                  contentContainerStyle={{
                    flexGrow: 1,
                    backgroundColor: theme.storeSheetBg,
                    paddingBottom: 8,
                  }}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {THEME_BUNDLES.map((b) => {
                    const owned = bundleOwnedFlags[b.id];
                    const busy = bundlePurchasingId === b.id;
                    return (
                      <View
                        key={b.id}
                        style={[styles.bundleRow, { borderBottomColor: theme.sectionHeaderBorder }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.bundleName, { color: theme.textPrimary }]}>
                            {tr(b.nameEs, b.nameEn)}
                          </Text>
                          <Text style={[styles.bundleMeta, { color: theme.bundleMeta }]}>
                            {tr(
                              `3 temas + ${b.iconSeeds.length} iconos · ${b.creditsPrice} CS`,
                              `3 themes + ${b.iconSeeds.length} icons · ${b.creditsPrice} CS`,
                            )}
                          </Text>
                        </View>
                        {owned ? (
                          <Text style={styles.bundleOwned}>{tr('En tu cuenta', 'Owned')}</Text>
                        ) : (
                          <TouchableOpacity
                            style={styles.bundleBuyBtn}
                            disabled={busy}
                            onPress={() => onPurchaseThemeBundlePress(b.id)}
                          >
                            {busy ? (
                              <ActivityIndicator color="#0A1A2F" size="small" />
                            ) : (
                              <Text style={styles.bundleBuyText}>{tr('Comprar', 'Buy')}</Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity
                  style={styles.storeCloseBtn}
                  onPress={() => setStoreModalVisible(false)}
                >
                  <Text style={styles.storeCloseBtnText}>{tr('Cerrar', 'Close')}</Text>
                </TouchableOpacity>
              </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopWidth: 1.5,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderRadius: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    zIndex: 3000,
    elevation: 30,
    width: '100%',
    flex: 1,
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E9C349',
    opacity: 0.5,
  },
  headerGoldLine: {
    height: 3,
    width: '100%',
    opacity: 0.95,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  creditsLine: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  hint: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 8,
    opacity: 0.7,
  },
  listContent: {
    paddingBottom: 32,
  },
  listViewport: {
    flex: 1,
    zIndex: 0,
  },
  sectionListFlex: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  /** Por encima de celdas de iconos (badges zIndex 2, sombras). Sticky en Android usa elevation. */
  sectionHeaderSticky: {
    zIndex: 100,
    ...Platform.select({
      ios: {},
      android: {
        elevation: 24,
      },
      default: {},
    }),
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  premiumBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 0,
    elevation: 0,
  },
  iconCellWrap: {
    flex: 1,
    margin: 4,
    minWidth: 56,
    maxWidth: 70,
    zIndex: 0,
  },
  iconItemGradientOuter: {
    borderRadius: 14,
    padding: 2,
    overflow: 'hidden',
    flex: 1,
  },
  iconItemInner: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: 'transparent',
    minHeight: 72,
  },
  iconItem: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 72,
  },
  lockBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 1,
    backgroundColor: '#E9C349',
    borderRadius: 8,
    padding: 2,
  },
  priceBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    zIndex: 1,
    fontSize: 9,
    fontWeight: '800',
    color: '#0A1A2F',
    backgroundColor: 'rgba(233,195,73,0.35)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  iconLabel: {
    fontSize: 9,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '500',
  },
  emptySection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
  },
  emptyLabel: {
    fontSize: 13,
    fontStyle: 'italic',
    flex: 1,
  },
  // Botón Card-Studio (gradiente como NewInfoForm)
  storeButtonOuter: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#C9A227',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  storeButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  storeButtonText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  // Store modal
  storeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  storeSheet: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1.5,
    width: '100%',
  },
  storeTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 12,
    letterSpacing: 1,
  },
  storeSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  storeCloseBtn: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: '#E9C349',
    borderRadius: 12,
  },
  storeCloseBtnText: {
    fontWeight: '700',
    color: '#0A1A2F',
    fontSize: 15,
  },
  bundleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bundleName: {
    fontSize: 15,
    fontWeight: '700',
  },
  bundleMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  bundleOwned: {
    color: '#69F0AE',
    fontWeight: '700',
    fontSize: 12,
  },
  bundleBuyBtn: {
    backgroundColor: '#E9C349',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 88,
    alignItems: 'center',
  },
  bundleBuyText: {
    color: '#0A1A2F',
    fontWeight: '800',
    fontSize: 13,
  },
});
