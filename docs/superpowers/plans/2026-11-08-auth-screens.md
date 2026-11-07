# Login and Sign Up Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `/login` (login, sign up, first access, open cash register) into the visual world of the landing page, desktop first, without changing its behavior.

**Architecture:** Small presentational components under `src/frontend/auth/` (shell with brand panel, password field with show/hide, PIN field with digit-only input, form error) with a typed copy module; `src/app/login/page.tsx` keeps all state and API calls and composes them; `src/frontend/styles/auth.css` is rewritten in the dark navy and green system recorded in `DESIGN.md`.

**Tech Stack:** Next.js 16.4.3 (App Router, `cacheComponents: true`), React 19.3.1, TypeScript, plain CSS, vitest (node environment, `renderToStaticMarkup` for component tests).

**Spec:** `docs/superpowers/specs/2026-11-07-landing-page-design.md` (section "Login and sign up" and the amendment about desktop first) and `DESIGN.md`.

## Global Constraints

- UI text in Brazilian Portuguese; code, comments, tests and commits in English (D-12).
- Behavior, validation rules and API calls of `/login` do not change: login, register (`registerMerchant`), first access (`setupRequired` forces register mode), `?modo=cadastro`, the forwarding of an active session with an open cash register to `/pdv`, the open-cash form (`openCash`), the honeypot field. `src/app/routing.test.ts` must keep passing.
- Owner PIN is exactly 6 digits (D-02); the register form still rejects anything else.
- The brand panel may only claim what the product does today: fiado limit per customer, cash close that compares the counted amount with the expected one, owner PIN of 6 digits for estornos and fiado above the limit, simple cash sales kept offline. No profit, reports, prices, customers, ratings or testimonials. Any product image carries the visible text "Exemplo".
- Follow `DESIGN.md`: dark navy ground, one green, Bricolage Grotesque for headings, no eyebrow or pill above a heading, no same-size icon cards, no gradient text, 3px green focus ring, targets of at least 44 px, contrast of at least 4.5:1, `prefers-reduced-motion` respected.
- Desktop first: review at 1440 and 1920 px, then 390 px. No horizontal scroll from 320 px up.
- Only `src/app/login/page.tsx` uses `auth.css`; replace it, do not keep dead rules.
- No attribution lines in commit messages. Commit format `type(scope): imperative summary`.

## Review Focus

1. A password manager can fill and save the forms (`autoComplete` on every field: `username`, `current-password`, `new-password`, `organization`, `off` for the PIN).
2. The error is announced to screen readers (`role="alert"`) and the sign up confirm field says when it differs, before submit.
3. Non-digit input in the PIN field never reaches the state; paste of a longer string is cut at 6 digits.
4. Showing the password does not submit the form and is reachable by keyboard.
5. Every state still renders: loading, login, sign up, first access, open cash register, error.

---

### Task 1: Form pieces: PIN sanitizing, password field, PIN field, error

**Files:**
- Create: `src/frontend/auth/sanitize-pin.ts`, `src/frontend/auth/password-field.tsx`, `src/frontend/auth/pin-field.tsx`, `src/frontend/auth/form-error.tsx`
- Test: `src/frontend/auth/sanitize-pin.test.ts`, `src/frontend/auth/form-pieces.test.tsx`

**Interfaces:**
- Produces: `sanitizePin(value: string): string` (keeps digits only, at most 6); `PasswordField(props: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: 'current-password' | 'new-password'; minLength?: number; placeholder?: string; describedBy?: string; invalid?: boolean })`; `PinField(props: { id: string; label: string; hint: string; value: string; onChange: (value: string) => void })`; `FormError(props: { message: string })`.

- [ ] **Step 1: Write the failing tests.** `sanitizePin('12a4-56 789')` returns `'124567'`; `''` returns `''`; `'abc'` returns `''`; `'1234567890'` returns `'123456'`. Render tests with `renderToStaticMarkup`: `PasswordField` has `type="password"`, the given `autocomplete`, a button with `type="button"` and `aria-label="Mostrar senha"` and `aria-pressed="false"`; `PinField` has `inputmode="numeric"`, `maxlength="6"`, `pattern="[0-9]{6}"`, `autocomplete="off"`, the label, and the hint in its own element referenced by `aria-describedby`; `FormError` renders `role="alert"` and the message.
- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/frontend/auth` Expected: FAIL (modules not found).
- [ ] **Step 3: Implement the four modules.** `PasswordField` and `PinField` are client components (`'use client'`) with a local visibility state; `PinField` masks like a password and passes the value through `sanitizePin`.
- [ ] **Step 4: Run the tests, types and lint.** Run: `npx vitest run src/frontend/auth && npx tsc --noEmit && npm run lint` Expected: PASS, exit 0, exit 0.
- [ ] **Step 5: Commit.**

```bash
git add src/frontend/auth
git commit -m "feat(auth): add the password field, PIN field and form error"
```

### Task 2: Auth shell with the brand panel

**Files:**
- Create: `src/frontend/auth/auth-content.ts`, `src/frontend/auth/auth-shell.tsx`
- Test: `src/frontend/auth/auth-shell.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `AUTH_CONTENT` (brand panel copy per mode); `AuthShell(props: { mode: 'login' | 'register' | 'setup' | 'cash'; children: ReactNode })`. The shell renders the wordmark as a link to `/`, a brand panel with a headline and three allowed claims, the PDV image at `/landing/pdv-desktop.webp` with the visible text "Exemplo", and the children in the form panel. The headline is a `<p>`, never an `h1` (the form title is the only `h1`).

