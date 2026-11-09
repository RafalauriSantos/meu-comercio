# Project Workflow

This document defines how changes move from a branch to production. It is the source of truth for the agent workflow; `CLAUDE.md` points here.

## Branches and pull requests

- One short-lived branch per change, created from the current `origin/main`.
- Branch names: `<type>/<short-scope>`, for example `fix/cash-close-audit` or `docs/project-workflow`.
- Every change reaches `main` through a pull request. This is a process rule, not an enforced one: GitHub does not block direct pushes to `main`, because no pull request rule is configured. The required status checks still gate merges through pull requests.
- A branch built on an unmerged branch is stacked: its PR base is that branch. CI runs only on PRs whose base is `main`, so a stacked PR has no required checks until it is retargeted to `main`. Never merge a stacked PR. After the base merges, rebase onto `origin/main` and retarget the PR.
- Before creating a branch, run `git fetch origin` and start from `origin/main`.

## Commits

- Conventional Commits in English: `type(scope): imperative summary`, subject up to 72 characters.
- Allowed types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `revert`. `style` is not allowed. Use `fix(ui)` or `refactor(ui)` for UI polish.

## Local gate (before push)

1. Tests for the changed area pass, then the full suite: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm audit --audit-level=high`, and `npm run build` with `DATABASE_URL` unset, so the build does not apply the database schema. Show the real output. `npm run ci:local` runs these steps in one go (and the Postgres integration test when `TEST_DATABASE_URL` points to a disposable local database).
2. `pr-reviewer` reviews the diff against `origin/main`. Fix every blocking and important finding, rerun the gate, and review again until none remain.

## Remote gate (GitHub)

Required checks on `main`: `Lint & Security`, `TypeScript Check`, `Unit & Integration Tests`, `Production Build`. They run on every PR whose base is `main`. A PR merges only when all of them are green and the branch is up to date with `main`.

The `Postgres Integration Tests` job also gates the build, but today it runs **one** of the seven `*.integration.test.ts` files (the owner PIN attempt store); the other six are not part of CI yet (backlog item 13.7). They all pass on a Postgres 18.

Known behaviour of the `Lint & Security` job:
- It commits ESLint autofixes to the PR branch as `github-actions[bot]`, with the message `chore(ci): auto-fix linting and formatting`. Pull that commit before the next push.
- The autofix step ignores its own errors (`|| true`), because `eslint --fix` exits non-zero when errors remain that it cannot fix. The `npm run lint` step after it is the real gate.

## Merge rules

| Change type | Merge |
| --- | --- |
| Docs, tests, UI text, refactors, non-financial features | Automatic: auto-merge once the local gate and the remote gate are green and `pr-reviewer` has no open findings |
| Database schema, migration or data change | Own PR, never bundled with other changes. Only with the owner's approval |
| Money, authentication, authorization, permissions | Stops for the owner's approval on GitHub, even when green |

The owner reviews a PR only when it falls in the second or third row. Other PRs do not wait for the owner. Rows are ordered from least to most strict. If a change matches more than one row, the stricter row applies.

Auto-merge is enabled with `gh pr merge --auto` after the PR is opened. GitHub merges it once the required checks pass.

"Money" means any code that computes, stores or moves amounts (sales, payments, cash, credit, refunds, discounts). "Authorization" means any code that decides who may do what (PIN checks, roles, owner-only actions).

## Deploy

Merging to `main` deploys to production. `.github/workflows/ci.yml` runs the four checks and then `vercel --prod` on the push. Merge is therefore a release. Do not describe merge as "no deploy".

The build does not touch the database. Schema changes reach production only through the `db-migrate` workflow, which is started by hand and waits for the owner's approval on the `production-db` environment.

## Versions and releases

The app follows [Semantic Versioning](https://semver.org) (`MAJOR.MINOR.PATCH`), the commits follow [Conventional Commits](https://www.conventionalcommits.org), and every release is written in `CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com)). The version lives in one place, `package.json`; the app shows it in the footer of its screens and at `/api/version`, together with the commit that was deployed.

| Bump | When | Commit types that lead to it |
| --- | --- | --- |
| `PATCH` (0.1.0 → 0.1.1) | Fixes that change no behavior the owner relies on | `fix`, `perf`, `docs`, `refactor` |
| `MINOR` (0.1.0 → 0.2.0) | A new feature, or a visible change in behavior | `feat` |
| `MAJOR` (0.x → 1.0.0, then 1.x → 2.0.0) | An incompatible change in data or in how the owner works | a `!` after the type, or a `BREAKING CHANGE:` line |

