# Registro de Decisiones — SFhostpot

> Memoria de decisiones del proyecto (D53). **Propietario:** Director del proyecto (equipo pequeño,
> D38); validación externa antes de mainnet. Fecha de apertura: 2026-10-17.
> Este registro indexa las decisiones y cierra las que estaban pendientes (P-01…P-08) y las
> constantes derivadas (RB-31…RB-35) que los documentos marcaban como "†".

---

## 1. Decisiones de producto y arquitectura (D1–D56)

| Rango | Bloque | Documento |
|---|---|---|
| D1–D19 | Concepto, token BRLT/BRLTx, red, gateway, tarifas, RGPD, repositorio | [`requerimientos.md`](requerimientos.md) §0 y [`propuesta_adaptacion.md`](propuesta_adaptacion.md) |
| D20–D41 | Resolución de la auditoría V1 (solvencia, provisional, SLA, reintentos, QoS, backup, RGPD, RPC, ejecución, vouchers, payout, RBAC, reentrancia, roles, plazos) | [`resolucion_auditoria_v1.md`](resolucion_auditoria_v1.md) |
| D42–D56 | Resolución de la auditoría V2/Fase 2 (ejecución a 1 min, SLA doble, authorize 202, MAC por NAS, OpenAPI v1, RBAC 5 roles, k6, BD dedicada, RGPD ampliado, contrato 1 h, cupo vivo, unicidad flow↔sesión) | [`resolucion_auditoria_fase2.md`](resolucion_auditoria_fase2.md) |

## 2. Decisiones pendientes cerradas (P-01…P-08)

| ID | Decisión | Resolución | Propietario | Fecha | Estado |
|---|---|---|---|---|---|
| **P-01** | Contrato de API definitivo (OpenAPI) | Congelar **OpenAPI v1 en el inicio de H2**, prefijo `/v1/...`, con `/pause` y `/resume`, catálogo cerrado de `reason`; versionado en `sfh-orchestrator/openapi.yaml` (D48) | Backend/Arquitectura + Director | 2026-10-17 | ✅ CERRADA |
| **P-02** | Parámetros del **lease** del indexador | Lease de **60 s** con renovación cada **20 s**, `leased_by` + `version` (CAS) y fencing en cada actualización; prueba de doble ejecución concurrente en H2 (D42/D53) | Backend | 2026-10-17 | ✅ CERRADA |
| **P-03** | Presupuesto temporal de revocación | **Doble métrica D43**: p95 < 10 s desde detección y p95 < 75 s end-to-end; 3 intentos 1/2/4 s + jitter, gracia 30 s, fallback CoA↔REST y corte de emergencia | Arquitectura/QA | 2026-10-17 | ✅ CERRADA |
| **P-04** | Modelo de consumo/octetos | v1 expone **estimación on-chain** (`accumulated_wei`) y el accounting RADIUS queda SHOULD; no se materializa agregado propio (D46) | Producto/Backend | 2026-10-17 | ✅ CERRADA |
| **P-05** | EIPD e inventario PII | Inventario PII documentado y **decisión EIPD registrada**; DPO asumido por el Director con independencia limitada aceptada (D38/D52); revisión externa antes de mainnet | Director/DPO | 2026-10-17 | ✅ CERRADA (revisión externa pendiente) |
| **P-06** | Alcance VPC Connector / UDP 3799 | Se implementa **REST MikroTik como camino principal**; RADIUS CoA/PoD requiere VPC Connector + UDP 3799 y se valida en H3; si no hay alcance, producción queda en solo-REST (riesgo documentado) | Infra/Redes | 2026-10-17 | ✅ CERRADA (condicionada a H3) |
| **P-07** | Validación con hardware real | Se planifica ventana con router/NAS **tras H5**; los adaptadores se validan contra `mock` hasta entonces (D16) | Redes/QA | 2026-10-17 | ✅ CERRADA (acción H6) |
| **P-08** | URL/rama del repositorio nuevo | Repositorio **nuevo e independiente** (D19); URL/rama las fija el Director al iniciar Fase 3 | Director | 2026-10-17 | ✅ CERRADA (URL pendiente) |

## 3. Constantes derivadas ratificadas (RB-31…RB-35)

| ID | Constante | Valor ratificado | Base |
|---|---|---|---|
| **RB-31** | Caducidad del challenge SIWE / nonce | **900 s**, uso único | D7 |
| **RB-32** | Rate-limit de endpoints de identidad | **5 fallos por IP + MAC observada por el NAS cada 15 min** → HTTP 429, contador compartido (BD/Redis) | RNF-10/RNF-26, H2-28 |
| **RB-33** | Umbral de `degraded` | **3 comandos fallidos consecutivos** o gracia de 30 s agotada | RNF-19, D24 |
| **RB-34** | Paginación de listados admin | **100 filas/página** | RNF-14/RT-12 |
| **RB-35** | Lote de purga RGPD | **1 000 filas por transacción**, job diario **03:00 UTC** | RNF-12, D27 |
| **RB-36** | Cooldown por conflicto de MAC | **15 min** por MAC tras un conflicto (D47/V2-13) | D47 |
| **RB-37** | Bloqueo por segundo conflicto de MAC | **24 h** tras el segundo conflicto en la ventana (D47/V2-13) | D47 |

## 4. Decisiones abiertas que dependen del entorno

| ID | Asunto | Bloqueo | Acción |
|---|---|---|---|
| ENV-01 | `docker compose` completo (RNF-14) | El host no tiene Docker y `sudo` está bloqueado | Verificar en Fase 4 o en un host con Docker |
| ENV-02 | Mempool en Besu 81234 | Requiere sondear la red | Verificar en H2 (D56); si no hay mempool visible, confirmar por receipt y revocar a los 60 s |
| ENV-03 | Permisos Cloud SQL para CI | La identidad actual funciona vía token + conector | Documentado en `entornos_globales.md` §6.1 |

## 5. Regla de mantenimiento

Toda decisión nueva se añade aquí con **ID, propietario, fecha y estado**; los documentos de
requerimientos, casos de uso y técnico se actualizan en el mismo turno. El validador
[`tools/validador_artefactos.py`](tools/validador_artefactos.py) comprueba la coherencia de los
artefactos de datos en CI documental.
