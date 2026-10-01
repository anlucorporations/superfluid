// RNF-07/RF-10: valida el registro canónico de deployment y su coherencia con broadcast.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // raíz del repo
const REGISTRY = path.join(ROOT, 'sc/deployments/codecrypto.json');
if (!fs.existsSync(REGISTRY)) { console.error('FAIL: no existe el registro canónico sc/deployments/codecrypto.json (ejecuta DeployAll)'); process.exit(1); }
const rec = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const errs = [];
if (rec.networkId !== 81234 && rec.chainId !== 81234) errs.push('networkId/chainId != 81234');
for (const k of ['EUR', 'FACTORY', 'EURx'])
  if (!/^0x[0-9a-fA-F]{40}$/.test(rec[k])) errs.push(`${k} dirección inválida`);
if (rec.flowRateWeiPerSec !== '771604938271604') errs.push('flowRate divergente §0');
const dir = path.join(ROOT, 'sc/broadcast/DeployAll.s.sol/81234');
if (!fs.existsSync(dir)) errs.push('sin broadcast history (RNF-07 no demostrable)');
else {
  const runs = fs.readdirSync(dir).filter(f => f.startsWith('run-') && f.endsWith('.json'));
  if (runs.length < 2) errs.push(`doble corrida requerida para idempotencia; hay ${runs.length}`);
}
console.log(errs.length ? 'FAIL: ' + errs.join(' | ') : 'check-deployments OK (' + runs_note() + ')');
function runs_note(){ return 'registro ' + rec.timestamp; }
process.exit(errs.length ? 1 : 0);
