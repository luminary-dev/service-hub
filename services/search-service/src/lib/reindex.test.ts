// Sweep behavior (RFC §4.2): walk every export page, upsert + rate everything
// seen, delete what the source no longer exports, and fail loudly on a peer
// outage instead of mistaking it for an empty source.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, clientsMock, documentsMock } = vi.hoisted(() => ({
  dbMock: {
    providerIndex: { deleteMany: vi.fn() },
    providerTombstone: { deleteMany: vi.fn() },
  },
  clientsMock: { fetchExportPage: vi.fn(), fetchRatings: vi.fn() },
  documentsMock: {
    upsertDocument: vi.fn(async () => {}),
    patchRatings: vi.fn(async () => {}),
    // Re-exported by the real module; the sweep only parses with it.
  },
}));

vi.mock("../db", () => ({ db: dbMock }));
vi.mock("./clients", () => clientsMock);
vi.mock("./documents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./documents")>()),
  upsertDocument: documentsMock.upsertDocument,
  patchRatings: documentsMock.patchRatings,
}));

import { runReindex } from "./reindex";

const doc = {
  userId: "user_1",
  contactName: "Nuwan Perera",
  category: "mechanic",
  headline: "Honest auto repairs",
  bio: "A long enough bio for the index.",
  city: "Colombo",
  district: "Colombo",
  serviceDistricts: ["Colombo"],
  serviceTitles: ["Brake inspection"],
  servicePrices: [2500],
  available: true,
  awayUntil: null,
  verificationStatus: "NONE",
  experience: 5,
  latitude: null,
  longitude: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.providerIndex.deleteMany.mockResolvedValue({ count: 0 });
  dbMock.providerTombstone.deleteMany.mockResolvedValue({ count: 0 });
});

describe("runReindex", () => {
  it("walks all pages, patches ratings and prunes by sweep generation", async () => {
    clientsMock.fetchExportPage
      .mockResolvedValueOnce({
        providers: [{ id: "p1", ...doc }],
        nextCursor: "p1",
      })
      .mockResolvedValueOnce({
        providers: [{ id: "p2", ...doc }],
        nextCursor: null,
      });
    clientsMock.fetchRatings.mockResolvedValue({
      p1: { rating: 4.5, count: 2 },
    });
    dbMock.providerIndex.deleteMany.mockResolvedValue({ count: 3 });
    dbMock.providerTombstone.deleteMany.mockResolvedValue({ count: 1 });

    const result = await runReindex();
    expect(result).toEqual({ indexed: 2, skipped: 0, deleted: 3, purged: 1 });
    expect(documentsMock.upsertDocument).toHaveBeenCalledTimes(2);
    // Every upsert is stamped with the same sweepId (a uuid string).
    const sweepId = (documentsMock.upsertDocument.mock.calls[0] as unknown[])[2] as string;
    expect(typeof sweepId).toBe("string");
    expect(documentsMock.upsertDocument).toHaveBeenCalledWith("p1", expect.anything(), sweepId);
    expect(documentsMock.upsertDocument).toHaveBeenCalledWith("p2", expect.anything(), sweepId);
    // p1 has reviews; p2 is genuinely unreviewed → null/0.
    expect(documentsMock.patchRatings).toHaveBeenCalledWith({
      providerId: "p1",
      ratingAvg: 4.5,
      ratingCount: 2,
    });
    expect(documentsMock.patchRatings).toHaveBeenCalledWith({
      providerId: "p2",
      ratingAvg: null,
      ratingCount: 0,
    });
    // Prune targets rows this sweep did not stamp that also predate it — never
    // an unbounded notIn(seen). Mid-sweep registrations (fresh updatedAt) survive.
    expect(dbMock.providerIndex.deleteMany).toHaveBeenCalledWith({
      where: {
        updatedAt: { lt: expect.any(Date) },
        OR: [{ sweepId: { not: sweepId } }, { sweepId: null }],
      },
    });
    // Redundant tombstones (predating the sweep) are purged.
    expect(dbMock.providerTombstone.deleteMany).toHaveBeenCalledWith({
      where: { deletedAt: { lt: expect.any(Date) } },
    });
  });

  it("skips (never aborts on) a malformed export row", async () => {
    clientsMock.fetchExportPage.mockResolvedValueOnce({
      providers: [{ id: "bad" }, { id: "p1", ...doc }],
      nextCursor: null,
    });
    clientsMock.fetchRatings.mockResolvedValue({});
    const result = await runReindex();
    expect(result.indexed).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("fails loudly when the export is down (never wipes the index)", async () => {
    clientsMock.fetchExportPage.mockRejectedValue(new Error("export down"));
    await expect(runReindex()).rejects.toThrow("export down");
    expect(dbMock.providerIndex.deleteMany).not.toHaveBeenCalled();
  });
});
