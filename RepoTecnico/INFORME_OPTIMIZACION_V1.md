# INFORME DE OPTIMIZACIÓN — Auditoría Documental Fase 1
## Proyecto: Superfluid EUR Streaming (v1 beta) · CodeCrypto Academy

> **Documento:** síntesis consolidada de la Fase 3 del equipo de auditoría (`@audita`)
> **Alcance auditado:** 9 artefactos de `RepoTecnico/` (868 líneas documentales, sin código aún)
> **Método:** 7 revisores paralelos → verificación adversarial independiente → síntesis
> **Fecha de corte:** 2026-09-29 · **Versión:** V1
> **Entrada:** 74 hallazgos brutos de los revisores → 54 supervivientes tras filtrado → **32 hallazgos únicos** tras deduplicación interdimensional (22 colapsos/fusiones) · **24 descartes registrados en el Anexo A**

---

## 1. Resumen ejecutivo

### Veredicto

> **LA DOCUMENTACIÓN DE FASE 1 NO ESTÁ APTA para pasar a Fase 2 (casos de uso / Gherkin-EARS) en su estado actual.**
> No es un problema de calidad media — los artefactos son coherentes internamente, las decisiones D1-D8 tienen sus tres columnas rellenadas y la aritmética central del flujo (`DEFAULT_FLOW_RATE = 771604938271604 wei/s`) es **exacta**, como demuestra la verificación numérica independiente (§3.1). El problema es que existen **4 defectos bloqueantes** que, si se arrastran a Fase 2, garantizan retrabajo: dos de ellos impiden literalmente escribir un solo test de aceptación del contrato core.

### Los cuatro bloqueos

| # | Bloqueo | Por qué impide Fase 2 |
|---|---|---|
| **H-01** | La regla de liquidación por insolvencia invocada en D5 (`requerimientos.md:15`) no existe en ningún otro punto del corpus: ni fórmula, ni actor, ni trigger, ni destino del depósito, ni orden de prelación entre flows concurrentes. | Un caso de uso Gherkin requiere un *then* verificable. Aquí no hay *then* posible. Es el hueco más grande del núcleo económico de v1. |
| **H-02** | No hay línea base estable de alcance: el BRIEF sigue titulando §8 «Decisión técnica pendiente» y recomienda la Opción **A** cuando P1/D1 cerró la **B**; y `requerimientos.md:67` excluye el despliegue GCP que P5/RT-08/H5b acaban de aprobar dentro del mismo documento. | Dos lectores responsables obtienen alcances distintos según qué párrafo lean último. Priorizar casos de uso sobre un alcance ambiguo es priorizar sobre arena. |
| **H-03** | `deleteFlow` significa **«pausar»** en `BRIEF_SUPERFLUID.md:143` y `00 DEFINICION…:92`, y **«cerrar + devolver depósito»** en `requerimientos.md:29` (RF-06), mientras RF-05 añade pausar/reanudar como operación aparte y RT-07 congela las seis firmas del brief, donde no existen `pauseFlow`/`closeFlow`. | La semántica de pausa decide si el depósito se retiene o se libera, es decir decide contabilidad de dinero ajeno. No puede dejarse implícita a Fase 3. |
| **H-04** | La private key y el mnemonic reales del deployer viven **en claro dentro de `RepoTecnico/`**, la carpeta que P4 ordena pushear a GitLab.com (**público**) y gitlab.codecrypto.academy, y **no existe `.gitignore` ni repositorio git** (verificado: `find . -name .gitignore` → vacío; `git status` → `fatal: not a git repository`). | Dry-run reproducido en `/tmp` con un `.gitignore` Foundry+Next «estándar»: `git add -A` indexa igualmente `RepoTecnico/.deployer_wallet.local.json`. El riesgo se materializa en el primer `git init && git push` y es irreversible. |

### Lo que sí está bien (y conviene no tocar)

La verificación adversarial **descartó 24 afirmaciones de los propios revisores** por ser falsos positivos, errores aritméticos o cuentas infladas (Anexo A). En particular:

- La constante `771604938271604` **no es errónea**: `floor(2000e18 / 2592000)` vale exactamente eso; la desviación real es sub-wei y económicamente invisible.
- `gasPrice 0x3e8` **sí** tiene unidad y método de verificación documentados (`entornos_globales.md:11`: `1 gwei (0x3e8) | eth_gasPrice ✔`).
- El disparador del modo BD relacional **sí** está escrito (tres veces, referido a P3); lo que falta es reetiquetar los artefactos congelados.
- La cuenta deployer **ya está financiada**: `cast balance` devolvió `100000000000000000000` wei = **100 CC**. El único bloqueante material declarado para iniciar Fase 2 está resuelto y los documentos no lo reflejan.

### Distribución de severidad (32 hallazgos únicos)

| Severidad | Nº | IDs |
|---|---|---|
| 🔴 **CRÍTICA** | 4 | H-01, H-02, H-03, H-04 |
| 🟠 **ALTA** | 13 | H-05 … H-17 |
| 🟡 **MEDIA** | 11 | H-18 … H-28 |
| ⚪ **BAJA** | 4 | H-29 … H-32 |

---

## 2. Metodología

### 2.1 Las tres fases

```
FASE 1 · REVISIÓN MULTI-LENTE            FASE 2 · VERIFICACIÓN ADVERSARIAL        FASE 3 · SÍNTESIS
──────────────────────────────           ──────────────────────────────────       ───────────────────
7 revisores simultáneos,                 7 verificadores independientes,          Consolidación:
cada uno con UN solo lente               cada uno re-lee los 9 artefactos         · deduplicar entre dimensiones
y órdenes de lectura distintos.          completos y CONTRASTA al revisor:       · asignar IDs H-nn
                                       · confirma / corrige / descarta
Ninguno ve lo del otro.                  · recalcula la aritmética (Python/       · recalcular severidades
                                          Decimal) y repite grep/cast             · tabla por severidad
Regla rectora de Fase 2: ANTE LA DUDA,                                            · plan de acción + preguntas
DESCARTA. Ningún hallazgo llega a esta            · medición live del RPC            para el usuario
síntesis sin cita ruta:línea verificada.
```

### 2.2 Los siete lentes

| Lente | Dimensión | Qué buscó | Hallazgos brutos → supervivientes |
|---|---|---|---|
| **R1** | Ambigüedad y testabilidad | Frases que no admiten un assert | 11 → 11 (0 descartados, 4 correcciones materiales, 3 severidades rebajadas) |
| **R2** | Consistencia interna | Dos textos vigentes que se contradicen | 12 → 11 (1 descartado, 2 fusionados) |
| **R3** | Completitud RNF (ISO 25010) | Categorías de calidad ausentes | 11 → 10 (todas recalibradas) |
| **R4** | Stakeholders | Personas reales sin representación ni responsabilidad | 12 → 9 (3 descartados, 2 subidas, 2 bajadas) |
| **R5** | Trazabilidad con el brief | Cobertura bidireccional brief↔RF y requisitos inventados | 11 → 10 (4 descartes, 1 nuevo añadido por el verificador) |
| **R6** | Riesgos técnicos (SPOF y escala) | Puntos únicos de fallo, límites medidos | 7 → 6 (1 descartado por error aritmético de ~8 órdenes de magnitud) |
| **R7** | Seguridad y legal | Custodia, superficie de ataque, cumplimiento | 12 → 10 (2 descartados, 1 degradada) |
| | | **Totales** | **76 → 67 verificados → 32 únicos** |

### 2.3 Evidencia empírica generada durante la auditoría (no documental)

Estos datos fueron **medios en vivo**, no leídos de los documentos; son la base de varios hallazgos:

| Comprobación | Resultado |
|---|---|
| `chainId` / cliente / gasPrice | `0x13d52` (81234) · `besu/v24.12.0` · `0x3e8` = 1 gwei (constante de red) |
| Balance deployer `0xFFf3…12b9` | `100000000000000000000` wei = **100 CC** → ya financiada |
| Block time QBFT | 40 bloques consecutivos, deltas de timestamp **exclusivamente 2 s**; últimos 39 bloques con 0 tx y `gasUsed 0x0` |
| Latencia RPC (n=200 secuencial) | p50 0.21 s · **p90 4.45 s · p95 20.01 s · p99 25.24 s** · 3.5 % timeouts |
| Latencia RPC (ráfaga conc. 8, n=48) | **47.9 % de fallos, p50 20.47 s** |
| `eth_subscribe` / `/ws` | `-32604 "Method not enabled"` / HTTP 404 → **no existe vía push; el polling es la única opción** |
| `eth_getLogs` rango > ~5 000 bloques | `-32605 "Requested range exceeds maximum RPC range limit"` |
| Exploradores | `explorer.` y `scan.` codecrypto.academy **no resuelven DNS**; `explorer.alumnos` → 404 |
| Salud de red engañosa | `net_peerCount = 0x0` persistente · `baseFeePerGas = 0x0` · `difficulty = 0x1` · coinbase fijo `0xfe3b…bd73` |
| Estado del workspace | Sin `.git`, sin `.gitignore`; `.deployer_wallet.local.json` = 336 B, `-rw-------`, con `private_key` (66 car.) y `mnemonic` (12 palabras, 82 car.) |
| npm / metadata Superfluid | `sdk-core` latest = **0.9.0**, peerDeps `{ethers ^5.7.2, graphql ^16.0.0}` (sin restricción React); `networks.json` = 15 cadenas, **81234 no está** |
| Cálculo del depósito | `771604938271604 × 3600 = 2 777 777 777 777 774 400` wei exactos |

---

## 3. Tabla de hallazgos por severidad

### 🔴 CRÍTICOS (bloquean el paso a Fase 2)

| ID | Hallazgo | Dimensiones | Evidencia principal |
|---|---|---|---|
| **H-01** | Liquidación por insolvencia inexistente e indetestable | R1·R2·R3·R6·R7 | `requerimientos.md:15` (única mención en 868 líneas) |
| **H-02** | Sin línea base de alcance: BRIEF §8 «pendiente» + §4 contradice P5 | R1·R2·R3·R5·R6·R7 | `BRIEF:262,278-279` vs `req:79`; `req:67` vs `:86-87,:93` |
| **H-03** | `deleteFlow` = «pausar» vs «cerrar»: dos operaciones, una firma | R2·R5·R6 | `BRIEF:143` vs `req:28-29,:58` |
| **H-04** | pk + mnemonic en claro dentro del árbol versionable, sin `.gitignore` | R1·R2·R3·R4·R7 | `req:81` · `estado_proyecto.md:25` · comprobación en disco |

### 🟠 ALTOS

| ID | Hallazgo | Dimensiones |
|---|---|---|
| **H-05** | Modelo de datos on-chain no soporta liquidación por cuenta ni enumerar streams recibidos | R1·R2·R4·R6 |
| **H-06** | 5 de 7 RNF sin criterio verificable objetivo; RNF-03 autorreferente | R1·R3 |
| **H-07** | Invariante 1:1 del wrap sin RF/RNF; cero requisitos del lado receptor | R1·R3·R4·R6 |
| **H-08** | Owner con mint/burn ilimitado en EOA anónima: sin titular, roles, multisig ni contingencia | R3·R4·R7 |
| **H-09** | RPC Besu único sin fallback: RNF-04 y RF-08 incumplibles según lo medido | R3·R6 |
| **H-10** | `--verify=false` sin sustituto en red sin explorador + direcciones copiadas a mano | R5·R6 |
| **H-11** | Threat model ausente: RNF-01 hereda «seguridad» de OpenZeppelin para lógica propia | R3·R7 |
| **H-12** | Objetivos de aprendizaje §2 del BRIEF sin matriz de trazabilidad; SDK/CFA fuera sin declararlo | R5 |
| **H-13** | Citas falsas: «§7.8», «§7.6» no existen en el índice del BRIEF | R1·R2·R5 |
| **H-14** | Límite «10 flows» inventado sin base en el brief, no propagado a ningún RF | R5 |
| **H-15** | D5 fija «1 hora de flujo» sin derivación y en conflicto silencioso con el riesgo §9.2 | R5·R6·R7 |
| **H-16** | Operador de la red Codecrypto no aparece como interlocutor pese a todo depende de él | R4 |
| **H-17** | Receptores de streams no son stakeholder reconocido: sin consentimiento, interfaz ni reclamación | R4 |

