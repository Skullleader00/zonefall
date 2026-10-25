# Zonefall — digital card game (PWA)

การ์ดเกม **Zonefall** ตาม rulebook ฉบับ **Dev V.24** รันเป็นเว็บแอป (PWA) เล่น **Solo vs AI**
ได้ทันที ไม่มี build step ไม่ต้องมี backend เล่นออฟไลน์ได้หลังเปิดครั้งแรก

เอกสารและ asset ทั้งหมดในโปรเจกต์นี้เป็นของเจ้าของเกม Zonefall (rulebook Dev V.24,
DESIGN BREAKDOWN, ไฟล์ฟอนต์/ไอคอน/โลโก้ และภาพสแกนการ์ด 52 ใบในโฟลเดอร์ Drive)

## รัน

```bash
python3 -m http.server 3000      # แล้วเปิด http://localhost:3000
# หรือ deploy ทั้งโฟลเดอร์เป็นไฟล์นิ่ง (GitHub Pages / Netlify / Vercel)
```

ลงเป็นแอป: เปิดใน Chrome/Edge → Add to Home screen (`manifest.webmanifest` + service worker)

## กติกาที่เครื่องเล่นอยู่ (rulebook V.24)

* เป้าหมาย: **7 Core Point** · นับจากการ์ดที่คุณครองใน **Core Zone (แถว 3)** ตอน End Phase ใบละ 1 · หรือทำให้อีกฝ่ายจั่วไม่ได้
* สนาม **5 แถว × 3 ช่อง** · ลงยูนิต/Command ที่แถวหลังตนเอง · Terrain ที่แถวหน้าตนเอง · ห้ามเข้าแถวหลังศัตรู · Terrain ไม่บล็อกทางเดิน
* **Flare เริ่มที่ 3** แล้ว +1 ทุกเทิร์นของคุณจนถึงเพดาน 8 · ไม่สะสมข้ามเทิร์น
* **วางนอน = ใช้แอ็ค**: ยูนิต 1 ตัวทำอะไร 1 อย่างต่อเทิร์น · เดินฟรี 1 ช่อง · โจมตีใช้ 1 Flare · โจมตีได้เฉพาะหน้า/ซ้าย/ขวา
* **การต่อสู้ (Persistent Power)**: CP ผู้โจมตีไปลบ CP ผู้ป้องกัน เหลือ 0 → Outzone · ผู้โจมตีไม่เสียค่าพลัง · รีเซ็ตต้นเทิร์น
* **Declaration-Response**: ทุกแอ็คเปิดหน้าต่างให้อีกฝ่ายตอบโต้ 1 ครั้ง (`[Quick-Cast]` / `[Counter]` ในมือ เช่น Shield Guard / Barrier / Null Magic) · ไม่มี chain · `[Counter]` ของยูนิตทำงานก่อน `[Attack]`
* **End Phase**: นับ Core Point → อีกฝ่าย **Trigger Check** (มีการ์ดเด้งขึ้นไปบนหัว + สั่นสั้น ๆ แล้ว **เจ้าของเลือกได้** ว่า “ใช้เอฟเฟกต์” หรือ “เก็บขึ้นมือ” — ใบไหนมี `[Trigger]`) → Terrain ที่ระบุให้สลาย → เช็ค 7 แต้ม → ส่งเทิร์น (เปิดใบบนสุดขึ้นมือ + ทำงานถ้ามี `[Trigger]`) → Terrain ที่ระบุให้สลาย → เช็ค 7 แต้ม → ส่งเทิร์น
* โควตา: ยูนิต ≤ 4 · Terrain ≤ 1 (**บังคับตอนวาง** — ช่องที่มี Terrain อยู่แล้ววางทับไม่ได้ และถ้าเต็มโควตาจะวางไม่ลง ไม่ใช่ไล่ใบเก่าออก) ใบที่ `multiTerrain` เช่น Sylvan ไม่นับโควตา · ยูนิตอื่นวางทับช่องที่มี Terrain ได้ · มือ ≤ 10 (เกิน → Removezone) · Outzone / Removezone / Extra Zone ครบ
* เด็ค: 40–60 ใบ · ซ้ำ ≤ 3 · สีหลัก ≥ ครึ่ง · `[Protection]` ≤ 6 (มีตัวตรวจใน `test/deckcheck.js`)
* **ปิด Arcanum / Arc-Flare ชั่วคราว** ตามที่สั่ง (`RULES.arcanum = false`)

