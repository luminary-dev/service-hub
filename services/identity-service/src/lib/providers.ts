// S2S helpers against provider-service.
import { s2s } from "./http";
import { log } from "./log";

const PROVIDER_SERVICE_URL =
  process.env.PROVIDER_SERVICE_URL ?? "http://localhost:4002";

// Push the user's avatar to their provider profile's denormalized copy (#434).
// Best-effort: a failure only means the public card shows a stale avatar until
// the next sync, so it must never fail the user's own avatar update. No-op for
// users without a provider profile (provider-service returns 200 either way).
export async function syncAvatarToProvider(
  userId: string,
  avatarUrl: string | null
): Promise<void> {
  try {
    await s2s(PROVIDER_SERVICE_URL, "/internal/providers/avatar", {
      method: "POST",
      body: JSON.stringify({ userId, avatarUrl }),
    });
  } catch (e) {
    log.error("avatar sync failed", { context: "providers", err: e });
  }
}

// Mirror name/phone/email changes onto the provider profile's denormalized
// contact columns (#553) — those drive public cards, admin lists and the
// inquiry / new-job lead emails, so identity-side edits must follow or the
// notifications keep going to an abandoned address. Only the fields provided
// are written. Best-effort like the avatar sync: the user's own update already
// committed, so a failed mirror only means stale contact data and must never
// fail their request. No-op for users without a provider profile.
export async function syncContactToProvider(
  userId: string,
  contact: { name?: string; phone?: string | null; email?: string }
): Promise<void> {
  try {
    await s2s(PROVIDER_SERVICE_URL, "/internal/providers/contact", {
      method: "POST",
      body: JSON.stringify({ userId, ...contact }),
    });
  } catch (e) {
    log.error("contact sync failed", { context: "providers", err: e });
  }
}

