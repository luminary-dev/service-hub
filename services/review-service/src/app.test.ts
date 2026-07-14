// Contract tests for review-service's /internal/* endpoints (#260): the
// internal-secret auth guard plus the response shape each sibling consumes
// (provider-service batches ratings + reviews here). Prisma and the media
// storage helper are mocked — this is the HTTP contract, not a live DB test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    review: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    reviewPhoto: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("./db", () => ({ db: dbMock }));
// Search-index rating pushes (search RFC) are fired (not awaited) from the
// review write/erase paths.
vi.mock("./lib/search-index", () => ({
  pushRatingsToSearchIndex: vi.fn(() => Promise.resolve()),
}));
vi.mock("./lib/storage", () => ({
  removeStoredFile: vi.fn().mockResolvedValue(undefined),
  sweepMedia: vi.fn().mockResolvedValue({ removed: 0, kept: 0 }),
}));

import { app } from "./app";

const SECRET = "dev-internal-secret";

function req(path: string, init: RequestInit = {}, withSecret = true) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (withSecret) headers["x-internal-secret"] = SECRET;
  return app.request(path, { ...init, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("internal secret enforcement", () => {
  it("rejects GET /internal/ratings without the secret", async () => {
    const res = await req("/internal/ratings?providerIds=p1", {}, false);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("rejects a wrong secret", async () => {
    const res = await req(
      "/internal/ratings?providerIds=p1",
      { headers: { "x-internal-secret": "wrong" } },
      false
    );
    expect(res.status).toBe(403);
  });

  it("rejects POST /internal/users/:id/erase without the secret", async () => {
    const res = await req("/internal/users/u1/erase", { method: "POST" }, false);
    expect(res.status).toBe(403);
  });
});

describe("GET /internal/ratings (batch summaries)", () => {
  it("returns each provider's overall average+count, dimension averages and star distribution", async () => {
    // Two grouped queries back the summary (#528): the overall averages +
    // per-dimension averages + count, and the per-star histogram.
    dbMock.review.groupBy.mockImplementation(async (args: { by: string[] }) => {
      if (args.by.includes("rating")) {
        return [
          { providerId: "p1", rating: 5, _count: { _all: 1 } },
          { providerId: "p1", rating: 4, _count: { _all: 1 } },
        ];
      }
      return [
        {
          providerId: "p1",
          _avg: {
            rating: 4.5,
            quality: 5,
            punctuality: 4,
            value: null,
            communication: 4.5,
          },
          _count: { _all: 2 },
        },
      ];
    });
    const res = await req("/internal/ratings?providerIds=p1,p2");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ratings: {
        p1: {
          rating: 4.5,
          count: 2,
          dimensions: { quality: 5, punctuality: 4, value: null, communication: 4.5 },
          distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 },
        },
      },
    });
  });

  it("returns { ratings: {} } without querying when no ids are given", async () => {
    const res = await req("/internal/ratings");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ratings: {} });
    expect(dbMock.review.groupBy).not.toHaveBeenCalled();
  });
});

describe("GET /internal/by-provider/:id", () => {
  it("returns { reviews, nextCursor } for a valid request", async () => {
    dbMock.review.findMany.mockResolvedValue([]);
    const res = await req("/internal/by-provider/p1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reviews: [], nextCursor: null });
  });
});

describe("GET /internal/count", () => {
  it("returns { count }", async () => {
    dbMock.review.count.mockResolvedValue(7);
    const res = await req("/internal/count");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 7 });
  });
});

describe("POST /internal/users/:id/erase", () => {
  it("returns { ok: true } and fans out the deletion", async () => {
    dbMock.reviewPhoto.findMany.mockResolvedValue([]);
    dbMock.review.findMany.mockResolvedValue([]);
    dbMock.review.deleteMany.mockResolvedValue({ count: 0 });
    const res = await req("/internal/users/u1/erase", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMock.review.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });
});
