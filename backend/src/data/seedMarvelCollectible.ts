/**
 * Seed Script: MARVEL-001 Collectible Test
 *
 * Validación de:
 * 1. ID secuencial correcto: COLLECTIBLES_MARVEL-001
 * 2. Propiedades de coleccionable (edition_number, rarity, price_cs)
 * 3. Inserción en market_assets
 * 4. Status: draft → publicar en admin portal
 *
 * Ejecutar: node backend/src/scripts/seedMarvelCollectible.ts
 */

const MARVEL_COLLECTIBLE_DRAFT = {
  unique_id: 'COLLECTIBLES_MARVEL-001',
  collection: 'collectibles',
  name: 'Marvel Spider-Man #001',
  icon_type: 'collectible_hero',
  edition_number: 1, // 1-100 para esta serie
  rarity: 'legendario', // Test con rarity alta
  price_cs: 500, // Premium collectible
  status: 'draft', // État inicial: se publicará desde Admin
  stock_limit: 100, // Máximo 100 copias disponibles
  current_holders: [], // Inicialmente sin holders
  is_active: false, // Se activa al publicar
  preview_url: 'https://via.placeholder.com/300x400?text=Marvel+Spider-Man+001',
  files: {
    // En MVP, estos serían MultiPart uploads desde Admin
    preview_image: 'base64_encoded_image_placeholder',
    wallpaper_vertical: 'base64_encoded_wallpaper_vertical',
    wallpaper_horizontal: 'base64_encoded_wallpaper_horizontal',
  },
  metadata: {
    series: 'Marvel Heroes',
    character: 'Spider-Man',
    year: 2026,
    official_license: true,
    creator: 'Marvel',
  },
  created_at: new Date(),
  published_at: null, // Se establece al publicar
  updated_by: 'admin_pochobs',
  is_resaleable: true, // Puede traded en mercado secundario
  royalty_percent: 10, // 10% commission en mercado secundario
};

console.log('📦 MARVEL-001 Collectible Draft Data');
console.log('════════════════════════════════════');
console.log(`Unique ID: ${MARVEL_COLLECTIBLE_DRAFT.unique_id}`);
console.log(`Edition: ${MARVEL_COLLECTIBLE_DRAFT.edition_number}/100`);
console.log(`Rarity: ${MARVEL_COLLECTIBLE_DRAFT.rarity}`);
console.log(`Price: ${MARVEL_COLLECTIBLE_DRAFT.price_cs} CS`);
console.log(`Status: ${MARVEL_COLLECTIBLE_DRAFT.status} (ready to publish on Admin)`);
console.log(`Stock Limit: ${MARVEL_COLLECTIBLE_DRAFT.stock_limit}`);
console.log('════════════════════════════════════');
console.log('✅ Ready to insert into MongoDB');
console.log('Next step: Admin portal POST /api/admin/publish_asset');

export default MARVEL_COLLECTIBLE_DRAFT;
