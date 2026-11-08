---
name: Meu Comércio
description: One blue family in a single light theme, Inter for the app, flat cards on a tinted ground, and one dark "ink" block for the sale total, across the landing, login and sign up, the PDV and the management panel, for small-retail cash and fiado control.
colors:
  bg: "#f3f6fa"
  surface: "#ffffff"
  surface-2: "#eaf0f7"
  border: "#d6dfea"
  border-strong: "#b9c6d6"
  text: "#142033"
  muted: "#55647a"
  primary: "#2457c5"
  on-primary: "#ffffff"
  primary-soft: "#e6eefb"
  primary-text: "#1b449c"
  header: "#ffffff"
  on-header: "#111b2e"
  muted-on-header: "#5b6b82"
  header-line: "#e3e9f1"
  ink: "#14284b"
  on-ink: "#ffffff"
  muted-on-ink: "#a9bcd8"
  warn: "#8a4b00"
  warn-soft: "#fff4e0"
  danger: "#b42318"
  danger-soft: "#fde7e4"
  input: "#ffffff"
  overlay: "rgba(20, 40, 75, 0.55)"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "44px"
    fontWeight: 800
    lineHeight: normal
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: normal
  body:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: normal
  caption:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: normal
  landing-body:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  card: "20px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.lg}"
    padding: "0 22px"
    height: "48px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "48px"
  button-soft:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.on-header}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "20px"
  input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "56px"
  notice:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  error:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  total-block:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.xl}"
    padding: "24px"
  auth-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "32px"
  app-header:
    backgroundColor: "{colors.header}"
    textColor: "{colors.on-header}"
    padding: "12px 24px"
---

# Design System: Meu Comércio

Recorded from the code, which is the truth: tokens and shared primitives in `src/app/globals.css`; the font in `src/app/layout.tsx`; shared components in `src/frontend/ui/*` (`BrandMark`, `AppHeader`, `Skeleton`, `AppHeaderSkeleton`); and per-screen styles in `src/frontend/styles/landing.css`, `auth.css`, `pdv.css` and `management.css`. Every screen reads the same global tokens; a screen file only adds what is its own. Where a screen needs a token this file lacks, add it to `globals.css` and to this file first. Copy in the UI is Brazilian Portuguese; this file is English.

## Overview

**Creative North Star: "The Shop-Counter Ledger, in daylight"**

A calm, flat, readable system for the person behind a small counter. One blue family carries every action and every selected state. Cards sit on a tinted ground without borders or shadows, text is large, and money is always set in tabular figures. The same tokens exist in a light and a dark theme, so the PDV can follow the system (a shop with the lights low at night) while the marketing and sign-in screens stay light.

**Key Characteristics:**
- One theme, one blue family: light only. The app ignores the dark mode of the system.
- Flat tonal layering: `bg`, then `surface` cards, then `surface-2` for secondary fills. Structure comes from tone and hairlines, not from shadows.
- One accent (`primary`) for primary buttons, selected states, focus, the active nav item and the brand mark.
- One dark block, `ink`, reserved for the sale total in the PDV.
- Type scale 44 / 22 / 16 / 14 px in the app, Inter, tabular figures for money.
- Controls are large (48 to 64px for the main ones) and any control drawn smaller still has a 44px touch area.

## Themes

Defined in `globals.css`. There is only the light theme; there is no dark theme.

- **Light is the default** (`:root`, and `[data-theme='light']`). `color-scheme: light`.
- **No dark theme.** The app does not use `prefers-color-scheme` and sets `color-scheme: light`, so every screen stays light whatever the system theme is.
- `data-theme="light"` stays on the landing, sign in, sign up and open-cash roots; it changes nothing now and the PDV and management are light too.

## Colors

All values are copied from `globals.css`. Components use `var(--token)` only; no screen hard-codes a color except the thermal print area (`#fff`/`#000`) and the receipt preview.

