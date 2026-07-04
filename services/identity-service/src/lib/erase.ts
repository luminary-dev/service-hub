// Account-deletion fan-out (#123): identity-service is the orchestrator, the
// peers each own an idempotent POST /internal/users/:id/erase. All three must
// succeed before the local User row goes — a failure throws and the caller
// returns 502 WITHOUT deleting anything locally, so the user can simply retry
// (peer erases are idempotent no-ops the second time).
import { s2s } from "./http";

const PROVIDER_SERVICE_URL =
  process.env.PROVIDER_SERVICE_URL ?? "http://localhost:4002";
const REVIEW_SERVICE_URL =
  process.env.REVIEW_SERVICE_URL ?? "http://localhost:4003";
const JOB_SERVICE_URL = process.env.JOB_SERVICE_URL ?? "http://localhost:4004";

export async function eraseUserData(
  userId: string,
  providerId: string | null
): Promise<void> {
  const id = encodeURIComponent(userId);
  const results = await Promise.all([
    s2s(PROVIDER_SERVICE_URL, `/internal/users/${id}/erase`, {
      method: "POST",
      body: "{}",
    }),
    s2s(REVIEW_SERVICE_URL, `/internal/users/${id}/erase`, {
      method: "POST",
      body: "{}",
    }),
    // job-service needs the providerId to erase JobResponses (they are keyed
    // by provider id, which only this orchestrator can resolve).
    s2s(JOB_SERVICE_URL, `/internal/users/${id}/erase`, {
      method: "POST",
      body: JSON.stringify({ providerId }),
    }),
  ]);

  for (const res of results) {
    if (!res.ok) {
      throw new Error(`peer erase responded ${res.status}`);
    }
  }
}
