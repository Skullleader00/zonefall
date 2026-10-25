/* ==========================================================================
   ZONEFALL — effects.js
   op เสริมที่ engine หลักไม่รู้จัก (window.Zfx) + ตัว_dispatch เหตุการณ์ (window.Zhook)
   ใช้ helpers ของ engine เท่านั้น · โหลดหลัง js/engine.js
   --------------------------------------------------------------------------
   vocabulary:
     static · require · if · oncePerTurn · pay · gain · points · foePoints
     buff · powerTo · drawPerPower · shiftCost · ready · rest · readyBackRowOthers
     readyIfBackRowColor · move · swap · destroy · bounce · noDestroy · protect
     perOwnedGreenTerrainBuff · battleEffect · banishRemove · mergeDeck · applyCellOnPlay
     transfer · returnFieldRested · playFromHandTribe · ascendDeploy · declareMatch
     reveal · revealCountOf · revealTopRestBottom · columnBuff · onPlay(react) · readyAfterBattle
     costReduce(static) · millDoubles(static) · staticOf keys:
        cell / moveLock / multiTerrain / costIfReturnedThisTurn / requiresTribe /
        untargetable / readyAfterAttack / witchSetPower / millDoubles / columnBuffOnOperation / protection
   "ask:<kind>" ในฟิลด์ to/ask → ระบบจะขอร้องให้เลือก (ผู้เล่น=หน้าต่าง, AI=auto)
   ========================================================================== */
