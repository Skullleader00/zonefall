/* E2E: ปฏิสัมพันธ์ใหม่ — ลากวาง, กดค้างดูข้อมูล, Terrain+ยูนิตซ้อนช่อง, ปุ่มเต็มจอ
   usage: node test/interact.js    (env BASE / CHROME) */
const BASE = process.env.BASE || 'http://localhost:3000/index.html';
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('ข้าม: ไม่พบ module playwright (npm i -D playwright)'); process.exit(0); }

const fails = [], passes = [];
const A = (cond, msg) => (cond ? passes : fails).push(msg);

(async () => {
  const fs = require('fs');
  const guess = process.env.CHROME || '/opt/playwright-browsers/chromium-1209/chrome-linux64/chrome';
  const br = await chromium.launch({ executablePath: fs.existsSync(guess) ? guess : undefined, args: ['--no-sandbox'] });
  const page = await (await br.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 170)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 170)); else if (/DBG/.test(m.text())) console.log('  · ' + m.text().slice(0, 110)); });

  const pt = (sel) => page.locator(sel).first().boundingBox().then(b => [b.x + b.width / 2, b.y + b.height / 2]);
  const cellPt = (r, c) => page.evaluate(([r2, c2]) => {
    const el = [...document.querySelectorAll('.cell')].find(e => +e.dataset.r === r2 && +e.dataset.c === c2).getBoundingClientRect();
    return [el.x + el.width / 2, el.y + el.height / 2];
  }, [r, c]);
  const settle = () => page.waitForFunction(() => { const S = window.__ZF.st(); return S && !S.pending && !window.__ZF.U.busy && !window.__ZF.U.drag; }, null, { timeout: 12000 }).catch(() => { });
  const setHand = (hand, flare) => page.evaluate(([h, f]) => {
    const S = window.__ZF.st(); S.active = 'p0'; S.phase = 'main'; S.pending = null; S.turnActions = 0;
    S.players.p0.hand = h; S.players.p0.flare = f; window.__ZF.render();
  }, [hand, flare]);
  const drag = async (fromSel, to) => {
    const f = await pt(fromSel);
    await page.mouse.move(f[0], f[1]); await page.mouse.down();
    await page.mouse.move(f[0] + 12, f[1] - 30, { steps: 4 });
    await page.mouse.move(to[0], to[1], { steps: 12 });
    await page.mouse.up(); await page.waitForTimeout(520);
  };
  const longPress = async (sel) => {
    const p = await pt(sel);
    await page.mouse.move(p[0], p[1]); await page.mouse.down(); await page.waitForTimeout(780); await page.mouse.up();
    await page.waitForTimeout(320);
  };

  const stage = (units, terrains) => page.evaluate(([us, ts]) => {
    const S = window.__ZF.st();
    for (let r = 0; r < RULES.rows; r++) for (let c = 0; c < RULES.cols; c++) {
      if (S.cells[r][c].unit) { delete S.cards[S.cells[r][c].unit.uid]; S.cells[r][c].unit = null; }
      if (S.cells[r][c].terrain) { delete S.cells[r][c].terrain.uid ? 0 : 0; delete S.cards[S.cells[r][c].terrain.uid]; S.cells[r][c].terrain = null; }
    }
    S.active = 'p0'; S.phase = 'main'; S.pending = null; S.turnActions = 0;
    S.players.p0.hand = []; S.players.p0.flare = 9; S.players.p1.hand = [];
    let n = 100;
    (ts || []).forEach(([id, r, c]) => { const u = makeCardAt(S, id, 'p1' === 'x' ? 'p0' : 'p0', r, c, 'terrain'); });
    function makeCardAt(S2, id, side, r, c, kind) { const o = { uid: 'st' + (n++), id, side, r, c, rested: false, dmg: 0, fused: [], used: {} }; S2.cards[o.uid] = o; S2.cells[r][c][kind] = o; return o; }
    (us || []).forEach(([id, side, r, c]) => makeCardAt(S, id, side, r, c, 'unit'));
    window.__ZF.render();
  }, [units, terrains]);
  await page.goto(BASE); await page.waitForTimeout(900);
  await page.click('#btnStart'); await page.waitForTimeout(300);
  await page.click('.rps-btn'); await page.waitForTimeout(1300); await settle();

  /* 1 --- มือแสดงสแกนจริง */
  await setHand(['sd01007', 'sd01004', 'sd01011'], 8);
  A(await page.locator('#hand .gcard').count() === 3, 'มือแสดงครบ 3 ใบ');
  A(await page.locator('#hand .gcard').first().locator('img.gc-img').getAttribute('src') === 'img/SD01-007.jpg', 'การ์ดในมือเป็นรูปสแกนจริงเต็มใบ (ไม่มี frame ซ้อน)');
  A(await page.locator('#hand .gcard').first().locator('img.gc-img').evaluate(i => i.complete && i.naturalWidth > 300), 'ภาพการ์ดย่อโหลดสำเร็จ');

  /* 2 --- ลาก Terrain ลงแถวหน้า */
  let info = await page.evaluate(() => Z.cardPlayable(window.__ZF.st(), 'p0', 0));
  await drag('#hand .gcard:nth-child(1)', await cellPt(info.cells[0].r, info.cells[0].c));
  A(await page.evaluate(() => document.querySelectorAll('.terr img').length) === 1, 'ลาก Terrain ลงช่อง → แสดงภาพกลืนกับช่องสนาม');

  /* 3 --- ลากยูนิตลงแถวหลัง */
  const uIdx = await page.evaluate(() => window.__ZF.st().players.p0.hand.findIndex(id => CARD_INDEX[id].type === 'unit'));
  info = await page.evaluate(i => Z.cardPlayable(window.__ZF.st(), 'p0', i), uIdx);
  await drag('#hand .gcard:nth-child(' + (uIdx + 1) + ')', await cellPt(info.cells[0].r, info.cells[0].c));
  A(await page.evaluate(() => document.querySelectorAll('#board .cell .tk.own .tk-img').length) === 1, 'ลากยูนิตลงสนาม → token เป็นภาพการ์ดเต็มช่อง');
  A(await page.evaluate(() => { const i = document.querySelector('.tk .tk-img'); return !!i && i.complete && i.naturalWidth > 300; }), 'ภาพบน token โหลดครบ');
  A(await page.evaluate(() => { const t = document.querySelector('.tk'); return !!t && !!t.querySelector('.tk-cost') && !!t.querySelector('.tk-cp'); }), 'token มี badge Cost + CP (ข้อมูลต่อสู้ยังอ่านง่าย)');

  /* 4 --- ลากยูนิตขึ้นไปทับช่อง Terrain (ยูนิตยืนบน Terrain ได้) */
  await stage([['sd01004', 'p0', 4, 0]], [['sd01007', 3, 0]]);
  const mv = await page.evaluate(() => { const S = window.__ZF.st(); const mine = Z.units(S, 'p0'); return { n: mine.length, mv: mine.length ? Z.legalMoveCells(S, mine[0]) : [] }; });
  A(mv.n === 1, 'มีแค่ยูนิตของเราบนสนาม (' + mv.n + ')');
  A(mv.mv.length > 0, 'ยูนิตมีช่องให้เดินต่อ (' + mv.mv.length + ')');
  const dest = mv.mv.find(m => m.r === 3) || mv.mv[0];   /* แถวหน้าของผู้เล่น = index 3 */
  await drag('#board .tk.own', await cellPt(dest.r, dest.c));
  await settle();
  const both = await page.evaluate(() => {
    const S = window.__ZF.st(); let n = 0;
    for (let r = 0; r < RULES.rows; r++) for (let c = 0; c < RULES.cols; c++) if (S.cells[r][c].terrain && S.cells[r][c].unit) n++;
    return { stack: n, cls: document.querySelectorAll('.cell.both').length, terrImg: document.querySelectorAll('.terr img').length };
  });
  A(both.stack === 1 && both.cls === 1 && both.terrImg === 1, 'ลากยูนิตไปทับช่อง Terrain → ภาพยูนิต+Terrain ซ้อนในช่องเดียว ' + JSON.stringify(both));

  /* 5 --- ลาก Command ลงแล้ว “ร่าย” ไม่ใช่กลายเป็นยูนิต */
  await setHand(['sd01011'], 9);
  const tkBefore = await page.evaluate(() => document.querySelectorAll('.tk').length);
  info = await page.evaluate(() => Z.cardPlayable(window.__ZF.st(), 'p0', 0));
  if (info && info.ok && info.cells && info.cells.length) {
    await drag('#hand .gcard:nth-child(1)', await cellPt(info.cells[0].r, info.cells[0].c));
    const after = await page.evaluate(() => ({ tk: document.querySelectorAll('.tk').length, out: window.__ZF.st().players.p0.outzone.length }));
    A(after.tk === tkBefore && after.out > 0, 'ลาก Command ลงช่อง → ร่ายจริงไป Outzone (token คงที่ ' + after.tk + ')');
  } else A(false, 'Command ไม่สามารถหาช่องวาง: ' + JSON.stringify(info && (info.why || info.cells)));

  /* 6 --- กดค้างที่ยูนิตบนสนาม */
  await setHand([], 0);
  await page.evaluate(() => { const S = window.__ZF.st(); for (let r = 0; r < RULES.rows; r++) for (let c = 0; c < RULES.cols; c++) { const t = S.cells[r][c].unit; if (t) { S.cells[r][c].unit = null; t.rested = true; S.cells[r][c].unit = t; } } window.__ZF.render(); });
  await longPress('#board .tk.own');
  const sheet = await page.evaluate(() => { const z = document.getElementById('zoneView'), i = document.querySelector('.cs-scan');
    return { open: !z.classList.contains('hidden'), scan: !!i && i.complete && i.naturalWidth > 200, title: (document.getElementById('zvTitle').textContent || '').slice(0, 24), sel: !!document.querySelector('.tk.sel') }; });
  A(sheet.open, 'กดค้างที่ยูนิตบนสนาม → เปิดชีข้อมูล (' + sheet.title + ')');
  A(sheet.scan, 'ชีข้อมูลแสดงภาพสแกนเต็มใบ');
  A(!sheet.sel, 'กดค้างไม่ทำให้ยูนิตถูกเลือก (ไม่ชนกับ taps)');
  await page.evaluate(() => document.getElementById('zoneView').classList.add('hidden'));

  /* 7 --- กดค้างที่การ์ดในมือ */
  await setHand(['sd01002'], 8);
  await longPress('#hand .gcard');
  A(await page.evaluate(() => !document.getElementById('zoneView').classList.contains('hidden')), 'กดค้างที่การ์ดในมือ → เปิดชีข้อมูล');
  await page.evaluate(() => document.getElementById('zoneView').classList.add('hidden')); await page.waitForTimeout(200);

  /* 8 --- tap-to-place ยังใช้ได้ (fallback) */
  await setHand(['sd01004'], 8);
  await page.waitForTimeout(500);
  await page.locator('#hand .gcard').first().click(); await page.waitForTimeout(380);
  A(await page.evaluate(() => document.querySelectorAll('.cell.hl-cell').length) > 0, 'แตะการ์ด → highlight ช่องวาง (fallback ยังทำงาน)');
  const tkPre = await page.evaluate(() => document.querySelectorAll('.tk').length);
  await page.locator('.cell.hl-cell').first().click(); await page.waitForTimeout(450);
  A(await page.evaluate(() => document.querySelectorAll('.tk').length) === tkPre + 1, 'แตะช่อง → วางยูนิตสำเร็จ');

  /* 9 --- Terrain ไม่มีหน่วยทับ: กดค้างช่องเปิดข้อมูล Terrain */
  await longPress('.cell.core');
  await page.evaluate(() => document.getElementById('zoneView').classList.add('hidden'));

  /* 10 --- เต็มจอ + Log */
  await page.click('#btnFull'); await page.waitForTimeout(600);
  const fsState = await page.evaluate(() => ({ fs: !!(document.fullscreenElement || document.webkitFullscreenElement), label: document.getElementById('btnFull').textContent.trim(), errs: (window.__zfErr || []).length }));
  await page.evaluate(() => { const f = document.fullscreenElement || document.webkitFullscreenElement; if (f && document.exitFullscreen) document.exitFullscreen(); });
  await page.waitForTimeout(300);
  A(errs.length === 0, 'กดปุ่มเต็มจอไม่ error (fs=' + fsState.fs + ', ปุ่ม=' + fsState.label + ', headline=' + 'headless บางตัวบล็อก API นี้)');
  await page.click('#btnLog'); await page.waitForTimeout(400);
  A(await page.evaluate(() => document.querySelectorAll('#logBody .lg').length) > 4, 'Log แสดงเหตุการณ์');

  await page.screenshot({ path: process.env.SHOT || 'interact-shot.png' });
  console.log('PASS ' + passes.length + '\n  ' + passes.join('\n  '));
  if (fails.length) console.log('\nFAIL ' + fails.length + '\n  ' + fails.join('\n  '));
  if (errs.length) console.log('\nJS ERRORS\n  ' + errs.join('\n  '));
  await br.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
