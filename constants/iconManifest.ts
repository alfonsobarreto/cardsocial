/**
 * iconManifest.ts - Catálogo centralizado de iconos para el Vault
 * Los iconos se cargan localmente desde assets/icons/vault/ + IconScout premium
 * Esto asegura carga instantánea sin dependencia de URLs externas
 */

export interface IconEntry {
  id: string; // Identificador único (ej: 'whatsapp', 'telegram', 'linkedin')
  label: string; // Nombre mostrado al usuario
  iconType: 'fontAwesome' | 'materialCommunity' | 'local'; // Fuente del icono
  iconName?: string; // Para iconos de librerías (ej: 'whatsapp')
  localPath?: string; // Para iconos locales (ej: 'assets/icons/vault/mism-logo.png')
  color?: string; // Color en Azul/Dorado (ej: '#070226')
  backgroundColor?: string; // Fondo opcional
  category: 'messaging' | 'social' | 'business' | 'productivity' | 'custom'; // Categoría
  isPremium: boolean; // Premium solo si isPremium=true
  description?: string; // Tooltip
}

export const ICON_MANIFEST: IconEntry[] = [
  // ============ MESSAGING (Mensajería)
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    iconType: 'fontAwesome',
    iconName: 'whatsapp',
    color: '#25D366',
    category: 'messaging',
    isPremium: false,
    description: 'Mensajería instantánea',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    iconType: 'fontAwesome',
    iconName: 'telegram',
    color: '#0088CC',
    category: 'messaging',
    isPremium: false,
    description: 'Mensajería segura',
  },
  {
    id: 'sms',
    label: 'SMS',
    iconType: 'materialCommunity',
    iconName: 'message-text',
    color: '#070226',
    category: 'messaging',
    isPremium: false,
    description: 'Mensaje de texto',
  },

  // ============ SOCIAL (Redes Sociales - Premium Azul/Dorado)
  {
    id: 'instagram',
    label: 'Instagram',
    iconType: 'fontAwesome',
    iconName: 'instagram',
    color: '#E1306C',
    category: 'social',
    isPremium: true,
    description: 'Red social de fotos',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    iconType: 'fontAwesome',
    iconName: 'tiktok',
    color: '#000000',
    category: 'social',
    isPremium: true,
    description: 'Videos cortos',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    iconType: 'fontAwesome',
    iconName: 'linkedin',
    color: '#0A66C2',
    category: 'social',
    isPremium: true,
    description: 'Red profesional',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    iconType: 'fontAwesome',
    iconName: 'facebook',
    color: '#1877F2',
    category: 'social',
    isPremium: false,
    description: 'Red social',
  },
  {
    id: 'twitter',
    label: 'Twitter/X',
    iconType: 'fontAwesome',
    iconName: 'twitter',
    color: '#000000',
    category: 'social',
    isPremium: false,
    description: 'Red de tweets',
  },

  // ============ BUSINESS (Negocios - Premium Dorado)
  {
    id: 'email',
    label: 'Email',
    iconType: 'materialCommunity',
    iconName: 'email',
    color: '#070226',
    category: 'business',
    isPremium: false,
    description: 'Correo electrónico',
  },
  {
    id: 'phone',
    label: 'Teléfono',
    iconType: 'materialCommunity',
    iconName: 'phone',
    color: '#070226',
    category: 'business',
    isPremium: false,
    description: 'Llamada',
  },
  {
    id: 'website',
    label: 'Sitio Web',
    iconType: 'materialCommunity',
    iconName: 'globe',
    color: '#7A42FF', // Dorado
    category: 'business',
    isPremium: true,
    description: 'Página web personal',
  },
  {
    id: 'maps',
    label: 'Google Maps',
    iconType: 'materialCommunity',
    iconName: 'map-marker',
    color: '#EA4335',
    category: 'business',
    isPremium: true,
    description: 'Ubicación',
  },
  {
    id: 'calendar',
    label: 'Calendario',
    iconType: 'materialCommunity',
    iconName: 'calendar',
    color: '#070226',
    category: 'business',
    isPremium: true,
    description: 'Agendar cita',
  },

  // ============ PRODUCTIVITY (Productividad - Premium Azul)
  {
    id: 'zoom',
    label: 'Zoom',
    iconType: 'local',
    localPath: 'assets/icons/vault/zoom-icon.png',
    color: '#0B5CFF',
    category: 'productivity',
    isPremium: true,
    description: 'Videollamada',
  },
  {
    id: 'google-drive',
    label: 'Google Drive',
    iconType: 'local',
    localPath: 'assets/icons/vault/gdrive-icon.png',
    color: '#3B82F6',
    category: 'productivity',
    isPremium: true,
    description: 'Almacenamiento en la nube',
  },
  {
    id: 'paypal',
    label: 'PayPal',
    iconType: 'local',
    localPath: 'assets/icons/vault/paypal-icon.png',
    color: '#003087',
    category: 'productivity',
    isPremium: true,
    description: 'Pago digital',
  },

  // ============ CUSTOM (Personalizados - Mi Sueño Mexicano + Usuario)
  {
    id: 'mism-properties',
    label: 'Mi Sueño Mexicano',
    iconType: 'local',
    localPath: 'assets/icons/vault/mism-logo.png', // Espacio para logo MISM
    color: '#7A42FF', // Dorado
    backgroundColor: '#070226', // Azul
    category: 'custom',
    isPremium: true,
    description: 'Portal de propiedades',
  },
  {
    id: 'custom-user',
    label: 'Personalizado',
    iconType: 'materialCommunity',
    iconName: 'plus-circle',
    color: '#7A42FF', // Dorado
    category: 'custom',
    isPremium: true,
    description: 'Agregar icono personalizado',
  },
];

/**
 * Función auxiliar para obtener icono por ID
 */
export function getIconById(id: string): IconEntry | undefined {
  return ICON_MANIFEST.find(icon => icon.id === id);
}

/**
 * Función para filtrar iconos según permiso premium
 */
export function filterIconsByPremium(isPremium: boolean): IconEntry[] {
  return ICON_MANIFEST.filter(icon => {
    if (!isPremium && icon.isPremium) return false;
    return true;
  });
}

/**
 * Función para agrupar iconos por categoría
 */
export function groupIconsByCategory(): Record<string, IconEntry[]> {
  const grouped: Record<string, IconEntry[]> = {};
  ICON_MANIFEST.forEach(icon => {
    if (!grouped[icon.category]) {
      grouped[icon.category] = [];
    }
    grouped[icon.category].push(icon);
  });
  return grouped;
}
