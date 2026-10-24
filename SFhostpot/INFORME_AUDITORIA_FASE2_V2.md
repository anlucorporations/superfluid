# Informe de Auditoría de Fase 2 — V2 (verificación adversarial y síntesis)

> **Alcance:** consolidación de los hallazgos **verificados** por las lentes adversariales C1–C3
> (todas en modo solo lectura) sobre el paquete documental y de datos de `SFhostpot/`, tras la
> corrección **Fase 2-bis** ([`resolucion_auditoria_fase2.md`](resolucion_auditoria_fase2.md),
> decisiones D42–D56). No se incorpora ningún hallazgo no verificado en esta pasada.
>
> **Entradas:** [`INFORME_AUDITORIA_FASE2_V1.md`](INFORME_AUDITORIA_FASE2_V1.md) (41 hallazgos
> H2-01…H2-41), la resolución Fase 2-bis, y los artefactos vivos: [`requerimientos.md`](requerimientos.md),
> [`casos_uso.md`](casos_uso.md), [`diagramas_casos_uso.md`](diagramas_casos_uso.md),
> [`documento_tecnico.md`](documento_tecnico.md), [`base_datos.sql`](base_datos.sql),
> [`diccionario_datos.md`](diccionario_datos.md), [`diagrama_er.md`](diagrama_er.md),
> [`registro_decisiones.md`](registro_decisiones.md), [`entornos_globales.md`](entornos_globales.md),
> [`pruebas/`](pruebas/) y [`tools/validador_artefactos.py`](tools/validador_artefactos.py).
>
> **Fecha:** 2026-10-17 · **Naturaleza:** auditoría documental; no sustituye a la validación de
> implementación (Fase 3) ni a la validación con hardware/NAS real (H6).

---

## 1. Veredicto

**La Fase 2 NO puede declararse cerrada y NO es apta para el arranque de la Fase 3.**

La Fase 2-bis corrigió de forma verificable la mayor parte de los 41 hallazgos: 9 de los 10 ALTA/CRÍTICA
re-auditados cierran (H2-04, H2-05, H2-06, H2-07, H2-08, H2-10, H2-11, H2-14 y H2-16), y H2-15 queda
regenerado. Pero **persisten 1 CRÍTICA + 4 ALTA** abiertas —**V2-01** (borde `POST /v1/portal/sessions`
público y sin canal autenticado hotspot→API: H2-02/D45), **V2-02** (D42 no propagada a
`requerimientos.md`: D9/RF-13 siguen en 15 s), **V2-03** (índice único de D56 sin filtro de padre y con
definición divergente: H2-09), **V2-04** (UNIQUE plano de `voucher_redemptions` que bloquea la
reconexión de D55: H2-20) y **V2-05** (worker asíncrono de D44 sin ejecución durable)—, más 7 MEDIA
residuales y 2 BAJA.

Por el **criterio 4** de [`resolucion_auditoria_fase2.md:82-88`](resolucion_auditoria_fase2.md)
(«re-auditoría corta de verificación sin hallazgos CRÍTICA/ALTA abiertos»), el cierre no se cumple.
La resolución declaró «aplicado» D42–D56, pero la aplicación quedó incompleta y en dos casos
(D45/D56) introdujo contradicciones nuevas entre contrato, Gherkin y modelo físico. Se requiere una
**Fase 2-ter** corta centrada en los cinco bloqueos de §4 antes de generar código y tests.

> Nota de conciliación de severidades: la lente C3 graduó D45/H2-02 como **CRÍTICA**
> (suplantación remota de MAC activa + DoS de primera reclamación + contrato inejecutable) frente a
> ALTA en C1; esta síntesis retiene **CRÍTICA** por impacto y por ser el borde de seguridad que la
> resolución declaró cerrado. El resto de severidades se mantiene en el máximo verificado por C1–C3.

---

## 2. Tabla de cierre H2-01…H2-41

Leyenda: **✅ Resuelto** = cerrado con evidencia comprobada en esta pasada · **🟡 Parcial** = la
corrección existe pero queda un residuo verificado (V2-xx) · **❌ Pendiente** = el defecto original
sigue verificable · **✅†** = cerrado por la Fase 2-bis (D42–D56) **sin re-verificación línea a línea
en esta pasada** (MEDIA/BAJA, no bloqueante; sin regresión detectada).