- **0.x:** the app is in production but still growing. Until 1.0.0, breaking changes bump `MINOR`. It becomes `1.0.0` when the merchant runs the day on it and the owner accepts the main flows (PDV, cash, fiado, reports).
- **Merging is not releasing.** Every merge to `main` deploys (see Deploy), but a version is only cut on purpose, when there is something worth naming. Between releases the changes accumulate under "Não lançado" in `CHANGELOG.md`.
- **To cut a release:**
  1. Open a PR named `chore(release): vX.Y.Z` that bumps `version` in `package.json` (and `package-lock.json`) and moves "Não lançado" under a new `## [X.Y.Z] - AAAA-MM-DD` heading. A test fails when `package.json` and the CHANGELOG disagree.
  2. After the merge and a green deploy, tag that commit `vX.Y.Z` on `main` and publish a GitHub Release whose notes are that CHANGELOG section.
  3. Check `/api/version` and the footer show the new version.
- **A release that includes a database migration:** the migration PR goes first and is applied with `db-migrate` (see Deploy), as always. The release PR comes after.

## Database baseline (one-time, owner-approved)

**Status: done on 2026-11-09.** Production matched the baseline (the 15 tables of `0000`), `0000` was recorded as applied, and `db-migrate` then applied `0001` (`owner_pin_attempts`), `0002` (`unit` columns) and `0003` (stock control columns). The text below is kept as the record of how it was done.

Migration `0000` creates tables that already exist in production, so the first `db-migrate` run would fail. Before this baseline, the repository secret `DATABASE_URL` must exist in the `production-db` environment; the workflow reads it from there. Do not start `db-migrate` until the baseline is done:

1. The owner confirms that production matches the baseline, for example by comparing `pg_dump --schema-only` output against an empty database with `0000` applied.
2. The owner records `0000` as applied, once. The first two statements create the tracking table if the migrator has never run; they are the same as the migrator's own (`drizzle-orm/pg-core/dialect.js`):

   ```sql
   CREATE SCHEMA IF NOT EXISTS drizzle;
   CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);
   INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
   VALUES ('d76c5cfbf56456ad8153d725b76fe0af476cfbd03a5870e7b4eeebc7c561f1cf', 1793626557420);
   ```

3. Rollback: `DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1793626557420;`. This removes only the record and touches no tables.

The hash is the SHA-256 of `drizzle/migrations/0000_right_edwin_jarvis.sql`. The timestamp is its `when` value in `drizzle/migrations/meta/_journal.json`.

## Applying a migration to production (runbook)

A schema change reaches production in this order. The code that reads a new column must not be deployed before the column exists, because the queries select every column of the table and would fail.

1. **Migration PR first, alone.** It holds only `drizzle/migrations/` (the SQL, the snapshot and the journal), generated by `npm run db:generate` from the schema, and **no** change to the `*.schema.ts` files or to any code. Merging it changes nothing in the running app: the deployed code ignores the new columns. Prefer columns that are `NOT NULL DEFAULT <today's behaviour>`, so every existing row keeps working.
2. **The code PR** carries the schema change, a copy of the same migration files (so the Postgres CI job can migrate) and the feature. It stays a **draft** until step 4 is done, and says so in its description.
3. **Back up production** before applying: create a branch of the production branch in Neon (copy at that instant, no compute needed) and note the row counts of the tables involved.
4. **Apply:** merge the migration PR, start the `db-migrate` workflow on `main` and approve the `production-db` environment (the owner, or someone she told to). Then **check, read only**: the migrations recorded in `drizzle.__drizzle_migrations`, the new columns with their defaults, and that the row counts did not change.
5. **Only then** update the code PR from `main`, wait for CI and merge it. After the deploy, check `/api/version` and the new routes.

Rollback is a `DROP COLUMN` of what the migration added (only safe before anyone uses it) or a restore from the Neon backup branch. Keep the backup branch a few days and delete it once everything is confirmed. The migration run needs the `DATABASE_URL` secret in the `production-db` environment; without it the run fails before it touches anything.

## Stop gates (always, regardless of the rules above)

- Any destructive command: `DROP`, `TRUNCATE`, database reset, `rm -rf`, deleting a remote branch, force push. Describe what would be erased and wait for explicit confirmation.
- A failed external system (Vercel, Neon, GitHub outage or auth error). Stop the item and explain.
- A product ambiguity or a business-rule contradiction. Skip the item and record it in the final report.

## Retry policy

- If a check fails, fix it, run the local gate again, and push again.
- Stop after 3 failed attempts on the same item, or when the same failure repeats. Report the failure with the real output.
- Never disable or skip a check to make it pass.

## Definition of done (per item)

- Tests written first and shown failing for the expected reason, then passing.
- Local gate green, real output shown.
- `pr-reviewer` has no open blocking or important findings.
- PR open with a description of the change and the test output.
- Remote gate green.
- Item marked done in `docs/BACKLOG.md`.
