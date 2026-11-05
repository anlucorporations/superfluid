# Gráficos de casos de uso — Superfluid BRLT Streaming v2

Índice de diagramas de la Fase 2. Todos usan **Mermaid** (se renderizan en GitHub/GitLab y
en cualquier visor Markdown compatible). La fuente canónica del comportamiento sigue siendo
`../casos_uso.md`; estos archivos solo lo visualizan.

| Archivo | Contenido | Casos de uso |
|---|---|---|
| `01_diagrama_casos_uso.md` | Actores, contexto y relaciones entre CU | CU-01..CU-16 |
| `02_maquina_estados.md` | Estados del flujo on-chain y de `flujos_programados` | CU-05..CU-08, CU-14, CU-16 |
| `03_secuencias.md` | Secuencias de SIWE, alta de flujo, cambio de wallet, liquidación y cobro | CU-01, CU-03, CU-06, CU-08, CU-09, CU-13, CU-14, CU-16 |

## Cómo visualizarlos

- **GitHub/GitLab:** se renderizan automáticamente al abrir el `.md`.
- **VS Code:** extensión *Markdown Preview Mermaid Support*.
- **Exportar a SVG/PNG:** `npx @mermaid-js/mermaid-cli -i 03_secuencias.md -o secuencias.svg`.

## Convenciones

- `ADMIN` firma todas las operaciones del panel; el backend no custodia claves.
- `EMPLEADO` solo firma `downgrade` (cobro) y opcionalmente `settleFlow`.
- `settleFlow` es **público**: lo puede invocar cualquier cuenta sobre un flujo vencido.
- `flujos_programados` es off-chain y **nunca** pasa a «terminado» (AC-05).
