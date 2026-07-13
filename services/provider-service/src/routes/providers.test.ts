// Public provider directory / profile endpoint tests (#257). Focus: the
// suspended-profile visibility gate (hidden from everyone except ADMIN, so a
// suspended provider's contact PII can't leak by id), the `ids=` favorites
// path, and the public inquiry create path (anonymous allowed). Prisma and the
// review/notification S2S clients are mocked — deterministic, no network.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    provider: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    category: { findMany: vi.fn() },
    inquiry: { create: vi.fn(), findMany: vi.fn() },
    // Content filter (#375): the auto-report path files a SYSTEM report on
    // the inquiry when its text matches the denylist.
    report: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../db", () => ({ db: dbMock }));
vi.mock("../lib/clients", () => ({
  fetchRatings: vi.fn().mockResolvedValue({}),
  fetchProviderReviews: vi.fn().mockResolvedValue({ reviews: [], nextCursor: null }),
  fetchReviewCount: vi.fn().mockResolvedValue(0),
  sendInquiryEmail: vi.fn().mockResolvedValue(undefined),
}));

import { app } from "../app";
import { __resetCategoryImageCache } from "./providers";
import { sendInquiryEmail } from "../lib/clients";

const SECRET = "dev-internal-secret";
type Role = "ADMIN" | "SUPPORT" | "CUSTOMER" | "PROVIDER" | null;

function req(
  path: string,
  opts: { method?: string; body?: unknown; role?: Role } = {}
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-internal-secret": SECRET,
  };
  if (opts.role) {
    headers["x-user-id"] = "u1";
    headers["x-user-role"] = opts.role;
    headers["x-user-name"] = "Someone";
  }
  return app.request(path, {
    method: opts.method ?? "GET",
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

// The full include-shape rows the detail routes expect; only the fields the
// DTO reads matter here.
function providerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    userId: "owner-1",
    contactName: "Nimal Perera",
    contactEmail: "n@baas.lk",
    contactPhone: "0770000000",
    category: "plumbing",
    headline: "Experienced plumber",
    district: "Colombo",
    city: "Colombo",
    latitude: null,
    longitude: null,
    experience: 20,
    available: true,
    awayUntil: null,
    avatarUrl: null,
    verificationStatus: "VERIFIED",
    verifiedAt: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
    suspended: false,
    services: [],
    photos: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetCategoryImageCache();
  dbMock.category.findMany.mockResolvedValue([]);
  dbMock.provider.findMany.mockResolvedValue([]);
  dbMock.provider.count.mockResolvedValue(0);
  dbMock.inquiry.findMany.mockResolvedValue([]);
});

describe("GET /api/providers/:id — suspended visibility gate", () => {
  it("returns the provider to the public when not suspended", async () => {
    dbMock.provider.findUnique.mockResolvedValue(providerRow());
    const res = await req("/api/providers/p1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider.id).toBe("p1");
    // Contact exposed as `user` — WITHOUT the phone (#64): the public payload
    // never carries raw phone digits, only the name/email + has* booleans.
    expect(body.provider.user).toEqual({
      name: "Nimal Perera",
      email: "n@baas.lk",
    });
    expect(body.provider.user).not.toHaveProperty("phone");
    expect(body.provider).not.toHaveProperty("contactPhone");
    expect(body.provider).not.toHaveProperty("whatsapp");
    expect(body.provider).not.toHaveProperty("phone2");
    // The provider HAS a phone, so the UI shows a reveal affordance.
    expect(body.provider.hasPhone).toBe(true);
  });

  it("never leaks admin rejectionReason to the public payload (#506)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(
      providerRow({ verificationStatus: "REJECTED", rejectionReason: "blurry NIC" })
    );
    const res = await req("/api/providers/p1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).not.toHaveProperty("rejectionReason");
  });

  it("hides a suspended provider from an anonymous visitor (404)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(providerRow({ suspended: true }));
    const res = await req("/api/providers/p1");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Provider not found" });
  });

  it("hides a suspended provider from a CUSTOMER (404)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(providerRow({ suspended: true }));
    const res = await req("/api/providers/p1", { role: "CUSTOMER" });
    expect(res.status).toBe(404);
  });

  it("still reveals a suspended provider to an ADMIN (moderation)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(providerRow({ suspended: true }));
    const res = await req("/api/providers/p1", { role: "ADMIN" });
    expect(res.status).toBe(200);
    expect((await res.json()).provider.id).toBe("p1");
  });

  it("404 when the provider does not exist", async () => {
    dbMock.provider.findUnique.mockResolvedValue(null);
    const res = await req("/api/providers/nope");
    expect(res.status).toBe(404);
  });

  // Geo capture (#48): the map pin is public display data, but only when the
  // provider actually set one — unpinned profiles carry no coordinate keys.
  it("includes the map pin only when set (#48)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(
      providerRow({ latitude: 6.9271, longitude: 79.8612 })
    );
    const res = await req("/api/providers/p1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider.latitude).toBe(6.9271);
    expect(body.provider.longitude).toBe(79.8612);
  });

  it("omits the coordinate keys entirely for an unpinned provider (#48)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(providerRow());
    const res = await req("/api/providers/p1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).not.toHaveProperty("latitude");
    expect(body.provider).not.toHaveProperty("longitude");
  });

  it("serializes Decimal service prices as JSON numbers (#371)", async () => {
    // price is DECIMAL(12,2) in the DB, so Prisma hands the route Decimals —
    // which would JSON-stringify as strings without the edge conversion.
    dbMock.provider.findUnique.mockResolvedValue(
      providerRow({
        services: [
          {
            id: "s1",
            providerId: "p1",
            title: "Tap repair",
            description: null,
            price: new Prisma.Decimal("1500.00"),
            priceType: "FIXED",
          },
        ],
      })
    );
    const res = await req("/api/providers/p1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider.services[0].price).toBe(1500);
    expect(typeof body.provider.services[0].price).toBe("number");
  });
});

