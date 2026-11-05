# Fase 5 — Manuales generados

> **Fecha: 2026-11-04 · Estado: ✅ completados** con el equipo de manuales
> (@manuales, 6 roles): técnico, literario, capturista, creativo, PDF e integrador.

## Entregables

### 1) Manuales TÉCNICOS (`RepoTecnico/Manuales/` — jerarquía tema→sección→sub-sección)
| Tema | Archivo |
|---|---|
| 01-Tecnología | `Manuales/01-Tecnologia/01-plataforma.md` — arquitectura, stack Web3, APIs, seguridad. |
| 02-Dependencias | `…/02-Dependencias/02-dependencias.md` — versiones fijadas, notas de CVE y comandos. |
| 03-Implementación | `…/03-Implementacion/03-implementacion.md` — contratos línea a línea, repos, jobs, verificación de cobros. |
| 04-Despliegue | `…/04-Despliegue/04-despliegue.md` — local, contratos, Cloud Run. |
| 05-Diccionario de Datos | `…/05-Diccionario-de-Datos/05-diccionario.md` — 13 colecciones y struct Flow. |
| 06-Diagrama Relacional | `…/06-Diagrama-Relacional/06-relacional.md` — ER con Mermaid. |

### 2) Manuales LITERALES (`docs/Manuales/` — mismo árbol)
- `00-index.md` (empezar en 5 minutos + índice).
- Literal por tema (01..06) + **07-Manual-del-Admin**: `manual-admin.md` y
  `manual-empleado.md` (guías operativas con pasos numerados, rótulos reales de la
  interfaz y mermaid/timeline).
- Marcadores: `<!-- GENERAR_IMAGEN: … -->` para gráficos y `<!-- CAPTURA: … -->`
  resueltos (o pendientes, sin inventar pantallas).

### 3) Capturas REALES (`docs/imagenes/capturas/`, 10 pantallazos)
Generadas con **Chromium headless** contra la app real (`npm run capturas`:
Mongo en memoria + `next start` + sesión SIWE por API + cookies httpOnly):
`01-portada`, `02-login-admin`, `03-login-suite`, `04-admin-resumen`,
`05-admin-empleados`, `06-admin-proyectos`, `07-admin-flujos`, `08-admin-jobs`,
`09-admin-auditoria`, `10-admin-sistema`.

### 4) Gráficos (`docs/imagenes/`)
SVG vectorials coherentes con la marca: `arquitectura.svg`, `flujo-nomina.svg`,
`onboarding.svg`, `glosario-visual.svg`.

### 5) PDF descargables (`docs/Manuales/pdf/`)
`npm run manuales:pdf` (Playwright `page.pdf`, A4, print Background):
**Manual-Administrador.pdf · Manual-Empleado.pdf · Manual-Tecnico.pdf**
(HTML minificado con portada/estilo del proyecto, `%PDF` verificado).

### 6) Sección de Ayuda en la plataforma
- `web/public/ayuda/index.html`: manual navegable por temas/secciones con capturas
  embebidas y **descarga de los 3 PDF** (`web/public/ayuda/pdf/`).
- Acceso directo «Ayuda ↗» desde el menú del panel (`web/src/app/admin/layout.tsx`).
- Served está: es estático; compatible con `next start` y con la imagen Docker H7
  (el Dockerfile copia `public/`).

## Verificación de coherencia
- 类型/`npm run build` en verde tras insertar la Ayuda; `npm test` 43/43.
- Rótulos del literal tomados del texto real de la app (los H-* de Fase 2 no
  prometen funciones inexistentes; los valores duros — 10 empleados máx., 2 h de
  sesión, 50 M BRLT — se verifican con el código).
- Los marcadores CAPTURA han sido reemplazados por imágenes reales de la propia
  aplicación, no ilustraciones.
