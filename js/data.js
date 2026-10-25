/* ==========================================================================
   ZONEFALL — ฐานข้อมูลกติกา + การ์ดจริง 52 ใบ (นำเข้าจากรูปในโฟลเดอร์ Drive ของคุณ)
   ชุด: SB01 (22) · SD01 (15) · SD04 (15)   |   ภาพการ์ด: img/<FILE>.jpg
   ability: { kw, text(คำต่อคำจากการ์ด), when, cost, once, ops[] }
   ops ที่ engine รองรับ: cp setPower draw mill discard ready rest move swap noDestroyBattle
     point foePoint destroyTerrain revealAdd addFromOutzone playFromOutzone playOutzoneRest
     playRevealed playHandUnits outzoneToBottom toBottomRest shiftCost ascend foeDestroyChoice
     banish summon autoCore bounce cancel triggerCheck toOutzone flare core damage destroy
   ========================================================================== */

const RULES = {
  name: 'Zonefall',
  version: 'Dev V.24 · digital build v1.1 (การ์ดจริง 52 ใบ)',
  rows: 5, cols: 3, coreRow: 2,
  backRow: { p0: 4, p1: 0 }, frontRow: { p0: 3, p1: 1 },
  corePointsToWin: 7,
  flareMax: 8,
  unitLimit: 4, terrainLimitBase: 1,
  handStart: 4, handMax: 10,
  deckMin: 40, deckMax: 60, maxCopy: 3,
  attackFlare: 1,            // *ข้อสมมติ*โจมตีใช้ 1 Flare (มีการ์ดที่ระบุว่ายิงฟรี)
  movePerAction: 1,          // *ข้อสมมติ*เดิน 1 ช่อง/แอ็ค
  secondPlayerNoFirstDraw: true,
  combatVariant: 'persistent',
  extraZoneMax: 5,
  protectionLimit: 6,
};

const COLORS = {
  yellow: { name: 'Yellow', tone: '#f2c744' },
  blue: { name: 'Blue', tone: '#4ea8ff' },
  red: { name: 'Red', tone: '#ff6a4d' },
  green: { name: 'Green', tone: '#5fd66f' },
  purple: { name: 'Purple', tone: '#b48cff' },
  colorless: { name: 'Colorless', tone: '#a8b6d4' },
};

