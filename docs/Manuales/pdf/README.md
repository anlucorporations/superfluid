# PDFs descargables — Manuales de Superfluid Brlt v2

Versiones PDF (y su HTML fuente) de los **manuales literales** de `docs/Manuales/**`,
generadas con **node + playwright (Chromium, `page.pdf`)**.

| Archivo | Contenido (fuentes .md literales) | Páginas |
|---|---|---|
| `Manual-Tecnico.pdf` + `.html` | Tecnología, Dependencias, Implementación, Despliegue, Diccionario de datos y Diagrama relacional (`01…06`) | 13 |
| `Manual-Administrador.pdf` + `.html` | Manual del Admin — Panel `/admin` (`07-Manual-del-Admin/manual-admin.md`) | 9 |
| `Manual-Empleado.pdf` + `.html` | Manual del Empleado — Portal `/suite` (`07-Manual-del-Admin/manual-empleado.md`) | 9 |

**Última regeneración: 2026-11-17** (a partir de los manuales literales actualizados el
mismo día: entrada única `/entrar`, tope del 80% al cobrar y Portal del Empleado
rediseñado con identidad propia).

## Estilo

- Portada a página completa con degradado violeta `#1b1140 → #101a33` y acentos
  esmeralda `#34d399` (identidad del Portal del Empleado).
- Índice de contenidos con números de página (numeración del pie de página).
- Cabecera con el título del manual y pie con «Página X de Y» en todas las páginas
  de contenido (la portada va limpia, sin cabecera ni pie).
- Tipografía `system-ui`; tablas, bloques de código y figuras estilizadas; los
  bloques `mermaid` se sustituyen por sus PNG ya renderizados en `docs/imagenes/`.

## Comando de exportación

```bash
# desde la raíz del proyecto (requiere node + playwright 1.55 en web/node_modules
# y ghostscript para numerar el índice y fusionar portada + cuerpo)
node docs/Manuales/pdf/regenerar.mjs            # regenera los tres
node docs/Manuales/pdf/regenerar.mjs Manual-Empleado   # regenera solo uno
```

El script (`regenerar.mjs`) vuelve a leer los `.md` literales de `docs/Manuales/**`,
genera los `.html` fuente junto a cada PDF y exporte con Chromium
(`page.pdf({ format:'A4', printBackground:true })`): portada aparte (margen 0),
cuerpo con cabecera/pie numerados y fusión final con `gs -sDEVICE=pdfwrite`.
Si cambian los manuales, basta volver a ejecutarlo.
