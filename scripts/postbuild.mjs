// Informe de tamaño: JS inicial (gzip) sin contar three.js / r3f. Objetivo ≤ 400 KB.
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const html = readFileSync('dist/index.html', 'utf8');
const initial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const all = readdirSync('dist/assets').filter((f) => f.endsWith('.js'));
const gz = (f) => gzipSync(readFileSync(`dist/${f}`)).length;
let sum = 0;
let three = 0;
for (const f of initial) {
  const s = gz(f);
  if (/\/(three|r3f)-/.test(f)) three += s;
  else sum += s;
}
console.log('\nJS inicial (gzip):');
for (const f of initial) console.log(`  ${f}  ${(gz(f) / 1024).toFixed(1)} KB`);
console.log(`  → app (sin three/r3f): ${(sum / 1024).toFixed(1)} KB · three+r3f: ${(three / 1024).toFixed(1)} KB`);
console.log('Chunks diferidos:');
for (const f of all.filter((f) => !initial.includes(`assets/${f}`))) console.log(`  assets/${f}  ${(gz(`assets/${f}`) / 1024).toFixed(1)} KB`);
if (sum > 400 * 1024) {
  console.error('ERROR: el JS inicial supera 400 KB gzip');
  process.exit(1);
}
