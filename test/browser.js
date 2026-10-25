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
  const RULES_MAX_FLARE = 8;

  for (const vp of VIEWPORTS) {
    const errs = [];
    const page = await (await br.newContext({ viewport: vp, deviceScaleFactor: 2 })).newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 160)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
    await page.goto(BASE);
    await page.waitForTimeout(700);
    const home = await page.evaluate(() => ({ logo: !!document.querySelector('.brand-logo'), nSel: document.querySelectorAll('#selOwnDeck option').length }));
    if (!home.logo || !home.nSel) { console.log('bootstrap fail', home); errs.push('home screen not rendered'); }
    /* โทน o/p/s ต้องขึ้นมาก่อน */
    await page.click('#btnStart');
    await page.waitForTimeout(350);
    const rpsVisible = await page.isVisible('#rpsPanel');
    if (!rpsVisible) errs.push('หน้าจอเลือกผู้เริ่มก่อน (o/p/s) ไม่ขึ้น');
    await page.click('.rps-btn[data-rps="rock"]');
    await page.waitForTimeout(700);

    /* ให้ sprite/ฟอนต์โหลดครบก่อนวัด */
    await page.waitForFunction(() => [...document.querySelectorAll('#hand .frame-fill')].every(i => i.complete), null, { timeout: 8000 }).catch(() => { });
    await page.evaluate(() => document.fonts.ready);
    // เดินเกมด้วย AI ทั้งสองฝั่ง (ข้ามการรอแอนิเมชันของ UI เพื่อความเร็ว)
    await page.waitForFunction(() => {
      const cs = [...document.querySelectorAll('#hand .gcard')].filter(g => g.getBoundingClientRect().top < innerHeight - 20);
      return !cs.length || cs.every(g => { const i = g.querySelector('.frame-fill'); return i && i.complete && i.naturalWidth > 0; });
    }, null, { timeout: 9000 }).catch(() => { });
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
      const scrollable = document.documentElement.scrollHeight > innerHeight + 2;
      const boxes = ['#board', '#handWrap', '#plateOwn', '#topbar'].map(sel => {
        const e = document.querySelector(sel); const r = e.getBoundingClientRect();
        return { sel, inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
      });
      return {
        vScroll: scrollable, turn: S.turnNo, responses, tokens: document.querySelectorAll('.tk').length,
        _x: 0,
        frames: [...document.querySelectorAll('#hand .gcard')].map(g => { const f = g.querySelector('.frame-fill'); const b = g.getBoundingClientRect();
          return { src: f && f.getAttribute('src'), nat: f && f.naturalWidth, comp: f && f.complete, top: Math.round(b.top), w: Math.round(b.width) }; }),
        handBox: (() => { const h = document.getElementById('hand'), hb = h.getBoundingClientRect();
          const shell = document.getElementById('shell');
          const pageScrollable = getComputedStyle(shell).overflowY !== 'hidden' || getComputedStyle(shell).overflow !== 'hidden';
          const cs = [...h.querySelectorAll('.gcard')].map(g => g.getBoundingClientRect());
          return { handFits: pageScrollable || (hb.bottom <= innerHeight + 2 && hb.top >= 0), noAbove: cs.every(b => b.top >= hb.top - 2), pageScrollable }; })(),
        handArt: [...document.querySelectorAll('#hand .gcard .art-win')].slice(0, 3).filter(e => getComputedStyle(e).backgroundImage !== 'none').length,
        railPips: document.querySelectorAll('#railOwn .pips i').length,
        terrains: document.querySelectorAll('.t-chip').length, cards: CARDS.length,
        cell: rect(document.querySelector('.cell')), textBad, clipped, boxes,
        artOk: [...document.querySelectorAll('#hand .gc-art')].every(i => i.naturalWidth > 0),
      };
    });

    const offscreen = state.vScroll ? [] : state.boxes.filter(b => !b.inside).map(b => b.sel);
    const problems = [];
    if (errs.length) problems.push(...errs);
    if (state.textBad.length) problems.push('พบ undefined/NaN ใน DOM: ' + state.textBad.join(' | '));
    if (state.clipped) problems.push(`ข้อความในมือการ์ดยังถูกตัด ${state.clipped} จุด`);
    if (!state.handBox.handFits) problems.push('แถบมือเลยขอบจอล่าง');
    if (!state.handBox.noAbove) problems.push('การ์ดในมือล้นขึ้นบนแถบ');
    if (offscreen.length) problems.push('_element_ ล้นจอ: ' + offscreen.join(','));
    if (!state.artOk) problems.push('ภาพการ์ดบางใบโหลดไม่สำเร็จ');
    const vis = (state.frames || []).filter(f => f.top < 99999 && f.w > 0);
    const badFrames = (state.frames || []).filter(f => !(f.comp && f.nat > 0));
    if (badFrames.length) problems.push('frame โหลดไม่ครบ: ' + JSON.stringify(badFrames.slice(0, 2)));
    if (!state.handArt) problems.push('หน้าต่างภาพบนการ์ดว่าง');
    if (state.railPips < RULES_MAX_FLARE) problems.push('rail Flare มีเม็ดไม่ครบ');
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
