/* tools/map-abilities.js — ผูก ops ให้ความสามารถที่ OCR yet untranslated (run: node tools/map-abilities.js) */
const fs = require('fs');
const path = require('path');
const P = path.join(__dirname, '..', 'js', 'data.js');
let src = fs.readFileSync(P, 'utf8');

/* id → { "Keyword": [ops] }  (ops ตรงตาม case ใน engine) */
const MAP = {
  sb01001: { Ascend: [{ op: 'ascendPlay', to: 'self', equalOrLower: true, refundColor: 'Yellow' }] },
  sb01004: { Cont: [{ op: 'costReduce', per: 3, by: 'terrainDestroyed', where: 'hand' }] },
  sb01005: { Cont: [{ op: 'costReduce', per: 1, by: 'terrainControlOrDestroyed', where: 'hand' }] },
  sb01010: { Trigger: [{ op: 'playHandTribe', tribe: 'Witch', need: 'Witch', n: 2 }] },
  sb01013: { Quick-Cast: [{ op: 'battleLowerWins', scope: 'ownBattling' }] },
  sb01014: { Action: [{ op: 'restThenSwapMoved', to: 'self' }] },
  sb01015: { 'On Play': [{ op: 'mergeDeck', n: 2 }], Cont: [{ op: 'cannotBlockOrTarget' }] },
  sb01016: {
    Action: [{ op: 'banishThenReturnRest', to: 'enemyBackRow' }],
    Trigger: [{ op: 'banishReturnThenSummon', to: 'self', rest: true }],
  },
  sb01017: { Attack: [{ op: 'discardCostThenBuff', n: 3000, altDestroyTerrain: true }] },
  sb01019: { 'On Play': [{ op: 'returnBackRowToHand', thenDrawIf: ['Blue', 'Adventurer'] }] },
  sb01021: { Cast: [{ op: 'revealTop', n: 1, thenKeepIfDeclared: true, declare: true }] },
  sd01001: { Cont: [{ op: 'cannotMoveUnless', outzoneMin: 11 }] },
  sd01002: { Activate: [{ op: 'restTerrainHereThenReadySelf' }] },
  sd01004: { 'On Play': [{ op: 'ifFromOutzoneBuffAlly', n: 2000 }] },
  sd01005: { Cont: [{ op: 'readyAfterAttackOwn' }] },
  sd01007: { Cont: [{ op: 'cellCp', n: 1000, mineTurnOnly: true }, { op: 'multiTerrain' }] },
  sd01008: { Cont: [{ op: 'cellCp', n: 1000, color: 'Green', mineTurnOnly: true }, { op: 'millDoublesAt', terrains: 3 }] },
  sd01009: { Passive: [{ op: 'needTribe', tribe: 'Shaman' }], 'Quick-Cast': [{ op: 'buffPerGreenAndTerrain', n: 1000 }] },
  sd01010: { Passive: [{ op: 'counterPowerBuff', n: 3000 }], Trigger: [{ op: 'banishFoeMinusPoints', n: 2, floor: 1 }] },
  sd01011: { Passive: [{ op: 'counterNoDestroyThenMoveBack' }], Trigger: [{ op: 'banishFoeMinusPoints', n: 1, floor: 1 }] },
  sd01013: { Cont: [{ op: 'costBecomesOnReturn', value: 2 }], 'On Play': [{ op: 'revealSearchPick', only: ['Terrain', 'Command-non-Generic'], countFrom: 'blueOrAdventurer' }] },
  sd01014: { Cont: [{ op: 'cannotMoveWithoutAlly', color: 'Blue', tribe: 'Adventurer' }] },
  sd04001: { Attack: [{ op: 'payThenPlayOperation' }], Action: [{ op: 'onOperationPlayedBuffSelf', n: 2000 }], Trigger: [{ op: 'readyIfBackRowBlue', min: 2 }] },
  sd04003: { Cast: [{ op: 'whenByUnitEffectAffectAll' }] },
  sd04006: { Activate: [{ op: 'discardForRecoverCost6' }], 'On Play': [{ op: 'moveSelfToRow', row: 'back' }], Action: [{ op: 'ifFrontRowBuffSelf', n: 1000 }] },
  sd04009: { Cont: [{ op: 'costReduce', per: 2, by: 'colorUnits:Blue' }, { op: 'restIfNotPlayedThisTurn' }], Action: [{ op: 'onCommandPlayedBuffSelf', n: 1000 }], Trigger: [{ op: 'pointIfColorCount', color: 'Blue', min: 3 }] },
  sd040012: { Cast: [{ op: 'debuffThenMoveSideOrNone' }] },
  sd040013: { 'On Play': [{ op: 'chooseTwoSwapMove' }] },
  sd040014: { 'On Play': [{ op: 'shiftCostThenSetPowerTo' }, { op: 'drawPerHighestCostUnits' }] },
};

let changed = 0;
for (const [id, table] of Object.entries(MAP)) {
  // หา object ของการ์ดใน source
  const start = src.indexOf("id: '" + id + "'");
  if (start < 0) { console.log('!! ไม่พบการ์ด', id); continue; }
  const end = src.indexOf('\n  {', start);
  const blockSrc = src.slice(start, end < 0 ? src.length : end);
  let block = blockSrc, n = 0;
  for (const [kw, ops] of Object.entries(table)) {
    const j = JSON.stringify(ops).replace(/"op":/g, 'op:').replace(/"to":/g, 'to:').replace(/"n":/g, 'n:');
    // หา ability ที่มี kw ตรงแล้วเติม ops ถ้าว่าง
    const re = new RegExp("(\\{\\s*kw: '" + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'[^]*?ops: )\\[\\]", 'm');
    if (re.test(block)) { block = block.replace(re, '$1' + j); n++; }
    else if (block.includes("kw: '" + kw + "'")) {
      // abilities ไม่มีฟิลด์ ops → แทรก
      block = block.replace(new RegExp("(\\{[^]*?kw: '" + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'[^]*?text: '[^]*?'(?=[,}])\\s*\\})"), (m) => {
        const at = m.lastIndexOf('}');
        return m.slice(0, at) + ", ops: " + j + " " + m.slice(at);
      });
      n++;
    } else console.log('   (ข้าม) ' + id + ' ไม่มี ability ' + kw);
  }
  if (n) { src = src.slice(0, start) + block + src.slice(end < 0 ? src.length : end); changed++; }
}
fs.writeFileSync(P, src);
console.log('map-abilities: แก้ไป ' + changed + ' ใบ');