### keyword / op ที่ engine แปลผลอัตโนมัติ

`On Play(On Deploy)` · `Activate` · `Cont` · `Trigger` · `Attack` · `Counter` · `Action` · `Upkeep`
`Quick-Cast` · `Cast` · `Ascend/Merge`

### op ชุดที่ 2 (`js/effects.js` — ผูกกับการ์ดจริงทั้ง 52 ใบผ่าน `js/ability-ops.js`)

`static(cell|multiTerrain|moveLock|costReduce|costIfReturnedThisTurn|requiresTribe|untargetable|readyAfterAttack|
witchSetPower|millDoubles|columnBuffOnOperation|protection)` · `require` `if` `oncePerTurn` `pay(flare/discardHand/terrainHere/either/restPair)`
`gain` `points` `foePoints` `buff` `buffColumn` `buffCost6Own` `buffMachineOrAll` `powerTo` `drawPerPower` `shiftCost`
`ready/rest/move/swap/destroy/bounce` (ใช้ `to:'ask:<pool>'` เมื่อ “เลือก 1 ตัว”) · `readyBackRowOthers` `readyIfBackRowColor`
`noDestroy` `protect` `perOwnedGreenTerrainBuff` `battleEffect` `banishRemove` `mergeDeck` `applyCellOnPlay`
`reveal` `revealCountOf` `transfer` `returnFieldRested` `recoverOutzone*` `playFromHandTribe` `ascendDeploy`
`declareMatch` `chooseTwo` `costLock` `deploySelf` `destroySelf` `ifPlayedWithoutFlareRest` `onPlay(hook,…)` + hook
`move/battle/battleEnd/unitDied/terrainDestroyed/commandPlayed/operationPlayed`

### op ของ engine

ops: `cp` `setPower` `draw` `mill` `discard` `ready` `rest` `move(fwd|back|side)` `swap`
`noDestroyBattle` `point` `foePoint` `destroyTerrain` `revealAdd` `addFromOutzone` `playFromOutzone`
`playHandUnits` `outzoneToBottom` `shiftCost` `ascend` `foeDestroyChoice` `cancel` `bounce` `summon`
`autoCore` `damage` `destroy` `flare` `core` `toOutzone`

เงื่อนไข (`req`): `colorCount` `tribeCount` `colorBackRow` `terrainMin` `outzoneMin/Max`
`flag(commandPlayed|operationPlayed|terrainDestroyed)` `notPlayedThisTurn` `handCostReduce`

ใน **ชีรายละเอียดการ์ด** ทุกใบมี `<details>` ของนักพัฒนา บอกว่า ability นั้นต่อ op อะไรแล้ว
หรือเป็น "แสดงข้อความอย่างเดียว"

## งานภาพ & การควบคุม (v1.4)

