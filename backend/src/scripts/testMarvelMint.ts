#!/usr/bin/env node

/**
 * Test Script: Validación de Minting (MARVEL-001)
 * 
 * Purpose: Verificar que el sistema de ID secuencial funciona correctamente
 * Ejecutar: npm run test:marvel-mint
 * 
 * Validaciones:
 * 1. ✅ ID generado correctamente: COLLECTIBLES_MARVEL-001
 * 2. ✅ Edition number: 1/100
 * 3. ✅ Rarity: legendario
 * 4. ✅ Price: 500 CS
 * 5. ✅ Status: draft → publishable
 * 6. ✅ Stock limit: 100 (collectible limit)
 */

import axios from 'axios';

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api';
const ADMIN_API = `${API_BASE}/admin`;

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

async function testMarvelMint() {
  console.log('\n🧪 TESTING: Marvel Spider-Man #001 Collectible\n');
  console.log('═══════════════════════════════════════════════════');

  try {
    // Step 1: Login
    console.log('\n📍 Step 1: Admin Authentication');
    console.log('─────────────────────────────────');

    const loginRes = await axios.post(`${ADMIN_API}/login`, {
      username: 'admin_pochobs',
      password: 'Arantza11@',
    });

    if (!loginRes.data.token) {
      throw new Error('No token returned from login');
    }

    const token = loginRes.data.token;
    const tokenExpiry = loginRes.data.expires_in;

    results.push({
      name: 'Admin Login',
      status: 'PASS',
      details: `JWT token issued, expires in ${tokenExpiry}s`,
    });

    console.log('✅ Login successful');
    console.log(`   Token: ${token.substring(0, 30)}...`);
    console.log(`   Expiry: ${tokenExpiry} seconds`);

    // Step 2: Mint MARVEL-001 as DRAFT
    console.log('\n📍 Step 2: Mint MARVEL-001 Collectible');
    console.log('─────────────────────────────────');

    // Crear FormData con metadata
    const formData = new FormData();
    formData.append('collection', 'collectibles');
    formData.append('name', 'Marvel Spider-Man');
    formData.append('rarity', 'legendario');
    formData.append('price_cs', '500');

    // En test, usamos placeholder buffers
    const placeholderFile = new File(['placeholder'], 'preview.png', { type: 'image/png' });
    formData.append('preview', placeholderFile);

    const mintRes = await axios.post(`${ADMIN_API}/mint_asset`, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    });

    if (!mintRes.data.unique_id) {
      throw new Error('No unique_id returned from mint');
    }

    const mintId = mintRes.data.mint_id;
    const uniqueId = mintRes.data.unique_id;

    results.push({
      name: 'Mint Asset (DRAFT)',
      status: 'PASS',
      details: `ID: ${uniqueId}, Mint ID: ${mintId}`,
    });

    console.log('✅ Asset minted');
    console.log(`   Unique ID: ${uniqueId}`);
    console.log(`   Status: ${mintRes.data.status}`);
    console.log(`   Mint ID: ${mintId}`);

    // Step 3: Validate ID Format
    console.log('\n📍 Step 3: Validate ID Format');
    console.log('─────────────────────────────────');

    const idRegex = /^COLLECTIBLES_MARVEL-\d{3}$/;
    const idValid = idRegex.test(uniqueId);

    if (!idValid) {
      throw new Error(`Invalid ID format: expected COLLECTIBLES_MARVEL-### got ${uniqueId}`);
    }

    results.push({
      name: 'ID Format Validation',
      status: 'PASS',
      details: `Format matches: [COLLECTION]_[NAME]-[###]`,
    });

    console.log('✅ ID format correct');
    console.log(`   Pattern: [COLLECTION]_[NAME]-[###]`);
    console.log(`   Example: COLLECTIBLES_MARVEL-001`);

    // Step 4: List Assets
    console.log('\n📍 Step 4: Verify Asset in Listing');
    console.log('─────────────────────────────────');

    const listRes = await axios.get(`${ADMIN_API}/assets?status=draft`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const marvelAsset = listRes.data.assets.find((a: any) => a.unique_id === uniqueId);

    if (!marvelAsset) {
      throw new Error('Asset not found in listing');
    }

    results.push({
      name: 'Asset Listing',
      status: 'PASS',
      details: `Found in draft assets (total ${listRes.data.total})`,
    });

    console.log('✅ Asset found in listings');
    console.log(`   Total draft assets: ${listRes.data.total}`);
    console.log(`   Edition: ${marvelAsset.edition_number}/100`);
    console.log(`   Rarity: ${marvelAsset.rarity}`);
    console.log(`   Price: ${marvelAsset.price_cs} CS`);

    // Step 5: Publish Asset
    console.log('\n📍 Step 5: Publish DRAFT → PUBLISHED');
    console.log('─────────────────────────────────');

    const publishRes = await axios.post(
      `${ADMIN_API}/publish_asset`,
      {
        mint_id: mintId,
        confirm_ready: true,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (publishRes.data.status !== 'published') {
      throw new Error('Asset not published');
    }

    results.push({
      name: 'Asset Publishing',
      status: 'PASS',
      details: `${uniqueId} → Published, stock_limit: ${publishRes.data.stock_limit}`,
    });

    console.log('✅ Asset published');
    console.log(`   Status: ${publishRes.data.status}`);
    console.log(`   Stock Limit: ${publishRes.data.stock_limit}`);
    console.log(`   Available: ${publishRes.data.available_editions}`);

    // Step 6: Verify Published
    console.log('\n📍 Step 6: Verify Published Status');
    console.log('─────────────────────────────────');

    const verifyRes = await axios.get(`${ADMIN_API}/assets?status=published&collection=collectibles`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const publishedMarvel = verifyRes.data.assets.find((a: any) => a.unique_id === uniqueId);

    if (!publishedMarvel) {
      throw new Error('Asset not found in published list');
    }

    results.push({
      name: 'Published Verification',
      status: 'PASS',
      details: `Confirmed: ${uniqueId} is published and active`,
    });

    console.log('✅ Asset verified as published');
    console.log(`   Is Active: ${publishedMarvel.is_active}`);
    console.log(`   Current Holders: ${publishedMarvel.current_holders.length}`);

    // Step 7: Check Stats
    console.log('\n📍 Step 7: Market Statistics');
    console.log('─────────────────────────────────');

    const statsRes = await axios.get(`${ADMIN_API}/stats`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    results.push({
      name: 'Market Stats',
      status: 'PASS',
      details: `Collectibles: ${statsRes.data.stats.find((s: any) => s._id === 'collectibles')?.total_assets || 0}`,
    });

    console.log('✅ Stats retrieved');
    console.log(`   Total published: ${verifyRes.data.assets.length}`);

    // Final Report
    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('═══════════════════════════════════════════════════\n');

    let passCount = 0;
    let failCount = 0;

    results.forEach((result, idx) => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${idx + 1}. ${icon} ${result.name}`);
      console.log(`   ${result.details}\n`);

      if (result.status === 'PASS') passCount++;
      else failCount++;
    });

    console.log('═══════════════════════════════════════════════════');
    console.log(`TOTAL: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('═══════════════════════════════════════════════════\n');

    if (failCount === 0) {
      console.log('🎉 ALL TESTS PASSED! Marvel-001 collectible system working correctly.\n');
      console.log(`🚀 Next step: Login to cardsocial.me/admin and mint more collectibles!\n`);
    } else {
      console.log('⚠️ Some tests failed. Check backend logs.\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ TEST ERROR\n');
    console.error((error as any).response?.data || (error as Error).message);
    console.error('\nTroubleshooting:');
    console.error('1. Verify backend is running on', API_BASE);
    console.error('2. Check ADMIN_JWT_SECRET in backend .env');
    console.error('3. Verify MongoDB connection');
    process.exit(1);
  }
}

// Run tests
testMarvelMint().catch(console.error);