describe("GET /api/providers/:id/full — suspended gate mirrors detail", () => {
  it("hides a suspended provider from the public (404)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(
      providerRow({ suspended: true, _count: { photos: 0 } })
    );
    const res = await req("/api/providers/p1/full");
    expect(res.status).toBe(404);
  });

  it("serves the full payload for a live provider", async () => {
    dbMock.provider.findUnique.mockResolvedValue(providerRow({ _count: { photos: 0 } }));
    const res = await req("/api/providers/p1/full");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider.id).toBe("p1");
    expect(body.provider).toHaveProperty("reviews");
    expect(body.provider).toHaveProperty("avgResponseMs");
    // Phone digits are withheld from the public profile payload (#64).
    expect(body.provider).not.toHaveProperty("contactPhone");
    expect(body.provider).not.toHaveProperty("whatsapp");
    expect(body.provider).not.toHaveProperty("phone2");
    expect(body.provider.user).not.toHaveProperty("phone");
    expect(body.provider.hasPhone).toBe(true);
  });

  it("bounds the avgResponseMs sample to the most recent answered inquiries (#372)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(providerRow({ _count: { photos: 0 } }));
    const res = await req("/api/providers/p1/full");
    expect(res.status).toBe(200);
    expect(dbMock.inquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { respondedAt: "desc" },
        take: 200,
      })
    );
  });

  it("never leaks admin rejectionReason to the public profile payload (#506)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(
      providerRow({
        verificationStatus: "REJECTED",
        rejectionReason: "blurry NIC",
        _count: { photos: 0 },
      })
    );
    const res = await req("/api/providers/p1/full");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).not.toHaveProperty("rejectionReason");
  });

  it("includes the map pin only when set, like the detail route (#48)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(
      providerRow({ latitude: 7.2906, longitude: 80.6337, _count: { photos: 0 } })
    );
    const pinned = await (await req("/api/providers/p1/full")).json();
    expect(pinned.provider.latitude).toBe(7.2906);
    expect(pinned.provider.longitude).toBe(80.6337);

    dbMock.provider.findUnique.mockResolvedValue(
      providerRow({ _count: { photos: 0 } })
    );
    const unpinned = await (await req("/api/providers/p1/full")).json();
    expect(unpinned.provider).not.toHaveProperty("latitude");
    expect(unpinned.provider).not.toHaveProperty("longitude");
  });
});

