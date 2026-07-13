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
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    workPhoto: { findMany: vi.fn() },
    verificationDocument: { findMany: vi.fn() },
    category: { findMany: vi.fn() },
    inquiry: { deleteMany: vi.fn() },
    // Content filter (#375) on the registration create path.
    report: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
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

function get(path: string) {
  return app.request(path, { headers: { "x-internal-secret": SECRET } });
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
    dbMock.provider.findUnique.mockResolvedValue({
      id: "prov1",
      suspended: true,
      adminSuspended: false,
    });
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
    dbMock.provider.findUnique.mockResolvedValue({
      id: "prov1",
      suspended: false,
      adminSuspended: false,
    });
    const res = await post("/internal/providers/by-user/owner-1/reactivate");
    expect(res.status).toBe(200);
    expect(dbMock.provider.update).not.toHaveBeenCalled();
  });

  // #550: leave-provider → complete-provider must not lift an ADMIN
  // suspension — the reactivate path refuses it outright, with no write.
  it("refuses an ADMIN suspension with 409 and no write", async () => {
    dbMock.provider.findUnique.mockResolvedValue({
      id: "prov1",
      suspended: true,
      adminSuspended: true,
    });
    const res = await post("/internal/providers/by-user/owner-1/reactivate");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Suspended by admin" });
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

  it("persists the optional Sinhala headline/bio when supplied (#515)", async () => {
    dbMock.provider.create.mockResolvedValue({ id: "prov9" });
    const res = await post("/internal/providers", {
      ...body,
      headlineSi: "විශ්වාසවන්ත ජලනළ කාර්මිකයා",
      bioSi: "අවුරුදු දහයකට වැඩි පළපුරුද්දක් සහිත ජලනළ සේවා.",
    });
    expect(res.status).toBe(200);
    expect(dbMock.provider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          headlineSi: "විශ්වාසවන්ත ජලනළ කාර්මිකයා",
          bioSi: "අවුරුදු දහයකට වැඩි පළපුරුද්දක් සහිත ජලනළ සේවා.",
        }),
      })
    );
  });

  it("stores null for absent Sinhala variants (#515)", async () => {
    dbMock.provider.create.mockResolvedValue({ id: "prov10" });
    const res = await post("/internal/providers", body);
    expect(res.status).toBe(200);
    expect(dbMock.provider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ headlineSi: null, bioSi: null }),
      })
    );
  });

  it("defaults the served set to [district] when serviceDistricts is omitted (#502)", async () => {
    dbMock.provider.create.mockResolvedValue({ id: "prov11" });
    const res = await post("/internal/providers", body);
    expect(res.status).toBe(200);
    expect(dbMock.provider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ serviceDistricts: ["Colombo"] }),
      })
    );
  });

  it("dedupes the served set and pins the primary district first (#502)", async () => {
    dbMock.provider.create.mockResolvedValue({ id: "prov12" });
    const res = await post("/internal/providers", {
      ...body,
      serviceDistricts: ["Gampaha", "Colombo", "Gampaha", "Kalutara"],
    });
    expect(res.status).toBe(200);
    expect(dbMock.provider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serviceDistricts: ["Colombo", "Gampaha", "Kalutara"],
        }),
      })
    );
  });

  it("400s when the served set exceeds the cap or holds an unknown district (#502)", async () => {
    const over = await post("/internal/providers", {
      ...body,
      // 5 extras + the primary = 6 > MAX_SERVICE_DISTRICTS.
      serviceDistricts: ["Gampaha", "Kalutara", "Kandy", "Galle", "Matara"],
    });
    expect(over.status).toBe(400);
    const unknown = await post("/internal/providers", {
      ...body,
      serviceDistricts: ["Atlantis"],
    });
    expect(unknown.status).toBe(400);
    expect(dbMock.provider.create).not.toHaveBeenCalled();
  });

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

  // Write-time content filter (#375): registration text is checked like a
  // profile edit — a hit flags the new provider (SYSTEM report), the create
  // itself always succeeds.
  it("auto-files a SYSTEM PROVIDER report when registration text hits the denylist", async () => {
    dbMock.provider.create.mockResolvedValue({ id: "prov9" });
    dbMock.report.findFirst.mockResolvedValue(null);
    const res = await post("/internal/providers", {
      ...body,
      bio: "Best in town, the rest are wesi scammers frankly.",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "prov9" });
    expect(dbMock.report.create).toHaveBeenCalledWith({
      data: {
        targetType: "PROVIDER",
        targetId: "prov9",
        reporterId: null,
        reason: "auto-flag: content filter",
        details: expect.stringContaining('matched "wesi" in bio'),
        source: "SYSTEM",
      },
    });
  });

  it("clean registration text never touches the reports table", async () => {
    dbMock.provider.create.mockResolvedValue({ id: "prov10" });
    const res = await post("/internal/providers", body);
    expect(res.status).toBe(200);
    expect(dbMock.report.findFirst).not.toHaveBeenCalled();
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });
});

