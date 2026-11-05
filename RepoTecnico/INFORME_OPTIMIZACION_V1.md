# INFORME DE SÍNTESIS — AUDITORÍA DE DOCUMENTACIÓN (RepoTecnico) — V1

- **Proyecto:** superfluidv2 (nómina en streaming BRLT sobre Besu private + Hyperledger vs. Superfluid-style CFA simplificado)
- **Alcance auditado:** solo documentación en `RepoTecnico/` (requerimientos, diccionario_datos, entornos_globales, estado_proyecto, brief de referencia). **No hay código.**
- **Fecha:** 2026-10-30
- **Origen:** 7 lentes de verificación adversarial (R1–R7) + fase de síntesis.

---

## 1. RESUMEN EJECUTIVO

**Veredicto: LA DOCUMENTACIÓN NO ESTÁ APTA EN SU ESTADO ACTUAL PARA AVANZAR A FASE 2.5 (casos de uso); es apta de forma CONDICIONAL** — puede iniciarse Fase 2.5 solo después de cerrar los **3 hallazgos críticos** y los hallazgos altos que definen directamente el comportamiento de los casos de uso (H-04, H-05, H-06, H-07, H-11, H-12). No se evalúa "aptitud para producción" porque no existe código.

| Severidad | Cantidad (tras deduplicación) |
|---|---|
| CRÍTICA | 3 |
| ALTA | 12 |
| MEDIA | 13 |
| BAJA | 9 |
| **Total** | **37** |

La documentación tiene una base estructural sólida ( requisitos, diccionario, entornos, trazas ), pero hay **decisiones pendientes presentadas como resueltas o viceversa** (decimales BRLT, SDK, wrap/unwrap), **la seguridad y privacidad de la Suite no están especificadas**, y la **custodia de claves** — elemento central de un sistema de nómina — está sin definir.

---

## 2. METODOLOGÍA

1. **Fase 1 — Revisión multidimensional:** 7 lentes independientes en paralelo: (R1) Ambigüedad/testabilidad, (R2) Consistencia, (R3) RNF ISO 25010, (R4) Stakeholders, (R5) Trazabilidad con el brief, (R6) Riesgos técnicos, (R7) Seguridad y legal.
2. **Fase 2 — Verificación adversarial:** cada hallazgo fue validado contra evidencia con referencia de línea/archivo; se filtraron falsos positivos, se deduplicaron coincidencias entre dimensiones y se ajustó la severidad al máximo justificado. **Ante la duda, se descartó.**
3. **Fase 3 — Síntesis:** deduplicación final entre dimensiones, asignación de IDs únicos (H-01…), priorización y plan de acción.

**Deduplicaciones principales aplicadas** (hallazgo repetido en varias lentes → un solo ID con la severidad más alta justificada):
- SDK/sdk-core 0.9.0 vs Opción B: R2/ALTA + R5/ALTA → fusionado en H-01 (R6/CRÍTICA).
- Decimales BRLT: R2/ALTA + R5/MEDIA → fusionado en H-04 (R1/ALTA).
- Custodia de claves / SPOF wallet admin: R4/ALTA + R7/CRÍTICA (clave de prueba en sc/.env) → fusionado en H-03 (R6/CRÍTICA).
- Auth SIWE (R7/ALTA) + GDPR/PII (R7/ALTA) + responsable de tratamiento (R4/MEDIA) + TTL de sesión (R7/BAJA) → fusionados en H-02 (R3/CRÍTICA).
- Ciclo de vida de flujos "próximos": R1/MEDIA (máquina de estados) + R2/MEDIA (persistencia) + R6/MEDIA (SLA de firma) → fusionado en H-11 (R3/ALTA, alertas).
- Block time sin medir: R6/MEDIA → fusionado en H-19 (R1/MEDIA).
- MongoDB sin proveedor/respaldo (+ responsable Mongo/GCP R4/BAJA) → fusionado en H-17.

**Límite del informe:** los 37 hallazgos provienen exclusivamente de lo verificado en Fase 1–2; no se añadieron hallazgos nuevos en la síntesis.

---

## 3. TABLA DE HALLAZGOS POR SEVERIDAD

