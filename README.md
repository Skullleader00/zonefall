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
* **End Phase**: นับ Core Point → อีกฝ่าย **Trigger Check** (เปิดใบบนสุดขึ้นมือ + ทำงานถ้ามี `[Trigger]`) → Terrain ที่ระบุให้สลาย → เช็ค 7 แต้ม → ส่งเทิร์น
* โควตา: ยูนิต ≤ 4 · Terrain ≤ 1 (ใบที่ `multiTerrain` เช่น Sylvan ไม่นับ) · มือ ≤ 10 (เกิน → Removezone) · Outzone / Removezone / Extra Zone ครบ
* เด็ค: 40–60 ใบ · ซ้ำ ≤ 3 · สีหลัก ≥ ครึ่ง · `[Protection]` ≤ 6 (มีตัวตรวจใน `test/deckcheck.js`)
* **ปิด Arcanum / Arc-Flare ชั่วคราว** ตามที่สั่ง (`RULES.arcanum = false`)

### keyword / op ที่ engine แปลผลอัตโนมัติ

`On Play(On Deploy)` · `Activate` · `Cont` · `Trigger` · `Attack` · `Counter` · `Action` · `Upkeep`
`Quick-Cast` · `Cast` · `Ascend/Merge`

ops: `cp` `setPower` `draw` `mill` `discard` `ready` `rest` `move(fwd|back|side)` `swap`
`noDestroyBattle` `point` `foePoint` `destroyTerrain` `revealAdd` `addFromOutzone` `playFromOutzone`
`playHandUnits` `outzoneToBottom` `shiftCost` `ascend` `foeDestroyChoice` `cancel` `bounce` `summon`
`autoCore` `damage` `destroy` `flare` `core` `toOutzone`

เงื่อนไข (`req`): `colorCount` `tribeCount` `colorBackRow` `terrainMin` `outzoneMin/Max`
`flag(commandPlayed|operationPlayed|terrainDestroyed)` `notPlayedThisTurn` `handCostReduce`

ใน **ชีรายละเอียดการ์ด** ทุกใบมี `<details>` ของนักพัฒนา บอกว่า ability นั้นต่อ op อะไรแล้ว
หรือเป็น "แสดงข้อความอย่างเดียว"

## งานภาพ (ใช้ asset ของเกมเอง)

| ส่วน | ไฟล์ |
|---|---|
| ฟอนต์ชื่อการ์ด / UI /ตัวเลข CP | `assets/fonts/zonefall-display.woff2` (FC Twist Bold) · `zonefall-ui.woff2` (FC Iconic) · `zonefall-num.woff2` (SOV LookSit) — subset ไทย+ลาติน รวม ~37KB |
| กรอบการ์ด + ช่องภาพ | `assets/ui/frame-unit.png` `frame-command.png` `frame-terrain.png` (เจาะหน้าต่างภาพ/กล่องข้อความให้โปร่งใส) |
| ภาพศิลปะ 52 ใบ | `assets/art/<FILE>.jpg` (crop จากสแกนตามขอบเขตที่วัดจากไฟล์จริง) |
|เกจ Flare | `assets/ui/icon-flare.png` + pips เพชรส่องแสง (ขวา=ศัตรู สีส้ม, ซ้าย=คุณ สีฟ้า) |
| Core Point | `assets/ui/icon-corepoint.png` |
| โซน/กอง | `pile-deck/out/remove/extra.png` |
| ปุ่ม END / โหมดตอบโต้ / o-p-s | `icon-end.png` `icon-attack.png` `icon-move.png` `panel-choose.png` `rps-paper|rock|scissors.png` |
| แบนเนอร์เฟส | `icon-phase-draw/main/end.png` |
| ชนะ/แพ้ | `badge-win.png` `badge-lose.png` |
| โลโก้ + ไอคอนแอป + faction | `logo.png` `icons/icon-*.png` `assets/faction/*.png` |
| ฉากสนาม 3 ธีม | `assets/bg/field-blue|green|red.jpg` (เลือกได้ในหน้าแรก) |

