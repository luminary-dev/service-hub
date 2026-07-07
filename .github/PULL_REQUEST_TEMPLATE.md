## Summary

<!-- What does this PR change, and why? One or two sentences. -->

Closes #

## Changes

<!-- Bullet the notable changes. -->

-

## Checklist

- [ ] Linked the issue this closes (`Closes #NNN` above).
- [ ] **Migrations:** schema changes ship as committed migrations under
      `prisma/migrations/`, and I ran them locally (`npm run db:migrate`). _(N/A if no schema change.)_
- [ ] **Env vars:** any new env var is documented in the service's
      `.env.example`, the env table in `docs/ARCHITECTURE.md`, and added to
      `.env.prod.example`. _(N/A if none.)_
- [ ] **Tests:** added / updated tests, and `npm run typecheck && npm test` pass
      (in the affected service and/or at the repo root).
- [ ] **Smoke-tested:** ran the flow locally (`npm run dev:all` or
      `docker compose up --build`); ran `npm run e2e` if the change touches an
      end-to-end path.
- [ ] Docs updated (README / `docs/*`) if behavior or setup changed.

## Notes for reviewers

<!-- Anything reviewers should focus on, deploy-order caveats, follow-ups. -->