| ID | Sev. V1 | Área | Estado | Evidencia / residuo |
|---|---|---|---|---|
| H2-01 | CRÍTICA | Ejecución / cadencia (D42) | ❌ Pendiente | D42 no se aplicó a la fuente normativa: [requerimientos.md](requerimientos.md):22 (D9 «cada 15 s») y :65 (RF-13 MUST «cada 15 s») frente a RNF-03/05/07 de :92-96 y a RB-05. **V2-02** |
| H2-02 | CRÍTICA | Autenticación / anti-spoofing (D45) | ❌ Pendiente | Borde público y sin HMAC/token; terna circular sobre `ip/hotspot/active`; contrato §3.2/3.3 contradice CU-01 y su Gherkin. **V2-01** |
| H2-03 | ALTA | Contrato de API | ✅ Resuelto | Descartado como falso positivo de cierre: `already_closed` (CU-06/EX-06.3) y `session_already_closed` (CU-12/EX-12.2) son de endpoints distintos; `openapi.yaml` está diferido por D48/P-01 al inicio de H2 (repo nace en Fase 3) |
| H2-04 | ALTA | RBAC | ✅ Resuelto | `operator_role` de 5 valores en [base_datos.sql](base_datos.sql):99, [diccionario_datos.md](diccionario_datos.md):104 y [diagrama_er.md](diagrama_er.md):524 |
| H2-05 | ALTA | API keys | ✅ Resuelto | Columnas `api_key_*` en `operators`: [base_datos.sql](base_datos.sql):412-417 |
| H2-06 | ALTA | Testabilidad | ✅ Resuelto | Estado final determinista en CU-06: [casos_uso.md](casos_uso.md):946-958 |
| H2-07 | ALTA | SLA | ✅ Resuelto | Doble métrica D43 en [requerimientos.md](requerimientos.md):92 y [casos_uso.md](casos_uso.md):143 |
| H2-08 | ALTA | Ciclo de vida | 🟡 Parcial | Ciclo canónico en [diagramas_casos_uso.md](diagramas_casos_uso.md):382-471, pero el diagrama/matriz conserva `active→closed` directo. **V2-12** |
| H2-09 | ALTA | Unicidad flow↔sesión (D56) | ❌ Pendiente | Índice de 3 columnas sin filtro `access_mode` y nombre/columnas divergentes (RB-25 vs DDL vs doc técnico). **V2-03** |
| H2-10 | ALTA | Latencia | ✅ Resuelto | `202` + worker ≤10 s: [requerimientos.md](requerimientos.md):93 y [documento_tecnico.md](documento_tecnico.md):361,591. Residuo de ejecución en **V2-05** |
| H2-11 | ALTA | Economía on-chain | ✅ Resuelto | Depósito de 1 h de tarifa: [casos_uso.md](casos_uso.md):150,390-426 |
| H2-12 | ALTA | Mempool / provisional | ❌ Pendiente | RF-12/D5 exigen mempool y el fallback de D56 deja dos ramas contradictorias. **V2-06** |
| H2-13 | ALTA | Infra / RGPD | ❌ Pendiente | «BD dedicada `sfhostpot`» no evidenciada (log `base=truekeate`, esquema aislado) y cita desactualizada 130 vs 137 sentencias. **V2-09** |
| H2-14 | ALTA | RGPD / borrado | 🟡 Parcial | Borrado ampliado D52 en [casos_uso.md](casos_uso.md):2177-2196 y [base_datos.sql](base_datos.sql):345,361, pero el orden de CU-15 viola la FK RESTRICT. **V2-11** |
| H2-15 | ALTA | Trazabilidad §7.2 | 🟡 Parcial | Tabla §7.2 regenerada y coherente con la fila «Requisitos» de los CU (muestreo), pero la automatización CU→RF/RNF/RT que la sostiene no existe. **V2-08** |
| H2-16 | ALTA | Anti-spoofing / DoS | ✅ Resuelto | 409 sin revocar el binding legítimo: [casos_uso.md](casos_uso.md):262-268 |
| H2-17 | MEDIA | Trazabilidad matriz | 🟡 Parcial | Su cierre se apoya en la salvaguarda CI inexistente de **V2-08** |
| H2-18 | MEDIA | Trazabilidad CU-13 | ✅† | Cubierto por RNF de administración de vouchers (F2-bis) |
| H2-19 | MEDIA | Cupo de hijos (D55) | ✅† | `max_children`=2 y `max_children_per_parent` (default 5) fijados; la imposición física se revisa en **V2-04** |
| H2-20 | MEDIA | Vouchers / modelo (D55) | ❌ Pendiente | UNIQUE total `(voucher_id, mac_address)` sin `released_at`/trigger de liberación: la reconexión y el cupo vivo no son imponibles. **V2-04** |
| H2-21 | MEDIA | Reorg | ✅† | Compensación de efectos documentada (F2-bis); no re-verificada línea a línea |
| H2-22 | MEDIA | RADIUS/accounting | ✅† | RF-21 rebajado a SHOULD (D46) |
| H2-23 | MEDIA | Alta de gateways | ✅† | Configuración multi-chain documentada; no re-verificada |
| H2-24 | MEDIA | Presupuesto RPC health-check | ✅† | Agrupación/concurrencia y k6 100 sesiones (D44) |
| H2-25 | MEDIA | Re-autenticación por deriva | ✅† | Flujo y `/revalidate` alineados (F2-bis) |
| H2-26 | MEDIA | Enums | ✅† | `superseded`/`degraded` incorporados (F2-bis) |
| H2-27 | MEDIA | RGPD / aviso previo | 🟡 Parcial | Se exige aviso «antes de persistir MAC/IP», pero la secuencia y el contrato no lo hacen implementable. **V2-10** |
| H2-28 | MEDIA | Rate-limit | ✅† | Almacén compartido y clave observada (RB-32) |
| H2-29 | MEDIA | Observabilidad | ✅† | Alerta canónica definida (F2-bis) |
| H2-30 | MEDIA | Criterios de carga | ✅† | k6 versionado como spec (D50) |
| H2-31 | MEDIA | Oráculos UI | ✅† | Anclaje de UI y mocks documentados (F2-bis) |
| H2-32 | MEDIA | `disconnect_reason` | ✅† | Catálogo ampliado (F2-bis) |
| H2-33 | MEDIA | Gestión de decisiones (D53) | 🟡 Parcial | `registro_decisiones.md` cierra P-01…P-08, pero el doc técnico las mantiene «Abiertas» y el lease sin fijar. **V2-07** |
| H2-34 | MEDIA | Solvencia heredada | ✅† | Regla/campo de solvencia heredada (F2-bis) |
| H2-35 | MEDIA | Fallback de gateway | ✅† | Transporte CoA/PoD↔REST documentado (F2-bis) |
| H2-36 | BAJA | Completitud Gherkin | 🟡 Parcial | Su cierre depende de la salvaguarda CI inexistente de **V2-08** |
| H2-37 | BAJA | Actores / RGPD | ✅† | Actor «Titular de los datos» modelado (F2-bis) |
| H2-38 | BAJA | Trazabilidad CU-10 | ✅† | Atribución RNF-05 corregida (F2-bis) |
| H2-39 | BAJA | Mapa componente→CU | ✅† | Alineado (F2-bis) |
| H2-40 | BAJA | CU-18→CU-17 | ✅† | Arista añadida al Mermaid (F2-bis) |
| H2-41 | BAJA | Superficies expuestas | ✅† | `/readyz` y `/metrics` protegidos (F2-bis) |