(function () {
  const FX = {}, HK = {};
  let H = null;
  const h = () => (H = H || Z.helpers());
  /* R ของ engine (RULES + กระดาน) แบบ lazy — effects.js ไม่มี R ของตัวเอง */
  const R = new Proxy({}, { get: (_, k) => h().R[k] });
  const foeOf = s => (s === 'p0' ? 'p1' : 'p0');
  const say = (S, m, k) => h().log(S, '  ↳ ' + m, k || 'info');
  const an = (S, ev) => h().fxq(S, ev);
  const cdOf = id => h().card(id) || {};
  const mine = (S, side, p) => h().units(S, side).filter(p || (() => true));

  /* ---------- conditions ---------- */
  const COND = {
    always: () => true,
    outzoneGte: (S, src, c) => S.players[src.side].outzone.length >= (c.value == null ? 10 : c.value),
    outzoneLt: (S, src, c) => S.players[src.side].outzone.length < (c.value == null ? 11 : c.value),
    playedFrom: (S, src, c) => !!(src.eff && src.eff.from === c.value),
    playedWithoutFlare: (S, src) => !!(src.eff && src.eff.noFlare),
    byUnitEffect: (S, src) => !!(src.eff && src.eff.byUnit),
    notPlayedThisTurn: (S, src) => { const u = S.cards[src.uid]; return !!u && u.deployTurn * 1 < S.turnNo; },
    controlTribe: (S, src, c) => mine(S, src.side, u => (cdOf(u.id).tribe || '').includes(c.value)).length > 0,
    controlColor: (S, src, c) => mine(S, src.side, u => cdOf(u.id).color === c.color).length >= (c.n || 1),
    targetCostGte: (S, src, c) => !!src.tgt && (cdOf(src.tgt.id).cost || 0) >= c.value,
    hasTerrainHere: (S, src) => { const u = S.cards[src.uid]; return !!u && !!S.cells[u.r][u.c].terrain; },
    handGte: (S, src, c) => S.players[src.side].hand.length >= (c.value || 1),
  };
  const test = (S, src, c) => { if (!c || !c.kind) return true; const f = COND[c.kind]; return f ? !!f(S, src, c) : true; };

  /* ----------和目标 pool ---------- */
  function pool(S, src, kind) {
    const Hh = h();
    switch (kind) {
      case 'machine': return mine(S, src.side, u => (cdOf(u.id).tribe || '').includes('Machine') && u.uid !== src.uid);
      case 'machineSameColumn': { const u = S.cards[src.uid]; return u ? mine(S, src.side, x => (cdOf(x.id).tribe || '').includes('Machine') && x.c === u.c && x.uid !== u.uid) : []; }
      case 'ownHighCost': return mine(S, src.side, u => (cdOf(u.id).cost || 0) >= 6);
      case 'ownFrontRow': return mine(S, src.side, u => u.r === R.frontRow[src.side]);
      case 'enemyCore': return mine(S, foeOf(src.side), u => u.r === R.coreRow);
      case 'alliesOther': return mine(S, src.side, u => u.uid !== src.uid);
      case 'ownBackRowReady': return mine(S, src.side, u => u.r === R.backRow[src.side] && !u.rested && u.uid !== src.uid);
      case 'battlingGreen': { const a = src.eff && S.cards[src.eff.from], d = src.eff && S.cards[src.eff.target]; return [a, d].filter(x => x && x.side === src.side && cdOf(x.id).color === 'Green'); }
      case 'witchOther': return mine(S, src.side, u => (cdOf(u.id).tribe || '').includes('Witch') && u.uid !== src.uid);
      case 'cost6Own': return mine(S, src.side, u => (cdOf(u.id).cost || 0) === 6);
      default: return [];
    }
  }
  /* ถ้า op.to ขึ้นต้น 'ask:' และยังไม่เลือกเป้าหมาย → ขอร้องเลือก (คน=หน้าต่าง, AI=auto) */
  function resolveTarget(S, src, op, ctx, ops, i, kind, prompt) {
    if (src.tgt) return { tgt: src.tgt };
    let cands = pool(S, src, kind);
    if (!cands.length) return { none: true };
    if (cands.length === 1 || !h().isHuman(src.side)) { const t = cands[0]; src.tgt = t; return { tgt: t }; }
    h().ask(S, {
      kind: 'target', title: prompt || 'เลือกเป้าหมาย', uids: cands.map(u => u.uid), side: src.side,
      auto: () => cands[0].uid, resume: v => { src.tgt = v ? (S.cards[v] || null) : null; h().runOps(S, src, ops.slice(i), ctx, 0); },
    });
    return { pause: true };
  }
  /* สำหรับ pool ที่มาจาก op เอง (เช่น machineUnit) */
  function pickFrom(S, src, op, list, prompt, then) {
    if (!list.length) { say(S, 'ไม่มีเป้าหมายที่ตรงเงื่อนไข — ข้ามผล', 'dim'); return; }
    if (list.length === 1 || !h().isHuman(src.side)) return then(list[0]);
    h().ask(S, { kind: 'target', title: prompt || 'เลือก 1 เป้าหมาย', uids: list.map(u => u.uid), side: src.side, auto: () => list[0].uid, resume: v => v && then(S.cards[v]) });
    return 'pause';
  }

  /* ========================= ops ========================= */
  FX.static = () => { }; FX.noop = () => { }; FX.costReduce = () => { }; FX.protection = () => { };
  FX.require = (S, src, op) => (test(S, src, op.cond || op) ? undefined : 'stop');
  FX.if = (S, src, op, ctx, ops, i) => {
    const br = test(S, src, op.cond || op) ? op.then : op.else;
    if (br && br.length) return h().runOps(S, src, br, ctx, 0);
  };
  FX.oncePerTurn = (S, src) => {
    const u = src.uid && S.cards[src.uid]; if (!u) return;
    u.used = u.used || {};
    if (u.used.onceTurn) { say(S, 'ใช้abilityนี้ได้ครั้งเดียว/เทิร์น (ใช้ไปแล้ว)', 'dim'); return 'stop'; }
    u.used.onceTurn = 1;
  };
  FX.pay = (S, src, op, ctx, ops, i) => {
    const Hh = h(), p = S.players[src.side];
    if (op.flare) { if (p.flare < op.flare) { say(S, 'Flare ไม่พอ', 'dim'); return 'stop'; } p.flare -= op.flare; say(S, 'จ่าย Flare ' + op.flare, 'dim'); }
    if (op.discardHand) {
      const n = op.discardHand;
      if (p.hand.length < n) { say(S, 'การ์ดในมือไม่พอ', 'dim'); return 'stop'; }
      if (!Hh.isHuman(src.side)) { drop(p.hand.slice(0, n)); return; }
      Hh.ask(S, { kind: 'hand', title: 'ทิ้งการ์ด ' + n + ' ใบจากมือ', cardIds: p.hand.slice(), need: n, side: src.side,
        auto: () => p.hand.slice(0, n), resume: v => { drop(Array.isArray(v) ? v : (v ? [v] : [])); Hh.runOps(S, src, ops.slice(i + 1), ctx, 0); } });
      return 'pause';
    }
    if (op.terrainHere) {
      const u = S.cards[src.uid]; const t = u && S.cells[u.r][u.c].terrain;
      if (!t) { say(S, 'ไม่มี Terrain ในช่องนี้', 'dim'); return 'stop'; }
      t.rested = true; say(S, 'วางนอน Terrain ในช่องนี้', 'good');
    }
    if (op.destroyOwnTerrain) {
      const l = Hh.terrains(S, src.side); if (!l.length) { say(S, 'ไม่มี Terrain ของตัวเอง', 'dim'); return 'stop'; }
      return pickFrom(S, src, op, l, 'เลือก Terrain ของคุณเพื่อทำลาย', u => Hh.destroyTerrainObj(S, u));
    }
    if (op.either) {
      const opts = [];
      if (p.hand.length) opts.push({ id: 'hand', name: 'ทิ้งการ์ด 1 ใบจากมือ' });
      const terr = Hh.terrains(S, src.side);
      if (terr.length) opts.push({ id: 'terrain', name: 'ทำลาย Terrain ของคุณ 1 ใบ' });
      if (!opts.length) { say(S, 'ไม่มีสิ่งที่จ่ายได้', 'dim'); return 'stop'; }
      const doIt = w => { if (w === 'terrain') Hh.destroyTerrainObj(S, Hh.terrains(S, src.side)[0]); else { const id = p.hand[0]; p.hand.shift(); p.outzone.push(id); an(S, { t: 'discard', side: src.side, n: 1 }); } };
      if (opts.length === 1 || !Hh.isHuman(src.side)) return doIt(opts[0].id);
      Hh.ask(S, { kind: 'choice', title: op.prompt || 'เลือกวิธีจ่าย', choices: opts, side: src.side, auto: () => opts[0].id, resume: v => { doIt(v); Hh.runOps(S, src, ops.slice(i + 1), ctx, 0); } });
      return 'pause';
    }
    if (op.restPair) {
      const u = S.cards[src.uid]; if (u) { u.rested = true; an(S, { t: 'rest', uid: u.uid }); }
      const list = pool(S, src, 'ownBackRowReady');
      if (!list.length) { say(S, 'ไม่มีunit แถวหลังให้วางนอนด้วย', 'dim'); return 'stop'; }
      return pickFrom(S, src, op, list, 'เลือกอีก 1 ตัวในแถวหลังให้วางนอน', x => { x.rested = true; an(S, { t: 'rest', uid: x.uid }); });
    }
  };
  FX.dropHand = (S, src) => { };
  FX.gain = (S, src, op) => {
    if (op.flare) { S.players[src.side].flare = Math.min(99, S.players[src.side].flare + op.flare); an(S, { t: 'flare', side: src.side, n: op.flare }); say(S, '+ ' + op.flare + ' Flare', 'good'); }
    if (op.points) FX.points(S, src, { n: op.points });
  };
  FX.points = (S, src, op) => {
    const to = op.to === 'foe' ? foeOf(src.side) : src.side, p = S.players[to];
    p.corePoints = Math.max(op.floor != null ? op.floor : 0, p.corePoints + (op.n || 1));
    an(S, { t: 'point', side: to, n: op.n, total: p.corePoints });
    say(S, (op.n >= 0 ? '+' : '') + op.n + ' Core Point → ' + p.deckName + ' (' + p.corePoints + '/' + R.corePointsToWin + ')', op.n >= 0 ? 'good' : 'bad');
    if (op.n > 0 && to === src.side && op.trigger !== false) Z.triggerCheck(S, foeOf(to));
  };
  FX.foePoints = (S, src, op) => FX.points(S, src, { to: foeOf(src.side), n: -Math.abs(op.n || 1), floor: op.floor != null ? op.floor : 1 });
  FX.buff = (S, src, op, ctx, ops, i) => {
    if (op.ask && !src.tgt) { const r = resolveTarget(S, src, { to: 'ask:' + op.ask }, op, ctx, ops, i, op.ask, op.prompt); if (r.pause) return 'pause'; if (r.none) { say(S, 'ไม่มีเป้าหมายสำหรับเพิ่ม/ลดพลัง', 'dim'); return; } }
    let list;
    if (op.to === 'self') list = src.uid && S.cards[src.uid] ? [S.cards[src.uid]] : [];
    else if (op.to === 'ask:ownHighCost' || op.to === 'ownHighCost') { const r2 = resolveTarget(S, src, op, ctx, ops, i, 'ownHighCost', op.prompt); if (r2.pause) return 'pause'; list = src.tgt ? [src.tgt] : []; }
    else list = op.to && op.to.indexOf && op.to.indexOf('ask:') === 0 ? (src.tgt ? [src.tgt] : []) : (src.tgt ? [src.tgt] : []);
    if (!list.length) { say(S, 'ไม่มีเป้าหมาย → ไม่เกิดผล', 'dim'); return; }
    list.forEach(u => {
      if (!u || op.cpLte != null && h().effCp(S, u) > op.cpLte) return;
      if (op.dur === 'battle') u.battleCp = (u.battleCp || 0) + op.n;
      else if (op.dur === 'perm') u.permCp = (u.permCp || 0) + op.n;
      else u.buffCp = (u.buffCp || 0) + op.n;
      an(S, { t: 'buff', uid: u.uid, n: op.n });
      if (op.grantReadyAfterBattle) u.react = (u.react || []).concat([{ hook: 'battleEnd', then: [{ op: 'ready', to: 'self' }] }]);
      say(S, '[' + cdOf(u.id).name + '] CP ' + (op.n > 0 ? '+' : '') + op.n.toLocaleString() + ' (' + (op.dur === 'battle' ? 'จนจบการต่อสู้' : 'จนจบเทิร์น') + ')', op.n > 0 ? 'good' : 'bad');
      src.last = u;
    });
  };
  FX.buffColumn = (S, src, op) => {
    const u = S.cards[src.uid]; if (!u) return;
    mine(S, src.side, x => x.c === u.c && x.uid !== u.uid).forEach(x => { x.buffCp = (x.buffCp || 0) + (op.n || 2000); an(S, { t: 'buff', uid: x.uid, n: op.n || 2000 }); });
    say(S, '+' + ((op.n || 2000)).toLocaleString() + ' CP ให้column เดียวกัน', 'good');
  };
  FX.columnBuff = FX.buffColumn; FX.buffCost6Own = (S, src, op) => { mine(S, src.side, u => (cdOf(u.id).cost || 0) === 6).forEach(u => { u.buffCp = (u.buffCp || 0) + (op.n || 1000); an(S, { t: 'buff', uid: u.uid, n: op.n || 1000 }); }); say(S, 'unit Cost 6 ทุกตัว +' + (op.n || 1000) + ' CP', 'good'); };
  FX.powerTo = (S, src, op) => {
    let list = [];
    if (op.which === 'highestCost') {
      const all = mine(S, src.side);
      const mx = Math.max(0, ...all.map(u => (cdOf(u.id).cost || 0) + (u.costShift || 0)));
      list = all.filter(u => (cdOf(u.id).cost || 0) + (u.costShift || 0) === mx);
    } else list = src.tgt ? [src.tgt] : [];
    list.forEach(u => { u.setPowerBase = op.value; an(S, { t: 'buff', uid: u.uid, n: 0 }); });
    say(S, 'ค่าพลังพื้นฐาน ' + list.length + ' ตัวเป็น ' + (op.value || 0).toLocaleString() + ' จนจบเทิร์น', 'good');
  };
  FX.drawPerPower = (S, src, op) => {
    const n = Math.min(op.max || 2, mine(S, src.side, u => h().effCp(S, u) === op.value).length);
    if (n > 0) { h().draw(S, src.side, n); an(S, { t: 'draw', side: src.side, n }); say(S, 'จั่ว ' + n + ' ใบ', 'good'); } else say(S, 'ไม่มีunit ที่ค่าพลังตรงกับเงื่อนไข', 'dim');
  };
  FX.shiftCost = (S, src, op, ctx, ops, i) => {
    const u = S.cards[src.uid]; if (!u) return;
    const set = d => { u.costShift = (u.costShift || 0) + d; say(S, 'Cost → ' + ((cdOf(u.id).cost || 0) + u.costShift), 'good'); };
    if (!h().isHuman(src.side)) return set(op.n != null ? op.n : 1);
    h().ask(S, { kind: 'choice', title: op.prompt || 'เพิ่มหรือลด Cost 1', side: src.side, choices: [{ id: 1, name: 'เพิ่ม +1' }, { id: -1, name: 'ลด −1' }], auto: () => 1, resume: v => { set(v || 1); h().runOps(S, src, ops.slice(i + 1), ctx, 0); } });
    return 'pause';
  };
  FX.ready = (S, src, op) => setRest(S, src, op, true);
  FX.rest = (S, src, op) => setRest(S, src, op, false);
  function setRest(S, src, op, toReady) {
    let list = op.to === 'self' || !op.to ? (src.uid && S.cards[src.uid] ? [S.cards[src.uid]] : []) : (src.tgt ? [src.tgt] : []);
    if (op.to && op.to.indexOf && op.to.indexOf('ask:') === 0) list = src.tgt ? [src.tgt] : [];
    if (!list.length) { say(S, 'ไม่มีเป้าหมาย', 'dim'); return; }
    list.forEach(u => { if (!u) return; u.rested = !toReady; if (toReady) S.players[u.side].stats.readyByEffect++; an(S, { t: toReady ? 'ready' : 'rest', uid: u.uid }); });
    say(S, (toReady ? 'ตั้ง (Ready)' : 'วางนอน (Rest)') + ' ' + list.length + ' ตัว', 'good');
  }
  FX.readyBackRowOthers = (S, src) => {
    const list = mine(S, src.side, u => u.uid !== src.uid && u.r === R.backRow[src.side] && u.rested);
    list.forEach(u => { u.rested = false; S.players[u.side].stats.readyByEffect++; an(S, { t: 'ready', uid: u.uid }); });
    say(S, 'ตั้ง ' + list.length + ' ตัวในแถวหลัง', 'good');
  };
  FX.readyIfBackRowColor = (S, src, op) => {
    const n = mine(S, src.side, u => u.r === R.backRow[src.side] && cdOf(u.id).color === op.color).length;
    if (n >= (op.count || 2)) { S.cards[src.uid] && an(S, { t: 'ready', uid: src.uid }); say(S, 'มี ' + op.color + ' ในแถวหลัง ' + n + ' ตัว → ลงได้/ตั้ง', 'good'); FX.ready(S, src, { to: 'self' }); }
    else { say(S, 'เงื่อนไขไม่ครบ — ไม่ใช้เอฟเฟกต์', 'dim'); return 'stop'; }
  };
  FX.move = (S, src, op, ctx, ops, i) => {
    let list = [];
    if (op.to === 'self' || !op.to) { const u = S.cards[src.uid]; list = u ? [u] : []; }
    else if (op.to && op.to.indexOf('ask:') === 0) {
      const r = resolveTarget(S, src, op, ctx, ops, i, op.to.slice(4), op.prompt);
      if (r.pause) return 'pause'; if (r.none) { say(S, 'ไม่มีunit ให้เคลื่อน', 'dim'); return; }
      list = src.tgt ? [src.tgt] : [];
    } else list = src.tgt ? [src.tgt] : [];
    list.forEach(u => {
      if (!u) return;
      const dirs = op.dir ? [op.dir] : ['fwd', 'side', 'back'];
      const ok = dirs.some(d => h().execStepMove(S, u, d, op.n || 1));
      an(S, { t: ok ? 'move' : 'noop', uid: u.uid });
      say(S, (ok ? 'เลื่อน ' : 'ถูกบล็อก/ออกขอบ — ไม่เลื่อน: ') + cdOf(u.id).name, ok ? 'good' : 'dim');
    });
  };
  FX.moveSideIfPositive = (S, src, op) => { const u = src.last || src.tgt; if (!u) return; if (h().effCp(S, u) > 0) ['side', 'fwd', 'back'].some(d => h().execStepMove(S, u, d, 1)) ? say(S, '→ เลื่อน 1 ช่องให้', 'good') : say(S, '→ เลื่อนไม่ได้ (blocked)', 'dim'); else say(S, 'ค่าพลังเป็น 0 แล้ว', 'dim'); };
  FX.ifPowerPositiveMoveSide = FX.moveSideIfPositive;
  FX.moveSelfToRow = (S, src, op) => FX.move(S, src, { to: 'self', dir: op.dir || 'back', n: op.n || 1 });
  FX.readyAfterBattle = (S, src, op) => { const u = src.tgt || (src.uid && S.cards[src.uid]); if (u) { u.react = (u.react || []).concat([{ hook: 'battleEnd', then: [{ op: 'ready', to: (src.tgt ? 'target' : 'self') }] }]); say(S, 'ตั้งได้หลังจบการที่ attacking', 'good'); } };
  FX.swap = (S, src, op, ctx, ops, i) => {
    const a = S.cards[src.uid];
    let b = (src.eff && S.cards[src.eff.movedUid]) || src.tgt;
    if (op.to && op.to.indexOf && op.to.indexOf('ask:') === 0 && !src.tgt) { const r = resolveTarget(S, src, op, ctx, ops, i, op.to.slice(4), op.prompt); if (r.pause) return 'pause'; b = src.tgt; }
    if (!a || !b || a === b) { say(S, 'สลับไม่ได้ (ไม่มีอีกตัว)', 'dim'); return; }
    const t = { r: a.r, c: a.c }; S.cells[a.r][a.c].unit = b; S.cells[b.r][b.c].unit = a; b.r = t.r; b.c = t.c;
    an(S, { t: 'move', uid: a.uid }); an(S, { t: 'move', uid: b.uid });
    say(S, '⇄ สลับที่ ' + cdOf(a.id).name + ' ↔ ' + cdOf(b.id).name, 'good');
  };
  FX.destroy = (S, src, op, ctx, ops, i) => {
    let list = [];
    if (op.to === 'self') list = S.cards[src.uid] ? [S.cards[src.uid]] : [];
    else if (op.to && op.to.indexOf('ask:') === 0) { const r = resolveTarget(S, src, op, ctx, ops, i, op.to.slice(4), op.prompt || 'เลือกunit ทำลาย'); if (r.pause) return 'pause'; list = src.tgt ? [src.tgt] : []; }
    else list = src.tgt ? [src.tgt] : [];
    list.forEach(u => { if (!u) return; if (op.cpLte != null && h().effCp(S, u) > op.cpLte) { say(S, 'CP เป้าสูงกว่าเงื่อนไข — รอด', 'dim'); return; } h().destroyTo(S, u, 'ผลความสามารถ —'); });
    if (!list.length) say(S, 'ไม่มีเป้าหมาย', 'dim');
  };
  FX.bounce = (S, src, op, ctx, ops, i) => {
    let list = [];
    if (op.to === 'randomReadiedBackRow') list = mine(S, src.side, u => u.r === R.backRow[src.side] && !u.rested).slice(0, 1);
    else if (op.to && op.to.indexOf('ask:') === 0) { const r = resolveTarget(S, src, op, ctx, ops, i, op.to.slice(4), op.prompt || 'เลือกunit ส่งกลับมือ'); if (r.pause) return 'pause'; list = src.tgt ? [src.tgt] : []; }
    else list = src.tgt ? [src.tgt] : [];
    list.forEach(u => {
      if (!u) return;
      if (h().staticOf(cdOf(u.id), 'untargetable') && u.side !== src.side) { say(S, '[' + cdOf(u.id).name + '] หลีกเลี่ยงการถูกเลือก', 'dim'); return; }
      S.returnedThisTurn = S.returnedThisTurn || {}; S.returnedThisTurn[u.id] = S.turnNo;
      h().leaveField(S, u, 'hand'); an(S, { t: 'destroy', uid: u.uid, cardId: u.id });
      src.eff = Object.assign({}, src.eff, { returnedColor: cdOf(u.id).color, returnedTribe: cdOf(u.id).tribe });
      say(S, '[' + cdOf(u.id).name + '] กลับขึ้นมือ', 'info');
    });
    if (!list.length) say(S, 'ไม่มีunit ส่งกลับมือ', 'dim');
  };
  FX.noDestroy = (S, src, op) => { const u = (src.eff && S.cards[src.eff.target]) || src.tgt; if (!u) { say(S, 'ไม่มีunit ที่ถูกโจมตี', 'dim'); return; } u.noDestroyBattle = true; an(S, { t: 'buff', uid: u.uid, n: 0 }); say(S, '🛡 [' + cdOf(u.id).name + '] ไม่ถูกทำลายจากการต่อสู้ครั้งนี้', 'guard'); if (op.thenMoveBack) h().execStepMove(S, u, 'back', 1); };
  FX.protect = (S, src, op) => {
    const u = (src.eff && S.cards[src.eff.target]) || src.tgt;
    if (!u) { say(S, 'ไม่มีunit ที่กำลังถูกโจมตี', 'dim'); return; }
    if (op.buff) { u.battleCp = (u.battleCp || 0) + op.buff; an(S, { t: 'buff', uid: u.uid, n: op.buff }); }
    if (op.grantNoDestroy) { u.noDestroyBattle = true; if (op.thenMoveBack) h().execStepMove(S, u, 'back', 1); }
    say(S, '🛡 ปกป้อง [' + cdOf(u.id).name + ']' + (op.buff ? ' +' + op.buff.toLocaleString() + ' CP' : ''), 'guard');
  };
  FX.perOwnedGreenTerrainBuff = (S, src, op, ctx, ops, i) => {
    const per = h().terrains(S, src.side).length + mine(S, src.side, u => cdOf(u.id).color === 'Green').length;
    const list = pool(S, src, 'battlingGreen');
    if (!list.length) { say(S, 'ไม่มีunit เขียวในการต่อสู้', 'dim'); return; }
    const go = u => { u.battleCp = (u.battleCp || 0) + (op.n || 1000) * Math.max(1, per); an(S, { t: 'buff', uid: u.uid, n: (op.n || 1000) * per }); say(S, '[' + cdOf(u.id).name + '] +' + ((op.n || 1000) * Math.max(1, per)).toLocaleString() + ' CP (Terrain+Green ' + per + ')', 'good'); };
    if (list.length === 1 || !h().isHuman(src.side)) return go(list[0]);
    h().ask(S, { kind: 'target', title: 'เลือกunit เขียวของการต่อสู้นี้', uids: list.map(u => u.uid), side: src.side, auto: () => list[0].uid, resume: v => v && go(S.cards[v]) });
    return 'pause';
  };
  FX.battleEffect = (S, src, op) => { S.battleOverride = S.battleOverride || {}; S.battleOverride[op.name] = src.side; say(S, 'ตั้งกติกาพิเศษให้การต่อสู้ครั้งนี้ (' + op.name + ')', 'guard'); };
  FX.banishRemove = (S, src) => {
    const p = S.players[src.side], id = src.cardId || (src.eff && src.eff.cardId);
    if (!id) return;
    [p.hand, p.outzone].forEach(arr => { const k = arr.indexOf(id); if (k >= 0) { arr.splice(k, 1); p.remove.push(id); an(S, { t: 'destroy', uid: null, cardId: id }); say(S, 'banish [' + cdOf(id).name + '] → Removezone', 'bad'); } });
  };
  FX.mergeDeck = (S, src, op) => {
    const u = S.cards[src.uid], p = S.players[src.side]; if (!u) return;
    let n = 0; for (let k = 0; k < (op.n || 1); k++) { if (!p.deck.length) break; u.fused = (u.fused || []).concat([p.deck.shift()]); n++; }
    if (n) { an(S, { t: 'ascend', uid: u.uid }); say(S, '⛓ Merge ' + n + ' ใบบนสุดใต้ [' + cdOf(u.id).name + ']', 'good'); }
  };
  FX.applyCellOnPlay = (S, src) => { say(S, 'ใช้ผล [On Play] ของ Terrain ที่ช่องนี้', 'info'); if (S.reveal && S.reveal.ids) FX.reveal(S, src, { n: 0, again: true }); };
  FX.reveal = (S, src, op, ctx, ops, i) => {
    const Hh = h();
    if (op.again && S.reveal) { /* ซ้ำจากรอบก่อน */ }
    if (op.of === 'foe') {
      const p2 = S.players[foeOf(src.side)], ids = p2.deck.slice(0, op.n || 1);
      S.reveal = { side: foeOf(src.side), ids, reason: 'เปิดดูสมุดฝ่ายตรงข้าม' };
      Hh.fxq(S, { t: 'reveal', side: foeOf(src.side), ids, reason: 'ฝ่ายตรงข้าม' });
      say(S, 'อีกฝ่ายเปิดดู ' + ids.length + ' ใบ: ' + ids.map(x => cdOf(x).name).join(' / '), 'info');
      return;
    }
    const n = op.n || 1;
    const ids = n ? Hh.revealTop(S, src.side, n, op.prompt || 'เปิดดูสมุด') : ((S.reveal || {}).ids || []).slice();
    if (!ids.length) { say(S, 'ไม่มีอะไรให้เปิด (สมุดว่าง)', 'dim'); return; }
    let ok = ids.filter(id => {
      if (!cdOf(id)) return false;
      if (op.onlyType && cdOf(id).type !== op.onlyType) return false;
      if (op.cost && cdOf(id).cost > op.cost && !(op.costExact && cdOf(id).cost !== op.cost)) { if (op.cost && cdOf(id).cost > op.cost) return false; }
      if (op.costExact != null && cdOf(id).cost !== op.costExact) return false;
      const fl = op.filter || {};
      if (fl.color && cdOf(id).color !== fl.color) return false;
      if (fl.tribe && !(cdOf(id).tribe || '').includes(fl.tribe)) return false;
      if (fl.cost != null && cdOf(id).cost > fl.cost) return false;
      if (fl.type === 'TerrainOrCommand' && !['terrain', 'command'].includes(cdOf(id).type)) return false;
      if (fl.type && cdOf(id).type !== fl.type) return false;
      if (fl.unit === 1 && cdOf(id).type !== 'unit') return false;
      if (fl.unit === 'not' && cdOf(id).type === 'unit') return false;
      if (op.filterStr && !Hh.matchFilter(S, id, op.filterStr)) return false;
      return true;
    });
    if (!ok.length) { Hh.restToBottom(S, src.side, ids); say(S, 'ไม่มีการ์ดตรงเงื่อนไข (รวม ' + ids.length + ' ใบ) → กลับใต้สมุด', 'dim'); return; }
    const finish = v => {
      const left = ids.slice();
      if (v) { const k = left.indexOf(v); if (k >= 0) left.splice(k, 1); Hh.toHand(S, src.side, v); Hh.fxq(S, { t: 'tohand', side: src.side, cardId: v }); say(S, 'นำ [' + cdOf(v).name + '] ขึ้นมือ', 'good'); }
      else say(S, 'ไม่เลือกใบใด', 'dim');
      if (op.field && v && cdOf(v).type === 'unit') { /* เลือกแล้วลงสนามแทน */ }
      left.forEach(id => { const j = S.players[src.side].deck.indexOf(id); if (j < 0) { const s2 = S.players[src.side]; const hh2 = s2.hand.indexOf(id); if (hh2 >= 0) s2.hand.splice(hh2, 1); } });
      Hh.restToBottom(S, src.side, left.filter(id => cdOf(id)));
      if (op.then && op.then.length) Hh.runOps(S, src, op.then, ctx, 0);
    };
    if (ok.length === 1 || !Hh.isHuman(src.side)) return finish(ok[0]);
    Hh.ask(S, { kind: 'reveal', title: op.prompt || 'เลือกการ์ดจาก ' + ids.length + ' ใบที่เปิดดู', sub: ok.length !== ids.length ? 'เฉพาะใบที่ตรงเงื่อนไข (' + ok.length + ')' : '', cardIds: ids.slice(), pickIds: ok.slice(), allowSkip: true, side: src.side, auto: () => ok[0], resume: finish });
    return 'pause';
  };
  FX.revealCountOf = (S, src, op, ctx, ops, i) => {
    const n = Math.max(1, mine(S, src.side, u => (op.colors || []).includes(cdOf(u.id).color) || (op.tribes || []).some(t => (cdOf(u.id).tribe || '').includes(t))).length);
    return FX.reveal(S, src, Object.assign({}, op, { n, prompt: 'เปิดดู ' + n + ' ใบบนสมุด (นับจากunit ที่คุมอยู่)' }), ctx, ops, i);
  };
  FX.revealTop = (S, src, op, ctx, ops, i) => FX.reveal(S, src, Object.assign({ n: op.n || 1 }, op), ctx, ops, i);
  FX.transfer = (S, src, op, ctx, ops, i) => {
    const p = S.players[src.side], Hh = h();
    const zone = z => (z === 'hand' ? p.hand : z === 'outzone' ? p.outzone : z === 'remove' ? p.remove : z === 'deck' ? p.deck : z === 'reveal' ? ((S.reveal || {}).ids || []) : []);
    const flt = id => {
      const c = cdOf(id), f = op.filter || {};
      if (!f) return true;
      if (typeof f === 'string') return f.split('|').some(x => (c.tribe || '').includes(x) || c.type === x || c.color === x || c.name.includes(x));
      if (f.color && c.color !== f.color) return false;
      if (f.type && c.type !== f.type && !(f.type === 'Operation' && /Operation/i.test(c.tribe || ''))) return false;
      if (f.tribe && !(c.tribe || '').includes(f.tribe)) return false;
      if (f.cost != null && c.cost > f.cost) return false;
      if (f.costExact != null && c.cost !== f.costExact) return false;
      return true;
    };
    if (op.from === 'backRowReadyToRemove') {
      const list = mine(S, src.side, u => u.r === R.backRow[src.side] && !u.rested);
      const need = op.n || 1;
      if (list.length < need && !op.allowLess) { say(S, 'ต้องการunit แถวหลังที่วางตั้ง ' + need + ' (มี ' + list.length + ')', 'dim'); return 'stop'; }
      const doTake = arr => {
        (arr || list).slice(0, need).forEach(u => { Hh.leaveField(S, u, op.to || 'remove'); Hh.fxq(S, { t: 'destroy', uid: u.uid, cardId: u.id }); });
        say(S, 'banish ' + Math.min(need, list.length) + ' ใบจากแถวหลัง → Removezone', 'bad');
        if (op.thenReturnToField || op.self !== false) FX.returnFieldRested(S, src, { rested: true });
      };
      if (list.length <= need || !Hh.isHuman(src.side)) return doTake(list.slice(0, need));
      Hh.ask(S, { kind: 'multi', title: 'เลือก ' + need + ' ยูนิตในแถวหลังของคุณเพื่อ banish', uids: list.map(u => u.uid), need, side: src.side, auto: () => list.slice(0, need).map(u => u.uid), resume: v => { doTake((v || []).map(x => S.cards[x]).filter(Boolean)); Hh.runOps(S, src, ops.slice(i + 1), ctx, 0); } });
      return 'pause';
    }
    const srcArr = zone(op.from);
    const cands = srcArr.filter(id => id && cdOf(id) && flt(id));
    if (!cands.length) { say(S, 'ไม่มีใน ' + op.from + ' ที่ตรงเงื่อนไข', 'dim'); return 'stop'; }
    const take = id => {
      const arr = zone(op.from), k = arr.indexOf(id); if (k >= 0) arr.splice(k, 1);
      if (op.to === 'hand') Hh.toHand(S, src.side, id);
      else if (op.to === 'deckBottom') p.deck.push(id);
      else if (op.to === 'field') {
        const isTerr = cdOf(id).type === 'terrain';
        const rows = isTerr ? [R.frontRow[src.side]] : [R.backRow[src.side]];
        const cell = (isTerr ? Hh.frontCells(S, src.side)[0] : Hh.emptyCells(S, src.side, rows)[0]);
        if (!cell) { say(S, 'ไม่มีช่องว่างให้ลงไป', 'dim'); return; }
        const u = Hh.makeCard(S, id, src.side, cell.r, cell.c, cdOf(id).type === 'terrain' ? 'terrain' : 'unit');
        if (op.rested) u.rested = true; Hh.fxq(S, { t: 'deploy', uid: u.uid, cell: [cell.r, cell.c] });
        say(S, '◐ [' + cdOf(id).name + '] → สนาม' + (op.rested ? ' (วางนอน)' : ''), 'good');
        Hh.runHook(S, src.side, u.uid, 'deploy', {});
        return;
      } else if (op.to === 'outzone') p.outzone.push(id);
      else if (op.to === 'remove') p.remove.push(id);
      Hh.fxq(S, { t: 'tohand', side: src.side, cardId: id });
      say(S, '[' + cdOf(id).name + '] ' + op.from + ' → ' + op.to, 'good');
    };
    if (cands.length === 1 || !Hh.isHuman(src.side)) { cands.slice(0, op.n || 1).forEach(take); return; }
    Hh.ask(S, { kind: op.from === 'outzone' ? 'outzone' : op.from === 'hand' ? 'hand' : 'reveal', title: op.prompt || 'เลือกการ์ดจาก ' + op.from, cardIds: cands.slice(), pickIds: cands.slice(), side: src.side, need: op.n || 1,
      auto: () => cands[0], resume: v => { (Array.isArray(v) ? v : [v]).filter(Boolean).forEach(take); } });
    return 'pause';
  };
  FX.recoverOutzone = (S, src, op) => FX.transfer(S, src, { from: 'outzone', to: 'hand', filter: op.filter || op.kinds, n: op.n || 1, prompt: op.prompt || 'เลือกการ์ดจาก Outzone' });
  FX.recoverOutzoneByCost = FX.recoverOutzone;
  FX.recoverOutzoneTribe = FX.recoverOutzone;
  FX.returnFieldRested = (S, src, op) => {
    const p = S.players[src.side], Hh = h();
    let id = src.cardId || (src.eff && src.eff.cardId);
    let from = 'remove';
    if (!id || p.remove.indexOf(id) < 0) { if (id && p.outzone.indexOf(id) >= 0) from = 'outzone'; else { id = p.remove[0] || p.outzone[0]; from = p.remove.length ? 'remove' : 'outzone'; } }
    if (!id) { say(S, 'ไม่มีใบให้เรียกคืน', 'dim'); return; }
    const arr = p[from], k = arr.indexOf(id); if (k < 0) { say(S, 'ไม่พบการ์ดใน ' + from, 'dim'); return; }
    const cell = Hh.emptyCells(S, src.side, [R.backRow[src.side]])[0];
    if (!cell) { say(S, 'แถวหลังเต็ม', 'dim'); return; }
    arr.splice(k, 1);
    const u = Hh.makeCard(S, id, src.side, cell.r, cell.c, 'unit');
    if (op.rested !== false) u.rested = true;
    Hh.fxq(S, { t: 'deploy', uid: u.uid, cell: [cell.r, cell.c] });
    say(S, '◐ เรียก [' + cdOf(id).name + '] จาก ' + from + ' กลับลงสนาม (วางนอน)', 'good');
  };
  FX.playFromHandTribe = (S, src, op) => {
    const p = S.players[src.side], Hh = h();
    const cells = Hh.emptyCells(S, src.side, [R.backRow[src.side]]).slice();
    const self = S.cards[src.uid], c0 = cells.shift();
    if (self && c0) { const sid = self.id; Hh.leaveField(S, self, 'outzone'); const nu = Hh.makeCard(S, sid, src.side, c0.r, c0.c, 'unit'); Hh.fxq(S, { t: 'deploy', uid: nu.uid, cell: [c0.r, c0.c] }); say(S, '◮ [' + cdOf(sid).name + '] ลงสนาม Trigger', 'good'); }
    for (let k = 0; k < (op.n || 1) - 1 && cells.length; k++) {
      const i2 = p.hand.findIndex(id => cdOf(id).type === 'unit' && (cdOf(id).tribe || '').includes(op.tribe));
      if (i2 < 0) break;
      const id = p.hand.splice(i2, 1)[0], cell = cells.shift();
      const u = Hh.makeCard(S, id, src.side, cell.r, cell.c, 'unit');
      Hh.fxq(S, { t: 'deploy', uid: u.uid, cell: [cell.r, cell.c] });
      say(S, '⛬ เรียก [' + cdOf(id).name + '] จากมือไม่ใช้ Flare', 'good');
      Hh.runHook ? null : Hh.runHook(S, src.side, u.uid, 'deploy', {});
    }
  };
  FX.ascendDeploy = (S, src, op, ctx, ops, i) => {
    const Hh = h(), u = S.cards[src.uid]; if (!u) return;
    const hosts = mine(S, src.side, x => x.uid !== u.uid && x.r === R.backRow[src.side] && cdOf(x.id).type === 'unit');
    if (!hosts.length) { say(S, 'ไม่มีunit ให้ Ascend ทับ', 'dim'); return; }
    const go = host => {
      if (!host) return;
      if (op.refundColor && cdOf(host.id).color === op.refundColor) { S.players[src.side].flare = Math.min(99, S.players[src.side].flare + (cdOf(u.id).cost || 0)); say(S, 'สีตรง → คืน Flare ตาม Cost (' + (cdOf(u.id).cost || 0) + ')', 'good'); }
      host.fused = (host.fused || []).concat([u.id]); host.ascended = true; host.permCp = (host.permCp || 0) + 1000;
      Hh.leaveField(S, u, 'outzone'); Hh.fxq(S, { t: 'ascend', uid: host.uid });
      say(S, '♛ Ascend ทับ [' + cdOf(host.id).name + '] (Fused ' + host.fused.length + ' · +1,000 CP)', 'good');
    };
    if (hosts.length === 1 || !Hh.isHuman(src.side)) return go(hosts[0]);
    Hh.ask(S, { kind: 'target', title: 'เลือกunit วางทับ (Ascend)', uids: hosts.map(x => x.uid), side: src.side, auto: () => hosts[0].uid, resume: v => go(v && S.cards[v]) });
    return 'pause';
  };
  FX.declareMatch = (S, src, op, ctx, ops, i) => {
    const p = S.players[src.side], Hh = h();
    src.decl = src.decl || {};
    const step = (spec) => { Hh.ask(S, spec); return 'pause'; };
    if (!src.decl.color) return step({ kind: 'choice', title: 'ประกาศสี 1 สี', side: src.side, choices: ['Yellow', 'Blue', 'Red', 'Green', 'Purple'].map(c => ({ id: c, name: c })), auto: () => 'Blue', resume: v => { src.decl.color = v; Hh.runOps(S, src, [op], ctx, 0); } });
    if (!src.decl.type) return step({ kind: 'choice', title: 'ประกาศชนิดการ์ด 1 ชนิด', side: src.side, choices: [{ id: 'unit', name: 'UNIT' }, { id: 'command', name: 'COMMAND' }, { id: 'terrain', name: 'TERRAIN' }], auto: () => 'unit', resume: v => { src.decl.type = v; Hh.runOps(S, src, [op], ctx, 0); } });
    const id = p.deck.shift();
    if (!id) { say(S, 'สมุดว่าง', 'dim'); return; }
    S.reveal = { side: src.side, ids: [id], reason: 'เปิดดูใบบนสุด' };
    Hh.fxq(S, { t: 'reveal', side: src.side, ids: [id], reason: 'Slight of Hand' });
    const ok = cdOf(id).color === src.decl.color && cdOf(id).type === src.decl.type;
    if (ok) { Hh.toHand(S, src.side, id); say(S, '[' + cdOf(id).name + '] ตรงทั้งสี+ชนิด → ขึ้นมือ', 'good'); }
    else { p.deck.push(id); say(S, '[' + cdOf(id).name + '] ไม่ตรง → กลับใต้สมุด', 'dim'); }
    src.decl = {};
    if (op.thenRevealFoe && S.players[foeOf(src.side)].deck.length) { const fid = S.players[foeOf(src.side)].deck[0]; S.reveal = { side: foeOf(src.side), ids: [fid], reason: 'เปิดดูใบบนสุดฝ่ายตรงข้าม' }; Hh.fxq(S, { t: 'reveal', side: foeOf(src.side), ids: [fid], reason: 'เปิดดู' }); say(S, 'ใบบนสุดของอีกฝ่าย: [' + cdOf(fid).name + ']', 'info'); }
  };
  FX.chooseTwo = (S, src, op, ctx, ops, i) => {
    const opts = (op.list || []).filter(Boolean);
    if (!opts.length) return;
    if (!h().isHuman(src.side)) return runOpt(opts[0]);
    h().ask(S, { kind: 'choice', title: op.prompt || 'เลือก 1', choices: opts.map((o, k) => ({ id: k, name: o.prompt || ('ตัวเลือก ' + (k + 1)) })), side: src.side, auto: () => 0, resume: v => runOpt(opts[v || 0]) });
    return 'pause';
    function runOpt(o) { const sub = Object.assign({}, o, { to: o.to || 'ask:machine' }); h().runOps(S, src, [sub], ctx, 0); }
  };
  FX.onPlay = (S, src, op) => {                 /* ลงทะเบียน react */
    const u = src.uid && S.cards[src.uid];
    const holder = u || null;
    const rec = { hook: op.hook, once: op.once, then: op.then, effect: op.effect, n: op.n, count: op.count, ifRow: op.ifRow, done: false };
    if (holder) holder.react = (holder.react || []).concat([rec]);
    else { S.cellHooks = S.cellHooks || []; S.cellHooks.push(Object.assign({ cardId: src.cardId, side: src.side }, rec)); }
    if (!u && src.cardId) say(S, 'ลงทะเบียนผล "' + op.hook + '" ของ [' + cdOf(src.cardId).name + ']', 'dim');
  };

  /* ================== hook dispatcher ================== */
  function eachHook(S, fn) {
    Object.values(S.cards).forEach(u => (u.react || []).forEach(r => fn(u, r)));
    (S.cellHooks || []).forEach(r => fn(null, r));
  }
  window.Zhook = function (name, S, arg) {
    const Hh = h();
    window.Zhook.__last = arg;
    eachHook(S, (u, r) => {
      if (!r || r.hook !== name) return;
      if (r.once && r.done) return;
      if (r.ifRow && u && u.r !== R.frontRow[u.side]) return;
      if (name === 'allyMove' && u && arg && arg.uid === u.uid) return;
      if (u) r.done = true;
      const src = { side: (u && u.side) || S.active, uid: u && u.uid, cardId: u && u.id, eff: Object.assign({}, arg || {}) };
      if (r.effect) r = Object.assign({}, r, {})
      if (src.uid) { const uu = S.cards[src.uid]; src.tgt = (arg && arg.movedUid && S.cards[arg.movedUid]) || null; }
      if (r.effect) { const f = HK[r.effect]; if (f) { Hh.log(S, '  ⟲ ' + r.effect + ' ← ' + (u ? '[' + cdOf(u.id).name + ']' : 'Terrain'), 'play'); Hh.fxq(S, { t: 'effect', uid: u && u.uid, side: src.side, kw: 'react', text: r.effect }); f(S, src, r); } return; }
      if (r.then && r.then.length) { Hh.log(S, '  ⟲ react "' + r.hook + '" → [' + cdOf(u.id).name + ']', 'play'); Hh.fxq(S, { t: 'effect', uid: u && u.uid, side: src.side, kw: 'react', text: r.hook }); Hh.runOps(S, src, r.then, {}, 0); }
    });
    if (name === 'operationPlayed' || name === 'commandPlayed') columnBuffs(S, name);
  };
  function columnBuffs(S, name) {
    const Hh = h(), key = name === 'operationPlayed' ? 'columnBuffOnOperation' : 'columnBuffOnCommand';
    Object.values(S.cards).forEach(u => {
      const st = Hh.staticOf(cdOf(u.id), key); if (!st) return;
      const n = st.n || 2000;
      Hh.units(S, u.side).filter(x => x.c === u.c && x.uid !== u.uid && x.side === u.side).forEach(x => { x.buffCp = (x.buffCp || 0) + n; Hh.fxq(S, { t: 'buff', uid: x.uid, n }); });
      Hh.log(S, '  ↳ [' + cdOf(u.id).name + '] → +' + n.toLocaleString() + ' CP ในcolumn เดียวกัน', 'good');
    });
  }

  HK.killSelfIfBlueFoeDies = (S, src, r) => {
    const arg = r.__arg || {};
    if (arg.color !== 'Blue') return;
    const u = src.uid && S.cards[src.uid];
    if (u) { h().destroyTo(S, u, 'ผลต่อเนื่อง — Machine สีน้ำเงินถูกทำลาย'); }
  };
  /* --- ops ที่ data.js / ability-ops.js เรียกแต่ engine ไม่มี --- */
  FX.costLock = (S, src, op) => {
    const Hh = h(), list = Hh.targetSet(S, src, { to: op.to || 'unitInCell' });
    list.filter(Boolean).forEach(u => {
      if (op.maxCost != null && (cdOf(u.id).cost || 0) > op.maxCost) return;
      u.costLocked = op.value; Hh.fxq(S, { t: 'buff', uid: u.uid, n: 0 });
      Hh.log(S, '  ↳ Cost ของ [' + cdOf(u.id).name + '] ถูกล็อกเป็น ' + op.value, 'info');
    });
  };
  FX.revealTopRestBottom = (S, src, op) => FX.reveal(S, src, Object.assign({ restBottomAll: true }, op));
  FX.deploySelf = (S, src, op) => {
    const Hh = h(), p = S.players[src.side];
    if (S.cards[src.uid]) { say(S, 'ลง สนาม แล้ว (อยู่บนสนาม)', 'dim'); return; }
    const rows = op.row === 'front' ? [R.frontRow[src.side]] : [R.backRow[src.side]];
    const cell = Hh.emptyCells(S, src.side, rows)[0] || Hh.emptyCells(S, src.side, [R.frontRow[src.side], R.backRow[src.side]])[0];
    if (!cell) { say(S, 'ไม่มีช่องว่าง → ไม่สามารถลงสนามได้', 'dim'); return; }
    let id = src.cardId;
    const froms = [p.hand, p.outzone, p.remove];
    for (const arr of froms) { const k = arr.indexOf(id); if (k >= 0) { arr.splice(k, 1); break; } }
    const u = Hh.makeCard(S, id, src.side, cell.r, cell.c, 'unit');
    if (op.rested) u.rested = true;
    Hh.fxq(S, { t: 'deploy', uid: u.uid, cell: [cell.r, cell.c] });
    say(S, '◮ [' + cdOf(id).name + '] ลงสนาม' + (op.rested ? ' (วางนอน)' : ''), 'good');
    Hh.runHook(S, src.side, u.uid, 'deploy', {});
  };
  FX.destroySelf = (S, src) => { const u = S.cards[src.uid]; if (u) { h().destroyTo(S, u, 'ทำลายตัวเอง —'); say(S, '☠ [' + cdOf(u.id).name + '] ถูกทำลาย', 'bad'); } };
  FX.buffMachineOrAll = (S, src, op) => {
    let list = mine(S, src.side, u => (cdOf(u.id).tribe || '').includes('Machine'));
    if (!list.length) list = mine(S, src.side);
    list.forEach(u => { u.buffCp = (u.buffCp || 0) + (op.n || 3000); an(S, { t: 'buff', uid: u.uid, n: op.n || 3000 }); if (op.grantReadyAfterBattle) u.react = (u.react || []).concat([{ hook: 'battleEnd', then: [{ op: 'ready', to: 'self' }] }]); });
    say(S, (list.length ? list.length + ' ตัว +' + (op.n || 3000).toLocaleString() + ' CP' : 'ไม่มีเป้าหมาย'), 'good');
  };
  FX.ifPlayedWithoutFlareRest = (S, src) => { if (test(S, src, { kind: 'playedWithoutFlare' })) FX.rest(S, src, { to: 'self' }); else say(S, 'ร่ายด้วย Flare → ไม่ต้องวางนอน', 'dim'); };
  /* variant ที่ต้องใช้ชื่อคนละกับ engine (engine มี case 'move'/'destroy'/'bounce'/'swap' ของตัวเอง) */
  FX.fxMove = (S, src, op, ctx, ops, i) => FX.move(S, src, op, ctx, ops, i);
  FX.fxDestroy = (S, src, op, ctx, ops, i) => FX.destroy(S, src, op, ctx, ops, i);
  FX.fxBounce = (S, src, op, ctx, ops, i) => FX.bounce(S, src, op, ctx, ops, i);
  FX.fxSwap = (S, src, op, ctx, ops, i) => FX.swap(S, src, op, ctx, ops, i);
  FX.fxReady = (S, src, op, ctx, ops, i) => setRest(S, src, op, true);
  FX.fxRest = (S, src, op, ctx, ops, i) => setRest(S, src, op, false);

  /* op ไม่รู้จัก → เตือนใน log ไม่เงียบ */
  window.Zfx = new Proxy(FX, {
    get(t, k) {
      if (Object.prototype.hasOwnProperty.call(t, k)) return t[k];
      return (S, src, op) => h().log(S, '  ⚠ op "' + String(k) + '" ยังไม่ implement บน [' + cdOf((src && src.cardId) || '').name + ']', 'bad');
    },
  });
})();
