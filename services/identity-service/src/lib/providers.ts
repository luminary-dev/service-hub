// S2S helpers against provider-service.
import { s2s } from "./http";
import { log } from "./log";

const PROVIDER_SERVICE_URL =
  process.env.PROVIDER_SERVICE_URL ?? "http://localhost:4002";

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

// Existence check for favorites. Only a 404 means "no such provider"; any
// other non-ok status is an upstream failure and must throw so the caller
// returns 502 (writes fail loudly) rather than a misleading 404 that silently
// drops the favorite when provider-service is merely degraded.
export async function providerExists(providerId: string): Promise<boolean> {
  const res = await s2s(
    PROVIDER_SERVICE_URL,
    `/internal/providers/${encodeURIComponent(providerId)}/summary`
  );
  if (res.status === 404) return false;
  if (!res.ok) {
    throw new Error(`provider summary lookup failed: ${res.status}`);
  }
  return true;
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
