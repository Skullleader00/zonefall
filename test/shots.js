/* ถ่ายภาพหน้าจอส่งงาน: HOME · แผงเลือกเป้าหมาย · Trigger Check · ชีกดค้าง · กระดาน 2 ขนาด
   usage: node test/shots.js      (out: test/shots/)                                                  */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const EXE = process.env.CHROME || '/opt/playwright-browsers/chromium-1209/chrome-linux64/chrome';
const OUT = process.env.OUT || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000/index.html';

/* ฉากที่ใช้ร่วมกัน: Terrain ซ้อนกัน 2 ชั้น + ยูนิต 3v3 + มือ 6 ใบ */
const STAGE = () => {
  const S = window.__ZF.st(), H = Z.helpers();
  document.getElementById('veil').classList.add('hidden');
  S.active = 'p0'; S.phase = 'main'; S.pending = null; S.uiAsk = null; S.winner = null; S.turnActions = 0;
  window.__ZF.U.busy = false;
  S.players.p0.flare = 8; S.players.p1.flare = 6;
  S.players.p0.corePoints = 3; S.players.p1.corePoints = 2;
  S.players.p0.hand = ['sd01004', 'sd01006', 'sd01012', 'sd01002', 'sd01008', 'sd04001'];
  S.players.p1.hand = ['sd04004', 'sd04009', 'sd04003', 'sb01013'];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
    if (S.cells[r][c].unit) { delete S.cards[S.cells[r][c].unit.uid]; S.cells[r][c].unit = null; }
    S.cells[r][c].terrain = null;
  }
  const put = (id, side, r, c, rested) => { const u = H.makeCard(S, id, side, r, c, 'unit'); u.deployed = true; if (rested) u.rested = true; return u; };
  const terr = (id, side, r, c) => H.makeCard(S, id, side, r, c, 'terrain');
  terr('sd01008', 'p0', 3, 1); terr('sd01007', 'p0', 3, 2); terr('sd040013', 'p1', 1, 0);
  put('sd01004', 'p0', 3, 1); put('sd01002', 'p0', 3, 0, true); put('sd01012', 'p0', 4, 1);
  put('sd04004', 'p1', 1, 0); put('sd04009', 'p1', 1, 2, true); put('sd04003', 'p1', 0, 1);
  window.__ZF.render();
  return S;
};

(async () => {
  const br = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : undefined, args: ['--no-sandbox'] });
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('   →', name + '.png'); };

  /* ============ มือถือ 390×844 ============ */
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE + '?_=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '01-home-mobile');
  await page.click('#btnStart'); await page.waitForTimeout(500);
  await shot(page, '02-rps-mobile');
  await page.click('.rps-btn'); await page.waitForTimeout(1800);
  await page.evaluate(STAGE);
  await page.waitForTimeout(700);
  await shot(page, '03-board-mobile');

  /* แผงเลือกเป้าหมาย (เอฟเฟกต์ “เลือก 1”) */
  await page.evaluate(() => {
    const S = window.__ZF.st(), H = Z.helpers();
    const me = H.units(S, 'p0')[0];
    H.runOps(S, { side: 'p0', uid: me.uid }, [{ op: 'cp', to: 'target', n: 3000, dur: 'turn', scope: 'own', prompt: 'เลือดยูนิต 1 ตัวของคุณ' }], {});
    window.__ZF.render();
  });
  await page.waitForTimeout(800);
  await shot(page, '04-target-ask');
  await page.evaluate(() => { if (window.__ZF.st().uiAsk) window.__ZF.answer(null); });
  await page.waitForTimeout(400);

  /* Trigger Check (เด้งขึ้นหัว + เลือก ใช้/เก็บ) */
  await page.evaluate(() => {
    const S = window.__ZF.st();
    S.players.p0.deck = ['sd01010'].concat(S.players.p0.deck.filter(x => x !== 'sd01010'));
    Z.triggerCheck(S, 'p0');
    window.__ZF.render();
  });
  await page.waitForTimeout(1100);
  await shot(page, '05-trigger-check');
  await page.evaluate(() => { if (window.__ZF.st().uiAsk) window.__ZF.answer('keep'); });
  await page.waitForTimeout(500);

  /* ชีข้อมูลจากการกดค้าง */
  const b = await page.locator('#hand .gcard').first().boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(720); await page.mouse.up();
  await page.waitForTimeout(500);
  await shot(page, '06-card-sheet');
  await ctx.close();

  /* ============ เดสก์ท็อป 1366×850 ============ */
  const ctx2 = await br.newContext({ viewport: { width: 1366, height: 850 }, deviceScaleFactor: 2 });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '?_=' + Date.now(), { waitUntil: 'networkidle' });
  await p2.waitForTimeout(800);
  await p2.click('#btnStart'); await p2.waitForTimeout(400);
  await p2.click('.rps-btn'); await p2.waitForTimeout(1700);
  await p2.evaluate(STAGE);
  await p2.waitForTimeout(600);
  await shot(p2, '07-board-desktop');

  /* แถบแสดงการ์ดที่เปิดจากสมุด + ตอบโต้ (Declaration-Response) */
  await p2.evaluate(() => {
    const S = window.__ZF.st(), H = Z.helpers();
    S.reveal = { side: 'p0', ids: ['sd01010', 'sd01011', 'sd04010'], reason: 'เปิดการ์ดจากสมุด' };
    H.fxq(S, { t: 'reveal', side: 'p0', ids: S.reveal.ids, reason: S.reveal.reason });
    window.__ZF.render();
  });
  await p2.waitForTimeout(400);
  await p2.evaluate(() => {
    const S = window.__ZF.st();
    S.players.p1.hand = ['sd01011', 'sb01013']; S.players.p1.flare = 8;
    const atk = Z.units ? null : null;
    const mine = Z.helpers().units(S, 'p1'), foe = Z.helpers().units(S, 'p0');
    S.active = 'p1';
    Z.attack(S, 'p1', mine[0].uid, foe[0].uid);
    window.__ZF.render();
  });
  await p2.waitForTimeout(900);
  await shot(p2, '08-response-and-reveal');
  await ctx2.close();
  await br.close();
  console.log('เสร็จ →', OUT);
})();
