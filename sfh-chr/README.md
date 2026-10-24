# sfh-chr — Laboratorio CHR (RouterOS real) para la Fase D

Validación del adaptador MikroTik contra **RouterOS real** sin hardware, usando **CHR 7.16.2**
(Cloud Hosted Router, licencia trial 60 días) sobre **QEMU en modo TCG**.

> Resultado: **19/19 PASS** contra el CHR real. Informe:
> [`SFhostpot/INFORME_FASE_D_CHR.md`](../SFhostpot/INFORME_FASE_D_CHR.md) ·
> Evidencia: [`SFhostpot/pruebas/h7_fase_d_chr.log`](../SFhostpot/pruebas/h7_fase_d_chr.log).

## Contexto del host

- **Sin `/dev/kvm`** y sin virtualización anidada: la org policy
  `compute.disableNestedVirtualization` está enforced. TCG funciona, pero es lento (no usar para
  benchmarks).
- **Sin sudo**: QEMU se descarga como `.deb` de Ubuntu y se extrae en un prefijo de usuario
  (`/tmp/fased/root`); no se instala nada en el sistema.
- CHR se arranca headless; la configuración inicial se hace por consola VGA con `sendkey` del monitor
  de QEMU y la API REST queda expuesta por `hostfwd` en `127.0.0.1:8080`.

## Contenido

| Fichero | Uso |
|---|---|
| `boot.sh` | Descarga QEMU+deps, imagen CHR y arranca la VM con TCG y forwards 2222/8080 |
| `setup-console.py` | Primer login y configuración (password, `www`, IP 10.0.2.15, ruta, SSH) vía consola VGA |
| `probe.mjs` | Matriz de fidelidad + operaciones del adaptador real contra el CHR (19 escenarios) |

## Ejecución

```bash
# 1) arrancar CHR (2-4 min bajo TCG)
bash sfh-chr/boot.sh
# 2) configurar por consola (primer login; password del lab)
python3 sfh-chr/setup-console.py
# 3) compilar el orquestador y validar el adaptador
(cd sfh-orchestrator && npm run build)
CHR_URL=http://127.0.0.1:8080 CHR_USER=admin CHR_PASS=sfh-lab node sfh-chr/probe.mjs
```

Salida esperada: `passed: 19, failed: 0` (exit 0).

## Hallazgos de fidelidad (resumen)

| Contrato del adaptador | RouterOS 7.16.2 real | Corrección |
|---|---|---|
| `POST /rest/ip/firewall/address-list` para crear | **400 `no such command`**; crear requiere **PUT** | adaptador usa `PUT` (201) |
| `POST /rest/ip/hotspot/active/login` con `rate-limit` | **400 `unknown parameter rate-limit`**; sin `rate-limit` → 400 `unknown host IP` (requiere host hotspot) | se quita `rate-limit`; fallback address-list como vía server-side |
| `disconnect` solo borraba `hotspot/active` | las entradas de address-list quedaban vivas (bypass permanente) | ahora también elimina address-list por `comment sfh:<sessionId>` o IP |
| `GET /rest/ip/hotspot/active?mac-address=…` | 200 con `[]` (sintaxis aceptada) | sin cambios |
| `GET /rest/system/resource`, `DELETE address-list/{id}`, Basic auth | OK (200/204/401) | sin cambios |
| HTTPS con certificado autofirmado (www-ssl) | `fetch` fallaría por TLS | usar HTTP en VLAN de gestión o certificado válido |

## Límites

- No hay cliente hotspot real conectado: la rama `hotspot/active/login` + `DELETE active` no se
  valida end-to-end (requiere host/cliente hotspot); la vía **address-list** (la que usa el brief como
  fallback) sí está validada de punta a punta.
- TCG no representa rendimiento real (CPU ~91 %, latencias de cientos de ms).
- CHR trial caduca a los 60 días; para laboratorio recurrente, licencia P1/P10 o router físico.
