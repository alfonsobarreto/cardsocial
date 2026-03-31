import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
// import { PDFDocument } from 'pdf-lib'; // [SILENCIADO POR ERROR DE DEPENDENCIA]
import BrandedSpinner from '@/components/BrandedSpinner';
import { getActiveUserId } from '@/services/authSession';
import { hardLockCheck } from '@/services/biometricAuth';
import { fetchFaviconFromAzure } from '@/services/faviconApi';
import { db } from '@/services/firebaseConfig';
import { useLanguage } from '@/services/language';
import { useLookMode } from '@/services/lookMode';
import { ModerationRejectedError, uploadFileWithModeration } from '@/services/moderationApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import * as Haptics from 'expo-haptics';
import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import Toast from 'react-native-toast-message';
import CardStudioVault, { ICON_GALLERY } from './CardStudioVault';
import FilePreviewModal from './FilePreviewModal';
import { sanitizeMaterialIconName } from './iconNameValidation';
import LuxuryModerationModal from './LuxuryModerationModal';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const VAULT_STORAGE_KEY = 'vault_data';
const DEFAULT_ICON_ID = ICON_GALLERY[0]?.id ?? '1';
const LINK_FALLBACK_ICON_ID =
  ICON_GALLERY.find((icon) => icon.icon === 'link-variant')?.id ?? DEFAULT_ICON_ID;
const CLOUD_SYNC_TIMEOUT_MS = 8000;

type DataType = 'Enlaces' | 'Teléfono' | 'Email' | 'Texto Plain' | 'Documento';

const DATA_TYPE_OPTIONS: Array<{ key: DataType; label: string; labelEn: string }> = [
  { key: 'Enlaces', label: 'Enlace', labelEn: 'Link' },
  { key: 'Email', label: 'Email', labelEn: 'Email' },
  { key: 'Teléfono', label: 'Teléfono', labelEn: 'Phone' },
  { key: 'Texto Plain', label: 'Texto', labelEn: 'Text' },
  { key: 'Documento', label: 'Documento', labelEn: 'Document' },
];

interface Link {
  id: string;
  title: string;
  type: string;
  value: string;
  iconName: string;
  icon?: string;
  isFavorite: boolean;
  createdAt?: string;
  updatedAt?: string;
}

let PdfComponent: any = null;
try {
  PdfComponent = require('react-native-pdf').default;
} catch {
  PdfComponent = null;
}

// ICON_GALLERY viene de CardStudioVault — única fuente de verdad

const COUNTRY_CODES = [
  { code: '+1', country: 'USA / Canadá' },
  { code: '+34', country: 'España' },
  { code: '+52', country: 'México' },
  { code: '+44', country: 'UK' },
  { code: '+33', country: 'Francia' },
  { code: '+49', country: 'Alemania' },
  { code: '+55', country: 'Brasil' },
  { code: '+39', country: 'Italia' },
  { code: '+61', country: 'Australia' },
  { code: '+81', country: 'Japón' },
  { code: '+57', country: 'Colombia' },
  { code: '+54', country: 'Argentina' },
  { code: '+56', country: 'Chile' },
  { code: '+51', country: 'Perú' },
  { code: '+58', country: 'Venezuela' },
  { code: '+593', country: 'Ecuador' },
  { code: '+591', country: 'Bolivia' },
  { code: '+595', country: 'Paraguay' },
  { code: '+598', country: 'Uruguay' },
  { code: '+506', country: 'Costa Rica' },
  { code: '+503', country: 'El Salvador' },
  { code: '+502', country: 'Guatemala' },
  { code: '+507', country: 'Panamá' },
  { code: '+1-809', country: 'Rep. Dominicana' },
  { code: '+91', country: 'India' },
  { code: '+86', country: 'China' },
  { code: '+82', country: 'Corea del Sur' },
  { code: '+7', country: 'Rusia' },
  { code: '+90', country: 'Turquía' },
  { code: '+966', country: 'Arabia Saudita' },
  { code: '+971', country: 'Emiratos Árabes' },
  { code: '+234', country: 'Nigeria' },
  { code: '+27', country: 'Sudáfrica' },
  { code: '+63', country: 'Filipinas' },
  { code: '+66', country: 'Tailandia' },
];

// Tamaño máximo de archivos (en bytes)
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024; // 20 MB