- [ ] **Step 1: Write the failing test.** For every mode: the markup contains a link to `/` with the wordmark, the children, "Exemplo", the image with explicit `width` and `height` and an empty `alt` (decorative), no `<h1`, and none of "lucro", "relatório", "depoimento", "http://", "https://"; the three claims are present for `login` and `register`.
- [ ] **Step 2: Run it and see it fail.** Run: `npx vitest run src/frontend/auth/auth-shell.test.tsx` Expected: FAIL.
- [ ] **Step 3: Implement the content module and the shell.**
- [ ] **Step 4: Run the tests, types and lint.** Expected: PASS, exit 0, exit 0.
- [ ] **Step 5: Commit** with `feat(auth): add the auth shell with the brand panel`.

### Task 3: Compose the login page from the new pieces

**Files:**
- Modify: `src/app/login/page.tsx`
- Test: `src/app/routing.test.ts` (existing guards must pass), `src/app/login/page.copy.test.ts`

**Interfaces:**
- Consumes: `AuthShell`, `PasswordField`, `PinField`, `FormError`, `sanitizePin` from Tasks 1 and 2.

- [ ] **Step 1: Write the failing test `src/app/login/page.copy.test.ts`** reading `page.tsx` as text: it uses `AuthShell`, `PasswordField`, `PinField` and `FormError`; contains no `auth-pill`; contains `autoComplete="username"`, `autoComplete="current-password"`, `autoComplete="new-password"`; the PIN hint no longer says "fechamento de caixa"; the sign up copy says "Criar conta"; the confirm field has an inline mismatch message.
- [ ] **Step 2: Run it and see it fail.** Run: `npx vitest run src/app/login` Expected: FAIL.
- [ ] **Step 3: Rewrite the JSX only.** Keep every state variable, handler, effect and API call. Tabs become "Entrar" and "Criar conta"; remove the duplicate text links; remove the icon badge and the pill; headings per state: "Entrar", "Crie sua conta", "Configure sua loja" (first access), "Abrir o caixa"; PIN hint: "Libera o que é arriscado: fiado acima do limite e estornos."; show the confirm mismatch under the confirm field as soon as it has content and differs.
- [ ] **Step 4: Run the page test, `src/app/routing.test.ts`, types and lint.** Expected: PASS, exit 0, exit 0.
- [ ] **Step 5: Commit** with `feat(auth): recompose the login page with the new pieces`.

### Task 4: Rewrite `auth.css` in the landing's world

**Files:**
- Modify: `src/frontend/styles/auth.css` (replace)
- Test: `src/frontend/auth/auth-styles.test.ts`

- [ ] **Step 1: Write the failing test** reading the stylesheet: it contains `prefers-reduced-motion`, `:focus-visible`, a `min-height: 44px` rule for buttons, no `linear-gradient(135deg, #f0fdf4`, and no selector for the removed `auth-pill` and `auth-icon-badge`.
- [ ] **Step 2: Run it and see it fail.** Expected: FAIL.
- [ ] **Step 3: Rewrite the stylesheet.** Two columns from 960 px (brand panel and form panel), one column below with a compact brand header; the same tokens as `landing.css` (`--ground`, `--line`, `--text`, `--muted`, `--green`, `--green-ink`, `--line-strong`, `--green-hover`) defined on `.auth`; inputs and buttons at least 44 px; visible focus; error and field states; busy button; reduced motion.
- [ ] **Step 4: Run the tests, then `npm run build:safe`.** Expected: PASS, exit 0 with `check:build` OK.
- [ ] **Step 5: Commit** with `feat(auth): restyle login and sign up in the landing's world`.

### Task 5: Verification gate

- [ ] **Step 1: Run the full local gate.** Run: `npm run lint && npx tsc --noEmit && npx vitest run && TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/meu_test npx vitest run && npm run build:safe` Expected: every command exits 0.
- [ ] **Step 2: Capture every state, desktop first** (login, sign up, first access, error, logged in with the cash register closed) at 1440 and 1920 px, then 390 px, with intercepted API responses and the built app; look at every image; fix what shows in one batch; one confirming round at most.
- [ ] **Step 3: Measure** contrast of the real colors, horizontal overflow at 320, 360 and 390 px, and the keyboard order, with the browser tool.
- [ ] **Step 4: Run the `impeccable` detector** once over the changed files and fix every finding.
- [ ] **Step 5: Update `DESIGN.md` and the sidecar** through the documenter, and the backlog (13.4 done).
- [ ] **Step 6: Commit** with `docs(auth): record the auth screens in the design system`.

### Task 6: Review, PR

- [ ] **Step 1: Run the 05-pr-reviewer** on `git diff origin/main...HEAD`; fix every blocking and important finding; re-run until PASS.
- [ ] **Step 2: Show the screens to the owner**; push and open the PR only after the owner approves the visuals; save the verdict in `docs/reviews/<pr-number>.md`; read the CI once; merge on the owner's go.
