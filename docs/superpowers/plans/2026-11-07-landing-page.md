# Landing Page (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a provisional landing page at `/` and move the PDV to `/pdv`, with the login linked from both landing actions.

**Architecture:** `/` becomes a statically prerendered server component built from a typed copy module and small section components. The PDV file moves to `src/app/pdv/page.tsx` and every reference to `/` as the PDV is updated. `/login` learns to open in register mode from `?modo=cadastro` through a pure helper read inside its existing mount effect. Metadata, `robots.ts` and `noindex` layouts keep the app pages out of search results.

**Tech Stack:** Next.js 16.4.3 (App Router, `cacheComponents: true`), React 19.3.1, TypeScript, plain CSS files under `src/frontend/styles/`, vitest (node environment, `renderToStaticMarkup` for component tests).

**Spec:** `docs/superpowers/specs/2026-11-07-landing-page-design.md` (read the "Phase 1" section first; it wins over the rest for this plan).

## Global Constraints

- UI text in Brazilian Portuguese; code, comments, tests, commits and docs in English (D-12).
- `export const dynamic` is NOT allowed in this project (`cacheComponents: true`). The landing must be prerendered: the build route table must show `○ /`.
- The landing makes no session check and no API call. No external network requests at runtime, no third-party scripts, no analytics. Fonts only through the existing `next/font` setup in `src/app/layout.tsx`.
- Allowed claims on the page, and only these: fiado in aberto per customer, expected cash in the drawer, cash close that compares the counted amount with the expected one and asks for a justification when they differ, sales with stock deduction and no negative stock, owner PIN of exactly 6 digits for risky operations, fiado limit per customer, simple cash sales kept when the connection drops (a single cash payment only, never split, card, Pix or fiado).
- Forbidden on the page: the words "lucro", "relatório", "depoimento", any price or plan, customer counts, logos, ratings or statistics. The example figures must carry the visible label "Exemplo".
- Money is never a JavaScript number. Example amounts are fixed strings.
- Accessibility: text contrast of at least 4.5:1, visible focus, real links and buttons, one `h1`, `lang="pt-BR"` (already on `<html>`), `prefers-reduced-motion` respected.
- Mobile first: the primary action is visible without scrolling at 360 px; no horizontal scroll from 320 px.
- Canonical URL and `metadataBase`: exactly `https://meucomercio.vercel.app`.
- No attribution lines in commit messages. Commit format `type(scope): imperative summary`.

## Review Focus

1. `/login?modo=cadastro` while the owner is already logged in must show the logged-in panel, not the register form (Task 2 test pins the helper; Task 6 verifies in the browser).
2. The landing must render fully without JavaScript (Task 3 test renders it to static markup and asserts the actions and headline are in it).
3. A 320 px wide screen must not scroll horizontally (Task 6 browser check).
4. Users with `/` bookmarked as the PDV land on the landing and must find "Entrar" without confusion (Task 3 test asserts the header link to `/login`).
5. No leftover link to `/` from inside the PDV or management screens (Task 1 routing test).

---

### Task 1: Move the PDV to `/pdv`

**Files:**
- Move: `src/app/page.tsx` to `src/app/pdv/page.tsx`
- Create: `src/app/page.tsx` (temporary placeholder, replaced in Task 3)
- Modify: `src/app/pdv/page.tsx` (topbar links, was lines 699 and 705), `src/app/gestao/page.tsx:446`, `src/app/login/page.tsx:89` and `:144`
- Test: `src/app/routing.test.ts`

**Interfaces:**
- Produces: the PDV is served at `/pdv`; no source file under `src/app` outside the landing links to `/` as the PDV.