| Token | Value | Used for |
|---|---|---|
| `bg` | `#f3f6fa` | page ground |
| `surface` | `#ffffff` | cards, modals, outline buttons, auth card |
| `surface-2` | `#eaf0f7` | soft button fill, hover on surfaces, limit bar track |
| `border` | `#d6dfea` | hairlines: table rows, card heads, section rules |
| `border-strong` | `#b9c6d6` | outline of buttons, inputs and choice buttons |
| `text` | `#142033` | primary text |
| `muted` | `#55647a` | secondary text, hints, placeholders, table heads |
| `primary` | `#2457c5` | primary button fill, focus ring, selection, active nav underline, selected-state border |
| `on-primary` | `#ffffff` | text on `primary` fills |
| `primary-soft` | `#e6eefb` | `.notice` fill, selected choice fill, latest cart row |
| `primary-text` | `#1b449c` | text on `primary-soft`, link-style buttons, confirmed state text |
| `header` | `#ffffff` | app header and open-cash top bar background |
| `on-header` | `#111b2e` | text in the header |
| `muted-on-header` | `#5b6b82` | inactive nav items, operator name |
| `header-line` | `#e3e9f1` | header bottom border, `.ghost` border |
| `ink` | `#14284b` | the PDV total block |
| `on-ink` | `#ffffff` | text on `ink` |
| `muted-on-ink` | `#a9bcd8` | secondary text on `ink` |
| `warn` | `#8a4b00` | offline bar, low stock, "Caixa fechado", over-count difference |
| `warn-soft` | `#fff4e0` | fill behind `warn` text |
| `danger` | `#b42318` | `.error`, invalid input border, debt, destructive actions |
| `danger-soft` | `#fde7e4` | fill behind `danger` text |
| `input` | `#ffffff` | text input fill |
| `overlay` | `rgba(20, 40, 75, 0.55)` | modal backdrop |

Derived colors are made with `color-mix` from these tokens (primary hover is `primary` 86% with `ink`; soft hover is `surface-2` 82% with `border-strong`; the skeleton block is `border` 65% with `surface-2`), never with new hex values.

### Named Rules
**The One Accent Rule.** `primary` marks an action, a selected state or focus. There is no second accent. `warn` and `danger` are states, not decoration: `danger` appears for errors, debt and destructive actions only.

**The Selected State Rule.** A selected segment, payment choice or quick amount (`aria-pressed="true"`) is a 2px `primary` border on a `primary-soft` fill with `primary-text` text and weight 700. The padding is reduced by 1px so the 2px border does not change the size.

**The Token Only Rule.** New CSS uses `var(--...)` for color, so a color change happens in one place.

## Typography

**App font:** Inter, loaded with `next/font/google` in `src/app/layout.tsx` as the CSS variable `--font-inter` (`subsets: ["latin"]`, `display: "swap"`) and applied on `<html>`. `globals.css` exposes it as `--font-sans: var(--font-inter), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`, set on `body` at 16px with `line-height: normal`.

**Landing font:** the system font stack (`system-ui, -apple-system, 'Segoe UI', sans-serif`), set on `.landing` at 16px with `line-height: 1.5`. The landing deliberately does not use Inter.

### Hierarchy (app screens)
- **Display** (800, 44px, -0.02em): the sale total (`.pdv-total-value`, `.pdv-modal-total-value`, `.pdv-change-value`), the management KPI value, the open-cash title. On a phone these step down (40px, 36px, 32px, 30px depending on the element).
- **Title** (700, 22px): page and section titles, app brand in the header, auth title, the PDV card and empty-state titles, amount inputs. The management `h1` is 800.
- **Body** (16px): default text, table cells, buttons, inputs, nav items. Card titles are 600 or 700.
- **Caption** (14px): hints, labels (`.field-label` at 600), table heads, meta lines, notices, status bar, small buttons.
- Weights in use: 400, 500, 600, 700, 800.

### Landing sizes
The landing is marketing and has its own larger steps: hero h1 56px (44px under 900px, 36px under 600px), section h2 32px (28px under 900px), final-call h2 44px (36px, then 32px on narrow screens), lead and final-call text 18px, step numerals 22px, item titles 18px, wordmark 18px, note and footer 14px.

