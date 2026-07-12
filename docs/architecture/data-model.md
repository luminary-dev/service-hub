# Data ownership


- **identity-service** (`identity_db`): `User`, `PasswordResetToken`,
  `EmailVerificationToken`, `EmailChangeToken` (change-email flow #396 —
  hash-only, 1h TTL), `Favorite` (providerId is a plain string),
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
- **provider-service** (`provider_db`): `Provider`, `Service`, `WorkPhoto`
  (`sortOrder` manual order + `deletedAt` moderation soft-delete),
  `VerificationDocument`, `Inquiry` (+ `source`, per-party `customerLastReadAt`/
  `providerLastReadAt`, `respondedAt`), `InquiryMessage` (#13 threads),
  `Report` (abuse reports on providers and work photos), `Category` (managed
  category list: slug PK, en/si labels, icon, active flag, sortOrder — no hard
  delete), `AdminAuditLog` (#227 moderation trail for the actions this service
  owns).
  `Provider` denormalizes `contactName`/`contactEmail`/`contactPhone` (copied
  from the user at registration; profile updates write both locally and S2S to
  identity) and carries `awayUntil` (#49), `verificationStatus`/`verifiedAt`/
  `rejectionReason`, `suspended`. `userId` is a plain string.
  `Report` fields: `targetType` (`PROVIDER`|`WORK_PHOTO`), `targetId`,
  `reporterId` (nullable — anonymous allowed), `reason`, `details`, `status`
  (`OPEN`|`RESOLVED`|`DISMISSED`), `source` (`USER`|`SYSTEM`, #232 — SYSTEM is
  reserved for auto-flagging), `updatedAt` (last-transition timestamp, #370),
  and the audit fields `resolvedBy`/`resolvedAt` (#223, stamped when a report is
  closed). `Inquiry` and `Report` both carry `updatedAt` (#370).
- **review-service** (`review_db`): `Review` (+ `deletedAt` soft-delete,
  `verified` badge, `updatedAt` last-transition timestamp #370, and the optional
  nullable 1–5 sub-ratings `quality`/`punctuality`/`value`/`communication` #528
  — the overall `rating` stays authoritative for ranking), `ReviewPhoto`,
  `Report` (**identical shape to provider-service's**, reconciled in #370 —
  same field set including `source` (`USER`|`SYSTEM`) and `updatedAt`;
  `targetType` = `REVIEW`; same `resolvedBy`/`resolvedAt` audit fields),
  `AdminAuditLog` (identical model; the two audit logs are merged only in the
  admin frontend, never server-side). `providerId`/`userId` plain strings;
  reviewer names hydrated from identity at read time.
- **job-service** (`job_db`): `JobRequest` (`status` OPEN|CLOSED, `updatedAt`
  last-transition timestamp #370), `JobResponse`.
  `customerId`/`providerId` plain strings. **Monetization (pricing, commission,
  payments) is intentionally deferred to v0.2** — v0.1 is free to use, so there
  is no transaction ledger and no price/commission field on a job.
- **notification-service**: stateless; owns the en/si email templates ported
  from `src/lib/email.ts`.
- **media-service** / **chat-service**: stateless (no DB).

Cross-service uniqueness/cascades that FKs used to give us are preserved by
same-service constraints (`@@unique([providerId, userId])` etc.) and S2S
existence checks at write time. There are no cross-service delete cascades;
account deletion fans out over S2S erase endpoints (see job-service section).

