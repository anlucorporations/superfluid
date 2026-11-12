# Web corporativa ANLU corporations — portada pública ampliada

> Fecha: 2026-11-12 · Estado: ✅ desplegado (`brltv2-00018-b2w`) y verificado en vivo.
> Archivo único: `web/src/app/page.tsx` (portada `/`).

## Requisito

Ampliar la portada de entrada (`/`) para que presente a **ANLU corporations** como empresa de
tecnología —no solo el producto— con secciones comerciales y el acceso a las suites.

## Qué se hizo

Se reescribió `web/src/app/page.tsx` (+495 / −43 líneas), manteniendo el acceso a las suites
(`/entrar`) y el look & feel AdminLTE ya usado en el panel:

| Sección | Contenido |
|---|---|
| Cabecera fija | Logo ANLU, navegación por anclas (desktop) y botón **Entrar** |
| Hero | «Software que mueve dinero en tiempo real» + tarjeta de capacidades Superfluid Brlt |
| Servicios | 6 capacidades: software a medida, cloud, blockchain, pagos/nómina, datos, seguridad |
| Sectores | 4 sectores: empresas/nómina, finanzas, industria, servicios profesionales |
| Producto insignia | Superfluid Brlt (pagos por segundo, cobro autónomo, control admin, conciliación) + accesos a panel y suite |
| Cómo trabajamos | Proceso en 4 hitos: concepto, auditoría/diseño, desarrollo, pruebas/operación |
| Tecnología | 12 tecnologías (Next.js, Solidity, Foundry, Besu, Cloud Run, Mongo, SIWE…) |
| Contacto | CTA a wallet y correo (`info@anlucorporations.com`) + resumen de áreas/modelo |
| Pie | Producto (Superfluid Brlt, acceso wallet, ayuda), empresa y notas legales |

- `metadata` propia: título y descripción de ANLU corporations.
- Anclas con `scroll-mt-20` para compensar la cabecera fija; navegación oculta en móvil
  (las secciones se recorren en scroll).
- Sin JavaScript de cliente: la página es un componente de servidor, sin estado ni llamadas a
  MongoDB o RPC. Sirve aunque la base de datos esté caída.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | ✅ sin errores |
| `npm test` | ✅ 43/43 |
| `npm run build` | ✅ 38 rutas |
| Render local (Playwright 1366×900 y 390×844) | ✅ sin errores de consola |
| Build + deploy Cloud Build → Cloud Run | ✅ `brltv2-00018-b2w` |
| `GET /` en producción | ✅ título y H1 nuevos («Software que mueve dinero…») |
| Anclas `#servicios #sectores #plataforma #proceso #tecnologia #contacto` | ✅ presentes |
| `/entrar`, `/suite`, `/admin` | ✅ HTTP 200 (sirven la app; sus APIs dependen de Mongo) |
| Capturas producción | `pruebas/web_corporativa/40_home_desktop.png`, `41_home_mobile.png` |

## Incidencia abierta (no causada por este cambio)

A las **19:41 UTC** se eliminó la VM `mongo-brltv2` (10.140.0.10, IP reservada
`brltv2-mongo-ip`) desde una sesión de `gcloud` externa al proyecto (`agent-name/open_code`,
Windows). Con ello:

- `GET /api/health` responde **500** (no 503): `ensureIndexes()` lanza al no poder conectar.
- Las APIs que usan Mongo fallan: `/api/auth/role` (visto desde `/entrar` a las 20:38 UTC) y
  todo el panel admin/suite.
- La portada `/` sigue sirviendo porque es estática.

La VM no tenía snapshot ni backup automático (ya documentado en `HITO_H8`); los objetos en
`gs://plataforma-txbarlovento-backups/db/` son de 30 bytes (vacíos). El disco se eliminó con
la instancia, por lo que el contenido de `superfluid_anvil` (`system_config`, allowlist,
empleados y flujos de prueba) **no es recuperable**; habría que recrear el Mongo y volver a
ejecutar seed + registro de despliegue.

Recrear la VM es decisión del responsable (coste/alcance); queda propuesto en el informe de
esta sesión.
