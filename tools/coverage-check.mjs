// RNF-03 meta-test: cada RF-MUST debe tener ≥1 test nombrado en la matriz de casos_uso.md,
// y ese nombre debe existir como @test Forge o spec E2E real. Falla si hay huérfanos.
import fs from 'node:fs';

const doc = fs.readFileSync('RepoTecnico/casos_uso.md', 'utf8');
const matrix = doc.split('## Matriz de cobertura')[1];
if (!matrix) { console.error('sin matriz'); process.exit(1); }

const rows = matrix.split('\n').filter((l) => l.startsWith('|') && !l.includes('Requisito') && !l.includes('---'));
let fail = 0;
const mustIds = [];
for (const row of rows) {
  const cols = row.split('|').map((c) => c.trim());
  const req = cols[1] ?? '';
  const priority = req.startsWith('RF') ? (rowIncludesMust(req) ? 'MUST' : '?') : 'RNF/RT';
  if (priority === 'MUST') mustIds.push(req);
  const tests = cols[3] ?? '';
  for (const m of tests.matchAll(/([A-Za-z]+\.t\.sol)::([A-Za-z_0-9]+)|([a-z-]+\.spec\.ts)(?:::([a-zA-Z_0-9]+))?|tools\/([a-z-]+\.mjs)/g)) {
    let exists = false;
    if (m[2]) exists = fs.existsSync('sc/test') && grepFiles('sc/test', `function ${m[2]}`);
    else if (m[3]) {
      const file = fs.existsSync(`web/e2e/${m[3]}`) ? `web/e2e/${m[3]}` : null;
      exists = !!file && (!m[4] || fs.readFileSync(file, 'utf8').includes(m[4]));
    } else if (m[5]) exists = fs.existsSync(`tools/${m[5]}`);
    if (!exists) { console.error(`✗ ${req}: test no encontrado → ${tests.slice(0, 60)}`); fail = 1; }
  }
}
function rowIncludesMust(id) {
  // columna Prioridad v1 en §1 requerimientos
  const reqDoc = fs.readFileSync('RepoTecnico/requerimientos.md', 'utf8');
  const line = reqDoc.split('\n').find((l) => l.includes(`| ${id} |`) || l.startsWith(`| ${id} |`));
  return !!line && line.includes('MUST');
}
function grepFiles(dir, needle) {
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    const p = `${dir}/${f}`;
    if (fs.statSync(p).isFile() && fs.readFileSync(p, 'utf8').includes(needle)) return true;
  }
  return false;
}
console.log(fail ? 'COVERAGE-CHECK FAIL' : `COVERAGE-CHECK OK (${mustIds.length} RF-MUST con tests existentes)`);
process.exit(fail);
