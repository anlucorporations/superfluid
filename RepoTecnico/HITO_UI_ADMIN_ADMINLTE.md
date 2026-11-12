# Rediseño del panel admin — look & feel AdminLTE

> Fecha: 2026-11-12 · Skill: `@visualUiUx` · Estado: implementado, build y tests verdes;
> verificación visual con sesión admin **pendiente** (requiere wallet admin).

## Decisiones (confirmadas por el usuario)

| Tema | Decisión |
|---|---|
| Integración | Look & feel AdminLTE reproducido en React + Tailwind (sin cargar su CSS/jQuery). |
| Alcance | Shell (sidebar, navbar, nav móvil) + las 7 vistas admin. |
| Paleta | Tokens `adminlte.*` nuevos, solo para `/admin`. |

## Cambios

- `web/tailwind.config.ts`: bloque `adminlte` (primary `#007bff`, sidebar `#343a40`,
  content `#f4f6f9`, etc.) y sombra `adminlte-card`. `brand`/`ink` sin cambios.
- `web/src/app/admin/layout.tsx`: shell con sidebar oscuro (desktop), navbar claro,
  navegación móvil y `aria-current`. Lógica de sesión, guardas y logout **sin cambios**.
- `web/src/components/adminlte.tsx` (nuevo): Card, CardHeader, CardBody, InfoBox, Button,
  Field, Input, Select, Alert, Badge, EmptyState, Mono.
- Páginas `/admin/*`: import cambiado de `@/components/ui` a `@/components/adminlte`
  (misma API, sin cambios de lógica).
- `components/ui.tsx` **intacto**: la Suite del empleado (`/suite`) sigue usándolo.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | ✅ sin errores |
| `npm test` | ✅ 43/43 |
| `npm run build` | ✅ 38 rutas |
| Clases AdminLTE en CSS compilado | ✅ presentes |
| Guarda `/admin` sin sesión → `/login` | ✅ |
| Captura del shell con sesión admin | ⬜ pendiente (requiere wallet admin) |

## Pendiente

- Captura visual del panel con sesión admin (sidebar, páginas de flujos/empleados).
- El login (`/login`) aún usa la paleta `brand`: migrarlo a AdminLTE si se quiere coherencia total.
