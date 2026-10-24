# sfh-portal — Portal cautivo Web3 (H4)

Next.js 15 + React 19 + TypeScript + Tailwind + **viem directo** (sin wagmi, para reducir
la superficie de dependencias; wrapper wagmi opcional en una iteración futura). Portal de demostración del hotspot:
aviso de privacidad → vinculación de wallet (SIWE) → envolver BRLT→BRLTx → abrir stream (garantía
1 h) → acceso provisional → vouchers para equipos hijos.

## Flujo

1. **Aviso de privacidad**: se acepta *antes* de persistir MAC/IP; crea `portal_session` con
   `bind_token` del hotspot (HMAC del NAS, no se aceptan MAC/IP del cuerpo).
2. **Wallet + SIWE**: firma un mensaje ligado a la sesión → `POST /v1/portal/bindings`.
3. **Wrap 1:1**: `approve` + `upgradeTo` de BRLT→BRLTx.
4. **Stream**: `createFlow(payout, rate)` con `rate >= tarifa` y saldo ≥ `rate×3600` (1 h). El portal
   muestra el mínimo de apertura y solicita `POST /v1/session/authorize` (202).
5. **Sesión**: polling de estado, pausa (revoca), reanudación.
6. **Vouchers**: genera código (se muestra una vez) y permite canjear en un equipo hijo.

## Comandos

```bash
npm ci
cp .env.example .env.local      # ajustar API/contratos
npm run test                    # lógica pura del portal
npm run typecheck
npm run build
npm run dev                     # http://localhost:3000
```

## Estado H4 (core entregado)

- [x] Aviso de privacidad previo y `portal_session` con `bind_token` (D45/V2-01).
- [x] Wallet + firma SIWE → `POST /v1/portal/bindings` (endpoint añadido en el orquestador).
- [x] Wrap BRLT→BRLTx 1:1 (approve + upgradeTo) con refresco de saldos.
- [x] Stream con `rate >= tarifa` y **garantía de apertura 1 h** (D54) + `POST /v1/session/authorize` (202).
- [x] Estado de sesión con polling, pausa (revoca) y reanudación.
- [x] Vouchers: generar código y canjear por equipo hijo.
- [x] **14/14 tests** de lógica pura, `tsc --noEmit` limpio y `next build` OK (Next 15.5.28).

### Pendiente de H4

- [x] E2E Playwright con wallet mock (H5): 2/2 verdes (`npm run e2e`).
- [ ] i18n es/en y auditoría axe completa (H6).
- [ ] Sustituir la MAC/IP de demo del canje por la terna del `bind_token` del hijo (H5).

## Notas

- `bind_token`: el hotspot lo entrega en la URL (`?bind_token=...`); sin él se puede pegar a mano en demo.
- El contrato de API está congelado en [`../sfh-orchestrator/openapi.yaml`](../sfh-orchestrator/openapi.yaml).
- Tokens de prueba sin valor; red educativa.
