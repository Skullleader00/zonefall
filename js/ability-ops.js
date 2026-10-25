/* ==========================================================================
   ZONEFALL — ability-ops overlay  (js/ability-ops.js)
   ผูกผลจริงให้ความสามารถที่ OCR มาเป็นข้อความล้วน + สกัดค่าคงที่ (statics)
   โหลดหลัง js/data.js และก่อน js/engine.js
   op ที่รู้จัก: ดู js/engine.js (applyOp) และ js/effects.js (window.Zfx)
   ========================================================================== */
(function () {
  const MAP = {
    /* ═════════ Yellow — Celestial / Thronis (Ascend) ═════════ */
    sb01001: { Ascend: [{ op: 'ascendDeploy', equalOrLower: true, refundColor: 'Yellow' }] },
    sb01004: { Cont: [{ op: 'static', key: 'costReduce', per: 3, by: 'terrainDestroyedThisTurn' }] },
    sb01005: { Cont: [{ op: 'static', key: 'costReduce', per: 1, by: 'terrainHeldOrDestroyed' }] },
    sb01010: {
      'Trigger': [{ op: 'require', cond: { kind: 'controlTribe', value: 'Witch' } }, { op: 'playFromHandTribe', tribe: 'Witch', n: 2 }],
      Cont: [{ op: 'static', key: 'witchSetPower', value: 2500 }, { op: 'static', key: 'readyAfterAttack' }],
    },
    sb01013: { 'Trigger': [{ op: 'battleEffect', name: 'lowerWinsDie' }] },
    sb01014: { Action: [{ op: 'onPlay', hook: 'move', once: true, then: [{ op: 'rest', to: 'self' }, { op: 'swap' }] }] },
    sb01015: { 'On Play': [{ op: 'mergeDeck', n: 2 }], Cont: [{ op: 'static', key: 'untargetable', value: true }] },
    sb01016: {
      Action: [{ op: 'require', cond: { kind: 'always' } }, { op: 'oncePerTurn' },
        { op: 'transfer', from: 'backRowReadyToRemove', to: 'remove', n: 3, allowLess: true },
        { op: 'returnFieldRested', rested: true }],
      'Trigger': [{ op: 'returnFieldRested', rested: true }],
    },
    sb01017: { 'On Play': [{ op: 'reveal', of: 'foe', n: 1 }], Attack: [{ op: 'pay', either: 1 }, { op: 'buff', to: 'self', n: 2000, dur: 'battle' }] },
    sb01019: {
      'On Play': [{ op: 'bounce', to: 'randomReadiedBackRow' },
        { op: 'if', cond: { kind: 'always' }, then: [{ op: 'draw', n: 1 }, { op: 'buff', to: 'self', n: 1000 }] }],
    },
    sb01021: { Cast: [{ op: 'declareMatch', n: 1, thenRevealFoe: true }] },

    /* ═════════ Green — Verdant / Sylvan ═════════ */
    sd01001: {
      Cont: [{ op: 'static', key: 'moveLock', value: 'outzoneLt', n: 11 }],
      Activate: [{ op: 'oncePerTurn' }, { op: 'pay', flare: 2 }, { op: 'require', cond: { kind: 'outzoneGte', value: 12 } }, { op: 'ready', to: 'self' },
        { op: 'transfer', from: 'outzone', to: 'deckBottom', n: 2, filter: 'Green' }],
    },
    sd01002: {
      Activate: [{ op: 'oncePerTurn' }, { op: 'pay', terrainHere: true }, { op: 'ready', to: 'self' }],
      Attack: [{ op: 'mill', n: 1 }, { op: 'if', cond: { kind: 'outzoneGte', value: 10 }, then: [{ op: 'buff', to: 'self', n: 3000, dur: 'turn' }] }],
    },
    sd01004: { 'On Play': [{ op: 'if', cond: { kind: 'playedFrom', value: 'hand' }, then: [{ op: 'mill', n: 2 }] }, { op: 'if', cond: { kind: 'playedFrom', value: 'outzone' }, then: [{ op: 'buff', to: 'ask:alliesOther', n: 2000, dur: 'turn' }] }] },
    sd01005: { 'On Play': [{ op: 'mill', n: 1 }, { op: 'if', cond: { kind: 'outzoneGte', value: 10 }, then: [{ op: 'draw', n: 1 }] }], Cont: [{ op: 'static', key: 'readyAfterAttack' }] },
    sd01006: {
      'On Play': [{ op: 'mill', n: 1 },
        { op: 'transfer', from: 'outzone', to: 'hand', prompt: 'เลือก Adventurer / Terrain / Strategy จาก Outzone', filter: 'Adventurer|Terrain|Strategy|T' }],
    },
    sd01007: { Cont: [{ op: 'static', key: 'multiTerrain' }, { op: 'static', key: 'cell', cp: 1000 }] },
    sd01008: { Cont: [{ op: 'static', key: 'multiTerrain' }, { op: 'static', key: 'cell', cp: 1000, color: 'Green' }, { op: 'static', key: 'millDoubles', fromTerrains: 3 }] },
    sd01009: {
      Cont: [{ op: 'static', key: 'requiresTribe', value: 'Shaman' }],
      'Trigger': [{ op: 'transfer', from: 'outzone', to: 'hand', filter: 'Shaman', prompt: 'เลือก Shaman จาก Outzone ขึ้นมือ' }],
    },
    sd01010: { Passive: [{ op: 'static', key: 'protectionDeck', value: 6 }], 'Trigger': [{ op: 'banishRemove' }, { op: 'foePoints', n: 3, floor: 1 }] },
    sd01011: { Passive: [{ op: 'static', key: 'protectionDeck', value: 6 }], 'Trigger': [{ op: 'banishRemove' }, { op: 'foePoints', n: 2, floor: 1 }] },
    sd01012: { 'On Play': [{ op: 'require', cond: { kind: 'always' } }, { op: 'reveal', n: 5, filter: { unit: 1 }, thenRestBottom: true }] },
    sd01013: {
      Cont: [{ op: 'static', key: 'costIfReturnedThisTurn', value: 2 }],
      'On Play': [{ op: 'revealCountOf', colors: ['Blue'], tribes: ['Adventurer'], filter: { unit: 'not', type: 'TerrainOrCommand' }, prompt: 'เลือก Terrain/Command จากใบที่เปิด' }],
    },
    sd01014: { Cont: [{ op: 'static', key: 'moveLock', value: 'noAllyColorOrTribe', color: 'Blue', tribe: 'Adventurer' }] },

    /* ═════════ Blue — Machina ═════════ */
    sd04001: {
      Trigger: [{ op: 'readyIfBackRowColor', color: 'Blue', count: 2 }, { op: 'deploySelf', row: 'back' }],

      Attack: [{ op: 'if', cond: { kind: 'costGte', value: 6 }, then: [{ op: 'oncePerTurn' }, { op: 'pay', flare: 2 }, { op: 'transfer', from: 'hand', to: 'fieldFree', filter: { type: 'Operation' }, prompt: 'เลือก Operation Command ในมือมาร่ายฟรี' }] }],
      Action: [{ op: 'onPlay', hook: 'operationPlayed', then: [{ op: 'buff', to: 'self', n: 2000 }] }],
    },
    sd04002: { 'On Play': [{ op: 'reveal', n: 4, cost: 6, filter: { color: 'Blue' }, prompt: 'เลือก Blue Cost 6 จาก 4 ใบที่เปิด' }], Action: [{ op: 'onPlay', hook: 'operationPlayed', then: [{ op: 'columnBuff', n: 2000 }] }] },
    sd04003: {
      Cast: [{ op: 'buffMachineOrAll', n: 3000, dur: 'turn', grantReadyAfterBattle: true }],
      'Trigger': [{ op: 'reveal', n: 3, cost: 6, onlyType: 'unit', prompt: 'เลือกยูนิต Cost 6 จาก 3 ใบเพื่อลงสนามแถวหลัง' }],
    },
    sd04004: {
      Activate: [{ op: 'oncePerTurn' }, { op: 'pay', restPair: true }, { op: 'fxMove', to: 'ask:machine', n: 1, prompt: 'เลือก Machine ของคุณที่จะเลื่อน 1 ช่อง' }],
      Action: [{ op: 'onPlay', hook: 'commandPlayed', then: [{ op: 'buff', to: 'self', n: 1000 }] }],
    },
    sd04005: { 'Trigger': [{ op: 'readyIfBackRowColor', color: 'Blue', count: 2 }] },
    sd04006: {
      Trigger: [{ op: 'deploySelf', row: 'back' }],

      Activate: [{ op: 'oncePerTurn' }, { op: 'pay', discardHand: 2 }, { op: 'transfer', from: 'outzone', to: 'hand', filter: { cost: 6, type: 'command' }, prompt: 'เลือก Command Cost 6 จาก Outzone' }],
      'On Play': [{ op: 'move', to: 'self', dir: 'back', mayFail: true }],
      Action: [{ op: 'onPlay', hook: 'battle', ifRow: 'front', then: [{ op: 'buff', to: 'self', n: 1000 }] }],
    },
    sd04007: {
      'On Play': [{ op: 'chooseTwo', prompt: 'เลือก 1 อย่าง', list: [
        { prompt: 'เลื่อน Machine ใน column เดียวกัน 1 ช่อง', op: 'move', to: 'ask:machineSameColumn', n: 1 },
        { prompt: 'สลับที่กับ unit แถวหน้าของคุณ', op: 'swap', to: 'ask:ownFrontRow' }] }],
      Cont: [{ op: 'onPlay', hook: 'unitDied', effect: 'killSelfIfBlueFoeDies' }],
      Activate: [{ op: 'oncePerTurn' }, { op: 'pay', flare: 2 }, { op: 'buffCost6Own', n: 1000 }, { op: 'readyBackRowOthers' }, { op: 'reveal', of: 'foe', n: 2 }],
    },
    sd04008: { Activate: [{ op: 'require', cond: { kind: 'notPlayedThisTurn' } }, { op: 'destroy', to: 'self' }, { op: 'gain', flare: 2 }] },
    sd04009: {
      Cont: [{ op: 'static', key: 'costReduce', per: 2, by: 'blueUnitsControlled' }],
      'On Play': [{ op: 'ifPlayedWithoutFlareRest' }],
      'Trigger': [{ op: 'require', cond: { kind: 'controlColor', color: 'Blue', n: 3 } }, { op: 'points', n: 1 }],
    },
    sd04010: { 'On Play': [{ op: 'reveal', n: 4, cost: 6, filter: { color: 'Blue' }, prompt: 'เลือก Blue Cost 6 ขึ้นมือ' }], Cont: [{ op: 'static', key: 'columnBuffOnOperation', n: 2000 }] },
    sd04011: { Action: [{ op: 'oncePerTurn' }, { op: 'onPlay', hook: 'commandPlayed' }, { op: 'pay', discardHand: 1 }, { op: 'ready', to: 'self' }, { op: 'buff', to: 'self', n: 1000 }] },
    sd040012: { Cast: [{ op: 'buff', to: 'ask:ownHighCost', n: -3000, dur: 'turn' }, { op: 'ifPowerPositiveMoveSide' }] },
    sd040013: { 'On Play': [{ op: 'fxMove', to: 'ask:machine', n: 1, prompt: 'เลื่อน Machine ของคุณ 1 ช่อง' }] },
    sd040014: { 'On Play': [{ op: 'shiftCost', prompt: 'เพิ่มหรือลด Cost ของยูนิตนี้ 1' }, { op: 'powerTo', which: 'highestCost', value: 4000 }, { op: 'drawPerPower', value: 4000, max: 2 }] },
    sb01003: { 'On Play': [{ op: 'mill', n: 2 }, { op: 'transfer', from: 'outzone', to: 'field', filter: { terrainOnly: true, type: 'terrain' }, prompt: 'วาง Terrain จาก Outzone ลงแถวหน้า 1 ช่อง' }] },
    sb01018: { 'On Play': [{ op: 'mill', n: 1 }, { op: 'fxBounce', to: 'ask:enemyCore', prompt: 'เลือก Core ศัตรูส่งกลับมือ' }] },
    sb01020: { 'On Play': [{ op: 'if', cond: { kind: 'always' }, then: [{ op: 'move', to: 'self', dir: 'fwd', n: 2 }] }] },
  };

  const WHEN = { 'On Play': 'On Play', onPlay: 'On Play', 'Quick-Cast': 'Trigger', quickCast: 'Trigger', 'Trigger': 'Trigger', Attack: 'Attack', Activate: 'Activate', Action: 'Action', Cont: 'Cont', Ascend: 'Ascend', Cast: 'Cast', Upkeep: 'Upkeep', Counter: 'Trigger', Passive: 'Cont' };
  let fixed = 0, statics = 0;
  CARDS.forEach(cd => {
    const m = MAP[cd.id]; if (!m) { cd.statics = cd.statics || {}; }
    cd.statics = cd.statics || {};
    (cd.abilities || []).forEach(a => {
      const key = m && (WHEN[(a.kw || '').trim()] || (a.kw || '').trim());
      const ops = m && key && m[key === 'Trigger' && a.kw === 'Quick-Cast' ? 'Trigger' : key];
      if (ops && !(a.ops && a.ops.length)) { a.ops = ops; fixed++; }
      (a.ops || []).forEach(o => { if (o && o.op === 'static') { cd.statics[o.key] = Object.assign({}, o); statics++; } });
    });
  });
  window.ZAbilityStats = (function () {
    const unmapped = CARDS.flatMap(c => (c.abilities || []).filter(a => !(a.ops && a.ops.length)).map(a => c.id + ' :: ' + (a.kw || '') + ' :: ' + (a.text || '').slice(0, 46)));
    const missingKeys = Object.keys(MAP).flatMap(id => {
      const c = CARDS.find(x => x.id === id);
      if (!c) return ['ID ไม่存在于CARDS: ' + id];
      const kws = (c.abilities || []).map(a => (a.kw || '').trim());
      return Object.keys(MAP[id]).filter(k => !kws.some(w => WHEN[w] === k || w === k))
        .map(k => id + ': key "' + k + '" ไม่ตรงกับการ์ด — คีย์จริง: ' + kws.join(' | '));
    });
    return { fixed, statics, unmapped, missingKeys };
  })();
}());
