# Hito H12 — Finanzas de usuario y permisos por sección en el panel

> Fecha: 2026-11-16 · Estado: ✅ **implementado, desplegado y verificado en vivo**
> (revisión `brltv2-00025-rqf`, 100 % tráfico). Pre-flight: typecheck limpio ·
> Vitest **50/50** (7 suites; nueva `tests/permisos.test.ts`) · build con las
> rutas nuevas (`/admin/finanzas`, `/api/finanzas`).

## Modelo de permisos (`lib/permisos.ts`)

| Sesión | Secciones visibles |
|---|---|
| **Super Admin** (allowlist rol `super_admin`) | todas: resumen, finanzas, empleados, flujos, proyectos, **sistema**, jobs, auditoría |
| **Admin de sistema** (rol `admin`) | todas **menos `sistema`** (config + allowlist/roles) |
| **Operador** (rol `operador`) | resumen, finanzas, flujos |
| **Empleado** (sesión Suite) | **solo `finanzas`** (sus propias finanzas) |

- La allowlist puede sobreescribir con `secciones: Seccion[]` (sin duplicados ni
  valores inválidos); si falta, se deriva del rol.
- La navegación del panel se filtra por sesión; si se fuerza una URL no
  autorizada, el layout redirige a la primera sección permitida.
- **El acceso real lo exigen las APIs** (`requireAdminSection(req, seccion)` en
  cada ruta admin; `requireSuperAdmin` para gestión de allowlist/roles). Los
  empleados quedan bloqueados por rol en todas las rutas admin.

## Cambios

| Área | Detalle |
|---|---|
| `lib/permisos.ts` (nuevo) | `seccionesPorRol`, `seccionesDeSesion`, `requireAdminSection`, `requireSuperAdmin` |
| `lib/types.ts` | `AllowlistDoc.rol += "super_admin"`; `SECCIONES`/`Seccion`; `SessionInfo.adminRol` y `SessionInfo.secciones` |
| `app/api/auth/me` | devuelve `adminRol` + `secciones` según la allowlist |
| `app/api/finanzas` (nuevo) | empleado → sus balances on-chain, flujos y totales; admin/super → finanzas de todos los empleados activos |
| `app/admin/finanzas` (nuevo) | página de Finanzas: métricas + movimientos (empleado) y tabla por empleado (admin) |
| `app/admin/layout.tsx` | NAV filtrado por `secciones`, badge de rol, redirecciones por sección |
| Rutas admin API | `requireAdmin` → guard de sección: employees/flujos/batches/scheduled/projects/jobs/audit/system |
| `app/api/admin/allowlist*` | GET/challenge → sección `sistema`; POST alta y PATCH rol/estado → **solo Super Admin** |
| `app/admin/sistema` | editor de allowlist visible solo para Super Admin; opción de rol `super_admin` |
| `lib/validation.ts` | esquemas de allowlist aceptan rol `super_admin` |
| Migración Mongo | wallet `0xb4eC…00DF` → rol `super_admin` en `admin_allowlist` |

## Verificación en vivo (SIWE firmado con las claves del Anvil)

| Prueba | Resultado |
|---|---|
| `#0` (super_admin) login + `/api/auth/me` | ✅ role admin · adminRol `super_admin` · 8 secciones |
| `#1` (admin) login + `/api/auth/me` | ✅ 7 secciones (sin `sistema`) |
| `#1` → `GET /api/system` | ✅ 403 `seccion_no_autorizada` |
| `#1` → `GET /api/employees` | ✅ 200 |
| `#1` → `GET /api/admin/allowlist` | ✅ 403 (necesita super admin) |
| `#0` → `GET /api/admin/allowlist` | ✅ 200 |
| `#2` (empleado) login suite + `/api/auth/me` | ✅ role empleado · secciones `["finanzas"]` |
| `#2` → `GET /api/finanzas` | ✅ tipo empleado · `Empleado Uno ANLU` · saldo 100 BRLT (wei) · 2 flujos |
| `#2` → `GET /api/employees` | ✅ 403 `Se requiere rol administrador` |
| `/api/health` | ✅ ok (db/rpc/31337) |
| Páginas `/`, `/admin`, `/admin/finanzas` | ✅ 200 |

## Complemento: refresco de saldos cada 10 s (2026-11-16, revisión `brltv2-00029-2vk`)

- La sección Finanzas muestra los saldos on-chain y **solo los saldos se renuevan
  cada 10 s**: la carga completa (flujos, fichas, tablas) se hace una vez al entrar
  y no se vuelve a pedir.
- Nuevo modo ligero `GET /api/finanzas?saldos=1`: devuelve únicamente balances
  (`walletBrlt`, `walletBrltx`, `cobrable`) — para empleado, la lista por empleado
  activo para admins — sin tocar flujos ni fichas.
- La UI indica la última actualización ("Saldos on-chain renovados automáticamente
  cada 10 s · última actualización hh:mm:ss").
- Verificado en vivo: `?saldos=1` con sesión de empleado devolvió solo balances
  (100 BRLT / 0,039 BrltX / 0,98 cobrable) y la carga completa siguió operativa
  (2 flujos). Pre-flight: typecheck limpio · Vitest 50/50.

## Cumplimiento de los 3 requisitos

1. **Sección Finanzas** ✅ — nueva en el panel, visible para todos los roles con
   contenido según sesión (propia para empleados; agregada para admins).
2. **Panel solo muestra secciones autorizadas** ✅ — navegación filtrada +
   redirección + guards API por sección.
3. **Empleados solo Finanzas; el resto para Admin y Super Admin** ✅ —
   verificado con sesiones reales de los tres roles.
