---
name: Meu Comércio
description: Dark navy ground, one green accent, numbers near the top, ruled ledger surfaces for small-retail cash and fiado control.
colors:
  ground: "#0b1220"
  panel: "#111c31"
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
  figure:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  lead:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.1875rem"
    lineHeight: 1.55
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
rounded:
  sm: "6px"
  md: "12px"
  lg: "16px"
  pill: "999px"
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
  ledger-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "22px 22px 18px"
  badge:
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
    typography: "{typography.label}"
---

# Design System: Meu Comércio

Recorded from the shipped landing page (`src/frontend/styles/landing.css`, `src/frontend/landing/*`). Tokens are CSS custom properties on `.landing`. Login, sign up, PDV and management screens extend this system; where a later screen needs a token this file lacks, add it here first.

## Overview

**Creative North Star: "The Shop-Counter Ledger"**

A night-time bookkeeping page: a deep navy ground, ruled lines instead of boxes, figures set large and tabular, and one green that means "this is fine / act here". The owner chose the direction (dark navy, green accent, numbers near the top). The product promise is control over money, so the interface reads like a well-kept ledger, not a dashboard of metric cards.

Density is calm and generous on the marketing surface (72px to 112px section rhythm); operational screens may tighten spacing but keep the same ruled, flat, tonal language. Copy is Brazilian Portuguese; this file is English.

**Key Characteristics:**
- Flat tonal layering on navy; hairline rules (solid or dashed) carry structure.
- One accent (green) for actions, the confirmation state, step numerals and disclosure markers.
- Large tabular figures; display face only for headings and numerals.
- Lists are ruled, not carded: losses, safety rows, FAQ, ledger rows.
- Single authored motion: the check mark draws once.

## Colors

A navy-and-slate neutral family with one mint-green accent. Contrast measured on the build: text on ground 17.09:1, muted on ground 10.07:1, button text on green 7.71:1, green on panel 8.85:1.

