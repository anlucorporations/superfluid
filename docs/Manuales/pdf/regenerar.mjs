/**
 * regenerar.mjs — Asistente PDF (Proyecto Superfluid Brlt v2)
 * Regenera los PDF descargables de docs/Manuales/pdf/ a partir de los
 * manuales literales ACTUALIZADOS de docs/Manuales/**.
 *
 * Uso:  node docs/Manuales/pdf/regenerar.mjs
 *       (necesita playwright 1.55 + marked instalados en web/node_modules,
 *        y ghostscript para los números de página del índice)
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const require = createRequire('/home/lucci/workspace/superfluid/web/package.json');
const { chromium } = require('playwright');
const { marked } = require('marked');

const ROOT = '/home/lucci/workspace/superfluid';
const MAN = path.join(ROOT, 'docs/Manuales');
const IMG = path.join(ROOT, 'docs/imagenes');
const OUT = path.join(MAN, 'pdf');
const FECHA = '2026-11-17';

/* ------------------------------------------------------------------ *
 * Definición de los 3 documentos (mismo nombre de archivo que ya hay) *
 * ------------------------------------------------------------------ */
const DOCS = [
  {
    out: 'Manual-Tecnico',
    title: 'Manual técnico — Superfluid Brlt v2',
    nombre: 'Manual técnico',
    subtitle: 'Nómina en streaming sobre red de práctica EVM (Besu 81234 / Anvil 31337)',
    coverTag: 'Equipo técnico',
    sections: [
      '01-Tecnologia/01-plataforma.md',
      '02-Dependencias/02-dependencias.md',
      '03-Implementacion/03-implementacion.md',
      '04-Despliegue/04-despliegue.md',
      '05-Diccionario-de-Datos/05-diccionario.md',
      '06-Diagrama-Relacional/06-relacional.md',
    ],
  },
  {
    out: 'Manual-Administrador',
    title: 'Manual del Administrador — Panel /admin',
    nombre: 'Manual del Administrador',
    subtitle: 'Operativa diaria del panel: empleados, flujos, tesorería y auditoría',
    coverTag: 'Administradores',
    sections: ['07-Manual-del-Admin/manual-admin.md'],
  },
  {
    out: 'Manual-Empleado',
    title: 'Manual del Empleado — Portal /suite',
    nombre: 'Manual del Empleado',
    subtitle: 'Guía del Portal del Empleado: resumen, downgrade de flujos y perfil',
    coverTag: 'Empleados',
    sections: ['07-Manual-del-Admin/manual-empleado.md'],
  },
];

/* ------------------------------------------------------------------ *
 * Conversión de un .md literal a HTML de sección                      *
 * ------------------------------------------------------------------ */
