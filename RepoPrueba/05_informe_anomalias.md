# Informe de anomalías — Batería de pruebas Superfluid Brlt

> Ejecución 2026-11-18 (FASE 5, primera pasada) · entorno simulado
> dApp local: http://localhost:3100 (build de producción + Mongo en memoria)
> Red de pruebas: Anvil `vm-blockchain` (http://100.85.239.67:8545, chainId 31337)
> Alcance ejecutado: extension-chrome + desktop · wallets okx, phantom, coinbase,
> trust, metamask (con autorización del usuario marcada en `00_PLAN_MAESTRO.md`).
> Seed de prueba: generada al vuelo y usada solo en memoria de la ejecución;
> nunca se mostró en logs ni se guardó en el repositorio.

## Resumen (lenguaje simple)

De los **125 escenarios** de la batería, en esta pasada:

| Estado | Cantidad | Qué significa |
|---|---|---|
| **PASS (aprobadas)** | **3** | La prueba corrió de principio a fin y la app se comportó como se esperaba |
| **FAIL (fallos)** | **0** | No se encontró ningún fallo de la aplicación |
| **BLOCKED (bloqueadas)** | **54** | No se pudieron correr por falta de una pieza del entorno (no es culpa de la app) |
| **NOT_RUN (no ejecutadas)** | **43** | Quedaron fuera del filtro de esta pasada o el robot de prueba aún no sabe leer todos los pasos |
| **N/A (no aplican)** | **25** | Combinación wallet + plataforma que no existe (ej. Trust en Firefox); nunca cuentan como fallo |

**Conclusión simple: no se detectó ninguna anomalía de la aplicación.** Los 3
escenarios que pudieron completarse pasaron. El resto está detenido por
herramientas o piezas de entorno que faltan, no por errores del sistema.

## Las 3 pruebas que pasaron (con captura)

| Escenario | Qué probó | Resultado |
|---|---|---|
| ESC-007 | Detección y conexión de Phantom en Chrome (modo simulada) | La página de entrada reconoce la wallet y muestra el botón activo — `capturas/ESC-007_phantom_extension-chrome_2026-11-18_143939.png` |
| ESC-008 | Detección y conexión de Coinbase Wallet en Chrome (simulada) | Igual que la anterior — `ESC-008_coinbase_extension-chrome_…png` |
| ESC-009 | Detección y conexión de Trust Wallet en Chrome (simulada) | Igual que la anterior — `ESC-009_trust_extension-chrome_…png` |

## Por qué están bloqueadas 54 pruebas

Todas por la **misma causa**: los escenarios en modo "wallet real" necesitan el
archivo descomprimido de la extensión (MetaMask) y no se aportó la ruta
(`E2E_WALLET_BUILD_METAMASK`). Igual pasará con Rabby (build) y Brave
(navegador Brave) hasta que se aporten esas rutas. No es un fallo de la app:
falta material de prueba.

## Anomalías de la herramienta de prueba (no de la app)

| # | Qué pasó (lenguaje simple) | Dónde | Qué esperábamos | Severidad |
|---|---|---|---|---|
| H-1 | El robot todavía no entiende 8 escenarios con pasos descriptivos (ej. "el admin opera /admin/empleados…"); se registran NOT_RUN y **nunca** se marcan como fallo | `04_script_automatizacion/helpers/pasos.ts` | Interpretar 100% de los pasos | Media — se corrige ampliando el intérprete |
| H-2 | La variable `E2E_HEADLESS=1` no activaba el modo sin ventana (solo acepta `true`); ya documentado en el README | `runner.mjs` | Aceptar 1/true | Baja |
| H-3 | El chequeo interno de Anvil dentro del runner a veces reporta "no responde" aunque la red contesta bien por fuera (posible bloqueo de métodos `anvil_*` por el proxy); los escenarios web no dependen de eso en esta pasada | `helpers/anvil-reset.ts` | OK (chainId 31337) | Media — verificar con RPC directo sin proxy |
| H-4 | La dApp local arranca con las variables públicas por defecto (Red 81234 / `besu.alumnos.codecrypto.academy`); el despliegue real usa Red 31337. Afecta solo a esta pasada local | build local (sin `NEXT_PUBLIC_*` del cloudbuild) | Igual que producción | Baja — reconstruir con variables o probar contra Cloud Run |

## Trazabilidad (resumen)

- REQ-WALLET con al menos un escenario ejecutado (PASS): los de detección/proveedor.
- REQ-WALLET en BLOCKED: los de modo "wallet real" (MetaMask, Rabby, Brave) — pendiente material.
- REQ-WALLET en NOT_RUN: flujos con sesión (portal admin/empleado, downgrade 80%, EIP-712) — pendiente intérprete.
- Detalle completo: `03_features/matriz_trazabilidad.md` + `05_resultados/resultados_2026-11-18.ndjson` (estado vivo = última entrada por escenario).

## Recomendaciones (priorizadas)

1. **Aportar el build descomprimido de MetaMask** (y Rabby / navegador Brave) y re-lanzar: habilita ~60 escenarios en modo real.
2. **Ampliar el intérprete de pasos** (sesiones SIWE completas, portal admin/empleado, downgrade tope 80%): convierte ~40 NOT_RUN en PASS/FAIL reales.
3. **Añadir el listener `chainChanged`** (gap W10 del análisis): hoy un cambio de red con sesión abierta no se detecta en vivo; los escenarios de cambio de red lo dejarán de marcar como limitación conocida.
4. **Probar contra el Cloud Run** (`E2E_BASE_URL=https://brltv2-szrmcf2hja-ew.a.run.app`) para eliminar la diferencia de variables públicas (H-4).

*Fin del informe. El estado vivo completo vive en `06_estado_ejecucion.md`.*
