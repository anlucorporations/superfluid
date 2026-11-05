# Informe de pruebas — Fase 4 (Superfluid Brlt Streaming v2)

> **Fecha: 2026-11-04 · Resultado global: ✅ 100 % pasando (0 errores funcionales).**
> Resumen global: **44** pruebas Forge (contratos) + **43** pruebas Vitest (web) +
> **8 pantallas** E2E headless con Chromium + **5 suites de humo** end-to-end real
> (H3 HTTP, H4/H5/H6 on-chain Besu 81234 + binario standalone). Errores detectados
> durante la fase: 3, todos corregidos (detalleabajo).

## 1. Resumen global

| Suite | Herramienta | Resultado |
|---|---|---|
| Contratos (unit + fuzz + invariantes) | Forge 1.7.2 | **44/44 passed** |
| Cobertura de contratos | forge coverage | Brlt 100 % líneas / BrltX 94,42 % líneas (scripts excluidos del objetivo) |
| Web unitarias | Vitest 2.1.8 | **43/43 passed** (5 archivos) |
| E2E headless navegador | Playwright 1.55 (Chromium 140) | **13 pasos verdes**, 8 pantallazos en `RepoTecnico/pruebas/` |
| Smoke H3 — identidad y datos | `npm run smoke` | **TODO OK** |
| Smoke H4 — ciclo de nómina (Besu real) | `npm run smoke:h4` | **TODO OK** |
| Smoke H5 — Suite del empleado (Besu real) | `npm run smoke:h5` | **TODO OK** |
| Smoke H6 — jobs y reconciliación (Besu real) | `npm run smoke:h6` | **TODO OK** |
| Artefacto standalone (Cloud Run) | `npm run verify:standalone` | **TODO OK** (`/api/health` 200 ok) |
| Dependencias | `npm audit --omit=dev` | 8 vulnerabilidades conocidas, riesgo aceptado documentado (H6/H7) |

## 2. Detalle por suite

### 2.1 Contratos — Forge 44/44

| Archivo | Pruebas clave |
|---|---|
| `test/Brlt.t.sol` | mint con minter único, tope `MAX_SUPPLY`, quema con saldo, transferencias取得了 ERC-20. |
| `test/BrltX.t.sol` | upgrade/downgrade 1:1, `wrapAndCreateFlow` con floor al wei (2.000 BRLT/30 d = 771604938271604), pausa/reanudación con `endsAt` prolongado, terminación devuelve el remanente, `settleFlow` público solo-vencidos (AC-02), `changeReceiver` atómico (liquida al viejo y abre nuevo flujo), guardas `whenNotPaused` y `nonReentrant`. |
| `test/Invariants.t.sol` (128 ejecuciones × 64 acciones) | Escrow nunca excede `deposited−settled`; `brltBacking == supply BrltX` 1:1; downgrade ≤ balance; sin pagos superiores al deposito. |

```text
Ran 3 test suites: 44 tests passed, 0 failed, 0 skipped
Pricipale gas: wrapAndCreateFlow ~304 k · deleteFlow ~66–93 k · pause ~133 k
```

### 2.2 Web — Vitest 43/43

| Suite | Casos |
|---|---|
| `rates` | 10 — floor 771604938271604, residuo, parse/format BRLT (coma decimal), proyecciones. |
| `validation` | 11 — wallets, wei, periodos, defaults, firma allowlist. |
| `eip712` | 6 — dominio, recuperación de firmantes, falsificación de wallet/nonce. |
| `flows` | 14 — deriveFlowStatus (terminado>pausado>vencido>activo), duración, esquemas H4/H5 (cobro, borrado). |
| `jobs` | 2 — nombres de jobs válidos, anonimizado sin PII. |

### 2.3 E2E headless con Chromium (Playwright, `npm run e2e:ui`)

Recorre el panel autenticado (sesión SIWE creada vía API y escrita como cookie httpOnly):

1. Guarda de sesión: `/admin` → redirige a **/login**.
2. Guarda de sesión: `/suite` → redirige a **/suite/login**.
3. `/login` y `/suite/login` renderizan headless (sin MetaMask).
4. Con cookies: **/admin** (resumen), **/admin/empleados**, **/admin/proyectos**,
   **/admin/flujos** (pestañas), **/admin/jobs**, **/admin/auditoria**, **/admin/sistema**.
5. Logout desde la UI y **revocación verificada** (`/api/auth/me` → 401).

Pantallazos: `RepoTecnico/pruebas/e2e_01..08.png`.

### 2.4 Smokes E2E reales (Besu 81234)

Cada suite de humo registra su bitácora en los hitos correspondientes
(`HITO_H3/H4/H5/H6_*.md`). CobERTura puntual de esta fase:

- **H4**: configuración de red validada, empleado+lote, flujo #22 real, pausa/reanudación
  reconciliada, `changeReceiver` (#22→#23), terminación, programado cancelado, lote 1/1,
  auditoría 8 eventos de flujo.
- **H5**: credito de devengo, tx falso 422, downgraded verificado por evento, guarda de
  liquidación (no vencido → revert),GDPR (perfil/consentimiento/borrado), retiro tras baja.
- **H6**: deriva provocada corregida (`drifts 1`), 60+ eventos espejados idempotentes,
  anonimización a 31 días, programación vencida, panel de jobs y **cron del proceso**.
- Los flujos de prueba quedaron terminados con escrow final 0.

### 2.5 Standalone (producción)

`node .next/standalone/server.js` (identico al CMD del Dockerfile): `/api/health` 200 ok
(`db:true · rpc:true · chainId:81234`), `/login` 200. Base del despliegue H7.

## 3. Errores detectados y su solución

| # | Síntoma | Causa raíz | Solución |
|---|---|---|---|
| 1 | `updateFlow`/`changeReceiver` revertían de forma intermitente (OOG) en los smokes H4/H5 | `eth_estimateGas` de Besu **subestima** con accesos SSTORE en frío (est. 80 k vs. real 133 k) | `gasLimit` fijo por operación en el cliente + margen en los smokes (900 k). Diagnóstico con `cast run` mostró `OutOfGas`. Registrado como hardening de H6/H7. |
| 2 | Panel `/admin/jobs` sin hallazgos del **cron**, pero el H6 smoke creía ver "drifts" en `/api/flows/:id` | La lectura reconciliada de la API corregía la deriva **antes** que el job | El smoke lee la colección directamente para verificar la deriva; el job la repone. Aclarado en la Fase 4. |
| 3 | Playwright sin binario completo (descarga interrumpida) | Cortes de red a mitad de zip | Descarga manual del zip oficial (+ fallback CDN) a `ms-playwright/`. |

## 4. Riesgo residual (documentado, no jeffa del criterio de fase)

- CVEs conocidos de dependencias (ethers 5/elliptic, postcss interno de Next, zod 3):
  sin fix dentro de ramas compatibles; mitigado por superficie de exposición mínima
  (testnet, U.I. solo lectura en servidor, sin claves custodias) y programado
  la migración a la próximos majors (H7/H8).
- Valombreza real 24 h de operación (hito del H7): cron 5 min verificando + backup
  diario del cluster gestionado.

## 5. Criterio de fase F4

**Fase 4 supervisada y cerrada con 100 % de pruebas en verde** (contratos, unitarias,
E2E browser headless, end-to-end on-chain reales y env artefacto de producción). No
quedan errores funcionales abiertos; los 3 hallazgos del periodo fueron corregidos y
re-validados con sus suites.
