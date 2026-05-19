import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActionSheetIOS,
    Alert,
    Dimensions,
    FlatList,
    Image,
    InteractionManager,
    Keyboard,
    LayoutAnimation,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    UIManager,
    View
} from 'react-native';
// import { PDFDocument } from 'pdf-lib'; // [SILENCIADO POR ERROR DE DEPENDENCIA]
import BrandedSpinner from '@/components/BrandedSpinner';
import CountryDialPickerModal from '@/components/CountryDialPickerModal';
import {
  buildE164,
  getNationalDigitBounds,
  parsePhoneIntoDialAndNational,
  sanitizeNationalDigits,
} from '@/constants/countryDialCodes';
import { GHOST_LINK_VAULT_TYPE, GHOST_LINK_VAULT_VALUE } from '@/constants/ghostLinkVault';
import { getActiveUserId } from '@/services/authSession';
import { getUserCreditsBalance } from '@/services/creditsService';
import { userFacingAlertMessage } from '@/services/apiUserFacingError';
import { fetchFaviconFromAzure } from '@/services/faviconApi';
import { db } from '@/services/firebaseConfig';
import {
    ensureFreeStarterIconVault,
    getOwnedIconVaultKeySet,
    stableKeyForCatalogIcon,
} from '@/services/iconVaultService';
import { useCreationT } from '@/services/creationI18n';
import { useCoreT } from '@/services/coreI18n';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { ModerationRejectedError, uploadFileWithModeration } from '@/services/moderationApi';
import { newEntityId } from '@/services/newEntityId';
import { syncVaultLinkToMongoCardsAfterSave } from '@/services/syncVaultLinkToMongoCards';
import { emitVaultLinkSaved } from '@/services/vaultLinkSavedBus';
import { runVaultMagneticSaveFeedback } from '@/services/magneticVaultSaveFeedback';
import { viewerQualifiesVaultFerrariSensory } from '@/services/vaultSensoryTierGate';
import {
  appendVaultCategoryIfNew,
  mergeVaultCategoriesFromFirestore,
  vaultCategorySectionTitle,
} from '@/services/vaultCategoriesService';
import {
  encodeVaultLink,
  type VaultLinkLogical,
} from '@/services/vaultFirestoreCodec';
import { readVaultJsonWithLegacyMigration, vaultStorageKey } from '@/services/userScopedStorage';
import { premiumTheme } from '@/styles/_premiumTheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import Toast from 'react-native-toast-message';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import CardStudioVault, { ICON_GALLERY } from './CardStudioVault';
import FilePreviewModal from './FilePreviewModal';
import { sanitizeMaterialIconName } from './iconNameValidation';
import LuxuryModerationModal from './LuxuryModerationModal';

const SCREEN_HEIGHT = Dimensions.get('window').height;

/** Opción sentinel en la lista modal de carpetas (+ crear nueva categoría). */
const VAULT_CATEGORY_CREATE_NEW = '__vault_create_new__';

const LINK_FALLBACK_GALLERY_ITEM =
  ICON_GALLERY.find((icon) => icon.icon === 'link-variant') ?? ICON_GALLERY[0];
/** Clave estable en users/{uid}/icon_vault — canónica para selección y persistencia */
const DEFAULT_ICON_STABLE = LINK_FALLBACK_GALLERY_ITEM
  ? stableKeyForCatalogIcon(LINK_FALLBACK_GALLERY_ITEM)
  : 'link-variant__Link';

function legacyIdToStableKey(legacyId: string): string {
  const it = ICON_GALLERY.find((i) => i.id === legacyId);
  return it ? stableKeyForCatalogIcon(it) : legacyId;
}

/** Detecta http(s) y www. en Texto Plain para espejo y apertura con el sistema. */
const PLAIN_TEXT_URL_RE = /\b(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;

function splitPlainTextByUrls(text: string): Array<{ kind: 'text' | 'url'; s: string }> {
  if (!text) return [];
  const parts: Array<{ kind: 'text' | 'url'; s: string }> = [];
  let last = 0;
  PLAIN_TEXT_URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PLAIN_TEXT_URL_RE.exec(text)) !== null) {
    const full = m[0];
    if (!full) continue;
    if (m.index > last) {
      parts.push({ kind: 'text', s: text.slice(last, m.index) });
    }
    parts.push({ kind: 'url', s: full });
    last = m.index + full.length;
  }
  if (last < text.length) {
    parts.push({ kind: 'text', s: text.slice(last) });
  }
  PLAIN_TEXT_URL_RE.lastIndex = 0;
  return parts;
}

function openDetectedPlainTextUrl(raw: string) {
  const trimmed = raw.replace(/[),.;:!?]+$/g, '').trim();
  if (!trimmed) return;
  let href = trimmed;
  if (!/^https?:\/\//i.test(href)) {
    href = 'https://' + href;
  }
  void Linking.openURL(href);
}

function galleryItemByStableOrLegacy(sel: string) {
  if (!sel || sel === 'favicon') return undefined;
  return (
    ICON_GALLERY.find((i) => stableKeyForCatalogIcon(i) === sel) || ICON_GALLERY.find((i) => i.id === sel)
  );
}

/** Sync Firestore tras guardar en Búnker: sin límite agresivo (antes 8s). */
const CLOUD_SYNC_TIMEOUT_MS = 120000;

type DataType = 'Enlaces' | 'Teléfono' | 'Ghost-Link' | 'Email' | 'Texto Plain' | 'Documento';

/** Solo key + icono; etiquetas vía `creationLocales` (6 idiomas). */
const DATA_TYPE_OPTION_DEFS: Array<{
  key: DataType;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}> = [
  { key: 'Enlaces', icon: 'link-variant' },
  { key: 'Email', icon: 'email-outline' },
  { key: 'Teléfono', icon: 'phone-outline' },
  { key: 'Texto Plain', icon: 'text-box-outline' },
  { key: 'Documento', icon: 'file-document-outline' },
  { key: 'Ghost-Link', icon: 'phone-in-talk' },
];

const defaultGhostLinkIconStable = (() => {
  const it =
    ICON_GALLERY.find((i) => i.icon === 'phone-in-talk') || ICON_GALLERY.find((i) => i.icon === 'phone-voip');
  return it ? stableKeyForCatalogIcon(it) : DEFAULT_ICON_STABLE;
})();

interface Link {
  id: string;
  uid?: string;
  title: string;
  type: string;
  value: string;
  iconName: string;
  icon?: string;
  /** Clave documento en users/{uid}/icon_vault (estable); opcional en datos legacy */
  iconVaultId?: string;
  vaultProtected?: boolean;
  isFavorite: boolean;
  createdAt?: string;
  updatedAt?: string;
  /** MIME del archivo (visor con URL proxy sin extensión). */
  vaultMimeType?: string;
  /** Carpeta visible en la Bóveda (Fase 7). */
  category?: string;
}

let PdfComponent: any = null;
try {
  PdfComponent = require('react-native-pdf').default;
} catch {
  PdfComponent = null;
}

// ICON_GALLERY viene de CardStudioVault — única fuente de verdad
// Países / prefijos: `constants/countryDialCodes.ts` + `CountryDialPickerModal`

// Tamaño máximo de imágenes en Búnker (alineado con backend moderation `imageMaxBytes`)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
/** Borde largo tras compresión (tarjeta nítida sin peso excesivo). */
const VAULT_IMAGE_MAX_LONG_EDGE = 2000;
const VAULT_JPEG_QUALITY_INITIAL = 0.8;
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024; // 20 MB
/** Galería/cámara pueden tardar en dispositivos lentos; tope de seguridad 2 min. */
const PICKER_LAUNCH_TIMEOUT_MS = 120000;
/** Watchdog del mutex del picker: mismo tope (antes 20s forzaba desbloqueo). */
const PICKER_STALE_LOCK_MS = 120000;

