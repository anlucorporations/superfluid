# Superfluid Brlt Streaming v2 — Web

Next.js 15 (App Router) + React 19 + TypeScript + Tailwind + ethers 5.7.2 + MongoDB.

## Requisitos

- Node.js 20+ (probado con 24).
- MongoDB 6/7 o `mongodb-memory-server` para desarrollo.
- Wallet EIP-1193 en el navegador (MetaMask) para firmar SIWE.

## Puesta en marcha

```bash
cd web
npm install
cp .env.example .env.local     # rellenar MONGODB_URI, SIWE_DOMAIN y ADMIN_BOOTSTRAP_WALLET
npm run seed                   # índices + wallet admin + system_config inicial
npm run dev
```

Sin `mongod` local:

```bash
npm run dev:mem                # arranca MongoDB en memoria y `next dev`
```

La primera ejecución de `mongodb-memory-server` descarga un binario de MongoDB
(versión fijada a 7.0.14 por compatibilidad con Windows).

## Variables de entorno

| Variable | Uso |
|---|---|
| `MONGODB_URI` / `MONGODB_DB` | Conexión y base de datos. |
| `SIWE_DOMAIN` | Dominio exacto del mensaje SIWE (incluye puerto en local). |
| `SESSION_TTL_ADMIN_SECONDS` | 7200 s por defecto (2 h). |
| `SESSION_TTL_EMPLOYEE_SECONDS` | 28800 s por defecto (8 h). |
| `AUTH_RATE_LIMIT` / `AUTH_RATE_WINDOW_SECONDS` | 5 intentos / 900 s por defecto. |
| `ADMIN_BOOTSTRAP_WALLET` | Wallet que `npm run seed` añade a la allowlist. |
| `NEXT_PUBLIC_RPC_URL` / `NEXT_PUBLIC_CHAIN_ID` | Red Besu (81234). |
| `NEXT_PUBLIC_BRLT_ADDRESS` / `NEXT_PUBLIC_BRLTX_ADDRESS` | Contratos desplegados (H2/H4). |
| `DISABLE_JOBS` | `1` desactiva el cron interno de jobs (H6). |

## API

| Ruta | Método | Rol | Descripción |
|---|---|---|---|
| `/api/auth/nonce` | POST | público | Nonce de un uso + mensaje SIWE preparado. |
| `/api/auth/verify` | POST | público | Verifica SIWE y crea sesión opaca. |
| `/api/auth/logout` | POST | sesión | Revoca la sesión. |
| `/api/auth/me` | GET | sesión | Sesión actual (+ ficha si es empleado). |
| `/api/employees` | GET/POST | admin | Listado y alta. |
| `/api/employees/:id` | GET/PATCH | admin | Ficha, edición y baja/reactivación. |
| `/api/employees/:id/wallet/authorization` | POST | admin | Nonce + payloads EIP-712 del cambio de wallet. |
| `/api/employees/:id/wallet` | POST | admin | Cambio atómico con doble firma. |
| `/api/projects` | GET/POST | admin | Listado y alta. |
| `/api/projects/:id` | GET/PATCH/DELETE | admin | Edición/baja (bloqueada si tiene empleados). |
| `/api/admin/allowlist` | GET/POST | admin | Wallets autorizadas; alta con firma SIWE. |
| `/api/admin/allowlist/challenge` | POST | admin | Mensaje de confirmación para la wallet nueva. |
| `/api/admin/allowlist/:wallet` | PATCH | admin | Estado/rol; nunca deja la lista sin admins. |
| `/api/system` | GET/PATCH | admin | Configuración validada contra la red (chainId 81234 + `eth_getCode`). |
| `/api/flows` | GET/POST | admin | Flujos reconciliados (`getFlow`/`getPending`) y registro verificado de un flujo recién creado. |
| `/api/flows/:id` | GET | admin | Detalle reconciliado de un flujo. |
| `/api/flows/actions` | POST | admin | Audita pausa, reanudación, terminación, liquidación, cambio de receptor (con `newFlowId`), mint y burn. |
| `/api/scheduled-flows` | GET/POST/PATCH | admin | Programaciones (CU-05); PATCH por `?id=`. |
| `/api/batches` | POST | admin | Abre un lote de hasta 10 empleados (CU-09). |
| `/api/batches/:id` | GET | admin | Progreso del lote para reanudar sin duplicar pagos. |
| `/api/audit` | GET | admin | Historial de auditoría. |
| `/api/suite/me` | GET | empleado | Ficha, balances on-chain y flujos del empleado (CU-14). |
| `/api/suite/profile` | PATCH | empleado | Datos personales y consentimiento GDPR (CU-15/AC-10). |
| `/api/suite/erase` | POST | empleado | Borrado inmediato de datos personales (AC-10). |
| `/api/suite/actions` | POST | empleado | Audita `downgrade`/`settleFlow` verificando el recibo on-chain. |
| `/api/jobs` | GET/POST | admin | Estado de los jobs internos (H6) y lanzamiento manual con CSRF. |
| `/api/health` | GET | público | Sonda de Cloud Run (Mongo + RPC). |