**Recuento:** 28 resueltos (incl. 19 con ✅† y H2-03 como falso positivo), 13 parciales/pendientes.
Ninguno de los resueltos ✅† fue objeto de la lente adversarial de esta pasada; se listan para
completar la tabla y no bloquean el arranque por ser MEDIA/BAJA.

---

## 3. Hallazgos residuales por severidad

### 3.1 CRÍTICA

#### V2-01 — El borde que crea la `portal_session` sigue público y sin canal autenticado hotspot→API (D45/H2-02)

- **Descripción:** D45 funda la identidad de red en la terna `$(mac)`/`$(ip)` y en verificar contra
  `ip/hotspot/active`, pero §3.2 define `POST /v1/portal/sessions` como «Público · sin credencial» y
  no existe token, HMAC ni URL firmada que acredite el origen hotspot→API. La comprobación en el NAS
  solo prueba que la MAC está activa, no que el solicitante sea su titular: un cliente remoto no
  autenticado puede reclamar una MAC/IP ajena y crear el binding; después D47 (409 `mac_conflict`
  manteniendo el binding legítimo) bloquea al huésped real → suplantación + DoS de primera
  reclamación. Además, la fuente declarada para la verificación (`ip/hotspot/active`) es la tabla de
  sesiones **ya autorizadas** (el alta es `POST …/active/login`, la baja `DELETE …/active/{id}`,
  `router_session_id` = id en `/ip/hotspot/active`), por lo que la comprobación previa al binding es
  circular o inejecutable (si RouterOS solo lista autenticados, EX-01.7 rechazaría todo dispositivo
  nuevo). Se suma una contradicción contractual nueva: §3.3 define el cuerpo como
  `{gateway_id, user_agent}` y §3.2 dice que MAC/IP «no se aceptan del cuerpo», mientras CU-01 paso 1
  afirma que el portal envía «esos valores como contexto» y el Gherkin envía `mac_address`/`ip_address`
  esperando 409 `mac_ip_unverified`; con el «rechazo de campos desconocidos» de RNF-10/§6.1 la
  respuesta sería 400 y el escenario es inejecutable. La recomendación original de H2-02 (autenticar
  el borde que crea la `portal_session`) no se aplicó.
- **Evidencia:** [documento_tecnico.md](documento_tecnico.md):346, :356, :746, :194-199, :296;
  [casos_uso.md](casos_uso.md):196, :216-225, :278-280, :296-305, :203, :213-220, :1224, :161, :2517;
  [requerimientos.md](requerimientos.md):48, :74; [diccionario_datos.md](diccionario_datos.md):280.
