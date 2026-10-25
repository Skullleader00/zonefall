/* สแกน log ทุกเกมหา "op ไม่รู้จัก / ยังไม่ implement / hook error" แล้วสรุปว่า ability ไหนยังไม่ทำงาน
   usage: node test/optrace.js [games=40] [seed0=1] */
const run = require('./harness');
const games = +(process.argv[2] || 40), seed0 = +(process.argv[3] || 1);
const out = run(`
  var bad = {}, opsHit = 0, effectsFired = {};
  for (var s = ${seed0}; s < ${seed0} + ${games}; s++) {
    ['sylvan','machina'].forEach(function (d0) {
      var S;
      try { S = Z.init({ seed: s * 977 + (d0 === 'sylvan' ? 1 : 7), humanSide: 'p9', p0deck: d0, p1deck: d0 === 'sylvan' ? 'machina' : 'sylvan' }); }
      catch (e) { bad['init:' + e.message] = (bad['init:' + e.message] || 0) + 1; return; }
      var g = 0;
      try {
        while (!S.winner && g++ < 700) {
          ZAI.takeTurn(S, S.active);
          var k = 0; while (S.pending && k++ < 20) Z.respond(S, null);
          var q = 0; while (S.uiAsk && q++ < 60) Z.answer(S, null);
        }
      } catch (e) { bad['throw:' + e.message] = (bad['throw:' + e.message] || 0) + 1; }
      S.log.forEach(function (L) {
        var m = L.msg;
        if (/op "\w+" ยังไม่ implement|op ไม่รู้จัก|hook .*:|ยังไม่ implement/.test(m)) {
          var key = m.replace(/\\s+/g, ' ').trim().slice(0, 110);
          bad[key] = (bad[key] || 0) + 1;
        } else if (/⟩|↳|⟲|◮|◐|♛|⛓|☠|⇄|▸/.test(m)) opsHit++;
      });
    });
  }
  return { bad: bad, opsHit: opsHit, games: ${games} * 2 };
`);
const keys = Object.entries(out.bad).sort((a, b) => b[1] - a[1]);
console.log(`เกมจำลอง ${out.games} · log บรรทัดเอฟเฟกต์ที่ทำงานจริง ${out.opsHit.toLocaleString()} · ปัญหา ${keys.length} แบบ`);
if (!keys.length) console.log('✅ ไม่พบ op ที่ยังไม่ implement / error ระหว่างเอฟเฟกต์');
keys.slice(0, 40).forEach(([k, n]) => console.log(`  x${n}  ${k}`));
process.exit(keys.length ? 1 : 0);
