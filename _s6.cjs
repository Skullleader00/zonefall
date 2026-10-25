const { chromium } = require('playwright') || require('playwright'); const fs = require('fs');
(async () => {
  const g = '/opt/playwright-browsers/chromium-1209/chrome-linux64/chrome';
  const br = await chromium.launch({ executablePath: fs.existsSync(g) ? g : undefined, args: ['--no-sandbox'] });
  fs.mkdirSync('/tmp/qwenwork/sh7', { recursive: true });
  const P = n => '/tmp/qwenwork/sh7/' + n + '.png';
  for (const [vp, tag] of [[{ width: 390, height: 844 }, 'm'], [{ width: 1366, height: 850 }, 'd'], [{ width: 768, height: 1024 }, 't']]) {
    const page = await (await br.newContext({ viewport: vp, deviceScaleFactor: 2 })).newPage();
    await page.goto('http://localhost:3000/index.html'); await page.waitForTimeout(900);
    await page.screenshot({ path: P(tag + '1-home') });
    await page.click('#btnStart'); await page.waitForTimeout(300); await page.screenshot({ path: P(tag + '2-rps') });
    await page.click('.rps-btn'); await page.waitForTimeout(1200);
    // จัดฉากให้มียูนิต+terrain+response
    await page.evaluate(async () => {
      const S = window.__ZF.st(); let k = 0;
      while (!S.winner && S.turnNo < 12 && k++ < 300) { if (S.pending) { Z.respond(S, null); continue; } ZAI.takeTurn(S, S.active); }
      S.winner = null; S.players.p0.flare = 5; S.players.p0.hand = CARDS.slice(0, 5).map(c => c.id);
      document.getElementById('veil').classList.add('hidden'); window.__ZF.render();
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: P(tag + '3-board') });
    const tk = await page.locator('.tk').first().boundingBox();
    if (tk) { await page.screenshot({ path: P(tag + '4'), clip: { x: Math.max(0, tk.x - 40), y: Math.max(0, tk.y - 40), width: 320, height: 240 } }); }
    await page.close();
  }
  // ชีข้อมูล + response bar (มือถือ)
  const page = await (await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await page.goto('http://localhost:3000/index.html'); await page.waitForTimeout(800);
  await page.click('#btnStart'); await page.waitForTimeout(250); await page.click('.rps-btn'); await page.waitForTimeout(1100);
  await page.evaluate(() => { const S = window.__ZF.st(); S.active = 'p0'; S.pending = null; S.winner = null; S.players.p0.flare = 8;
    S.players.p0.hand = CARDS.slice(0, 4).map(c => c.id); window.__ZF.render(); });
  await page.waitForTimeout(400);
  const c = await page.locator('#hand .gcard').first().boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up(); await page.waitForTimeout(400);
  await page.screenshot({ path: 'sh7/m5-sheet.png' });
  await page.evaluate(() => document.getElementById('zoneView').classList.add('hidden'));
  await page.evaluate(() => { const S = window.__ZF.st(); Z.deploy(S, 'p0', 0, { r: 4, c: 1 }); window.__ZF.render(); });
  await page.evaluate(() => { const S = window.__ZF.st(); const i = S.players.p0.hand.indexOf('sb01010'); if (i >= 0) { S.players.p0.hand.splice(i, 1); } S.active='p1'; S.players.p1.flare = 6; S.players.p1.hand = ['sd04010', 'sd04011']; ZAI.takeTurn(S, 'p1'); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'sh7/m6-resp.png' });
  await br.close(); console.log('shots ok');
})();