- **Recomendación:** definir y documentar un canal autenticado hotspot→API (parámetros/URL firmados
  con HMAC o token de corta vida emitido por RouterOS/portal), crear la `portal_session` solo desde
  esos parámetros, eliminar MAC/IP del cuerpo (y del Gherkin) o declararlas contexto no vinculante,
  incluir la terna en el SIWE y añadir test negativo de suplantación remota. Reservar
  `/ip/hotspot/active` para reconciliación post-autorización y usar `/ip/hotspot/host`,
  `/ip/dhcp-server/lease` o la variable firmada por el hotspot como fuente previa. **Bloqueante.**

### 3.2 ALTA

#### V2-02 — D42 no se propagó a `requerimientos.md`: D9 y RF-13 (MUST) siguen exigiendo 15 s (H2-01)

- **Descripción:** D42 fija Jobs + Cloud Scheduler a 1 min y declara eliminados los ciclos de 4 s/15 s;
  RNF-03/05/07 y RB-05 ya lo reflejan, pero la fuente normativa conserva D9 («health-check cada 15 s»)
  y RF-13 MUST («cada 15 s valida solvencia»), y RB-05/RF-27 los citan como fuente. Cualquier test
  escrito contra RF-13 exigiría una cadencia que D42 prohíbe: `requerimientos.md` es internamente
  incoherente (RNF-03 razona con 1 min) y contradice al resto del paquete. El defecto que originó
  H2-01 sigue en el artefacto que fija los criterios de test.
- **Evidencia:** [requerimientos.md](requerimientos.md):22 y :65, frente a :84, :92-96;
  [casos_uso.md](casos_uso.md):142 y :2984; [documento_tecnico.md](documento_tecnico.md):272, :281;
  [estado_proyecto.md](estado_proyecto.md):93 («ciclo 15 s»).
- **Recomendación:** reescribir D9 y RF-13 a «cada 1 min (D42)», barrer menciones residuales de
  15 s/4 s (incl. `estado_proyecto.md`) y añadir al CI un grep que falle ante cadencias prohibidas en
  documentos normativos. **Bloqueante.**

#### V2-03 — D56: el índice único no distingue padre de hijos y su definición diverge entre artefactos (H2-09)

- **Descripción:** hay tres definiciones incompatibles: RB-25 cita el índice inexistente
  `uq_hotspot_sessions_open_flow` sobre `(chain_id, super_token_address, sender_wallet,
  receiver_wallet, gateway_id)` —y `chain_id` no es columna de `hotspot_sessions`—; el documento técnico
  repite esas cinco columnas; y el DDL crea `uq_hotspot_sessions_active_flow` solo sobre
  `(super_token_address, sender_wallet, receiver_wallet)` (diccionario y ER coinciden con el DDL). El
  nombre y la semántica difieren, y el validador no lo detecta porque no compara índices. Agravante: el
  índice no filtra `access_mode='wallet_stream'`; los hijos `voucher_child` heredan
  `sender_wallet`/`super_token_address` del padre y `receiver_wallet` es NOT NULL (CHECK
  `payout_wallet`), por lo que la terna del hijo coincide con la del padre y el INSERT del hijo viola
  el índice: el canje de voucher (RF-25 MUST) fallaría mientras el padre esté `active`. Queda sin fijar
  la definición canónica de D56.
- **Evidencia:** [base_datos.sql](base_datos.sql):278-305 y :600-602;
  [casos_uso.md](casos_uso.md):167, :169, :1210-1212; [documento_tecnico.md](documento_tecnico.md):529-532,
  :944; [diccionario_datos.md](diccionario_datos.md):261-300; [diagrama_er.md](diagrama_er.md):650-651.
- **Recomendación:** añadir al índice el predicado de sesión padre (`AND access_mode='wallet_stream'`
  o `parent_hotspot_session_id IS NULL`) y alinear RB-25/diccionario/er/documento técnico con nombre y
  columnas reales; definir explícitamente `receiver_wallet` del hijo; añadir tests SQL de coexistencia
  padre + 2 hijos activos y de dos cadenas/gateways. **Bloqueante.**

#### V2-04 — D55: la reconexión del hijo queda bloqueada por el UNIQUE plano de `voucher_redemptions` (H2-20)

- **Descripción:** RB-09/RB-28 y CU-08 establecen que `children_used` se libera al desconectarse y que
  el mismo MAC puede reconectar mientras el padre siga vivo; RB-28 afirma que `UNIQUE (voucher_id,
  mac_address)` se evalúa «sobre redenciones vivas» (índice parcial) y existe «trigger de liberación».
  El DDL impone un UNIQUE de tabla plano y `voucher_redemptions` no tiene columna de estado/cierre/
  revocación que permita un índice parcial: tras la primera desconexión el mismo MAC no puede volver a
  insertar una redención nunca, contradiciendo D55/RF-25 (el flujo de CU-08 inserta una fila nueva por
  canje); y no hay trigger ni columna `released_at` que marque la redención como no viva ni decremente
  `children_used` (los 9 triggers del esquema son solo `*_updated_at`). El Gherkin «Reconexión del hijo
  libera y reutiliza el cupo» espera 201 y hoy es inejecutable. El diccionario y el documento técnico
  refuerzan la lectura equivocada («un mismo dispositivo no consume dos cupos», sin «vivas»).
