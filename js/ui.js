/* ==========================================================================
   ZONEFALL — UI (vanilla JS, ออกแบบให้แตะเล่นบนมือถือ)
   อ่านกติกา/การ์ดจาก data.js, ตัดสินทุกอย่างผ่าน Z (engine) เพื่อให้
   ตัวเกมกับหน้ากติกาสอดคล้องกันเสมอ
   ========================================================================== */
(function () {
  const $ = id => document.getElementById(id);
  const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const R = Z.R, card = Z.card;
  const human = 'p0', aiSide = 'p1';
  const board = $('board');
  const COL = ['A', 'B', 'C'];
  const cname = (r, c) => (r + 1) + COL[c];

  const U = {
    S: null, sel: null, busy: false, logAt: 0, respResolve: null,
    hl: { move: [], atk: [], cells: [], targets: [] },
  };

  /* ------------------------------------------------- board skeleton */
  function buildBoard() {
    board.innerHTML = '';
    for (let r = 0; r < R.rows; r++) {                      // บนสุด = แถว 1 (หลังศัตรู), ล่างสุด = แถว 5 (หลังคุณ)
      for (let c = 0; c < R.cols; c++) {
        const cell = el('div', 'cell' + (r === R.coreRow ? ' core' : (r < R.coreRow ? ' foe' : ' own')));
        cell.dataset.r = r; cell.dataset.c = c;
        cell.appendChild(el('span', 'coord', cname(r, c)));
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
    const S = U.S; if (!S) return;
    const p = S.players[human], q = S.players[aiSide];
    $('turnChip').innerHTML = `เทิร์น ${p.myTurns}/${q.myTurns} · <b>${S.active === human ? 'ตาคุณ' : 'ตา AI'}</b>` + (S.phase !== 'main' ? ` · ${S.phase}` : '');
    $('turnChip').classList.toggle('mine', S.active === human && !U.busy);

    plate(q, 'Foe', { deck: 'foeDeck', out: 'foeOut', rem: 'foeRem', extra: 'foeExtra', units: 'foeUnits', terr: 'foeTerr', hand: 'foeHand' });
    plate(p, 'Own', { deck: 'ownDeck', out: 'ownOut', rem: 'ownRem', extra: 'ownExtra', units: 'ownUnits', terr: 'ownTerr' });
    coreTrack($('foePts'), q.corePoints); coreTrack($('ownPts'), p.corePoints);
    flarePips($('foeFlare'), q, S.active === aiSide); flarePips($('ownFlare'), p, S.active === human);
    $('foeName').textContent = q.deckName; $('ownName').textContent = p.deckName;
    $('handCount').textContent = `${p.hand.length}/${R.handMax}`;

    /* cells */
    for (let r = 0; r < R.rows; r++) for (let c = 0; c < R.cols; c++) {
      const ce = cellEl(r, c), slot = ce.querySelector('.tkslot'), terr = ce.querySelector('.terr');
      const x = S.cells[r][c];
      ce.className = 'cell' + (r === R.coreRow ? ' core' : (r < R.coreRow ? ' foe' : ' own'));
      if (U.hl.cells.some(k => k.r === r && k.c === c)) ce.classList.add('hl-cell');
      if (U.hl.move.some(k => k.r === r && k.c === c)) ce.classList.add('hl-move');
      slot.innerHTML = ''; terr.innerHTML = '';
      if (x.terrain) {
        const tcd = card(x.terrain.id);
        const ct = COLORS[tcd.color ? tcd.color.toLowerCase() : 'colorless'] || { tone: '#9fb4d8' };
        terr.innerHTML = `<span class="t-chip" style="color:${ct.tone};border-color:${ct.tone}55">▦ ${tcd.name}</span>`;
      }
      const u = x.unit;
      if (u) {
        if (U.hl.targets.includes(u.uid)) ce.classList.add('hl-target');
        if (U.hl.atk.some(k => k.r === r && k.c === c)) ce.classList.add('hl-atk');
        const cd = card(u.id);
        const tk = el('div', 'tk ' + (u.side === human ? 'own' : 'foe') + (u.rested ? ' rested' : '') + (u.arc ? ' arc' : '') +
          (U.sel && U.sel.kind === 'unit' && U.sel.uid === u.uid ? ' sel' : ''));
        tk.style.setProperty('--art', 'url(' + cd.art + ')');
        tk.innerHTML = `<span class="tk-art"></span><span class="tk-cp">${Z.effCp(S, u).toLocaleString()}</span>
          <span class="tk-name" title="${cd.name}">${cd.name}</span>
          <span class="tk-tag">${u.arc ? 'ARC' : cd.type === 'token' ? 'TKN' : (u.fused && u.fused.length ? 'FUSED ' + u.fused.length : '')}</span>
          ${u.dmg ? `<span class="tk-dmg">-${u.dmg.toLocaleString()}</span>` : ''}`;
        slot.appendChild(tk);
      }
    }

    /* hand */
    const hand = $('hand'); hand.innerHTML = '';
    p.hand.forEach((id, i) => {
      const cd = card(id);
      const info = Z.cardPlayable(S, human, i);
      const bad = !info || !info.ok;
      const cinfo = COLORS[cd.color ? cd.color.toLowerCase() : 'colorless'] || { name: cd.color, tone: '#9fb4d8' };
      const n = el('button', 'gcard type-' + cd.type + ' col-' + (cd.color || 'Colorless').toLowerCase() +
        (U.sel && ((U.sel.kind === 'hand' && U.sel.idx === i) || (U.sel.kind === 'command' && U.sel.idx === i)) ? ' sel' : '') +
        (bad || S.active !== human || U.busy || S.pending ? ' dim' : ''));
      n.innerHTML = `<span class="gc-cost"><i>${cd.cost}</i></span>
        <span class="gc-type">${({ unit: 'UNIT', command: 'COMMAND', terrain: 'TERRAIN', token: 'TOKEN', arcanum: 'ARCANUM' })[cd.type] || cd.type}</span>
        <img class="gc-art" loading="lazy" src="${cd.art}" alt="" onerror="this.classList.add('noart')">
        <span class="gc-name">${cd.name}</span>
        ${cd.cp ? `<span class="gc-cp">CP ${cd.cp.toLocaleString()}</span>` : ''}
        <span class="gc-fac" style="color:${cinfo.tone}">${cd.color} · ${cd.tribe || '—'}${cd.protection ? ' · [Protection]' : ''}</span>
        <span class="gc-ab">${(cd.abilities || []).map(a => `<em>${a.kw}</em> ${a.text}`).join('') || ((cd.flags && cd.flags.stride) ? '<em>Move</em> Can move 2 spaces.' : '')}</span>`;
      const ib = el('span', 'gc-info', 'i');
      ib.addEventListener('click', ev => { ev.stopPropagation(); showCard(cd.id); });
      n.title = cd.name + ' · ' + cd.type + ' · Cost ' + cd.cost + (cd.cp ? ' · Power ' + cd.cp.toLocaleString() : '');
      n.appendChild(ib);
      n.addEventListener('click', ev => { ev.stopPropagation(); onHand(i); });
      hand.appendChild(n);
    });

    /* buttons state */
    const selU = U.sel && U.sel.kind === 'unit' ? S.cards[U.sel.uid] : null;
    const hasAct = selU && (card(selU.id).abilities || []).some(a => a.kw === 'Activate');
    $('btnAbility').classList.toggle('hidden', !hasAct);
    $('btnAbility').disabled = !canAct(S, selU);
    $('btnArc').disabled = !Z.arcPlayable(S, human).ok || S.active !== human || U.busy || S.pending;
    $('btnEnd').disabled = S.active !== human || U.busy || !!S.pending;
    $('btnCancel').disabled = !U.sel;
    renderLog();
    renderResponse();
  }

  function canAct(S, u) {
    if (!u || S.active !== human) return false;
    const ab = (card(u.id).abilities || []).find(a => a.kw === 'Activate');
    if (!ab) return false;
    if (ab.once && u.used['act']) return false;
    return !ab.cost || S.players[human].flare >= ab.cost;
  }

  function plate(p, who, ids) {
    $(ids.deck).textContent = p.deck.length;
    $(ids.out).textContent = p.outzone.length;
    $(ids.rem).textContent = p.remove.length;
    $(ids.extra).textContent = p.extra.filter(x => !x.used).length + '/' + R.extraZoneMax;
    $(ids.units).textContent = Z.units(U.S, p.side).length + '/' + R.unitLimit;
    $(ids.terr).textContent = Z.terrains(U.S, p.side).length + '/' + Z.terrainLimit(U.S, p.side);
    if (ids.hand) $(ids.hand).textContent = p.hand.length;
  }
  function coreTrack(node, n) {
    const lab = node.querySelector('.cp-label');
    node.innerHTML = ''; if (lab) node.appendChild(lab);
    for (let i = 0; i < R.corePointsToWin; i++) node.appendChild(el('i', 'pt' + (i < n ? ' on' : '')));
    node.appendChild(el('b', null, n + '/' + R.corePointsToWin));
  }
  function flarePips(node, p, active) {
    node.innerHTML = '';
    for (let i = 0; i < R.flareMax; i++) node.appendChild(el('i', 'fl' + (i < p.flare ? ' on' : '') + (i === R.flareMax - 1 && p.arcFlareReady ? ' arc' : '')));
    node.appendChild(el('b', null, 'FLARE ' + p.flare));
    node.classList.toggle('live', active);
  }

  function renderLog() {
    const S = U.S, lb = $('logBody');
    while (U.logAt < S.log.length) {
      const L = S.log[U.logAt++];
      lb.appendChild(el('div', 'lg ' + L.kind + (L.p && L.p !== human ? ' foe' : ''), `<span>${L.t}</span><em>${L.msg}</em>`));
    }
    if (lb.children.length > 500) lb.removeChild(lb.firstChild);
    lb.scrollTop = lb.scrollHeight;
  }

  /* ------------------------------------------------- response window */
  function renderResponse() {
    const S = U.S, bar = $('guardBar');
    if (!S.pending || S.pending.responder !== human) { bar.classList.add('hidden'); $('guardVeil').classList.add('hidden'); return; }
    const ev = S.pending.ev, actor = S.players[ev.actor], p = S.players[human];
    const desc = { deploy: 'ลงยูนิต', command: 'ใช้ Command', terrain: 'วาง Terrain', move: 'เคลื่อนยูนิต', attack: 'โจมตี', ability: 'ใช้ความสามารถ', summonArc: 'เรียก Arcanum' }[ev.kind] || ev.kind;
    $('guardTitle').innerHTML = `<b>Declaration-Response</b> — ${actor.deckName} ${desc}` +
      (ev.tgt ? ` ใส่ [${card(ev.tgt.id).name}]` : '') + ` · คุณตอบโต้ได้ 1 ครั้ง`;
    const box = $('guardOpts'); box.innerHTML = '';
    S.pending.opts.forEach(i => {
      const cd = card(p.hand[i]);
      const b = el('button', 'guard-opt', `${cd.name} <i>(Flare ${cd.cost})</i> ${(cd.abilities || [])[0] ? (cd.abilities[0].text) : ''}`);
      b.disabled = cd.cost > p.flare;
      b.addEventListener('click', () => doRespond(i));
      box.appendChild(b);
    });
    const pass = el('button', 'guard-opt pass', 'ผ่าน (ไม่ตอบโต้)');
    pass.addEventListener('click', () => doRespond(null));
    box.appendChild(pass);
    bar.classList.remove('hidden'); $('guardVeil').classList.remove('hidden');
  }
  function doRespond(idx) {
    const S = U.S;
    Z.respond(S, idx);
    render();
    if (U.respResolve) { const r = U.respResolve; U.respResolve = null; r(); }
    else if (!S.pending && S.active === aiSide && !U.busy && !S.winner) aiGo();   // resume ถ้า AI หยุดคาก้อนหน้าต่างตอบโต้
  }
  const waitResponse = () => new Promise(res => { U.respResolve = res; });

  /* ------------------------------------------------- AI driver */
  async function aiGo() {
    const S = U.S;
    U.busy = true; clearSel(); render();
    let guard = 0;
    while (S.active === aiSide && !S.winner && guard++ < 30) {
      await sleep(400);
      const r = ZAI.takeTurn(S, aiSide);
      render();
      if (r === 'pending') { await waitResponse(); continue; }
      if (r === 'done') break;
    }
    if (S.active === aiSide && !S.pending && !S.winner) { Z.endTurn(S); }
    U.busy = false; render();
    if (S.winner) maybeOver();
  }

  /* ------------------------------------------------- selection & input */
  function clearSel() { U.sel = null; U.hl = { move: [], atk: [], cells: [], targets: [] }; hint(defaultHint()); }
  const defaultHint = () => !U.S ? '' : (U.S.active !== human ? 'AI กำลังคิด…' : 'แตะการ์ดในมือเพื่อลง · แตะunit ของคุณเพื่อเดินหรือโจมตี');
  const hint = t => { $('hint').textContent = t; };

  function selectUnit(u) {
    U.sel = { kind: 'unit', uid: u.uid };
    U.hl = { move: [], atk: [], cells: [], targets: [] };
    U.hl.move = Z.legalMoveCells(U.S, u);
    U.hl.atk = Z.attackTargets(U.S, u).map(t => ({ r: t.r, c: t.c }));
    U.hl.targets = Z.attackTargets(U.S, u).map(t => t.uid);
    const cd = card(u.id);
    hint(U.hl.atk.length ? `[${cd.name}] แตะช่องแดงเพื่อโจมตี` : (U.hl.move.length ? `[${cd.name}] แตะช่องเขียวเพื่อเดิน (ใช้แล้วจะวางนอน)` : `[${cd.name}] ไม่มีแอ็คเหลือ (วางนอนแล้วหรือติดบล็อก)`));
  }

  function onHand(i) {
    const S = U.S;
    if (S.active !== human || U.busy || S.pending) return;
    if (U.sel && U.sel.kind === 'hand' && U.sel.idx === i) return clearSel(), render();
    const id = S.players[human].hand[i], cd = card(id);
    const info = Z.cardPlayable(S, human, i);
    if (!info || !info.ok) return hint((info && info.why) || 'ลงการ์ดใบนี้ไม่ได้');
    if (cd.type === 'command') {
      const tgt = info.targets || null;
      U.sel = { kind: 'command', idx: i, targets: tgt };
      U.hl = { move: [], atk: [], cells: [], targets: tgt ? tgt.map(t => t.uid) : [] };
      hint(tgt ? `เลือกเป้าหมายของ [${cd.name}]` : `ร่าย [${cd.name}] ?`);
      if (!tgt) { castCommand(i, null); }
      render(); return;
    }
    U.sel = { kind: 'hand', idx: i, type: cd.type };
    U.hl = { move: [], atk: [], cells: info.cells.slice(), targets: [] };
    hint(cd.type === 'terrain' ? `เลือกช่องในแถวหน้าเพื่อวาง [${cd.name}]` : `เลือกช่องว่างในแถวหลังเพื่อลง [${cd.name}]`);
    render();
  }

  function castCommand(i, tgtUid) {
    const S = U.S;
    const res = Z.command(S, human, i, null, tgtUid);
    clearSel(); render();
    if (res && res.awaiting) hint('อีกฝ่ายกำลังพิจารณาตอบโต้…');
    else if (res && !res.ok) hint(res.why);
  }

  async function onCell(r, c) {
    const S = U.S;
    if (S.active !== human || U.busy || S.pending) return;
    const x = S.cells[r][c];
    /* กำลังเลือกตำแหน่งลงการ์ด */
    if (U.sel && U.sel.kind === 'hand') {
      if (!U.hl.cells.some(k => k.r === r && k.c === c)) { hint('ช่องนั้นเลือกไม่ได้'); return; }
      const i = U.sel.idx;
      const res = U.sel.type === 'terrain' ? Z.terrain(S, human, i, { r, c }) : Z.deploy(S, human, i, { r, c });
      clearSel(); render();
      if (res && !res.ok) hint(res.why);
      return;
    }
    /* กำลังเลือกเป้าหมายให้ Command */
    if (U.sel && U.sel.kind === 'command') {
      const t = x.unit;
      if (!t || !U.hl.targets.includes(t.uid)) { hint('ต้องเลือกunit ที่เป็นเป้าหมายของการ์ด'); return; }
      castCommand(U.sel.idx, t.uid);
      return;
    }
    /* เลือกunit / เดิน / โจมตี */
    const u = x.unit;
    if (U.sel && U.sel.kind === 'unit') {
      const me = S.cards[U.sel.uid];
      if (!me) return clearSel(), render();
      if (u && u.side !== human && U.hl.targets.includes(u.uid)) {
        const res = Z.attack(S, human, me.uid, u.uid);
        clearSel(); render();
        if (res && res.awaiting) { await waitResponse(); render(); }
        else if (res && !res.ok) hint(res.why);
        return;
      }
      if (U.hl.move.some(k => k.r === r && k.c === c)) {
        const res = Z.move(S, human, me.uid, { r, c });
        if (res && res.awaiting) { clearSel(); render(); await waitResponse(); render(); return; }
        if (res && res.ok) { const after = S.cards[me.uid]; clearSel(); render(); return; }
        hint(res && res.why ? res.why : 'เดินไม่ได้'); return;
      }
    }
    if (u && u.side === human) { selectUnit(u); render(); return; }
    clearSel(); render();
  }

  /* ------------------------------------------------- Arcanum panel */
  function openArcPanel() {
    const S = U.S, p = S.players[human];
    const info = Z.arcPlayable(S, human);
    if (!info.ok) return hint(info.why);
    const box = $('zvBody'); $('zvTitle').textContent = 'Extra Zone — เรียก Arcanum';
    box.innerHTML = '';
    info.options.forEach(o => {
      const cd = card(o.id);
      const row = el('button', 'zv-row' + (o.withArc || o.payCost ? '' : ' off'),
        `<b>${cd.name}</b><span>CP ${cd.cp.toLocaleString()} · Cost ${cd.cost}</span>
         <em>${o.withArc ? 'ใช้ Arc-Flare (ข้าม Cost, ต้องเป็นแอ็คแรกของเทิร์น)' : o.payCost ? 'จ่าย Flare ' + cd.cost : 'Flare ไม่พอ'}</em>`);
      row.disabled = !(o.withArc || o.payCost);
      row.addEventListener('click', () => {
        $('zoneView').classList.add('hidden');
        U.sel = { kind: 'arc', extraIdx: o.extraIdx, withArc: o.withArc };
        U.hl = { move: [], atk: [], cells: info.cells.slice(), targets: [] };
        hint('เลือกช่องว่างบนสนามเพื่อวาง Arcanum');
        render();
      });
      box.appendChild(row);
    });
    $('zoneView').classList.remove('hidden');
  }

  /* ต่อเคสเลือกช่องให้ Arcanum ใน onCell */
  const _onCell = onCell;
  onCell = async function (r, c) {
    const S = U.S;
    if (S && U.sel && U.sel.kind === 'arc') {
      if (!U.hl.cells.some(k => k.r === r && k.c === c)) return hint('ช่องนั้นวางไม่ได้');
      const s = U.sel;
      const res = Z.summonArc(S, human, s.extraIdx, { r, c }, s.withArc);
      clearSel(); render();
      if (res && res.awaiting) await waitResponse();
      else if (res && !res.ok) hint(res.why);
      render(); return;
    }
    return _onCell(r, c);
  };

  function showCard(id) {
    const cd = card(id);
    $('zvTitle').textContent = cd.name;
    const ci = COLORS[cd.color ? cd.color.toLowerCase() : 'colorless'] || { name: cd.color, tone: '#9fb4d8' };
    $('zvBody').innerHTML = `<div class="card-sheet">
      <img class="cs-art" src="${cd.art}" alt="${cd.name}" loading="lazy">
      <div class="cs-head"><b>${cd.type.toUpperCase()}</b><span style="color:${ci.tone}">${ci.name} · ${cd.tribe || '—'}</span>
        <i class="cs-cost">Cost ${cd.cost}</i>${cd.cp ? `<i class="cs-cp">CP ${cd.cp.toLocaleString()}</i>` : ''}</div>
      <div class="cs-tags">${cd.protection ? '<em>Protection</em>' : ''}${(cd.flags || []).map(f => `<em class="fl">${f}</em>`).join('')}${(cd.cellEffects || []).length ? '<em class="fl">cell effect x' + cd.cellEffects.length + '</em>' : ''}
        <em>Trigger-line: ${(cd.abilities || []).some(a => a.kw === 'Trigger') ? 'มี' : 'ไม่มี'}</em></div>
      ${(cd.abilities || []).map(a => `<div class="cs-ab"><span>${a.kw}${a.when ? ' ⟨' + a.when + '⟩' : ''}</span>
        <em class="st ${a.ops && a.ops.length ? 'ok' : 'partial'}">${a.ops && a.ops.length ? 'engine ต่อผลอัตโนมัติแล้ว (' + a.ops.map(o => o.op).join('+') + ')' : 'แสดงข้อความอย่างเดียว — ผลยังไม่ต่ออัตโนมัติ'}</em>
        <p>${a.text}${a.cost ? ` (cost ${a.cost} Flare)` : ''}${a.once ? ' · [Once per turn]' : ''}</p></div>`).join('') || '<div class="cs-ab"><span>Body</span><p>ไม่มีผลพิเศษ เป็นยูนิตมาตรฐาน</p></div>'}
    </div>`;
    $('zoneView').classList.remove('hidden');
  }

  /* ------------------------------------------------- zone viewer */
  function openZone(side, zone, label) {
    const S = U.S, p = S.players[side];
    const ids = zone === 'extra' ? p.extra.map(e => (e.used ? e.id + (card(e.id) ? '' : '') : e.id)) : p[zone];
    $('zvTitle').textContent = label;
    const box = $('zvBody'); box.innerHTML = '';
    const list = {};
    (zone === 'extra' ? p.extra.map(e => ({ id: e.id, used: e.used })) : (p[zone] || []).map(id => ({ id, used: false }))).forEach(e => {
      const cd = card(e.id); if (!cd) return;
      const k = cd.name + (e.used ? ' (ใช้แล้ว)' : '');
      list[k] = (list[k] || 0) + 1;
    });
    const keys = Object.keys(list);
    box.innerHTML = keys.length ? keys.map(k => `<div class="zv-row"><b>${k}</b><span>×${list[k]}</span></div>`).join('') : '<div class="zv-row off">ว่าง</div>';
    $('zoneView').classList.remove('hidden');
  }

  /* ------------------------------------------------- rulebook / catalog */
  const ASSUMPTIONS = `
    <section><h3>ชุดการ์ดที่ import แล้ว</h3><p>SB01 (22) · SD01 (15) · SD04 (15) — รวม 52 ใบ แสดงผลจริง: ${CARDS.filter(c => c.abilities && c.abilities.length).length} ใบมีการเล่นที่ engine ต่อไว้ / ${CARDS.reduce((a, c) => a + (c.abilities || []).filter(x => (x.ops || []).length).length, 0)} ความสามารถที่มีผลทำงานอัตโนมัติ · Terrain มีผลบนช่อง: ${CARDS.filter(c => c.cellEffects && c.cellEffects.length).length} ใบ · ยังไม่มี Arcanum/Token ใน 3 ชุดนี้</p></section>
    <section class="warn"><h3>ข้อสมมติที่ต้องยืนยัน</h3>
    <p>1) การโจมตีจ่าย <b>1 Flare</b> / การเคลื่อนที่ฟรี (จากตัวอย่าง Lava Stream ที่ว่า "โจมตีได้โดยไม่ใช้ Flare")<br>
    2) เคลื่อนที่ 1 ช่อง/แอ็ค (การ์ดติด <code>stride</code> = 2 ช่อง) และใช้แอ็คได้ 1 ครั้งต่อเทิร์นด้วยการ "วางนอน"<br>
    3) ผู้ที่เริ่มทีหลังไม่จั่วเทิร์นแรก (ตาม rulebook) — ผลทดสอบ AI vs AI ฝ่ายเริ่มก่อนชนะ ~80% ต้องการตัวชดเชยไหม?<br>
    4) ผลแบบ [Counter] ของยูนิตทำงานก่อน [Attack] และ Command ตอบโต้ใช้ Flare ของผู้ตอบโต้<br>
    5) Effect ของอีกฝ่ายทำงานหลังเจ้าของเทิร์นเสมอ และ digital build ให้ resolve อัตโนมัติ (ไม่มีการเลือกลำดับแบบกระดาษ)</p></section>`;

  const RULESUM = () => `
  <h2>Zonefall — สรุปกติกาที่ใช้ในbuildนี้ <small>${R.version} · การ์ดจริง ${CARDS.length} ใบ</small></h2>
  <div class="rb">
    <section><h3>เป้าหมาย</h3><p>สะสม <b>${R.corePointsToWin} Core Point</b> ให้ก่อน — ได้จากจำนวนการ์ดที่คุณควบคุมใน <b>Core Zone (แถว 3)</b> ตอน End Phase ใบละ 1 แต้ม · อีกทางชนะคือให้เด็คศัตรูหมด (จั่วไม่ได้ = แพ้ทันที)</p></section>
    <section><h3>สนาม ${R.rows}×${R.cols}</h3><p>แถว 1 = Back row ของผู้เล่นบน · แถว 2 = Front row · <b>แถว 3 = Core Zone</b> · แถว 4–5 เป็นของผู้เล่นล่าง · ลงยูนิต/Command ได้เฉพาะแถวหลังของตัวเอง, Terrain วางแถวหน้าของตัวเอง, ห้ามรุกล้ำแถวหลังศัตรู</p></section>
    <section><h3>Flare (ทรัพยากร)</h3><p>ต้นเทิร์นได้ Flare = เลขเทิร์นของตัวเอง สูงสุด ${R.flareMax} และไม่สะสมข้ามเทิร์น · ใช้ลงยูนิต/ร่าย Command/วาง Terrain/เรียก Arcanum · เมื่อ Flare ถึง ${R.flareMax} เม็ดที่ 8 เป็น <b>Arc-Flare</b> — ใช้ 1 หน่วยเป็นแอ็คแรกของเทิร์นเพื่อเรียก Arcanum โดยข้าม Cost ทั้งก้อน</p></section>
    <section><h3>การกระทำ (Main Phase)</h3><p>ทำไร่อิสระ ไม่มีการลำดับตายตัว: ลงการ์ด / เดิน / โจมตี / ใช้ Activate / วาง Terrain · ยูนิต 1 ใบใช้แอ็คได้เมื่อ "วางนอน" (1 แอ็คต่อเทิร์น จนกว่าการ์ดจะสั่งให้กลับตั้ง) · จำกัดยูนิตฝ่ายละ ${R.unitLimit} ตัว · Terrain ฝ่ายละ ${R.terrainLimitBase} ใบ (เพิ่มได้จากlimit +1) · Terrain ไม่ใช่กำแพง ยูนิตเดินผ่าน/ยืนทับได้</p></section>
    <section><h3>การเคลื่อนที่</h3><p>ซ้าย/ขวา/หน้า/หลัง, ห้ามเข้าหรือข้ามช่องที่มีunit ฝ่ายเดียวกันหรือศัตรู, Terrain ไม่บล็อก · Arcanum ไม่เคลื่อนที่ไม่โจมตี</p></section>
    <section><h3>การต่อสู้</h3><p>ประกาศโจมตี (จ่าย ${R.attackFlare} Flare ยกเว้นอยู่ในช่อง/Lava Stream หรือใบที่ระบุว่ายิงฟรี) → <b>Declaration-Response</b> (อีกฝ่ายตอบโต้ได้ 1 ครั้ง) → ความสามารถ Counter ของผู้ป้องกัน → ความสามารถ Attack ของผู้โจมตี → <b>วัดค่าพลัง</b>: เอา CP ผู้โจมตีไปลบ CP ผู้ป้องกัน เหลือ 0 = ถูกทำลายส่งไป Outzone · ผู้โจมตีไม่เสีย CP · ค่าพลังรีเซ็ตต้นเทิร์น (Persistent Power / Playtest Ver.2)</p></section>
    <section><h3>Declaration-Response</h3><p>ทุกแอ็คที่ประกาศ สร้างหน้าต่างตอบโต้ 1 ครั้งให้อีกฝ่าย (Command ที่เป็น [Counter] / Quick-Cast เท่านั้น เช่น Null Magic = Cancel ทั้งแอ็ค) · ไม่มีการ chain/สแต็ก · ความสามารถowner ของเทิร์น resolve ก่อนเสมอ</p></section>
    <section><h3>End Phase</h3><p>นับ Core Point จาก Core Zone → อีกฝ่าย <b>Trigger Check</b> 1 ใบ (เปิดใบบนสุดของเด็คขึ้นมือ; ถ้ามี [Trigger] จะทำงานทันที) → Terrain ที่ระบุให้สลายตัวเอง → เช็คนับแต้มครบ ${R.corePointsToWin} → ส่งเทิร์น</p></section>
    <section><h3>โซนอื่น</h3><p>Outzone = การ์ดที่ถูกทำลาย/ใช้แล้ว · Removezone = ออกจากเกม (เช่น มือเกิน ${R.handMax} ใบ) · Extra Zone = Token + Arcanum (ดิจิทัล ${R.extraZoneMax} ใบ, Arcanum ที่ถูกทำลายจะหงายหน้าและใช้ไม่ได้อีก)</p></section>
    <section><h3>การจัดเด็ค</h3><p>${R.deckMin}–${R.deckMax} ใบ, ซ้ำไม่เกิน ${R.maxCopy} ใบ, สีหลักอย่างน้อยครึ่งเด็ค, [Protection] รวมไม่เกิน 6 ใบ, เริ่มต้น 4 ใบ (มูวกันได้ — ในbuildนี้ยังไม่มี)</p></section>
    ${ASSUMPTIONS}
  </div>`;

  const CATALOG = () => {
    const byColor = {};
    CARDS.forEach(c => { const k = c.color || 'Colorless'; (byColor[k] = byColor[k] || []).push(c); });
    return `
    <h2>คาตาล็อกการ์ดจริง <small>${CARDS.length} ใบ · import จากรูปการ์ดของคุณ (โฟลเดอร์ Drive: png card data)</small></h2>
    <div class="rb"><section><h3>ชุดที่นำเข้า</h3><p>SB01 = 22 ใบ · SD01 = 15 ใบ · SD04 = 15 ใบ | ชนิด: Unit ${CARDS.filter(c => c.type === 'unit').length} · Command ${CARDS.filter(c => c.type === 'command').length} · Terrain ${CARDS.filter(c => c.type === 'terrain').length}</p></section></div>
    ${Object.keys(byColor).map(col => `<div class="cat-fac" style="color:${(COLORS[col.toLowerCase()] || {}).tone || '#fff'}">${col} · ${byColor[col].length} ใบ</div>
      <div class="cat">${byColor[col].map(c => `<div class="cat-card col-${col.toLowerCase()}" data-file="${c.file}">
        <img loading="lazy" src="${c.art}" alt="">
        <div><b>${c.name}</b><span class="cat-st">${c.type.toUpperCase()} · Cost ${c.cost}${c.cp ? ' · Power ' + c.cp.toLocaleString() : ''}${c.tribe ? ' · ' + c.tribe : ''}</span></div>
        ${(c.abilities || []).map(a => `<div class="cat-tx"><em>${a.kw}</em> ${a.text}</div>`).join('') || '<div class="cat-tx">—</div>'}
      </div>`).join('')}</div>`).join('')}`;
  };

  const IMPORTDOC = () => `
    <h2>การนำเข้าการ์ด <small>ชุดปัจจุบัน: ${CARDS.length} ใบจากรูปการ์ดจริงที่คุณส่งมา</small></h2>
    <div class="rb">
      <section><h3>ทำไปแล้วอะไรบ้าง</h3>
        <p>ดาวน์โหลดรูปจากโฟลเดอร์ Drive ที่คุณให้มา (SB01-001…022, SD01-001…015, SD04-001…0015) → OCR ทุกใบ → เขียนเป็น <code>js/data.js</code> และบีบรูปเป็น <code>img/&lt;FILE&gt;.jpg</code> แสดงจริงในมือ/บนกระดาน/ชีการ์ด/คาตาล็อก</p>
        <p>ข้อมูลต่อใบ: ชื่อ, ชนิด, Cost, Power, สี, เผ่า (tribe), แท็ก Protection และ <b>ข้อความความสามารถทุกข้อแบบคำต่อคำ</b> จากการ์ด</p></section>

      <section><h3>โครงสร้างข้อมูลที่ engine อ่าน</h3>
<pre>{ id:'sb01001', file:'SB01-001', art:'img/SB01-001.jpg',
  name:'Diomedium, Hero of the Celestial Realm',
  type:'unit'|'command'|'terrain', color:'Yellow',
  tribe:'Deity / Celestial Alliance', cost:9, cp:4000, protection:false,
  flags:['multiTerrain'],            // Sylvan = คุมหลายใบได้
  cellEffects:[{op:'cp',to:'unitInCell',n:1000,mineTurnOnly:true}],   // เฉพาะ Terrain
  abilities:[
    { kw:'Activate', when:'main', cost:1, once:true,
      text:'...(คำต่อคำจากการ์ด)...',
      ops:[{op:'cp',to:'allyFilter',color:'Yellow',n:3000,dur:'turn'},
           {op:'point',n:1}],
      req:[{kind:'outzoneMin',min:12}] },
    { kw:'Trigger', text:'...', ops:[{op:'mill',n:2}] },
  ] }</pre>
        <p><b>ops ที่แปลผลได้:</b> cp · setPower · draw · mill · discard · ready · rest · move(fwd/back/side) · swap · noDestroyBattle · point (อีกฝ่ายเช็คทริกเกอร์ปกติ) · foePoint (ไม่ต่ำกว่า 1) · destroyTerrain · revealAdd · addFromOutzone · playFromOutzone · playHandUnits · outzoneToBottom · shiftCost · ascend (Merge ใต้ใบหลัก) · foeDestroyChoice · banish · cancel · bounce · triggerCheck<br>
        <b>req:</b> colorCount · tribeCount · terrainMin · outzoneMin/Max · flag(commandPlayed / operationPlayed / terrainDestroyed) · notPlayedThisTurn · handCostReduce (ลด Cost ในมือ)</p></section>

      <section><h3>เด็คที่ประกอบให้อัตโนมัติจากชุดของคุณ</h3>
        <p>${Object.keys(DECKS).map(function (k) { const d = DECKS[k]; const c = {}; d.main.forEach(function (i) { const cc = CARD_INDEX[i].color; c[cc] = (c[cc] || 0) + 1; }); return '<b>' + d.name + '</b> — ' + d.main.length + ' ใบ (' + Object.keys(c).map(function (kk) { return kk + ' ' + c[kk]; }).join(', ') + ')'; }).join('<br>')}</p>
        <p>แก้จำนวน/สลับใบได้ที่ <code>DECKS.*.main</code> (กติกาเด็ค: 40–60 ใบ, ซ้ำไม่เกิน 3, สีหลักอย่างน้อยครึ่ง, [Protection] ไม่เกิน 6)</p></section>

      <section><h3>สิ่งที่ยังต้องเติม</h3>
        <p>1) การ์ดที่ยังไม่ต่อผลอัตโนมัติทั้งหมด — engine ทำงานได้แต่บางข้อจะแสดงเป็นข้อความอย่างเดียว (เช่น Merge/Devour แบบมีเงื่อนไขซับซ้อน, การเรียงการ์ดใต้เด็คตามใจ, เป้าหมาย "เลือก 1" ที่ต้องให้ผู้เล่นกดเลือกใน UI บางใบ)<br>
        2) Arcanum / Token ยังไม่มีใน 3 ชุดนี้ → ปุ่ม ✦ เรียกอาร์คานัมจะปิดจนกว่าจะมีชุดที่มี<br>
        3) ส่งโฟลเดอร์/รูปชุดถัดมาหรือ rulebook ที่อัปเดต ผมจะต่อ ops ให้ครบ</p></section>
    </div>`;

  /* ------------------------------------------------- modals + boot */
  function openModal(id) {
    $('veil').classList.remove('hidden');
    ['modalHome', 'modalRules', 'modalOver'].forEach(m => $(m).classList.toggle('hidden', m !== id));
    $('btnModalX').style.display = (id === 'modalHome' && !U.S) ? 'none' : 'grid';
  }
  const closeModal = () => $('veil').classList.add('hidden');

  function newGame() {
    U.S = Z.init({
      p0deck: $('selOwnDeck').value, p1deck: $('selFoeDeck').value,
      p1GoesFirst: $('selFirst').value === 'p1', humanSide: human,
    });
    U.logAt = 0; $('logBody').innerHTML = ''; clearSel(); U.busy = false;
    $('seedTag').textContent = U.S.seed;
    closeModal(); render();
    if (U.S.active !== human) aiGo(); else hint(defaultHint());
  }

  function maybeOver() {
    const S = U.S; if (!S || !S.winner) return;
    const win = S.winner === human;
    const t = JSON.parse(localStorage.getItem('zf_tally') || '{"w":0,"l":0}');
    t[win ? 'w' : 'l']++; localStorage.setItem('zf_tally', JSON.stringify(t));
    $('overTitle').textContent = win ? 'ชนะ — ครบ ' + S.players[human].corePoints + ' Core Point' : 'แพ้ — ' + (S.winner === 'p1' ? 'ศัตรูเก็บแต้มครบก่อน' : 'เด็คคุณหมด');
    $('overTitle').className = win ? 'win' : 'lose';
    $('overDetail').innerHTML = `เกมนี้ ${S.turnNo} เทิร์น · คุณ ${S.players[human].corePoints}/${R.corePointsToWin} · ศัตรู ${S.players[aiSide].corePoints}/${R.corePointsToWin}`;
    openModal('modalOver');
  }

  async function humanEnd() {
    const S = U.S;
    if (S.active !== human || U.busy || S.pending) return;
    clearSel();
    const before = S.turnNo;
    const r = Z.endTurn(S);
    render(); maybeOver();
    if (S.winner) return;
    if (S.active !== human) aiGo();
  }

  function boot() {
    buildBoard();
    const mk = (sel, def) => { sel.innerHTML = ''; Object.keys(DECKS).forEach(k => sel.appendChild(new Option(DECKS[k].name, k))); sel.value = def; };
    mk($('selOwnDeck'), 'sylvan'); mk($('selFoeDeck'), 'machina');
    const t = JSON.parse(localStorage.getItem('zf_tally') || '{"w":0,"l":0}');
    $('btnStart').textContent = `เข้าสนาม (${t.w}ชนะ / ${t.l}แพ้)`;
    $('btnRules').onclick = $('btnRules2').onclick = () => { $('modalRules').innerHTML = RULESUM(); openModal('modalRules'); };
    $('btnCatalog').onclick = () => { $('modalRules').innerHTML = CATALOG(); openModal('modalRules'); };
    $('btnImport').onclick = () => { $('modalRules').innerHTML = IMPORTDOC(); openModal('modalRules'); };
    $('btnModalX').onclick = () => { if (U.S) closeModal(); else openModal('modalHome'); };
    $('veil').addEventListener('click', e => { if (e.target === $('veil') && U.S) closeModal(); });
    $('btnLog').onclick = () => $('logDrawer').classList.toggle('open');
    $('btnLogClose').onclick = () => $('logDrawer').classList.remove('open');
    $('btnMenu').onclick = () => { if (!U.S) return; closeModal(); openModal('modalHome'); };
    $('btnStart').onclick = newGame; $('btnAgain').onclick = newGame;
    $('btnOverLog').onclick = () => { closeModal(); $('logDrawer').classList.add('open'); };
    $('btnEnd').onclick = humanEnd;
    $('btnCancel').onclick = () => { clearSel(); render(); };
    $('btnArc').onclick = openArcPanel;
    $('btnAbility').onclick = () => {
      const S = U.S, u = U.sel && S.cards[U.sel.uid];
      if (!u) return hint('เลือกunit ก่อน');
      const r = Z.ability(S, human, u.uid);
      if (!r.ok) hint(r.why); else { const wasPending = S.pending; clearSel(); render(); if (wasPending) waitResponse(); }
    };
    $('zvClose').onclick = () => $('zoneView').classList.add('hidden');
    [['foeDeck', 'p1', 'deck', 'เด็คศัตรู'], ['foeOut', 'p1', 'outzone', 'Outzone ศัตรู'], ['foeRem', 'p1', 'remove', 'Removezone ศัตรู'], ['foeExtra', 'p1', 'extra', 'Extra ศัตรู'],
     ['ownDeck', 'p0', 'deck', 'เด็คคุณ'], ['ownOut', 'p0', 'outzone', 'Outzone คุณ'], ['ownRem', 'p0', 'remove', 'Removezone คุณ'], ['ownExtra', 'p0', 'extra', 'Extra Zone คุณ']]
      .forEach(([id, side, zone, label]) => { document.getElementById(id).parentElement.onclick = () => openZone(side, zone, label); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { clearSel(); render(); $('zoneView').classList.add('hidden'); } if (e.key === ' ') { e.preventDefault(); humanEnd(); } });
    hint(defaultHint());
    openModal('modalHome');
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  }

  /* hook: ตรวจจบเกมหลังทุกครั้งทีrenderer */
  const _render = render;
  render = function () { _render(); if (U.S && U.S.winner && $('modalOver').classList.contains('hidden') && $('veil').classList.contains('hidden')) maybeOver(); };
  window.__ZF = { U, Z, ZAI, aiGo, render: () => render(), st: () => U.S };
  boot();
})();
