# Landing page, login and sign up redesign: design

Status: draft for owner approval. Date: 2026-11-07.

## Phase 1: provisional release (approved by the owner on 2026-11-07)

The owner needs a provisional landing page as soon as possible and will improve it afterwards. Phase 1 is a smaller cut of this design. Where this section and the rest of the document disagree, this section wins for phase 1; the rest describes the target for phase 2.

In phase 1:
- The landing page at `/` in direction A: hero with example figures labeled "Exemplo", the four losses, how it works in three steps, control and safety, short questions and answers, final call to action.
- The PDV moves to `/pdv`, with every link, redirect and test updated (see "Routing changes").
- Both landing actions go to the existing `/login` page. The primary action opens the register tab through `/login?modo=cadastro`. Builder call: `/login` reads `window.location.search` inside its existing mount effect (no `useSearchParams`, no Suspense boundary, no new route), through a small pure helper with a unit test. Without the parameter, `/login` behaves exactly as today.
- Metadata: title, description, canonical, Open Graph and Twitter card, `noindex` on `/login`, `/pdv` and `/gestao`, `robots.txt`.
- The same quality gates as any change: tests first, lint, types, unit and Postgres suites, `npm run build:safe`, accessibility and mobile performance checks, 05-pr-reviewer PASS, green CI.

Not in phase 1 (moved to phase 2):
- The visual redesign of login and sign up, and the `/cadastro` route.
- Real screenshots of the product (they need the demo store from open question 0). The example panel in the hero takes their place.
- Terms of use, privacy notice, a help channel and a logo. Known risk, accepted by the owner for phase 1: the sign up already exists in production and collects name, e-mail and password without a privacy notice; the landing will send more people to it, so the privacy notice should be the first item of phase 2.

## Intent and why

Meu Comércio is a point of sale and cash/fiado control system for small retailers (mercadinhos, empórios, padarias). Today the app has no public front door: the root route is the PDV, and the login screen is the first thing a visitor sees.

The owner (the shop owner, "a dona") used to keep fiado, cash and stock in a paper notebook, lost papers, and never knew how much she lost or earned. The landing page must grab her attention in the first seconds and make her feel she will not lose money anymore. It must also set the visual standard for every screen that comes after (login, sign up, then the app), so later contributors extend one world instead of inventing another.

## Audience and mode

- Who arrives: a shop owner, most likely on a phone, on mobile data, in the middle of her workday. She is not technical. She has never heard of "PDV" as a product category.
- Mode: Persuade for the landing page; Operate for login and sign up (forms, kept fast and clear, in the same visual world).
- Success: she understands in a few seconds what the system protects, and creates an account.

## Goals

1. A landing page at `/` whose primary action is "Criar minha conta grátis", leading to `/cadastro`. Secondary action: "Já tenho conta", leading to `/login`.
2. Login and sign up restyled in the same visual world, with the existing behavior unchanged.
3. The PDV moves to `/pdv`; every link, redirect and test that assumed `/` is the PDV is updated.
4. A visual system (colors, type, spacing, components) documented in `DESIGN.md` so later screens inherit it.

## Non-goals

- No pricing, plans or checkout. The system is free for now and the page says nothing about price.
- No new product features, reports or backend endpoints.
- No blog, no multi-page marketing site, no CMS.
- No change to authentication, session, PIN or sale logic.

## Anti-goals (a failure even if it technically works)

- Claiming a capability the product does not have. Profit and sales reports are NOT built yet, so the page never mentions "lucro" or reports. Allowed claims are only: fiado in aberto per customer, expected cash in the drawer, blind cash close with divergence check, sales with stock deduction, owner PIN for risky operations, limit per customer, cash sales that survive a lost connection.
- Invented testimonials, customer counts, logos, ratings or statistics. None exist yet.
- Template look: stock gradient hero, three identical icon cards, stock photos of smiling shopkeepers.
- Heavy page: anything that makes it slow on a phone on mobile data.

## Decisions made by the owner

