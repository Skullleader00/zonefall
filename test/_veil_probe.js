/* probe: long-press บนมือถือ (hasTouch) — path ไหนที่ทำให้ชีข้อมูลไม่เปิด */
const fs = require('fs');
const { chromium } = require('playwright');
const EXE = process.env.CHROME || '/opt/playwright-browsers/chromium-1209/chrome-linux64/chrome';
(async () => {
  const br = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : undefined, args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 150)));
  await page.goto('http://localhost:3000/index.html?_=probe' + Date.now(), { waitUntil: 'networkidle' });
  await page.evaluate(() => { if ('caches' in window) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); });
  await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())));
  await page.waitForTimeout(400);
  await page.click('#btnStart'); await page.waitForTimeout(350);
  await page.click('.rps-btn'); await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const S = window.__ZF.st();
    S.players.p0.hand = ['sd01004']; S.players.p0.flare = 9; S.active = 'p0';
    document.getElementById('veil').classList.add('hidden');
    window.__ZF.render();
    window.__EV = [];
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture'].forEach(t =>
      document.addEventListener(t, e => { if (String(e.target.className || '').indexOf('gc') >= 0 || t !== 'pointermove') window.__EV.push(t + ':' + e.pointerType + ':' + String(e.target.className || e.target.tagName).slice(0, 14)); }, true));
  });
  const p = await page.evaluate(() => { const b = document.querySelector('#hand .gcard').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
  console.log('A) mouse path');
  await page.mouse.move(p[0], p[1]); await page.mouse.down(); await page.waitForTimeout(700);
  console.log('  during:', await page.evaluate(() => document.getElementById('zoneView').className + ' | ev=' + window.__EV.join(', ')));
  await page.mouse.up(); await page.waitForTimeout(300);
  console.log('  after :', await page.evaluate(() => 'zv=' + document.getElementById('zoneView').className + ' | ev=' + window.__EV.join(', ')));
  await page.evaluate(() => { window.__EV = []; document.getElementById('zoneView').classList.add('hidden'); });
  console.log('B) touch pointer path');
  await page.evaluate(([x, y]) => {
    const n = document.querySelector('#hand .gcard');
    n.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, buttons: 1 }));
  }, p);
  await page.waitForTimeout(700);
  console.log('  during:', await page.evaluate(() => 'zv=' + document.getElementById('zoneView').className + ' | ev=' + window.__EV.join(', ')));
  await page.evaluate(([x, y]) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true })), p);
  await page.waitForTimeout(350);
  console.log('  after :', await page.evaluate(() => 'zv=' + document.getElementById('zoneView').className + ' | ev=' + window.__EV.join(', ')));
  console.log('errs:', errs.join(' | '));
  await br.close();
})();