* **การ์ดในมือ = ภาพสแกนเต็มใบ** จาก `img/<SET-NO>.jpg` ไม่มีเฟรมซ้อน (fold ตามที่ขอ)
*ยูนิตบนสนาม = ภาพ arts ของการ์ดเอง** เต็มช่อง (`assets/art/<FILE>.jpg` ตัดจากหน้าต่างภาพบนสแกนจริง) + badge Cost (วงกลมซ้ายบน) / CP (ขวาบน) / flag (FUSED, TRIGGER, ไม่ล้ม, เสีย CMP)
* **Terrain = กลืนเป็นพื้นของช่อง** (ภาพเต็มช่อง + cyan ground frame + name Ribbon มุมบนซ้าย + รางลายทแยง) — ช่องที่มี Terrain+ยูนิตจะเห็นทั้งสองชั้น (class `.both`)
* **ลาก-วาง (drag & drop)**: ghost ลอยตามนิ้ว (เล็ดลอดผ่านม่านไม่ได้ — ตั้ง `pointer-events:none` ทั้งก้อนรวมลูก) · ปล่อยบนช่องถูก = วาง, ปล่อยนอกช่อง/ยกเลิก = การ์ดกลับสภาพเดิม **ไม่เทาและลากซ้ำได้ทันที** · เมื่อลากแล้วไม่ปล่อยบนช่องที่วางได้ ระบบไม่ค้าง: ลากการ์ดจากมือลงช่องที่ทำได้ (มี ghost + ช่อง `drop-ok` กระพริบ) · ลากยูนิตบนสนาม = เดิน (เขียว) หรือโจมตี (แดง) · Command ลากลงแถวหลัง = ร่ายจริง (ไม่กลายเป็นยูนิต) · ยังรองรับ **แตะ-แล้ว-แตะ** เป็น fallback
* **กดค้าง (~380ms)** เปิดชีข้อมูลการ์ดได้ **ทุกจุด รวมทั้งด้านหลังแผงเลือกเป้าหมาย/ม่านที่บังอยู่** และไม่ทำให้การ์ดถูกเลือกโดยไม่ตั้งใจ
* **โฟกัสที่เกม**: ในหน้าจอเกม บล็อก context menu (ไม่ขึ้นเซฟรูป/ก๊อปปี), `dragstart` ของรูป, text selection, callout ของ iOS และ `touch-action` ปรับให้เลื่อนมือแนวแนวนอนได้เฉพาะโซนมือ
* **การเลือกเป้าหมายแบบ “เลือก 1”**: การ์ดที่ระบุว่าเลือก 1 ตัว/ในแถว/ใน column จะเปิดหน้าต่างระบุรายชื่อที่ **ตรงเงื่อนไขจริง** (己รวมของเราก็มีเมื่อผลเป็นกลาง/ช่วยเหลือ, ศัตรูเมื่อผลเป็นอันตราย) และมีแอนิเมชันเข้าเป้า
* แถบ **`#revealStrip`** ด้านบนแสดงการ์ดที่ถูกเปิดจากสมุดจริง ๆ (Trigger Check / reveal effect) พร้อม tag ว่าฝ่ายไหน
* **ปุ่มเต็มจอ (⤢/⤡)** ที่แถบด้านบน ใช้ได้ทั้ง `requestFullscreen` และ webkit fallback
* แถบ Flare แนวตั้ง 2 ฝั่ง (ฟ้า = คุณ · ส้ม = ศัตรู) เป็นเกจแก้วพร้อมตัวเลข, Core Point/Flare มีชิปในเพลต, pile 4 โซนเป็น sprite จริงกดดูเนื้อหาได้
* ฟอนต์จริงจากโฟลเดอร์ Font: `FC Twist Bold` (ชื่อ) · `FC Iconic` (UI) · `SOV LookSit` (ตัวเลข) — subset ไทย+ลาติน 37KB
* ฉากสนาม 3 ธีม (`field_map01-03`) เลือกในหน้าแรก · ไอคอนแอปจาก `Zonfall_shotcut_red`

> หมายเหตัสัญญาอนุญาตฟอนต์: `FC Twist Bold` มากับไฟล์ “[Non-commercial]” — ถ้าจะออกเชิงพาณิชย์ต้องซื้อสิทธิ์/เปลี่ยนฟอนต์ตัวแสดงผล

## ทดสอบ

