// Unit tests for the saved-search new-match fan-out (#516): candidate fetch,
// free-text query evaluation against the committed row, per-locale batching,
// email dedupe and cooldown bookkeeping — all best-effort.
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
      "/internal/saved-searches/candidates?category=electrician&district=Colombo&excludeUserId=owner-1"
    );
  });

  it("emails query-less matches per locale, dedupes addresses and stamps the cooldown", async () => {
    s2sMock
      .mockResolvedValueOnce(
        jsonResponse({
          savedSearches: [
            { id: "s1", query: null, locale: "en", email: "A@b.lk" },
            { id: "s2", query: null, locale: "si", email: "c@d.lk" },
            // Same address as s1 (different case): one email, both stamped.
            { id: "s3", query: null, locale: "en", email: "a@B.lk" },
          ],
        })
      )
      .mockResolvedValue(jsonResponse({ ok: true }));

    await notifySavedSearchMatches(PROVIDER, "https://baas.lk");

    const notifyCalls = s2sMock.mock.calls.filter(
      ([, path]) => path === "/internal/email/new-provider-match"
    );
    expect(notifyCalls).toHaveLength(2);
    const bodies = notifyCalls.map(([, , init]) =>
      JSON.parse(String(init?.body))
    );
    expect(bodies).toContainEqual({
      recipients: ["a@b.lk"],
      url: "https://baas.lk/providers/prov1",
      providerName: "Nimal Perera",
      district: "Colombo",
      locale: "en",
    });
    expect(bodies).toContainEqual(
      expect.objectContaining({ recipients: ["c@d.lk"], locale: "si" })
    );

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
            { id: "s1", query: "wiring", locale: "en", email: "a@b.lk" },
            { id: "s2", query: "plumber", locale: "en", email: "c@d.lk" },
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
      ([, path]) => path === "/internal/email/new-provider-match"
    );
    expect(notifyCalls).toHaveLength(1);
    expect(JSON.parse(String(notifyCalls[0][2]?.body)).recipients).toEqual([
      "a@b.lk",
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
          { id: "s1", query: "plumber", locale: "en", email: "a@b.lk" },
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
});