- **Evidencia:** [base_datos.sql](base_datos.sql):448, :456, :469-470, :638-676;
  [casos_uso.md](casos_uso.md):167, :170, :1204-1218, :1233, :1248-1250, :1307-1316, :1363-1364;
  [documento_tecnico.md](documento_tecnico.md):522, :644, :648-649;
  [diccionario_datos.md](diccionario_datos.md):301-303, :541-543.
- **Recomendación:** añadir ciclo de vida a la redención (`status`/`ended_at`/`revoked_at`) y sustituir
  el UNIQUE plano por un índice único parcial sobre redenciones vivas (o superseder/borrar la fila al
  desconectar), con trigger/transacción que libere `children_used`; sincronizar diccionario/ER/RB-28/
  documento técnico y añadir test desconexión→reconexión. **Bloqueante.**

#### V2-05 — D44 deja el worker asíncrono sin ejecución durable bajo D42 (Jobs + Scheduler, min 0)

- **Descripción:** el contrato dice que `/v1/session/authorize` responde 202 y que «el worker» valida la
  tx (≤10 s p95) y, al vencer la ventana de 60 s, confirma con `receipt` + `getFlow`. Pero el despliegue
  declara Cloud Run con `min 0`, D42 prohíbe procesos always-on y el Scheduler solo dispara indexer,
  health, purga y caducidad; `/internal/jobs` no incluye ningún worker de autorización/confirmación y
  no se documenta cola (Cloud Tasks/Pub-Sub) ni `min-instances`. Una instancia request-scoped puede
  apagarse tras el 202: la validación/confirmación se pierde o se pospone al Job de 1 min, alargando de
  facto la ventana provisional hasta ~120 s y rompiendo el criterio de 60 s de D5/D44.
- **Evidencia:** [documento_tecnico.md](documento_tecnico.md):194, :279-281, :304-305, :417-420,
  :590-591; [casos_uso.md](casos_uso.md):543-545, :555; [diagramas_casos_uso.md](diagramas_casos_uso.md):387.
- **Recomendación:** asignar al worker un dueño de ejecución durable (servicio con `min-instances≥1` y
  bucle interno, Cloud Tasks/Pub-Sub, o Job de 1 min dedicado que procese `pending`/provisionales
  vencidos), documentar cadencia y ancla temporal, y añadir test de apagado de instancia tras el 202.
  **Bloqueante.**

### 3.3 MEDIA

#### V2-06 — H2-12/D5: mempool exigido y fallback de D56 no decidido de forma unívoca

RF-12 (MUST) y D5 mantienen el provisional «solo tras validar la tx del mempool» y la ventana «desde
que la tx se ve en mempool», mientras §5.2/CU-03 introducen un fallback si el nodo no expone
pendientes: «se espera al recibo para confirmar el provisional» y a la vez «se confirma con recibo y se
revoca a los 60 s sin recibo». Si la concesión espera al recibo, la rama «sin recibo a los 60 s» queda
indefinida; si se concede antes, falta la validación previa que RF-12 exige cuando el mempool no es
visible. D56 difiere la comprobación empírica a H2 (ENV-02) sin fijar oráculo por rama ni actualizar
RF-12/D5. Evidencia: [requerimientos.md](requerimientos.md):18, :64;
[documento_tecnico.md](documento_tecnico.md):585-586, :591; [casos_uso.md](casos_uso.md):140, :544-548,
:642-646; [registro_decisiones.md](registro_decisiones.md):46. **Acción:** registrar en D5/RF-12 el modo
de concesión condicionado a ENV-02, fijar un único oráculo determinista por rama y usar la verificación
en Besu 81234 como criterio de cierre.

#### V2-07 — D53: el documento técnico contradice al registro sobre P-02…P-08 y sobre el lease

`registro_decisiones.md` cierra P-01…P-08 el 2026-10-17 (P-02 con lease de 60 s y renovación cada 20 s,
CAS/fencing), mientras el documento técnico del mismo día mantiene P-02/P-04/P-05/P-06/P-07/P-08 como
«Abierta» en §9.2 y sigue declarando en §5.6 que «la duración concreta del lease y su renovación no
están fijadas… debe cerrarse en H2». Hay dos registros contradictorios del mismo estado y el criterio
de cierre 1 no es verificable de forma única. Evidencia:
[registro_decisiones.md](registro_decisiones.md):22-29;
[documento_tecnico.md](documento_tecnico.md):679-681, :997-1008. **Acción:** declarar
`registro_decisiones.md` como fuente única de estado, sincronizar §5.6 y §9.2 y añadir al validador una
comprobación de estados P-xx entre artefactos.