### Named Rules
**The Tabular Rule.** Money and counters use `font-variant-numeric: tabular-nums`: the `.num` utility, the app clock, totals, table amount columns (`.mg-num`), the PIN and amount inputs, the landing example values and step numerals.

**The Scale Rule.** App screens use the 44 / 22 / 16 / 14 px scale. A one-off size (the 20px PIN input, the 40/36/32/30px phone steps of the display size) is a documented exception, not a new step.

## Layout

Written desktop-first in intent (the owner uses the product mostly on a desktop), with explicit phone behavior. Breakpoints in use: 480, 560, 600 and 900px.

### App header (shared)
`AppHeader` (`src/frontend/ui/app-header.tsx`) is used by the PDV and by management: `BrandMark` plus the name "Meu Comércio" (a link to `/pdv`), a main nav with two links, **Venda** (`/pdv`) and **Gestão** (`/gestao`), the operator name and role ("Dona" or "Operador"), an optional clock, and a `.ghost` "Sair" button. It is sticky, 12px 24px padding, bottom border `header-line`. The active link has `aria-current="page"`, a 3px `primary` bottom border and weight 700. Under 600px the user box wraps to its own full-width row.

### Landing
`.landing` is pinned light. Content is centered in a 1120px wrap with 32px side padding (18px under 600px). Order: nav (brand and an "Entrar" link), hero, "o que o caderno deixa escapar" (a two-column list of losses), "Como funciona" (three numbered steps), safety rows, FAQ, final call, footer. The hero is two columns on desktop (copy, then the example panel) and stacks under 900px. Sections are separated by 1px `border` top rules with 72px vertical padding (52px under 600px). Buttons go full width under 600px.

### Sign in and sign up
`AuthShell` (`main.auth`, pinned light) is a single centered card on the page ground: the brand mark and name on top (a link to `/`), the card, and a footer line beneath. There is no brand panel, no tabs and no screenshot.
- Sign in: card up to **420px** wide. Sign up: **540px** (`auth-card-wide`), with two-column rows (`.auth-grid-2`, one column under 560px).
- The card is `surface`, 20px radius, 32px padding (24px 18px under 480px), no shadow.
- Switching between the two forms is a **link-style footer toggle** (`.auth-link`, a button drawn like text in `primary-text`), not tabs. The page is top aligned so the brand and the card top do not move when the user switches.
- The form column has an 18px gap; the submit button is full width, 56px high.

### Open cash register
`CashOpenScreen` (`.auth-app`, pinned light) has a top bar (the shared header colors, brand name at 22px/700 and the operator name), a centered `cash-card` up to 560px, and a bottom note. The card shows the warn-colored status "Caixa fechado", a 44px title, a 64px amount input with a 2px `primary` border, a grid of four quick amounts and two actions.

### PDV
A two-column grid: the sale on the left (add-product card, the cart table card), the payment column on the right (380px at most, 300px at least, sticky below the header). It collapses to one column under 900px. The payment column holds, in order:
- the **total block**: `ink` fill, 16px radius, 24px padding, the total in Display size, a 60px primary pay button and a 48px cancel button with a 28%-`on-ink` border;
- the **payment methods card** with a title row (see Fiado below) and a 2-column grid of main method buttons, 60px high.

The **payment modal** is a `surface` dialog up to **600px** wide, 20px radius, with a header, a scrolling body and a footer; narrow dialogs (PIN, receipt type) are 460px. A status bar closes the screen (connection dot, offline state, small actions).

### Management
`.management-page` is centered, up to 1200px, with 16px 24px padding. A title bar, **segmented tabs** (`mg-segment`, 44px high, 10px radius, `aria-pressed` selected style), and per-tab content built from **KPI cards** (`repeat(auto-fit, minmax(240px, 1fr))`, 16px radius, 44px value), cards with toolbars, **tables** (`mg-table`, 560px minimum width, scrolling inside its wrapper), customer cards with a limit bar, and the cash-close layout (two columns, one under 900px). Dialogs are 600px wide.

## Elevation & Depth