- [ ] **Step 1: Write the failing test `src/app/routing.test.ts`** with three cases using `node:fs`: (a) `src/app/pdv/page.tsx` exists; (b) no file under `src/app/pdv`, `src/app/gestao` or `src/app/login` contains `href="/"` or `router.push('/')`; (c) `src/app/login/page.tsx` contains `router.push('/pdv')` exactly twice.
- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/app/routing.test.ts`
Expected: FAIL (case a: file missing; case b: matches in `login/page.tsx` and `gestao/page.tsx`).

- [ ] **Step 3: Move and update** with `git mv src/app/page.tsx src/app/pdv/page.tsx`, then change the two topbar `Link href="/"` to `"/pdv"`, the management link at `gestao/page.tsx:446` to `"/pdv"`, and both `router.push('/')` in `login/page.tsx` to `router.push('/pdv')`. Create the placeholder `src/app/page.tsx` as a server component returning `<main><h1>Meu Comércio</h1></main>` so `/` still builds.
- [ ] **Step 4: Run the routing test, types and lint**

Run: `npx vitest run src/app/routing.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS, exit 0, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app
git commit -m "refactor(routes): serve the PDV at /pdv"
```

### Task 2: Open `/login` in register mode from the URL

**Files:**
- Create: `src/frontend/lib/auth-mode.ts`
- Test: `src/frontend/lib/auth-mode.test.ts`
- Modify: `src/app/login/page.tsx` (the mount effect that starts at line 38)

**Interfaces:**
- Produces: `parseAuthMode(search: string): 'login' | 'register'`. Returns `'register'` only when the query string has `modo=cadastro`; any other input, including an empty string, returns `'login'`.

- [ ] **Step 1: Write the failing test** with cases: `''` and `'?modo=login'` and `'?modo=CADASTRO'` and `'?foo=1'` return `'login'`; `'?modo=cadastro'` and `'?x=1&modo=cadastro'` return `'register'`.
- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/frontend/lib/auth-mode.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `parseAuthMode` in `src/frontend/lib/auth-mode.ts`** using `URLSearchParams`; case-sensitive on the value.
- [ ] **Step 4: Wire it into `login/page.tsx`.** In the existing `checkStatus` effect, after the setup check and only when no active session was found, call `setAuthMode(parseAuthMode(window.location.search))`. Do not touch the `setupRequired` branch (it already forces register) and do not use `useSearchParams`.
- [ ] **Step 5: Run tests, types, lint**

Run: `npx vitest run src/frontend/lib/auth-mode.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS, exit 0, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/lib/auth-mode.ts src/frontend/lib/auth-mode.test.ts src/app/login/page.tsx
git commit -m "feat(login): open register mode from the modo=cadastro link"
```

### Task 3: Landing copy module, header and hero

**Files:**
- Create: `src/frontend/landing/landing-content.ts`, `src/frontend/landing/landing-page.tsx`, `src/frontend/styles/landing.css`
- Modify: `src/app/page.tsx` (render `LandingPage`)
- Test: `src/frontend/landing/landing-page.test.tsx`

**Interfaces:**
- Produces: `LANDING_CONTENT` (typed constant holding every Portuguese string, the example figures and the section data used by Tasks 3 and 4); `LandingPage(): JSX.Element` (server component, no props, no hooks).
- Routes used: primary action `href="/login?modo=cadastro"` labeled "Criar minha conta grátis"; secondary and header action `href="/login"` labeled "Já tenho conta" and "Entrar".

- [ ] **Step 1: Write the failing test** `renders the header and the hero`: render `<LandingPage />` with `renderToStaticMarkup` and assert: exactly one `<h1>` whose text is "Cada real que entra e sai, sob seu controle."; a link to `/login?modo=cadastro` with text "Criar minha conta grátis"; a link to `/login` with text "Já tenho conta" and one with text "Entrar"; three figures whose group carries the visible text "Exemplo"; the markup contains none of: "lucro", "relatório", "depoimento", "http://", "https://".
- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/frontend/landing/landing-page.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the content module and the header and hero.** Hero example figures (fixed strings, labeled "Exemplo"): "Fiado em aberto: R$ 1.240,00", "Dinheiro esperado no caixa: R$ 860,00", "Conferência do caixa: confere". Dark navy ground, green accent, off-white text, from the approved direction A (`https://claude.ai/artifact/TZs6pBFJKUTLwgro4fthwo`, board A). Import `landing.css` from `src/app/page.tsx`. Apply the `impeccable` and `design:ux-copy` guidance for hierarchy and copy; keep to the allowed claims.
- [ ] **Step 4: Run test, types, lint**

Run: `npx vitest run src/frontend/landing && npx tsc --noEmit && npm run lint`
Expected: PASS, exit 0, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/landing src/frontend/styles/landing.css src/app/page.tsx
git commit -m "feat(landing): add the header and hero"
```

### Task 4: Remaining sections: the four losses, steps, safety, questions, final call

**Files:**
- Modify: `src/frontend/landing/landing-content.ts`, `src/frontend/landing/landing-page.tsx`, `src/frontend/styles/landing.css`
- Test: `src/frontend/landing/landing-page.test.tsx`

**Interfaces:**
- Consumes: `LANDING_CONTENT` and `LandingPage` from Task 3.
- Produces: the complete page. Sections in order: hero, the four losses, how it works in three steps, control and safety, questions and answers, final call to action, footer.

- [ ] **Step 1: Write the failing tests** added to the same file: (a) four losses are present by their titles (fiado esquecido, caixa que não bate, troco errado, estoque que some), each followed by the control that stops it; (b) the three steps are an ordered list; (c) the safety section states "6 dígitos" and says the offline sale is a "venda simples em dinheiro"; (d) the questions section answers "É gratuito?" with "gratuito por enquanto" and mentions no price; (e) the final call to action repeats the `/login?modo=cadastro` link; (f) the whole markup still contains none of the forbidden words from Global Constraints and has exactly one `<h1>`; (g) `landing.css` contains `prefers-reduced-motion`.
- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/frontend/landing`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement the sections and styles.** Use native `<details>` for the questions (no JavaScript). Keep copy within the allowed claims; no screenshots in phase 1 (the example panel is the only visual proof).
- [ ] **Step 4: Run tests, types, lint**