| ID | Área | Título | Severidad |
|---|---|---|---|
| H-01 | Arquitectura | SDK 0.9.0 incompatible con Besu (sin subgraph de The Graph): decisión no documentada | CRÍTICA |
| H-02 | Seguridad/Legal | Seguridad y privacidad de la Suite indefinidas (auth SIWE + PII en MongoDB sin GDPR) | CRÍTICA |
| H-03 | Claves/Custodia | Custodia y propiedad de claves sin política: clave de prueba será owner/minter de nómina; SPOF sin recovery/rotación/sucesión | CRÍTICA |
| H-04 | Modelo de datos | Decimales BRLT contradictorios: "8 dígitos" (brief) vs "pendiente" (diccionario) vs 18 (requerimientos) | ALTA |
| H-05 | RF-03 | Wrap/unwrap "automáticos" vs RF-18 firma manual: sin dueño de firma ni batching ni destino del BRLT al unwrap | ALTA |
| H-06 | CFA/Hidratación | flowRate sin regla de redondeo: diferencia de 1 wei en 771604938271604,938… | ALTA |
| H-07 | CFA | Lista cerrada de operaciones de BrltX indefinida (falta updateFlow, semántica de pausa; excluidas liquidación/SPA) | ALTA |
| H-08 | Fiabilidad | Operaciones multi-paso (wrap→createFlow, deleteFlow→unwrap) sin recuperación de fondos atascados ni idempotencia | ALTA |
| H-09 | Infra | Faucet única fuente de CC (tope 100 CC) sin SLA, plan B ni presupuesto de gas por operación | ALTA |
| H-10 | Infra | RPC público único sin indexador: polling 5 s por usuario no escala; sin presupuesto de llamadas ni degradación | ALTA |
| H-11 | Flujos | Flujos programados sin máquina de estados, persistencia, SLA de firma ni alertas (próximos vencidos; activos con fecha_fin vencida = pago indefinido) | ALTA |
| H-12 | BrltX | Sin requerimiento de eventos on-chain (Transfer + ciclo de flujo): RF-15 inviable con solo lectura de estado | ALTA |
| H-13 | Calidad | Sin requisito de revisión/auditoría interna de Brlt.sol/BrltX.sol (checklist OZ/solhint + tests invariantes) antes del deploy | ALTA |
| H-14 | BrltX | Sin requisitos de robustez: ReentrancyGuard/CEI, Pausable de emergencia, comportamiento ante saldo insuficiente | ALTA |
| H-15 | Stakeholder | Wallet del empleado = credencial + destino de pago, sin caso de uso de pérdida de clave ni cambio de wallet | ALTA |
| H-16 | BrltX | Patrón de propiedad incompleto: Ownable2Step vs AccessControl, matriz de privilegios, semántica de burn, upgrade path; owner sin tope de mint | MEDIA |
| H-17 | Infra | MongoDB crítico sin proveedor/URI/respaldo ni reconciliación BD↔on-chain; instancia compartida con BD del faucet sin definir | MEDIA |
| H-18 | Seguridad | Secretos backend (Mongo URI, GCP) sin política (Secret Manager, mínimo privilegio) | MEDIA |
| H-19 | Infra | Block time QBFT real sin criterio ni medición (RNF-02 no testable) | MEDIA |
| H-20 | Migración | Migración v2 sobre Cloud Run con v1 en producción: sin cutover/rollback ni project_id textual | MEDIA |
| H-21 | UX/RF-16 | Superficie de rechazo indefinida: qué se muestra a wallet no registrada | MEDIA |
| H-22 | Testabilidad | Métricas sin fuente ni fórmula: gasto_previsto (diccionario:82), RF-10 (total flujos/proyección), RNF-04 "en pocos pasos" | MEDIA |
| H-23 | Stakeholder | Baja de empleado sin secuencia de cierre (deleteFlow, cancelar próximos, saldo residual, acceso posterior) | MEDIA |
| H-24 | RF-06 | Envío múltiple sin límite de destinatarios ni lote por gas | MEDIA |
| H-25 | Portabilidad/A11y | Suite sin RNF de portabilidad/accesibilidad (red errónea, wallet_addEthereumChain, WCAG AA, español) | MEDIA |
| H-26 | Mantenibilidad | Sin cobertura mínima de tests para BrltX ni CI en los 3 remotos | MEDIA |
| H-27 | Privacidad | Nómina reconstructible desde RPC público (direcciones + flowRates) | MEDIA |
| H-28 | Trazabilidad | Desviaciones del brief sin anotar: despliegue propio de BrltX, depósito de seguridad del CFA, "creado por el host", deleteFlow=pausa y 2000/mes obsoletos | MEDIA |
| H-29 | Estructura | RT-07 estructura web/ sin src/ vs rutas canónicas web/src/ | BAJA |
| H-30 | Estructura | estado_proyecto.md con defectos de edición (header "Fase 1 en curso" vs cerrada, doble sección pendientes, ✅ parcial) | BAJA |
| H-31 | Modelo | Proyecto.presupuesto sin base documentada | BAJA |
| H-32 | CFA | Balance insuficiente de Brltx (shortfall) sin RF de validación previa | BAJA |
| H-33 | Stakeholder | Operador de red/faucet actor implícito sin rol ni contingencia | BAJA |
| H-34 | Soporte | Sin canal de soporte de incidencias definido | BAJA |
| H-35 | Infra | Besu v24.12.0 ausente de RT-03 | BAJA |
| H-36 | Tokenomics | Origen de los 10.000 BRLT bootstrap sin ruta decidida (mint del owner vs faucet) | BAJA |
| H-37 | UI/Legal | Sin disclaimers de token educativo en UI | BAJA |