Flat. Cards (`.card`, 16px radius, 20px padding), the auth card (20px) and KPI cards have no border and no shadow; they are separated from `bg` by tone alone. Hairlines (`border`) separate rows and card heads. The only drop shadow in the app is the PDV modal (`0 24px 60px` of `ink` at 40%), plus the dim `overlay` backdrop. The 4px bar on the left of the latest cart row is an `inset` marker in `primary`, not a shadow. The PDV Fiado menu list is a bordered `surface` popover without a shadow.

## Shapes

Radii in use: 6px (`.kbd`), 8px (ghost and small buttons, icon buttons, menu items), 10px (segments, choice and quick-amount buttons, close buttons, search), 12px (primary, outline and soft buttons, inputs, notices, change box), 16px (cards, KPI cards, the total block), 20px (auth card, cash card, modals, landing example panel), 999px (the operator pill).

## Components

All primitives live in `globals.css` and are shared by every screen.

### Buttons
- **`.primary`:** `primary` fill, `on-primary` text, 48px minimum height, 22px padding, 12px radius, 16px at 700. Hover mixes `primary` 86% with `ink`; pressed moves 1px down; disabled is 55% opacity.
- **`.outline`:** `surface` fill, 1px `border-strong`, `text`, 48px, weight 600. Hover fills `surface-2`.
- **`.soft`:** `surface-2` fill, no border, 44px, weight 600.
- **`.ghost`:** transparent, 1px `header-line` border, 8px radius, 14px at 600; used for "Sair" in the header. Drawn 34px high with a touch area extended to 44px.
- **Destructive:** `mg-danger-outline` (danger border and text) and `primary.mg-danger-solid` (danger fill) in management.
- **`.kbd`:** a small keyboard-key hint.
- Main PDV actions are larger: pay 60px, method buttons 60px (52px on a phone), modal footer 58px.

### Cards and notices
`.card` is `surface`, 16px radius, 20px padding. `.notice` (`primary-soft`/`primary-text`) and `.error` (`danger-soft`/`danger`) are 12px-radius, 14px bars with 12px 16px padding; `.pdv-offline` uses `warn-soft`/`warn`.

### Fields
`.field-label` (14px, 600, 8px below). `.input`: 56px high, 12px radius, 1px `border-strong`, `input` fill, 16px text, `muted` placeholder, ellipsis on overflow. Invalid: `aria-invalid="true"` turns the border `danger`. The large amount, scan and count inputs are 60 to 64px with a 2px `primary` border and 22px text. Number inputs hide the browser spin buttons. Each field sets `autoComplete`.
- **Password field:** an `.input` with a borderless **eye icon** button inside at the right (`auth-toggle`, 40px, 8px radius, `muted`, hover `surface-2`); the icon gets a slash when the password is visible. The accessible name changes ("Mostrar senha" / "Ocultar senha").
- **PIN field:** digits only, 20px, 0.4em letter spacing, tabular.
- **Inline field error:** 14px `danger` below the field. **Form error banner:** `auth-error`, `danger-soft` fill, 12px radius, with a small alert icon before the message.

### Brand mark
`BrandMark` is an SVG receipt with a check, filled from `primary`/`on-primary`, so it follows the theme. Sizes in use: 40 (auth), 32 (header), 30 (landing nav).

### Segmented controls and choices
Management tabs and filters (`mg-segment`), payment choices (`pdv-choice`), and cash quick amounts share the selected-state rule. Choice buttons are 56px high.

### Skeletons (loading)
Loading is shown as shimmering gray blocks drawn with the real layout classes of the screen, so the page does not jump when data arrives.
- `Skeleton` (`src/frontend/ui/skeleton.tsx`) renders one block (`.skeleton`, `aria-hidden`) with `width`, `height`, `radius` and a `tone`. The fill is `border` 65% mixed with `surface-2` and a moving highlight (a 1.4s `skeleton-shimmer` on an `::after` element that only moves with `transform`, so the block is not repainted). `tone="on-ink"` (`.skeleton-on-ink`) is for blocks on the dark total block.
- Screens: `PdvSkeleton` (header, scan card, cart, total block, method grid, status bar), `ManagementSkeleton` (header, title, tabs, KPI cards, a table) and `AuthFormSkeleton` (the inside of the sign-in card: title, two fields, button). `AppHeaderSkeleton` keeps the real brand and draws the rest in gray.
- **Announced once:** the root of each skeleton has `role="status"` and `aria-busy="true"` and contains one visually hidden `.sr-only` label ("Carregando o terminal de vendas…", "Carregando o painel de gestão…", "Verificando o sistema…"); the blocks themselves are `aria-hidden`.
- Under `prefers-reduced-motion: reduce` the shimmer stops.

