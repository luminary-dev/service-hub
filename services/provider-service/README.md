# provider-service

Owns the provider directory for Service Hub (Baas.lk): provider profiles,
services, work photos, verification documents and inquiries, backed by its own
`provider_db` Postgres database. `Provider.userId` is a plain string reference
to identity-service; contact fields (`contactName`, `contactEmail`,
`contactPhone`) are denormalized from the user at registration and kept in
sync on profile updates. Ratings, reviews, email-verification state and open
job counts are hydrated over S2S HTTP at read time and degrade gracefully.

Runs on **:4002** behind the api-gateway. Every request must carry
`x-internal-secret`; user identity arrives via `x-user-id` / `x-user-role` /
`x-user-name` headers set by the gateway. See `docs/ARCHITECTURE.md` in the
monorepo for the full contract.

## Endpoints

Public (via gateway):

| Method | Path | Description |
|---|---|---|
| GET | `/api/providers` | Directory listing: `q`, `category`, `district`, `sort`, `page`, `pageSize` (default 12, max 24), `take`, `ids` (comma list, input order) |
| GET | `/api/providers/ids` | `{ providers: [{id, updatedAt}] }` non-suspended (sitemap) |
| GET | `/api/providers/:id` | Legacy detail (provider + services + photos + contact as `user`) |
| GET | `/api/providers/:id/full` | Page payload incl. reviews from review-service; suspended → 404 unless admin |
| GET | `/api/providers/:id/card` | OG-image payload (name, category, location, rating, verification) |
| POST | `/api/providers/:id/inquiries` | Create an inquiry (optional session) |
| GET | `/api/stats` | `{ providerCount, reviewCount }` |
| GET | `/files/*` | Serves local uploads from `$UPLOAD_DIR` |

Provider dashboard (requires a PROVIDER session owning a provider, else 401):

| Method | Path |
|---|---|
| GET | `/api/provider/dashboard` |
| PUT | `/api/provider/profile` |
| POST | `/api/provider/services` |
| PUT / DELETE | `/api/provider/services/:id` |
| POST | `/api/provider/photos` (multipart `file`, `caption`, `kind`; `kind=avatar` sets the avatar) |
| DELETE | `/api/provider/photos/:id` |
| GET | `/api/provider/inquiries` |
| PATCH | `/api/provider/inquiries/:id` |
| POST | `/api/provider/verification` (multipart `nic` / `business`) |

Admin (requires `x-user-role=ADMIN`, else 403):

| Method | Path |
|---|---|
| GET | `/api/admin/providers` |
| GET | `/api/admin/providers/:id` |
| GET | `/api/admin/verifications` |
| PATCH | `/api/admin/providers/:id` (`verify` / `unverify` / `suspend` / `unsuspend`) |
| PATCH | `/api/admin/verifications/:id` (`approve` / `reject`) |
| DELETE | `/api/admin/photos/:id` |

Internal (service-to-service only):

| Method | Path |
|---|---|
| POST | `/internal/providers` (registration orchestration → `{ id }`) |
| GET | `/internal/providers/by-user/:userId` |
| GET | `/internal/providers?ids=` |
| GET | `/internal/providers/:id/summary` |

Health: `GET /healthz` → `{ ok: true, service: "provider-service" }` (no secret
required).

## Environment

| var | default | purpose |
|---|---|---|
| `PORT` | `4002` | listen port |
| `DATABASE_URL` | — | Postgres (`provider_db`) |
| `INTERNAL_API_SECRET` | `dev-internal-secret` | S2S auth |
| `IDENTITY_SERVICE_URL` | `http://localhost:4001` | profile sync, emailVerified |
| `REVIEW_SERVICE_URL` | `http://localhost:4003` | ratings, reviews, counts |
| `JOB_SERVICE_URL` | `http://localhost:4004` | dashboard open-jobs badge |
| `UPLOAD_DIR` | `./data/uploads` | local upload storage |
| `BLOB_READ_WRITE_TOKEN` | — | Vercel Blob uploads (local disk when unset) |

## Run

```bash
cp .env.example .env
npm install
npm run db:push     # create tables in provider_db
npm run db:seed     # demo providers with deterministic IDs
npm run dev         # tsx watch on :4002
```

`npm run typecheck`, `npm test` (vitest) and `npm run build` mirror CI.
Docker: `docker build -t provider-service .` (runs `prisma db push` on start).
