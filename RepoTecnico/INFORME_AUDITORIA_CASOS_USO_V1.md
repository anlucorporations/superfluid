# INFORME DE AUDITORÍA — CASOS DE USO (RepoTecnico/casos_uso.md) — V1

- **Proyecto:** superfluidv2 (nómina en streaming BRLT sobre Besu Codecrypto 81234, envoltorio BrltX, panel admin 100 % on-chain, MongoDB, Suite del Empleado).
- **Alcance auditado:** `casos_uso.md` (CU-01..CU-15, máquina de estados §3, matriz de trazabilidad §6) cruzado con `requerimientos.md`, `diccionario_datos.md`, `INFORME_OPTIMIZACION_V1.md` (H-01..H-37) y `BRIEF_SUPERFLUID.md`.
- **Fecha:** 2026-10-30 · **Origen:** 7 lentes de revisión (R1–R7) + verificación adversarial por lente + síntesis.
- **Correcciones mecánicas ya aplicadas** (sin decisión del director): typo `warpAndCreateFlow`→`wrapAndCreateFlow` (CU-06), «1818 decimales»→«18 decimales» (CU-02), rate erróneo `964506172839506172`→`964506172839506` (CU-10, 500 BRLT/6 días floor), lusismos de CU-08, «re-adopitar»→«re-adoptar» (CU-11).

---

## 1. RESUMEN EJECUTIVO

**Veredicto: los casos de uso están APTOS CONDICIONALMENTE** — la estructura es sólida (los 15 CUs tienen actor, precondiciones, flujo principal, alternativos, Gherkin, EARS, prueba y trazabilidad; la matriz §6 cubre RF/RNF/RT sin huérfanos y las decisiones H-* de la Fase 2 están integradas), pero hay **1 crítico y 8 altos que condicionan directamente la Fase 3** y que o bien contradicen el propio documento (máquina de estados, Gherkin, trazabilidad) o dejan sin especificación el mecanismo de conductas centrales (settle automático, cambio de wallet atómico, persistencia del lote, cobro del empleado).

| Severidad | Cantidad (tras verificación y deduplicación) |
|---|---|
| CRÍTICA | 1 |
| ALTA | 8 |
| MEDIA | 13 |
| BAJA | 3 |
| **Total** | **25** |

---

## 2. METODOLOGÍA

1. **Fase 1 — Revisión (7 lentes en paralelo):** R1 ambigüedad/testabilidad · R2 consistencia · R3 completitud/estructura · R4 stakeholders · R5 trazabilidad con el brief · R6 riesgos técnicos · R7 seguridad y legal.
2. **Fase 2 — Verificación adversarial (por bloque de lentes):** cada hallazgo contrastado contra los archivos reales (recorre ~1400 líneas de `casos_uso.md` + fuentes); falsos positivos descartados, coincidencias fusionadas, severidades ajustadas. **Ante la duda, se descartó** (p. ej. «Y Pero» estandarizado se descartó: es parseable en el locale español de Gherkin; el block-time default 5000 ms sí está definido y trazado).
3. **Fase 3 — Síntesis:** deduplicación cruzada, IDs únicos AC-01…, priorización y plan de acción. No se añadió ningún hallazgo que no viniera verificado.

---

## 3. TABLA DE HALLAZGOS

