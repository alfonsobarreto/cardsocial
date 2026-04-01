/**
 * BusinessCard Types
 * Tarjeta de Negocio con validación KYC, geolocalización e integración Social Market
 */

export type BusinessCardLifecycleState =
  | 'draft'
  | 'trial_active'
  | 'active_paid'
  | 'dull'
  | 'purged';

export interface BusinessCard {
  id: string;
  ownerUid: string;
  type: 'business';
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  
  // Ubicación (Mapa Invisible)
  physicalAddress: string;
  latitude: number;  // Coordenadas fijas
  longitude: number;
  city: string;
  postalCode: string;
  
  // Índice de descubrimiento invisible (máximo 20 palabras)
  elevatorPitchWords?: string[];
  elevatorPitch?: string;
  keywords: string[]; // Legacy fallback
  
  // Información adicional
  businessDescription?: string;
  businessLogo?: string; // URL a Azure Blob Storage
  permanent_business_link?: string;
  mapsLink?: string;
  professionalVault?: {
    contractsPdf?: string;
  };
  businessHours?: {
    monday?: string;
    tuesday?: string;
    wednesday?: string;
    thursday?: string;
    friday?: string;
    saturday?: string;
    sunday?: string;
  };
  
  // KYC + Validación
  kycVerified: boolean;
  kycDocumentUrl?: string; // ID documento
  kycApprovedAt?: Date;
  kycTermsAccepted: boolean; // Acuerdo anti-fraude
  
  // Datos de Tarjeta (igual que Personal pero solo datos de negocio)
  vaultDataIds: string[]; // Referencias a elementos en el Vault del usuario
  
  // Rating + Comunidad
  averageRating: number; // 0-5 estrellas
  totalRatings: number;
  negativeRatingsCount: number; // Si llega a 15, auto-ban
  
  // Estado de visibilidad
  isActive: boolean;
  isPublishedToMarket: boolean;
  publishedAt?: Date;
  lastUpdated: Date;
  createdAt: Date;
  
  // Stories VIP
  hasActiveStory?: boolean;
  storyExpiresAt?: Date;
  isPremiumStory?: boolean; // Pagada por 7 días (naranja)
  
  // Metadata
  viewCount: number;
  searchRankScore: number; // Algoritmo interno de relevancia
  distanceFromUser?: number; // Se calcula en búsqueda (millas)
  publicLocationHint?: string; // Sector/ciudad aproximada para Social Market (sin dirección exacta)

  // Lifecycle v1 (Business Card Contract)
  lifecycleVersion?: 'v1';
  lifecycleState?: BusinessCardLifecycleState;
  paymentsQuarantined?: boolean;
  autopayEnabled?: boolean;
  trialConsumedOwner?: boolean;
  trialStartedAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
  annualContractStartedAt?: Date | string | null;
  annualContractEndsAt?: Date | string | null;
  dullStartedAt?: Date | string | null;
  purgeAt?: Date | string | null;
  lastQrUpdate?: Date | string | null;
  nextQrUpdateAllowedAt?: Date | string | null;

  // Compatibilidad legacy (se elimina al cerrar migración total)
  subscriptionExpires?: Date | string | null;
}

export interface KYCValidation {
  businessName: string;
  ownerFullName: string;
  documentType: 'passport' | 'license' | 'id_card';
  documentUrl: string; // Foto subida
  physicalAddress: string;
  termsAccepted: boolean;
}

export interface BusinessCardSearchResult {
  card: BusinessCard;
  distanceMiles: number;
  approxDistanceLabel?: string;
  approxLocationLabel?: string;
  relevanceScore: number; // 0-100, basado en keywords match
  matchedKeywords: string[];
}

export interface SocialMarketSearchParams {
  query: string; // Hasta 3 palabras: "nails hair coloración"
  userLatitude?: number;
  userLongitude?: number;
  radiusMiles?: number; // Default: 5 millas
  sortBy?: 'distance' | 'rating' | 'relevance';
}

export interface AccountRecoveryRequest {
  email: string;
  recoveryMethod: 'email' | 'phone' | 'verification_document';
  timestamp: Date;
  token?: string; // Token temporal para reset
  tokenExpiresAt?: Date;
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number; // Metros
  timestamp: Date;
  userGPSPermissionGranted: boolean;
}
