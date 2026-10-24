# Informe de Optimización V1 — Paquete documental SFhostpot

**Proyecto:** Superfluid Hostpot
**Alcance auditado:** paquete de Fase 1 (Concepto) de [`SFhostpot/`](./)
**Artefactos revisados:** [`README.md`](./README.md), [`requerimientos.md`](./requerimientos.md), [`diccionario_datos.md`](./diccionario_datos.md), [`diagrama_er.md`](./diagrama_er.md), [`base_datos.sql`](./base_datos.sql), [`entornos_globales.md`](./entornos_globales.md), [`propuesta_adaptacion.md`](./propuesta_adaptacion.md), [`estado_proyecto.md`](./estado_proyecto.md)
**Documentos de contraste:** [`../RepoTecnico/BRIEF_SUPERFLUID_HOSTPOT.md`](../RepoTecnico/BRIEF_SUPERFLUID_HOSTPOT.md), [`../RepoTecnico/INFORME_OPTIMIZACION_V1.md`](../RepoTecnico/INFORME_OPTIMIZACION_V1.md)
**Método:** equipo de auditoría de 3 fases (7 lentes en paralelo → verificación adversarial por lente → síntesis)
**Resultado:** 38 hallazgos consolidados (2 CRÍTICA, 12 ALTA, 19 MEDIA, 5 BAJA)

---

## 1. Resumen ejecutivo

**Veredicto: la documentación de Fase 1 NO es apta para pasar a Fase 3 tal cual. Es apta para un ciclo corto de corrección ("Fase 1-bis") y después avanzar.**

El paquete de Concepto es sólido en cobertura funcional (27 RF, 16 RNF, 12 RT, D1–D19), pero la verificación adversarial confirma que **persisten 2 defectos críticos de diseño** en criterios que deciden acceso y cobro:

- **H-01** — El predicado de solvencia/insolvencia sigue sin cerrarse: `is_solvent`, `virtualBalanceOf` y `buffer_seconds` existen en el esquema pero ninguna regla los combina, y el buffer documentado (4 h) no coincide con el DDL (3600 s = 1 h). No puede escribirse el test frontera del corte de servicio.
- **H-02** — El acceso provisional de 60 s se concede solo por ver la tx en mempool, sin validar remitente, destino, `receiver`, `flowRate` ni ejecutabilidad, y sin cuota anti-reincidencia: abre una vía de acceso gratuito repetible.

Además, **12 hallazgos de severidad ALTA** bloquean garantías concretas: SLAs de latencia no medibles, tolerancia a fallos de gateway formalizada a medias, un MUST de QoS sin magnitud absoluta, RPC único sin failover, modelo de ejecución de los procesos de fondo indefinido, secretos RADIUS en claro, ausencia total de recuperabilidad (backup/RTO/RPO), retención RGPD sin mecanismo de purga, MAC spoofing no acotado, `pauseFlow` que conserva `flowRate > 0`, un stakeholder real (huésped sin wallet) fuera del registro y cifras/verificaciones del cierre de Fase 1 no reproducibles.

**Puerta mínima para abrir Fase 3 (criterios de aceptación):** cerrar H-01, H-02 y, como mínimo, H-03, H-04, H-05, H-06, H-07, H-08, H-09, H-10, H-11, H-13. Los tres bloques de documentación (conteos, referencias cruzadas y checklist de cierre) son quick wins de menos de un día. La recomendación es **no reescribir el Concepto**: corregir in situ, añadir el script validador de artefactos al CI documental y adjuntar su salida como evidencia de cierre.

---

## 2. Metodología

Se aplicó el proceso de auditoría en 3 fases con 7 lentes independientes:

| Fase | Actividad | Participantes |
|------|-----------|---------------|
| **Fase 1 — Revisar** | Cada lente produce hasta 12 hallazgos con evidencia `ruta:línea`. | R1…R7 |
| **Fase 2 — Verificar** | Verificador adversarial por lente: contrasta contra los artefactos reales, filtra falsos positivos, deduplica y ajusta severidades. **Regla: ante la duda, se descarta.** | 7 verificadores |
| **Fase 3 — Sintetizar** | Deduplicación cruzada, IDs únicos `H-xx`, priorización y plan de acción. | Sintetizador |

**Lentes aplicadas:**

| Lente | Foco |
|-------|------|
| R1 | Ambigüedad y testabilidad (criterios no medibles) |
| R2 | Consistencia (docs ↔ SQL/ER, referencias cruzadas, fases) |
| R3 | Completitud RNF / ISO 25010 |
| R4 | Stakeholders y roles |
| R5 | Trazabilidad con el brief |
| R6 | Riesgos técnicos, SPOF y escala |
| R7 | Seguridad y legal |

**Nota sobre R5:** la dimensión de trazabilidad con el brief no entregó hallazgos verificados a la síntesis; por tanto **este informe no incluye ningún hallazgo atribuido a R5**. No se ha inventado cobertura para esa lente.

**Conflictos entre verificadores resueltos en síntesis:**
- El "SLA < 10 s vs. health-check de 15 s" fue **descartado** por R2 y R3 (el reloj del SLA arranca en la detección). R1 y R6 lo mantuvieron, pero reencuadrado como defecto de **verificabilidad de la métrica**, no como contradicción aritmética literal → fusión en **H-03**.
- La ausencia de FK `GATEWAYS→NAS` fue verificada por R2 y **descartada** por R3 (documentada como relación conceptual sin FK). Prevalece la evidencia más específica de R3 → el hallazgo se reduce a la duplicación de NAS en el ER (**H-37**, BAJA).
- Los secretos RADIUS en claro los mantuvieron R3 (ALTA) y R7 (MEDIA); se conserva ALTA por contradecir explícitamente `RNF-02` y el encabezado del SQL (**H-08**).
- Los conteos erróneos de `estado_proyecto.md` aparecen en R1, R2 (ALTA) y R3; se fusionan en **H-06**.

---

## 3. Estado de calidad (métricas verificadas)

| Métrica | Valor verificado | Observación |
|---------|------------------|-------------|
| Requisitos funcionales (RF) | **27** (RF-01…RF-27) | `estado_proyecto.md` declara 25 |
| Requisitos no funcionales (RNF) | **16** | Coincide |
| Requisitos técnicos (RT) | **12** (RT-01…RT-12) | Coincide |
| Decisiones | **D1–D19** | `estado_proyecto.md` declara D1–D18 |
| Entrevista | **P1–P13** | `estado_proyecto.md` declara P1–P9 |
| Tablas en `base_datos.sql` | **20** (`CREATE TABLE`) | Coincide con README |
| Tipos enum | **16** (`CREATE TYPE`) | `estado_proyecto.md` declara 14 (dos veces) |
| Tests en `sc/test` | **42** `function test*` + **4** `function invariant*` | `requerimientos.md` cita "37 tests + fuzz" |
| Cobertura ER | 100 % declarada | Sin script validador identificable en `tools/` |
| Ejecución real del SQL | **Pendiente** | No ejecutado contra PostgreSQL 16 en el host |
| RPC académico v1 (heredado) | p90 ≈ 4,45 s · p95 ≈ 20,01 s · timeouts 3,5–4,2 % · **47,9 % de fallos con concurrencia 8** | `../RepoTecnico/INFORME_OPTIMIZACION_V1.md:350` |
| Lint/tests ejecutados en esta auditoría | **No** | Auditoría documental lectura-only; no hay entorno de ejecución del paquete SFhostpot |

**Conclusión de calidad:** el paquete está internamente bien estructurado pero **no auto-verificado**. El cierre ✅ de Fase 1 invoca validaciones ("validados por script", "cobertura ER 100 %", "60 % de la complejidad") que no son reproducibles con el contenido actual del repositorio, y arrastra cifras de la revisión v1.1 que contradicen al resto del paquete.

---

## 4. Tabla por severidad

### 4.1 CRÍTICA

| ID | Área | Hallazgo | Lente |
|----|------|----------|-------|
| **H-01** | Solvencia (RF-13/RF-19/D9) | `is_solvent`/`virtualBalanceOf`/`buffer_seconds` sin predicado operable; buffer 1 h vs. 4 h del brief | R1 |
| **H-02** | Autorización / bypass de pago | Provisional de 60 s por ver tx en mempool sin validar contenido ni cuota anti-reincidencia | R7 |

### 4.2 ALTA