| ID | Área | Título | Severidad |
|---|---|---|---|
| AC-01 | Cobertura funcional | Retiro del empleado (downgrade BrltX→BRLT + residual tras baja) sin CU ni actor | **CRÍTICA** |
| AC-02 | BrltX / H-11 | Settle automático «sin firma» por fecha_fin sin mecanismo de disparo definido | ALTA |
| AC-03 | CU-03 / Seguridad | Cambio de wallet: secuencia de 2 tx no atómica (fallo intermedio contradice la EARS) + sin step-up ni auditoría del cambio | ALTA |
| AC-04 | CU-06 / Estados | A7 introduce estado «Reintentar» fuera de la máquina §3 y el Gherkin de revert niega el registro «próximo» persistente | ALTA |
| AC-05 | CU-14 / Datos | CU-14 declara transición «próximo→terminado» inexistente; «ejecutado» y «terminados» sin respaldo en el diccionario | ALTA |
| AC-06 | CU-12 / H-16 | Transferencia Ownable2Step obligatoria en el deploy vs A6 que la difiere hasta el primer mint (ventana con clave desechable como owner) | ALTA |
| AC-07 | Robustez | H-14 (ReentrancyGuard/CEI, Pausable de emergencia, shortfall) ausente de todo el documento y de §6.1 | ALTA |
| AC-08 | Sesiones | Parámetros de sesión indefinidos: TTL sin valor, revocación tras baja contradice EARS, rate-limit sin umbral, sin SameSite/CSRF | ALTA |
| AC-09 | CU-09 / H-08 | Lote: persistencia del progreso sin dueño definido y riesgo de doble pago (tx «enviada sin receipt»); EARS corrupta | ALTA |
| AC-10 | CU-15 / GDPR | Borrado «elimina o anonimiza» no determinista; retención sin valores; cifrado en reposo (RNF-08) sin cobertura | MEDIA |
| AC-11 | Datos / H-17 | Reconciliación Mongo↔on-chain sin job/actor; Mongo sin respaldo y sin flujo alternativo de caída | MEDIA |
| AC-12 | CU-12 / H-36 | Precondición exige 10.000 BRLT pre-deploy (el BRLT aún no existe; faucet solo da CC; §6.1 lo asigna a CU-02) | MEDIA |
| AC-13 | Operación / H-09 | Plan B de gas solo existe en CU-12; en operación (CU-07/08/09) no hay contingencia; sucesión de wallet admin sin CU operativo | MEDIA |
| AC-14 | Flujos / H-11 | Firma de «próximos» sin SLA ni responsable alterno: el empleado deja de cobrar con solo una alerta visual | MEDIA |
| AC-15 | Accesos | Lista blanca de admins (puerta del panel) sin CU de gestión ni bootstrap post-deploy | MEDIA |
| AC-16 | H-16 / CU-02 | Tope de mint del owner sin decisión y approval de BRLT→BrltX no acotada por EARS | MEDIA |
| AC-17 | Trazabilidad | Matriz §6 atribuye a CUs requisitos que sus trazabilidades no citan (RNF-04/06, RNF-03, RT-02, RT-08, RF-05, H-10) y RNF-04 sin criterio | MEDIA |
| AC-18 | Criterios | 6 flujos alternativos con EARS carecen de escenario Gherkin (CU-03-A3/A6, CU-09-A6, CU-11-A3, CU-08-A4, CU-14-A2) | MEDIA |
| AC-19 | CU-10 / H-22 | gasto_previsto: variantes día/mes sin fórmula ni test (solo «total» está especificada) | MEDIA |
| AC-20 | CU-11 | Oráculo de «address no responde según lo esperado» y mecanismo de reversión sin definir; citas de H-17 y RNF-03 fuera de contexto | MEDIA |
| AC-21 | Modelo | Estado de empleado «en_flujo» definido pero ningún CU lo establece/limpia | MEDIA |
| AC-22 | Trazabilidad | CU-03 firma deleteFlow+wrapAndCreateFlow (RF-02/RF-03/RF-18) sin citarlos en su trazabilidad ni en la matriz | MEDIA |
| AC-23 | Regla de negocio | Superposición de flujos activos del mismo empleado «se permite» sin base documental | BAJA |
| AC-24 | Calidad de edición | Revisión ortotipográfica global pendiente (los defectos graves citados ya fueron corregidos) | BAJA |
| AC-25 | Faucet | Uso del faucet sin cuota por wallet/periodo ni registro de uso | BAJA |

---

## 4. CRÍTICO Y ALTOS DETALLADOS

### AC-01 · CRÍTICA — Retiro del empleado sin caso de uso
- **Evidencia:** `downgrade` está en la lista cerrada de RF-02 (requerimientos:19) pero aparece **0 veces** en `casos_uso.md`; el EMPLEADO «no firma operaciones de flujo» (casos_uso:16) y todo el unwrap de `deleteFlow` devuelve el BRLT al ADMIN (CU-08:624-626,645). El saldo residual tras baja solo se **muestra** en el panel (CU-03:241-242) y la Suite queda deshabilitada (RF-20), de modo que el acumulado devengado del empleado en BrltX queda sin vía para convertirse en BRLT utilizable: **el objetivo central del empleado (cobrar) no tiene caso de uso**.
- **Recomendación:** crear CU del EMPLEADO (o flujo delegado del ADMIN en la baja) que defina: (i) quién firma el downgrade/cash-out, (ii) cuándo (en curso, al terminar, tras la baja) y (iii) qué mecanismo de visibilidad queda para el saldo del empleado dado de baja. **Requiere decisión del director (Bloque 1).**

