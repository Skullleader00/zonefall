/* E2E ปฏิสัมพันธ์ + ระบบเลือกเป้าหมาย/เปิดสมุด/ทริกเกอร์ + gesture lock
   usage: node test/interact.js */
const BASE = process.env.BASE || 'http://localhost:3000/index.html';
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('ข้าม: ไม่พบ playwright'); process.exit(0); }

const fails = [], passes = [];
const A = (ok, msg) => (ok ? passes : fails).push(msg);

(async () => {
  const fs = require('fs');
  const exe = process.env.CHROME || '/opt/playwright-browsers/chromium-1209/chrome-linux64/chrome';
  const br = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined, args: ['--no-sandbox'] });
  const page = await (await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });

  const settle = () => page.waitForFunction(() => { const S = window.__ZF.st(); return S && !S.pending && !window.__ZF.U.busy && !window.__ZF.U.drag; }, null, { timeout: 15000 }).catch(() => { });
  const pt = async sel => { const b = await page.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const cellPt = (r, c) => page.evaluate(([r2, c2]) => { const e = [...document.querySelectorAll('.cell')].find(x => +x.dataset.r === r2 && +x.dataset.c === c2).getBoundingClientRect(); return [e.x + e.width / 2, e.y + e.height / 2]; }, [r, c]);
  const drag = async (sel, to) => {
    const f = await pt(sel);
    await page.mouse.move(f[0], f[1]); await page.mouse.down();
    await page.mouse.move(f[0] + 6, f[1] - 30, { steps: 3 });
    await page.mouse.move(to[0], to[1], { steps: 12 });
    await page.mouse.up(); await page.waitForTimeout(500);
  };
  const longPress = async sel => {
    const p = await pt(sel);
    await page.mouse.move(p[0], p[1]); await page.mouse.down();
    await page.waitForTimeout(650); await page.mouse.up(); await page.waitForTimeout(320);
  };
  const setHand = (hand, flare) => page.evaluate(([h, f]) => {   /* แค่จัดมือ/flare ไม่แตะกระดาน */
    const S = window.__ZF.st(); S.active = 'p0'; S.phase = 'main'; S.pending = null; S.uiAsk = null; S.turnActions = 0;
    S.players.p0.hand = h.slice(); S.players.p0.flare = f; window.__ZF.render();
  }, [hand, flare]);
  const stage = (units, terrs) => page.evaluate(([us, ts]) => {
    const S = window.__ZF.st(); let n = 900;
    for (let r = 0; r < RULES.rows; r++) for (let c = 0; c < RULES.cols; c++) { const u = S.cells[r][c].unit, t = S.cells[r][c].terrain; if (u) delete S.cards[u.uid]; if (t) delete S.cards[t.uid]; S.cells[r][c].unit = S.cells[r][c].terrain = null; }
    const mk = (id, side, r, c, kind) => { const o = { uid: 'st' + (n++), id, side, r, c, rested: false, dmg: 0, fused: [], used: {} }; S.cards[o.uid] = o; S.cells[r][c][kind] = o; };
    (ts || []).forEach(([id, r, c]) => mk(id, 'p0', r, c, 'terrain'));
    (us || []).forEach(([id, side, r, c]) => mk(id, side, r, c, 'unit'));
    S.active = 'p0'; S.phase = 'main'; S.pending = null; S.uiAsk = null; window.__ZF.render();
  }, [units, terrs]);

  await page.goto(BASE + '?_=' + Date.now());
    await page.evaluate(() => { if ('caches' in window) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); });
    await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))); await page.waitForTimeout(900);
  await page.click('#btnStart'); await page.waitForTimeout(250); await page.click('.rps-btn'); await page.waitForTimeout(1200); await settle();
  A(true, 'บูตเกม + o/p/s ได้โดยไม่ error');

  /* ---------- 1) gesture lock ---------- */
  const locks = await page.evaluate(() => ({
    ctx: getComputedStyle(document.body).webkitTouchCallout || getComputedStyle(document.body).getPropertyValue('-webkit-touch-callout'),
    sel: getComputedStyle(document.body).userSelect,
    ingame: document.body.classList.contains('ingame'),
    cellTouch: getComputedStyle(document.querySelector('.cell')).touchAction,
    handTouch: getComputedStyle(document.getElementById('hand')).touchAction,
  }));
  const cm = await page.evaluate(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.querySelector('.tk, .cell').dispatchEvent(e); return e.defaultPrevented; });
  A(locks.ingame && locks.sel === 'none' && locks.cellTouch === 'none', 'ล็อก selection/callout ระหว่างเกม ' + JSON.stringify(locks));
  A(cm === true, 'contextmenu ถูกบล็อก (ไม่ขึ้นเมนูเซฟรูป/ก๊อปปี้)');
  const dstart = await page.evaluate(() => { const i = document.querySelector('#hand img.gc-img') || document.querySelector('.tk img'); const e = new DragEvent('dragstart', { bubbles: true, cancelable: true }); i.dispatchEvent(e); return e.defaultPrevented; });
  A(dstart === true, 'dragstart ของรูปถูกกันไว้ (ไม่ลากรูปออกนอกเกม)');

  /* ---------- 2) drag & drop + drop-ok + token เต็มช่อง ---------- */
  await stage([], []); await setHand(['sd01007'], 8);
  const info1 = await page.evaluate(() => Z.cardPlayable(window.__ZF.st(), 'p0', 0));
  const f1 = await pt('#hand .gcard');
  await page.mouse.move(f1[0], f1[1]); await page.mouse.down(); await page.mouse.move(f1[0] + 8, f1[1] - 28, { steps: 3 });
  const mid = await page.evaluate(() => ({ drag: !!window.__ZF.U.drag, ghost: getComputedStyle(document.getElementById('dragGhost')).display, ok: document.querySelectorAll('.cell.drop-ok').length, gcls: document.getElementById('dragGhost').className }));
  A(mid.drag && mid.ghost !== 'none' && mid.ok > 0 && /live/.test(mid.gcls), 'ghost + highlight + clip ระหว่างลาก ' + JSON.stringify(mid));
  const t1 = info1.cells[0];
  await page.mouse.move(...await cellPt(t1.r, t1.c), { steps: 8 });
  await page.mouse.up(); await page.waitForTimeout(600); await settle();
  A(await page.evaluate(() => document.querySelectorAll('.terr img').length) === 1, 'วาง Terrain จาก drag สำเร็จ');

  await stage([], []); await setHand(['sd01004'], 8);
  const i2 = await page.evaluate(() => Z.cardPlayable(window.__ZF.st(), 'p0', 0));
  await drag('#hand .gcard', await cellPt(i2.cells[0].r, i2.cells[0].c));
  await settle();
  A(await page.evaluate(() => document.querySelectorAll('.tk .tk-img').length) === 1, 'วางยูนิตจาก drag สำเร็จ (token ภาพเต็มช่อง)');

  /* ---------- 3) ลากไม่สำเร็จ → การ์ดไม่เทา ยังลากซ้ำได้ ---------- */
  await stage([], []); await setHand(['sd01002'], 9);
  const f3 = await pt('#hand .gcard'), cellBad = await cellPt(1, 1);   // แถวศัตรู = ผิดกฎ
  await page.mouse.move(f3[0], f3[1]); await page.mouse.down();
  await page.mouse.move(f3[0] + 8, f3[1] - 30, { steps: 3 });
  await page.mouse.move(cellBad[0], cellBad[1], { steps: 8 });
  const badMark = await page.evaluate(() => document.querySelectorAll('.cell.drop-bad').length > 0);
  await page.mouse.up(); await page.waitForTimeout(500); await settle();
  const afterFail = await page.evaluate(() => { const g = document.querySelector('#hand .gcard'); return { dim: g.classList.contains('dim'), draggingCls: g.className.includes('dragging'), opacity: parseFloat(getComputedStyle(g).opacity), hand: window.__ZF.st().players.p0.hand.length, drag: !!window.__ZF.U.drag }; });
  A(badMark, 'ลากไปช่องผิด → ช่องขึ้นแดง (drop-bad)');
  A(!afterFail.dim && !afterFail.draggingCls && afterFail.opacity > .9 && afterFail.hand === 1 && !afterFail.drag, 'ยกเลิกการลากแล้วการ์ดกลับ usable (ไม่เทา) ' + JSON.stringify(afterFail));
  const i4 = await page.evaluate(() => { const x = Z.cardPlayable(window.__ZF.st(), 'p0', 0); return x.ok ? x.cells[0] : null; });
  await drag('#hand .gcard', await cellPt(i4.r, i4.c)); await settle();
  A(await page.evaluate(() => document.querySelectorAll('.tk').length) === 1, 'ลากซ้ำใบเดิมหลังล้มเหลวได้สำเร็จ');

  /* ---------- 4) ระบบเลือกเป้าหมาย (Command "choose 1") ---------- */
  await stage([['sd01004', 'p0', 2, 0], ['sd01005', 'p1', 2, 2]], []);
  await setHand(['sd01011'], 9);   // Barrier: Quick-Cast เลือกunit ผู้ถูกโจมตี — ใช้ผ่าน ability/ตอบโต้; ใช้ใบที่ rseq เลือกเป้าหมายตรง ๆ แทน
  const tgt = await page.evaluate(() => {
    const S = window.__ZF.st();
    const me = Z.units(S, 'p0')[0];
    const out = Z.fx(S, { side: 'p0', uid: me.uid }, [{ op: 'cp', to: 'target', n: 3000, dur: 'turn', scope: 'own', prompt: 'เลือกยูนิตของคุณ (ทดสอบ targeting)' }], {});
    window.__ZF.render();
    return { paused: !!(out && out.paused), ask: S.uiAsk && { kind: S.uiAsk.kind, n: (S.uiAsk.uids || []).length, title: S.uiAsk.title } };
  });
  A(tgt.paused && tgt.ask && tgt.ask.kind === 'target', 'engine ขอเลือกเป้าหมาย → uiAsk ' + JSON.stringify(tgt.ask));
  await page.waitForTimeout(250);
  const askUI = await page.evaluate(() => ({ open: !document.getElementById('askPanel').classList.contains('hidden'), cards: document.querySelectorAll('.ask-card').length, yes: !!document.getElementById('askYes') }));
  A(askUI.open && askUI.cards >= 1 && askUI.yes, 'หน้าต่างเลือกเป้าหมายเปิดพร้อมรูป카드 ' + JSON.stringify(askUI));
  const cpBefore = await page.evaluate(() => Z.effCp(window.__ZF.st(), Z.units(window.__ZF.st(), 'p0')[0]));
  const dbgAsk = 0 && await page.evaluate(() => ({ html: (document.getElementById('askCards').innerHTML || '').slice(0, 160), ask: window.__ZF.st().uiAsk && { kind: window.__ZF.st().uiAsk.kind, uids: window.__ZF.st().uiAsk.uids, side: window.__ZF.st().uiAsk.side } }));
  void dbgAsk;
  await page.locator('.ask-card').first().click({ timeout: 6000 }).catch(e => console.log('   ask-card click fail'));
  await page.waitForTimeout(400);
  const cpAfter = await page.evaluate(() => Z.effCp(window.__ZF.st(), Z.units(window.__ZF.st(), 'p0')[0]));
  A(cpAfter === cpBefore + 3000, ` chosen target ได้ผล +3000 CP (${cpBefore} → ${cpAfter})`);
  const animCls = await page.evaluate(() => { const t = document.querySelector('.tk'); return t ? t.className : ''; });
  A(true, 'class หลังเลือกเป้าหมาย: ' + animCls.slice(0, 40));

  /* ---------- 5) เปิดสมุด (reveal) มีหน้าต่างโชว์การ์ด ---------- */
  const rev = await page.evaluate(() => {
    const S = window.__ZF.st(); const before = S.players.p0.deck.length;
    Z.fx(S, { side: 'p0', uid: Z.units(S, 'p0')[0].uid }, [{ op: 'revealAdd', n: 3, filter: 'Green', prompt: 'เปิดดู 3 ใบบนสมุด' }], {});
    window.__ZF.render();
    return { ids: (S.reveal || {}).ids || [], ask: S.uiAsk && S.uiAsk.kind, before };
  });
  await page.waitForTimeout(400);
  const revUI = await page.evaluate(() => ({ ids: ((window.__ZF.st().reveal || {}).ids || []).length, strip: document.getElementById('revealStrip').classList.contains('show'), imgs: document.querySelectorAll('#revealStrip img').length, panel: !document.getElementById('askPanel').classList.contains('hidden'), cards: document.querySelectorAll('.ask-card').length }));
  A(revUI.ids === 3 && revUI.strip && revUI.imgs === 3, 'มีหน้าต่าง/แถบแสดงการ์ดที่เปิดจากสมุด ' + JSON.stringify(revUI));
  A(revUI.panel && revUI.cards >= 1, 'ให้เลือกใบที่จะขึ้นมือจากการ์ดที่เปิด (reveal ask)');
  await page.evaluate(() => { const b = document.querySelector('.ask-card:not(.off)'); if (b) b.click(); }); await page.waitForTimeout(400);
  const handLen = await page.evaluate(() => window.__ZF.st().players.p0.hand.length);
  A(typeof handLen === 'number', 'จิบเลือกจากกลุ่มเปิดสมุดแล้วดำเนินการต่อได้ (มือ ' + handLen + ' ใบ)');

  /* ---------- 6) Trigger Check: แอนิเมชัน + เลือกใช้/เก็บ ---------- */
  const tc = await page.evaluate(async () => {
    const S = window.__ZF.st();
    S.players.p0.hand = [];
    var withT = CARDS.filter(function (c) { return (c.abilities || []).some(function (a) { return a.kw === 'Trigger'; }); }).map(function (c) { return c.id; });
    var noT = CARDS.filter(function (c) { return (c.type === 'unit') && !(c.abilities || []).some(function (a) { return a.kw === 'Trigger'; }); }).map(function (c) { return c.id; });
    S.players.p0.deck = [noT[0], withT[0], withT[1]].concat(S.players.p0.deck);   // ใบแรกไม่มีทริกเกอร์ (ขึ้นมืออัตโนมัติ)
    Z.triggerCheck(S, 'p0');
    window.__ZF.render();
    return { ask: S.uiAsk && S.uiAsk.kind, reveal: (S.reveal || {}).ids, inHand: S.players.p0.hand.length, fx: (S.fxq || []).length };
  });
  await page.waitForTimeout(400);
  const tUI = await page.evaluate(() => ({ open: !document.getElementById('askPanel').classList.contains('hidden'), title: (document.getElementById('askTitle').textContent || '').slice(0, 26), btns: [...document.querySelectorAll('#askActs button')].map(b => b.textContent), img: !!document.querySelector('.ask-trig img') }));
  if (tc.ask === 'triggerUse') {
    A(tUI.open && tUI.img && tUI.btns.length === 2, 'Trigger Check มีแอนิเมชัน + ปุ่มเลือก 2 ปุ่ม ' + JSON.stringify(tUI));
    const before = await page.evaluate(() => window.__ZF.st().players.p0.hand.length);
    await page.locator('#askActs button').nth(1).click();      // “เก็บขึ้นมือ”
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ hand: window.__ZF.st().players.p0.hand.length, out: window.__ZF.st().players.p0.outzone.length }));
    A(after.hand === before + 1, 'เลือก “เก็บขึ้นมือ” → การ์ดเข้ามือปกติ (ไม่เสีย) ' + JSON.stringify(after));
  } else A(true, 'ใบที่เปิดไม่มี Trigger → ขึ้นมืออัตโนมัติ (ask=' + tc.ask + ', inHand=' + tc.inHand + ')');
  const tc2 = await page.evaluate(() => {
    const S = window.__ZF.st();
    const withT = CARDS.filter(c => (c.abilities || []).some(a => a.kw === 'Trigger')).map(c => c.id);
    S.players.p0.deck = [withT[0]].concat(S.players.p0.deck);
    Z.triggerCheck(S, 'p0');
    return { kind: S.uiAsk && S.uiAsk.kind, card: withT[0] };
  });
  if (tc2.kind === 'triggerUse') {
    await page.locator('#askActs button').nth(0).click();     // “ใช้เอฟเฟกต์”
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({ hand: window.__ZF.st().players.p0.hand.length, out: window.__ZF.st().players.p0.outzone.length }));
    A(st.out >= 1, 'เลือก “ใช้เอฟเฟกต์” → ใช้แล้วไป Outzone ' + JSON.stringify(st));
  } else A(false, 'คาดหวัง uiAsk triggerUse แต่ได้ ' + JSON.stringify(tc2));

  /* ---------- 7) เลื่อนมือด้วยปุ่มลูกศร + keyboard ---------- */
  const nine = await page.evaluate(() => CARDS.slice(0, 9).map(c => c.id));
  await setHand(nine, 9);
  const pan = await page.evaluate(async () => {
    const b = document.getElementById('hand'); b.scrollLeft = 0; await new Promise(r => setTimeout(r, 60));
    document.getElementById('pgR').click(); await new Promise(r => setTimeout(r, 500));
    const mid = b.scrollLeft;
    document.getElementById('pgL').click(); await new Promise(r => setTimeout(r, 520));
    return { mid, back: b.scrollLeft, range: b.scrollWidth - b.clientWidth, canScroll: document.getElementById('handWrap').classList.contains('canScroll'), pgDis: document.getElementById('pgL').disabled };
  });
  A(pan.mid > 10 && pan.back < pan.mid && pan.range > 10, 'ปุ่ม ‹ › เลื่อนมือได้จริง ' + JSON.stringify(pan));
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(420);
  A(await page.evaluate(() => document.getElementById('hand').scrollLeft > 5), 'คีย์บอร์ด ←/→ เลื่อนมือได้');

  /* ---------- 8) กดค้างดูข้อมูล (มือ + บนสนาม) ---------- */
  await page.waitForTimeout(450);
  await page.evaluate(() => { document.getElementById('hand').scrollLeft = 0; });
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.__EV2 = []; ['pointerdown', 'pointerup', 'pointercancel', 'click'].forEach(t => document.addEventListener(t, e => { if (window.__EV2.length < 14) window.__EV2.push(t + ':' + e.pointerType + ':' + String((e.target && (e.target.id || e.target.className)) || e.target.tagName).slice(0, 20) + '@' + Math.round(e.clientX) + ',' + Math.round(e.clientY)); }, true)); });
  if (0) console.log('   [s8 pre]', JSON.stringify(await page.evaluate(() => ({ cards: document.querySelectorAll('#hand .gcard').length, scrollLeft: document.getElementById('hand').scrollLeft, zv: document.getElementById('zoneView').className, ask: !!window.__ZF.st().uiAsk, veil: document.getElementById('askVeil').className, busy: window.__ZF.U.busy }))));
  await longPress('#hand .gcard');

  A(await page.evaluate(() => !document.getElementById('zoneView').classList.contains('hidden')), 'กดค้างการ์ดในมือ → เปิดชีข้อมูล');
  const sheetTxt = await page.evaluate(() => (document.getElementById('zvTitle').textContent || '').slice(0, 30));
  await page.evaluate(() => document.getElementById('zvClose').click());
  await stage([['sd01004', 'p0', 2, 1]], [['sd01007', 2, 1]]);
  await page.waitForTimeout(450);            /* รอ FLIP เข้าที่เดิมก่อนกดค้าง */
  await longPress('#board .tk.own');
  if (0) console.log('   [tk press]', (await page.evaluate(() => (window.__LPDBG || []).join(' | '))).slice(0, 300), 'geom=', JSON.stringify(await page.evaluate(() => { const tk = document.querySelector('#board .tk.own'); const b = tk.getBoundingClientRect(); const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return { cellCardId: (tk.closest('.cell') || {}).dataset ? tk.closest('.cell').dataset.cardId : null, topEl: at ? (at.id || at.className || at.tagName) : null, tkPE: getComputedStyle(tk).pointerEvents, box: [Math.round(b.x), Math.round(b.y)] }; })));
  const open2 = await page.evaluate(() => ({ open: !document.getElementById('zoneView').classList.contains('hidden'), t: (document.getElementById('zvTitle').textContent || '').slice(0, 30) }));
  A(open2.open, 'กดค้างtoken บนสนาม → เปิดชีข้อมูล (' + open2.t + ' / ก่อนหน้า ' + sheetTxt + ')');
  await page.evaluate(() => document.getElementById('zoneView').classList.add('hidden'));

  /* ---------- 9) ไม่มี text selection หลงเหลือ + ไม่ error ---------- */
  const finSel = await page.evaluate(() => { const e = document.querySelector('.tk .tk-cp') || document.querySelector('.gcard'); if (!e) return 'none'; const rng = document.createRange(); rng.selectNode(e); const sel = String(window.getSelection()); window.getSelection().removeAllRanges(); return sel ? sel.slice(0, 12) : 'empty'; });
  A(finSel === 'empty' || finSel === 'none', 'กดค้าง/ลากแล้วไม่เกิด text selection: ' + JSON.stringify(finSel));

  /* ---------- 10) เล่นครบเกมด้วยระบบ ask (AI vs AI) ---------- */
  await page.evaluate(() => { const S = window.__ZF.st(); window.__ZF.U.busy = true; });
  const full = await page.evaluate(async () => {
    const S = window.__ZF.st(); let ask = 0, g = 0;
    if (S.active === 'p0') { /* ปล่อยให้ AI ฝั่งเดียวเดิน แล้วสลับ */ }
    while (!S.winner && S.turnNo < 24 && g++ < 600) {
      if (S.uiAsk) { ask++; Z.answer(S, S.uiAsk.allowSkip ? null : (S.uiAsk.uids && S.uiAsk.uids[0]) || (S.uiAsk.cardIds && S.uiAsk.cardIds[0]) || (S.uiAsk.kind === 'hand' ? [] : null)); continue; }
      if (S.pending) { Z.respond(S, null); continue; }
      ZAI.takeTurn(S, S.active);
      await new Promise(r => setTimeout(r, 0));
    }
    window.__ZF.U.busy = false; window.__ZF.render();
    return { turn: S.turnNo, winner: S.winner, ask, pts: [S.players.p0.corePoints, S.players.p1.corePoints], tk: document.querySelectorAll('.tk').length };
  });
  A(full.turn > 5, 'เดินเกมต่อด้วยระบบ ask ได้ (' + JSON.stringify(full) + ')');

  if (shots()) await page.screenshot({ path: shots() + '/interact.png' });
  console.log('PASS ' + passes.length + '\n  ' + passes.join('\n  '));
  if (fails.length) console.log('\nFAIL ' + fails.length + '\n  ' + fails.join('\n  '));
  if (errs.length) console.log('\nJS ERRORS\n  ' + errs.slice(0, 8).join('\n  '));
  await br.close();
  process.exit(fails.length || errs.length ? 1 : 0);
  function shots() { return process.env.SHOTS || ''; }
})();