### 🟡 MEDIOS

| ID | Hallazgo | Dimensiones |
|---|---|---|
| **H-18** | ¿2000 EUR/mes es tasa por destinatario o agregado del remitente? | R1 |
| **H-19** | Artefactos PostgreSQL congelados por P3 siguen redactados en futuro | R1 |
| **H-20** | SLA de latencia y polling de 5 s sin población, percentil ni block time registrado | R1·R5·R6 |
| **H-21** | Hito H5b (Cloud Run) aceptado con una sola línea técnica y sin criterios de aceptación | R1·R3 |
| **H-22** | `EuroxFactory` MUST en RF-10 sin contrato, campos, relaciones ni tests | R2·R5·R6·R7 |
| **H-23** | `base_datos.sql` y `diagrama_er.md` proponen tablas distintas para el mismo backend | R2 |
| **H-24** | Deployer ya financiado (100 CC) pero los documentos declaran P2 pendiente | R2 |
| **H-25** | Clave duplicada en dos almacenes y P2 contradictoria entre tres documentos | R2·R4·R7 |
| **H-26** | Observabilidad cero: sin eventos on-chain, logs, métricas ni alertas | R3 |
| **H-27** | Usabilidad reducida a «sin errores en consola»; accesibilidad inexistente | R3 |
| **H-28** | Cumplimiento: «stablecoin EUR» y nóminas sin aviso legal, RGPD ni licencia | R3·R7 |

### ⚪ BAJOS

| ID | Hallazgo | Dimensiones |
|---|---|---|
| **H-29** | Constantes económicas como aproximaciones sin valor exacto en wei ni regla de redondeo | R1·R2·R5·R6 |
| **H-30** | Erratas y tipos inválidos propagables a código: `foundry.tomyl`, `decimal ratio` | R1·R2·R5 |
| **H-31** | Nomenclatura oscilante (EuroX/EuroxFactory/EURx) y restos de arquitectura anulada | R1·R2·R7 |
| **H-32** | Riesgo 9.5 (peer deps SDK) figura abierto aunque D1/RT-07 ya lo neutralizan | R6 |

---

## 4. Hallazgos críticos y altos detallados

### 🔴 H-01 — La liquidación por insolvencia no es implementable ni testeable tal como está escrita

**Dimensiones que lo confirman:** R1, R2, R3, R6, R7 (cinco lentes independientes llegan al mismo punto).

**Evidencia**
- `requerimientos.md:15` (D5): *«…liquidación automática si el emisor agota saldo+depósito»*. Verificado por grep: la raíz «liquidaci» aparece **una sola vez en las 868 líneas** del corpus. Ninguna otra ocurrencia en los otros ocho artefactos.
- `requerimientos.md:29` (RF-06) describe exclusivamente el camino feliz: *«Cerrar/deleteFlow devolviendo depósito y liquidando flujo acumulado»*.
- `requerimientos.md:17` (D7) enumera validaciones de entrada (saldo insuficiente, dirección inválida/propia, flow duplicado, unwrap con streams activos) **sin cubrir el caso de insolvencia**.
- `BRIEF_SUPERFLUID.md:285-286` agrava el vacío: admite que el depósito «puede configurarse a cero o valor bajo» y se limita a pedir «documentar su efecto en la lógica de pausa/cierre». Esa documentación no existe.
- `diccionario_datos.md:35` define `deposit` **por flow**, mientras el emisor sale por un único saldo virtual: la insolvencia es un evento **por cuenta**, no por flow.
- Mediciones relevantes: block time ≈ 2 s, por lo que el devengo depende de `block.timestamp` y no de bloques; y no existe vía push (`eth_subscribe` → `-32604`), así que nadie puede asumir que un observador externo corte el flujo a tiempo.

**Qué falta exactamente** (seis variables sin definir): quién dispara la liquidación (¿tx del receptor?, ¿cualquiera?, ¿dentro de cada llamada mutante?) · qué trigger la invoca · qué fórmula fija el instante de agotamiento · cuánto cobra realmente el receptor cuando el saldo queda por debajo de un segundo de flujo (truncado vs redondeado, observable byte a byte) · a qué cuenta se transfiere el depósito retenido en insolvencia · qué ocurre con un sender con N flows concurrentes cuando solo tiene fondos para M < N (orden de prelación).

**Consecuencia directa para Fase 2:** no se puede escribir un solo test de solvencia ni definir criterio de aceptación para el contrato core.

**Recomendación**
Redactar en Fase 2 una sección **«Reglas de liquidación»** con invariantes numerables, convertida en escenarios Gherkin/EARS:
1. Fórmula de tiempo-de-vida `(virtualBalance + depositTotal_bloqueado) / |net_outflow|` con redondeo hacia abajo declarado explícitamente.
2. Actor y función que disparan la liquidación, y si es obligatoria o permitida.
3. Manejo explícito del residuo < 1 wei por flow.
4. Destino del depósito en insolvencia.
5. Comportamiento con múltiples flows salientes simultáneos y orden de prelación.
6. Un test Foundry por regla, con assert de que `suma(deltas de balances) == depósitos liberados` (ni creación ni destrucción de EURx).

---

### 🔴 H-02 — No hay línea base estable de alcance

**Dimensiones:** R1, R2, R3, R5, R6, R7 (seis lentes).

**Evidencia**

*(a) La decisión fundacional sigue abierta en el documento fuente de verdad del cliente.*
- `requerimientos.md:11` fija D1 como Opción B y añade *«**Requiere confirmación del usuario (Pregunta 1)**»*.
- `requerimientos.md:79` declara P1 ✅ confirmada (Opción B); `estado_proyecto.md:23` lo repite.
- Pero `BRIEF_SUPERFLUID.md:262` titula literalmente §8 *«Adaptación del Protocolo Superfluid a Besu **(Decisión técnica pendiente)**»*, mantiene ambas opciones vivas (`:268-277`) y cierra con *«**Acción requerida:** confirmar con el director del proyecto qué opción adoptar (A recomendada…)»* (`:278-279`).
- El BRIEF se autodeclara fuente de verdad del cliente (`estado_proyecto.md:9`). Cualquier lector que lo abra en Fase 2 encuentra una recomendación **contraria** a la decisión adoptada.
- Contaminación adicional del mismo origen: `BRIEF:206` sigue listando `@superfluid-finance/sdk-core` 0.9.0 como tecnología del frontend y `:291` mantiene su riesgo de peer deps, contra RT-07 (`requerimientos.md:58`) que elimina esa dependencia del runtime. Y `BRIEF:159` y `:247` describen EURx como *«Super Token creado por el host»* (2 coincidencias exactas verificadas por grep), terminología del framework oficial que D1 acaba de abandonar — **no hay Host en Opción B**.

*(b) Alcance contradictorio dentro del mismo fichero.*
- `requerimientos.md:67` (§4 «Excluye de v1»): *«Despliegue GCP del frontend (se decide en entrevista; v1 corre en dev local salvo indicación)»*.
- `requerimientos.md:86-87` (P5): *«Sí, desplegar preview GCP del frontend en esta v1»* → nace RT-08 (`:93`) y el hito H5b (`:93`, `estado_proyecto.md:39`).
- La lista de exclusiones nunca se corrigió. Nota de verificación: el revisor R4 citó `:66`, que corresponde a la exclusión del framework soberano; la de GCP está en `:67`.

*(c) Árbol de artefactos obsoleto.*
- `BRIEF:99-108` solo lista `Euro.sol`, `DeployEuro.s.sol`, `DeployAll.s.sol`, `Euro.t.sol`. No aparecen `EuroX.sol` (impuesto por D1/P1 y RF-02), ni `EuroxFactory.sol` (impuesto por RF-10), ni `test/EuroX.t.sol` (impuesto por D6).

**Recomendación**
Antes de cerrar Fase 1:
1. Añadir al BRIEF un recuadro **«DECIDIDO (Fase 1)»** fechado que marque §8 como RESUELTO por D1/P1, retire la recomendación de la Opción A y cite la entrevista del 2026-09-29. Sustituir en §6 «Superfluid SDK» por *«referencia conceptual, no dependencia»* y renombrar «creado por el host» → «desplegado por `EuroX.sol`».
2. Reescribir §4 de `requerimientos.md` moviendo el despliegue GCP de «Excluye» a «Incluye (preview) · origen: ENTREVISTA P5».
3. Regenerar el árbol §4.1 con los contratos y tests reales de v1.
4. Publicar una **matriz decisión → artefactos afectados** para que Fase 2 trabaje sobre una única versión coherente.

---

### 🔴 H-03 — `deleteFlow` significa «pausar» en un sitio y «cerrar» en otro

**Dimensiones:** R2, R5, R6.

**Evidencia**
- `BRIEF_SUPERFLUID.md:143`: *«`deleteFlow`: pausa un stream»* — idéntico en el brief original educativo, `00 DEFINICION Y TRABAJO A REALIZAR.md:92`.
- `BRIEF:136` pide además *«Pausar y reanudar flows»* en `Dashboard.tsx`, y `:260` *«Pausar/reanudar cuando quieras»*: una sola acción descrita con dos nombres incompatibles (borrar ≠ pausar).
- `requerimientos.md:29` (RF-06) redefine *«Cerrar/deleteFlow»* como cierre definitivo que devuelve el depósito y liquida el acumulado, mientras `:28` (RF-05) introduce pausar/reanudar como operación **aparte**.
- `requerimientos.md:58` (RT-07) obliga a exponer exactamente las seis funciones del brief, donde solo existe `deleteFlow`: no hay `pauseFlow`/`resumeFlow`/`closeFlow`.
- El modelo de datos contempla ambas cosas (`diccionario_datos.md:38` campo `paused`; `diagrama_er.md:34` `bool paused`) pero **ninguna especificación liga ese flag con una función de contrato** ni define si al pausar se libera o se retiene el depósito.
- Contexto CFA real: no existe «reanudar» — borrar un flow lo destruye y devuelve el depósito; reanudarlo exige crear uno nuevo.

**Consecuencia:** en Fase 3 se implementarán dos interfaces incompatibles según qué documento se lea, y el criterio de aceptación de RF-05 queda indefinido pese a ser MUST y estar sujeto a RNF-03. Además es un vector de abuso clásico: pausar justo antes del agotamiento hace que la condición de D5 («rate efectivo 0») nunca se dispare y el receptor quede retenido sin límite.

**Recomendación**
Congelar un **glosario de operaciones** en `requerimientos.md`: `upgrade/downgrade`, `createFlow`, `updateFlowRate(=0)` para pausar, `resumeFlow`, `deleteFlow` para cerrar. Declarar explícitamente que RT-07 **amplía** el conjunto de funciones del brief (pausa ≠ cierre) y hacer que `lib/superfluid.ts` expose `deleteFlow` únicamente como alias documentado de `closeFlow`. Añadir a RF-05 el destino del depósito al pausar (retener/liberar) más su test asociado. **Zanjándolo como decisión numerada D9**, porque cambia el API del contrato, la contabilidad del depósito y la suite de tests: requiere confirmación del cliente.

---

### 🔴 H-04 — La private key y el mnemonic del deployer están dentro del árbol que debe versionarse

**Dimensiones:** R1, R2, R3, R4, R7.

**Evidencia documental**
- `requerimientos.md:81` (P2) fija la cuenta de despliegue en `RepoTecnico/.deployer_wallet.local.json`, es decir **dentro** del directorio de documentación.
- `estado_proyecto.md:25` repite la ruta literal.
- `requerimientos.md:83-85` (P4) manda versionar `RepoTecnico/` en **dos remotos**: `gitlab.com` (público) y `gitlab.codecrypto.academy`, rama `superfluid-DSH-GCP`.
- `requerimientos.md:41` (RNF-02) exige *«ninguna clave privada en el repositorio»* con `.gitignore` + grep CI como criterio verificable.

