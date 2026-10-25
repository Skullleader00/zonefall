/* e2e บนเบราว์เซอร์: boot -> เริ่มต้นเกม -> เล่นด้วย AI -> ตรวจ error/DOM/layout
   ต้องมี playwright: npm i -D playwright && npx playwright install chromium
   usage: node test/browser.js            (หรือBASE=http://localhost:3000 node test/browser.js) */
const BASE = process.env.BASE || 'http://localhost:3000/index.html';

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  try { ({ chromium } = require('/tmp/qwenwork/node_modules/playwright')); }
  catch (_) { console.log('ข้าม test นี้: ไม่พบ module playwright (npm i -D playwright)'); process.exit(0); }
}

const VIEWPORTS = [
  { width: 390, height: 844 }, { width: 768, height: 1024 },
  { width: 844, height: 390 }, { width: 1024, height: 700 }, { width: 1366, height: 850 },
];
const EXE = process.env.CHROME || '/opt/playwright-browsers/chromium-1209/chrome-linux64/chrome';

(async () => {
  const fs = require('fs');
  const shots = process.env.SHOTS || '';
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const br = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : undefined, args: ['--no-sandbox'] });
  let bad = 0;

  for (const vp of VIEWPORTS) {
    const errs = [];
    const page = await (await br.newContext({ viewport: vp, deviceScaleFactor: 2 })).newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 160)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
    await page.goto(BASE);
    await page.waitForTimeout(700);
    await page.click('#btnStart');
    await page.waitForTimeout(400);

    // เดินเกมด้วย AI ทั้งสองฝั่ง (ข้ามการรอแอนิเมชันของ UI เพื่อความเร็ว)
    const state = await page.evaluate(() => {
      const S = window.__ZF.st();
      let responses = 0;
      for (let i = 0; i < 300 && !S.winner && S.turnNo < 26; i++) {
        if (S.pending) { Z.respond(S, null); responses++; continue; }
        ZAI.takeTurn(S, S.active);
      }
      S.winner = null; window.__ZF.render();
      const rect = e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
      const textBad = (() => {
        const found = [];
        const walk = n => n.childNodes.forEach(c => {
          if (c.nodeType === 3) { if (/undefined|NaN|\[object/.test(c.nodeValue)) found.push(c.nodeValue.trim().slice(0, 30)); }
          else if (c.nodeType === 1) walk(c);
        });
        walk(document.body); return found;
      })();
      const clipped = [...document.querySelectorAll('.gc-ab')].filter(a => a.scrollHeight - a.clientHeight > 2).length;
      const boxes = ['#board', '#handWrap', '#plateOwn', '#topbar'].map(sel => {
        const e = document.querySelector(sel); const r = e.getBoundingClientRect();
        return { sel, inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
      });
      return {
        turn: S.turnNo, responses, tokens: document.querySelectorAll('.tk').length,
        terrains: document.querySelectorAll('.t-chip').length, cards: CARDS.length,
        cell: rect(document.querySelector('.cell')), textBad, clipped, boxes,
        artOk: [...document.querySelectorAll('#hand .gc-art')].every(i => i.naturalWidth > 0),
      };
    });

    const offscreen = state.boxes.filter(b => !b.inside).map(b => b.sel);
    const problems = [];
    if (errs.length) problems.push(...errs);
    if (state.textBad.length) problems.push('พบ undefined/NaN ใน DOM: ' + state.textBad.join(' | '));
    if (state.clipped) problems.push(`ข้อความในมือการ์ดยังถูกตัด ${state.clipped} จุด`);
    if (offscreen.length) problems.push('_element_ ล้นจอ: ' + offscreen.join(','));
    if (!state.artOk) problems.push('ภาพการ์ดบางใบโหลดไม่สำเร็จ');
    if (state.tokens < 1) problems.push('ไม่มียูนิตบนกระดานหลังเล่นหลายคน 1 รอบ');

    console.log(`${problems.length ? 'FAIL' : 'OK  '} ${vp.width}x${vp.height}` +
      ` | turn ${state.turn} · tk ${state.tokens} · terr ${state.terrains} · response ${state.responses}` +
      ` | cell ${state.cell.w}x${state.cell.h}`);
    problems.forEach(p => console.log('      · ' + p));
    bad += problems.length;
    if (shots && !problems.length) await page.screenshot({ path: `${shots}/${vp.width}x${vp.height}.png` });
    await page.close();
  }

  await br.close();
  console.log(bad ? `\nพบ ${bad} ปัญหา` : '\nผ่านทุก viewport');
  process.exit(bad ? 1 : 0);
})();
