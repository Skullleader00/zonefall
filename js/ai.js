/* ==========================================================================
   ZONEFALL — AI ( heuristic planner )
   เป้าหมาย: ครอง Core Zone → เก็บ Core Point ครบ 7 ก่อน และกันเป้าสำคัญ
   ========================================================================== */
const ZAI = (function () {
  const R = Z.R, card = Z.card;
  const cp = (S, u) => Z.effCp(S, u);
  const inCore = u => u.r === R.coreRow;
  const coreUnits = (S, s) => Z.units(S, s).filter(inCore);

  function value(S, u) {
    const cd = card(u.id);
    return cp(S, u) / 1000 + (cd.type === 'arcanum' ? 1.5 : 0) + (inCore(u) ? 2.5 : 0) + (u.rested ? 0 : 0.6);
  }

  /* ---------- ตอบโต้ (หน้าต่าง Declaration-Response) ---------- */
  function aiTrigger(S, side, cardId, ab) {
    const t = (ab[0].ops || []);
    if (t.some(o => ['point','core','draw','flare','toHand'].includes(o.op))) return true;
    if (t.some(o => o.op === 'mill') && S.players[side].deck.length < 8) return false;
    return S.players[side].hand.length < 7 || t.some(o => o.op === 'cp' || o.op === 'destroy');
  }
  function respond(S, side, ev, opts) {
    const p = S.players[side];
    if (!opts.length) return null;
    const tgt = ev.tgt;
    // 1) have a lethal-ish attack incoming on a valuable unit -> cancel/counter
    const atkU = ev.args && S.cards[ev.args.uid];
    const needCancel = ev.kind === 'attack' && tgt && tgt.side === side &&
      (atkU ? cp(S, atkU) >= cp(S, tgt) : false) || (tgt && tgt.side === side && value(S, tgt) >= 5.5);
    const bigSpell = ev.kind === 'command' && S.players[ev.actor] && S.players[ev.actor].flare >= 3;
    const deployingThreat = ev.kind === 'deploy' && coreUnits(S, side).length >= 2 && coreUnits(S, ev.actor).length >= 1;
    if (!(needCancel || bigSpell || deployingThreat)) return null;
    // เลือกใบที่ 'cancel' ก่อน ถ้าไม่มีใช้ใบที่ถูกสุดที่มีops ทำลาย/ ความเสียหาย
    let best = null;
    opts.forEach(i => {
      const cd = card(p.hand[i]);
      const ab = (cd.abilities || []).find(a => a.kw === 'Counter' || a.kw === 'Quick-Cast');
      const cancels = ab && ab.ops && ab.ops.some(o => o.op === 'cancel');
      const score = (cancels ? 5 : 2) - cd.cost * 0.3;
      if (!best || score > best.score) best = { i, score };
    });
    if (!best) return null;
    const cd = card(p.hand[best.i]);
    if (cd.cost > p.flare) return null;
    // กันไว้ในกรณีจำเป็นจริง ๆ เท่านั้น (Flare ของเราจะรีเซ็ตอยู่แก่)
    if (!needCancel && cd.cost >= 2 && !bigSpell) return null;
    return best.i;
  }

  /* ---------- ตัวช่วยเลือกตำแหน่ง ---------- */
  function bestDeployCell(S, side, cd) {
    const r = R.backRow[side];
    const order = [1, 0, 2].filter(c => !Z.cell(S, r, c).unit);
    return order.length ? { r, c: order[0] } : null;
  }

  function terrainCell(S, side) {
    const cells = Z.frontCells(S, side);
    if (!cells.length) return null;
    // ชอบช่องกลาง (คุมทางเข้า Core)
    cells.sort((a, b) => Math.abs(a.c - 1) - Math.abs(b.c - 1));
    return cells[0];
  }

  /* ---------- แพลนหลัก ---------- */
  function blocked(S) { return !!S.uiAsk || !!S.pending; }
  function takeTurn(S, side) {
    const p = S.players[side];
    let guard = 0;
    if (blocked(S)) return 'pending';

    /* 0) Arc-Flare → เรียก Arcanum ลง Core Zone เป็นแอ็คแรก */
    if (blocked(S)) return 'pending';
    const arc = Z.arcPlayable(S, side);
    if (arc.ok) {
      const opt = arc.options.find(o => o.withArc) || arc.options.find(o => o.payCost && card(o.id).cost <= Math.max(0, p.flare - 2));
      if (opt) {
        const cellCore = arc.cells.filter(c => c.r === R.coreRow).sort((a, b) => a.c - b.c)[0];
        if (cellCore) { Z.summonArc(S, side, opt.extraIdx, cellCore, opt.withArc); if (S.pending) return 'pending'; }
      }
    }

    /* 1) ลง Terrain ถ้ามีและคุ้ม */
    for (let i = p.hand.length - 1; i >= 0; i--) {
      const cd = card(p.hand[i]);
      if (cd.type !== 'terrain') continue;
      if (cd.cost > p.flare - 1) continue;
      if (Z.terrains(S, side).length >= Z.terrainLimit(S, side) && (cd.flags || {}).terrainLimit == null && p.flare < 4) continue;
      const cell = terrainCell(S, side);
      if (!cell) break;
      const res = Z.terrain(S, side, i, cell);
      if (res && res.awaiting) return 'pending';
      if (blocked(S)) return 'pending';
      if (res && res.ok) break;
    }

    /* 2) ลงยูนิต (เรียงจากใบที่คุ้มสุด และเว้น Flare ไว้โจมตี) */
    let safety = 0;
    while (guard++ < 20 && safety++ < 8) {
      const plays = p.hand.map((id, idx) => ({ id, idx, cd: card(id) }))
        .filter(x => x.cd.type === 'unit' && Z.cardPlayable(S, side, x.idx) && Z.cardPlayable(S, side, x.idx).ok);
      if (!plays.length) break;
      plays.forEach(x => {
        x.score = (x.cd.cp || 0) / 1000 * 1.1 + (x.cd.abilities || []).length * 0.7 - x.cd.cost * 0.45;
      });
      plays.sort((a, b) => b.score - a.score);
      const pick = plays[0];
      const reserve = (card(p.hand[pick.idx]).cp || 0) >= 3000 ? 1 : 1;   // เผื่อ Flare ไว้โจมตีอย่างน้อย 1
      if (p.flare - card(pick.id).cost < reserve && coreUnits(S, side).length >= 1) break;
      const info = Z.cardPlayable(S, side, pick.idx);
      const cell = info.cells.sort((a, b) => Math.abs(a.c - 1) - Math.abs(b.c - 1))[0];
      const res = Z.deploy(S, side, pick.idx, cell);
      if (res && res.awaiting) return 'pending';
      if (blocked(S)) return 'pending';
      if (!res || !res.ok) break;
    }

    /* 3) Command ที่มีประโยชน์ (กำจัดภัย / บัฟ / จั่ว) */
    for (let i = p.hand.length - 1; i >= 0; i--) {
      const id = p.hand[i], cd = card(id);
      if (cd.type !== 'command') continue;
      if (cd.cost > p.flare) continue;
      const info = Z.cardPlayable(S, side, i);
      if (!info || !info.ok) continue;
      let use = false, tgtUid = null;
      if (cd.target === 'enemyUnit') {
        const foes = coreUnits(S, foe(side)).sort((a, b) => cp(S, b) - cp(S, a));
        const target = foes.find(f => (cd.abilities || []).some(a => (a.ops || []).some(o => o.op === 'destroy' && (!o.cpMax || cp(S, f) <= o.cpMax))));
        if (target) { use = true; tgtUid = target.uid; }
      } else if (cd.target === 'allyUnit') {
        const mine = coreUnits(S, side).sort((a, b) => cp(S, a) - cp(S, b))[0];
        if (mine && coreUnits(S, side).length >= 2) { use = true; tgtUid = mine.uid; }
      } else if (cd.target === 'unit') {
        const t = coreUnits(S, foe(side))[0];
        if (t && value(S, t) > 4.5) { use = true; tgtUid = t.uid; }
      } else {
        use = (cd.abilities || []).some(a => (a.ops || []).some(o => ['draw', 'mill', 'flare', 'damage', 'core'].includes(o.op)));
        if (cd.abilities.some(a => a.ops && a.ops.some(o => o.op === 'damage'))) use = coreUnits(S, foe(side)).length >= 2;
      }
      if (!use) continue;
      const res = Z.command(S, side, i, null, tgtUid);
      if (res && res.awaiting) return 'pending';
      if (blocked(S)) return 'pending';
      if (res && res.ok) return stepContinue(S, side);
    }

    return stepContinue(S, side);
  }

  /* 4) เดิน + โจมตี ตามค่าที่ทำได้ต่อการกระทำหนึ่งครั้ง */
  function stepContinue(S, side) {
    let n = 0;
    if (blocked(S)) return 'pending';
    while (n++ < 24) {
      const mine = Z.units(S, side).filter(u => !u.rested && !u.arc);
      if (!mine.length) break;
      let best = null;
      mine.forEach(u => {
        // ก) โจมตีที่ทำลายได้ = ค่าสูงสุด
        Z.attackTargets(S, u).forEach(t => {
          const kill = cp(S, u) >= cp(S, t);
          const cost = Z.canFreeAttack(S, u) ? 0 : R.attackFlare;
          if (S.players[side].flare < cost) return;
          const grind = (cp(S, t) - cp(S, u) * 0.9 < 1200) ? 2.6 : -2;
          const sc = (kill ? 6 + value(S, t) * 1.5 : grind) + (inCore(t) ? 3.2 : 0);
          if (!best || sc > best.sc) best = { sc, act: { kind: 'attack', u, t } };
        });
        // ข) เดิน: เข้า core > ไปหน้าเพื่อตี > ถอยตั้งหลัก
        Z.legalMoveCells(S, u).forEach(cel => {
          const before = Math.abs(u.r - R.coreRow);
          const after = Math.abs(cel.r - R.coreRow);
          let sc = (before - after) * 3.2 + (cel.r === R.coreRow ? 5 : 0);
          // เลี่ยงยืนเบียดใน core ถ้าเกินจำเป็น
          if (cel.r === R.coreRow && coreUnits(S, side).length >= 2) sc -= 3.0;
          // หลบออกจากช่องที่ศัตรูจะตีได้ถ้า CP ต่ำ
          const exposed = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(dn => {
            const cc = Z.cell(S, cel.r + dn[0], cel.c + dn[1]);
            return !!(cc && cc.unit && cc.unit.side !== side);
          });
          const killer = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(dn => {
            const cc = Z.cell(S, cel.r + dn[0], cel.c + dn[1]);
            const o = cc && cc.unit;
            return !!(o && o.side !== side && cp(S, o) >= cp(S, u) && Z.fwd(o.side) !== -Z.fwd(side));
          });
          if (exposed && cp(S, u) <= 1500) sc -= 2.6;
          if (killer) sc -= 3.4;
          if (!best || sc > best.sc) best = { sc, act: { kind: 'move', u, cel } };
        });
        // ค) ActivateAbility
        const ab = (card(u.id).abilities || []).find(a => a.kw === 'Activate');
        if (ab && !u.used['act'] && (!ab.cost || S.players[side].flare >= ab.cost + 1)) {
          if (!best || 2.2 > best.sc) best = { sc: 2.2, act: { kind: 'ability', u } };
        }
      });
      if (!best || best.sc <= -1) break;
      const a = best.act;
      let res;
      if (a.kind === 'attack') res = Z.attack(S, side, a.u.uid, a.t.uid);
      else if (a.kind === 'move') res = Z.move(S, side, a.u.uid, a.cel);
      else res = Z.ability(S, side, a.u.uid);
      if (res && res.awaiting) return 'pending';
      if (blocked(S)) return 'pending';
      if (!res || !res.ok) break;
    }
    const r = Z.endTurn(S);
    if (r && r.awaiting) return 'pending';
    return 'done';
  }

  const foe = s => (s === 'p0' ? 'p1' : 'p0');
  return { takeTurn, respond, aiTrigger, blocked, foe };
})();

/* ผูกตัวตอบโต้เข้ากับ state ทุกครั้งที่เริ่มเกมใหม่ */
(function () {
  const _init = Z.init;
  Z.init = function (o) {
    const S = _init(o);
    S.aiRespond = ZAI.respond;
    S.aiTrigger = ZAI.aiTrigger;
    return S;
  };
})();
