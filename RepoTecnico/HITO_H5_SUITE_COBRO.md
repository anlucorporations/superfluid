# Hito H5 — Suite del Empleado y cobro autónomo

> **Estado: ✅ Cerrado (2026-11-04).** El empleado consulta sus flujos y balances on-chain
> en tiempo real, cobra con `downgrade` (BrltX → BRLT) sin intervención del admin, liquida
> sus flujos vencidos con `settleFlow`, gestiona su consentimiento GDPR y conserva acceso
> de solo retiro 90 días tras la baja. Verificado con 41 tests unitarios, build de 36 rutas
> y un smoke E2E contra la Besu real.

## Alcance entregado

| Área | Entregado |
|---|---|
| Datos on-chain | `GET /api/suite/me` ampliado: balances (`balanceOf`, `getRealtimeBalance`) y flujos propios reconciliados (índice `receiverLower`). |
| Cobro (CU-16 · RF-21 · AC-01) | `downgrade` firmado por el empleado en el navegador, parcial o total; botón «Todo» con el saldo exacto. Funciona incluso con el contrato pausado. |
| Liquidación (AC-02) | Botón «Liquidar» para flujos vencidos: `settleFlow` público; lo acumulado se acredita como BrltX cobrable. |
| Auditoría verificada | `POST /api/suite/actions` lee el recibo real (`eth_getTransactionReceipt`), exige como firmante la wallet de sesión y valida el evento (`Downgraded` / `FlowSettled` con wallet receptora). Un txHash falso da 422. |
| Perfil (CU-15) | Email y teléfono editables; alta y retirada de consentimiento con fecha (AC-10). |
| Borrado (AC-10) | `POST /api/suite/erase`: borrado inmediato de datos personales + `borroSolicitado`; anonimizado a 30 días pendiente del job de H6. |
| Retiro tras la baja | Login SIWE de la Suite aceptado mientras `deactivatedAt < 90 días`; con la ficha baja, la Suite muestra aviso y mantiene cobro y borrado. |
| Refresco | Polling de 5 s en la Suite (RF-08); los estados llegan siempre reconciliados con BrltX. |

## Flujo operativo

```text
Empleado ( SIWE suite )
   │
   ├── GET /api/suite/me ──► ficha + balances on-chain + flujos reconciliados
   │
   ├── Cobro:    downgrade(BrltX) ──► POST /api/suite/actions (verifica Downgraded)
   ├── Vencido:  settleFlow(flowId) ──► POST /api/suite/actions (verifica FlowSettled)
   │
   └── Perfil:   PATCH /api/suite/profile (datos + consentimiento)
                 POST  /api/suite/erase (borrado inmediato)
```

## Verificación

### Tests unitarios (41)

| Suite | Casos |
|---|---|
| `tests/rates.test.ts` | 10 — tasas, residuo, BRLT ↔ wei, proyecciones. |
| `tests/validation.test.ts` | 11 — wallets, importes, periodos, defaults, firma de allowlist. |
| `tests/eip712.test.ts` | 6 — dominio, recuperación de firmantes, manipulación. |
| `tests/flows.test.ts` | 14 — derivación de estado, formatos, esquemas de H4 y **nuevos** `suiteProfileSchema` / `suiteActionSchema` (H5). |

```text
Test Files  4 passed (4)
Tests       41 passed (41)
```

### Build

```text
npm run typecheck  → sin errores
npm run build      → 36 rutas (11 estáticas + 25 dinámicas), OK
```

Rutas nuevas: `/api/suite/profile`, `/api/suite/erase` y `/api/suite/actions`
(verificación de recibo), además del `/api/suite/me` ampliado.

### Smoke E2E real (`npm run smoke:h5`)

MongoDB en memoria + `next start` + **Besu 81234 real**. Admin firma con su clave de
`sc/.env`; el empleado usa una wallet efímera que recibe 0,1 CC de gas.