- Direction A: dark navy surface with a green accent, numbers visible in the first viewport. (Mockup: https://claude.ai/artifact/TZs6pBFJKUTLwgro4fthwo, board "A".)
- Free for now; no price on the page.
- No fake social proof. Proof is the real product: screenshots of the real PDV, fiado statement and cash close.
- Landing at `/`, PDV at `/pdv`, login sends the user to `/pdv`.
- A logged-in visitor on `/` sees the same landing; there is no automatic redirect. Builder check call (replaces the earlier idea of an "Ir para o caixa" button): the landing makes no session check. The header link "Entrar" goes to `/login`, which already recognizes an active session on load and offers the way to the cash register and management. This avoids an extra call per visit (the `/api/auth/*` rate limit is 5 requests per minute per IP), a button that swaps after load, and layout shift.

## Constraints

- Next.js 16 App Router with `cacheComponents: true`. The landing must be prerendered (static). `export const dynamic` is NOT allowed in this project; see `docs/reviews/32.md`. Do not read cookies or session on the landing, neither on the server nor in the browser.
- All UI text in Brazilian Portuguese (D-12). Code, comments, tests, commits and docs in English.
- No external network requests at runtime: fonts through `next/font` only, no third-party scripts, no analytics.
- Money is never a JavaScript number; any amount shown on the page is a fixed string labeled as an example.
- The middleware (`src/middleware.ts`) is public by default; keep `/` and `/login` public.
- Mobile first. The primary action is reachable without scrolling on a 360 px wide screen. No horizontal scroll from 320 px up.
- Accessibility: text contrast at least 4.5:1, visible focus, keyboard-operable, real buttons and links, labels on every input, `lang="pt-BR"`, `prefers-reduced-motion` respected.
- Performance: Largest Contentful Paint under 2.5 s on a mid-range phone on 4G; no layout shift from images or fonts; images sized and in modern formats.

## Page structure (landing)

Each section carries one idea. Copy below states intent; final wording is refined with the UX-copy skill and must stay plain, no jargon.

1. **Header:** wordmark "Meu Comércio" (no logo exists), link "Entrar".
2. **Hero (the first viewport):** promise "Cada real que entra e sai, sob seu controle." with one supporting line, the primary and secondary actions, and a panel of three example figures labeled "Exemplo": fiado em aberto, dinheiro esperado no caixa, conferência do caixa. The figures are illustrative and visibly labeled as such.
3. **The four losses:** the notebook problems the owner described, each paired with the control that stops it: fiado esquecido (customer statement and limit), caixa que não bate (blind close with divergence), troco errado (automatic change), estoque que some (stock deducted on every sale, no negative stock).
4. **How it works, in three steps:** create the account, sell, close the day.
5. **The real product:** screenshots of the real PDV, fiado statement and cash close, captured from the running app with test data only (never real customer data), with short captions.
6. **Control and safety:** owner PIN (6 digits) for risky operations, fiado limit per customer, simple cash sales kept when the connection drops and synced afterwards (verified in code: only a single cash payment is accepted offline, never split, card, Pix or fiado; the copy must say exactly that). Nothing about encryption, certifications or uptime unless the system really provides it.
7. **Short questions and answers:** only questions the product can answer truthfully (works on the phone? what if the internet drops? is it free?). "Is it free?" answers "gratuito por enquanto".
8. **Final call to action** and footer. The footer links to terms and privacy only if those pages exist (see open questions).

## Login and sign up

- Same visual world as the landing. On desktop: a brand panel with the key benefit beside the form. On mobile: a single column, form first.
- Behavior, validation and API calls stay as they are, including the two modes (normal login and first access / new store). Only presentation, copy and states change.
- Routes (builder check call): `/login` and a new `/cadastro` render one shared screen component; `/cadastro` opens in register mode ("Cadastrar Nova Loja"). The landing links to `/cadastro`, so no query string or `useSearchParams` is needed. When first-access setup is required, `/login` still forces register mode as it does today. The post-login steps (open the cash register if closed, then go to `/pdv`) are unchanged.
- The owner PIN field says exactly 6 digits (D-02), numeric keypad on mobile, shown as a password-style input.
- Errors are in plain Portuguese, next to the field, never only in color. Submit buttons show a busy state and prevent double submission.
- Keep the existing "Entrar no PDV" and "Cadastrar Nova Loja" entry points reachable.

## Routing changes

- `src/app/page.tsx` (the PDV, about 1,400 lines) moves to `src/app/pdv/page.tsx`; `/` becomes the landing.
- Update every place that assumed `/` is the PDV: `router.push('/')` after login (two places in `src/app/login/page.tsx`), the PDV topbar and links in `src/app/page.tsx` and `src/app/gestao/page.tsx` (`Link href="/"`), and any test or document that names `/`.
- Keep `/gestao` where it is. Moving the PDV must not change its behavior: its tests keep passing.
- Builder check calls: an unauthenticated or expired session on `/pdv` and `/gestao` still goes to `/login`, not to the landing. The brand and "PDV" links inside the PDV and management screens point to `/pdv`, never to the landing.

## Visual system

- Dark navy ground, green accent, off-white text; the exact scale, type pairing and spacing are the builder's call within the direction and the contrast rules above.
- Create `DESIGN.md` at the end, from the built world, so later screens extend it. Reuse the same tokens for login, sign up and later the PDV and management screens; do not redesign those two screens now.
- One memorable moment on the page, for example the hero figures reacting when the page loads, kept small and skippable with reduced motion.

## SEO and sharing

- Title and description in Portuguese, `metadataBase` and canonical exactly `https://meucomercio.vercel.app`, Open Graph and Twitter card with an image sized for the WhatsApp preview.
- Builder check calls: only `/` is indexed. `/login`, `/cadastro`, `/pdv` and `/gestao` carry `noindex` metadata. A `robots.txt` (via `src/app/robots.ts`) allows `/` and disallows `/api`, `/pdv` and `/gestao`; the API is not linked from any page, so no header rule is added.
- No structured data that states a price or a rating.

## Acceptance criteria

1. `GET /` returns the landing, and the build route table shows `/` as static (`○`).
2. `GET /pdv` serves the PDV with all its current behavior; the existing PDV tests pass.
3. After a successful login or sign up, the user lands on `/pdv`.
4. The primary action on the landing leads to `/cadastro` and the secondary to `/login`; both work from a 360 px screen without scrolling. `/cadastro` opens in register mode.
5. No claim on the page mentions profit, reports, prices, customers or ratings; the example figures carry the label "Exemplo".
6. `npm run lint`, `npx tsc --noEmit`, the unit suite, the Postgres suite and `npm run build:safe` pass.
7. Accessibility checked with the accessibility skills: contrast, keyboard path through the page, form labels, reduced motion.
8. Performance checked with the performance skills on a throttled mobile profile.
9. Tests exist for the routing (login redirect target, links to `/pdv`) and for the landing's actions and labels.
10. The 05-pr-reviewer returns PASS, CI is green, and the owner approves the visuals before merge.

## Left to the builder

- Component breakdown, file layout, CSS approach (reuse the plain CSS files under `src/frontend/styles/` unless a better fit is found).
- Final typography and font choice, spacing scale, motion details, icon style.
- Final Portuguese copy, within the claims allowed above.
- How to capture clean screenshots of the real app from test data.

## Open questions for the owner

0. Real screenshots: the app talks to a Neon database through a serverless driver, so it does not run against a plain local Postgres. How do we get clean, truthful screenshots of the PDV, the fiado statement and the cash close? Recommended: the owner creates a demo store in the deployed app with made-up products and sales, and the builder captures from it (test data only, nothing real). Until then the landing ships with the screenshot slots implemented and filled with the first captures.
1. Terms of use and privacy notice: a sign-up page that collects a name, e-mail and password in Brazil normally links to both (LGPD). They do not exist yet. Do we write short versions now, or ship the sign-up without links and add them next?
2. A way for a visitor to ask for help (WhatsApp, e-mail). None is defined. The page shows none until the owner provides one.
3. The wordmark "Meu Comércio" is the only brand asset today. Is a logo or a short brand name coming, or do we ship with the wordmark?