| ID | Área | Hallazgo | Lente |
|----|------|----------|-------|
| **H-03** | SLA / latencia (RNF-03/RNF-04) | p95 sin métrica, punto de medida, ventana ni población; tensión con el ciclo de 15 s | R1 + R6 |
| **H-04** | Revocación (D14/RF-20) | Reintentos/backoff/gracia sin parámetros; `degraded` sin semántica ni ACK verificado | R1 + R6 |
| **H-05** | QoS hijos (RF-26/D18) | "50 % del padre" sin ancho de banda base ni atributos RADIUS concretos | R1 |
| **H-06** | Consistencia documental | `estado_proyecto.md` contradice 27 RF / D1–D19 / P1–P13 / 16 enums y cita validaciones irreproducibles | R1 + R2 + R3 |
| **H-07** | Recuperabilidad | Sin RNF de backup, PITR, RTO/RPO ni prueba de restauración | R3 + R6 |
| **H-08** | Seguridad / secretos | `nas.secret` y credenciales RADIUS en claro contra `RNF-02` | R3 + R7 |
| **H-09** | RGPD / retención | 30 días sin TTL ni job de purga; `FK ON DELETE RESTRICT` obstaculiza la supresión | R3 + R7 |
| **H-10** | Infra / RPC | `RPC_URL` único sin failover ni SLA de proveedor | R3 + R6 |
| **H-11** | Cloud Run / indexador | Escalado a cero convive con procesos vivos; `indexer_checkpoints` sin lease ni versión | R6 |
| **H-12** | Anti-spoofing | El binding SIWE no autentica el dispositivo; MAC spoofing sin cuantificar ni detectar | R7 |
| **H-13** | Contratos / devengo | `pauseFlow` conserva `flowRate > 0` y `virtualBalanceOf` no descuenta el tramo pausado | R7 |
| **H-14** | Stakeholders / RGPD | El huésped sin wallet (hijo por voucher) no figura como stakeholder pese a tratarse sus MAC/IP | R4 |

### 4.3 MEDIA

| ID | Área | Hallazgo | Lente |
|----|------|----------|-------|
| **H-15** | Disponibilidad (RNF-08) | 99,5 % "en el periodo beta" sin ventana, alcance, fuente ni definición de degradación | R1 |
| **H-16** | Indexador (RNF-05) | 100 % de eventos "confirmados" sin nº de confirmaciones ni política de reorg | R1 |
| **H-17** | Observabilidad (RNF-09/RT-12) | Sin métricas nombradas, umbrales, alertas, retención de logs ni runbook/MTTR | R1 + R3 |
| **H-18** | Mantenibilidad (RNF-11) | ISO 25010 "evaluada en auditoría" sin escala ni cobertura mínima; estático solo en contratos | R1 + R3 |
| **H-19** | Usabilidad/accesibilidad/compatibilidad | "WCAG 2.1 AA básico" sin subconjunto, alcance, umbral ni i18n/matriz de navegadores | R1 + R3 |
| **H-20** | Vouchers | Canje no atómico y estado `redeemed` incoherente con `max_children = 2` | R2 + R6 + R7 |
| **H-21** | Modelo de datos | `chk_device_bindings_owner` (OR) no implementa la exclusividad wallet/voucher documentada | R2 |
| **H-22** | Cierre de fase | Fase 1 declarada cerrada con checklist §6.3/§2.3/§10 obsoletos y criterio de credenciales en ⏳ | R2 |
| **H-23** | Consistencia (D19) | `entornos_globales.md` opera sobre rutas del repo v1 (`sc/`, `orchestrator`, `portal`) | R2 |
| **H-24** | Modelo de datos (payout) | `payout_wallet` duplicado en `gateways` y `gateway_tariffs` sin regla de precedencia | R2 |
| **H-25** | Capacidad | Sin objetivo de sesiones concurrentes, throughput ni presupuesto de conexiones | R3 + R6 |
| **H-26** | Acceso a API admin | Sin mecanismo de autenticación especificado ni MFA obligatorio, intentos fallidos ni login en `audit_log` | R7 |
| **H-27** | Contratos / reentrancia | `RNF-01` da "reentrancia protegida" por heredada sin guarda en `sc/src` y con CEI incumplido | R7 |
| **H-28** | PII / sesión | Inventario RGPD limitado a MAC/IP sin EIPD; JWT sin defensas CSRF/SameSite documentadas | R7 |
| **H-29** | Stakeholders / soporte | Sin rol ni proceso de soporte y reclamación del usuario final (ni reemisión de vouchers) | R4 |
| **H-30** | Stakeholders / legal | Revisión legal de RNF-12 sin dueño; DPO auto-asignado al operador explotador | R4 |
| **H-31** | Stakeholders / claves | Custodia de claves concentrada en el Director sin custodio separado ni separación de funciones | R4 |
| **H-32** | Stakeholders / abuso | `devices.blocked` sin rol, causales, plazo ni apelación | R4 |
| **H-33** | Stakeholders / auditoría | RBAC sin rol `auditor`/`dpo`; `audit_log` sin responsable de revisión | R4 |

### 4.4 BAJA

| ID | Área | Hallazgo | Lente |
|----|------|----------|-------|
| **H-34** | Trazabilidad | Verificaciones por "grep" sin patrones/alcance y convención `RE-xx` sin definir | R1 |
| **H-35** | Idempotencia / migraciones | Claim "ejecutable e idempotente" sin verificar; sin `ALTER TABLE … ADD COLUMN IF NOT EXISTS` | R2 |
| **H-36** | Planificación | Hoja de ruta e hitos H1–H6 sin fecha, duración ni propietario | R2 |
| **H-37** | Consistencia ER | NAS definido dos veces en el ER; relación `GATEWAYS ||--o{ NAS` sin FK (documentada como intencional) | R2 |
| **H-38** | Seguridad / vouchers | Anti-fuerza-bruta del canje solo como mitigación cualitativa, sin RNF ni contador de intentos | R3 + R7 |

**Distribución:** CRÍTICA 2 · ALTA 12 · MEDIA 19 · BAJA 5 · **Total 38**

---

## 5. Hallazgos críticos detallados

### H-01 · CRÍTICA — Solvencia/insolvencia sin predicado operable

**Detalle.** `RF-19` ordena revocar cuando el balance/virtual es "≤ 0" y `RF-13` exige validar "solvencia (virtualBalanceOf)" cada 15 s, pero ningún artefacto define el predicado de `is_solvent` ni fija si el umbral es 0 o el buffer de garantía. `session_health_checks` almacena `virtual_balance_wei`, `min_rate_required_wei`, `flow_rate_wei_s` e `is_solvent` sin regla que los combine; `gateway_tariffs.buffer_seconds` (default 3600 s) solo está declarado y no lo consume nadie, mientras el brief describe un buffer "usualmente equivalente a 4 horas" (discrepancia de 4×). Tampoco se define el tratamiento de `virtualBalanceOf` negativo (int256) ni de `pendingDeficit`/`pendingPool`. Es el criterio que decide cortar el servicio: sin predicado cerrado no puede escribirse un test de frontera ni un Gherkin de insolvencia.

**Evidencia.** [`requerimientos.md:74`](./requerimientos.md) (RF-19 "≤ 0") · [`requerimientos.md:63`](./requerimientos.md) (RF-13 "valida solvencia") · [`diccionario_datos.md:304`](./diccionario_datos.md) (`is_solvent` sin regla) · [`diccionario_datos.md:151`](./diccionario_datos.md) (`buffer_seconds` default 3600, sin uso) · [`diccionario_datos.md:61`](./diccionario_datos.md) (`depositTotal = netOutflowGarantizado × 3600`) · [`base_datos.sql:156`](./base_datos.sql) y [`base_datos.sql:300`](./base_datos.sql) · [`../RepoTecnico/BRIEF_SUPERFLUID_HOSTPOT.md`](../RepoTecnico/BRIEF_SUPERFLUID_HOSTPOT.md) (buffer "usualmente 4 horas").

**Recomendación.** Fijar y documentar el predicado exacto con convención de frontera (p. ej. `is_solvent := virtualBalanceOf(sender) >= flowRate_wei_s * buffer_seconds`); alinear `buffer_seconds` con el brief (4 h); definir signo/convención de `virtualBalanceOf` (int256) y del déficit pendiente; propagar a diccionario, ER y SQL; añadir casos de prueba en los tres límites (por encima, igual y por debajo) en Vitest y Forge. **Responsable:** Arquitecto de datos + Contratos · **Esfuerzo: M**

