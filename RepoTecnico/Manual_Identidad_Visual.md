# Manual de Identidad Visual — Superfluid EUR Streaming

> Versión **1.1** (2026-10-01) · `@visualUiUx` · Fuente única de verdad del sistema visual.
> Implementación: `web/src/app/globals.css` (tokens) + utilidades Tailwind v4 (`@theme`).
> Derivación a documentación formal: `@manuales` debe incluir este manual como anexo del técnico.
>
> **Changelog**
> | Ver | Fecha | Cambio |
> |---|---|---|
> | 1.0 | 2026-09 (scaffold) | Neutros crudos `#fff/#171717` + paleta ad-hoc de Tailwind (blue-700, amber-500…), oscuro forzado por `prefers-color-scheme` |
> | 1.1 | 2026-10-01 | Marca **teal**, roles semánticos con swap por `[data-theme]`, toggle persistido claro/oscuro, escala modular 1.25 sobre Geist, elevación fría, componentes tokenizados, axe AA obligatorio **en ambos temas** |

---

## 1. Brief y concepto

**Producto**: dashboard educativo de money streaming (tokens de prueba) — debe sentirse vivo,
claro y confiable, nunca corporativo-frio ni lúdico-infantil.

**Personalidad**: fluida, luminosa, didáctica. **Tono**: cercano con precisión técnica (cifras
tabulares, addresses monoespaciadas). **Público**: estudiantes Web3 en red privada académica.

**Dirección elegida (entrevista 2026-10-01)**: marca teal/aguamarina ("agua/fluido", guiño a
Superfluid), fondo casi-blanco con tinte verde-agua, modo oscuro verdoso profundo disponible por
toggle. Referencias: fintech 2026 (cards elevadas, glass sticky header), Geist como voz tipográfica
nativa del stack.

## 2. Paleta por roles semánticos

### 2.1 Neutros de marca (referencia)

| Paso | HEX | HSL | Uso |
|---|---|---|---|
| teal-25 | `#F0FAF7` | 168 67% 96% | `brand-subtle` L |
| teal-400 | `#2DD4BF` | 173 66% 50% | primary D, focus D |
| teal-500 | `#14B8A6` | 173 80% 40% | solo decorativo (texto ✗) |
| teal-600 | `#0D9488` | 173 84% 32% | focus-ring L (3.7:1 UI ✓) |
| teal-700 | `#0F766E` | 177 78% 26% | primary/interactive L |
| teal-800 | `#115E59` | 177 69% 22% | hover L / `brand-subtle-ink` D→L 7.2:1 ✓ |
| ink-deep | `#0F2F2A` | 173 51% 12% | texto primario L (14.4 AAA) |

### 2.2 Roles por tema (tokens `--sf-*`)

| Rol | Claro | Oscuro | Ratio (vs fondo de uso) | Nivel |
|---|---|---|---|---|
| `bg` | `#F4FAF8` | `#0B1F1C` | — | — |
| `surface` | `#FFFFFF` | `#0E2723` | — | — |
| `surface-raised` | `#FFFFFF` | `#14332D` | — | — |
| `surface-sunken` | `#EEF6F3` | `#091B18` | — | — |
| `ink` | `#0F2F2A` | `#E9F5F1` | 14.4 / 14.1 | AAA |
| `ink-secondary` | `#3E6B63` | `#A9C9C0` | 6.0 / 8.9 | AA+ / AAA |
| `ink-muted` | `#4A6F68` | `#8FB3AA` | 5.6 / ≈5.8 | AA |
| `ink-disabled` | `#93B3AC` | `#5C7F77` | exento (deshabilitado) | — |
| `interactive` (texto/enlace) | `#0F766E` | `#5EEAD4` | 5.5 / 11.6 | AA / AAA |
| `primary` (bg botón) | `#0F766E` | `#2DD4BF` | con `ink-on-brand`: 5.5 / 8.3 | AA / AAA |
| `ink-on-brand` | `#FFFFFF` | `#062A25` | ↑ | ↑ |
| `border` | `#C7DED7` | `#1F4C44` | separador (exento) | — |
| `border-strong` (inputs) | `#5E8F84` | `#46857A` | 3.7 / 4.0 | UI ✓ |
| `focus-ring` | `#0D9488` | `#2DD4BF` | 3.7 / 9.2 | UI ✓ |
| `success` | `#15803D` bg `#ECFDF3` | `#6EE7B7` bg `#103A2A` | 5.0 / 11.2 | AA / AAA |
| `warning` | `#78350F` bg `#FEF3C7` | `#FCD34D` bg `#3A2E12` | 8.2 / ≈9 | AAA |
| `error` | `#B42318` bg `#FEE2E2` | `#FCA5A5` bg `#2B1414` | botones 6.6 / 8.5 | AAA |
| `error-ink` (textos) | `#7F1D1D` | `#FCA5A5` | 8.2 / 9.0 | AAA |
| `info` (disclaimer) | `#075985` bg `#E0F2FE` | `#7DD3FC` bg `#12303E` | 7.6 / ≈9 | AAA |

