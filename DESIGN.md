---
name: Meu Comércio
description: Dark navy ground, one green accent, ruled lists, and one real product screen in an application window as proof, across the landing, login and sign up, for small-retail cash and fiado control.
colors:
  ground: "#0b1220"
  surface: "#111c31"
  line: "#243350"
  line-strong: "#4b5d7c"
  text: "#f1f5f9"
  muted: "#b3bfd2"
  green: "#34d399"
  green-hover: "#5eead4"
  green-ink: "#052e1f"
  placeholder: "#8593ad"
  danger-text: "#fecaca"
  danger-bg: "#2a1215"
  danger-line: "#7f1d1d"
  danger-border: "#f87171"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Geist, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 8.5vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 1.03
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Bricolage Grotesque, Geist, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 5.5vw, 2.75rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Bricolage Grotesque, Geist, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  lead:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.1875rem"
    lineHeight: 1.55
  caption:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    lineHeight: 1.55
rounded:
  sm: "6px"
  md: "12px"
  window: "14px"
  tab: "9px"
  field: "10px"
  tabs: "12px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "20px"
  lg: "32px"
  xl: "72px"
  xxl: "112px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.green-ink}"
    rounded: "{rounded.md}"
    padding: "0 24px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.green-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 24px"
    height: "52px"
  application-window:
    backgroundColor: "#ffffff"
    rounded: "{rounded.window}"
  auth-input:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "0 14px"
    height: "48px"
  auth-tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.tab}"
    height: "44px"
  auth-tab-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
  auth-button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.green-ink}"
    rounded: "{rounded.md}"
    height: "52px"
  auth-button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "48px"
  form-error:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger-text}"
    rounded: "{rounded.field}"
    padding: "12px 14px"
---

# Design System: Meu Comércio

Recorded from the shipped landing page (`src/frontend/styles/landing.css`, `src/frontend/landing/*`) and the login and sign up screens (`src/frontend/styles/auth.css`, `src/frontend/auth/*`, `src/app/login/page.tsx`). Tokens are CSS custom properties on `.landing` and, with the same names and values plus `surface` and the danger set, on `.auth`. PDV and management screens extend this system; where a later screen needs a token this file lacks, add it here first.

## Overview

**Creative North Star: "The Shop-Counter Ledger"**

A night-time bookkeeping page: a deep navy ground, ruled lines instead of boxes, and one green that means "this is fine / act here". The owner chose the direction (dark navy, green accent). The product promise is control over money, so the page states it plainly and then shows the real product screen as proof, instead of a dashboard of metric cards or a drawn mock-up.

The product is used mostly on the desktop (owner, 2026-11-07), so the system is desktop-first: the hero is composed for 1440 and 1920 wide screens, and mobile stacks the same single column. Density is calm and generous on the marketing surface (72px to 112px section rhythm); operational screens may tighten spacing but keep the same flat, tonal language. Copy is Brazilian Portuguese; this file is English.

**Key Characteristics:**
- Flat tonal layering on navy; hairline rules (solid or dashed) carry structure.
- One accent (green) for actions, step numerals and disclosure markers.
- Display face only for headings and step numerals.
- Lists are ruled, not carded: losses, safety rows, FAQ.
- The hero proof is a real capture of the app inside an application window, never a drawn imitation.
- No authored motion beyond short hover/focus transitions and the loading spinner.
- Login and sign up reuse the same world: two columns on desktop (brand side on `ground`, form side on lifted `surface`), one column on a phone.

## Colors

A navy-and-slate neutral family with one mint-green accent. Contrast measured on the build: text on ground 17.09:1, muted on ground 10.07:1, button text on green 7.71:1. On the auth screens (measured in the browser): label 15.53, subtitle 9.15, input text 17.09, inactive tab 10.07, show-password toggle 9.74, hint 9.15, placeholder 6.04, primary button 7.71.