describe("POST /internal/providers/contact (#553 contact sync)", () => {
  it("mirrors only the provided fields onto the contact columns", async () => {
    dbMock.provider.updateMany.mockResolvedValue({ count: 1 });

    const res = await post("/internal/providers/contact", {
      userId: "u1",
      name: "New Name",
      phone: "+94771234567",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMock.provider.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { contactName: "New Name", contactPhone: "+94771234567" },
    });
  });

  it("updates the contact email alone (change-email confirm)", async () => {
    dbMock.provider.updateMany.mockResolvedValue({ count: 1 });

    const res = await post("/internal/providers/contact", {
      userId: "u1",
      email: "new@baas.lk",
    });
    expect(res.status).toBe(200);
    expect(dbMock.provider.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { contactEmail: "new@baas.lk" },
    });
  });

  it("stores null when phone is cleared", async () => {
    dbMock.provider.updateMany.mockResolvedValue({ count: 1 });

    const res = await post("/internal/providers/contact", {
      userId: "u1",
      phone: null,
    });
    expect(res.status).toBe(200);
    expect(dbMock.provider.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { contactPhone: null },
    });
  });

  it("no-ops (200) when no contact fields are provided", async () => {
    const res = await post("/internal/providers/contact", { userId: "u1" });
    expect(res.status).toBe(200);
    expect(dbMock.provider.updateMany).not.toHaveBeenCalled();
  });

  it("400s without a userId", async () => {
    const res = await post("/internal/providers/contact", { name: "X" });
    expect(res.status).toBe(400);
    expect(dbMock.provider.updateMany).not.toHaveBeenCalled();
  });
});

describe("GET /internal/providers/matching (#501 lead-gen fan-out)", () => {
  it("400s without category or district", async () => {
    const res = await get("/internal/providers/matching?category=plumbing");
    expect(res.status).toBe(400);
    expect(dbMock.provider.findMany).not.toHaveBeenCalled();
  });

  it("returns matching providers' contact emails, scoped + not-suspended + capped", async () => {
    dbMock.provider.findMany.mockResolvedValue([
      { id: "p1", contactName: "Jane", contactEmail: "jane@example.com" },
      { id: "p2", contactName: "Sam", contactEmail: "sam@example.com" },
    ]);
    const res = await get(
      "/internal/providers/matching?category=plumbing&district=Colombo&excludeUserId=owner-1"
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      providers: [
        { id: "p1", contactName: "Jane", contactEmail: "jane@example.com" },
        { id: "p2", contactName: "Sam", contactEmail: "sam@example.com" },
      ],
    });
    // Mirrors the board's scoping: category equality + served-set membership
    // (#502), suspended excluded, poster excluded, capped.
    expect(dbMock.provider.findMany).toHaveBeenCalledWith({
      where: {
        category: "plumbing",
        serviceDistricts: { has: "Colombo" },
        suspended: false,
        NOT: { userId: "owner-1" },
      },
      select: { id: true, contactName: true, contactEmail: true },
      take: 200,
    });
  });

  it("dedupes providers that share a contact email", async () => {
    dbMock.provider.findMany.mockResolvedValue([
      { id: "p1", contactName: "Jane", contactEmail: "shared@example.com" },
      { id: "p2", contactName: "Sam", contactEmail: "SHARED@example.com" },
    ]);
    const res = await get(
      "/internal/providers/matching?category=plumbing&district=Colombo"
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providers).toHaveLength(1);
    expect(body.providers[0].id).toBe("p1");
    // No excludeUserId → no NOT clause.
    expect(dbMock.provider.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          category: "plumbing",
          serviceDistricts: { has: "Colombo" },
          suspended: false,
        },
      })
    );
  });
});

