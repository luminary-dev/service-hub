// Account-deletion fan-out (#123): identity-service is the orchestrator, the
// peers each own an idempotent POST /internal/users/:id/erase. All four must
// succeed before the local User row goes — a failure throws and the caller
// returns 502 WITHOUT deleting anything locally, so the user can simply retry
// (peer erases are idempotent no-ops the second time).
import { db } from "../db";
import { s2s } from "./http";

const PROVIDER_SERVICE_URL =
  process.env.PROVIDER_SERVICE_URL ?? "http://localhost:4002";
const REVIEW_SERVICE_URL =
  process.env.REVIEW_SERVICE_URL ?? "http://localhost:4003";
const JOB_SERVICE_URL = process.env.JOB_SERVICE_URL ?? "http://localhost:4004";
const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4005";

export async function eraseUserData(
  userId: string,
  providerId: string | null
): Promise<void> {
  const id = encodeURIComponent(userId);
  // Review + job erase first, provider erase LAST (#551): the providerId the
  // job erase needs (JobResponses are keyed by it) is resolved from the very
  // Provider row the provider erase deletes. If the provider erase committed
  // first and the job erase then failed, the retry would resolve providerId as
  // null and skip the JobResponses forever.
  const results = await Promise.all([
    // review-service needs the providerId to erase the reviews the user
    // RECEIVED (keyed by provider id, resolvable only by this orchestrator).
    // Passing it in the body — exactly as the job erase below does — means
    // review-service never re-resolves it over S2S, so a transient provider
    // blip can no longer make its erase silently degrade-open and strand the
    // received reviews forever (#749).
    s2s(REVIEW_SERVICE_URL, `/internal/users/${id}/erase`, {
      method: "POST",
      body: JSON.stringify({ providerId }),
    }),
    // job-service needs the providerId to erase JobResponses (they are keyed
    // by provider id, which only this orchestrator can resolve).
    s2s(JOB_SERVICE_URL, `/internal/users/${id}/erase`, {
      method: "POST",
      body: JSON.stringify({ providerId }),
    }),
    // notification-service drops the user's feed + preference overrides. No
    // ordering constraint — nothing else depends on it.
    s2s(NOTIFICATION_SERVICE_URL, `/internal/users/${id}/erase`, {
      method: "POST",
      body: "{}",
    }),
  ]);

  for (const res of results) {
    if (!res.ok) {
      throw new Error(`peer erase responded ${res.status}`);
    }
  }

  const providerRes = await s2s(
    PROVIDER_SERVICE_URL,
    `/internal/users/${id}/erase`,
    { method: "POST", body: "{}" }
  );
  if (!providerRes.ok) {
    throw new Error(`peer erase responded ${providerRes.status}`);
  }

  // Other users' favorites pointing at the now-erased provider are dangling
  // cross-service references: they show as fewer cards than the count and burn
  // the per-user cap (#767). The orchestrator already knows the providerId, so
  // clean them here (identity's own DB). Idempotent — a retry no-ops. Runs
  // after the peer erases succeed so an aborted fan-out doesn't drop favorites
  // for a provider that will still exist on the retry.
  if (providerId) {
    await db.favorite.deleteMany({ where: { providerId } });
  }
}
