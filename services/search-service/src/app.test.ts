// Contract tests for search-service's HTTP surface: the internal-secret auth
// guard, the ingestion endpoints' shapes (provider-service and review-service
// push here fire-and-forget, so a silent contract break would only surface as
// index drift), and the public query envelope. Prisma and the S2S clients are
// mocked — this is the HTTP contract, not a live DB test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, clientsMock } = vi.hoisted(() => ({
  dbMock: {
    providerIndex: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
  clientsMock: {
    fetchCards: vi.fn(),
    matchCategorySlugs: vi.fn(async () => []),
    __resetCategoryCache: vi.fn(),
    fetchExportPage: vi.fn(),
    fetchRatings: vi.fn(),
  },
}));

vi.mock("./db", () => ({ db: dbMock }));
vi.mock("./lib/clients", () => clientsMock);

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

const doc = {
  userId: "user_1",
  contactName: "Nuwan Perera",
  category: "mechanic",
  headline: "Honest auto repairs",
  bio: "A long enough bio for the index.",
  headlineSi: null,
  bioSi: null,
  city: "Colombo",
  district: "Colombo",
  serviceDistricts: ["Colombo", "Gampaha"],
  serviceTitles: ["Brake inspection"],
  servicePrices: [2500],
  available: true,
  awayUntil: null,
  verificationStatus: "VERIFIED",
  experience: 5,
  latitude: 6.9271,
  longitude: 79.8612,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("internal secret enforcement", () => {
  it("rejects the public search without the secret (gateway adds it)", async () => {
    const res = await req("/api/search/providers", {}, false);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("rejects an index push without the secret", async () => {
    const res = await req(
      "/internal/search/providers/p1",
      { method: "PUT", body: JSON.stringify(doc) },
      false
    );
    expect(res.status).toBe(403);
  });

  it("rejects a wrong secret", async () => {
    const res = await req(
      "/internal/search/stats",
      { headers: { "x-internal-secret": "wrong" } },
      false
    );
    expect(res.status).toBe(403);
  });
});

describe("PUT /internal/search/providers/:id", () => {
  it("upserts a valid full document", async () => {
    dbMock.providerIndex.updateMany.mockResolvedValue({ count: 1 });
    const res = await req("/internal/search/providers/p1", {
      method: "PUT",
      body: JSON.stringify(doc),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMock.providerIndex.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { providerId: "p1", updatedAt: { lte: new Date(doc.updatedAt) } },
        data: expect.objectContaining({
          contactName: "Nuwan Perera",
          minPrice: 2500,
          serviceDistricts: ["Colombo", "Gampaha"],
        }),
      })
    );
  });

  it("creates the row when none exists, with zeroed rating aggregates", async () => {
    dbMock.providerIndex.updateMany.mockResolvedValue({ count: 0 });
    dbMock.providerIndex.findUnique.mockResolvedValue(null);
    dbMock.providerIndex.create.mockResolvedValue({});
    const res = await req("/internal/search/providers/p1", {
      method: "PUT",
      body: JSON.stringify(doc),
    });
    expect(res.status).toBe(200);
    expect(dbMock.providerIndex.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerId: "p1",
          ratingAvg: null,
          ratingCount: 0,
        }),
      })
    );
  });

  it("drops a stale push over a fresher row (last-write-wins)", async () => {
    dbMock.providerIndex.updateMany.mockResolvedValue({ count: 0 });
    dbMock.providerIndex.findUnique.mockResolvedValue({ providerId: "p1" });
    const res = await req("/internal/search/providers/p1", {
      method: "PUT",
      body: JSON.stringify(doc),
    });
    expect(res.status).toBe(200);
    expect(dbMock.providerIndex.create).not.toHaveBeenCalled();
  });

  it("rejects a malformed document", async () => {
    const res = await req("/internal/search/providers/p1", {
      method: "PUT",
      body: JSON.stringify({ userId: "u1" }),
    });
    expect(res.status).toBe(400);
    expect(dbMock.providerIndex.updateMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /internal/search/providers/:id", () => {
  it("is idempotent (deleting an unindexed id is a no-op 200)", async () => {
    dbMock.providerIndex.deleteMany.mockResolvedValue({ count: 0 });
    const res = await req("/internal/search/providers/p1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMock.providerIndex.deleteMany).toHaveBeenCalledWith({
      where: { providerId: "p1" },
    });
  });
});