---

## 4. HALLAZGOS CRÍTICOS Y ALTOS DETALLADOS

### H-01 · CRÍTICA — SDK 0.9.0 incompatible con la opción técnica elegida
- **Evidencia:** RT-06/RNF-3 exigen `sdk-core 0.9.0` (requerimientos:43,57; brief:284-295), pero sdk-core opera contra el subgraph de The Graph, que no existirá en Besu private (Opción B). Sin decisión documentada.
- **Recomendación:** registrar una decisión (ADR) que sustituya el read del SDK por lectura directa RPC/eventos, tachando la RT afectada; dejar trazada la alternativa y su justificación.

### H-02 · CRÍTICA — Seguridad y privacidad de la Suite indefinidas
- **Evidencia:** no existe RNF de seguridad de la Suite: auth por wallet sin SIWE/nonce/expiración (R7: sin `ecrecover`/domain-binding verificada en backend, autorización del panel admin sin definir: ¿quién es admin para leer Mongo?) y `datos_personales` en MongoDB con Cloud Run en europe-west1 (UE) sin cifrado, base legal, aviso, retención ni DPA (GDPR/LOPDGDD). Merged: TTL/revocación/rate limiting (R7/BAJA) y responsable de tratamiento (R4/MEDIA).
- **Recomendación:** añadir RNF de seguridad: SIWE verificado en backend + nonce + expiración + matriz de roles para el panel; RNF de protección de datos: cifrado, minimización, retención, aviso de privacidad, DPA con GCP.

### H-03 · CRÍTICA — Custodia y propiedad de claves sin política
- **Evidencia:** la clave de prueba de `sc/.env` ("solo educativo", entornos:39) sería owner/minter del sistema de nómina, con arranque por defecto ownable; sin recuperación/rotación/sucesión (R6), sin caso de uso de custodia/backup/rotación (R4); no se separa clave de deploy vs wallet admin.
- **Recomendación:** definir política de custodia: clave de deploy distinta del owner, proteger owner/minter con Ownable2Step o AccessControl, backup verificado, rotación y procedimiento de sucesión; condición bloqueante para cualquier deploy.

### H-04 · ALTA — Decimales BRLT contradictorios
- **Evidencia:** diccionario:11 "pendiente de decidir" y brief:49 "8 dígitos" vs decisión de 18 decimales en requerimientos:18.
- **Recomendación:** fijar 18 (o decisión explícita) en diccionario y brief; cualquier valor afecta flowRate, UI y presupuestos de gas.

### H-05 · ALTA — RF-03 wrap/unwrap sin dueño de ejecución
- **Evidencia:** "automáticos" (RF-03) vs RF-18 firma manual (requerimientos:20,35,96-97); sin definición de quién firma el wrap, si hay batching, ni el destino del BRLT al unwrap (R2/MEDIA fusionado).
- **Recomendación:** resolver con decisión: firma del empleado (wallet), batching opcional documentado, y destino del saldo al unwrap (wallet del empleado).

### H-06 · ALTA — flowRate sin regla de redondeo
- **Evidencia:** cociente exacto 771604938271604,938…; 1 wei de diferencia brief:186 vs diccionario:19. Sin regla de truncado/rounding definida.
- **Recomendación:** especificar regla (truncado a wei en la dApp y en el contrato) y el actor que la aplica para que RF y diccionario coincidan.

