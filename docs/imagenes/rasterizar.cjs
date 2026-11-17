// Rasteriza los SVG de docs/imagenes a PNG (misma carpeta), sin tocar capturas/**.
const path = require('path');
const fs = require('fs');
const { chromium } = require('/home/lucci/workspace/superfluid/web/node_modules/playwright');

const DIR = '/home/lucci/workspace/superfluid/docs/imagenes';
const SKIP = ['capturas'];

(async () => {
  const svgs = fs.readdirSync(DIR).filter(f => f.endsWith('.svg') && !SKIP.includes(f));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const f of svgs) {
    const file = path.join(DIR, f);
    const png = file.replace(/\.svg$/, '.png');
    const src = fs.readFileSync(file, 'utf8');
    const m = src.match(/viewBox="0 0 (\d+) (\d+)"/);
    const w = m ? +m[1] : 960, h = m ? +m[2] : 560;
    await page.setViewportSize({ width: w, height: h });
    await page.goto('file://' + file);
    const el = page.locator('svg');
    await el.first().screenshot({ path: png, omitBackground: false });
    console.log('PNG listo:', png, `(${w}x${h})`);
  }
  await browser.close();
})();