#### V2-08 — H2-15: se afirma que el validador de CI compara CU↔§7.2 y FA/EX, pero no está implementado

La tabla §7.2 está regenerada y coincide con la fila «Requisitos» de los CU (muestreo sin RF/RNF
primarios omitidos), pero el documento afirma que «el validador de CI compara ambos artefactos (D53)» y
que «si un FA/EX deja de tener cobertura, el CI documental falla», mientras
[`tools/validador_artefactos.py`](tools/validador_artefactos.py):98-160 solo comprueba
tablas/enums/columnas/FK/conteos y balance de paréntesis: no compara CU→RF/RNF/RT ni mantiene la lista
cerrada FA/EX. La salvaguarda que sostiene el cierre de H2-15, H2-17 y H2-36 es una afirmación sin
artefacto verificable. Evidencia: [documento_tecnico.md](documento_tecnico.md):805, :824-829, :901.
**Acción:** implementar la comparación CU→RF/RNF/RT y la lista cerrada FA/EX en el validador y
ejecutarla en CI, o retirar la afirmación y rebajar esos cierres a verificación manual declarada.

#### V2-09 — H2-13/D51: la «BD dedicada `sfhostpot`» no está evidenciada y la cita de validación está desactualizada

D51 y el documento técnico afirman que producción usa la «base de datos dedicada `sfhostpot`» en
`truekeate-db-dev`, pero la re-ejecución del DDL muestra `base=truekeate | esquema=sfhostpot`: crea y
elimina el esquema `sfhostpot` dentro de la base `truekeate`, y [`entornos_globales.md`](entornos_globales.md):157
declara que la instancia dispone de «base truekeate». El aislamiento validado es de esquema, no de base,
y `sfhostpot` no es una base real. Además §8.2 cita «130 sentencias × 2 pasadas» y enlaza el log v1,
mientras el log de Fase 2 registra 137 sentencias y no se referencia en ningún documento. Se suma que
`requerimientos.md` conserva D17 («GCP mcc-ecommerce, europe-west1»), en contradicción con D51
(`truekeate-db-dev`, `southamerica-east1`) y con la residencia de datos personales declarada; D17 no
aparece anotada como sustituida. Evidencia: [pruebas/validacion_base_datos_gcp_fase2.log](pruebas/validacion_base_datos_gcp_fase2.log):3-19;
[pruebas/validacion_base_datos_gcp.log](pruebas/validacion_base_datos_gcp.log):3-19;
[requerimientos.md](requerimientos.md):30, :39; [resolucion_auditoria_fase2.md](resolucion_auditoria_fase2.md):39;
[documento_tecnico.md](documento_tecnico.md):199, :237-240, :306, :782, :920-930;
[entornos_globales.md](entornos_globales.md):157-158. **Acción:** crear realmente la base `sfhostpot` y
revalidar, o corregir D51/artefactos a «esquema `sfhostpot` en BD compartida `truekeate`» con decisión
de aislamiento/riesgo RGPD; actualizar §8.2 a 137 sentencias y referenciar el log de Fase 2; actualizar
D17 con D51 o anotarla como sustituida.

#### V2-10 — D52: el aviso de privacidad se exige antes de persistir MAC/IP, pero CU-01/contrato no definen secuencia ni token implementable

CU-01 (precondición 4 y postcondición 4) y §6.3 exigen mostrar y registrar el aviso «antes de persistir
MAC/IP», pero el flujo principal envía en el paso 1 `POST /v1/portal/sessions` (que el contrato define
como «alta de `portal_session`» con la MAC/IP tomadas de la terna) y solo en el paso 3 muestra el aviso
y dice «después crea la `portal_session`»; el contrato no incluye campo/token/versión de prueba del
aviso. El Gherkin exige 409 `privacy_notice_missing` sin que el endpoint pueda conocerlo. La secuencia
contradictoria hace inimplementable el control legal que H2-27 declaró cerrado. Evidencia:
[casos_uso.md](casos_uso.md):204, :216, :222-225, :278-280, :2252-2256;
[documento_tecnico.md](documento_tecnico.md):356, :773; [requerimientos.md](requerimientos.md):101.
**Acción:** separar el flujo (registrar/mostrar aviso con versión y timestamp antes de cualquier
persistencia de MAC/IP y entregar al alta un token verificado por el servidor), o crear primero una
`portal_session` sin PII y completarla tras el aviso.

#### V2-11 — CU-15: el orden de borrado documentado elimina `device_bindings` antes de `hotspot_sessions`, pero esa FK es RESTRICT

