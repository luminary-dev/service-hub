// Search-index rating push (search RFC §4.2): recompute over non-deleted
// reviews, push one patch per provider, dedupe ids, and never throw — the
// review write that triggered the push already committed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: { review: { groupBy: vi.fn() } },
}));

vi.mock("../db", () => ({ db: dbMock }));

import { pushRatingsToSearchIndex } from "./search-index";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pushRatingsToSearchIndex", () => {
  it("pushes the recomputed aggregate for a reviewed provider", async () => {
    dbMock.review.groupBy.mockResolvedValue([
      { providerId: "p1", _avg: { rating: 4.5 }, _count: { _all: 2 } },
    ]);
    await pushRatingsToSearchIndex(["p1"]);
    expect(dbMock.review.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { providerId: { in: ["p1"] }, deletedAt: null },
      })
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/internal/search/ratings");
    expect(JSON.parse(init.body)).toEqual({
      providerId: "p1",
      ratingAvg: 4.5,
      ratingCount: 2,
    });
  });

  it("pushes null/0 for a provider whose last review just disappeared", async () => {
    dbMock.review.groupBy.mockResolvedValue([]);
    await pushRatingsToSearchIndex(["p1"]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      providerId: "p1",
      ratingAvg: null,
      ratingCount: 0,
    });
  });

  it("dedupes ids and skips empty input without querying", async () => {
    dbMock.review.groupBy.mockResolvedValue([]);
    await pushRatingsToSearchIndex(["p1", "p1", ""]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await pushRatingsToSearchIndex([]);
    expect(dbMock.review.groupBy).toHaveBeenCalledTimes(1);
  });

  it("swallows failures (best-effort — the review write committed)", async () => {
    dbMock.review.groupBy.mockResolvedValue([]);
    fetchMock.mockRejectedValue(new Error("search down"));
    await expect(pushRatingsToSearchIndex(["p1"])).resolves.toBeUndefined();
  });
});
