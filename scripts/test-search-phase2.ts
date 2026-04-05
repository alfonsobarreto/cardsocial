/**
 * Tests Search & Social Market Hub — Fase 2 (anillos contacto/mercado, facetas, iconos).
 * Ejecutar: npm run test:search-phase2
 */
import assert from 'node:assert/strict';
import { facetIconNameForSearch } from '../services/searchFacetIcons';
import {
  buildMarketCardSearchFacets,
  marketSearchStoryRingState,
  parseStoryExpiryMs,
} from '../services/searchPhase2Logic';
import { buildStoryLookupFromReceivedContacts, resolveSearchRowStoryState } from '../services/storiesPhase1Logic';
import type { BusinessCard } from '../types/businessCard';

/** Stub mínimo para probar solo campos usados por la Fase 2. */
function stubCard(p: Partial<BusinessCard> & Pick<BusinessCard, 'id' | 'ownerUid' | 'businessName'>): BusinessCard {
  const now = new Date();
  return {
    type: 'business',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    physicalAddress: '',
    latitude: 0,
    longitude: 0,
    city: '',
    postalCode: '',
    keywords: [],
    kycVerified: false,
    kycTermsAccepted: false,
    vaultDataIds: [],
    averageRating: 0,
    totalRatings: 0,
    negativeRatingsCount: 0,
    isActive: true,
    isPublishedToMarket: true,
    lastUpdated: now,
    createdAt: now,
    viewCount: 0,
    searchRankScore: 0,
    ...p,
  } as BusinessCard;
}

function run() {
  // --- Fase 1 integración en filas Search (cardId + mute) ---
  const lookup = buildStoryLookupFromReceivedContacts([
    { uid: 'u1', cardId: 'c1', storyState: 'vip', channelMuted: false },
    { uid: 'u2', cardId: 'c2', storyState: 'normal', channelMuted: true },
  ]);

  assert.equal(
    resolveSearchRowStoryState({ uid: 'u1', cardId: 'c1', channelMuted: false }, lookup),
    'vip',
  );
  assert.equal(
    resolveSearchRowStoryState({ uid: 'u2', cardId: 'c2', channelMuted: true }, lookup),
    'none',
    'canal silenciado → sin anillo',
  );

  // --- Mercado: anillo VIP / normal / expirado ---
  assert.equal(
    marketSearchStoryRingState(
      stubCard({
        id: 'm1',
        ownerUid: 'ou',
        businessName: 'B',
        hasActiveStory: false,
      }),
    ),
    'none',
  );

  assert.equal(
    marketSearchStoryRingState(
      stubCard({
        id: 'm2',
        ownerUid: 'ou',
        businessName: 'B',
        hasActiveStory: true,
        isPremiumStory: true,
      }),
    ),
    'vip',
  );

  assert.equal(
    marketSearchStoryRingState(
      stubCard({
        id: 'm3',
        ownerUid: 'ou',
        businessName: 'B',
        hasActiveStory: true,
        isPremiumStory: false,
      }),
    ),
    'normal',
  );

  const past = new Date(Date.now() - 86_400_000);
  assert.equal(
    marketSearchStoryRingState(
      stubCard({
        id: 'm4',
        ownerUid: 'ou',
        businessName: 'B',
        hasActiveStory: true,
        isPremiumStory: true,
        storyExpiresAt: past,
      }),
    ),
    'none',
    'historia caducada → sin anillo',
  );

  const futureSec = Math.floor(Date.now() / 1000) + 3600;
  assert.equal(
    parseStoryExpiryMs(
      stubCard({
        id: 'm5',
        ownerUid: 'ou',
        businessName: 'B',
        storyExpiresAt: { seconds: futureSec } as unknown as Date,
      }),
    ),
    futureSec * 1000,
  );

  // --- Facetas mercado (orden y mapa por coordenadas si no hay mapsLink) ---
  const facets = buildMarketCardSearchFacets(
    stubCard({
      id: 'f1',
      ownerUid: 'ou',
      businessName: 'Salón',
      ownerEmail: 'a@b.co',
      ownerPhone: '+1 234',
      mapsLink: '',
      latitude: 10.5,
      longitude: -66.9,
      professionalVault: { contractsPdf: 'https://x/p.pdf' },
      permanent_business_link: 'https://biz.example',
    }),
  );
  const types = facets.map((f) => f.type);
  assert.ok(types.includes('email'));
  assert.ok(types.includes('teléfono'));
  assert.ok(types.includes('mapa'));
  assert.ok(facets.some((f) => f.type === 'mapa' && f.value.includes('10.5') && f.value.includes('-66.9')));
  assert.ok(types.includes('pdf'));
  assert.ok(types.includes('enlace'));

  assert.deepEqual(
    buildMarketCardSearchFacets(
      stubCard({ id: 'f2', ownerUid: 'ou', businessName: 'Empty', latitude: 0, longitude: 0 }),
    ),
    [],
  );

  // --- Iconos de faceta (sin acentos / sin RN) ---
  assert.equal(facetIconNameForSearch('WhatsApp'), 'whatsapp');
  assert.equal(facetIconNameForSearch('Correo'), 'email-outline');
  assert.equal(facetIconNameForSearch('Ubicación'), 'map-marker');
  assert.equal(facetIconNameForSearch('PDF documento'), 'file-pdf-box');
  assert.equal(facetIconNameForSearch('Enlace web'), 'link-variant');
  assert.equal(facetIconNameForSearch('Teléfono'), 'phone-in-talk');
  assert.equal(facetIconNameForSearch('teléfono'), 'phone-in-talk');
  assert.equal(facetIconNameForSearch('texto libre'), 'text-box-outline');
  assert.equal(facetIconNameForSearch('otro'), 'card-account-details-outline');

  console.log('Search Fase 2: todas las aserciones OK.');
}

run();
