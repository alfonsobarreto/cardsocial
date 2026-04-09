/**
 * BusinessCard Types
 * Tarjeta de Negocio con validación KYC, geolocalización e integración Social Market
 */

import type { PublicCardSlotPayload } from '@/services/qrApi';
import type { IssuerSmartCardPresentation } from '@/types/sharedCardPresentation';

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

  /** Ciclo de suscripción (sin pasarela de cobro aún). */
  subscriptionStatus?: 'trial' | 'active' | 'dull';
  trialEndsAt?: Date | { seconds: number; nanoseconds?: number } | null;
  subscriptionExpiresAt?: Date | { seconds: number; nanoseconds?: number } | null;
  lastQrUpdate?: Date | { seconds: number; nanoseconds?: number } | null;
  /** Origen de lat/lng (p. ej. GPS del dispositivo). */
  locationSource?: string;
  businessTermsAccepted?: boolean;
  /** Misma paleta que Smart Cards (Firestore `businessCards`). */
  themeId?: string;
  /** Conteo mostrado en filas / QR (Firestore). */
  holdersCount?: number;
  /** Facetas resueltas del vault — denormalizadas al crear/editar la tarjeta. */
  marketFacets?: Array<{ type: string; label: string; value: string }>;
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
  /** null = no mostrar millas (sin ubicación / modo ciego) */
  distanceMiles: number | null;
  relevanceScore: number;
  matchedKeywords: string[];
  /** Si es false, la UI no muestra distancia aunque exista número legacy */
  showDistance?: boolean;
  rowSource?: 'received_contact' | 'social_market';
  /** Solo rowSource received_contact: facetas compartidas (email, enlaces WA, etc.). */
  receivedContactFacets?: Array<{ type: string; label: string; value: string }>;
  receivedContactCardName?: string;
  /** Look de la Smart Card del emisor (contactos recibidos en Social Market). */
  issuerPresentation?: IssuerSmartCardPresentation;
  /** Suscriptores de la tarjeta del emisor (solo filas `received_contact`). */
  receivedHoldersCount?: number;
  /** Tarjeta del emisor que posee el viewer (canal Stories / lookup). */
  receivedSourceCardId?: string | null;
  receivedChannelMuted?: boolean;
  /** Slots públicos del emisor (misma carga que Contactos → wireframe espejo). */
  receivedPublicCardSlots?: PublicCardSlotPayload[];
  receivedOwnerOccupation?: string | null;
  /** @nickname del emisor (texto del contacto recibido). */
  receivedIssuerNickname?: string;
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
