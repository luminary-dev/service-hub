// Internal S2S route tests (#403 self-service downgrade). The deactivate route
// hides a provider's own profile by userId; the dedicated reactivate route
// clears it. The create path is idempotent on a userId conflict but must never
// touch `suspended` (so it can't lift an admin suspension). Prisma is mocked;
// internal routes require the shared secret.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { dbMock, storageMock } = vi.hoisted(() => ({
  dbMock: {
    provider: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workPhoto: { findMany: vi.fn() },
    verificationDocument: { findMany: vi.fn() },
    inquiry: { deleteMany: vi.fn() },
  },
  storageMock: {
    removeStoredFile: vi.fn().mockResolvedValue(undefined),
    sweepMedia: vi.fn().mockResolvedValue({ removed: 0, kept: 0 }),
  },
}));

vi.mock("../db", () => ({ db: dbMock }));
vi.mock("../lib/storage", () => storageMock);

import { app } from "../app";

const SECRET = "dev-internal-secret";

function post(path: string, body?: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": SECRET },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /internal/providers/by-user/:userId/deactivate", () => {
  it("suspends the caller's provider profile", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "prov1" });
    dbMock.provider.update.mockResolvedValue({ id: "prov1", suspended: true });

    const res = await post("/internal/providers/by-user/owner-1/deactivate");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deactivated: true });
    expect(dbMock.provider.update).toHaveBeenCalledWith({
      where: { id: "prov1" },
      data: { suspended: true },
    });
  });

  it("is a no-op when the user has no provider profile", async () => {
    dbMock.provider.findUnique.mockResolvedValue(null);
    const res = await post("/internal/providers/by-user/nobody/deactivate");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deactivated: false });
    expect(dbMock.provider.update).not.toHaveBeenCalled();
  });
});

describe("POST /internal/providers/by-user/:userId/reactivate", () => {
  it("clears suspended on a self-deactivated profile (re-upgrade)", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "prov1", suspended: true });
    dbMock.provider.update.mockResolvedValue({ id: "prov1", suspended: false });

    const res = await post("/internal/providers/by-user/owner-1/reactivate");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reactivated: true });
    expect(dbMock.provider.update).toHaveBeenCalledWith({
      where: { id: "prov1" },
      data: { suspended: false },
    });
  });

  it("is a no-op when already active", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "prov1", suspended: false });
    const res = await post("/internal/providers/by-user/owner-1/reactivate");
    expect(res.status).toBe(200);
    expect(dbMock.provider.update).not.toHaveBeenCalled();
  });
});

describe("POST /internal/providers re-upgrade", () => {
  const body = {
    userId: "owner-1",
    name: "Ann",
    email: "a@b.lk",
    phone: "+94771234567",
    category: "plumbing",
    headline: "Plumber for hire",
    bio: "Twenty-plus characters of provider bio text.",
    district: "Colombo",
    city: "Colombo",
    experience: 3,
    services: [{ title: "Fix taps", price: 1000, priceType: "FIXED" }],
  };

  it("returns the existing id without lifting a suspension (invariant guard)", async () => {
    // create() hits the unique-userId constraint (profile already exists) and
    // that profile is suspended. Re-registration must be idempotent but must
    // NOT clear `suspended` — the flag can't tell a self-downgrade from an
    // ADMIN suspension, so un-suspension is left to the dedicated /reactivate
    // endpoint. Guards against re-registration silently lifting an admin ban.
    dbMock.provider.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7",
      })
    );
    dbMock.provider.findUnique.mockResolvedValue({ id: "prov1" });

    const res = await post("/internal/providers", body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "prov1" });
    // No un-suspension on the create path — the profile stays as it was.
    expect(dbMock.provider.update).not.toHaveBeenCalled();
  });
});

describe("POST /internal/maintenance/sweep-orphans", () => {
  it("treats provider cover photos as referenced (never swept)", async () => {
    dbMock.workPhoto.findMany.mockResolvedValue([{ url: "provider/photo.jpg" }]);
    dbMock.verificationDocument.findMany.mockResolvedValue([
      { url: "provider/doc.pdf" },
    ]);
    // avatar query then cover-photo query, in Promise.all order.
    dbMock.provider.findMany
      .mockResolvedValueOnce([{ avatarUrl: "provider/avatar.jpg" }])
      .mockResolvedValueOnce([{ coverPhoto: "provider/cover.jpg" }]);

    const res = await post("/internal/maintenance/sweep-orphans");
    expect(res.status).toBe(200);
    expect(storageMock.sweepMedia).toHaveBeenCalledTimes(1);

    const [namespace, referenced] = storageMock.sweepMedia.mock.calls[0];
    expect(namespace).toBe("provider");
    // The active cover photo must be in the keep-set, or the sweep would
    // delete every provider's live cover (data loss, #435).
    expect(referenced).toContain("provider/cover.jpg");
    expect(referenced).toContain("provider/avatar.jpg");
    expect(referenced).toContain("provider/photo.jpg");
    expect(referenced).toContain("provider/doc.pdf");
  });
});

describe("POST /internal/users/:id/erase", () => {
  it("removes the provider's stored cover photo alongside avatar/photos/docs", async () => {
    dbMock.provider.findUnique.mockResolvedValue({
      id: "prov1",
      avatarUrl: "provider/avatar.jpg",
      coverPhoto: "provider/cover.jpg",
      photos: [{ url: "provider/photo.jpg" }],
      verificationDocs: [{ url: "provider/doc.pdf" }],
    });
    dbMock.provider.delete.mockResolvedValue({ id: "prov1" });
    dbMock.inquiry.deleteMany.mockResolvedValue({ count: 0 });

    const res = await post("/internal/users/owner-1/erase");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const removed = storageMock.removeStoredFile.mock.calls.map((c) => c[0]);
    expect(removed).toContain("provider/cover.jpg");
    expect(removed).toContain("provider/avatar.jpg");
    expect(removed).toContain("provider/photo.jpg");
    expect(removed).toContain("provider/doc.pdf");
  });

  it("skips a null cover photo without erroring", async () => {
    dbMock.provider.findUnique.mockResolvedValue({
      id: "prov1",
      avatarUrl: null,
      coverPhoto: null,
      photos: [],
      verificationDocs: [],
    });
    dbMock.provider.delete.mockResolvedValue({ id: "prov1" });
    dbMock.inquiry.deleteMany.mockResolvedValue({ count: 0 });

    const res = await post("/internal/users/owner-1/erase");
    expect(res.status).toBe(200);
    expect(storageMock.removeStoredFile).not.toHaveBeenCalled();
  });
});
