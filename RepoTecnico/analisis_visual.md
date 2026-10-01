# Análisis Visual — Superfluid EUR Streaming (rediseño v1.1)

> `@visualUiUx` · Fase 1 (análisis) · 2026-10-01 · Entrada: petición textual del director
> ("interfaz amigable, colores claros, estilo moderno") + decisiones de entrevista:
> **marca teal/aguamarina**, **claro + oscuro con toggle persistido**, **Geist + escala modular**.
> Stack real detectado: Next.js 15.5.4 + React 19 + **Tailwind CSS v4** (`@theme` CSS-first,
> `@tailwindcss/postcss`) — NO hay tailwind.config; los tokens viven en `globals.css`.
> Restricción heredada: WCAG AA automatizada con axe (RNF-09) — ningún par puede romper AA
> porque el E2E `axe.spec.ts` es criterio de salida de fase.

## 1. Paleta cromática (roles semánticos)

### 1.1 Escala de marca (teal) y neutros de soporte

| Token | HEX (L) | HSL | Uso |
|---|---|---|---|
| `brand-25` | `#F0FAF7` | 168 67% 96% | fondos pill/badge sutiles |
| `brand-500` | `#14B8A6` | 173 80% 40% | acentos decorativos, gráficos |
| `brand-600` | `#0D9488` | 173 84% 32% | **focus-ring** (3.74:1 ✓ UI≥3) |
| `brand-700` | `#0F766E` | 177 78% 26% | **interactive** (botón primario, enlaces) |
| `brand-800` | `#115E59` | 177 69% 22% | hover/active, texto sobre `brand-25` |
| `brand-900` | `#134E4A` | 178 61% 19% | activo profundo |

### 1.2 Roles por tema (los ratios están calculados, no estimados)

| Rol | Claro | Oscuro | Ratio sobre su fondo (AA) |
|---|---|---|---|
| `bg` (página) | `#F4FAF8` | `#0B1F1C` | — |
| `surface` | `#FFFFFF` | `#0E2723` | — |
| `surface-raised` | `#FFFFFF` + elev | `#14332D` | — |
| `ink` (texto primario) | `#0F2F2A` | `#E9F5F1` | **14.4 / 14.1 AAA** |
| `ink-secondary` | `#3E6B63` | `#A9C9C0` | **6.0 / 8.9 AA+/AAA** |
| `ink-muted` (captions) | `#4A6F68` | `#8FB3AA` | **5.6 AA** |
| `ink-disabled` | `#93B3AC` | `#5C7F77` | exento WCAG (deshabilitado) |
| `ink-on-brand` | `#FFFFFF` sobre `brand-700` | `#062A25` sobre `brand-400 #2DD4BF` | **5.5 AA / 8.3 AAA** |
| `interactive` | `brand-700` | `brand-300 #5EEAD4` (texto/enlace) | 5.5 / **11.6 AAA** |
| `border` | `#C7DED7` | `#1F4C44` | separador (exento) |
| `border-strong` (inputs) | `#5E8F84` | `#46857A` | **3.7 / 4.0 ✓ UI≥3** |
| `focus-ring` | `brand-600` | `brand-400` | **3.7 / 9.2 ✓ UI≥3** |
| `success` | texto `#15803D` · bg `#ECFDF3` | texto `#6EE7B7` · bg `#103A2A` | 5.0 / 11.2 AAA |
| `warning` | texto `#78350F` · bg `#FEF3C7` | texto `#FCD34D` · bg `#3A2E12` | **8.2/8.1 AAA** |
| `error` | texto `#B42318` · bg `#FEE2E2` (banner texto `#7F1D1D` 8.2) | texto `#FCA5A5` · bg `#2B1414` | **9.0 AAA** |
| `info` (disclaimer) | texto `#075985` · bg `#E0F2FE` | texto `#7DD3FC` · bg `#12303E` | **7.6 AAA** |

**Pares prohibidos** (documentados en el manual): `brand-500` como texto sobre blanco (2.3 ✗),
texto `ink-disabled` como información obligatoria, `warning` con texto blanco sobre ámbar claro.

## 2. Tipografía — Geist + escala modular 1.25 (tercera mayor)

Cero riesgo de red/build: Geist y Geist_Mono ya las carga `next/font` (self-hosted). Fallback
`system-ui, sans-serif`. Pesos cargados: **400/500/600/700** (no 9).