describe("POST /api/providers/:id/contact — phone reveal (#64)", () => {
  it("returns the raw numbers on the explicit reveal action", async () => {
    dbMock.provider.findUnique.mockResolvedValue({
      contactPhone: "0770000000",
      whatsapp: "0771111111",
      phone2: null,
      suspended: false,
    });
    const res = await req("/api/providers/p1/contact", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      phone: "0770000000",
      whatsapp: "0771111111",
      phone2: null,
    });
  });

  it("hides a suspended provider's numbers from the public (404)", async () => {
    dbMock.provider.findUnique.mockResolvedValue({
      contactPhone: "0770000000",
      whatsapp: null,
      phone2: null,
      suspended: true,
    });
    const res = await req("/api/providers/p1/contact", { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("404 when the provider does not exist", async () => {
    dbMock.provider.findUnique.mockResolvedValue(null);
    const res = await req("/api/providers/nope/contact", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/providers?ids= (favorites)", () => {
  it("returns the requested providers in input order, suspended excluded at the query", async () => {
    dbMock.provider.findMany.mockResolvedValue([
      providerRow({ id: "b" }),
      providerRow({ id: "a" }),
    ]);
    const res = await req("/api/providers?ids=a,b");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual(["a", "b"]);
    // The query itself filters suspended out.
    expect(dbMock.provider.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["a", "b"] }, suspended: false },
      })
    );
  });
});

describe("GET /api/providers — browse card money serialization (#371)", () => {
  it("emits fromPrice/services[].price as numbers and price-sorts Decimal rows", async () => {
    dbMock.provider.findMany.mockResolvedValue([
      providerRow({
        id: "pricey",
        services: [
          { id: "s2", title: "Big job", price: new Prisma.Decimal("12500.00"), priceType: "FIXED" },
        ],
      }),
      providerRow({
        id: "cheap",
        services: [
          { id: "s1", title: "Small job", price: new Prisma.Decimal("1500.00"), priceType: "FIXED" },
        ],
      }),
    ]);
    const res = await req("/api/providers?sort=price");
    expect(res.status).toBe(200);
    const body = await res.json();
    // The in-memory price sort compares plain numbers — Decimals must be
    // converted before ranking, lowest starting price first.
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual(["cheap", "pricey"]);
    expect(body.providers[0].fromPrice).toBe(1500);
    expect(typeof body.providers[0].fromPrice).toBe("number");
    expect(body.providers[0].services[0].price).toBe(1500);
    expect(typeof body.providers[0].services[0].price).toBe("number");
  });
});

describe("category cover map caching (#523)", () => {
  const imageSelect = { select: { slug: true, imageUrl: true } };

  it("memoizes the slug→imageUrl map across browse requests (one DB read)", async () => {
    await req("/api/providers");
    await req("/api/providers");
    // Two browse requests, but the cover-image map is fetched from the DB only
    // once within the TTL — the second request is served from the cache.
    const imageMapCalls = dbMock.category.findMany.mock.calls.filter(
      ([arg]) => arg?.select?.imageUrl === true
    );
    expect(imageMapCalls).toHaveLength(1);
    expect(dbMock.category.findMany).toHaveBeenCalledWith(imageSelect);
  });
});

describe("GET /api/categories (public, active only)", () => {
  it("returns only active categories", async () => {
    dbMock.category.findMany.mockResolvedValue([
      { slug: "plumbing", labelEn: "Plumbing", labelSi: "ජලනල", icon: null },
    ]);
    const res = await req("/api/categories");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      categories: [{ slug: "plumbing", labelEn: "Plumbing", labelSi: "ජලනල", icon: null }],
    });
    expect(dbMock.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } })
    );
  });
});