const CARDS = [
  {
    id: 'sb01001', file: 'SB01-001', art: 'img/SB01-001.jpg',
    name: 'Diomedium, Hero of the Celestial Realm', type: 'unit', color: 'Yellow', tribe: 'Deity / Celestial Alliance',
    cost: 9, cp: 4000,
    protection: false,
    abilities: [
      { kw: 'Ascend', text: 'Play over a unit you control with equal or lower cost. If it\'s Yellow, reduce cost by target\'s base cost and Ascended (Merge target).', ops: [] },
      { kw: 'Activate', once: true, text: 'Discard 1: Target 1 Yellow unit you control gains +3000 Power this turn. If Ascended, Merge top card of deck under this unit. Then, if this unit has 6+ Merged cards, gain 1 Point (opponent triggers normally).', ops: [{"op":"cp","to":"self","n":3000,"dur":"turn","color":"Yellow","tribe":null},{"op":"point","n":1}] }
    ],
  },
  {
    id: 'sb01002', file: 'SB01-002', art: 'img/SB01-002.jpg',
    name: 'Guardian\'s Blessing', type: 'command', color: 'Yellow', tribe: 'Sacred Power',
    cost: 4,
    protection: false,
    abilities: [
      { kw: 'Quick-Cast', when: 'quick', text: 'When you or your opponent gains a Point, choose 1: - If you gained a Point: Ready all units you control. - If your opponent gained a Point and has 5 or more Points: Both players reveal their hands, then you play the Yellow unit with the highest cost from your hand onto your back-row space.', ops: [{"op":"ready","to":"allyAll"}] }
    ],
  },
  {
    id: 'sb01003', file: 'SB01-003', art: 'img/SB01-003.jpg',
    name: 'Ahlama, Spirit Communicator of Nature', type: 'unit', color: 'Green', tribe: 'Human / Shaman',
    cost: 6, cp: 3000,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'Mill 2, then place up to 1 Terrains from your Out Zone onto your front-row spaces without a Terrain.', ops: [{"op":"mill","n":2}] },
      { kw: 'Activate', once: true, text: 'Rest this unit: If no units were readied by effects this turn, Ready all your other rested units on your Sylvan spaces.', ops: [{"op":"ready","to":"allySylvan"},{"op":"rest","to":"self"}] }
    ],
  },
  {
    id: 'sb01004', file: 'SB01-004', art: 'img/SB01-004.jpg',
    name: 'Agrony, Mutant Armored Queen', type: 'unit', color: 'Green', tribe: 'Insect / Mutant',
    cost: 8, cp: 3000,
    protection: false,
    abilities: [
      { kw: 'Cont', when: 'handCost', text: 'Reduces this card\'s base cost by 3 for each Terrain you destroyed this turn.', ops: [], req: [{"kind":"handCostReduce","per":3,"by":"terrainDestroyed"},{"kind":"inHand"}] },
      { kw: 'Attack', when: 'attack', once: true, text: 'When this unit attacks: Discard 1 card or destroy 1 Terrain you control. At the end of battle, Ready this unit.', ops: [{"op":"discard","n":1,"upTo":false},{"op":"ready","to":"self"},{"op":"destroyTerrain","scope":"mine1"}] }
    ],
  },
  {
    id: 'sb01005', file: 'SB01-005', art: 'img/SB01-005.jpg',
    name: 'Anger\'s Giant Worm, Mutant Insect', type: 'unit', color: 'Green', tribe: 'Insect / Mutant',
    cost: 4, cp: 2000,
    protection: false,
    abilities: [
      { kw: 'Cont', when: 'handCost', text: 'Reduce this cost by 1 if you control a Terrain or destroyed a Terrain this turn.', ops: [], req: [{"kind":"handCostReduce","per":1,"by":"terrainControl"},{"kind":"inHand"}] },
      { kw: 'On Play', when: 'deploy', text: 'When played from hand: Destroy any number of Terrains you control. This unit gains +2000 Power for each Terrain destroyed.', ops: [{"op":"cp","to":"self","n":2000,"dur":"turn","color":null,"tribe":null},{"op":"destroyTerrain","scope":"mineAll"}] }
    ],
  },
  {
    id: 'sb01006', file: 'SB01-006', art: 'img/SB01-006.jpg',
    name: 'Deepwood Rock Nest', type: 'terrain', color: 'Green', tribe: 'Nest / Sylvan',
    cost: 3,
    protection: false,
    cellEffects: [],
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'Look at the top 3 cards of your deck. Reveal 1 Insect unit from among them and add it to your hand, then discard the rest.', ops: [{"op":"revealAdd","n":3,"filter":"Insect"}] },
      { kw: 'Action', when: 'terrainDestroyed', text: 'When this card is destroyed from the field: Draw 1 card.', ops: [{"op":"draw","n":1}] }
    ],
  },
  {
    id: 'sb01007', file: 'SB01-007', art: 'img/SB01-007.jpg',
    name: 'Sethergross, Hellfire Fiend Dragon', type: 'unit', color: 'Red', tribe: 'Dragon / Fiend',
    cost: 8, cp: 3000,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'Both players choose 1 unit they control. Move this unit 1 space forward, then destroy all units chosen by this effect.', ops: [{"op":"move","to":"allyFilter","dir":"fwd","n":1}] },
      { kw: 'Cont', when: 'cont', text: 'During your turn, this unit gains +2000 Power for each unit in the Core Zone. If your opponent controls 2+ units in the Core Zone, this unit gains "[Once per turn] At the end of battle this unit attacked: Ready this unit."', ops: [{"op":"cp","to":"self","n":2000,"dur":"turn","color":null,"tribe":null},{"op":"ready","to":"self"}] }
    ],
  },
  {
    id: 'sb01008', file: 'SB01-008', art: 'img/SB01-008.jpg',
    name: 'Goen, Hellfire Fiend', type: 'unit', color: 'Red', tribe: 'Fiend',
    cost: 5, cp: 2000,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'Reveal 1 Red unit with cost 2 or less from your hand: Play it onto an open back-row space you control. If you do, draw 2 cards.', ops: [{"op":"draw","n":2}] },
      { kw: 'Action', when: 'action', once: true, text: 'When another unit you control is destroyed by card effects, if this unit is Rested: Ready this unit and it gains +2000 Power until end of turn.', ops: [{"op":"cp","to":"self","n":2000,"dur":"turn","color":null,"tribe":null},{"op":"ready","to":"self"}] }
    ],
  },
  {
    id: 'sb01009', file: 'SB01-009', art: 'img/SB01-009.jpg',
    name: 'Showtime Blast', type: 'command', color: 'Red', tribe: 'Magical',
    cost: 4,
    protection: false,
    abilities: [
      { kw: 'Cast', when: 'cast', text: 'If opponent controls 2+ units in Core Zone: Opponent destroys 1 unit they control. If a Core Zone unit is destroyed this way, that opponent draws 1 card. If not, move 1 Red unit you control 1 space forward.', ops: [{"op":"move","to":"target","dir":"fwd","n":1},{"op":"foeDestroyChoice"}] }
    ],
  },
  {
    id: 'sb01010', file: 'SB01-010', art: 'img/SB01-010.jpg',
    name: 'Noventhia, Dimension-Swallowed', type: 'unit', color: 'Purple', tribe: 'Human / Witch',
    cost: 6, cp: 2500,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'When played from hand: Discard up to 2 cards. If you do, choose Witch units you control equal to the number of discarded cards and move each 1 space forward.', ops: [{"op":"discard","n":2,"upTo":true},{"op":"move","to":"allyFilter","dir":"fwd","n":1}] },
      { kw: 'Cont', when: 'cont', text: 'During your turn, the Power of all Witch units you control becomes 2500, and they gain "[Once per turn] At the end of battle this unit attacked: Ready this unit."', ops: [{"op":"ready","to":"self"}] },
      { kw: 'Trigger', text: ': If you control a Witch unit: Play this unit and 1 other Witch unit from your hand onto different back-row spaces you control.', ops: [] }
    ],
  },
  {
    id: 'sb01011', file: 'SB01-011', art: 'img/SB01-011.jpg',
    name: 'Ophel, Otherworldly Fiend', type: 'unit', color: 'Purple', tribe: 'Fiend',
    cost: 3, cp: 1000,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'When played from hand: Rest this unit. If you do, draw 1 card and discard 1 card.', ops: [{"op":"draw","n":1},{"op":"discard","n":1,"upTo":false}] },
      { kw: 'Action', when: 'action', text: 'When your Purple unit with cost 5 or higher is played from hand, or when this unit is Devoured: Put this unit on the bottom of your deck. If you do, draw 2 cards.', ops: [{"op":"draw","n":2}] }
    ],
  },
  {
    id: 'sb01012', file: 'SB01-012', art: 'img/SB01-012.jpg',
    name: 'Hall of Silence', type: 'terrain', color: 'Purple', tribe: 'Void Space',
    cost: 4,
    protection: false,
    cellEffects: [{"op":"cp","to":"unitInCell","n":1000,"mineTurnOnly":true},{"op":"costLock","to":"unitInCell","maxCost":5,"value":10}],
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'Look at the top 4 cards of your deck. Reveal up to 1 Purple unit with cost 6 or higher and add it to your hand, then place the rest on the bottom of your deck in any order.', ops: [{"op":"revealAdd","n":4,"filter":"Purple","minCost":6}] },
      { kw: 'Trigger', text: 'Resolve this card\'s [On Play] effect.', ops: [{"op":"deploySelf"}] }
    ],
  },
  {
    id: 'sb01013', file: 'SB01-013', art: 'img/SB01-013.jpg',
    name: 'Glowing Curse', type: 'command', color: 'Purple', tribe: 'Curse',
    cost: 2,
    protection: false,
    abilities: [
      { kw: 'Quick-Cast', when: 'quick', text: 'When your Witch unit battles, choose 1 of your battling units: Until end of battle, the lower Power unit wins the battle and is destroyed instead (this counts as battle destruction).', ops: [] }
    ],
  },
  {
    id: 'sb01014', file: 'SB01-014', art: 'img/SB01-014.jpg',
    name: 'Phllit, Dimension Surfer', type: 'unit', color: 'Purple', tribe: 'Vampire / Warper',
    cost: 5, cp: 2000,
    protection: false,
    abilities: [
      { kw: 'Attack', when: 'attack', once: true, text: 'Rest 1 other unit you control: This unit gains +2000 Power until end of turn. At the end of battle, swap positions of this unit and the chosen unit.', ops: [{"op":"cp","to":"self","n":2000,"dur":"turn","color":null,"tribe":null}] },
      { kw: 'Action', when: 'action', once: true, text: 'When your unit moves: You may Rest this unit. If you do, swap positions of this unit and that unit.', ops: [] },
      { kw: 'Trigger', text: ': Draw 1 cards.', ops: [{"op":"draw","n":1}] }
    ],
  },
  {
    id: 'sb01015', file: 'SB01-015', art: 'img/SB01-015.jpg',
    name: 'Aetonia, Wasteland Heroine', type: 'unit', color: 'Yellow', tribe: 'Valkyrie',
    cost: 4, cp: 2000,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'Merge top 2 cards of your deck under this unit.', ops: [] },
      { kw: 'Attack', when: 'attack', text: 'Unmerge 1 card from under this unit: Gains +3000 Power this turn. If this unit wins the battle, destroys a unit, and has not been Readied by an effect this turn: Ready this unit.', ops: [{"op":"cp","to":"self","n":3000,"dur":"turn","color":null,"tribe":null},{"op":"ready","to":"self"}] }
    ],
  },
  {
    id: 'sb01016', file: 'SB01-016', art: 'img/SB01-016.jpg',
    name: 'Oskopus, Otherworldly Anomaly', type: 'unit', color: 'Purple', tribe: 'Vampire / Warper',
    cost: 10, cp: 3000,
    protection: false,
    abilities: [
      { kw: 'Cont', when: 'cont', text: 'During your turn, this unit gains +1000 Power for each other unit with cost 10 or higher you control.', ops: [{"op":"cp","to":"self","n":1000,"dur":"turn","color":null,"tribe":null}] },
      { kw: 'Action', when: 'action', text: 'When you play a unit from hand: If the total cost of units you control on the field is 10 or higher and you do not control "Oskopus, Otherworldly Anomaly", play this unit from your hand Rested onto your front row.', ops: [] },
      { kw: 'Trigger', text: ': Play this unit onto a space you control. Devour target unit (Merge target under this unit).', ops: [] }
    ],
  },
  {
    id: 'sb01017', file: 'SB01-017', art: 'img/SB01-017.jpg',
    name: 'Wofar, Master Illusionist', type: 'unit', color: 'Red', tribe: 'Human',
    cost: 5, cp: 1000,
    protection: false,
    abilities: [
      { kw: 'Cont', when: 'cont', text: 'Gains +1000 Power for each Rested Red unit you control.', ops: [{"op":"cp","to":"target","n":1000,"dur":"turn","color":"Red","tribe":null}] },
      { kw: 'Action', when: 'action', once: true, text: 'When your other unit moves: Rest 1 other Readied unit you control. If you do, move this unit 1 space forward.', ops: [{"op":"move","to":"target","dir":"fwd","n":1}] },
      { kw: 'Action', when: 'action', text: 'When this unit is destroyed by card effects: Discard 1 card. If you do, return this unit to your hand instead of the Out Zone.', ops: [{"op":"discard","n":1,"upTo":false}] },
      { kw: 'Trigger', text: ': Draw 1 cards.', ops: [{"op":"draw","n":1}] }
    ],
  },
  {
    id: 'sb01018', file: 'SB01-018', art: 'img/SB01-018.jpg',
    name: 'Laina, Aerial Strike Commander', type: 'unit', color: 'Blue', tribe: 'Human / Striker',
    cost: 4, cp: 1500,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', cost: 2, text: ': Move this unit 1 space forward.', ops: [{"op":"move","to":"target","dir":"fwd","n":1}] },
      { kw: 'Attack', when: 'attack', once: true, text: 'If you control 3 or more Blue units, resolve all of the following in order: - If you have 5 or more Flare: Draw 1 card and this unit gains +3000 Power until end of turn. - Set your Flare to 3 if you have 2 or less Flare.', ops: [{"op":"draw","n":1},{"op":"cp","to":"self","n":3000,"dur":"turn","color":"Blue","tribe":null}], req: [{"kind":"colorCount","min":3},{"kind":"colorCount","color":"Blue","min":3}] }
    ],
  },
  {
    id: 'sb01019', file: 'SB01-019', art: 'img/SB01-019.jpg',
    name: 'Andrua, Continental Traveler', type: 'unit', color: 'Blue', tribe: 'Human / Adventurer',
    cost: 3, cp: 1000,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'Search your deck for up to 1 Map or Treasure Strategy card, reveal it, and add it to your hand. Shuffle your deck.', ops: [] },
      { kw: 'Activate', once: true, text: 'Rest this unit: Choose 1 other Adventurer unit you control and move it 1 space forward.', ops: [{"op":"rest","to":"self"},{"op":"move","to":"target","dir":"fwd","n":1}] }
    ],
  },
  {
    id: 'sb01020', file: 'SB01-020', art: 'img/SB01-020.jpg',
    name: 'Target Search', type: 'command', color: 'Blue', tribe: 'Map / Treasure Strategy',
    cost: 3,
    protection: false,
    abilities: [
      { kw: 'Cast', when: 'cast', text: 'Reveal the top 4 cards of your deck. Choose up to 1 card with cost 6 from among them and add it to your hand, then place the rest on the bottom of your deck in any order. If the card added to your hand is Blue, place the rest on top of your deck in any order instead.', ops: [{"op":"toBottomRest"}] }
    ],
  },
  {
    id: 'sb01021', file: 'SB01-021', art: 'img/SB01-021.jpg',
    name: 'Slight of Hand', type: 'command', color: 'Colorless', tribe: 'Generic',
    cost: 3,
    protection: false,
    abilities: [
      { kw: 'Cast', when: 'cast', text: 'Declare 1 color (except Colorless) and 1 card type (Unit, Command, or Terrain). Reveal the top card of your deck. If it matches both declared color and type, add it to your hand, then look at the top card of your opponent\'s deck.', ops: [] }
    ],
  },
  {
    id: 'sb01022', file: 'SB01-022', art: 'img/SB01-022.jpg',
    name: 'Trust Your Instincts!', type: 'command', color: 'Blue', tribe: 'Assault',
    cost: 2,
    protection: false,
    abilities: [
      { kw: 'Cast', when: 'cast', text: 'If you control 2 or more Blue units or Adventurer units: Choose 1 Rested unit you control; Ready that unit (that unit cannot be Readied again until end of turn).', ops: [{"op":"ready","to":"self"}], req: [{"kind":"colorCount","min":2},{"kind":"colorCount","color":"Blue","min":2}] }
    ],
  },
  {
    id: 'sd01001', file: 'SD01-001', art: 'img/SD01-001.jpg',
    name: 'Amorphomagiada, Fanged Giant Plant', type: 'unit', color: 'Green', tribe: 'Plant / Mutant',
    cost: 6, cp: 4000, flags: ['noMoveOutzone:12'],
    protection: false,
    abilities: [
      { kw: 'Cont', when: 'cont', text: 'During your turn, if you have 10 or less cards in your Out Zone, this unit cannot move.', ops: [], req: [{"kind":"outzoneMax","min":10}] },
      { kw: 'Activate', cost: 2, once: true, text: ': If you do, and you have 12 or more cards in your Out Zone: Ready this unit. Return 2 Green cards from your Out Zone to the bottom of your deck in any order.', ops: [{"op":"ready","to":"self"},{"op":"outzoneToBottom","filter":"Green","n":2}], req: [{"kind":"outzoneMin","min":12}] },
      { kw: 'Trigger', text: ': If you have 12 or more cards in your Out Zone, play this unit onto your front row. If not, Mill 4.', ops: [{"op":"mill","n":4}], req: [{"kind":"outzoneMin","min":12}] }
    ],
  },
  {
    id: 'sd01002', file: 'SD01-002', art: 'img/SD01-002.jpg',
    name: 'Ahenla, Huntress Tribal Maiden', type: 'unit', color: 'Green', tribe: 'Human / Warrior',
    cost: 4, cp: 2000,
    protection: false,
    abilities: [
      { kw: 'Activate', once: true, text: 'Rest 1 Terrain card in the space this unit occupies: Ready this unit.', ops: [{"op":"ready","to":"self"}] },
      { kw: 'Attack', when: 'attack', text: 'Mill 1. Then, if you have 10 or more cards in your Out Zone, this unit gains +3000 Power until end of turn.', ops: [{"op":"mill","n":1},{"op":"cp","to":"self","n":3000,"dur":"turn","color":null,"tribe":null}], req: [{"kind":"outzoneMin","min":10}] },
      { kw: 'Trigger', text: ': Mill 2.', ops: [{"op":"mill","n":2}] }
    ],
  },
  {
    id: 'sd01003', file: 'SD01-003', art: 'img/SD01-003.jpg',
    name: 'Chole, Tribal Medium', type: 'unit', color: 'Green', tribe: 'Human / Shaman',
    cost: 5, cp: 2000,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'Mill 1. Choose 1 Green unit with cost 4 or less from your Out Zone; play that unit to your back row Rested. If you have 10 or more cards in your Out Zone, you may play it to your front row instead.', ops: [{"op":"mill","n":1},{"op":"playFromOutzone","filter":"Green","maxCost":4},{"op":"playOutzoneRest","row":"front"}], req: [{"kind":"outzoneMin","min":10}] },
      { kw: 'Trigger', text: ': Mill 1 and draw 1 card.', ops: [{"op":"draw","n":1},{"op":"mill","n":1}] }
    ],
  },
  {
    id: 'sd01004', file: 'SD01-004', art: 'img/SD01-004.jpg',
    name: 'Cere, Wild Tribesman', type: 'unit', color: 'Green', tribe: 'Beastfolk',
    cost: 3, cp: 1000,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'When played from hand: Mill 2. If played from Out Zone: Choose 1 unit you control; it gains +2000 Power until end of turn.', ops: [{"op":"mill","n":2},{"op":"cp","to":"target","n":2000,"dur":"turn","color":null,"tribe":null}] }
    ],
  },
  {
    id: 'sd01005', file: 'SD01-005', art: 'img/SD01-005.jpg',
    name: 'Wild Wolf, Savage Beast', type: 'unit', color: 'Green', tribe: 'Beast',
    cost: 4, cp: 3000,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'Mill 1. Then, if you have 10 or more cards in your Out Zone, draw 1 card.', ops: [{"op":"draw","n":1},{"op":"mill","n":1}], req: [{"kind":"outzoneMin","min":10}] },
      { kw: 'Trigger', text: ': Mill 2.', ops: [{"op":"mill","n":2}] }
    ],
  },
  {
    id: 'sd01006', file: 'SD01-006', art: 'img/SD01-006.jpg',
    name: 'Emma, Wandering Hiker', type: 'unit', color: 'Green', tribe: 'Human / Adventurer',
    cost: 2, cp: 1000,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'Mill 1. Then, choose up to 1 Adventurer unit, Map card, or Treasure Strategy card from your Out Zone; add it to your hand. If you have 10 or more cards in your Out Zone, look at the top card of your deck; place it on top of your deck or send it to the Out Zone.', ops: [{"op":"mill","n":1}], req: [{"kind":"outzoneMin","min":10}] }
    ],
  },
  {
    id: 'sd01007', file: 'SD01-007', art: 'img/SD01-007.jpg',
    name: 'Deepwood Sylvan', type: 'terrain', color: 'Green', tribe: 'Sylvan',
    cost: 2, flags: ['multiTerrain'],
    protection: false,
    cellEffects: [{"op":"cp","to":"unitInCell","n":1000,"mineTurnOnly":true}],
    abilities: [
      { kw: 'Cont', text: '(You can control multiple Sylvan Terrains.)', ops: [] },
      { kw: 'Cont', text: 'During your turn, units in this space gain +1000 Power.', ops: [] }
    ],
  },
  {
    id: 'sd01008', file: 'SD01-008', art: 'img/SD01-008.jpg',
    name: 'Sylvan Mystery', type: 'terrain', color: 'Green', tribe: 'Sylvan',
    cost: 3, flags: ['multiTerrain'],
    protection: false,
    cellEffects: [{"op":"cp","to":"unitInCell","n":1000,"color":"Green","mineTurnOnly":true}],
    abilities: [
      { kw: 'Cont', text: '(You can control multiple Sylvan Terrains.)', ops: [] },
      { kw: 'Cont', text: 'Green units in this space gain +1000 Power. If you control 3+ Terrains, your "Mill 1" effects become "Mill 2".', ops: [] }
    ],
  },
  {
    id: 'sd01009', file: 'SD01-009', art: 'img/SD01-009.jpg',
    name: 'Shamanic Talisman', type: 'command', color: 'Green', tribe: 'Spell',
    cost: 4,
    protection: false,
    abilities: [
      { kw: 'Passive', text: '(Play this card only if you control a Shaman unit.)', ops: [] },
      { kw: 'Quick-Cast', when: 'quick', text: 'When your unit attacks or is attacked: Choose 1 of your battling Green units; it gains +1000 Power for each Terrain and Green unit you control until end of turn.', ops: [{"op":"cp","to":"target","n":1000,"dur":"turn","color":"Green","tribe":null}] },
      { kw: 'Trigger', text: ': Choose 1 Shaman unit from your Out Zone; add it to your hand.', ops: [{"op":"addFromOutzone","filter":"Shaman"}] }
    ],
  },
  {
    id: 'sd01010', file: 'SD01-010', art: 'img/SD01-010.jpg',
    name: 'Shield Guard', type: 'command', color: 'Colorless', tribe: 'Protection / Generic',
    cost: 1,
    protection: true,
    abilities: [
      { kw: 'Passive', text: '(You can only have up to 6 Protection cards in your deck.)', ops: [] },
      { kw: 'Quick-Cast', when: 'quick', text: 'When your unit is attacked: Choose 1 of your attacked units; it gains +3000 Power until end of turn.', ops: [{"op":"cp","to":"target","n":3000,"dur":"turn","color":null,"tribe":null}] },
      { kw: 'Trigger', text: ': Banishes this card: Your opponent loses 2 points (cannot reduce below 1).', ops: [{"op":"foePoint","n":-2,"floor":1},{"op":"foePoint","n":-2,"floor":1}] }
    ],
  },
  {
    id: 'sd01011', file: 'SD01-011', art: 'img/SD01-011.jpg',
    name: 'Barrier', type: 'command', color: 'Colorless', tribe: 'Protection / Generic',
    cost: 2,
    protection: true,
    abilities: [
      { kw: 'Passive', text: '(You can only have up to 6 Protection cards in your deck.)', ops: [] },
      { kw: 'Quick-Cast', when: 'quick', text: 'When your unit is attacked: Choose 1 of your attacked units; that unit cannot be destroyed by battle until the end of this battle. Then, move that unit back 1 space.', ops: [{"op":"move","to":"target","dir":"back","n":1},{"op":"noDestroyBattle","to":"target"}] },
      { kw: 'Trigger', text: ': Banishes this card: Your opponent loses 2 points (cannot reduce below 1).', ops: [{"op":"foePoint","n":-2,"floor":1},{"op":"foePoint","n":-2,"floor":1}] }
    ],
  },
  {
    id: 'sd01012', file: 'SD01-012', art: 'img/SD01-012.jpg',
    name: 'Angelica, Continental Explorer', type: 'unit', color: 'Blue', tribe: 'Human / Adventurer',
    cost: 4, cp: 2000,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'Choose 1 Readied unit in your back row; return it to your hand. If the chosen unit is a Blue unit or an Adventurer unit, draw 1 card and this unit gains +1000 Power until end of turn.', ops: [{"op":"draw","n":1},{"op":"cp","to":"self","n":1000,"dur":"turn","color":"Blue","tribe":"Adventurer"}] }
    ],
  },
  {
    id: 'sd01013', file: 'SD01-013', art: 'img/SD01-013.jpg',
    name: 'Charles, Pioneer Explorer', type: 'unit', color: 'Blue', tribe: 'Human / Adventurer',
    cost: 6, cp: 2000,
    protection: false,
    abilities: [
      { kw: 'Cont', when: 'handCost', text: 'If this card was returned to your hand by a card effect this turn, its base cost becomes 2.', ops: [], req: [{"kind":"inHand"}] },
      { kw: 'On Play', when: 'deploy', text: 'Reveal top cards of your deck equal to the number of Blue units or Adventurer units you control. Choose up to 1 Terrain or non-Generic Command card from among them and add it to your hand, then send the rest to the Out Zone.', ops: [{"op":"revealAdd","n":-1,"filter":"Terrain|Command"}] }
    ],
  },
  {
    id: 'sd01014', file: 'SD01-014', art: 'img/SD01-014.jpg',
    name: 'Powre, Long-Distance Messenger', type: 'unit', color: 'Blue', tribe: 'Human',
    cost: 1, cp: 1000, flags: ['noMoveAllyColor:Blue|Adventurer'],
    protection: false,
    abilities: [
      { kw: 'Cont', when: 'cont', text: 'If you do not control another Blue unit or another Adventurer unit, this unit cannot move.', ops: [] }
    ],
  },
  {
    id: 'sd01015', file: 'SD01-015', art: 'img/SD01-015.jpg',
    name: 'Spreading Roots', type: 'command', color: 'Green', tribe: 'Plant',
    cost: 6,
    protection: false,
    abilities: [
      { kw: 'Cast', when: 'cast', text: 'All Green units you control gain +1000 Power this turn (continuous). If you control a Plant unit: Choose 1 opponent\'s unit in the same column as your Plant unit; move it 1 space forward.', ops: [{"op":"cp","to":"allyFilter","n":1000,"dur":"turn","color":"Green","tribe":"Plant"},{"op":"move","to":"allyFilter","dir":"fwd","n":1}] }
    ],
  },
  {
    id: 'sd04001', file: 'SD04-001', art: 'img/SD04-001.jpg',
    name: 'SKY-Servant, Apex Aerial Machina', type: 'unit', color: 'Blue', tribe: 'Machine / Striker',
    cost: 6, cp: 3000,
    protection: false,
    abilities: [
      { kw: 'Attack', when: 'attack', once: true, text: 'When this unit attacks a unit with cost 6 or higher: Pay 2 Flare. If you do, play 1 Operation Command card from your hand without paying its cost.', ops: [] },
      { kw: 'Action', when: 'action', text: 'When you play an Operation Command card, after it resolves: This unit gains +2000 Power until end of turn.', ops: [{"op":"cp","to":"self","n":2000,"dur":"turn","color":null,"tribe":null}] },
      { kw: 'Trigger', text: ': If you control 2 or more Blue units in your back row, play this unit onto your back row.', ops: [], req: [{"kind":"colorCount","min":2},{"kind":"colorCount","color":"Blue","min":2},{"kind":"colorBackRow","color":"Blue","min":2}] }
    ],
  },
  {
    id: 'sd040012', file: 'SD04-0012', art: 'img/SD04-0012.jpg',
    name: 'Darkflow', type: 'command', color: 'Purple', tribe: 'Buff',
    cost: 1,
    protection: false,
    abilities: [
      { kw: 'Cast', when: 'cast', text: 'Choose 1 unit with cost 6 or higher you control; it gains -3000 Power until end of turn. If its Power is not reduced to 0 by this effect, move that unit 1 space left or right.', ops: [{"op":"cp","to":"target","n":-3000,"dur":"turn"},{"op":"move","to":"self","dir":"side","n":1}] }
    ],
  },
  {
    id: 'sd040013', file: 'SD04-0013', art: 'img/SD04-0013.jpg',
    name: 'Xertorene, Machina Humanoid', type: 'unit', color: 'Purple', tribe: 'Human',
    cost: 5, cp: 1500,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'Choose 1: - Choose 1 other Machine unit you control; move that unit 1 space left or right. - If you control another Purple unit, choose 1 unit you control in the front row; swap the positions of this unit and that unit.', ops: [{"op":"move","to":"allyFilter","dir":"side","n":1},{"op":"swap","to":"self"}] },
      { kw: 'Trigger', text: ': Draw 1 card.', ops: [{"op":"draw","n":1}] }
    ],
  },
  {
    id: 'sd040014', file: 'SD04-0014', art: 'img/SD04-0014.jpg',
    name: 'No. 71", Mysterious Esper', type: 'unit', color: 'Purple', tribe: 'Human / Esper',
    cost: 5, cp: 1000,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'Increase or decrease this unit\'s cost by 1. If you do, the base Power of all units with the highest cost you control becomes 4000 until end of turn. Then, draw cards equal to the number of units you control with 4000 Power (max 2 cards from this effect).', ops: [{"op":"setPower","to":"allyHighestCost","n":4000,"dur":"turn"},{"op":"shiftCost","n":1}] }
    ],
  },
  {
    id: 'sd040015', file: 'SD04-0015', art: 'img/SD04-0015.jpg',
    name: 'Combat Maintenance', type: 'command', color: 'Blue', tribe: 'Repair',
    cost: 3,
    protection: false,
    abilities: [
      { kw: 'Cast', when: 'cast', text: 'Choose 1 unit you control; draw 1 card, and that unit gains +1000 Power until end of turn. If the chosen unit is a Blue unit or a Machine unit, move that unit 1 space backward at the end of this turn (after Point calculation).', ops: [{"op":"draw","n":1},{"op":"cp","to":"target","n":1000,"dur":"turn","color":"Blue","tribe":"Machine"},{"op":"move","to":"target","dir":"back","n":1}] }
    ],
  },
  {
    id: 'sd04002', file: 'SD04-002', art: 'img/SD04-002.jpg',
    name: 'Cliff, Sub-Unit Commander', type: 'unit', color: 'Blue', tribe: 'Human',
    cost: 4, cp: 2000,
    protection: false,
    abilities: [
      { kw: 'On Play', when: 'deploy', text: 'Look at the top 4 cards of your deck. Reveal up to 1 Blue card with cost 6 from among them and add it to your hand, then place the rest on the bottom of your deck in any order.', ops: [{"op":"revealAdd","n":4,"filter":"Blue"},{"op":"toBottomRest"}] },
      { kw: 'Cont', when: 'cont', text: 'If you played an Operation Command card this turn, other units you control in the same column as this unit gain +2000 Power.', ops: [{"op":"cp","to":"allyColumn","n":2000,"dur":"turn","color":null,"tribe":null}], req: [{"kind":"flag","flag":"operationPlayed"}] },
      { kw: 'Trigger', text: ': Draw 1 card.', ops: [{"op":"draw","n":1}] }
    ],
  },
  {
    id: 'sd04003', file: 'SD04-003', art: 'img/SD04-003.jpg',
    name: 'Operation: Vanguard Surge', type: 'command', color: 'Blue', tribe: 'Operation',
    cost: 6,
    protection: false,
    abilities: [
      { kw: 'Cast', when: 'cast', text: 'Choose 1 Machine unit you control; it gains +3000 Power and "[Once per turn] End of battle this unit attacked: Ready this unit" until end of turn. If this card was played by a unit\'s effect, affect all Blue units you control instead of choosing 1 Machine unit.', ops: [{"op":"cp","to":"allyFilter","n":3000,"dur":"turn","color":"Blue","tribe":"Machine"},{"op":"ready","to":"self"}], req: [{"kind":"flag","flag":"byUnitEffect"}] },
      { kw: 'Trigger', text: ': Reveal top 3 cards of your deck: Play 1 cost 6 unit from among them onto your back row, send the rest to Out Zone.', ops: [{"op":"revealAdd","n":3,"filter":"unit"},{"op":"playRevealed","maxCost":null}] }
    ],
  },
  {
    id: 'sd04004', file: 'SD04-004', art: 'img/SD04-004.jpg',
    name: 'Field Command Drone', type: 'unit', color: 'Blue', tribe: 'Machine',
    cost: 2, cp: 1000,
    protection: false,
    abilities: [
      { kw: 'Activate', once: true, text: 'Rest this unit and 1 other unit you control in your back row: Move 1 other Machine unit you control 1 space.', ops: [{"op":"rest","to":"self"}] },
      { kw: 'Action', when: 'action', text: 'When you play a Command card, after it resolves: This unit gains +1000 Power until end of turn.', ops: [{"op":"cp","to":"self","n":1000,"dur":"turn","color":null,"tribe":null}], req: [{"kind":"flag","flag":"commandPlayed"}] }
    ],
  },
  {
    id: 'sd04005', file: 'SD04-005', art: 'img/SD04-005.jpg',
    name: 'Rin, Protolaser Swordswoman', type: 'unit', color: 'Blue', tribe: 'Human / Warrior',
    cost: 3, cp: 1000,
    protection: false,
    abilities: [
      { kw: 'Action', when: 'action', once: true, text: 'When you play a Command card: Discard 1 card from your hand. If you do, Ready this unit, and it gains +1000 Power until end of turn.', ops: [{"op":"discard","n":1,"upTo":false},{"op":"cp","to":"self","n":1000,"dur":"turn","color":null,"tribe":null},{"op":"ready","to":"self"},{"op":"discard","n":1}], req: [{"kind":"flag","flag":"commandPlayed"}] }
    ],
  },
  {
    id: 'sd04006', file: 'SD04-006', art: 'img/SD04-006.jpg',
    name: 'Sentinel, Surveillance Machina', type: 'unit', color: 'Blue', tribe: 'Machine / Striker',
    cost: 6, cp: 2000,
    protection: false,
    abilities: [
      { kw: 'Activate', once: true, text: 'Discard 2 card: Choose 1 cost 6 Command card from your Out Zone; add it to your hand.', ops: [{"op":"discard","n":2,"upTo":false},{"op":"addFromOutzone","filter":"Command"}] },
      { kw: 'Action', when: 'action', text: 'When this unit attacks or is attacked, if this unit is in your front row: It gains +1000 Power until end of turn.', ops: [{"op":"cp","to":"self","n":1000,"dur":"turn","color":null,"tribe":null}] },
      { kw: 'Trigger', text: ': Play this unit onto your back row.', ops: [] }
    ],
  },
  {
    id: 'sd04007', file: 'SD04-007', art: 'img/SD04-007.jpg',
    name: 'A.Nia, Intelligence Strategist', type: 'unit', color: 'Blue', tribe: 'Machine',
    cost: 4, cp: 1000,
    protection: false,
    abilities: [
      { kw: 'Activate', cost: 2, once: true, text: ': All cost 6 units you control gain +1000 Power until end of turn, and Ready all other units in your back row.', ops: [{"op":"cp","to":"target","n":1000,"dur":"turn","color":null,"tribe":null},{"op":"ready","to":"allyBackRow"}] },
      { kw: 'Action', when: 'action', text: 'When your Blue unit is destroyed: Destroy this unit. If you do, look at the top 2 cards of your deck, place them on top of your deck in any order, then draw 1 card.', ops: [{"op":"draw","n":1},{"op":"revealAdd","n":2,"filter":"Blue"},{"op":"toBottomRest"},{"op":"destroySelf"}] },
      { kw: 'Trigger', text: ': Look at the top 2 cards of your deck, place them on top of your deck in any order, then draw 1 card.', ops: [{"op":"draw","n":1},{"op":"revealAdd","n":2,"filter":null},{"op":"toBottomRest"}] }
    ],
  },
  {
    id: 'sd04008', file: 'SD04-008', art: 'img/SD04-008.jpg',
    name: 'Drain, Energy Breaker', type: 'unit', color: 'Blue', tribe: 'Human',
    cost: 3, cp: 1500,
    protection: false,
    abilities: [
      { kw: 'Activate', text: 'Destroy this unit: If this unit was not played this turn, gain +2 Flare.', ops: [{"op":"destroySelf"}], req: [{"kind":"notPlayedThisTurn"}] }
    ],
  },
  {
    id: 'sd04009', file: 'SD04-009', art: 'img/SD04-009.jpg',
    name: 'B.Protector, Heavy-Armored Vanguard', type: 'unit', color: 'Blue', tribe: 'Machine',
    cost: 6, cp: 3000,
    protection: false,
    abilities: [
      { kw: 'Cont', when: 'handCost', text: 'Reduces this card\'s base cost by 2 for each Blue unit you control. If this unit enters the field without using Flare, play it Rested.', ops: [], req: [{"kind":"handCostReduce","per":2,"by":"colorUnits"},{"kind":"inHand"}] },
      { kw: 'Action', when: 'action', text: 'When you play a Command card, after it resolves: This unit gains +1000 Power until end of turn.', ops: [{"op":"cp","to":"self","n":1000,"dur":"turn","color":null,"tribe":null}], req: [{"kind":"flag","flag":"commandPlayed"}] },
      { kw: 'Trigger', text: ': If you control 3 or more Blue units, gain 1 Point (opponent triggers normally).', ops: [{"op":"point","n":1}], req: [{"kind":"colorCount","min":3},{"kind":"colorCount","color":"Blue","min":3}] }
    ],
  },
  {
    id: 'sd04010', file: 'SD04-010', art: 'img/SD04-010.jpg',
    name: 'Shield Guard', type: 'command', color: 'Colorless', tribe: 'Protection / Generic',
    cost: 1,
    protection: true,
    abilities: [
      { kw: 'Quick-Cast', when: 'quick', text: 'When your unit is attacked: Choose 1 of your attacked units; it gains +3000 Power until end of turn.', ops: [{"op":"cp","to":"target","n":3000,"dur":"turn","color":null,"tribe":null}] },
      { kw: 'Trigger', text: ': Banishes this card: Your opponent loses 2 points (cannot reduce below 1).', ops: [{"op":"foePoint","n":-2,"floor":1},{"op":"foePoint","n":-2,"floor":1}] }
    ],
  },
  {
    id: 'sd04011', file: 'SD04-011', art: 'img/SD04-011.jpg',
    name: 'Barrier', type: 'command', color: 'Colorless', tribe: 'Protection / Generic',
    cost: 2,
    protection: true,
    abilities: [
      { kw: 'Quick-Cast', when: 'quick', text: 'When your unit is attacked: Choose 1 of your attacked units; that unit cannot be destroyed by battle until the end of this battle. Then, move that unit back 1 space.', ops: [{"op":"move","to":"target","dir":"back","n":1},{"op":"noDestroyBattle","to":"target"}] },
      { kw: 'Trigger', text: ': Banishes this card: Your opponent loses 2 points (cannot reduce below 1).', ops: [{"op":"foePoint","n":-2,"floor":1},{"op":"foePoint","n":-2,"floor":1}] }
    ],
  },
];