### H-07 · ALTA — Lista cerrada de operaciones de BrltX indefinida
- **Evidencia:** el CFA simplificado no enumera las operaciones soportadas: falta updateFlow, semántica de pausa; excluidas liquidación y SPA (R1).
- **Recomendación:** cerrar la lista de operaciones del CFA simplificado y sus precondiciones, como base directa de los casos de uso.

### H-08 · ALTA — Multi-paso sin recuperación ni idempotencia
- **Evidencia:** wrap→createFlow y deleteFlow→unwrap sin recuperación de fondos atascados ni idempotencia (R3).
- **Recomendación:** añadir RF/RNF de idempotencia y flujo de recuperación (reintentos, registro de pasos, desbloqueo manual administrativo).

### H-09 · ALTA — Faucet como único punto de abastecimiento
- **Evidencia:** única fuente de CC con tope de 100 CC, sin SLA/plan B ni presupuesto de gas por operación (R6/R3).
- **Recomendación:** definir contingencia y presupuesto de gas estimado por operación (wrap, createFlow, updateFlow, deleteFlow).

### H-10 · ALTA — RPC único sin indexador ni presupuesto de llamadas
- **Evidencia:** RPC público único, polling de 5 s por usuario no escala, sin presupuesto de llamadas ni estrategia de degradación (R6/R3).
- **Recomendación:** definir presupuesto de polling por usuario, backoff y plan de indexador si el número de empleados crece.

### H-11 · ALTA — Ciclo de vida de flujos programados incompleto
- **Evidencia:** estado "próximo" sin máquina de estados (R1), sin dueño de persistencia (no on-chain, no asignado a Mongo: diccionario:57,68-71,97-100), sin SLA de firma del admin ni responsable alternativo (R6), sin alertas de vencidos ni de flujos activos con fecha_fin vencida (pago indefinido, R3).
- **Recomendación:** definir máquina de estados (programado→próximo→activo→finalizado/cancelado), persistencia en Mongo con TTL y job de reconciliación, SLA de firmas + responsable alterno, y alertas automáticas.

### H-12 · ALTA — BrltX sin eventos on-chain
- **Evidencia:** sin requerimiento de eventos (Transfer + ciclo de flujo); RF-15 (flujos terminados) inviable con solo lectura de estado (R3).
- **Recomendación:** introducir en el RF del contrato el requisito de emitir eventos y consumirlos desde la Suite.

### H-13 · ALTA — Sin revisión/auditoría interna de contratos
- **Evidencia:** no hay requisito de checklist OZ/solhint + tests invariantes para Brlt.sol/BrltX.sol antes del deploy (R7).
- **Recomendación:** añadir RNF: revisión interna documentada y suite de invariantes como condición previa al despliegue.

### H-14 · ALTA — BrltX sin requisitos de robustez
- **Evidencia:** no se exige ReentrancyGuard/CEI, Pausable de emergencia ni comportamiento ante saldo insuficiente (R7). Incluye la necesidad de parada de emergencia (R3).
- **Recomendación:** RF del contrato con robustez explícita y semántica de pausa (enlace con H-07).

### H-15 · ALTA — Wallet del empleado: pérdida y cambio sin especificar
- **Evidencia:** wallet = credencial + destino de pago; sin caso de uso de pérdida de clave ni cambio de wallet con validación antifraude y manejo de flujos activos (R4).
- **Recomendación:** crear casos de uso "pérdida de wallet" y "cambio de wallet" con verificación de identidad, control de flujos activos y auditoría.

---

## 5. RNF FALTANTES (ISO 25010)

- **Seguridad:** autenticación SIWE verificada + expiración + roles admin; protección PII (cifrado, retención); tope de mint y matriz de privilegios del owner; robustez del contrato (H-02, H-03, H-14, H-16).
- **Fiabilidad:** idempotencia y recuperación multi-paso; degradación/backoff RPC y faucet; alertas y parada de emergencia; backups Mongo y reconciliación (H-08, H-09, H-10, H-11, H-17).
- **Mantenibilidad:** cobertura mínima de tests de BrltX y CI en los 3 remotos (H-26).
- **Portabilidad y Usabilidad (accesibilidad):** red incorrecta (wallet_addEthereumChain), WCAG AA, idioma español (H-25).
- **Eficiencia/Rendimiento:** presupuesto de polling/llamadas RPC y de gas por operación; límites de lote en envío múltiple (H-09, H-10, H-24).
- **Testabilidad/medible:** cifras de RNF sin criterio (H-19, H-22).

