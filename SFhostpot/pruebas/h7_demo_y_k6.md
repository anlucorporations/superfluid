# Evidencia H7 — Demo CU-01 scripted + carga k6 100 VUs (entorno emulado)

> **Fecha:** 2026-10-23 · **Entorno:** preview `truekeate-main` / `southamerica-east1` ·
> **Objetivo:** demostrar la operatividad completa de la plataforma con el MikroTik emulado
> ([`propuesta_entorno_pruebas_mikrotik.md`](../propuesta_entorno_pruebas_mikrotik.md) fases A–C).

---

## 1. Demo CU-01 scripted (Playwright + wallet real en Besu)

**Job:** `sfh-demo` (Cloud Run Job) · **Ejecución:** `sfh-demo-x4pzh` · **Resultado: 13/13 PASS** (exit 0).

Recorre el portal real con una wallet real (cuenta de pruebas Anvil #0, clave en Secret Manager),
el gateway emulado (`sfh-sim-routeros`) y Cloud SQL:

| # | Paso | Resultado |
|---|---|---|
| 1 | Cierre de flujo previo (idempotencia entre ejecuciones) | ✅ tx `0xd0af58d5…` |
| 2 | NAS simulado → `POST /v1/internal/hotspot/bind` (HMAC D45) | ✅ 200 + `bind_token` |
| 3 | Portal cargado con `bind_token` | ✅ |
| 4 | Aviso de privacidad → `portal_session` | ✅ `0b523f4d…` |
| 5 | Wallet conectada (`0xf39F…`) | ✅ |
| 6 | Firma SIWE → `device_binding` | ✅ |
| 7 | Wrap BRLT→BRLTx (approve + upgradeTo on-chain) | ✅ |
| 8 | `createFlow` en Besu + `POST /v1/session/authorize` | ✅ 202 |
| 9 | Worker de validación → adaptador → emulador | ✅ `status=provisional` |
| 10 | Sesión autorizada visible en el portal | ✅ `provisional` |
| 11 | Sesión visible en el emulador MikroTik | ✅ `sessions=1` |
| 12 | Pausa → `disconnect` → BD `revoked` | ✅ |
| 13 | Sesión eliminada del emulador | ✅ `sessions=0` |

**Artefactos:**

- [`demo/demo-log.json`](demo/demo-log.json) — log JSON de los 13 pasos.
- [`demo/demo.webm`](demo/demo.webm) — vídeo del recorrido (≈1,3 MB).
- [`demo/capturas/`](demo/capturas/) — 8 capturas: aviso, sesión, wallet, SIWE, wrap, stream,
  sesión autorizada y pausa revocada.

**Nota:** el worker durable (Cloud Tasks) no está desplegado en el preview; la demo invoca el endpoint
interno de validación para completar el circuito real API→adaptador→emulador. El resto del flujo es real
(firma SIWE, transacciones on-chain, Cloud SQL y emulador).

---

## 2. Carga k6 — 100 VUs (dos flujos)

**Job:** `sfh-k6-load` · **Ejecución:** `sfh-k6-load-dwl2b` · **Resultado: ambos escenarios superados**
(exit 0; `k6` 0.54.0). Umbrales acordados: 0 % fallos, checks 100 %, p95 global < 1.000 ms y p95 de ACK
del gateway < 500 ms.

### 2.1 Flujo A — NAS → portal (`k6/nas_portal.js`)

| Métrica | Valor | Umbral | Estado |
|---|---|---|---|
| VUs / duración | 100 VUs · 20 s | — | — |
| Iteraciones | 7.572 (376,6/s) | — | — |
| Peticiones HTTP | 15.144 (753,2/s) | — | — |
| Checks | **100 %** (15.144/15.144) | `rate==1` | ✅ |
| Fallos HTTP | **0 %** | `<1 %` | ✅ |
| `bind_latency_ms` p95 | **306 ms** | <1.000 ms | ✅ |
| `portal_latency_ms` p95 | **297 ms** | <1.000 ms | ✅ |
| `http_req_duration` p95 | **294 ms** | <1.000 ms | ✅ |

### 2.2 Flujo B — comandos de gateway (`k6/gateway_pause.js`)

100 VUs × 1 iteración (8.160 sesiones sembradas + sesiones activas en el emulador);
`POST /v1/session/pause` → adaptador MikroTik → emulador → BD.

| Métrica | Valor | Umbral | Estado |
|---|---|---|---|
| Checks | **100 %** (16.320/16.320) | `rate==1` | ✅ |
| Fallos HTTP | **0 %** | `<1 %` | ✅ |
| `gateway_ack_ms` p95 | **475 ms** | <500 ms | ✅ |
| `http_req_duration` p95 | **474 ms** | <1.000 ms | ✅ |

**Resúmenes JSON:** [`k6/k6-nas-summary.json`](k6/k6-nas-summary.json) ·
[`k6/k6-gateway-summary.json`](k6/k6-gateway-summary.json).

---

## 3. Correcciones de plataforma descubiertas al construir la demo/carga

| # | Hallazgo | Fix aplicado (tests) |
|---|---|---|
| 1 | API con CORS fijo `origin:false` → el navegador no podía llamar al API desde el portal | `CORS_ORIGIN` configurable (`server.ts`/`config.ts`) |
| 2 | ABIs human-readable sin `parseAbi` → `readContract` fallaba en el navegador | `sfh-portal/src/lib/abi.ts` usa `parseAbi` |
| 3 | `BRLTX_ABI` de `chain.ts` sin `createFlow` → `validateAuthorize` devolvía `tx_not_found` | ABI ampliada con operaciones de flujo |
| 4 | Pool de BD 10 × instancias agotaba conexiones de Cloud SQL a 100 VUs | `DB_POOL_MAX` configurable; preview en 4 |
| 5 | Rate-limit 1.000/60 s bloqueaba la carga | subido a 1.000.000 en preview (revisar en prod) |
| 6 | `pause` pasaba MAC/IP vacíos → `disconnect` podía afectar a todas las sesiones | MAC/IP reales desde `hotspot_sessions` |
| 7 | `disconnect` interpretaba 401/5xx como “ya desconectado” | fail-closed si `status >= 400` |
| 8 | Sin tarifa activa → `no_tariff_or_session` | la demo siembra tarifa idempotente |

---

## 4. Reproducir

```bash
# demo CU-01
gcloud run jobs execute sfh-demo --project=truekeate-main \
  --region=southamerica-east1 --wait
# carga k6 (100 VUs, ambos flujos)
gcloud run jobs execute sfh-k6-load --project=truekeate-main \
  --region=southamerica-east1 --wait
```

Evidencias en GCS: `gs://truekeate-main-sfh-evidence/demo/2026-10-23/` y
`gs://truekeate-main-sfh-evidence/k6/2026-10-23/`.
