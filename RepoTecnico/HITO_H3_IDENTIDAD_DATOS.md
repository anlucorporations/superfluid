# Hito H3 — Identidad, datos y CRUD administrativo

> **Estado: ✅ Cerrado (2026-11-04).** Panel admin y Suite del Empleado con SIWE real,
> MongoDB persistente, CRUD completo, cambio de wallet con doble firma EIP-712 y
> auditoría. Verificado con 27 tests unitarios y un smoke E2E contra `next start` +
> MongoDB en memoria.

## Alcance entregado

| Área | Entregado |
|---|---|
| Proyecto web | Next.js 15.5.29 (App Router), React 19, TypeScript estricto, Tailwind 3, ethers 5.7.2, MongoDB 6, Zod, Vitest. |
| Identidad | SIWE admin/empleado con nonce de un uso (5 min), sesión opaca (2 h / 8 h), rate limit 5/15 min, CSRF double-submit, revocación inmediata. |
| Datos | `employees`, `projects`, `system_config`, `admin_allowlist`, `siwe_nonces`, `sessions`, `audit_events`, `auth_ratelimits` con índices y TTL. |
| CRUD | Empleados (alta, edición, baja/reactivación, cambio de wallet) y proyectos (alta, edición, baja bloqueada si tiene empleados). |
| Cambio de wallet | Autorización EIP-712 de la wallet nueva + step-up de la admin, nonce ligado, actualización atómica en MongoDB, revocación de la sesión anterior y evento de auditoría. |
| Allowlist | Alta con confirmación firmada por la wallet nueva; revocación con bloqueo del último admin activo (AC-15). |
| Sistema | Addresses BRLT/BrltX, RPC, bloque de deploy, tasa de refresco y faucet; guardado validado con `eth_chainId` = 81234 y `eth_getCode`. |
| UI | Login admin/Suite, resumen, empleados, proyectos, sistema, auditoría y Suite del Empleado con proyecciones. |

## Estructura

```
web/
├── src/app/
│   ├── api/            # rutas REST (auth, employees, projects, allowlist, system, audit, suite, health)
│   ├── admin/          # layout protegido + resumen, empleados, proyectos, sistema, auditoría
│   ├── suite/          # login y Suite del Empleado
│   └── login/          # acceso admin
├── src/components/     # LoginFlow y componentes UI
├── src/lib/
│   ├── auth.ts         # sesiones, cookies, CSRF, revocación
│   ├── siwe.ts         # mensaje y verificación SIWE
│   ├── eip712.ts       # dominio/tipos del cambio de wallet y step-up
│   ├── rates.ts        # flowRate con floor, periodos, BRLT ↔ wei
│   ├── validation.ts   # esquemas Zod
│   └── repositories/   # acceso a MongoDB + auditoría + rate limit
├── scripts/            # seed, dev:mem, smoke E2E
└── tests/              # Vitest
```

## Verificación

### Tests unitarios (27)

| Suite | Casos |
|---|---|
| `tests/rates.test.ts` | 10 — flowRate 2000 BRLT/30 d = 771604938271604 wei/s, residuo, parseo/formato BRLT, proyecciones. |
| `tests/validation.test.ts` | 11 — wallets, importes, periodos, defaults, tasa de refresco, firma de allowlist. |
| `tests/eip712.test.ts` | 6 — dominio, recuperación de firmantes, manipulación de wallet/nonce. |

```text
Test Files  3 passed (3)
Tests       27 passed (27)
```

### Smoke E2E (`npm run smoke`)

MongoDB en memoria + `next start` + wallets efímeras de ethers:

1. Login SIWE admin (200, rol `admin`).
2. Petición sin CSRF rechazada con 403.
3. Proyecto y empleado creados (201) con lookup de proyecto.
4. Cambio de wallet con firma EIP-712 del empleado + step-up admin (200).
5. Reutilización del nonce rechazada con 401 `nonce_invalido`.
6. Intento de revocar el último admin rechazado con 409 `ultimo_admin`.
7. Login SIWE del empleado (200, rol `empleado`) y `/api/suite/me` correcto.
8. Auditoría con eventos `login`, `alta`, `cambio_wallet`.
9. Logout revoca la sesión (401 posterior).

```text
[smoke] login admin → 200 admin
[smoke] CSRF obligatorio ✓
[smoke] empleado creado ✓
[smoke] cambio de wallet con doble firma ✓
[smoke] nonce de un solo uso ✓
[smoke] protección del último admin ✓
[smoke] login suite → 200 empleado
[smoke] Suite del empleado ✓
[smoke] auditoría con 5 eventos ✓
[smoke] logout y revocación ✓
[smoke] TODO OK
```

### Build

```text
npm run typecheck  → sin errores
npm run build      → 26 rutas (10 estáticas + 16 dinámicas), OK
```

## Decisiones de implementación

1. **Sesión opaca, no JWT:** el token vive en la cookie HttpOnly; en MongoDB solo su hash.
   Permite revocación inmediata al dar de baja o cambiar la wallet de un empleado.
2. **Nonces con propósito:** `admin`, `suite` y `wallet_change`. El de wallet se liga a la
   wallet nueva y no sirve para iniciar sesión.
3. **Statement SIWE ASCII:** el parser EIP-4361 rechaza acentos; los textos se redactaron
   sin tildes.
4. **Cambio de wallet en dos fases:** H3 actualiza MongoDB + auditoría; la transacción
   on-chain `changeReceiver` se firma en el navegador en H4. La UI de H3 ya recoge ambas
   firmas EIP-712.
5. **Allowlist sin auto-bloqueo:** la revocación se rechaza si dejaría cero admins activos
   (AC-15 / CU-11 A5).
6. **Configuración validada en servidor:** no se persiste un RPC con chainId distinto ni
   addresses sin código (`eth_getCode`).
7. **Rate limit en MongoDB:** ventana fija atómica; suficiente para una instancia de Cloud
   Run. Si H7 escala a varias instancias, se sustituirá por un almacén compartido (ya lo es
   MongoDB) o Memorystore.

## Pendiente / traspaso a otros hitos

- **H2:** desplegar en Besu 81234 y registrar addresses en `system_config` (bloqueado por
  wallet financiada).
- **H4:** firmar `changeReceiver` on-chain tras el cambio de wallet administrativo y
  vincular flujos a la wallet vigente.
- **H4/H5:** saldo en tiempo real, creación/pausa/terminación de flujos y cobro desde la
  Suite.
- **H6:** reconciliación de eventos, `flows_history` y `flujos_programados`.
- **H7:** build `standalone` en Cloud Run, variables de entorno reales y cookies `Secure`
  servidas por HTTPS.

## Comandos

```bash
cd web
npm run typecheck
npm test
npm run build
npm run smoke
```