---

### H-02 · CRÍTICA — Provisional de 60 s concedido solo por ver la tx en mempool

**Detalle.** `D5/RF-12` otorgan 60 s de acceso en cuanto se ve la tx en mempool (`eth_getTransactionByHash`) y solo exigen confirmar o revocar según inclusión en 2 bloques. No se obliga a validar en la ventana provisional que la tx provenga de la wallet ligada al binding, que invoque `createFlow` del Super Token con `receiver = payout_wallet` y `flowRate >= tarifa`, ni que sea ejecutable (saldo/nonce). `RF-09` fija esas condiciones para el validador, pero no se declara que apliquen al camino provisional, que por definición precede a la confirmación. El único control es el índice único parcial de una sesión no terminal por MAC, que impide simultaneidad pero no reincidencia: al revocarse, el estado pasa a terminal y el ciclo puede repetirse. Un atacante con wallet propia (firma SIWE válida) puede difundir tx triviales o inválidas para obtener ventanas de 60 s repetidas, vaciando el control pay-as-you-go.

**Evidencia.** [`requerimientos.md:16`](./requerimientos.md) (D5) · [`requerimientos.md:50`](./requerimientos.md) (RF-05) · [`requerimientos.md:59`](./requerimientos.md) (RF-09) · [`requerimientos.md:62`](./requerimientos.md) (RF-12) · [`propuesta_adaptacion.md:212-215`](./propuesta_adaptacion.md) · [`base_datos.sql:155`](./base_datos.sql) (`provisional_seconds` default 60) · [`base_datos.sql:564-569`](./base_datos.sql) (`uq_hotspot_sessions_open_mac`).

**Recomendación.** Exigir explícitamente en `RF-12`: (a) validar la tx del mempool (`from == wallet del binding`, `to == Super Token`, método `createFlow`, `receiver == payout_wallet`, `rate >= price_per_second_wei`, saldo/nonce ejecutables) antes de abrir la ventana; (b) limitar a una provisional por MAC+wallet en ventana temporal (p. ej. 1/15 min) con registro de intentos fallidos en `audit_log`; (c) revocar y marcar `devices.blocked` ante tx no ejecutable o reintentos. **Responsable:** Backend/Orquestador + Contratos · **Esfuerzo: M**

---

### H-03 · ALTA — SLA de latencia sin métrica, ventana ni población

**Detalle.** `RNF-03` promete p95 < 10 s desde "FlowDeleted/insolvencia detectada" hasta el comando de revocación, y `RNF-04` < 2 s p95 en `/session/authorize`, pero no se define el punto de medida (¿`flow_events.observed_at`? ¿`session_health_checks.checked_at`? ¿timestamp del bloque?), ni la ventana, el nº de muestras, la concurrencia, la duración o el perfil de carga. Se citan k6/autocannon sin escenario. Con health-check cada 15 s (`D9`/`RF-13`/`RNF-07`), el presupuesto observable insolvencia→corte puede llegar a ~25 s, lo que contradice la garantía *percibida* por el usuario si no se mide estrictamente desde la detección. El intervalo de 15 s solo existe en prosa y no está parametrizado en `entornos_globales.md` (solo `INDEXER_POLL_MS=4000`). El propio v1 documenta p95 ≈ 20 s y ~4 % de timeouts en el RPC académico. Se resuelve el conflicto R1/R6 como defecto de verificabilidad (el reloj del SLA sí arranca en la detección), no como contradicción literal.

**Evidencia.** [`requerimientos.md:90`](./requerimientos.md) (RNF-03) · [`requerimientos.md:91`](./requerimientos.md) (RNF-04) · [`requerimientos.md:20`](./requerimientos.md) (D9) · [`requerimientos.md:63`](./requerimientos.md) (RF-13) · [`requerimientos.md:94`](./requerimientos.md) (RNF-07) · [`entornos_globales.md:48`](./entornos_globales.md) · [`propuesta_adaptacion.md:384`](./propuesta_adaptacion.md) · [`../RepoTecnico/INFORME_OPTIMIZACION_V1.md:350`](../RepoTecnico/INFORME_OPTIMIZACION_V1.md).

**Recomendación.** Definir la métrica `revocation_command_latency_ms` con evento de inicio, ventana y nº de muestras, y el escenario de carga (muestras, concurrencia, duración, datos semilla). Parametrizar el ciclo (`HEALTHCHECK_MS`) y, si se mantiene el SLA de 10 s, separar la detección de insolvencia del ciclo periódico o degradar el objetivo por escrito asumiendo el RPC actual. Test de integración con reloj controlado. **Responsable:** SRE + Backend · **Esfuerzo: M**

---

### H-04 · ALTA — Revocación en sesión activa: reintentos, gracia y `degraded` sin cerrar

**Detalle.** `D14` fija fail-closed para sesiones nuevas y, para activas, "3 reintentos con backoff y gracia antes de marcar `degraded`", pero no especifica el schedule de backoff (retardos, jitter), el timeout por intento, la duración de la gracia ni la semántica operativa de `degraded` (¿visible al usuario?, ¿mantiene servicio?, ¿cuánto dura?, ¿qué comando lo restaura?). El esquema solo aporta `access_commands.attempts` (default 0). Además, ninguna regla exige ACK verificado del gateway para transicionar a `revoked`, ni define la cadena de fallback automática si falla UDP 3799 (CoA/PoD) o el DELETE REST: si el NAS es inalcanzable, el dispositivo sigue navegando mientras la BD solo refleja `degraded`, en tensión con `RF-11`/`RF-19` (MUST revocar) y `RNF-03`.

**Evidencia.** [`requerimientos.md:25`](./requerimientos.md) (D14) · [`requerimientos.md:75`](./requerimientos.md) (RF-20) · [`requerimientos.md:61`](./requerimientos.md) (RF-11) · [`requerimientos.md:74`](./requerimientos.md) (RF-19) · [`diccionario_datos.md:382`](./diccionario_datos.md) (`attempts` default 0) · [`diccionario_datos.md:97`](./diccionario_datos.md) (`degraded` sin semántica) · [`entornos_globales.md:39-75`](./entornos_globales.md) · [`propuesta_adaptacion.md:232-233`](./propuesta_adaptacion.md), [`:368`](./propuesta_adaptacion.md) · [`base_datos.sql:58-59`](./base_datos.sql), [`:88`](./base_datos.sql), [`:375`](./base_datos.sql).

**Recomendación.** Fijar una política numérica versionada (p. ej. 3 intentos a 1/2/4 s con jitter, timeout 2 s por intento, gracia 30 s → `degraded`, y comando/criterio de salida); definir revocación en dos vías con fallback automático (CoA/PoD ↔ REST MikroTik/address-list); exigir ACK verificado para pasar a `revoked` y política explícita (corte de emergencia + alerta) sin ACK. Cubrir con Gherkin + test que verifique nº de llamadas, tiempos y transición de estado. **Responsable:** Backend + Redes/NAS · **Esfuerzo: M**

---

### H-05 · ALTA — QoS de hijos: "50 %" sin magnitud absoluta ni atributos RADIUS

**Detalle.** `RF-26` (MUST) exige aplicar el límite de cada sesión hija (50 % del padre) vía `WISPr-Bandwidth-Max-*` o rate-limit de perfil MikroTik, pero no existe en ningún artefacto un ancho de banda absoluto de referencia (Mbps/kbps) por plan, gateway o sesión padre: el único campo es `bandwidth_percent` (entero 1..100) y el único campo de plan es una etiqueta (`plan_name`), luego "50 % de qué" queda indeterminado. Además `WISPr-Bandwidth-Max-*` es un patrón, no los atributos concretos (Down/Up, unidades bps, nombre exacto en FreeRADIUS), y no hay criterio de aceptación medible ni prueba asociada. Es un RF-MUST sin forma de verificarse.

**Evidencia.** [`requerimientos.md:81`](./requerimientos.md) (RF-26) · [`requerimientos.md:80`](./requerimientos.md) (RF-25) · [`diccionario_datos.md:262`](./diccionario_datos.md) (`bandwidth_percent` default 100) · [`diccionario_datos.md:486`](./diccionario_datos.md) (default 50) · [`diccionario_datos.md:483`](./diccionario_datos.md) (`plan_name`) · [`base_datos.sql:265`](./base_datos.sql), [`:422`](./base_datos.sql), [`:656`](./base_datos.sql), [`:668`](./base_datos.sql).

