/* โหลด data + engine + ai เข้า context เดียวกัน (ใช้กับ Node เพื่อทดสอบโดยไม่ต้อง has build step) */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'js');
const SRC = ['data.js', 'engine.js', 'ai.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

module.exports = (code) => {
  if (typeof code !== 'string') code = '(' + code.toString() + ')()';
  return eval('(function(){' + SRC + '\n' + code + '\n})()');
};
module.exports.SRC = SRC;
