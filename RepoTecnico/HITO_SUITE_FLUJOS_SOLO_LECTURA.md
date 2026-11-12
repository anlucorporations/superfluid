# Suite del empleado: flujos en modo lectura

> Fecha: 2026-11-12 · Estado: ✅ desplegado (`brltv2-00014-9hw`) y verificado en vivo.

## Requisito

El empleado solo ve **sus** flujos, en proceso o terminados, en **modo lectura**, y puede
hacer **downgrade** (cobro) de su flujo.

## Cambios

| Archivo | Cambio |
|---|---|
| `web/src/app/suite/page.tsx` | Tabla filtrada a `activo` / `pausado` (en proceso) y `terminado`. Columna Acciones en lectura ("solo lectura"). Quitada la acción **Liquidar** y su aviso de vencidos. Eliminada la función `settleExpired` y su import. El cobro (downgrade) se mantiene en la tarjeta "Cobro autónomo". |

Sin cambios de servidor: `listFlowsByReceiver(session.wallet)` ya filtraba estrictamente por la
wallet de la sesión, así que el empleado no puede ver flujos ajenos.

### Criterio de estados

| Estado | Visible para el empleado |
|---|---|
| `activo` (en proceso) | ✅ |
| `pausado` (en proceso) | ✅ |
| `terminado` | ✅ |
| `vencido` (pendiente de liquidar) | ❌ oculto (estado administrativo) |

## Verificación en vivo (2026-11-12)

Sesión única del empleado `0x9423…5cEF`:

| Comprobación | Resultado |
|---|---|
| Botón "Liquidar" | ✅ ausente |
| Aviso de vencidos | ✅ ausente |
| Columna Acciones | ✅ "solo lectura", sin botones en la tabla |
| Flujos mostrados | 1 (`#1`, activo) |
| Botón de cobro (downgrade) | ✅ visible |

Captura: `RepoTecnico/pruebas/H9_anvil/30_suite_lectura.png` (copiar desde `/tmp/recorrido`).

## Pendiente

- **Ejecutar el downgrade en vivo** no se ha hecho: es una transacción de escritura que mueve
  BRLT en el Anvil compartido. Requiere confirmación explícita antes de firmarla.
- Typecheck limpio · 43/43 tests · build verde.