เลย์เอาต์ทดสอบที่ 360 · 390 · 430 · 768×1024 · 844×390 · 1024×700 · 1366×850
(≥1180 แนวแนวนอน = 3 คอลัมน์ มือ/ผู้เล่น · กระดาน · Log)

> หมายเหตุสัญญาอนุญาตฟอนต์: `FC Twist Bold` มาพร้อมไฟล์ "[Non-commercial]" ในโฟลเดอร์ฟอนต์
> ถ้าโปรเจกต์จะออกเชิงพาณิชย์ ต้องซื้อสิทธิ์หรือเปลี่ยนฟอนต์ตัวแสดงผล

## โครงสร้าง

```
index.html            โครงจอ
css/game.css          ธีม + layout responsive
js/data.js            RULES + การ์ด 52 ใบ + เด็ค 2 ชุด   ← แก้ไฟล์นี้เพื่อเปลี่ยนเกม
js/engine.js          rule engine (legality, combat, response, effects)
js/ai.js              AI planner + นโยบายตอบโต้
js/ui.js              เรนเดอร์ + สัมผัส + driver ตา AI + จอ o/p/s + popups
sw.js                 service worker (offline-first + warm ภาพการ์ดทีละใบ)
manifest.webmanifest  PWA
test/                 harness + play + deckcheck + browser e2e
assets/, img/, icons/ sprite/ฟอนต์/ภาพการ์ด
```

## ทดสอบ

```bash
node test/deckcheck.js                 # กติกาการจัดเด็ค (exit 1 ถ้าผิด)
node test/play.js 30 600               # AI vs AI: error / ความยาวเกม / win rate
node test/play.js 24 600 sylvan sylvan # mirror เพื่อแยก "ผลของฝ่ายเริ่มก่อน" ออกจากเด็ค
BASE=http://localhost:3000/index.html node test/browser.js   # e2e 5 viewport (ต้องมี playwright)
npm start                              # เซิร์ฟเวอร์ท้องถิ่น
```

ผลรอบล่าสุด: `deckcheck` ผ่านทั้งสองเด็ค · AI-vs-AI **108 เกม 0 error** ·
ความยาวเฉลี่ย **11.4–13.0 เทิร์น** · mirror match ฝ่ายเริ่มก่อนชนะ **79–83%** ·
คู่ข้ามเด็ค (SD04 = เครื่องจักร) เหนือกว่า SD01 ชัด (97%) → ยังไม่ปรับสมดุล รอ decision เจ้าของเกม
`browser.js` ผ่าน 5/5 viewport, ไม่มี pageerror, ไม่มีข้อความ `undefined/NaN` ใน DOM

## สมดุลที่ยังค้าง (ต้องตัดสินใจ)

1. ฝ่ายเริ่มก่อนชนะราว 80% — rulebook ให้ฝ่ายเริ่มทีหลัง *ไม่จั่ว* เทิร์นแรก ซึ่งซ้ำเติมอีก
   ทางเลือก: ให้ฝ่ายเริ่มทีหลังได้ +1 Flare ชั่วคราว / ให้เริ่มทีหลังเลือก Core Zone ก่อน /
  หรือยกเลิกข้อยกเว้นการจั่ว
2. เด็คจากชุด SD01/SD04 ที่โปรแกรมประกอบให้อัตโนมัติอาจไม่ใช่เด็คที่ทีมจะเล่นจริง
   — ส่งลิสต์เด็คจริงมา ผมจะใส่ใน `DECKS` + ตรวจกติกาให้
3. `handCostReduce` ของใบอย่าง Agrony/Ahenla ใช้ตัวนับ "Terrain ถูกทำลายเทิร์นนี้"
   ถ้ากติกาจริงนับคนละแบบ แจ้งผมได้