**Evidencia empírica (verificada en disco durante la auditoría)**
- `ls -la RepoTecnico/` → `-rw------- 1 dsh dsh 336 … .deployer_wallet.local.json`.
- Parseo JSON con salida enmascarada (nunca se volcó el secreto): contiene `address` `0xFFf3…12b9`, `private_key` (66 caracteres), `mnemonic` (12 palabras, 82 caracteres), `network` «Codecrypto Besu 81234», `note`.
- `find . -name .gitignore` → **vacío** en todo el workspace.
- `git status` → `fatal: not a git repository`.
- **Dry-run reproducido** en `/tmp/gitignore_test` con un `.gitignore` «estándar» Foundry+Next (`out/ cache/ broadcast/ lib/ node_modules/ .env .env.*`): `git add -A` seguido de `git ls-files` devuelve `RepoTecnico/.deployer_wallet.local.json`. Es decir, **el patrón convencional no protege este caso** porque la pk no vive en `sc/.env` sino en `RepoTecnico/`.

**Corrección al alcance del hallazgo (aplicada por R4):** no es cierto que «las únicas defensas sean verbales». RNF-02 sí especifica el mecanismo, `BRIEF:287-288` repite la política, `entornos_globales.md:30` marca `sc/.env` como NO versionar, y `chmod 600` está correctamente aplicado. El defecto residual es nonetheless sustantivo: el control está **declarado, no implementado**, y la protección `600` solo cubre contra otros usuarios locales — no contra exposición remota ni contra un `git init && git add .`.

**Severidad mantenida en CRÍTICA** (R3 propuso ALTA por ser riesgo prospectivo): el motivo es que el siguiente hito previsto — financiar y publicar la dirección, `estado_proyecto.md:33` — llega antes de tener resguardada la clave, y la materialización es instantánea e irreversible.

**Recomendación**
Antes de cualquier `git init`:
1. **Sacar el almacén fuera del árbol versionable** (`~/.config/superfluid/` o `~/.foundry/wallets/`) y referenciarlo solo por path externo; versionar únicamente la dirección pública.
2. Crear `.gitignore` con patrones **explícitos** (`*.local.json`, `RepoTecnico/.deployer*`, `.env`, `.env.*`, `sc/.env`, `out/`, `broadcast/`) **antes** del primer commit, y verificar con `git ls-files` que ningún secreto queda indexado.
3. Añadir el gate que hoy promete RNF-02: pre-commit/CI con grep de `0x[0-9a-f]{64}` y `"mnemonic"` que falle el build.
4. Eliminar la duplicación JSON + `sc/.env` dejando **un único almacén** (ver H-25).
5. Sustituir la ruta exacta del fichero en `requerimientos.md:81` y `estado_proyecto.md:25` por una ubicación no versionable.
6. Rotar la cuenta actual tratándola como comprometida una vez publicada la dirección.

---

### 🟠 H-05 — El modelo de datos no soporta la liquidación por cuenta ni la enumeración de streams recibidos

**Dimensiones:** R1, R2, R4, R6.

**Evidencia**
- `diccionario_datos.md:35-37`: `deposit`, `lastUpdateTimestamp` y `accumulatedBalance` viven **por flow**, pero el emisor sale por un único saldo virtual → la insolvencia es un evento por cuenta. Falta una estructura de estado por cuenta (última liquidación consolidada, saldo virtual, depósitos totales bloqueados) y falta la regla de prorrateo entre flows.
- `diccionario_datos.md:40-46`: `AGGREGATOR` existe pero solo aporta `netFlowRate` y `depositTotal`, **sin marca temporal de liquidación**.
- `diccionario_datos.md:27-33` fija la PK de FLOW en `(sender, receiver, token)` y `diagrama_er.md:47-48` la mapea en `mapping(address => mapping(address => Flow))`: **no hay forma de enumerar los flows que una cuenta RECIBE**. Precisamente `getRealtimeBalance` —interfaz exigida en RT-07 (`requerimientos.md:58`)— necesita eso para el balance en tiempo real del receptor.
- Incoherencia añadida (R2): `diccionario_datos.md:27/:33` declaran `token` como «PK compuesto 3» y `diagrama_er.md:29` repite `address token PK_FK`, pero el mapping propuesto omite esa dimensión — clave lógica vs almacenamiento físico no cuadran.
- `diccionario_datos.md:38` (`paused=true`) convive con un modelo que no declara si un flow pausado sigue computando en `netFlowRate` (`:45`) ni si conserva o libera su depósito.
- `diagrama_er.md:12` relaciona `AGGREGATOR` con `EUR_TOKEN` cuando `diccionario_datos.md:53` lo define por `(account, token)` de `SUPER_TOKEN`.

**Recomendación**
Ampliar el diccionario con (a) una estructura de estado por cuenta (`virtualBalance`, `lastAccountSettlement`, `depositTotalBlocked`) y (b) un índice `receiver → flows` o enumerable con acceso por destinatario. Fijar la regla explícita de que `paused=true` aporta 0 a `netFlowRate` y retiene depósito, con su test de revert/consulta. Añadir a `diagrama_er.md` la relación `AGGREGATOR ↔ FLOW`. Decidir el storage real (`mapping` triple, o doble + constante de token) y reescribir ambas notas; sustituir `paused bool` por `status enum(0=active,1=paused,2=closed)` en los tres artefactos para que el espejo SQL sea isomorfo.

---

### 🟠 H-06 — Cinco de siete RNF no admiten verificación objetiva; uno es autorreferente

**Dimensiones:** R1, R3.

