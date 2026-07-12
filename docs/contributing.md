# Contributing & workflow

All work happens on [`luminary-dev/service-hub`](https://github.com/luminary-dev/service-hub). The mirrors are sync targets, not workspaces. (The repo-root [`CONTRIBUTING.md`](https://github.com/luminary-dev/service-hub/blob/dev/CONTRIBUTING.md) is the short version that ships with the code; this page is the fuller narrative.)

## Branches: dev & prod

Two long-lived branches:

- **`dev`** — the default branch and integration target. All feature work merges here.
- **`prod`** — the deploy branch. Production is released by promoting `dev → prod`; that merge is the deploy trigger.

```
feature branch ──PR──▶ dev    (CI gates; squash-merge)
dev ───────────PR──▶ prod     (CI gates again; merge = release)
```

## Branch → PR → merge

Both `dev` and `prod` are protected (`protect-dev` / `protect-prod` rulesets). Every change lands via pull request with:

- **All CI checks green** — typecheck/lint/test/build for the web app, typecheck/test/build for each of the eight services. No path filtering: every PR runs everything.
- **1 approving review from a code owner** — CODEOWNERS is `@luminary-dev/team-luminary`, so any team member's approval counts. You can't approve your own PR, so every PR needs a second person.
- **Review conversations resolved** before merge.
- No direct pushes to `dev`/`prod`, no force pushes, no branch deletion.

Repo admins can bypass at PR-merge time (an explicit "bypass rules" confirmation). That's an escape hatch for emergencies, not the workflow.

**Releasing:** open a PR `dev → prod`, let CI pass, merge. Run `npm run sync:repos` from `prod` afterwards so the standalone service mirrors reflect production.

Branch naming in practice: `<yourname>/<short-topic>` (e.g. `dhanika/inquiry-responded-at`). Commit messages follow conventional-commit style: `feat(provider): …`, `fix(web): …`, `ci: …`, `docs: …`.

## Issues

- **Title**: `[PREFIX] Imperative summary` — type prefixes (`[FEATURE]`, `[BUG]`, `[SECURITY]`, `[UI]`, `[DATABASE]`, …) for web/cross-cutting issues, service prefixes (`[IDENTITY]`, `[PROVIDER]`, `[REVIEW]`, `[JOB]`, `[NOTIFICATION]`, `[API-GATEWAY]`) for service-scoped ones.
- **Labels**: apply the matching lowercase label(s) — every type prefix has one, and services have `service: <name>` labels. Titles and labels stay in sync.
- **Board**: a workflow auto-adds every new issue to the [Service Hub board](https://github.com/orgs/luminary-dev/projects/1) with `Status=Backlog` and the right `Service`. Move items yourself as you pick them up (`Todo → In Progress → Review → Done`); nothing moves them automatically except addition.
- **Closing**: reference the issue from the PR (`Fixes #123`) so the merge closes it, assign the person who resolved it, and move the board item to `Done`.

## Testing conventions

Pure logic lives in `src/lib/*.ts` with a colocated `*.test.ts` (vitest) — extract logic there rather than testing through HTTP where practical. The gateway additionally has app-level tests (`app.test.ts`) that stub upstream fetch. If you add an S2S consumer, its failure mode (degrade vs 502) should match the degradation philosophy in [Shared conventions](architecture/conventions.md).

## Things that bite

- **Next.js in this repo is version 16** — APIs and conventions differ from what you may remember; check `node_modules/next/dist/docs/` before writing web code (this is also in `AGENTS.md`, which AI tooling reads).
- **Schema changes ship as committed migrations** (`prisma/migrations/`, baseline `0_init`). Author one with `npm run db:migrate:dev` in the service; containers apply pending migrations at startup (`prisma migrate deploy`). Dev databases created before the baseline: run `scripts/baseline-migrations.sh` once. `db:push` remains for throwaway prototyping only.
- **Don't touch `/internal` response shapes** without checking every caller — the S2S contract is only enforced by the comments above each handler and their consumers' types.
