---
name: Meu Comércio
description: Dark navy ground, one green accent, ruled lists, and one real product screen in an application window as the hero proof, for small-retail cash and fiado control.
colors:
  ground: "#0b1220"
  line: "#243350"
  line-strong: "#4b5d7c"
  text: "#f1f5f9"
  muted: "#b3bfd2"
  green: "#34d399"
  green-hover: "#5eead4"
  green-ink: "#052e1f"
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
---

# Design System: Meu Comércio

Recorded from the shipped landing page (`src/frontend/styles/landing.css`, `src/frontend/landing/*`). Tokens are CSS custom properties on `.landing`. Login, sign up, PDV and management screens extend this system; where a later screen needs a token this file lacks, add it here first.

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
- No authored motion; buttons only have a short hover transition.

## Colors

A navy-and-slate neutral family with one mint-green accent. Contrast measured on the build: text on ground 17.09:1, muted on ground 10.07:1, button text on green 7.71:1.

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

### Named Rules
**The One Green Rule.** Green marks an action or a confirmed state, never decoration. No second accent, no green body text.

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

### Named Rules
**The Tabular Rule.** Every money figure and counter the landing sets itself uses `font-variant-numeric: tabular-nums` (today: step numerals). Money figures inside the screenshot are the app's own.

**The Measure Rule.** Running text never exceeds 52ch (`--measure`); the FAQ column caps at 760px.

## Layout

Desktop-first in intent, written mobile first in CSS: single column, 20px side gutters, content max-width 1120px centered. Sections are separated by a 1px `line` top rule with vertical padding 72px (112px from 900px up). The hero is a single column at every width: h1, lead, two actions, a note, then the application window full content width (up to 1120px) below them, 40px gap (64px from 900px up), padding 40px top / 72px bottom (88px / 112px from 900px up). At 1920 the window starts about 550px down, so the top of the real screen, including the total, sits in the first viewport; at 1440 the window starts a little lower and the first viewport shows its upper half. Losses go two-up with 64px column gap; steps go three-up with 40px gap; safety rows become a two-column row (0.8fr title, 1.2fr text, baseline aligned). Under 520px, primary and secondary buttons go full width.

Spacing rhythm in use: 8, 12, 14, 16, 20, 28, 32, 40, 64, 72, 88, 112px. Rows inside lists use 22px (losses, safety) vertical padding.

Breakpoints: 520px (button width), 900px (grid layouts and larger paddings).

### Review rule
Review the landing desktop-first: check 1440 and 1920 wide, then 390. At every size the window must show the whole capture (full width, auto height, no crop) and the caption must stay directly below it.

## Elevation & Depth

Flat by default; depth is tonal plus 1px rules. Two soft shadows exist: the application window (`0 48px 80px -40px rgba(0,0,0,0.85), 0 16px 32px -16px rgba(0,0,0,0.5)`, grounding shadows that lift the light capture off the navy) and the primary button (`0 10px 24px -12px rgba(52,211,153,0.7)`, a faint green glow). No offset hard shadows, no stacked cards.

### Named Rules
**The One Raised Surface Rule.** Only the application window is raised. Everything else is ground with rules.

## Shapes

Soft but not bubbly: 12px on buttons, 14px on the application window, 6px on focus outlines. Structure comes from straight horizontal rules, solid (`line`) between sections and FAQ/safety rows, dashed (`1px dashed line`) for the four losses, evoking notebook ruling.

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

### Ruled lists
Losses: display-face title over muted explanation, 22px padding, dashed rule below, two-up from 900px. Safety rows: solid rules above and below the set. Steps: ordered list with green display numerals via CSS counter, in a 3rem + 1fr grid. Never boxed or carded.

### Questions (FAQ)
Native `details`/`summary`, 56px minimum target, 1.125rem at 600, solid bottom rule, a green typographic plus that becomes a minus when open (default marker hidden).

### Navigation
Header: wordmark in display face (1.125rem, 700) at left, a single text link ("Entrar") at right, underlined with a `line` underline that turns green on hover, 44px minimum height. Footer repeats the wordmark with a muted line.

### Motion
None authored. The only motion is the button hover transition (160ms ease-out on background, border and transform, 1px lift on primary hover). Under `prefers-reduced-motion: reduce` the transition and the lift are removed.

### Accessibility floor
Focus: `3px solid green`, 3px offset, 6px radius on links and summaries. Interactive targets at least 44px (buttons 52px, FAQ 56px). Sections are labelled by their headings; the screenshot has descriptive alt text and a visible caption. Text colors hold the measured contrast above. Selection uses green with green ink.

## Do's and Don'ts

### Do:
- **Do** show the product through a real capture with demo data, inside the application window, with the "Exemplo:" caption.
- **Do** build lists as ruled rows (dashed for the losses, solid between sections).
- **Do** keep all user-facing text in pt-BR in a content module, and claim only what the product does.
- **Do** keep green for actions; keep text on green in Green Ink.
- **Do** review desktop-first (1440 and 1920, then 390).
- **Do** honor `prefers-reduced-motion` for any motion added.

### Don't:
- **Don't** put an eyebrow or kicker above a heading.
- **Don't** use rows of same-size icon cards or boxed metric cards.
- **Don't** use gradient text.
- **Don't** invent claims, testimonials, ratings, customers, prices or profit/report promises.
- **Don't** draw an imitation of the product screen, or use production or real-customer data in the capture.
- **Don't** use hard offset shadows or a second accent color.
- **Don't** use emoji or glyph characters as icons; the FAQ plus/minus is a typographic disclosure marker, not an icon precedent.