**Recomendación.** Definir el ancho de banda base por tarifa/gateway (campo dedicado) y la conversión exacta a atributos RADIUS (`WISPr-Bandwidth-Max-Down`/`-Up` en bps) y a `rate-limit` MikroTik; añadir test contra el mock RADIUS que verifique los valores absolutos enviados. **Responsable:** Backend/RADIUS + DDL · **Esfuerzo: M**

---

### H-06 · ALTA — Consistencia documental: conteos, referencias y cierre de Fase 1

**Detalle.** `estado_proyecto.md` declara "25 RF + 16 RNF + 12 RT + decisiones D1–D18" y "entrevista P1–P9", mientras `requerimientos.md` define RF-01…RF-27 y D1–D19 (P1–P13) y `propuesta_adaptacion.md` afirma "27 RF … 19 decisiones D1–D19". El mismo documento dice dos veces "14 enums" cuando su propia tabla y `README.md` dicen 16, y el SQL tiene 16 `CREATE TYPE`. No es errata aislada: es arrastre de la revisión v1.1 (el changelog del SQL documenta 14 enums en v1.1 y 16 en v1.2) e invalida la afirmación de artefactos "validados por script". Se añaden referencias cruzadas erróneas: `propuesta_adaptacion.md:105` cita "RNF-10" como lista de eventos cuando RNF-10 es seguridad de la API (los eventos son RF-07); `:320` cita "decisión D1" para el token cuando D1 es la red destino (el token es D2); y `:341-345` reetiqueta rangos RF desalineados.

**Evidencia.** [`estado_proyecto.md:24`](./estado_proyecto.md), [`:26`](./estado_proyecto.md), [`:31`](./estado_proyecto.md), [`:35`](./estado_proyecto.md), [`:39`](./estado_proyecto.md), [`:92`](./estado_proyecto.md) · [`requerimientos.md:5`](./requerimientos.md), [`:82`](./requerimientos.md), [`:97`](./requerimientos.md) · [`propuesta_adaptacion.md:105`](./propuesta_adaptacion.md), [`:320`](./propuesta_adaptacion.md), [`:337`](./propuesta_adaptacion.md), [`:341-345`](./propuesta_adaptacion.md) · [`README.md:19`](./README.md), [`:22`](./README.md) · [`base_datos.sql:22-27`](./base_datos.sql) · conteo directo: 27 RF, 16 RNF, 12 RT, D1–D19, 16 enums, 20 tablas · `tools/` sin validador de artefactos SFhostpot.

**Recomendación.** Actualizar `estado_proyecto.md` a 27 RF, 16 RNF, 12 RT, D1–D19, P1–P13 y 16 enums; corregir las citas (RNF-10→RF-07, D1→D2) y los rangos RF; añadir a `SFhostpot/` el script validador de conteos/referencias cruzadas y ejecutarlo en el CI documental, con su salida adjunta al cierre de fase. **Responsable:** PM/Documentación + QA · **Esfuerzo: S**

---

### H-07 · ALTA — Sin backup, PITR, RTO/RPO ni prueba de restauración

**Detalle.** PostgreSQL/Cloud SQL concentra el estado operativo completo (`portal_sessions`, `device_bindings`, `hotspot_sessions`, `access_commands`, `audit_log`, `flow_events`, `vouchers` y accounting RADIUS con MAC/IP, datos personales). Ningún RNF fija backup automático, PITR, retención de copias, RTO/RPO ni prueba de restauración, y la categoría ISO 25010 de recuperabilidad queda sin cubrir. `entornos_globales.md` describe Cloud SQL con IP privada pero no declara HA, réplica ni backup; un fallo de BD convierte el fail-closed de D14 en indisponibilidad total, en tensión directa con RNF-08. Verificado: grep de `backup|respaldo|restore|RTO|RPO|disaster|point-in-time|PITR` = 0 coincidencias en los 8 documentos.

**Evidencia.** [`requerimientos.md:84-103`](./requerimientos.md) (16 RNF, ninguno de backup) · [`entornos_globales.md:155-169`](./entornos_globales.md) · [`estado_proyecto.md:82-83`](./estado_proyecto.md), [`:103-107`](./estado_proyecto.md) · [`requerimientos.md:25`](./requerimientos.md) (D14), [`:95`](./requerimientos.md) (RNF-08).

**Recomendación.** Añadir un RNF de recuperación con criterio verificable (backup automático + retención, PITR, RTO/RPO objetivo y prueba de restauración periódica documentada); declarar arquitectura de disponibilidad (Cloud SQL HA + backups/PITR) y reformular RNF-08 por escenarios (chain, gateway, BD). Reflejarlo en `entornos_globales.md` y en los criterios de cierre. **Responsable:** SRE/Infra · **Esfuerzo: M**

---

### H-08 · ALTA — Shared secret RADIUS en claro contra RNF-02

**Detalle.** `base_datos.sql` afirma "Sin credenciales ni secretos: los secretos se referencian (`mgmt_secret_ref`, `radius_secret_ref`)" y `gateways` usa esos campos, pero `nas` define `secret text NOT NULL` en claro y sin sufijo `_ref`, y el diccionario lo asume literalmente como shared secret. `entornos_globales.md` se contradice: lista "referencia en `gateways.radius_secret_ref` / `nas.secret`", tratando `nas.secret` como referencia pese a que DDL y diccionario lo declaran secreto en claro. Adicionalmente `radcheck.value` persiste `Cleartext-Password` con `username = MAC`. Quien lea la BD obtiene material de autenticación del gateway/NAS. Incumple `RNF-02`.

**Evidencia.** [`base_datos.sql:12-13`](./base_datos.sql), [`:130-132`](./base_datos.sql), [`:173`](./base_datos.sql), [`:462-469`](./base_datos.sql) · [`diccionario_datos.md:167`](./diccionario_datos.md), [`:423-427`](./diccionario_datos.md) · [`entornos_globales.md:100-101`](./entornos_globales.md) · [`requerimientos.md:89`](./requerimientos.md) (RNF-02).

**Recomendación.** Sustituir `nas.secret` por `secret_ref` a Secret Manager (o cifrado de columna con KMS) o acotar formalmente la excepción; alinear los tres artefactos de datos con `entornos_globales.md`; documentar rotación y RadSec; y sustituir la autenticación basada solo en MAC por credenciales de corta vida o MAB con listas de puerto. Añadir verificación de secretos al CI. **Responsable:** Seguridad + Infra/FreeRADIUS · **Esfuerzo: M**

---

### H-09 · ALTA — Retención RGPD sin TTL ni purga, con FK `RESTRICT` que la obstaculiza

**Detalle.** `D10`/`RNF-12` y P7 prometen retención configurable de 30 días "con borrado automático" y "supresión por diseño", pero el esquema no contiene TTL, columna de caducidad, particionado ni job de purga, y los datos personales (MAC/IP, wallet, `user_agent`) se acumulan sin límite en `devices`, `portal_sessions`, `device_bindings`, `hotspot_sessions`, `voucher_redemptions`, `radacct` y `audit_log`. Además, `hotspot_sessions.portal_session_id` es `ON DELETE RESTRICT`: borrar una `portal_session` para atender el derecho de supresión falla mientras exista una sesión asociada; `radacct` y `devices` no tienen FK que guíe un borrado ordenado y no se documenta procedimiento. El borrado es factible en orden de dependencias, pero ningún mecanismo lo hace cumplir.

**Evidencia.** [`requerimientos.md:21`](./requerimientos.md) (D10), [`:99`](./requerimientos.md) (RNF-12) · [`propuesta_adaptacion.md:387`](./propuesta_adaptacion.md), [`:453-454`](./propuesta_adaptacion.md) · [`base_datos.sql:258`](./base_datos.sql) (FK RESTRICT), [`:185-196`](./base_datos.sql), [`:397-407`](./base_datos.sql), [`:482-507`](./base_datos.sql).

