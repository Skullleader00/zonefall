# Zonefall — digital card game (PWA)

เกมการ์ด **Zonefall** ตาม rulebook ฉบับ Dev V.24 — รันเป็นเว็บแอป (PWA) เล่น Solo กับ AI
ได้ทันที ไม่ต้อง build, ไม่ต้องใช้ backend, เล่นออฟไลน์ได้หลังเปิดครั้งแรก

> ข้อมูลการ์ดทั้ง 52 ใบใน repo นี้ OCR มาจากไฟล์รูปการ์ดต้นฉบับของเจ้าของโปรเจกต์
> ตัว engine กติกาเขียนตาม `Zonefall Rulebook (ฉบับเรียบเรียงใหม่)` Dev V.24

## วิธีรัน

เปิดโฟลเดอร์นี้ด้วยเซิร์ฟเวอร์ static ใดก็ได้:

```bash
python3 -m http.server 3000
# แล้วเปิด http://localhost:3000
```

หรือ deploy เป็นไฟล์นิ่ง (GitHub Pages / Netlify / Vercel) ทั้งโฟลเดอร์นี้ได้ทันที
เพราะไม่มีการ build step

* ลงเป็นแอปบนมือถือ: เปิดใน Chrome/Edge → Add to Home screen (มี `manifest.webmanifest` + service worker)
* ต้องการณ์: หน้าจอแนวตั้งบนมือถือ หรือแนวนอนตั้งแต่ 900px ขึ้นไป (layout ปรับอัตโนมัติ)

## โครงสร้าง

```
index.html            โครงหน้าจอ (plate กระดาน มือ ช่อง response log modal)
css/game.css          ธีม "holo war-table" + responsive 5 viewport
js/data.js            RULES + การ์ดจริง 52 ใบ + เด็คทดสอบ 2 ชุด   <-- แก้ไฟล์นี้เพื่อเปลี่ยนเกม
js/engine.js          rule engine (state, legality, combat, response, effects)
js/ai.js              AI planner + นโยบายตอบโต้ (Declaration-Response)
js/ui.js              เรนเดอร์ + สัมผัส/คลิก + driver ของตา AI
sw.js                 service worker (offline-first)
manifest.webmanifest  PWA manifest
icons/                ไอคอนแอป
img/                  ภาพการ์ดจริง (บีบเป็น ~460px JPG จากสแกนต้นฉบับ)
```

ทุกอย่างเป็น vanilla JS (ไม่มี dependency, ไม่มี build) และ `Engine` แยกออกจาก UI
จึงทดสอบด้วย Node ได้ตรง ๆ (ดูหัวข้อ "ทดสอบ")

## กติกาที่ implement (Zonefall V.24)

| ระบบ | รายละเอียด |
|---|---|
| สนาม | 5 แถว × 3 ช่อง · แถว 3 = **Core Zone** · ลงยูนิต/Command ที่แถวหลังตนเอง · Terrain ที่แถวหน้าตนเอง · ห้ามรุกล้ำแถวหลังศัตรู |
| ชนะ | สะสม **7 Core Point** (นับจากยูนิต/Arcanum ใน Core Zone ตอน End Phase ใบละ 1) หรืออีกฝ่ายจั่วไม่ได้/เด็คหมด |
| Flare | `Flare = เลขเทิร์นตัวเอง` แคป 8, รีเซ็ตทุกเทิร์น · **Arc-Flare** = เม็ดที่ 8 ใช้เป็นแอ็คแรกของเทิร์นเพื่อข้าม Cost ของ Arcanum |
| แอ็ค | ยูนิตใช้แอ็คได้ 1 ครั้ง/เทิร์นด้วยการ "วางนอน" (เดิน หรือ โจมตี หรือ Activate) · เดิน 4 ทิศ ช่องเว้นช่อง · Terrain ไม่บล็อกทาง |
| ต่อสู้ | ประกาศโจมตี → **Declaration-Response** → Counter ผู้ป้องกัน → Attack ผู้โจมตี → วัดค่าพลัง:เอา CP ผู้โจมตีไปลบ CP ผู้ป้องกัน เหลือ 0 = Outzone (Persistent Power / Playtest Ver.2) · ค่าพลังรีเซ็ตต้นเทิร์น |
| Response | ทุกแอ็คให้อีกฝ่ายตอบโต้ **1 ครั้ง** (Quick-Cast / Counter ในมือ เช่น Null Magic, Shield Guard, Barrier) · ไม่มี chain/สแต็ก · เจ้าของเทิร์น resolve ก่อน |
| Trigger Check | เมื่ออีกฝ่ายได้ Core Point → เปิดใบบนสุดของเด็คขึ้นมือ และถ้าใบนั้นมี `[Trigger]` จะทำงานทันที |
| โซน | Outzone · Removezone (มือเกิน 10 ใบ = ออกจากเกม) · Extra Zone (Arcanum/Token, ดิจิทัล 5 ใบ, Arcanum ที่ถูกทำลายจะหงายหน้าและใช้ไม่ได้อีก) |
| โควตา | ยูนิต 4 ตัว/ฝ่าย · Terrain 1 ใบ (ยกเว้น `multiTerrain`) · Command ต้องมีช่องว่างแถวหลังและครองช่องขณะ resolve · [Protection] ≤ 6 ใบ/เด็ค · ซ้ำ ≤ 3 · เด็ค 40–60 · สีหลัก ≥ ครึ่ง |