1. Admin: SIWE + `system_config` con addresses reales + empleado creado.
2. `approve` + `wrapAndCreateFlow` real → **flujo #11** (10 BRLT / 6 días).
3. Pausa inmediata: la liquidación parcial del tramo acredita BrltX al empleado
   (`getRealtimeBalance` > 0) y la Suite lo muestra con su flujo.
4. `ethers` con ABI de eventos: un txHash inventado da 422 `tx_no_verificada`.
5. `downgrade(total)` firmado por el empleado → 200; la Suite muestra BRLT exacto en
   cartera y BrltX = 0. Cobro auditado con evento verificado.
6. `settleFlow` sobre flujo pausado/no vencido → rechazado por la cadena (AC-02 solo
   cubre vencidos).
7. Perfil: email/teléfono guardados; consentimiento aceptado con fecha; borrado
   inmediato (`datosPersonales = {}`, `borroSolicitado = true`).
8. Baja del empleado → sesión revocada (AC-08); re-login SIWE sigue funcionando y la
   Suite mantiene acceso de solo retiro.
9. Terminación del flujo por el admin; escrow 0 y auditoría con `cobro` y
   `solicitud_borrado`.

```text
[smoke:h5] Suite OK (BrltX 0.00011574074074074 BRLT) ✓
[smoke:h5] auditoría verifica el evento on-chain (tx falso 422) ✓
[smoke:h5] downgrade de 0.00011574074074074 BRLT verificado ✓
[smoke:h5] settleFlow no vencido rechazado (AC-02: solo vencidos) ✓
[smoke:h5] perfil actualizado ✓
[smoke:h5] consentimiento GDPR ✓
[smoke:h5] borrado inmediato de datos personales ✓
[smoke:h5] retiro tras la baja: re-login SIWE y Suite accesible ✓
[smoke:h5] flujo terminado y remanente devuelto ✓
[smoke:h5] auditoría con cobro y borrado ✓
[smoke:h5] TODO OK
```

Los smoke de H3 y H4 siguen verdes; los flujos de prueba quedaron terminados de
propio con escrow final 0.

## Decisiones de implementación

1. **La auditoría prueba lo que pasó.** `verifyWalletAction` compara `tx.from` con la
   wallet de la sesión y exige el evento correcto de BrltX; sin verificación no se
   registra nada. El cliente no puede falsear su cobro.
2. **Cobro = BrltX en cartera.** El devengo en curso no es aún BrltX del empleado: se
   acredita con las liquidaciones del contrato (terminación, liquidación, pausas y
   cambios). La Suite muestra “cobrable ahora” (BrltX) y “con devengo”
   (`getRealtimeBalance`).
3. **receiverLower como índice.** `flows.receiverLower` permite listar los flujos de una
   wallet sin depender del `employeeId` (que puede no estar vinculado), y se mantiene
   al reconciliar con `getFlow` (incluidos los `changeReceiver`).
4. **ABI completa de eventos.** `BRLTX_ABI` incluye `FlowCreated/Updated/Settled/
   Deleted/Expired`, `Upgraded/Downgraded` y `DurationAllowed`, necesarias tanto para
   extraer `flowId` de los recibos (H4) como para verificar acciones del empleado (H5).
5. **Retiro con ventana, no con jurisdicción.** El login de Suite se deniega si
   `deactivatedAt` supera los 90 días; dentro de la ventana se permite re-login y
   cobro aunque la ficha siga baja.
6. **Borrado inmediato, anonimización diferida.** Borrar hoy vacía datosPersonales y
   marca `borroSolicitado`; el job de anonimización de históricos a 30 días es H6.

## Pendiente / traspaso a H6-H7

- **H6:** job de reconciliación de eventos y `flows_history` (movimientos en la Suite).
- **H6:** job de anonimización a 30 días y `settleFlow` automático de vencidos.
- **H7:** variables reales, `Secure` cookies en HTTPS y standalone en Cloud Run.

## Comandos

```bash
cd web
npm run typecheck
npm test
npm run build
npm run smoke        # H3: identidad y datos
npm run smoke:h4     # H4: ciclo admin contra Besu real
npm run smoke:h5     # H5: Suite del empleado contra Besu real
```