### Primary
- **Ledger Green** (`green`, #34d399): primary button fill, focus ring, selection, step numerals, the "confere" state and its check mark, FAQ plus/minus marker, hover underline on the header link.
- **Green Hover** (`green-hover`, #5eead4): primary button hover fill only.
- **Green Ink** (`green-ink`, #052e1f): text on green fills and selected text.

### Neutral
- **Night Navy** (`ground`, #0b1220): page ground; also set on `html` so overscroll matches. `color-scheme: dark`.
- **Ledger Panel** (`panel`, #111c31): the one raised surface, the ledger page.
- **Hairline** (`line`, #243350): all section rules, row rules, panel border.
- **Strong Hairline** (`line-strong`, #4b5d7c): outlines of interactive or badge elements (secondary button, badge) so they meet non-text contrast.
- **Paper White** (`text`, #f1f5f9): headings, figures, primary copy.
- **Slate Muted** (`muted`, #b3bfd2): body copy, captions, notes, labels.

### Named Rules
**The One Green Rule.** Green marks an action or a confirmed state, never decoration. No second accent, no green body text outside the confirmed state.

**The Token Rule.** `line-strong` and `green-hover` are real tokens that the build currently hard-codes (not yet custom properties). New code references them by name; promote them to `.landing`-level custom properties when the next screen touches them.

## Typography

**Display Font:** Bricolage Grotesque (self-hosted via next/font, `--font-display`, fallback Geist then system-ui)
**Body Font:** Geist (`--font-geist-sans` from `src/app/layout.tsx`, fallback system-ui, sans-serif)

**Character:** Bricolage gives headings a warm, slightly irregular shop-sign voice; Geist keeps body and figures plain and legible. Tight negative tracking on headings, none on body.

### Hierarchy
- **Display** (800, clamp(2.25rem, 8.5vw, 4.5rem), 1.03, -0.03em, balanced wrap): the single h1 per page.
- **Headline** (800, clamp(1.75rem, 5.5vw, 2.75rem), 1.1, -0.025em): section h2.
- **Title** (700, 1.375rem, -0.01em): ledger-row loss names, panel heading at 1.25rem. Step and safety h3 use Geist at 1.25rem / 1.1875rem with -0.01em.
- **Step numeral** (Bricolage 800, 2.5rem, line-height 1, green, tabular): numbered list markers.
- **Figure** (Geist 700, 1.625rem, tabular-nums, -0.01em): ledger values.
- **Lead** (400, 1.1875rem, muted, max 52ch) and **Body** (400, 1rem, 1.55, muted, max 52ch; step text 44ch).
- **Label** (600, 0.8125rem): badge; caption is 0.8125rem muted; note 0.9375rem muted; button 1.0625rem at 650.

### Named Rules
**The Tabular Rule.** Every money figure and counter uses `font-variant-numeric: tabular-nums`.

**The Measure Rule.** Running text never exceeds 52ch (`--measure`); the FAQ column caps at 760px.

## Layout

Mobile first, single column, 20px side gutters, content max-width 1120px centered. Sections are separated by a 1px `line` top rule with vertical padding 72px (112px from 900px up). Hero is a two-column grid at 900px+ (1.2fr copy, 0.8fr ledger, 64px gap, 88px top / 112px bottom padding). Losses go two-up with 64px column gap; steps go three-up with 40px gap; safety rows become a two-column row (0.8fr title, 1.2fr text, baseline aligned). Under 520px, primary and secondary buttons go full width.

Spacing rhythm in use: 8, 12, 16, 20, 28, 32, 40, 64, 72, 112px. Rows inside lists use 14px (ledger) or 22px (losses, safety) vertical padding. Numbers sit in the first viewport: the ledger panel is beside or directly under the h1.

Breakpoints: 520px (button width), 900px (grid layouts).

## Elevation & Depth

Flat by default; depth is tonal (panel #111c31 on ground #0b1220) plus a 1px `line` border. Two soft shadows exist: the ledger panel (`0 28px 48px -28px rgba(0,0,0,0.7)`, a grounding shadow) and the primary button (`0 10px 24px -12px rgba(52,211,153,0.7)`, a faint green glow). No offset hard shadows, no stacked cards.

### Named Rules
**The One Raised Surface Rule.** Only the ledger panel is raised. Everything else is ground with rules.

## Shapes

Soft but not bubbly: 12px on buttons, 16px on the panel, 999px on the badge, 6px on focus outlines. Structure comes from straight horizontal rules, solid (`line`) between sections and FAQ/safety rows, dashed (`1px dashed line`) for ledger rows and the four losses, evoking notebook ruling.

## Components

### Buttons
- **Shape:** 12px radius, 52px minimum height, 24px horizontal padding, 1.0625rem at 650.
- **Primary:** Ledger Green fill, Green Ink text, soft green glow. Hover: Green Hover fill, lifts 1px.
- **Secondary:** transparent, 1px `line-strong` border, Paper White text; hover border turns green.
- **Motion:** 160ms ease-out on background, border and transform.

### Ledger Panel (signature)
A ruled ledger page for "Caixa de hoje": heading plus a pill badge ("Exemplo"), then label/value rows separated by dashed rules (label muted 0.9375rem, value in figure style; stacked on mobile, baseline row from 900px), then a caption. The confirmed row ("confere") shows value and check mark in green.

### Ruled lists
Losses: display-face title over muted explanation, 22px padding, dashed rule below. Safety rows: solid rules above and below the set. Steps: ordered list with green display numerals via CSS counter, in a 3rem + 1fr grid. Never boxed or carded.

### Questions (FAQ)
Native `details`/`summary`, 56px minimum target, 1.125rem at 600, solid bottom rule, a green typographic plus that becomes a minus when open (default marker hidden).

### Navigation
Header: Geist-free wordmark in display face (1.125rem, 700) at left, a single text link ("Entrar") at right, underlined with a `line` underline that turns green on hover, 44px minimum height. Footer repeats the wordmark with a muted line.

### Motion
One authored moment: the check mark path draws once (stroke-dashoffset 24 to 0, 700ms, 300ms delay, `cubic-bezier(0.16, 1, 0.3, 1)`). Under `prefers-reduced-motion: reduce` the animation is off and button transitions and hover lift are removed.

### Accessibility floor
Focus: `3px solid green`, 3px offset, 6px radius on links and summaries. Interactive targets at least 44px (buttons 52px, FAQ 56px). Decorative SVG is `aria-hidden`. Sections are labelled by their headings; the example panel carries an explicit label. Text colors hold the measured contrast above. Selection uses green with green ink.

## Do's and Don'ts

### Do:
- **Do** put figures near the top and set them in tabular numerals.
- **Do** build lists as ruled rows (dashed for ledger-like data, solid between sections).
- **Do** label every example figure "Exemplo" and add a caption that says the values are not real data.
- **Do** keep all user-facing text in pt-BR in a content module, and claim only what the product does.
- **Do** keep green for actions and confirmed states; keep text on green in Green Ink.
- **Do** honor `prefers-reduced-motion` for any motion added.

### Don't:
- **Don't** put an eyebrow or kicker above a heading.
- **Don't** use rows of same-size icon cards or boxed metric cards.
- **Don't** use gradient text.
- **Don't** invent claims, testimonials, ratings, customers, prices or profit/report promises.
- **Don't** use hard offset shadows or a second accent color.
- **Don't** use emoji or glyph characters as icons; the FAQ plus/minus is a typographic disclosure marker, not an icon precedent.
