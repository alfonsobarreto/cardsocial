/**
 * Tests Stories Fase 1 (lógica de canal por tarjeta + filtro Bunker).
 * Ejecutar: node scripts/test-stories-phase1.mjs
 */
import assert from 'node:assert/strict';

function storyChannelKey(uid, sOrB) {
  return `${String(uid || '').trim()}::${String(sOrB || '').trim()}`;
}

function filterVaultItemsByCardItemIds(vaultItems, cardItemIds) {
  const allowed = new Set(cardItemIds.map((id) => String(id).trim()).filter(Boolean));
  return vaultItems.filter((item) => allowed.has(String(item.id || '').trim()));
}

function resolveContactStoryState({
  uid,
  sOrBForStory,
  muteKey,
  mutedCardKeys,
  storyCardByKey,
  storyByOwner,
}) {
  if (sOrBForStory && mutedCardKeys.has(muteKey)) {
    return 'none';
  }
  if (sOrBForStory) {
    return storyCardByKey.get(muteKey) || 'none';
  }
  return storyByOwner.get(uid) || 'none';
}

function run() {
  assert.equal(storyChannelKey('userA', 'card-1'), 'userA::card-1');
  assert.equal(storyChannelKey('  u  ', '  c  '), 'u::c');

  const vault = [
    { id: 'i1', title: 'Email' },
    { id: 'i2', title: 'Ghost' },
    { id: 'i3', title: 'Otro' },
  ];
  const filtered = filterVaultItemsByCardItemIds(vault, ['i2', 'i3']);
  assert.deepEqual(filtered.map((x) => x.id), ['i2', 'i3']);
  assert.equal(filterVaultItemsByCardItemIds(vault, []).length, 0);

  const emitterUid = 'emitter';
  const sidGym = 'card_gym';
  const sidBank = 'card_bank';
  const muteKeyGym = storyChannelKey(emitterUid, sidGym);
  const storyCardByKey = new Map([[muteKeyGym, 'vip']]);
  const storyByOwner = new Map([[emitterUid, 'normal']]);

  const stateGym = resolveContactStoryState({
    uid: emitterUid,
    sOrBForStory: sidGym,
    muteKey: muteKeyGym,
    mutedCardKeys: new Set(),
    storyCardByKey,
    storyByOwner,
  });
  assert.equal(stateGym, 'vip');

  const muteKeyBank = storyChannelKey(emitterUid, sidBank);
  const stateBank = resolveContactStoryState({
    uid: emitterUid,
    sOrBForStory: sidBank,
    muteKey: muteKeyBank,
    mutedCardKeys: new Set(),
    storyCardByKey,
    storyByOwner,
  });
  assert.equal(stateBank, 'none', 'no debe heredar story_states global cuando ya hay clave de tarjeta (sid/bId)');

  const stateLegacy = resolveContactStoryState({
    uid: emitterUid,
    sOrBForStory: '',
    muteKey: `${emitterUid}::`,
    mutedCardKeys: new Set(),
    storyCardByKey,
    storyByOwner,
  });
  assert.equal(stateLegacy, 'normal');

  const muted = resolveContactStoryState({
    uid: emitterUid,
    sOrBForStory: sidGym,
    muteKey: muteKeyGym,
    mutedCardKeys: new Set([muteKeyGym]),
    storyCardByKey,
    storyByOwner,
  });
  assert.equal(muted, 'none');

  console.log('Stories Fase 1: todas las aserciones OK (6 grupos).');
}

run();
