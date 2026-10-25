/* โหลด data + ability-ops + engine + effects + ai เข้า context เดียวกัน (Node, ไม่มี build step)
   ตั้งค่า ZF_FILES เพื่อกำหนดลำดับไฟล์เองได้ */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'js');
const files = (process.env.ZF_FILES || 'data.js,ability-ops.js,engine.js,effects.js,ai.js')
  .split(',').map(f => f.trim()).filter(Boolean);
const SRC = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

function stubEl() {
  return {
    style: {}, dataset: {}, children: [], classList: { add() { }, remove() { }, toggle() { }, contains: () => false },
    append(...a) { this.children.push(...a); }, appendChild(c) { this.children.push(c); return c; },
    addEventListener() { }, removeEventListener() { }, setAttribute() { }, removeAttribute() { },
    querySelector: () => null, querySelectorAll: () => [], focus() { }, blur() { }, click() { },
    get innerHTML() { return this._h || ''; }, set innerHTML(v) { this._h = v; },
    get textContent() { return this._t || ''; }, set textContent(v) { this._t = v; },
  };
}
const windowStub = {
  addEventListener() { }, removeEventListener() { }, matchMedia: () => ({ matches: false, addEventListener() { } }),
  localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
  location: { href: '', origin: '' }, requestAnimationFrame: cb => cb(0), setTimeout, clearTimeout,
  devicePixelRatio: 2, innerWidth: 1280, innerHeight: 800,
};
const documentStub = {
  addEventListener() { }, removeEventListener() { }, visibilityState: 'visible', readyState: 'complete',
  documentElement: stubEl(), body: stubEl(), head: stubEl(),
  createElement: () => stubEl(), createElementNS: () => stubEl(),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
};

module.exports = (code) => {
  let body;
  if (typeof code !== 'string') body = '(' + code.toString() + ')()';
  else if (!/;/.test(code) && !/^\s*(var|let|const|if|for|while|return|Object|try)\b/.test(code)) body = '(' + code + ')';
  else body = '(function(){' + code + '\n})()';
  const fn = new Function('window', 'document', 'navigator', 'location', 'localStorage',
    '"use strict";\n' + SRC + '\n;return ' + body + ';');
  return fn(windowStub, documentStub, { userAgent: 'node' }, windowStub.location, windowStub.localStorage);
};
module.exports.SRC = SRC;
module.exports.stubs = { window: windowStub, document: documentStub };
