const run = require('../test/harness');
const lines = run(`CARDS.map(c => c.id + ' | ' + c.name + ' :: ' + (c.abilities || []).map(a => (a.kw || '?') + '>' + (a.ops && a.ops.length ? 'OPS' : ('"' + (a.text || '').replace(/\s+/g, ' ').slice(0, 80) + '"'))).join('  ||  ')).join('\\n')`);
console.log(lines);