// Looks up the caller's provider profile id. Read-path hydration: degrades to
// null on any S2S failure so login / me never fail because provider-service
// is down.
export async function getProviderIdByUser(
  userId: string
): Promise<string | null> {
  try {
    const res = await s2s(
      PROVIDER_SERVICE_URL,
      `/internal/providers/by-user/${encodeURIComponent(userId)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { provider: { id: string } | null };
    return data.provider?.id ?? null;
  } catch (e) {
    log.error("by-user lookup failed", { context: "providers", err: e });
    return null;
  }
}

// Account-deletion resolver (#360): the user's provider id, needed by the job
// erase to delete their JobResponses (PII, keyed by provider id — only this
// orchestrator can resolve it). Unlike getProviderIdByUser above, this is a
// WRITE-path gate and must NOT degrade to null on failure: a `res.ok` body with
// `provider: null` legitimately means "no provider profile", but any non-ok
// status or transport error throws so delete-account returns 502 and deletes
// nothing, rather than silently proceeding to erase the User while leaving the
// provider's job responses (PII) behind.
export async function resolveProviderIdForErase(
  userId: string
): Promise<string | null> {
  const res = await s2s(
    PROVIDER_SERVICE_URL,
    `/internal/providers/by-user/${encodeURIComponent(userId)}`
  );
  if (!res.ok) {
    throw new Error(`by-user lookup responded ${res.status}`);
  }
  const data = (await res.json()) as { provider: { id: string } | null };
  return data.provider?.id ?? null;
}

// Existence check for favorites. The summary endpoint always answers 200 with
// `{ provider: null }` for an unknown id, so existence is decided by the body,
// not the status. Any non-ok status is an upstream failure and must throw so
// the caller returns 502 (writes fail loudly) rather than a misleading 404 that
// silently drops the favorite when provider-service is merely degraded.
export async function providerExists(providerId: string): Promise<boolean> {
  const res = await s2s(
    PROVIDER_SERVICE_URL,
    `/internal/providers/${encodeURIComponent(providerId)}/summary`
  );
  if (!res.ok) {
    throw new Error(`provider summary lookup failed: ${res.status}`);
  }
  const data = (await res.json()) as { provider: { id: string } | null };
  return data.provider !== null;
}

// Self-service downgrade (#403): hide the caller's provider profile from public
// listings. Write-path gate — throws on failure so the caller (leave-provider)
// returns 502 and does NOT flip the role, keeping identity and provider-service
// consistent (either the profile is hidden and the role flips, or neither).
export async function deactivateProviderProfile(userId: string): Promise<void> {
  const res = await s2s(
    PROVIDER_SERVICE_URL,
    `/internal/providers/by-user/${encodeURIComponent(userId)}/deactivate`,
    { method: "POST" }
  );
  if (!res.ok) {
    throw new Error(`provider-service responded ${res.status}`);
  }
}

// Distinguishes provider-service's 409 refusal — the profile is under an
// active ADMIN suspension (#550) — from a transport/5xx failure, so
// complete-provider can answer 403 instead of the generic 502.
export class ProviderAdminSuspendedError extends Error {
  constructor() {
    super("provider profile is admin-suspended");
  }
}

// Re-upgrade (#403): a customer who previously closed their provider profile
// becomes a provider again. complete-provider reuses the existing (suspended)
// profile rather than recreating it, so it must explicitly reactivate it here.
// Write-path gate — throws on failure so complete-provider returns 502 rather
// than flipping the role to PROVIDER while the profile stays hidden. Returns
// whether a profile actually existed (provider-service no-ops with
// `reactivated: false` otherwise) so the admin promotion path can refuse to
// promote a user who has no profile at all (#554). A 409 means the suspension
// is admin-owned and must not be self-lifted (#550).
export async function reactivateProviderProfile(
  userId: string
): Promise<boolean> {
  const res = await s2s(
    PROVIDER_SERVICE_URL,
    `/internal/providers/by-user/${encodeURIComponent(userId)}/reactivate`,
    { method: "POST" }
  );
  if (res.status === 409) {
    throw new ProviderAdminSuspendedError();
  }
  if (!res.ok) {
    throw new Error(`provider-service responded ${res.status}`);
  }
  const data = (await res.json()) as { reactivated: boolean };
  return data.reactivated;
}

export type ProviderSummary = {
  id: string;
  contactName: string;
  contactPhone: string | null;
  suspended: boolean;
};

// Batch hydration for admin user detail (#220): provider names/phones behind
// a user's favorites. Degrades to an empty map on any S2S failure so the
// admin page still renders (just without provider names).
export async function fetchProvidersByIds(
  ids: string[]
): Promise<Map<string, ProviderSummary>> {
  if (ids.length === 0) return new Map();
  try {
    const res = await s2s(
      PROVIDER_SERVICE_URL,
      `/internal/providers?ids=${ids.map(encodeURIComponent).join(",")}`
    );
    if (!res.ok) return new Map();
    const data = (await res.json()) as { providers: ProviderSummary[] };
    return new Map(data.providers.map((p) => [p.id, p]));
  } catch (e) {
    log.error("batch provider lookup failed", { context: "providers", err: e });
    return new Map();
  }
}

export type ProviderRegistration = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  category: string;
  headline: string;
  bio: string;
  district: string;
  serviceDistricts: string[];
  city: string;
  experience: number;
  whatsapp: string | null;
  phone2: string | null;
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
  website: string | null;
  services: {
    title: string;
    description?: string;
    price: number;
    priceType: string;
  }[];
};

// Registration compensation (#359): erase any Provider row provider-service
// may have committed for this user. createProviderProfile throwing is
// ambiguous — the create may have succeeded and only its *response* was lost
// (a timeout), leaving a committed Provider whose userId dangles once the
// just-created user is rolled back. This fires the idempotent
// POST /internal/users/:id/erase (a no-op when nothing was committed) so no
// orphan survives. Write-path helper — throws on failure like the others; the
// caller (register) invokes it best-effort so an upstream blip can't escalate
// the graceful 502 into a 500.
export async function eraseProviderProfile(userId: string): Promise<void> {
  const res = await s2s(
    PROVIDER_SERVICE_URL,
    `/internal/users/${encodeURIComponent(userId)}/erase`,
    { method: "POST", body: "{}" }
  );
  if (!res.ok) {
    throw new Error(`provider-service responded ${res.status}`);
  }
}

// Register orchestration: creates the provider profile (+services) in
// provider-service. Throws on failure — the caller compensates by deleting
// the just-created user and returning 502.
export async function createProviderProfile(
  input: ProviderRegistration
): Promise<string> {
  const res = await s2s(PROVIDER_SERVICE_URL, "/internal/providers", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`provider-service responded ${res.status}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}
