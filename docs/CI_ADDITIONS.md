# CI additions — menu of further checks & pipelines

A living menu of CI checks/pipelines we can add on top of what already runs
today, each with a one-line rationale, rough effort, and whether it should
**gate** merges or stay **report-only**. It exists so we add checks
deliberately — every new gate is friction on every PR, so most new checks start
report-only and are promoted to a required check only once they're proven quiet.

## What we already run

For the full current picture see [OPERATIONS.md](OPERATIONS.md); in short, on
every PR/push to `dev`/`prod` we run:

- **`ci.yml`** — per-package `typecheck` / `test` / `build` for web + the 8
  services, web-only `lint`, a `coverage` ratchet (web + 8 services), and a
  PR-only compose **e2e smoke**. Concurrency-cancel + `timeout-minutes` on
  every job.
- **`security-scan.yml`** — Trivy filesystem (deps, report-only), Trivy image
  (OS packages, **gating** on fixable HIGH/CRITICAL), and `npm audit`
  (informational). Weekly cron + `workflow_dispatch`.
- **`actionlint.yml`** — workflow-YAML linting (shipping now, see below).
- **CodeQL** — first-party static analysis of our own TS. Already enabled, but
  **not** as a workflow in this repo: it runs through GitHub's code-scanning
  **default setup** (managed by GitHub, `javascript-typescript` + `actions`,
  `default` query suite). See "Note on CodeQL" below.
- **`deploy.yml`** / **`release.yml`** — GHCR image build/publish + SSH deploy
  with health-gate/rollback; `v*` tags cut a versioned release.
- **`add-to-project.yml`** / **`board-done-on-close.yml`** — project-board sync.