### The Fiado menu
**Fiado is not a main payment button.** In the payment card of the PDV it lives in a small panel opened by a **three-dots button** (`pdv-dots`, `aria-expanded`, label "Mais opções de pagamento") on the title row of the card. The panel opens to the side of the dots and holds one button, "Fiado". It is a plain disclosure, not an ARIA menu (there is no arrow-key navigation): Escape or a click outside closes it, Escape returns the focus to the dots button and does not clear the sale. The main grid keeps the everyday methods.

### Landing example panel
The hero shows a **labelled example panel** ("Exemplo de painel do caixa": title "Caixa de hoje", a badge "Exemplo", two amount rows and a "confere" check) built from HTML, not a screenshot. The "Exemplo" badge must always be shown with the values; they are not real data. There is no application-window frame and no PDV screenshot.

### Navigation
App: the shared `AppHeader` (see Layout). Auth: the brand link to `/` and the footer toggle. Landing: wordmark at the left, one "Entrar" link at the right (underline on hover, 44px target).

## Interaction

- **Focus:** every button, input, select, textarea, summary and link gets a `3px solid var(--primary)` outline with a 2px offset on `:focus-visible`.
- **Touch targets:** the controls that are drawn smaller than 44px extend their hit area with an `::after` pseudo-element, so the design stays small and the touch area reaches 44px. Examples: `.ghost` (34px), password eye toggle (40px), quantity and close buttons (40px), row actions in management (40px), the Fiado menu item (36px), the three-dots button and the small status-bar buttons (32px), the landing FAQ summary (24px line, 48px row), the sign-in/sign-up toggle link and the landing header link.
- **Reduced motion:** respected. Transitions are removed in the PDV and the landing buttons; the skeleton shimmer and the sign-in form entrance animation stop; the spinner slows to 2.4s instead of stopping; the management limit bar only animates under `prefers-reduced-motion: no-preference`.
- **Motion otherwise:** 120ms color transitions on buttons, a 200ms enter on the sign-in forms, an 800ms spinner. Nothing else is animated.
- **Selection** uses `primary` with `on-primary` text.
- **Labels** are nouns in pt-BR ("Usuário", "Senha", "PIN da dona (6 dígitos)").

## Do's and Don'ts

### Do:
- **Do** use only tokens for color, and add no dark theme.
- **Do** keep the landing, sign in, sign up and open-cash screens light, like every other screen.
- **Do** keep the app in Inter and the landing in the system font stack.
- **Do** keep the app on the 44 / 22 / 16 / 14 px scale, and set money in tabular figures.
- **Do** keep the `ink` block for the sale total only.
- **Do** keep Fiado behind the three-dots menu, not in the main method grid.
- **Do** build loading states as skeletons with the real layout classes, and announce them once with an `.sr-only` status label.
- **Do** give every control smaller than 44px an `::after` that extends its touch area to 44px.
- **Do** honor `prefers-reduced-motion` for any motion added.
- **Do** show the "Exemplo" badge next to the landing example values, and claim only what the product does.

### Don't:
- **Don't** reintroduce the dark navy and green identity, a display font, or `.landing`/`.auth` scoped color tokens: the tokens are global.
- **Don't** add shadows to cards, or a second accent color.
- **Don't** use `danger` for anything but errors, debt and destructive actions.
- **Don't** show a browser spin button on money inputs.
- **Don't** put the PDV screenshot back in the hero or draw a fake application window; the example is a labelled panel.
- **Don't** use emoji or glyph characters as icons; icons are SVG with `currentColor`.
- **Don't** invent claims, testimonials, ratings, customers, prices or profit and report promises on the landing.
