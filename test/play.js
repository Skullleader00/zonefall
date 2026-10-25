/* AI vs AI — ตรวจความเสถียร + สมดุลของกติกา
   usage: node test/play.js [games=20] [maxSteps=400] [p0deck=sylvan] [p1deck=machina] [seed0=1] */
const run = require('./harness');
const games = +(process.argv[2] || 20);
const maxSteps = +(process.argv[3] || 400);
const d0 = process.argv[4] || 'sylvan';
const d1 = process.argv[5] || 'machina';
const seed0 = +(process.argv[6] || 1);

const res = run(`
  var out = [];
  for (var s = ${seed0}; s < ${seed0} + ${games}; s++) {
    var S = Z.init({ seed: s * 131, humanSide: 'p9', p0deck: '${d0}', p1deck: '${d1}' });
    var steps = 0, err = null;
    try {
      while (!S.winner && steps++ < ${maxSteps}) {
        ZAI.takeTurn(S, S.active);
        var g = 0; while (S.pending && g++ < 10) Z.respond(S, null);
      }
    } catch (e) { err = e.message + ' @ ' + String(e.stack).split('\\n')[1].trim().slice(0, 80); }
    var n = function (re) { return S.log.filter(function (L) { return re.test(L.msg); }).length; };
    out.push({ seed: s, w: S.winner, turns: S.turnNo, err: err,
      pts: [S.players.p0.corePoints, S.players.p1.corePoints],
      fx: n(/⟩ /), ctr: n(/ตอบโต้/), trig: n(/Trigger Check/), deckLeft: [S.players.p0.deck.length, S.players.p1.deck.length] });
  }
  return out;
`);

const errCount = res.filter(r => r.err).length;
const wins = {}, unfinished = res.filter(r => !r.w && !r.err).length;
res.forEach(r => { if (r.w) wins[r.w] = (wins[r.w] || 0) + 1; });
const avg = (res.reduce((a, b) => a + b.turns, 0) / res.length).toFixed(1);
const sum = k => res.reduce((a, b) => a + (b[k] || 0), 0);
console.log(`games ${res.length} | errors ${errCount} | no-winner ${unfinished} | avg turns ${avg} | win rate ${JSON.stringify(wins)}`);
console.log(`ability ทำงาน ${sum('fx')} ครั้ง | ตอบโต้ ${sum('ctr')} ครั้ง | Trigger Check ${sum('trig')} ครั้ง (เฉลี่ย ${(sum('trig') / res.length).toFixed(1)}/เกม)`);
if (errCount) {
  const seen = {};
  res.filter(r => r.err).forEach(r => { seen[r.err] = (seen[r.err] || 0) + 1; });
  Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([e, n]) => console.log(`  x${n}  ${e}`));
  process.exit(1);
}
