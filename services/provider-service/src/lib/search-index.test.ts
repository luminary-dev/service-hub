// Search-index sync (search RFC §4.2): the document shape pushed to
// search-service, the push/delete decision (suspended or missing rows are
// DELETED — the index only holds public rows), and the best-effort contract
// (every failure is logged and swallowed, never thrown to the caller whose
// write already committed).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { dbMock } = vi.hoisted(() => ({
  dbMock: { provider: { findUnique: vi.fn() } },
}));

vi.mock("../db", () => ({ db: dbMock }));

import {
  buildIndexDocument,
  deleteProviderIndex,
  syncProviderIndex,
  syncProviderIndexByUser,
} from "./search-index";

const fetchMock = vi.fn();

const provider = {
  id: "p1",
  userId: "user_1",
  contactName: "Nuwan Perera",
  contactEmail: "nuwan@example.com",
  contactPhone: "0771234501",
  category: "mechanic",
  headline: "Honest auto repairs",
  bio: "A long bio.",
  headlineSi: null,
  bioSi: null,
  city: "Colombo",
  district: "Colombo",
  serviceDistricts: ["Colombo", "Gampaha"],
  latitude: 6.9271,
  longitude: 79.8612,
  experience: 5,
  available: true,
  awayUntil: null,
  suspended: false,
  verificationStatus: "VERIFIED",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-07-01T00:00:00Z"),
  services: [
    { title: "Brake inspection", price: new Prisma.Decimal(2500) },
    { title: "Engine tune-up", price: new Prisma.Decimal(8000) },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildIndexDocument", () => {
  it("carries the indexed fields and no contact PII beyond the display name", () => {
    const doc = buildIndexDocument(provider);
    expect(doc).toMatchObject({
      userId: "user_1",
      contactName: "Nuwan Perera",
      serviceTitles: ["Brake inspection", "Engine tune-up"],
      servicePrices: [2500, 8000],
      latitude: 6.9271,
      longitude: 79.8612,
    });
    expect(JSON.stringify(doc)).not.toContain("nuwan@example.com");
    expect(JSON.stringify(doc)).not.toContain("0771234501");
  });
});

describe("syncProviderIndex", () => {
  it("PUTs the full document for a public row", async () => {
    dbMock.provider.findUnique.mockResolvedValue(provider);
    await syncProviderIndex("p1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/internal/search/providers/p1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body).contactName).toBe("Nuwan Perera");
  });

  it("DELETEs the document for a suspended row", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ ...provider, suspended: true });
    await syncProviderIndex("p1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/internal/search/providers/p1");
    expect(init.method).toBe("DELETE");
  });

  it("DELETEs the document for a missing row", async () => {
    dbMock.provider.findUnique.mockResolvedValue(null);
    await syncProviderIndex("p1");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("swallows push failures (best-effort — the caller's write committed)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(provider);
    fetchMock.mockRejectedValue(new Error("search down"));
    await expect(syncProviderIndex("p1")).resolves.toBeUndefined();
  });
});

describe("syncProviderIndexByUser", () => {
  it("resolves the provider id then syncs", async () => {
    dbMock.provider.findUnique
      .mockResolvedValueOnce({ id: "p1" })
      .mockResolvedValueOnce(provider);
    await syncProviderIndexByUser("user_1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is a no-op for a user without a provider", async () => {
    dbMock.provider.findUnique.mockResolvedValue(null);
    await syncProviderIndexByUser("user_x");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("deleteProviderIndex", () => {
  it("issues the delete and swallows failures", async () => {
    await deleteProviderIndex("p1");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    fetchMock.mockRejectedValue(new Error("search down"));
    await expect(deleteProviderIndex("p1")).resolves.toBeUndefined();
  });
});
