// F4 integración: verifica invariantes del sistema V3 REAL desplegado en Besu 81234.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reg = JSON.parse(readFileSync(path.join(ROOT, 'sc/deployments/codecrypto.json'), 'utf8'));
const RPC = process.env.RPC_URL ?? 'https://besu.alumnos.codecrypto.academy';
const abi = JSON.parse(readFileSync(path.join(ROOT, 'web/src/abi/EURx.json'), 'utf8'));
import { createRequire } from 'node:module';
const require = createRequire(path.join(ROOT, 'web/package.json'));
const ethers = require('ethers');
const p = new ethers.providers.JsonRpcProvider(RPC);
const x = new ethers.Contract(reg.EURx, abi, p);
const accounts = ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266','0x70997970C51812dc3A010C7d01b50e0d17dc79C8','0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'];
let sum = 0n;
for (const a of accounts) sum += (await x.realBalanceOf(a)).toBigInt();
const supply = (await x.totalSupplyX()).toBigInt();
const eur = new ethers.Contract(reg.EUR, JSON.parse(readFileSync(path.join(ROOT,'web/src/abi/EUR.json'),'utf8')), p);
const custody = (await eur.balanceOf(reg.EURx)).toBigInt();
const chain = await p.getNetwork();
const results = [
  ['networkId == 81234', Number(chain.chainId) === 81234],
  ['Σ real(actores) ≤ totalSupplyX', sum <= supply],
  ['custodia EUR == totalSupplyX (RE-01a)', custody === supply],
  [' owedTotalOf coherente (≥0)', (await x.owedTotalOf(accounts[0])).gte(ethers.constants.Zero)],
  ['getAccountInfo(deployer) legible', !!(await x.getAccountInfo(accounts[0]))],
];
let fail = 0;
for (const [name, ok] of results) { console.log((ok?'PASS ':'FAIL ')+name); if(!ok) fail++; }
console.log(`supplyX=${supply} Σreal(3)=${sum} custodia=${custody}`);
process.exit(fail ? 1 : 0);
