// Cross-service hydration helpers shared by the public and admin job routes.
// Both degrade gracefully: on any failure they return an empty map and
// callers fall back to "Unknown" rather than failing the whole request.
import { s2s } from "./http";
import { log } from "./log";
import { capBatchIds } from "./query";

const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4001";
const PROVIDER_URL = process.env.PROVIDER_SERVICE_URL ?? "http://localhost:4002";

// Batch user hydration from identity-service.
export async function fetchUsers(
  ids: string[]
): Promise<Map<string, { name: string; email: string }>> {
  const map = new Map<string, { name: string; email: string }>();
  const batch = capBatchIds(ids);
  if (batch.length === 0) return map;
  try {
    const res = await s2s(IDENTITY_URL, `/internal/users?ids=${batch.join(",")}`);
    if (!res.ok) return map;
    const data = (await res.json()) as {
      users: { id: string; name: string; email: string }[];
    };
    for (const u of data.users) map.set(u.id, { name: u.name, email: u.email });
  } catch (e) {
    log.error("user hydration failed", { context: "jobs", err: e });
  }
  return map;
}

// Batch provider hydration from provider-service (contact name/phone).
export async function fetchProviders(
  ids: string[]
): Promise<Map<string, { contactName: string | null; contactPhone: string | null }>> {
  const map = new Map<string, { contactName: string | null; contactPhone: string | null }>();
  const batch = capBatchIds(ids);
  if (batch.length === 0) return map;
  try {
    const res = await s2s(PROVIDER_URL, `/internal/providers?ids=${batch.join(",")}`);
    if (!res.ok) return map;
    const data = (await res.json()) as {
      providers: { id: string; contactName: string | null; contactPhone: string | null }[];
    };
    for (const p of data.providers) {
      map.set(p.id, { contactName: p.contactName, contactPhone: p.contactPhone });
    }
  } catch (e) {
    log.error("provider hydration failed", { context: "jobs", err: e });
  }
  return map;
}
