/* ==========================================================================
   ZONEFALL — UI (vanilla JS)
   · ทุกกติกาตัดสินใน js/engine.js — ไฟล์นี้วาด state + เก็บ input เท่านั้น
   · input: ลาก-วาง (drag & drop) · tap-to-place · กดค้างดูข้อมูล · เลื่อนมือซ้าย-ขวา
   · โหมดเกมล็อก gestural ของเบราว์เซอร์ (ไม่มีการก๊อปปี้/เซฟรูป/คอนเทกซ์เมนู)
   · แอนิเมชันเล่นจาก S.fxq ที่ engine ปล่อยไว้ (drainFx)
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
  const PHASE_ICON = { draw: 'assets/ui/icon-phase-draw.png', main: 'assets/ui/icon-phase-main.png', end: 'assets/ui/icon-phase-end.png' };
  const PHASE_TXT = { draw: 'DRAW Phase', main: 'MAIN Phase', end: 'END Phase' };
  const artOf = cd => 'assets/art/' + cd.file + '.jpg';        // หน้าต่างภาพจากสแกน (ถมช่องสนาม)
  const scanOf = cd => cd.art;                                  // สแกนเต็มใบ (มือ/ชีข้อมูล/ป๊อปอัพ)
  const kindLine = cd => ({ unit: 'UNIT', command: 'COMMAND', terrain: 'TERRAIN', token: 'TOKEN' })[cd.type] || 'CARD';
  const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const UI = {
    S: null, sel: null, busy: false, logAt: 0, respResolve: null, askResolve: null,
    fieldTheme: 'blue', drag: null, pos: {}, fxGuard: 0, animQ: Promise.resolve(),
    hl: { move: [], atk: [], cells: [], targets: [] },
  };
  const inGame = () => !!UI.S && !$('veil').classList.contains('hidden') === false;

  /* ============ ล็อก gesture ของเบราว์เซอร์ระหว่างเกม ============ */
  function lockGestures(on) {
    document.body.classList.toggle('ingame', !!on);
  }
  ['contextmenu', 'dragstart', 'selectstart'].forEach(ev => {
    document.addEventListener(ev, e => {
      if (!document.body.classList.contains('ingame')) return;
      if (e.target && e.target.closest && e.target.closest('input, textarea, select, .rb, .modal .zv-body')) return;
      e.preventDefault();
    }, { passive: false });
  });
  document.addEventListener('pointerdown', e => {
    if (!document.body.classList.contains('ingame')) return;
    if (e.pointerType === 'mouse') return;
    if (e.target.closest && e.target.closest('.hand, .log-body, .zv-body, .modal, select')) return;  // แถบเลื่อนยังใช้ได้
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  document.addEventListener('dblclick', e => { if (document.body.classList.contains('ingame')) e.preventDefault(); });
  window.addEventListener('blur', () => { if (UI.drag) cancelDrag(); });

  /* ============ กระดาน ============ */
  function buildBoard() {
    board.innerHTML = '';
    for (let r = 0; r < R.rows; r++) for (let c = 0; c < R.cols; c++) {
      const cell = el('div', 'cell' + (r === R.coreRow ? ' core' : (r < R.coreRow ? ' foe' : ' own')));
      cell.dataset.r = r; cell.dataset.c = c;
      cell.appendChild(el('span', 'coord', cellName(r, c)));
      cell.appendChild(el('div', 'terr'));
      cell.appendChild(el('div', 'tkslot'));
      cell.addEventListener('click', () => onCell(r, c));
      bindPress(cell, () => { const x = UI.S && UI.S.cells[r][c]; if (!x) return; if (x.unit) showCard(x.unit.id); else if (x.terrain) showCard(x.terrain.id); });
      cell.addEventListener('pointerdown', e => {                       /* ลากยูนิต = เดิน/โจมตี */
        const x = UI.S && UI.S.cells[r][c]; if (!x || !x.unit) return;
        const u = x.unit;
        if (u.side !== human || UI.S.active !== human || UI.busy || UI.S.pending || UI.S.uiAsk) return;
        if (u.rested || (e.pointerType === 'mouse' && e.button !== 0)) return;
        beginGesture('unit', { uid: u.uid }, scanOf(card(u.id)), e, cell);
      }, { passive: true });
      board.appendChild(cell);
    }
  }
  const cellEl = (r, c) => board.children[r * R.cols + c];
  const tkEl = uid => board.querySelector('.tk[data-uid="' + uid + '"]');

  /* ============ render ============ */
  function render() {
    const S = UI.S; if (!S) return;
    const p = S.players[human], q = S.players[aiSide];
    const prev = UI.pos; UI.pos = {};

    $('buildTag').textContent = R.version;
    $('phaseChip').innerHTML = `<img src="${PHASE_ICON[S.phase] || PHASE_ICON.main}" alt="">${PHASE_TXT[S.phase] || 'MAIN Phase'}`;
    $('phaseChip').classList.toggle('mine', S.active === human);
    plate(q, 'foe'); plate(p, 'own');
    pips($('railOwn'), p, S.active === human); pips($('railFoe'), q, S.active === aiSide);
    $('foeAvatar').src = 'assets/faction/' + (FACTION_ICON[q.faction] || 'aegis') + '.png';
    $('ownAvatar').src = 'assets/faction/' + (FACTION_ICON[p.faction] || 'verdant') + '.png';

    for (let r = 0; r < R.rows; r++) for (let c = 0; c < R.cols; c++) {
      const ce = cellEl(r, c), slot = ce.querySelector('.tkslot'), terr = ce.querySelector('.terr'), x = S.cells[r][c];
      ce.dataset.cardId = (x.unit && x.unit.id) || (x.terrain && x.terrain.id) || '';
      ce.className = 'cell' + (r === R.coreRow ? ' core' : (r < R.coreRow ? ' foe' : ' own')) + (x.terrain && x.unit ? ' both' : '');
      ce.dataset.cardId = (x.unit && x.unit.id) || (x.terrain && x.terrain.id) || '';
      if (UI.hl.cells.some(k => k.r === r && k.c === c)) ce.classList.add('hl-cell');
      if (UI.hl.move.some(k => k.r === r && k.c === c)) ce.classList.add('hl-move');
      if (UI.drag && (UI.hl.cells.some(k => k.r === r && k.c === c) || UI.hl.move.some(k => k.r === r && k.c === c) || UI.hl.atk.some(k => k.r === r && k.c === c))) ce.classList.add('drop-ok');
      if (UI.hl.atk.some(k => k.r === r && k.c === c)) ce.classList.add('hl-atk');
      terr.innerHTML = ''; const oldSlot = slot.innerHTML; slot.innerHTML = '';
      if (x.terrain) {
        const tcd = card(x.terrain.id);
        terr.innerHTML = `<img src="${artOf(tcd)}" alt="" draggable="false"><span class="terr-name">▦ ${esc(tcd.name)}</span>`;
        UI.pos['t' + x.terrain.uid] = [r, c];
      }
      const u = x.unit; if (!u) continue;
      if (UI.hl.targets.includes(u.uid)) ce.classList.add('hl-target');
      const cd = card(u.id);
      UI.pos[u.uid] = [r, c];
      const tk = el('div', 'tk ' + (u.side === human ? 'own' : 'foe') + (u.rested ? ' rested' : '') + (u.arc ? ' arc' : '') +
        (UI.sel && UI.sel.kind === 'unit' && UI.sel.uid === u.uid ? ' sel' : ''));
      tk.dataset.uid = u.uid; tk.dataset.cardId = u.id; tk.dataset.cardId = u.id;
      const fl = [];
      if (u.arc) fl.push('<i>ARCANUM</i>');
      if (u.fused && u.fused.length) fl.push('<i class="tough">FUSED ×' + u.fused.length + '</i>');
      if (u.noDestroyBattle) fl.push('<i class="tough">ไม่ล้ม</i>');
      if (u.costLocked) fl.push('<i class="rest">Cost→' + u.costLocked + '</i>');
      if (u.dmg) fl.push('<i class="dmg">−' + u.dmg.toLocaleString() + '</i>');
      if ((cd.abilities || []).some(a => a.kw === 'Trigger')) fl.push('<i>TRIGGER</i>');
      tk.innerHTML = `<img class="tk-img" src="${artOf(cd)}" alt="${esc(cd.name)}" draggable="false">
        <span class="tk-cost">${cd.cost}</span><span class="tk-cp">${Z.effCp(S, u).toLocaleString()}</span>
        <span class="tk-flags">${fl.join('')}</span>`;
      slot.appendChild(tk);
      const wasPos = prev[u.uid];
      if (wasPos && (wasPos[0] !== r || wasPos[1] !== c)) flip(tk, wasPos, [r, c]);
    }

    hand(p);
    const selU = UI.sel && UI.sel.kind === 'unit' ? S.cards[UI.sel.uid] : null;
    const hasAct = selU && (card(selU.id).abilities || []).some(a => a.kw === 'Activate');
    $('btnAbility').classList.toggle('hidden', !hasAct);
    $('btnAbility').disabled = !canAct(S, selU);
    const lock = S.active !== human || UI.busy || !!S.pending || !!S.uiAsk;
    $('btnEnd').disabled = lock; $('btnCancel').disabled = !UI.sel && !S.uiAsk;
    renderLog(); renderResponse(); renderAsk();
    drainFx(S);
  }

  /* FLIP: ทำให้การ์ดที่เดินแล้ว “ลอย” จากช่องเดิมมาช่องใหม่ */
  function flip(tk, from, to) {
    const a = cellEl(from[0], from[1]).getBoundingClientRect(), b = cellEl(to[0], to[1]).getBoundingClientRect();
    tk.animate([{ transform: `translate(${a.x - b.x}px,${a.y - b.y}px) scale(1.06)` }, { transform: 'none' }],
      { duration: 260, easing: 'cubic-bezier(.2,.9,.2,1)' });
  }

  function plate(p, who) {
    const S = UI.S;
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set(who + 'Name', p.deckName); set(who + 'Pts', p.corePoints); set(who + 'FlareN', p.flare);
    set(who + 'Hand', p.hand.length); set(who + 'Deck', p.deck.length); set(who + 'DeckN', p.deck.length);
    set('foeOutN', p.outzone.length); set('foeRemN', p.remove.length); set('foeExtraN', p.extra.length);
    set('ownOutN', p.outzone.length); set('ownOutN2', p.outzone.length); set('ownRemN', p.remove.length); set('ownExtraN', p.extra.length);
    if (who === 'own') {
      set('ownUnits', Z.units(S, human).length + '/' + R.unitLimit);
      set('ownTerr', Z.terrains(S, human).length + '/' + Z.terrainLimit(S, human));
      set('handLabel', 'มือ : ' + p.hand.length + (p.hand.length > 5 ? ' (เลื่อนได้)' : ''));
    }
  }
  function pips(rail, p, live) {
    const box = rail.querySelector('.pips');
    box.innerHTML = '';
    for (let i = 0; i < Math.max(R.flareMax, p.flare); i++) box.appendChild(el('i', i < p.flare ? 'on' : ''));
    rail.querySelector('.rail-cap').innerHTML = `<img src="assets/ui/icon-flare.png" alt="Flare"><b>${p.flare}</b>`;
    rail.classList.toggle('live', live);
  }
  function canAct(S, u) {
    if (!u || S.active !== human) return false;
    const ab = (card(u.id).abilities || []).find(a => a.kw === 'Activate');
    if (!ab) return false;
    if (ab.once && u.used['act']) return false;
    return !ab.cost || S.players[human].flare >= ab.cost;
  }


  /* ============ log ============ */
  function renderLog() {
    const S = UI.S, lb = $('logBody');
    while (UI.logAt < S.log.length) {
      const L = S.log[UI.logAt++];
      const row = el('div', 'lg ' + L.kind + (L.p && L.p !== human ? ' foe' : ''), `<span>${L.t}</span><em>${esc(L.msg)}</em>`);
      lb.appendChild(row);
      row.animate([{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
    }
    while (lb.children.length > 420) lb.removeChild(lb.firstChild);
    lb.scrollTop = lb.scrollHeight;
  }

  /* ============ มือการ์ด (เลื่อนซ้าย-ขวา + ลากวาง) ============ */
  function hand(p) {
    const S = UI.S, box = $('hand');
    if (UI.drag) { markHand(box, p); return; }              // ระหว่างลาก: ห้ามสร้าง node ใหม่ (ท่าจะไม่ต่อเนื่อง)
    box.innerHTML = '';
    box.style.setProperty('--n', Math.max(1, p.hand.length));
    p.hand.forEach((id, i) => {
      const cd = card(id);
      const info = Z.cardPlayable(S, human, i);
      const off = !info || !info.ok;
      const n = el('button', 'gcard col-' + (cd.color || 'Colorless').toLowerCase() + ' type-' + cd.type +
        (UI.sel && ((UI.sel.kind === 'hand' && UI.sel.idx === i)) ? ' sel' : '') + (off || S.active !== human || UI.busy || S.pending || S.uiAsk ? ' dim' : ''));
      n.dataset.idx = i; n.dataset.cardId = id; n.dataset.cardId = id;
      n.innerHTML = `<img class="gc-img" src="${scanOf(cd)}" alt="${esc(cd.name)}" draggable="false">`;
      bindPress(n, () => showCard(cd.id));
      n.addEventListener('click', ev => { if (consumePress(ev)) return; ev.stopPropagation(); onHand(i); });
      bindHandDrag(n, i);
      box.appendChild(n);
    });
    box.dataset.key = p.hand.join(',');
    const canS = box.scrollWidth > box.clientWidth + 6;
    $('handWrap').classList.toggle('canScroll', canS);
    $('pgL').disabled = box.scrollLeft < 4; $('pgR').disabled = box.scrollLeft + box.clientWidth > box.scrollWidth - 4;
  }
  function markHand(box, p) {  /* ระหว่างลาก: อัปเดตแค่ dim/ตำแหน่งเลื่อน */
    [...box.children].forEach((n, i) => {
      const id = p.hand[i]; if (!id) return;
      const info = Z.cardPlayable(UI.S, human, i);
      n.classList.toggle('dim', !info || !info.ok || UI.S.active !== human || !!UI.S.uiAsk);
      if (UI.drag && UI.drag.kind === 'hand' && UI.drag.payload.idx === i) n.classList.add('dragging');
      else n.classList.remove('dragging');
    });
  }
  function panHand(dir) {
    const box = $('hand'), w = (box.firstElementChild ? box.firstElementChild.getBoundingClientRect().width + 10 : 120);
    box.scrollBy({ left: dir * w * 2, behavior: 'smooth' });
    setTimeout(() => hand(UI.S.players[human]), 380);
  }

  /* วาด highlight จาก UI.hl ลงบนช่อง (ใช้ทั้ง tap และ drag) */
  function applyHL() {
    [...board.children].forEach(c => {
      const r = +c.dataset.r, cc = +c.dataset.c;
      const has = (arr) => arr.some(k => k.r === r && k.c === cc);
      c.classList.toggle('hl-cell', has(UI.hl.cells));
      c.classList.toggle('hl-move', has(UI.hl.move));
      c.classList.toggle('hl-atk', has(UI.hl.atk));
      c.classList.toggle('drop-ok', !!UI.drag && (has(UI.hl.cells) || has(UI.hl.move) || has(UI.hl.atk)));
      if (has(UI.hl.targets)) c.classList.add('hl-target'); else c.classList.remove('hl-target');
    });
  }

  /* ============ คิวแอนิเมชันจาก engine ============ */
  function drainFx(S) {
    const list = Z.drainFx(S); if (!list.length) return;
    for (const ev of list) animate(ev);
  }
  function ringAt(elm, cls, ms) {
    if (!elm) return;
    elm.classList.remove(cls); void elm.offsetWidth; elm.classList.add(cls);
    setTimeout(() => elm.classList.remove(cls), ms || 620);
  }
  function flyText(html, fromEl, toEl, cls) {
    if (!fromEl) return;
    const a = fromEl.getBoundingClientRect();
    const t = el('div', 'float ' + (cls || ''), html);
    t.style.left = (a.left + a.width / 2) + 'px'; t.style.top = a.top + 'px';
    document.body.appendChild(t);
    if (toEl) { const b = toEl.getBoundingClientRect(); t.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${b.left - a.left + b.width / 2 - a.width / 2}px,${b.top - a.top - 24}px)` }], { duration: 700, fill: 'forwards', easing: 'cubic-bezier(.4,0,.3,1)' }); }
    setTimeout(() => t.remove(), toEl ? 780 : 1100);
  }
  function cellOf(uid) { const t = tkEl(uid); return t ? t.closest('.cell') : null; }
  function animate(ev) {
    const S = UI.S; if (!S) return;
    switch (ev.t) {
      case 'deploy': { const t = tkEl(ev.uid); if (t) { const r = t.getBoundingClientRect(); const c = cellEl(ev.cell[0], ev.cell[1]).getBoundingClientRect(); t.animate([{ transform: `translate(${c.x - r.x}px,${c.y - r.y - 26}px) scale(1.12) rotate(-6deg)`, opacity: .25 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.95,.2,1)' }); ringAt(cellOf(ev.uid), 'flash-ok', 700); } break; }
      case 'move': ringAt(cellOf(ev.uid), 'flash-move', 620); break;
      case 'attack': { const a = tkEl(ev.from), b = tkEl(ev.to); if (a && b) { const r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect(); a.animate([{ transform: 'none' }, { transform: `translate(${(r2.x - r1.x) * .42}px,${(r2.y - r1.y) * .42}px) scale(1.05)` }, { transform: 'none' }], { duration: 300, easing: 'ease-out' }); } break; }
      case 'hit': { const t = tkEl(ev.uid); ringAt(t, 'shk', 560); if (t) flyText(`−${(ev.n || 0).toLocaleString()} CP`, t, null, 'bad'); break; }
      case 'destroy': { const c = cellOf(ev.uid) || cellEl(0, 0); if (c) ringAt(c, 'flash-bad', 760); flashGhost(ev.cardId, c); break; }
      case 'effect': { const t = tkEl(ev.uid); const who = t || (ev.side === human ? $('btnAbility') : null); ringAt(who, 'glow-effect', 780); if (t) flyText(`<em>${esc(ev.kw || 'Effect')}</em>`, t, null, 'kw'); break; }
      case 'buff': (ev.uids || []).forEach(uid => { const t = tkEl(uid); ringAt(t, t && ev.n < 0 ? 'flash-bad' : 'flash-good', 700); if (t) flyText(`${ev.n > 0 ? '+' : ''}${(ev.n || 0).toLocaleString()}`, t, null, ev.n < 0 ? 'bad' : 'good'); }); break;
      case 'ready': ringAt(tkEl(ev.uid), 'flash-good', 520); break;
      case 'rest': ringAt(tkEl(ev.uid), 'flash-move', 520); break;
      case 'ascend': ringAt(tkEl(ev.uid), 'glow-effect', 900); break;
      case 'point': { const chip = $(ev.side === human ? 'ownPts' : 'foePts'); if (chip) { ringAt(chip.closest('.chip'), 'pulse-core', 900); flyText(`+${ev.n} <b>Core Point</b>`, chip.closest('.chip'), $(ev.side === human ? 'railOwn' : 'railFoe'), 'core'); } break; }
      case 'draw': case 'mill': { const rail = $(ev.side === human ? 'ownZones' : 'foeZones'); ringAt(rail && rail.querySelector('[data-z=deck]'), 'flash-deck', 620); break; }
      case 'flare': { const chip = $(ev.side === human ? 'ownFlareN' : 'foeFlareN'); if (chip) flyText(`+${ev.n} Flare`, chip, null, 'good'); break; }
      case 'reveal': showReveal(ev); break;
      case 'trigger': showReveal({ side: ev.side, ids: [ev.cardId], reason: 'Trigger Check', flip: true }); break;
      case 'ask': renderAsk(); break;
    }
  }
  function flashGhost(cardId, cell) {
    if (!cell || !cardId || !card(cardId)) return;
    const g = el('div', 'gone'); const r = cell.getBoundingClientRect();
    g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    g.innerHTML = `<img src="${artOf(card(cardId))}" alt="">`;
    document.body.appendChild(g); g.animate([{ opacity: .95, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.86) translateY(10px) rotate(4deg)' }], { duration: 460, easing: 'ease-in' });
    setTimeout(() => g.remove(), 480);
  }
  function showReveal(ev) {
    ev = ev || (UI.S && UI.S.reveal) || {};
    const ids = (ev.ids || []).filter(i => card(i));
    if (!ids.length) return;
    const box = $('revealStrip');
    box.innerHTML = `<i class="rs-tag">${esc(ev.reason || 'เปิดการ์ด')}</i>` + ids.map((id, k) =>
      `<img src="${scanOf(card(id))}" alt="${esc(card(id).name)}" style="animation-delay:${k * 90}ms" title="${esc(card(id).name)}">`).join('');
    box.classList.add('show');
    clearTimeout(showReveal._t);
    if (!UI.S || !UI.S.uiAsk) showReveal._t = setTimeout(() => box.classList.remove('show'), 2600);
  }

  /* ============ กดค้าง (ไม่ขึ้นก๊อปปี้/เซฟรูป) ============ */
  let lastPressAt = 0; const suppressTap = { active: false };
  const LONG_MS = 380, TOL = 10;
  function bindPress(node, onLong) {
    let timer = null, sx = 0, sy = 0;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    node.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (UI.drag) return;
      sx = e.clientX; sy = e.clientY;
      clear();
      timer = setTimeout(() => {
        timer = null; lastPressAt = Date.now();
        /* ถ้าม่านของแผงคำถามบังอยู่ : ซ่อนม่านชั่วคราวแล้วหาการ์ดใต้Pointer เพื่อเปิดชีข้อมูล (กดค้างได้ทุกที่) */
        const veilIds = ['askVeil', 'guardVeil', 'pickVeil'];
        const top0 = document.elementFromPoint(sx, sy);
        const blocked = !!(top0 && top0.classList && top0.classList.contains('guard-veil'));
        if (blocked) veilIds.forEach(id => { const v = $(id); if (v) v.setAttribute('data-off', '1'); });
        const under = document.elementFromPoint(sx, sy);
        const owner = (under && under.closest ? under.closest('[data-card-id]') : null) || node;
        const cid = owner && owner.dataset && owner.dataset.cardId;
        if (cid && typeof CARD_INDEX !== 'undefined' && CARD_INDEX[cid]) showCard(cid);
        else onLong();
        if (blocked) veilIds.forEach(id => { const v = $(id); if (v) v.removeAttribute('data-off'); });
        if (navigator.vibrate) { try { navigator.vibrate(10); } catch (x) { } }
      }, LONG_MS);
    }, { passive: true });
    node.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > TOL) clear(); }, { passive: true });
    node.addEventListener('pointerup', clear); node.addEventListener('pointercancel', clear);
    node.addEventListener('lostpointercapture', clear);
  }
  const consumePress = () => (Date.now() - lastPressAt < 450);

  /* ============ แตะเลือก/วาง ============ */
  function clearSel() { UI.sel = null; UI.hl = { move: [], atk: [], cells: [], targets: [] }; hint(defaultHint()); }
  const defaultHint = () => !UI.S ? '' : (UI.S.active !== human ? 'AI กำลังคิด…' : 'ลากการ์ดลงช่อง (หรือแตะ 2 ครั้ง) · แตะunit เพื่อดำเนินการ · กดค้างเพื่อดูข้อมูล');
  const hint = t => { $('hint').textContent = t; };

  function selectUnit(u) {
    UI.sel = { kind: 'unit', uid: u.uid };
    UI.hl = { move: Z.legalMoves ? [] : Z.legalMoveCells(UI.S, u), atk: Z.attackTargets(UI.S, u).map(t => ({ r: t.r, c: t.c })), cells: [], targets: Z.attackTargets(UI.S, u).map(t => t.uid) };
    const cd = card(u.id);
    hint(UI.hl.atk.length ? `[${cd.name}] แตะช่องแดง/ลากไปทับเพื่อโจมตี` : (UI.hl.move.length ? `[${cd.name}] ลากหรือแตะช่องน้ำเงินเพื่อเดิน` : `[${cd.name}] ใช้แอ็คไปแล้ว (วางนอน)`));
  }

  function playAt(i, r, c) {
    const S = UI.S, cd = card(S.players[human].hand[i]);
    if (!cd) return { ok: false, why: 'ไม่มีการ์ดตำแหน่งนี้' };
    if (cd.type === 'terrain') return Z.terrain(S, human, i, { r, c });
    if (cd.type === 'command') return Z.command(S, human, i, { r, c }, null);
    return Z.deploy(S, human, i, { r, c });
  }

  function onHand(i) {
    const S = UI.S;
    if (suppressTap && suppressTap.active) return;
    if (S.active !== human || UI.busy || S.pending || S.uiAsk) return;
    if (UI.sel && UI.sel.kind === 'hand' && UI.sel.idx === i) { clearSel(); render(); return; }
    const id = S.players[human].hand[i], cd = card(id);
    const info = Z.cardPlayable(S, human, i);
    if (!info || !info.ok) { hint((info && info.why) || 'ลงการ์ดใบนี้ไม่ได้'); return; }
    UI.sel = { kind: 'hand', idx: i, type: cd.type };
    UI.hl = { move: [], atk: [], cells: (info.cells || []).slice(), targets: [] };
    hint(cd.type === 'terrain' ? `ลาก/แตะช่องแถวหน้าเพื่อวาง [${cd.name}]` : cd.type === 'command' ? `ลาก/แตะช่องแถวหลังเพื่อร่าย [${cd.name}]` : `ลาก/แตะช่องแถวหลังเพื่อลง [${cd.name}]`);
    render();
  }

  async function onCell(r, c) {
    const S = UI.S;
    if (suppressTap && suppressTap.active) return;
    if (S.active !== human || S.pending || S.uiAsk) return;
    const ce = cellEl(r, c); ce.classList.add('tap'); setTimeout(() => ce.classList.remove('tap'), 260);
    const x = S.cells[r][c];
    if (UI.sel && UI.sel.kind === 'hand') {
      if (!UI.hl.cells.some(k => k.r === r && k.c === c)) { hint('ช่องนั้นเลือกไม่ได้'); return; }
      const res = playAt(UI.sel.idx, r, c);
      clearSel(); render();
      if (res && !res.ok) hint(res.why);
      await settleAsks();
      return;
    }
    if (UI.sel && UI.sel.kind === 'unit') {
      const me = S.cards[UI.sel.uid];
      if (!me) { clearSel(); render(); return; }
      if (u2(x) && u2(x).side !== human && UI.hl.targets.includes(u2(x).uid)) {
        const res = Z.attack(S, human, me.uid, u2(x).uid); clearSel(); render(); await settleAsks(); return;
      }
      if (UI.hl.move.some(k => k.r === r && k.c === c)) { const res = Z.move(S, human, me.uid, { r, c }); clearSel(); render(); await settleAsks(); return; }
    }
    if (u2(x) && u2(x).side === human) { selectUnit(u2(x)); render(); return; }
    clearSel(); render();
  }
  const u2 = x => x && x.unit;

  /* ============ ลาก-วาง ============ */
  let dg = null;
  function beginGesture(kind, payload, img, e, node) {
    dg = { kind, payload, img, sx: e.clientX, sy: e.clientY, active: false, node };
    window.addEventListener('pointermove', gestureMove, { passive: false });
    window.addEventListener('pointerup', gestureUp);
    window.addEventListener('pointercancel', gestureAbort);
    window.addEventListener('keydown', escCancel);
  }
  function escCancel(e) { if (e.key === 'Escape') gestureAbort(); }
  function gestureMove(e) {
    if (!dg) return;
    const S = UI.S;
    if (!dg.active) {
      if (!S || S.pending || S.uiAsk || S.active !== human || UI.busy) return gestureAbort();
      const dx = e.clientX - dg.sx, dy = e.clientY - dg.sy, dist = Math.hypot(dx, dy);
      if (dist < 12) return;
      if (dg.kind === 'hand') {
        const info = Z.cardPlayable(S, human, dg.payload.idx);
        if (!info || !info.ok) return gestureAbort();
      } else { const u = S.cards[dg.payload.uid]; if (!u || u.rested || u.side !== human) return gestureAbort(); }
      dg.active = true; suppressTap.active = true;
      startDrag(dg.kind, dg.payload, dg.img);
      moveGhost(e.clientX, e.clientY); hoverCell(e.clientX, e.clientY);
      if (navigator.vibrate) { try { navigator.vibrate(6); } catch (x) { } }
      e.preventDefault(); return;
    }
    e.preventDefault();
    moveGhost(e.clientX, e.clientY); hoverCell(e.clientX, e.clientY);
  }
  function gestureUp(e) {
    const was = dg && dg.active;
    const snap = UI.drag ? Object.assign({}, UI.drag) : null;
    cleanup();
    if (!was) { if (UI.drag) cancelDrag(); suppressTap.active = false; return; }
    endDrag();                                    /* เคลียร์ ghost/thumbnail ทันที กันสถานะ drag ค้าง (ทำให้กดค้างไม่เปิดชีข้อมูล) */
    Promise.resolve(dropAt(e.clientX, e.clientY, snap)).catch(x => console.warn(x)).finally(() => { render(); setTimeout(() => { suppressTap.active = false; }, 80); });
  }
  function gestureAbort() { const was = dg && dg.active; cleanup(); if (was || UI.drag) { cancelDrag(); render(); } suppressTap.active = false; }
  function cleanup() {
    window.removeEventListener('pointermove', gestureMove); window.removeEventListener('pointerup', gestureUp);
    window.removeEventListener('pointercancel', gestureAbort); window.removeEventListener('keydown', escCancel); dg = null;
  }
  function startDrag(kind, payload, img) {
    UI.drag = { kind, payload, cell: null };
    const g = $('dragGhost'); g.innerHTML = `<img src="${img}" alt="">`; g.style.display = 'block';
    document.body.classList.add('dragging');
    showDropTargets(kind, payload);
  }
  function endDrag() {
    document.body.classList.remove('dragging');
    const g = $('dragGhost'); g.style.display = 'none'; g.classList.remove('drop');
    [...board.children].forEach(c => c.classList.remove('drop-ok', 'drop-bad'));
    UI.drag = null; UI.hl = { move: [], atk: [], cells: [], targets: [] };
  }
  function cancelDrag() { endDrag(); }
  function moveGhost(x, y) {
    const g = $('dragGhost'); g.style.left = x + 'px'; g.style.top = y + 'px';
    const dx = x - (UI.drag && UI.drag.sx || x), t = dg ? Math.max(-14, Math.min(14, (x - dg.sx) / 14)) : 0;
    g.style.transform = `translate(-50%,-52%) rotate(${t - 3}deg) scale(1.05)`;
  }
  function showDropTargets(kind, payload) {
    const S = UI.S; UI.hl = { move: [], atk: [], cells: [], targets: [] };
    if (kind === 'hand') { const info = Z.cardPlayable(S, human, payload.idx); if (info && info.ok) UI.hl.cells = (info.cells || []).slice(); }
    else if (kind === 'unit') { const u = S.cards[payload.uid]; if (u) { UI.hl.move = Z.legalMoveCells(S, u); UI.hl.atk = Z.attackTargets(S, u).map(t => ({ r: t.r, c: t.c })); UI.hl.targets = Z.attackTargets(S, u).map(t => t.uid); } }
    applyHL();
    [...board.children].forEach(c => {
      const r = +c.dataset.r, cc = +c.dataset.c;
      if (UI.hl.cells.some(k => k.r === r && k.c === cc) || UI.hl.move.some(k => k.r === r && k.c === cc) || UI.hl.atk.some(k => k.r === r && k.c === cc)) c.classList.add('drop-ok');
    });
    const g = $('dragGhost'); g.classList.add('live');
  }
  function cellUnder(x, y) {
    const els = document.elementsFromPoint(x, y) || [];
    for (const e of els) {
      if (e.id === 'dragGhost' || (e.closest && e.closest('#dragGhost'))) continue;   /* อย่าให้นิตี้ตัวเองบังช่องวาง */
      const c = e.closest ? e.closest('.cell') : null;
      if (c) return c;
    }
    return null;
  }
  function hoverCell(x, y) {
    const c = cellUnder(x, y);
    [...board.children].forEach(n => n.classList.toggle('drop-bad', n !== c && UI.drag && !(UI.hl.cells.some(k => +n.dataset.r === k.r && +n.dataset.c === k.c) || UI.hl.move.some(k => +n.dataset.r === k.r && +n.dataset.c === k.c) || UI.hl.atk.some(k => +n.dataset.r === k.r && +n.dataset.c === k.c)) && !!cellUnder(x, y)));
    if (!c) { if (UI.drag) UI.drag.cell = null; return; }
    const r = +c.dataset.r, cc = +c.dataset.c;
    const legal = UI.hl.cells.some(k => k.r === r && k.c === cc) || UI.hl.move.some(k => k.r === r && k.c === cc) || UI.hl.atk.some(k => k.r === r && k.c === cc);
    c.classList.toggle('drop-bad', !legal);
    if (!legal) { c.classList.add('nudge'); setTimeout(() => c.classList.remove('nudge'), 240); }
    UI.drag.cell = legal ? { r, c: cc } : null;
  }
  async function dropAt(x, y, dragSnap) {
    const S = UI.S, d = dragSnap || UI.drag; if (!d || !d.kind) return;
    const c = cellUnder(x, y); if (!c) return;
    const r = +c.dataset.r, cc = +c.dataset.c;
    const g = $('dragGhost');
    UI.hl = UI.hl || { move: [], atk: [], cells: [], targets: [] };
    if (d.kind === 'hand') {
      const info = Z.cardPlayable(S, human, d.payload.idx);
      if (!info || !info.ok || !(info.cells || []).some(k => k.r === r && k.c === cc)) { hint('วางช่องนี้ไม่ได้'); snapBack(g); return; }
      g.classList.add('drop');
      const res = playAt(d.payload.idx, r, cc);
      clearSel(); if (res && !res.ok) hint(res.why);
      await settleAsks();
    } else {
      const u = S.cards[d.payload.uid]; if (!u) return;
      const hl = UI.hl || { move: [], atk: [], cells: [], targets: [] };
      if (hl.atk.some(k => k.r === r && k.c === cc)) {
        const t = S.cells[r][cc].unit; g.classList.add('drop');
        const res = Z.attack(S, human, u.uid, t.uid); clearSel(); await settleAsks(); return;
      }
      if (!hl.move.some(k => k.r === r && k.c === cc)) { hint('เดินไปช่องนี้ไม่ได้'); snapBack(g); return; }
      g.classList.add('drop');
      const res = Z.move(S, human, u.uid, { r, c: cc }); clearSel(); await settleAsks();
    }
  }
  function snapBack(g) {
    const dg2 = $('dragGhost'); dg2.classList.add('snap');
    setTimeout(() => dg2.classList.remove('snap'), 260);
  }
  function bindHandDrag(node, idx) {
    node.addEventListener('pointerdown', e => {
      const S = UI.S;
      if (!S || S.active !== human || UI.busy || S.pending || S.uiAsk) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const id = S.players[human].hand[idx]; if (!id) return;
      beginGesture('hand', { idx }, scanOf(card(id)), e, node);
    }, { passive: true });
    node.addEventListener('dragstart', e => e.preventDefault());
  }

  /* ============ Declaration-Response (ตอบโต้) ============ */
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
      const b = el('button', 'guard-opt', `${esc(cd.name)} <em>Flare ${cd.cost} · ${esc(ab ? ab.text : '')}</em>`);
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

  /* ============ หน้าต่าง “ขอให้ผู้เล่นเลือก” (จาก engine) ============ */
  function renderAsk() {
    const S = UI.S, ask = S && S.uiAsk, panel = $('askPanel');
    if (!ask) { panel.classList.add('hidden'); $('askVeil').classList.add('hidden'); return; }
    /* แถบการ์ดที่เปิดจากสมุด : ให้เห็นควบคู่กับแผงคำถามได้ (เฉพาะชนิดที่เปิดดู/ทริกเกอร์) */
    if ($('revealStrip') && !['reveal', 'triggerUse', 'outzone', 'hand'].includes(ask.kind)) $('revealStrip').classList.remove('show');
    if ($('revealStrip') && ['reveal', 'triggerUse'].includes(ask.kind)) showReveal();
    const kind = ask.kind;
    $('askTitle').innerHTML = esc(ask.title || 'เลือกเป้าหมาย') + (ask.sub ? ` <small>${esc(ask.sub)}</small>` : '');
    const box = $('askCards'); box.innerHTML = '';
    const state = UI.askSel = UI.askSel || { ids: [], pick: null };
    if (kind === 'choice') {
      const acts0 = $('askActs'); acts0.innerHTML = '';
      (ask.choices || []).forEach((c, i) => {
        const b = el('button', 'parallelogram choice', esc(c.name));
        b.onclick = () => answer(c.id);
        acts0.append(b);
        b.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 220, delay: i * 60, easing: 'cubic-bezier(.2,.9,.2,1)', fill: 'backwards' });
      });
      if (ask.allowSkip !== false) { const n = el('button', 'parallelogram no', 'ข้าม'); n.onclick = () => answer(null); acts0.append(n); }
      box.innerHTML = '<div class="ask-hint">เลือก 1 ตัวเลือก</div>';
      panel.classList.remove('hidden'); $('askVeil').classList.remove('hidden');
      return;
    }
    const cands = ask.uids ? ask.uids.map(u => ({ kind: 'uid', id: u, cd: (function () { const x = S.cards[u]; return x && card(x.id) ? card(x.id) : null; })(), u: S.cards[u] }))
      : (ask.cardIds || []).map(id => ({ kind: 'card', id, cd: card(id) }));
    const need = ask.need || 1;
    const multi = kind === 'multi' || (kind === 'hand' && need > 1);
    function setBar() {
      const b = $('askBar'); if (!b) return;
      const done = multi ? Math.min(need, state.ids.length) : (state.pick ? 1 : (ask.allowSkip ? 0 : 1));
      b.style.width = Math.round(100 * done / Math.max(1, need)) + '%';
    }
    setBar();
    if (kind === 'triggerUse') {
      const cd = card(ask.cardIds[0]);
      box.innerHTML = `<div class="ask-trig"><img src="${scanOf(cd)}" alt=""><div><b>${esc(cd.name)}</b>
        <p>${esc(ask.abilityText || '')}</p></div></div>`;
      const acts = $('askActs'); acts.innerHTML = '';
      const yes = el('button', 'parallelogram yes', 'ใช้เอฟเฟกต์'); yes.id = 'askYes';
      const no = el('button', 'parallelogram no', 'เก็บขึ้นมือ');
      yes.onclick = () => answer('use'); no.onclick = () => answer('keep');
      acts.append(yes, no);
      panel.classList.remove('hidden'); $('askVeil').classList.remove('hidden');
      return;
    }
    cands.forEach((o, i) => {
      const cd = o.cd; if (!cd) return;
      const pickable = !ask.pickIds || ask.pickIds.includes(o.id) || (o.u && ask.pickIds.includes(o.u.uid));
      const n = el('button', 'ask-card' + (pickable ? '' : ' off'), `
        <img src="${scanOf(cd)}" alt="">
        <span class="k">${kindLine(cd)}</span>
        <b>${esc(cd.name)}</b>
        <i>${cd.color || ''}${o.u ? ` · CP ${Z.effCp(S, o.u).toLocaleString()}${o.u.rested ? ' · วางนอน' : ''}` : (cd.cp ? ' · CP ' + cd.cp.toLocaleString() : '')}</i>`);
      n.addEventListener('click', () => {
        if (n.classList.contains('off')) return;
        if (multi) {
          const k = state.ids.indexOf(o.id); if (k >= 0) state.ids.splice(k, 1); else if (state.ids.length < need) state.ids.push(o.id);
          n.classList.toggle('on', state.ids.includes(o.id));
          $('askYes').disabled = !(ask.allowSkip || state.ids.length);
          setBar();
          return;
        }
        if (kind === 'uid-multi') { }
        state.pick = o.id;
        [...box.children].forEach(c => c.classList.remove('on')); n.classList.add('on');
        $('askYes').disabled = false; setBar();
        /* การ “เลือกเป้าหมาย” = ยืนยันในแตะเดียว (มีปุ่ม × สำหรับข้าม) */
        if (!ask.allowSkip || kind === 'target') { answer(o.id); }
      });
      state.ids = []; n.classList.toggle('on', state.pick === o.id);
      box.appendChild(n);
      n.animate([{ opacity: 0, transform: 'translateY(14px) scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: i * 45, easing: 'cubic-bezier(.2,.9,.2,1)', fill: 'backwards' });
    });
    const acts = $('askActs'); acts.innerHTML = '';
    const yes = el('button', 'parallelogram yes', multi ? 'ยืนยัน (' + (state.ids.length || 0) + '/' + need + ')' : 'ใช่'); yes.id = 'askYes';
    const no = el('button', 'parallelogram no', ask.allowSkip ? 'ข้าม / ไม่ใช้' : 'ไม่');
    yes.disabled = !(ask.allowSkip || state.pick || state.ids.length);
    yes.onclick = () => answer(multi ? state.ids : state.pick);
    no.onclick = () => answer(kind === 'triggerUse' ? 'keep' : null);
    acts.append(no, yes);
    panel.classList.remove('hidden'); $('askVeil').classList.remove('hidden');
  }
  function answer(v) {
    const S = UI.S; UI.askSel = null;
    $('revealStrip').classList.add('show'); setTimeout(() => { if (!S.uiAsk) $('revealStrip').classList.remove('show'); }, 1200);
    Z.answer(S, v);
    render();
    if (UI.askResolve) { const r = UI.askResolve; UI.askResolve = null; r(); }
    else if (S.active === aiSide && !UI.busy && !S.winner) aiGo();
  }
  async function settleAsks() {
    let guard = 0;
    while (UI.S && (UI.S.uiAsk || UI.S.pending) && guard++ < 12) {
      render();
      if (UI.S.uiAsk) await new Promise(res => { UI.askResolve = res; });
      else if (UI.S.pending) await waitResponse();
    }
    render();
  }

  /* ============ ตา AI ============ */
  async function aiGo() {
    const S = UI.S;
    UI.busy = true; clearSel(); render();
    let guard = 0;
    while (S.active === aiSide && !S.winner && guard++ < 40) {
      await sleep(240);
      const r = ZAI.takeTurn(S, aiSide);
      render();
      await settleAsks();
      if (S.winner) break;
      if (r === 'done') break;
    }
    if (S.active === aiSide && !S.pending && !S.uiAsk && !S.winner) Z.endTurn(S);
    UI.busy = false; render(); await settleAsks();
    if (S.active === human && !S.winner) await banner('YOUR TURN', false, 620);
    if (S.winner) maybeOver();
  }

  async function banner(text, foe_, ms) {
    const b = $('banner');
    b.className = 'banner show' + (foe_ ? ' foe' : '');
    b.innerHTML = `<span>${esc(text)}</span>`;
    await sleep(ms || 900);
    b.className = 'banner';
  }
  async function humanEnd() {
    const S = UI.S;
    if (!S || S.active !== human || UI.busy || S.pending || S.uiAsk) return;
    clearSel();
    banner('END PHASE', false, 420);
    Z.endTurn(S);
    render(); await settleAsks();
    maybeOver();
    if (S.winner) return;
    if (S.active !== human) aiGo();
  }

  /* ============ ชีข้อมูล / โซน / result ============ */
  function showCard(id) {
    const cd = card(id); if (!cd) return;
    lockSheet(true);
    $('zvTitle').textContent = cd.name;
    $('zvBody').innerHTML = `<div class="card-sheet">
      <div class="cs-artbox"><img class="cs-scan" src="${scanOf(cd)}" alt="${esc(cd.name)}"></div>
      <div>
        <div class="cs-head"><b>${kindLine(cd)}</b><span>${esc(cd.color || 'Colorless')}${cd.tribe ? ' · ' + esc(cd.tribe) : ''}</span>
          <i class="cs-cost">Cost ${cd.cost}</i>${cd.cp ? `<i class="cs-cp">${cd.cp.toLocaleString()} CP</i>` : ''}${cd.protection ? '<i class="cs-pr">PROTECTION</i>' : ''}</div>
        ${(cd.abilities || []).map(a => `<div class="cs-ab"><span>${esc(a.kw)}${a.when ? ' ⟨' + a.when + '⟩' : ''}</span>
          <em class="st ${a.ops && a.ops.length ? 'ok' : 'partial'}">${a.ops && a.ops.length ? 'engine ต่อผลแล้ว: ' + a.ops.map(o => o.op).join('+') : 'ยังไม่ต่อผลอัตโนมัติ'}</em>
          <p>${esc(a.text)}${a.cost ? ` (cost ${a.cost} Flare)` : ''}${a.once ? ' · [Once per turn]' : ''}</p></div>`).join('') || '<div class="cs-ab"><span>Body</span><p>ไม่มีความสามารถ</p></div>'}
      </div></div>`;
    $('zoneView').classList.remove('hidden');
  }
  function lockSheet(on) { $('zoneView').classList.toggle('lock', on); }
  function openZone(side, zone, label) {
    const p = UI.S.players[side];
    $('zvTitle').textContent = label;
    const list = {};
    ((p[zone] || []).slice()).forEach(e => { const id = typeof e === 'string' ? e : e.id; const cd = card(id); if (!cd) return; const k = cd.name + ' · ' + (cd.color || ''); list[k] = (list[k] || 0) + 1; });
    const keys = Object.keys(list);
    $('zvBody').innerHTML = keys.length ? keys.map(k => `<div class="zv-row"><b>${esc(k)}</b><span>×${list[k]}</span></div>`).join('') : '<div class="zv-row off">ว่าง</div>';
    $('zoneView').classList.remove('hidden');
  }
  function maybeOver() {
    const S = UI.S; if (!S || !S.winner) return;
    const win = S.winner === human;
    const t = JSON.parse(localStorage.getItem('zf_tally') || '{"w":0,"l":0}');
    t[win ? 'w' : 'l']++; localStorage.setItem('zf_tally', JSON.stringify(t));
    $('overBadge').src = win ? 'assets/ui/badge-win.png' : 'assets/ui/badge-lose.png';
    $('overTitle').textContent = win ? 'ชนะ — ' + S.players[human].corePoints + ' Core Point' : 'แพ้ — ' + (S.players[S.winner].deckName || '') + ' เก็บแต้มครบก่อน';
    $('overTitle').className = win ? 'win' : 'lose';
    $('overDetail').innerHTML = `${S.turnNo} เทิร์น · คุณ ${S.players[human].corePoints}/${R.corePointsToWin} · ศัตรู ${S.players[aiSide].corePoints}/${R.corePointsToWin}`;
    openModal('modalOver');
  }

  /* ============ modal ============ */
  function openModal(id) {
    $('veil').classList.remove('hidden');
    ['modalHome', 'modalRules', 'modalOver'].forEach(m => $(m).classList.toggle('hidden', m !== id));
    $('btnModalX').style.display = (id === 'modalHome' && !UI.S) ? 'none' : 'grid';
  }
  const closeModal = () => { $('veil').classList.add('hidden'); ['modalHome', 'modalRules', 'modalOver'].forEach(m => $(m).classList.add('hidden')); };

  const ASSUMPTIONS = `
    <section class="warn"><h3>สิ่งที่buildนี้ตีความ/รอ konfirmasi</h3>
    <p>1) <code>revealAdd n:-1</code> ของใบที่ใช้ “จำนวนยูนิต Blue/Adventurer ที่คุมอยู่” ยังนับตามข้อความที่ OCR มา<br>
    2) การเรียงการ์ดใต้สมุด “ตามใจชอบ” (place … in any order) ระบบเรียงตามที่เปิดมา (รอ UI เรียงลำดับแบบลาก)<br>
    3) ใบที่ระบุเงื่อนไขซับซ้อน ([In Hand] ลด Cost ตาม Terrain ที่ทำลายในเทิร์น) ใช้ตัวนับจริงแล้ว<br>
    4) ผู้ที่เริ่มทีหลังไม่จั่วในเทิร์นแรก (ตาม rulebook)</p></section>`;

  const RULESUM = () => `
  <h2>กติกา Zonefall <small>${R.version}</small></h2>
  <div class="rb">
    <section><h3>วิธีเล่นบนหน้าจอนี้</h3><p><b>ลากการ์ด</b>จากมือลงช่องที่ไฮไลต์ (หรือแตะการ์ดแล้วแตะช่อง) · <b>ลากยูนิต</b>บนสนามไปช่องน้ำเงินเพื่อเดิน / ทับช่องแดงเพื่อโจมตี · <b>กดค้าง</b>การ์ดเพื่อดูข้อมูลเต็มใบ (ไม่มีการก๊อปปี้/เซฟรูปเกิดขึ้น) · เลื่อนมือด้วยลูกศร ‹ › หรือปาด · ปุ่ม ⤢ เข้าโหมดเต็มจอ</p></section>
    <section><h3>เป้าหมาย</h3><p>สะสม <b>${R.corePointsToWin} Core Point</b> · ได้จากจำนวนการ์ดที่คุณครองใน <b>Core Zone (แถว ${R.coreRow + 1})</b> ตอน End Phase ใบละ 1 · หรือให้อีกฝ่ายจั่วไม่ได้ (สมุดหมด = แพ้ทันที)</p></section>
    <section><h3>สนาม 5×3</h3><p>แถว ${R.rows}→1 จากฝั่งคุณขึ้นบน · ลงยูนิต/Command ที่แถวหลังตนเอง (แถว ${R.backRow.p0}) · Terrain วางแถวหน้า (แถว ${R.frontRow.p0}) ·ห้ามเข้าแถวหลังศัตรู · Terrain ไม่บล็อกทางและยูนิตยืนทับได้</p></section>
    <section><h3>Flare</h3><p>แต่ละฝ่ายเริ่มที่ <b>${R.flareStart} Flare</b> แล้ว +1 ต่อเทิร์นของตัวเองจนถึง ${R.flareMax} · ไม่สะสมข้ามเทิร์น · ใช้ลงการ์ด/ร่าย/วาง Terrain/Activate · <b>โจมตีใช้ 1 Flare</b> (การเดินฟรี 1 ช่อง)</p></section>
    <section><h3>แอ็คของยูนิต</h3><p>1 แอ็ค/เทิร์น (เดินหรือโจมตี) แล้ววางนอน · ลงสนามเทิร์นเดียวกันโจมตีได้เลยถ้ามี Flare · Some cards have "cannot move" conditions — ระบบล็อกให้อัตโนมัติ</p></section>
    <section><h3>ต่อสู้ (Persistent Power)</h3><p>ประกาศโจมตี → <b>ตอบโต้ 1 ครั้ง</b> → Counter ของผู้ป้องกัน → Attack ของผู้โจมตี → เอา CP ผู้โจมตีไปลบ CP ผู้ป้องกัน เหลือ 0 = ไป Outzone · ผู้โจมตีไม่เสียค่าพลัง · รีเซ็ตต้นเทิร์น · โจมตีได้เฉพาะหน้า/ซ้าย/ขวา</p></section>
    <section><h3>Trigger Check (มีแอนิเมชัน + เลือกได้)</h3><p>เมื่ออีกฝ่ายได้ Core Point คุณเปิดใบบนสุด — ระบบ<b>โชว์การ์ดใบที่เปิด</b> ถ้ามีการ์ด [Trigger] จะถามว่า <b>ใช้เอฟเฟกต์</b> หรือ <b>เก็บขึ้นมือ</b> (ไม่ใช้ = ขึ้นมือตามปกติ)</p></section>
    <section><h3>โควตา/โซน</h3><p>ยูนิต ≤ ${R.unitLimit} · Terrain ≤ ${R.terrainLimitBase} (ใบที่คุมหลายใบได้อย่าง Sylvan ไม่กินโควตา) · มือ ≤ ${R.handMax} (เกิน → Removezone) · Outzone/Removezone/Extra Zone กดที่กองเพื่อดูเนื้อหา · [Protection] ≤ ${R.protectionLimit} ใบ/เด็ค</p></section>
    <section><h3>build นี้ไม่มี</h3><p>Arcanum / Arc-Flare (ปิดไว้ตามคำสั่ง) · เสียงประกอบ (ไฟล์ Sound Track ยังไม่ได้ต่อ) · Deck builder (ยังใช้เด็คอัตโนมัติจากชุดที่ import)</p></section>
    ${ASSUMPTIONS}
  </div>`;

  const catalogHTML = () => {
    const byColor = {};
    CARDS.forEach(c => { const k = c.color || 'Colorless'; (byColor[k] = byColor[k] || []).push(c); });
    const withOps = CARDS.reduce((a, c) => a + (c.abilities || []).filter(x => (x.ops || []).length).length, 0);
    const allAb = CARDS.reduce((a, c) => a + (c.abilities || []).length, 0);
    return `
    <h2>คาตาล็อกการ์ดจริง <small>${CARDS.length} ใบ · ความสามารถที่ต่อผลอัตโนมัติ ${withOps}/${allAb} ข้อ</small></h2>
    ${Object.keys(byColor).map(col => `<div class="cat-fac" style="color:${({ Yellow: '#ffce26', Blue: '#1fa8ff', Red: '#d8262c', Green: '#6ec93f', Purple: '#a94bd8', Colorless: '#9fb0cc' })[col] || '#fff'}">${col} · ${byColor[col].length} ใบ</div>
      <div class="cat">${byColor[col].map(c => `<div class="cat-card col-${col.toLowerCase()}">
        <img loading="lazy" src="${scanOf(c)}" alt="">
        <div><b>${esc(c.name)}</b><span class="cat-st">${c.type.toUpperCase()} · Cost ${c.cost}${c.cp ? ' · ' + c.cp.toLocaleString() + ' CP' : ''} · ${esc(c.tribe || '—')}</span></div>
        ${(c.abilities || []).map(a => `<div class="cat-tx"><em>${esc(a.kw)}</em> ${esc(a.text)}${a.ops && a.ops.length ? '' : ' <i class="pend">(ยังไม่ต่อผล)</i>'}</div>`).join('')}
      </div>`).join('')}</div>`).join('')}`;
  };

  const IMPORTDOC = () => `
    <h2>asset &amp; การ์ดในbuildนี้ <small>ทุกอย่างมาจากไฟล์ของคุณในโฟลเดอร์ Drive</small></h2>
    <div class="rb">
      <section><h3>นำเข้าแล้ว</h3><p>สแกนการ์ด 52 ใบ (SB01-001…022, SD01-001…015, SD04-001…0015) → OCR ชื่อ/ชนิด/สีเผ่า/Cost/Power/ความสามารถทุกข้อแบบคำต่อคำ → <code>js/data.js</code> · ภาพเต็มใบ <code>img/</code> · หน้าต่างภาพcropped <code>assets/art/</code> · sprite UI จากโฟลเดอร์ InGame - Font &amp; Icon · ฉากสนามจาก field_map01-03 · ฟอนต์ 3 ชุด (FC Twist Bold / FC Iconic Bold / SOV LookSit) แบบ subset ไทย+ลาติน · ไอคอน PWA จากโลโก้จริง</p></section>
      <section><h3>อยากแก้มือเอง</h3><pre>{ id:'sd01004', file:'SD01-004', art:'img/SD01-004.jpg',
  name:'Cere, Wild Tribesman', type:'unit', color:'Green',
  tribe:'Beastfolk', cost:2, cp:1000,
  abilities:[
    { kw:'On Play', when:'deploy', text:'...(คำต่อคำ)...',
      ops:[{op:'mill',n:1},{op:'cp',to:'self',n:2000,dur:'turn'}],
      req:[{kind:'outzoneMin',min:10}] } ] }</pre>
      <p>ops: cp setPower draw mill discard ready rest move swap noDestroyBattle point foePoint
      destroyTerrain revealTop revealAdd addFromOutzone playFromOutzone playHandUnits outzoneToBottom
      shiftCost ascend foeDestroyChoice cancel bounce summon autoCore damage destroy flare core banish ·
      req: colorCount tribeCount terrainMin outzoneMin/Max flag(...) notPlayedThisTurn handCostReduce</p></section>
      <section><h3>ชุดถัดไป</h3><p>ส่งรูปโฟลเดอร์/ลิงก์เพิ่ม (โดยเฉพาะใบที่มี Arcanum/Token) ผมจะ OCR + ต่อ ops + ใส่เด็คให้</p></section>
    </div>`;

  /* ============ เริ่มเกม / o-p-s / เต็มจอ ============ */
  function startGame(firstSide) {
    UI.S = Z.init({ p0deck: $('selOwnDeck').value, p1deck: $('selFoeDeck').value, p1GoesFirst: firstSide === 'p1', humanSide: human });
    UI.logAt = 0; $('logBody').innerHTML = ''; UI.busy = false; UI.pos = {}; clearSel();
    $('seedTag').textContent = UI.S.seed;
    closeModal(); document.body.classList.add('ingame');
    render();
    if (UI.S.active === human) banner('YOUR TURN', false, 700); else aiGo();
  }
  const BEATS = { paper: 'scissors', scissors: 'rock', rock: 'paper' };
  async function chooseByRps() {
    $('rpsPanel').classList.remove('hidden'); $('rpsVeil').classList.remove('hidden');
    const mine = await new Promise(res => { UI.rpsCb = res; });
    const theirs = ['paper', 'scissors', 'rock'][Math.floor(Math.random() * 3)];
    $('rpsVeil').classList.add('hidden');
    const win = mine === theirs ? true : BEATS[mine] === theirs;
    $('rpsPanel').classList.add('hidden');
    startGame(win ? 'p0' : 'p1');
    hint(`o/p/s: คุณ=${mine} อีกฝ่าย=${theirs} → ${win ? 'คุณ' : 'AI'}เริ่มก่อน`);
  }
  function toggleFull() {
    const de = document.documentElement;
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const rq = de.requestFullscreen ? de.requestFullscreen({ navigationToolbar: 'hide', ui: 'full' }) : de.webkitRequestFullscreen && de.webkitRequestFullscreen();
        if (rq && rq.catch) rq.catch(() => hint('เบราว์เซอร์นี้ไม่เข้าเต็มจอให้'));
      } else if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) { hint('เข้าเต็มจอไม่ได้: ' + e.name); }
  }
  function syncFull() {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const b = $('btnFull'); if (b) { b.textContent = on ? '⤡' : '⤢'; b.classList.toggle('on', on); b.title = on ? 'ออกจากเต็มจอ' : 'เต็มจอ'; }
  }

  function boot() {
    buildBoard();
    const mk = (sel, def) => { sel.innerHTML = ''; Object.keys(DECKS).forEach(k => sel.appendChild(new Option(DECKS[k].name, k))); if ([...sel.options].some(o => o.value === def)) sel.value = def; };
    mk($('selOwnDeck'), 'sylvan'); mk($('selFoeDeck'), 'machina');
    const t = JSON.parse(localStorage.getItem('zf_tally') || '{"w":0,"l":0}');
    $('btnStart').textContent = `เข้าสนาม (${t.w}ชนะ / ${t.l}แพ้)`;
    $('btnRules').onclick = $('btnRules2').onclick = () => { $('modalRules').innerHTML = RULESUM(); openModal('modalRules'); };
    $('btnCatalog').onclick = $('btnCatalog2').onclick = () => { $('modalRules').innerHTML = catalogHTML(); openModal('modalRules'); };
    $('btnImport').onclick = () => { $('modalRules').innerHTML = IMPORTDOC(); openModal('modalRules'); };
    $('btnModalX').onclick = () => { if (UI.S) { closeModal(); } else openModal('modalHome'); };
    $('veil').addEventListener('click', e => { if (e.target === $('veil') && UI.S && !UI.S.winner) closeModal(); });
    $('btnStart').onclick = () => { const v = $('selFirst').value; if (v === 'rps') { closeModal(); chooseByRps(); } else startGame(v); };
    $('btnMenu').onclick = () => openModal('modalHome');
    $('btnAgain').onclick = () => { closeModal(); $('selFirst').value = 'rps'; chooseByRps(); };
    $('btnOverHome').onclick = () => openModal('modalHome');
    $('btnOverLog').onclick = () => { closeModal(); $('logDrawer').classList.add('open'); };
    $('btnLog').onclick = () => $('logDrawer').classList.toggle('open');
    $('btnLogClose').onclick = () => $('logDrawer').classList.remove('open');
    $('btnEnd').onclick = humanEnd;
    $('btnCancel').onclick = () => { if (UI.S && UI.S.uiAsk && UI.S.uiAsk.allowSkip) answer(null); clearSel(); render(); };
    $('btnAbility').onclick = () => {
      const u = UI.sel && UI.S.cards[UI.sel.uid]; if (!u) return hint('เลือกunit ก่อน');
      const ab = (card(u.id).abilities || []).find(a => a.kw === 'Activate'); if (!ab) return;
      const r = Z.ability(UI.S, human, u.uid); clearSel(); render();
      if (!r.ok) hint(r.why); else settleAsks();
    };
    $('btnFull').onclick = toggleFull;
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, syncFull));
    syncFull();
    $('pgL').onclick = () => panHand(-1); $('pgR').onclick = () => panHand(1);
    $('hand').addEventListener('scroll', () => { const b = $('hand'); $('pgL').disabled = b.scrollLeft < 4; $('pgR').disabled = b.scrollLeft + b.clientWidth > b.scrollWidth - 4; }, { passive: true });
    $('askX').onclick = () => { const a = UI.S && UI.S.uiAsk; if (a && (a.allowSkip || a.kind === 'triggerUse')) answer(a.kind === 'triggerUse' ? 'keep' : null); };
    $('zvClose').onclick = () => $('zoneView').classList.add('hidden');
    document.querySelectorAll('.zonepile').forEach(b => b.addEventListener('click', () => {
      const foeSide = !!b.closest('#plateFoe');
      openZone(foeSide ? aiSide : human, b.dataset.z, (foeSide ? 'ศัตรู · ' : 'คุณ · ') + ({ deck: 'เด็ค', outzone: 'Outzone', remove: 'Removezone', extra: 'Extra Zone' })[b.dataset.z]);
    }));
    document.querySelectorAll('.rps-btn').forEach(b => b.onclick = () => { const cb = UI.rpsCb; UI.rpsCb = null; if (cb) cb(b.dataset.rps); });
    document.addEventListener('keydown', e => {
      if (!UI.S) return;
      if (e.key === 'Escape') { $('zoneView').classList.add('hidden'); clearSel(); render(); }
      if (e.key === ' ' || e.key === 'Enter') { if (!$('veil').classList.contains('hidden') || UI.S.uiAsk) return; e.preventDefault(); humanEnd(); }
      if (e.key === 'ArrowLeft') panHand(-1);
      if (e.key === 'ArrowRight') panHand(1);
      if (e.key === 'f' || e.key === 'F') toggleFull();
    });
    hint(defaultHint());
    window.__ZF = { U: UI, Z, ZAI, aiGo, render: () => render(), st: () => UI.S, answer, showCard };
    openModal('modalHome');
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(reg => {
      setTimeout(() => { try { reg.active && reg.active.postMessage('warm-art'); } catch (x) { } }, 4000);
    }).catch(() => { });
  }
  boot();
})();