Run: `npx vitest run src/frontend/landing && npx tsc --noEmit && npm run lint`
Expected: PASS, exit 0, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/landing src/frontend/styles/landing.css
git commit -m "feat(landing): add the losses, steps, safety, questions and final call"
```

### Task 5: Metadata, robots and noindex

**Files:**
- Modify: `src/app/page.tsx` (export `metadata`), `src/app/layout.tsx` (`metadataBase` only if not set)
- Create: `src/app/robots.ts`, `src/app/login/layout.tsx`, `src/app/pdv/layout.tsx`, `src/app/gestao/layout.tsx`
- Test: `src/app/seo.test.ts`

**Interfaces:**
- Produces: landing `metadata` with Portuguese title and description, canonical `https://meucomercio.vercel.app`, Open Graph and Twitter fields; `robots()` allowing `/` and disallowing `/api`, `/pdv`, `/gestao`; each of the three layouts exports `metadata = { robots: { index: false, follow: false } }` and returns `children`.

- [ ] **Step 1: Write the failing test** `src/app/seo.test.ts`: the landing `metadata.alternates.canonical` equals `https://meucomercio.vercel.app`; its `title` and `description` are non-empty strings; `robots()` includes `allow: '/'` and disallows `/api`, `/pdv`, `/gestao`; each layout module's `metadata.robots` has `index: false`.
- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/app/seo.test.ts`
Expected: FAIL (modules or exports missing).

- [ ] **Step 3: Implement.** The Open Graph image is the text-only default for phase 1: no image file is added, so no image is claimed.
- [ ] **Step 4: Run test, types, lint**

Run: `npx vitest run src/app/seo.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS, exit 0, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app
git commit -m "feat(seo): add landing metadata, robots and noindex for app pages"
```

### Task 6: Verification gate

**Files:**
- Modify: `docs/BACKLOG.md` (add the landing item as done in phase 1 and phase 2 items as open), `DECISIONS.md` (record the route change and the free-for-now decision)
- Create: `DESIGN.md` through the `impeccable` documenter once the UI is built

- [ ] **Step 1: Run the full local gate**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/meu_test npx vitest run && npm run build:safe`
Expected: every command exits 0; the build route table shows `○ /` and `○ /pdv`; `check:build` prints `OK`.

- [ ] **Step 2: Run the mechanical design detector once** over the changed UI files: `/home/rafael-lauri/.claude/skills/impeccable/scripts/impeccable detect --json src/frontend/landing src/app/page.tsx`. Fix every finding in one batch.
- [ ] **Step 3: Check in the browser** at 360 px and 320 px wide and at desktop width: primary action visible without scrolling at 360 px; no horizontal scroll at 320 px; keyboard path reaches every link in order with a visible focus; `/login?modo=cadastro` opens the register tab for a logged-out visitor; for a logged-in visitor it shows the logged-in panel. Batch the desktop and mobile captures in one round and fix everything in one batch.
- [ ] **Step 4: Run the accessibility and performance skills** (`accessibility`, `performance`, `core-web-vitals`) on the landing; fix contrast, focus and any layout shift they report.
- [ ] **Step 5: Update the docs** listed above and generate `DESIGN.md`.
- [ ] **Step 6: Commit**

```bash
git add docs/BACKLOG.md DECISIONS.md DESIGN.md
git commit -m "docs(landing): record phase 1, the route change and the design system"
```

### Task 7: Review, push and pull request

- [ ] **Step 1: Run the 05-pr-reviewer** on `git diff origin/main...HEAD`; fix every blocking finding and re-run until PASS. Save the verdict in `docs/reviews/<pr-number>.md` after the PR number exists.
- [ ] **Step 2: Push the branch and open the PR** with a short English description: what changed, the route move, the evidence (route table, test counts), and the phase 2 list.
- [ ] **Step 3: Read the CI once** through the PR status tool. Merge only with a PASS verdict, green CI and the owner's approval of the visuals (acceptance criterion 10 in the spec).
