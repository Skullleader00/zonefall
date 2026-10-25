/* Advance Clash — service worker (offline-first shell) */
const CACHE = 'zonefall-v11';
const SHELL = [
  './', './index.html', './css/game.css',
  './js/data.js', './js/ability-ops.js', './js/engine.js', './js/effects.js', './js/ai.js', './js/ui.js',
  './assets/fonts/zonefall-display.woff2', './assets/fonts/zonefall-ui.woff2', './assets/fonts/zonefall-num.woff2',
  './assets/ui/logo.png', './assets/ui/icon-corepoint.png', './assets/ui/icon-flare.png', './assets/ui/icon-end.png',
  './assets/ui/icon-attack.png', './assets/ui/icon-move.png', './assets/ui/icon-phase-main.png',
  './assets/ui/frame-unit.png', './assets/ui/frame-terrain.png', './assets/ui/frame-command.png',
  './assets/ui/cell-plate.png', './assets/ui/cell-core.png', './assets/ui/rail-flare.png', './assets/ui/panel-choose.png',
  './assets/ui/pile-deck.png', './assets/ui/pile-out.png', './assets/ui/pile-remove.png', './assets/ui/pile-extra.png',
  './assets/ui/badge-win.png', './assets/ui/badge-lose.png',
  './assets/ui/rps-paper.png', './assets/ui/rps-rock.png', './assets/ui/rps-scissors.png',
  './assets/faction/verdant.png', './assets/faction/aegis.png', './assets/faction/ashen.png',
  './assets/faction/thronis.png', './assets/faction/nyx-horizon.png',
  './assets/bg/field-blue.jpg', './assets/bg/field-green.jpg', './assets/bg/field-red.jpg',
  './icons/icon-512.png',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
/* ภาพการ์ด 52 ใบ preload แบบ lazy (ไม่บล็อก boot แล้วค่อย cache ทีละใบ) */
const CARD_ART = ['SB01-001','SB01-002','SB01-003','SB01-004','SB01-005','SB01-006','SB01-007','SB01-008','SB01-009','SB01-010',
'SB01-011','SB01-012','SB01-013','SB01-014','SB01-015','SB01-016','SB01-017','SB01-018','SB01-019','SB01-020','SB01-021','SB01-022',
'SD01-001','SD01-002','SD01-003','SD01-004','SD01-005','SD01-006','SD01-007','SD01-008','SD01-009','SD01-010','SD01-011','SD01-012',
'SD01-013','SD01-014','SD01-015','SD04-001','SD04-002','SD04-003','SD04-004','SD04-005','SD04-006','SD04-007','SD04-008','SD04-009',
'SD04-010','SD04-011','SD04-0012','SD04-0013','SD04-0014','SD04-0015'].map(f => './assets/art/' + f + '.jpg');

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* โค้ด (html/js/css) = network before cache → แก้แล้วเห็นผลทันที ไม่ต้องรอ SW รอบใหม่
   ภาพ/ฟอนต์ = cache before network → เล่นออฟไลน์ได้เร็ว */
const CODE = /\.(js|css|html|webmanifest)(\?|$)/i;
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;              // ปล่อย Google Fonts ไปที่ network
  if (CODE.test(url.pathname)) {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html'))));
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});

/* ไล์การ์ด/ภาพประกอบทั้งหมดเข้า cache ทีละใบเมื่อว่าง */
async function warmCardArt() {
  const c = await caches.open(CACHE);
  for (const u of CARD_ART) {
    if (await c.match(u)) continue;
    try { await c.add(u); } catch (e) { }
    await new Promise(r => setTimeout(r, 40));
  }
}
self.addEventListener('message', e => { if (e.data === 'warm-art') warmCardArt(); });
