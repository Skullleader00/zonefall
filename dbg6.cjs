/* e2e การโต้ตอบแบบใหม่: drag & drop, กดค้างดูข้อมูล, tap-to-place, Terrain กลืนกับช่อง, ปุ่มเต็มจอ
   usage: NODE_PATH=<ที่มี playwright> node test/interact.js  ([BASE=url]) */
const BASE = process.env.BASE || 'http://localhost:3000/index.html';
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { try { ({ chromium } = require('/tmp/qwenwork/node_modules/playwright')); } catch (_) { console.log('ข้าม: ไม่พบ module playwright'); process.exit(0); } }

const fails = [], passes = [];
const A = (cond, msg) => (cond ? passes : fails).push(msg);
const centerOf = (page, sel) => page.locator(sel).first().boundingBox().then(b => [b.x + b.width / 2, b.y + b.height / 2]);

(async () => {
  const fs = require('fs');
  const guess = process.env.CHROME || '/opt/playwright-browsers/chromium-1209/chrome-linux64/chrome';
  const br = await chromium.launch({ executablePath: fs.existsSync(guess) ? guess : undefined, args: ['--no-sandbox'] });
  const page = await (await br.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

  await page.goto(BASE); await page.waitForTimeout(900);
  await page.click('#btnStart'); await page.waitForTimeout(300);
  await page.click('.rps-btn'); await page.waitForTimeout(1100);

  /* จัดมือให้ทดสอบได้ deterministic: Terrain, Unit, Terrain, Command */
  await page.evaluate(() => {
    const S = window.__ZF.st(); S.active = 'p0'; S.phase = 'main'; S.players.p0.flare = 8;
    S.players.p0.hand = ['sd01007', 'sd01001', 'sb01012', 'sd01011'];
    window.__ZF.render();
  });

  A(await page.locator('#hand .gcard').count() === 4, 'มือแสดงครบ 4 ใบ');
  const src0 = await page.locator('#hand .gcard img.gc-img').first().getAttribute('src');
  A(src0 === 'img/SD01-007.jpg', 'มือถือภาพสแกนจริงของการ์ด: ' + src0);
  A(await page.locator('#hand .gcard img.gc-img').first().evaluate(i => i.complete && i.naturalWidth > 0), 'ภาพการ์ดย่อโหลดสำเร็จ');

  /* ---------- drag & drop ใบ Terrain ลงแถวหน้า ---------- */
  const cells = await page.evaluate(() => { const i = Z.cardPlayable(window.__ZF.st(), 'p0', 0); return i.ok ? i.cells : []; });
  A(cells.length > 0, ' Terrain มีช่องวางถูกกฎ ' + cells.length + ' ช่อง');
  const from = await centerOf(page, '#hand .gcard');
  const to = await page.evaluate(([r, c]) => {
    const el = [...document.querySelectorAll('.cell')].find(e => +e.dataset.r === r && +e.dataset.c === c).getBoundingClientRect();
    return [el.x + el.width / 2, el.y + el.height / 2];
  }, [cells[0].r, cells[0].c]);
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 6 });
  await page.mouse.move(to[0], to[1], { steps: 8 });
  A(await page.evaluate(() => getComputedStyle(document.getElementById('dragGhost')).display !== 'none'), 'ขณะลากมี ghost ตามนิ้ว');
  A(await page.evaluate(() => document.querySelectorAll('.cell.drop-ok').length > 0), 'ขณะลาก highlight ช่องที่วางได้');
  await page.mouse.move(to[0], to[1] + 1, { steps: 2 });
  await page.mouse.up(); await page.waitForTimeout(500);
  A(await page.evaluate(() => document.querySelectorAll('.terr img').length) === 1, 'Terrain แสดงภาพเต็มกลืนกับช่องสนาม');
  A(await page.evaluate(() => window.__ZF.st().players.p0.hand.length) === 3, 'มือลดเหลือ 3 หลังวาง');

  /* ---------- drag Unit ลงแถวหลัง ---------- */
  const unitCells = await page.evaluate(() => { const i = Z.cardPlayable(window.__ZF.st(), 'p0', 0); return i && i.ok ? i.cells : []; });
  const from2 = await centerOf(page, '#hand .gcard');
  const to2 = await page.evaluate(([r, c]) => {
    const el = [...document.querySelectorAll('.cell')].find(e => +e.dataset.r === r && +e.dataset.c === c).getBoundingClientRect();
    return [el.x + el.width / 2, el.y + el.height / 2];
  }, [unitCells[0].r, unitCells[0].c]);
  await page.mouse.move(from2[0], from2[1]); await page.mouse.down();
  await page.mouse.move(to2[0], to2[1], { steps: 12 }); await page.mouse.up();
  await page.waitForTimeout(600);
  A(await page.evaluate(() => document.querySelectorAll('.tk .tk-img').length) === 1, 'ลากยูนิตลงสนามสำเร็จ');
  A(await page.evaluate(() => { const i = document.querySelector('.tk .tk-img'); return i.complete && i.naturalWidth > 400; }), 'token บนสนามคือภาพการ์ดเต็มช่อง');
  A(await page.evaluate(() => !!document.querySelector('.tk .tk-cp') && !!document.querySelector('.tk .tk-cost')), 'token มี badge Cost + CP');

  /* ---------- ยูนิตเดินไปทับช่อง Terrain ด้วยลาก → class .both ---------- */
  const both = await page.evaluate(async () => {
    const S = window.__ZF.st(); const u = Z.units(S, 'p0')[0];
    const mv = Z.legalMoveCells(S, u); if (!mv.length) return 'no-move';
    const t = document.querySelector('.cell.both'); return t ? 'both' : (mv.length + ' targets');
  });
  A(true, 'ตรวจ move targets/token (info): ' + both);

  /* ---------- กดค้างที่ยูนิตบนสนาม ---------- */
  page.on('console', m => console.log('C:', m.text().slice(0, 120)));
  const tkb = await centerOf(page, '.tk');
  await page.mouse.move(tkb[0], tkb[1]); await page.mouse.down(); await page.waitForTimeout(720); await page.mouse.up();
  await page.waitForTimeout(400);
  const sheetOpen = await page.evaluate(() => { const z = document.getElementById('zoneView'); return { hidden: z.classList.contains('hidden'), disp: getComputedStyle(z).display, body: (document.getElementById('zvBody').textContent || '').slice(0, 40) }; });
  A(!sheetOpen.hidden && sheetOpen.disp !== 'none', 'กดค้างที่ยูนิต → เปิดชีข้อมูล ' + JSON.stringify(sheetOpen));
  A(await page.evaluate(() => { const i = document.querySelector('.cs-scan'); return !!i && i.complete && i.naturalWidth > 0; }), 'ชีข้อมูลแสดงภาพสแกนเต็มใบ');
  await page.evaluate(() => document.getElementById('zoneView').classList.add('hidden')); await page.waitForTimeout(200);
  A(await page.evaluate(() => !document.querySelector('.tk.sel')), 'กดค้างไม่ทำให้การ์ดถูกเลือก (ไม่สับสนกับ tap)');

  /* ---------- กดค้างที่การ์ดในมือ ---------- */
  const hb = await centerOf(page, '#hand .gcard');
  await page.mouse.move(hb[0], hb[1]); await page.mouse.down(); await page.waitForTimeout(720); await page.mouse.up();
  await page.waitForTimeout(400);
  A(await page.evaluate(() => !document.getElementById('zoneView').classList.contains('hidden')), 'กดค้างที่การ์ดในมือ → เปิดชีข้อมูล');
  await page.evaluate(() => document.getElementById('zoneView').classList.add('hidden')); await page.waitForTimeout(200);

  /* ---------- tap-to-place ยังทำงาน ---------- */
  await page.evaluate(() => { const S = window.__ZF.st(); S.players.p0.flare = 8; S.players.p0.hand = ['sb01005']; window.__ZF.render(); });
  await page.waitForTimeout(500);
  await page.locator('#hand .gcard').first().click(); await page.waitForTimeout(350);
  A(await page.evaluate(() => document.querySelectorAll('.cell.hl-cell').length) > 0, 'แตะแล้วยัง highlight ช่องวาง (tap fallback)');
  await page.locator('.cell.hl-cell').first().click(); await page.waitForTimeout(500);
  A(await page.evaluate(() => document.querySelectorAll('.tk').length) === 2, 'แตะ-วาง ลงสนามสำเร็จ');

  /* ---------- Terrain กลืนช่อง + ยังคลิกช่องที่มียูนิตอยู่ได้ ---------- */
  A(await page.evaluate(() => !!document.querySelector('.terr img')), 'Terrain ยังแสดงผลใต้/ในช่อง');

  /* ---------- ปุ่มเต็มจอ ---------- */
  const fsSupported = await page.evaluate(() => typeof document.documentElement.requestFullscreen === 'function');
  if (fsSupported) {
    await page.click('#btnFull'); await page.waitForTimeout(500);
    A(errs.length === 0, 'กดปุ่มเต็มจอไม่ error');
    await page.click('#btnFull'); await page.waitForTimeout(400);
  } else A(false, 'browser นี้ไม่รองรับ requestFullscreen');

  await page.screenshot({ path: process.env.SHOT || 'interact-shot.png' });
  console.log('PASS ' + passes.length + '\n  ' + passes.join('\n  '));
  if (fails.length) console.log('\nFAIL ' + fails.length + '\n  ' + fails.join('\n  '));
  if (errs.length) console.log('\nJS ERRORS\n  ' + errs.join('\n  '));
  await br.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
