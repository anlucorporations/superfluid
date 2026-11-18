# Clear Signing — Mensajes personalizados de la billetera

> Proyecto: Superfluid Brlt (ANLU corporations) · Red Besu Codecrypto (chainId 31337)
> Actualizado: 2026-11-18 · Aplica desde el commit de personalización de mensajes.
> Regla de redacción del proyecto (obligatoria): profesional + coloquial + concreto.
> Objetivo: eliminar la firma a ciegas. Cada mensaje explica qué hace, para qué,
> quiénes participan, el impacto real (fondos/permisos/gas) y el riesgo.

---

## 1. Inventario de puntos de firma (auditoría del código real)

| # | Punto de firma | Código | Estándar | Categoría | ¿Mueve fondos? |
|---|---|---|---|---|---|
| 1 | Entrada única /entrar (admin o empleado) | `web/src/components/EntryLogin.tsx:69` | SIWE (EIP-4361) vía `personal_sign` | `[AUTH]` | No |
| 2 | Login admin dedicado `/login` | `web/src/components/AdminLoginFlow.tsx` | SIWE (EIP-4361) | `[AUTH]` | No |
| 3 | Login empleado dedicado `/suite/login` | `web/src/components/LoginFlow.tsx` | SIWE (EIP-4361) | `[AUTH]` | No |
| 4 | Alta de wallet en allowlist (CU-11) | `web/src/app/admin/sistema/page.tsx` + `/api/admin/allowlist/challenge` | SIWE (EIP-4361) | `[AUTH]` | No |
| 5 | Autorización de wallet nueva (empleado, CU-03 4.i) | `web/src/app/admin/empleados/page.tsx:518` | EIP-712 (`signTypedData_v4`) | `[PERM]` | No |
| 6 | Step-up de cambio de wallet (admin, CU-03 4.ii) | `web/src/app/admin/empleados/page.tsx:545` | EIP-712 (`signTypedData_v4`) | `[PERM]` | No |
| 7 | `approve` BRLT → BrltX (envolver, CU-04) | `web/src/lib/client/contracts.ts` `approveBrlt` | Llamada on-chain ERC-20 | `[PERM]` | No (permite gasto) |
| 8 | `wrapAndCreateFlow` (alta de flujo, CU-05) | `web/src/lib/client/contracts.ts` `createFlow` | Llamada on-chain | `[XFER]` | Sí: envía BRLT al contrato |
| 9 | `updateFlow` (pausar/reanudar/cambiar tasa) | `web/src/lib/client/contracts.ts` | Llamada on-chain | `[GOV]` | Indirecto |
| 10 | `deleteFlow` (terminar flujo) | `web/src/lib/client/contracts.ts` | Llamada on-chain | `[GOV]` | Indirecto |
| 11 | `settleFlow` (liquidar flujo vencido, CU-08) | `web/src/lib/client/contracts.ts` | Llamada on-chain | `[DEFI]` | Acredita BrltX al receptor |
| 12 | `downgrade` (cobro CU-16 / CU-17 tope 80%) | `web/src/lib/client/contracts.ts` `downgradeBrltx` | Llamada on-chain | `[DEFI]` | Sí: quema BrltX y entrega BRLT |
| 13 | `changeReceiver` (cambiar receptor de flujo) | `web/src/lib/client/contracts.ts` | Llamada on-chain | `[GOV]` | Redirige el resto del flujo |

No se detectó `eth_sign` (firma ciega, deprecada): la app no lo usa en ningún flujo. ✅

---

## 2. Mensajes que la wallet muestra (personalizados del proyecto)

### 2.1 SIWE — Entrada a los portales (#1–#3) · Plantilla A `[AUTH]`

Se firman en `/entrar` y en los accesos dedicados. La wallet muestra dominio,
dirección, red y este texto (ASCII, sin acentos por requisito EIP-4361):

```text
Acceder al panel de administracion de Superfluid Brlt. Esta firma solo prueba
que esta wallet es tuya. No mueve fondos ni autoriza gastos.
```

```text
Acceder a tu Portal del Empleado de Superfluid Brlt. Esta firma solo prueba
que esta wallet es tuya. No mueve fondos ni autoriza gastos.
```

- Vigencia: el nonce caduca en 5 minutos (configuración de `nonces`).
- Antes de firmar, la interfaz muestra el resumen (componente `FirmaResumen`):
  wallet, red y hora de caducidad, con la nota "La firma es gratuita".
- Advertencia Ledger/Trezor: el primer bloque cabe en pantalla (~120 caracteres
  por frase; el texto está dividido en frases cortas).

### 2.2 SIWE — Alta de administrador en la allowlist (#4) · Plantilla A `[AUTH]`

