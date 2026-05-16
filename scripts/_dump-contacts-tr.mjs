import fs from 'fs';
const s = fs.readFileSync('app/(tabs)/contacts.tsx', 'utf8');
const re = /tr\(\s*'((?:\\'|[^'])*)'\s*,\s*'((?:\\'|[^'])*)'\s*\)/g;
const pairs = [];
let m;
while ((m = re.exec(s))) {
  pairs.push([m[1].replace(/\\'/g, "'"), m[2].replace(/\\'/g, "'")]);
}
const uniq = [...new Set(pairs.map((p) => JSON.stringify(p)))].map((x) => JSON.parse(x));
console.log(uniq.length);
for (const [a, b] of uniq.sort((x, y) => x[0].localeCompare(y[0]))) {
  console.log(JSON.stringify(a) + ' | ' + JSON.stringify(b));
}
