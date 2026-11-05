# Hito H6 — Operación, reconciliación y endurecimiento

> **Estado: ✅ Cerrado (2026-11-04).** Jobs internos con cron de proceso y panel
> `/admin/jobs`: reconciliación de deriva con `getFlow`, espejo idempotente de eventos
> (`flows_history`), anonimización GDPR a 30 días y contador de programaciones vencidas.
> E2E real en Besu con deriva provocada y corregida. Revisión de dependencias (`npm audit`)
> con hardening documentado y mitigado.

## Alcance entregado

| Área | Entregado |
|---|---|
| Scheduler | `src/instrumentation.ts` ejecuta los jobs con timer de proceso (5 min), se desactiva con `DISABLE_JOBS=1`. |
| `reconcile_flows` | Comparación `flows` ↔ `getFlow` (estado, receptor, paid, tasa), reescritura con auditoría de los cambios (drifts) y **descubrimiento** de flujos que existan on-chain pero no en MongoDB (`lastFlowId` scan). |
| `flows_history` | Espejo `eth_getLogs` de `FlowCreated/Updated/Settled/Deleted/Expired` + `Upgraded/Downgraded` desde el bloque de despliegue; clave idempotente `txHash-logIndex`. |
| `anonymize_pii` | 30 días tras `borroSolicitadoAt` (AC-10): nombre → `Anonimizado · <fingerprint>`, datos vacíos, marca `anonymizado`. |
| `mark_scheduled_due` | Conteo de programaciones `proximo` cuya `fechaInicio` ya pasó (para aviso en el panel). |
| Panel | `/admin/jobs` con estado de los 4 jobs, resultado del último lazo y botón «Ejecutar» (`POST /api/jobs` con CSRF). |
| API | `GET /api/jobs` (últimas 20 ejecuciones) y `POST /api/jobs` (manual, admin + CSRF, job validado). |
| Hardening gas | **Causa raíz de fallos intermitentes:** `eth_estimateGas` de Besu se queda corto con accesos en frío (un `updateFlow` sobre-estimó 80 k gas y OOG con el gas real a 133 k). Todas las escrituras cliente ahora envían `gasLimit` fijo por operación; los smokes igualmente añaden margen (900 k). |
| Dependencias | `npm audit` ejecutado; árbol restablecido a versiones pinned-testeadas (Next 15.5.29, ethers 5.7.2 exact, zod 3.25.76, Vitest 2.1.8) tras descartar un «fix --force» rompedor (Next 16 + Zod 4 + Vitest 5). |

## Ciclo del reconciliador

```text
Cron 5 min ──► reconcile_flows ──► drifts? ──► $set + audit("job", reconciliacion)
                flows_history ──► eth_getLogs (por chunks) ──► upsert (txHash-logIndex)
                anonymize_pii ──► borroSolicitadoAt + 30 d ──► nombre seudónimo
                mark_scheduled_due ──► contador para el panel
Cada job escribe en `job_runs` (ok/error/resultado/duración/disparador).
```

## Verificación

### Tests unitarios (43)

| Suite | Casos |
|---|---|
| `tests/rates.test.ts` | 10 · `validation` 11 · `eip712` 6 · `flows` 14 · **`jobs` 2 nuevos** (nombres válidos y anonimización sin PII). |

```text
Test Files  5 passed (5)
Tests       43 passed (43)
```

### Build

```text
npm run typecheck  → sin errores
npm run build      → 38 rutas (/admin/jobs + /api/jobs nuevas), OK
```

### Smoke E2E real (`npm run smoke:h6`)

1. Admin + empleado `h6@brlt.test` + flujo real creado y registrado.
2. **Deriva provocada** (MongoDB: `estado=pausado`, `paid=999`, `flowRate=1`, receptor
   nulo): `POST /api/jobs {job:"reconcile_flows"}` detecta `drifts ≥ 1`, repone estado
   activo, `paid=0`, receptor y tasa correctos.
3. `flows_history`: 60+ eventos espejados; segunda ejecución con el mismo `total`
   (idempotencia por `txHash-logIndex`) y claves/campos válidos.
4. `anonymize_pii`: con `borroSolicitadoAt` retrocedido 31 días, el job anonimiza
   (nombre seudónimo, `datosPersonales = {}`, `anonymizado = true`).
5. `mark_scheduled_due`: programación vencida contabilizada (1).
6. Panel `/admin/jobs` con las cuatro ejecuciones registradas.
7. **Scheduler real**: tras reiniciar el servidor sin `DISABLE_JOBS`, el primer tick cron
   a los 20 s registra `reconcile_flows` con `drifts 0` y `discovered 0` (y completa el
   espejo de eventos), verificado con la sesión admin del segundo proceso.
8. Limpieza: flujo terminado, escrow 0.

```text
[smoke-h6] deriva corregida por el job (drifts 1) ✓
[smoke-h6] flows_history espejo OK (60 eventos idempotentes) ✓
[smoke-h6] anonimización GDPR a 30 días ✓
[smoke-h6] programaciones vencidas: 1 ✓
[smoke:h6] scheduler automático (cron, cada 5 min) ✓
[smoke-h6] TODO OK
```

Los smokes H3/H4/H5 se ejecutaron en el mismo desbloqueo del entono (mismo<fieldset>
del hardening de gas) y quedaron verdes; los flujos de prueba depurados acaban con
escrow 0.

## Decisiones de implementación

1. **Sin claves en el servidor.** Ningún job firma transacciones: quien liquida
   vencidos es el empleado (Suite, `settleFlow` público de AC-02) o el admin desde la
   UI. El job solo detecta y alerta; la firma sigue siendo humana.
2. **Anonimizado por ancla**, no por fecha de alta: se usa `borroSolicitadoAt` como
   instante de acanclamiento; el nombre sale del `wallet` pseudo-hash y la marca
   `anonymizado` hace el job reentrante.
3. **El espejo de eventos es idempotente**: clave `txHash-logIndex` únnica y upsert;
   el rango arranca en `deployBlock` y avanza por chunks de 2.000 bloques.
4. **Gas fijo por operación**: el nodo de Besu subestima `eth_estimateGas` con
   accesos SSTORE en frío; un «límite generoso» con precio fijo (1.000 wei) es
   barato en testnet y evita OOG invisibles. Para Cloud Run conviene registrar el
   consumo real y ajustar los límites.
5. **El «fix --force» de npm audit no es un fix**: llegaba a Next 16 + Zod 4 +
   Vitest 5 (rompedor). Prioridad: árbol verde y verificado; los CVE residuales
   (elliptic dentro de ethers 5.x, postcss empaquetado en Next, zod 3) quedan
   documentados como riesgo aceptado con sustitución programada en H7 (ethers 6,
   Zod 4, Next 16).

## Pendiente / traspaso a H7

- Backup diario de MongoDB con prueba de restauración (Atlas snapshots o mongodump).
- Degradación controlada: caída de RPC (timeouts 8 s ya implementados) y de MongoDB.
- Dry run de 24 h con métricas (job_runs + logs estructurados).
- Container/imagen Cloud Run, secretos, MongoDB gestionado (H7).

## Comandos

```bash
cd web
npm run typecheck
npm test
npm run build
npm run smoke       # H3
npm run smoke:h4    # H4 (Besu real)
npm run smoke:h5    # H5 (Besu real)
npm run smoke:h6    # H6: jobs y reconciliación (Besu real)
```