### keyword ที่ engine แปลผลอัตโนมัติ

`On Play` · `Activate` · `Cont` · `Trigger` · `Attack` · `Counter` · `Action` · `Upkeep` · `Quick-Cast` · `Cast`

op ที่รองรับ: `cp` `setPower` `draw` `mill` `discard` `ready` `rest` `move(fwd|back|side)` `swap`
`noDestroyBattle` `point` `foePoint` `destroyTerrain` `revealAdd` `addFromOutzone`
`playFromOutzone` `playHandUnits` `outzoneToBottom` `shiftCost` `ascend(Merge)` `foeDestroyChoice`
`banish` `cancel` `bounce` `triggerCheck` `flare` `core` `damage` `destroy`

เงื่อนไข (`req`): `colorCount` `tribeCount` `terrainMin` `outzoneMin/Max`
`flag(commandPlayed|operationPlayed|terrainDestroyed)` `notPlayedThisTurn` `handCostReduce`

### สถานะการนำเข้าการ์ด

`SB01` 22 ใบ · `SD01` 15 ใบ · `SD04` 15 ใบ · Unit 33 / Command 15 / Terrain 4
· 105 abilities / 129 ops ที่ engine ทำงานได้
ในหน้า "ชีการ์ด" ของทุกใบจะมีป้ายระบุว่า ability นั้น **ต่อผลอัตโนมัติแล้ว**
หรือ **แสดงข้อความอย่างเดียว** (ยังต้องเขียน op เพิ่ม) — กดปุ่ม `i` ที่มุมการ์ด

## ทดสอบ

```bash
# 1) syntax
for f in js/*.js sw.js; do node --check $f; done

# 2) AI vs AI สมดุล (ต้องรวมไฟล์ data/engine/ai เข้ากับ harness ของคุณ)
node test/play.js 20 400      # games, maxSteps

# 3) e2e บนเบราว์เซอร์ (Playwright)
node test/browser.js
```

ผลล่าสุด (การ์ดจริง 52 ใบ, เด็ค SD01 vs SD04): **32 เกม 0 error**, เล่นจบทุกเกม,
เฉลี่ย **15.3–16.1 เทิร์น**, ชนะ 11–9 · Playwright: ไม่มี pageerror/console error,
ไม่มีข้อความ `undefined/NaN` ใน DOM, layout ผ่านที่ 390 / 768 / 844 / 1024 / 1366 px

## หมายเหตุด้านกติกา (ข้อสมมติที่รอ owner ยืนยัน)

1. การโจมตีใช้ **1 Flare** / การเคลื่อนที่ฟรี (อ้างอิงจากตัวอย่าง "Lava Stream: โจมตีได้โดยไม่ใช้ Flare")
2. เดิน **1 ช่องต่อแอ็ค** และ 1 แอ็คต่อเทิร์น (วางนอน)
3. ผู้ที่เริ่มทีหลังไม่จั่วในเทิร์นแรก (ตาม rulebook) — วัดแล้วฝ่ายเริ่มก่อนชนะ ~80%
4. `[Counter]` ของยูนิต resolve อัตโนมัติหลังหน้าต่างตอบโต้
5. Arcanum/Token ยังไม่มีใน 3 ชุดที่นำเข้า ปุ่มเรียก Arcanum จะปิดจนกว่าจะมีการ์ด

## License

ตัวโค้ดใน repo นี้เผยแพร่ภายใต้เจ้าของโปรเจกต์ (Zonefall) —
ข้อความ/ภาพการ์ดทั้งหมดเป็นเจ้าของโดยผู้ออกแบบเกม Zonefall
