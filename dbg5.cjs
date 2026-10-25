const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const g = '/opt/playwright-browsers/chromium-1209/chrome-linux64/chrome';
  const br = await chromium.launch({ executablePath: fs.existsSync(g) ? g : undefined, args: ['--no-sandbox'] });
  const page = await (await br.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on('pageerror', e => console.log('PE:', e.message.slice(0, 150)));
  await page.goto('http://localhost:3000/index.html'); await page.waitForTimeout(800);
  await page.click('#btnStart'); await page.waitForTimeout(250); await page.click('.rps-btn'); await page.waitForTimeout(1100);
  await page.evaluate(() => { const S = window.__ZF.st(); S.active='p0'; S.phase='main'; S.players.p0.flare=8; S.players.p0.hand=['sd01007','sd01001']; window.__ZF.render(); });
  // วาง terrain + unit ผ่าน API
  await page.evaluate(() => { const S = window.__ZF.st(); Z.terrain(S,'p0',1,{r:3,c:1}); const i2=S.players.p0.hand.indexOf('sd01001'); Z.deploy(S,'p0',i2<0?0:i2,{r:4,c:1}); });
  await page.waitForTimeout(500);
  console.log('dom terr:', await page.evaluate(()=>document.querySelectorAll('.terr img').length), 'tk:', await page.evaluate(()=>document.querySelectorAll('.tk').length));
  const b = await page.locator('.tk').first().boundingBox();
  await page.mouse.move(b.x+b.width/2, b.y+b.height/2); await page.mouse.down(); await page.waitForTimeout(750);
  console.log('during press:', await page.evaluate(()=>({z:document.getElementById('zoneView').className, title:document.getElementById('zvTitle').textContent.slice(0,24), drag:!!window.__ZF.U.drag, dg:!!window.__ZF.U.dg})));
  await page.mouse.up(); await page.waitForTimeout(400);
  console.log('after press:', await page.evaluate(()=>({z:document.getElementById('zoneView').className, title:document.getElementById('zvTitle').textContent.slice(0,24)})));
  await br.close();
})();