const NewInfoForm = ({ onClose, editingData }: { onClose?: () => void; editingData?: Link }) => {
  const { resolvedMode } = useLookMode();
  const { language } = useLanguage();
  const tr = (es: string, en: string) => language === 'en' ? en : es;
  const isNight = resolvedMode === 'noche';
  const formTheme = {
    motherBg: isNight ? '#0A2540' : '#E3F2FD',
    surfaceBg: isNight ? '#0A2540' : '#E3F2FD',
    border: isNight ? '#D4AF37' : '#D4AF37',
    textPrimary: isNight ? '#F0F4F8' : '#002D4B',
    textSecondary: isNight ? '#B8D9F0' : '#7A8A97',
    inputBg: isNight ? '#0D2E40' : '#E3F2FD',
    inputText: isNight ? '#F0F4F8' : '#002D4B',
    inputPlaceholder: isNight ? '#87A9C2' : '#666666',
    selectedPillBg: isNight ? '#1C5BB9' : '#54C1FB',
    selectedPillText: '#F0F4F8',
    selectedPillGlow: isNight ? '#1C5BB9' : '#54C1FB',
    selectedBgInput: isNight ? '#1C5BB9' : '#54C1FB',
    iconPreviewCircleBg: isNight ? '#0B2234' : '#F0F4F8',
    iconPreviewCircleBorder: isNight ? '#C5A065' : '#CFE6F8',
    gradientColors: (isNight ? ['#E8C547', '#C5A065', '#D4AF37'] : ['#00BFD9', '#00A0C6', '#0099CC']) as readonly [string, string, ...string[]],
  };
  const [dataType, setDataType] = useState<DataType>('Enlaces');
  const [dataName, setDataName] = useState('');
  const [dataValue, setDataValue] = useState('');
  const [selectedIcon, setSelectedIcon] = useState(DEFAULT_ICON_ID);
  const [countryCode, setCountryCode] = useState('+1');
  const [autoTypeSuggestion, setAutoTypeSuggestion] = useState<DataType | null>(null);
  
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [iconModalVisible, setIconModalVisible] = useState(false);
  const [faviconUrl, setFaviconUrl] = useState('');
  const [faviconSuggestionVisible, setFaviconSuggestionVisible] = useState(false);
  const [faviconLoading, setFaviconLoading] = useState(false);
  const [lastFaviconDomain, setLastFaviconDomain] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [fileTypeModalVisible, setFileTypeModalVisible] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [assetPreviewVisible, setAssetPreviewVisible] = useState(false);
  const [pendingAsset, setPendingAsset] = useState<{
    uri: string;
    name: string;
    mimeType: string;
    source: 'camera' | 'gallery' | 'document';
  } | null>(null);
  
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
  const pendingTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const pendingInteractionTasksRef = useRef<Array<{ cancel?: () => void }>>([]);
  const isMountedRef = useRef(true);
  // Tracks the last saved link id so background favicon updates can patch it silently
  const savedLinkIdRef = useRef<string | null>(null);
  const savedUserIdRef = useRef<string | null>(null);
  const retryLockMessage = tr(
    'Estamos cuidando la integridad de la comunidad. Por favor, espera un momento antes de intentar de nuevo',
    'We are protecting community integrity. Please wait a moment before trying again'
  );
  const isRetryLocked = retryLockedUntil !== null && retryLockedUntil > Date.now();

  const logAssetAudit = (stage: string, payload: Record<string, any>) => {
    console.log('[ELITE_UPLOAD_AUDIT]', stage, JSON.stringify(payload));
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
      setRetryLockedUntil(Date.now() + 5 * 60 * 1000);
      setRejectionAttempts(0);
      setModerationAlertMessage(retryLockMessage);
      setModerationAlertVisible(true);
      return;
    }

    setRejectionAttempts(attempts);
    setModerationAlertMessage(tr(
      'Parece que tu sonrisa no se ve clara. Intenta de nuevo para asegurar tu acceso premium.',
      'Your smile does not appear clear. Please try again to ensure your premium access.'
    ));
    setModerationAlertVisible(true);
  };

  // Pre-populate form if editing
  useEffect(() => {
    if (editingData?.id) {
      const type = editingData.type as DataType;
      setDataType(type);
      setDataName(editingData.title);
      setDataValue(editingData.value);
      
      // Try to find the icon by name or use favicon
      if (editingData.icon?.startsWith('http')) {
        setSelectedIcon('favicon');
        setFaviconUrl(editingData.icon);
      } else {
        // Find icon by label/iconName in the correct type
        const iconsForType = ICON_GALLERY;
        if (iconsForType) {
          const iconIndex = iconsForType.findIndex(i => i.label === editingData.iconName);
          if (iconIndex >= 0) {
            setSelectedIcon((iconIndex + 1).toString());
          } else {
            setSelectedIcon(DEFAULT_ICON_ID);
          }
        } else {
          setSelectedIcon(DEFAULT_ICON_ID);
        }
      }
    }
  }, [editingData]);

  const closeFaviconSuggestion = ({ clearSuggestion = false }: { clearSuggestion?: boolean } = {}) => {
    faviconLookupTokenRef.current += 1;
    setFaviconLoading(false);
    setFaviconSuggestionVisible(false);
    if (clearSuggestion) {
      setFaviconUrl('');
      setLastFaviconDomain('');
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
    'facebook.com':    '3',  // facebook
    'fb.com':          '3',
    'm.facebook.com':  '3',
    'instagram.com':   '2',  // instagram
    'linkedin.com':    '1',  // linkedin
    'whatsapp.com':    '4',  // whatsapp
    'wa.me':           '4',
    'youtube.com':     '7',  // youtube
    'youtu.be':        '7',
    'twitter.com':     '5',  // twitter/x
    'x.com':           '5',
    'tiktok.com':      '6',  // tiktok
    'snapchat.com':    '8',  // snapchat
    'maps.google.com': '9',  // web/map
    'goo.gl':          '9',
    'maps.apple.com':  '9',
  };

  // ─── KNOWN NAMES → ICON_GALLERY id (sugerencia por nombre de data) ────────────
  const KNOWN_NAME_ICONS: Array<{ keywords: string[]; iconId: string }> = [
    { keywords: ['linkedin'],               iconId: '1'  },
    { keywords: ['instagram'],              iconId: '2'  },
    { keywords: ['facebook', 'fb'],         iconId: '3'  },
    { keywords: ['whatsapp'],               iconId: '4'  },
    { keywords: ['twitter', 'tweet', ' x '],iconId: '5'  },
    { keywords: ['tiktok', 'tik tok'],      iconId: '6'  },
    { keywords: ['youtube', ' yt '],        iconId: '7'  },
    { keywords: ['snapchat', 'snap'],       iconId: '8'  },
    { keywords: ['gmail'],                  iconId: '21' },
    { keywords: ['outlook'],                iconId: '24' },
    { keywords: ['yahoo'],                  iconId: '25' },
  ];

  useEffect(() => {
    const lookupFavicon = async () => {
      const sessionToken = closeGenerationRef.current;
      if (dataType !== 'Enlaces' || !dataValue.trim() || editingData?.id) {
        return;
      }
      const lookupToken = ++faviconLookupTokenRef.current;
      try {
        const urlObj = new URL(dataValue.startsWith('http') ? dataValue : `https://${dataValue}`);
        const domain = urlObj.hostname.toLowerCase().replace(/^www\./, '');
        if (!domain || domain === lastFaviconDomain) {
          return;
        }

        // 1️⃣ Known domain shortcut — use local icon, skip Azure entirely
        const knownIconId = KNOWN_DOMAIN_ICONS[domain];
        if (knownIconId) {
          setSelectedIcon(knownIconId);
          setFaviconLoading(false);
          setLastFaviconDomain(domain);
          return;
        }

        setFaviconLoading(true);

        // 2️⃣ Local cache hit
        if (faviconCache.current[domain]) {
          setFaviconUrl(faviconCache.current[domain]);
          setFaviconSuggestionVisible(true);
          setFaviconLoading(false);
          setLastFaviconDomain(domain);
          return;
        }

        // 3️⃣ Race Azure against 2s timeout
        // Timeout robusto de 3s
        const faviconTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
        let fetchedIcon: string | null = null;
        try {
          fetchedIcon = await Promise.race([
            fetchFaviconFromAzure(dataValue),
            faviconTimeout
          ]);
        } catch {
          fetchedIcon = null;
        }

        if (isSessionClosed(sessionToken) || lookupToken !== faviconLookupTokenRef.current) {
          return;
        }

        if (!fetchedIcon) {
          // ⏱ TIMEOUT o error — fallback seguro
          setFaviconLoading(false);
          setFaviconUrl('');
          setSelectedIcon(LINK_FALLBACK_ICON_ID);
          setLastFaviconDomain(domain);
          setFaviconSuggestionVisible(false);
          trackTimeout(() => {
            if (!isSessionClosed(sessionToken)) {
              setIconModalVisible(true);
            }
          }, 800);
          return;
        }

        await Image.prefetch(fetchedIcon).catch(() => null);
        if (isSessionClosed(sessionToken) || lookupToken !== faviconLookupTokenRef.current) {
          return;
        }
        faviconCache.current[domain] = fetchedIcon;
        setLastFaviconDomain(domain);
        setFaviconUrl(fetchedIcon);
        setFaviconSuggestionVisible(true);
        setFaviconLoading(false);
      } catch {
        if (isSessionClosed(sessionToken)) {
          return;
        }
        setFaviconLoading(false);
        setFaviconSuggestionVisible(false);
        setFaviconUrl('');
      }
    };
    lookupFavicon();
  }, [dataValue, dataType, editingData?.id, lastFaviconDomain]);

  // Reset icon and URL when data type changes (but NOT if we're editing)
  const prevDataTypeRef = useRef<DataType>(dataType);
  useEffect(() => {
    if (editingData?.id) return;
    if (prevDataTypeRef.current === dataType) return;
    prevDataTypeRef.current = dataType;
    setSelectedIcon(DEFAULT_ICON_ID);
    setFaviconUrl('');
    closeFaviconSuggestion();
    setLastFaviconDomain('');
    // Keep dataName and dataValue — user may have typed them intentionally
  }, [dataType, editingData?.id]);

  // ── Auto-detectar tipo al pegar un valor ──────────────────────────────────
  useEffect(() => {
    if (!dataValue.trim() || editingData?.id) return;
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
    if (!dataName.trim() || selectedIcon !== DEFAULT_ICON_ID || editingData?.id) return;
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
    closeFaviconSuggestion();
    setFaviconLoading(false);
    setUploadModalVisible(false);
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStageLabel(tr('Iniciando...', 'Starting...'));
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
    setSelectedIcon(DEFAULT_ICON_ID);
    setCountryCode('+1');
    setFaviconUrl('');
    closeFaviconSuggestion();
    setLastFaviconDomain('');
    setAutoTypeSuggestion(null);
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
    setPendingAsset(asset);
    setAssetPreviewVisible(true);
    setFileTypeModalVisible(false);
  };

  const confirmAssetPreview = () => {
    if (!pendingAsset) return;
    setDataValue(pendingAsset.uri);
    if (!dataName.trim()) {
      const baseName = pendingAsset.name.replace(/\.[^/.]+$/, '');
      setDataName(baseName || tr('Documento', 'Document'));
    }
    setAssetPreviewVisible(false);
    setPendingAsset(null);
  };

  const retryAssetSelection = () => {
    const sessionToken = closeGenerationRef.current;
    setDataValue('');
    setUploadProgress(0);
    setUploadStageLabel(tr('Iniciando...', 'Starting...'));
    setIsUploading(false);
    setAssetPreviewVisible(false);
    setPendingAsset(null);
    trackTimeout(() => {
      if (!isSessionClosed(sessionToken)) {
        setFileTypeModalVisible(true);
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
          message: tr(
            `❌ Archivo muy grande (${(fileSizeInBytes / (1024 * 1024)).toFixed(2)} MB).\nMáximo: ${maxSizeInMB} MB`,
            `❌ File too large (${(fileSizeInBytes / (1024 * 1024)).toFixed(2)} MB).\nMax: ${maxSizeInMB} MB`
          ),
        };
      }

      return { valid: true };
    } catch (error) {
      console.error('Error validating file size:', error);
      return { valid: false, message: tr('Error al validar tamaño del archivo', 'Error validating file size') };
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

  // Optimiza imágenes automáticamente para cumplir límites de cliente/backend.
  const optimizeImageForLimit = async (uri: string, maxBytes: number): Promise<{ uri: string; size: number }> => {
    try {
      setIsCompressing(true);

      const initialSize = await getFileSizeInBytes(uri);
      if (initialSize <= maxBytes) {
        return { uri, size: initialSize };
      }

      let bestUri = uri;
      let bestSize = initialSize;

      const attempts = [
        { width: 1920, compress: 0.72 },
        { width: 1440, compress: 0.62 },
        { width: 1080, compress: 0.52 },
        { width: 840, compress: 0.45 },
        { width: 640, compress: 0.38 },
      ];

      for (const attempt of attempts) {
        const manipResult = await ImageManipulator.manipulateAsync(
          bestUri,
          [{ resize: { width: attempt.width } }],
          { compress: attempt.compress, format: ImageManipulator.SaveFormat.JPEG }
        );
        const size = await getFileSizeInBytes(manipResult.uri);
        bestUri = manipResult.uri;
        bestSize = size;

        if (size <= maxBytes) {
          return { uri: bestUri, size: bestSize };
        }
      }

      // Lógica de emergencia: último intento a 480px y calidad 0.2
      const emergencyResult = await ImageManipulator.manipulateAsync(
        bestUri,
        [{ resize: { width: 480 } }],
        { compress: 0.2, format: ImageManipulator.SaveFormat.JPEG }
      );
      const emergencySize = await getFileSizeInBytes(emergencyResult.uri);
      if (emergencySize <= maxBytes) {
        return { uri: emergencyResult.uri, size: emergencySize };
      }
      // Si aún así no baja, devolver el último intento (probablemente corrupto o imposible)
      return { uri: emergencyResult.uri, size: emergencySize };
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
      const initialSize = await getFileSizeInBytes(uri);
      if (initialSize <= maxBytes) {
        return { uri, size: initialSize };
      }

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const sourceBytes = Uint8Array.from(Buffer.from(base64, 'base64'));
      // [SILENCIADO POR ERROR DE DEPENDENCIA]
      // const pdfDoc = await PDFDocument.load(sourceBytes, {
      //   ignoreEncryption: true,
      //   updateMetadata: false,
      // });
      //
      // const optimizedBytes = await pdfDoc.save({
      //   useObjectStreams: true,
      //   addDefaultPage: false,
      //   updateFieldAppearances: false,
      // });
      //
      // const optimizedBase64 = Buffer.from(optimizedBytes).toString('base64');
      // const optimizedUri = `${FileSystem.cacheDirectory || ''}optimized-${Date.now()}.pdf`;
      // await FileSystem.writeAsStringAsync(optimizedUri, optimizedBase64, {
      //   encoding: FileSystem.EncodingType.Base64,
      // });
      //
      // const optimizedSize = await getFileSizeInBytes(optimizedUri);
      // return { uri: optimizedUri, size: optimizedSize };
      // [FIN SILENCIADO]
      // #30 Warn user that PDF optimization is unavailable
      const currentSize = await getFileSizeInBytes(uri).catch(() => Number.MAX_SAFE_INTEGER);
      if (currentSize > maxBytes) {
        Toast.show({
          type: 'info',
          text1: tr('⚠️ PDF sin optimizar', '⚠️ PDF not optimized'),
          text2: tr('La optimización de PDF no está disponible. Intenta con un archivo más ligero.', 'PDF optimization is unavailable. Try a lighter file.'),
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

  // Abrir selector de Fotos o Documentos
  const handlePickFile = () => {
    setFileTypeModalVisible(true);
  };

  // Seleccionar imagen del dispositivo
  const handlePickPhotos = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(tr('Permiso denegado', 'Permission denied'), tr('Se necesita acceso a fotos', 'Photo access required'));
        return;
      }
      setFileTypeModalVisible(false); // Cerrar modal antes de procesar
      Toast.show({
        text1: tr('Subiendo archivo...', 'Uploading file...'),
        type: 'info',
        position: 'bottom',
        visibilityTime: 4000,
        autoHide: true,
      });
      const sessionToken = closeGenerationRef.current;
      const interactionTask: any = InteractionManager.runAfterInteractions(async () => { // Diferir hasta que la animación de cierre termine
        untrackInteractionTask(interactionTask);
        if (isSessionClosed(sessionToken)) return;
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.8,
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
          const optimized = await optimizeImageForLimit(file.uri, MAX_IMAGE_SIZE);
          if (isSessionClosed(sessionToken)) return;
          console.log('--- COMPRESIÓN REAL ---', optimized.size);
          if (optimized.size > MAX_IMAGE_SIZE) {
            Alert.alert(
              tr('No se pudo optimizar', 'Could not optimize'),
              tr('La imagen no pudo reducirse al límite seguro. Intenta otra foto o menor resolución.', 'The image could not be reduced to the safe limit. Try another photo or lower resolution.')
            );
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
      }); // Diferido con InteractionManager
      trackInteractionTask(interactionTask);
    } catch (error) {
      console.error('Error al seleccionar imagen:', error);
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        setFileTypeModalVisible(false);
        return;
      }

      const file = result.assets[0];
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
        const optimized = await optimizeImageForLimit(file.uri, MAX_IMAGE_SIZE);
        console.log('--- COMPRESIÓN REAL ---', optimized.size);
        finalUri = optimized.uri;
        finalSize = optimized.size;
        finalMime = 'image/jpeg';

        if (finalSize > MAX_IMAGE_SIZE && dataType !== 'Documento') {
          Alert.alert(
            tr('No se pudo optimizar', 'Could not optimize'),
            tr('No fue posible reducir la imagen al límite seguro. Prueba con otra captura.', 'Could not reduce image to safe limit. Try another capture.')
          );
          setFileTypeModalVisible(false);
          return;
        }
        // Permitir guardar imágenes como documentos: ajustar nombre si es necesario
        if (dataType === 'Documento') {
          file.name = file.name?.replace(/\.[^/.]+$/, '') + '.jpg';
        }
      } else if (isPdfAsset(file.uri, file.mimeType)) {
        const optimizedPdf = await optimizePdfForLimit(file.uri, MAX_DOCUMENT_SIZE);
        finalUri = optimizedPdf.uri;
        finalSize = optimizedPdf.size;
        finalMime = 'application/pdf';

        if (finalSize > MAX_DOCUMENT_SIZE && dataType !== 'Documento') {
          Alert.alert(
            tr('PDF demasiado pesado', 'PDF too large'),
            tr('El PDF excede el límite seguro incluso tras optimizar. Usa una versión más ligera.', 'The PDF exceeds the safe limit even after optimization. Use a lighter version.')
          );
          setFileTypeModalVisible(false);
          return;
        }
      } else {
        if (dataType !== 'Documento') {
          const validation = await validateFileSize(file.uri);
          if (!validation.valid) {
            Alert.alert(
              tr('Archivo no soportado', 'Unsupported file'),
              tr('Este formato no es compatible en esta carga segura. Usa imagen o PDF.', 'This format is not supported for secure upload. Use image or PDF.')
            );
            setFileTypeModalVisible(false);
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
      setFileTypeModalVisible(false);
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert(tr('Error', 'Error'), tr('No se pudo seleccionar el documento', 'Could not select document'));
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(tr('Permiso denegado', 'Permission denied'), tr('Se necesita acceso a la cámara', 'Camera access required'));
        return;
      }
      setFileTypeModalVisible(false); // Cerrar modal antes de procesar
      Toast.show({
        text1: tr('Subiendo archivo...', 'Uploading file...'),
        type: 'info',
        position: 'bottom',
        visibilityTime: 4000,
        autoHide: true,
      });
      const sessionToken = closeGenerationRef.current;
      const interactionTask: any = InteractionManager.runAfterInteractions(async () => {
        untrackInteractionTask(interactionTask);
        if (isSessionClosed(sessionToken)) return;
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.8,
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
          const optimized = await optimizeImageForLimit(file.uri, MAX_IMAGE_SIZE);
          if (isSessionClosed(sessionToken)) return;
          console.log('--- COMPRESIÓN REAL ---', optimized.size);
          if (optimized.size > MAX_IMAGE_SIZE && dataType !== 'Documento') {
            Alert.alert(
              tr('No se pudo optimizar', 'Could not optimize'),
              tr('La foto no pudo reducirse al límite seguro. Intenta otra captura.', 'Photo could not be reduced to safe limit. Try another capture.')
            );
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
      });
      trackInteractionTask(interactionTask);
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert(tr('Error', 'Error'), tr('No se pudo tomar la foto', 'Could not take photo'));
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
    if (dataType === 'Documento') return `vault-file-${timestamp}.pdf`;
    return `vault-image-${timestamp}.jpg`;
  };

  // Subir archivo al backend (Azure Content Safety + Mongo)
  const uploadFileToModerationBackend = async (
    fileUri: string,
    fileLabel: string,
    ownerUid: string
  ): Promise<{ fileId: string; publicUrl: string | null }> => {
    try {
      if (!fileUri.startsWith('file://')) {
        return { fileId: fileUri, publicUrl: null };
      }
      const sessionToken = closeGenerationRef.current;

      setUploadProgress(0);
      setUploadStageLabel(tr('Preparando...', 'Preparing...'));
      setIsUploading(true);
      setUploadModalVisible(true);
      setUploadProgress(0.2);
      setUploadStageLabel(tr('Enviando...', 'Sending...'));

      const uploadResult = await uploadFileWithModeration({
        fileUri,
        ownerUid,
        label: fileLabel,
        fileName: inferFileName(fileUri),
        mimeType: inferMimeType(fileUri),
      });
      const fileInfo = await FileSystem.getInfoAsync(fileUri, { size: true } as any).catch(() => null);
      logAssetAudit('UPLOAD_ATTEMPT', {
        dataType,
        dataName: fileLabel,
        uri: fileUri,
        fileName: inferFileName(fileUri),
        mimeType: inferMimeType(fileUri),
        sizeBytes: (fileInfo as any)?.size || null,
      });

      setUploadProgress(0.8);
      setUploadStageLabel(tr('Moderando...', 'Moderating...'));
      setUploadProgress(1);
      setUploadStageLabel(tr('Aprobado ✓', 'Approved ✓'));

      trackTimeout(() => {
        if (isSessionClosed(sessionToken)) return;
        setUploadModalVisible(false);
        setIsUploading(false);
      }, 400);

      return { fileId: uploadResult.fileId, publicUrl: uploadResult.publicUrl };
    } catch (error) {
      setUploadModalVisible(false);
      setIsUploading(false);
      throw error;
    }
  };

  // Save to Firestore (Create or Update)
  const handleCreate = async () => {
    if (isSaving) return;
    console.log('[Vault] handleCreate: INICIO');
    console.log('[Vault] handleCreate: Antes de Validaciones Iniciales');
    if (!dataName.trim() || !dataValue.trim()) {
      Alert.alert('❌ Error', tr('Completa todos los campos', 'Fill in all fields'));
      return;
    }
    // #16 Format validation per type
    if (dataType === 'Email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dataValue.trim())) {
      Alert.alert('❌ Error', tr('Introduce un email válido', 'Enter a valid email'));
      return;
    }
    if (dataType === 'Teléfono' && dataValue.replace(/[^\d]/g, '').length < 7) {
      Alert.alert('❌ Error', tr('El número debe tener al menos 7 dígitos', 'Number must have at least 7 digits'));
      return;
    }
    if (dataType === 'Enlaces') {
      let testUrl = dataValue.trim();
      if (!/^https?:\/\//i.test(testUrl)) testUrl = 'https://' + testUrl;
      if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(testUrl)) {
        Alert.alert('❌ Error', tr('Introduce una URL válida', 'Enter a valid URL'));
        return;
      }
    }
    if (dataType === 'Texto Plain') {
      const wordCount = dataValue.split(/\s+/).filter(w => w).length;
      if (wordCount > 200) {
        Alert.alert('❌ Error', tr('Máximo 200 palabras permitidas', 'Maximum 200 words allowed'));
        return;
      }
    }
    console.log('[Vault] handleCreate: Después de Validaciones Iniciales');
    console.log('[Vault] handleCreate: Antes de Chequeo de Bloqueos/Biométrico');
    const biometricOk = await hardLockCheck(
      editingData?.id ? tr('actualizar un dato del Búnker', 'update a Vault item') : tr('crear un dato en el Búnker', 'create a Vault item'),
    );
    if (!biometricOk) {
      console.log('[Vault] handleCreate: hardLockCheck falló');
      return;
    }
    if (isRetryLocked) {
      setModerationAlertMessage(retryLockMessage);
      setModerationAlertVisible(true);
      console.log('[Vault] handleCreate: isRetryLocked');
      return;
    }
    console.log('[Vault] handleCreate: Después de Chequeo de Bloqueos/Biométrico');
    const saveSessionToken = closeGenerationRef.current;
    setIsSaving(true);
    try {
      console.log('[Vault] handleCreate: Antes de getActiveUserId');
      const userId = await getActiveUserId();
      console.log('[Vault] handleCreate: Después de getActiveUserId', userId);
      if (!userId) {
        Alert.alert('❌ Error', tr('No se pudo identificar al usuario activo', 'Could not identify active user'));
        return;
      }
      console.log('[Vault] handleCreate: Antes de AsyncStorage.getItem');
      const existingData = await AsyncStorage.getItem(VAULT_STORAGE_KEY);
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
        Alert.alert(
          tr('⚠️ Nombre duplicado', '⚠️ Duplicate name'),
          tr('Ya existe un dato con ese nombre. Usa un nombre diferente.', 'An item with that name already exists. Use a different name.'),
        );
        return;
      }
      const iconData = selectedIcon === 'favicon'
        ? faviconUrl
        : sanitizeMaterialIconName(ICON_GALLERY.find(i => i.id === selectedIcon)?.icon);
      // iconName ahora siempre es válido
      const iconName = selectedIcon === 'favicon'
        ? 'Favicon'
        : mappedIconName;
      // #21 Auto-prepend https:// for Enlaces
      let preNormalized = dataValue;
      if (dataType === 'Enlaces' && !/^https?:\/\//i.test(dataValue.trim())) {
        preNormalized = 'https://' + dataValue.trim();
      }
      // #25 Phone formatting with country code
      const normalizedValue =
        dataType === 'Teléfono' && !preNormalized.startsWith('+')
          ? `${countryCode} ${preNormalized.replace(/^\s+/, '')}`
          : preNormalized;
      const shouldUploadFile =
        dataType === 'Documento' && normalizedValue.startsWith('file://');
      let finalValue = normalizedValue;
      if (shouldUploadFile) {
        const { fileId, publicUrl: filePublicUrl } = await uploadFileToModerationBackend(normalizedValue, dataName, userId);
        finalValue = filePublicUrl || `mongo-gridfs://${fileId}`;
      }
      // Crear ID único evitando cualquier choque accidental local.
      const existingIds = new Set(
        dataArray.map((entry: any) => String(entry?.id || '')).filter(Boolean)
      );
      let uniqueId = editingData?.id;
      if (!uniqueId) {
        do {
          uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
        } while (existingIds.has(uniqueId));
      }
      const dataPayload = {
        id: uniqueId,
        title: dataName.trim(),
        type: dataType,
        value: finalValue,
        iconName: iconName,
        icon: iconData,
        isFavorite: editingData?.isFavorite || false,
        createdAt: editingData?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // Store saved IDs for silent background favicon update
      savedLinkIdRef.current = uniqueId;
      savedUserIdRef.current = userId;
      if (editingData?.id) {
        // ACTUALIZAR: reemplazar el elemento existente
        const index = dataArray.findIndex((item: any) => item.id === editingData.id);
        if (index !== -1) {
          dataArray[index] = dataPayload;
        }
      } else {
        // CREAR: agregar nuevo elemento
        dataArray.push(dataPayload);
      }
      console.log('[Vault] handleCreate: Antes de AsyncStorage.setItem');
      await AsyncStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(dataArray));
      console.log('[Vault] handleCreate: Después de AsyncStorage.setItem');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({
        type: 'success',
        text1: tr('🛡️ ¡Dato guardado en el Búnker!', '🛡️ Data saved to Vault!'),
        text2: tr('✓ Guardado localmente', '✓ Saved locally'),
        position: 'bottom',
        visibilityTime: 3000,
        autoHide: true,
      });

      // Sync cloud in background so UI never blocks the first/next creation flow.
      if (userId) {
        void (async () => {
          try {
            console.log('[Vault] handleCreate: Background cloud sync start');
            const cloudDocRef = doc(db, 'users', userId, 'links', uniqueId!);
            await withTimeout(
              setDoc(cloudDocRef, dataPayload),
              CLOUD_SYNC_TIMEOUT_MS,
              'Cloud sync timeout'
            );
            console.log('[Vault] handleCreate: Background cloud sync done');
            Toast.show({
              type: 'success',
              text1: tr('☁️ Sincronización completada', '☁️ Cloud sync completed'),
              text2: tr('✓ Dato respaldado en la nube', '✓ Item backed up to cloud'),
              position: 'bottom',
              visibilityTime: 2200,
              autoHide: true,
            });
          } catch (cloudError) {
            console.warn('[Vault] Background cloud sync failed, local data kept:', cloudError);
          }
        })();
      }
      console.log('[Vault] handleCreate: Antes de handleClose');
      handleClose();
      console.log('[Vault] handleCreate: Después de handleClose');
    } catch (error) {
      console.error('[Vault] handleCreate: Error saving:', error);
      if (error instanceof ModerationRejectedError) {
        Toast.show({
          type: 'error',
          text1: tr('🚫 Contenido no permitido. Revisa las reglas.', '🚫 Content not allowed. Check the rules.'),
          position: 'bottom',
          visibilityTime: 3000,
          autoHide: true,
        });
        registerModerationReject();
      } else {
        Alert.alert(
          tr('Error al subir', 'Upload error'),
          tr('No se pudo guardar el dato. ¿Reintentar?', 'Could not save data. Retry?'),
          [
            { text: tr('Cancelar', 'Cancel'), style: 'cancel' },
            { text: tr('Reintentar', 'Retry'), onPress: () => handleCreate() },
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
    case 'Enlaces':
      mappedIconName = 'link';
      break;
    case 'Texto Plain':
      mappedIconName = 'text-box';
      break;
    default:
      mappedIconName = 'file';
  }
  const iconData = selectedIcon === 'favicon'
    ? faviconUrl
    : sanitizeMaterialIconName(ICON_GALLERY.find(i => i.id === selectedIcon)?.icon);
  // iconName ahora siempre es válido
  const iconName = selectedIcon === 'favicon'
    ? 'Favicon'
    : mappedIconName;
  // Render dynamic field based on data type
  const renderDataField = () => {
    switch (dataType) {
      case 'Enlaces':
        return (
          <View>
            <LinearGradient
              colors={formTheme.gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 10, padding: 4 }}
            >
              <TextInput
                style={[styles.input, { backgroundColor: formTheme.inputBg, color: formTheme.inputText, borderWidth: 0 }]}
              placeholder={(() => {
                const n = dataName.trim().toLowerCase();
                if (n.includes('instagram')) return tr('https://instagram.com/tu_usuario', 'https://instagram.com/your_user');
                if (n.includes('linkedin')) return tr('https://linkedin.com/in/tu-perfil', 'https://linkedin.com/in/your-profile');
                if (n.includes('facebook') || n.includes('fb')) return tr('https://facebook.com/tu_pagina', 'https://facebook.com/your_page');
                if (n.includes('twitter') || n.includes(' x ')) return tr('https://x.com/tu_usuario', 'https://x.com/your_user');
                if (n.includes('tiktok')) return tr('https://tiktok.com/@tu_usuario', 'https://tiktok.com/@your_user');
                if (n.includes('youtube') || n.includes('yt')) return tr('https://youtube.com/@tu_canal', 'https://youtube.com/@your_channel');
                return 'https://example.com';
              })()}
              placeholderTextColor={formTheme.inputPlaceholder}
              value={dataValue}
              onChangeText={setDataValue}
              autoCapitalize="none"
              autoCorrect={false}
              />
            </LinearGradient>
            {faviconUrl && (
              <View>
                <View style={styles.faviconContainer}>
                  <Image source={{ uri: faviconUrl }} style={styles.faviconImg} />
                  <Text style={styles.faviconLabel}>{tr('Favicon detectado', 'Favicon detected')}</Text>
                </View>
                <Text style={styles.wordCount}>{tr('Si quieres otro estilo, elige un icono de la galería oficial.', 'Want a different style? Pick an icon from the official gallery.')}</Text>
              </View>
            )}
          </View>
        );
      case 'Teléfono':
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
                onPress={() => setCountryModalVisible(true)}
              >
                <Text style={[styles.countryCodeText, { color: formTheme.inputText }]}>{countryCode}</Text>
                <MaterialCommunityIcons name="chevron-down" color="#1EA7FF" size={18} />
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
                placeholder="123 456 7890"
                placeholderTextColor={formTheme.inputPlaceholder}
                value={dataValue}
                onChangeText={setDataValue}
                keyboardType="phone-pad"
              />
            </LinearGradient>
          </View>
        );
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
      case 'Texto Plain':
        return (
          <View>
            <LinearGradient
              colors={formTheme.gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 10, padding: 4 }}
            >
              <TextInput
                style={[styles.input, { minHeight: 100, backgroundColor: formTheme.inputBg, color: formTheme.inputText, borderWidth: 0 }]}
                placeholder={tr('Escribe aquí...', 'Write here...')}
                placeholderTextColor={formTheme.inputPlaceholder}
                value={dataValue}
                onChangeText={(text) => {
                  const words = text.split(/\s+/).filter(w => w).length;
                  if (words <= 200 || text.length < dataValue.length) setDataValue(text);
                }}
                multiline
              />
            </LinearGradient>
            <Text style={[styles.wordCount, dataValue.split(/\s+/).filter(w => w).length > 190 && { color: '#E53935' }]}>
              {dataValue.split(/\s+/).filter(w => w).length} / 200 {tr('palabras', 'words')}
            </Text>
          </View>
        );
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
                onPress={pendingAsset || dataValue ? () => setAssetPreviewVisible(true) : handlePickFile}
              >
              <MaterialCommunityIcons
                name={pendingAsset || dataValue ? 'eye' : 'image-plus'}
                color={formTheme.textPrimary}
                size={32}
              />
              <Text style={[styles.documentText, { color: formTheme.textPrimary }]}>
                {pendingAsset
                  ? tr('Ver Archivo Seleccionado', 'View Selected File')
                  : dataValue
                  ? tr('Ver Archivo Guardado', 'View Saved File')
                  : tr('Subir PDF o imagen', 'Upload PDF or image')}
              </Text>
              </TouchableOpacity>
            </LinearGradient>
            <Text style={styles.wordCount}>{tr('Se aceptan PDF o imágenes para visor protegido del Búnker.', 'PDF or images accepted for Vault protected viewer.')}</Text>
            
            {/* PREVIEW del documento/imagen seleccionado */}
            {dataValue && (
              <View style={[styles.previewContainer, { backgroundColor: formTheme.inputBg }]}>
                <Text style={[styles.previewLabel, { color: formTheme.textPrimary }]}>{tr('Vista Previa:', 'Preview:')}</Text>
                {isImageFile(dataValue) || isImageFile(dataName) ? (
                  <View style={styles.imagePreview}>
                    <Image 
                      source={{ uri: dataValue }} 
                      style={styles.previewImage}
                      onError={() => console.log('Error loading image')}
                    />
                    <Text style={[styles.previewFileName, { color: formTheme.textPrimary }]} numberOfLines={1}>
                      {dataName || tr('Imagen seleccionada', 'Selected image')}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.documentPreview}>
                    <MaterialCommunityIcons name={getDocumentIcon(dataValue) as any} color={formTheme.textPrimary} size={48} />
                    <Text style={[styles.previewFileName, { color: formTheme.textPrimary }]} numberOfLines={1}>
                      {dataName || tr('Documento seleccionado', 'Selected document')}
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
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <View style={[styles.container, { backgroundColor: formTheme.motherBg }]}>
        {/* Header with close button */}
        <View style={[styles.headerTop, { borderBottomColor: formTheme.border }]}>
          <View style={styles.modalDragHandleWrap}>
            <View style={styles.modalDragHandle} />
          </View>
          <View style={styles.titleDragZone}>
            <Text style={styles.titleMain}>
              {editingData?.id ? tr('EDITAR INFORMACIÓN', 'EDIT INFORMATION') : tr('NUEVA INFORMACIÓN', 'NEW INFORMATION')}
            </Text>
          </View>
          <TouchableOpacity 
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.closeButton}
          >
            <MaterialCommunityIcons name="close" color="#D4AF37" size={28} />
          </TouchableOpacity>
        </View>

        <ScrollView
          key={editingData?.id ? `edit-${editingData.id}` : 'create'}
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { flexGrow: 1 }]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentInsetAdjustmentBehavior="automatic"
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          bounces
          overScrollMode="always"
        >
          {/* TIPO DE DATA */}
          <View style={styles.section}>
            <Text style={[styles.stepLabel, { color: formTheme.textPrimary }]}>{tr('TIPO DE DATO', 'DATA TYPE')} {editingData?.id && tr('(No editable)', '(Read-only)')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typePillsRow} removeClippedSubviews={true} scrollEventThrottle={16} bounces={false} overScrollMode="never">
              {DATA_TYPE_OPTIONS.map((option) => {
                const isActive = dataType === option.key;
                return (
                    <LinearGradient
                      key={option.key}
                      colors={formTheme.gradientColors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ borderRadius: 999, padding: 4 }}
                    >
                      <TouchableOpacity
                    style={[
                      styles.typePill,
                      {
                        backgroundColor: isActive ? formTheme.selectedPillBg : formTheme.surfaceBg,
                          borderWidth: 0,
                          shadowColor: isActive ? formTheme.selectedPillGlow : '#000',
                        shadowOpacity: isActive ? 0.22 : 0,
                        elevation: isActive ? 4 : 0,
                      },
                      editingData?.id && styles.typePillDisabled,
                    ]}
                    onPress={() => {
                      if (editingData?.id) return;
                      setDataType(option.key);
                      setDataValue('');
                    }}
                    disabled={!!editingData?.id}
                  >
                    <Text
                      style={[
                        styles.typePillText,
                        { color: isActive ? formTheme.selectedPillText : formTheme.textPrimary },
                      ]}
                    >
                      {language === 'en' ? option.labelEn : option.label}
                    </Text>
                      </TouchableOpacity>
                    </LinearGradient>
                );
              })}
            </ScrollView>
            <Text style={[styles.hint, { color: formTheme.textSecondary }]}>
              {editingData?.id ? tr('Tipo no puede cambiar al editar', 'Type cannot change while editing') : tr('Selecciona el tipo de dato', 'Select data type')}
            </Text>
            {autoTypeSuggestion && !editingData?.id && (
              <TouchableOpacity
                style={[styles.autoTypeBanner, { backgroundColor: formTheme.selectedPillBg }]}
                onPress={() => {
                  prevDataTypeRef.current = autoTypeSuggestion;
                  setDataType(autoTypeSuggestion);
                  setAutoTypeSuggestion(null);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="swap-horizontal" color="#F0F4F8" size={16} />
                <Text style={styles.autoTypeBannerText}>
                  {tr(`¿Cambiar a ${autoTypeSuggestion}?`, `Switch to ${autoTypeSuggestion}?`)}
                </Text>
                <TouchableOpacity onPress={() => setAutoTypeSuggestion(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="close" color="#F0F4F8" size={14} />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          </View>

          {/* NOMBRE DE DATA */}
          <View style={styles.section}>
            <Text style={[styles.stepLabel, { color: formTheme.textPrimary }]}>{tr('NOMBRE DE DATA', 'DATA NAME')}</Text>
              <LinearGradient
                colors={formTheme.gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: 10, padding: 4 }}
              >
                <TextInput
                  style={[styles.input, { backgroundColor: formTheme.inputBg, color: formTheme.inputText, borderWidth: 0 }]}
              placeholder={tr('Ej: Mi WhatsApp', 'Ex: My WhatsApp')}
              placeholderTextColor={formTheme.inputPlaceholder}
              value={dataName}
              onChangeText={setDataName}
                />
              </LinearGradient>
          </View>

          {/* DATA */}
          <View style={styles.section}>
            <Text style={[styles.stepLabel, { color: formTheme.textPrimary }]}>DATA</Text>
            {renderDataField()}
          </View>

          {/* ICONO */}
          <View style={styles.section}>
            <View style={styles.stepHeader}>
              <Text style={[styles.stepLabel, { color: formTheme.textPrimary }]}>{tr('ICONO', 'ICON')}</Text>
              <TouchableOpacity
                style={styles.editIconBtn}
                onPress={() => setIconModalVisible(true)}
              >
                <MaterialCommunityIcons name="pencil" color="#0A2540" size={18} />
              </TouchableOpacity>
            </View>
            <View style={[styles.iconPreview, { backgroundColor: formTheme.surfaceBg }]}>
              {faviconLoading && dataType === 'Enlaces' ? (
                <>
                  <View style={styles.iconLoadingPreview}>
                    <View style={styles.spinnerPriorityLayer}>
                      <BrandedSpinner size={52} color="#D4AF37" />
                    </View>
                  </View>
                  <Text style={styles.faviconLabel}>{tr('Buscando favicon en Azure...', 'Searching favicon on Azure...')}</Text>
                </>
              ) : selectedIcon === 'favicon' && faviconUrl ? (
                <LinearGradient
                  colors={formTheme.gradientColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconPreviewCircleGradient}
                >
                  <View style={[styles.iconPreviewCircleInner, { backgroundColor: formTheme.iconPreviewCircleBg }]}> 
                    <Image source={{ uri: faviconUrl }} style={styles.faviconImg} />
                  </View>
                </LinearGradient>
              ) : selectedIcon ? (
                <LinearGradient
                  colors={formTheme.gradientColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconPreviewCircleGradient}
                >
                  <View style={[styles.iconPreviewCircleInner, { backgroundColor: formTheme.iconPreviewCircleBg }]}> 
                    <MaterialCommunityIcons
                      name={sanitizeMaterialIconName(ICON_GALLERY.find(i => i.id === selectedIcon)?.icon) as any}
                      color={formTheme.textPrimary}
                      size={48}
                    />
                  </View>
                </LinearGradient>
              ) : (
                <MaterialCommunityIcons name="image-plus" color="#999" size={40} />
              )}
              <Text style={[styles.iconName, { color: formTheme.textPrimary }]}>
                {dataName?.trim() || tr('Sin nombre', 'No name')}
              </Text>
            </View>
          </View>

          {/* CREATE/UPDATE BUTTON */}
          <TouchableOpacity 
            style={[styles.createButton, isSaving && styles.createButtonDisabled]} 
            onPress={handleCreate}
            disabled={isSaving}
          >
            {isSaving ? (
              <Text style={styles.createButtonText}>{tr('GUARDANDO...', 'SAVING...')}</Text>
            ) : (
              <>
                <MaterialCommunityIcons name="check-circle" color="#0A1A2F" size={24} />
                <Text style={styles.createButtonText}>
                  {editingData?.id ? tr('ACTUALIZAR', 'UPDATE') : tr('CREAR', 'CREATE')}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <View style={styles.saveButtonSpacer} />
        </ScrollView>

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
                <Text style={[styles.modalTitle, { color: formTheme.textPrimary }]}>{tr('Selecciona Tipo', 'Select Type')}</Text>
                <TouchableOpacity onPress={() => setTypeModalVisible(false)}>
                  <MaterialCommunityIcons name="close" color="#1EA7FF" size={24} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={['Enlaces', 'Teléfono', 'Email', 'Texto Plain', 'Documento'] as DataType[]}
                keyExtractor={item => item}
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
                      setDataType(item);
                      setDataValue('');
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
                      {item}
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
          visible={faviconSuggestionVisible}
          transparent
          animationType="fade"
          onRequestClose={() => closeFaviconSuggestion()}
        >
          <TouchableWithoutFeedback onPress={() => closeFaviconSuggestion()}>
            <View style={styles.faviconPopupOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.faviconPopupCard}>
              <Text style={styles.faviconPopupTitle}>{tr('¿Usar este icono?', 'Use this icon?')}</Text>
              <View style={styles.faviconPopupPreviewBox}>
                {faviconLoading ? (
                  <BrandedSpinner size={44} color="#D4AF37" />
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
                  <Text style={styles.faviconConfirmButtonText}>{tr('SÍ, USAR', 'YES, USE')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.faviconPopupButton, styles.faviconCancelButton, styles.faviconPopupButtonSpacing]}
                  onPress={() => {
                    closeFaviconSuggestion();
                  }}
                >
                  <Text style={styles.faviconCancelButtonText}>{tr('NO, CANCELAR', 'NO, CANCEL')}</Text>
                </TouchableOpacity>
              </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* MODAL: COUNTRY CODE */}
        <Modal
          visible={countryModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCountryModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: formTheme.surfaceBg, borderTopColor: formTheme.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: formTheme.textPrimary }]}>{tr('País', 'Country')}</Text>
                <TouchableOpacity onPress={() => setCountryModalVisible(false)}>
                  <MaterialCommunityIcons name="close" color={formTheme.textPrimary} size={24} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={COUNTRY_CODES}
                keyExtractor={item => item.code}
                removeClippedSubviews={true}
                scrollEventThrottle={16}
                bounces={false}
                overScrollMode="never"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      setCountryCode(item.code);
                      setCountryModalVisible(false);
                    }}
                  >
                    <Text style={[styles.modalItemText, { color: isNight ? '#F0F4F8' : formTheme.textPrimary }]}>
                      {item.code} {item.country}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

        {/* MODAL: ICON GALLERY — CardStudioVault */}
        <CardStudioVault
          visible={iconModalVisible}
          onClose={() => setIconModalVisible(false)}
          onSelectIcon={setSelectedIcon}
          dataType={dataType}
          selectedIcon={selectedIcon}
        />

        {/* MODAL: ELEGIR FOTOS O DOCUMENTOS */}
        <Modal
          visible={fileTypeModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setFileTypeModalVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setFileTypeModalVisible(false)}>
            <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.modalContent, { backgroundColor: formTheme.surfaceBg, borderTopColor: formTheme.border }]}>
              <View style={styles.bottomSheetDragHandleWrap}>
                <View style={styles.bottomSheetDragHandle} />
              </View>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: formTheme.textPrimary }]}>{tr('Carga Segura de Documento', 'Secure Document Upload')}</Text>
                <TouchableOpacity onPress={() => setFileTypeModalVisible(false)}>
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
                disabled={isCompressing}
              >
                <MaterialCommunityIcons name="camera" color={formTheme.textPrimary} size={30} />
                <Text style={[styles.fileTypeText, { color: formTheme.textPrimary }]}>{tr('Tomar Foto', 'Take Photo')}</Text>
                <Text style={[styles.fileTypeSubText, { color: formTheme.textSecondary }]}>{tr('Captura directa con cámara', 'Direct camera capture')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.fileTypeOption, { backgroundColor: formTheme.inputBg, borderColor: formTheme.border }]}
                onPress={handlePickPhotos}
                disabled={isCompressing}
              >
                <MaterialCommunityIcons name="image-multiple" color={formTheme.textPrimary} size={30} />
                <Text style={[styles.fileTypeText, { color: formTheme.textPrimary }]}>{tr('Elegir imagen', 'Choose image')}</Text>
                <Text style={[styles.fileTypeSubText, { color: formTheme.textSecondary }]}>JPG, PNG {tr('o', 'or')} HEIC</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.fileTypeOption, { backgroundColor: formTheme.inputBg, borderColor: formTheme.border }]}
                onPress={handlePickDocument}
                disabled={isCompressing}
              >
                <MaterialCommunityIcons name="file-document-outline" color={formTheme.textPrimary} size={30} />
                <Text style={[styles.fileTypeText, { color: formTheme.textPrimary }]}>{tr('Elegir documento', 'Choose document')}</Text>
                <Text style={[styles.fileTypeSubText, { color: formTheme.textSecondary }]}>{tr('PDF y archivos visualizables', 'PDF and viewable files')}</Text>
              </TouchableOpacity>
              </ScrollView>
            </View>
            </TouchableWithoutFeedback>
          </View>
          </TouchableWithoutFeedback>
        </Modal>

        <Modal
          visible={isCompressing || isSaving || isUploading}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!isSaving) {
              setIsCompressing(false);
              setIsUploading(false);
              setUploadModalVisible(false);
            }
          }}
        >
          <View style={styles.compressOverlay}>
            <View style={styles.compressCard}>
              <BrandedSpinner size={56} color="#D4AF37" />
              <Text style={styles.compressText}>
                {isCompressing
                  ? tr('Optimizando archivo de forma segura...', 'Securely optimizing file...')
                  : isUploading
                    ? tr('Subiendo archivo al escudo de seguridad...', 'Uploading file to security shield...')
                    : tr('Guardando en Bunker seguro...', 'Saving to secure Vault...')}
              </Text>
              {!isSaving && (
                <TouchableOpacity
                  style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(212,175,55,0.2)' }}
                  onPress={() => {
                    setIsCompressing(false);
                    setIsUploading(false);
                    setUploadModalVisible(false);
                  }}
                >
                  <Text style={{ color: '#D4AF37', fontWeight: '700', fontSize: 14 }}>{tr('Cancelar', 'Cancel')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>

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
          title={tr('Exclusividad de Seguridad', 'Security Exclusivity')}
          message={moderationAlertMessage}
          onClose={() => setModerationAlertVisible(false)}
          onRetry={() => setModerationAlertVisible(false)}
          retryLocked={isRetryLocked}
          retryCountdownSec={retryCountdownSec}
          lockMessage={retryLockMessage}
        />
      </View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1,
  },
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
    backgroundColor: 'rgba(212,175,55,0.55)',
  },
  closeButton: {
    padding: 8,
    borderRadius: 8,
    marginTop: 20,
  },
  titleMain: {
    fontSize: 24,
    fontWeight: '700',
    color: '#D4AF37',
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
    borderColor: '#D4AF37',
    backgroundColor: '#E3F2FD',
  },
  typePillActive: {
    backgroundColor: '#E3F2FD',
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
  dropdownButton: {
    backgroundColor: '#E3F2FD',
    borderColor: '#D4AF37',
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
    backgroundColor: '#E3F2FD',
    borderColor: '#D4AF37',
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
    backgroundColor: '#E3F2FD',
    borderColor: '#D4AF37',
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
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    alignItems: 'center',
  },
  faviconLoadingContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    borderWidth: 4,
    borderColor: '#D4AF37',
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
    color: '#1EA7FF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  useFaviconButton: {
    backgroundColor: '#E3F2FD',
    borderColor: '#D4AF37',
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
    backgroundColor: '#E3F2FD',
    borderColor: '#D4AF37',
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
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    borderColor: '#D4AF37',
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
    backgroundColor: '#E3F2FD',
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
    backgroundColor: '#E3F2FD',
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
    borderColor: '#D4AF37',
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
  editIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1EA7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButton: {
    backgroundColor: '#D4AF37',
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  createButtonDisabled: {
    opacity: 0.5,
    backgroundColor: '#999',
  },
  createButtonText: {
    color: '#0A1A2F',
    fontSize: 16,
    fontWeight: '700',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  faviconPopupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
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
    backgroundColor: '#D4AF37',
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
    backgroundColor: '#E3F2FD',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.65,
    borderTopWidth: 3,
    borderTopColor: '#D4AF37',
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
    backgroundColor: 'rgba(212,175,55,0.55)',
  },
  iconModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(212,175,55,0.3)',
  },
  iconModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#D4AF37',
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
    backgroundColor: '#E3F2FD',
    borderWidth: 0.5,
    borderColor: '#D4AF37',
  },
  iconItemSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#E3F2FD',
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
    borderColor: '#D4AF37',
    backgroundColor: '#E3F2FD',
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
    backgroundColor: '#E3F2FD',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D4AF37',
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
    backgroundColor: '#D4AF37',
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
    backgroundColor: '#E3F2FD',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1EA7FF',
  },
  uploadPercentage: {
    color: '#1EA7FF',
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

