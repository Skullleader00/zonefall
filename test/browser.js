/* E2E หลาย viewport: boot → o/p/s → AI เล่น 2 ฝั่ง → ตรวจ layout/DOM/image + drag & long-press
   usage: node test/browser.js   env: BASE (default http://localhost:3000/index.html), CHROME, SHOTS=dir */
const BASE = process.env.BASE || 'http://localhost:3000/index.html';
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('ข้าม: ไม่พบ playwright (npm i -D playwright)'); process.exit(0); }

const VIEWPORTS = [
  { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 844, height: 390 },
  { width: 1024, height: 700 }, { width: 1366, height: 850 },
];
const EXE = process.env.CHROME || '/opt/playwright-browsers/chromium-1209/chrome-linux64/chrome';

(async () => {
  const fs = require('fs');
  const shots = process.env.SHOTS || '';
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const br = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : undefined, args: ['--no-sandbox'] });
  let total = 0;

  for (const vp of VIEWPORTS) {
    const problems = [];
    const page = await (await br.newContext({ viewport: vp, deviceScaleFactor: 2 })).newPage();
    page.setDefaultTimeout(9000);
    page.on('pageerror', e => problems.push('pageerror: ' + e.message.slice(0, 150)));
    page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 150)); });
    page.on('requestfailed', r => problems.push('request fail: ' + r.url().slice(-40)));

    await page.goto(BASE + '?_=' + Date.now());
    await page.waitForTimeout(700);
    await page.click('#btnStart'); await page.waitForTimeout(250);
    await page.click('.rps-btn');                          // o/p/s เลือกผู้เริ่ม
    await page.waitForTimeout(1000);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      const S = window.__ZF.st(); let g = 0;
      while (!S.winner && S.turnNo < 20 && g++ < 400) { if (S.pending) { Z.respond(S, null); continue; } ZAI.takeTurn(S, S.active); }
      S.winner = null; window.__ZF.render();
      const imgs = [...document.querySelectorAll('#hand img.gc-img, .tk img.tk-img, .terr img')];
      await Promise.all(imgs.map(i => i.decode().catch(() => { })));
    });
    await page.waitForTimeout(400);

    const st = await page.evaluate(() => {
      const pageScrol = document.documentElement.scrollHeight > innerHeight + 2;
      const box = sel => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { sel, l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
      const structural = ['#arena', '#board', '.plate.own', '.plate.foe', '#handWrap', '#topbar', '#railOwn', '#railFoe', '.endcap']
        .map(box).filter(Boolean);
      const badStruct = structural.filter(o => o.w < 1 || o.h < 1 || o.l < -1 || o.r > innerWidth + 1 || (!pageScrol && (o.t < -1 || o.b > innerHeight + 1)));
      const tkFit = [...document.querySelectorAll('.cell')].filter(cl => { const tk = cl.querySelector('.tk'); if (!tk) return false;
        const a = tk.getBoundingClientRect(), b2 = cl.getBoundingClientRect();
        return a.width > b2.width + 2 || a.height > b2.height + 2; }).length;
      const cell = document.querySelector('.cell').getBoundingClientRect();
      const tkImg = document.querySelector('.tk img.tk-img');
      return {
        turn: window.__ZF.st().turnNo, tokens: document.querySelectorAll('.tk').length,
        terrains: document.querySelectorAll('.terr img').length,
        hand: document.querySelectorAll('#hand .gcard').length,
        handImgsOk: [...document.querySelectorAll('#hand img.gc-img')].every(i => i.complete && i.naturalWidth > 100),
        tkImgsOk: ![...document.querySelectorAll('.tk img.tk-img')].some(i => !(i.complete && i.naturalWidth > 100)),
        badStruct: badStruct.map(o => o.sel + ' ' + Math.round(o.w) + 'x' + Math.round(o.h) + ' r=' + Math.round(o.r)), tkFit,
        scrollY: Math.max(0, document.documentElement.scrollHeight - innerHeight),
        scrolled: false,
        cell: [Math.round(cell.width), Math.round(cell.height)],
        tkOver: (() => { const out = []; document.querySelectorAll('.cell').forEach(cl => { const tk = cl.querySelector('.tk'); if (!tk) return; const a = tk.getBoundingClientRect(), b = cl.getBoundingClientRect();
            if (a.bottom > b.bottom + 2 || a.top < b.top - 2 || a.right > b.right + 2 || a.left < b.left - 2) out.push(Math.round(a.width) + 'x' + Math.round(a.height) + '@' + Math.round(b.width) + 'x' + Math.round(b.height)); });
          return out.slice(0, 3); })(),
        flarePips: document.querySelectorAll('#railOwn .pips i').length,
        badText: (() => { const out = []; const w = n => n.childNodes.forEach(c => c.nodeType === 3 ? (/undefined|NaN|\[object/.test(c.nodeValue) && out.push(c.nodeValue.trim().slice(0, 26))) : c.nodeType === 1 && w(c)); w(document.body); return out.slice(0, 3); })(),
        clippedAb: [...document.querySelectorAll('.gc-ab')].filter(a => a.scrollHeight - a.clientHeight > 2).length,
      };
    });

    if (!st.handImgsOk) problems.push('รูปการ์ดในมือโหลดไม่ครบ');
    if (!st.tkImgsOk) problems.push('รูป token บนสนามโหลดไม่ครบ');
    if (st.tkOver.length) problems.push('token ล้นขอบช่องสนาม: ' + st.tkOver.join(' / '));
    if (st.badStruct.length) problems.push('layout เกินขอบจอ: ' + st.badStruct.slice(0, 3).join(' | '));
    if (st.tkFit) problems.push('token ล้นช่องสนาม ' + st.tkFit + ' ช่อง');
    if (st.badText.length) problems.push('พบ ข้อความ error ใน DOM: ' + st.badText.join('|'));
    if (st.hand < 1 && vp.width === 390) problems.push('มือว่าง (คาดว่ามีใบเล่น)');
    if (st.scrollY > 6 && vp.width !== 844 && vp.height > 500) problems.push('หน้า scroll แนวนอนไม่ได้ (overflow y=' + st.scrollY + ')');

    /* --- drag & drop + กดค้าง (เฉพาะ viewport มือถือ) --- */
    if (vp.width === 390) {
      /* รอให้ AI เล่นจบคิวก่อน แล้วค่อยบังคับสถานการณ์ทดสอบการลาก */
      await page.waitForFunction(() => { const S = window.__ZF.st(); return S && !S.winner && !S.pending && !S.uiAsk && !window.__ZF.U.busy; }, null, { timeout: 12000 }).catch(() => { });
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        const S = window.__ZF.st();
        S.active = 'p0'; S.phase = 'main'; S.pending = null; S.uiAsk = null; S.turnActions = 0; S.winner = null;
        for (let r = 0; r < RULES.rows; r++) for (let c = 0; c < RULES.cols; c++) { if (S.cells[r][c].unit) { delete S.cards[S.cells[r][c].unit.uid]; S.cells[r][c].unit = null; } }
        S.players.p0.hand = ['sd01004']; S.players.p0.flare = 9; S.players.p0.deck = S.players.p0.deck || [];
        window.__ZF.U.busy = false; window.__ZF.U.human = 'p0';
        document.getElementById('veil').classList.add('hidden'); window.__ZF.render();
      });
      await page.waitForTimeout(250);
      await page.evaluate(() => { const S = window.__ZF.st(); S.active = 'p0'; window.__ZF.U.busy = false; window.__ZF.render(); });
      await page.waitForTimeout(150);
      const g = await page.locator('#hand .gcard').first().boundingBox();
      const tgt = await page.evaluate(() => { const i = Z.cardPlayable(window.__ZF.st(), 'p0', 0); const t = i && i.ok ? i.cells[0] : null; if (!t) return null;
        const e = [...document.querySelectorAll('.cell')].find(x => +x.dataset.r === t.r && +x.dataset.c === t.c).getBoundingClientRect(); return [e.x + e.width / 2, e.y + e.height / 2]; });
      if (!tgt) { problems.push('drag: หาช่องวางสำหรับทดสอบไม่ได้'); }
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await page.mouse.down();
      await page.mouse.move(g.x + g.width / 2 + 14, g.y + g.height / 2 - 34, { steps: 4 });
      const dragging = await page.evaluate(() => !!window.__ZF.U.drag && getComputedStyle(document.getElementById('dragGhost')).display !== 'none' && document.querySelectorAll('.cell.drop-ok').length > 0);
      await page.mouse.move(tgt[0], tgt[1], { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(1400);
      const deployedOrCmd = await page.evaluate(() => ({ units: document.querySelectorAll('.tk').length, hand: window.__ZF.st().players.p0.hand.length,
        act: window.__ZF.st().active, busy: window.__ZF.U.busy, drag: !!window.__ZF.U.drag, hint: document.getElementById('hint').textContent.slice(0, 40), log: window.__ZF.st().log.slice(-1)[0].msg.slice(0, 50) }));
      console.log('      drag result:', JSON.stringify(deployedOrCmd));
      if (!dragging) problems.push('drag: ไม่มี ghost/highlight ระหว่างลาก');
      if (!(deployedOrCmd.units >= 1 || deployedOrCmd.hand === 0)) problems.push('drag & drop: ลากแล้วไม่ทำงาน');
      await page.evaluate(() => { const S = window.__ZF.st(); if (S.uiAsk) window.__ZF.answer(null); });
      await page.waitForTimeout(500);
      const tkLoc = page.locator('#board .tk.own').first();
      if (!await tkLoc.count()) { problems.push('drag & drop: ลากแล้วไม่มียูนิตลงสนาม'); }
      const tk = await tkLoc.boundingBox({ timeout: 4000 }).catch(() => null);
      if (tk) {
        await page.mouse.move(tk.x + tk.width / 2, tk.y + tk.height / 2); await page.mouse.down(); await page.waitForTimeout(780); await page.mouse.up(); await page.waitForTimeout(300);
        if (!await page.evaluate(() => !document.getElementById('zoneView').classList.contains('hidden'))) problems.push('กดค้างที่ยูนิตแล้วไม่เปิดชีข้อมูล');
        await page.evaluate(() => document.getElementById('zoneView').classList.add('hidden'));
      }
      /* --- ตรวจว่าหน้าต่าง “ขอให้เลือก” บังคับจริง แล้วปิดได้ --- */
      const askState = await page.evaluate(() => {
        const S = window.__ZF.st();
        const v = document.getElementById('askVeil'), pn = document.getElementById('askPanel');
        const vis = e => getComputedStyle(e).display !== 'none';
        return { pendingAsk: !!S.uiAsk, kind: S.uiAsk && S.uiAsk.kind, panelVisible: vis(pn), veilVisible: vis(v), cards: document.querySelectorAll('#askCards .ask-card, #askActs .parallelogram').length };
      });
      if (askState.pendingAsk && !askState.panelVisible) problems.push('ask: มียอดถามแต่แผงไม่แสดง');
      if (askState.pendingAsk && !askState.cards) problems.push('ask: แผงเปิดแต่ไม่มีตัวเลือก');
      if (!askState.pendingAsk && (askState.panelVisible || askState.veilVisible)) problems.push('ask: แผง/ม่านค้างทั้งที่ไม่มีการเลือก');
      await page.evaluate(() => { if (window.__ZF.st().uiAsk) window.__ZF.answer(null); });
      await page.waitForTimeout(400);
      const askAfter = await page.evaluate(() => ({ pending: !!window.__ZF.st().uiAsk, panel: getComputedStyle(document.getElementById('askPanel')).display !== 'none', veil: getComputedStyle(document.getElementById('askVeil')).display !== 'none' }));
      if (askAfter.panel || askAfter.veil) problems.push('ask: ตอบแล้วยังไม่ปิดแผง (' + JSON.stringify(askAfter) + ')');
      await page.click('#btnFull'); await page.waitForTimeout(500);
      await page.evaluate(() => { const f = document.fullscreenElement || document.webkitFullscreenElement; if (f && document.exitFullscreen) document.exitFullscreen(); });
      await page.waitForTimeout(300);
    }

    console.log(`${problems.length ? 'FAIL' : 'OK  '} ${vp.width}x${vp.height} · turn ${st.turn} · tk ${st.tokens} · terr ${st.terrains} · มือ ${st.hand} · cell ${st.cell.join('x')} · pips ${st.flarePips} · scrollY ${st.scrollY}`);
    problems.forEach(p => console.log('      · ' + p));
    total += problems.length;
    if (shots) await page.screenshot({ path: `${shots}/${vp.width}x${vp.height}.png` });
    await page.close();
  }
  await br.close();
  console.log(total ? `\nพบ ${total} ปัญหา` : '\nผ่านทุก viewport');
  process.exit(total ? 1 : 0);
})();
