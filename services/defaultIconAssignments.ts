/**
 * Default Icon Assignments
 * 
 * Mapeo de iconos gratis para datos por defecto
 * Estos se asignan automáticamente cuando se crean los 3 datos por defecto
 */

export interface DefaultIconAssignment {
  dataType: string;
  category: string;
  fileName: string;
  isFree: boolean;
}

/**
 * Iconos por defecto que se asignan automáticamente
 * Estos apuntan a archivos en /free-icons/
 */
export const DEFAULT_ICON_ASSIGNMENTS: Record<string, DefaultIconAssignment> = {
  phone: {
    dataType: 'phone',
    category: 'communication',
    fileName: 'phone-default.png', // Se busca en /free-icons/communication/
    isFree: true,
  },
  email: {
    dataType: 'email',
    category: 'communication',
    fileName: 'email-default.png', // Se busca en /free-icons/communication/
    isFree: true,
  },
  social: {
    dataType: 'social',
    category: 'social',
    fileName: 'instagram-default.png', // Se busca en /free-icons/social/
    isFree: true,
  },
};

/**
 * Obtiene la asignación de icono por defecto para un tipo de dato
 */
export const getDefaultIconAssignment = (
  dataType: string
): DefaultIconAssignment | null => {
  return DEFAULT_ICON_ASSIGNMENTS[dataType.toLowerCase()] || null;
};

/**
 * Construye la ruta completa del icono basada en la asignación
 */
export const buildIconPath = (assignment: DefaultIconAssignment): string => {
  const typeFolder = assignment.isFree ? 'free-icons' : 'premium-icons';
  return `/${typeFolder}/${assignment.category}/${assignment.fileName}`;
};
