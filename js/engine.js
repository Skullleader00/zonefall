/* ==========================================================================
   ZONEFALL — RULE ENGINE (digital build)
   ตรงตาม Zonefall Rulebook Dev V.24 — ดูหมายเหตุข้อสมมติใน js/data.js (RULES)
   side: p0 = ผู้เล่น (ล่าง), p1 = AI (บน) | cells[5][3] = {terrain, unit}
   ========================================================================== */
const Z = (function () {
  const R = RULES;
  let UID = 1;
  const card = id => CARD_INDEX[id];
  const foe = s => (s === 'p0' ? 'p1' : 'p0');
  const key = (r, c) => r + ',' + c;
  const pk = k => { const a = k.split(','); return { r: +a[0], c: +a[1] }; };
  const inB = (r, c) => r >= 0 && r < R.rows && c >= 0 && c < R.cols;
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const cloneDay = o => JSON.parse(JSON.stringify(o));

  /* ด้านไหนคือ "หน้า" ของแต่ละฝ่าย (มุ่งเข้า Core Zone) */
  const fwd = s => (s === 'p0' ? -1 : 1);
  const rowOwner = r => (r < R.coreRow ? 'p1' : (r > R.coreRow ? 'p0' : null));
  const canStand = (side, r) => r !== R.backRow[foe(side)];        // รุกล้ำแถวหลังศัตรูไม่ได้

  function log(S, msg, kind) { S.log.push({ t: S.turnNo, p: S.active, msg, kind: kind || 'info' }); }

  /* ---------------------------------------------------------------- state */
  function cell(S, r, c) { return (r >= 0 && r < R.rows && c >= 0 && c < R.cols) ? S.cells[r][c] : null; }
  function unitAt(S, r, c) { const x = cell(S, r, c); return x ? x.unit : null; }
  function units(S, side) {
    const out = [];
    for (let r = 0; r < R.rows; r++) for (let c = 0; c < R.cols; c++) {
      const u = S.cells[r][c].unit; if (u && (!side || u.side === side)) out.push(u);
    }
    return out;
  }
  const terrains = (S, side) => {
    const out = [];
    for (let r = 0; r < R.rows; r++) for (let c = 0; c < R.cols; c++) {
      const t = S.cells[r][c] && S.cells[r][c].terrain; if (t && (!side || t.side === side)) out.push(t);
    }
    return out;
  };
  const unitCount = (S, side) => units(S, side).length;

  /* modifiers / effective CP */
  /* flags บนการ์ดจริงเป็น array ของชื่อ → ใช้ hasFlag() */
  const hasFlag = (cd, name) => Array.isArray(cd && cd.flags) ? cd.flags.indexOf(name) >= 0 : !!(cd && cd.flags && cd.flags[name]);
  const flg = u => card(u.id) || {};
  function cellFx(S, r, c) {
    const x = cell(S, r, c); const t = x ? x.terrain : null;
    return (t && card(t.id).cellEffects) ? card(t.id).cellEffects : [];
  }
  function cellCpBonus(S, u) {
    let n = 0;
    const t = cell(S, u.r, u.c) && cell(S, u.r, u.c).terrain;
    if (t) {
      const st = staticOf(card(t.id), 'cell');
      if (st && st.cp && (!st.color || card(u.id).color === st.color) && u.side === S.active) n += st.cp;
    }
    cellFx(S, u.r, u.c).forEach(e => {
      if (!e || e.op !== 'cp' || e.to !== 'unitInCell') return;
      if (e.color && card(u.id).color !== e.color) return;
      if (e.mineTurnOnly && u.side !== S.active) return;
      n += e.n || 0;
    });
    return n;
  }

  function effCp(S, u) {
    const cd = card(u.id); if (!cd) return 0;
    let base = (u.setPowerBase != null ? u.setPowerBase : (cd.cp || 0));
    const ws = staticOf(cd, 'witchSetPower');
    if (ws && (cd.tribe || '').includes('Witch')) {
      const n = units(S, u.side).filter(x => (card(x.id).tribe || '').includes('Witch')).length;
      if (n === (ws.count || 1)) base = ws.value;
    }
    let v = base + (u.permCp || 0) + (u.buffCp || 0) + (u.battleCp || 0) - (u.dmg || 0);
    v += cellCpBonus(S, u);
    if (u.fused && u.fused.length) {
      const per = (cd.abilities || []).reduce((a, ab) => a + ((ab.ops || []).find(o => o && o.cpPerFused) || {}).cpPerFused || 0, 0);
      v += per * u.fused.length;
    }
    return Math.max(0, v);
  }
  const canFreeAttack = (S, u) => cellFx(S, u.r, u.c).some(e => e && e.op === 'freeAttack') || hasFlag(card(u.id), 'freeAttack');

  function flareOf(S, side) { return S.players[side].flare; }
  function pay(S, side, n) { S.players[side].flare -= n; }
  const terrainLimit = (S, side) => R.terrainLimitBase + terrains(S, side).reduce((a, t) => a + (hasFlag(card(t.id), 'terrainLimit') ? 1 : 0), 0);
  const isMultiTerrain = t => hasFlag(card(t.id), 'multiTerrain');
  /* โควตา Terrain นับเฉพาะใบที่ไม่ใช่ multiTerrain (ตามข้อความ “You can control multiple Sylvan Terrains”) */
  function terrainOverLimit(S, side, newCardId) {
    if (newCardId && hasFlag(card(newCardId), 'multiTerrain')) return 0;
    return Math.max(0, terrains(S, side).filter(t => !isMultiTerrain(t)).length - terrainLimit(S, side));
  }

  /* --------------------------------------------------------------- setup */
  function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function init(opts) {
    opts = opts || {};
    UID = 1;
    const seed = opts.seed || Math.floor(Math.random() * 1e9);
    const rng = mulberry32(seed);
    const S = {
      seed, turnNo: 0, active: 'p0', phase: 'main', cells: [], cards: {}, log: [], pending: null,
      winner: null, humanSide: opts.humanSide || 'p0', first: opts.p1GoesFirst ? 'p1' : 'p0',
      fxq: [], uiAsk: null, reveal: null, seq: 0,
      arcFlareUsedType: {}, turnActions: 0, rngFn: rng, players: {},
    };
    for (let r = 0; r < R.rows; r++) { S.cells.push([]); for (let c = 0; c < R.cols; c++) S.cells[r].push({ terrain: null, unit: null }); }
    ['p0', 'p1'].forEach(side => {
      const dk = side === 'p0' ? (opts.p0deck || 'sylvan') : (opts.p1deck || 'machina');
      const D = DECKS[dk] || DECKS[Object.keys(DECKS)[0]];
      S.players[side] = {
        side, deckKey: dk, deckName: D.name, faction: D.color,
        deck: shuffle(D.main.slice(), rng), hand: [], outzone: [], remove: [],
        stats: { terrainDestroyed: 0, commandPlayed: 0, operationPlayed: 0, pointsGained: 0, readyByEffect: 0, playedByUnitEffect: 0 },
        extra: shuffle((D.extra || []).slice(), rng).map(id => ({ id, used: false })),
        flare: 0, myTurns: 0, corePoints: 0, arcFlareReady: false,
      };
    });
    ['p0', 'p1'].forEach(side => { for (let i = 0; i < R.handStart; i++) draw(S, side); });
    S.active = S.first;
    startTurn(S);
    return S;
  }

  function roll(S, n) { return Math.floor(S.rngFn() * n); }

  function draw(S, side, n) {
    n = n || 1;
    const p = S.players[side];
    for (let i = 0; i < n; i++) {
      if (!p.deck.length) { log(S, `${p.deckName} จั่วไม่ได้อย่างทันที — พ่ายแพ้`, 'bad'); S.winner = foe(side); return; }
      const id = p.deck.shift();
      if (p.hand.length >= R.handMax) { p.remove.push(id); log(S, `มือเกิน ${R.handMax} — [${card(id).name}] ออกจากเกม (Removezone)`, 'bad'); }
      else p.hand.push(id);
    }
  }

  /* เปิดการ์ดจากยอดสมุด N ใบ (เก็บไว้ใน S.reveal เพื่อแสดงหน้าต่าง) */
  function revealTop(S, side, n, reason) {
    const p2 = S.players[side];
    const ids = [];
    for (let k = 0; k < (n || 1); k++) { if (!p2.deck.length) break; ids.push(p2.deck.shift()); }
    S.reveal = { side, ids, reason: reason || 'เปิดดู', at: S.turnNo };
    fxq(S, { t: 'reveal', side, ids, reason: reason || 'เปิดดู' });
    if (ids.length) log(S, `  ▹ เปิดดู ${ids.length} ใบบนสมุด (${reason || ''}): ${ids.map(i => card(i).name).join(' / ')}`, 'info');
    else log(S, '  ▹ สมุดหมด — เปิดดูไม่ได้', 'dim');
    return ids;
  }
  function restToBottom(S, side, ids) {
    const p2 = S.players[side];
    (ids || []).forEach(id => { const i = p2.deck.indexOf(id); if (i < 0) { const j = p2.hand.indexOf(id); if (j >= 0) p2.hand.splice(j, 1); } });
    p2.deck.push.apply(p2.deck, ids || []);
  }
  function toHand(S, side, id) {
    const p2 = S.players[side];
    if (!id) return;
    if (p2.hand.length >= R.handMax) { p2.remove.push(id); log(S, `  ↳ มือเต็ม ${R.handMax} — [${card(id).name}] ออกจากเกม (Removezone)`, 'bad'); }
    else p2.hand.push(id);
  }

  function mill(S, side, n) {
    const p = S.players[side];
    if (n === 1) {                                   /* Sylvan Mystery: Mill 1 → Mill 2 */
      const t = terrains(S, side);
      if (t.some(x => (staticOf(card(x.id), 'millDoubles') || {}).fromTerrains && t.length >= staticOf(card(x.id), 'millDoubles').fromTerrains)) n = 2;
    }
    for (let i = 0; i < n; i++) { if (!p.deck.length) break; p.outzone.push(p.deck.shift()); }
    log(S, `Mill ${n} → Outzone (${p.deckName})`, 'dim');
  }

  function makeCard(S, id, side, r, c, type) {
    const o = { uid: 'u' + (UID++), id, side, r, c, rested: false, dmg: 0, buffCp: 0, battleCp: 0, fused: [], used: {}, deployTurn: S.turnNo };
    S.cards[o.uid] = o;
    S.cells[r][c][type] = o;
    return o;
  }

  function leaveField(S, o, zone) {                       // 'outzone' | 'remove' | 'hand' | 'extra'
    const t = cell(S, o.r, o.c);
    if (t) { if (t.unit === o) t.unit = null; if (t.terrain === o) t.terrain = null; }
    const p = S.players[o.side];
    if (zone === 'hand') p.hand.push(o.id);
    else if (zone === 'extra') { const e = p.extra.find(x => x.id === o.id && !x.used); if (e) e.used = true; else p.extra.push({ id: o.id, used: true }); }
    else p[zone === 'remove' ? 'remove' : 'outzone'].push(o.id);
    delete S.cards[o.uid];
  }
  const destroyTo = (S, o, verb) => {
    const cd = card(o.id);
    fxq(S, { t: 'destroy', uid: o.uid, side: o.side, cardId: o.id });
    if (o === S.cards[o.uid] && cd.type === 'unit') hook('unitDied', S, { side: o.side, uid: o.uid, cardId: o.id, color: cd.color });
    if (cd.type === 'arcanum') { leaveField(S, o, 'extra'); log(S, `${verb} [${cd.name}] → Extra Zone (หงายหน้า, ใช้ไม่ได้อีก)`, 'bad'); }
    else { if (hasFlag(cd, 'token')) { leaveField(S, o, 'extra'); log(S, `${verb} [${cd.name}] → Extra Zone (Token)`, 'bad'); } else { leaveField(S, o, 'outzone'); log(S, `${verb} [${cd.name}] → Outzone`, 'bad'); } }
    (o.fused || []).forEach(fid => leaveField(S, S.cards[fid] || { id: fid, side: o.side, r: 9, c: 9 }, 'outzone'));
  };

  /* ------------------------------------------------------------ turn flow */
  function startTurn(S) {
    S.turnNo++; S.phase = 'draw'; S.turnActions = 0; S.pending = null;
    S.active = S.turnNo % 2 === 1 ? S.first : foe(S.first);
    const side = S.active, p = S.players[side];
    p.myTurns++;
    p.stats = { terrainDestroyed: 0, commandPlayed: 0, operationPlayed: 0, pointsGained: 0, readyByEffect: 0, playedByUnitEffect: 0 };
    p.flare = Math.min(R.flareMax, (R.flareStart || 1) + p.myTurns - 1);
    p.arcFlareReady = R.arcanum !== false && p.flare >= R.flareMax;
    /* รีเซ็ตสถานะทั้งสนาม: ค่าพลังกลับเป็นพื้นฐาน (rulebook: รีเซ็ตเมื่อเริ่มเทิร์นใหม่) */
    units(S).forEach(u => { u.rested = false; u.dmg = 0; u.battleCp = 0; u.buffCp = 0; u.used = {}; u.noDestroyBattle = false; u.setPowerBase = null; });
    const skipFirstDraw = R.secondPlayerNoFirstDraw && p.myTurns === 1 && side !== S.first;
    if (skipFirstDraw) log(S, `${p.deckName} (ฝ่ายเริ่มทีหลัง) ไม่จั่วในเทิร์นแรก`, 'dim');
    else draw(S, side);
    log(S, `— เทิร์น ${p.myTurns} (${S.turnNo}) ของ ${p.deckName} · Flare ${p.flare} —`, 'turn');
    S.phase = 'main';
    runUpkeep(S, side);
    if (S.winner) return S;
    return S;
  }

  function endTurn(S) {
    S.phase = 'end';
    const side = S.active, p = S.players[side];
    /* ---- End Phase ตามลำดับของ rulebook ---- */
    const coreMine = units(S, side).filter(u => u.r === R.coreRow);
    if (coreMine.length) {
      p.corePoints += coreMine.length;
      log(S, `◆ Core Zone: ${coreMine.length} ใบ → +${coreMine.length} Core Point (รวม ${p.corePoints}/${R.corePointsToWin})`, 'good');
      triggerCheck(S, foe(side));               // ได้หลายแต้มก็เปิดเช็คได้แค่ 1 ใบ (ตาม rulebook)
    }
    /* Terrain ที่ทำลายตัวเองตอนเอนเฟส */
    terrains(S, side).forEach(t => {
      const fl = card(t.id).flags || {};
      if (fl.selfDestructWithUnit && S.cells[t.r][t.c].unit) destroyTo(S, t, 'End Phase — Terrainสลาย');
    });
    if (p.corePoints >= R.corePointsToWin) { S.winner = side; log(S, `ครบ ${R.corePointsToWin} Core Point — ${p.deckName} ชนะ`, 'good'); return S; }
    if (!p.deck.length) { S.winner = foe(side); log(S, `${p.deckName} เด็คหมด — แพ้ทันที`, 'bad'); return S; }
    startTurn(S);
    return S;
  }

  /* Trigger Check: เปิดใบบนสุดโชว์ก่อน (มีแอนิเมชัน) — ถ้ามี [Trigger] เจ้าของเลือกได้ว่าใช่เอฟเฟกต์หรือไม่
     ถ้าไม่ใช้ (หรือไม่มีเอฟเฟกต์) การ์ดขึ้นมือตามปกติ */
  function triggerCheck(S, side) {
    const p = S.players[side];
    if (!p.deck.length) { log(S, `⟐ Trigger Check — สมุดว่าง (${p.deckName})`, 'dim'); return; }
    const id = p.deck.shift();
    const cd = card(id);
    const trig = (cd.abilities || []).filter(a => a.kw === 'Trigger');
    S.reveal = { side, ids: [id], reason: 'Trigger Check', at: S.turnNo };
    fxq(S, { t: 'trigger', side, cardId: id, hasAbility: trig.length > 0 });
    log(S, `⟐ Trigger Check (${p.deckName}): [${cd.name}]`, trig.length ? 'good' : 'info');
    const useIt = () => {
      fxq(S, { t: 'effectCard', side, cardId: id });
      trig.forEach(a => { fx(S, { side, uid: null, cardId: id }, a.ops || [], { triggerCard: id, cardId: id }); });
      const k = p.hand.indexOf(id); if (k >= 0) p.hand.splice(k, 1);
      const used = (p.hand.indexOf(id) < 0);
      if (trig.some(a => (a.ops || []).some(o => o.op === 'banish'))) { p.remove.push(id); log(S, `  ↳ ใช้ [→ Removezone`, 'dim'); }
      else { p.outzone.push(id); log(S, `  ↳ ใช้ [${cd.name}] → Outzone`, 'dim'); }
      void used;
    };
    const keepIt = () => { toHand(S, side, id); if (trig.length) log(S, `  ↳ ไม่ใช้เอฟเฟกต์ — [${cd.name}] ขึ้นมือ`, 'dim'); };
    if (!trig.length) { keepIt(); return; }
    if (!isHuman(S, side)) { const go = S.aiTrigger ? S.aiTrigger(S, side, id, trig) : true; if (go) useIt(); else keepIt(); return; }
    S.uiAsk = {
      kind: 'triggerUse', title: 'Trigger Check — ใช้เอฟเฟกต์ของการ์ดใบนี้?', cardIds: [id], side,
      abilityText: trig.map(a => a.text).join(' / '),
      resume: v => { if (v === 'use' || v === true) useIt(); else keepIt(); },
    };
    fxq(S, { t: 'ask', kind: 'triggerUse' });
  }

  /* ========================================================== ผลของความสามารถ (ops) */
  function pickTargets(S, src, spec) {
    const side = src.side;
    switch (spec.to) {
      case 'self': return src.uid ? [S.cards[src.uid]].filter(Boolean) : [];
      case 'target': return src.tgt ? [src.tgt] : [];
      case 'allyUnits': return units(S, side);
      case 'foeUnits': return units(S, foe(side));
      case 'foeCoreUnits': return units(S, foe(side)).filter(u => u.r === R.coreRow);
      case 'allyTag': return units(S, side).filter(u => (card(u.id).tag || []).includes(spec.tag));
      case 'deployer': return null;
      default: return [];
    }
  }

  /* ---------- คิวแอนิเมชัน (UI เล่นผ่าน drainFx) ---------- */
  function fxq(S, ev) { (S.fxq = S.fxq || []).push(Object.assign({ id: ++S.seq }, ev)); }
  function drainFx(S) { const q = S.fxq || []; S.fxq = []; return q; }

  /* ---------- ระบบ "ขอให้เลือก": เป้าหมาย / เปิดสมุด / ทิ้งการ์ด / Outzone / ทริกเกอร์ ---------- */
  const isHuman = (S, side) => side === S.humanSide;
  function ask(S, spec) {
    const decider = spec.bySide || spec.side;
    if (!isHuman(S, decider)) {                     // ฝั่ง AI ให้เลือกอัตโนมัติ
      const v = spec.auto ? spec.auto(S) : null;
      spec.resume(v);
      return { auto: true };
    }
    S.uiAsk = spec;
    fxq(S, { t: 'ask', kind: spec.kind });
    return { paused: true };
  }
  function pauseOp(S, src, op, ctx, ops, i, spec) {
    /* spec.replay = op เดิมต้องทำงานซ้ำหลังได้เป้าหมาย (เช่น op ที่ to:'target')
       ไม่งั้นถือว่าการเลือกครั้งนี้คือ “ข้อมูลของผล” → ไป op ถัดไป */
    spec.resume = v => {
      if (spec.onPick) spec.onPick(v);
      const canReplay = spec.replay && v != null && (src.tgt || src.tgts || src.pick);
      runOps(S, src, ops, ctx, canReplay ? i : i + 1);
    };
    const r = ask(S, spec);
    if (r.paused) ctx.__pause = true;
    return r;
  }
  function answer(S, value) {
    const a = S.uiAsk; if (!a) return { ok: false, why: 'ไม่มีสิ่งที่รอคำตัดสิน' };
    S.uiAsk = null;
    try { a.resume(value); } catch (e) { log(S, '  ↳ ผลของความสามารถขัดข้อง: ' + e.message, 'bad'); }
    return { ok: true };
  }
  function candidatesFor(S, src, op) {
    const side = src.side;
    const filt = l => l.filter(u => !staticOf(card(u.id), 'untargetable') || u.side === side);
    /* ขอบเขตเป้าหมายอ่านจาก op.to / op.zone / op.scope ก่อน แล้วค่อยเดาจาก hint */
    const key = String(op.to || op.zone || op.scope || '');
    const wantsFoe = /^(foe|enemy|opponent)/i.test(key) || /enemy|opponent|foe|ศัตรู|ตรงข้าม/i.test(op.hint || '') || /ศัตรู|ตรงข้าม|ของอีกฝ่าย/.test(op.prompt || '');
    const wantsAny = /^all/i.test(key) || key === 'any';
    const scope = /BackRow|FrontRow|Core|Units?|All|Row/i.test(key) || wantsFoe || wantsAny ? key : (wantsFoe ? 'enemy' : (op.scope || (/enemy|opponent/i.test(op.hint || '') ? 'enemy' : 'own')));
    let list;
    if (/foe|enemy|opponent/i.test(scope)) list = units(S, foe(side));
    else if (/^all|any/i.test(scope)) list = units(S);
    else list = units(S, side);
    /* แถว = เทียบกับ “ของฝ่ายนั้น ๆ” (แถวหลังของศัตรูไม่ equals แถวหลังเรา) */
    const rowKey = /back|front|core/i.test(scope) ? scope : String(op.row || '');
    if (/back/i.test(rowKey)) list = list.filter(u => u.r === R.backRow[u.side]);
    if (/front/i.test(rowKey)) list = list.filter(u => u.r === R.frontRow[u.side]);
    if (/core/i.test(rowKey)) list = list.filter(u => u.r === R.coreRow);
    if (op.color) list = list.filter(u => card(u.id).color === op.color);
    if (op.tribe) list = list.filter(u => (card(u.id).tribe || '').toLowerCase().includes(String(op.tribe).toLowerCase()));
    if (op.cpMax != null) list = list.filter(u => effCp(S, u) <= op.cpMax);
    if (op.cpMin != null) list = list.filter(u => effCp(S, u) >= op.cpMin);
    if (op.notSelf && src.uid) list = list.filter(u => u.uid !== src.uid);
    if (op.column && src.uid) { const me = S.cards[src.uid]; if (me) list = list.filter(u => u.c === me.c); }
    return filt(list);
  }
  const bestBy = (S, list, mode) => list.slice().sort((a, b) => mode === 'low' ? effCp(S, a) - effCp(S, b) : effCp(S, b) - effCp(S, a))[0];

  function fx(S, src, ops, ctx) {
    ctx = ctx || {};
    return runOps(S, src, ops || [], ctx, 0);
  }
  function runOps(S, src, ops, ctx, i) {
    for (; i < ops.length; i++) {
      applyOp(S, src, ops[i], ctx, ops, i);
      if (ctx.__pause) { ctx.__pause = false; return { paused: true }; }
      if (ctx.__stop) return { stopped: true };
    }
    return { done: true };
  }
  function applyOp(S, src, op, ctx, ops, i) {
    const side = src.side;
    const who = () => (ctx.toOverride === 'foe' ? foe(side) : side);
    let cancelled = false;
    const targetOps = { cp: 1, destroy: 1, bounce: 1, move: 1, ready: 1, rest: 1, noDestroyBattle: 1, setPower: 1, damage: 1 };
    if (op.to === 'target' && !src.tgt && targetOps[op.op]) {
      const cands = candidatesFor(S, src, op);
      if (!cands.length) { log(S, '  ↳ ไม่มีเป้าหมายที่ถูกต้อง — ข้ามผลส่วนนี้', 'dim'); return; }
      const hostile = op.op === 'destroy' || op.op === 'bounce' || (op.op === 'move' && op.hostile) || (typeof op.n === 'number' && op.n < 0 && op.op === 'cp');
      pauseOp(S, src, op, ctx, ops, i, {
        kind: 'target', title: op.prompt || (hostile ? 'เลือกเป้าหมายของผลนี้' : 'เลือดยูนิตผู้รับผล'),
        sub: op.hint || '', uids: cands.map(u => u.uid), allowSkip: true, side, replay: true,
        auto: () => { const b = hostile ? bestBy(S, cands, 'high') : bestBy(S, cands, op.n < 0 ? 'low' : 'high'); return b && b.uid; },
        onPick: v => { src.tgt = v ? (S.cards[v] || null) : null; },
      });
      return;
    }
    switch (op.op) {
        case 'cp': {
          const arr = op.to === 'deployer' ? (ctx.units || []) : pickTargets(S, src, op);
          fxq(S, { t: 'buff', side, n: op.n, uids: arr.map(x => x && x.uid).filter(Boolean) });
          arr.forEach(u => {
            if (!u) return;
            if (op.dur === 'battle') u.battleCp = (u.battleCp || 0) + op.n;
            else if (op.dur === 'perm') u.permCp = (u.permCp || 0) + op.n;
            else u.buffCp = (u.buffCp || 0) + op.n;
          });
          log(S, `  ↳ ผลจาก [${src.uid && S.cards[src.uid] ? card(S.cards[src.uid].id).name : (card(ctx.cardId||'')||{}).name || 'ความสามารถ'}] CP ${op.n > 0 ? '+' : ''}${op.n} (${op.dur || 'turn'})`, 'good');
          break;
        }
        case 'draw': draw(S, op.to === 'foe' ? foe(side) : side, op.n); fxq(S, { t: 'draw', side: op.to === 'foe' ? foe(side) : side, n: op.n || 1 }); break;
        case 'discard': {
          const p2 = S.players[src.side], need = op.n || 1;
          const doDiscard = (picked) => {
            let cnt = 0;
            (picked || []).forEach(idz => { const i2 = p2.hand.indexOf(idz); if (i2 >= 0) { p2.hand.splice(i2, 1); p2.outzone.push(idz); cnt++; } });
            if (cnt) { fxq(S, { t: 'discard', side: src.side, n: cnt }); log(S, `  ↳ ทิ้ง ${cnt} ใบจากมือ → Outzone`, 'dim'); }
          };
          if (!p2.hand.length) break;
          if (!isHuman(S, src.side)) { doDiscard(p2.hand.slice(0, Math.min(need, p2.hand.length))); break; }
          ctx.__pause = true;
          pauseOp(S, src, op, ctx, ops, i, {
            kind: 'hand', title: op.prompt || (`ทิ้งการ์ด ${need} ใบจากมือ`), sub: op.upTo ? 'จะทิ้งกี่ใบก็ได้ (ไม่เกิน)' : '',
            cardIds: p2.hand.slice(), need, allowSkip: !!op.upTo, side: src.side,
            auto: () => p2.hand.slice(0, need), onPick: v => doDiscard(Array.isArray(v) ? v : (v ? [v] : [])),
          });
          break;
        }
        case 'mill': mill(S, ctx.deployerSide || side, op.n); fxq(S, { t: 'mill', side: ctx.deployerSide || side, n: op.n || 1 }); break;

        case 'flare': S.players[side].flare = Math.min(99, S.players[side].flare + op.n); fxq(S, { t: 'flare', side, n: op.n }); break;
        case 'core': {
          const t = op.to === 'foe' ? foe(side) : side;
          S.players[t].corePoints = Math.max(0, S.players[t].corePoints + op.n);
          log(S, `  ↳ Core Point ของ ${S.players[t].deckName} ${op.n > 0 ? '+' : ''}${op.n} (รวม ${S.players[t].corePoints})`, op.n > 0 ? 'good' : 'bad');
          break;
        }
        case 'destroy': {
          const t = src.tgt;
          if (t && (!op.cpMax || effCp(S, t) <= op.cpMax)) { destroyTo(S, t, 'ผลความสามารถ —'); }
          else if (t) log(S, `  ↳ เป้ามี CP สูงกว่าเงื่อนไข — ไม่เกิดผล`, 'dim');
          break;
        }
        case 'damage': {
          pickTargets(S, src, op).forEach(u => {
            u.dmg = (u.dmg || 0) + op.n;
            if (effCp(S, u) <= 0) destroyTo(S, u, 'ผลความสามารถ —');
            else log(S, `  ↳ [${card(u.id).name}] เสีย ${op.n} CP (เหลือ ${effCp(S, u)})`, 'bad');
          });
          break;
        }
        case 'bounce': {
          const t = src.tgt;
          if (!t) break;
          if ((card(t.id).flags || {}).anchor && t.side !== side) { log(S, `  ↳ [${card(t.id).name}] มี anchor — ถูกเคลื่อนที่ย้ายไม่ได้`, 'dim'); break; }
          leaveField(S, t, 'hand'); log(S, `  ↳ [${card(t.id).name}] กลับขึ้นมือเจ้าของ`, 'info');
          break;
        }
        case 'cancel': cancelled = true; ctx.cancelled = true; ctx.__stop = true; log(S, `  ⟲ Action ถูกระงับ (Cancel)`, 'good'); break;
        case 'summon': {
          const free = backEmpty(S, side);
          if (!free) { log(S, `  ↳ ไม่มีช่องว่างในแถวหลัง — Summon ไม่เกิดผล`, 'dim'); break; }
          makeCard(S, op.card, side, free.r, free.c, 'unit');
          log(S, `  ⛬ Summon [${card(op.card).name}] → ${free.r + 1}-${free.c + 1}`, 'play');
          break;
        }
        case 'autoCore': {
          const u = src.uid ? S.cards[src.uid] : null; if (!u) break;
          const spot = [0, 1, 2].map(c => ({ r: R.coreRow, c })).find(p => !S.cells[p.r][p.c].unit && canStand(side, p.r));
          if (spot) { S.cells[u.r][u.c].unit = null; u.r = spot.r; u.c = spot.c; S.cells[u.r][u.c].unit = u; log(S, `  ↳ [${card(u.id).name}] เข้า Core Zone ทันที`, 'good'); }
          break;
        }
        case 'triggerCheck': triggerCheck(S, op.to === 'foe' ? foe(side) : side); break;
        case 'toOutzone': if (src.uid) leaveField(S, S.cards[src.uid], 'outzone'); break;

        case 'ready': case 'rest': {
          const list = targetSet(S, src, op.to, op);
          list.forEach(u => {
            if (!u) return;
            const was = u.rested; u.rested = (op.op === 'rest');
            if (op.op === 'ready' && was) S.players[u.side].stats.readyByEffect++;
            fxq(S, { t: op.op === 'ready' ? 'ready' : 'rest', uid: u.uid });
            log(S, `  ↳ ${op.op === 'ready' ? 'ตั้ง (Ready)' : 'วางนอน (Rest)'} [${card(u.id).name}]`, 'good');
          });
          break;
        }
        case 'move': {
          targetSet(S, src, op.to, op).forEach(u => execStepMove(S, u, op.dir, op.n || 1));
          break;
        }
        case 'swap': {
          const a = src.uid && S.cards[src.uid], bb = src.tgt;
          if (a && bb) {
            const t = { r: a.r, c: a.c }; S.cells[a.r][a.c].unit = bb; S.cells[bb.r][bb.c].unit = a;
            bb.r = t.r; bb.c = t.c; log(S, `  ⇄ สลับตำแหน่ง [${card(a.id).name}] ↔ [${card(bb.id).name}]`, 'move');
          }
          break;
        }
        case 'noDestroyBattle': targetSet(S, src, op.to, op).forEach(u => { if (u) { u.noDestroyBattle = true; log(S, `  🛡 [${card(u.id).name}] ไม่ถูกทำลายจากการต่อสู้เทิร์นนี้`, 'guard'); } }); break;
        case 'point': {
          const to = op.to === 'foe' ? foe(src.side) : src.side;
          S.players[to].corePoints += op.n; S.players[to].stats.pointsGained += op.n;
          const who = src.uid && S.cards[src.uid] ? card(S.cards[src.uid].id).name : (card(src.cardId || '') || {}).name || 'ผลAbility';
          fxq(S, { t: 'point', side: to, n: op.n, total: S.players[to].corePoints });
          log(S, `◆ [${who}] → +${op.n} Point ให้ ${S.players[to].deckName} (รวม ${S.players[to].corePoints}/${R.corePointsToWin})`, 'good');
          if (S.players[to].corePoints >= R.corePointsToWin) { S.winner = to; log(S, `ครบ ${R.corePointsToWin} Point — ${S.players[to].deckName} ชนะ`, 'good'); }
          else triggerCheck(S, foe(to));
          break;
        }
        case 'foePoint': {
          const t = foe(src.side), p2 = S.players[t];
          p2.corePoints = Math.max(op.floor != null ? op.floor : 0, p2.corePoints + op.n);
          log(S, `  ↳ ${p2.deckName} เสีย Point → เหลือ ${p2.corePoints}`, 'bad');
          break;
        }
        case 'destroyTerrain': {
          const list = op.scope === 'all' ? units(S).filter(x => x.terrain) : terrains(S, src.side);
          const take = op.scope === 'mine1' ? list.slice(0, 1) : op.scope === 'mineAll' ? list : list;
          take.forEach(t => { if (op.scope === 'all' && t.terrain) destroyTerrainAt(S, t.r, t.c); else destroyTerrainObj(S, t); });
          break;
        }
        case 'revealAdd': {
          const p2 = S.players[src.side];
          const n = op.n === -1 ? Math.max(1, units(S, src.side).filter(u => card(u.id).color === 'Blue' || (card(u.id).tribe || '').toLowerCase().includes('adventurer')).length) : (op.n || 1);
          const ids = revealTop(S, src.side, n, op.prompt || 'เปิดดูสมุด');
          const ok = ids.filter(id => matchFilter(S, id, op.filter) && (op.maxCost == null || (card(id).cost || 0) <= op.maxCost) && (op.minCost == null || (card(id).cost || 0) >= op.minCost) && (!op.onlyType || card(id).type === op.onlyType));
          const finish = (chosen) => {
            if (chosen) { const k = ids.indexOf(chosen); if (k >= 0) ids.splice(k, 1); toHand(S, src.side, chosen); fxq(S, { t: 'tohand', side: src.side, cardId: chosen }); log(S, `  ↳ นำ [${card(chosen).name}] ขึ้นมือ`, 'good'); }
            else log(S, '  ↳ ไม่เลือกใบใด — ทั้งหมดกลับใต้สมุด', 'dim');
            if (op.rest !== 'outzone') restToBottom(S, src.side, ids); else ids.forEach(idz => S.players[src.side].outzone.push(idz));
          };
          if (!ok.length) { log(S, '  ↳ ไม่มีการ์ดตรงเงื่อนไข — กลับใต้สมุดทั้งหมด', 'dim'); restToBottom(S, src.side, ids); break; }
          if (!isHuman(S, src.side)) { finish(op.upTo === false ? ok[0] : ok[0]); break; }
          ctx.__pause = true;
          pauseOp(S, src, op, ctx, ops, i, {
            kind: 'reveal', title: op.prompt || `เลือกการ์ดจาก ${ids.length} ที่เปิดดู`, sub: op.filter ? `ตรงเงื่อนไข: ${op.filter}` : '',
            cardIds: ids.map(i2 => i2), pickIds: ok.slice(), allowSkip: op.upTo !== false, side: src.side,
            auto: () => ok[0], onPick: v => finish(v),
          });
          break;
        }
        case 'reveal': { revealTop(S, src.side, op.n || 1, op.prompt || 'เปิดเผยการ์ดด้านบน'); break; }
        case 'toBottomRest': { const ids = (S.reveal && S.reveal.side === src.side) ? S.reveal.ids.slice() : []; restToBottom(S, src.side, ids); break; }
        case 'addFromOutzone': {
          const p2 = S.players[src.side];
          const cands = p2.outzone.filter(id => matchFilter(S, id, op.filter));
          if (!cands.length) { log(S, '  ↳ ไม่มีใน Outzone ที่ตรงเงื่อนไข', 'dim'); break; }
          const take = (idz) => { const k = p2.outzone.indexOf(idz); if (k >= 0) { p2.outzone.splice(k, 1); toHand(S, src.side, idz); fxq(S, { t: 'tohand', side: src.side, cardId: idz }); log(S, `  ↳ เอา [${card(idz).name}] จาก Outzone ขึ้นมือ`, 'good'); } };
          if (cands.length === 1 || !isHuman(S, src.side)) { take(cands[0]); break; }
          ctx.__pause = true;
          pauseOp(S, src, op, ctx, ops, i, {
            kind: 'outzone', title: op.prompt || 'เลือกการด์จาก Outzone', cardIds: cands.slice(), side: src.side,
            auto: () => cands[0], onPick: v => v && take(v),
          });
          break;
        }
        case 'playFromOutzone': case 'playOutzoneRest': case 'playRevealed': {
          const p2 = S.players[src.side];
          const zone = op.op === 'playRevealed' ? 'deck' : 'outzone';
          const i = p2[zone].findIndex(id => card(id) && card(id).type === 'unit' && (!op.filter || matchFilter(S, id, op.filter)) && (op.maxCost == null || (card(id).cost || 0) <= op.maxCost));
          if (i >= 0) {
            const id = p2[zone].splice(i, 1)[0];
            const cell = (op.row === 'front' ? Z_.frontCells(S, src.side) : Z_.backEmptyAll(S, src.side))[0];
            if (cell) {
              const u = makeCard(S, id, src.side, cell.r, cell.c, 'unit'); if (1) u.deployed = true; u.deployed = false; u.arc = false;
              if (/Rested/i.test(op.op + JSON.stringify(op))) u.rested = true;
              log(S, `  ⛬ นำ [${card(id).name}] จาก ${zone === 'deck' ? 'สมุด' : 'Outzone'}ลงสนาม (ไม่นับ Flare)`, 'good');
              runHook(S, src.side, u.uid, 'deploy', {});
            }
          }
          break;
        }
        case 'outzoneToBottom': {
          const p2 = S.players[src.side];
          for (let k = 0; k < (op.n || 1); k++) { const i = p2.outzone.findIndex(id => matchFilter(S, id, op.filter || 'Green')); if (i < 0) break; p2.deck.push(p2.outzone.splice(i, 1)[0]); }
          log(S, `  ↳ ส่งการ์ด ${op.filter} ${op.n} ใบจาก Outzone กลับใต้เด็ค`, 'good'); break;
        }
        case 'setPower': targetSet(S, src, op.to, op).forEach(u => { if (u) { u.setPowerBase = op.n; log(S, `  ↳ ค่าพลังพื้นฐานของ [${card(u.id).name}] กลายเป็น ${op.n.toLocaleString()} จนจบเทิร์น`, 'good'); } }); break;
        case 'shiftCost': { if (src.uid && S.cards[src.uid]) { const u = S.cards[src.uid]; u.costShift = (u.costShift || 0) + (op.n || 1); } break; }
        case 'setCostField': targetSet(S, src, op.to, op).forEach(u => { if (u) { u.costLocked = op.n; } }); break;
        case 'ascend': {
          const hh = targetSet(S, src, 'allyHost', op);
          const askHost = (cb) => {
            if (!hh.length) { cb(null); return; }
            if (hh.length === 1 || !isHuman(S, src.side)) { cb(hh[0]); return; }
            ctx.__pause = true;
            pauseOp(S, src, op, ctx, ops, i, {
              kind: 'target', title: op.prompt || 'เลือกยูนิตที่จะวางทับ (Ascend)', uids: hh.map(u => u.uid), side: src.side,
              auto: () => hh[0].uid, onPick: v => cb(v ? S.cards[v] : null),
            });
          };
          askHost((h) => { if (h) src.tgt = h;
          const host0 = src.tgt || hh[0];
          doAscend(host0);
          });
          function doAscend(host) {
            if (!host || !src.uid) return;
          const me = src.uid ? S.cards[src.uid] : null;
          if (host && me) {
            const pay = op.refund ? Math.min(costNow(S, src.side, me.id, true) , host.costShift || 0) : 0;
            leaveField(S, me, 'outzone');
            host.fused = (host.fused || []).concat([me.id]);
            host.permCp = (host.permCp || 0) + (op.cpPerFused || 0);
            host.ascended = true;
            S.players[src.side].flare = Math.min(99, S.players[src.side].flare + pay);
            fxq(S, { t: 'ascend', uid: host.uid });
            log(S, `  ♛ Ascend → ซ้อนบน [${card(host.id).name}] (Fused ${host.fused.length}, +${op.cpPerFused || 0} CP)`, 'good');
          }
          }
          break;
        }
        case 'playHandUnits': {
          const p2 = S.players[src.side];
          let slots = Z_.backEmptyAll(S, src.side);
          for (let k = 0; k < (op.n || 1) && slots.length; k++) {
            const i = p2.hand.findIndex(id => card(id).type === 'unit' && matchFilter(S, id, op.filter));
            if (i < 0) break;
            const id = p2.hand.splice(i, 1)[0];
            const cell = slots.shift();
            const u = makeCard(S, id, src.side, cell.r, cell.c, 'unit'); u.deployed = false;
            log(S, `  ⛬ เรียก [${card(id).name}] จากมือ (ผลของ Trigger)`, 'good');
            runHook(S, src.side, u.uid, 'deploy', {});
          }
          break;
        }
        case 'foeDestroyChoice': {
          const foes = units(S, foe(src.side));
          if (!foes.length) break;
          ctx.__pause = true;
          pauseOp(S, src, op, ctx, ops, i, {
            kind: 'target', title: 'ผู้ถูก effect เลือกยูนิตของตัวเองที่จะถูกทำลาย', uids: foes.map(u => u.uid), side: foe(src.side),
            auto: () => (bestBy(S, foes, 'low') || {}).uid,
            onPick: v => { const vic = v && S.cards[v]; if (vic) { const wasCore = vic.r === R.coreRow; destroyTo(S, vic, 'ผลของการ์ด —'); if (wasCore) draw(S, vic.side, 1); } },
          });
          break;
        }
        case 'banish': { if (src.uid && S.cards[src.uid]) leaveField(S, S.cards[src.uid], 'remove'); break; }
        default: {
          const ext = window.Zfx && window.Zfx[op.op];
          if (ext && ext !== FXPLACE) {
            const r = ext(S, src, op, ctx, ops, i);
            if (r === 'pause') ctx.__pause = true;
            else if (r === 'stop') ctx.__stop = true;
          } else if (!ext) log(S, '  ! op ไม่รู้จัก: ' + op.op, 'bad');
          break;
        }
    }
    if (cancelled) ctx.__stop = true;
  }
  /* ชุด helper ส่งให้ effects.js / AI ใช้ (reference เดียวกับที่ engine ใช้) */
  const FXPLACE = 0;
  function helpers() {
    return { runOps, isHuman, log, fxq, ask, pauseOp, answer, makeCard, leaveField, destroyTo, destroyTerrainObj, revealTop, restToBottom, toHand,
      targetSet, pickTargets, candidatesFor, bestBy, matchFilter, effCp, units, terrains, unitAt, cell, cellFx, hasFlag,
      draw, mill, foe, key, pk, inB, R, card, backEmpty, emptyCells, frontCells, canStand, unitCount, terrainLimit, isMultiTerrain,
      staticOf, runHook, payCostOfHand: costNow, execStepMove, movementLocked, legalMoveCells, attackTargets, matchFilter, sideOf: () => S => S.active };
  }
  /* ค่าคงที่ที่ ability-ops.js สกัดไว้ */
  function staticOf(cd, key) { return (cd && cd.statics && cd.statics[key]) || null; }
  function hook(name, S, arg) { if (window.Zhook) { try { window.Zhook(name, S, arg); } catch (e) { log(S, 'hook ' + name + ': ' + e.message, 'bad'); } } }

  function backEmpty(S, side) {
    const r = R.backRow[side];
    for (let c = 0; c < R.cols; c++) if (!S.cells[r][c].unit) return { r, c };
    return null;
  }
  function runUpkeep(S, side) {
    units(S, side).forEach(u => {
      hooksOf(card(u.id), 'upkeep').forEach(a => {
        log(S, `  Upkeep [${card(u.id).name}]`, 'info');
        fx(S, { side, uid: u.uid }, a.ops);
      });
    });
  }
  /* kw → timing hook (data.js เขียนแค่ kw ได้ ไม่ต้องใส่ when) */
  const KW2WHEN = {
    'On Deploy': 'deploy', 'Attack': 'attack', 'Counter': 'counter', 'Upkeep': 'upkeep',
    'Action': 'action', 'Activate': 'main', 'Cast': 'cast', 'Quick-Cast': 'quick', 'Trigger': 'trigger',
  };
  const whenOf = a => a.when || KW2WHEN[a.kw] || null;
  const hooksOf = (cd, when) => (cd.abilities || []).filter(a => whenOf(a) === when);

  function runHook(S, side, uid, when, extra) {
    const u = S.cards[uid]; if (!u) return;
    const cd = card(u.id);
    const list = hooksOf(cd, when);
    for (const a of list) {
      if (a.req && !passReq(S, side, u, a.req)) continue;
      fxq(S, { t: 'effect', uid, side, kw: a.kw, text: a.text });
      log(S, `  ⟩ ${a.kw} [${cd.name}] — ${a.text}`, 'play');
      const out = fx(S, { side, uid, cardId: u.id }, a.ops, extra || {});
      if (out && out.paused) return { paused: true };
    }
    return { done: true };
  }

  /* ---------- helpers สำหรับ ops ของการ์ดจริง ---------- */
  function matchFilter(S, id, f) {
    if (!f || f === 'any') return true;
    const cd = card(id); if (!cd) return false;
    const tri = (cd.tribe || '') + ' ' + (cd.type || '');
    return String(f).split(/[|,]/).some(x => {
      x = (x || '').trim(); if (!x) return false;
      return cd.color === x || cd.type === x.toLowerCase() || tri.toLowerCase().includes(x.toLowerCase());
    });
  }
  function targetSet(S, src, to, op) {
    const side = src.side;
    const byFilter = arr => (op && (op.color || op.tribe) ? arr.filter(u => (!op.color || card(u.id).color === op.color) && (!op.tribe || (card(u.id).tribe || '').includes(op.tribe))) : arr);
    switch (to) {
      case 'self': return [src.uid ? S.cards[src.uid] : null].filter(Boolean);
      case 'target': return [src.tgt].filter(Boolean);
      case 'allyAll': return units(S, side);
      case 'allyUnits': return units(S, side);
      case 'allyBackRow': return units(S, side).filter(u => u.r === R.backRow[side]);
      case 'allySylvan': return units(S, side).filter(u => { const t = cell(S, u.r, u.c); return t && t.terrain && (card(t.terrain.id).tribe || '').includes('Sylvan'); });
      case 'allyColumn': { const me = src.uid && S.cards[src.uid]; return me ? units(S, side).filter(u => u.c === me.c && u.uid !== me.uid) : []; }
      case 'allyFilter': return byFilter(units(S, side).filter(u => !src.uid || u.uid !== src.uid));
      case 'allyTag': return units(S, side).filter(u => (card(u.id).tribe || '').includes(op.tag || ''));
      case 'allyHighestCost': {
        const arr = units(S, side); const mx = Math.max(...arr.map(u => (card(u.id).cost || 0) + (u.costShift || 0)), 0);
        return arr.filter(u => (card(u.id).cost || 0) + (u.costShift || 0) === mx);
      }
      case 'allyHost': return units(S, side).filter(u => u.uid !== src.uid && u.r === R.backRow[side]);
      case 'deployer': return ctxUnits(S, src);
      /* ---- ฝั่งตรงข้าม ---- */
      case 'foe': case 'foeAll': case 'foeUnits': return byFilter(units(S, foe(side)));
      case 'foeBackRow': return byFilter(units(S, foe(side)).filter(u => u.r === R.backRow[u.side]));
      case 'foeFrontRow': return byFilter(units(S, foe(side)).filter(u => u.r === R.frontRow[u.side]));
      case 'foeCore': case 'foeCoreUnits': return byFilter(units(S, foe(side)).filter(u => u.r === R.coreRow));
      case 'enemyUnit': case 'enemy': return byFilter(units(S, foe(side)));
      case 'allUnits': return byFilter(units(S));
      default: return [];
    }
  }
  function ctxUnits(S, src) { return []; }
  function execStepMove(S, u, dir, n) {
    if (!u || u.side !== S.active ? false : false) { }
    for (let k = 0; k < (n || 1); k++) {
      const opts = legalMoveCells(S, u);
      let pick = null;
      const want = dir === 'fwd' ? [[Z.fwd(u.side), 0]] : dir === 'back' ? [[-Z.fwd(u.side), 0]] : dir === 'side' ? [[0, 1], [0, -1]] : [];
      for (const [dr, dc] of want) {
        const cand = opts.find(o => o.r === u.r + dr && o.c === u.c + dc);
        if (cand) { pick = cand; break; }
      }
      if (!pick) return false;
      S.cells[u.r][u.c].unit = null; u.r = pick.r; u.c = pick.c; S.cells[u.r][u.c].unit = u;
    }
    log(S, `  ↳ เลื่อน [${card(u.id).name}] (${dir}) → ${u.r + 1}-${u.c + 1}`, 'move');
    return true;
  }
  function destroyTerrainObj(S, t) {
    if (!t || !S.cards[t.uid]) return;
    S.players[t.side].stats.terrainDestroyed++;
    S.players[t.side].stats.terrainDestroyedFlag = 1;
    runHook(S, t.side, t.uid, 'terrainDestroyed', {});
    runHook(S, t.side, t.uid, 'action', { terrainDestroyed: true });
    leaveField(S, t, 'outzone');
    hook('terrainDestroyed', S, { side: t.side });
    log(S, `💥 Terrain [${card(t.id).name}] ถูกทำลาย → Outzone`, 'bad');
    sideUnits(S, t.side).forEach(u => runHook(S, t.side, u.uid, 'terrainDestroyed', {}));
  }
  const sideUnits = (S, side) => units(S, side);
  function destroyTerrainAt(S, r, c) { const t = cell(S, r, c) && cell(S, r, c).terrain; if (t) destroyTerrainObj(S, t); }
  function backEmptyAll(S, side) { const r = R.backRow[side]; const out = []; for (let c = 0; c < R.cols; c++) if (!cell(S, r, c).unit) out.push({ r, c }); return out; }
  const Z_ = { terrains, frontCells, backEmptyAll, backEmpty };

  function passReq(S, side, u, req) {
    const list = Array.isArray(req) ? req : [req];
    for (const q of list) {
      if (!q) continue;
      if (q.terrainMin && terrains(S, side).length < q.terrainMin) return false;
      if (q.coreMin && units(S, side).filter(x => x.r === R.coreRow).length < q.coreMin) return false;
      if (q.handMax != null && S.players[side].hand.length > q.handMax) return false;
      if (q.cpMax != null && u && effCp(S, u) > q.cpMax) return false;
      const st = S.players[side].stats;
      switch (q.kind) {
        case 'inHand': break;
        case 'handCostReduce': break;
        case 'terrainMin': if (terrains(S, side).length < (q.min || 1)) return false; break;
        case 'colorCount': if (units(S, side).filter(x => card(x.id).color === q.color).length < (q.min || 1)) return false; break;
        case 'colorBackRow': if (units(S, side).filter(x => x.r === R.backRow[side] && card(x.id).color === q.color).length < (q.min || 1)) return false; break;
        case 'outzoneMin': if (S.players[side].outzone.length < (q.min || 1)) return false; break;
        case 'outzoneMax': if (S.players[side].outzone.length > (q.min || 0)) return false; break;
        case 'tribeCount': if (units(S, side).filter(x => (card(x.id).tribe || '').includes(q.tribe || q.color || '')).length < (q.min || 1)) return false; break;
        case 'terrainDestroyedMin': if (!st.terrainDestroyedFlag || st.terrainDestroyed < (q.min || 1)) return false; break;
        case 'flag': if (q.flag === 'terrainDestroyed' ? !st.terrainDestroyedFlag : !st[q.flag]) return false; break;
        case 'notPlayedThisTurn': if (u && u.deployTurn >= S.turnNo - 1) return false; break;
      }
    }
    return true;
  }


  /* ========================================================== คำสั่ง /แอ็ค */
  /* ทุกแอ็คผ่านหน้าต่าง Declaration-Response: อีกฝ่ายตอบโต้ได้ 1 ครั้ง */
  function openResponse(S, actorSide, ev, args) {
    ev.actor = actorSide; ev.args = args;
    const resp = foe(actorSide);
    const opts = responseOptions(S, resp, ev);
    if (!opts.length) { const r = doAction(S, Object.assign({ side: actorSide }, args)); return r; }
    if (resp === S.humanSide) {
      S.pending = { actor: actorSide, responder: resp, ev, args, opts, cancelled: false };
      return { ok: true, awaiting: true };
    }
    const pick = (S.aiRespond ? S.aiRespond(S, resp, ev, opts) : null);
    if (pick != null) applyCounterFromHand(S, resp, pick, ev);
    return doAction(S, Object.assign({ side: actorSide }, args));
  }

  function responseOptions(S, side, ev) {
    const p = S.players[side];
    if (ev && ev.kind && ev.kind !== 'attack' && ev.kind !== 'command' && ev.kind !== 'deploy') return [];
    const battleOnly = (cdX) => (cdX.abilities || []).some(a => (a.ops || []).some(o => o && o.op === 'onPlay' && o.hook === 'battle'));
    const out = [];
    p.hand.forEach((id, i) => {
      const cd = card(id);
      if (cd.type !== 'command') return;
      let ab = (cd.abilities || []).find(a => a.kw === 'Counter' || a.kw === 'Quick-Cast');
      if (!ab) ab = (cd.abilities || []).find(a => (a.ops || []).some(o => o && o.op === 'onPlay' && (o.hook === 'battle')));
      if (!ab) return;
      if (battleOnly(cd) && ev && ev.kind !== 'attack' && (!ev.attackerUid || !(S.cards[ev.attackerUid] || {}).battle)) return [];
      if (cd.cost > p.flare) return;
      if (ab.ops && ab.ops.some(o => o.op === 'cancel') && ev.kind !== 'attack' && ev.kind !== 'command' && ev.kind !== 'deploy') return;
      out.push(i);
    });
    return out;
  }

  function applyCounterFromHand(S, side, handIdx, ev) {
    if (ev && ev.tgt) S.__attackedUid = ev.tgt.uid;
    const p = S.players[side]; const id = p.hand[handIdx]; const cd = card(id);
    let ab = (cd.abilities || []).find(a => a.kw === 'Counter' || a.kw === 'Quick-Cast');
    if (!ab) ab = (cd.abilities || []).find(a => (a.ops || []).some(o => o && (o.op === 'protect' || o.op === 'noDestroy' || o.op === 'battleEffect' || o.op === 'perOwnedGreenTerrainBuff')));
    ab = ab || (cd.abilities || [])[0];
    p.flare -= cd.cost;
    p.hand.splice(handIdx, 1);
    log(S, `⟲ ตอบโต้ [${cd.name}] (จ่าย Flare ${cd.cost}) — ${ab ? ab.text : ''}`, 'guard');
    const src = { side, uid: null, cardId: id, tgt: ev.tgt || null, eff: { target: ev.tgt && ev.tgt.uid, attacked: true, from: ev.attackerUid } };
    const ctx = fx(S, src, (ab && ab.ops) || []);
    p.outzone.push(id);
    if (ctx && ctx.cancelled && S.pending) S.pending.cancelled = true;
    return ctx;
  }

  function emptyCells(S, side, rows) {
    const out = [];
    rows.forEach(r => { for (let c = 0; c < R.cols; c++) { const t = S.cells[r][c]; if (r !== R.coreRow ? canStand(side, r) : true) { if (!t.unit) out.push({ r, c }); } } });
    return out;
  }
  function frontCells(S, side) { const r = R.frontRow[side]; const out = []; for (let c = 0; c < R.cols; c++) if (!S.cells[r][c].terrain) out.push({ r, c }); return out; }

  function doAction(S, a) {
    const p = S.players[a.side];
    if (a.kind === 'deploy') {
      const id = p.hand[a.handIdx], cd = card(id);
      if (cd.type !== 'unit' && cd.type !== 'token') return { ok: false, why: 'การ์ดนี้ต้องร่ายเป็น Command/Terrain ไม่ใช่ลงเป็นยูนิต', needType: cd.type };
      const free = R.unitLimit && unitCount(S, a.side) >= R.unitLimit && cd.type !== 'arcanum';
      if (free) return { ok: false, why: `สนามเต็ม (ยูนิตไม่เกิน ${R.unitLimit} ตัว)` };
      p.flare -= cd.cost; p.hand.splice(a.handIdx, 1);
      const u = makeCard(S, id, a.side, a.cell.r, a.cell.c, 'unit');
      fxq(S, { t: 'deploy', uid: u.uid, side: a.side, cell: [a.cell.r, a.cell.c] });
      log(S, `⛬ Deploy [${cd.name}] → ช่อง ${a.cell.r + 1}-${a.cell.c + 1} (Flare ${cd.cost})`, 'play');
      const t = S.cells[a.cell.r][a.cell.c].terrain;
      if (t) runHook(S, t.side, t.uid, 'deployHere', { deployerSide: a.side, units: [u] });
      runHook(S, a.side, u.uid, 'deploy', { units: [u] });
      runHook(S, a.side, u.uid, 'action', { units: [u] });
      return { ok: true, uid: u.uid };
    }
    if (a.kind === 'summonArc') {
      const e = p.extra[a.extraIdx];
      const cd = card(e.id);
      if (a.withArc) { p.arcFlareUsed = true; log(S, `✦ ใช้ Arc-Flare เรียก [${cd.name}] (ข้าม Cost ทั้งก้อน)`, 'good'); }
      else { p.flare -= cd.cost; log(S, `✦ เรียก [${cd.name}] (Flare ${cd.cost})`, 'play'); }
      e.used = true;
      const u = makeCard(S, e.id, a.side, a.cell.r, a.cell.c, 'unit');
      u.arc = true;
      runHook(S, a.side, u.uid, 'deploy', {});
      return { ok: true, uid: u.uid };
    }
    if (a.kind === 'terrain') {
      const id = p.hand[a.handIdx], cd = card(id);
      p.flare -= cd.cost; p.hand.splice(a.handIdx, 1);
      const here = S.cells[a.cell.r][a.cell.c];
      const t = makeCard(S, id, a.side, a.cell.r, a.cell.c, 'terrain');
      log(S, `▦ วาง Terrain [${cd.name}] → ช่อง ${a.cell.r + 1}-${a.cell.c + 1} (Flare ${cd.cost})`, 'play');
      const over = terrainOverLimit(S, a.side, id);
      if (over > 0) {
        const pool = terrains(S, a.side).filter(x => !isMultiTerrain(x) && x.uid !== t.uid);
        const old = a.dropUid ? S.cards[a.dropUid] : pool[0];
        if (old) { log(S, `  ↳ Terrain เกิน limit — ส่ง [${card(old.id).name}] ไป Outzone (ไม่ถือว่าถูกทำลาย)`, 'dim'); leaveField(S, old, 'outzone'); }
      }
      return { ok: true, uid: t.uid };
    }
    if (a.kind === 'command') {
      const id = p.hand[a.handIdx], cd = card(id);
      const c0 = costNow(S, a.side, id);
      p.flare -= c0; p.hand.splice(a.handIdx, 1);
      const slot = a.cell || backEmpty(S, a.side);
      let holder = null;
      if (slot && !S.cells[slot.r][slot.c].unit) holder = makeCard(S, id, a.side, slot.r, slot.c, 'unit');  // ครองช่องชั่วขณะ
      log(S, `✎ ใช้ Command [${cd.name}] (Flare ${c0}${c0 !== cd.cost ? ' จาก ' + cd.cost : ''})`, 'play');
      if (cd.tribe && /Operation/i.test(cd.tribe)) p.stats.operationPlayed = 1;
      p.stats.commandPlayed = 1;
      const ab = (cd.abilities || []).find(x => x.kw === 'Cast' || x.kw === 'Quick-Cast') || (cd.abilities || [])[0];
      fx(S, { side: a.side, uid: holder ? holder.uid : null, tgt: a.tgtUid ? S.cards[a.tgtUid] : null, cardId: id }, (ab && ab.ops) || []);
      if (holder) leaveField(S, holder, 'outzone'); else p.outzone.push(id);
      units(S, a.side).forEach(x => runHook(S, a.side, x.uid, 'action', { commandPlayed: true }));
      if (/Operation/i.test(cd.tribe || '')) { p.stats.operationPlayed = (p.stats.operationPlayed || 0) + 1; hook('operationPlayed', S, { side: a.side }); }
      hook('commandPlayed', S, { side: a.side });
      return { ok: true };
    }
    if (a.kind === 'ability') {
      const u = S.cards[a.uid]; const cd = card(u.id);
      const ab = (cd.abilities || []).find(x => x.kw === 'Activate');
      if (ab.once && u.used['act']) return { ok: false, why: 'ใช้ไปแล้วในเทิร์นนี้' };
      if (ab.cost) p.flare -= ab.cost;
      u.used['act'] = true;
      log(S, `⚡ [${cd.name}] ${ab.kw} — ${ab.text}`, 'play');
      fx(S, { side: a.side, uid: u.uid, tgt: a.tgtUid ? S.cards[a.tgtUid] : null }, ab.ops);
      return { ok: true };
    }
    if (a.kind === 'move') return execMove(S, a);
    if (a.kind === 'attack') return execAttack(S, a);
    return { ok: false, why: 'ไม่รู้จักคำสั่ง' };
  }

  function execMove(S, a) {
    const u = S.cards[a.uid]; if (!u) return { ok: false, why: 'ไม่มีunit นี้' };
    const cd = card(u.id);
    if (u.rested) return { ok: false, why: 'การ์ดถูกวางนอน (ใช้แอ็คแล้ว)' };
    if (!canStand(u.side, a.to.r)) return { ok: false, why: 'เข้าแถวหลังของศัตรูไม่ได้' };
    if (S.cells[a.to.r][a.to.c].unit) return { ok: false, why: 'ช่องมีunit อื่นอยู่' };
    if (!canReach(S, u, a.to)) return { ok: false, why: 'เส้นทางถูกบล็อก' };
    u.rested = true;
    S.cells[u.r][u.c].unit = null;
    u.r = a.to.r; u.c = a.to.c;
    S.cells[u.r][u.c].unit = u;
    fxq(S, { t: 'move', uid: u.uid, to: [u.r, u.c] });
    log(S, `↝ [${cd.name}] เดิน → ${u.r + 1}-${u.c + 1} (วางนอน)`, 'move');
    hook('move', S, { side: u.side, uid: u.uid, to: [u.r, u.c] });
    const firstCore = u.r === R.coreRow && u.coreSeen !== true;
    u.coreSeen = true;
    const t = S.cells[u.r][u.c].terrain;
    if (t) runHook(S, t.side, t.uid, 'deployHere', { deployerSide: u.side, units: [u] });
    runHook(S, u.side, u.uid, 'move', {});
    if (firstCore) log(S, `  ★ เข้า Core Zone ครั้งแรก`, 'good');
    return { ok: true };
  }

  function execAttack(S, a) {
    const attacker = S.cards[a.uid], def = S.cards[a.tgtUid];
    if (!attacker || !def) return { ok: false, why: 'เป้าหมายไม่อยู่แล้ว' };
    if (attacker.rested) return { ok: false, why: 'การ์ดถูกวางนอน (ใช้แอ็คแล้ว)' };
    const cost = canFreeAttack(S, attacker) ? 0 : R.attackFlare;
    if (cost > S.players[attacker.side].flare) return { ok: false, why: `โจมตีต้องใช้ Flare ${cost}` };
    attacker.rested = true;
    S.players[attacker.side].flare -= cost;
    const acd = card(attacker.id), dcd = card(def.id);
    log(S, `⚔ [${acd.name}] โจมตี [${dcd.name}]${cost ? ` (Flare ${cost})` : ' (ไม่ใช้ Flare)'}`, 'attack');

    /* 1) Defender's Counter works before Attack */
    runHook(S, def.side, def.uid, 'counter', {});
    /* 2) Attacker's Attack abilities */
    runHook(S, attacker.side, attacker.uid, 'attack', {});
    /* 3) CP compare */
    const atk = effCp(S, attacker), dl = effCp(S, def);
    fxq(S, { t: 'attack', from: attacker.uid, to: def.uid, n: atk });
    def.dmg = (def.dmg || 0) + atk;
    fxq(S, { t: 'hit', uid: def.uid, n: atk, left: effCp(S, def) });
    log(S, `  ↳ วัดค่าพลัง: ${atk} → [${dcd.name}] ${dl} เหลือ ${effCp(S, def)}`, 'attack');
    hook('battle', S, { side: S.active, from: attacker.uid, target: def.uid });
    if (S.battleOverride && S.battleOverride.lowerWinsDie) {
      const la = effCp(S, attacker), ld = effCp(S, def);
      const loser = la <= ld ? def : attacker;
      if (S.cards[loser.uid]) destroyTo(S, loser, '⚖ ผลพิเศษ — ผู้_POWER ต่ำกว่าล้ม');
      log(S, `  ⚖ ผลพิเศษ: ฝ่ายพลังต่ำกว่า (${card(loser.id).name}) เป็นฝ่ายล้ม`, 'guard');
      S.battleOverride = null;
    }
    if (S.cards[def.uid] && effCp(S, def) <= 0) {
      if (def.noDestroyBattle) log(S, `  🛡 [${dcd.name}] ไม่ถูกทำลายจากการต่อสู้ (ยังเหลือ ${effCp(S, def)} CP)`, 'guard');
      else destroyTo(S, def, '💥 ถูกทำลาย');
    }
    /* 4) end of battle */
    S.battleOverride = null;
    [attacker, def].forEach(u => { if (u && S.cards[u.uid]) u.battleCp = 0; });
    if (staticOf(card(attacker.id), 'readyAfterAttack') && S.cards[attacker.uid]) { attacker.rested = false; fxq(S, { t: 'ready', uid: attacker.uid }); log(S, `  ↳ [${card(attacker.id).name}] กลับตั้งหลังโจมตี`, 'good'); }
    runHook(S, attacker.side, attacker.uid, 'endBattle', {});
    hook('battleEnd', S, { side: attacker.side, from: attacker.uid, target: def ? def.uid : null });
    return { ok: true };
  }


  /* =======================================================Queries (legality) */
  function steps(u) { return hasFlag(card(u.id), 'stride') ? 2 : R.movePerAction; }
  /* "unit นี้เคลื่อนที่ไม่ได้" ตามเงื่อนไขที่ระบุในตัวการ์ด */
  function movementLocked(S, u) {
    const cd = card(u.id), st = S.players[u.side];
    const lk = staticOf(cd, 'moveLock');
    if (lk) {
      if (lk.value === 'outzoneLt' && st.outzone.length < (lk.n || 11)) return true;
      if (lk.value === 'noAllyColorOrTribe') {
        const any = units(S, u.side).some(x => x.uid !== u.uid && (card(x.id).color === lk.color || (card(x.id).tribe || '').includes(lk.tribe)));
        if (!any) return true;
      }
    }
    for (const f of (cd.flags || [])) {
      const m = /^noMoveOutzone:(\d+)$/.exec(f);
      if (m && st.outzone.length <= +m[1]) { if (u.side === S.active) return true; }
      const m2 = /^noMoveAllyColor:(.*)$/.exec(f);
      if (m2) {
        const want = m2[1].split('|');
        const other = units(S, u.side).filter(x => x.uid !== u.uid && (want.some(w => card(x.id).color === w || (card(x.id).tribe || '').includes(w))));
        if (!other.length) return true;
      }
    }
    return false;
  }

  /* BFS: เดินผ่าน/หยุดบนช่องที่มีunit ศัตรูไม่ได้ ( Terrain เดินผ่านได้) */
  function canReach(S, u, to) {
    const max = steps(u);
    const start = key(u.r, u.c), seen = { [start]: 0 };
    const q = [[u.r, u.c, 0]];
    while (q.length) {
      const [r, c, d] = q.shift();
      if (d >= max) continue;
      DIRS.forEach(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (!inB(nr, nc) || !canStand(u.side, nr)) return;
        const occ = S.cells[nr][nc].unit;
        if (occ && occ.side === u.side) return;                       // ช่องที่มีunit ฝ่ายเดียวกันห้ามเข้า
        if (occ) return;                                              // ห้ามผ่าน/ทับunit ศัตรู
        const k = key(nr, nc);
        if (seen[k] == null || seen[k] > d + 1) { seen[k] = d + 1; q.push([nr, nc, d + 1]); }
      });
    }
    return seen[key(to.r, to.c)] != null;
  }

  function legalMoveCells(S, u) {
    if (u.rested || card(u.id).type === 'arcanum' || u.arc || movementLocked(S, u)) return [];
    const out = [];
    for (let r = 0; r < R.rows; r++) for (let c = 0; c < R.cols; c++) {
      if (r === u.r && c === u.c) continue;
      if (Math.abs(r - u.r) + Math.abs(c - u.c) > steps(u)) continue;
      if (!canStand(u.side, r)) continue;
      if (S.cells[r][c].unit) continue;
      if (canReach(S, { ...u, r, c } && u, { r, c })) out.push({ r, c });
    }
    return out;
  }

  /* โจมตีได้เฉพาะ ช่องหน้า / ซ้าย / ขวา ของตัวเอง (ห้ามตีหลัง) */
  function attackTargets(S, u) {
    if (u.rested || card(u.id).type === 'arcanum' || u.arc) return [];
    const f = fwd(u.side);
    const dirs = [[f, 0], [0, -1], [0, 1]];
    const out = [];
    dirs.forEach(([dr, dc]) => {
      const r = u.r + dr, c = u.c + dc;
      if (!inB(r, c)) return;
      const t = S.cells[r][c].unit;
      if (t && t.side !== u.side && !staticOf(card(t.id), 'untargetable')) out.push(t);
    });
    return out;
  }

  /* ราคารวมการลดต้นทุนจากความสามารถ [In Hand] */
  function costNow(S, side, id, ignoreInHand) {
    const cd = card(id);
    let c = (cd.cost || 0);
    (cd.abilities || []).filter(a => (a.req || []).some(r => r.kind === 'inHand') && a.ops0 === undefined).forEach(() => { });
    if (ignoreInHand) return Math.max(0, c);
    (cd.abilities || []).forEach(a => {
      const r = (a.req || []).find(x => x.kind === 'handCostReduce');
      if (!r) return;
      let n = 0;
      if (r.by === 'terrainDestroyed' || r.by === 'terrainDestroyedThisTurn') n = S.players[side].stats.terrainDestroyed;
      else if (r.by === 'terrainHeldOrDestroyed') n = S.players[side].stats.terrainDestroyed + (terrains(S, side).length ? 1 : 0);
      else if (r.by === 'blueUnitsControlled') n = units(S, side).filter(u => card(u.id).color === 'Blue').length;
      else if (r.by === 'terrainControl') n = Z_.terrains(S, side).length ? 1 : 0;
      else if (r.by === 'colorUnits') n = 'color:Blue';
      if (n === 'color:Blue') n = units(S, side).filter(u => card(u.id).color === 'Blue').length;
      c -= (r.per || 1) * Math.min(n, 9);
    });
    if (cd.setCost != null) c = cd.setCost;
    const cr = staticOf(cd, 'costIfReturnedThisTurn');
    if (cr && S.returnedThisTurn && S.returnedThisTurn[id]) c = Math.min(c, cr.value);
    const reds = (cd.abilities || []).filter(a => a.ops && a.ops.some(o => o && o.op === 'static' && o.key === 'costReduce'));
    reds.forEach(a => a.ops.filter(o => o.op === 'static' && o.key === 'costReduce').forEach(o => {
      let n = 0;
      if (o.by === 'terrainDestroyedThisTurn') n = S.players[side].stats.terrainDestroyed;
      else if (o.by === 'terrainHeldOrDestroyed') n = S.players[side].stats.terrainDestroyed + (terrains(S, side).length ? 1 : 0);
      else if (o.by === 'blueUnitsControlled') n = units(S, side).filter(u => card(u.id).color === 'Blue').length;
      c -= (o.per || 1) * Math.min(n, 9);
    }));
    return Math.max(0, c);
  }

  function cardPlayable(S, side, handIdx) {
    const p = S.players[side], id = p.hand[handIdx]; if (!id) return null;
    const cd = card(id);
    const cost = costNow(S, side, id);
    if (cost > p.flare) return { ok: false, why: `Flare ไม่พอ (ต้อง ${cost})` };
    const rt = staticOf(cd, 'requiresTribe');
    if (rt && !units(S, side).some(u => (card(u.id).tribe || '').includes(rt.value))) return { ok: false, why: `ต้องคุมเผ่า ${rt.value} ถึงจะเล่นได้` };
    if (cd.type === 'unit' || cd.type === 'token') {
      if (unitCount(S, side) >= R.unitLimit) return { ok: false, why: `สนามเต็ม (${R.unitLimit} ยูนิต)` };
      const cells = emptyCells(S, side, [R.backRow[side]]);
      return cells.length ? { ok: true, cells } : { ok: false, why: 'แถวหลังไม่มีช่องว่าง' };
    }
    if (cd.type === 'command') {
      const cells = emptyCells(S, side, [R.backRow[side]]);
      const need = cd.target && cd.target.indexOf('enemy') === 0 ? units(S, foe(side)) : (cd.target === 'allyUnit' ? units(S, side) : (cd.target === 'unit' ? units(S) : []));
      if (cd.target && !need.length) return { ok: false, why: 'ไม่มีเป้าหมายที่ถูกต้อง' };
      return { ok: true, cells: cells.length ? cells : null, targets: cd.target ? need : null };
    }
    if (cd.type === 'terrain') {
      const cells = frontCells(S, side);
      return cells.length ? { ok: true, cells } : { ok: false, why: 'แถวหน้าไม่มีช่องว่างสำหรับ Terrain' };
    }
    return { ok: false, why: 'การ์ดใบนี้ลงไม่ได้' };
  }

  function arcPlayable(S, side) {
    if (R.arcanum === false) return { ok: false, why: 'บิลด์นี้ยังไม่มี Arcanum' };
    const p = S.players[side];
    const ready = p.extra.map((e, i) => ({ e, i })).filter(x => !x.e.used);
    if (!ready.length) return { ok: false, why: 'Extra Zone ไม่มี Arcanum ที่พร้อมใช้' };
    const firstAction = S.turnActions === 0;
    const cells = emptyCells(S, side, [R.backRow[side], R.frontRow[side], R.coreRow]);
    if (!cells.length) return { ok: false, why: 'ไม่มีช่องว่างสำหรับ Arcanum' };
    const opt = ready.map(x => ({
      extraIdx: x.i, id: x.e.id,
      withArc: p.arcFlareReady && firstAction && !p.arcFlareUsed,
      payCost: card(x.e.id).cost <= p.flare,
    }));
    return opt.some(o => o.withArc || o.payCost) ? { ok: true, cells, options: opt } : { ok: false, why: 'Flare ไม่พอ (หรือใช้ Arc-Flare ไม่ได้)' };
  }

  /* --------- public wrappers (ผ่านหน้าต่างตอบโต้ทุกคน) --------- */
  const actApi = {
    deploy(S, side, handIdx, c) {
      if (S.active !== side) return { ok: false, why: 'ไม่ใช่เทิร์นของคุณ' };
      if (S.uiAsk) return { ok: false, why: 'มีการเลือกราค้างอยู่' };
      const info = cardPlayable(S, side, handIdx); if (!info || !info.ok) return info || { ok: false, why: 'ลงไม่ได้' };
      if (!info.cells.some(x => x.r === c.r && x.c === c.c)) return { ok: false, why: 'ตำแหน่งนี้ลงไม่ได้' };
      S.turnActions++;
      return openResponse(S, side, { kind: 'deploy', tgt: null }, { kind: 'deploy', handIdx, cell: c });
    },
    terrain(S, side, handIdx, c, dropUid) {
      if (S.active !== side) return { ok: false, why: 'ไม่ใช่เทิร์นของคุณ' };
      const info = cardPlayable(S, side, handIdx); if (!info || !info.ok) return info || { ok: false, why: 'วางไม่ได้' };
      if (!info.cells.some(x => x.r === c.r && x.c === c.c)) return { ok: false, why: 'วาง Terrain ตรงนั้นไม่ได้' };
      S.turnActions++;
      return openResponse(S, side, { kind: 'terrain' }, { kind: 'terrain', handIdx, cell: c, dropUid });
    },
    command(S, side, handIdx, c, tgtUid) {
      if (S.active !== side) return { ok: false, why: 'ไม่ใช่เทิร์นของคุณ' };
      const info = cardPlayable(S, side, handIdx); if (!info || !info.ok) return info || { ok: false, why: 'ร่ายไม่ได้' };
      S.turnActions++;
      return openResponse(S, side, { kind: 'command', tgt: tgtUid ? S.cards[tgtUid] : null }, { kind: 'command', handIdx, cell: c || null, tgtUid });
    },
    summonArc(S, side, extraIdx, c, withArc) {
      if (S.active !== side) return { ok: false, why: 'ไม่ใช่เทิร์นของคุณ' };
      const info = arcPlayable(S, side); if (!info.ok) return info;
      const o = info.options.find(x => x.extraIdx === extraIdx); if (!o) return { ok: false, why: 'เลือกไม่ได้' };
      if (withArc && !o.withArc) return { ok: false, why: 'ใช้ Arc-Flare ไม่ได้ (ต้องเป็นแอ็คแรกของเทิร์น และ Flare ถึง 8)' };
      if (!withArc && !o.payCost) return { ok: false, why: 'Flare ไม่พอ' };
      S.turnActions++;
      return openResponse(S, side, { kind: 'summonArc' }, { kind: 'summonArc', extraIdx, cell: c, withArc });
    },
    move(S, side, uid, to) {
      if (S.active !== side) return { ok: false, why: 'ไม่ใช่เทิร์นของคุณ' };
      const u = S.cards[uid]; if (!u) return { ok: false, why: 'ไม่พบunit' };
      if (!legalMoveCells(S, u).some(x => x.r === to.r && x.c === to.c)) return { ok: false, why: 'เดินไปช่องนั้นไม่ได้' };
      S.turnActions++;
      return openResponse(S, side, { kind: 'move' }, { kind: 'move', uid, to });
    },
    attack(S, side, uid, tgtUid) {
      if (S.active !== side) return { ok: false, why: 'ไม่ใช่เทิร์นของคุณ' };
      const u = S.cards[uid]; if (!u) return { ok: false, why: 'ไม่พบunit' };
      const cost = canFreeAttack(S, u) ? 0 : R.attackFlare;
      if (S.players[side].flare < cost) return { ok: false, why: `โจมตีต้องใช้ Flare ${cost}` };
      if (!attackTargets(S, u).some(t => t.uid === tgtUid)) return { ok: false, why: 'เป้าหมายอยู่นอกระยะโจมตี' };
      S.turnActions++;
      return openResponse(S, side, { kind: 'attack', tgt: S.cards[tgtUid], attackerUid: uid }, { kind: 'attack', uid, tgtUid });
    },
    ability(S, side, uid) {
      if (S.active !== side) return { ok: false, why: 'ไม่ใช่เทิร์นของคุณ' };
      const u = S.cards[uid]; if (!u) return { ok: false, why: 'ไม่พบunit' };
      const ab = (card(u.id).abilities || []).find(x => x.kw === 'Activate');
      if (!ab) return { ok: false, why: 'การ์ดใบนี้ไม่มี Activate' };
      if (ab.once && u.used['act']) return { ok: false, why: 'ใช้ไปแล้วในเทิร์นนี้' };
      if (ab.cost && S.players[side].flare < ab.cost) return { ok: false, why: `ต้องใช้ Flare ${ab.cost}` };
      S.turnActions++;
      return openResponse(S, side, { kind: 'ability' }, { kind: 'ability', uid });
    },
    respond(S, handIdx) {                       // ฝ่ายรับเลือกตอบโต้ (หรือ null = ผ่าน)
      const pend = S.pending; if (!pend) return { ok: false, why: 'ไม่มีแอ็คที่รออยู่' };
      if (handIdx != null) applyCounterFromHand(S, pend.responder, handIdx, pend.ev);
      const args = pend.args, actor = pend.actor;
      S.pending = null;
      if (pend.cancelled) { log(S, `  ↳ แอ็คถูกยกเลิก`, 'guard'); return { ok: true, cancelled: true }; }
      return doAction(S, Object.assign({ side: actor }, args));
    },
    endTurn(S) {
      if (S.pending) return { ok: false, why: 'มีการตอบโต้ค้างอยู่' };
      if (S.uiAsk) return { ok: false, why: 'มีการเลือกราค้างอยู่' };
      return endTurn(S);
    },
    revealOf(S) { return S.reveal; },
  };


  const API = Object.assign({
    init, startTurn, endTurn, draw, mill, triggerCheck, doAction, openResponse, responseOptions,
    cardPlayable, arcPlayable, legalMoveCells, attackTargets, canReach, steps, backEmpty, emptyCells, frontCells,
    fx, passReq, answer, drainFx, fxq, ask, revealTop, toHand, candidatesFor, helpers, staticOf, hook, cellFx, cellCpBonus, hasFlag, movementLocked, isMultiTerrain, unitAt, cell, card, foe, key, pk, inB, log, canFreeAttack, terrainLimit,
    flareOf, pay, unitCount, rowOwner, canStand, fwd, effCp, units, terrains, R, leaveField, destroyTo, roll,
    list: S => Object.values(S.cards),
  }, actApi);
  return API;
})();
