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

1. Tests for the changed area pass, then the full suite: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm audit --audit-level=high`, and `npm run build` with `DATABASE_URL` unset, so the build does not apply the database schema. Show the real output.
2. `pr-reviewer` reviews the diff against `origin/main`. Fix every blocking and important finding, rerun the gate, and review again until none remain.

## Remote gate (GitHub)

Required checks on `main`: `Lint & Security`, `TypeScript Check`, `Unit & Integration Tests`, `Production Build`. They run on every PR whose base is `main`. A PR merges only when all of them are green and the branch is up to date with `main`.

Known behaviour of the `Lint & Security` job:
- It commits ESLint autofixes to the PR branch as `github-actions[bot]`, with the message `chore(ci): auto-fix linting and formatting`. Pull that commit before the next push.
- The autofix step ignores its own errors (`|| true`), because `eslint --fix` exits non-zero when errors remain that it cannot fix. The `npm run lint` step after it is the real gate.

## Merge rules

| Change type | Merge |
| --- | --- |
| Docs, tests, UI text, refactors, non-financial features | Automatic: auto-merge once the local gate and the remote gate are green and `pr-reviewer` has no open findings |
| Database schema, migration or data change | Own PR, never bundled with other changes. Do not merge to `main` until the build-script gap below is closed; after that, only with the owner's approval |
| Money, authentication, authorization, permissions | Stops for the owner's approval on GitHub, even when green |

The owner reviews a PR only when it falls in the second or third row. Other PRs do not wait for the owner. Rows are ordered from least to most strict. If a change matches more than one row, the stricter row applies.

Auto-merge is enabled with `gh pr merge --auto` after the PR is opened. GitHub merges it once the required checks pass.

"Money" means any code that computes, stores or moves amounts (sales, payments, cash, credit, refunds, discounts). "Authorization" means any code that decides who may do what (PIN checks, roles, owner-only actions).

## Deploy

Merging to `main` deploys to production. `.github/workflows/ci.yml` runs the four checks and then `vercel --prod` on the push. Merge is therefore a release. Do not describe merge as "no deploy".

The build does not touch the database. Schema changes reach production only through the `db-migrate` workflow, which is started by hand and waits for the owner's approval on the `production-db` environment.

## Database baseline (one-time, owner-approved)

Migration `0000` creates tables that already exist in production, so the first `db-migrate` run would fail. Do not start `db-migrate` until this baseline is done:

1. The owner confirms that production matches the baseline, for example by comparing `pg_dump --schema-only` output against an empty database with `0000` applied.
2. The owner records `0000` as applied, once:

   ```sql
   INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
   VALUES ('d76c5cfbf56456ad8153d725b76fe0af476cfbd03a5870e7b4eeebc7c561f1cf', 1793626557420);
   ```

3. Rollback: `DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1793626557420;`. This removes only the record and touches no tables.

The hash is the SHA-256 of `drizzle/migrations/0000_right_edwin_jarvis.sql`. The timestamp is its `when` value in `drizzle/migrations/meta/_journal.json`.

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