describe("POST /internal/providers — social/website URL validation (#518)", () => {
  const base = {
    userId: "owner-2",
    name: "Ravi",
    email: "r@b.lk",
    phone: "+94771234567",
    category: "plumbing",
    headline: "Plumber for hire",
    bio: "Twenty-plus characters of provider bio text.",
    district: "Colombo",
    city: "Colombo",
    experience: 3,
    services: [{ title: "Fix taps", price: 1000, priceType: "FIXED" }],
  };

  it("rejects a javascript: scheme in a social link (400, no create)", async () => {
    const res = await post("/internal/providers", {
      ...base,
      website: "javascript:alert(1)",
    });
    expect(res.status).toBe(400);
    expect(dbMock.provider.create).not.toHaveBeenCalled();
  });

  it("normalizes a scheme-less host to an https URL before persisting", async () => {
    dbMock.provider.create.mockResolvedValue({ id: "prov2" });
    const res = await post("/internal/providers", {
      ...base,
      facebook: "facebook.com/ravi",
    });
    expect(res.status).toBe(200);
    expect(dbMock.provider.create.mock.calls[0][0].data.facebook).toBe(
      "https://facebook.com/ravi"
    );
  });

  it("still accepts an explicit null for an omitted link", async () => {
    dbMock.provider.create.mockResolvedValue({ id: "prov3" });
    const res = await post("/internal/providers", { ...base, website: null });
    expect(res.status).toBe(200);
    expect(dbMock.provider.create.mock.calls[0][0].data.website).toBeNull();
  });
});

describe("POST /internal/maintenance/sweep-orphans", () => {
  it("treats provider cover photos as referenced (never swept)", async () => {
    dbMock.workPhoto.findMany.mockResolvedValue([{ url: "provider/photo.jpg" }]);
    dbMock.verificationDocument.findMany.mockResolvedValue([
      { url: "provider/doc.pdf" },
    ]);
    dbMock.category.findMany.mockResolvedValue([]);
    // avatar query then cover-photo query, in Promise.all order.
    dbMock.provider.findMany
      .mockResolvedValueOnce([{ avatarUrl: "provider/avatar.jpg" }])
      .mockResolvedValueOnce([{ coverPhoto: "provider/cover.jpg" }]);

    const res = await post("/internal/maintenance/sweep-orphans");
    expect(res.status).toBe(200);

    const [namespace, referenced] = storageMock.sweepMedia.mock.calls[0];
    expect(namespace).toBe("provider");
    // The active cover photo must be in the keep-set, or the sweep would
    // delete every provider's live cover (data loss, #435).
    expect(referenced).toContain("provider/cover.jpg");
    expect(referenced).toContain("provider/avatar.jpg");
    expect(referenced).toContain("provider/photo.jpg");
    expect(referenced).toContain("provider/doc.pdf");
  });

  // #555: category cover images share this DB, so the same maintenance call
  // sweeps their namespace, keeping the saved imageUrls.
  it("also sweeps the category namespace with saved covers referenced", async () => {
    dbMock.workPhoto.findMany.mockResolvedValue([]);
    dbMock.verificationDocument.findMany.mockResolvedValue([]);
    dbMock.category.findMany.mockResolvedValue([
      { imageUrl: "/api/files/category/covers/live.jpg" },
    ]);
    dbMock.provider.findMany.mockResolvedValue([]);

    const res = await post("/internal/maintenance/sweep-orphans");
    expect(res.status).toBe(200);
    expect(storageMock.sweepMedia).toHaveBeenCalledTimes(2);

    const [namespace, referenced] = storageMock.sweepMedia.mock.calls[1];
    expect(namespace).toBe("category");
    expect(referenced).toContain("/api/files/category/covers/live.jpg");
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
