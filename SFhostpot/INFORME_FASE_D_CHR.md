# Informe Fase D — Validación del adaptador MikroTik contra RouterOS real (CHR)

> **Fecha:** 2026-10-24 · **Estado:** ✅ **Completada en laboratorio** (CHR 7.16.2 sobre QEMU TCG) ·
> **Evidencia:** [`pruebas/h7_fase_d_chr.log`](pruebas/h7_fase_d_chr.log) ·
> **Laboratorio reproducible:** [`../sfh-chr/`](../sfh-chr/)

## 1. Objetivo

Cerrar la brecha de fidelidad de la propuesta ([`propuesta_entorno_pruebas_mikrotik.md`](propuesta_entorno_pruebas_mikrotik.md)
fase D/E): validar el `MikrotikRestAdapter` contra **RouterOS real**, corregir el mapeo REST y dejar
acta de aceptación.

## 2. Entorno del laboratorio

| Elemento | Valor |
|---|---|
| Host | VM Linux sin `/dev/kvm`; org policy `compute.disableNestedVirtualization` enforced |
| Virtualización | **QEMU 8.2.2 en modo TCG** (sin aceleración), binario extraído de `.deb` (sin root) |
| RouterOS | **CHR 7.16.2** (imagen `chr-7.16.2.img`, trial 60 días) |
| Recursos VM | 512 MB RAM · 1 vCPU · red user-net con `hostfwd` 2222 (SSH) y 8080 (HTTP REST) |
| Configuración inicial | consola VGA vía QEMU monitor `sendkey` (`sfh-chr/setup-console.py`) |
| Credenciales lab | `admin` / `sfh-lab` (solo laboratorio) |

No se pudo usar KVM por la política de la organización; TCG sirve para **fidelidad funcional**, no para
rendimiento. El laboratorio completo (descarga, arranque, consola y probe) está en `sfh-chr/`.

## 3. Matriz de fidelidad (adaptador vs RouterOS real)

| # | Operación | Contrato previsto por el adaptador | Respuesta real CHR 7.16.2 | Resultado |
|---|---|---|---|---|
| 1 | Health | `GET /rest/system/resource` | `200` JSON (`platform: MikroTik`, `version: 7.16.2`) | ✅ |
| 2 | Sesiones activas | `GET /rest/ip/hotspot/active` | `200 []` | ✅ |
| 3 | Filtro por MAC | `GET …/active?mac-address=…` | `200 []` (sintaxis aceptada) | ✅ |
| 4 | Autorizar (login) | `POST /rest/ip/hotspot/active/login` con `rate-limit` | `400 unknown parameter rate-limit`; sin `rate-limit` → `400 unknown host IP` (requiere host hotspot) | ⚠️ corregido (se elimina `rate-limit`; fallback operativo) |
| 5 | Crear address-list | `POST /rest/ip/firewall/address-list` | **`400 no such command`**; crear requiere **`PUT`** (`201 {".id":"*A"}`) | ❌→✅ **corregido a PUT** |
| 6 | Listar address-list | `GET /rest/ip/firewall/address-list` | `200` array con `.id`, `list`, `address`, `comment` | ✅ |
| 7 | Borrar address-list | `DELETE /rest/ip/firewall/address-list/{id}` | `204` | ✅ |
| 8 | Desconectar hotspot | `GET active?mac` + `DELETE active/{id}` | `200 []` + `DELETE` no validado sin cliente real | 🟡 estructural |
| 9 | Revocar address-list | *(no existía)* | `GET` + `DELETE` por `comment`/IP | ❌→✅ **añadido** |
| 10 | Auth Basic | `Authorization: Basic` | `401` con credenciales incorrectas | ✅ |
| 11 | TLS | HTTPS implícito | `www-ssl` con certificado autofirmado (fallaría `fetch` TLS) | 📝 documentado |

## 4. Brechas encontradas y correcciones aplicadas

1. **Crear entradas de address-list con `PUT`, no `POST`.** RouterOS v7 REST usa `POST` para ejecutar
   comandos; `POST /rest/ip/firewall/address-list` devuelve `400 no such command`. El adaptador ahora
   crea con `PUT` (`authorize` fallback).
2. **Revocación incompleta (riesgo de seguridad).** Antes `disconnect` solo borraba
   `/ip/hotspot/active`; las entradas de address-list del fallback **quedaban activas** (bypass
   permanente). Ahora `disconnect` también lista y borra las entradas de
   `/ip/firewall/address-list` cuyo `comment` es `sfh:<sessionId>` o cuya `address` coincide con la IP.
3. **`rate-limit` no es parámetro válido del login REST** en RouterOS real → se elimina del body.
4. **Opción `preferAddressList`.** Permite saltar el `POST login` no soportado y usar directamente la vía
   address-list (latencia en lab: **46 ms vs 270 ms**); útil si no se usa el hotspot nativo.
5. **Emulador `sfh-sim` alineado con RouterOS real**: `PUT` crea (201) y `POST` devuelve `400`, igual que
   el CHR; tests `sfh-sim` **17/17** y spike **12/12**.
6. **Tests nuevos**: `sfh-orchestrator/test/gateways-routeros-real.test.ts` (fallback PUT, revocación de
   address-list, idempotencia, `preferAddressList`). Suite orquestador **57/57**.

## 5. Evidencia de aceptación

`CHR_URL=http://127.0.0.1:8080 CHR_USER=admin CHR_PASS=sfh-lab node sfh-chr/probe.mjs` →
**19/19 PASS · exit 0**. Log completo: [`pruebas/h7_fase_d_chr.log`](pruebas/h7_fase_d_chr.log).
Captura de consola RouterOS: [`pruebas/fase_d_chr_console.png`](pruebas/fase_d_chr_console.png).

| Bloque | Escenarios | Resultado |
|---|---|---|
| Contrato REST crudo (health, active, filtro, login, PUT/GET/DELETE address-list, POST no crea, auth) | 9 | ✅ |
| Adaptador real (health, authorize fallback, entrada visible con `comment sfh:*`, disconnect retira, idempotencia, `preferAddressList`) | 7 | ✅ |
| Concurrencia (10 authorize + 10 disconnect) y sin residuos | 3 | ✅ |

## 6. Veredicto

**Fase D: COMPLETADA en laboratorio.** El adaptador funciona contra RouterOS real por la vía
**address-list** (autorización server-side del brief §3.A) y la revoca correctamente; se corrigieron
dos defectos reales (PUT y limpieza de address-list) y se añadió `preferAddressList`.

**Queda para hardware (P-07):**
- Validar el flujo nativo `hotspot/active/login` + `DELETE active` con un **cliente hotspot real**
  conectado al CHR/router (MAC/IP reales, portal cautivo, QoS).
- Validar TLS con certificado válido (o definir VLAN de gestión con HTTP) y el throughput real.
- Repetir el laboratorio en un host con KVM/router físico para métricas representativas.

## 7. Recomendaciones operativas

- En producción con RouterOS REST, configurar `preferAddressList: true` salvo que se use el hotspot
  nativo; usar `addressList` dedicada (`sfh-authorized`) y `comment` con el `sessionId`.
- No usar `http` en redes no confiables: certificado válido en `www-ssl` o túnel/VLAN de gestión.
- El QoS por `rate-limit` del login REST no existe; aplicar ancho de banda vía perfil de usuario,
  queue o RADIUS (Opción B).