CU-15 afirma que el orden transaccional «resuelve las FK RESTRICT» y el flujo principal (paso 3) y el
Gherkin eliminan primero `device_bindings` y después `hotspot_sessions`. En el DDL,
`hotspot_sessions.device_binding_id` es NOT NULL REFERENCES `device_bindings` ON DELETE RESTRICT:
borrar `device_bindings` mientras exista la `hotspot_session` que lo referencia produce violación de FK,
y el escenario que asegura «no se produce error de violación de clave foránea» fallaría. Evidencia:
[casos_uso.md](casos_uso.md):2200-2201, :2267-2269; [base_datos.sql](base_datos.sql):274-275, :250-251.
**Acción:** reordenar (hotspot_sessions antes de device_bindings y portal_sessions) en flujo y Gherkin,
y añadir test de supresión contra el DDL real.

#### V2-12 — H2-08: el cierre voluntario tiene dos caminos incompatibles en el diagrama (`active→closed` directo vs `active→revoking→closed`)

`diagramas_casos_uso.md` afirma que el ciclo es «idéntico en casos_uso.md y documento_tecnico.md», pero
su `stateDiagram` contiene a la vez `active→revoking` (cierre del usuario) y `active→closed` (cierre
voluntario + ACK), además de `revoking→closed`; su matriz estado↔evento fija
`active --closeFlow+ACK--> closed` sin pasar por `revoking`. CU-06 y el documento técnico describen el
camino canónico `active→revoking→closed`. La ambigüedad impide identificar el estado intermedio
determinista exigido por D50. Evidencia: [diagramas_casos_uso.md](diagramas_casos_uso.md):384, :404,
:407, :414, :466; [casos_uso.md](casos_uso.md):963-968;
[documento_tecnico.md](documento_tecnico.md):595-598. **Acción:** eliminar la transición directa
`active→closed` (o marcarla como efecto del ACK tras `revoking`) y alinear diagrama y matriz con CU-06.

### 3.4 BAJA

#### V2-13 — El cooldown de 15 min por MAC (y el bloqueo de 24 h) se declara «constante derivada de RB-24» pero no está definido ni registrado

EX-01.3 introduce un cooldown de 15 min por MAC y un bloqueo de 24 h ante segundo conflicto,
atribuyéndolos a RB-24, que solo define el anti-spoofing (fuente autoritativa y binding único) sin
duración; RB-31…RB-35 tampoco lo recogen y `registro_decisiones.md` §3 no registra el umbral. Incumple
la regla D53 (toda constante derivada con ID/propietario/fecha) y deja el criterio no trazable.
Evidencia: [casos_uso.md](casos_uso.md):161, :181-187, :266;
[registro_decisiones.md](registro_decisiones.md):31-39. **Acción:** registrar cooldown y bloqueo como
constantes derivadas con ID, propietario y fecha (o derivarlas de RB-04/RB-32) y corregir la cita.

#### V2-14 — Un escenario Gherkin admite dos resultados finales («suprimidos o anonimizados»), contra la regla de resultado único de D50

La regla de oro prohíbe resultados alternativos («un escenario = un único resultado observable»), pero
el escenario «Purga automática a los 30 días» de CU-15 afirma que los datos «quedan suprimidos o
anonimizados», que son dos estados de BD distintos (filas eliminadas vs filas seudonimizadas); el
criterio no es determinista ni verificable con un único aserto. Evidencia:
[casos_uso.md](casos_uso.md):56-57, :2185-2189, :2278-2281. **Acción:** dividir en dos criterios
deterministas (borrado físico vs seudonimización) o fijar una regla única de decisión y asertarla.

---

## 4. Bloqueos restantes y acciones

Antes de generar código o tests de Fase 3 deben cerrarse, en este orden, los cinco bloqueos (todos
verificados en §3):

| # | Bloqueo | Hallazgos | Acción mínima | Criterio de aceptación |
|---|---|---|---|---|
| B1 | Borde de identidad no autenticado y circular | V2-01 (H2-02/D45) | Definir HMAC/token hotspot→API, crear `portal_session` solo desde parámetros firmados, fuente previa a la autorización y alinear contrato/Gherkin | Test negativo de suplantación remota + traza D45/RF-17 actualizada; `POST /v1/portal/sessions` deja de ser «sin credencial» |
| B2 | Cadencia 15 s en la fuente normativa | V2-02 (H2-01/D42) | Reescribir D9 y RF-13 a 1 min y barrer 15 s/4 s | `requerimientos.md` sin «15 s» normativo; grep de CI en verde |
| B3 | Modelo físico no soporta D55/D56 | V2-03, V2-04 (H2-09/H2-20) | Índice parcial con predicado de padre y definición canónica; ciclo de vida de redención + liberación de cupo | Tests SQL: padre + 2 hijos activos coexisten; desconexión→reconexión 201; validador ampliado a índices |
| B4 | Worker asíncrono sin dueño de ejecución | V2-05 (D44) | Cola/instancia durable o Job dedicado para validación y confirmación; documentar cadencia y ancla temporal | Test de apagado tras 202 sin sesión huérfana; ventana de 60 s verificable |
| B5 | Evidencia de infraestructura y trazabilidad de decisiones | V2-07, V2-08, V2-09 | BD `sfhostpot` real o corrección de D51/D17; sincronizar P-xx; implementar o retirar la salvaguarda CI | Log de DDL de Fase 2 referenciado (137 sentencias); estados P-xx idénticos; validador CU→RF/RNF/RT en CI |