describe("POST /api/providers/:id/inquiries", () => {
  const valid = {
    name: "Kamal",
    phone: "0771234567",
    message: "Hello, I need help fixing a leaking tap in my kitchen.",
  };

  it("creates an inquiry for an anonymous visitor (userId null)", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1", contactEmail: "n@baas.lk" });
    dbMock.inquiry.create.mockResolvedValue({ id: "inq1" });
    const res = await req("/api/providers/p1/inquiries", { method: "POST", body: valid });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inquiry: { id: "inq1" } });
    expect(dbMock.inquiry.create.mock.calls[0][0].data.userId).toBeNull();
  });

  it("attributes the inquiry to a signed-in user", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1", contactEmail: "n@baas.lk" });
    dbMock.inquiry.create.mockResolvedValue({ id: "inq1" });
    await req("/api/providers/p1/inquiries", {
      method: "POST",
      body: valid,
      role: "CUSTOMER",
    });
    expect(dbMock.inquiry.create.mock.calls[0][0].data.userId).toBe("u1");
  });

  it("404 when the target provider does not exist", async () => {
    dbMock.provider.findUnique.mockResolvedValue(null);
    const res = await req("/api/providers/nope/inquiries", { method: "POST", body: valid });
    expect(res.status).toBe(404);
    expect(dbMock.inquiry.create).not.toHaveBeenCalled();
  });

  it("404 for a suspended provider to a non-admin — no inquiry created (#361)", async () => {
    dbMock.provider.findUnique.mockResolvedValue({
      id: "p1",
      contactEmail: "n@baas.lk",
      suspended: true,
    });
    const res = await req("/api/providers/p1/inquiries", {
      method: "POST",
      body: valid,
      role: "CUSTOMER",
    });
    expect(res.status).toBe(404);
    expect(dbMock.inquiry.create).not.toHaveBeenCalled();
  });

  it("still allows an ADMIN to inquire against a suspended provider", async () => {
    dbMock.provider.findUnique.mockResolvedValue({
      id: "p1",
      contactEmail: "n@baas.lk",
      suspended: true,
    });
    dbMock.inquiry.create.mockResolvedValue({ id: "inq1" });
    const res = await req("/api/providers/p1/inquiries", {
      method: "POST",
      body: valid,
      role: "ADMIN",
    });
    expect(res.status).toBe(200);
    expect(dbMock.inquiry.create).toHaveBeenCalled();
  });

  it("400 for an invalid body (message too short)", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1", contactEmail: "n@baas.lk" });
    const res = await req("/api/providers/p1/inquiries", {
      method: "POST",
      body: { name: "Kamal", phone: "0771234567", message: "hi" },
    });
    expect(res.status).toBe(400);
    expect(dbMock.inquiry.create).not.toHaveBeenCalled();
  });

  it("empty honeypot is treated as a real submission (#65)", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1", contactEmail: "n@baas.lk" });
    dbMock.inquiry.create.mockResolvedValue({ id: "inq1" });
    const res = await req("/api/providers/p1/inquiries", {
      method: "POST",
      body: { ...valid, company: "" },
    });
    expect(res.status).toBe(200);
    expect(dbMock.inquiry.create).toHaveBeenCalled();
  });

  it("silently drops a submission with the honeypot filled (#65)", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1", contactEmail: "n@baas.lk" });
    const res = await req("/api/providers/p1/inquiries", {
      method: "POST",
      body: { ...valid, company: "Acme Bots Ltd" },
    });
    // Success-shaped 200 so a bot can't detect the filter, but nothing is
    // persisted and no provider email is sent.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inquiry: null });
    expect(dbMock.inquiry.create).not.toHaveBeenCalled();
    expect(sendInquiryEmail).not.toHaveBeenCalled();
  });

  // Write-time content filter (#375): a denylist hit auto-files a SYSTEM
  // report on the inquiry; the inquiry is still delivered (decision:
  // auto-report and keep visible, never hard-block).
  it("auto-files a SYSTEM INQUIRY report on a denylist hit, inquiry still created", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1", contactEmail: "n@baas.lk" });
    dbMock.inquiry.create.mockResolvedValue({ id: "inq1" });
    dbMock.report.findFirst.mockResolvedValue(null);
    const res = await req("/api/providers/p1/inquiries", {
      method: "POST",
      body: { ...valid, message: "open the door you fucking crook, now" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inquiry: { id: "inq1" } });
    expect(sendInquiryEmail).toHaveBeenCalled();
    expect(dbMock.report.create).toHaveBeenCalledWith({
      data: {
        targetType: "INQUIRY",
        targetId: "inq1",
        reporterId: null,
        reason: "auto-flag: content filter",
        details: expect.stringContaining('matched "fucking" in message'),
        source: "SYSTEM",
      },
    });
  });

  it("flags Singlish inquiry text too, without blocking the write", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1", contactEmail: "n@baas.lk" });
    dbMock.inquiry.create.mockResolvedValue({ id: "inq1" });
    dbMock.report.findFirst.mockResolvedValue(null);
    const res = await req("/api/providers/p1/inquiries", {
      method: "POST",
      body: { ...valid, message: "mu hari ponnaya, wada karanne na kiyala kiyanna" },
    });
    expect(res.status).toBe(200);
    const arg = dbMock.report.create.mock.calls[0][0] as { data: { details: string } };
    expect(arg.data.details).toContain("ponnaya");
  });

  it("leaves the reports table untouched for a clean inquiry", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1", contactEmail: "n@baas.lk" });
    dbMock.inquiry.create.mockResolvedValue({ id: "inq1" });
    const res = await req("/api/providers/p1/inquiries", { method: "POST", body: valid });
    expect(res.status).toBe(200);
    expect(dbMock.report.findFirst).not.toHaveBeenCalled();
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });

  it("never fails the inquiry when the auto-report path throws (best-effort)", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1", contactEmail: "n@baas.lk" });
    dbMock.inquiry.create.mockResolvedValue({ id: "inq1" });
    dbMock.report.findFirst.mockRejectedValue(new Error("db down"));
    const res = await req("/api/providers/p1/inquiries", {
      method: "POST",
      body: { ...valid, message: "open the door you fucking crook, now" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inquiry: { id: "inq1" } });
  });
});
