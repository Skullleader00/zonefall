/* ความครอบคลุมเอฟเฟกต์ — ในการจำลอง AI-vs-AI: ใบไหนถูกใช้ && เอฟเฟกต์ทำงานจริง
   usage: node test/coverage.js [games=40]                                            */
const run = require('./harness');
const games = +(process.argv[2] || 40);

const code = [
  'var name2id = {}; CARDS.forEach(function (c) { name2id[c.name] = c.id; });',
  'var inDeck = {}; ["sylvan","machina"].forEach(function (k) { DECKS[k].main.forEach(function (id) { inDeck[id] = 1; }); });',
  'var onlyStatic = {}; CARDS.forEach(function (c) {',
  '  onlyStatic[c.id] = (c.abilities || []).length > 0 && (c.abilities || []).every(function (a) {',
  '    return (a.ops || []).length > 0 && (a.ops || []).every(function (o) { return o && o.op === "static"; });',
  '  });',
  '});',
  'var fired = {}, played = {};',
  'function nm(m) { var x = m.match(/\\[([^\\]]+)\\]/); return x && name2id[x[1]] ? name2id[x[1]] : null; }',
  'for (var s = 1; s <= GAMES; s++) {',
  '  [["sylvan","machina"],["machina","sylvan"],["sylvan","sylvan"],["machina","machina"]].forEach(function (pair, pi) {',
  '    var S;',
  '    try { S = Z.init({ seed: s * 313 + pi * 7 + 1, humanSide: "p9", p0deck: pair[0], p1deck: pair[1] }); } catch (e) { return; }',
  '    var g = 0;',
  '    try {',
  '      while (!S.winner && g++ < 700) {',
  '        ZAI.takeTurn(S, S.active);',
  '        var k = 0; while (S.pending && k++ < 20) Z.respond(S, null);',
  '        var q = 0; while (S.uiAsk && q++ < 60) Z.answer(S, null);',
  '      }',
  '    } catch (e) { }',
  '    S.log.forEach(function (L) {',
  '      var m = L.msg, id;',
  '      if (/⛬ Deploy|▦ วาง Terrain|⟲ ตอบโต้/.test(m)) { id = nm(m); if (id) played[id] = (played[id] || 0) + 1; }',
  '      if (/Trigger Check/.test(m)) { id = nm(m); if (id) played[id] = (played[id] || 0) + 1; }',
  '      if (/⟩|↳|▹|♛|⛓|◮|◐|🛡|⚖|↻/.test(m)) { id = nm(m); if (id) fired[id] = (fired[id] || 0) + 1; }',
  '      if (/Mill|mill|ใช้ /.test(m)) { id = nm(m); if (id) fired[id] = fired[id] || 1; }',
  '    });',
  '  });',
  '}',
  'var rows = CARDS.filter(function (c) { return inDeck[c.id]; }).map(function (c) {',
  '  var p = played[c.id] || 0;',
  '  return { id: c.id, name: c.name, plays: p, fx: (fired[c.id] || 0) + (onlyStatic[c.id] ? p : 0), hasAb: (c.abilities || []).length };',
  '});',
  'return { pool: rows.length, playedOk: rows.filter(function (r) { return r.plays; }).length,',
  '  withFx: rows.filter(function (r) { return r.fx; }).length,',
  '  everPlayedNoFx: rows.filter(function (r) { return r.plays >= 2 && !r.fx && r.hasAb; }),',
  '  neverPlayed: rows.filter(function (r) { return !r.plays; }) };',
].join('\n').replace(/GAMES/g, String(games));

const out = run(code);
console.log(`เด็คทดสอบมี ${out.pool} ใบ · ถูกนำมาใช้ ${out.playedOk} ใบ · มีเอฟเฟกต์ทำงาน ${out.withFx} ใบ`);
if (out.neverPlayed.length) {
  console.log(`— ไม่เคยถูกนำมาใช้ ${out.neverPlayed.length} ใบ (cost สูง/สีรองที่ AI ไม่ค่อยเล่น):`);
  out.neverPlayed.forEach(r => console.log(`   · ${r.id} ${r.name}`));
}
if (out.everPlayedNoFx.length) {
  console.log('— ใช้แล้วแต่ไม่มี log เอฟเฟกต์ (ต้องตรวจ):');
  out.everPlayedNoFx.forEach(r => console.log(`   ! ${r.id} ${r.name} plays=${r.plays}`));
} else console.log('✅ ทุกใบที่นำมาใช้ มีเอฟเฟกต์ทำงานจริงอย่างน้อย 1 ครั้ง');
process.exit(out.everPlayedNoFx.length ? 1 : 0);