| Nivel | Rem | Px | Peso | Line-height | Tracking | Uso |
|---|---|---|---|---|---|---|
| display | 2.441 | 39 | 700 | 1.15 | −0.02em | hero/nombre app (una vez) |
| h1 | 1.953 | 31.2 | 700 | 1.2 | −0.015em | título de página |
| h2 | 1.563 | 25 | 600 | 1.25 | −0.01em | secciones (Mis streams…) |
| h3 | 1.25 | 20 | 600 | 1.3 | 0 | subtítulos de card |
| body-lg | 1.125 | 18 | 400 | 1.5 | 0 | cifras destacadas (`tabular-nums`) |
| body | 1 | 16 | 400 | 1.5 | 0 | texto general (**≥16px, legibilidad**) |
| body-sm | 0.875 | 14 | 400/500 | 1.45 | 0 | hints, tablas |
| caption | 0.8125 | 13 | 500 | 1.4 | 0.02em | etiquetas de stat (upright, no ALLCAPS agresivo) |
| code/mono | 0.875 | 14 | 400 | 1.4 | 0 | direcciones (Geist Mono), `0x1234…abcd` |

## 3. Escala de espaciado · radios · elevación · grid

- **Espaciado (base 4)**: 4 (gap icono-texto) · 8 (interna chip) · 12 (padding botón sm) · 16 (gap grid móvil, padding card) · 24 (separación de secciones sm, gutter) · 32 (entre secciones) · 48/64 (respiro hero/footer).
- **Radios**: `sm` 0.375rem inputs · `md` 0.5rem botones · `lg` 0.875rem cards/modales · `full` pills/badges.
- **Elevación** (sombras frías teal, nunca grises puros):
  - `elevation-1` cards: `0 1px 2px rgb(15 47 42 / 0.06), 0 1px 3px rgb(15 47 42 / 0.08)`
  - `elevation-2` popovers/modales: `0 8px 24px −6px rgb(15 47 42 / 0.18)`
  - `elevation-3` toast: `0 12px 32px −8px rgb(15 47 42 / 0.28)`
  - oscuro: misma geometría con `rgb(0 0 0 / .5)` + halo `ring-1 ring-[--border]`.
- **Grid/breakpoints**: Tailwind v4 defaults (`sm 640 md 768 lg 1024 xl 1280`), contenido `max-w-5xl` (64rem), gutters 16→24, stats 2×2 móvil → 4 columnas `lg`.
- **Micro-interacciones**: transición 150 ms `ease-out` color/transform; hover botones −luminancia; focus-visible ring 2px + offset 2px; pulso "fluyendo" (dot animated, `aria-hidden`, respeta `prefers-reduced-motion`); skeleton shimmer 1.2 s en carga inicial. Área táctil mínima 44×44 en iconos.

## 4. Inventario de componentes (Atomic Design)

**Átomos**: `Button` (variants: primary/secondary/danger/ghost · estados default/hover/focus-visible/active/disabled/loading), `Input`, `Badge`/`StatusPill` (activo/pausado/degradado), `Stat` (label+valor+hint), `Toggle` (tema), `Icon`(inline SVG aria-hidden), `Divider`, `Spinner`, `Skeleton`.
**Moléculas**: `Field`(label+input+error aria-describedby), `Toast`(role=alert, auto-6 s, excluye announcer), `DataRow`(flujo), `Pagination`(nav aria-label="paginación de streams"), `NetRateMeter`(valor + pulso).
**Organismos**: `HeaderBar`(marca+tema+wallet), `DisclaimerBanner`(role=note), `BalanceGrid`, `WrapPanel`, `NewFlowForm`, `FlowsTable`, `ReceivedPanel`, `SettleDetails`, `Modal` (dialog aria-modal, foco atrapado, Esc cierra), `Footer`.
**Plantilla**: página única `Dashboard` + estados: cargando (skeleton), vacío (guía paso 1-2-3), error-red (banner+Reintentar ahora), wallet-ausente (solo lectura), red-incorrecta (bloqueo visible).

## 5. Decisiones y justificación

| Decisión | Por qué |
|---|---|
| Teal (elección del director) | semántica "flujo/agua" del producto; sobre fondo casi-blanco `#F4FAF8`读 amigable y luminoso sin saturar |
| Toggle claro/oscuro persistido + script anti-FOUC | el scaffold forzado por `prefers-color-scheme` rompía el AA verificado; ahora tema determinista por usuario y axe comprueba **ambos** |
| Tokens CSS runtime-swap en `@theme` de Tailwind v4 | patrón nativo v4 (no tailwind.config); utilities `bg-surface/text-ink/…` sin valores mágicos en el JSX |
| Geist + escala 1.25 | cero riesgo de build Docker (self-host), estética moderna Next; body ≥16px |
| Conservar todos los anclas a11y/textuales | `wallet.spec/lifecycle/pagination` dependen de roles/aria-labels/textos exactos; el rediseño solo toca clases y estructura visual |
| Sombras con tinte teal + radios 0.875rem | lenguaje "moderno suave" (cards flotantes, glass sticky header) manteniendo contraste AA |