describe("POST /internal/search/ratings", () => {
  it("patches the aggregates, nulling the average at zero reviews", async () => {
    dbMock.providerIndex.updateMany.mockResolvedValue({ count: 1 });
    const res = await req("/internal/search/ratings", {
      method: "POST",
      body: JSON.stringify({ providerId: "p1", ratingAvg: 4.5, ratingCount: 0 }),
    });
    expect(res.status).toBe(200);
    expect(dbMock.providerIndex.updateMany).toHaveBeenCalledWith({
      where: { providerId: "p1" },
      data: { ratingAvg: null, ratingCount: 0 },
    });
  });

  it("rejects a malformed patch", async () => {
    const res = await req("/internal/search/ratings", {
      method: "POST",
      body: JSON.stringify({ providerId: "p1", ratingAvg: 9, ratingCount: 1 }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /internal/search/stats", () => {
  it("returns the index + pinned counts", async () => {
    dbMock.providerIndex.count.mockResolvedValueOnce(6).mockResolvedValueOnce(2);
    const res = await req("/internal/search/stats");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ indexed: 6, pinned: 2 });
  });
});

describe("GET /api/search/providers", () => {
  it("returns the browse envelope with index-owned ratings overlaid on hydrated cards", async () => {
    dbMock.$queryRaw
      .mockResolvedValueOnce([
        { providerId: "p1", ratingAvg: 4.5, ratingCount: 2, distanceM: null },
      ])
      .mockResolvedValueOnce([{ count: 1 }]);
    clientsMock.fetchCards.mockResolvedValue([
      { id: "p1", name: "Nuwan Perera", rating: null, reviewCount: 0 },
    ]);
    const res = await req("/api/search/providers?category=mechanic");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      providers: [
        { id: "p1", name: "Nuwan Perera", rating: 4.5, reviewCount: 2 },
      ],
      total: 1,
      page: 1,
      pageSize: 12,
    });
    // No geo params → no distanceKm key at all.
    expect("distanceKm" in body.providers[0]).toBe(false);
  });

  it("adds distanceKm (1-decimal km) when the request carries a point", async () => {
    dbMock.$queryRaw
      .mockResolvedValueOnce([
        { providerId: "p1", ratingAvg: null, ratingCount: 0, distanceM: 3260 },
      ])
      .mockResolvedValueOnce([{ count: 1 }]);
    clientsMock.fetchCards.mockResolvedValue([
      { id: "p1", name: "Nuwan Perera", rating: null, reviewCount: 0 },
    ]);
    const res = await req("/api/search/providers?lat=6.9&lng=79.86");
    const body = await res.json();
    expect(body.providers[0].distanceKm).toBe(3.3);
  });

  it("fails loudly (503) when card hydration is down", async () => {
    dbMock.$queryRaw
      .mockResolvedValueOnce([
        { providerId: "p1", ratingAvg: null, ratingCount: 0, distanceM: null },
      ])
      .mockResolvedValueOnce([{ count: 1 }]);
    clientsMock.fetchCards.mockResolvedValue(null);
    const res = await req("/api/search/providers");
    expect(res.status).toBe(503);
  });

  it("drops an index row whose card vanished between rank and hydration", async () => {
    dbMock.$queryRaw
      .mockResolvedValueOnce([
        { providerId: "gone", ratingAvg: null, ratingCount: 0, distanceM: null },
      ])
      .mockResolvedValueOnce([{ count: 1 }]);
    clientsMock.fetchCards.mockResolvedValue([]);
    const res = await req("/api/search/providers");
    const body = await res.json();
    expect(body.providers).toEqual([]);
    expect(body.total).toBe(1);
  });
});

describe("GET /api/search/providers/nearby", () => {
  it("requires lat and lng", async () => {
    const res = await req("/api/search/providers/nearby?lat=6.9");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "lat and lng are required" });
  });

  it("returns nearest-first with distances", async () => {
    dbMock.$queryRaw
      .mockResolvedValueOnce([
        { providerId: "p1", ratingAvg: 5, ratingCount: 1, distanceM: 950 },
      ])
      .mockResolvedValueOnce([{ count: 1 }]);
    clientsMock.fetchCards.mockResolvedValue([
      { id: "p1", name: "Nuwan Perera", rating: null, reviewCount: 0 },
    ]);
    const res = await req("/api/search/providers/nearby?lat=6.9&lng=79.86");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providers[0].distanceKm).toBe(1);
    expect(body.providers[0].rating).toBe(5);
  });
});
