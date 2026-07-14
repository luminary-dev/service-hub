// Saved-search new-match alerting (#516) — the reverse direction of the
// new-job fan-out (#501). When a provider profile is newly published, ask
// identity-service for the saved searches it could match (category/district
// scoping, cooldown, verified-email + customer-role gates all applied there),
// evaluate any free-text query against the committed row with the same
// where-clause browse uses, then hand the recipient list to
// notification-service's event ingestion (which writes the in-app rows,
// queues the emails behind per-user preferences and acks 202 before any send,
// #557/#394). Entirely best-effort: the profile create already committed, so
// every failure here is logged and swallowed.
import { db } from "../db";
import { s2s } from "./http";
import { log } from "./log";
import { buildBrowseWhere } from "./search";

const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4001";
const NOTIFICATION_URL =
  process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4005";

// Mirrors the new-job fan-out cap (and notification-service's recipient bound).
const MAX_ALERT_RECIPIENTS = 200;
// Bound on the per-create query evaluations; searches beyond it are skipped
// (never falsely matched) and the overflow is logged.
const MAX_QUERY_CHECKS = 50;

type Candidate = {
  id: string;
  userId: string;
  query: string | null;
  locale: string;
  email: string;
};

export type NewProviderAlert = {
  id: string;
  userId: string;
  contactName: string;
  category: string;
  // Primary (base) district — what cards and the alert email display.
  district: string;
  // Full served set (#502 multi-district): primary + serviceDistricts.
  // Candidate scoping matches a saved search on ANY served district.
  serviceDistricts: string[];
};

// Does the new provider appear in a browse for `q`? One indexed findFirst
// pinned to the new row, with the category-label resolution the public browse
// route performs (so a saved query like "mechanic" matches by label too).
async function matchesQuery(providerId: string, q: string): Promise<boolean> {
  const categorySlugs = (
    await db.category.findMany({
      where: {
        OR: [
          { labelEn: { contains: q, mode: "insensitive" } },
          { labelSi: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { slug: true },
    })
  ).map((r) => r.slug);
  const hit = await db.provider.findFirst({
    where: { AND: [{ id: providerId }, buildBrowseWhere({ q, categorySlugs })] },
    select: { id: true },
  });
  return hit !== null;
}

export async function notifySavedSearchMatches(
  provider: NewProviderAlert,
  origin: string
): Promise<void> {
  try {
    const res = await s2s(
      IDENTITY_URL,
      `/internal/saved-searches/candidates?category=${encodeURIComponent(
        provider.category
      )}&districts=${encodeURIComponent(
        provider.serviceDistricts.join(",")
      )}&excludeUserId=${encodeURIComponent(provider.userId)}`
    );
    if (!res.ok) {
      throw new Error(`saved-search candidates lookup failed: ${res.status}`);
    }
    const { savedSearches } = (await res.json()) as {
      savedSearches: Candidate[];
    };
    if (savedSearches.length === 0) return;

    // Evaluate each distinct free-text query once; identical queries across
    // users share the verdict. Case-folded — buildSearchWhere matches
    // case-insensitively anyway.
    const distinct = [
      ...new Set(
        savedSearches
          .map((s) => s.query?.trim().toLowerCase())
          .filter((q): q is string => !!q)
      ),
    ];
    if (distinct.length > MAX_QUERY_CHECKS) {
      log.warn("saved-search alert hit the query-check cap — extra queries skipped", {
        cap: MAX_QUERY_CHECKS,
        distinct: distinct.length,
      });
    }
    const verdicts = new Map<string, boolean>();
    for (const q of distinct.slice(0, MAX_QUERY_CHECKS)) {
      verdicts.set(q, await matchesQuery(provider.id, q));
    }

    const matched = savedSearches.filter((s) => {
      const q = s.query?.trim().toLowerCase();
      // Category/district already matched by the candidates query itself.
      if (!q) return true;
      return verdicts.get(q) === true;
    });
    if (matched.length === 0) return;

    // One ingestion call: notification-service dedupes by userId, writes the
    // in-app rows and queues one email per recipient — each carrying the
    // locale its search was created under. Only searches whose owner actually
    // made the batch are stamped notified, so a capped-out search stays
    // eligible. The raw s2s (not the swallowing emitNotification helper) is
    // deliberate: a thrown send failure must skip the cooldown stamp below.
    const recipients: { userId: string; email: string; locale: "en" | "si" }[] = [];
    const accepted = new Set<string>();
    const notifiedIds: string[] = [];
    for (const s of matched) {
      if (!accepted.has(s.userId)) {
        if (accepted.size >= MAX_ALERT_RECIPIENTS) continue;
        accepted.add(s.userId);
        recipients.push({
          userId: s.userId,
          email: s.email,
          locale: s.locale === "si" ? "si" : "en",
        });
      }
      notifiedIds.push(s.id);
    }

    // #636: the cooldown stamp below marks these searches "already alerted for
    // this window", so it must run ONLY after the notification actually landed.
    // The raw s2s returns a Response even on a 4xx/5xx (it never throws for a
    // non-ok status), so an unchecked call would stamp the cooldown even when
    // the ingestion was rejected — burning the alert with nothing delivered.
    // Throw on a non-ok status so the catch below skips the stamp, matching the
    // comment intent above.
    const eventsRes = await s2s(NOTIFICATION_URL, "/internal/notifications/events", {
      method: "POST",
      headers: { "x-origin": origin },
      body: JSON.stringify({
        type: "SAVED_SEARCH_MATCH",
        recipients,
        payload: {
          providerName: provider.contactName,
          district: provider.district,
        },
        link: `/providers/${provider.id}`,
      }),
    });
    if (!eventsRes.ok) {
      throw new Error(`saved-search notification ingestion failed: ${eventsRes.status}`);
    }

    // Only stamp the cooldown once the send is confirmed accepted. A failure
    // here logs (below) but the notification already landed, so the worst case
    // is a duplicate alert on the next matching publish — acceptable, and far
    // better than the reverse (a burned cooldown with nothing delivered).
    const notifiedRes = await s2s(IDENTITY_URL, "/internal/saved-searches/notified", {
      method: "POST",
      body: JSON.stringify({ ids: notifiedIds }),
    });
    if (!notifiedRes.ok) {
      throw new Error(`saved-search cooldown stamp failed: ${notifiedRes.status}`);
    }
  } catch (e) {
    log.error("saved-search alert fan-out failed", {
      context: "saved-search-alerts",
      err: e,
    });
  }
}
