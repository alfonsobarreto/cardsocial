import {
  ref,
  listAll,
  getBytes,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import { storage } from '@/services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebaseConfig';

/**
 * Icon Library Service
 * 
 * Gestiona conectividad con Firebase Storage para iconos dinámicos
 * Rutas: /free-icons/{category}/ y /premium-icons/{category}/
 */

export interface IconLibraryItem {
  id: string;
  name: string;
  url: string;
  category: string;
  type: 'free' | 'premium';
  uploadedBy?: string;
  uploadedAt?: Date;
}

export interface IconCategory {
  name: string;
  icons: IconLibraryItem[];
}

/**
 * Obtiene todos los iconos GRATIS disponibles
 */
export const getFreeIcons = async (): Promise<IconLibraryItem[]> => {
  try {
    const freeIconsRef = ref(storage, 'free-icons');
    const result = await listAll(freeIconsRef);

    const icons: IconLibraryItem[] = [];

    // Iterar sobre todas las carpetas de categoría
    for (const categoryRef of result.prefixes) {
      const categoryName = categoryRef.name;
      const categoryResult = await listAll(categoryRef);

      // Obtener todos los archivos en la categoría
      for (const fileRef of categoryResult.items) {
        try {
          const url = await getDownloadURL(fileRef);
          icons.push({
            id: fileRef.name,
            name: fileRef.name.split('.')[0],
            url,
            category: categoryName,
            type: 'free',
          });
        } catch (error) {
          console.warn(`Could not get URL for ${fileRef.name}:`, error);
        }
      }
    }

    return icons;
  } catch (error) {
    console.error('Error fetching free icons:', error);
    return [];
  }
};

/**
 * Obtiene todos los iconos PREMIUM (requiere validación de rol)
 */
export const getPremiumIcons = async (): Promise<IconLibraryItem[]> => {
  try {
    const premiumIconsRef = ref(storage, 'premium-icons');
    const result = await listAll(premiumIconsRef);

    const icons: IconLibraryItem[] = [];

    for (const categoryRef of result.prefixes) {
      const categoryName = categoryRef.name;
      const categoryResult = await listAll(categoryRef);

      for (const fileRef of categoryResult.items) {
        try {
          const url = await getDownloadURL(fileRef);
          icons.push({
            id: fileRef.name,
            name: fileRef.name.split('.')[0],
            url,
            category: categoryName,
            type: 'premium',
          });
        } catch (error) {
          console.warn(`Could not get URL for ${fileRef.name}:`, error);
        }
      }
    }

    return icons;
  } catch (error) {
    console.error('Error fetching premium icons:', error);
    return [];
  }
};

/**
 * Obtiene iconos disponibles basado en el rol del usuario
 */
export const getAvailableIcons = async (): Promise<IconLibraryItem[]> => {
  try {
    const freeIcons = await getFreeIcons();
    const premiumIcons = await getPremiumIcons();
    return [...freeIcons, ...premiumIcons];
  } catch (error) {
    console.error('Error getting available icons:', error);
    return await getFreeIcons();
  }
};

/**
 * Obtiene un icono específico por categoría y nombre
 */
export const getIconsByCategory = async (
  category: string,
  _userIsPremium: boolean
): Promise<IconLibraryItem[]> => {
  try {
    const icons: IconLibraryItem[] = [];

    // Obtener iconos gratis de la categoría
    const freeRef = ref(storage, `free-icons/${category}`);
    try {
      const freeResult = await listAll(freeRef);
      for (const fileRef of freeResult.items) {
        try {
          const url = await getDownloadURL(fileRef);
          icons.push({
            id: fileRef.name,
            name: fileRef.name.split('.')[0],
            url,
            category,
            type: 'free',
          });
        } catch (error) {
          console.warn(`Could not get URL for free icon ${fileRef.name}:`, error);
        }
      }
    } catch (error) {
      // Categoría no existe
    }

    // En Lujo Masivo, los iconos premium también están disponibles para todos.
    const premiumRef = ref(storage, `premium-icons/${category}`);
    try {
      const premiumResult = await listAll(premiumRef);
      for (const fileRef of premiumResult.items) {
        try {
          const url = await getDownloadURL(fileRef);
          icons.push({
            id: fileRef.name,
            name: fileRef.name.split('.')[0],
            url,
            category,
            type: 'premium',
          });
        } catch (error) {
          console.warn(`Could not get URL for premium icon ${fileRef.name}:`, error);
        }
      }
    } catch (error) {
      // Categoría no existe
    }

    return icons;
  } catch (error) {
    console.error(`Error getting icons for category ${category}:`, error);
    return [];
  }
};

/**
 * Obtiene una URL de icono de descarga directo
 */
export const getIconPreview = async (
  iconPath: string
): Promise<string | null> => {
  try {
    const iconRef = ref(storage, iconPath);
    return await getDownloadURL(iconRef);
  } catch (error) {
    console.error('Error getting icon preview:', error);
    return null;
  }
};

/**
 * ADMIN ONLY: Sube un nuevo icono a Firebase Storage
 * Ruta: /{type}-icons/{category}/{filename}
 */
export const uploadIconAsAdmin = async (
  fileUri: string,
  fileName: string,
  category: string,
  type: 'free' | 'premium',
  userId: string,
  rarity: 'common' | 'rare' | 'epic' | 'legendary' = 'common',
): Promise<{ success: boolean; url?: string; error?: string }> => {
  try {
    // Validar que es admin
    const adminDoc = await getDoc(doc(db, 'users', userId));
    if (!adminDoc.exists() || adminDoc.data().role !== 'super_admin') {
      return {
        success: false,
        error: 'Solo administradores pueden subir iconos',
      };
    }

    // Convertir URI a blob
    const response = await fetch(fileUri);
    const blob = await response.blob();

    // Determinar tipo MIME
    const mimeType = blob.type || 'image/png';

    // Generar nombre único
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}-${fileName}`;

    // Ruta nueva: /assets/icons/{category}/{rarity}/{timestamp}-{filename}
    const storagePath = `assets/icons/${category}/${rarity}/${uniqueFileName}`;
    const fileRef = ref(storage, storagePath);

    // Subir archivo
    const snapshot = await uploadBytes(fileRef, blob, {
      contentType: mimeType,
    });

    // Obtener URL de descarga
    const downloadUrl = await getDownloadURL(snapshot.ref);

    console.log(`✅ Icon uploaded to: ${storagePath}`);

    return {
      success: true,
      url: downloadUrl,
    };
  } catch (error) {
    console.error('Error uploading icon:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
};

/**
 * ADMIN ONLY: Obtiene las categorías disponibles
 */
export const getIconCategories = async (): Promise<string[]> => {
  try {
    const categories = new Set<string>();

    const assetsIconsRef = ref(storage, 'assets/icons');
    const assetsResult = await listAll(assetsIconsRef);
    assetsResult.prefixes.forEach((prefix) => {
      categories.add(prefix.name);
    });

    if (categories.size === 0) {
      // Fallback legacy
      const freeRef = ref(storage, 'free-icons');
      const freeResult = await listAll(freeRef);
      freeResult.prefixes.forEach((prefix) => {
        categories.add(prefix.name);
      });

      const premiumRef = ref(storage, 'premium-icons');
      const premiumResult = await listAll(premiumRef);
      premiumResult.prefixes.forEach((prefix) => {
        categories.add(prefix.name);
      });
    }

    return Array.from(categories).sort();
  } catch (error) {
    console.error('Error getting icon categories:', error);
    return [];
  }
};