### AC-02 · ALTA — Settle automático sin mecanismo
- **Evidencia:** la máquina §3 (51-53,66) y CU-07-A3/CU-08-A3/CU-14 prometen que al vencer `fecha_fin` el contrato corta el flujo «sin firma»; un contrato EVM no se auto-ejecuta: si el corte requiere una tx firma, contradice RF-18; si es contabilidad lazy, debe especificarse y probarse en CONTRACT. Nada lo define.
- **Recomendación:** decidir la semántica (lazy settle con `fecha_fin` como tope del acumulado, settle en la primera interacción, o tx firmada) y añadirla a RF-02 + prueba CONTRACT. **Requiere decisión (Bloque 1).**

### AC-03 · ALTA — Cambio de wallet: atomicidad + endurecimiento
- **Evidencia:** CU-03 encadena `deleteFlow` y `wrapAndCreateFlow` «en la misma sesión de firmas» (233-238); si la 1.ª tx confirma y la firma de la 2.ª se rechaza, el flujo queda terminado on-chain mientras la EARS (296-297) y el Gherkin (276) exigen «mantener la wallet anterior y el flujo activo original sin cambios» — físicamente imposible; A3 solo cubre reverts de ambas. Además la firma de la wallet nueva no vincula empleado ni wallet anterior y el ADMIN no re-firma: una sesión admin comprometida podría redirigir salarios (H-15 exigía «verificación de identidad, control y auditoría»; no hay EARS de audit trail).
- **Recomendación:** redefinir la secuencia con estado intermedio explícito («cambio en curso», reintento obligatorio del wrap tras deleteFlow confirmado) o multicall atómico; añadir binding del mensaje al empleado+wallet anterior, step-up del ADMIN (re-firma EIP-712/SIWE) y registro de auditoría del cambio con prueba API.

### AC-04 · ALTA — Estado «Reintentar» y Gherkin de revert inconsistente
- **Evidencia:** CU-06-A7 (484-486) marca el flujo «Reintentar» tras revert, estado que no existe en §3 ni en el enum del diccionario (diccionario:69); el Gherkin (518-522) dice «no queda nada on-chain ni en BD» mientras el registro «próximo» preexistente sí persiste y habilita el reintento (A1:476).
- **Recomendación:** eliminar «Reintentar»: tras revert, el registro «próximo» permanece reintentable (con anotación opcional del último error); reformular el Entonces a «no queda rastro nuevo on-chain ni en MongoDB».

### AC-05 · ALTA — Modelo de estados de `flujos_programados` incompleto
- **Evidencia:** CU-14 (1144-1146) lista la transición «activo/próximo → terminado» que la máquina §3 no permite (próximo → activo o borrado/cancelado); CU-06 (472-473) «marca como ejecutado (o se elimina)» un registro cuyo campo destino no existe; CU-14 sirve «terminados desde MongoDB» (1209) sin entidad/colección que respalde el historial.
- **Recomendación:** cerrar el modelo: añadir «cancelado» al enum (o eliminar la rama), decidir «marcar ejecutado» vs eliminar con campo en `flujos_programados`, y fijar fuente de los terminados (eventos on-chain H-12 vs colección historial). **Requiere decisión (Bloque 2).**

### AC-06 · ALTA — Ownership en CU-12 autocontradicho
- **Evidencia:** el flujo principal (954-957), el Gherkin (980) y la precondición bloqueante (938-939) exigen la transferencia Ownable2Step **dentro del deploy**, pero A6 (970-971) la difiere «hasta el primer mint»: en esa ventana la clave desechable queda como owner/minter de la nómina (y el mint inicial de los 10.000 BRLT se asigna a CU-02). H-16 además está mapeado inconsistente (CU-02 lo cita; §6.1 solo lo asigna a CU-12).
- **Recomendación:** eliminar A6 (transferencia propose+accept obligatoria en la sesión de deploy) o condicionarlo rígidamente con estado bloqueante. **Requiere decisión (Bloque 1).**

