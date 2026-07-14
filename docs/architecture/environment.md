# Environment variables


| var | used by |
|---|---|
| `PORT` | every service (defaults: identity 4001, provider 4002, review 4003, job 4004, notification 4005, media 4006, chat 4007, search 4008, gateway 4000) |
| `DATABASE_URL` | identity, provider, review, job, search |
| `AUTH_SECRET` | identity (sign), gateway + web (verify) |
| `INTERNAL_API_SECRET` | all services + gateway + web (web calls chat-service and identity directly) |
| `REDIS_URL` | gateway (distributed rate-limit window; unset → per-instance in-memory fallback — see [RATE_LIMITING.md](../RATE_LIMITING.md)) + identity (session-revocation publish, #374). In prod the URL carries the Redis password (`redis://default:${REDIS_PASSWORD}@redis:6379`, #387) |
| `TRUSTED_PROXY_HOPS` | gateway (trusted reverse-proxy hop count for rate-limit client-IP resolution, #201; default `2` in prod, `0` disables `X-Forwarded-For` trust — see [RATE_LIMITING.md](../RATE_LIMITING.md)) |
| `IDENTITY_SERVICE_URL` | gateway + provider + review + job (S2S peer) **and web** (`src/lib/session-version.ts` page-gating revocation check — reaches identity directly with the internal secret; fails open if unset) |
| `PROVIDER_SERVICE_URL`, `REVIEW_SERVICE_URL`, `JOB_SERVICE_URL`, `NOTIFICATION_SERVICE_URL`, `MEDIA_SERVICE_URL` | gateway + any service that calls that peer |
| `SEARCH_SERVICE_URL` | gateway (`/api/search/*` routing) + provider (index document push) + review (rating push) — the search & discovery RFC's S2S sync |
| `CHAT_SERVICE_URL` | web (proxies `/agent/chat` → `${CHAT_SERVICE_URL}/internal/chat/marketplace/stream`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | notification (console fallback when `RESEND_API_KEY` unset) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | identity (Google social login, #398; both unset → "Continue with Google" disabled, password auth unaffected) |
| `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | identity (Facebook social login, #398; both unset → "Continue with Facebook" disabled, password auth unaffected) |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | media (uploads → Cloudflare R2; all four unset → local disk under `$MEDIA_DIR`) |
| `MEDIA_DIR` | media (local upload root, default `./data`; per-namespace subdirs; compose sets `/app/data`) |
| `ANTHROPIC_API_KEY` | **chat-service** (LLM assistant; unset → chat-service returns 503 and the widget degrades). NOT on the web app — the key is isolated from the web runtime. |
| `WEB_ORIGIN` | gateway (authoritative `x-origin`), prod compose (email links + CSRF) |
| `GATEWAY_URL` | web (runtime `/api/*` proxy target in `src/proxy.ts` + `src/lib/api.ts` server fetches + `sitemap.ts`; read per request, never baked into the build), chat-service (its tools call the gateway) |
| `NEXT_PUBLIC_SITE_URL` | web (sitemap/robots/OG canonical origin, optional) |
| `DOMAIN`, `ACME_EMAIL`, `IMAGE_TAG`, `POSTGRES_PASSWORD` | prod compose only (`docker-compose.prod.yml` / `.env.prod.example` — Caddy TLS host, ACME account email (unset → `admin@${DOMAIN}`, #387), published image tag, Postgres **superuser** password — cluster admin + backups only since #387; the services connect as their own roles) |
| `IDENTITY_DB_PASSWORD`, `PROVIDER_DB_PASSWORD`, `REVIEW_DB_PASSWORD`, `JOB_DB_PASSWORD`, `SEARCH_DB_PASSWORD`, `REDIS_PASSWORD` | prod compose only (#387) — per-service least-privilege DB role passwords + Redis AUTH. URL-interpolated, so generate URL-safe values (`openssl rand -hex 32`). `SEARCH_DB_PASSWORD` additionally needs the PostGIS bootstrap on an existing volume (`deploy/add-search-db.sh`). See [DEPLOYMENT.md](../DEPLOYMENT.md) |
| `BACKUP_R2_ENDPOINT`, `BACKUP_R2_BUCKET`, `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY`, `BACKUP_HEARTBEAT_URL` | backup scripts only (#389) — nightly offsite copy to a dedicated R2 bucket + dead-man's-switch ping. Host-local `.backup.env` (not GitHub secrets, not the CD-rendered `.env`); see [BACKUPS.md](../BACKUPS.md) |

