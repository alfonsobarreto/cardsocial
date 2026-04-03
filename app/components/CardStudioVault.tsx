/**
 * CardStudioVault
 * ─────────────────────────────────────────────────────────────────────────────
 * Galería categorizada de íconos para el Vault y Card-Studio.
 * Todos los íconos activos son vectoriales (MaterialCommunityIcons) — cero PNGs.
 * Secciones premium vacías se muestran como colecciones futuras con badge 🔒.
 */

import { STUDIO_CATALOG_VECTOR_ICONS_PAID, STUDIO_ICON_CREDIT_PRICE } from '@/constants/studioEconomy';
import { TEXAS_LONGHORNS_ICON_SEEDS } from '@/constants/texasLonghornsPack';
import { getActiveUserId } from '@/services/authSession';
import { useLanguage } from '@/services/language';
import {
  isFreeStarterIconKey,
  purchaseStudioIconUnlock,
  stableKeyForCatalogIcon,
} from '@/services/iconVaultService';
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
import { useLookMode } from '@/services/lookMode';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeMaterialIconName } from './iconNameValidation';
import {
  Alert,
  ActivityIndicator,
  Dimensions,
  InteractionManager,
  Modal,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAX_RECENTS = 5;

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
  const isEN = language === 'en';
  const tr = (es: string, en: string) => isEN ? en : es;
  const [storeModalVisible, setStoreModalVisible] = useState(false);
  const [recentIconIds, setRecentIconIds] = useState<string[]>([]);
  const [bundleOwnedFlags, setBundleOwnedFlags] = useState<Record<string, boolean>>({});
  const [bundlePurchasingId, setBundlePurchasingId] = useState<string | null>(null);
  const sectionListRef = useRef<SectionList<IconItem[], IconSection>>(null);

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

  // Secciones dinámicas — antepone "Recientes" si existen
  const displaySections = useMemo((): IconSection[] => {
    if (recentItemsResolved.length === 0) return catalogSections;
    const recentItems = recentItemsResolved;
    const recentRows: IconItem[][] = [];
    for (let i = 0; i < recentItems.length; i += 5)
      recentRows.push(recentItems.slice(i, i + 5));
    const recentSection: IconSection = {
      title: isEN ? 'Recent' : 'Recientes',
      titleEn: 'Recent',
      data: recentRows,
    };
    return [recentSection, ...catalogSections];
  }, [recentItemsResolved, isEN, catalogSections]);

  // Auto-scroll a la sección del dataType cuando el modal se abre
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      const titleMap: Record<string, string> = {
        'Enlaces': 'Enlaces',
        'Teléfono': 'Teléfonos',
        'Ghost-Link': 'Teléfonos',
        'Email': 'Emails',
        'Documento': 'Documentos',
        'Texto Plain': 'Documentos',
      };
      const target = titleMap[dataType];
      if (!target) return;
      const sectionIndex = displaySections.findIndex(
        (s) => s.scrollAnchor === target || s.title.includes(`· ${target}`),
      );
      if (sectionIndex < 0) return;
      try {
        sectionListRef.current?.scrollToLocation({
          sectionIndex,
          itemIndex: 0,
          animated: true,
          viewPosition: 0,
        });
      } catch { /* ignora si la sección aún no está renderizada */ }
    }, 420);
    return () => clearTimeout(timer);
  }, [visible, dataType, displaySections]);

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

  const theme = {
    surfaceBg:        isNight ? '#0A2540' : '#E3F2FD',
    sheetBg:          isNight ? '#071828' : '#F5F9FF',
    border:           '#D4AF37',
    textPrimary:      isNight ? '#F0F4F8' : '#002D4B',
    textSecondary:    isNight ? '#87A9C2' : '#5A7A8A',
    selectedBg:       isNight ? '#1C5BB9' : '#54C1FB',
    selectedText:     '#F0F4F8',
    sectionHeaderBg:  isNight ? '#0D2035' : '#DCF0FC',
    premiumBadgeBg:   '#1A1A2E',
    premiumBadgeText: '#D4AF37',
    iconBorder:       isNight ? '#1A3A50' : '#C8E6F5',
  };

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
    <View style={[styles.sectionHeader, { backgroundColor: theme.sectionHeaderBg }]}>
      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
        {isEN ? section.titleEn : section.title}
      </Text>
      {section.isPremium && (
        <View style={[styles.premiumBadge, { backgroundColor: theme.premiumBadgeBg }]}>
          <MaterialCommunityIcons name="crown" color="#D4AF37" size={12} />
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
      <View style={styles.row}>
        {row.map((item) => {
          const stable = stableKeyForCatalogIcon(item);
          const active = selectedIcon === stable || selectedIcon === item.id;
          const unlocked = isIconUnlockedForUser(item, ownedIconVaultKeys);
          return (
            <TouchableOpacity
              key={stable}
              style={[
                styles.iconItem,
                { borderColor: theme.iconBorder },
                active && {
                  backgroundColor: theme.selectedBg,
                  borderColor: theme.selectedBg,
                  shadowColor: theme.selectedBg,
                  shadowOpacity: 0.3,
                  shadowRadius: 6,
                  elevation: 4,
                },
              ]}
              onPress={() => onPressCatalogIcon(item)}
              onLongPress={unlocked ? () => handleLongPress(item) : undefined}
              delayLongPress={1200}
              activeOpacity={0.75}
            >
              {!unlocked && (
                <View style={styles.lockBadge}>
                  <MaterialCommunityIcons name="lock" size={11} color="#0A1A2F" />
                </View>
              )}
              {!unlocked && (
                <Text style={styles.priceBadge}>{iconCreditPrice}</Text>
              )}
              <MaterialCommunityIcons
                name={sanitizeMaterialIconName(item.icon) as any}
                color={active ? theme.selectedText : unlocked ? theme.textPrimary : theme.textSecondary}
                size={28}
                style={!unlocked ? { opacity: 0.55 } : undefined}
              />
              <Text
                style={[styles.iconLabel, { color: active ? theme.selectedText : theme.textSecondary }]}
                numberOfLines={1}
              >
                {isEN ? item.labelEn : item.label}
              </Text>
            </TouchableOpacity>
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
          color="#D4AF37"
          size={28}
        />
        <Text style={[styles.emptyLabel, { color: theme.textSecondary }]}>
          {isEN ? (section.emptyLabelEn ?? section.emptyLabel) : section.emptyLabel}
        </Text>
      </View>
    );
  };

  const ListFooter = () => (
    <TouchableOpacity
      style={styles.storeButton}
      onPress={() => setStoreModalVisible(true)}
      activeOpacity={0.85}
    >
      <MaterialCommunityIcons name="store" color="#0A1A2F" size={22} />
      <Text style={styles.storeButtonText}>Card-Studio</Text>
      <MaterialCommunityIcons name="chevron-right" color="#0A1A2F" size={20} />
    </TouchableOpacity>
  );

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <TouchableWithoutFeedback onPress={() => {}}>
          <View style={styles.overlay}>
              <View
                style={[
                  styles.sheet,
                  {
                    maxHeight: SCREEN_HEIGHT * 0.88,
                    backgroundColor: theme.sheetBg,
                    borderTopColor: theme.border,
                  },
                ]}
                onStartShouldSetResponder={() => true}
              >
                {/* Drag handle */}
                <View style={styles.dragHandleWrap}>
                  <View style={styles.dragHandle} />
                </View>

                {/* Header */}
                <View style={styles.header}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: theme.textPrimary }]}>
                      Card-Studio — {dataType}
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
                    <MaterialCommunityIcons name="close" color="#D4AF37" size={24} />
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
                <View style={{ flex: 1 }}>
                <SectionList
                  ref={sectionListRef}
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
                  contentContainerStyle={styles.listContent}
                  scrollEventThrottle={16}
                  windowSize={2}
                  maxToRenderPerBatch={5}
                  initialNumToRender={3}
                  bounces={false}
                  overScrollMode="never"
                />
                </View>
              </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={storeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStoreModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setStoreModalVisible(false)}>
          <View style={styles.storeOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.storeSheet}>
                <MaterialCommunityIcons name="store" color="#D4AF37" size={48} />
                <Text style={styles.storeTitle}>Card-Studio</Text>
                <Text style={[styles.storeSubtitle, { marginBottom: 8 }]}>
                  {tr(`Saldo: ${creditsBalance} CS`, `Balance: ${creditsBalance} CS`)}
                </Text>
                <Text style={styles.storeSubtitle}>
                  {tr(
                    'Bundles temáticos: 3 estilos de tarjeta + pack de iconos vinculado.',
                    'Theme bundles: 3 card styles + linked icon pack.',
                  )}
                </Text>
                <ScrollView
                  style={{ maxHeight: SCREEN_HEIGHT * 0.42, width: '100%', marginTop: 16 }}
                  showsVerticalScrollIndicator={false}
                >
                  {THEME_BUNDLES.map((b) => {
                    const owned = bundleOwnedFlags[b.id];
                    const busy = bundlePurchasingId === b.id;
                    return (
                      <View key={b.id} style={styles.bundleRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.bundleName}>{isEN ? b.nameEn : b.nameEs}</Text>
                          <Text style={styles.bundleMeta}>
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
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
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
    backgroundColor: '#D4AF37',
    opacity: 0.5,
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
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
  },
  iconItem: {
    flex: 1,
    margin: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    maxWidth: 70,
    position: 'relative',
  },
  lockBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 2,
    backgroundColor: '#D4AF37',
    borderRadius: 8,
    padding: 2,
  },
  priceBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    zIndex: 2,
    fontSize: 9,
    fontWeight: '800',
    color: '#0A1A2F',
    backgroundColor: 'rgba(212,175,55,0.35)',
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
  // Botón Card-Studio
  storeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#D4AF37',
    gap: 8,
    shadowColor: '#D4AF37',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  storeButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0A1A2F',
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
    backgroundColor: '#0A2540',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    width: '100%',
  },
  storeTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#D4AF37',
    marginTop: 12,
    letterSpacing: 1,
  },
  storeSubtitle: {
    fontSize: 14,
    color: '#B8D9F0',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  storeCloseBtn: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: '#D4AF37',
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
    borderBottomColor: 'rgba(212,175,55,0.35)',
  },
  bundleName: {
    color: '#F0F4F8',
    fontSize: 15,
    fontWeight: '700',
  },
  bundleMeta: {
    color: '#9ECAE8',
    fontSize: 12,
    marginTop: 4,
  },
  bundleOwned: {
    color: '#69F0AE',
    fontWeight: '700',
    fontSize: 12,
  },
  bundleBuyBtn: {
    backgroundColor: '#D4AF37',
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