### AC-07 · ALTA — H-14 sin trazabilidad
- **Evidencia:** H-14 (robustez de BrltX: ReentrancyGuard/CEI, Pausable de emergencia, comportamiento ante shortfall; INFORME:143-145) tiene 0 menciones en `casos_uso.md`: no hay CU, criterio, ni entrada en §6.1 (que lista H-33/H-34… pero omite H-14).
- **Recomendación:** incorporar guardas y pausa de emergencia a las restricciones de CU-06/CU-08/CU-12 (o deferr explícito en §6.1). **Requiere decisión (Bloque 3).**

### AC-08 · ALTA — Parámetros de sesión indefinidos
- **Evidencia:** «sesión de corta vida» y TTL sin valor en ninguna fuente (91,1046,1077; requerimientos:33,49) → criterios de expiración no testeables; la revocación tras baja es «en el siguiente ciclo de verificación» (255-256) sin definir el ciclo, mientras la EARS (298-299) y CU-13 (1086-1089) exigen revocación inmediata; rate-limiting «tras varios reintentos» sin umbral/ventana (100-101,130,1058-1059); cookies sin SameSite/Secure y mutaciones sin CSRF.
- **Recomendación:** fijar valores propuestos (TTL de sesión, umbral/rate-limit, revocación inmediata en el endpoint de baja, SameSite+CSRF) en RNF-07. **Requiere decisión (Bloque 3).**

### AC-09 · ALTA — Persistencia y reintento del lote CU-09
- **Evidencia:** el progreso sobrevive al cierre del navegador (A5:714-715) sin dueño definido (¿localStorage, Mongo, reconciliación por RPC?) con RF-18 impidiendo custodia backend de txs; EARS corrupta «la UI deberá de terminar el estado del lote» (757-758); no existe regla para distinguir «enviada sin receipt» de «fallida» si el RPC cae tras el broadcast → riesgo de **doble pago** al reenviar (708-709).
- **Recomendación:** persistir el estado del lote (colección Mongo con fila/estado/{pendiente,enviada-sin-receipt,fallida,confirmada,txHash}), corregir la EARS a «persistir», y exigir verificación on-chain (getFlow) antes de reenviar una fila dudosa.

---

## 5. PLAN DE ACCIÓN

### Quick wins (S) — pequeñas y sin decisión (aplicables de inmediato)
1. AC-04: reescribir A7 + Gherkin de revert (sin «Reintentar»).
2. AC-12: reformular precondición 4 de CU-12 — CC pre-deploy; los 10.000 BRLT se mintean post-deploy (CU-02/owner), cerrando la ambigüedad con H-36.
3. AC-17/AC-22: alinear matriz §6 ↔ trazabilidades filas a fila (CU-03 + RF-02/03/18; retachar H-17/RNF-03 de CU-11…) y añadir criterio a RNF-04.
4. AC-20: definir oráculo del check de address (`eth_getCode` + `decimals()==18` + existencia de `getFlow`) y el mecanismo de reversión de config.
5. AC-21: decidir eliminar «en_flujo» o definir cuándo se establece (se propone derivable, no persistido).
6. AC-18: añadir escenario Gherkin a los 6 alternativos listados.
7. AC-09 (parte): corregir la EARS del lote; persistir el estado del lote con estados por fila y verificación contra `getFlow` antes de reenviar (anti doble pago).

### Requieren decisión del director (bloques de preguntas)
- **Bloque 1:** AC-01 (mechanismo de retiro del empleado), AC-02 (semántica del settle), AC-06 (transferencia de ownership en el deploy).
- **Bloque 2:** AC-05 (modelo de estados de flujos programados/terminados: cancelado + ejecutado + fuente de terminados), AC-03 (atomicidad y endurecimiento del cambio de wallet), AC-23 (superposición de flujos por empleado).
- **Bloque 3:** AC-07 (H-14: robustez/pausa de emergencia dentro de v1 o diferido), AC-08 (parámetros de sesión: TTL, rate-limit, revocación inmediata), AC-10 (GDPR: eliminar vs anonimizar + ventana de retención).
- **Resto (MEDIAS) tratables en el documento técnico de Fase 2:** AC-11 (job de reconciliación + respaldo Mongo), AC-13 (plan B de gas y sucesión), AC-14 (SLA de firmas + responsable alterno), AC-15 (gestión de lista blanca), AC-16 (tope de mint), AC-19 (variantes día/mes), AC-25, AC-24.

---

*Fin del informe. IDs AC-01…AC-25 son la referencia de la auditoría de casos de uso; H-01…H-37 siguen siendo los del informe de documentación V1.*
