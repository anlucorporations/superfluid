// H1/RNF-08 proceso: reevalúa constantes §0 casos_uso.md y falla si los docs divergen.
import { readFileSync } from 'node:fs';
const RATE = 2000n * 10n ** 18n / 2592000n; // floor(2000e18/2_592_000)
if (RATE !== 771604938271604n) { console.error('RATE mismatch', RATE); process.exit(1); }
const DEP1 = RATE * 3600n;
const DEP3 = RATE * 3600n * 3n;
const fmt = (b) => b.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '_');
const doc = readFileSync(new URL('../RepoTecnico/casos_uso.md', import.meta.url), 'utf8');
let fail = 0;
for (const [name, val] of [['DEP_1', fmt(DEP1)], ['DEP_3', fmt(DEP3)]]) {
  if (!doc.includes(val)) { console.error(`${name}: doc no contiene ${val}`); fail = 1; }
  else console.log(`${name} OK: ${val}`);
}
process.exit(fail);