## 6. STAKEHOLDERS FALTANTES

- **Administrador/owner del contrato:** custodia, backup, rotación, sucesión (H-03).
- **Empleado como titular de wallet:** pérdida y cambio de wallet (H-15) y baja con secuencia de cierre (H-23).
- **Responsable de tratamiento de datos** para `datos_personales` y matriz de visibilidad (H-02).
- **Operador de red/faucet:** actor implícito sin rol, SLA ni contingencia (H-09, H-33).
- **Canal de soporte** de incidencias y **responsable de MongoDB/GCP** (H-17, H-34).

## 7. PLAN DE ACCIÓN

### Quick wins (S) — 1–2 días
1. Corregir decimales BRLT a la decisión ya adoptada en requerimientos (H-04) → corrige diccionario/brief; insumo: datos del dominio para los casos de uso.
2. Añadir regla de redondeo de flowRate (H-06) → diccionario consistente; insumo: reglas de negocio Gherkin.
3. Corregir RT-07 a `web/src/` (H-29) y limpiar estado_proyecto.md (H-30) → trazabilidad estructural de la Fase 1.
4. Anotar desviaciones del brief como "superadas/decididas" (H-28) → tabla de trazabilidad del documento técnico.
5. Añadir Besu v24.12.0 a RT-03 (H-35) y fijar base de Project.presupuesto (H-31) → insumos de RT.
6. Añadir disclaimers educativos en la UI (H-37) → requisito literal para RF de UI.

### Mejoras (M) — 1–2 semanas
1. **ADR que liquide H-01 (SDK):** decisión documentada con justificación técnica → insumo: RT corregida + conclusión de herramienta en Fase 2.5.
2. **RFC RF-03/CFA (H-05, H-07, H-16):** qué firma el wrap, batching, destino del unwrap, lista cerrada de operaciones, patrón de propiedad + tope de mint → insumo: actores y flujos alternos de los casos de uso.
3. **Especificar máquina de estados de flujos (H-11):** persistencia, SLA de firma, alertas → insumo: estados y transiciones de los casos de uso.
4. **Requerir eventos on-chain (H-12):** Transfer + ciclo de flujo y consumo en Suite → insumo: flujo RF-15 con fuente de datos real.
5. **Checklist de robustez del contrato (H-13, H-14):** guardas, pausa, saldo insuficiente, revisión interna previa → insumo: requisitos del contrato y criterios de aceptación.
6. **RNF de seguridad y privacidad (H-02, H-27, H-18):** SIWE, roles admin, protección PII, Secret Manager → insumo: casos de uso de administración y flows de seguridad.
7. **Casos de stakeholders (H-15, H-23):** pérdida/cambio de wallet y baja de empleado → insumo directo de 3 casos de uso nuevos para Fase 2.5.
8. **Criterios medibles (H-19, H-22, H-24):** block time medido, fórmula de gasto_previsto, fuente de RF-10, límites de lote → insumo: criterios de aceptación testables (formato EARS).

### Roadmap (L) — post-Fase 2.5
1. Contingencia faucet + presupuesto de gas (H-09) → validaciones en casos de uso de fondos.
2. Estrategia RPC/indexador con presupuestos y degradación (H-10, H-27) → decisiones de arquitectura del documento técnico.
3. Proveedor/backup Mongo + reconciliación BD↔on-chain (H-17) → RNF y datos de soporte del documento técnico.
4. Plan de migración v2: cutover/rollback y project_id (H-20) → manual de despliegue.
5. Idempotencia y recuperación multi-paso (H-08) → casos de uso de excepción.
6. Portabilidad/accesibilidad (H-25) y mantenibilidad/CI (H-26) → RNF medibles del técnico.
7. Recorrer RF-16 (UX de rechazo) (H-21) → caso de uso de rechazo explícito.
8. Shortfall del Brltx (H-32), origen de los 10.000 BRLT (H-36), operador de red y soporte (H-33, H-34) → casos de uso de extremos y cadena de soporte.
9. Custodia completa de claves (H-03) → bloqueante documentado: se formaliza antes de cualquier deploy (no de Fase 2.5).

---

*Fin del informe. Los IDs H-01…H-37 son la referencia canónica de hallazgos para Fase 2.5 y el documento técnico.*
