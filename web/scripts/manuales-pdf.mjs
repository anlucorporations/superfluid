/**
 * ASISTENTE PDF — convierte los manuales literales (docs/Manuales/**.md) a PDF
 * con Playwright (`page.pdf`, A4, printBackground). Genera además el HTML
 * intermedio estilizado (portada + TOC + contenido) en docs/Manuales/pdf/.
 * Uso: npm run build && npm run manuales:pdf
 */

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve, join, relative } from "node:path";import { fileURLToPath, pathToFileURL } from "node:url";
import { marked } from "marked";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const LIT = join(ROOT, "docs", "Manuales");
const PDF = join(LIT, "pdf");
const CAPTURES = join(ROOT, "docs", "imagenes", "capturas");

function walkMd(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkMd(full));
    else if (name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

function mdToHtml(file) {
  let md = readFileSync(file, "utf8");
  // marcadores → notas visibles (las capturas reales ya están insertadas)
  md = md.replace(/<!--\s*CAPTURA:([^>]+)-->/g, (_, inner) =>
    `\n> 📷 *Captura: ${inner.trim()}*  \n`);
  return marked.parse(md);
}

async function main() {
  mkdirSync(PDF, { recursive: true });
  const files = walkMd(LIT).filter((f) => !f.includes(`${PDF}`));
  const groups = [
    {
      nombre: "Manual-Administrador",
      titulo: "Manual del Administrador — Superfluid Brlt v2",
      incluye: (f) => f.includes("07-Manual-del-Admin") && f.includes("manual-admin"),
    },
    {
      nombre: "Manual-Empleado",
      titulo: "Manual del Empleado — Suite del Empleado v2",
      incluye: (f) => f.includes("07-Manual-del-Admin") && f.includes("manual-empleado"),
    },
    {
      nombre: "Manual-Tecnico",
      titulo: "Manual técnico — Superfluid Brlt v2",
      incluye: (f) => /0[1-6]-/.test(f),
    },
  ];

  const browser = await import("playwright").then((m) => m.chromium.launch());
  try {
    for (const group of groups) {
      const selected = files.filter(group.incluye);
      if (selected.length === 0) {
        console.log(`[pdf] ${group.nombre}: sin manuales (`);
        continue;
      }
      let body = "";
      for (const file of selected) {
        const rel = relative(LIT, file);
        body += `<section class="tema"><p class="ruta">${rel}</p>\n${mdToHtml(file)}\n</section>`;
      }
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${group.titulo}</title><style>
  @page { margin: 0 }
  body{font-family:'Segoe UI',system-ui,Arial;color:#0f172a;margin:0}
  header{background:#4f46e5;color:#fff;padding:48px 40px}
  header h1{margin:0;font-size:28px}
  header p{margin:6px 0 0;color:#e0e7ff;font-size:14px}
  section.tema{padding:28px 40px;border-top:1px solid #e2e8f0;page-break-before:always}
  .ruta{font-size:11px;color:#94a3b8;margin:0 0 12px}
  h1,h2{color:#312e81}h3,h4{color:#1e293b}
  img{max-width:100%;border:1px solid #e2e8f0;border-radius:8px}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left}
  th{background:#f8fafc}
  pre{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;font-size:11px}
  code{background:#f1f5f9;padding:1px 4px;border-radius:4px;font-size:12px}
  pre code{background:transparent;padding:0}
  blockquote{border-left:4px solid #6366f1;margin:0;padding:4px 12px;color:#475569;background:#f8fafc}
  footer{padding:16px 40px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0}
</style></head><body>
<header><h1>${group.titulo}</h1><p>Nómina en streaming sobre Besu 81234 · generado 2026-11-04</p></header>
${body}
<footer>Superfluid Brlt Streaming v2 · documentación v1 · ${selected.length} sección(es)</footer>
</body></html>`;
      const htmlPath = join(PDF, `${group.nombre}.html`);
      writeFileSync(htmlPath, html);
      const pdfPath = join(PDF, `${group.nombre}.pdf`);
      const page = await browser.newPage();
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
      await page.waitForTimeout(750);
      await page.pdf({ path: pdfPath, format: "A4", printBackground: true, margin: {
        top: "12mm", bottom: "12mm", left: "10mm", right: "10mm",
      } });
      await page.close();
      const fin = readFileSync(pdfPath).subarray(0, 4).toString();
      console.log(`[pdf] ${pdfPath} (${fin === "%PDF" ? "OK %PDF" : "MAL"})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("[pdf] FALLO:", error);
  process.exit(1);
});
