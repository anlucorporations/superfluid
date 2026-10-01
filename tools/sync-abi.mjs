// RT-05: copia ABIs compactos de sc/out a web/src/abi (ejecutar tras forge build).
import fs from 'node:fs';
const map = {
  'sc/out/Euro.sol/Euro.json': ['EUR', 'Euro'],
  'sc/out/EuroX.sol/EuroX.json': ['EURx', 'EuroX'],
  'sc/out/EuroxFactory.sol/EuroxFactory.json': ['FACTORY', 'EuroxFactory'],
};
let missing = 0;
for (const [src, [dstName]] of Object.entries(map)) {
  if (!fs.existsSync(src)) { console.error(`falta ${src} — ejecuta: cd sc && forge build`); missing++; continue; }
  const abi = JSON.parse(fs.readFileSync(src, 'utf8')).abi;
  fs.writeFileSync(`web/src/abi/${dstName}.json`, JSON.stringify(abi));
  console.log(`abi/${dstName}.json ← ${src}`);
}
process.exit(missing ? 1 : 0);