**Pares prohibidos**: teal-500 `#14B8A6` como texto sobre blanco/surface (2.3 ✗) · cualquier
texto sobre `warning-bg` en blanco puro (usar `--sf-warning`) · `ink-disabled` para información
obligatoria · usar `prefers-color-scheme` directo (todo pasa por `[data-theme]`).

## 3. Tipografía

Familia: **Geist Sans** (texto) + **Geist Mono** (addresses, código) vía `next/font` (self-hosted,
fallback `ui-sans-serif, system-ui`). Pesos cargados: 400/500/600/700. Cuerpo base **16 px** (1rem).
Escala modular **1.25**:

| Nivel | Tokens Tailwind v4 | Rem/Px | Peso/LH/Tracking | Uso |
|---|---|---|---|---|
| display | `text-[2.441rem]` (no definido como token: usar solo si hay portada) | 2.441/39 | 700 · 1.15 · −0.02em | — |
| h1 | `text-h1` | 1.953/31 | 700 · 1.2 · −0.015em | título de página (sr-only en dashboard) |
| h2 | `text-h2` | 1.563/25 | 600 · 1.25 · −0.01em | "Balances" |
| h3 | `text-h3` | 1.25/20 | 600 · 1.3 | títulos de card |
| body-lg | `text-body-lg` | 1.125/18 | 400 · 1.5 | cifras de stat (con `.tnum`) |
| body | base | 1/16 | 400 · 1.5 | texto |
| body-sm | `text-body-sm` | .875/14 | 400/500 · 1.45 | inputs, tabla, toasts |
| caption | `text-caption` | .8125/13 | 500 · 1.4 · +0.02em (labels en mayúsculas) | etiquetas stat, badges |
| code | `font-mono` + body-sm | .875/14 | 400 | direcciones recortadas `0x1234…cdef` |

## 4. Espaciado · radios · elevación · grid

- **Espaciado base 4**: `1` (4px gap icono) · `2` (8 chips) · `3` (12 botones sm) · `4` (16 padding interno, gaps grid) · `6` (24) · `8` (32 secciones) · `16` (64 hero). Card estándar: `p-6`, gaps `gap-3/gap-4`.
- **Radios**: inputs `rounded-md` (0.5) · botones `rounded-md` · **cards/modales `rounded-card`** (0.875 rem) · pills/badges/dot `rounded-pill`.
- **Elevación**: `shadow-card` (stats, botones secundarios) · `shadow-pop` (modal) · `shadow-toast` (toast flotante inferior, centrado, `z-50`). En oscuro, mismas claves con negro + `border` visible.
- **Grid**: contenedor `max-w-5xl px-4`; stats 2 cols móvil → 4 cols `lg`; tabla con `overflow-x-auto`. Breakpoints Tailwind defaults (640/768/1024/1280).
- **Header sticky**: `bg-[var(--sf-glass)] backdrop-blur` + `border-b divider` (glass solo en barra superior; nunca sobre áreas de datos).

## 5. Tabla de tokens (rol → variable → utilidad)

| Rol | CSS var | Utilidad Tailwind | Componente de referencia |
|---|---|---|---|
| fondo página | `--sf-bg` | `bg-canvas` | layout |
| superficie | `--sf-surface` | `bg-surface` | `Card` |
| elevada | `--sf-surface-raised` | `bg-raised` | `Stat`, `Input`, `BtnSecondary` |
| hundida | `--sf-surface-sunken` | `bg-sunken` | thead, filas Recibidos |
| texto | `--sf-ink` | `text-ink` | global body |
| texto 2/3 | `--sf-ink-secondary/muted` | `text-ink-2 / text-ink-3` | hints, labels |
| marca | `--sf-brand` | `text-brand / border-brand` | enlaces, hover |
| primario | `--sf-primary(+hover/active)` | `bg-primary hover:bg-primary-hover` | `BtnPrimary` |
| sobre marca | `--sf-ink-on-brand` | `text-on-brand` | `BtnPrimary` |
| sobre error | `--sf-on-error` | `text-on-err` | `BtnDanger` |
| sutileza marca | `--sf-brand-subtle(+ink)` | `bg-brand-subtle text-brand-subtle-ink` | badge BETA, contador |
| borde | `--sf-border / strong / divider` | `border-line / line-strong / divider` | inputs, cards |
| estados | `--sf-success/warning/error/info (+-bg, -ink)` | `text-ok/warn/err/info`, `bg-ok-bg…` | `StatusPill`, toasts, banners |
| foco | `--sf-focus-ring` | `:focus-visible` global (outline 2px + offset 2px) | todos los interactivos |
| elevación | `--sf-elev-1..3` | `shadow-card / pop / toast` | — |
| radio card | `--radius-card` | `rounded-card` | — |

