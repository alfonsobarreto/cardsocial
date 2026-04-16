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
function stubCard(p: Partial<BusinessCard> & Pick<BusinessCard, 'bId' | 'uid' | 'bcName'>): BusinessCard {
  const now = new Date();
  return {
    type: 'business',
    bcContactName: '',
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
        bId: 'm1',
        uid: 'ou',
        bcName: 'B',
        hasActiveStory: false,
      }),
    ),
    'none',
  );

  assert.equal(
    marketSearchStoryRingState(
      stubCard({
        bId: 'm2',
        uid: 'ou',
        bcName: 'B',
        hasActiveStory: true,
        isPremiumStory: true,
      }),
    ),
    'vip',
  );

  assert.equal(
    marketSearchStoryRingState(
      stubCard({
        bId: 'm3',
        uid: 'ou',
        bcName: 'B',
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
        bId: 'm4',
        uid: 'ou',
        bcName: 'B',
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
        bId: 'm5',
        uid: 'ou',
        bcName: 'B',
        storyExpiresAt: { seconds: futureSec } as unknown as Date,
      }),
    ),
    futureSec * 1000,
  );

  // --- Facetas mercado: solo lo guardado en `marketFacets` (sin inventar desde campos planos) ---
  const sampleFacets = [
    { type: 'email', label: 'Correo', value: 'a@b.co', iconName: 'email-outline' },
    { type: 'teléfono', label: 'Tel', value: '+1 234', iconName: 'phone-in-talk' },
    {
      type: 'mapa',
      label: 'Ubicación',
      value: 'https://www.google.com/maps?q=10.5,-66.9',
      iconName: 'map-marker',
    },
    { type: 'pdf', label: 'Doc', value: 'https://x/p.pdf', iconName: 'file-pdf-box' },
    { type: 'enlace', label: 'Web', value: 'https://biz.example', iconName: 'link-variant' },
  ];
  const facets = buildMarketCardSearchFacets(
    stubCard({
      bId: 'f1',
      uid: 'ou',
      bcName: 'Salón',
      marketFacets: sampleFacets,
    }),
  );
  assert.deepEqual(facets, sampleFacets);

  assert.deepEqual(
    buildMarketCardSearchFacets(
      stubCard({ bId: 'f2', uid: 'ou', bcName: 'Empty', latitude: 0, longitude: 0 }),
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