const NewInfoForm = ({ onClose, editingData }: { onClose?: () => void; editingData?: Link }) => {
  const { resolvedMode } = useLookMode();
  const { language } = useLanguage();
  const tcx = useCreationT();
  const corex = useCoreT();
  const dataTypeOptions = useMemo(
    () =>
      DATA_TYPE_OPTION_DEFS.map((o) => {
        let label: string;
        switch (o.key) {
          case 'Enlaces':
            label = tcx('form_type_link');
            break;
          case 'Email':
            label = tcx('form_type_email');
            break;
          case 'Teléfono':
            label = tcx('form_type_phone');
            break;
          case 'Texto Plain':
            label = tcx('form_type_text');
            break;
          case 'Documento':
            label = tcx('form_type_document');
            break;
          case 'Ghost-Link':
            label = tcx('form_type_ghost');
            break;
          default: {
            const _exhaustive: never = o.key;
            label = String(_exhaustive);
            break;
          }
        }
        return { ...o, label };
      }),
    [tcx],
  );
  /** Ejemplos de URL en inputs: no usan fragmentos i18n (evita ~6 claves ui.* por idioma). ES vs resto en inglés. */
  const socialUrlPlaceholder = (esExample: string, enExample: string) =>
    language === 'es' ? esExample : enExample;
  const isNight = resolvedMode === 'noche';
  const formTheme = useMemo(
    () => ({
      motherBg: isNight ? '#0E0E0E' : '#FAF8F4',
      surfaceBg: isNight ? '#141414' : '#FFFFFF',
      /** Alineado con `premiumTheme.surfaceElevated` (tarjetas / paneles). */
      premiumElevated: isNight ? premiumTheme.dark.surfaceElevated : premiumTheme.light.surfaceElevated,
      chipInactiveBg: isNight ? '#161616' : '#F3EFE8',
      chipInactiveBorder: isNight ? 'rgba(153,144,124,0.4)' : 'rgba(92,77,50,0.22)',
      border: '#E9C349',
      labelGold: '#E9C349',
      titleColor: isNight ? '#FFFFFF' : '#1A1510',
      textPrimary: isNight ? '#F2F0EB' : '#1C180F',
      textSecondary: isNight ? '#9A9388' : '#5C5346',
      inputBg: isNight ? '#101010' : '#FFFCF7',
      inputText: isNight ? '#F0EDE8' : '#1C180F',
      inputPlaceholder: isNight ? 'rgba(233,195,73,0.42)' : 'rgba(92,77,50,0.45)',
      onLuxuryCta: '#0C0C0C',
      /** Icono fallback dentro del aro (fondo oscuro → trazo claro). */
      previewIconInCircle: isNight ? premiumTheme.dark.onVipBanner : premiumTheme.light.onAccent,
      accentMuted: isNight ? 'rgba(242,202,80,0.55)' : 'rgba(180,140,50,0.55)',
      selectedPillBg: isNight ? '#2A2418' : '#FFF6E0',
      selectedPillText: isNight ? '#0C0C0C' : '#0C0C0C',
      selectedPillGlow: '#C9A227',
      selectedBgInput: isNight ? '#1C1810' : '#FFF3DC',
      iconPreviewCircleBg: isNight ? premiumTheme.dark.surfaceElevated : premiumTheme.light.surfaceElevated,
      iconPreviewCircleBorder: isNight ? '#C5A065' : '#E9C349',
      /** Marco de inputs (oro). */
      gradientColors: (isNight
        ? (['#5C4D32', '#B8942E', '#E8D4A3', '#C9A227', '#5C4D32'] as const)
        : (['#A68B5B', '#E9C349', '#F8EED0', '#E9C349', '#8B7349'] as const)) as readonly [string, string, ...string[]],
      /** Chips activos (relleno metálico). */
      chipActiveFillGradient: (isNight
        ? (['#5A4820', '#C9A227', '#FFF2C4', '#E8D4A3', '#B8942E', '#5A4820'] as const)
        : (['#7A6528', '#E0C068', '#FFF8E8', '#F0D878', '#C9A227', '#7A6528'] as const)) as readonly [string, string, ...string[]],
      /** Botón CREAR. */
      ctaGradient: (isNight
        ? (['#6B5420', '#B8942E', '#FFEFD0', '#F2CA50', '#E9C349', '#6B5420'] as const)
        : (['#8B7340', '#E9C349', '#FFF4D8', '#F2CA50', '#C9A227', '#7A6228'] as const)) as readonly [string, string, ...string[]],
      previewCardBg: isNight ? 'rgba(18,16,12,0.96)' : 'rgba(255,252,247,0.98)',
      previewCardBorder: (isNight
        ? (['#5C4D32', '#E8C76F', '#F2CA50', '#C9A227', '#5C4D32'] as const)
        : (['#A68B5B', '#E8D0A0', '#F5E6C8', '#E9C349', '#9A8358'] as const)) as readonly [string, string, ...string[]],
    }),
    [isNight],
  );
  /** 3 columnas × 2 filas; padding horizontal del scroll 20+20, dos huecos entre columnas. */
  const typeChipGap = 8;
  const typeChipWidth = (Dimensions.get('window').width - 40 - typeChipGap * 2) / 3;
  const [dataType, setDataType] = useState<DataType>('Enlaces');
  const [dataName, setDataName] = useState('');
  const [dataValue, setDataValue] = useState('');
  const [selectedIcon, setSelectedIcon] = useState(DEFAULT_ICON_STABLE);
  const [ownedIconVaultKeys, setOwnedIconVaultKeys] = useState<Set<string>>(new Set());
  const [creditsBalance, setCreditsBalance] = useState(0);

  const refreshStudioEconomy = useCallback(async () => {
    const uid = await getActiveUserId();
    if (!uid) return;
    await ensureFreeStarterIconVault(uid);
    const [keys, bal] = await Promise.all([
      getOwnedIconVaultKeySet(uid),
      getUserCreditsBalance(uid),
    ]);
    setOwnedIconVaultKeys(keys);
    setCreditsBalance(bal);
  }, []);
  const [countryCode, setCountryCode] = useState('+1');
  const [autoTypeSuggestion, setAutoTypeSuggestion] = useState<DataType | null>(null);
  
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [iconModalVisible, setIconModalVisible] = useState(false);
  const [vaultCategoriesResolved, setVaultCategoriesResolved] = useState<string[]>(() => [
    ...mergeVaultCategoriesFromFirestore(undefined),
  ]);
  const [vaultCategoryModalVisible, setVaultCategoryModalVisible] = useState(false);
  /** Escritura canónica igual que Firestore (`Negocios`, … o texto personalizado). */
  const [selectedVaultCategoryCanon, setSelectedVaultCategoryCanon] = useState('');
  const [creatingNewVaultCategory, setCreatingNewVaultCategory] = useState(false);
  const [newVaultCategoryDraft, setNewVaultCategoryDraft] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [faviconSuggestionVisible, setFaviconSuggestionVisible] = useState(false);
  const [faviconLoading, setFaviconLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [fileTypeModalVisible, setFileTypeModalVisible] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [assetPreviewVisible, setAssetPreviewVisible] = useState(false);
  const [pendingAsset, setPendingAsset] = useState<{
    uri: string;
    name: string;
    mimeType: string;
    source: 'camera' | 'gallery' | 'document';
  } | null>(null);
  /** Tras confirmar el preview se pierde `pendingAsset`; guardamos nombre/MIME reales para el POST multipart. */
  const documentUploadMetaRef = useRef<{ fileName: string; mimeType: string } | null>(null);

  // Estados para progreso de upload
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadStageLabel, setUploadStageLabel] = useState('');
  const [moderationAlertVisible, setModerationAlertVisible] = useState(false);
  const [moderationAlertMessage, setModerationAlertMessage] = useState('');
  const [rejectionAttempts, setRejectionAttempts] = useState(0);
  const [retryLockedUntil, setRetryLockedUntil] = useState<number | null>(null);
  const [retryCountdownSec, setRetryCountdownSec] = useState(0);
  const faviconLookupTokenRef = useRef(0);
  const faviconLifecycleClosedRef = useRef(false);
  const closeGenerationRef = useRef(0);
  const isPickingRef = useRef(false);
  const pickerLockTimestampRef = useRef<number | null>(null);
  const pickerWatchdogTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileTypeModalDismissResolverRef = useRef<((reason: string) => void) | null>(null);
  const pendingTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const pendingInteractionTasksRef = useRef<Array<{ cancel?: () => void }>>([]);
  const isMountedRef = useRef(true);
  // Tracks the last saved link id so background favicon updates can patch it silently
  const savedLinkIdRef = useRef<string | null>(null);
  const savedUserIdRef = useRef<string | null>(null);
  const retryLockMessage = tcx('form_retry_lock_message');
  const isRetryLocked = retryLockedUntil !== null && retryLockedUntil > Date.now();

  const logAssetAudit = (stage: string, payload: Record<string, any>) => {
    console.log('[ELITE_UPLOAD_AUDIT]', stage, JSON.stringify(payload));
  };

  const logPickerTrace = (stage: string, payload: Record<string, any> = {}) => {
    console.log('[NEWINFO_PICKER_TRACE]', stage, JSON.stringify(payload));
  };

  const trackTimeout = (callback: () => void, delayMs: number) => {
    const timeoutId = setTimeout(() => {
      pendingTimeoutsRef.current = pendingTimeoutsRef.current.filter((id) => id !== timeoutId);
      callback();
    }, delayMs);
    pendingTimeoutsRef.current.push(timeoutId);
    return timeoutId;
  };

  const trackInteractionTask = (task: { cancel?: () => void } | null | undefined) => {
    if (task && typeof task.cancel === 'function') {
      pendingInteractionTasksRef.current.push(task);
    }
  };

  const untrackInteractionTask = (task: { cancel?: () => void } | null | undefined) => {
    if (!task) return;
    pendingInteractionTasksRef.current = pendingInteractionTasksRef.current.filter((entry) => entry !== task);
  };

  const clearPendingAsyncWork = () => {
    closeGenerationRef.current += 1;
    faviconLookupTokenRef.current += 1;
    if (pickerWatchdogTimeoutRef.current) {
      clearTimeout(pickerWatchdogTimeoutRef.current);
      pickerWatchdogTimeoutRef.current = null;
    }
    pickerLockTimestampRef.current = null;
    fileTypeModalDismissResolverRef.current = null;
    isPickingRef.current = false;
    pendingTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    pendingTimeoutsRef.current = [];
    pendingInteractionTasksRef.current.forEach((task) => {
      try {
        task?.cancel?.();
      } catch {
        // Ignore cancellation errors from stale interaction tasks.
      }
    });
    pendingInteractionTasksRef.current = [];
  };

  const isSessionClosed = (sessionToken: number) =>
    !isMountedRef.current ||
    faviconLifecycleClosedRef.current ||
    sessionToken !== closeGenerationRef.current;

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  useEffect(() => {
    if (!retryLockedUntil) {
      setRetryCountdownSec(0);
      return;
    }

    const tick = () => {
      const remaining = Math.ceil((retryLockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setRetryLockedUntil(null);
        setRetryCountdownSec(0);
        return;
      }
      setRetryCountdownSec(remaining);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [retryLockedUntil]);

  const registerModerationReject = () => {
    const attempts = rejectionAttempts + 1;
    if (attempts >= 3) {
      setRetryLockedUntil(Date.now() + 2 * 60 * 1000);
      setRejectionAttempts(0);
      setModerationAlertMessage(retryLockMessage);
      setModerationAlertVisible(true);
      return;
    }

    setRejectionAttempts(attempts);
    setModerationAlertMessage(tcx('form_moderation_smile'));
    setModerationAlertVisible(true);
  };

  useEffect(() => {
    if (
      Platform.OS === 'android' &&
      typeof UIManager.setLayoutAnimationEnabledExperimental === 'function'
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    void refreshStudioEconomy();
  }, [refreshStudioEconomy]);

  // Pre-populate form if editing
  useEffect(() => {
    if (editingData?.id) {
      const type = editingData.type as DataType;
      setDataType(type);
      setDataName(editingData.title);
      if (type === GHOST_LINK_VAULT_TYPE) {
        setDataValue(GHOST_LINK_VAULT_VALUE);
      } else if (type === 'Teléfono') {
        const parsed = parsePhoneIntoDialAndNational(String(editingData.value || ''));
        setCountryCode(parsed.dial);
        setDataValue(parsed.national);
      } else {
        setDataValue(editingData.value);
      }
      
      if (editingData.icon?.startsWith('http')) {
        setSelectedIcon('favicon');
        setFaviconUrl(editingData.icon);
      } else if (editingData.iconVaultId) {
        setSelectedIcon(editingData.iconVaultId);
      } else {
        const match = ICON_GALLERY.find((i) => i.label === editingData.iconName);
        if (match) {
          setSelectedIcon(stableKeyForCatalogIcon(match));
        } else {
          setSelectedIcon(DEFAULT_ICON_STABLE);
        }
      }
    }
  }, [editingData]);

  /** Carpetas Bóveda — `users.{vaultCategories}` + categoría del ítem al editar. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const uid = await getActiveUserId();
      if (!uid || cancelled) return;
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (cancelled) return;
        const merged = mergeVaultCategoriesFromFirestore(snap.data()?.vaultCategories);
        setVaultCategoriesResolved(merged);
        const pickDefault = merged[0] || '';
        if (editingData?.id && editingData.category?.trim()) {
          const want = editingData.category.trim();
          const matchCanon =
            merged.find((c) => c.toLowerCase() === want.toLowerCase()) ?? want;
          setSelectedVaultCategoryCanon(matchCanon);
          setCreatingNewVaultCategory(false);
          setNewVaultCategoryDraft('');
        } else if (editingData?.id) {
          setSelectedVaultCategoryCanon(pickDefault);
          setCreatingNewVaultCategory(false);
          setNewVaultCategoryDraft('');
        } else {
          setCreatingNewVaultCategory(false);
          setNewVaultCategoryDraft('');
          setSelectedVaultCategoryCanon((prev) =>
            prev && merged.some((c) => c.toLowerCase() === prev.toLowerCase())
              ? prev
              : pickDefault,
          );
        }
      } catch {
        if (!cancelled) {
          const merged = mergeVaultCategoriesFromFirestore(undefined);
          setVaultCategoriesResolved(merged);
          const pickDefault = merged[0] || '';
          setSelectedVaultCategoryCanon((prev) =>
            prev && merged.some((c) => c.toLowerCase() === prev.toLowerCase())
              ? prev
              : pickDefault,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingData?.id, editingData?.category]);

  const vaultCategoryPrimaryLabel = useMemo(() => {
    if (creatingNewVaultCategory) {
      const d = newVaultCategoryDraft.trim();
      return d ? d : tcx('form_vault_new_folder');
    }
    const sel = selectedVaultCategoryCanon.trim();
    if (!sel) {
      return tcx('form_vault_pick_folder');
    }
    return vaultCategorySectionTitle(sel, language);
  }, [creatingNewVaultCategory, newVaultCategoryDraft, selectedVaultCategoryCanon, language, tcx]);

  const vaultCategorySecondaryLabel = useMemo(() => {
    if (creatingNewVaultCategory) {
      return newVaultCategoryDraft.trim()
        ? tcx('form_vault_confirm_create')
        : tcx('form_vault_pick_other');
    }
    return tcx('form_vault_organize');
  }, [creatingNewVaultCategory, newVaultCategoryDraft, tcx]);

  const vaultCategoryLayoutAnimateSkipRef = useRef(true);
  useEffect(() => {
    if (vaultCategoryLayoutAnimateSkipRef.current) {
      vaultCategoryLayoutAnimateSkipRef.current = false;
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [creatingNewVaultCategory]);

  const closeFaviconSuggestion = ({ clearSuggestion = false }: { clearSuggestion?: boolean } = {}) => {
    faviconLookupTokenRef.current += 1;
    setFaviconLoading(false);
    setFaviconSuggestionVisible(false);
    if (clearSuggestion) {
      setFaviconUrl('');
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      faviconLifecycleClosedRef.current = true;
      clearPendingAsyncWork();
    };
  }, []);

  // Favicon fetching with local cache and UI cleanup
  const faviconCache = useRef<Record<string, string>>({});

  // ─── KNOWN DOMAINS → ICON_GALLERY id (no Azure call needed) ─────────────────
  // IDs basados en orden actual de RAW_SECTIONS: LinkedIn=1,Instagram=2,Facebook=3,
  // WhatsApp=4,Twitter=5,TikTok=6,YouTube=7,Snapchat=8,Web=9,Link=10
  const KNOWN_DOMAIN_ICONS: Record<string, string> = {
    'facebook.com':    legacyIdToStableKey('3'),
    'fb.com':          legacyIdToStableKey('3'),
    'm.facebook.com':  legacyIdToStableKey('3'),
    'instagram.com':   legacyIdToStableKey('2'),
    'linkedin.com':    legacyIdToStableKey('1'),
    'whatsapp.com':    legacyIdToStableKey('4'),
    'wa.me':           legacyIdToStableKey('4'),
    'youtube.com':     legacyIdToStableKey('7'),
    'youtu.be':        legacyIdToStableKey('7'),
    'twitter.com':     legacyIdToStableKey('5'),
    'x.com':           legacyIdToStableKey('5'),
    'tiktok.com':      legacyIdToStableKey('6'),
    'snapchat.com':    legacyIdToStableKey('8'),
    'maps.google.com': legacyIdToStableKey('9'),
    'goo.gl':          legacyIdToStableKey('9'),
    'maps.apple.com':  legacyIdToStableKey('9'),
  };

  const KNOWN_NAME_ICONS: Array<{ keywords: string[]; iconId: string }> = [
    { keywords: ['linkedin'],               iconId: legacyIdToStableKey('1') },
    { keywords: ['instagram'],              iconId: legacyIdToStableKey('2') },
    { keywords: ['facebook', 'fb'],         iconId: legacyIdToStableKey('3') },
    { keywords: ['whatsapp'],               iconId: legacyIdToStableKey('4') },
    { keywords: ['twitter', 'tweet', ' x '], iconId: legacyIdToStableKey('5') },
    { keywords: ['tiktok', 'tik tok'],      iconId: legacyIdToStableKey('6') },
    { keywords: ['youtube', ' yt '],        iconId: legacyIdToStableKey('7') },
    { keywords: ['snapchat', 'snap'],       iconId: legacyIdToStableKey('8') },
    { keywords: ['gmail'],                  iconId: legacyIdToStableKey('21') },
    { keywords: ['outlook'],                iconId: legacyIdToStableKey('24') },
    { keywords: ['yahoo'],                  iconId: legacyIdToStableKey('25') },
  ];

  const extractDomainFromLink = (rawValue: string): string => {
    const trimmed = String(rawValue || '').trim();
    if (!trimmed) return '';
    try {
      const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      return urlObj.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  const linkFaviconDomain = useMemo(() => extractDomainFromLink(dataValue.trim()), [dataValue]);

  const runFaviconLookup = async () => {
    const sessionToken = closeGenerationRef.current;
    const sourceValue = dataValue.trim();
    const domain = extractDomainFromLink(sourceValue).trim();
    if (!domain || isSessionClosed(sessionToken)) return;

    const lookupToken = ++faviconLookupTokenRef.current;
    setFaviconLoading(true);

    try {
      if (faviconCache.current[domain]) {
        if (isSessionClosed(sessionToken) || lookupToken !== faviconLookupTokenRef.current) return;
        setFaviconUrl(faviconCache.current[domain]);
        setFaviconSuggestionVisible(true);
        setFaviconLoading(false);
        return;
      }

      const faviconTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
      let fetchedIcon: string | null = null;
      try {
        fetchedIcon = await Promise.race([fetchFaviconFromAzure(sourceValue), faviconTimeout]);
      } catch {
        fetchedIcon = null;
      }

      if (isSessionClosed(sessionToken) || lookupToken !== faviconLookupTokenRef.current) {
        return;
      }

      if (!fetchedIcon) {
        setFaviconLoading(false);
        setFaviconUrl('');
        Alert.alert(tcx('form_favicon_none_title'), tcx('form_favicon_none_body'), [
          { text: tcx('create_ok'), style: 'cancel' },
          {
            text: tcx('form_open_icon_vault'),
            onPress: () => setIconModalVisible(true),
          },
        ]);
        return;
      }

      await Image.prefetch(fetchedIcon).catch(() => null);
      if (isSessionClosed(sessionToken) || lookupToken !== faviconLookupTokenRef.current) {
        return;
      }

      faviconCache.current[domain] = fetchedIcon;
      setFaviconUrl(fetchedIcon);
      setFaviconSuggestionVisible(true);
      setFaviconLoading(false);
    } catch {
      if (isSessionClosed(sessionToken)) return;
      setFaviconLoading(false);
      setFaviconSuggestionVisible(false);
      setFaviconUrl('');
    }
  };

  const getLinkPlaceholder = () => {
    const n = dataName.trim().toLowerCase();
    if (n.includes('instagram'))
      return socialUrlPlaceholder('https://instagram.com/tu_usuario', 'https://instagram.com/your_user');
    if (n.includes('linkedin'))
      return socialUrlPlaceholder('https://linkedin.com/in/tu-perfil', 'https://linkedin.com/in/your-profile');
    if (n.includes('facebook') || n.includes('fb'))
      return socialUrlPlaceholder('https://facebook.com/tu_pagina', 'https://facebook.com/your_page');
    if (n.includes('twitter') || n.includes(' x '))
      return socialUrlPlaceholder('https://x.com/tu_usuario', 'https://x.com/your_user');
    if (n.includes('tiktok'))
      return socialUrlPlaceholder('https://tiktok.com/@tu_usuario', 'https://tiktok.com/@your_user');
    if (n.includes('youtube') || n.includes('yt'))
      return socialUrlPlaceholder('https://youtube.com/@tu_canal', 'https://youtube.com/@your_channel');
    return 'https://example.com';
  };

  const renderLinkField = () => (
    <View>
      <LinearGradient
        colors={formTheme.gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 10, padding: 4 }}
      >
        <TextInput
          style={[styles.input, { backgroundColor: formTheme.inputBg, color: formTheme.inputText, borderWidth: 0 }]}
          placeholder={getLinkPlaceholder()}
          placeholderTextColor={formTheme.inputPlaceholder}
          value={dataValue}
          onChangeText={(text) => {
            const prevDomain = extractDomainFromLink(dataValue.trim());
            const nextDomain = extractDomainFromLink(text.trim());
            setDataValue(text);
            if (prevDomain !== nextDomain) {
              closeFaviconSuggestion({ clearSuggestion: true });
              if (selectedIcon === 'favicon') {
                setSelectedIcon(DEFAULT_ICON_STABLE);
              }
            }
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </LinearGradient>
      {(dataName.trim() || dataValue.trim()) && (
        <LinearGradient
          colors={formTheme.previewCardBorder}
          locations={[0, 0.22, 0.48, 0.55, 0.78, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.linkPreviewLuxOuter}
        >
          <View
            style={[
              styles.linkPreviewInner,
              { backgroundColor: formTheme.previewCardBg },
              Platform.select({
                ios: {
                  shadowColor: '#F2CA50',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: isNight ? 0.42 : 0.28,
                  shadowRadius: 16,
                },
                android: { elevation: isNight ? 10 : 6 },
                default: {},
              }),
            ]}
          >
            <Text style={[styles.linkPreviewSectionLabel, { color: formTheme.labelGold }]}>
              {tcx('form_preview')}
            </Text>
            <View style={styles.linkPreviewRow}>
              <LinearGradient
                colors={formTheme.chipActiveFillGradient as readonly [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.linkPreviewIconFrame}
              >
                <View style={[styles.linkPreviewIconInner, { backgroundColor: formTheme.iconPreviewCircleBg }]}>
                  {selectedIcon === 'favicon' && faviconUrl ? (
                    <Image source={{ uri: faviconUrl }} style={styles.linkPreviewFavicon} />
                  ) : (
                    <MaterialCommunityIcons
                      name={
                        sanitizeMaterialIconName(
                          (selectedIcon === 'favicon' ? undefined : galleryItemByStableOrLegacy(selectedIcon))?.icon ||
                            'link',
                        ) as any
                      }
                      color={formTheme.previewIconInCircle}
                      size={26}
                    />
                  )}
                </View>
              </LinearGradient>
              <View style={styles.linkPreviewTextCol}>
                <Text style={[styles.linkPreviewTitle, { color: formTheme.textPrimary }]} numberOfLines={1}>
                  {dataName.trim() || tcx('form_no_name')}
                </Text>
                <Text style={[styles.linkPreviewUrl, { color: formTheme.textSecondary }]} numberOfLines={1}>
                  {dataValue.trim() || getLinkPlaceholder()}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={formTheme.labelGold} />
            </View>
          </View>
        </LinearGradient>
      )}
      {dataType === 'Enlaces' && !!linkFaviconDomain && (
        <View style={styles.faviconPromptCard}>
          <Text style={styles.faviconPromptTitle}>
            {tcx('form_favicon_find_web')}
          </Text>
          <Text style={styles.faviconPromptSubtitle}>
            {linkFaviconDomain}
          </Text>
          {faviconLoading ? (
            <View style={styles.faviconPromptLoading}>
              <BrandedSpinner size={36} color="#E9C349" />
              <Text style={[styles.faviconPromptLoadingText, { color: formTheme.textSecondary }]}>
                {tcx('form_favicon_searching')}
              </Text>
            </View>
          ) : (
            <View style={styles.faviconPromptActions}>
              <TouchableOpacity
                style={[styles.faviconPromptBtn, styles.faviconPromptGhostBtn]}
                onPress={() => {
                  closeFaviconSuggestion({ clearSuggestion: true });
                  setFaviconUrl('');
                  if (selectedIcon === 'favicon') {
                    setSelectedIcon(DEFAULT_ICON_STABLE);
                  }
                }}
              >
                <Text style={styles.faviconPromptGhostBtnText}>{tcx('form_no_thanks')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.faviconPromptBtn, styles.faviconPromptPrimaryBtn]}
                onPress={() => {
                  void runFaviconLookup();
                }}
              >
                <Text style={styles.faviconPromptPrimaryBtnText}>{tcx('form_find_favicon_now')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
      {faviconUrl && (
        <View>
          <View
            style={[
              styles.faviconContainer,
              {
                backgroundColor: formTheme.premiumElevated,
                borderWidth: 1,
                borderColor: formTheme.chipInactiveBorder,
              },
            ]}
          >
            <Image source={{ uri: faviconUrl }} style={styles.faviconImg} />
            <Text style={[styles.faviconLabel, { color: formTheme.labelGold }]}>{tcx('form_favicon_detected')}</Text>
          </View>
          <Text style={[styles.wordCount, { color: formTheme.textSecondary }]}>{tcx('form_favicon_style_hint')}</Text>
        </View>
      )}
    </View>
  );

  // Reset icon and URL when data type changes (but NOT if we're editing)
  const prevDataTypeRef = useRef<DataType>(dataType);
  useEffect(() => {
    if (editingData?.id) return;
    if (prevDataTypeRef.current === dataType) return;
    prevDataTypeRef.current = dataType;
    closeFaviconSuggestion();
    if (dataType === GHOST_LINK_VAULT_TYPE) {
      setDataValue(GHOST_LINK_VAULT_VALUE);
      setSelectedIcon(defaultGhostLinkIconStable);
      setFaviconUrl('');
    } else {
      setSelectedIcon(DEFAULT_ICON_STABLE);
      setFaviconUrl('');
    }
  }, [dataType, editingData?.id]);

  // ── Auto-detectar tipo al pegar un valor ──────────────────────────────────
  useEffect(() => {
    if (!dataValue.trim() || editingData?.id) return;
    if (dataValue.trim() === GHOST_LINK_VAULT_VALUE) return;
    const v = dataValue.trim();
    let detected: DataType | null = null;
    if (/^(https?:\/\/|www\.)\S+/i.test(v)) {
      detected = 'Enlaces';
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      detected = 'Email';
    } else if (/^\+?\d[\d\s\-().]{6,}$/.test(v)) {
      detected = 'Teléfono';
    }
    if (detected && detected !== dataType) {
      setAutoTypeSuggestion(detected);
    } else {
      setAutoTypeSuggestion(null);
    }
  }, [dataValue]);                            // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sugerir ícono por nombre de data (silencioso) ─────────────────────────
  useEffect(() => {
    if (!dataName.trim() || selectedIcon !== DEFAULT_ICON_STABLE || editingData?.id || dataType === GHOST_LINK_VAULT_TYPE) return;
    const nameLower = ` ${dataName.trim().toLowerCase()} `;
    for (const entry of KNOWN_NAME_ICONS) {
      if (entry.keywords.some((kw) => nameLower.includes(kw))) {
        setSelectedIcon(entry.iconId);
        return;
      }
    }
  }, [dataName]);                             // eslint-disable-line react-hooks/exhaustive-deps

  // Close modal
  const handleClose = () => {
    clearPendingAsyncWork();
    Keyboard.dismiss();
    // Dismiss spinner FIRST to avoid nested-Modal ghost overlay on Android/iOS
    setIsSaving(false);
    setTypeModalVisible(false);
    setCountryModalVisible(false);
    setIconModalVisible(false);
    setFileTypeModalVisible(false);
    setAssetPreviewVisible(false);
    setPendingAsset(null);
    documentUploadMetaRef.current = null;
    closeFaviconSuggestion();
    setFaviconLoading(false);
    setUploadModalVisible(false);
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStageLabel(tcx('form_iniciando'));
    setIsCompressing(false);
    setModerationAlertVisible(false);
    setModerationAlertMessage('');
    setRejectionAttempts(0);
    setRetryLockedUntil(null);
    setRetryCountdownSec(0);

    // Reset form
    setDataName('');
    setDataValue('');
    setDataType('Enlaces');
    setSelectedIcon(DEFAULT_ICON_STABLE);
    setCountryCode('+1');
    setFaviconUrl('');
    closeFaviconSuggestion();
    setAutoTypeSuggestion(null);
    setVaultCategoryModalVisible(false);
    setCreatingNewVaultCategory(false);
    setNewVaultCategoryDraft('');
    setSelectedVaultCategoryCanon(vaultCategoriesResolved[0] || '');
    savedLinkIdRef.current = null;
    savedUserIdRef.current = null;
    
    // Call callback
    if (onClose) onClose();
  };

  const openAssetPreview = (asset: {
    uri: string;
    name: string;
    mimeType: string;
    source: 'camera' | 'gallery' | 'document';
  }) => {
    documentUploadMetaRef.current = null;
    setPendingAsset(asset);
    setAssetPreviewVisible(true);
    setFileTypeModalVisible(false);
  };

  const confirmAssetPreview = () => {
    if (!pendingAsset?.uri) return;
    documentUploadMetaRef.current = {
      fileName: pendingAsset.name.trim() || inferFileName(pendingAsset.uri),
      mimeType: pendingAsset.mimeType.trim() || inferMimeType(pendingAsset.uri),
    };
    setDataValue(pendingAsset.uri);
    if (!dataName.trim()) {
      const baseName = pendingAsset.name.replace(/\.[^/.]+$/, '');
      setDataName(baseName || tcx('form_document_default'));
    }
    setAssetPreviewVisible(false);
    setPendingAsset(null);
  };

  const retryAssetSelection = () => {
    const sessionToken = closeGenerationRef.current;
    setDataValue('');
    documentUploadMetaRef.current = null;
    setUploadProgress(0);
    setUploadStageLabel(tcx('form_iniciando'));
    setIsUploading(false);
    setAssetPreviewVisible(false);
    setPendingAsset(null);
    trackTimeout(() => {
      if (!isSessionClosed(sessionToken)) {
        handlePickFile();
      }
    }, 150);
  };

  // Validar tamaño del archivo
  const validateFileSize = async (fileUri: string): Promise<{ valid: boolean; message?: string }> => {
    try {
      const response = await fetch(fileUri);
      const blob = await response.blob();
      const fileSizeInBytes = blob.size;
      const maxSize = dataType === 'Documento' ? MAX_DOCUMENT_SIZE : MAX_IMAGE_SIZE;
      const maxSizeInMB = maxSize / (1024 * 1024);

      if (fileSizeInBytes > maxSize) {
        return {
          valid: false,
          message: tcx('form_file_too_large_msg', {
            mb: (fileSizeInBytes / (1024 * 1024)).toFixed(2),
            maxMb: String(maxSizeInMB),
          }),
        };
      }

      return { valid: true };
    } catch (error) {
      console.error('Error validating file size:', error);
      return { valid: false, message: tcx('form_validate_size_error') };
    }
  };

  const getFileSizeInBytes = async (fileUri: string): Promise<number> => {
    try {
      const info = await FileSystem.getInfoAsync(fileUri, { size: true } as any);
      if ((info as any)?.size) {
        return Number((info as any).size);
      }
    } catch {
      // Fallback to fetch below.
    }

    const response = await fetch(fileUri);
    const blob = await response.blob();
    return blob.size;
  };

  const isImageLikeAsset = (uri: string, mimeType?: string | null) => {
    const mime = String(mimeType || '').toLowerCase();
    if (mime.startsWith('image/')) return true;
    return /\.(jpg|jpeg|png|webp|heic|bmp)$/i.test(String(uri || ''));
  };

  const isPdfAsset = (uri: string, mimeType?: string | null) => {
    const mime = String(mimeType || '').toLowerCase();
    return mime.includes('pdf') || /\.pdf(\?|$)/i.test(String(uri || ''));
  };

  const alertVaultImageTooLarge = () => {
    Alert.alert(tcx('form_image_too_large_title'), tcx('form_image_too_large_body'));
  };

  /** Redimensiona borde largo ≤2000px, JPEG 0.8, y re-comprime hasta caber en maxBytes (p. ej. 5MB). */
  const optimizeImageForLimit = async (uri: string, maxBytes: number): Promise<{ uri: string; size: number }> => {
    try {
      setIsCompressing(true);

      const readDimensions = (): Promise<{ w: number; h: number }> =>
        new Promise((resolve, reject) => {
          Image.getSize(
            uri,
            (w, h) => resolve({ w, h }),
            (e) => reject(e),
          );
        });

      let width = 0;
      let height = 0;
      try {
        const d = await readDimensions();
        width = d.w;
        height = d.h;
      } catch {
        width = 0;
        height = 0;
      }

      const resizeActions: ImageManipulator.Action[] = [];
      if (width > 0 && height > 0) {
        const longEdge = Math.max(width, height);
        if (longEdge > VAULT_IMAGE_MAX_LONG_EDGE) {
          if (width >= height) {
            resizeActions.push({ resize: { width: VAULT_IMAGE_MAX_LONG_EDGE } });
          } else {
            resizeActions.push({ resize: { height: VAULT_IMAGE_MAX_LONG_EDGE } });
          }
        }
      } else {
        resizeActions.push({ resize: { width: VAULT_IMAGE_MAX_LONG_EDGE } });
      }

      let out = await ImageManipulator.manipulateAsync(uri, resizeActions, {
        compress: VAULT_JPEG_QUALITY_INITIAL,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      let size = await getFileSizeInBytes(out.uri);

      let q = 0.72;
      for (let step = 0; step < 10 && size > maxBytes; step += 1) {
        const r = await ImageManipulator.manipulateAsync(out.uri, [], {
          compress: q,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        out = r;
        size = await getFileSizeInBytes(out.uri);
        q = Math.max(0.32, q - 0.07);
      }

      let edge = VAULT_IMAGE_MAX_LONG_EDGE;
      for (let downgrade = 0; downgrade < 6 && size > maxBytes; downgrade += 1) {
        edge = Math.max(720, Math.round(edge * 0.85));
        const r = await ImageManipulator.manipulateAsync(out.uri, [{ resize: { width: edge } }], {
          compress: Math.max(0.38, q),
          format: ImageManipulator.SaveFormat.JPEG,
        });
        out = r;
        size = await getFileSizeInBytes(out.uri);
      }

      return { uri: out.uri, size };
    } catch (error) {
      console.error('Error compressing image:', error);
      const size = await getFileSizeInBytes(uri).catch(() => Number.MAX_SAFE_INTEGER);
      return { uri, size };
    } finally {
      setIsCompressing(false);
    }
  };

  // Optimiza PDF re-guardando con object streams para reducir peso sin cambiar contenido visible.
  const optimizePdfForLimit = async (uri: string, maxBytes: number): Promise<{ uri: string; size: number }> => {
    try {
      setIsCompressing(true);
      // IMPORTANT: avoid loading huge PDFs in memory as base64 here.
      // That path was causing freezes/crashes on physical iOS devices.
      const currentSize = await getFileSizeInBytes(uri).catch(() => Number.MAX_SAFE_INTEGER);
      if (currentSize > maxBytes) {
        Toast.show({
          type: 'info',
          text1: tcx('form_pdf_warn_title'),
          text2: tcx('form_pdf_warn_body'),
          position: 'bottom',
          visibilityTime: 4000,
          autoHide: true,
        });
      }
      return { uri, size: currentSize };
    } catch (error) {
      console.warn('PDF optimization failed, keeping original:', error);
      const size = await getFileSizeInBytes(uri).catch(() => Number.MAX_SAFE_INTEGER);
      return { uri, size };
    } finally {
      setIsCompressing(false);
    }
  };

  const forceUnlockPicker = (reason: string) => {
    if (pickerWatchdogTimeoutRef.current) {
      clearTimeout(pickerWatchdogTimeoutRef.current);
      pickerWatchdogTimeoutRef.current = null;
    }
    pickerLockTimestampRef.current = null;
    isPickingRef.current = false;
    setIsPicking(false);
    logPickerTrace('PICKER_FORCE_UNLOCK', { reason });
  };

  const startPickerGuard = (source: string) => {
    pickerLockTimestampRef.current = Date.now();
    if (pickerWatchdogTimeoutRef.current) {
      clearTimeout(pickerWatchdogTimeoutRef.current);
    }
    pickerWatchdogTimeoutRef.current = setTimeout(() => {
      if (isPickingRef.current) {
        forceUnlockPicker(`${source}_watchdog_timeout`);
      }
    }, PICKER_STALE_LOCK_MS);
    logPickerTrace('PICKER_GUARD_START', { source, timeoutMs: PICKER_STALE_LOCK_MS });
  };

  const stopPickerGuard = (source: string) => {
    if (pickerWatchdogTimeoutRef.current) {
      clearTimeout(pickerWatchdogTimeoutRef.current);
      pickerWatchdogTimeoutRef.current = null;
    }
    pickerLockTimestampRef.current = null;
    logPickerTrace('PICKER_GUARD_STOP', { source });
  };

  const withPickerLaunchTimeout = async <T,>(source: string, task: Promise<T>, timeoutMessage: string) => {
    try {
      return await withTimeout(task, PICKER_LAUNCH_TIMEOUT_MS, timeoutMessage);
    } catch (error) {
      const message = String((error as any)?.message || '');
      if (message === timeoutMessage) {
        logPickerTrace(`${source}_LAUNCH_TIMEOUT`, { timeoutMs: PICKER_LAUNCH_TIMEOUT_MS });
      }
      throw error;
    }
  };

  // Abrir selector de Fotos o Documentos
  const handlePickFile = () => {
    logPickerTrace('OPEN_PICKER_SHEET_REQUEST', {
      isPickingState: isPicking,
      isPickingRef: isPickingRef.current,
      isCompressing,
    });

    if (isPickingRef.current) {
      const lockAgeMs = pickerLockTimestampRef.current ? Date.now() - pickerLockTimestampRef.current : null;
      if (lockAgeMs === null || lockAgeMs > PICKER_STALE_LOCK_MS) {
        logPickerTrace('OPEN_PICKER_SHEET_RECOVER_STALE_REF', { lockAgeMs });
        forceUnlockPicker('open_sheet_stale_ref');
      } else {
        logPickerTrace('OPEN_PICKER_SHEET_BLOCKED_REF_BUSY', { lockAgeMs });
        return;
      }
    }

    // Recover from stale UI flag if ref is already free.
    if (isPicking) {
      logPickerTrace('OPEN_PICKER_SHEET_RECOVER_STALE_STATE');
      setIsPicking(false);
    }

    if (Platform.OS === 'ios') {
      logPickerTrace('OPEN_PICKER_IOS_ACTION_SHEET');
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            tcx('form_cancel'),
            tcx('form_ios_take_photo'),
            tcx('form_ios_pick_image'),
            tcx('form_ios_pick_document'),
          ],
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) {
            logPickerTrace('OPEN_PICKER_IOS_SELECT_CAMERA');
            trackTimeout(() => {
              void handleTakePhoto();
            }, 180);
          }
          if (idx === 2) {
            logPickerTrace('OPEN_PICKER_IOS_SELECT_PHOTOS');
            trackTimeout(() => {
              void handlePickPhotos();
            }, 180);
          }
          if (idx === 3) {
            logPickerTrace('OPEN_PICKER_IOS_SELECT_DOCUMENT');
            trackTimeout(() => {
              void handlePickDocument();
            }, 180);
          }
        },
      );
      return;
    }

    setFileTypeModalVisible(true);
    logPickerTrace('OPEN_PICKER_SHEET_VISIBLE');
  };

  const closeFileTypeModal = () => {
    logPickerTrace('CLOSE_PICKER_SHEET_REQUEST', {
      isPickingState: isPicking,
      isPickingRef: isPickingRef.current,
    });
    setFileTypeModalVisible(false);
    // If user just dismisses picker sheet, keep picker mutex unlocked for next try.
    if (!isPickingRef.current) {
      setIsPicking(false);
      logPickerTrace('CLOSE_PICKER_SHEET_UNLOCKED');
    } else {
      logPickerTrace('CLOSE_PICKER_SHEET_KEEP_LOCK_ACTIVE');
    }
  };

  const waitForModalCloseFrame = () =>
    new Promise<void>((resolve) => {
      if (!fileTypeModalVisible) {
        logPickerTrace('PICKER_SHEET_WAIT_SKIPPED_NOT_VISIBLE');
        let interactionTask: { cancel?: () => void } | null = null;
        interactionTask = InteractionManager.runAfterInteractions(() => {
          untrackInteractionTask(interactionTask);
          trackTimeout(() => resolve(), Platform.OS === 'ios' ? 120 : 60);
        });
        trackInteractionTask(interactionTask);
        return;
      }

      let settled = false;
      const settle = (reason: string) => {
        if (settled) return;
        settled = true;
        if (fileTypeModalDismissResolverRef.current) {
          fileTypeModalDismissResolverRef.current = null;
        }
        logPickerTrace('PICKER_SHEET_WAIT_RESOLVED', { reason });
        let interactionTask: { cancel?: () => void } | null = null;
        interactionTask = InteractionManager.runAfterInteractions(() => {
          untrackInteractionTask(interactionTask);
          trackTimeout(() => resolve(), Platform.OS === 'ios' ? 220 : 90);
        });
        trackInteractionTask(interactionTask);
      };

      fileTypeModalDismissResolverRef.current = settle;
      setFileTypeModalVisible(false);
      trackTimeout(() => settle('dismiss_timeout_fallback'), Platform.OS === 'ios' ? 1100 : 500);
    });

  // Seleccionar imagen del dispositivo
  const handlePickPhotos = async () => {
    if (isPickingRef.current) {
      logPickerTrace('PICK_PHOTOS_BLOCKED_ALREADY_PICKING');
      return;
    }
    isPickingRef.current = true;
    setIsPicking(true);
    startPickerGuard('pick_photos');
    logPickerTrace('PICK_PHOTOS_START');
    try {
      logPickerTrace('PICK_PHOTOS_REQUEST_PERMISSION');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      logPickerTrace('PICK_PHOTOS_PERMISSION_RESULT', { status });
      if (status !== 'granted') {
        Alert.alert(tcx('form_perm_denied'), tcx('form_photos_needed'));
        return;
      }
      logPickerTrace('PICK_PHOTOS_SHEET_CLOSED_WAITING_FRAME');
      await waitForModalCloseFrame();
      Toast.show({
        text1: tcx('form_uploading'),
        type: 'info',
        position: 'bottom',
        visibilityTime: 4000,
        autoHide: true,
      });
      const sessionToken = closeGenerationRef.current;
      if (isSessionClosed(sessionToken)) return;
      logPickerTrace('PICK_PHOTOS_LAUNCH_LIBRARY');
      const result = await withPickerLaunchTimeout(
        'PICK_PHOTOS_LIBRARY',
        ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        }),
        tcx('form_gallery_timeout')
      );
      logPickerTrace('PICK_PHOTOS_LIBRARY_RESULT', {
        canceled: result.canceled,
        assetsCount: result.assets?.length ?? 0,
      });
      if (isSessionClosed(sessionToken)) return;
      if (!result.canceled && result.assets.length > 0) {
        const file = result.assets[0];
        logAssetAudit('PICK_GALLERY_RAW', {
          dataType,
          dataName,
          uri: file.uri,
          fileName: file.fileName || 'unknown',
          mimeType: file.mimeType || 'unknown',
          sizeBytes: file.fileSize || null,
        });

        const maxImageBytes = dataType === 'Documento' ? MAX_DOCUMENT_SIZE : MAX_IMAGE_SIZE;
        const optimized = await optimizeImageForLimit(file.uri, maxImageBytes);
        if (isSessionClosed(sessionToken)) return;
        console.log('--- COMPRESIÓN REAL ---', optimized.size);
        if (optimized.size > maxImageBytes) {
          alertVaultImageTooLarge();
          return;
        }
        logAssetAudit('PICK_GALLERY_COMPRESSED', {
          dataType,
          dataName,
          uri: optimized.uri,
          fileName: file.fileName || 'gallery-image.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: optimized.size,
        });
        openAssetPreview({
          uri: optimized.uri,
          name: file.fileName || 'gallery-image.jpg',
          mimeType: file.mimeType || 'image/jpeg',
          source: 'gallery',
        });
      }
    } catch (error) {
      console.error('Error al seleccionar imagen:', error);
      logPickerTrace('PICK_PHOTOS_ERROR', {
        message: String((error as any)?.message || ''),
        code: String((error as any)?.code || ''),
      });
      Alert.alert(
        tcx('form_gallery_fail_title'),
        tcx('form_gallery_fail_body')
      );
    } finally {
      stopPickerGuard('pick_photos');
      isPickingRef.current = false;
      setIsPicking(false);
      logPickerTrace('PICK_PHOTOS_FINALLY_RELEASE');
    }
  };

  const handlePickDocument = async () => {
    if (isPickingRef.current) {
      logPickerTrace('PICK_DOCUMENT_BLOCKED_ALREADY_PICKING');
      return;
    }
    isPickingRef.current = true;
    setIsPicking(true);
    startPickerGuard('pick_document');
    logPickerTrace('PICK_DOCUMENT_START');
    try {
      logPickerTrace('PICK_DOCUMENT_SHEET_CLOSED_WAITING_FRAME');
      await waitForModalCloseFrame();
      logPickerTrace('PICK_DOCUMENT_LAUNCH');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: false,
        copyToCacheDirectory: true,
      });
      logPickerTrace('PICK_DOCUMENT_RESULT', {
        canceled: result.canceled,
        assetsCount: result.assets?.length ?? 0,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const file = result.assets[0];
      const incomingSize = Number(file.size || 0);
      logAssetAudit('PICK_DOCUMENT_RAW', {
        dataType,
        dataName,
        uri: file.uri,
        fileName: file.name || 'unknown',
        mimeType: file.mimeType || 'unknown',
        sizeBytes: file.size || null,
      });
      const isImageDoc = isImageLikeAsset(file.uri, file.mimeType);
      let finalUri = file.uri;
      let finalMime = file.mimeType || inferMimeType(file.uri);
      let finalSize = await getFileSizeInBytes(file.uri);

      if (isImageDoc) {
        const maxImageBytes = dataType === 'Documento' ? MAX_DOCUMENT_SIZE : MAX_IMAGE_SIZE;
        const optimized = await optimizeImageForLimit(file.uri, maxImageBytes);
        console.log('--- COMPRESIÓN REAL ---', optimized.size);
        finalUri = optimized.uri;
        finalSize = optimized.size;
        finalMime = 'image/jpeg';

        if (finalSize > maxImageBytes) {
          alertVaultImageTooLarge();
          return;
        }
        // Permitir guardar imágenes como documentos: ajustar nombre si es necesario
        if (dataType === 'Documento') {
          file.name = file.name?.replace(/\.[^/.]+$/, '') + '.jpg';
        }
      } else if (isPdfAsset(file.uri, file.mimeType)) {
        if (incomingSize > MAX_DOCUMENT_SIZE) {
          Alert.alert(
            tcx('form_pdf_large_title'),
            tcx('form_pdf_20mb')
          );
          return;
        }

        const optimizedPdf = await optimizePdfForLimit(file.uri, MAX_DOCUMENT_SIZE);
        finalUri = optimizedPdf.uri;
        finalSize = optimizedPdf.size;
        finalMime = 'application/pdf';

        if (finalSize > MAX_DOCUMENT_SIZE) {
          Alert.alert(
            tcx('form_pdf_large_title'),
            tcx('form_pdf_safe_limit')
          );
          return;
        }
      } else {
        if (dataType !== 'Documento') {
          const validation = await validateFileSize(file.uri);
          if (!validation.valid) {
            Alert.alert(
              tcx('form_unsupported_title'),
              tcx('form_unsupported_body')
            );
            return;
          }
        }
      }

      // Asegurar nombre válido para imágenes en documentos
      let assetName = file.name;
      if (isImageDoc && dataType === 'Documento') {
        if (!assetName || !assetName.endsWith('.jpg')) {
          assetName = `documento-${Date.now()}.jpg`;
        }
      } else if (!assetName) {
        assetName = 'documento';
      }
      openAssetPreview({
        uri: finalUri,
        name: assetName,
        mimeType: finalMime,
        source: 'document',
      });
      logAssetAudit('PICK_DOCUMENT_FINAL', {
        dataType,
        dataName,
        uri: finalUri,
        fileName: file.name || 'documento',
        mimeType: finalMime,
        sizeBytes: finalSize,
      });
    } catch (error) {
      console.error('Error picking document:', error);
      logPickerTrace('PICK_DOCUMENT_ERROR', {
        message: String((error as any)?.message || ''),
        code: String((error as any)?.code || ''),
      });
      Alert.alert(corex('common_error'), tcx('form_doc_pick_fail'));
    } finally {
      stopPickerGuard('pick_document');
      isPickingRef.current = false;
      setIsPicking(false);
      logPickerTrace('PICK_DOCUMENT_FINALLY_RELEASE');
    }
  };

  const handleTakePhoto = async () => {
    if (isPickingRef.current) {
      logPickerTrace('PICK_CAMERA_BLOCKED_ALREADY_PICKING');
      return;
    }
    isPickingRef.current = true;
    setIsPicking(true);
    startPickerGuard('pick_camera');
    logPickerTrace('PICK_CAMERA_START');
    try {
      logPickerTrace('PICK_CAMERA_REQUEST_PERMISSION');
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      logPickerTrace('PICK_CAMERA_PERMISSION_RESULT', { status });
      if (status !== 'granted') {
        Alert.alert(tcx('form_perm_denied'), tcx('form_camera_needed'));
        return;
      }
      logPickerTrace('PICK_CAMERA_SHEET_CLOSED_WAITING_FRAME');
      await waitForModalCloseFrame();
      Toast.show({
        text1: tcx('form_uploading'),
        type: 'info',
        position: 'bottom',
        visibilityTime: 4000,
        autoHide: true,
      });
      const sessionToken = closeGenerationRef.current;
      if (isSessionClosed(sessionToken)) return;
      logPickerTrace('PICK_CAMERA_LAUNCH');
      const result = await withPickerLaunchTimeout(
        'PICK_CAMERA',
        ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        }),
        tcx('form_camera_timeout')
      );
      logPickerTrace('PICK_CAMERA_RESULT', {
        canceled: result.canceled,
        assetsCount: result.assets?.length ?? 0,
      });
      if (isSessionClosed(sessionToken)) return;
      if (!result.canceled && result.assets.length > 0) {
        const file = result.assets[0];
        logAssetAudit('PICK_CAMERA_RAW', {
          dataType,
          dataName,
          uri: file.uri,
          fileName: file.fileName || 'camera.jpg',
          mimeType: file.mimeType || 'unknown',
          sizeBytes: file.fileSize || null,
        });
        const maxImageBytes = dataType === 'Documento' ? MAX_DOCUMENT_SIZE : MAX_IMAGE_SIZE;
        const optimized = await optimizeImageForLimit(file.uri, maxImageBytes);
        if (isSessionClosed(sessionToken)) return;
        console.log('--- COMPRESIÓN REAL ---', optimized.size);
        if (optimized.size > maxImageBytes) {
          alertVaultImageTooLarge();
          return;
        }
        logAssetAudit('PICK_CAMERA_COMPRESSED', {
          dataType,
          dataName,
          uri: optimized.uri,
          fileName: 'camera-compressed.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: optimized.size,
        });
        openAssetPreview({
          uri: optimized.uri,
          name: file.fileName || 'camera-image.jpg',
          mimeType: 'image/jpeg',
          source: 'camera',
        });
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      logPickerTrace('PICK_CAMERA_ERROR', {
        message: String((error as any)?.message || ''),
        code: String((error as any)?.code || ''),
      });
      Alert.alert(
        tcx('form_camera_fail_title'),
        tcx('form_camera_fail_body')
      );
    } finally {
      stopPickerGuard('pick_camera');
      isPickingRef.current = false;
      setIsPicking(false);
      logPickerTrace('PICK_CAMERA_FINALLY_RELEASE');
    }
  };

  const syncVaultUpdateAcrossCards = async (userId: string, updatedItem: Link) => {
    try {
      const cardsSnapshot = await getDocs(collection(db, 'users', userId, 'cards'));
      const nowIso = new Date().toISOString();

      for (const cardDoc of cardsSnapshot.docs) {
        const cardData = cardDoc.data() as any;
        const patch: Record<string, any> = {};

        if (Array.isArray(cardData.items)) {
          let touched = false;
          const nextItems = cardData.items.map((entry: any) => {
            const match = entry?.vaultDataId === updatedItem.id || entry?.id === updatedItem.id;
            if (!match) return entry;
            touched = true;
            return {
              ...entry,
              title: updatedItem.title,
              nameOfData: updatedItem.title,
              value: updatedItem.value,
              type: updatedItem.type,
              icon: updatedItem.icon,
              iconName: updatedItem.iconName,
              isFavorite: updatedItem.isFavorite,
              updatedAt: nowIso,
            };
          });
          if (touched) {
            patch.items = nextItems;
          }
        }

        if (Array.isArray(cardData.cardItems)) {
          let touched = false;
          const nextCardItems = cardData.cardItems.map((entry: any) => {
            const match = entry?.vaultDataId === updatedItem.id || entry?.id === updatedItem.id;
            if (!match) return entry;
            touched = true;
            return {
              ...entry,
              title: updatedItem.title,
              nameOfData: updatedItem.title,
              value: updatedItem.value,
              type: updatedItem.type,
              icon: updatedItem.icon,
              iconName: updatedItem.iconName,
              isFavorite: updatedItem.isFavorite,
              updatedAt: nowIso,
            };
          });
          if (touched) {
            patch.cardItems = nextCardItems;
          }
        }

        if (Object.keys(patch).length > 0) {
          patch.updatedAt = nowIso;
          await updateDoc(doc(db, 'users', userId, 'cards', cardDoc.id), patch);
        }
      }
    } catch (error) {
      console.warn('Vault linked-card update sync failed:', error);
    }
  };

  const hasClearlyVisibleFace = async (uri: string, imageWidth?: number, imageHeight?: number) => {
    try {
      // Load face detector dynamically so Expo Go can boot even when the native module is unavailable.
      const FaceDetector = await import('expo-face-detector');

      const detection = await FaceDetector.detectFacesAsync(uri, {
        mode: FaceDetector.FaceDetectorMode.fast,
        detectLandmarks: FaceDetector.FaceDetectorLandmarks.none,
        runClassifications: FaceDetector.FaceDetectorClassifications.none,
      });

      const faces = detection.faces || [];
      if (faces.length === 0) {
        return false;
      }

      if (!imageWidth || !imageHeight) {
        return true;
      }

      const imageArea = imageWidth * imageHeight;
      return faces.some((face: any) => {
        const faceWidth = Number(face.bounds?.size?.width || 0);
        const faceHeight = Number(face.bounds?.size?.height || 0);
        const faceArea = faceWidth * faceHeight;
        return faceArea / imageArea >= 0.08;
      });
    } catch (error) {
      console.warn('Face detection failed:', error);
      // Fallback: backend moderation still validates uploads server-side.
      return true;
    }
  };

  const inferMimeType = (uri: string): string => {
    const lowerUri = uri.toLowerCase();
    if (lowerUri.endsWith('.pdf')) return 'application/pdf';
    if (lowerUri.endsWith('.doc')) return 'application/msword';
    if (lowerUri.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (lowerUri.endsWith('.xls')) return 'application/vnd.ms-excel';
    if (lowerUri.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (lowerUri.endsWith('.txt')) return 'text/plain';
    if (lowerUri.endsWith('.csv')) return 'text/csv';
    if (lowerUri.endsWith('.png')) return 'image/png';
    if (lowerUri.endsWith('.heic')) return 'image/heic';
    if (lowerUri.endsWith('.jpg') || lowerUri.endsWith('.jpeg')) return 'image/jpeg';
    if (lowerUri.endsWith('.webp')) return 'image/webp';
    if (dataType === 'Documento') return 'application/octet-stream';
    return 'image/jpeg';
  };

  const inferFileName = (uri: string): string => {
    const parts = uri.split('/');
    const last = parts[parts.length - 1] || '';
    if (last && last.includes('.')) return last;

    const timestamp = Date.now();
    const m = inferMimeType(uri);
    if (dataType === 'Documento') {
      if (m === 'application/pdf' || m.includes('pdf')) return `vault-file-${timestamp}.pdf`;
      if (m.startsWith('image/')) return `vault-file-${timestamp}.jpg`;
      return `vault-file-${timestamp}.bin`;
    }
    return `vault-image-${timestamp}.jpg`;
  };

  const logVaultUploadFailure = (error: unknown, context: { fileName: string; mimeType: string; fileUri: string }) => {
    const e = error as any;
    const msg = String(e?.message || error || '');
    const status = e?.response?.status as number | undefined;
    const body = e?.response?.data;
    let category = 'UNKNOWN';
    if (status === 400 && /exceeds|too large|limit|MB/i.test(msg)) {
      category = 'FILE_SIZE_LIMIT';
    } else if (status === 400) {
      category = 'FILE_TYPE_OR_REQUEST_VALIDATION';
    } else if (status === 403) {
      category = 'MODERATION_BLOCKED';
    } else if (status === 503 || /Spaces S3Client|DO_SPACES_|not configured/i.test(msg)) {
      category = 'SERVER_STORAGE_ENV';
    } else if (/Missing EXPO_PUBLIC_MODERATION|EXPO_PUBLIC_MODERATION|GATEWAY_KEY/i.test(msg)) {
      category = 'CLIENT_APP_ENV';
    } else if (e?.code === 'ECONNABORTED' || /timeout|network error|failed to fetch/i.test(msg.toLowerCase())) {
      category = 'NETWORK_OR_TIMEOUT';
    }
    console.error(
      `[NewInfoForm:VaultUpload] category=${category} httpStatus=${status ?? 'n/a'} fileName=${context.fileName} mimeType=${context.mimeType}`,
      { message: msg, responseBody: body },
    );
  };

  // Subir archivo al backend (Azure Content Safety + Mongo)
  const uploadFileToModerationBackend = async (
    fileUri: string,
    fileLabel: string,
    uid: string
  ): Promise<{ fileId: string; publicUrl: string | null; mimeType: string | null }> => {
    try {
      if (!fileUri.startsWith('file://')) {
        return { fileId: fileUri, publicUrl: null, mimeType: null };
      }
      const sessionToken = closeGenerationRef.current;

      const meta = documentUploadMetaRef.current;
      const fileName = (meta?.fileName && meta.fileName.trim()) || inferFileName(fileUri);
      const mimeType =
        (meta?.mimeType && meta.mimeType.trim()) || inferMimeType(fileUri) || 'application/octet-stream';

      setUploadProgress(0);
      setUploadStageLabel(tcx('form_preparing'));
      setIsUploading(true);
      setUploadModalVisible(true);
      setUploadProgress(0.2);
      setUploadStageLabel(tcx('form_sending'));

      const fileInfo = await FileSystem.getInfoAsync(fileUri, { size: true } as any).catch(() => null);
      logAssetAudit('UPLOAD_ATTEMPT', {
        dataType,
        dataName: fileLabel,
        uri: fileUri,
        fileName,
        mimeType,
        sizeBytes: (fileInfo as any)?.size || null,
      });

      const uploadResult = await uploadFileWithModeration({
        fileUri,
        uid,
        label: fileLabel,
        fileName,
        mimeType,
      });

      setUploadProgress(0.8);
      setUploadStageLabel(tcx('form_moderating'));
      setUploadProgress(1);
      setUploadStageLabel(tcx('form_approved'));

      documentUploadMetaRef.current = null;

      trackTimeout(() => {
        if (isSessionClosed(sessionToken)) return;
        setUploadModalVisible(false);
        setIsUploading(false);
      }, 400);

      return {
        fileId: uploadResult.fileId,
        publicUrl: uploadResult.publicUrl,
        mimeType: uploadResult.mimeType,
      };
    } catch (error) {
      setUploadModalVisible(false);
      setIsUploading(false);
      const meta = documentUploadMetaRef.current;
      logVaultUploadFailure(error, {
        fileUri,
        fileName: (meta?.fileName && meta.fileName.trim()) || inferFileName(fileUri),
        mimeType: (meta?.mimeType && meta.mimeType.trim()) || inferMimeType(fileUri) || 'application/octet-stream',
      });
      throw error;
    }
  };

  // Save to Firestore (Create or Update)
  const handleCreate = async () => {
    if (isSaving) return;
    console.log('[Vault] handleCreate: INICIO');
    console.log('[Vault] handleCreate: Antes de Validaciones Iniciales');
    if (dataType === GHOST_LINK_VAULT_TYPE && !editingData?.id) {
      Alert.alert(tcx('form_ghost_link_title'), tcx('form_ghost_link_body'));
      return;
    }
    if (!dataName.trim() || (!dataValue.trim() && dataType !== GHOST_LINK_VAULT_TYPE)) {
      Alert.alert(tcx('form_err_title'), tcx('form_fill_fields'));
      return;
    }
    // #16 Format validation per type
    if (dataType === 'Email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dataValue.trim())) {
      Alert.alert(tcx('form_err_title'), tcx('form_bad_email'));
      return;
    }
    if (dataType === 'Teléfono') {
      const n = sanitizeNationalDigits(dataValue);
      const { min, max } = getNationalDigitBounds(countryCode);
      if (n.length < min || n.length > max) {
        Alert.alert(
          tcx('form_err_title'),
          tcx('form_phone_len', { min, max }),
        );
        return;
      }
    }
    if (dataType === 'Enlaces') {
      let testUrl = dataValue.trim();
      if (!/^https?:\/\//i.test(testUrl)) testUrl = 'https://' + testUrl;
      if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(testUrl)) {
        Alert.alert(tcx('form_err_title'), tcx('form_bad_url'));
        return;
      }
    }
    if (dataType === 'Texto Plain') {
      const wordCount = dataValue.split(/\s+/).filter(w => w).length;
      if (wordCount > 200) {
        Alert.alert(tcx('form_err_title'), tcx('form_max_words_200'));
        return;
      }
    }
    console.log('[Vault] handleCreate: Después de Validaciones Iniciales');
    if (isRetryLocked) {
      setModerationAlertMessage(retryLockMessage);
      setModerationAlertVisible(true);
      console.log('[Vault] handleCreate: isRetryLocked');
      return;
    }
    const saveSessionToken = closeGenerationRef.current;
    setIsSaving(true);
    try {
      console.log('[Vault] handleCreate: Antes de getActiveUserId');
      const userId = await getActiveUserId();
      console.log('[Vault] handleCreate: Después de getActiveUserId', userId);
      if (!userId) {
        Alert.alert(tcx('form_err_title'), tcx('form_bad_user'));
        return;
      }
      console.log('[Vault] handleCreate: Antes de AsyncStorage.getItem');
      const existingData = await readVaultJsonWithLegacyMigration(userId);
      console.log('[Vault] handleCreate: Después de AsyncStorage.getItem');
      let dataArray: any[] = [];
      if (existingData) {
        try {
          const parsed = JSON.parse(existingData);
          dataArray = Array.isArray(parsed) ? parsed : [];
        } catch {
          dataArray = [];
        }
      }
      const normalizedTitle = dataName.trim().toLowerCase();
      const duplicateByTitle = dataArray.find((item: any) => {
        const sameId = editingData?.id && item?.id === editingData.id;
        const title = String(item?.title || '').trim().toLowerCase();
        return !sameId && title === normalizedTitle;
      });
      if (duplicateByTitle) {
        Alert.alert(tcx('form_dup_title'), tcx('form_dup_body'));
        return;
      }
      const catalogPick = selectedIcon === 'favicon' ? undefined : galleryItemByStableOrLegacy(selectedIcon);
      const iconData = selectedIcon === 'favicon'
        ? faviconUrl
        : sanitizeMaterialIconName(catalogPick?.icon || mappedIconName);
      const iconName = selectedIcon === 'favicon'
        ? 'Favicon'
        : (catalogPick?.label ?? mappedIconName);
      // #21 Auto-prepend https:// for Enlaces
      let preNormalized = dataValue;
      if (dataType === GHOST_LINK_VAULT_TYPE) {
        preNormalized = GHOST_LINK_VAULT_VALUE;
      } else if (dataType === 'Enlaces' && !/^https?:\/\//i.test(dataValue.trim())) {
        preNormalized = 'https://' + dataValue.trim();
      }
      // #25 Phone: E.164 desde prefijo + parte nacional
      const normalizedValue =
        dataType === 'Teléfono' ? buildE164(countryCode, preNormalized) : preNormalized;
      const shouldUploadFile =
        dataType === 'Documento' && normalizedValue.startsWith('file://');
      let finalValue = normalizedValue;
      let vaultMimeForPayload: string | undefined;
      if (shouldUploadFile) {
        let fileUriToUpload = normalizedValue;
        const meta = documentUploadMetaRef.current;
        const mimeForUpload =
          (meta?.mimeType && meta.mimeType.trim()) || inferMimeType(normalizedValue);
        const treatAsImage =
          mimeForUpload.startsWith('image/') ||
          isImageLikeAsset(normalizedValue, mimeForUpload) ||
          isImageFile(dataName);
        if (treatAsImage) {
          const prepared = await optimizeImageForLimit(normalizedValue, MAX_IMAGE_SIZE);
          if (prepared.size > MAX_IMAGE_SIZE) {
            alertVaultImageTooLarge();
            return;
          }
          fileUriToUpload = prepared.uri;
        }
        const { publicUrl: filePublicUrl, mimeType: uploadedMime } = await uploadFileToModerationBackend(
          fileUriToUpload,
          dataName,
          userId,
        );
        const resolvedUrl = String(filePublicUrl || '').trim();
        if (!resolvedUrl) {
          Alert.alert(tcx('form_upload_partial_title'), tcx('form_upload_partial_body'));
          return;
        }
        finalValue = resolvedUrl;
        const mergedMime = String(uploadedMime || mimeForUpload || '').trim();
        if (mergedMime) {
          vaultMimeForPayload = mergedMime.slice(0, 120);
        }
      } else if (dataType === 'Documento' && editingData?.vaultMimeType) {
        vaultMimeForPayload = String(editingData.vaultMimeType).trim().slice(0, 120);
      }

      let vaultCategoryCanon = '';
      if (creatingNewVaultCategory) {
        vaultCategoryCanon = newVaultCategoryDraft.trim();
        if (!vaultCategoryCanon) {
          Alert.alert(tcx('form_folder_required_title'), tcx('form_folder_required_body'));
          return;
        }
        if (vaultCategoryCanon.length > 64) {
          Alert.alert(tcx('form_name_long_title'), tcx('form_name_long_body'));
          return;
        }
      } else {
        vaultCategoryCanon = selectedVaultCategoryCanon.trim();
      }
      if (!vaultCategoryCanon && vaultCategoriesResolved.length > 0) {
        vaultCategoryCanon = vaultCategoriesResolved[0];
      }
      const existingCanon = vaultCategoriesResolved.find(
        (c) => c.toLowerCase() === vaultCategoryCanon.toLowerCase(),
      );
      const finalVaultCategory = existingCanon ?? vaultCategoryCanon;

      try {
        const nextCats = await appendVaultCategoryIfNew(userId, finalVaultCategory);
        if (!isSessionClosed(saveSessionToken) && isMountedRef.current) {
          setVaultCategoriesResolved(nextCats);
        }
      } catch (catErr) {
        console.warn('[Vault] vaultCategories user update:', catErr);
      }

      // Crear ID único evitando cualquier choque accidental local.
      const existingIds = new Set(
        dataArray.map((entry: any) => String(entry?.id || '')).filter(Boolean)
      );
      let uniqueId = editingData?.id;
      if (!uniqueId) {
        do {
          uniqueId = newEntityId();
        } while (existingIds.has(uniqueId));
      }
      const dataPayload = {
        id: uniqueId,
        uid: userId,
        title: dataName.trim(),
        type: dataType,
        value: finalValue,
        iconName: iconName,
        icon: iconData,
        ...(selectedIcon !== 'favicon' && catalogPick
          ? { iconVaultId: stableKeyForCatalogIcon(catalogPick) }
          : {}),
        ...(dataType === GHOST_LINK_VAULT_TYPE ? { vaultProtected: true } : {}),
        ...(dataType === 'Documento' && vaultMimeForPayload ? { vaultMimeType: vaultMimeForPayload } : {}),
        isFavorite: editingData?.isFavorite || false,
        createdAt: editingData?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: finalVaultCategory,
      };
      // Store saved IDs for silent background favicon update
      savedLinkIdRef.current = uniqueId;
      savedUserIdRef.current = userId;
      if (editingData?.id) {
        // ACTUALIZAR: reemplazar el elemento existente (o insertar si no estaba en caché local)
        const index = dataArray.findIndex((item: any) => item.id === editingData.id);
        if (index !== -1) {
          dataArray[index] = dataPayload;
        } else {
          dataArray.push(dataPayload);
        }
      } else {
        // CREAR: agregar nuevo elemento
        dataArray.push(dataPayload);
      }
      console.log('[Vault] handleCreate: Antes de AsyncStorage.setItem');
      await AsyncStorage.setItem(vaultStorageKey(userId), JSON.stringify(dataArray));
      console.log('[Vault] handleCreate: Después de AsyncStorage.setItem');
      const qualifiesPremiumSensory = await viewerQualifiesVaultFerrariSensory(userId);
      await runVaultMagneticSaveFeedback(qualifiesPremiumSensory);
      Toast.show({
        type: 'success',
        text1: tcx('form_saved_title'),
        text2: tcx('form_saved_local'),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });

      if (userId) {
        try {
          console.log('[Vault] handleCreate: Cloud sync start (await before close)');
          const cloudDocRef = doc(db, 'users', userId, 'links', uniqueId!);
          const encoded = await encodeVaultLink(dataPayload as VaultLinkLogical, null);
          await withTimeout(
            setDoc(cloudDocRef, encoded),
            CLOUD_SYNC_TIMEOUT_MS,
            'Cloud sync timeout',
          );
          console.log('[Vault] handleCreate: Cloud sync done');
          try {
            await syncVaultLinkToMongoCardsAfterSave(userId, uniqueId!);
          } catch (mongoSyncErr) {
            console.warn('[Vault] mongo sync after cloud failed:', mongoSyncErr);
          }
          Toast.show({
            type: 'success',
            text1: tcx('form_cloud_done_title'),
            text2: tcx('form_cloud_done_sub'),
            position: 'bottom',
            visibilityTime: 2200,
            autoHide: true,
          });
        } catch (cloudError) {
          console.warn('[Vault] Cloud sync failed, local data kept:', cloudError);
          Alert.alert(
            tcx('form_upload_err'),
            userFacingAlertMessage(cloudError, language, tcx('form_save_retry_q')),
            [
              { text: tcx('form_cancel'), style: 'cancel' },
              { text: tcx('form_retry'), onPress: () => void handleCreate() },
            ],
          );
          return;
        }
      }

      emitVaultLinkSaved({
        uid: userId,
        linkId: String(uniqueId || ''),
        premiumSensory: !editingData?.id && qualifiesPremiumSensory,
      });
      console.log('[Vault] handleCreate: Antes de handleClose');
      handleClose();
      console.log('[Vault] handleCreate: Después de handleClose');
    } catch (error) {
      console.error('[Vault] handleCreate: Error saving:', error);
      if (error instanceof ModerationRejectedError) {
        Toast.show({
          type: 'error',
          text1: tcx('form_content_blocked'),
          position: 'bottom',
          visibilityTime: 3000,
          autoHide: true,
        });
        registerModerationReject();
      } else {
        Alert.alert(
          tcx('form_upload_err'),
          userFacingAlertMessage(error, language, tcx('form_save_retry_q')),
          [
            { text: tcx('form_cancel'), style: 'cancel' },
            { text: tcx('form_retry'), onPress: () => handleCreate() },
          ]
        );
      }
    } finally {
      if (!isSessionClosed(saveSessionToken)) {
        setIsSaving(false);
      }
    }
  };

  // Función para detectar si es imagen
  const isImageFile = (filename: string): boolean => {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'];
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return imageExtensions.includes(ext) || filename.startsWith('file://') && !filename.includes('.pdf');
  };

  // Función para obtener icono según tipo de documento
  const getDocumentIcon = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const iconMap: { [key: string]: string } = {
      pdf: 'file-pdf-box',
      doc: 'file-word-box',
      docx: 'file-word-box',
      xls: 'file-excel-box',
      xlsx: 'file-excel-box',
      ppt: 'file-powerpoint-box',
      pptx: 'file-powerpoint-box',
      txt: 'file-document',
      zip: 'file-zip-box',
      rar: 'file-zip-box',
      '7z': 'file-zip-box',
      mp4: 'file-video',
      mov: 'file-video',
      mp3: 'file-music',
      wav: 'file-music',
    };
    return iconMap[ext] || 'file-document';
  };

  // Mapeo estricto de iconos válidos para MaterialCommunityIcons
  let mappedIconName = '';
  switch (dataType) {
    case 'Email':
      mappedIconName = 'email';
      break;
    case 'Documento':
      mappedIconName = 'file-document';
      break;
    case 'Teléfono':
      mappedIconName = 'phone';
      break;
    case 'Ghost-Link':
      mappedIconName = 'phone-in-talk';
      break;
    case 'Enlaces':
      mappedIconName = 'link';
      break;
    case 'Texto Plain':
      mappedIconName = 'text-box';
      break;
    default:
      mappedIconName = 'file';
  }
  const previewCatalogItem = selectedIcon === 'favicon' ? undefined : galleryItemByStableOrLegacy(selectedIcon);
  const iconData = selectedIcon === 'favicon'
    ? faviconUrl
    : sanitizeMaterialIconName(previewCatalogItem?.icon || mappedIconName);
  const iconName = selectedIcon === 'favicon'
    ? 'Favicon'
    : (previewCatalogItem?.label ?? mappedIconName);
  // Render dynamic field based on data type
  const renderDataField = () => {
    switch (dataType) {
      case 'Enlaces':
        return renderLinkField();
      case 'Ghost-Link':
        return (
          <Text style={[styles.hint, { color: formTheme.textSecondary, marginBottom: 4 }]}>
            {tcx('form_ghost_long_hint')}
          </Text>
        );
      case 'Teléfono': {
        const { min: natMin, max: natMax } = getNationalDigitBounds(countryCode);
        return (
          <View style={styles.phoneRow}>
            <LinearGradient
              colors={formTheme.gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 10, padding: 4 }}
            >
              <TouchableOpacity
                style={[styles.countryCodeButton, { borderWidth: 0, backgroundColor: formTheme.inputBg }]}
                onPress={() => {
                  Keyboard.dismiss();
                  InteractionManager.runAfterInteractions(() => {
                    setCountryModalVisible(true);
                  });
                }}
              >
                <Text style={[styles.countryCodeText, { color: formTheme.inputText }]}>{countryCode}</Text>
                <MaterialCommunityIcons name="chevron-down" color={formTheme.labelGold} size={18} />
              </TouchableOpacity>
            </LinearGradient>
            <LinearGradient
              colors={formTheme.gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 10, padding: 4, flex: 1 }}
            >
              <TextInput
                style={[styles.input, { flex: 1, backgroundColor: formTheme.inputBg, color: formTheme.inputText, borderWidth: 0 }]}
                placeholder={tcx('form_phone_digits_placeholder', { min: natMin, max: natMax })}
                placeholderTextColor={formTheme.inputPlaceholder}
                value={dataValue}
                onChangeText={(t) => setDataValue(sanitizeNationalDigits(t).slice(0, natMax))}
                keyboardType="phone-pad"
                maxLength={natMax}
              />
            </LinearGradient>
          </View>
        );
      }
      case 'Email':
        return (
          <LinearGradient
            colors={formTheme.gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 10, padding: 4 }}
          >
            <TextInput
              style={[styles.input, { backgroundColor: formTheme.inputBg, color: formTheme.inputText, borderWidth: 0 }]}
              placeholder="tu@email.com"
              placeholderTextColor={formTheme.inputPlaceholder}
              value={dataValue}
              onChangeText={setDataValue}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
            />
          </LinearGradient>
        );
      case 'Texto Plain': {
        // La capa espejo y el TextInput deben compartir el mismo fontSize, lineHeight y fontWeight
        // (sin negrita en la primera línea) para que el caret y la selección coincidan con lo visible.
        const lineH = 22;
        const fontBody = 15;
        const hPad = 14;
        const vPad = 12;
        const fieldTypo = {
          fontSize: fontBody,
          lineHeight: lineH,
          fontWeight: '400' as const,
          color: formTheme.inputText,
          ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
        };
        return (
          <View>
            <LinearGradient
              colors={formTheme.gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 10, padding: 4 }}
            >
              <View
                style={{
                  minHeight: 100,
                  backgroundColor: formTheme.inputBg,
                  borderRadius: 6,
                  position: 'relative',
                }}
              >
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    zIndex: 0,
                    paddingHorizontal: hPad,
                    paddingVertical: vPad,
                  }}
                  pointerEvents="box-none"
                >
                  {dataValue ? (
                    <Text style={fieldTypo} selectable>
                      {splitPlainTextByUrls(dataValue).map((part, i) =>
                        part.kind === 'url' ? (
                          <Text
                            key={`u-${i}`}
                            style={[
                              fieldTypo,
                              { color: formTheme.labelGold, textDecorationLine: 'underline' },
                            ]}
                            onPress={() => openDetectedPlainTextUrl(part.s)}
                          >
                            {part.s}
                          </Text>
                        ) : (
                          <Text key={`t-${i}`}>{part.s}</Text>
                        ),
                      )}
                    </Text>
                  ) : null}
                </View>
                <TextInput
                  style={[
                    styles.input,
                    {
                      minHeight: 100,
                      backgroundColor: 'transparent',
                      color: 'transparent',
                      borderWidth: 0,
                      fontSize: fontBody,
                      lineHeight: lineH,
                      fontWeight: '400',
                      zIndex: 1,
                      ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
                    },
                  ]}
                  placeholder={tcx('form_plain_write_here')}
                  placeholderTextColor={formTheme.inputPlaceholder}
                  value={dataValue}
                  onChangeText={(text) => {
                    const words = text.split(/\s+/).filter((w) => w).length;
                    if (words <= 200 || text.length < dataValue.length) setDataValue(text);
                  }}
                  multiline
                  textAlignVertical="top"
                  selectionColor={formTheme.labelGold}
                  scrollEnabled
                />
              </View>
            </LinearGradient>
            <Text style={[styles.wordCount, dataValue.split(/\s+/).filter((w) => w).length > 190 && { color: '#E53935' }]}>
              {dataValue.split(/\s+/).filter((w) => w).length} / 200 {tcx('form_words')}
            </Text>
          </View>
        );
      }
      case 'Documento':
        return (
          <View>
            <LinearGradient
              colors={formTheme.gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 10, padding: 4 }}
            >
              <TouchableOpacity
                style={[styles.documentButton, { borderWidth: 0, backgroundColor: formTheme.inputBg }]}
                onPress={() => {
                  if (pendingAsset?.uri) {
                    setAssetPreviewVisible(true);
                    return;
                  }
                  if (dataValue) {
                    const mime = inferMimeType(dataValue);
                    const name = dataName?.trim() || inferFileName(dataValue);
                    setPendingAsset({
                      uri: dataValue,
                      name,
                      mimeType: mime,
                      source: 'document',
                    });
                    setAssetPreviewVisible(true);
                    return;
                  }
                  handlePickFile();
                }}
              >
              <MaterialCommunityIcons
                name={pendingAsset || dataValue ? 'eye' : 'image-plus'}
                color={formTheme.textPrimary}
                size={32}
              />
              <Text style={[styles.documentText, { color: formTheme.textPrimary }]}>
                {pendingAsset?.uri
                  ? tcx('form_view_sel_file')
                  : dataValue
                  ? tcx('form_view_saved_file')
                  : tcx('form_upload_pdf_or_image')}
              </Text>
              </TouchableOpacity>
            </LinearGradient>
            <Text style={[styles.wordCount, { color: formTheme.textSecondary }]}>{tcx('form_bunker_viewer_hint')}</Text>
            
            {/* PREVIEW del documento/imagen seleccionado */}
            {dataValue && (
              <View style={[styles.previewContainer, { backgroundColor: formTheme.inputBg }]}>
                <Text style={[styles.previewLabel, { color: formTheme.labelGold }]}>
                  {tcx('form_preview')}
                </Text>
                {isImageFile(dataValue) || isImageFile(dataName) ? (
                  <View style={styles.imagePreview}>
                    <Image 
                      source={{ uri: dataValue }} 
                      style={[styles.previewImage, { backgroundColor: formTheme.premiumElevated }]}
                      onError={() => console.log('Error loading image')}
                    />
                    <Text style={[styles.previewFileName, { color: formTheme.textPrimary }]} numberOfLines={1}>
                      {dataName || tcx('form_image_selected')}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.documentPreview}>
                    <MaterialCommunityIcons name={getDocumentIcon(dataValue) as any} color={formTheme.textPrimary} size={48} />
                    <Text style={[styles.previewFileName, { color: formTheme.textPrimary }]} numberOfLines={1}>
                      {dataName || tcx('form_document_selected')}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        );
      default:
        return null;
    }
  };

  return (
        <View style={[styles.container, { backgroundColor: formTheme.motherBg }]}>
        {/* Header with close button */}
        <View style={[styles.headerTop, { borderBottomColor: formTheme.border }]}>
          <View style={styles.modalDragHandleWrap}>
            <View style={styles.modalDragHandle} />
          </View>
          <View style={styles.titleDragZone}>
            <Text style={[styles.titleMain, { color: formTheme.titleColor }]}>
              {editingData?.id ? tcx('form_header_edit') : tcx('form_header_new')}
            </Text>
          </View>
          <TouchableOpacity 
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.closeButton}
          >
            <MaterialCommunityIcons name="close" color="#E9C349" size={28} />
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollView
          key={editingData?.id ? `edit-${editingData.id}` : 'create'}
          style={[styles.scrollView, { backgroundColor: formTheme.motherBg }]}
          contentContainerStyle={[
            styles.scrollContent,
            { flexGrow: 1, backgroundColor: formTheme.motherBg },
          ]}
          bottomOffset={42}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          contentInsetAdjustmentBehavior="automatic"
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >
          {/* TIPO DE DATA */}
          <View style={styles.section}>
            <Text style={[styles.stepLabel, { color: formTheme.labelGold }]}>
              {tcx('form_step_type')} {editingData?.id && tcx('form_readonly')}
            </Text>
            <View style={styles.typeChipGrid}>
              {dataTypeOptions.map((option) => {
                const isActive = dataType === option.key;
                const disabledChip = !!editingData?.id;
                const onSelectType = () => {
                  if (disabledChip) return;
                  if (option.key === GHOST_LINK_VAULT_TYPE) {
                    Alert.alert(tcx('form_ghost_chip_title'), tcx('form_ghost_chip_body'));
                    return;
                  }
                  setDataType(option.key);
                  setDataValue('');
                };
                const iconColor = isActive ? formTheme.onLuxuryCta : formTheme.textPrimary;
                const labelColor = isActive ? formTheme.onLuxuryCta : formTheme.textPrimary;
                return (
                  <View key={option.key} style={[styles.typeChipWrap, { width: typeChipWidth }]}>
                    {isActive ? (
                      <LinearGradient
                        colors={formTheme.chipActiveFillGradient as readonly [string, string, ...string[]]}
                        locations={[0, 0.2, 0.45, 0.55, 0.8, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                          styles.typeChipGradientOuter,
                          Platform.select({
                            ios: {
                              shadowColor: formTheme.selectedPillGlow,
                              shadowOffset: { width: 0, height: 0 },
                              shadowOpacity: 0.5,
                              shadowRadius: 14,
                            },
                            android: { elevation: 10 },
                            default: {},
                          }),
                        ]}
                      >
                        <TouchableOpacity
                          style={[styles.typeChipCellInner, disabledChip && styles.typePillDisabled]}
                          onPress={onSelectType}
                          disabled={disabledChip}
                          activeOpacity={0.88}
                        >
                          <MaterialCommunityIcons name={option.icon} size={18} color={iconColor} />
                          <Text style={[styles.typeChipLabel, { color: labelColor }]} numberOfLines={2}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      </LinearGradient>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.typeChipCellInactive,
                          {
                            backgroundColor: formTheme.chipInactiveBg,
                            borderColor: formTheme.chipInactiveBorder,
                          },
                          disabledChip && styles.typePillDisabled,
                        ]}
                        onPress={onSelectType}
                        disabled={disabledChip}
                        activeOpacity={0.88}
                      >
                        <MaterialCommunityIcons name={option.icon} size={18} color={iconColor} />
                        <Text style={[styles.typeChipLabel, { color: labelColor }]} numberOfLines={2}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
            <Text style={[styles.hint, { color: formTheme.textSecondary }]}>
              {editingData?.id ? tcx('form_type_no_edit_hint') : tcx('form_select_type_hint')}
            </Text>
            {autoTypeSuggestion && !editingData?.id && (
              <TouchableOpacity
                style={[
                  styles.autoTypeBanner,
                  {
                    backgroundColor: isNight ? 'rgba(233,195,73,0.16)' : 'rgba(233,195,73,0.22)',
                    borderWidth: 1,
                    borderColor: 'rgba(233,195,73,0.45)',
                  },
                ]}
                onPress={() => {
                  prevDataTypeRef.current = autoTypeSuggestion;
                  setDataType(autoTypeSuggestion);
                  setAutoTypeSuggestion(null);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="swap-horizontal" color={formTheme.labelGold} size={16} />
                <Text style={[styles.autoTypeBannerText, { color: formTheme.textPrimary }]}>
                  {(() => {
                    const sug =
                      dataTypeOptions.find((o) => o.key === autoTypeSuggestion)?.label ?? String(autoTypeSuggestion);
                    return tcx('form_switch_type', { sug });
                  })()}
                </Text>
                <TouchableOpacity onPress={() => setAutoTypeSuggestion(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="close" color={formTheme.labelGold} size={14} />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          </View>

          {/* CATEGORÍA / CARPETA (Bóveda) */}
          <View style={styles.section}>
            <Text style={[styles.stepLabel, { color: formTheme.labelGold }]}>{tcx('form_cat_section')}</Text>
            <TouchableOpacity
              style={[
                styles.iconLuxuryRow,
                {
                  backgroundColor: formTheme.surfaceBg,
                  borderColor: creatingNewVaultCategory ? `${formTheme.labelGold}AA` : formTheme.chipInactiveBorder,
                },
                Platform.select({
                  ios: {
                    shadowColor: formTheme.labelGold,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: isNight ? 0.14 : 0.1,
                    shadowRadius: isNight ? 14 : 10,
                  },
                  android: { elevation: 4 },
                  default: {},
                }),
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setVaultCategoryModalVisible(true);
              }}
              activeOpacity={0.88}
              accessibilityLabel={tcx('form_pick_folder_a11y')}
              accessibilityHint={vaultCategorySecondaryLabel}
            >
              <LinearGradient
                colors={formTheme.chipActiveFillGradient as readonly [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconLuxuryThumbGradient}
              >
                <View style={[styles.iconLuxuryThumbInner, { backgroundColor: formTheme.iconPreviewCircleBg }]}>
                  <MaterialCommunityIcons
                    name={creatingNewVaultCategory ? 'folder-plus-outline' : 'folder-outline'}
                    color={formTheme.previewIconInCircle}
                    size={28}
                  />
                </View>
              </LinearGradient>
              <View style={styles.iconLuxuryTextCol}>
                <Text style={[styles.iconLuxuryTitle, { color: formTheme.textPrimary }]} numberOfLines={2}>
                  {vaultCategoryPrimaryLabel}
                </Text>
                <Text style={[styles.iconLuxurySubtitle, { color: formTheme.textSecondary }]} numberOfLines={2}>
                  {vaultCategorySecondaryLabel}
                </Text>
              </View>
              <Text style={[styles.iconLuxuryCta, { color: formTheme.labelGold }]}>{tcx('form_change')}</Text>
            </TouchableOpacity>

            {creatingNewVaultCategory ? (
              <LinearGradient
                colors={formTheme.gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.vaultCategoryNewField, { padding: 4, marginTop: 12 }]}
              >
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: formTheme.inputBg, color: formTheme.inputText, borderWidth: 0 },
                  ]}
                  placeholder={tcx('form_new_folder_ph')}
                  placeholderTextColor={formTheme.inputPlaceholder}
                  value={newVaultCategoryDraft}
                  onChangeText={setNewVaultCategoryDraft}
                  maxLength={64}
                  editable={!isSaving}
                  accessibilityLabel={tcx('form_new_cat_a11y')}
                />
              </LinearGradient>
            ) : null}
          </View>

          {/* NOMBRE DE DATA */}
          <View style={styles.section}>
            <Text style={[styles.stepLabel, { color: formTheme.labelGold }]}>{tcx('form_data_name_section')}</Text>
              <LinearGradient
                colors={formTheme.gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: 10, padding: 4 }}
              >
                <TextInput
                  style={[styles.input, { backgroundColor: formTheme.inputBg, color: formTheme.inputText, borderWidth: 0 }]}
              placeholder={tcx('form_data_name_ex_ph')}
              placeholderTextColor={formTheme.inputPlaceholder}
              value={dataName}
              onChangeText={setDataName}
                />
              </LinearGradient>
          </View>

          {/* DATA */}
          <View style={styles.section}>
            <Text style={[styles.stepLabel, { color: formTheme.labelGold }]}>
              {dataType === GHOST_LINK_VAULT_TYPE ? tcx('form_ghost_data_header') : tcx('form_data_section')}
            </Text>
            {renderDataField()}
          </View>

          <View style={styles.section}>
            <Text style={[styles.stepLabel, { color: formTheme.labelGold, marginBottom: 10 }]}>{tcx('form_icon_section')}</Text>
            <TouchableOpacity
              style={[
                styles.iconLuxuryRow,
                {
                  backgroundColor: formTheme.surfaceBg,
                  borderColor: formTheme.chipInactiveBorder,
                },
                Platform.select({
                  ios: {
                    shadowColor: formTheme.labelGold,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: isNight ? 0.12 : 0.08,
                    shadowRadius: 10,
                  },
                  android: { elevation: 3 },
                  default: {},
                }),
              ]}
              onPress={() => setIconModalVisible(true)}
              activeOpacity={0.88}
              accessibilityLabel={tcx('form_pick_icon_a11y')}
            >
              {faviconLoading && dataType === 'Enlaces' ? (
                <View style={styles.iconLuxuryThumb}>
                  <View style={styles.spinnerPriorityLayer}>
                    <BrandedSpinner size={40} color="#E9C349" />
                  </View>
                </View>
              ) : selectedIcon === 'favicon' && faviconUrl ? (
                <LinearGradient
                  colors={formTheme.chipActiveFillGradient as readonly [string, string, ...string[]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconLuxuryThumbGradient}
                >
                  <View style={[styles.iconLuxuryThumbInner, { backgroundColor: formTheme.iconPreviewCircleBg }]}>
                    <Image source={{ uri: faviconUrl }} style={styles.iconLuxuryFavicon} />
                  </View>
                </LinearGradient>
              ) : selectedIcon ? (
                <LinearGradient
                  colors={formTheme.chipActiveFillGradient as readonly [string, string, ...string[]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconLuxuryThumbGradient}
                >
                  <View style={[styles.iconLuxuryThumbInner, { backgroundColor: formTheme.iconPreviewCircleBg }]}>
                    <MaterialCommunityIcons
                      name={sanitizeMaterialIconName(previewCatalogItem?.icon || mappedIconName) as any}
                      color={formTheme.previewIconInCircle}
                      size={28}
                    />
                  </View>
                </LinearGradient>
              ) : (
                <View style={[styles.iconLuxuryThumb, { backgroundColor: formTheme.chipInactiveBg }]}>
                  <MaterialCommunityIcons name="image-plus" color={formTheme.accentMuted} size={28} />
                </View>
              )}
              <View style={styles.iconLuxuryTextCol}>
                <Text style={[styles.iconLuxuryTitle, { color: formTheme.textPrimary }]}>{tcx('form_icon_title')}</Text>
                <Text style={[styles.iconLuxurySubtitle, { color: formTheme.textSecondary }]}>
                  {tcx('form_icon_sub')}
                </Text>
                {faviconLoading && dataType === 'Enlaces' ? (
                  <Text style={[styles.iconLuxurySubtitle, { color: formTheme.labelGold, marginTop: 4 }]}>
                    {tcx('form_favicon_search_alt')}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.iconLuxuryCta, { color: formTheme.labelGold }]}>{tcx('form_change')}</Text>
            </TouchableOpacity>
          </View>

          {/* CREATE/UPDATE BUTTON */}
          <TouchableOpacity
            style={[styles.createButtonOuter, isSaving && styles.createButtonDisabled]}
            onPress={handleCreate}
            disabled={isSaving}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={formTheme.ctaGradient as readonly [string, string, ...string[]]}
              locations={[0, 0.18, 0.45, 0.52, 0.75, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.createButtonGradient}
            >
              {isSaving ? (
                <Text style={[styles.createButtonText, { color: formTheme.onLuxuryCta }]}>
                  {tcx('form_saving_btn')}
                </Text>
              ) : (
                <>
                  <MaterialCommunityIcons name="check-circle" color={formTheme.onLuxuryCta} size={24} />
                  <Text style={[styles.createButtonText, { color: formTheme.onLuxuryCta }]}>
                    {editingData?.id ? tcx('form_update_btn') : tcx('form_create_btn')}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <View style={styles.saveButtonSpacer} />
        </KeyboardAwareScrollView>

        {/* MODAL: TYPE SELECTOR */}
        <Modal
          visible={typeModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setTypeModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: formTheme.surfaceBg, borderTopColor: formTheme.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: formTheme.textPrimary }]}>{tcx('form_modal_select_type')}</Text>
                <TouchableOpacity onPress={() => setTypeModalVisible(false)}>
                  <MaterialCommunityIcons name="close" color={formTheme.labelGold} size={24} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={
                  (editingData?.id
                    ? (['Enlaces', 'Email', 'Teléfono', 'Texto Plain', 'Documento', 'Ghost-Link'] as DataType[])
                    : (['Enlaces', 'Email', 'Teléfono', 'Texto Plain', 'Documento', 'Ghost-Link'] as DataType[]))
                }
                keyExtractor={(item) => item}
                removeClippedSubviews={true}
                scrollEventThrottle={16}
                bounces={false}
                overScrollMode="never"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      dataType === item && styles.modalItemActive,
                      dataType === item && {
                        backgroundColor: formTheme.selectedPillBg,
                        shadowColor: formTheme.selectedPillGlow,
                        shadowOpacity: 0.2,
                        shadowRadius: 6,
                        elevation: 3,
                      },
                    ]}
                    onPress={() => {
                      if (!editingData?.id && item === GHOST_LINK_VAULT_TYPE) {
                        Alert.alert(tcx('form_ghost_chip_title'), tcx('form_ghost_chip_body'));
                        setTypeModalVisible(false);
                        return;
                      }
                      setDataType(item);
                      setDataValue(item === GHOST_LINK_VAULT_TYPE ? GHOST_LINK_VAULT_VALUE : '');
                      setTypeModalVisible(false);
                    }}
                    disabled={!!editingData?.id}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        dataType === item && styles.modalItemTextActive,
                        dataType === item && { color: formTheme.selectedPillText },
                      ]}
                    >
                      {dataTypeOptions.find((o) => o.key === item)?.label ?? item}
                    </Text>
                    {dataType === item && (
                      <MaterialCommunityIcons name="check" color={formTheme.selectedPillText} size={20} />
                    )}
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

        <Modal
          visible={vaultCategoryModalVisible}
          transparent
          animationType="slide"
          presentationStyle="overFullScreen"
          statusBarTranslucent
          hardwareAccelerated
          onRequestClose={() => setVaultCategoryModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setVaultCategoryModalVisible(false)}>
              <View style={StyleSheet.absoluteFillObject} accessibilityRole="button" />
            </TouchableWithoutFeedback>
            <View
              style={[styles.modalContent, { backgroundColor: formTheme.surfaceBg, borderTopColor: formTheme.border }]}
            >
                <View style={styles.bottomSheetDragHandleWrap}>
                  <View style={[styles.bottomSheetDragHandle, { backgroundColor: formTheme.chipInactiveBorder }]} />
                </View>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: formTheme.textPrimary }]}>
                    {tcx('form_modal_pick_folder')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setVaultCategoryModalVisible(false)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialCommunityIcons name="close" color={formTheme.labelGold} size={24} />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={[...vaultCategoriesResolved, VAULT_CATEGORY_CREATE_NEW]}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  keyExtractor={(row) =>
                    row === VAULT_CATEGORY_CREATE_NEW ? '__create__' : String(row).toLowerCase().replace(/\s+/g, '-')
                  }
                  removeClippedSubviews={true}
                  scrollEventThrottle={16}
                  bounces={false}
                  overScrollMode="never"
                  contentContainerStyle={{ paddingBottom: 22 }}
                  renderItem={({ item }) => {
                    const isRowCreate = item === VAULT_CATEGORY_CREATE_NEW;
                    const label = isRowCreate
                      ? tcx('form_create_folder_row')
                      : vaultCategorySectionTitle(item, language);
                    const canonSelected =
                      !creatingNewVaultCategory &&
                      selectedVaultCategoryCanon.trim().toLowerCase() === String(item).trim().toLowerCase();
                    const isActive = canonSelected || (isRowCreate && creatingNewVaultCategory);

                    return (
                      <TouchableOpacity
                        style={[
                          styles.modalItem,
                          isActive && styles.modalItemActive,
                          isActive && {
                            backgroundColor: formTheme.selectedPillBg,
                            shadowColor: formTheme.selectedPillGlow,
                            shadowOpacity: 0.2,
                            shadowRadius: 6,
                            elevation: 3,
                          },
                          {
                            overflow: 'hidden',
                            flexDirection: 'row',
                            alignItems: 'center',
                          },
                          isRowCreate && { position: 'relative' },
                          isRowCreate && {
                            borderWidth: StyleSheet.hairlineWidth + 1,
                            borderStyle: Platform.OS === 'ios' ? 'dashed' : 'solid',
                            borderColor: 'rgba(233,195,73,0.55)',
                          },
                          isRowCreate && !isActive ? { opacity: Platform.OS === 'android' ? 0.92 : 1 } : undefined,
                        ]}
                        activeOpacity={0.88}
                        onPress={() => {
                          Haptics.selectionAsync();
                          if (item === VAULT_CATEGORY_CREATE_NEW) {
                            setCreatingNewVaultCategory(true);
                            setSelectedVaultCategoryCanon('');
                            setVaultCategoryModalVisible(false);
                          } else {
                            setCreatingNewVaultCategory(false);
                            setNewVaultCategoryDraft('');
                            setSelectedVaultCategoryCanon(item);
                            setVaultCategoryModalVisible(false);
                          }
                        }}
                      >
                        {!isRowCreate ? null : (
                          <LinearGradient
                            colors={['rgba(233,195,73,0.18)', formTheme.surfaceBg]}
                            style={[
                              StyleSheet.absoluteFillObject,
                              { borderRadius: 12, opacity: isActive ? 1 : 0.55 },
                            ]}
                          />
                        )}
                        {isRowCreate ? (
                          <MaterialCommunityIcons
                            name="plus-circle-outline"
                            color={formTheme.labelGold}
                            size={22}
                            style={{ marginRight: 4 }}
                          />
                        ) : null}
                        <Text
                          style={[
                            styles.modalItemText,
                            isActive ? styles.modalItemTextActive : null,
                            isActive ? { color: formTheme.selectedPillText } : { color: formTheme.textPrimary },
                            isRowCreate && { fontWeight: '800', flex: 1 },
                            !isRowCreate && { flex: 1 },
                          ]}
                          numberOfLines={2}
                        >
                          {label}
                        </Text>
                        {isActive ? (
                          <MaterialCommunityIcons name="check" color={formTheme.selectedPillText} size={20} />
                        ) : null}
                      </TouchableOpacity>
                    );
                  }}
                />
            </View>
          </View>
        </Modal>

        <Modal
          visible={faviconSuggestionVisible}
          transparent
          animationType="fade"
          onRequestClose={() => closeFaviconSuggestion()}
        >
          <TouchableWithoutFeedback onPress={() => closeFaviconSuggestion()}>
            <View style={styles.faviconPopupOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.faviconPopupCard}>
                  <Text style={styles.faviconPopupTitle}>{tcx('form_favicon_modal_title')}</Text>
                  <View style={styles.faviconPopupPreviewBox}>
                    {faviconLoading ? (
                      <BrandedSpinner size={44} color="#E9C349" />
                    ) : faviconUrl ? (
                      <Image source={{ uri: faviconUrl }} style={styles.faviconPopupImage} />
                    ) : (
                      <MaterialCommunityIcons name="web" color="#0A2540" size={36} />
                    )}
                  </View>
                  <View style={styles.faviconPopupActions}>
                    <TouchableOpacity
                      style={[styles.faviconPopupButton, styles.faviconConfirmButton]}
                      onPress={() => {
                        setSelectedIcon('favicon');
                        closeFaviconSuggestion();
                      }}
                    >
                      <Text style={styles.faviconConfirmButtonText}>{tcx('form_favicon_yes')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.faviconPopupButton, styles.faviconCancelButton, styles.faviconPopupButtonSpacing]}
                      onPress={() => {
                        closeFaviconSuggestion();
                      }}
                    >
                      <Text style={styles.faviconCancelButtonText}>{tcx('form_favicon_no')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <CountryDialPickerModal
          visible={countryModalVisible}
          onClose={() => setCountryModalVisible(false)}
          onSelect={(entry) => {
            setCountryCode(entry.code);
            setDataValue((prev) => sanitizeNationalDigits(prev).slice(0, entry.maxDigits));
          }}
          title={tcx('form_country_title')}
          topSectionTitle={tcx('form_country_top')}
          restSectionTitle={tcx('form_country_all')}
          searchPlaceholder={tcx('form_country_search_ph')}
          surfaceBg={formTheme.surfaceBg}
          textPrimary={formTheme.textPrimary}
          textSecondary={formTheme.textSecondary}
          border={formTheme.border}
          inputBg={formTheme.inputBg}
        />

        {/* MODAL: ICON GALLERY — CardStudioVault */}
        <CardStudioVault
          visible={iconModalVisible}
          onClose={() => setIconModalVisible(false)}
          onSelectIcon={setSelectedIcon}
          dataType={dataType}
          selectedIcon={selectedIcon}
          ownedIconVaultKeys={ownedIconVaultKeys}
          creditsBalance={creditsBalance}
          onEconomyUpdated={() => void refreshStudioEconomy()}
        />

        {/* MODAL: ELEGIR FOTOS O DOCUMENTOS */}
        <Modal
          visible={fileTypeModalVisible}
          transparent
          animationType="slide"
          presentationStyle="overFullScreen"
          statusBarTranslucent
          hardwareAccelerated
          onDismiss={() => {
            if (fileTypeModalDismissResolverRef.current) {
              logPickerTrace('PICKER_SHEET_MODAL_ON_DISMISS');
              fileTypeModalDismissResolverRef.current('modal_on_dismiss');
            }
          }}
          onRequestClose={closeFileTypeModal}
        >
          <TouchableWithoutFeedback onPress={closeFileTypeModal}>
            <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.modalContent, { backgroundColor: formTheme.surfaceBg, borderTopColor: formTheme.border }]}>
              <View style={styles.bottomSheetDragHandleWrap}>
                <View style={styles.bottomSheetDragHandle} />
              </View>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: formTheme.textPrimary }]}>{tcx('form_secure_upload_header')}</Text>
                <TouchableOpacity onPress={closeFileTypeModal}>
                  <MaterialCommunityIcons name="close" color={formTheme.textPrimary} size={24} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.fileTypeScroll}
                contentContainerStyle={styles.fileTypeScrollContent}
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
              >
              <TouchableOpacity
                style={[styles.fileTypeOption, { backgroundColor: formTheme.inputBg, borderColor: formTheme.border }]}
                onPress={handleTakePhoto}
                disabled={isCompressing || isPicking}
              >
                <MaterialCommunityIcons name="camera" color={formTheme.textPrimary} size={30} />
                <Text style={[styles.fileTypeText, { color: formTheme.textPrimary }]}>{tcx('form_take_photo_cap')}</Text>
                <Text style={[styles.fileTypeSubText, { color: formTheme.textSecondary }]}>{tcx('form_take_photo_sub')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.fileTypeOption, { backgroundColor: formTheme.inputBg, borderColor: formTheme.border }]}
                onPress={handlePickPhotos}
                disabled={isCompressing || isPicking}
              >
                <MaterialCommunityIcons name="image-multiple" color={formTheme.textPrimary} size={30} />
                <Text style={[styles.fileTypeText, { color: formTheme.textPrimary }]}>{tcx('form_ios_pick_image')}</Text>
                <Text style={[styles.fileTypeSubText, { color: formTheme.textSecondary }]}>JPG, PNG {tcx('form_or_conjunction')} HEIC</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.fileTypeOption, { backgroundColor: formTheme.inputBg, borderColor: formTheme.border }]}
                onPress={handlePickDocument}
                disabled={isCompressing || isPicking}
              >
                <MaterialCommunityIcons name="file-document-outline" color={formTheme.textPrimary} size={30} />
                <Text style={[styles.fileTypeText, { color: formTheme.textPrimary }]}>{tcx('form_ios_pick_document')}</Text>
                <Text style={[styles.fileTypeSubText, { color: formTheme.textSecondary }]}>{tcx('form_pick_doc_sub')}</Text>
              </TouchableOpacity>
              </ScrollView>
            </View>
            </TouchableWithoutFeedback>
          </View>
          </TouchableWithoutFeedback>
        </Modal>

        {(isCompressing || isSaving || isUploading || uploadModalVisible) && (
          <View style={styles.compressOverlay} pointerEvents="auto">
            <View
              style={[
                styles.compressCard,
                {
                  backgroundColor: formTheme.premiumElevated,
                  borderColor: formTheme.border,
                },
              ]}
            >
              <BrandedSpinner size={56} color="#E9C349" />
              <Text style={[styles.compressText, { color: formTheme.textPrimary }]}>
                {isCompressing
                  ? tcx('form_overlay_optimize')
                  : isUploading
                    ? tcx('form_overlay_upload')
                    : tcx('form_overlay_save')}
              </Text>
              {!isSaving && (
                <TouchableOpacity
                  style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(233,195,73,0.2)' }}
                  onPress={() => {
                    setIsCompressing(false);
                    setIsUploading(false);
                    setUploadModalVisible(false);
                  }}
                >
                  <Text style={{ color: '#E9C349', fontWeight: '700', fontSize: 14 }}>{tcx('form_cancel')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <FilePreviewModal
          visible={assetPreviewVisible}
          asset={pendingAsset}
          onAccept={confirmAssetPreview}
          onChooseAgain={retryAssetSelection}
          onClose={() => {
            setAssetPreviewVisible(false);
            setPendingAsset(null);
          }}
        />

        <LuxuryModerationModal
          visible={moderationAlertVisible}
          title={tcx('form_security_modal_title')}
          message={moderationAlertMessage}
          onClose={() => setModerationAlertVisible(false)}
          onRetry={() => setModerationAlertVisible(false)}
          retryLocked={isRetryLocked}
          retryCountdownSec={retryCountdownSec}
          lockMessage={retryLockMessage}
        />
      </View>
  );
};

/** Fallback en `StyleSheet` (el tema real va en `formTheme` en runtime). */
const PREMIUM_PANEL = premiumTheme.light.surfaceElevated;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0D3A56',
  },
  modalDragHandleWrap: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  modalDragHandle: {
    width: 56,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(233,195,73,0.55)',
  },
  closeButton: {
    padding: 8,
    borderRadius: 8,
    marginTop: 20,
  },
  titleMain: {
    fontSize: 24,
    fontWeight: '700',
    color: '#E9C349',
    marginTop: 20,
  },
  titleDragZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
    flexGrow: 1,
  },
  saveButtonSpacer: {
    height: 28,
  },
  section: {
    marginBottom: 28,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#002D4B',
    marginBottom: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  typePillsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  autoTypeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  autoTypeBannerText: {
    color: '#F0F4F8',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  typePill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 4,
    borderColor: '#E9C349',
    backgroundColor: PREMIUM_PANEL,
  },
  typePillActive: {
    backgroundColor: PREMIUM_PANEL,
  },
  typePillDisabled: {
    opacity: 0.55,
  },
  typePillText: {
    color: '#002D4B',
    fontSize: 13,
    fontWeight: '700',
  },
  typePillTextActive: {
    color: '#F0F4F8',
    fontWeight: '700',
  },
  typeChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 8,
  },
  typeChipWrap: {
    marginBottom: 0,
  },
  typeChipGradientOuter: {
    borderRadius: 14,
    padding: 2,
    overflow: 'hidden',
  },
  typeChipCellInner: {
    minHeight: 64,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
    gap: 4,
    backgroundColor: 'transparent',
  },
  typeChipCellInactive: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
    gap: 4,
  },
  typeChipLabel: {
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.15,
    lineHeight: 12,
  },
  linkPreviewLuxOuter: {
    marginTop: 14,
    borderRadius: 18,
    padding: 2,
    overflow: 'hidden',
  },
  linkPreviewInner: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  linkPreviewSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  linkPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linkPreviewIconFrame: {
    width: 52,
    height: 52,
    borderRadius: 14,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkPreviewIconInner: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  linkPreviewFavicon: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  linkPreviewTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  linkPreviewTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  linkPreviewUrl: {
    fontSize: 12,
    fontWeight: '600',
  },
  iconLuxuryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  iconLuxuryThumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconLuxuryThumbGradient: {
    width: 52,
    height: 52,
    borderRadius: 14,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLuxuryThumbInner: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconLuxuryFavicon: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  iconLuxuryTextCol: {
    flex: 1,
    minWidth: 0,
  },
  iconLuxuryTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  iconLuxurySubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  iconLuxuryCta: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  vaultCategoryNewField: {
    alignSelf: 'stretch',
    borderRadius: 12,
    overflow: 'hidden',
  },
  dropdownButton: {
    backgroundColor: PREMIUM_PANEL,
    borderColor: '#E9C349',
    borderWidth: 4,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownDisabled: {
    backgroundColor: '#0D2E40',
    borderColor: '#666',
    opacity: 0.6,
  },
  dropdownText: {
    color: '#002D4B',
    fontSize: 18,
    fontWeight: '700',
  },
  hint: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: PREMIUM_PANEL,
    borderColor: '#E9C349',
    borderWidth: 4,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#002D4B',
    fontSize: 15,
    minHeight: 48,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 10,
  },
  countryCodeButton: {
    backgroundColor: PREMIUM_PANEL,
    borderColor: '#E9C349',
    borderWidth: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countryCodeText: {
    color: '#002D4B',
    fontSize: 14,
    fontWeight: '600',
  },
  faviconContainer: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  faviconLoadingContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: PREMIUM_PANEL,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: '#E9C349',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  faviconImg: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  faviconLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  useFaviconButton: {
    backgroundColor: PREMIUM_PANEL,
    borderColor: '#E9C349',
    borderWidth: 4,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  useFaviconButtonActive: {
    backgroundColor: '#1EA7FF',
    borderColor: '#1EA7FF',
  },
  useFaviconText: {
    color: '#1EA7FF',
    fontSize: 14,
    fontWeight: '600',
  },
  useFaviconTextActive: {
    color: '#0A2540',
    fontWeight: '700',
  },
  wordCount: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
  },
  documentButton: {
    backgroundColor: PREMIUM_PANEL,
    borderColor: '#E9C349',
    borderWidth: 4,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  documentText: {
    color: '#002D4B',
    fontSize: 14,
    fontWeight: '600',
  },
  previewContainer: {
    marginTop: 16,
    padding: 14,
    backgroundColor: PREMIUM_PANEL,
    borderRadius: 10,
    borderColor: '#E9C349',
    borderWidth: 4,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#002D4B',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  imagePreview: {
    alignItems: 'center',
    gap: 8,
  },
  previewImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  documentPreview: {
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  previewFileName: {
    color: '#002D4B',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 200,
  },
  iconPreview: {
    backgroundColor: PREMIUM_PANEL,
    borderRadius: 24,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 12,
  },
  iconPreviewCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPreviewCircleGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPreviewCircleInner: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLoadingPreview: {
    width: 96,
    height: 96,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E9C349',
    backgroundColor: 'rgba(84,193,251,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerPriorityLayer: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1200,
    elevation: 14,
  },
  iconName: {
    color: '#002D4B',
    fontSize: 13,
    fontWeight: '600',
  },
  faviconPromptCard: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9C349',
    backgroundColor: 'rgba(233,195,73,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  faviconPromptTitle: {
    color: '#0A2540',
    fontSize: 13,
    fontWeight: '700',
  },
  faviconPromptSubtitle: {
    color: '#1E567B',
    fontSize: 12,
    fontWeight: '600',
  },
  faviconPromptLoading: {
    paddingVertical: 14,
    alignItems: 'center',
    gap: 10,
  },
  faviconPromptLoadingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  faviconPromptActions: {
    flexDirection: 'row',
    gap: 8,
  },
  faviconPromptBtn: {
    flex: 1,
    borderRadius: 999,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  faviconPromptPrimaryBtn: {
    backgroundColor: '#E9C349',
  },
  faviconPromptGhostBtn: {
    backgroundColor: '#E9EEF2',
    borderWidth: 1,
    borderColor: '#CFE6F8',
  },
  faviconPromptPrimaryBtnText: {
    color: '#0A1A2F',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  faviconPromptGhostBtnText: {
    color: '#0A2540',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  editIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1EA7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonOuter: {
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
  },
  createButtonGradient: {
    paddingVertical: 16,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: '#0A1A2F',
    fontSize: 16,
    fontWeight: '700',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  faviconPopupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 2200,
    elevation: 22,
  },
  faviconPopupCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    alignItems: 'center',
  },
  faviconPopupTitle: {
    color: '#0A2540',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 14,
  },
  faviconPopupImage: {
    width: 72,
    height: 72,
    borderRadius: 14,
  },
  faviconPopupPreviewBox: {
    width: 96,
    height: 96,
    borderRadius: 18,
    backgroundColor: '#F5F9FC',
    borderWidth: 1,
    borderColor: '#CFE6F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    zIndex: 1,
  },
  faviconPopupActions: {
    width: '100%',
    flexDirection: 'column',
    marginTop: 2,
    zIndex: 2,
  },
  faviconPopupButton: {
    width: '100%',
    borderRadius: 999,
    paddingVertical: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faviconPopupButtonSpacing: {
    marginTop: 10,
  },
  faviconConfirmButton: {
    backgroundColor: '#E9C349',
  },
  faviconCancelButton: {
    backgroundColor: '#E9EEF2',
  },
  faviconConfirmButtonText: {
    color: '#0A1A2F',
    fontSize: 12,
    fontWeight: '800',
  },
  faviconCancelButtonText: {
    color: '#0A2540',
    fontSize: 12,
    fontWeight: '700',
  },
  modalContent: {
    backgroundColor: PREMIUM_PANEL,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.65,
    borderTopWidth: 3,
    borderTopColor: '#E9C349',
  },
  bottomSheetDragHandleWrap: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 10,
  },
  bottomSheetDragHandle: {
    width: 52,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(233,195,73,0.55)',
  },
  iconModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(233,195,73,0.3)',
  },
  iconModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E9C349',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0D3A56',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#002D4B',
  },
  modalItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#0D3A56',
  },
  modalItemActive: {
    backgroundColor: '#0D3A56',
  },
  modalItemText: {
    color: '#002D4B',
    fontSize: 15,
    fontWeight: '500',
  },
  modalItemTextActive: {
    color: '#1EA7FF',
    fontWeight: '700',
  },
  iconGrid: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  iconItem: {
    width: 64,
    height: 64,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 4,
    borderRadius: 10,
    backgroundColor: PREMIUM_PANEL,
    borderWidth: 0.5,
    borderColor: '#E9C349',
  },
  iconItemSelected: {
    backgroundColor: PREMIUM_PANEL,
    borderColor: premiumTheme.light.border,
  },
  iconLabel: {
    fontSize: 9,
    color: '#002D4B',
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  iconLabelSelected: {
    color: '#0A1A2F',
    fontWeight: '700',
  },
  fileTypeOption: {
    backgroundColor: '#0D3A56',
    borderColor: '#F1F1F1',
    borderWidth: 1.2,
    borderRadius: 12,
    minHeight: 104,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  fileTypeText: {
    color: '#002D4B',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
  },
  fileTypeSubText: {
    color: '#002D4B',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  fileTypeScroll: {
    maxHeight: SCREEN_HEIGHT * 0.5,
  },
  fileTypeScrollContent: {
    paddingBottom: 16,
  },
  compressOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  compressCard: {
    width: '100%',
    maxWidth: 340,
    minHeight: 150,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E9C349',
    backgroundColor: PREMIUM_PANEL,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 12,
  },
  compressText: {
    color: '#002D4B',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  assetPreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  assetPreviewCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    backgroundColor: PREMIUM_PANEL,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E9C349',
    padding: 14,
  },
  assetPreviewTitle: {
    color: '#002D4B',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  assetPreviewContent: {
    flex: 1,
    minHeight: 360,
    maxHeight: SCREEN_HEIGHT * 0.6,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#091526',
    borderWidth: 1,
    borderColor: 'rgba(241,241,241,0.25)',
  },
  assetPreviewImage: {
    width: '100%',
    height: '100%',
  },
  assetPreviewPdf: {
    width: '100%',
    height: '100%',
    backgroundColor: '#091526',
  },
  assetPreviewFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  assetPreviewFallbackText: {
    color: '#002D4B',
    fontSize: 13,
    fontWeight: '600',
  },
  assetPreviewActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  assetConfirmButton: {
    flex: 1,
    backgroundColor: '#E9C349',
    borderRadius: 999,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  assetRetryButton: {
    flex: 1,
    backgroundColor: '#1E2F44',
    borderWidth: 1,
    borderColor: '#F1F1F1',
    borderRadius: 999,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  assetConfirmButtonText: {
    color: '#0A1A2F',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  assetRetryButtonText: {
    color: '#002D4B',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  // Progress Upload Styles
  progressOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    backgroundColor: PREMIUM_PANEL,
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: premiumTheme.light.accent,
  },
  uploadPercentage: {
    color: premiumTheme.light.accent,
    fontSize: 32,
    fontWeight: '700',
    marginTop: 20,
  },
  uploadLabel: {
    color: '#002D4B',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
});

export default NewInfoForm;