```text
Confirmar esta wallet como administradora de Superfluid Brlt. Esta firma no
mueve fondos ni autoriza gastos.
```

Lo firma la wallet candidata (no el admin de sesión). El rol queda registrado
en Mongo tras verificar la firma contra la cadena.

### 2.3 EIP-712 — Cambio de wallet del empleado (#5 y #6) · Plantilla H `[PERM]`

Dominio: `Superfluid Brlt Streaming` v2 · contrato `BrltX`
(`0x6080788bc70756dD3c73b4AF2936D0eeA135bE71`) · red 31337.

Firma 1 — wallet nueva del empleado (`ChangeWallet`):

| Campo | Ejemplo real | Qué significa |
|---|---|---|
| employeeId | `665f…9c2a` | Ficha del empleado en la plataforma |
| oldWallet | `0x942…cEF` | Wallet actual que deja de cobrar |
| newWallet | `0x89D…eBe` | Wallet nueva que recibirá los flujos |
| nonce | `a3f1…` | Código de operación de un solo uso |
| issuedAt | `1763400000` | Hora de emisión (unix) |

La interfaz muestra el resumen antes de firmar: wallet actual → wallet nueva,
código de operación y nota "Autorizas el cambio de wallet del empleado. La
firma es gratuita y caduca."

Firma 2 — step-up del admin (`AdminStepUp`): mismos campos más `action =
"change_wallet"`. La interfaz explica: "Apruebas el cambio de wallet como
segundo firmante. La firma es gratuita y caduca."

Las dos firmas juntas permiten al backend verificar por `ecrecover` que ambas
partes autorizan el cambio (AC-03).

### 2.4 Transacciones on-chain (#7–#13) — texto que acompaña cada petición

La wallet muestra los datos de la llamada; la interfaz del proyecto le pone
lenguaje humano ANTES de firmar (fichas y avisos en /admin y /suite):

| Operación | Texto de la interfaz (antes de firmar) | Impacto |
|---|---|---|
| Approve | "Autorizas al contrato BrltX (`0x608…5bE71`) a usar hasta X BRLT de tu wallet" | Permiso de gasto, sin gasto |
| wrapAndCreateFlow | "Envías X BRLT al contrato BrltX para crear un flujo de pago hacia 0x… durante N días" | Sí, envía X BRLT |
| downgrade (cobro) | "Quemas X BrltX de tu cartera y recibes X BRLT en esta misma wallet" | Recibes BRLT |
| Downgrade de flujo (tope 80%) | "Descargas X BRLT del flujo #N a tu saldo. Tope del 80%: disponible Y BRLT" | Recibes BRLT (limitado) |
| settleFlow | "Liquidas el flujo #N: acredita lo devengado a BrltX del receptor" | Acredita devengo |
| updateFlow pausa | "Pausas el flujo #N: deja de acumular hasta que se reanude" | Sin movimiento |
| deleteFlow | "Terminas el flujo #N: acredita lo devengado y devuelve el resto al admin" | Devuelve remanente |
| changeReceiver | "Cambia el receptor del flujo #N a 0x…: liquida al receptor antiguo y reabre el flujo" | Redirige pagos |

El empleado nunca firma transacciones de administración: solo `downgrade` y,
si quiere, `settleFlow` sobre un flujo vencido (el contrato lo permite a
cualquiera; AC-02).

---

## 3. Compatibilidad con wallets (Fase 4 del estándar)

| Wallet | Regla aplicada en los mensajes |
|---|---|
| Ledger / Trezor | Frases ≤ 120 caracteres, ASCII, sin emojis ni paréntesis anidados; SIWE en frases cortas separadas |
| MetaMask extensión | Statement SIWE ≤ ~200 caracteres; EIP-712 renderiza pares campo-valor con nombres autoexplicativos |
| Rabby | El resumen previo (`FirmaResumen`) coincide con lo que la simulación mostrará (sin sorpresas) |
| WalletConnect móvil | Nombre de app y red 31337 visibles en la cabecera del resumen |
| Safe / multisig | No aplica: las cuentas del proyecto son EOA; si en el futuro se usa Safe, plantilla E |

## 4. Checklist de validación aplicado

- [x] Entendible sin saber qué es un contrato inteligente.
- [x] Cada mensaje lleva datos concretos (wallet, red, caducidad, montos).
- [x] Sin jerga en el nivel principal (gas → comisión, nonce → código de operación).
- [x] Segunda persona y voz activa en la interfaz.
- [x] Nota explícita de coste 0 en firmas off-chain y de impacto real en on-chain.
- [x] Sin emojis ni caracteres no ASCII en lo que la wallet renderiza.
- [x] `eth_sign` (firma ciega): no se usa en el proyecto.
