# 06 · Diagrama relacional

## Modelo de datos

### Entidades y relaciones (MongoDB)
#### Descripción textual

- `employees` n:1 → `projects` (`proyectoId` opcional; baja de proyecto bloqueada si
  tiene empleados).
- `employees` 1:n → `flows` (`employeeId` opcional; el flujo también se encuentra por
  `receiverLower` sin depender del vínculo).
- `employees` 1:n → `scheduled_flows` (programación de nómina, CU-05).
- `flow_batches` 1:n → `flows` (`batchId` marca los flujos ya creados del lote).
- `flows` 1:n → `flows_history` (por `flowId`, extraído de los eventos del tx).
- `sessions` ↔ `employees` (por `employeeId`) y ↔ `admin_allowlist` (por wallet).
- `audit_events` → actor (`actorWallet`) y `empleadoId` opcional; `txHash` al recibo.
  Además de historia, cumple función de **acumulador** del tope de downgrade: los eventos
  con `meta.operacion="cobro"` y `meta.amount` suman el gasto acumulado de un receptor
  (`web/src/lib/downgrade-limit.ts:39-63`).
- `job_runs` es independiente (telemetría de operación).

```mermaid
erDiagram
    PROJECTS ||--o{ EMPLOYEES : "proyectoId"
    EMPLOYEES ||--o{ FLOWS : "employeeId / receiverLower"
    EMPLOYEES ||--o{ SCHEDULED_FLOWS : "employeeId"
    FLOW_BATCHES ||--o{ FLOWS : "batchId"
    FLOWS ||--o{ FLOWS_HISTORY : "flowId"
    EMPLOYEES ||--o{ SESSIONS : "employeeId"
    ADMIN_ALLOWLIST ||--o{ SESSIONS : "walletLower"
    EMPLOYEES ||--o{ AUDIT_EVENTS : "empleadoId"

    EMPLOYEES { string _id string nombre string wallet string walletLower string estado json datosPersonales date borroSolicitadoAt }
    FLOWS { string flowId string receiverLower string estado string flowRate date endsAt string paid }
    FLOWS_HISTORY { string key string evento string txHash int logIndex }
    SCHEDULED_FLOWS { string estado int periodo date fechaInicio }
    FLOW_BATCHES { string estado int total int completados }
    AUDIT_EVENTS { string accion string actorWallet string txHash }
    JOB_RUNS { string job bool ok string trigger }
    SESSIONS { string tokenHash date expiresAt date revokedAt }
```

## Relación con la cadena

### Doble registro
#### Reglas

- MongoDB **nunca** se usa como fuente de verdad de flujos: `reconcile_flows` reescribe
  derivas y el espejo `flows_history` se re-lee desde `deployBlock` si se pierde.
- Un `changeReceiver` on-chain cierra un `flowId` y abre otro: ambos quedan en `flows`
  ligados al mismo empleado (el histórico conserva ambos `flowId`).
- El tope de downgrade del 80% se calcula **cruzando** `flows` (suma de `deposited`
  reconciliada del contrato) con `audit_events` (gasto acumulado): si el espejo de
  auditoría se pierde, `downgradeUsado` caería a 0 hasta re-sincronizar — el tope vuelve
  a ampliarse con lo no registrado; úsese con esa salvedad en mente (pendiente de
  confirmar si el reconciliador reconstruye cobros históricos).

---

*Actualizado 2026-11-17 · commit aab670e*
