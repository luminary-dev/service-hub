# Data ownership


- **identity-service** (`identity_db`): `User`, `PasswordResetToken`,
  `EmailVerificationToken`, `EmailChangeToken` (change-email flow #396 —
  hash-only, 1h TTL), `Favorite` (providerId is a plain string),
  `SavedSearch` (named `/providers` filter snapshot + locale +
  `lastNotifiedAt` alert cooldown, #516 — the category is a plain
  provider-service slug validated over S2S at write time),
  `Account` (linked OAuth accounts — Google login #398, unique
  `[provider, providerAccountId]`), `AccountDeletion` (audit row that outlives
  the User), `ImpersonationLog` (admin "view as", #234 — adminId + targetUserId
  + startedAt/endedAt; no relations so it survives account deletion of either
  party), `AdminAuditLog` (identity-owned self-service actions #403, e.g.
  `LEAVE_PROVIDER` — written best-effort; not yet exposed via a read endpoint or
  surfaced in the admin UI).
  `User.role` is a **plain string** (never a native enum), valid values
  `CUSTOMER | PROVIDER | ADMIN | SUPPORT`, enforced by a `CHECK` constraint
  (hand-written, not diffed by `prisma migrate dev`; the set was finalized in
  migration `20260708200000`, which dropped an earlier unused admin value).
  `ADMIN` is the full-access tier; `SUPPORT` is a limited
  read-plus-report-resolve tier. See "Admin surface" below for how the tiers are
  enforced end-to-end.
  `User` also carries `sessionVersion` (revocation), `failedLogins`/`lockedUntil`
  (per-account lockout), `emailVerified`, `avatarUrl` (profile photo #434), and
  a **nullable** `passwordHash` (OAuth-only accounts have no password #398).
  Admin hot paths are indexed (#509, migration `20260713120000`): a btree on
  `createdAt` (newest-first users list + dashboard signups range scan) and
  pg_trgm GIN indexes on `email`/`name` for the case-insensitive admin search
  (`ILIKE`), the same operator-class-index pattern provider-service uses for its
  listing search — hand-written because Prisma's DSL can't express them.
- **provider-service** (`provider_db`): `Provider`, `Service`, `WorkPhoto`
  (`sortOrder` manual order + `deletedAt` moderation soft-delete),
  `VerificationDocument`, `Inquiry` (+ `source`, per-party `customerLastReadAt`/
  `providerLastReadAt`, `respondedAt`), `InquiryMessage` (#13 threads, +
  `deletedAt` moderation soft-delete #376),
  `Report` (abuse reports on providers, work photos and thread messages),
  `Category` (managed
  category list: slug PK, en/si labels, icon, active flag, sortOrder — no hard
  delete), `AdminAuditLog` (#227 moderation trail for the actions this service
  owns).
  `Provider` denormalizes `contactName`/`contactEmail`/`contactPhone` (copied
  from the user at registration; profile updates write both locally and S2S to
  identity) and carries `awayUntil` (#49), `verificationStatus`/`verifiedAt`/
  `rejectionReason`, `suspended` + `adminSuspended` (#550 — `suspended` alone
  drives public visibility for both ADMIN moderation and the self-service
  downgrade #403; `adminSuspended` marks it admin-owned, which only the admin
  unsuspend action clears — the self-service reactivate refuses it).
  Multi-district service area (#502):
  `serviceDistricts String[]` is the full set of districts the provider serves
  — it **always contains the primary `district`** (kept as the home base shown
  on cards), is capped at 5 (`MAX_SERVICE_DISTRICTS` in `lib/field-rules.ts`,
  deduped with the primary pinned first), was backfilled to `[district]` by
  migration `20260714090000`, and is GIN-indexed because browse filtering, the
  job board and the new-job fan-out all match on membership in the set.
  Geo capture (#48, search & discovery RFC phase 1): **optional nullable**
  `latitude`/`longitude` floats — the provider's map pin, captured via the
  web's Leaflet picker (migration `20260714130000`). Always both set or both
  null; validated against a Sri Lanka bounding box (5.7–10.1 lat, 79.4–82.1
  lng in `lib/field-rules.ts`). District centroids are never substituted for
  a missing pin, and the public detail payloads include the pair only when
  set. Plain floats here — search-service's index (phase 2, PostGIS)
  derives its geography column from them. The
  free-text pitch is bilingual (#515):
  `headline`/`bio` (English, required) plus **optional nullable**
  `headlineSi`/`bioSi` (Sinhala variants) — the public payload prefers the SI
  variant under the `si` locale and falls back to the English original, and
  both SI columns join the `/api/providers` free-text search (pg_trgm-indexed).
  Per-service Sinhala titles are a deliberate follow-up. `userId` is a plain
  string.
  `Service.price` is money: **`DECIMAL(12,2)` holding whole LKR rupees**
  (#371) — see the money convention note under job-service.
  `Report` fields: `targetType` (`PROVIDER`|`WORK_PHOTO`|`INQUIRY`|`MESSAGE`
  — INQUIRY rows are auto-filed by the write-time content filter #375;
  MESSAGE rows are user reports on individual thread messages #376),
  `targetId`,
  `reporterId` (nullable — anonymous allowed), `reason`, `details`, `status`
  (`OPEN`|`RESOLVED`|`DISMISSED`), `source` (`USER`|`SYSTEM`, #232 — SYSTEM
  rows come from threshold auto-flagging and the content filter), `updatedAt`
  (last-transition timestamp, #370), and the audit fields
  `resolvedBy`/`resolvedAt` (#223, stamped when a report is closed). `Inquiry`
  and `Report` both carry `updatedAt` (#370).
- **review-service** (`review_db`): `Review` (+ `deletedAt` soft-delete,
  `verified` badge, `updatedAt` last-transition timestamp #370, and the optional
  nullable 1–5 sub-ratings `quality`/`punctuality`/`value`/`communication` #528
  — the overall `rating` stays authoritative for ranking), `ReviewPhoto`,
  `Report` (**identical shape to provider-service's**, reconciled in #370 —
  same field set including `source` (`USER`|`SYSTEM`) and `updatedAt`;
  `targetType` = `REVIEW`; same `resolvedBy`/`resolvedAt` audit fields),
  `AdminAuditLog` (identical model; the per-service audit logs are merged only
  in the admin frontend, never server-side). `providerId`/`userId` plain
  strings; reviewer names hydrated from identity at read time.
- **job-service** (`job_db`): `JobRequest` (`status` OPEN|CLOSED, `updatedAt`
  last-transition timestamp #370, `hiddenAt` admin-takedown soft-hide #376),
  `JobResponse`, `Report` (**identical shape to the provider/review models**;
  `targetType` = `JOB`|`JOB_RESPONSE`; rows come from the public
  report-a-job flow #376 and the write-time content filter's SYSTEM flags
  #375), `AdminAuditLog` (identical model; the three audit logs are merged
  only in the admin frontend).
  `customerId`/`providerId` plain strings. **Monetization (pricing, commission,
  payments) is intentionally deferred to v0.2** — v0.1 is free to use, so there
  is no transaction ledger and no price/commission field on a job. Display-only
  pricing (provider rates, price filters, and the optional customer-stated
  `JobRequest.budget`) stays in v0.1: payment happens off-platform.
  **Money convention (#371):** every money column — `Service.price`
  (provider-service) and `JobRequest.budget` (job-service) — is
  **`DECIMAL(12,2)` holding whole LKR rupees** (never a float; the API-edge
  validators accept integers only, the two decimal places just keep the column
  future-proof). The Prisma client surfaces these as `Decimal` instances,
  which JSON-serialize as *strings*, so each service converts back to a plain
  number at every JSON edge (`lib/money.ts` in both services) — API payloads
  carry money as JSON **numbers**, exactly as before the migration.
- **search-service** (`search_db`, PostGIS): `ProviderIndex` — one row per
  **publicly visible** provider, a **derived, rebuildable** search document
  (search & discovery RFC): the browse fields (`contactName`, category,
  bilingual pitch, city, district + `serviceDistricts`), flattened
  `serviceTitles`/`servicePrices` (+ `minPrice`), availability/verification/
  experience, mirrored `latitude`/`longitude`, and denormalized
  `ratingAvg`/`ratingCount` (pushed by review-service). Generated columns
  (hand-written migration): `location geography(Point,4326)` (GiST; ST_DWithin
  + KNN) and `tsv_en`/`tsv_si` tsvectors ('english' config with stemming for
  EN; 'simple' for SI — no Sinhala stemmer exists — with pg_trgm indexes on
  the raw columns as the substring fallback). **No contact PII** (no
  phone/email columns) and no `suspended` flag — suspended/erased providers
  are deleted from the index, so no query can leak a hidden profile.
  provider-service remains the source of truth; this database is excluded
  from backups and rebuilt by the reindex sweep.
- **notification-service** (`notification_db`, RFC
  stateful-notification-service): `Notification` (`userId` recipient — plain
  string, no FK; `type` — the `NotificationType` enum of the ten marketplace
  event types; `payload` Json — small, denormalized facts the web renders the
  sentence from at read time, so an EN↔SI switch re-renders the whole feed;
  `link` relative path; `readAt`; indexed `[userId, createdAt desc]` for the
  list page and `[userId, readAt]` for the unread count) and
  `NotificationPreference` (sparse per-`[userId, type]` channel overrides —
  no row = both `emailEnabled`/`inAppEnabled` on). The transactional auth
  emails (verify, password-reset, change-email, account-exists,
  email-change-attempt) are deliberately NOT in the enum and can never be
  muted. Retention is opportunistic: each ingestion sweeps the recipient's
  READ rows older than 90 days beyond their newest 200 (no cron). The service
  also owns the en/si email templates ported from `src/lib/email.ts` and the
  Redis-backed email delivery queue (`notify:email` / `notify:processing`,
  BRPOPLPUSH worker with a processing-list reclaim sweep, 3 attempts at
  30s × 2^n backoff; Redis down → one-attempt direct sends).
- **trust-safety-service** (`trust_safety_db`, **dark launch** — deployed and
  functional, but the owning services still write their local tables until the
  cutover PR; [RFC](../rfcs/trust-safety-service.md)): `Report` — ONE unified
  model for all **seven** target types previously split field-for-field
  identically across provider-, review- and job-service (`targetType` =
  `PROVIDER`|`WORK_PHOTO`|`INQUIRY`|`MESSAGE`|`REVIEW`|`JOB`|`JOB_RESPONSE`),
  same field set (`reporterId` nullable, `reason`, `details`, `status`,
  `source` `USER`|`SYSTEM`, `updatedAt`, `resolvedBy`/`resolvedAt`) plus a
  denormalized `ownerService` (`provider`|`review`|`job`) so queue hydration
  and takedown actions fan out per owning service; and `AdminAuditLog` — the
  unified moderation trail (same shape as the per-service logs plus a
  `service` origin column, fed by `POST /internal/audit` and the backfill).
  `targetId`/`reporterId`/`adminId` are plain strings (no cross-service FK —
  a report must survive its target's deletion); target existence/visibility
  is checked over S2S at write time. Backfilled ids are preserved verbatim
  (`scripts/migrate-trust-safety-backfill.sh`).
- **media-service** / **chat-service**: stateless (no DB).

Cross-service uniqueness/cascades that FKs used to give us are preserved by
same-service constraints (`@@unique([providerId, userId])` etc.) and S2S
existence checks at write time. There are no cross-service delete cascades;
account deletion fans out over S2S erase endpoints (see job-service section).

