#!/usr/bin/env node
/**
 * Prueba rápida: borrador de activo Market (MARVEL-001) contra `/api/admin/market_asset_draft`.
 *
 * Ejecutar (ej.): API_BASE=http://localhost:3000/api npx ts-node src/scripts/testMarvelMarketDraft.ts
 */

import axios from 'axios';

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api';
const ADMIN_API = `${API_BASE}/admin`;

async function main() {
  console.log('\n🧪 market_asset_draft smoke test\n');

  const loginRes = await axios.post(`${ADMIN_API}/login`, {
    username: 'admin_pochobs',
    password: 'Arantza11@',
  });

  const token = loginRes.data.token;
  if (!token) throw new Error('No token from login');

  const formData = new FormData();
  formData.append('collection', 'collectibles');
  formData.append('name', 'Marvel Spider-Man');
  formData.append('rarity', 'legendario');
  formData.append('price_cs', '500');
  const placeholderFile = new File(['placeholder'], 'preview.png', { type: 'image/png' });
  formData.append('preview', placeholderFile);

  const draftRes = await axios.post(`${ADMIN_API}/market_asset_draft`, formData, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    },
  });

  const uniqueId = draftRes.data?.unique_id || draftRes.data?.payload?.unique_id;
  const draftId = draftRes.data?.draft_id ?? draftRes.data?.payload?.draft_id;
  if (!uniqueId) throw new Error('No unique_id in response');

  console.log('✅ Draft OK', { uniqueId, draftId });

  if (draftId != null && String(draftId).trim()) {
    await axios.post(
      `${ADMIN_API}/publish_asset`,
      { draft_id: String(draftId), confirm_ready: true },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    console.log('✅ Published OK');
  } else {
    console.log('⚠️  Skipped publish — response had no draft_id (mock JS route?)');
  }
}

main().catch((err) => {
  console.error(err?.response?.data ?? err);
  process.exit(1);
});