## 6. Inventario de componentes (Atomic Design)

**Átomos**
| Componente | Variantes | Estados | A11y |
|---|---|---|---|
| `BtnPrimary` | default | hover/active/**focus-visible**(ring)/disabled(50 %)/loading('…') | min 44px alto, label obligatorio |
| `BtnSecondary` | = borde+surface | idem, hover → texto `brand` | idem |
| `BtnDanger` | solo confirmar destructive | idem | nunca primario |
| `Input` | text/decimal | focus ring, disabled, placeholder `ink-disabled` | `aria-label` o `Field` label |
| `StatusPill` | Activo(dot pulse)/Pausado/Cerrado | — | texto completo no solo color |
| `Stat` | neutral/ok/err | — | `aria-label="{label}: {value}"` obligatorio (ancla E2E) |
| `ThemeToggle` | icono sun/moon | hover/focus | `aria-label` dinámico, 44×44 |
| `sf-flow-dot` | decorativo | — | `aria-hidden`, stop en `prefers-reduced-motion` |
| `sf-skeleton` | carga | — | contenedor `role="status"` + label |

**Moléculas**: `Field`(label+input) · `Card`(header accionable + contenido) · `EmptyState` (borde dashed guía) · `Toast` fijo inferior central, auto 6s, `role=alert`+`aria-live=assertive` · `Pagination` (`nav aria-label="paginación de streams"`, textos exactos `página X/Y`).
**Organismos**: `HeaderBar` glass · `DisclaimerBanner` info · `BalanceGrid` · `WrapPanel` · `NewFlowForm` · `FlowsTable` · `ReceivedPanel` · `SettleDetails` · `Modal` irrevocabilidad (`role=dialog aria-modal`, Esc/cancelar, botones deshabilitados con busy).
**Plantilla**: página única con estados: cargando (skeleton) · vacío (guía) · error-red (banner+reintentar) · sin wallet (solo lectura) · red-incorrecta (alerta + mutaciones bloqueadas).

## 7. Directrices de implementación

1. **Nada de colores literales en JSX**: solo utilidades de token. Excepción permitida: gradiente del logo (deco) y `--sf-glass`.
2. Tema: **únicamente** `[data-theme]` gestionado por `lib/theme.ts` (localStorage `sf-theme`, init anti-FOUC en `layout.tsx`). No usar `prefers-color-scheme` en CSS (la variante `dark:` de Tailwind está re-atachada a `[data-theme]` con `@custom-variant`).
3. Números: siempre `.tnum` (tabular) y `formatEur` truncado a 6 dec — no redondear.
4. Direcciones: recorte `0x123456…abcdef` con `font-mono`; never break-all en medio de frase.
5. Nuevos pares de color: **calcular ratio antes de mergear** (script en analisis_visual) y añadir fila a §2.2; CI axe (E2E dual-tema) bloquea regresiones.
6. Mantener anclas de test: textos de estados, `aria-label`s de Stat/cuenta/paginación, roles alert/status/dialog. Cambiar un string ⇒ actualizar spec en el mismo commit.

## 8. Accesibilidad

- AA garantizado por axe automatizado en **claro y oscuro** (spec `axe.spec.ts` iterando `data-theme`), severity critical/serious = 0.
- Foco visible global (`outline 2px --sf-focus-ring`, offset 2). Área táctil ≥44px en botones/toggle.
- Jerarquía de encabezados: h1 sr-only (título visual en header), h2 secciones, h3 cards.
- Lenguaje `lang="es"`, `aria-busy` durante mutaciones, cifras económicas con `aria-label` completo.
- `prefers-reduced-motion`: pulso y shimmer desactivados.

## 9. Ejemplos (do/don't)

| ✅ Do | ❌ Don't |
|---|---|
| `bg-primary text-on-brand` | `bg-blue-700 text-white` (fuera de marca) |
| `text-ok bg-ok-bg` para "Activo" | `text-green-800` ad-hoc |
| `rounded-card` en cards | `rounded-xl` mágico por componente |
| Toast fijo `shadow-toast` | alertas inline empujando el layout |
| Skeleton al cargar stats | spinner centrado que oculta la estructura |