const DECKS = {
  sylvan: {
    name: 'SD01 · Verdant Sylvan (Green)', color: 'Green',
    main: ['sd01001', 'sd01001', 'sd01001', 'sd01002', 'sd01002', 'sd01002', 'sd01003', 'sd01003', 'sd01003', 'sd01004', 'sd01004', 'sd01004', 'sd01005', 'sd01005', 'sd01005', 'sd01006', 'sd01006', 'sd01006', 'sd01007', 'sd01007', 'sd01007', 'sd01008', 'sd01008', 'sd01008', 'sd01009', 'sd01009', 'sd01009', 'sd01015', 'sd01015', 'sd01015', 'sd01012', 'sd01012', 'sd01013', 'sd01013', 'sd01014', 'sd01014', 'sd01010', 'sd01010', 'sd01011', 'sd01011'],   // 40 ใบ
    extra: ['sd01001', 'sd01001', 'sd01001', 'sd01002'],
  },
  machina: {
    name: 'SD04 · Blue Machina (Blue)', color: 'Blue',
    main: ['sd04001', 'sd04001', 'sd04001', 'sd040015', 'sd040015', 'sd040015', 'sd04002', 'sd04002', 'sd04002', 'sd04003', 'sd04003', 'sd04003', 'sd04004', 'sd04004', 'sd04004', 'sd04005', 'sd04005', 'sd04005', 'sd04006', 'sd04006', 'sd04006', 'sd04007', 'sd04007', 'sd04007', 'sd04008', 'sd04008', 'sd04008', 'sd04009', 'sd04009', 'sd04009', 'sd040012', 'sd040012', 'sd040013', 'sd040013', 'sd040014', 'sd040014', 'sd04010', 'sd04010', 'sd04011', 'sd04011'],   // 40 ใบ
    extra: ['sd04001', 'sd04001', 'sd04001', 'sd040015'],
  },
};

const CARD_INDEX = {};
CARDS.forEach(c => { CARD_INDEX[c.id] = c; });