## Seguridad

- Sesión opaca: token aleatorio en cookie `sf_session` (HttpOnly); en MongoDB solo el
  `sha256`. CSRF double-submit con cookie `sf_csrf` + cabecera `x-csrf-token`.
- Nonces SIWE de un solo uso con TTL de 5 min, ligados a wallet y propósito
  (`admin`, `suite`, `wallet_change`).
- Rate limit por wallet + IP en ventana fija (5/15 min por defecto).
- Cambio de wallet: firma EIP-712 de la wallet nueva + step-up de la admin, nonce de un
  uso, revocación de la sesión anterior y evento en `audit_events`.
- Allowlist: alta con confirmación firmada por la wallet nueva; prohibido revocar el
  último administrador activo.

## Pruebas

```bash
npm run typecheck     # TypeScript estricto
npm test              # Vitest (tasas, validación, EIP-712, flujos y jobs)
npm run build         # build de producción (standalone)
npm run verify:standalone   # arranca `node .next/standalone/server.js` y prueba /api/health
npm run smoke         # E2E: Mongo en memoria + next start + SIWE + CRUD + cambio de wallet
npm run smoke:h4      # E2E real: ciclo de nómina admin contra Besu 81234 (usa sc/.env)
npm run smoke:h5      # E2E real: Suite del empleado (cobro downgrade, GDPR) contra Besu 81234
npm run smoke:h6      # E2E real: jobs de reconciliación, GDPR y cron (Besu 81234)
```

`npm run smoke` requiere `npm run build` previo. Usa `SMOKE_PORT` para cambiar el puerto
(3100 por defecto; `smoke:h4` usa 3101, `smoke:h5` 3102 y `smoke:h6` 3103). Los smokes
reales firman con `ADMIN_PRIVATE_KEY` de `sc/.env` y crean/terminan flujos reales: cuesta
gas simbólico. `DISABLE_JOBS=1` desactiva el cron de jobs de H6.

## Ayuda y manuales

- **En la plataforma:** la sección de ayuda navegable con capturas reales y descarga
  de PDF se sirve en `/ayuda/` (estática en `web/public/ayuda/`); enlazada también
  desde el menú del panel de administración.
- **Documentación del proyecto:** manuales técnicos en `RepoTecnico/Manuales/**`
  (fiel al código, con referencias `ruta:línea`), manuales literales en `docs/Manuales/**`,
  gráficos en `docs/imagenes/` y PDF en `docs/Manuales/pdf/`.

## Notas

- El statement SIWE debe ser ASCII imprimible: los acentos rompen el parser EIP-4361.
- H4 firma todas las escrituras on-chain en el navegador (MetaMask); el servidor solo lee
  con `eth_call` y persiste en MongoDB. La verdad del estado es siempre el contrato.
- Al pausar, BrltX guarda la tasa en `rateBeforePause`; el servidor la persiste para que
  «Reanudar» funcione sin confiar en el cliente.
- `changeReceiver` cierra el flujo antiguo y abre uno nuevo: la UI pasa el `newFlowId` del
  evento `FlowCreated` y el servidor lo registra (no quedan flujos huérfanos).
- Para Cloud Run se usará `output: standalone` (`node .next/standalone/server.js`), no
  `next start`.
- **H5**: el cobro del empleado (`downgrade`) y la liquidación vencida (`settleFlow`) se
  auditan solo si la cadena confirma el evento (`Downgraded`/`FlowSettled` firmado por la
  wallet de la sesión). El login de Suite se mantiene 90 días tras la baja (retiro).
- **H6**: los jobs corren desde `instrumentation.ts` (cron 5 min; `DISABLE_JOBS=1` para
  desactivar). Las escrituras on-chain del cliente envían `gasLimit` fijo porque Besu
  subestima `eth_estimateGas` con accesos en frío (riesgo de OOG intermitente).
- **H7**: el artefacto de producción es `Dockerfile` multi-stage + `.next/standalone`;
  desplegar con `gcp/deploy.sh` o `gcloud builds submit --config gcp/cloudbuild.yaml`.
  Runbook de cutover/rollback en `gcp/README.md`. `NEXT_PUBLIC_*` se hornéan en build.
- **Manuales (Fase 5)**: técnicos en `RepoTecnico/Manuales/`, literales y PDF en
  `docs/`, capturas reales vía `npm run capturas`, PDFs vía `npm run manuales:pdf` y
  ayuda navegable servida desde `web/public/ayuda/`.
