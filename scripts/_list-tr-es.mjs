import fs from 'fs';
const s = fs.readFileSync('app/(tabs)/cards.tsx', 'utf8');
const re = /tr\('((?:\\'|[^'])*)'/g;
const m = new Set();
let x;
while ((x = re.exec(s))) m.add(x[1].replace(/\\'/g, "'"));
console.log([...m].sort().join('\n'));
