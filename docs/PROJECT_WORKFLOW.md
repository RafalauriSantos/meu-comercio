# Project Workflow

This document defines how changes move from a branch to production. It is the source of truth for the agent workflow; `CLAUDE.md` points here.

## Branches and pull requests

- One short-lived branch per change, created from the current `origin/main`.
- Branch names: `<type>/<short-scope>`, for example `fix/cash-close-audit` or `docs/project-workflow`.
- Every change reaches `main` through a pull request. Direct pushes to `main` are blocked, including for admins (`enforce_admins` is on).
- A branch built on an unmerged branch is stacked: its PR base is that branch. After the base merges, rebase onto `origin/main` and retarget the PR.
- Before creating a branch, run `git fetch origin` and start from `origin/main`.

## Commits

- Conventional Commits in English: `type(scope): imperative summary`, subject up to 72 characters.
- Allowed types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `revert`.

## Local gate (before push)

1. Tests for the changed area pass, then the full suite: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`. Show the real output.
2. `pr-reviewer` reviews the diff against `origin/main`. Fix every blocking and important finding, rerun the gate, and review again until none remain.

## Remote gate (GitHub)

Required checks on `main`: `Lint & Security`, `TypeScript Check`, `Unit & Integration Tests`, `Production Build`. They run on every PR. A PR merges only when all of them are green and the branch is up to date with `main`.

## Merge rules

| Change type | Merge |
| --- | --- |
| Docs, tests, UI text, refactors, non-financial features | Automatic: auto-merge once the remote gate is green |
| Database migration, money, authentication, authorization | Stops at an open PR, checks green. The owner approves the PR on GitHub. Auto-merge is enabled only after that approval |

"Money" means any code that computes, stores or moves amounts (sales, payments, cash, credit, refunds, discounts). "Authorization" means any code that decides who may do what (PIN checks, roles, owner-only actions).

## Deploy

Merging to `main` deploys to production. `.github/workflows/ci.yml` runs the four checks and then `vercel --prod` on the push. Merge is therefore a release. Do not describe merge as "no deploy".

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
