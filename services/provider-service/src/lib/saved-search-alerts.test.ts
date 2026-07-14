// Unit tests for the saved-search new-match fan-out (#516): candidate fetch,
// free-text query evaluation against the committed row, the single batched
// notification event (per-recipient locale, userId dedupe) and cooldown
// bookkeeping — all best-effort.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifySavedSearchMatches } from "./saved-search-alerts";
import { s2s } from "./http";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    category: { findMany: vi.fn() },
    provider: { findFirst: vi.fn() },
  },
}));

vi.mock("../db", () => ({ db: dbMock }));
vi.mock("./http", () => ({ s2s: vi.fn() }));

const s2sMock = vi.mocked(s2s);

const PROVIDER = {
  id: "prov1",
  userId: "owner-1",
  contactName: "Nimal Perera",
  category: "electrician",
  district: "Colombo",
  serviceDistricts: ["Colombo"],
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.category.findMany.mockResolvedValue([]);
});

describe("notifySavedSearchMatches", () => {
  it("asks identity for candidates scoped to the new provider", async () => {
    s2sMock.mockResolvedValueOnce(jsonResponse({ savedSearches: [] }));

    await notifySavedSearchMatches(PROVIDER, "https://baas.lk");

    expect(s2sMock).toHaveBeenCalledTimes(1);
    expect(s2sMock).toHaveBeenCalledWith(
      expect.any(String),
      "/internal/saved-searches/candidates?category=electrician&districts=Colombo&excludeUserId=owner-1"
    );
  });

  // Multi-district service areas (#502): candidate scoping covers EVERY
  // served district, so a provider based in Colombo serving Gampaha alerts a
  // Gampaha saved search too.
  it("passes the full served district set to the candidate lookup", async () => {
    s2sMock.mockResolvedValueOnce(jsonResponse({ savedSearches: [] }));

    await notifySavedSearchMatches(
      { ...PROVIDER, serviceDistricts: ["Colombo", "Gampaha", "Nuwara Eliya"] },
      "https://baas.lk"
    );

    expect(s2sMock).toHaveBeenCalledWith(
      expect.any(String),
      "/internal/saved-searches/candidates?category=electrician" +
        `&districts=${encodeURIComponent("Colombo,Gampaha,Nuwara Eliya")}` +
        "&excludeUserId=owner-1"
    );
  });

  it("notifies query-less matches in one event, dedupes owners and stamps the cooldown", async () => {
    s2sMock
      .mockResolvedValueOnce(
        jsonResponse({
          savedSearches: [
            { id: "s1", userId: "u1", query: null, locale: "en", email: "a@b.lk" },
            { id: "s2", userId: "u2", query: null, locale: "si", email: "c@d.lk" },
            // Same owner as s1: one recipient, both searches stamped.
            { id: "s3", userId: "u1", query: null, locale: "en", email: "a@b.lk" },
          ],
        })
      )
      .mockResolvedValue(jsonResponse({ ok: true }));

    await notifySavedSearchMatches(PROVIDER, "https://baas.lk");

    const notifyCalls = s2sMock.mock.calls.filter(
      ([, path]) => path === "/internal/notifications/events"
    );
    expect(notifyCalls).toHaveLength(1);
    const [, , init] = notifyCalls[0];
    // The origin rides as x-origin so the email channel can build absolute
    // links; the event's own link stays relative.
    expect(init?.headers).toEqual({ "x-origin": "https://baas.lk" });
    expect(JSON.parse(String(init?.body))).toEqual({
      type: "SAVED_SEARCH_MATCH",
      recipients: [
        { userId: "u1", email: "a@b.lk", locale: "en" },
        { userId: "u2", email: "c@d.lk", locale: "si" },
      ],
      payload: { providerName: "Nimal Perera", district: "Colombo" },
      link: "/providers/prov1",
    });

    const notified = s2sMock.mock.calls.find(
      ([, path]) => path === "/internal/saved-searches/notified"
    );
    expect(JSON.parse(String(notified?.[2]?.body))).toEqual({
      ids: ["s1", "s2", "s3"],
    });
  });

  it("evaluates free-text queries with the browse where-clause pinned to the new row", async () => {
    s2sMock
      .mockResolvedValueOnce(
        jsonResponse({
          savedSearches: [
            { id: "s1", userId: "u1", query: "wiring", locale: "en", email: "a@b.lk" },
            { id: "s2", userId: "u2", query: "plumber", locale: "en", email: "c@d.lk" },
          ],
        })
      )
      .mockResolvedValue(jsonResponse({ ok: true }));
    // "wiring" matches the new provider, "plumber" does not.
    dbMock.provider.findFirst.mockImplementation(({ where }) => {
      const q = JSON.stringify(where);
      return Promise.resolve(q.includes("wiring") ? { id: "prov1" } : null);
    });

    await notifySavedSearchMatches(PROVIDER, "https://baas.lk");

    expect(dbMock.provider.findFirst).toHaveBeenCalledTimes(2);
    // Every query check is pinned to the newly created provider id.
    for (const [args] of dbMock.provider.findFirst.mock.calls) {
      expect(args.where.AND[0]).toEqual({ id: "prov1" });
    }
    const notifyCalls = s2sMock.mock.calls.filter(
      ([, path]) => path === "/internal/notifications/events"
    );
    expect(notifyCalls).toHaveLength(1);
    expect(JSON.parse(String(notifyCalls[0][2]?.body)).recipients).toEqual([
      { userId: "u1", email: "a@b.lk", locale: "en" },
    ]);
    const notified = s2sMock.mock.calls.find(
      ([, path]) => path === "/internal/saved-searches/notified"
    );
    expect(JSON.parse(String(notified?.[2]?.body))).toEqual({ ids: ["s1"] });
  });

  it("sends nothing when no candidate matches", async () => {
    s2sMock.mockResolvedValueOnce(
      jsonResponse({
        savedSearches: [
          { id: "s1", userId: "u1", query: "plumber", locale: "en", email: "a@b.lk" },
        ],
      })
    );
    dbMock.provider.findFirst.mockResolvedValue(null);

    await notifySavedSearchMatches(PROVIDER, "https://baas.lk");

    expect(s2sMock).toHaveBeenCalledTimes(1);
  });

  it("swallows and logs an identity outage (best-effort)", async () => {
    s2sMock.mockResolvedValueOnce(jsonResponse({}, false));

    await expect(
      notifySavedSearchMatches(PROVIDER, "https://baas.lk")
    ).resolves.toBeUndefined();
    expect(s2sMock).toHaveBeenCalledTimes(1);
  });

  it("swallows a network error entirely", async () => {
    s2sMock.mockRejectedValueOnce(new Error("boom"));

    await expect(
      notifySavedSearchMatches(PROVIDER, "https://baas.lk")
    ).resolves.toBeUndefined();
  });

  // #636: s2s resolves (never throws) on a non-ok status, so the cooldown
  // stamp must be gated on `res.ok` — otherwise a rejected ingestion would
  // burn the cooldown with nothing delivered. A failed events POST must skip
  // the `notified` call entirely.
  it("does not stamp the cooldown when notification ingestion fails", async () => {
    s2sMock
      .mockResolvedValueOnce(
        jsonResponse({
          savedSearches: [
            { id: "s1", userId: "u1", query: null, locale: "en", email: "a@b.lk" },
          ],
        })
      )
      // The events POST comes back non-ok (e.g. notification-service 5xx).
      .mockResolvedValueOnce(jsonResponse({}, false));

    await expect(
      notifySavedSearchMatches(PROVIDER, "https://baas.lk")
    ).resolves.toBeUndefined();

    const eventsCalled = s2sMock.mock.calls.some(
      ([, path]) => path === "/internal/notifications/events"
    );
    const notifiedCalled = s2sMock.mock.calls.some(
      ([, path]) => path === "/internal/saved-searches/notified"
    );
    expect(eventsCalled).toBe(true);
    expect(notifiedCalled).toBe(false);
  });
});