**Recomendación.** Concretar en RNF-12 el mecanismo (job `pg_cron`/orquestador, ventana configurable, auditoría del borrado), columnas/índices de expiración por entidad y procedimiento que resuelva la FK `RESTRICT` (anonimizar MAC/IP en lugar de borrar la fila, o borrado en orden dentro de transacción). Añadir test de purga a 30 días y de atención de un derecho de supresión. **Responsable:** DPO/Cumplimiento + DDL · **Esfuerzo: L**

---

### H-10 · ALTA — RPC único sin failover

**Detalle.** `RT-02` fija un único `RPC_URL` (Besu Codecrypto académico) y `entornos_globales.md` lo repite para orquestador, portal y contratos. Grep sobre `SFhostpot/` confirma 0 coincidencias de `RPC_URLS`, failover o SLA de proveedor. La única mitigación documentada es "Backoff/recuperación heredado de `polling.ts`; margen de gracia", que reintenta contra el mismo endpoint y no cubre su caída. Sobre esta base, v1 midió p90 4,45 s, p95 20,01 s, 3,5–4,2 % de timeouts y 47,9 % de fallos con concurrencia 8, y su recomendación de `RPC_URLS` + 3 reintentos + timeout duro de 8 s no se traslada a ningún RT/RNF. Si el RPC cae o degrada, el indexador se atasca (RF-07), el health-check falla (RF-13) y RNF-08 no tiene mecanismo verificable.

**Evidencia.** [`entornos_globales.md:44`](./entornos_globales.md), [`:81`](./entornos_globales.md), [`:90`](./entornos_globales.md) · [`requerimientos.md:110`](./requerimientos.md) (RT-02), [`:95`](./requerimientos.md) (RNF-08) · [`propuesta_adaptacion.md:384`](./propuesta_adaptacion.md) · [`../RepoTecnico/INFORME_OPTIMIZACION_V1.md:350`](../RepoTecnico/INFORME_OPTIMIZACION_V1.md), [`:357`](../RepoTecnico/INFORME_OPTIMIZACION_V1.md).

**Recomendación.** Convertir la resiliencia del RPC en requisito verificable: `RPC_URLS` como lista (primario + secundario gestionado), timeout duro, 3 reintentos con backoff+jitter, guarda anti-solapamiento y monotonicidad por `blockNumber`; obtener SLA escrito del proveedor o desplegar nodo propio; limitar `eth_getLogs` a ventanas ≤ 5 000 bloques; usar la disponibilidad del RPC como criterio medible de RNF-08. **Responsable:** Infra/SRE + Backend · **Esfuerzo: L**

---

### H-11 · ALTA — Modelo de ejecución de los procesos de fondo sin definir

**Detalle.** (a) La arquitectura asume procesos permanentemente vivos —polling del índice cada 4 s (`INDEXER_POLL_MS`), health-check cada 15 s y caducidad provisional a 60 s— pero el despliegue es Cloud Run y grep no encuentra `min-instances`, CPU always-allocated, worker pool, Cloud Scheduler ni Jobs: sin ellos el servicio escala a cero y la CPU se retira al acabar la petición. (b) En el lado opuesto, `indexer_checkpoints` solo tiene `(chain_id, contract_address, last_processed_block, last_processed_log_index, updated_at)`, sin propietario, lease ni `version`: si Cloud Run ejecuta dos instancias, ambas pueden leer el mismo checkpoint y avanzar en paralelo. La UK `(chain_id, tx_hash, log_index)` evita duplicados pero no huecos, comprometiendo RNF-05 ("100 % de los eventos sin huecos") y con ello revocaciones y autorizaciones.

**Evidencia.** [`entornos_globales.md:48`](./entornos_globales.md), [`:154-158`](./entornos_globales.md) · [`propuesta_adaptacion.md:218`](./propuesta_adaptacion.md) · [`base_datos.sql:348-357`](./base_datos.sql) · [`requerimientos.md:92`](./requerimientos.md) (RNF-05) · [`estado_proyecto.md:57`](./estado_proyecto.md).

**Recomendación.** Fijar el modo de ejecución: indexador y reconciliación en worker/Job dedicado con `min-instances ≥ 1` y CPU always-allocated (o Cloud Scheduler + Cloud Run Job periódico) y barrido de provisionales vencidas independiente de la memoria de instancia; añadir a `indexer_checkpoints` columnas de lease (`locked_by`, `locked_until`, `version`) con `WHERE version = :v`, o advisory lock/líder único; documentar el rango máximo de `eth_getLogs` (≤ 5 000 bloques). **Responsable:** Infra + Backend · **Esfuerzo: L**

---

### H-12 · ALTA — El binding SIWE no impide la suplantación de MAC

**Detalle.** `D6`/`RF-17` presentan el binding (wallet, MAC, IP, token) como anti-suplantación, pero el alcance excluye explícitamente 802.1X/agente (P8) y la autorización real del gateway es por MAC/IP (`Calling-Station-Id` en RADIUS; hotspot active en MikroTik). Un tercer dispositivo que copie MAC e IP de un cliente ya autorizado hereda la sesión sin wallet ni firma; el binding solo evita que otra wallet reclame una MAC, no autentica criptográficamente al dispositivo. El índice único de binding activo por MAC no bloquea al suplantador porque este no crea binding nuevo: reutiliza el flujo de red ya permitido. Los documentos reconocen "MAC spoofing" como riesgo pero no cuantifican el residuo ni definen detección.

**Evidencia.** [`requerimientos.md:17`](./requerimientos.md) (D6), [`:72`](./requerimientos.md) (RF-17), [`:162`](./requerimientos.md) (P8 sin 802.1X) · [`propuesta_adaptacion.md:235`](./propuesta_adaptacion.md), [`:382`](./propuesta_adaptacion.md) · [`diccionario_datos.md:244-246`](./diccionario_datos.md) · [`base_datos.sql:564-566`](./base_datos.sql).

**Recomendación.** Documentar el residuo "MAC spoofing en la WLAN" con impacto y aceptarlo como limitación de v1 (sin 802.1X); añadir mitigaciones verificables en RF-17 (detección de MAC duplicada/cambio de puerto en el NAS, DHCP snooping/port-security, revocación ante doble sesión, métrica de intentos rechazados). **Responsable:** Redes + Seguridad · **Esfuerzo: L**

---

### H-13 · ALTA — `pauseFlow` conserva `flowRate > 0`

**Detalle.** `RF-11` revoca al detectar `FlowDeleted`, `flowRate = 0` o insolvencia, y `RF-13` valida solvencia con `virtualBalanceOf`. En el contrato reutilizado, `pauseFlow` NO pone `f.flowRate` a 0: solo cambia status a Paused; `getFlow` devuelve el `flowRate` nominal positivo y `virtualBalanceOf` solo descuenta el tramo vivo cuando `status == Active`, de modo que una cuenta pausada deja de devengar y puede seguir pareciendo solvente. La única salvaguarda es que el indexador normalice `FlowPaused → flow_updated(rate=0)`, pero la fuente de verdad on-chain no cumple esa premisa: si el validador o el health-check confían en el rate nominal en lugar de exigir `status == Active`, un usuario puede pausar su propio stream y consumir gratis sin que la insolvencia se dispare.

**Evidencia.** [`requerimientos.md:59`](./requerimientos.md) (RF-09), [`:61`](./requerimientos.md) (RF-11) · [`propuesta_adaptacion.md:107-108`](./propuesta_adaptacion.md) · [`diccionario_datos.md:49-52`](./diccionario_datos.md), [`:76-78`](./diccionario_datos.md) · `sc/src/EuroX.sol:149-156`, `:297-308`, `:320-333`.

**Recomendación.** Exigir en RF-09/RF-13 que autorización y health-check validen `status == Active` (y rate efectivo > 0) y nunca el `flowRate` nominal; documentar `FlowPaused` como rate efectivo 0; añadir test de integración que pause el flow y compruebe la desconexión. **Responsable:** Contratos + Backend · **Esfuerzo: L**

---

### H-14 · ALTA — El huésped sin wallet no figura como stakeholder

**Detalle.** `D18`/`RF-25` crean explícitamente un segundo tipo de usuario final SIN wallet: hasta 2 hijos por voucher. §4.1 solo reconoce al "Usuario final (cliente WiFi) | visitante con wallet", de modo que esa clase de actor queda fuera del registro. El hijo abre el portal y teclea un código; el modelo asigna su `wallet_address` a la del padre como "wallet responsable", por lo que no es parte del contrato del padre. Sus MAC/IP se procesan en `portal_sessions`/`device_bindings`/`hotspot_sessions` y la retención RGPD de 30 días se declara no opcional. La calificación jurídica (p. ej. minoría de edad) queda marcada como "necesita verificación legal"; el núcleo verificado es un actor real con PII tratada sin rol, aviso ni vía de derechos propio.

