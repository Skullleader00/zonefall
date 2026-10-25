/* ตรวจกติกาการจัดเด็คตาม rulebook (40–60 ใบ, ซ้ำ≤3, สีหลัก≥ครึ่ง, คู่สีรอง≤1, [Protection]≤6)
   usage: node test/deckcheck.js       (exit 1 ถ้าเด็คไหนผิดกติกา) */
const run = require('./harness');

const data = run(`
  var rep = {};
  Object.keys(DECKS).forEach(function (k) {
    var D = DECKS[k], cnt = {}, col = {}, prot = 0, unknown = 0;
    D.main.forEach(function (id) {
      var c = CARD_INDEX[id];
      if (!c) { unknown++; return; }
      cnt[id] = (cnt[id] || 0) + 1;
      col[c.color] = (col[c.color] || 0) + 1;
      if (c.protection) prot++;
    });
    var named = Object.keys(col).filter(function (c) { return c !== 'Colorless'; });
    var primary = named.sort(function (a, b) { return col[b] - col[a]; })[0];
    rep[k] = {
      label: D.name, size: D.main.length, unknownId: unknown,
      overCopies: Object.keys(cnt).filter(function (i) { return cnt[i] > RULES.maxCopy; }),
      colors: col, primary: primary, primaryPct: Math.round(100 * (col[primary] || 0) / D.main.length),
      secondaries: named.filter(function (c) { return c !== primary; }),
      protection: prot,
      extraColors: Array.from(new Set((D.extra || []).map(function (i) { return (CARD_INDEX[i] || {}).color; }))).filter(Boolean),
    };
  });
  return { rep: rep, rules: { min: RULES.deckMin, max: RULES.deckMax, maxCopy: RULES.maxCopy, protLimit: RULES.protectionLimit } };
`);

const { rep, rules } = data;
let fail = 0;

Object.entries(rep).forEach(([k, d]) => {
  const errs = [];
  if (d.size < rules.min || d.size > rules.max) errs.push(`ขนาดเด็ค ${d.size} ต้องอยู่ใน ${rules.min}-${rules.max} ใบ`);
  if (d.unknownId) errs.push(`มี id ที่ไม่มีในการ์ด ${d.unknownId} ใบ`);
  if (d.overCopies.length) errs.push(`ใส่ซ้ำเกิน ${rules.maxCopy} ใบ: ${d.overCopies.join(', ')}`);
  if (d.primaryPct < 50) errs.push(`สีหลัก (${d.primary}) มี ${d.primaryPct}% ซึ่งต้อง ≥ 50%`);
  if (d.secondaries.length > 1) errs.push(`มีคู่สีรอง ${d.secondaries.length} สี (${d.secondaries.join(', ')}) — ได้ไม่เกิน 1 สี`);
  if (d.protection > rules.protLimit) errs.push(`[Protection] ${d.protection} ใบ เกินโควตา ${rules.protLimit}`);
  const extraBad = d.extraColors.filter(c => c !== d.primary && c !== 'Colorless');
  if (extraBad.length) errs.push(`Extra Zone ต้องมีสีหลักสีเดียว (พบ ${extraBad.join(', ')})`);

  console.log(`${errs.length ? 'FAIL' : 'OK  '} ${k.padEnd(9)} ${d.label}`);
  console.log(`      ${d.size} ใบ · สีหลัก ${d.primary} ${d.primaryPct}% · คู่สี ${d.secondaries.join(',') || '-'} · Protection ${d.protection} · ${JSON.stringify(d.colors)}`);
  errs.forEach(e => console.log('      · ' + e));
  fail += errs.length;
});

console.log(fail ? `\nพบ ${fail} ข้อผิดกติกา` : '\nทุกเด็คผ่านกติกาทั้งหมด');
process.exit(fail ? 1 : 0);
