# Web app & local development

## Web app changes

- `src/proxy.ts` (Next 16's rename of middleware) rewrites `/api/:path*` →
  `${GATEWAY_URL}/api/:path*` at **request** time, so `GATEWAY_URL` is a pure
  runtime env var (unset → `http://localhost:4000`). Client components keep
  calling `/api/*` unchanged.
- The proxy is also the trust boundary for the `x-locale` request header
  (#67/#204): `/si*` URLs rewrite to the unprefixed route with `x-locale: si`;
  every other page route has `x-locale` overwritten to `en`. It runs on all page
  routes (matcher excludes only `/api`, `_next/*` and metadata assets) so a
  client-supplied `X-Locale` can never reach `getUrlLocale()`. The `lang` cookie
  still drives the rendered locale via `getLocale()`, which reads it directly.
  Root metadata files (`sitemap.xml`, `robots.txt`, `manifest.webmanifest`)
  exist only at the English root — under `/si` the proxy skips the rewrite so
  they 404 instead of serving duplicates (#379).
- Server components fetch the gateway directly (`src/lib/api.ts`: `GATEWAY_URL` +
  forwarded `cookie`, `cache: "no-store"`); `src/app/sitemap.ts` fetches
  `/api/providers/ids` and the active category list (`fetchCategoryOptions`,
  static fallback when the gateway is unreachable) for the `?category=` pages.
- Page gating: `auth.ts#getSession` (JWT verify only) + `src/lib/roles.ts`
  (admin tiers) + `src/lib/session-version.ts` (soft revocation check to
  identity via `IDENTITY_SERVICE_URL`, fail-open). CSRF, rate-limit, tokens,
  email, upload, favorites, provider-auth libs and `src/app/api/**` are gone —
  they live in the services now. Prisma is fully removed from the web app.
- `src/app/agent/chat/route.ts` proxies `POST /agent/chat` →
  `${CHAT_SERVICE_URL}/internal/chat/marketplace/stream` with the internal
  secret + forwarded cookie/IP; non-stream error responses (incl. 503 when the
  assistant is disabled) pass straight through.

## Local development

- `docker compose up -d postgres` then `npm run dev:all` (root script starts all
  ten services + web), or `docker compose up --build` for
  the full stack (postgres + redis + 10 services + web). `npm run setup`
  migrates + seeds the six stateful services (deterministic IDs; `password123`
  accounts) and migrates search-service's derived index (no seed — rebuilt via
  its reindex sweep).
- Ops scripts under `scripts/`: `dev-all.sh`, `setup.sh`, `dev-reset.sh`
  (tears the stack down **with volumes**, rebuilds, and reseeds — local data is
  disposable and never migrated between runs), `e2e-smoke.sh`,
  `baseline-migrations.sh`, `backup-dbs.sh`/`restore-db.sh`, `init-db.sql`
  (creates the seven databases), `sync-service-repos.sh` (subtree mirror),
  `gen-icons.mjs`.
- Production: `docker-compose.prod.yml` + `.env.prod.example` (Caddy TLS via
  `DOMAIN`/`ACME_EMAIL`, `IMAGE_TAG`, required `AUTH_SECRET`/
  `INTERNAL_API_SECRET`/`POSTGRES_PASSWORD`).