const FIG_TITULOS = {
  'arquitectura-portales': 'Arquitectura general: entrada única y dos portales',
  'arquitectura': 'Arquitectura: navegador, app web, cadena y base de datos',
  'validacion-wallet': 'Validación continua de la wallet en /suite',
  'flujo-nomina': 'Ciclo de un flujo: crear, pausar, reanudar y terminar',
  'ciclo-salario': 'Ciclo de vida de un salario (nómina de 6 días)',
  'flujo-downgrade-80': 'Downgrade con verificación del tope del 80%',
  'despliegue-cloudrun': 'Despliegue vigente en Google Cloud Run',
  'glosario-visual': 'Glosario visual de los datos',
  'estados-flujo': 'Estados de un flujo',
  'relacional-map': 'Mapa relacional de la base de datos',
  'onboarding-empleado': 'Onboarding del empleado, paso a paso',
  'portal-empleado-secciones': 'Secciones del Portal del Empleado',
  'tope-80-admin': 'Cálculo del tope del 80% y su auditoría',
};

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function mdAHtml(rel) {
  const file = path.join(MAN, rel);
  let md = readFileSync(file, 'utf8');
  md = md.replace(/^\uFEFF/, ''); // BOM
  // quitar pie repetitivo "--- \n *Actualizado ...*" (la fecha vive en la portada)
  md = md.replace(/\n---\s*\n\s*\*Actualizado[^*]*\*\s*$/, '\n');

  let html = marked.parse(md);

  // 1) GENERAR_IMAGEN + bloque mermaid siguiente  →  figura con PNG renderizado
  html = html.replace(
    /<!--\s*GENERAR_IMAGEN:\s*([\w-]+)\.(?:svg\|png|png\|svg|svg|png)\s*-->\s*(?:<pre><code class="language-mermaid">[\s\S]*?<\/code><\/pre>)?/g,
    (m, nombre) => {
      const png = path.join(IMG, `${nombre}.png`);
      if (existsSync(png)) {
        const titulo = FIG_TITULOS[nombre] || nombre;
        return `<figure class="grafico"><img src="../../imagenes/${nombre}.png" alt="${esc(titulo)}">` +
               `<figcaption><span class="fig-n">Figura</span>${esc(titulo)}</figcaption></figure>`;
      }
      return m; // sin PNG: dejar la nota y el código mermaid tal cual
    }
  );

  // 2) mermaid restante sin imagen (se conserva como bloque de código)
  html = html.replace(/<pre><code class="language-mermaid">/g, '<pre><code>');

  // 3) CAPTURA  →  caja de nota de pantallazo
  html = html.replace(
    /<!--\s*CAPTURA:\s*([\s\S]*?)\s*-->/g,
    (m, texto) => `<div class="captura"><span class="cam">📷</span><span>${esc(texto.replace(/\s+/g, ' '))}</span></div>`
  );

  // 4) rutas de imágenes → relativas a pdf/ (docs/imagenes)
  html = html.replace(/src="\.{1,2}\/imagenes\//g, 'src="../../imagenes/');

  return html;
}

function tituloDe(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : 'Sección';
}
function h2De(html) {
  return [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
}

/* ------------------------------------------------------------------ *
 * Estilo del proyecto (portada violeta→azul noche, acentos esmeralda)  *
 * ------------------------------------------------------------------ */
const CSS = `
  @page { size: A4; margin: 24mm 16mm 20mm 16mm; }
  @page :first { margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: system-ui, 'Segoe UI', Arial, sans-serif; color: #17203a; font-size: 10.5pt; line-height: 1.55; }

  /* ---------- portada ---------- */
  .cover { height: 297mm; background: linear-gradient(160deg, #1b1140 0%, #17133c 45%, #101a33 100%);
           color: #fff; padding: 34mm 22mm 24mm; display: flex; flex-direction: column; page-break-after: always; }
  .cover .badge { display: inline-block; align-self: flex-start; border: 1px solid rgba(52,211,153,.55); color: #34d399;
                  border-radius: 999px; padding: 4px 14px; font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; }
  .cover .linea { width: 64mm; height: 3px; background: linear-gradient(90deg, #34d399, rgba(52,211,153,0)); margin: 10mm 0 8mm; border-radius: 2px; }
  .cover h1 { margin: 0; font-size: 30pt; line-height: 1.2; font-weight: 700; }
  .cover h1 small { display: block; margin-top: 6mm; font-size: 12.5pt; font-weight: 400; color: #c7d2ea; line-height: 1.5; }
  .cover .resumen { margin-top: 12mm; max-width: 125mm; color: #dfe6f5; font-size: 10pt; line-height: 1.7; }
  .cover .resumen ul { padding-left: 5mm; margin: 0; }
  .cover .resumen li { margin-bottom: 2.5mm; }
  .cover .pie { margin-top: auto; border-top: 1px solid rgba(255,255,255,.18); padding-top: 5mm;
                display: flex; justify-content: space-between; font-size: 8.5pt; color: #aeb9d6; }
  .cover .pie b { color: #34d399; font-weight: 600; }

  /* ---------- índice ---------- */
  .toc { page-break-before: always; page-break-after: always; }
  .toc h2 { font-size: 17pt; color: #1b1140; margin: 0 0 3mm; }
  .toc .linea { width: 30mm; height: 3px; background: #34d399; border-radius: 2px; margin-bottom: 8mm; }
  .toc ol { list-style: none; margin: 0; padding: 0; counter-reset: toc; }
  .toc li { counter-increment: toc; display: flex; align-items: baseline; gap: 4mm;
            padding: 3.2mm 0; border-bottom: 1px solid #e7ebf3; }
  .toc li::before { content: counter(toc, decimal-leading-zero); font-size: 9pt; font-weight: 700; color: #34d399; min-width: 9mm; }
  .toc .t { font-weight: 600; color: #1b1140; }
  .toc .s { color: #5b6478; font-size: 9pt; flex: 1; }
  .toc .p { font-size: 9pt; color: #6b7280; font-variant-numeric: tabular-nums; }
  .toc .nota { margin-top: 8mm; font-size: 8.5pt; color: #8b93a7; }

  /* ---------- secciones / temas ---------- */
  section.tema { page-break-before: always; }
  .ruta { font-size: 8.5pt; color: #94a3b8; margin: 0 0 2mm; font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; }
  section.tema h1 { font-size: 20pt; color: #1b1140; margin: 0 0 3mm; line-height: 1.25; }
  section.tema h1::after { content: ''; display: block; width: 26mm; height: 3px; background: #34d399; border-radius: 2px; margin-top: 2.5mm; }
  h2 { font-size: 14pt; color: #241a4f; margin: 7mm 0 2.5mm; }
  h3 { font-size: 11.5pt; color: #17203a; margin: 5mm 0 2mm; }
  h3::before { content: '›'; color: #34d399; font-weight: 700; margin-right: 2mm; }
  p { margin: 0 0 3mm; }
  strong { color: #101a33; }
  a { color: #059669; text-decoration: none; }
  ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
  li { margin-bottom: 1.2mm; }

  table { border-collapse: collapse; width: 100%; font-size: 9.5pt; margin: 0 0 4mm; page-break-inside: avoid; }
  th, td { border: 1px solid #e2e8f0; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #f1edfb; color: #241a4f; border-bottom: 2px solid #34d399; }
  tbody tr:nth-child(even) { background: #f8fafc; }

  pre { background: #101a33; color: #dbe4f5; padding: 10px 12px; border-radius: 8px; overflow: auto;
        font-size: 8.5pt; line-height: 1.45; page-break-inside: avoid; border-left: 3px solid #34d399; }
  code { font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; }
  p code, li code, td code { background: #f1f5f9; color: #0f2e46; padding: 1px 4px; border-radius: 4px; font-size: 9pt; }
  pre code { background: transparent; padding: 0; color: inherit; }

  blockquote { border-left: 4px solid #34d399; background: #f2fbf7; margin: 0 0 4mm; padding: 8px 12px;
               color: #27513f; border-radius: 0 8px 8px 0; page-break-inside: avoid; }
  blockquote p { margin: 0; }

  figure.grafico { margin: 4mm 0 5mm; text-align: center; page-break-inside: avoid; }
  figure.grafico img { max-width: 100%; max-height: 110mm; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; }
  figure.grafico figcaption { margin-top: 2mm; font-size: 8.5pt; color: #5b6478; }
  figure.grafico .fig-n { color: #059669; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; margin-right: 3mm; }
  figure.pantalla { margin: 4mm 0 5mm; page-break-inside: avoid; }
  figure.pantalla img { max-width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; }
  figure.pantalla figcaption { margin-top: 2mm; font-size: 8.5pt; color: #5b6478; font-style: italic; }

  .captura { border: 1px dashed #34d399; background: #f2fbf7; border-radius: 8px; padding: 6px 10px;
             font-size: 8.5pt; color: #27513f; margin: 3mm 0 4mm; page-break-inside: avoid; }
  .captura .cam { margin-right: 2mm; }
  .pgmark { color: #ffffff; font-size: 6px; }
`;

/* ------------------------------------------------------------------ *
 * Plantillas (portada a página completa + cuerpo con índice y temas)   *
 * ------------------------------------------------------------------ */
const CSS_BASE = `
  @page { size: A4; margin: 24mm 16mm 20mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: system-ui, 'Segoe UI', Arial, sans-serif; color: #17203a; font-size: 10.5pt; line-height: 1.55; }
  h2 { font-size: 14pt; color: #241a4f; margin: 7mm 0 2.5mm; }
  h3 { font-size: 11.5pt; color: #17203a; margin: 5mm 0 2mm; }
  h3::before { content: '›'; color: #34d399; font-weight: 700; margin-right: 2mm; }
  p { margin: 0 0 3mm; }
  strong { color: #101a33; }
  a { color: #059669; text-decoration: none; }
  ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
  li { margin-bottom: 1.2mm; }
  table { border-collapse: collapse; width: 100%; font-size: 9.5pt; margin: 0 0 4mm; page-break-inside: avoid; }
  th, td { border: 1px solid #e2e8f0; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #f1edfb; color: #241a4f; border-bottom: 2px solid #34d399; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  pre { background: #101a33; color: #dbe4f5; padding: 10px 12px; border-radius: 8px; overflow: auto;
        font-size: 8.5pt; line-height: 1.45; page-break-inside: avoid; border-left: 3px solid #34d399; }
  code { font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; }
  p code, li code, td code { background: #f1f5f9; color: #0f2e46; padding: 1px 4px; border-radius: 4px; font-size: 9pt; }
  pre code { background: transparent; padding: 0; color: inherit; }
  blockquote { border-left: 4px solid #34d399; background: #f2fbf7; margin: 0 0 4mm; padding: 8px 12px;
               color: #27513f; border-radius: 0 8px 8px 0; page-break-inside: avoid; }
  blockquote p { margin: 0; }
  figure.grafico { margin: 4mm 0 5mm; text-align: center; page-break-inside: avoid; }
  figure.grafico img { max-width: 100%; max-height: 110mm; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; }
  figure.grafico figcaption { margin-top: 2mm; font-size: 8.5pt; color: #5b6478; }
  figure.grafico .fig-n { color: #059669; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; margin-right: 3mm; }
  figure.pantalla { margin: 4mm 0 5mm; page-break-inside: avoid; }
  figure.pantalla img { max-width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; }
  figure.pantalla figcaption { margin-top: 2mm; font-size: 8.5pt; color: #5b6478; font-style: italic; }
  .captura { border: 1px dashed #34d399; background: #f2fbf7; border-radius: 8px; padding: 6px 10px;
             font-size: 8.5pt; color: #27513f; margin: 3mm 0 4mm; page-break-inside: avoid; }
  .captura .cam { margin-right: 2mm; }
  .pgmark { color: #ffffff; font-size: 6px; }
`;

const CSS_PORTADA = `
  @page { size: A4; margin: 0; }
  .cover { height: 100vh; background: linear-gradient(160deg, #1b1140 0%, #17133c 45%, #101a33 100%);
           color: #fff; padding: 34mm 22mm 24mm; display: flex; flex-direction: column; }
  .cover .badge { display: inline-block; align-self: flex-start; border: 1px solid rgba(52,211,153,.55); color: #34d399;
                  border-radius: 999px; padding: 4px 14px; font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; }
  .cover .linea { width: 64mm; height: 3px; background: linear-gradient(90deg, #34d399, rgba(52,211,153,0)); margin: 10mm 0 8mm; border-radius: 2px; }
  .cover h1 { margin: 0; font-size: 30pt; line-height: 1.2; font-weight: 700; }
  .cover h1 small { display: block; margin-top: 6mm; font-size: 12.5pt; font-weight: 400; color: #c7d2ea; line-height: 1.5; }
  .cover .resumen { margin-top: 12mm; max-width: 125mm; color: #dfe6f5; font-size: 10pt; line-height: 1.7; }
  .cover .resumen ul { padding-left: 5mm; margin: 0; }
  .cover .resumen li { margin-bottom: 2.5mm; }
  .cover .pie { margin-top: auto; border-top: 1px solid rgba(255,255,255,.18); padding-top: 5mm;
                display: flex; justify-content: space-between; font-size: 8.5pt; color: #aeb9d6; }
  .cover .pie b { color: #34d399; font-weight: 600; }
`;

const CSS_CUERPO = `
  .toc h2 { font-size: 17pt; color: #1b1140; margin: 0 0 3mm; }
  .toc .linea { width: 30mm; height: 3px; background: #34d399; border-radius: 2px; margin-bottom: 8mm; }
  .toc ol { list-style: none; margin: 0; padding: 0; counter-reset: toc; }
  .toc li { counter-increment: toc; display: flex; align-items: baseline; gap: 4mm;
            padding: 3.2mm 0; border-bottom: 1px solid #e7ebf3; }
  .toc li::before { content: counter(toc, decimal-leading-zero); font-size: 9pt; font-weight: 700; color: #34d399; min-width: 9mm; }
  .toc .t { font-weight: 600; color: #1b1140; }
  .toc .s { color: #5b6478; font-size: 9pt; flex: 1; }
  .toc .p { font-size: 9pt; color: #6b7280; font-variant-numeric: tabular-nums; }
  .toc .nota { margin-top: 8mm; font-size: 8.5pt; color: #8b93a7; }
  section.tema { page-break-before: always; }
  .ruta { font-size: 8.5pt; color: #94a3b8; margin: 0 0 2mm; font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; }
  section.tema h1 { font-size: 20pt; color: #1b1140; margin: 0 0 3mm; line-height: 1.25; }
  section.tema h1::after { content: ''; display: block; width: 26mm; height: 3px; background: #34d399; border-radius: 2px; margin-top: 2.5mm; }
`;

function htmlPortada(doc, secciones) {
  const coverItems = secciones.slice(0, 5).map(s => `<li>${esc(s.titulo)}</li>`).join('');
  const mas = secciones.length > 5 ? `<li>y ${secciones.length - 5} sección(es) más…</li>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>${CSS_BASE}${CSS_PORTADA}</style></head><body>
<div class="cover">
  <span class="badge">${esc(doc.coverTag)}</span>
  <div class="linea"></div>
  <h1>${esc(doc.title.split('—')[0].trim())}<small>${esc(doc.subtitle)}</small></h1>
  <div class="resumen"><ul>${coverItems}${mas}</ul></div>
  <div class="pie">
    <span>Superfluid Brlt Streaming v2 · <b>documentación literal</b></span>
    <span>Actualizado <b>${FECHA}</b> · ${doc.sections.length} fuente(s) .md</span>
  </div>
</div>
</body></html>`;
}

function htmlCuerpo(doc, secciones) {
  const tocItems = secciones.map((s, i) =>
    `<li><span class="t">${esc(s.titulo)}</span><span class="s">${esc(s.h2.slice(0, 4).join(' · '))}${s.h2.length > 4 ? ' · …' : ''}</span><span class="p">${s.pagina ? 'p. ' + s.pagina : ''}</span></li>`
  ).join('\n');
  const cuerpo = secciones.map(s =>
    `<section class="tema"><p class="ruta">${esc(s.ruta)}</p>\n${s.html}\n</section>`
  ).join('\n');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>${CSS_BASE}${CSS_CUERPO}</style></head><body>
<nav class="toc">
  <h2>Índice de contenidos</h2>
  <div class="linea"></div>
  <ol>
${tocItems}
  </ol>
  <p class="nota">Los números de página corresponden a la numeración impresa en el pie de página.</p>
</nav>
${cuerpo}
</body></html>`;
}

/* HTML fuente único (portada + índice + temas) para descarga/edición */
function htmlFuente(doc, secciones) {
  const portada = htmlPortada(doc, secciones);
  const cuerpo = htmlCuerpo(doc, secciones);
  return portada
    .replace('</body></html>', '')
    .concat(cuerpo.replace(/^[\s\S]*?<\/head><body>/, '').replace('</body></html>', ''))
    .replace('<style>' + CSS_BASE + CSS_PORTADA + '</style>', '<style>' + CSS_BASE + CSS_PORTADA +
      '.cover { page-break-after: always; }' + CSS_CUERPO + '</style>');
}

/* ------------------------------------------------------------------ *
 * Construcción de secciones (con marcador invisible para el índice)   *
 * ------------------------------------------------------------------ */
function construir(doc) {
  return doc.sections.map((ruta, i) => {
    const html0 = mdAHtml(ruta);
    const html = html0.replace(/(<h1[^>]*>)/, `$1<span class="pgmark">⟦§${i + 1}⟧</span>`);
    return { ruta, html, titulo: tituloDe(html0), h2: h2De(html0), pagina: null };
  });
}

/* ------------------------------------------------------------------ *
 * Utilidades PDF (ghostscript)                                        *
 * ------------------------------------------------------------------ */
function numPaginas(pdf) {
  const out = execFileSync('gs', ['-dNOPAUSE', '-dBATCH', '-sDEVICE=nullpage', pdf],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  const m = out.match(/Processing pages 1 through (\d+)/);
  return m ? Number(m[1]) : 0;
}
function textoDePagina(pdf, n) {
  return execFileSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=txtwrite',
    `-dFirstPage=${n}`, `-dLastPage=${n}`, '-sOutputFile=-', pdf],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

/* ------------------------------------------------------------------ *
 * Generación con Chromium (playwright)                                *
 * ------------------------------------------------------------------ */
async function main() {
  const solo = process.argv[2]; // opcional: nombre de salida (p. ej. Manual-Empleado)
  const lista = DOCS.filter(d => !solo || d.out === solo);
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'sf-pdf-'));

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    for (const doc of lista) {
      const htmlPath = path.join(OUT, `${doc.out}.html`);
      const pdfPath = path.join(OUT, `${doc.out}.pdf`);
      const margin = { top: '24mm', bottom: '20mm', left: '16mm', right: '16mm' };

      const secciones = construir(doc);
      const headerTemplate = `<div style="width:100%; font-size:8px; font-family:system-ui,Arial; color:#6b7280; padding:0 16mm; display:flex; justify-content:space-between; border-bottom:.5px solid #d7dce8;"><span>${esc(doc.title)}</span><span>Superfluid Brlt v2 · ${FECHA}</span></div>`;
      const footerTemplate = `<div style="width:100%; font-size:8px; font-family:system-ui,Arial; color:#6b7280; padding:0 16mm; display:flex; justify-content:space-between; border-top:.5px solid #d7dce8;"><span>${esc(doc.nombre)}</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`;

      // portada (página completa, sin header/footer)
      const coverHtml = path.join(tmp, `${doc.out}-portada.html`);
      const coverPdf = path.join(tmp, `${doc.out}-portada.pdf`);
      writeFileSync(coverHtml, htmlPortada(doc, secciones));
      await page.goto('file://' + coverHtml, { waitUntil: 'load' });
      await page.pdf({ path: coverPdf, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 }, displayHeaderFooter: false });

      // cuerpo (índice + temas, con header/footer y numeración)
      const bodyHtml = path.join(tmp, `${doc.out}-cuerpo.html`);
      const bodyPdf = path.join(tmp, `${doc.out}-cuerpo.pdf`);
      const renderCuerpo = async (seccionesConPaginas) => {
        // rutas absolutas para que Chromium resuelva las imágenes desde el directorio temporal
        const htmlAbs = htmlCuerpo(doc, seccionesConPaginas).replaceAll('src="../../imagenes/', `src="file://${IMG}/`);
        writeFileSync(bodyHtml, htmlAbs);
        await page.goto('file://' + bodyHtml, { waitUntil: 'load' });
        await page.pdf({ path: bodyPdf, format: 'A4', printBackground: true, displayHeaderFooter: true, margin, headerTemplate, footerTemplate });
      };

      await renderCuerpo(secciones);

      // 2ª pasada: localizar cada sección con ghostscript y fijar nº de página del índice
      let paginasTotales = numPaginas(bodyPdf);
      let previas = null;
      if (paginasTotales > 0) {
        const encontradas = secciones.map((s, i) => {
          const marca = `⟦§${i + 1}⟧`;
          for (let n = 1; n <= paginasTotales; n++) {
            if (textoDePagina(bodyPdf, n).includes(marca)) return n;
          }
          return null;
        });
        if (encontradas.every(Boolean)) previas = encontradas;
      }
      if (previas) {
        await renderCuerpo(secciones.map((s, i) => ({ ...s, pagina: previas[i] })));
        paginasTotales = numPaginas(bodyPdf);
      }

      // fusión portada + cuerpo
      execFileSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.7',
        `-sOutputFile=${pdfPath}`, coverPdf, bodyPdf], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'ignore', 'ignore'] });

      // HTML fuente único (portada + índice + temas)
      writeFileSync(htmlPath, htmlFuente(doc, secciones.map((s, i) => ({ ...s, pagina: previas?.[i] ?? null }))));

      const total = numPaginas(pdfPath);
      console.log(`✔ ${doc.out}.pdf — ${total} páginas (portada + ${paginasTotales}), ${(statSync(pdfPath).size / 1024).toFixed(0)} KB` +
        (previas ? '' : ' · índice sin números de página'));
    }
  } finally {
    await browser.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
