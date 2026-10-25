const { chromium } = require('playwright');
(async () => {
  const fs = require('fs');
  const guess = '/opt/playwright-browsers/chromium-1209/chrome-linux64/chrome';
  const br = await chromium.launch({ executablePath: fs.existsSync(guess) ? guess : undefined, args: ['--no-sandbox'] });
  const page = await (await br.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('CON:', m.text().slice(0, 160)); });
  page.on('pageerror', e => console.log('PE:', e.message.slice(0, 160)));
  page.on('console', m => console.log('LOG:', m.text().slice(0, 150)));
  await page.goto('http://localhost:3000/index.html'); await page.waitForTimeout(900);
  await page.click('#btnStart'); await page.waitForTimeout(300); await page.click('.rps-btn'); await page.waitForTimeout(1200);
  console.log('state0', JSON.stringify(await page.evaluate(() => { const S = window.__ZF.st(); return { act: S.active, busy: window.__ZF.U.busy, hand: S.players.p0.hand.length, pend: !!S.pending }; })));
  await page.evaluate(() => { const S = window.__ZF.st(); S.active = 'p0'; S.phase = 'main'; S.players.p0.flare = 8; S.players.p0.hand = ['sd01007', 'sd01001']; window.__ZF.render(); });
  const targets = await page.evaluate(() => { const i = Z.cardPlayable(window.__ZF.st(), 'p0', 0); return i; });
  console.log('playable info', JSON.stringify(targets).slice(0, 140));
  const b = await page.locator('#hand .gcard').first().boundingBox();
  const t0 = targets.cells[0];
  const tp = await page.evaluate(([r, c]) => { const el = [...document.querySelectorAll('.cell')].find(e => +e.dataset.r === r && +e.dataset.c === c).getBoundingClientRect(); return [el.x + el.width / 2, el.y + el.height / 2]; }, [t0.r, t0.c]);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(tp[0], tp[1], { steps: 10 });
  console.log('during drag', JSON.stringify(await page.evaluate(() => ({
    drag: !!window.__ZF.U.drag, ghost: getComputedStyle(document.getElementById('dragGhost')).display,
    drops: document.querySelectorAll('.cell.drop-ok').length, hl: document.querySelectorAll('.cell.hl-cell,.cell.drop-ok').length,
    hint: document.getElementById('hint').textContent.slice(0, 40) }))));
  await page.mouse.up(); await page.waitForTimeout(600);
  console.log('after drop', JSON.stringify(await page.evaluate(() => { const S = window.__ZF.st(); return { hand: S.players.p0.hand.length, terr: document.querySelectorAll('.terr img').length, tk: document.querySelectorAll('.tk').length, log: S.log.slice(-2).map(l => l.msg.slice(0, 60)) }; })));
  await br.close();
})();