```bash
node test/deckcheck.js                 # กติกาการจัดเด็ค (exit 1 ถ้าผิด)
node test/interact.js                  # drag & drop + เลือกเป้าหมาย + reveal + Trigger Check + กดค้าง + เลื่อนมือ (24 บททดสอบ)
node test/optrace.js 24                # สแกน log ทุกเกมหา op ที่ยังไม่ implement / hook error (ต้อง 0)
node test/coverage.js 40               # นับว่า “การ์ดใบไหนถูกใช้แล้วเอฟเฟกต์ทำงานจริง” ในการจำลอง 160 เกม
node test/play.js 30 600               # AI vs AI: error / ความยาวเกม / win rate
node test/play.js 24 600 sylvan sylvan # mirror เพื่อแยก "ผลของฝ่ายเริ่มก่อน" ออกจากเด็ค
BASE=http://localhost:3000/index.html node test/browser.js   # e2e 5 viewport (ต้องมี playwright)
npm start                              # เซิร์ฟเวอร์ท้องถิ่น
```

ผลรอบล่าสุด (v1.4)
* `deckcheck` ผ่านทั้งสองเด็ค (40 ใบ · สีหลัก 75% · Protection 4)
* AI-vs-AI **0 error ทุกชุดที่รัน** (20–48 เกม/ชุด) · ความยาวเฉลี่ย **12.1–12.7 เทิร์น** · ability ทำงาน 95–189 ครั้ง/24 เกม · ตอบโต้ (Counter) 17–46 ครั้ง · Trigger Check ~7 ครั้ง/เกม
* `optrace` 48 เกม: **ไม่พบ op ที่ยังไม่ได้ implement** และมีบรรทัดเอฟเฟกต์ทำงานจริง 1,209–1,405 บรรทัด
* `coverage` 160 เกม: การ์ด **28/30 ใบในเด็คถูกนำมาใช้ และทั้ง 28 ใบมีเอฟเฟกต์ทำงานจริง** (อีก 2 ใบคือ Shield Guard/Barrier ที่ AI ไม่ค่อยตอบโต้ — แต่การทำงานยืนยันได้จากบททดสอบใน interact)
* mirror match ฝ่ายเริ่มก่อนยังชนะ **~78–83%** · เด็คข้ามชุด SD04 ยังเหนือกว่า SD01 → ยังไม่ปรับสมดุล รอ decision เจ้าของเกม
* `test/browser.js` ผ่าน **5/5 viewport** (390×844 · 768×1024 · 844×390 · 1024×700 · 1366×850): token ไม่ล้นช่อง, layout ไม่เกินขอบ, รูปโหลดครบ, ลาก-วางจริงในจอ 390, กดค้างเปิดชี, แผง ask เปิด/ปิดถูกต้อง
* `test/interact.js` ผ่าน **24/24**

## สมดุลที่ยังค้าง (ต้องตัดสินใจ)

1. ฝ่ายเริ่มก่อนชนะราว 80% — rulebook ให้ฝ่ายเริ่มทีหลัง *ไม่จั่ว* เทิร์นแรก ซึ่งซ้ำเติมอีก
   ทางเลือก: ให้ฝ่ายเริ่มทีหลังได้ +1 Flare ชั่วคราว / ให้เริ่มทีหลังเลือก Core Zone ก่อน /
  หรือยกเลิกข้อยกเว้นการจั่ว
2. เด็คจากชุด SD01/SD04 ที่โปรแกรมประกอบให้อัตโนมัติอาจไม่ใช่เด็คที่ทีมจะเล่นจริง
   — ส่งลิสต์เด็คจริงมา ผมจะใส่ใน `DECKS` + ตรวจกติกาให้
3. `handCostReduce` ของใบอย่าง Agrony/Ahenla ใช้ตัวนับ "Terrain ถูกทำลายเทิร์นนี้"
   ถ้ากติกาจริงนับคนละแบบ แจ้งผมได้
