import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Modal,
  StyleSheet,
  Dimensions,
  FlatList,
  Image,
  Platform,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
  Keyboard,
  Linking,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Progress from 'react-native-progress';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@/services/firebaseConfig';
import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { getActiveUserId } from '@/services/authSession';
import { ModerationRejectedError, uploadFileWithModeration } from '@/services/moderationApi';
import { fetchFaviconFromAzure } from '@/services/faviconApi';
import { hardLockCheck } from '@/services/biometricAuth';
import LuxuryModerationModal from './LuxuryModerationModal';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const VAULT_STORAGE_KEY = 'vault_data';

type DataType = 'Enlaces' | 'Teléfono' | 'Email' | 'Texto Plain' | 'Documento';

const DATA_TYPE_OPTIONS: Array<{ key: DataType; label: string }> = [
  { key: 'Enlaces', label: 'Enlace' },
  { key: 'Email', label: 'Email' },
  { key: 'Teléfono', label: 'Teléfono' },
  { key: 'Texto Plain', label: 'Texto' },
  { key: 'Documento', label: 'Documento' },
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

// GALERÍA DE 10 ICONOS DORADOS (#1EA7FF) - Mismos para todos los tipos
const ICONS_BY_TYPE = {
  Enlaces: [
    { id: '1', label: 'WhatsApp', icon: 'whatsapp' },
    { id: '2', label: 'Facebook', icon: 'facebook' },
    { id: '3', label: 'Instagram', icon: 'instagram' },
    { id: '4', label: 'LinkedIn', icon: 'linkedin' },
    { id: '5', label: 'Web', icon: 'web' },
    { id: '6', label: 'Ubicación', icon: 'map-marker' },
    { id: '7', label: 'Llamada', icon: 'phone' },
    { id: '8', label: 'Email', icon: 'email' },
    { id: '9', label: 'Documento', icon: 'file-document' },
    { id: '10', label: 'Video', icon: 'play-circle' },
  ],
  Teléfono: [
    { id: '1', label: 'WhatsApp', icon: 'whatsapp' },
    { id: '2', label: 'Facebook', icon: 'facebook' },
    { id: '3', label: 'Instagram', icon: 'instagram' },
    { id: '4', label: 'LinkedIn', icon: 'linkedin' },
    { id: '5', label: 'Web', icon: 'web' },
    { id: '6', label: 'Ubicación', icon: 'map-marker' },
    { id: '7', label: 'Llamada', icon: 'phone' },
    { id: '8', label: 'Email', icon: 'email' },
    { id: '9', label: 'Documento', icon: 'file-document' },
    { id: '10', label: 'Video', icon: 'play-circle' },
  ],
  Email: [
    { id: '1', label: 'WhatsApp', icon: 'whatsapp' },
    { id: '2', label: 'Facebook', icon: 'facebook' },
    { id: '3', label: 'Instagram', icon: 'instagram' },
    { id: '4', label: 'LinkedIn', icon: 'linkedin' },
    { id: '5', label: 'Web', icon: 'web' },
    { id: '6', label: 'Ubicación', icon: 'map-marker' },
    { id: '7', label: 'Llamada', icon: 'phone' },
    { id: '8', label: 'Email', icon: 'email' },
    { id: '9', label: 'Documento', icon: 'file-document' },
    { id: '10', label: 'Video', icon: 'play-circle' },
  ],
  'Texto Plain': [
    { id: '1', label: 'WhatsApp', icon: 'whatsapp' },
    { id: '2', label: 'Facebook', icon: 'facebook' },
    { id: '3', label: 'Instagram', icon: 'instagram' },
    { id: '4', label: 'LinkedIn', icon: 'linkedin' },
    { id: '5', label: 'Web', icon: 'web' },
    { id: '6', label: 'Ubicación', icon: 'map-marker' },
    { id: '7', label: 'Llamada', icon: 'phone' },
    { id: '8', label: 'Email', icon: 'email' },
    { id: '9', label: 'Documento', icon: 'file-document' },
    { id: '10', label: 'Video', icon: 'play-circle' },
  ],
  Documento: [
    { id: '1', label: 'WhatsApp', icon: 'whatsapp' },
    { id: '2', label: 'Facebook', icon: 'facebook' },
    { id: '3', label: 'Instagram', icon: 'instagram' },
    { id: '4', label: 'LinkedIn', icon: 'linkedin' },
    { id: '5', label: 'Web', icon: 'web' },
    { id: '6', label: 'Ubicación', icon: 'map-marker' },
    { id: '7', label: 'Llamada', icon: 'phone' },
    { id: '8', label: 'Email', icon: 'email' },
    { id: '9', label: 'Documento', icon: 'file-document' },
    { id: '10', label: 'Video', icon: 'play-circle' },
  ],
};

const ICON_GALLERY = ICONS_BY_TYPE.Enlaces;

const COUNTRY_CODES = [
  { code: '+1', country: 'USA' },
  { code: '+34', country: 'España' },
  { code: '+52', country: 'México' },
  { code: '+44', country: 'UK' },
  { code: '+33', country: 'Francia' },
  { code: '+49', country: 'Alemania' },
  { code: '+55', country: 'Brasil' },
  { code: '+39', country: 'Italia' },
  { code: '+61', country: 'Australia' },
  { code: '+81', country: 'Japón' },
];

// Tamaño máximo de archivos (en bytes)
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024; // 20 MB

const NewInfoForm = ({ onClose, editingData }: { onClose?: () => void; editingData?: Link }) => {
  const [dataType, setDataType] = useState<DataType>('Enlaces');
  const [dataName, setDataName] = useState('');
  const [dataValue, setDataValue] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('1');
  const [countryCode, setCountryCode] = useState('+1');
  
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [iconModalVisible, setIconModalVisible] = useState(false);
  const [faviconUrl, setFaviconUrl] = useState('');
  const [faviconSuggestionVisible, setFaviconSuggestionVisible] = useState(false);
  const [faviconLoading, setFaviconLoading] = useState(false);
  const [lastFaviconDomain, setLastFaviconDomain] = useState('');
  const [customIconUri, setCustomIconUri] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [fileTypeModalVisible, setFileTypeModalVisible] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  
  // Estados para progreso de upload
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadStageLabel, setUploadStageLabel] = useState('Iniciando...');
  const [moderationAlertVisible, setModerationAlertVisible] = useState(false);
  const [moderationAlertMessage, setModerationAlertMessage] = useState('');
  const [rejectionAttempts, setRejectionAttempts] = useState(0);
  const [retryLockedUntil, setRetryLockedUntil] = useState<number | null>(null);
  const [retryCountdownSec, setRetryCountdownSec] = useState(0);
  const retryLockMessage =
    'Estamos cuidando la integridad de la comunidad. Por favor, espera un momento antes de intentar de nuevo';
  const isRetryLocked = retryLockedUntil !== null && retryLockedUntil > Date.now();

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
    setModerationAlertMessage(
      'Parece que tu sonrisa no se ve clara. Intenta de nuevo para asegurar tu acceso premium.'
    );
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
        setCustomIconUri(editingData.icon.includes('google.com/s2/favicons') ? '' : editingData.icon);
      } else {
        // Find icon by label/iconName in the correct type
        const iconsForType = ICONS_BY_TYPE[type];
        if (iconsForType) {
          const iconIndex = iconsForType.findIndex(i => i.label === editingData.iconName);
          if (iconIndex >= 0) {
            setSelectedIcon((iconIndex + 1).toString());
          } else {
            setSelectedIcon('1');
          }
        } else {
          setSelectedIcon('1');
        }
      }
    }
  }, [editingData]);

  // Favicon fetching when URL changes (only if not editing with favicon already)
  useEffect(() => {
    const lookupFavicon = async () => {
      if (dataType !== 'Enlaces' || !dataValue.trim() || editingData?.id) {
        return;
      }

      try {
        const urlObj = new URL(dataValue.startsWith('http') ? dataValue : `https://${dataValue}`);
        const domain = urlObj.hostname.toLowerCase();
        if (!domain || domain === lastFaviconDomain) {
          return;
        }

        setFaviconLoading(true);
        const fetchedIcon = await fetchFaviconFromAzure(dataValue);
        setFaviconLoading(false);

        if (!fetchedIcon) {
          return;
        }

        setLastFaviconDomain(domain);
        setFaviconUrl(fetchedIcon);
        setFaviconSuggestionVisible(true);
      } catch {
        setFaviconLoading(false);
        setFaviconUrl('');
      }
    };

    lookupFavicon();
  }, [dataValue, dataType, selectedIcon, editingData?.id, lastFaviconDomain]);

  // Reset icon and URL when data type changes (but NOT if we're editing)
  useEffect(() => {
    if (!editingData?.id) {
      setSelectedIcon('1');
      setDataValue('');
      setFaviconUrl('');
      setFaviconSuggestionVisible(false);
      setLastFaviconDomain('');
      setCustomIconUri('');
    }
  }, [dataType, editingData?.id]);

  // Close modal
  const handleClose = () => {
    // Reset form
    setDataName('');
    setDataValue('');
    setDataType('Enlaces');
    setSelectedIcon('1');
    setCountryCode('+1');
    setFaviconUrl('');
    setFaviconSuggestionVisible(false);
    setLastFaviconDomain('');
    setCustomIconUri('');
    
    // Call callback
    if (onClose) onClose();
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
          message: `❌ Archivo muy grande (${(fileSizeInBytes / (1024 * 1024)).toFixed(2)} MB).\nMáximo: ${maxSizeInMB} MB`,
        };
      }

      return { valid: true };
    } catch (error) {
      console.error('Error validating file size:', error);
      return { valid: false, message: 'Error al validar tamaño del archivo' };
    }
  };

  // Comprimir imagen a 3x3 pulgadas (72 DPI = 216x216px)
  const compressImage = async (uri: string): Promise<string> => {
    try {
      setIsCompressing(true);
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 216, height: 216 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
      );
      return manipResult.uri;
    } catch (error) {
      console.error('Error compressing image:', error);
      return uri; // Retorna original si hay error
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
        Alert.alert('Permiso denegado', 'Se necesita acceso a fotos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const file = result.assets[0];
        // Validar tamaño antes de comprimir
        const validation = await validateFileSize(file.uri);
        if (!validation.valid) {
          Alert.alert('Archivo muy grande', validation.message || 'El archivo supera el límite permitido');
          setFileTypeModalVisible(false);
          return;
        }
        // Comprimir imagen para mantener costos bajos en upload
        const compressedUri = await compressImage(file.uri);
        setDataValue(compressedUri);
      }
      setFileTypeModalVisible(false);
    } catch (error) {
      console.error('Error picking photo:', error);
      Alert.alert('Error', 'No se pudo seleccionar la foto');
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
      const validation = await validateFileSize(file.uri);
      if (!validation.valid) {
        Alert.alert('Archivo muy grande', validation.message || 'El archivo supera el limite permitido');
        setFileTypeModalVisible(false);
        return;
      }

      setDataValue(file.uri);
      setFileTypeModalVisible(false);
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'No se pudo seleccionar el documento');
    }
  };

  const handlePickManualIcon = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se necesita acceso a fotos para elegir un icono manual');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets.length > 0) {
        setCustomIconUri(result.assets[0].uri);
        setSelectedIcon('favicon');
      }
    } catch (error) {
      console.error('Error picking manual icon:', error);
      Alert.alert('Error', 'No se pudo seleccionar el icono manual');
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
    if (lowerUri.endsWith('.png')) return 'image/png';
    if (lowerUri.endsWith('.heic')) return 'image/heic';
    if (lowerUri.endsWith('.webp')) return 'image/webp';
    if (lowerUri.endsWith('.jpg') || lowerUri.endsWith('.jpeg')) return 'image/jpeg';

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
  ): Promise<string> => {
    try {
      if (!fileUri.startsWith('file://')) {
        return fileUri;
      }

      setUploadProgress(0);
      setUploadStageLabel('Preparando archivo...');
      setIsUploading(true);
      setUploadModalVisible(true);
      setUploadProgress(0.2);
      setUploadStageLabel('Enviando al escudo de seguridad...');

      const uploadResult = await uploadFileWithModeration({
        fileUri,
        ownerUid,
        label: fileLabel,
        fileName: inferFileName(fileUri),
        mimeType: inferMimeType(fileUri),
      });

      setUploadProgress(0.8);
      setUploadStageLabel('Moderando en Azure Content Safety...');
      setUploadProgress(1);
      setUploadStageLabel('Contenido aprobado. Guardando...');

      setTimeout(() => {
        setUploadModalVisible(false);
        setIsUploading(false);
      }, 400);

      return uploadResult.fileId;
    } catch (error) {
      setUploadModalVisible(false);
      setIsUploading(false);
      throw error;
    }
  };

  // Save to Firestore (Create or Update)
  const handleCreate = async () => {
    if (!dataName.trim() || !dataValue.trim()) {
      Alert.alert('❌ Error', 'Completa todos los campos');
      return;
    }

    const biometricOk = await hardLockCheck(
      editingData?.id ? 'actualizar un dato del Búnker' : 'crear un dato en el Búnker',
    );
    if (!biometricOk) {
      return;
    }

    if (isRetryLocked) {
      setModerationAlertMessage(retryLockMessage);
      setModerationAlertVisible(true);
      return;
    }

    setIsSaving(true);
    try {
      const userId = await getActiveUserId();

      if (!userId) {
        Alert.alert('❌ Error', 'No se pudo identificar al usuario activo');
        return;
      }

      const iconData = selectedIcon === 'favicon' 
        ? (customIconUri || faviconUrl)
        : ICONS_BY_TYPE[dataType].find(i => i.id === selectedIcon)?.icon || 'file';
      
      const iconName = selectedIcon === 'favicon'
        ? 'Favicon'
        : ICONS_BY_TYPE[dataType].find(i => i.id === selectedIcon)?.label || 'Sin nombre';

      const normalizedValue =
        dataType === 'Teléfono' && !dataValue.startsWith('+')
          ? `${countryCode}${dataValue}`
          : dataValue;

      const shouldUploadFile =
        dataType === 'Documento' && normalizedValue.startsWith('file://');

      let finalValue = normalizedValue;

      if (shouldUploadFile) {
        const fileId = await uploadFileToModerationBackend(normalizedValue, dataName, userId);
        finalValue = `mongo-gridfs://${fileId}`;
      }
      
      // Crear ID único (timestamp + random)
      const uniqueId = editingData?.id || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const dataPayload = {
        id: uniqueId,
        title: dataName,
        type: dataType,
        value: finalValue,
        iconName: iconName,
        icon: iconData,
        isFavorite: editingData?.isFavorite || false,
        createdAt: editingData?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let cloudSynced = false;
      try {
        if (userId) {
          const cloudDocRef = doc(db, 'users', userId, 'links', uniqueId);
          await setDoc(cloudDocRef, dataPayload);
          await syncVaultUpdateAcrossCards(userId, dataPayload as Link);
          cloudSynced = true;
        }
      } catch (cloudError) {
        console.warn('Cloud sync failed, keeping local cache:', cloudError);
      }

      // Obtener datos existentes
      const existingData = await AsyncStorage.getItem(VAULT_STORAGE_KEY);
      const dataArray = existingData ? JSON.parse(existingData) : [];
      
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
      
      // Guardar en AsyncStorage
      await AsyncStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(dataArray));

      Alert.alert(
        '✅ Éxito',
        cloudSynced
          ? editingData?.id
            ? 'Datos actualizados y sincronizados en la nube'
            : 'Datos guardados y sincronizados en la nube'
          : editingData?.id
            ? 'Datos actualizados en cache local (pendiente nube)'
            : 'Datos guardados en cache local (pendiente nube)'
      );
      
      // Cerrar y refrescar automáticamente
      handleClose();
    } catch (error) {
      console.error('Error saving:', error);
      if (error instanceof ModerationRejectedError) {
        registerModerationReject();
      } else {
        Alert.alert('❌ Error', 'No se pudieron guardar los datos');
      }
    } finally {
      setIsSaving(false);
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

  // Render dynamic field based on data type
  const renderDataField = () => {
    switch (dataType) {
      case 'Enlaces':
        return (
          <View>
            <TextInput
              style={styles.input}
              placeholder="https://example.com"
              placeholderTextColor="#666"
              value={dataValue}
              onChangeText={setDataValue}
            />
            {faviconLoading ? (
              <View style={styles.faviconContainer}>
                <ActivityIndicator size="small" color="#1EA7FF" />
                <Text style={styles.faviconLabel}>Buscando favicon en Azure...</Text>
              </View>
            ) : null}
            {faviconUrl && (
              <View>
                <View style={styles.faviconContainer}>
                  <Image source={{ uri: faviconUrl }} style={styles.faviconImg} />
                  <Text style={styles.faviconLabel}>Favicon detectado</Text>
                </View>
                <Text style={styles.wordCount}>Si no te gusta este logo, usa icono manual.</Text>
              </View>
            )}
          </View>
        );
      case 'Teléfono':
        return (
          <View style={styles.phoneRow}>
            <TouchableOpacity
              style={styles.countryCodeButton}
              onPress={() => setCountryModalVisible(true)}
            >
              <Text style={styles.countryCodeText}>{countryCode}</Text>
              <MaterialCommunityIcons name="chevron-down" color="#1EA7FF" size={18} />
            </TouchableOpacity>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="123 456 7890"
              placeholderTextColor="#666"
              value={dataValue}
              onChangeText={setDataValue}
              keyboardType="phone-pad"
            />
          </View>
        );
      case 'Email':
        return (
          <TextInput
            style={styles.input}
            placeholder="tu@email.com"
            placeholderTextColor="#666"
            value={dataValue}
            onChangeText={setDataValue}
            keyboardType="email-address"
          />
        );
      case 'Texto Plain':
        return (
          <View>
            <TextInput
              style={[styles.input, { minHeight: 100 }]}
              placeholder="Escribe aquí..."
              placeholderTextColor="#666"
              value={dataValue}
              onChangeText={setDataValue}
              multiline
            />
            <Text style={styles.wordCount}>
              {dataValue.split(/\s+/).filter(w => w).length} / 200 palabras
            </Text>
          </View>
        );
      case 'Documento':
        return (
          <View>
            <TouchableOpacity style={styles.documentButton} onPress={handlePickFile}>
              <MaterialCommunityIcons name="image-plus" color="#1EA7FF" size={32} />
              <Text style={styles.documentText}>
                {dataValue ? 'Cambiar archivo' : 'Subir PDF o imagen'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.wordCount}>Se aceptan PDF o imágenes para visor protegido del Búnker.</Text>
            
            {/* PREVIEW del documento/imagen seleccionado */}
            {dataValue && (
              <View style={styles.previewContainer}>
                <Text style={styles.previewLabel}>Vista Previa:</Text>
                {isImageFile(dataName || dataValue) ? (
                  <View style={styles.imagePreview}>
                    <Image 
                      source={{ uri: dataValue }} 
                      style={styles.previewImage}
                      onError={() => console.log('Error loading image')}
                    />
                    <Text style={styles.previewFileName} numberOfLines={1}>
                      {dataName || 'Imagen seleccionada'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.documentPreview}>
                    <MaterialCommunityIcons name={getDocumentIcon(dataValue) as any} color="#1EA7FF" size={48} />
                    <Text style={styles.previewFileName} numberOfLines={1}>
                      {dataName || 'Documento seleccionado'}
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
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
        {/* Header with close button */}
        <View style={styles.headerTop}>
          <Text style={styles.titleMain}>
            {editingData?.id ? 'EDITAR INFORMACIÓN' : 'NUEVA INFORMACIÓN'}
          </Text>
          <TouchableOpacity 
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.closeButton}
          >
            <MaterialCommunityIcons name="close" color="#1EA7FF" size={28} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* TIPO DE DATA */}
          <View style={styles.section}>
            <Text style={styles.stepLabel}>TIPO DE DATO {editingData?.id && '(No editable)'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typePillsRow}>
              {DATA_TYPE_OPTIONS.map((option) => {
                const isActive = dataType === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.typePill, isActive && styles.typePillActive, editingData?.id && styles.typePillDisabled]}
                    onPress={() => {
                      if (editingData?.id) return;
                      setDataType(option.key);
                      setDataValue('');
                    }}
                    disabled={!!editingData?.id}
                  >
                    <Text style={[styles.typePillText, isActive && styles.typePillTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={styles.hint}>
              {editingData?.id ? 'Tipo no puede cambiar al editar' : 'Selector horizontal estilo pill'}
            </Text>
          </View>

          {/* NOMBRE DE DATA */}
          <View style={styles.section}>
            <Text style={styles.stepLabel}>NOMBRE DE DATA</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Mi WhatsApp"
              placeholderTextColor="#666"
              value={dataName}
              onChangeText={setDataName}
            />
          </View>

          {/* DATA */}
          <View style={styles.section}>
            <Text style={styles.stepLabel}>DATA</Text>
            {renderDataField()}
          </View>

          {/* ICONO */}
          <View style={styles.section}>
            <View style={styles.stepHeader}>
              <Text style={styles.stepLabel}>ICONO</Text>
              <TouchableOpacity
                style={styles.editIconBtn}
                onPress={() => setIconModalVisible(true)}
              >
                <MaterialCommunityIcons name="pencil" color="#0A2540" size={18} />
              </TouchableOpacity>
            </View>
            <View style={styles.iconPreview}>
              {selectedIcon === 'favicon' && (customIconUri || faviconUrl) ? (
                <Image source={{ uri: customIconUri || faviconUrl }} style={styles.faviconImg} />
              ) : selectedIcon ? (
                <MaterialCommunityIcons
                  name={ICONS_BY_TYPE[dataType].find(i => i.id === selectedIcon)?.icon as any}
                  color="#1EA7FF"
                  size={48}
                />
              ) : (
                <MaterialCommunityIcons name="image-plus" color="#999" size={40} />
              )}
              <Text style={styles.iconName}>
                {selectedIcon === 'favicon'
                  ? (customIconUri ? 'Icono manual' : 'Favicon')
                  : ICONS_BY_TYPE[dataType].find(i => i.id === selectedIcon)?.label || 'Sin icono'}
              </Text>
              <TouchableOpacity style={styles.manualIconButton} onPress={handlePickManualIcon}>
                <MaterialCommunityIcons name="image-plus" color="#0A2540" size={18} />
                <Text style={styles.manualIconButtonText}>Subir icono manual</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* CREATE/UPDATE BUTTON */}
          <TouchableOpacity 
            style={[styles.createButton, isSaving && styles.createButtonDisabled]} 
            onPress={handleCreate}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <ActivityIndicator size="small" color="#0A2540" />
                <Text style={styles.createButtonText}>SUBIENDO...</Text>
              </>
            ) : (
              <>
                <MaterialCommunityIcons name="check-circle" color="#0A2540" size={24} />
                <Text style={styles.createButtonText}>
                  {editingData?.id ? 'ACTUALIZAR' : 'CREAR'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>

        {/* MODAL: TYPE SELECTOR */}
        <Modal
          visible={typeModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setTypeModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Selecciona Tipo</Text>
                <TouchableOpacity onPress={() => setTypeModalVisible(false)}>
                  <MaterialCommunityIcons name="close" color="#1EA7FF" size={24} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={['Enlaces', 'Teléfono', 'Email', 'Texto Plain', 'Documento'] as DataType[]}
                keyExtractor={item => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      dataType === item && styles.modalItemActive,
                    ]}
                    onPress={() => {
                      setDataType(item);
                      setDataValue('');
                      setTypeModalVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        dataType === item && styles.modalItemTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                    {dataType === item && (
                      <MaterialCommunityIcons name="check" color="#1EA7FF" size={20} />
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
          onRequestClose={() => setFaviconSuggestionVisible(false)}
        >
          <View style={styles.faviconPopupOverlay}>
            <View style={styles.faviconPopupCard}>
              <Text style={styles.faviconPopupTitle}>¿Usar este icono?</Text>
              {faviconUrl ? <Image source={{ uri: faviconUrl }} style={styles.faviconPopupImage} /> : null}
              <View style={styles.faviconPopupActions}>
                <TouchableOpacity
                  style={[styles.faviconPopupButton, styles.faviconConfirmButton]}
                  onPress={() => {
                    setSelectedIcon('favicon');
                    setFaviconSuggestionVisible(false);
                  }}
                >
                  <Text style={styles.faviconConfirmButtonText}>SÍ, USAR</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.faviconPopupButton, styles.faviconCancelButton]}
                  onPress={() => {
                    setSelectedIcon('1');
                    setFaviconSuggestionVisible(false);
                  }}
                >
                  <Text style={styles.faviconCancelButtonText}>NO, CANCELAR</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL: COUNTRY CODE */}
        <Modal
          visible={countryModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCountryModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>País</Text>
                <TouchableOpacity onPress={() => setCountryModalVisible(false)}>
                  <MaterialCommunityIcons name="close" color="#1EA7FF" size={24} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={COUNTRY_CODES}
                keyExtractor={item => item.code}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      setCountryCode(item.code);
                      setCountryModalVisible(false);
                    }}
                  >
                    <Text style={styles.modalItemText}>
                      {item.code} {item.country}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

        {/* MODAL: ICON GALLERY */}
        <Modal
          visible={iconModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setIconModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: SCREEN_HEIGHT * 0.85 }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Elige Icono - {dataType}</Text>
                <TouchableOpacity onPress={() => setIconModalVisible(false)}>
                  <MaterialCommunityIcons name="close" color="#1EA7FF" size={24} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={ICONS_BY_TYPE[dataType]}
                keyExtractor={item => item.id}
                numColumns={5}
                scrollEnabled={true}
                contentContainerStyle={styles.iconGrid}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.iconItem,
                      selectedIcon === item.id && styles.iconItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedIcon(item.id);
                      setIconModalVisible(false);
                    }}
                  >
                    <MaterialCommunityIcons
                      name={item.icon as any}
                      color={selectedIcon === item.id ? '#0A2540' : '#1EA7FF'}
                      size={36}
                    />
                    <Text
                      style={[
                        styles.iconLabel,
                        selectedIcon === item.id && styles.iconLabelSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

        {/* MODAL: ELEGIR FOTOS O DOCUMENTOS */}
        <Modal
          visible={fileTypeModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setFileTypeModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Verificacion Humana</Text>
                <TouchableOpacity onPress={() => setFileTypeModalVisible(false)}>
                  <MaterialCommunityIcons name="close" color="#1EA7FF" size={24} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.fileTypeOption}
                onPress={handlePickPhotos}
                disabled={isCompressing}
              >
                <MaterialCommunityIcons name="image-multiple" color="#1EA7FF" size={40} />
                <Text style={styles.fileTypeText}>Elegir imagen</Text>
                <Text style={styles.fileTypeSubText}>JPG, PNG o HEIC</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.fileTypeOption}
                onPress={handlePickDocument}
                disabled={isCompressing}
              >
                <MaterialCommunityIcons name="file-document-outline" color="#1EA7FF" size={40} />
                <Text style={styles.fileTypeText}>Elegir documento</Text>
                <Text style={styles.fileTypeSubText}>PDF y archivos visualizables</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL: UPLOAD PROGRESS */}
        <Modal
          visible={uploadModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View style={styles.progressOverlay}>
            <View style={styles.progressContainer}>
              <Progress.Circle
                size={140}
                progress={uploadProgress}
                color="#1EA7FF"
                unfilledColor="#0D3A56"
                borderWidth={3}
                thickness={8}
              />
              <Text style={styles.uploadPercentage}>
                {Math.round(uploadProgress * 100)}%
              </Text>
              <Text style={styles.uploadLabel}>
                {uploadStageLabel}
              </Text>
            </View>
          </View>
        </Modal>

        <LuxuryModerationModal
          visible={moderationAlertVisible}
          title="Exclusividad de Seguridad"
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
  container: {
    flex: 1,
    backgroundColor: '#0A2540',
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
  closeButton: {
    padding: 8,
    borderRadius: 8,
  },
  titleMain: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1EA7FF',
    marginBottom: 12,
    letterSpacing: 0.8,
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
  typePill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: '#1EA7FF',
    backgroundColor: '#1A3A52',
  },
  typePillActive: {
    backgroundColor: '#1EA7FF',
  },
  typePillDisabled: {
    opacity: 0.55,
  },
  typePillText: {
    color: '#1EA7FF',
    fontSize: 13,
    fontWeight: '700',
  },
  typePillTextActive: {
    color: '#0A2540',
  },
  dropdownButton: {
    backgroundColor: '#1A3A52',
    borderColor: '#1EA7FF',
    borderWidth: 2,
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
    color: '#FFFFFF',
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
    backgroundColor: '#1A3A52',
    borderColor: '#1EA7FF',
    borderWidth: 1.2,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
    minHeight: 48,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 10,
  },
  countryCodeButton: {
    backgroundColor: '#1A3A52',
    borderColor: '#1EA7FF',
    borderWidth: 1.2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countryCodeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  faviconContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#1A3A52',
    borderRadius: 10,
    alignItems: 'center',
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
    backgroundColor: '#1A3A52',
    borderColor: '#1EA7FF',
    borderWidth: 1.2,
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
    backgroundColor: '#1A3A52',
    borderColor: '#1EA7FF',
    borderWidth: 1.2,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  documentText: {
    color: '#1EA7FF',
    fontSize: 14,
    fontWeight: '600',
  },
  previewContainer: {
    marginTop: 16,
    padding: 14,
    backgroundColor: '#1A3A52',
    borderRadius: 10,
    borderColor: '#1EA7FF',
    borderWidth: 1.2,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1EA7FF',
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
    backgroundColor: '#0A2540',
  },
  documentPreview: {
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  previewFileName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 200,
  },
  iconPreview: {
    backgroundColor: '#1A3A52',
    borderColor: '#1EA7FF',
    borderWidth: 1.2,
    borderRadius: 10,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 12,
  },
  iconName: {
    color: '#1EA7FF',
    fontSize: 13,
    fontWeight: '600',
  },
  manualIconButton: {
    marginTop: 8,
    backgroundColor: '#C5A065',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  manualIconButtonText: {
    color: '#0A2540',
    fontWeight: '700',
    fontSize: 12,
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
    backgroundColor: '#1EA7FF',
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
    color: '#0A2540',
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
  },
  faviconPopupCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
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
    marginBottom: 16,
  },
  faviconPopupActions: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
  },
  faviconPopupButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  faviconConfirmButton: {
    backgroundColor: '#C5A065',
  },
  faviconCancelButton: {
    backgroundColor: '#E9EEF2',
  },
  faviconConfirmButtonText: {
    color: '#0A2540',
    fontSize: 12,
    fontWeight: '800',
  },
  faviconCancelButtonText: {
    color: '#0A2540',
    fontSize: 12,
    fontWeight: '700',
  },
  modalContent: {
    backgroundColor: '#1A3A52',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.65,
    borderTopWidth: 3,
    borderTopColor: '#1EA7FF',
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
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
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 4,
    borderRadius: 10,
    backgroundColor: '#0D3A56',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  iconItemSelected: {
    backgroundColor: '#1EA7FF',
    borderColor: '#1EA7FF',
  },
  iconLabel: {
    fontSize: 9,
    color: '#1EA7FF',
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  iconLabelSelected: {
    color: '#0A2540',
    fontWeight: '700',
  },
  fileTypeOption: {
    backgroundColor: '#0D3A56',
    borderColor: '#1EA7FF',
    borderWidth: 1.2,
    borderRadius: 12,
    padding: 24,
    marginHorizontal: 20,
    marginVertical: 12,
    alignItems: 'center',
    gap: 8,
  },
  fileTypeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  fileTypeSubText: {
    color: '#1EA7FF',
    fontSize: 12,
    marginTop: 4,
  },
  // Progress Upload Styles
  progressOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    backgroundColor: '#1A3A52',
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
});

export default NewInfoForm;

