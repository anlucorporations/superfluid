# INFORME DE AUDITORÍA — `documento_tecnico.md` (V1)

- **Proyecto:** superfluidv2 — nómina en streaming BRLT sobre Besu Codecrypto 81234.
- **Documento auditado:** `RepoTecnico/documento_tecnico.md` (13 secciones).
- **Fuentes de contraste:** `requerimientos.md` (RF-01..RF-21, RNF-01..RNF-09, RT-01..RT-08),
  `casos_uso.md` (CU-01..CU-16), `diccionario_datos.md`, `INFORME_OPTIMIZACION_V1.md` (H-01..H-37)
  e `INFORME_AUDITORIA_CASOS_USO_V1.md` (AC-01..AC-25).
- **Fecha:** 2026-11-01.
- **Alcance:** coherencia interna, trazabilidad con requerimientos, viabilidad técnica en EVM,
  seguridad, datos y operación. No sustituye una auditoría de código ni de contratos.

---

## 1. VEREDICTO

**APTO CON RESERVAS MENORES.** El documento ya no tiene contradicciones bloqueantes: la
liquidación perezosa, el cobro del empleado, el ownership atómico, los estados programados y
la sesión están decididos y son implementables. Quedan reservas operativas (proveedor de
MongoDB, block time real y cutover) que no impiden iniciar la Fase 3.

---

## 2. HALLAZGOS Y ESTADO

| ID | Severidad | Hallazgo | Estado |
|---|---|---|---|
| DT-01 | Alta | §5.2 dejaba abierta la regla de prolongación de `endsAt` al pausar, lo que hacía ambiguo el devengo. | **Corregido**: se adopta prolongar `endsAt` por el tiempo pausado y se añade `pausedAt` al struct. |
| DT-02 | Alta | §2 describía la sesión como «cookie httpOnly de corta vida», sin valores ni CSRF. | **Corregido**: 2 h admin / 8 h empleado, nonce 5 min, rate-limit 5/15, SameSite=Strict y CSRF double-submit. |
| DT-03 | Media | §5.2 no distinguía «vencido pendiente de liquidación» de «terminado». | **Corregido**: estados observables explícitos y transición solo por `settleFlow`/`deleteFlow`. |
| DT-04 | Media | §5.3 no incluía `changeReceiver`, aunque CU-03 exige atomicidad. | **Corregido**: función añadida a la ABI y explicada. |
| DT-05 | Media | §7 no tenía colección para el historial de terminados ni para la allowlist. | **Corregido**: `flows_history` y `admin_allowlist` añadidas; `scheduled_flows` con enum AC-05. |
| DT-06 | Media | §5.1 no acotaba el mint ni el approval. | **Corregido**: tope de 50.000.000 BRLT (AC-16) y approval acotada al monto. |
| DT-07 | Media | §9 no definía job de reconciliación, backup ni plan B de gas. | **Corregido**: job cada 5 min, backup diario con restauración trimestral y firma por el responsable alterno. |
| DT-08 | Baja | §13 citaba RF-01..RF-20 y CU-01..CU-15. | **Corregido**: RF-01..RF-21 y CU-01..CU-16. |
| DT-09 | Baja | Faltaba cobertura explícita de GDPR (retención) y de la ventana de retiro. | **Corregido**: borrado inmediato, anonimización a 30 días, retención anónima 5 años y wallet pseudonimizada hasta 90 días. |
| DT-10 | Baja | El diagrama lógico no mostraba la separación panel/Suite. | **Corregido** en los gráficos de `casos_uso/` (diagrama de contexto y secuencias). |

---

## 3. RESERVAS ABIERTAS (no bloqueantes)

1. **Proveedor y región de MongoDB**: definir Atlas/alternativa y confirmar cifrado en reposo.
2. **Block time real**: medir con `cast` antes de fijar la tasa de refresco definitiva.
3. **Cutover v1 → v2 en Cloud Run**: plan de rollback y ventana de mantenimiento.
4. **CI/cobertura** en los tres remotos.
5. **Pasada ortotipográfica final** (AC-24).
6. **Auditoría de código** de contratos antes de cualquier uso con fondos reales; el proyecto
   es didáctico y opera en una red de práctica.

---

## 4. TRAZABILIDAD DE DECISIONES

| Decisión | Fuente | Sección del documento |
|---|---|---|
| `settleFlow` público y estado «vencido» | AC-02 | §5.2, §5.3, §6 |
| Cobro del empleado (`downgrade`, CU-16/RF-21) | AC-01 | §1, §4.2, §5.3, §6 |
| Ownership Ownable2Step en el deploy | AC-06 | §4.1, §12 |
| Estados `próximo/ejecutado/cancelado/fallido` + `flows_history` | AC-05 | §7, §9, §12 |
| `changeReceiver` atómico + step-up + auditoría | AC-03 | §5.3, §8, §12 |
| Flujos solapados con confirmación | AC-23 | §7, §12 |
| ReentrancyGuard/CEI/Pausable/shortfall | AC-07 | §4.1, §5.3, §9, §12 |
| Sesiones y CSRF | AC-08 | §2, §8, §12 |
| GDPR determinista | AC-10 | §8, §12 |
| Tope de mint, faucet, fórmulas día/mes | AC-16, AC-25, AC-19 | §5.1, §7, §12 |

---

## 5. CONCLUSIÓN

El documento técnico queda **congelado como base de la Fase 3**, con las reservas de la
sección 3 registradas en `estado_proyecto.md`. Cualquier cambio posterior de alcance debe
volver a `requerimientos.md` y `casos_uso.md` antes de tocar la implementación.