**Evidencia.** [`requerimientos.md:137`](./requerimientos.md), [`:29`](./requerimientos.md) (D18), [`:80`](./requerimientos.md) (RF-25), [`:21`](./requerimientos.md) · [`propuesta_adaptacion.md:257`](./propuesta_adaptacion.md) · [`diccionario_datos.md:291-292`](./diccionario_datos.md) · [`estado_proyecto.md:109`](./estado_proyecto.md) · grep `menor|tutor|edad` = 0 coincidencias relevantes.

**Recomendación.** Añadir a §4.1 el rol "Huésped sin wallet (hijo de voucher)" con responsable designado; definir en el portal un aviso de privacidad propio del hijo y la base jurídica aplicable (interés legítimo/consentimiento del titular o tutor) y una condición explícita sobre minoría de edad; reflejarlo como caso de uso con actor propio (Fase 2) y trazarlo a RNF-12. **Responsable:** PM/Director + DPO · **Esfuerzo: M**

---

### 5.1 Hallazgos MEDIA y BAJA — evidencia y recomendación

| ID | Evidencia principal | Recomendación |
|----|---------------------|---------------|
| **H-15** | [`requerimientos.md:95`](./requerimientos.md) (RNF-08); [`estado_proyecto.md:32`](./estado_proyecto.md); [`propuesta_adaptacion.md:403`](./propuesta_adaptacion.md) | Fijar SLO: ventana (p. ej. 30 días), definición de éxito, fuente (Cloud Monitoring) y error budget; o rebajar a objetivo no bloqueante documentado. **SRE/PM · S** |
| **H-16** | [`requerimientos.md:92`](./requerimientos.md) (RNF-05); [`diccionario_datos.md:311`](./diccionario_datos.md), [`:321`](./diccionario_datos.md), [`:353-364`](./diccionario_datos.md); [`base_datos.sql:318`](./base_datos.sql) | Fijar N confirmaciones; documentar reorg (rebobinado a `block_number - N` y deduplicación); test con reorg simulado comparando conteos esperados vs. procesados. **Arquitecto de datos · S** |
| **H-17** | [`requerimientos.md:96`](./requerimientos.md), [`:120`](./requerimientos.md); [`propuesta_adaptacion.md:418`](./propuesta_adaptacion.md); grep `alert|alerta|on-call` = 0 | Nombrar métricas/dashboards con umbral y alerta, SLO/MTTR, retención de logs y runbook de incidentes como entregable de Fase 1. **SRE · M** |
| **H-18** | [`requerimientos.md:98`](./requerimientos.md), [`:102`](./requerimientos.md), [`:88`](./requerimientos.md) | Desglosar RNF-11: cobertura mínima, lint/tipado estricto, análisis estático del orquestador, contrato de API versionado y revisión de código, cada uno mapeado a CI. **Arquitecto · M** |
| **H-19** | [`requerimientos.md:100`](./requerimientos.md), [`:51`](./requerimientos.md); [`propuesta_adaptacion.md:116`](./propuesta_adaptacion.md), [`:429`](./propuesta_adaptacion.md); grep `i18n|navegador` = 0 | Fijar alcance (páginas y estados), umbral 0 violaciones axe A/AA, checklist manual WCAG, i18n es/en y matriz de navegadores con pruebas E2E. **Frontend · M** |
| **H-20** | [`requerimientos.md:80`](./requerimientos.md); [`diccionario_datos.md:106`](./diccionario_datos.md), [`:484-485`](./diccionario_datos.md), [`:509-511`](./diccionario_datos.md); [`base_datos.sql:90-92`](./base_datos.sql), [`:421-443`](./base_datos.sql) | Canje como transacción atómica (`UPDATE … WHERE children_used < max_children RETURNING` o `SELECT … FOR UPDATE`); definir transición a `redeemed` al agotar cupo (o añadir `exhausted`); test de concurrencia. **Backend + DDL · M** |
| **H-21** | [`diccionario_datos.md:241-242`](./diccionario_datos.md); [`base_datos.sql:243-248`](./base_datos.sql); [`diagrama_er.md:228-233`](./diagrama_er.md) | Endurecer el CHECK a exclusión mutua estricta; si el hijo conserva la wallet responsable, modelarlo en columna separada y reflejarlo en diccionario y ER. **DDL · S** |
| **H-22** | [`propuesta_adaptacion.md:83-84`](./propuesta_adaptacion.md), [`:331`](./propuesta_adaptacion.md), [`:401`](./propuesta_adaptacion.md), [`:434`](./propuesta_adaptacion.md); [`estado_proyecto.md:3`](./estado_proyecto.md), [`:94`](./estado_proyecto.md) | Marcar `[x]` el criterio §6.3, corregir §2.3 a D1–D19, actualizar la dependencia de Fase 2 y decidir si el criterio repositorio/credenciales es bloqueante. **PM · S** |
| **H-23** | [`entornos_globales.md:87-93`](./entornos_globales.md), [`:117`](./entornos_globales.md), [`:129-141`](./entornos_globales.md); [`propuesta_adaptacion.md:373`](./propuesta_adaptacion.md), [`:425-427`](./propuesta_adaptacion.md) | Reescribir las rutas sobre la estructura `sfh-*`; sustituir "reutiliza entorno de v1" por "referencia de lectura"; marcar variables dependientes del repo nuevo como bloqueadas hasta Fase 3. **Infra/DevOps · S** |
| **H-24** | [`base_datos.sql:127`](./base_datos.sql), [`:153`](./base_datos.sql), [`:645`](./base_datos.sql); [`diccionario_datos.md:125`](./diccionario_datos.md), [`:148`](./diccionario_datos.md); [`requerimientos.md:23`](./requerimientos.md), [`:50`](./requerimientos.md); [`diagrama_er.md:638`](./diagrama_er.md) | Fijar autoridad única: eliminar `gateways.payout_wallet` (o dejarlo como default); documentar que prevalece la tarifa; trigger/constraint de coherencia; alinear RF-05. **DDL · S** |
| **H-25** | [`requerimientos.md:90-91`](./requerimientos.md), [`:22`](./requerimientos.md) (D11); [`propuesta_adaptacion.md:403`](./propuesta_adaptacion.md); [`../RepoTecnico/INFORME_OPTIMIZACION_V1.md:350`](../RepoTecnico/INFORME_OPTIMIZACION_V1.md) | Fijar objetivos de capacidad (sesiones concurrentes, sesiones/gateway, QPS, conexiones máximas a Postgres), dimensionar pool/polling y añadir prueba de carga k6 con población realista. **SRE + QA · L** |
| **H-26** | [`requerimientos.md:70`](./requerimientos.md), [`:97`](./requerimientos.md), [`:171`](./requerimientos.md); [`base_datos.sql:383-407`](./base_datos.sql); [`diccionario_datos.md:388-401`](./diccionario_datos.md) | Especificar OIDC de operadores o mTLS + sesiones cortas con refresh/revocación; MFA obligatorio para admin; matriz de permisos; rate-limit y bloqueo por intentos; registrar login y emisión/revocación de vouchers en `audit_log`. **Seguridad · M** |
| **H-27** | [`requerimientos.md:88`](./requerimientos.md); [`propuesta_adaptacion.md:94`](./propuesta_adaptacion.md); `sc/src/EuroX.sol:84-91`; `../RepoTecnico/pruebas/slither.log` | Añadir `ReentrancyGuard` de OpenZeppelin o reordenar `upgradeTo` a effects-before-interactions; documentar el threat model; re-ejecutar Slither + fuzz sobre el contrato renombrado antes de beta. **Contratos · L** |
| **H-28** | [`requerimientos.md:18`](./requerimientos.md), [`:21`](./requerimientos.md), [`:99`](./requerimientos.md); [`base_datos.sql:199-228`](./base_datos.sql), [`:311-330`](./base_datos.sql), [`:397-407`](./base_datos.sql); [`entornos_globales.md:53-55`](./entornos_globales.md) | Ampliar el inventario de PII (wallet, `user_agent`, firma SIWE) con base legal y plazo; valorar EIPD por seguimiento sistemático de MAC; minimizar fingerprinting y cifrar/enmascarar logs; cookie `Secure`+`SameSite`, CSRF y rotación de `JWT_SECRET`. **DPO + Backend · M** |
| **H-29** | [`requerimientos.md:71`](./requerimientos.md), [`:79`](./requerimientos.md), [`:133-141`](./requerimientos.md); [`diccionario_datos.md:506-513`](./diccionario_datos.md) | Nombrar rol de Soporte/atención al usuario final y RF con canal, horario y escalado; política de reemisión de vouchers y vía de reclamación por corte indebido; modelar tabla de incidencias o declarar canal externo. **PM · M** |
| **H-30** | [`requerimientos.md:141`](./requerimientos.md), [`:136`](./requerimientos.md), [`:99`](./requerimientos.md); grep `asesor|abogad|juridic` = 0 (salvo `@audita`); [`propuesta_adaptacion.md:387`](./propuesta_adaptacion.md) | Separar el rol DPO/cumplimiento del operador explotador (persona distinta o asesoría externa); asignarle la "revisión legal documentada" de RNF-12 y el procedimiento de derechos del interesado. **Director/PM · M** |
| **H-31** | [`requerimientos.md:135`](./requerimientos.md), [`:168`](./requerimientos.md); [`diccionario_datos.md:26`](./diccionario_datos.md); [`entornos_globales.md:92-103`](./entornos_globales.md); [`propuesta_adaptacion.md:385`](./propuesta_adaptacion.md), [`:462-463`](./propuesta_adaptacion.md) | Nombrar custodio de claves distinto del director y separar funciones (deployer ≠ owner; multisig/timelock); procedimiento documentado de backup, rotación y recuperación con criterio de prueba. **Director + Seguridad · L** |
| **H-32** | [`diccionario_datos.md:186`](./diccionario_datos.md); [`base_datos.sql:193`](./base_datos.sql); [`requerimientos.md:133-141`](./requerimientos.md); grep `moderac|denuncia` sin definición de procedimiento | Añadir rol de moderación/abuso y RF con causales de bloqueo, plazos, registro en `audit_log` y vía de apelación del huésped. **PM + Seguridad · M** |
| **H-33** | [`requerimientos.md:73`](./requerimientos.md), [`:140`](./requerimientos.md); [`diccionario_datos.md:104`](./diccionario_datos.md), [`:403-415`](./diccionario_datos.md); [`base_datos.sql:85`](./base_datos.sql) | Añadir roles RBAC `auditor` y `dpo` (solo lectura sobre `audit_log` y metadatos), designar responsable de revisión periódica y documentar retención; incluirlo en RNF-09/RNF-12. **Seguridad + DPO · M** |
| **H-34** | [`requerimientos.md:89`](./requerimientos.md) (RNF-02), [`:103`](./requerimientos.md) (RNF-16); [`propuesta_adaptacion.md:430`](./propuesta_adaptacion.md) | Especificar herramienta (gitleaks/trufflehog), patrones/rutas y condición de fallo en CI; definir el catálogo `RE-xx` o retirar la convención. **Seguridad · S** |
| **H-35** | [`README.md:22`](./README.md); [`base_datos.sql:17-31`](./base_datos.sql), [`:117-482`](./base_datos.sql), [`:447-455`](./base_datos.sql); [`estado_proyecto.md:91`](./estado_proyecto.md) | Rebajar a "diseñado para idempotencia en base vacía; pendiente de verificación"; usar migraciones versionadas con `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. **DDL/Infra · S** |
| **H-36** | [`propuesta_adaptacion.md:396-418`](./propuesta_adaptacion.md); [`estado_proyecto.md:81-83`](./estado_proyecto.md), [`:96-101`](./estado_proyecto.md); [`requerimientos.md:90-91`](./requerimientos.md), [`:95`](./requerimientos.md) | Añadir fecha objetivo y propietario por fase/hito; fijar ventana de medida a RNF-03/04/08 y definición de "periodo beta"; vincular la creación del repositorio a una fecha de Fase 3. **PM · S** |
| **H-37** | [`diagrama_er.md:15`](./diagrama_er.md), [`:235`](./diagrama_er.md), [`:279-289`](./diagrama_er.md), [`:538-542`](./diagrama_er.md); [`diccionario_datos.md:553`](./diccionario_datos.md); [`base_datos.sql:167-178`](./base_datos.sql) | **Conflicto R2/R3 resuelto:** la ausencia de FK se confirma como decisión documentada (relación conceptual). Se mantiene solo la duplicación de NAS: unificar NAS en una sola definición del ER y explicitar que el vínculo gateway↔NAS es por `radius_nas_ip`. **Arquitecto de datos · S** |
| **H-38** | [`propuesta_adaptacion.md:392`](./propuesta_adaptacion.md); [`requerimientos.md:97`](./requerimientos.md), [`:171`](./requerimientos.md); [`base_datos.sql:433-443`](./base_datos.sql); [`estado_proyecto.md:113`](./estado_proyecto.md) | Añadir RNF de rate-limit de canje (N intentos por ventana/IP y bloqueo temporal), tabla/contador de intentos fallidos y alerta/auditoría, enlazado a RF-25. **Seguridad + Backend · M** |

---

## 6. RNF faltantes

Estas carencias derivan de los hallazgos verificados y de la revisión de completitud ISO 25010 (R3). No son hallazgos nuevos: son la lectura "por requisito" de H-07, H-09, H-15, H-17, H-18, H-19, H-25, H-26, H-28, H-38.

| Categoría ISO 25010 | RNF ausente / incompleto | Hallazgo origen |
|---------------------|--------------------------|-----------------|
| **Recuperabilidad** | Backup automático, PITR, retención de copias, RTO/RPO y prueba de restauración | H-07 |
| **Cumplimiento (RGPD)** | Mecanismo de purga/TTL y borrado verificable; base legal por campo; EIPD | H-09, H-28 |
| **Fiabilidad** | Redundancia/failover de RPC, circuit breaker, timeouts y fail-closed ante indisponibilidad de chain/BD | H-10, H-07 |
| **Eficiencia de desempeño** | Objetivos de capacidad: sesiones concurrentes, throughput, conexiones a Postgres, latencia bajo carga | H-25, H-03 |
| **Mantenibilidad** | Cobertura mínima, lint/tipado estricto, análisis estático del orquestador, contrato de API versionado | H-18 |
| **Usabilidad** | Métricas de tarea para usuario WiFi no técnico (p. ej. conexión < 60 s y ≤ 2 pantallas) | H-19 |
| **Compatibilidad** | Matriz de navegadores/SO del portal cautivo e i18n es/en | H-19 |
| **Accesibilidad** | Subconjunto WCAG 2.1 AA, umbral (0 violaciones axe A/AA) y checklist manual | H-19 |
| **Observabilidad operativa** | Métricas nombradas con umbrales, reglas de alerta, escalado/on-call, retención de logs, SLO/MTTR y runbook | H-17, H-15 |
| **Seguridad** | Autenticación de API admin con MFA, bloqueo por intentos y login auditado; gestión de secretos RADIUS por referencia; reentrancia verificada en contratos | H-08, H-26, H-27 |
| **Seguridad (anti-abuso)** | Rate-limit y contador de intentos fallidos del canje de vouchers | H-38 |
| **Disponibilidad** | SLO con ventana, alcance y fuente de medida (99,5 % hoy no es refutable) | H-15, H-07 |

---

## 7. Stakeholders faltantes

Derivados de la revisión R4 (verificados). Se indica el hallazgo y la carencia concreta.

| Stakeholder / rol | Carencia verificada | Hallazgo |
|-------------------|---------------------|----------|
| **Huésped sin wallet (hijo por voucher)** | Actor real con MAC/IP tratados que no figura en §4.1; sin aviso de privacidad ni vía de derechos propia | H-14 |
| **Soporte / atención al usuario final** | Sin rol, canal, horario ni escalado; sin política de reemisión de vouchers ni reclamación por corte indebido | H-29 |
| **DPO / cumplimiento independiente** | RNF-12 exige "revisión legal documentada" sin dueño; el rol de protección de datos se auto-asigna al operador explotador | H-30 |
| **Custodio de claves (separado del Director)** | Custodia y mint concentrados en el titular/owner sin separación de funciones ni procedimiento de backup/rotación de claves de contrato | H-31 |
| **Moderación / abuso** | `devices.blocked` existe sin rol, causales, plazo ni apelación | H-32 |
| **Auditoría operativa independiente** | RBAC solo `admin\|operator\|readonly`; sin rol `auditor`/`dpo`; `audit_log` sin responsable de revisión ni política de retención | H-33 |

*Nota:* el operador de red (CodeCrypto), el receptor del pago y el usuario final con wallet sí están cubiertos en §4.1 de [`requerimientos.md`](./requerimientos.md); no se han añadido como faltantes.

---

## 8. Plan de acción

Los responsables son sugeridos (roles, no personas concretas). Esfuerzo: **S** ≤ 1 día · **M** 1 sprint · **L** varios sprints (Fase 3–4).

### 8.1 Quick wins (S · completables en menos de un día, sin código)

| # | Acción | Hallazgos | Responsable | Esf. |
|---|--------|-----------|-------------|------|
| QW-1 | Corregir `estado_proyecto.md` (27 RF, D1–D19, P1–P13, 16 enums) y las referencias cruzadas erróneas de `propuesta_adaptacion.md`; marcar §6.3 y decidir el criterio de credenciales | H-06, H-22 | PM/Docs | S |
| QW-2 | Añadir a `SFhostpot/` el script validador de conteos/coherencia y ejecutarlo en CI documental; adjuntar su salida al cierre de fase | H-06 | QA/Docs | S |
| QW-3 | Fijar N confirmaciones y política de reorg en RNF-05/RF-13 | H-16 | Arquitecto de datos | S |
| QW-4 | Definir SLO de RNF-08: ventana, alcance, fuente y error budget | H-15 | PM/SRE | S |
| QW-5 | Cerrar alcance WCAG 2.1 AA, umbral axe e i18n/matriz de navegadores | H-19 | Frontend | S |
| QW-6 | Especificar patrones/rutas/herramientas de los "grep" de RNF-02/RNF-16 y definir o retirar `RE-xx` | H-34 | Seguridad | S |
| QW-7 | Endurecer `chk_device_bindings_owner` a exclusión mutua estricta | H-21 | DDL | S |
| QW-8 | Fijar autoridad única de `payout_wallet` y alinear RF-05 | H-24 | DDL | S |
| QW-9 | Reescribir rutas de `entornos_globales.md` sobre estructura `sfh-*` | H-23 | Infra | S |
| QW-10 | Añadir fecha objetivo y propietario a la hoja de ruta e hitos H1–H6 | H-36 | PM | S |
| QW-11 | Rebajar el claim de idempotencia del SQL a "pendiente de verificación" | H-35 | DDL/Infra | S |
| QW-12 | Unificar la definición de NAS en el ER | H-37 | Arquitecto de datos | S |

### 8.2 Mejoras (M · corrigen los criterios que bloquean Fase 3)

| # | Acción | Hallazgos | Responsable | Esf. |
|---|--------|-----------|-------------|------|
| M-1 | Fijar el predicado exacto de solvencia, alinear `buffer_seconds` a 4 h y definir convención de `virtualBalanceOf`; tests de frontera | H-01 | Arquitecto + Contratos | M |
| M-2 | Exigir validación de la tx provisional y cuota anti-reincidencia en RF-12 | H-02 | Backend + Contratos | M |
| M-3 | Definir métrica `revocation_command_latency_ms`, escenario de carga y parametrizar `HEALTHCHECK_MS` | H-03 | SRE + Backend | M |
| M-4 | Fijar política numérica de reintentos/backoff/gracia/`degraded`, fallback CoA↔REST y ACK verificado | H-04 | Backend + Redes | M |
| M-5 | Definir ancho de banda base por tarifa y conversión exacta a `WISPr-Bandwidth-Max-*`/`rate-limit`; test contra mock RADIUS | H-05 | Backend/RADIUS + DDL | M |
| M-6 | Especificar backup/PITR/RTO/RPO y prueba de restauración; reformular RNF-08 por escenarios | H-07 | SRE | M |
| M-7 | Resolver secretos RADIUS por referencia/cifrado y alinear los tres artefactos | H-08 | Seguridad + Infra | M |
| M-8 | Concretar mecanismo de purga RGPD, columnas de expiración y procedimiento ante la FK `RESTRICT`; test de supresión | H-09 | DPO + DDL | M |
| M-9 | Añadir el rol "Huésped sin wallet" con aviso de privacidad y base jurídica | H-14 | PM + DPO | M |
| M-10 | Nombrar métricas/dashboards con umbral, alertas, SLO/MTTR y runbook | H-17 | SRE | M |
| M-11 | Desglosar RNF-11 en criterios medibles ligados a CI | H-18 | Arquitecto | M |
| M-12 | Canje atómico de voucher y transición de estado coherente con `max_children`; test de concurrencia | H-20 | Backend + DDL | M |
| M-13 | Especificar autenticación del API admin (OIDC/mTLS), MFA y auditoría de login | H-26 | Seguridad | M |
| M-14 | Ampliar inventario de PII, valorar EIPD y documentar CSRF/SameSite/rotación de JWT | H-28 | DPO + Backend | M |
| M-15 | Nombrar rol de Soporte y política de reemisión/reclamación | H-29 | PM | M |
| M-16 | Separar DPO/cumplimiento del operador y asignar la revisión legal de RNF-12 | H-30 | Director/PM | M |
| M-17 | Añadir roles de moderación con causales, plazos, registro y apelación | H-32 | PM + Seguridad | M |
| M-18 | Añadir roles RBAC `auditor` y `dpo` y responsable de revisión de `audit_log` | H-33 | Seguridad + DPO | M |
| M-19 | Añadir RNF de rate-limit y contador de intentos fallidos del canje | H-38 | Seguridad + Backend | M |

### 8.3 Roadmap (L · Fase 3–4, con criterio de aceptación)

| # | Acción | Hallazgos | Responsable | Esf. | Criterio de aceptación |
|---|--------|-----------|-------------|------|------------------------|
| R-1 | `RPC_URLS` primario/secundario, timeout duro, backoff+jitter, monoslapamiento y SLA de proveedor | H-10 | Infra + Backend | L | Caída del primario no detiene indexador ni health-check; prueba de failover documentada |
| R-2 | Modo de ejecución de procesos de fondo (worker/Job, `min-instances ≥ 1`) y lease en `indexer_checkpoints` | H-11 | Infra + Backend | L | Dos instancias concurrentes no generan huecos; test de doble ejecución |
| R-3 | Mitigaciones de MAC spoofing (doble sesión, port-security, métricas) y documentación del residuo | H-12 | Redes + Seguridad | L | Residuo cuantificado y RF-17 con detección verificable |
| R-4 | Validar `status == Active` en autorización y health-check; test de integración con `pauseFlow` | H-13 | Contratos + Backend | L | Pausar el stream provoca la desconexión |
| R-5 | Reentrancia: `ReentrancyGuard`/CEI y re-ejecución de Slither + fuzz | H-27 | Contratos | L | Slither y fuzz sin hallazgos de reentrancia en el contrato renombrado |
| R-6 | Objetivos de capacidad y prueba de carga k6 con población realista | H-25 | SRE + QA | L | RNF-03/04/07 verificados bajo la carga objetivo declarada |
| R-7 | Custodia de claves: custodio separado, multisig/timelock y procedimiento de recuperación | H-31 | Director + Seguridad | L | Deployer ≠ owner y procedimiento probado |
| R-8 | Ejecutar `base_datos.sql` contra PostgreSQL 16 (ida y vuelta con migraciones versionadas) y adjuntar la salida | H-35, H-06 | DDL/Infra | L | Script ejecuta e idempotencia verificada con evidencia |

**Criterio global de salida de "Fase 1-bis":** los 2 CRÍTICA y las 12 ALTA cerrados con evidencia enlazada; quick wins 8.1 completados; script validador en CI documental con salida adjunta; y las 16 RNF ampliadas según la sección 6 inscritas en [`requerimientos.md`](./requerimientos.md).

---

*Informe generado por síntesis de los hallazgos verificados de las 7 lentes (R1–R7). No contiene hallazgos que no estén respaldados por los informes de verificación adversarial. Los conteos de la sección 3 se verificaron por conteo directo sobre los artefactos del paquete.*