Recomendado antes de H3 (no bloqueante del arranque, pero sí antes de escribir los tests afectados):
**V2-06** (fijar oráculo de mempool por rama), **V2-10** (secuencia del aviso de privacidad),
**V2-11** (orden de borrado RGPD) y **V2-12** (ciclo de vida en el diagrama). **V2-13** y **V2-14**
pueden acometerse junto con los tests de CU-01/CU-15.

---

## 5. Criterio de cierre

Se considerará cerrada la Fase 2 (y apta para Fase 3) cuando se cumplan **simultáneamente**:

1. **Cero CRÍTICA y cero ALTA abiertas:** V2-01…V2-05 resueltos, o registrados como decisión aceptada
   con propietario, fecha y criterio de verificación (criterio 1 y 4 de
   [`resolucion_auditoria_fase2.md:82-88`](resolucion_auditoria_fase2.md)).
2. **Evidencia de datos:** `tools/validador_artefactos.py` en verde **ampliado** a índices únicos
   parciales y coherencia CU→RF/RNF/RT, y DDL real re-ejecutado en Cloud SQL con log de Fase 2
   referenciado en el documento técnico (137 sentencias, base/esquema declarados sin ambigüedad).
3. **Coherencia entre artefactos:** `requerimientos.md` ↔ `casos_uso.md` ↔ `diagramas_casos_uso.md` ↔
   `documento_tecnico.md` ↔ `base_datos.sql`/`diccionario_datos.md`/`diagrama_er.md`, sin definiciones
   divergentes de índices, ciclos de vida, cadencias ni estados P-xx.
4. **Re-auditoría corta de verificación** (Fase 2-ter, solo lectura) que confirme 0 CRÍTICA/ALTA
   abiertas y que no introduzca contradicciones nuevas.
5. **Salvaguardas ejecutables:** los checks que los documentos invocan (CU→§7.2, FA/EX, cadencias
   prohibidas, estados P-xx, índices) existen en CI y fallan si se degradan; las afirmaciones de
   automatización sin artefacto se retiran.
6. Los 7 MEDIA y 2 BAJA restantes pueden planificarse dentro de las primeras semanas de Fase 3 **solo
   si no se convierten en criterios de test antes de resolverse**; V2-06, V2-10 y V2-11 deben cerrarse
   antes de escribir los tests de CU-03, CU-01 y CU-15 respectivamente.

---

## Anexo — Falsos positivos descartados (no forman parte del veredicto)

| Candidato | Motivo de descarte (verificado) |
|---|---|
| H2-03 (catálogo `reason`, `openapi.yaml` ausente) | `already_closed` (endpoint `close`, CU-06/EX-06.3) y `session_already_closed` (endpoint `revoke`, CU-12/EX-12.2) no son alias; el `openapi.yaml` está diferido explícitamente por D48/P-01 al inicio de H2 (repo nace en Fase 3) |
| P-01 «cerrada sin `openapi.yaml`» | P-01 cierra la decisión (congelar OpenAPI v1 con prefijo `/v1` y catálogo cerrado), no la entrega; el artefacto pertenece a Fase 3 |
| Retención de `audit_log` 12 meses vs export 30 días | Son magnitudes distintas (plazo de conservación vs ventana operativa del panel); CU-15 las separa expresamente y EX-11.2 es una restricción de rendimiento razonable |
| Migraciones de esquema para BD existente | En Fase 2 no existe BD desplegada/persistente: el DDL from-scratch es el artefacto autoritativo y el upgrade in-place corresponde a Fase 3/RT-04 |
| Cita de validación de 130 sentencias (por sí sola) | No es contradicción semántica: el changelog v1.4 registra correctamente la validación de esa versión; el desajuste con el log de 137 sentencias se retiene como higiene de evidencia dentro de **V2-09**, no como hallazgo independiente |
| Cobertura de `flow_events` en el borrado RGPD | La matriz D52 sí está en el artefacto canónico (§6.3 y CU-15 postcondición 3); se retiene únicamente el defecto de orden de borrado (**V2-11**) |

---

> **Conclusión:** la Fase 2-bis mejoró sustancialmente el paquete, pero **no cumple su propio criterio
> de cierre**. El veredicto es **NO APTA para Fase 3** hasta resolver los bloqueos B1–B5 (V2-01…V2-05) y
> re-verificar. El esfuerzo estimado es acotado: cinco correcciones documentales/de modelo y tres
> salvaguardas de CI, sin dependencia de hardware ni de decisiones abiertas.