All Trivy SARIF (and CodeQL's default-setup results) surface in the GitHub
Security tab.

## The menu

Legend — **Gate**: fails the build / blocks merge. **Report**: surfaces
findings (Security tab, PR comment, or log) without blocking.

| # | Addition | Rationale | Effort | Gate vs report | Priority |
| - | -------- | --------- | ------ | -------------- | -------- |
| 1 | **actionlint** ✅ *(shipped)* | Lint the workflow YAML itself (bad `runs-on`, malformed `${{ }}` expressions, deprecated syntax) — we run 8 workflows and nothing linted them. | Low | Gate (fast, deterministic; path-filtered to `.github/workflows/**`) | **Quick win — done** |
| 2 | **CodeQL query-suite upgrade** | CodeQL is already on via default setup, but with the `default` query suite; bumping default setup to the **extended** suite adds the security-extended queries. This is a repo-settings toggle (Security → Code scanning → default setup), *not* a workflow — an advanced-config workflow would conflict with default setup. | Low (settings, no code) | Report | Quick win |
| 3 | **Commit / PR-title lint (Conventional Commits)** | CLAUDE.md already *requires* Conventional-Commit PR titles; a check enforces the contract instead of trusting review. | Low | Gate (PR title) | Quick win |
| 4 | **Docs link checker (lychee)** | The `docs/` tree is GitBook-synced and leans heavily on **relative** links (see `SUMMARY.md`, `README.md` index); a broken relative link silently breaks the published nav. | Low | Report first, then gate | Quick win |
| 5 | **Service-side ESLint** | Only **web** has a `lint` script today — none of the 8 services do. Adding a shared flat-config + `lint` script closes a real gap in backend code quality. | Medium (per-service config + fixing existing violations) | Gate once clean | Later |
| 6 | **Coverage summary PR comment** | `coverage` already produces `coverage-summary.json` per package + a step-summary; surfacing the deltas as a sticky PR comment makes the ratchet visible without opening the run. | Low | Report | Quick win |
| 7 | **dependency-review-action** | On PRs, flags newly-added deps with known vulns or disallowed licenses *before* merge — complements Trivy/`npm audit`, which scan the whole tree post-hoc. | Low | Gate (PR-only, new deps only) | Quick win |
| 8 | **Re-enable actionlint's shellcheck** | actionlint bundles shellcheck for `run:` blocks; it's currently disabled because the existing workflows trip 6 benign SC2016 false-positives (`gh`/GraphQL `$var` in single quotes) + one SC2034. Suppress those inline, then drop `-shellcheck=`. | Low | Gate | Quick win |
| 9 | **SBOM + image signing (cosign)** | For released images (`release.yml`): generate an SBOM (CycloneDX/SPDX) and sign images with cosign keyless (OIDC) for provenance/supply-chain integrity. | Medium | Report (publishes attestations) | Later |
| 10 | **OpenAPI / route-contract drift check** | The gateway routing table (`services/api-gateway/src/lib/routes.ts`) + `docs/API.md` are the endpoint source of truth; a check that diffs the live route table against the documented contract prevents code/doc drift the golden rules forbid. | High (needs a generator/differ) | Report first | Later |
| 11 | **Bundle-size / Lighthouse budget (web)** | Guard the Next.js web bundle + Core Web Vitals against regressions with a size/Lighthouse budget on PRs. | Medium | Report (budget warnings) | Later |

## Notes on accuracy to this repo

- **Only `web` is linted.** Confirmed: the root `package.json` has a `lint`
  script (`eslint`) and `eslint` + `eslint-config-next` devDeps; none of the 8
  `services/*/package.json` define a `lint` script (they have `typecheck` /
  `test` / `build` / `coverage`). Item 5 is a genuine gap, not a duplicate.
- **CodeQL is already on — via default setup, not a workflow.** GitHub's
  code-scanning *default setup* has been configured on this repo since
  2026-07-03 (`javascript-typescript`, `actions`, `default` query suite) and
  runs a managed CodeQL analysis on push/PR. An **advanced-config workflow
  cannot coexist with default setup** — GitHub rejects the SARIF upload with
  "CodeQL analyses from advanced configurations cannot be processed when the
  default setup is enabled." So the improvement here (item 2) is a settings
  upgrade of default setup, not a committed workflow. The
  `github/codeql-action/upload-sarif` in `security-scan.yml` is unrelated — it
  is only the transport for Trivy's SARIF.
- **Relative links everywhere.** `docs/SUMMARY.md` and the `README.md` index
  are almost entirely relative links, so item 4 (lychee) protects the GitBook
  nav specifically.
- **Report-first bias.** New checks should land report-only and only become
  required (via the `dev`/`prod` rulesets) once they're proven low-noise —
  matching the Trivy-fs posture and keeping unrelated PRs unblocked.

## Shipping now: actionlint (`actionlint.yml`)

Lints every workflow under `.github/workflows/**` with
[actionlint](https://github.com/rhysd/actionlint), pinned to the released
`rhysd/actionlint:1.7.12` image **by digest** (#573 — a mutable Docker Hub tag
could be repointed by the publisher; matching the repo's SHA-pinned actions
and digest-pinned base images). It runs on push + PR to `dev`/`prod` **only
when a workflow file changes** (a `paths:` filter, so it never touches
unrelated PRs), plus `workflow_dispatch`. Least-privilege `permissions`
(`contents: read`), a 10-minute `timeout-minutes` cap, and the same
`concurrency` cancel group as `ci.yml` / `security-scan.yml`.

The bundled **shellcheck** integration is disabled (`-shellcheck=`): on today's
workflows it emits only benign SC2016 false-positives (`gh` / GraphQL `$var`
strings that are intentionally single-quoted) plus one SC2034 unused-var
warning. actionlint's native YAML + expression checks are what we want first;
re-enabling shellcheck is tracked as item 8 above.

As a brand-new check context, actionlint is **not** a required check in the
`dev`/`prod` rulesets, so a red run can't block a merge until it's explicitly
promoted — but because it's path-filtered and deterministic it's a good
candidate to promote to required once we've watched a few workflow-editing PRs.