**Evidencia** (`requerimientos.md:38-46`, columna «Criterio verificable»)
- **RNF-03** (`:42`) *«100% tests verdes antes de beta»* es **autorreferente**: una suite vacía cumple el 100 %. No exige cobertura mínima ni que los tests ejerciten las condiciones de revert de D7 ni invariantes económicos.
- **RNF-01** (`:40`) *«sin hallazgos críticos en auditoría»* no define quién audita, con qué alcance, con qué herramienta ni contra qué catálogo de vulnerabilidades.
- **RNF-07** (`:46`) define idempotencia como *«no duplica registros **corruptos**»*: el adjetivo «corruptos» no tiene definición en ningún documento. La propia fila admite `deployments/*.json` mientras RF-10 (`:33`) escribe `out/deployments/codecrypto.json` y RT-06 (`:57`) lee `deployments.json` — **tres rutas incompatibles para el mismo dato**.
- **RNF-05** (`:44`) *«UI usable sin consolas de error en flujo feliz»* no fija navegador, viewport, ni si `console.warn` cuenta.
- **RNF-06** (`:45*) deja *«documentación de operación **mínima**»* sin umbral: término vago puro.
- Solo **RNF-04** (`:43`) contiene un criterio accionable (`< 2 s`, medido con `cast call` en bucle), aunque metodológicamente incompleto (ver H-20).
- Corrección aplicada al revisor R1: son **cinco** las filas no verificables, no cuatro.
- Ninguna fila define latencia de escritura/confirmación QBFT, disponibilidad, ni límite de gas por operación.

**Recomendación**
Reescribir cada criterio en forma comprobable:
- RNF-03 → *«cada RF-MUST tiene ≥ 1 test de camino feliz + 1 por cada condición de revert de D7; cobertura de sentencias ≥ X % en `sc/src`, suite verde en CI»*.
- RNF-01 → checks automatizables concretos (`slither` sin hallazgos high/medium, grep de patterns prohibidos `delegatecall`/`selfdestruct`, ownership gestionado y documentado).
- RNF-07 → *«ejecutar DeployAll dos veces crea 2 entradas nuevas válidas en `deployments/<red>-<timestamp>.json` sin modificar ninguna previa»*, unificando la ruta con RF-10.
- RNF-05 → entorno y definition of done del walkthrough.
- RNF-06 → índice obligatorio del README.

---

### 🟠 H-07 — Ningún requisito garantiza el invariante 1:1 del wrap y no existe requisito del lado receptor

**Dimensiones:** R1, R3, R4, R6.

**Evidencia**
- El invariante que sostiene toda la Opción B está enunciado como **comentario de diccionario**, no como requisito: la regla real vive solo en `diccionario_datos.md:24` (`realBalanceOf … == sum(saldos virtuales − flujos pendientes)`).
- `requerimientos.md:25` (RF-02) se limita a *«Envolver EUR como Super Token EURx (upgrade/downgrade 1:1)»*.
- Verificado por grep: las palabras **«invariante»** y **«reserva»** no existen en `requerimientos.md`; no hay RF-12 ni equivalente, ni RNF que lo compruebe, ni descripción de cómo se sostiene ante flujos activos, pausas y liquidaciones parciales.
- Es exactamente el riesgo que D1 asume (`:11`): al abandonar el framework oficial, la fidelidad 1:1 pasa a ser responsabilidad del código propio.
- **Conflicto contable detectado por R6:** si el depósito se suma a la reserva 1:1, la invariante de `:24` queda rota en cuanto hay un flow activo; si se retiene aparte, la reserva ya no es 1:1 y «downgrade 1:1» es falso para cualquier holder que no sea emisor. `diagrama_er.md:31` y `:41` hacen coexistir `deposit` y `deposit_total` **sin regla contable**.
- Segundo hueco: los once RF (`:24-34`) están escritos **todos desde la perspectiva del sender** — crear, pausar, cerrar, consultar, financiar. Grep no encuentra ningún requisito que otorgue al destinatario capacidad de consultar o reclamar su parte, ni que exija funcionamiento con un receptor sin wallet previamente financiada.

**Recomendación**
Añadir **RF-12** *«Invariante de reserva: `total(EUR custodiados en EuroX) == sum(virtualBalanceOf) − acumulado_no_liquidado`, consultable on-chain en cualquier momento»* y **RF-13** de lado receptor (consulta y reclamación del balance recibido, incluido un receptor sin fondos nativos). Elegir una única cuenta de custodia y corregir `diccionario_datos.md:24` (recomendado: `realBalanceOf = Σ virtualBalanceOf`, depósitos como cuenta separada, documentando que el downgrade 1:1 está limitado por Σ depósitos retenidos). Materializar ambos como tests Foundry con fuzzing sobre secuencias aleatorias de wrap/unwrap/create/pause/close, assertando el invariante tras cada operación.

---

### 🟠 H-08 — Mint/burn ilimitado en una EOA anónima: sin titular nominal, roles, tope de supply ni contingencia

**Dimensiones:** R3, R4, R7.

**Corrección fáctica aplicada:** el privilegio de mint/burn **no es una deriva del diseño**, es un requisito exigido por el cliente (`BRIEF_SUPERFLUID.md:112` «Funciones de owner: mint, burn», replicado en RF-01 `requerimientos.md:24` con supply inicial 10.000.000). Lo crítico es **quién porta ese privilegio**.

**Evidencia**
- `estado_proyecto.md:24-25` (P2) declara que el **agente** creó la cuenta `0xFFf3…12b9` y que su clave vive en `RepoTecnico/.deployer_wallet.local.json`.
- Esa misma cuenta firma el despliegue (`entornos_globales.md:35` define `DEPLOYER_PRIVATE_KEY`; `:69-70` la pasa por CLI como `--private-key "$DEPLOYER_PRIVATE_KEY"`) y quedará como owner, que según `diccionario_datos.md:15` acumula «derechos de mint/burn/wrap-control» y es «una cuenta; transferible».
- Grep transversal en los 9 documentos: **cero coincidencias** de «titular», «responsable», «custodio», «multisig», «timelock», `onlyOwner`, `AccessControl`, `Pausable` o `renounceOwnership`.
- Ningún documento nombra a la persona dueña de esa clave, quién autoriza un mint sobre 10.000.000 EUR, ni qué se hace si la clave se pierde o se filtra. Tampoco hay hard-cap de supply ni límite por batch.
- Con mint ilimitado en manos de una clave anónima, cualquier balance mostrado en el dashboard carece de relevancia económica. Y la pérdida o corrupción de esa clave hace irrecuperables tanto los fondos CC custodiados como el control de EUR/EURx: grep de `backup|respald|recuperaci` = **0 coincidencias**.

**Recomendación**
Crear una sección **«Actores y custodia»** que nombre al titular humano responsable (distinto del «usuario» genérico), defina quién autoriza mint/burn y el procedimiento de pérdida/rotación. Exigir separación de roles: cuenta deployer **sin** derechos de owner + cuenta owner con multisig/timelock o al menos dos claves nombradas, `AccessControl` con roles `MINTER`/`BURNER`/`WRAP_MANAGER`/`PAUSER` bajo un `DEFAULT_ADMIN_OWNER` renunciable, hard-cap de `totalSupply`, y documentar `renounceOwnership` o transferencia a frío como condición de cierre de beta. Declarar una RNF específica de custodia/recuperación con criterio verificable (backup cifrado, rotación, prueba de restauración con responsable).

---

### 🟠 H-09 — RPC Besu único sin fallback: RNF-04 y RF-08 son incumplibles según lo medido

**Dimensiones:** R3, R6.

**Evidencia**
- Todo el sistema depende de un único endpoint HTTPS: `requerimientos.md:53` (RT-02), repetido en `BRIEF:62,152,212,224` y `entornos_globales.md:9,33,41,60`. El único alterno documentado (`MCC_ANVIL_RPC_URL`) está explícitamente descartado y **además es otra red**, no un espejo de Besu (`entornos_globales.md:53-54`).
- Grep sobre los 9 documentos: **0 coincidencias** de `fallback`, `reintento`, `backoff`, `timeout`, `failover`, `indisponib`, `tolerancia`, `degradad`.
- El único RNF de fiabilidad es una cota de latencia de lectura (RNF-04, `:43`). `BRIEF:289` habla de «Disponibilidad del faucet», que es abastecimiento de fondos, no disponibilidad del sistema.
- **Mediciones propias (read-only):** n=200 secuencial → 7 errores (3.5 %), p50 0.21 s, **p90 4.45 s, p95 20.01 s, p99 25.24 s**, max 25.53 s. Segunda tanda n=120 → 5 errores (4.2 %), p95 11.29 s. Ráfaga con concurrencia 8 (n=48) → **47.9 % de fallos, p50 20.47 s**.
- Es decir RNF-04 («< 2 s por consulta») se incumple en el 10-18 % de las muestras, y RF-08/D8 (refresco cada 5 s) produce **solapamiento de consultas** cuando una petición tarda 11-25 s: UI congelada, respuestas fuera de orden y lecturas obsoletas presentadas como actuales.
- **No hay alternativa de push:** `eth_subscribe` → `-32604 "Method not enabled"`; `GET /ws` → 404. El polling es literalmente la única opción.
- Restricción nueva registrada por la auditoría: `eth_getLogs` rechaza rangos > ~5 000 bloques (`-32605`), lo que limita cualquier indexación/historial (relevante si P3 se reabriera).
- Consecuencia sobre D5 (`:15`): la «liquidación automática» no especifica si se calcula on-chain o depende de que la web esté viva. Si dependiera del cliente, una caída del RPC deja el flujo acumulado corriendo sin que nadie lo corte.

**Recomendación**
Convertir la tolerancia a fallos del RPC en RNF verificable: (1) `RPC_URLS` como lista (primario + al menos uno gestionado por la administración de la red, a pedir por escrito) con 3 reintentos exponenciales (cap 10 s) y timeout duro de 8 s; (2) reformular RNF-04 como percentil + disponibilidad — propuesto: *«p90 < 3 s y p95 < 8 s sobre 200 muestras; ≥ 97 % de respuestas válidas en 10 min»*; (3) ciclo de refresco con guarda anti-solapamiento (solo se emite la siguiente lectura cuando la anterior terminó o expiró, con backoff a 15/30 s si el RTT excede el intervalo) y monotonicidad por `blockNumber` para descartar lecturas fuera de orden; (4) estado visible de degradación («última lectura válida hace Xs · actualización en pausa») en lugar de romper la consola; (5) requisito funcional de que la liquidación se calcule **on-chain**, nunca dependiente de que la web esté viva; (6) limitar `eth_getLogs` a ventanas ≤ 5 000 bloques y registrarlo en `entornos_globales.md`.

---

### 🟠 H-10 — `--verify=false` sin canal alternativo en una red sin explorador, y registro manual de direcciones

**Dimensiones:** R5, R6.

**Evidencia**
- `BRIEF_SUPERFLUID.md:242` prescribe `--broadcast --verify=false` y no ofrece sustituto.
- Los endpoints que podrían actuarlo no existen (probes): `explorer.codecrypto.academy` y `scan.codecrypto.academy` **no resuelven DNS**; `explorer.alumnos.codecrypto.academy` responde **404**.
- Consecuencia: nadie podrá probar que el bytecode desplegado corresponde al `Euro.sol`/`EuroX.sol` auditado ni reconstruir la secuencia de transacciones del despliegue.
- El riesgo se multiplica porque el registro es manual: `BRIEF:245-247` manda *«Copiar address»* a un objeto hardcodeado en `web3.ts`, mientras RT-06 (`requerimientos.md:57`) afirma que salen de `deployments.json` y RNF-07 (`:46`) promete idempotencia versionando por timestamp+network. Nota atenuante verificada: `entornos_globales.md:43-44` sí prevé `NEXT_PUBLIC_EUR_ADDRESS`/`NEXT_PUBLIC_EURX_ADDRESS`, es decir existe un **tercer** mecanismo de inyección no alineado con los otros dos.
- Un error de copiado entre EUR y EURx pasa inadvertido sin explorador ni verificación y rompe silenciosamente el wrap 1:1, y con él toda la contabilidad de flows.

**Recomendación**
Definir un sustituto de verificación y cerrarlo como RNF: publicar `out/deployments/codecrypto.json` con `address`, `txHash`, `blockNumber`, constructor args, compiler settings (versión solc, `via_ir`, optimizer runs) y **bytehash** de cada artefacto; añadir un post-deploy test que compare con `assertEq` el `forge inspect <c> deployedBytecode` contra `cast code <addr> --rpc-url` (esto es lo que reemplaza al explorador). Eliminar `--verify=false` o justificarlo por escrito en el README de operación. Resolver la divergencia fábrica/manual/env: `DeployAll` escribe `deployments.json` y un job de generación (`gen:contracts`) inyecta las constantes — **prohibir literales `'0x...'` en `web3.ts` y hacer que CI falle si aparecen**.

---

### 🟠 H-11 — Sin threat model para EuroX.sol: RNF-01 hereda «seguridad» de OpenZeppelin para lógica propia

**Dimensiones:** R3, R7.

**Evidencia**
- `requerimientos.md:40` (RNF-01) declara «seguridad de contratos» apoyándose en OpenZeppelin 5.1.0 auditado, Solidity 0.8.28, ausencia de `delegatecall`/`selfdestruct` y «reentrancia protegida», con criterio *«forge test pasa suite; sin hallazgos críticos en auditoría»*.
- Pero D1/P1 (`:11`, `:79`) adoptan un core propio (`EuroX.sol` con CFA simplificado) cuya matemática de acumulación, pausa y liquidación de depósitos **no procede de ningún contrato auditado**: la garantía de OZ protege sus propios contratos, no un wrapper custom donde el equipo escribe la lógica económica.
- Grep de `slither|threat model|static analysis|pentest|analisis est` sobre `*.md` → solo coincide la palabra «auditoría» dentro de RNF-01, sin definir herramienta, alcance ni fase. *(Corrección al revisor: el término sí aparece; lo que falta es su definición verificable.)*
- Grep de `event |emit |evento` → **sin coincidencias** en el modelo on-chain vigente. La única aparición de `flow_events` (`diagrama_er.md:51`) está condicionada a un backend que P3 descartó.
- Los hitos de Fase 3 (`estado_proyecto.md:38-39`) van de H1 contracts+tests a H5b preview **sin ninguna fase de seguridad**.
- Los puntos reales de reentrancy son justo los que ningún RF describe: el bucle de liquidación cuando un emisor agota saldo+depósito con N flows concurrentes (D5), la devolución del depósito en `deleteFlow`, el payout al receiver en el cierre, y upgrade/downgrade con callback ERC20 malicioso o con `receiver == sender`.

**Recomendación**
Añadir un RNF de **threat model** explícito (reentrancy, patrón CEI, manipulación de `block.timestamp`, overflow `int96`, front-running de `createFlow`, callbacks ERC20, self-flow) y hacer verificable RNF-01: `slither .` + fuzzing/invariantes (`forge-fuzz`, diferencial contra oráculo off-chain) en CI con salidas archivadas, revisión documentada con firma indicando quién y cuándo antes de beta, gestión de owner con multisig, tope duro de `totalSupply`, y política explícita de si los depósitos cuentan o no como colateral para unwrap — con un test que lo demuestre. Exigir por RF la emisión de eventos en toda mutación de flow/deposit/balance y definir que la liquidación multi-flow usa patrón **pull** con orden determinista.

---

### 🟠 H-12 — Los objetivos de aprendizaje del BRIEF (§2) no trazan a ningún RF/RNF/RT

**Dimensión:** R5.

**Evidencia**
- El BRIEF dedica su §2 completo (`:19-52`) a 5 bloques de objetivos, incluidos explícitamente *«Protocolo Superfluid → Implementar Constant Flow Agreement (CFA)»* (`:32`) y *«Desarrollo Web3 → Usar Superfluid SDK para crear streams»* (`:37`); fija el SDK como tecnología (§6 `:206`) y un riesgo asociado (§9 `:291`).
- En `requerimientos.md` no existe matriz objetivo→requisito: `grep -ni 'objetivo|aprendizaje'` solo devuelve coincidencias accidentales en `:5` («Objetivo: sistema estable…») y en la justificación de D3.
- RT-07 (`:58`) decreta «Sin dependencia del SDK oficial `@superfluid-finance/sdk-core` en runtime» y §4 (`:64-68`) enumera exclusiones que **nunca mencionan el SDK ni la fidelidad al CFA real**.
- **Ajuste de severidad aplicado (CRÍTICA → ALTA):** la pérdida no es oculta — D1 (`:11`) declara «semántica CFA simplificada», RT-07 es explícito y P1 fue confirmado por el cliente. El defecto real es de **trazabilidad formal**, no una omisión silenciosa de un mandato.

**Recomendación**
Crear en `requerimientos.md` una matriz **«Objetivo de aprendizaje §2 → RF/RNF/RT o exclusión explícita»**, con una fila por cada uno de los 5 bloques. Añadir a §4 la línea textual: *«Uso del `@superfluid-finance/sdk-core` y del framework CFA real (sustituidos por `EuroX.sol` propio según D1/P1)»*, indicando qué objetivo didáctico se pierde y cómo se compensa (p. ej. nota comparativa CFA real vs envoltorio). **Reabrir P1 solo si el cliente entiende que el objetivo era aprender Superfluid, no reimplementarlo.**

---

### 🟠 H-13 — Citas falsas: «§7.8» y «§7.6» no existen en el índice del BRIEF

**Dimensiones:** R1, R2, R5.

**Evidencia**
- `requerimientos.md:32` (RF-09) cita *«§7.8 adaptado»* y `:33` (RF-10) cita *«§4.1, §7.6»*.
- El BRIEF §7 (`:208`) está redactado como lista numerada simple de pasos 1.-8., **sin subsecciones decimales**: `grep '7\.6|7\.8' BRIEF_SUPERFLUID.md` → exit 1. El índice real solo contiene `## 1…## 13` más `### 3.1/3.2/3.3`, `4.1/4.2`, `5.1/5.2/5.3`.
- Ampliación verificada por el verificador R5: hay además **desalineación de ancla correcta-en-espíritu** — el contenido de RF-09 (conectar wallet MetaMask en chainId 81234) está literalmente en §4.2 `:131` y en §7 paso 8 (`:254-255`), no en el paso 6; y el paso 6 real (`:245-247`) trata de copiar addresses a `web3.ts`, no de generar `out/deployments/codecrypto.json`, que es lo que RF-10 añade.
- Matiz honesto: RF-10 → §7.6 **sí** corresponde en espíritu (el registro de addresses es el paso 6 de un §7 de ocho pasos); RF-09 → §7.8 **no** (ese paso es «Usar la aplicación»). RF-03 (`:26`) cita §4.2 y §5.2 como origen de la tasa, pero §4.2 es la app web: la tasa está en §1 (`:12-13`) y §5.2 (`:173-182`).
- Descartado por R5 como afirmación global: la columna «Origen brief» de 9 de los 11 RF **sí** resuelve contra secciones existentes. Solo RF-09 y RF-10 contienen citas falsas.

**Recomendación**
Sustituir las citas por anclas verificables: *«BRIEF §4.2 (línea 131) + §7 paso 8 (líneas 254-255)»* para RF-09, y *«BRIEF §4.1 (líneas 99-108) + §7 paso 5 (líneas 236-243)»* para la parte de DeployAll de RF-10, marcando el registro JSON como adición propia. Rehacer la columna «Origen brief» con citas verificadas línea a línea y **separar qué requisitos son literales del brief frente a cuáles son adiciones propias** (registro `deployments.json`, límite de 10 flows, validaciones D7). Añadir a Fase 2 una comprobación automática de que toda referencia «§x.y» resuelva contra el índice real del BRIEF.

---

### 🟠 H-14 — El «límite blando de 10 flows visibles» es invención sin base y no se propaga a ningún RF

**Dimensión:** R5.

**Evidencia**
- El BRIEF pide *«Agregar múltiples destinatarios para streaming»* (`:135`) y *«enviar flujos continuos … a múltiples destinatarios»* (`:12`) **sin cota numérica alguna**; el brief original educativo (`00 DEFINICION…:84`) tampoco fija límite. `grep -ni '10 flows|límite' BRIEF_SUPERFLUID.md` → exit 1.
- `requerimientos.md:13` (D3) introduce el «límite blando de 10 flows visibles» cuya única justificación es *«Cubre el objetivo explícito del brief»* — atribución que el texto fuente no sostiene.
- El número no aparece en ningún otro punto: `grep -ni '10 flows|límite'` sobre `requerimientos.md` solo devuelve la fila D3 y el título del §4.
- No se propaga a un requisito funcional: RF-04 (`:27`) dice solo *«Soportar múltiples destinatarios simultáneos desde un remitente»*.
- Resultado: criterio arbitrario y no testeable — «blando» no define el comportamiento ante el flow 11 (¿ocultar, paginar, bloquear?) — en abierta contradicción con el mandato de *«estrictamente lo pedido en el brief»* (`:4-5`).

**Recomendación**
Eliminar el número de D3 o justificarlo con evidencia medible (coste de gas de la lectura agregada, tiempo de polling RNF-04, rendimiento de renderizado). Si se mantiene como umbral de UX, convertirlo en RF verificable con criterio explícito (*«el dashboard lista todos los flows del sender mediante paginación; sin límite superior de flows soportados; el umbral 10 solo afecta al número de filas sin scroll»*) y registrar la cota como **decisión propia**, no como origen del brief. Anotar además si el límite es restricción de UI o de contrato, o fijar un máximo on-chain con su test de revert.

---

### 🟠 H-15 — D5 fija «1 hora de flujo» sin derivación, en conflicto silencioso con el riesgo §9.2

**Dimensiones:** R5, R6, R7.

**Evidencia**
- El BRIEF solo menciona, **sin magnitud**, que *«Se bloquea un depósito de seguridad»* (`:187`) y advierte en §9 riesgo 2 (`:285-286`) que en Besu soberano «puede configurarse a cero o valor bajo; documentar su efecto en la lógica de pausa/cierre».
- `requerimientos.md:15` (D5) adopta «Depósito igual a 1 hora de flujo (≈2.77 EURx)» con la única justificación *«Regla mínima segura del CFA simplificado»*, sin referenciar el parámetro real del CFA (`depositPeriod`, 2 días por defecto en Superfluid) ni demostrar que 1 h cubra el riesgo. El §9.2 queda así en conflicto no resuelto.
- El colchón necesario depende de la frecuencia con que alguien ejecute la liquidación, y **eso nadie lo fija**: si la liquidación solo ocurre en acciones discretas (`createFlow`/`pause`/`close`) y un emisor abandona la cuenta, el daño acumulado crece sin cota temporal y el depósito de 1 h no cubre nada — el exceso sale de la reserva 1:1 del wrapper, que pertenece a **todos** los usuarios. Es el fallo clásico de un CFA casero.
- Escalado a múltiples salientes (RF-04 MUST): con n flows cada uno exige su propio depósito (`n × 2.7778e18`), y ningún RF/RNF/D declara si la condición de pre-creación es `saldo ≥ Σ depósitos_i + netOutflow × T_liquidación` o solo `≥ depósito del nuevo flow`. D7 (`:17`) solo especifica validaciones **reactivas** («revert por saldo insuficiente»), que llegan tarde. Con el tope de 10 flows de D3 el emisor necesita ~27.78 EURx solo en depósitos más la ventana de liquidación, y nada obliga a comprobarlo al crear el flow nº 10.
- **Matiz de verificación:** la dimensión de «liquidez» no es un problema de mercado (EURx es 1:1 con EUR y el supply inicial es 10 M) sino la ausencia de una regla de agregación de depósitos y de condición de pre-creación.

**Recomendación**
Redactar una decisión **D9 «Modelo de solvencia EuroX»** ANTES de escribir `EuroX.sol`, con cuatro cierres: (a) elegir una única cuenta de custodia y corregir `diccionario_datos.md:24`; (b) invariantes testeables con `require()` en `createFlow`/`updateFlow`: `Σ realBalance ≥ Σ virtualBalance` y `saldoLibre(emisor) ≥ Σ_{flows activos} deposit_i + netOutflowRate × T_liquidación`, con `T_liquidación` numerado; (c) regla de pausa explícita (tiempo máximo de pausa acumulada, p. ej. = 1× la ventana de liquidación, o pre-fondeo obligatorio del devengo pendiente) y qué ocurre con `accumulatedBalance` al reanudar; (d) en `EuroX.t.sol` (D6), tests de invariante para 1, 2 y 10 salientes concurrentes, para pausa > umbral, y un fuzz de «no creación de flow que deje al emisor insolvente». Convertir (b) y (c) en RNF con criterio medible. Definir además `deposit = maxFlowsRate × maxLiquidationPeriod` con margen, no «1 hora» arbitraria, y resolver el conflicto con §9.2.

---

### 🟠 H-16 — El operador de la red Codecrypto no aparece como interlocutor

**Dimensión:** R4.

**Evidencia**
- Cada decisión técnica colisiona con infraestructura de terceros sin contacto definido. `BRIEF_SUPERFLUID.md:289-290` (riesgo 4) admite que para deployments pesados «pueden requerirse varias solicitudes o coordinación con la **administración de la red**»: es la ÚNICA mención a ese actor en toda la documentación (`grep "administraci"` → 1 sola coincidencia; `grep "operador"` → 0), sin nombre, canal ni acuerdo.
- `BRIEF:283-284` (riesgo 1) obliga a medir el block time real de QBFT porque la UI refresca cada 5 s: dato que solo el operador puede confirmar contractualmente.
- `:285-286` (riesgo 2) asume que el depósito «puede configurarse a cero o valor bajo», y D1 (`requerimientos.md:11`) exige desplegar contratos propios en una red **multi-node ajena**.
- No hay declaración de quién autoriza deployments en `besu.alumnos.codecrypto.academy`, qué ocurre si el RPC se degrada (RNF-04 pide < 2 s), ni si la red puede ser reseteada o purgada por la academia.

**Recomendación**
Incluir el operador de la red (CodeCrypto Academy / administración Besu) como stakeholder formal con canal de contacto, permisos necesarios para desplegar, block time y límites de gas garantizados, política de persistencia del estado y SLA de disponibilidad del RPC. **Sin esto, RNF-04 y el hito H2 (deploy a Besu) no son verificables.**

---

### 🟠 H-17 — Los receptores de los streams no son parte interesada reconocida

**Dimensión:** R4.

**Evidencia**
- El producto se define como enviar flujos «a múltiples destinatarios» (`BRIEF:12`, `00 DEFINICION…:8`) y RF-03/RF-04 (`requerimientos.md:26-27`) son MUST, pero el receptor no aparece en ningún sitio como stakeholder con necesidades propias.
- Confirmado: la palabra «consentimiento»/«consient» no existe en ninguno de los 9 documentos (grep → 0).
- El Dashboard solo ofrece vistas del sender (`BRIEF:130-137`) y D3 (`requerimientos.md:13`) limita explícitamente la lista a «todos los flows del sender».
- D7 (`:17`) valida «dirección inválida/propia» y «flow duplicado», pero **nunca que el destino sea una cuenta real, consciente y operativa**. Nada cubre el consentimiento para recibir, la consulta de posición neta por el receptor, el cierre desde su lado, qué ocurre si el destino es un contrato sin soporte o una cuenta perdida (los EURx quedan atrapados de forma irreversible), ni cómo reclama alguien que ve flujos dirigidos a su dirección sin haberlos solicitado.
- El modelo lógico trata `receiver` como una simple PK compuesta sin semántica de participación (`diccionario_datos.md:32`, `diagrama_er.md:11/:28`).

**Recomendación**
Añadir un RF de contraparte: vista de «flows recibidos» con net flow rate y saldo liquidado para el receptor, más una regla explícita de v1 (solo destinos EOA confirmados por el sender, o aviso de irrevocabilidad al enviar a direcciones desconocidas). Registrar el receptor en la tabla de actores con su necesidad y el riesgo de fondos atrapados. Complementa directamente a H-05 (índice inverso) y H-07 (RF-13).

---

## 5. RNF faltantes

Estado actual: **7 ítems** (`requerimientos.md:38-46`) que solo cubren parcialmente seguridad de contratos, estabilidad vía tests, una métrica de latencia, una prueba de UI en camino feliz, documentación e idempotencia de deployment. Para un sistema que mueve dinero en tiempo real, esto es lo que falta.

**Comprobación empírica** (grep sobre los 9 artefactos, 0 coincidencias salvo las excepciones indicadas):
`accesibil` · `usabil`(0) · `observab` · `monitoriz` · `logging` · `metric` · `alerta` · `backup` · `respald` · `recuperaci` · `rendimiento` · `escalabil` · `portabil` · `mantenibil` · `timeout` · `reintento` · `fallback` · `failover` · `indisponib` · `tolerancia` · `rate limit` · `SLA` · `wcag` · `a11y` · `contraste` · `slither` · `fuzz` · `multisig` · `timelock` · `incidente` · `rgpd/gdpr/kyc/aml/disclaimer` · `event/emit/evento` · `proxy` · `semver` · `cors/csp/content-security`.
Excepciones honestas: `rollback` = 0 pero `versionad` = 1 (en RNF-07, y se refiere a versionado de fichero, no de imagen); `upgrad` = 12 coincidencias, **todas** referidas al upgrade/downgrade de token (wrap), ninguna a upgradabilidad de contratos; `redundan` = 5 y `RPO/RTO` = 4 son **falsos positivos de substring** en «automáticamente», «Superfluid» y «proyecto».

| RNF propuesta | Categoría ISO 25010 | Criterio verificable sugerido | Cubre |
|---|---|---|---|
| **RNF-08 Despliegue Cloud Run** | Mantenibilidad / portabilidad | URL pública estable, HTTP 200 y título esperado, build reproducible desde commit, `grep -rE '0x[0-9a-f]{64}' .next/` sin resultados, política de acceso y borrado del servicio | H-21, H-02 |
| **RNF-09 Fiabilidad ante caída del RPC** | Fiabilidad | timeout duro 8 s, 3 reintentos con backoff + jitter, p90 < 3 s y p95 < 8 s sobre 200 muestras, ≥ 97 % respuestas válidas en 10 min, detección de chainId incorrecto, estado visible de degradación | H-09, H-20 |
| **RNF-10 Observabilidad** | Fiabilidad / mantenibilidad | Todo cambio de estado económico emite Event indexado (`FlowCreated`, `FlowPaused`, `FlowResumed`, `FlowClosed`, `DepositForfeited`, `Minted`, `Burned`, `Wrapped`, `Unwrapped`); healthcheck y logs en Cloud Run; runbook de incidentes con `cast getLogs` | H-26, H-11 |
| **RNF-11 Custodia y recuperación de claves** | Seguridad | Almacén fuera del árbol versionable, `.gitignore` verificado con `git ls-files`, gate CI anti-fugas, backup cifrado, rotación documentada y prueba de restauración con responsable | H-04, H-08, H-25 |
| **RNF-12 Seguridad del core propio** | Seguridad | `slither` sin hallazgos high/medium en CI, invariant testing/fuzzing del core propio (reserva 1:1, `sum(deposits)`, acumulación por segundo, runway hasta el corte), revisión firmada indicando quién y cuándo, multisig o dos claves nombradas, hard-cap de `totalSupply` | H-11, H-07, H-08 |
| **RNF-13 Rendimiento y capacidad** | Rendimiento | p95 de latencia de lectura, consultas/minuto para N usuarios concurrentes, límite **duro** de flows por sender con política de paginación, presupuesto de gas por `createFlow`/`pause`/`close`, block time efectivo medido y registrado | H-20, H-09 |
| **RNF-14 Accesibilidad** | Usabilidad | WCAG 2.1 AA: contraste mínimo texto/número, foco visible y navegación por teclado, etiquetas ARIA en el listado de flows, formato consistente de importes EUR/EURx, verificación automatizada (axe/lighthouse) en el pipeline E2E | H-27 |
| **RNF-15 Usabilidad en caminos de error** | Usabilidad | Estados de carga, botón deshabilitado, mensaje claro y recuperable para cada validación de D7; navegador y viewport definidos; console.warn tratado explícitamente | H-27, H-06 |
| **RNF-16 Mantenibilidad / ciclo de vida de contratos** | Mantenibilidad | Estrategia declarada (inmutable + redeploy con proceso de migración de flows y devolución de depósitos, o proxy con rol restringido); versión/semver y hash del bytecode en `out/deployments/codecrypto.json`; ABI/TS types generados por tarea automatizada con check que falle si el ABI commiteado no coincide con el compilado | H-10, H-31 |
| **RNF-17 Cumplimiento y marco legal** | Cumplimiento | Aviso visible de entorno educativo y de que los importes carecen de valor legal fuera de esta red; política de tratamiento de datos (direcciones y balances son datos personales bajo RGPD) con base jurídica y minimización; limitación de acceso a la preview mientras sea beta; licencia explícita publicada | H-28 |
| **RNF-18 Hardening de la preview** | Seguridad | CSP + headers (HSTS, `X-Content-Type-Options`), allowlist CORS en el RPC, quotas/rate-limit en Cloud Run, proxy RPC propio con cuota en lugar de exponer el endpoint de la academia | H-21, H-28 |

**Nota sobre RNF-04:** no se descarta, pero pasa de «< 2 s medido con `cast call` en bucle» a una medición definida: *«p95 de 100 muestras de `cast call balanceOf` tomadas desde el host del proyecto < 2 s, registrado en `RepoTecnico/bench/rpc.md` con fecha y commit»*. Medir primero `eth_blockNumber` en bucle durante **15-30 min continuos** (no 40 bloques: QBFT puede configurar `empty-block-period` distinto de `block-gossip-period` y el intervalo observado salta ante silencio sostenido), documentar el block time de Codecrypto, y fijar el intervalo de polling como función de ese valor.

---

## 6. Stakeholders faltantes

Diagnóstico central confirmado por R4: **Fase 1 está construida alrededor de un único «usuario» ambiguo** que funciona simultáneamente como cliente (`estado_proyecto.md:10` «mandato del usuario»), aprobador (`:22` «decisiones CONFIRMADAS por el usuario»), tester (D6 `requerimientos.md:16` «criterio de estabilidad del usuario») y financiador del faucet (`:33`). Grep transversal: **cero coincidencias** de «stakeholder», «responsab*», «soporte», «mantenimiento», «docente/tutor/evaluador», «operador», «titular humano», «multisig» o cualquier matriz de roles.

| Actor ausente | Necesidad / responsabilidad no cubierta | Riesgo si se ignora | Hallazgo vinculado |
|---|---|---|---|
| **Titular humano de la cuenta deployer** | Dueño nominal de la pk, autoridad para autorizar mint/burn, procedimiento de pérdida/rotación | Clave anónima con mint ilimitado → ningún balance del dashboard tiene relevancia económica; pérdida = fondos CC y control de EUR/EURx irrecuperables | H-04, H-08 |
| **Receptor del stream (destinatario)** | Consentir recibir, consultar su posición neta, retirar lo liquidado, cerrar desde su lado, reclamar | Fondos atrapados irreversiblemente si el destino es un contrato sin soporte o una cuenta perdida; abuso «pausar antes del agotamiento»; el receptor no puede probar qué le deben | H-17, H-07, H-05 |
| **Operador de la red Besu (administración Codecrypto)** | Autorizar deployments, garantizar block time y límites de gas, política de persistencia del estado, SLA del RPC, endpoint secundario | RNF-04 y el hito H2 no son verificables; la red podría ser reseteada o purgada sin aviso | H-16, H-09 |
| **Usuario final de la beta** | Perfil, criterios de entrada/salida, canal de reporte de incidencias, responsable de triaje | «Beta» se usa como objetivo del proyecto (`requerimientos.md:1`, `:5`, RNF-03) sin definir quién prueba nada ni a quién reporta | H-27, H-21 |
| **Administrador / propietario del proyecto GCP `mcc-ecommerce`** | Autorizar el despliegue, pagar el coste, permitir exponer el RPC académico a Internet, aislamiento respecto a producción compartida | Preview pública consumiendo un endpoint de clase no dimensionado; coste y responsabilidad sin dueño | H-21, H-28 |
| **Director del proyecto / docente evaluador** | Refrendar la cesión de la decisión arquitectónica que `BRIEF:278` delegaba expresamente en «el director del proyecto» y que luego resolvió «el usuario» sin registrarla | La decisión de mayor calado del proyecto (inventar un CFA propio) carece de aprobación trazable de quien el propio brief señalaba | H-12, H-02 |
| **Tercero que recibe EURx no solicitados** | Saber que un ingreso de «2000 EUR/mes» no es un pago real | Confusión y reclamaciones: §10 del brief vende nóminas, alquileres y vesting sin disclaimer alguno | H-28 |

**Entregable sugerido:** una tabla **«Actores y custodia»** en `requerimientos.md` con, por rol: identidad o perfil, necesidad, responsabilidad, canal de contacto y riesgo asociado. Es prerequisito de la Fase 2, porque los casos de uso Gherkin se escriben **desde** un actor.

---

## 7. Plan de acción

### 7.1 Quick wins — antes de cerrar Fase 1 (horas, sin decisiones pendientes)

| Acción | IDs | Responsable sugerido | Esfuerzo |
|---|---|---|---|
| Crear `.gitignore` con patrones explícitos (`*.local.json`, `RepoTecnico/.deployer*`, `.env*`, `out/`, `broadcast/`) **antes** de `git init`; mover la cartera a `~/.config/superfluid/`; verificar con `git ls-files` | H-04, H-25 | Agente (dev) | **S** |
| Corregir erratas: `foundry.tomyl` → `foundry.toml` (`req:55`); `decimal ratio` → `uint8 decimals = 18` (`diagrama_er.md:23`) | H-30 | Agente (docs) | **S** |
| Recalibrar las citas de sección al BRIEF en RF-03/RF-09/RF-10 con anclas línea a línea | H-13 | Agente (docs) | **S** |
| Mover el despliegue GCP de «Excluye» a «Incluye (origen: ENTREVISTA P5)» en `requerimientos.md:67` | H-02 | Agente (docs) | **S** |
| Marcar los tres artefactos PostgreSQL como «modo OFF — condición cerrada por P3 (2026-09-29), congelado para v1», sustituyendo el futuro por presente negativo | H-19 | Agente (docs) | **S** |
| Actualizar P2: cuenta **financiada, 100 CC**, con fecha y método (`cast balance`); dejar `/siguiente_fase` como único pendiente real | H-24 | Agente (docs) | **S** |
| Unificar nomenclatura en un glosario (`Euro.sol`, `EuroX.sol`, `EuroXFactory.sol`, símbolos EUR/EURx) y eliminar «creado por el host» de `BRIEF:159`/`:247` | H-31, H-02 | Agente (docs) | **S** |
| Fijar el depósito como constante entera exacta en wei (`2 777 777 777 777 774 400`) con su regla de redondeo; declarar la convención «mes = 30 × 86400 s» como definición de producto | H-29 | Agente (docs) | **S** |
| Declarar cerrado el riesgo 9.5 por D1/RT-07 y registrar la evidencia externa (metadata: 15 redes sin 81234; `sdk-core` latest 0.9.0 sin upgrade) | H-32 | Agente (docs) | **S** |
| Sustituir «≥ 50 CC» por gas estimado × número de operaciones del deployment | H-20 | Agente (dev) | **S** |

### 7.2 Mejoras — cierre de Fase 1 y arranque de Fase 2 (días, requieren una decisión del usuario)

| Acción | IDs | Responsable sugerido | Esfuerzo |
|---|---|---|---|
| **D9 «Modelo de solvencia EuroX»**: única cuenta de custodia, invariantes con `require()`, ventana `T_liquidación` numerada, regla de pausa, prelación multi-flow | H-01, H-15, H-05, H-07 | Usuario + agente (arquitectura) | **M** |
| **Glosario de operaciones** congelado (`pauseFlow`/`resumeFlow`/`closeFlow`, `deleteFlow` como alias documentado) y ampliación explícita de RT-07 | H-03, H-05 | Usuario + agente | **M** |
| **Recuadro «DECIDIDO (Fase 1)»** en el BRIEF: §8 resuelto hacia Opción B, SDK marcado como referencia conceptual, árbol §4.1 regenerado | H-02, H-12 | Usuario (firma) + agente | **M** |
| Reescribir los 5 RNF no verificables en forma comprobable y añadir las RNF-08…18 de §5 | H-06, H-20, H-21, H-09, H-26, H-27, H-28 | Agente (QA/docs) | **M** |
| **Matriz de trazabilidad** §2 objetivos → RF/RNF/RT/exclusión, y columna «Fuente (BRIEF/ENTREVISTA/PROPIO)» en las tablas RF/RNF/RT | H-12, H-13, H-14 | Agente (BA) | **M** |
| Decidir `EuroxFactory`: eliminarla de RF-10 (despliegue directo EUR→EuroX con `underlying` inmutable) o crear su entrada en diccionario y ER y marcarla SHOULD/fuera-de-v1 | H-22 | Usuario + agente | **S** |
| Unificar el esquema condicional PostgreSQL en un único listado de tablas replicado literalmente en los tres documentos; cambiar la restricción a `UNIQUE (sender, receiver, token)` | H-23 | Agente (datos) | **S** |
| Decidir el storage real de FLOW (mapping triple vs doble + constante) y sustituir `paused bool` por `status enum` isomorfo en los tres artefactos | H-05, H-23 | Agente (dev) | **M** |
| Declarar RF-12 (invariante de reserva) y RF-13 (lado receptor) y registrar el receptor como actor | H-07, H-17 | Usuario + agente | **M** |
| Medir y registrar el block time QBFT (ventana 15-30 min) en `entornos_globales.md` con fecha, método y fuente autorizada; derivar intervalo de polling y confirmaciones | H-20, H-09 | Agente (dev) + operador de red | **M** |
| Pedir por escrito al operador de red: autorización de deployments, endpoint RPC secundario, `block-gossip-period`/`empty-block-period`, política de persistencia | H-16, H-09 | Usuario (contacto) | **S** |
| Separar el almacén de claves en un único sitio y reconciliar el estado contradictorio de P2 entre los tres documentos | H-25, H-04 | Agente (dev) | **S** |
| Corregir el BRIEF `:131` eliminando «o clave de prueba», en contradicción directa con D2 | H-25 | Agente (docs) | **S** |

### 7.3 Roadmap — Fase 2 / Fase 3 (semanas)

| Acción | IDs | Responsable sugerido | Esfuerzo |
|---|---|---|---|
| Escribir la sección «Reglas de liquidación» completa y traducirla a escenarios Gherkin/EARS con un test Foundry por regla | H-01 | Usuario (acepta) + agente (redacta) | **L** |
| Implementar `EuroX.t.sol` con invariant testing y fuzzing sobre secuencias aleatorias de wrap/unwrap/create/pause/close; asserts de prelación multi-flow con 1, 2 y 10 salientes | H-01, H-07, H-15, H-11 | Agente (dev) | **L** |
| Pipeline de configuración único: `DeployAll` → `out/deployments/codecrypto.json` → job `gen:contracts` → `web3.ts`, con validación de `chainId` y prohibición de literales `'0x...'` en CI | H-10, H-22 | Agente (dev/CI) | **M** |
| Post-deploy test de equivalencia de bytecode (`forge inspect deployedBytecode` vs `cast code`) como sustituto del explorador inexistente | H-10 | Agente (dev) | **M** |
| Capa de resiliencia del RPC: `RPC_URLS`, reintentos con backoff + jitter, timeout duro, guarda anti-solapamiento, monotonicidad por `blockNumber`, estado visible de degradación | H-09, H-20 | Agente (frontend) | **M** |
| Instrumentación de eventos on-chain indexados + métricas/logs/healthcheck en Cloud Run + runbook de incidentes | H-26, H-11 | Agente (dev/SRE) | **L** |
| Gobernanza de contratos: `AccessControl` con roles, hard-cap de supply, multisig o timelock educativo, Pausable, política de `renounceOwnership` al cierre de beta | H-08, H-11 | Usuario (titulares) + agente | **L** |
| Endurecimiento y cumplimiento de la preview: CSP/headers, allowlist CORS, cuotas Cloud Run, proxy RPC propio, aviso legal «token de prueba sin respaldo», licencia, evaluación con la academia de la política de publicación en GitLab.com | H-21, H-28, H-18 | Usuario + agente | **M** |
| Accesibilidad WCAG 2.1 AA con verificación automatizada (axe/lighthouse) integrada en el pipeline E2E | H-27 | Agente (frontend) | **M** |
| Estrategia de release y versionado de ABIs (generación automatizada + check de coincidencia) | H-10, H-31 | Agente (dev) | **M** |

---

## 8. Preguntas para el usuario

Las preguntas están agrupadas en bloques de 3. **El Bloque 1 es prerequisite**: sin él no pueden cerrarse H-01, H-02 y H-03, y por tanto no puede iniciarse la Fase 2.

### Bloque 1 — Núcleo económico (bloqueante para empezar Fase 2)

1. **¿Quién dispara la liquidación por insolvencia y con qué fórmula?** Propongo: cualquiera puede llamar a `settle(account)`; el instante de agotamiento se calcula como `(virtualBalance + depositTotalBloqueado) / |netOutflowRate|` con redondeo hacia abajo, y el devengo se liquida **on-chain** (nunca dependiente de que la web esté viva). ¿Lo aprueba, o prefiere que la liquidación ocurra solo dentro de las llamadas mutantes (`createFlow`/`updateFlow`/`closeFlow`)?
2. **¿Qué ocurre con el depósito cuando un emisor tiene N flows concurrentes y fondos solo para M < N?** Necesito tres respuestas: (a) cuál es el orden de prelación entre receptores, (b) a qué cuenta va el depósito retenido en insolvencia — ¿se transfiere al receptor perjudicado o queda quemado/en poder del contrato?—, (c) si al **pausar** un flow el depósito se retiene o se libera. *(Esta última es la que decide si `deleteFlow` = pausar o = cerrar: H-03.)*
3. **¿Confirmo el modelo de solvencia como decisión numerada D9?** Concretamente: ¿depósito **agregado por cuenta** `(sender, EURx)` con tope, o depósito **por flow** como está hoy en `diccionario_datos.md:35`? Mi recomendación es agregado, porque el emisor sale por un único saldo virtual y el modelo actual obliga a bloquear `n × 2.7778e18` y deja la invariante 1:1 de `:24` rota en cuanto hay un flow activo.

### Bloque 2 — Alcance y línea base de verdad

4. **¿Qué documento manda cuando BRIEF y requerimientos discrepan?** Hoy el BRIEF se declara fuente de verdad (`estado_proyecto.md:9`) pero mantiene §8 «Decisión técnica pendiente» recomendando la Opción A, el SDK oficial en su stack y «Super Token creado por el host». ¿Prefieres (a) editar el BRIEF con un recuadro fechado «DECIDIDO (Fase 1)», (b) emitir una BRIEF v1.1 con apéndice «Enmiendas aprobadas tras D1/P1», o (c) mantener el BRIEF inmutable y crear una tabla «Afirmaciones del BRIEF anuladas por decisión» en `requerimientos.md`?
5. **¿`EuroxFactory` entra o sale de v1?** Es MUST en RF-10 pero no existe en el árbol del brief, no tiene campos, relaciones ni tests asignados, y con D1 (un único par EUR/EURx) no aporta valor. Mi recomendación: eliminarla y desplegar EUR → EuroX directamente con `underlying` inmutable. Si la conservas para futura multi-moneda, hay que definirla y degradarla a SHOULD/fuera-de-v1.
6. **¿El límite de 10 flows es de UI o de contrato?** El brief no fija ninguna cota; D3 lo presenta como «blando» sin decir qué pasa con el flow 11. ¿Paginación sin límite real, o máximo on-chain con su test de revert? En el segundo caso necesito también el valor del máximo y si es por sender o global.

### Bloque 3 — Custodia, gobernanza y seguridad

7. **¿Quién es el titular humano de la cuenta deployer `0xFFf3…12b9`?** La creó el agente, concentra owner con mint/burn ilimitado y firma todos los despliegues, y ningún documento nombra a su dueño ni quién autoriza un mint sobre 10.000.000 EUR. ¿Te asignas tú la titularidad, o quieres separar en dos cuentas (deployer sin derechos de owner + owner custodiada)?
8. **¿Qué nivel de gobernanza exiges para el owner?** Opciones: (a) EOA actual con `renounceOwnership` al cierre de beta, (b) multisig 2-of-3 educativa, (c) timelock, (d) `AccessControl` con roles `MINTER`/`BURNER`/`WRAP_MANAGER`/`PAUSER` bajo un admin renunciable. Y en cualquier caso: ¿fijo un **hard-cap** de `totalSupply`? ¿Qué valor?
9. **¿Aceptas el threat model ampliado como criterio de salida de Fase 3?** Propuesta: `slither` sin hallazgos high/medium en CI, invariant testing/fuzzing del core propio, revisión documentada con firma indicando quién y cuándo antes de beta, y un test que demuestre si los depósitos cuentan o no como colateral para `unwrap`. ¿O prefieres mantener «sin hallazgos críticos en auditoría» con una auditoría externa real (¿quién, con qué alcance)?

### Bloque 4 — Entorno compartido y operadores externos

10. **¿Contactamos formalmente a la administración de la red Besu de CodeCrypto?** Hoy es el único stakeholder sin nombre ni canal, y de él dependen el block time contractual, la autorización de deployments, la persistencia del estado (¿pueden resetear o purgar la red?) y un endpoint RPC secundario. Si sí, ¿propongo yo el escrito o lo envías tú?
11. **¿Cómo dimensionamos el polling sabiendo que el RPC real da p90 ≈ 4.5 s, p95 ≈ 11-20 s y ~4 % de timeouts, y que no existe `eth_subscribe`?** ¿Mantengo 5 s con guarda anti-solapamiento y backoff a 15/30 s, o subo el intervalo base a 10-15 s? Y ¿reformulo RNF-04 como percentil + disponibilidad (`p90 < 3 s y p95 < 8 s sobre 200 muestras; ≥ 97 % respuestas válidas en 10 min`) aunque implique que hoy se incumple?
12. **¿Qué hacemos con la preview de Cloud Run respecto al RPC académico?** El bundle público contendrá `https://besu.alumnos.codecrypto.academy` y cualquiera podrá extraerlo; con concurrencia 8 el endpoint falla el 47.9 % de las llamadas. ¿Limito el acceso a la preview (auth básica o allow-list), monto un proxy RPC propio con cuota, o asumo la exposición y lo documento como riesgo aceptado? Y ¿el coste GCP corre a tu cargo o al de la organización propietaria de `mcc-ecommerce`?

### Bloque 5 — Receptores y usabilidad

13. **¿Qué ve y puede hacer el destinatario de un stream?** Hoy no existe ningún requisito del lado receptor y no hay índice inverso para enumerar sus flows. ¿Añado a v1 una vista «flows recibidos» con net flow rate y retirada de lo liquidado (RF-13), o lo declaro fuera de v1 con constancia expresa?
14. **¿Cómo protegemos el envío a direcciones equivocadas o irrecuperables?** D7 valida «dirección inválida/propia» pero nada cubre que el destino sea un contrato sin soporte o una cuenta perdida: los EURx quedan atrapados de forma irreversible. ¿Restrinjo v1 a EOAs confirmadas por el sender, o basta un aviso de irrevocabilidad antes de firmar?
15. **¿Qué exigencias de usabilidad y accesibilidad meto en la beta?** RNF-05 hoy solo mira «sin errores en consola en flujo feliz», y accesibilidad no aparece en ningún documento para un dashboard que muestra cifras económicas en tiempo real. ¿Añado WCAG 2.1 AA con verificación automatizada (axe/lighthouse) y estados de error para las validaciones de D7, o lo dejo como deuda declarada?

### Bloque 6 — Legal, propiedad intelectual y publicación

16. **¿Añado la sección «Limitaciones y aviso legal»?** Los documentos hablan de «stablecoin EUR» y 2000 EUR/mes, y §10 del brief presenta nóminas, alquileres, vesting y donaciones — pero grep de `aviso|disclaimer|legal|MiCA|regul|sin valor|respaldo` devuelve **cero coincidencias**. Mi propuesta: cláusula declarando que EUR/EURx son tokens de prueba sin respaldo ni valor, en red privada QBFT educativa, con prohibición de uso para pagos reales; renombrar a `EURt`/`TestEUR` en la documentación orientada al usuario. ¿La apruebas?
17. **¿Qué licencia publicamos y quién es el titular de los contratos?** La palabra «educativo» aparece solo como firma de autoría (`BRIEF:326`, `:330`), nunca como limitación de uso ni licencia. ¿MIT, GPL-3.0 u otra? ¿Y validamos con la academia la política de publicación en GitLab.com **antes** del primer push?
18. **¿Tratamos direcciones y balances como datos personales?** Una preview pública asocia direcciones con actividad de cobro nominada en euros. ¿Aplico minimización y una base jurídica declarada, limito el acceso mientras sea beta, o considero que al ser red privada y datos ficticios el RGPD no aplica aquí (y lo documento como decisión)?

### Bloque 7 — Priorización y cierre

19. **¿Por dónde empezamos?** Mi recomendación: primero el Bloque 1 (sin él no se cierra H-01 y Fase 2 no puede escribir ni un test), después los quick wins de §7.1 que no requieren decisión, y en paralelo el contacto al operador de red (pregunta 10) porque su respuesta condiciona RNF-04 y el dimensionado del polling.
20. **¿Cuánto del trabajo hago yo sin consultarte?** Los quick wins de §7.1 son mecánicos y reversibles. ¿Los ejecuto directamente en una pasada y te presento el diff, o prefieres aprobar cada edición de los artefactos de Fase 1?
21. **¿Qué hacemos con el objetivo de aprendizaje que se pierde?** D1 sustituye «usar el protocolo Superfluid real» por reimplementar un CFA simplificado, y el brief nunca se actualizó para decirlo. ¿Compenso la pérdida añadiendo al entregable una nota comparativa CFA real vs envoltorio propio (qué mecanismos del CFA real NO se implementan y por qué), o damos por bueno que el objetivo se transforma y lo registramos como exclusión explícita en §4?

---

## Anexo A — Hallazgos descartados por la verificación adversarial

Registrados por transparencia del filtro. Ninguno de estos puntos aparece en el cuerpo del informe.

| # | Lente | Afirmación descartada | Motivo |
|---|---|---|---|
| A-01 | R1 | `gasPrice 0x3e8` es un número sin unidad ni fuente | **Falso positivo.** `entornos_globales.md:11` lo documenta como `GAS_PRICE \| 1 gwei (0x3e8) \| eth_gasPrice ✔`: unidad, hex correcto (0x3e8 = 1000) y método de verificación. |
| A-02 | R1 | «Ninguno define quién activa el modo BD relacional ni cuándo se cierra la condición» | **Falso en su formulación.** El disparador está escrito en tres sitios (`req:74-75`, `diccionario:5-6`, `base_datos.sql:4-6`, todos referidos a P3) y P3 ya está cerrada ✅. Subsiste solo como defecto de etiquetado → H-19 (MEDIA). |
| A-03 | R1 | Error de precisión del 0.27 % entre «≈2.77 EURx» y «2.7778e18» | **Aritméticamente falso.** `771604938271604 × 3600 = 2 777 777 777 777 774 400` wei: ambas notaciones son aproximaciones correctas al céntimo y difieren ~0.007 %. Queda solo la ausencia de constante exacta → H-29 (BAJA). |
| A-04 | R1 | «Cuatro documentos dan mecanismos distintos para registrar addresses» | **Cuenta incorrecta.** RT-08 (`req:93`) describe el pipeline de build Docker de RT-06, no un cuarto mecanismo. Son tres sobre cuatro documentos. |
| A-05 | R1 | El BRIEF prescribe hardcode de addresses en contradicción frontal con RT-06 | **Interpretación excesiva.** `BRIEF:156` comenta la línea como «se actualizan tras DeployAll»: placeholder deliberado de un documento educativo, no prescripción arquitectónica. |
| A-06 | R1 | «RNF-04 no es medible tal cual» tratado como defecto grave | **Degradado, no descartado.** La fila sí contiene un criterio accionable (`< 2 s`, `cast call` en bucle). Se integra en H-20 y se corrige la afirmación absoluta del revisor. |
| A-07 | R2 | Hex del balance del deployer `0x56bc75e2d63100000` | **Evidencia errónea** (un dígito de más = 1000 CC). El hecho central se conserva con la evidencia corregida: `100000000000000000000` wei = 100 CC = `0x56bc75e2d6310000` → H-24. |
| A-08 | R2 | Los 9 artefactos deberían incluir un documento de casos de uso / planificación en Fase 1 | **Fuera del lente y del alcance.** El pipeline sitúa Gherkin/EARS en Fase 2 (`estado_proyecto.md:37`). Sería un hallazgo de completitud, no de contradicción. |
| A-09 | R2 | El flow rate `771604938271604` no produce exactamente 2000 EUR/mes | **Falso positivo.** `771604938271604 × 2 592 000 = 1 999.9999999999977e18` wei: desviación de 2.3e-15 EUR/mes, irrelevante en uint/int96 y coherente con `BRIEF:178-181`. |
| A-10 | R2 | D8 afirma que el block time «se mide y se documenta» sin que exista la medición | **No es contradicción** sino hueco de completitud, ya absorbido en H-20. Descartado para no duplicar. |
| A-11 | R2 | `entornos_globales.md` referencia secretos globales que podrían filtrarse | **Fuera del alcance** de la dimensión (corresponde a Seguridad/legal) y el propio documento ya los marca como no válidos en Besu (`:50-54`). |
| A-12 | R3 | La constante `771604938271604` sería errónea (debería ser …605) y produciría ~0.864 EUR/mes de error | **FALSO POSITIVO MATEMÁTICO.** `floor(2000e18/2592000) = 771604938271604` exactamente; diferencia real: 0 wei/s y 0 EUR/mes. Arrastrarlo habría sido un error grave del informe. |
| A-13 | R3 | ≈2.77 EURx y 2.7778e18 serían precisiones incompatibles | **Exageración.** Mismo valor, distinta precisión display; no hay contradicción. El punto accionable legítimo quedó absorbido en H-29. |
| A-14 | R3 | «El mnemonic real no se menciona en ningún documento» | **Autocontradicción del revisor.** `req:81` y `estado_proyecto.md:25` sí documentan la pk en `RepoTecnico/.deployer_wallet.local.json` con chmod 600. Reformulado como laguna de backup/recuperación. |
| A-15 | R3 | Ceros absolutos de «redundan», «RPO», «RTO» y «versionad» | **Falsos positivos de substring** en «automáticamente», «Superfluid», «proyecto» y «versionado por timestamp+network» (RNF-07). Invalidaban la formulación; la evidencia quedó corregida. |
| A-16 | R4 | El faucet es dependencia crítica sin dueño, cuota ni escalamiento (ALTA) | **Extralimitación del lente.** El faucet tiene dueño identificable (`BRIEF:59`, `entornos:12`, ambos «portal ✔»), su límite está documentado tres veces («máx. 100 CC/solicitud») y el cauce de escalamiento está prescrito (riesgo 4). Las partes restantes eran conjetura. Sus cargas reales fueron a H-16 y al resto. |
| A-17 | R4 | No hay actor responsable de mantenimiento post-entrega ni de validar académicamente D1-D8 | **Descartado ante la duda.** Cierto que grep da 0 en «mantenimiento»/«docente»/«evaluador», pero el proyecto ES la Fase 1 de un entregable académico cuya última fase es elaborar los manuales: designar maintainer post-entrega es una expectativa importada de producción. Además el revisor atribuía a RNF-01 la definición de un servicio de auditoría externo cuando es solo el criterio de una suite `forge test`. |
| A-18 | R4 | Los contadores de requisitos y el estado de aprobación están desactualizados | **Ambas subafirmaciones débiles.** RT-08 no forma parte de la tabla §3 sino de una «Adición» posterior (`req:89-93`): no hay contador roto. Y «pendiente de aprobación» describe el estado real — `estado_proyecto.md:3` matiza «(pendiente confirmación del usuario para Fase 2)» y `:34` mantiene abierto el checkbox de `/siguiente_fase`. |
| A-19 | R5 | Variante duplicada del hallazgo «D1 replica los conceptos del brief» | **Deduplicado.** Misma evidencia (`req:11`/`:33` vs `BRIEF:99-108`/`:274`) contada dos veces. |
| A-20 | R5 | «El §8 sigue pidiendo confirmar A/B demuestra que nadie decidió» | **Falso.** La decisión está tomada y registrada (`req:11` D1 + `:79` P1 ✅ + `estado_proyecto.md:23`). Solo subsiste la falta de enmienda en el documento fuente → H-02. |
| A-21 | R5 | El brief original educativo fija requisitos que `requerimientos` incumple | **Descartado.** Está íntegramente superseded por `BRIEF_SUPERFLUID.md` (autodeclarado «Versión adaptada», `:3-5`). Las diferencias materiales (Anvil/fork-mainnet vs Besu, pk pública de Anvil) ya están cubiertas por D1/D2. |
| A-22 | R5 | Los 11 RF carecen en general de origen verificable en el BRIEF | **Generalización falsa.** La columna «Origen brief» de 9 de los 11 RF sí resuelve contra secciones existentes. Solo RF-09 y RF-10 contienen citas falsas → H-13, acotado. |
| A-23 | R6 | El flow rate pierde 1 wei/s: ~350 EUR/año (y ~3.500 EUR/año con 10 flows) | **Error material de aritmética en ~8 órdenes de magnitud.** El residuo truncado es 0.9382716 wei/s y el revisor convirtió mal las unidades (2.592e6 wei = 2.592e-12 **EUR**, no 2.592e-6). Pérdida real: 2.43e-12 EUR/mes por flow. No existe deriva económica; la parte defendible quedó en H-29. |
| A-24 | R6 | `int96`/`uint128` como riesgo técnico de escala | **No es riesgo.** `int96` admite 3.96e10 EUR/s por flow y `uint128` desborda tras ~1.4e16 años a 2000 EUR/mes. El propio revisor lo reconoce. Solo queda como recomendación documental, absorbida en H-29. |
| A-25 | R6 | Ausencia de `.gitignore`/repo git como factor agravante del riesgo de fallback del RPC | **Cita exacta pero irrelevante para ese hallazgo.** Es un hecho de progreso del proyecto (P4 ya fija remotos y rama; RNF-02 ya prescribe `.gitignore`) y no cambia el análisis de disponibilidad del RPC. Se trasladó a H-04, donde sí es material. |
| A-26 | R7 | Ningún RF valida que el destinatario sea cuenta controlable ni define recuperación ante direcciones incorrectas | **Descartado como hallazgo independiente.** El núcleo es una laguna de diseño de contrato aún inexistente, y el alcance declarado es «estrictamente lo pedido en el brief». Su premisa factual es parcialmente falsa (D7 sí cubre «dirección inválida/propia») y el riesgo residual ya está capturado en H-17 y H-15. |
| A-27 | R7 | Exposición por firma desde navegador y posible reuso de la pk en mainnet | **Contradice el texto real.** D2 (`req:12`) corrige de forma expresa la inyección de pk en el navegador heredada del brief original, y `estado_proyecto.md:29` lo reafirma como «cero claves privadas en frontend»; RF-09 especifica MetaMask. La variante de reuso en mainnet es especulación sin evidencia (el JSON declara `network: Codecrypto Besu 81234`). |

---

## Anexo B — Notas de integridad de la auditoría

- **Modo de trabajo:** las siete dimensiones operaron en **lectura-only**. Ningún artefacto de Fase 1 fue modificado. El único write de la auditoría fue un dry-run aislado en `/tmp/gitignore_test`, ya borrado.
- **Manejo de secretos:** la private key y el mnemonic **nunca fueron volcados** a ningún informe ni a la salida de consola. Se inspeccionaron vía parseo JSON con salida enmascarada, registrando únicamente longitud y presencia de campos.
- **Verificación cruzada:** cada hallazgo conservado tiene al menos una cita `ruta:línea` releída íntegra en la pasada de verificación, y los claims numéricos fueron recalculados de forma independiente (Python/Decimal).
- **Regla rectora aplicada:** *ante la duda, descarta*. Los 27 descartes del Anexo A incluyen cinco correcciones aritméticas o de conteo a los propios informes de los revisores.
- **Límite declarado:** nada de lo auditado es verificable en código porque `sc/`, `web/` y el repositorio git aún no existen. En concreto, la afirmación de P4 «rama existente verificada vía `git ls-remote`» (`entornos_globales.md:82`) no es reproducible en este workspace.

---

*Informe generado por el agente SINTETIZADOR del equipo de auditoría `@audita` · Fase 3 de 3.*