### Primary
- **Ledger Green** (`green`, #34d399): primary button fill, focus ring, selection, step numerals, FAQ plus/minus marker, hover underline on the header link, secondary button hover border.
- **Green Hover** (`green-hover`, #5eead4): primary button hover fill only.
- **Green Ink** (`green-ink`, #052e1f): text on green fills and selected text.

### Neutral
- **Night Navy** (`ground`, #0b1220): page ground; also set on `html` so overscroll matches. `color-scheme: dark`.
- **Hairline** (`line`, #243350): all section rules, row rules, header link underline.
- **Strong Hairline** (`line-strong`, #4b5d7c): outlines of interactive elements and the application window (secondary button, window frame) so they meet non-text contrast.
- **Paper White** (`text`, #f1f5f9): headings, primary copy.
- **Slate Muted** (`muted`, #b3bfd2): body copy, captions, notes.
- **Window White** (`#ffffff`, hard-coded on `.landing-shot-window`): the backing behind the screenshot only, so the image never shows a navy seam. The greens and greys inside the capture belong to the app's own screen, not to this palette.

- **Lifted Navy** (`surface`, #111c31): the form side of the auth screens on desktop and the active tab fill. Used only there; the landing does not use it.
- **Placeholder Slate** (`placeholder`, #8593ad): input placeholder text only (6.04:1 on `ground`).

### Danger (auth forms only)
- **Danger Text** (`danger-text`, #fecaca) on **Danger Wash** (`danger-bg`, #2a1215) with **Danger Line** (`danger-line`, #7f1d1d) border: the form error banner and inline field errors (text only).
- **Danger Border** (`danger-border`, #f87171): border of an input with `aria-invalid`. Currently a literal in `auth.css`, not a custom property.

### Named Rules
**The One Green Rule.** Green marks an action or a confirmed state, never decoration. No second accent, no green body text. The short green dash before each auth claim and the in-field Mostrar/Ocultar button are the same signal (marker and action). Red appears only as the error state on forms, never as an accent.

## Typography

**Display Font:** Bricolage Grotesque (self-hosted via next/font, `--font-display`, fallback Geist then system-ui)
**Body Font:** Geist (`--font-geist-sans` from `src/app/layout.tsx`, fallback system-ui, sans-serif)

**Character:** Bricolage gives headings a warm, slightly irregular shop-sign voice; Geist keeps body plain and legible. Tight negative tracking on headings, none on body.

### Hierarchy
- **Display** (800, clamp(2.25rem, 8.5vw, 4.5rem), 1.03, -0.03em, balanced wrap): the single h1 per page.
- **Headline** (800, clamp(1.75rem, 5.5vw, 2.75rem), 1.1, -0.025em, balanced wrap): section h2.
- **Title** (700, 1.375rem, -0.01em): loss names. Step and safety h3 use Geist at 1.25rem / 1.1875rem with -0.01em.
- **Step numeral** (Bricolage 800, 2.5rem, line-height 1, green, tabular): numbered list markers.
- **Lead** (400, 1.1875rem, muted, max 52ch) and **Body** (400, 1rem, 1.55, muted, max 52ch; step text 44ch).
- **Caption** (0.875rem, muted): the screenshot caption; note 0.9375rem muted; button 1.0625rem at 650.

### Auth hierarchy
- **Brand headline** (Bricolage 800, clamp(1.75rem, 6vw, 2.25rem) on a phone, clamp(2.5rem, 4vw, 3.5rem) from 960px, 1.08, -0.025em, balanced, max 14ch on desktop): a `p`, not the page h1.
- **Form title** (Bricolage 800, 2rem, 1.1, -0.025em): the single h1 of each auth state.
- **Subtitle** (Geist 1rem, muted, max 46ch; `strong` in Paper White).
- **Label** (Geist 0.9375rem at 600), **hint** and **field error** (0.875rem), **error banner** (0.9375rem), **tab** (0.9375rem at 600), **toggle** (0.875rem at 600), **input** 1rem; PIN input 1.25rem with 0.4em letter spacing; amount input 1.25rem at 700. PIN and amount are tabular.
- The display face reaches these screens through the `fontClassName` prop of `AuthShell` (the page passes `displayFont.variable`); a new auth surface must pass it or headings fall back to Geist.

### Named Rules
**The Tabular Rule.** Every money figure and counter the landing sets itself uses `font-variant-numeric: tabular-nums` (today: step numerals, and the PIN and amount inputs on the auth screens). Money figures inside the screenshot are the app's own.

**The Measure Rule.** Running text never exceeds 52ch (`--measure`); the FAQ column caps at 760px.

## Layout

Desktop-first in intent, written mobile first in CSS: single column, 20px side gutters, content max-width 1120px centered. Sections are separated by a 1px `line` top rule with vertical padding 72px (112px from 900px up). The hero is a single column at every width: h1, lead, two actions, a note, then the application window full content width (up to 1120px) below them, 40px gap (64px from 900px up), padding 40px top / 72px bottom (88px / 112px from 900px up). At 1920 the window starts about 550px down, so the top of the real screen, including the total, sits in the first viewport; at 1440 the window starts a little lower and the first viewport shows its upper half. Losses go two-up with 64px column gap; steps go three-up with 40px gap; safety rows become a two-column row (0.8fr title, 1.2fr text, baseline aligned). Under 520px, primary and secondary buttons go full width.

Spacing rhythm in use: 8, 12, 14, 16, 20, 28, 32, 40, 64, 72, 88, 112px. Rows inside lists use 22px (losses, safety) vertical padding.

Breakpoints: 520px (button width), 900px (grid layouts and larger paddings).

### Auth screens
From 960px the page is a two-column grid (`1.1fr` brand, `0.9fr` form, form column at least 440px). Brand side sits on `ground`, padding 40px 56px 48px, wordmark at the top, headline and claims in the middle, the capture window at the bottom. The form side is `surface`, separated by a 1px `line` left hairline, content top aligned with top padding `clamp(48px, 10vh, 112px)` so the tabs and the title do not move between login and sign up. The form column is capped at 420px. Below 960px it is one column: wordmark and headline (padding 24px 20px 8px), then the form (24px 20px 48px); the claims and the capture are hidden. Form fields stack with an 18px gap, label to input 8px, tabs to title 28px.

The cash-open state (logged in, cash closed) has no tabs, so its title sits higher than on login and sign up; the top alignment keeps it stable within that state only.

Verified in the browser: no horizontal overflow at 320, 360, 390 and 1440px; every control at least 44px; keyboard order wordmark, tabs, fields, show password, submit.

### Review rule
Review the landing and the auth screens desktop-first: check 1440 and 1920 wide, then 390. At every size the window must show the whole capture (full width, auto height, no crop) and the caption must stay directly below it.

## Elevation & Depth

Flat by default; depth is tonal plus 1px rules. On the auth screens the form side is lifted by tone (`surface` against `ground`) and a hairline, not by shadow. Three soft shadows exist: the application window (`0 48px 80px -40px rgba(0,0,0,0.85), 0 16px 32px -16px rgba(0,0,0,0.5)`, grounding shadows that lift the light capture off the navy) and the primary button (`0 10px 24px -12px rgba(52,211,153,0.7)`, a faint green glow). The capture window on the auth brand side has a lighter grounding shadow (`0 32px 64px -32px rgba(0,0,0,0.8)`). Focused inputs get a 3px green ring (`0 0 0 3px rgba(52,211,153,0.35)`). No offset hard shadows, no stacked cards.

### Named Rules
**The One Raised Surface Rule.** Only the application window is raised (one per page; the auth form side is a tonal lift, not a raised surface). Everything else is ground with rules.

## Shapes

Soft but not bubbly: 12px on buttons and the tab group, 10px on inputs and the error banner, 9px on the active tab, 14px on the application window (top corners only on the auth capture, which runs off the bottom edge), 6px on landing focus outlines and 8px on auth ones. Structure comes from straight horizontal rules, solid (`line`) between sections and FAQ/safety rows, dashed (`1px dashed line`) for the four losses, evoking notebook ruling.

## Components

### Buttons
- **Shape:** 12px radius, 52px minimum height, 24px horizontal padding, 1.0625rem at 650.
- **Primary:** Ledger Green fill, Green Ink text, soft green glow. Hover: Green Hover fill, lifts 1px.
- **Secondary:** transparent, 1px `line-strong` border, Paper White text; hover border turns green.
- **Motion:** 160ms ease-out on background, border and transform.

### Application window (signature)
A `figure.landing-shot` holding `div.landing-shot-window` and a `figcaption`. The window is `overflow: hidden`, 1px `line-strong` border, 14px radius, white backing, the two grounding shadows above; the image is block, `width: 100%`, `height: auto`, with explicit `width`/`height` attributes (1920x1140) and `decoding="async"`. It is a plain `img` (fixed, already optimized WebP; next/image adds nothing). The frame has no fake title bar or traffic-light dots: the capture carries the app's own header. The caption sits 14px below, in Caption style, and always starts with "Exemplo:" (current text: "Exemplo: a tela do PDV com produtos e valores de demonstração."). The alt text describes the screen in pt-BR.

**The Real Capture Rule.** The product screen in the window must be a real capture of the app (here `/pdv`), never a redrawn or illustrative mock-up, it must use demo data only, and it must always carry the "Exemplo:" caption. When the PDV changes visibly, recapture it.

**Raster provenance (`public/landing/pdv-desktop.webp`).** 1920x1140 WebP, about 100 KB. Captured with Playwright from the built app's `/pdv` at a 1280x760 viewport, device scale factor 1.5, with invented demo products and customers served by intercepted API responses, then converted to WebP. Nothing from production or from real customers.

### Auth shell and brand side
`AuthShell` (`main.auth`) takes a `mode` (login, register, setup, cash) that picks the brand copy and a `fontClassName`. The brand side holds: the wordmark link to `/` (display face 1.125rem at 700, 44px target), the headline, three claims as a list with an 8x2px green dash marker (no bullets, no icons), and the real PDV capture (same `/landing/pdv-desktop.webp`) cropped to a 300px-high window anchored top-left, 1px `line-strong` border, 14px top corners, open at the bottom, with the visible caption "Exemplo: tela do PDV com dados de demonstração." beneath. The image has empty alt (decorative; the caption carries the meaning). The cropped window is specific to auth: the landing window always shows the whole capture.

**The Allowed Claims Rule.** Auth copy states only what the product does: owner PIN of 6 digits for estornos and fiado above the limit, fiado limit per customer, cash close that compares the counted amount with the expected one, simple cash sales kept offline. No profit, reports, prices, customers, ratings or testimonials.

### Auth form components
- **Tabs:** a two-button segmented group (`role=group`, buttons with `aria-pressed`): "Entrar" and "Criar conta" (same words as the landing). Container `ground` with 1px `line` border, 12px radius, 4px padding; tab 44px high, 9px radius, muted text, hover Paper White; active tab fills `surface` with a `line-strong` border and Paper White text. Hidden in first-access setup and in the cash state.
- **Title and subtitle:** h1 in the display face, muted subtitle.
- **Text input:** 48px, `ground` fill, 1px `line-strong` border, 10px radius, 14px side padding, 1rem. Focus: border turns green plus the 3px green ring (outline removed, the ring is the indicator). Invalid: `danger-border` border. Placeholder in `placeholder`. Transition 160ms ease-out.
- **Password field:** an input with a Mostrar/Ocultar text button inside at the right (green, 0.875rem at 600, 44px high, at least 72px wide, 8px radius, `aria-pressed`, hover Green Hover); input right padding 92px. The sign-up form repeats it as "Repita a senha" with an inline mismatch message.
- **PIN field:** numeric keypad, digits only, max 6, wide letter spacing, hint below in muted 0.875rem.
- **Amount field:** the opening balance input is a number input with the browser spin buttons removed (`appearance: textfield` and the webkit spin buttons hidden); 1.25rem at 700, tabular.
- **Inline field error:** 0.875rem `danger-text` under the field, tied by `aria-describedby`.
- **Form error banner:** `role="alert"`, `danger-bg` fill, 1px `danger-line` border, 10px radius, 12px 14px padding, a small stroke SVG alert mark (18px, `currentColor`, `aria-hidden`) before the message. It sits between the subtitle and the form.
- **Buttons:** primary is full width, 52px, green, 12px radius, 1.0625rem at 650, hover Green Hover (no lift, no glow on auth), disabled at 0.75 opacity. Secondary is full width, 48px, transparent with 1px `line-strong` border, hover border green.
- **Loading:** a 20px ring spinner (3px border, green top; green-ink inside the primary button), 800ms linear; under `prefers-reduced-motion` it slows to 2.4s instead of stopping, and the other transitions are removed.
- **Labels and autocomplete:** labels are nouns ("Usuário", "Senha", "Repita a senha", "PIN da dona (6 dígitos)", "Nome da loja", "Seu usuário"). Every field sets `autoComplete` (username, current-password, new-password, organization) so password managers work. A hidden honeypot input sits in each form, off-screen and `aria-hidden`.

### Ruled lists
Losses: display-face title over muted explanation, 22px padding, dashed rule below, two-up from 900px. Safety rows: solid rules above and below the set. Steps: ordered list with green display numerals via CSS counter, in a 3rem + 1fr grid. Never boxed or carded.

### Questions (FAQ)
Native `details`/`summary`, 56px minimum target, 1.125rem at 600, solid bottom rule, a green typographic plus that becomes a minus when open (default marker hidden).

### Navigation
Auth screens: the wordmark link to `/` and the tab group are the only navigation. Landing header: wordmark in display face (1.125rem, 700) at left, a single text link ("Entrar") at right, underlined with a `line` underline that turns green on hover, 44px minimum height. Footer repeats the wordmark with a muted line.

### Motion
None authored beyond state feedback. Landing: button hover transition (160ms ease-out on background, border and transform, 1px lift on primary hover). Auth: 160ms ease-out on tab, input and button colors, and the loading spinner. Under `prefers-reduced-motion: reduce` transitions and the lift are removed.

### Accessibility floor
Focus: `3px solid green`, 3px offset, 6px radius on links and summaries (8px on auth links and buttons; auth inputs use the green border plus ring). Interactive targets at least 44px (buttons 52px, FAQ 56px). Sections are labelled by their headings; the screenshot has descriptive alt text and a visible caption. Text colors hold the measured contrast above. Selection uses green with green ink.

## Do's and Don'ts

### Do:
- **Do** show the product through a real capture with demo data, inside the application window, with the "Exemplo:" caption.
- **Do** build lists as ruled rows (dashed for the losses, solid between sections).
- **Do** keep all user-facing text in pt-BR in a content module, and claim only what the product does.
- **Do** keep green for actions; keep text on green in Green Ink.
- **Do** review desktop-first (1440 and 1920, then 390).
- **Do** honor `prefers-reduced-motion` for any motion added.
- **Do** use `surface` only for the lifted form side and active tab; keep inputs on `ground`.
- **Do** keep field labels as nouns, reuse the landing's words ("Criar conta"), and set `autoComplete` on every field.
- **Do** pass `fontClassName` to `AuthShell` so the display face loads.
- **Do** limit auth copy to the allowed claims and keep the "Exemplo:" caption under the capture.
- **Do** keep every control at least 44px.

### Don't:
- **Don't** put an eyebrow, kicker or pill above a heading, on the landing or the auth screens.
- **Don't** use rows of same-size icon cards or boxed metric cards.
- **Don't** use gradient text.
- **Don't** invent claims, testimonials, ratings, customers, prices or profit/report promises.
- **Don't** draw an imitation of the product screen, or use production or real-customer data in the capture.
- **Don't** use hard offset shadows or a second accent color.
- **Don't** show the browser's number spin buttons on money inputs.
- **Don't** use red for anything but form errors.
- **Don't** use emoji or glyph characters as icons; the FAQ plus/minus is a typographic disclosure marker, not an icon precedent.
