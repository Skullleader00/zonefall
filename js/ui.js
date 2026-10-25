/* ==========================================================================
   ZONEFALL — UI (vanilla JS) · โครงจอตาม mockup ของทีม: rail Flare ขอบสนาม,
   การ์ดใช้ frame จริง (assets/ui/frame-*.png) + crop ภาพศิลปะจากสแกน (assets/art/)
   ทุกการตัดสินกติกาอยู่ใน js/engine.js — ไฟล์นี้แค่วาด state ลง DOM
   ========================================================================== */
(function () {
  const $ = id => document.getElementById(id);
  const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const R = Z.R, card = Z.card;
  const human = 'p0', aiSide = 'p1';
  const board = $('board');
  const COL = ['A', 'B', 'C'];
  const cellName = (r, c) => (r + 1) + COL[c];
  const FACTION_ICON = { Green: 'verdant', Blue: 'aegis', Red: 'ashen', Purple: 'nyx-horizon', Yellow: 'thronis', Colorless: 'aegis' };
  const FRAME = { unit: 'assets/ui/frame-unit.png', command: 'assets/ui/frame-unit.png', terrain: 'assets/ui/frame-terrain.png', arcanum: 'assets/ui/frame-unit.png', token: 'assets/ui/frame-unit.png' };
  const PHASE_ICON = { draw: 'assets/ui/icon-phase-draw.png', main: 'assets/ui/icon-phase-main.png', end: 'assets/ui/icon-phase-end.png' };
  const PHASE_TXT = { draw: 'DRAW Phase', main: 'MAIN Phase', end: 'END Phase' };
  const artOf = cd => 'assets/art/' + cd.file + '.jpg';
  /* url ใน custom property ถูก resolve เทียบกับไฟล์ CSS → ฝังเป็น absolute จาก baseURI ของเอกสาร */
  const urlVar = p => 'url("' + new URL(p, document.baseURI).href + '")';
  const kindLine = cd => ({ unit: 'UNIT', command: 'COMMAND', terrain: 'TERRAIN', token: 'TOKEN', arcanum: 'ARCANUM' })[cd.type] || 'CARD';

  const UI = {
    S: null, sel: null, busy: false, logAt: 0, respResolve: null, pick: null, fieldTheme: 'blue',
    hl: { move: [], atk: [], cells: [], targets: [] },
  };

  /* ------------------------------------------------- กระดาน */
  function buildBoard() {
    board.innerHTML = '';
    for (let r = 0; r < R.rows; r++) {
      for (let c = 0; c < R.cols; c++) {
        const cell = el('div', 'cell' + (r === R.coreRow ? ' core' : (r < R.coreRow ? ' foe' : ' own')));
        cell.dataset.r = r; cell.dataset.c = c;
        cell.appendChild(el('span', 'coord', cellName(r, c)));
        cell.appendChild(el('div', 'terr'));
        cell.appendChild(el('div', 'tkslot'));
        cell.addEventListener('click', () => onCell(r, c));
        board.appendChild(cell);
      }
    }
  }
  const cellEl = (r, c) => board.children[r * R.cols + c];

  /* ------------------------------------------------- render */
  function render() {
    const S = UI.S; if (!S) return;
    const p = S.players[human], q = S.players[aiSide];
    $('buildTag').textContent = R.version;
    $('phaseChip').innerHTML = `<img src="${PHASE_ICON[S.phase] || PHASE_ICON.main}" alt="">${PHASE_TXT[S.phase] || 'MAIN Phase'}`;
    $('phaseChip').classList.toggle('mine', S.active === human);

    plate(q, 'foe'); plate(p, 'own');
    pips($('railOwn'), p, S.active === human); pips($('railFoe'), q, S.active === aiSide);
    $('foeAvatar').src = 'assets/faction/' + (FACTION_ICON[q.faction] || 'aegis') + '.png';
    $('ownAvatar').src = 'assets/faction/' + (FACTION_ICON[p.faction] || 'verdant') + '.png';

    for (let r = 0; r < R.rows; r++) for (let c = 0; c < R.cols; c++) {
      const ce = cellEl(r, c), slot = ce.querySelector('.tkslot'), terr = ce.querySelector('.terr'), x = S.cells[r][c];
      ce.className = 'cell' + (r === R.coreRow ? ' core' : (r < R.coreRow ? ' foe' : ' own'));
      if (UI.hl.cells.some(k => k.r === r && k.c === c)) ce.classList.add('hl-cell');
      if (UI.hl.move.some(k => k.r === r && k.c === c)) ce.classList.add('hl-move');
      slot.innerHTML = ''; terr.innerHTML = '';
      if (x.terrain) {
        const tcd = card(x.terrain.id);
        terr.innerHTML = `<span class="t-chip ${x.terrain.side === human ? '' : 'foe'}">▦ ${tcd.name}</span>`;
      }
      const u = x.unit;
      if (!u) continue;
      if (UI.hl.atk.some(k => k.r === r && k.c === c)) ce.classList.add('hl-atk');
      if (UI.hl.targets.includes(u.uid)) ce.classList.add('hl-target');
      const cd = card(u.id);
      const tk = el('div', 'tk ' + (u.side === human ? 'own' : 'foe') + (u.rested ? ' rested' : '') + (u.arc ? ' arc' : '') +
        (UI.sel && UI.sel.kind === 'unit' && UI.sel.uid === u.uid ? ' sel' : ''));
      tk.style.setProperty('--art', urlVar(artOf(cd)));
      tk.innerHTML = `<span class="tk-art"></span><span class="tk-cp">${Z.effCp(S, u).toLocaleString()}</span>
        <span class="tk-name" title="${cd.name}">${cd.name}</span>
        <span class="tk-tag">${u.arc ? 'ARC' : cd.type === 'token' ? 'TOKEN' : (u.fused && u.fused.length ? 'FUSED ×' + u.fused.length : (cd.tribe || ''))}</span>
        ${u.dmg ? `<span class="tk-dmg">-${u.dmg.toLocaleString()}</span>` : ''}`;
      slot.appendChild(tk);
    }

    hand(p);
    const selU = UI.sel && UI.sel.kind === 'unit' ? S.cards[UI.sel.uid] : null;
    $('btnAbility').classList.toggle('hidden', !(selU && (card(selU.id).abilities || []).some(a => a.kw === 'Activate')));
    $('btnAbility').disabled = !canAct(S, selU);
    $('btnEnd').disabled = S.active !== human || UI.busy || !!S.pending;
    $('btnCancel').disabled = !UI.sel;
    renderLog(); renderResponse();
  }
  

  const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  function plate(p, who) {
    const S = UI.S;
    set(who + 'Name', p.deckName);
    set(who + 'Pts', p.corePoints);
    set(who + 'FlareN', p.flare);
    set(who + 'Hand', p.hand.length);
    set(who + 'DeckN', p.deck.length);
    set(who + 'Deck', p.deck.length);
    set('foeOutN', p.outzone.length); set('foeRemN', p.remove.length); set('foeExtraN', p.extra.length);
    set('ownOutN', p.outzone.length); set('ownOutN2', p.outzone.length);
    set('ownRemN', p.remove.length); set('ownExtraN', p.extra.length);
    if (who === 'own') {
      set('ownUnits', Z.units(S, human).length + '/' + R.unitLimit);
      set('ownTerr', Z.terrains(S, human).length + '/' + Z.terrainLimit(S, human));
      set('handLabel', 'มือ : ' + p.hand.length);
    }
  }

  function pips(rail, p, live) {
    const box = rail.querySelector('.pips');
    box.innerHTML = '';
    const n = Math.max(R.flareMax, p.flare);
    for (let i = 0; i < n; i++) box.appendChild(el('i', i < p.flare ? 'on' : ''));
    rail.querySelector('.rail-cap').innerHTML = `<img src="assets/ui/icon-flare.png" alt="Flare"><b>${p.flare}</b>`;
    rail.classList.toggle('live', live);
  }

  function hand(p) {
    const S = UI.S, box = $('hand'); box.innerHTML = '';
    box.style.setProperty('--n', Math.max(1, p.hand.length));
    p.hand.forEach((id, i) => {
      const cd = card(id);
      const info = Z.cardPlayable(S, human, i);
      const off = !info || !info.ok || S.active !== human || UI.busy || S.pending;
      const n = el('button', 'gcard cost-ring col-' + (cd.color || 'Colorless').toLowerCase() + ' type-' + cd.type +
        (UI.sel && ((UI.sel.kind === 'hand' && UI.sel.idx === i) || (UI.sel.kind === 'command' && UI.sel.idx === i)) ? ' sel' : '') + (off ? ' dim' : ''));
      n.style.setProperty('--art', urlVar(artOf(cd)));
      n.innerHTML = `<span class="art-win"></span>
        <img class="frame-fill" src="${FRAME[cd.type] || FRAME.unit}" alt="">
        <span class="cost-hole">${cd.cost}</span>
        <span class="kind-hole">${kindLine(cd)}</span>
        ${cd.cp ? `<span class="cp-hole">${cd.cp.toLocaleString()}</span>` : ''}
        <span class="name-hole">${cd.name}</span>
        <span class="tri-hole">${cd.color} · ${cd.tribe || '—'}</span>
        <span class="footy">${(cd.abilities || []).map(a => `<em>${a.kw}</em>`).join('')}</span>
        <span class="txt-hole">${(cd.abilities || []).map(a => a.text).join(' ') || '—'}${(cd.abilities || []).length > 1 ? '<span class="tip">แตะ i เพื่อดูครบทุกข้อ</span>' : ''}</span>
        ${cd.protection ? '<span class="prote">PROTECTION</span>' : ''}
        <span class="info-hole">i</span>`;
      n.querySelector('.info-hole').addEventListener('click', ev => { ev.stopPropagation(); showCard(cd.id); });
      n.addEventListener('click', ev => { ev.stopPropagation(); onHand(i); });
      box.appendChild(n);
    });
  }

  function canAct(S, u) {
    if (!u || S.active !== human) return false;
    const ab = (card(u.id).abilities || []).find(a => a.kw === 'Activate');
    if (!ab) return false;
    if (ab.once && u.used['act']) return false;
    return !ab.cost || S.players[human].flare >= ab.cost;
  }

  /* ---------------- log ---------------- */
  function renderLog() {
    const S = UI.S, lb = $('logBody');
    while (UI.logAt < S.log.length) {
      const L = S.log[UI.logAt++];
      lb.appendChild(el('div', 'lg ' + L.kind + (L.p && L.p !== human ? ' foe' : ''), `<span>${L.t}</span><em>${L.msg}</em>`));
    }
    if (lb.children.length > 500) lb.removeChild(lb.firstChild);
    lb.scrollTop = lb.scrollHeight;
  }

  /* ---------------- banner (ตาใคร / เฟส) ---------------- */
  async function banner(text, foe_, ms) {
    const b = $('banner');
    b.className = 'banner show' + (foe_ ? ' foe' : '');
    b.innerHTML = `<span>${text}</span>`;
    await sleep(ms || 900);
    b.className = 'banner';
  }

  /* ---------------- Declaration-Response ---------------- */
  function renderResponse() {
    const S = UI.S, bar = $('guardBar');
    if (!S.pending || S.pending.responder !== human) { bar.classList.add('hidden'); $('guardVeil').classList.add('hidden'); return; }
    const ev = S.pending.ev, actor = S.players[ev.actor], p = S.players[human];
    const desc = { deploy: 'ลงยูนิต', command: 'ใช้ Command', terrain: 'วาง Terrain', move: 'เคลื่อนยูนิต', attack: 'โจมตี', ability: 'ใช้ความสามารถ', summonArc: 'เรียก Arcanum' }[ev.kind] || ev.kind;
    $('guardTitle').textContent = `${actor.deckName} ${desc}` + (ev.tgt ? ` → [${card(ev.tgt.id).name}]` : '') + ' · ตอบโต้ได้ 1 ครั้ง';
    const box = $('guardOpts'); box.innerHTML = '';
    S.pending.opts.forEach(i => {
      const cd = card(p.hand[i]);
      const ab = (cd.abilities || []).find(a => a.kw === 'Counter' || a.kw === 'Quick-Cast') || (cd.abilities || [])[0];
      const b = el('button', 'guard-opt', `${cd.name} <em>Flare ${cd.cost} · ${ab ? ab.text : ''}</em>`);
      b.disabled = cd.cost > p.flare;
      b.addEventListener('click', () => doRespond(i));
      box.appendChild(b);
    });
    const pass = el('button', 'guard-opt pass', 'ผ่าน');
    pass.addEventListener('click', () => doRespond(null));
    box.appendChild(pass);
    bar.classList.remove('hidden'); $('guardVeil').classList.remove('hidden');
  }
  function doRespond(idx) {
    const S = UI.S;
    Z.respond(S, idx);
    render();
    if (UI.respResolve) { const r = UI.respResolve; UI.respResolve = null; r(); }
    else if (!S.pending && S.active === aiSide && !UI.busy && !S.winner) aiGo();
  }
  const waitResponse = () => new Promise(res => { UI.respResolve = res; });

  /* ---------------- popup เลือกเป้าหมาย (mockup: carousel + ไม่/ใช่) ---------------- */
  function openPick(title, unitsArr, cb) {
    UI.pick = { list: unitsArr, i: 0, cb };
    $('pickTitle').textContent = title;
    drawPick(); $('pickPanel').classList.remove('hidden'); $('pickVeil').classList.remove('hidden');
  }
  function drawPick() {
    const pk = UI.pick; if (!pk) return;
    const box = $('pickCards'); box.innerHTML = '';
    pk.list.forEach((u, i) => {
      const cd = card(u.id);
      const w = el('div', 'gcard pc cost-ring col-' + (cd.color || '').toLowerCase() + (i === pk.i ? ' on' : ''));
      w.style.setProperty('--art', urlVar(artOf(cd)));
      w.style.setProperty('--cw', '112px');
      w.innerHTML = `<span class="art-win"></span><img class="frame-fill" src="${FRAME[cd.type]}" alt="">
        <span class="cost-hole">${cd.cost}</span>
        ${cd.cp ? `<span class="cp-hole">${(cd.cp || 0).toLocaleString()}</span>` : ''}
        <span class="name-hole">${cd.name}</span>
        <span class="tri-hole">${cd.color} · ${u.rested ? 'วางนอน' : 'พร้อมใช้'} · now ${Z.effCp(UI.S, u).toLocaleString()} CP</span>`;
      w.addEventListener('click', () => { pk.i = i; drawPick(); });
      box.appendChild(w);
    });
    $('pickBar').style.width = (100 * (pk.i + 1) / pk.list.length) + '%';
  }
  function closePick(accept) {
    const pk = UI.pick;
    const chosen = accept && pk && pk.list && pk.list[pk.i] ? pk.list[pk.i] : null;
    $('pickPanel').classList.add('hidden'); $('pickVeil').classList.add('hidden');
    const cb = pk && pk.cb; UI.pick = null; if (cb) cb(chosen);
  }

  /* ---------------- ตา AI ---------------- */
  async function aiGo() {
    const S = UI.S;
    UI.busy = true; clearSel(); render();
    await banner(S.active === aiSide ? 'OPPONENT TURN' : 'YOUR TURN', S.active === aiSide, 800);
    let guard = 0;
    while (S.active === aiSide && !S.winner && guard++ < 30) {
      await sleep(280);
      const r = ZAI.takeTurn(S, aiSide);
      render();
      if (r === 'pending') { await waitResponse(); continue; }
      if (r === 'done') break;
    }
    if (S.active === aiSide && !S.pending && !S.winner) { Z.endTurn(S); }
    UI.busy = false; render();
    if (S.active === human && !S.winner) await banner('YOUR TURN · ' + PHASE_TXT.main, false, 700);
    if (S.winner) maybeOver();
  }

  /* ---------------- cta หลัก ---------------- */
  function humanEnd() {
    const S = UI.S;
    if (S.active !== human || UI.busy || S.pending) return;
    clearSel();
    banner('END PHASE', false, 520);
    Z.endTurn(S);
    render(); maybeOver();
    if (S.winner) return;
    if (S.active !== human) aiGo();
  }

  /* ---------------- selection & input ---------------- */
  function clearSel() { UI.sel = null; UI.hl = { move: [], atk: [], cells: [], targets: [] }; hint(defaultHint()); }
  const defaultHint = () => !UI.S ? '' : (UI.S.active !== human ? 'AI กำลังคิด…' : 'แตะการ์ดในมือเพื่อลง · แตะunit เพื่อเดิน/โจมตี');
  const hint = t => { $('hint').textContent = t; };

  function selectUnit(u) {
    UI.sel = { kind: 'unit', uid: u.uid };
    UI.hl = { move: Z.legalMoveCells(UI.S, u), atk: Z.attackTargets(UI.S, u).map(t => ({ r: t.r, c: t.c })), cells: [], targets: Z.attackTargets(UI.S, u).map(t => t.uid) };
    const cd = card(u.id);
    hint(UI.hl.atk.length ? `[${cd.name}] แตะช่องแดงเพื่อโจมตี` : (UI.hl.move.length ? `[${cd.name}] แตะช่องน้ำเงินเพื่อเดิน` : `[${cd.name}] ไม่มีแอ็ค (วางนอนแล้ว / ถูกจำกัด)`));
  }
  function deselect() { clearSel(); }

  function onHand(i) {
    const S = UI.S;
    if (S.active !== human || UI.busy || S.pending) return;
    if (UI.sel && UI.sel.kind === 'hand' && UI.sel.idx === i) { clearSel(); render(); return; }
    const id = S.players[human].hand[i], cd = card(id);
    const info = Z.cardPlayable(S, human, i);
    if (!info || !info.ok) { hint((info && info.why) || 'ลงการ์ดใบนี้ไม่ได้'); return; }
    if (cd.type === 'command') {
      const tgts = info.targets || null;
      if (tgts && tgts.length) {
        UI.sel = { kind: 'command', idx: i };
        hint('เลือกเป้าหมายในป๊อปอัพแล้วกด “ใช่”');
        openPick('เลือกเป้าหมายให้ [' + cd.name + ']', tgts, chosen => {
          if (chosen) castCommand(i, chosen.uid); else { clearSel(); render(); }
        });
        return;
      }
      castCommand(i, null); render(); return;
    }
    UI.sel = { kind: 'hand', idx: i, type: cd.type };
    try { const g = document.querySelectorAll('#hand .gcard')[i]; if (g) g.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (e) { }
    UI.hl = { move: [], atk: [], cells: info.cells.slice(), targets: [] };
    hint(cd.type === 'terrain' ? `เลือกช่องแถวหน้าเพื่อวาง [${cd.name}]` : `เลือกช่องแถวหลังเพื่อลง [${cd.name}]`);
    render();
  }

  function castCommand(i, tgtUid) {
    const res = Z.command(UI.S, human, i, null, tgtUid);
    clearSel(); render();
    if (res && res.awaiting) hint('อีกฝ่ายกำลังพิจารณาตอบโต้…');
    else if (res && !res.ok) hint(res.why);
  }

  async function onCell(r, c) {
    const S = UI.S;
    if (S.active !== human || UI.busy || S.pending) return;
    const ce = cellEl(r, c); ce.classList.add('flash'); setTimeout(() => ce.classList.remove('flash'), 320);
    const x = S.cells[r][c];
    if (UI.sel && UI.sel.kind === 'hand') {
      if (!UI.hl.cells.some(k => k.r === r && k.c === c)) { hint('ช่องนั้นเลือกไม่ได้'); return; }
      const i = UI.sel.idx;
      const res = UI.sel.type === 'terrain' ? Z.terrain(S, human, i, { r, c }) : Z.deploy(S, human, i, { r, c });
      clearSel(); render();
      if (res && !res.ok) hint(res.why);
      return;
    }
    const u = x.unit;
    if (UI.sel && UI.sel.kind === 'unit') {
      const me = S.cards[UI.sel.uid];
      if (!me) { clearSel(); render(); return; }
      if (u && u.side !== human && UI.hl.targets.includes(u.uid)) {
        const res = Z.attack(S, human, me.uid, u.uid);
        clearSel(); render();
        if (res && res.awaiting) await waitResponse();
        else if (res && !res.ok) hint(res.why);
        render(); return;
      }
      if (UI.hl.move.some(k => k.r === r && k.c === c)) {
        const res = Z.move(S, human, me.uid, { r, c });
        if (res && res.awaiting) { clearSel(); render(); await waitResponse(); render(); return; }
        if (res && res.ok) { clearSel(); render(); return; }
        hint(res && res.why ? res.why : 'เดินไม่ได้'); return;
      }
    }
    if (u && u.side === human) { selectUnit(u); render(); return; }
    clearSel(); render();
  }

  /* ---------------- ชีรายละเอียดการ์ด ---------------- */
  function showCard(id) {
    const cd = card(id);
    $('zvTitle').textContent = cd.name;
    $('zvBody').innerHTML = `<div class="card-sheet">
      <div class="cs-artbox"><img class="cs-scan" src="${cd.art}" alt="${cd.name}"></div>
      <div>
        <div class="cs-head"><b>${kindLine(cd)}</b><span>${cd.color || 'Colorless'}${cd.tribe ? ' · ' + cd.tribe : ''}</span>
          <i class="cs-cost">Cost ${cd.cost}</i>${cd.cp ? `<i class="cs-cp">${cd.cp.toLocaleString()} CP</i>` : ''}</div>
        <div class="cs-tags">${cd.protection ? '<em>Protection</em>' : ''}<em>${(cd.abilities || []).length} abilities</em>
          ${(cd.flags || []).map(f => `<em class="fl">${f}</em>`).join('')}
          ${(cd.cellEffects || []).length ? `<em class="fl">ผลบนช่อง ×${cd.cellEffects.length}</em>` : ''}</div>
        ${(cd.abilities || []).map(a => `<div class="cs-ab"><span>${a.kw}${a.when ? ' ⟨' + a.when + '⟩' : ''}</span>
          <em class="st ${a.ops && a.ops.length ? 'ok' : 'partial'}">${a.ops && a.ops.length ? 'engine ต่อผลแล้ว: ' + a.ops.map(o => o.op).join('+') : 'แสดงข้อความอย่างเดียว — ยังไม่ต่อผลอัตโนมัติ'}</em>
          <p>${a.text}${a.cost ? ` (cost ${a.cost} Flare)` : ''}${a.once ? ' · [Once per turn]' : ''}</p></div>`).join('') || '<div class="cs-ab"><span>Body</span><p>ไม่มีความสามารถ</p></div>'}
      </div></div>`;
    $('zoneView').classList.remove('hidden');
  }

  function openZone(side, zone, label) {
    const p = UI.S.players[side];
    $('zvTitle').textContent = label;
    const list = {};
    (p[zone] || []).forEach(id => { const cd = card(id); if (!cd) return; const k = cd.name + ' · ' + cd.color; list[k] = (list[k] || 0) + 1; });
    const keys = Object.keys(list);
    $('zvBody').innerHTML = keys.length ? keys.map(k => `<div class="zv-row"><b>${k}</b><span>×${list[k]}</span></div>`).join('') : '<div class="zv-row off">ว่าง</div>';
    $('zoneView').classList.remove('hidden');
  }

  /* ---------------- กติกา / คาตาล็อก / แหล่งข้อมูล ---------------- */
  const ASSUMPTIONS = `
    <section class="warn"><h3>ข้อสมมติที่ยังรอ owner ยืนยัน</h3>
    <p>1) โจมตีใช้ <b>1 Flare</b> / เดินฟรี 1 ช่องต่อแอ็ค (อิงตัวอย่าง "โจมตีได้โดยไม่ใช้ Flare")<br>
    2) ผู้เริ่มทีหลังไม่จั่วเทิร์นแรก (ตาม rulebook) — วัดจริงฝ่ายเริ่มก่อนชนะ ~80% ต้องมีตัวชดเชยไหม<br>
    3) <code>[Counter]</code> ของยูนิต resolve ก่อน <code>[Attack]</code> และใช้ Flare ของผู้ตอบโต้<br>
    4) build นี้ digital-resolve เรียงลำดับอัตโนมัติ (เจ้าของเทิร์นก่อน ตามด้วย type Core&gt;Front&gt;Back ซ้ายก่อนขวา)<br>
    5) <b>ยังไม่มี Arcanum / Arc-Flare</b> ตามที่สั่ง — Extra Zone ยังแสดงได้ แต่ไม่มีสำหรับเรียก Arcanum</p></section>`;

  const RULESUM = () => `
  <h2>กติกา — Zonefall <small>${R.version}</small></h2>
  <div class="rb">
    <section><h3>เป้าหมาย</h3><p>สะสม <b>${R.corePointsToWin} Core Point</b> ให้ก่อน · ได้จากจำนวนการ์ดที่คุณครองใน <b>Core Zone (แถว ${R.coreRow + 1})</b> ตอน End Phase ใบละ 1 แต้ม · ทางที่สอง: ทำให้อีกฝ่าย<b>จั่วไม่ได้</b> (เด็คหมด = แพ้ทันที)</p></section>
    <section><h3>สนาม 5×3</h3><p>แถว 1–5 จากฝั่งศัตรูบนสุดถึงแถวหลังคุณ · แถว 3 = <b>Core Zone</b> (พื้นน้ำเงิน) · ลงยูนิต/Command ได้เฉพาะแถวหลังตนเอง · Terrain วางแถวหน้าตนเอง · <b>ห้ามเข้าแถวหลังศัตรู</b></p></section>
    <section><h3>Flare (ทรัพยากร)</h3><p>แต่ละฝ่ายเริ่มต้นที่ <b>${R.flareStart} Flare</b> แล้ว += 1 ทุกเทิร์นของคุณจนถึงเพดาน <b>${R.flareMax}</b> · <b>ไม่สะสมข้ามเทิร์น</b> · ใช้ลงการ์ด/ร่าย Command/วาง Terrain/Activate และโจมตี · แถวเม็ดไดมอนด์ที่ขอบสนามคือ Flare คงเหลือของสองฝั่ง</p></section>
    <section><h3>"วางนอน" = ใช้แอ็ค</h3><p>ยูนิต 1 ตัวทำอะไรได้ 1 อย่างต่อเทิร์น (เดิน / โจมตี) โดยการเปลี่ยนจากวางตั้งเป็นวางนอน · ลงสนามเทิร์นเดียวกันโจมตีได้เลยถ้ามี Flare · เดินแล้วค่อยโจมตีก็ได้ (เดินฟรี 1 ช่อง)</p></section>
    <section><h3>การต่อสู้</h3><p>โจมตีได้เฉพาะช่อง <b>หน้า / ซ้าย / ขวา</b> · ประกาศ → อีกฝ่าย<b>ตอบโต้ 1 ครั้ง</b> → <code>Counter</code> ผู้ป้องกัน → <code>Attack</code> ผู้โจมตี → วัดค่าพลัง: CP ผู้โจมตีไปลบ CP ผู้ป้องกัน <b>เหลือ 0 = ล้ม → Outzone</b> · ผู้โจมตีไม่เสียค่าพลัง · ค่าพลังรีเซ็ตต้นเทิร์น</p></section>
    <section><h3>Declaration-Response</h3><p>ทุกแอ็คเปิดหน้าต่างตอบโต้: Command ที่เป็น <code>[Quick-Cast]</code> / <code>[Counter]</code> ในมืออีกฝ่าย (เช่น Shield Guard, Barrier, Null Magic) ใช้ได้ 1 ครั้งต่อเหตุการณ์ · ไม่มี chain/สแต็ก</p></section>
    <section><h3>End Phase & Trigger Check</h3><p>เริ่มเอนเฟส → นับ Core Point → ผู้ที่<b>ไม่ได้</b>แต้มเปิดใบบนสุดเด็ค 1 ใบขึ้นมา (ถ้ามี <code>[Trigger]</code> ทำงานทันที) → Terrain ที่ระบุให้สลายตัว → เช็คครบ 7 แต้ม → ส่งเทิร์น</p></section>
    <section><h3>โควตา & โซน</h3><p>ยูนิตไม่เกิน <b>${R.unitLimit}</b> ตัว · Terrain <b>${R.terrainLimitBase}</b> ใบ (ใบที่ระบุ "คุมหลายใบได้" จะไม่กินโควตา) · Outzone = ถูกทำลาย/ใช้แล้ว · Removezone = ออกจากเกม (มือเกิน ${R.handMax}) · Extra Zone = Token/Arcanum (ดิจิทัล ${R.extraZoneMax} ใบ) · [Protection] ≤ ${R.protectionLimit} ใบ/เด็ค · ซ้ำได้ ${R.maxCopy} ใบ · เด็ค ${R.deckMin}–${R.deckMax} ใบ สีหลัก ≥ ครึ่ง</p></section>
    <section><h3>หน้าจอนี้ใช้อะไรแสดงผลจริงบ้าง</h3><p>frame การ์ด (<code>assets/ui/frame-*.png</code>) · ภาพศิลปะตัดจากสแกน (<code>assets/art/</code>) · pile Deck/Out/Remove/Extra · แถบ Flare (<code>rail-flare.png</code>) · ไอคอน Core Point/Flare · ปุ่มหกเหลี่ยม END · badge ชนะ/แพ้ · ฉากสนาม 3 ธีม · ฟอนต์ <b>FC Twist Bold</b> (ชื่อ), <b>FC Iconic</b> (UI), <b>SOV LookSit</b> (ตัวเลข CP/Cost)</p></section>
    ${ASSUMPTIONS}
  </div>`;

  const catalogHTML = () => `
    <h2>คาตาล็อกการ์ด <small>${CARDS.length} ใบจาก 3 ชุด · แก้ที่ js/data.js</small></h2>
    <div class="rb"><section><h3>สรุป</h3><p>Unit ${CARDS.filter(c => c.type === 'unit').length} · Command ${CARDS.filter(c => c.type === 'command').length} · Terrain ${CARDS.filter(c => c.type === 'terrain').length}
    · [Protection] ${CARDS.filter(c => c.protection).length} · ความสามารถที่ engine ต่อผลแล้ว ${CARDS.reduce((a, c) => a + (c.abilities || []).filter(x => (x.ops || []).length).length, 0)} จาก ${CARDS.reduce((a, c) => a + (c.abilities || []).length, 0)} ข้อ</p></section></div>
    ${['Yellow', 'Blue', 'Red', 'Green', 'Purple', 'Colorless'].map(col => {
      const list = CARDS.filter(c => (c.color || 'Colorless') === col);
      if (!list.length) return '';
      return `<div class="cat-fac" style="color:var(--c-${col.toLowerCase()})">${col} · ${list.length} ใบ</div>
      <div class="cat">${list.map(c => `<div class="cat-card"><div style="display:flex;gap:8px">
        <span style="position:relative;flex:0 0 46px;height:64px;border-radius:4px;overflow:hidden;border:1px solid #000">
          <img src="${artOf(c)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
          <img src="${FRAME[c.type]}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></span>
        <span style="min-width:0"><b>${c.name}</b>
          <span class="cat-st">${c.type.toUpperCase()} · Cost ${c.cost}${c.cp ? ' · ' + c.cp.toLocaleString() + ' CP' : ''} · ${c.tribe || '—'}</span></span></div>
        ${(c.abilities || []).map(a => `<div class="cat-tx"><em>${a.kw}</em> ${a.text}</div>`).join('')}</div>`).join('')}</div>`;
    }).join('')}`;

  const IMPORTDOC = () => `
    <h2>asset &amp;การ์ดในบิลด์นี้ <small>ทุกอย่างมาจากไฟล์ของคุณในโฟลเดอร์ Drive</small></h2>
    <div class="rb">
      <section><h3>แหล่งทีี่มา</h3><p>52 สแกนการ์ด (<code>png card data</code>) · sprite จาก <b>InGame - Font &amp; Icon</b> (แถบ Flare, Core Point, pile, ปุ่ม END, o/p/s, badge ชนะ/แพ้, โลโก้) · ฉากสนามจาก <b>field_map01–03</b> · card frame จาก <b>sky_unit / sky_terrain</b> · ฟอนต์ 3 ชุดจากโฟลเดอร์ <b>Font</b> · โครงกติกาจาก <b>Rulebook Dev V.24</b> + <b>DESIGN BREAKDOWN</b></p>
      <p>ขนาดที่ ship: ฟอนต์ subset (ไทย+ลาติน) 36KB · sprite ~1.6MB · art crop 52 ใบ 820KB · ฉาก 3 ธีม 200KB · ไอคอนแอปจากโลโก้จริง</p></section>
      <section><h3>เพิ่ม/แก้การ์ดเอง</h3><p>แก้ <code>js/data.js</code> → <code>CARDS</code> (ชื่อ/ชนิด/สี/tribe/cost/cp/protection/abilities) และ <code>DECKS.*.main</code> · ตัวตรวจกติกาเด็ค: <code>node test/deckcheck.js</code> · สมดุล AI: <code>node test/play.js 30</code></p></section>
      <section><h3>ที่ยังต้องเติม</h3><p>1) ภาพจริงของ <i>Token/Arcanum</i> (ยังไม่ใช้ใน build นี้) 2) ability บางข้อพิมพ์เป็นข้อความอย่างเดียว — ดูสถานะได้ในชีการ์ดของแต่ละใบ 3) UI สลับ/เรียงการ์ดใต้เด็คแบบละเอียด (ตอนนี้ mill/toBottom ใช้ลำดับอัตโนมัติ)</p></section>
    </div>`;

  /* ---------------- modal plumbing + จอเริ่ม ---------------- */
  function openModal(id) {
    $('veil').classList.remove('hidden');
    ['modalHome', 'modalRules', 'modalOver'].forEach(m => $(m).classList.toggle('hidden', m !== id));
    $('btnModalX').style.display = (id === 'modalHome' && !UI.S) ? 'none' : 'grid';
  }
  const closeModal = () => $('veil').classList.add('hidden');

  function startGame(firstSide) {
    UI.S = Z.init({
      p0deck: $('selOwnDeck').value, p1deck: $('selFoeDeck').value,
      p1GoesFirst: firstSide === 'p1', humanSide: human,
    });
    UI.logAt = 0; $('logBody').innerHTML = ''; UI.busy = false; clearSel();
    $('seedTag').textContent = UI.S.seed + ' · o/p/s: ' + (firstSide === 'rps' ? '-' : firstSide);
    $('veil').classList.add('hidden'); ['modalHome', 'modalRules', 'modalOver'].forEach(m => $(m).classList.add('hidden'));
    render();
    const go = () => {
      render();
      if (UI.S.active !== human) aiGo(); else banner('YOUR TURN', false, 700);
    };
    if (UI.S.active === human) Promise.resolve(banner('YOUR TURN', false, 0)).then(go); else go();
  }

  const BEATS = { paper: 'scissors', scissors: 'rock', rock: 'paper' };
  async function chooseByRps() {
    $('rpsPanel').classList.remove('hidden'); $('rpsVeil').classList.remove('hidden');
    const mine = await new Promise(res => { UI.rpsCb = res; });
    const theirs = ['paper', 'scissors', 'rock'][Math.floor(Math.random() * 3)];
    $('rpsVeil').classList.add('hidden');
    let first;
    if (mine === theirs) first = 'p0';
    else first = BEATS[mine] === theirs ? 'p0' : 'p1';
    $('rpsPanel').classList.add('hidden');
    startGame(first);
    const who = first === 'p0' ? 'คุณ' : 'AI';
    hint(`o/p/s: คุณเลือก ${mine} อีกฝ่าย ${theirs} → ${who}เริ่มก่อน`);
  }

  function maybeOver() {
    const S = UI.S; if (!S.winner) return;
    const win = S.winner === human;
    const t = JSON.parse(localStorage.getItem('zf_tally') || '{"w":0,"l":0}');
    t[win ? 'w' : 'l']++; localStorage.setItem('zf_tally', JSON.stringify(t));
    $('overBadge').src = win ? 'assets/ui/badge-win.png' : 'assets/ui/badge-lose.png';
    $('overTitle').textContent = win ? 'ชนะ — ' + S.players[human].corePoints + ' Core Point' : 'แพ้ — ' + (S.winner === aiSide ? 'ศัตรูเก็บแต้มครบก่อน' : 'เด็คคุณหมด');
    $('overTitle').className = win ? 'win' : 'lose';
    $('overDetail').innerHTML = `${S.turnNo} เทริน · คุณ ${S.players[human].corePoints}/${R.corePointsToWin} · ศัตรู ${S.players[aiSide].corePoints}/${R.corePointsToWin}`;
    openModal('modalOver');
  }

  /* ---------------- boot ---------------- */
  function boot() {
    buildBoard();
    const mk = (sel, def) => { sel.innerHTML = ''; Object.keys(DECKS).forEach(k => sel.appendChild(new Option(DECKS[k].name, k))); sel.value = def; };
    mk($('selOwnDeck'), 'sylvan'); mk($('selFoeDeck'), 'machina');
    const t = JSON.parse(localStorage.getItem('zf_tally') || '{"w":0,"l":0}');
    $('btnStart').textContent = `เข้าสนาม (${t.w}ชนะ / ${t.l}แพ้)`;
    $('btnRules').onclick = $('btnRules2').onclick = () => { $('modalRules').innerHTML = RULESUM(); openModal('modalRules'); };
    $('btnCatalog').onclick = $('btnCatalog2').onclick = () => { $('modalRules').innerHTML = catalogHTML(); openModal('modalRules'); };
    $('btnImport').onclick = () => { $('modalRules').innerHTML = IMPORTDOC(); openModal('modalRules'); };
    $('btnModalX').onclick = () => { if (UI.S) closeModal(); else openModal('modalHome'); };
    $('veil').addEventListener('click', e => { if (e.target === $('veil') && UI.S) closeModal(); });
    $('btnStart').onclick = () => { const v = $('selFirst').value; if (v === 'rps') { closeModal(); chooseByRps(); } else startGame(v); };
    $('btnMenu').onclick = () => { const tt = JSON.parse(localStorage.getItem('zf_tally') || '{"w":0,"l":0}'); $('btnStart').textContent = `เข้าสนาม (${tt.w}ชนะ / ${tt.l}แพ้)`; openModal('modalHome'); };
    $('btnAgain').onclick = () => closeModal() || ($('selFirst').value = 'rps', chooseByRps());
    $('btnOverHome').onclick = () => openModal('modalHome');
    $('btnOverLog').onclick = () => { closeModal(); $('logDrawer').classList.add('open'); };
    $('btnLog').onclick = () => $('logDrawer').classList.toggle('open');
    $('btnLogClose').onclick = () => $('logDrawer').classList.remove('open');
    if ($('tipX')) $('tipX').onclick = () => $('rotateTip').style.display = 'none';
    $('btnEnd').onclick = humanEnd;
    $('btnCancel').onclick = () => { clearSel(); render(); };
    $('btnAbility').onclick = () => {
      const u = UI.sel && UI.S.cards[UI.sel.uid]; if (!u) return hint('เลือกunit ก่อน');
      const ab = (card(u.id).abilities || []).find(a => a.kw === 'Activate');
      if (!ab) return;
      const run = tgt => { const r = Z.ability(UI.S, human, u.uid, tgt && tgt.uid); clearSel(); render(); if (!r.ok) hint(r.why); };
      if (ab.target === 'allyUnit' || (ab.ops || []).some(o => o.to === 'allyTarget')) openPick('เลือกเป้าหมายของ ' + card(u.id).name, Z.units(UI.S, u.side), x => run(x));
      else run(null);
    };
    /* เลือกสนาม */
    $('selField').onchange = e => {
      UI.fieldTheme = e.target.value;
      document.querySelector('.field-bg').src = 'assets/bg/field-' + UI.fieldTheme + '.jpg';
      $('arena').dataset.theme = UI.fieldTheme;
    };
    /* pile คลิก = เปิดดูโซน */
    document.querySelectorAll('.zonepile').forEach(b => b.addEventListener('click', () => {
      const foeSide = b.closest('#plateFoe');
      openZone(foeSide ? aiSide : human, b.dataset.z, (foeSide ? 'ศัตรู · ' : 'คุณ · ') + ({ deck: 'เด็ค', outzone: 'Outzone', remove: 'Removezone', extra: 'Extra Zone' })[b.dataset.z]);
    }));
    $('zvClose').onclick = () => $('zoneView').classList.add('hidden');
    $('pickYes').onclick = () => closePick(true);
    $('pickNo').onclick = () => closePick(false);
    $('pickX').onclick = () => closePick(false);
    document.querySelectorAll('.rps-btn').forEach(b => b.onclick = () => {
      const cb = UI.rpsCb; UI.rpsCb = null; if (cb) cb(b.dataset.rps);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (!($('pickPanel') && $('pickPanel').classList.contains('hidden'))) return; clearSel(); $('zoneView').classList.add('hidden'); render(); }
      if (e.key === ' ') { e.preventDefault(); humanEnd(); }
    });
    hint(defaultHint());
    window.__ZF = { U: UI, Z, ZAI, aiGo, render: () => render(), st: () => UI.S };
    openModal('modalHome');
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(reg => {
      setTimeout(() => { try { reg.active && reg.active.postMessage('warm-art'); reg.waiting && reg.waiting.postMessage('warm-art'); } catch (e) { } }, 4000);
    }).catch(() => { });
  }
  /* helper: เป้าหมายของ ability (ฝ่ายตรงข้ามของเจ้าของunit) */
  const S_of_tgt = side => (side === human ? aiSide : human);
  boot();
})();
