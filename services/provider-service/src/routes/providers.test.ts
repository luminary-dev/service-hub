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
    // Browse now runs the ordered/paginated id slice + total count DB-side (#748)
    // via $queryRaw; the id-select returns [{ id }], the count [{ count }].
    $queryRaw: vi.fn(),
  },
}));

vi.mock("../db", () => ({ db: dbMock }));
vi.mock("../lib/clients", () => ({
  fetchProviderReviews: vi.fn().mockResolvedValue({ reviews: [], nextCursor: null }),
  fetchReviewCount: vi.fn().mockResolvedValue(0),
  // Verified-email inquiry gate (#115) — verified by default; the gate tests
  // below flip it to unverified / throwing.
  isEmailVerified: vi.fn().mockResolvedValue(true),
}));
vi.mock("../lib/notify", () => ({
  emitNotification: vi.fn().mockResolvedValue(undefined),
}));

import { app } from "../app";
import { __resetCategoryImageCache } from "./providers";
import { emitNotification } from "../lib/notify";
import { isEmailVerified } from "../lib/clients";

const SECRET = "dev-internal-secret";
type Role = "ADMIN" | "SUPPORT" | "CUSTOMER" | "PROVIDER" | null;

function req(
  path: string,
  opts: { method?: string; body?: unknown; role?: Role; userId?: string } = {}
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-internal-secret": SECRET,
  };
  if (opts.role) {
    headers["x-user-id"] = opts.userId ?? "u1";
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
    // Denormalized rating aggregates (#748) — the card DTO reads these directly.
    ratingAvg: 0,
    ratingCount: 0,
    services: [],
    photos: [],
    ...overrides,
  };
}

// Default $queryRaw stub (#748): the browse route runs the id-select and the
// count query through it. Distinguish by the SQL text; individual tests override.
function stubBrowseQueryRaw(ids: string[], total = ids.length) {
  dbMock.$queryRaw.mockImplementation((q: { strings?: string[]; sql?: string }) => {
    const text = Array.isArray(q?.strings) ? q.strings.join(" ") : String(q?.sql ?? "");
    if (text.includes("COUNT(")) return Promise.resolve([{ count: total }]);
    return Promise.resolve(ids.map((id) => ({ id })));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetCategoryImageCache();
  dbMock.category.findMany.mockResolvedValue([]);
  dbMock.provider.findMany.mockResolvedValue([]);
  dbMock.provider.count.mockResolvedValue(0);
  dbMock.inquiry.findMany.mockResolvedValue([]);
  stubBrowseQueryRaw([]);
  // clearAllMocks wipes the resolved value set at mock-definition time (#115).
  vi.mocked(isEmailVerified).mockResolvedValue(true);
});

describe("GET /api/providers/:id — suspended visibility gate", () => {
  it("returns the provider to the public when not suspended", async () => {
    dbMock.provider.findUnique.mockResolvedValue(providerRow());
    const res = await req("/api/providers/p1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider.id).toBe("p1");
    // Contact exposed as `user` — WITHOUT the phone (#64) OR the email (#655):
    // the public payload never carries raw phone digits or the address, only
    // the display name + has* booleans.
    expect(body.provider.user).toEqual({ name: "Nimal Perera" });
    expect(body.provider.user).not.toHaveProperty("phone");
    expect(body.provider.user).not.toHaveProperty("email");
    expect(body.provider).not.toHaveProperty("contactPhone");
    expect(body.provider).not.toHaveProperty("whatsapp");
    expect(body.provider).not.toHaveProperty("phone2");
    // The email address is PII too (#655): stripped from every public payload.
    expect(body.provider).not.toHaveProperty("contactEmail");
    // The owner's userId is withheld from anonymous/third-party callers (#655).
    expect(body.provider).not.toHaveProperty("userId");
    // The provider HAS a phone + email, so the UI shows a reveal affordance.
    expect(body.provider.hasPhone).toBe(true);
    expect(body.provider.hasEmail).toBe(true);
  });

  it("re-adds userId only for the owner and admins (#655)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(providerRow());
    // The owner (x-user-id matches the profile's userId) gets their own id back
    // — it powers the profile page's owner check — so this is no leak.
    const owner = await req("/api/providers/p1", { role: "PROVIDER", userId: "owner-1" });
    expect((await owner.json()).provider.userId).toBe("owner-1");
    // A different signed-in user does not.
    dbMock.provider.findUnique.mockResolvedValue(providerRow());
    const other = await req("/api/providers/p1", { role: "CUSTOMER", userId: "someone-else" });
    expect((await other.json()).provider).not.toHaveProperty("userId");
    // Admins moderating a profile still see it.
    dbMock.provider.findUnique.mockResolvedValue(providerRow());
    const admin = await req("/api/providers/p1", { role: "ADMIN", userId: "admin-1" });
    expect((await admin.json()).provider.userId).toBe("owner-1");
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

  // Category cover (#701): the detail payload carries the admin-managed
  // per-trade cover so the profile hero can lead with it, like the card.
  it("exposes the category cover as categoryImageUrl (#701)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(providerRow());
    dbMock.category.findMany.mockResolvedValue([
      { slug: "plumbing", imageUrl: "/images/categories/plumbing.jpg" },
    ]);
    const res = await req("/api/providers/p1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider.categoryImageUrl).toBe("/images/categories/plumbing.jpg");
  });

  it("categoryImageUrl is null when the trade has no cover (#701)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(providerRow());
    dbMock.category.findMany.mockResolvedValue([]);
    const res = await req("/api/providers/p1");
    expect(res.status).toBe(200);
    expect((await res.json()).provider.categoryImageUrl).toBeNull();
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
    // Phone digits + email are withheld from the public profile payload
    // (#64/#655); userId stays off anonymous payloads too.
    expect(body.provider).not.toHaveProperty("contactPhone");
    expect(body.provider).not.toHaveProperty("whatsapp");
    expect(body.provider).not.toHaveProperty("phone2");
    expect(body.provider).not.toHaveProperty("contactEmail");
    expect(body.provider).not.toHaveProperty("userId");
    expect(body.provider.user).toEqual({ name: "Nimal Perera" });
    expect(body.provider.user).not.toHaveProperty("phone");
    expect(body.provider.user).not.toHaveProperty("email");
    expect(body.provider.hasPhone).toBe(true);
    expect(body.provider.hasEmail).toBe(true);
  });

  it("re-adds userId to /full only for the owner (powers the owner check) (#655)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(providerRow({ _count: { photos: 0 } }));
    const owner = await req("/api/providers/p1/full", { role: "PROVIDER", userId: "owner-1" });
    expect((await owner.json()).provider.userId).toBe("owner-1");
    dbMock.provider.findUnique.mockResolvedValue(providerRow({ _count: { photos: 0 } }));
    const other = await req("/api/providers/p1/full", { role: "CUSTOMER", userId: "nope" });
    expect((await other.json()).provider).not.toHaveProperty("userId");
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

  // Category cover (#701): /full carries categoryImageUrl too, so the profile
  // hero cover banner matches the listing card's precedence.
  it("exposes the category cover as categoryImageUrl (#701)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(providerRow({ _count: { photos: 0 } }));
    dbMock.category.findMany.mockResolvedValue([
      { slug: "plumbing", imageUrl: "/images/categories/plumbing.jpg" },
    ]);
    const res = await req("/api/providers/p1/full");
    expect(res.status).toBe(200);
    expect((await res.json()).provider.categoryImageUrl).toBe(
      "/images/categories/plumbing.jpg"
    );
  });
});

describe("POST /api/providers/:id/contact — contact reveal (#64/#655)", () => {
  it("returns the raw numbers AND the email on the explicit reveal action", async () => {
    dbMock.provider.findUnique.mockResolvedValue({
      contactPhone: "0770000000",
      whatsapp: "0771111111",
      phone2: null,
      contactEmail: "n@baas.lk",
      suspended: false,
    });
    const res = await req("/api/providers/p1/contact", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      phone: "0770000000",
      whatsapp: "0771111111",
      phone2: null,
      email: "n@baas.lk",
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
  it("emits fromPrice/services[].price as numbers, in the DB-ranked id order", async () => {
    // Ranking/pagination run DB-side now (#748): $queryRaw returns the ordered
    // ids (cheapest first for sort=price) and the total; findMany hydrates them
    // (in arbitrary order) and the route re-orders back to the ranked ids.
    stubBrowseQueryRaw(["cheap", "pricey"]);
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
    // Output follows the DB-ranked id order, not the findMany order.
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual(["cheap", "pricey"]);
    expect(body.total).toBe(2);
    // Decimals must still be converted to plain numbers at the JSON edge.
    expect(body.providers[0].fromPrice).toBe(1500);
    expect(typeof body.providers[0].fromPrice).toBe("number");
    expect(body.providers[0].services[0].price).toBe(1500);
    expect(typeof body.providers[0].services[0].price).toBe("number");
  });
});

describe("GET /api/providers — browse card rating from denormalized columns (#748)", () => {
  it("maps ratingCount 0 to a null rating and surfaces the cached average otherwise", async () => {
    stubBrowseQueryRaw(["rated", "unrated"]);
    dbMock.provider.findMany.mockResolvedValue([
      providerRow({ id: "rated", ratingAvg: 4.5, ratingCount: 8 }),
      providerRow({ id: "unrated", ratingAvg: 0, ratingCount: 0 }),
    ]);
    const res = await req("/api/providers");
    expect(res.status).toBe(200);
    const body = await res.json();
    const rated = body.providers.find((p: { id: string }) => p.id === "rated");
    const unrated = body.providers.find((p: { id: string }) => p.id === "unrated");
    expect(rated.rating).toBe(4.5);
    expect(rated.reviewCount).toBe(8);
    expect(unrated.rating).toBeNull();
    expect(unrated.reviewCount).toBe(0);
  });
});

describe("GET /api/providers — browse card map pin (#48)", () => {
  it("includes the pin on pinned cards and omits the keys on unpinned ones", async () => {
    stubBrowseQueryRaw(["pinned", "unpinned"]);
    dbMock.provider.findMany.mockResolvedValue([
      providerRow({ id: "pinned", latitude: 6.9271, longitude: 79.8612 }),
      providerRow({ id: "unpinned" }),
    ]);
    const res = await req("/api/providers");
    expect(res.status).toBe(200);
    const body = await res.json();
    const pinned = body.providers.find((p: { id: string }) => p.id === "pinned");
    const unpinned = body.providers.find((p: { id: string }) => p.id === "unpinned");
    // The same already-public pair the detail payloads carry — the map view
    // (search RFC phase 3) places card markers from it.
    expect(pinned.latitude).toBe(6.9271);
    expect(pinned.longitude).toBe(79.8612);
    expect(unpinned).not.toHaveProperty("latitude");
    expect(unpinned).not.toHaveProperty("longitude");
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

  // Verified-email gate (#115): a signed-in caller must confirm their email
  // before contacting a provider; anonymous visitors are still allowed.
  it("403 for a signed-in user whose email is not verified — no inquiry created", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1", contactEmail: "n@baas.lk" });
    vi.mocked(isEmailVerified).mockResolvedValue(false);
    const res = await req("/api/providers/p1/inquiries", {
      method: "POST",
      body: valid,
      role: "CUSTOMER",
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/verify your email/i);
    expect(dbMock.inquiry.create).not.toHaveBeenCalled();
    expect(emitNotification).not.toHaveBeenCalled();
  });

  it("does NOT gate an anonymous visitor's inquiry on email verification", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1", contactEmail: "n@baas.lk" });
    dbMock.inquiry.create.mockResolvedValue({ id: "inq1" });
    const res = await req("/api/providers/p1/inquiries", { method: "POST", body: valid });
    expect(res.status).toBe(200);
    // The gate lookup is never made for an unauthenticated caller.
    expect(isEmailVerified).not.toHaveBeenCalled();
    expect(dbMock.inquiry.create).toHaveBeenCalled();
  });

  it("502 when the email-verification lookup fails — inquiry not created", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1", contactEmail: "n@baas.lk" });
    vi.mocked(isEmailVerified).mockRejectedValue(new Error("identity down"));
    const res = await req("/api/providers/p1/inquiries", {
      method: "POST",
      body: valid,
      role: "CUSTOMER",
    });
    expect(res.status).toBe(502);
    expect(dbMock.inquiry.create).not.toHaveBeenCalled();
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
    expect(emitNotification).not.toHaveBeenCalled();
  });

  // NEW_INQUIRY notification (#394): the provider owner gets an in-app +
  // email notification through the generic ingestion event, addressed by
  // userId + denormalized contactEmail, linking to the new thread.
  it("emits a NEW_INQUIRY event to the provider owner on create", async () => {
    dbMock.provider.findUnique.mockResolvedValue({
      id: "p1",
      userId: "owner-1",
      contactEmail: "n@baas.lk",
    });
    dbMock.inquiry.create.mockResolvedValue({ id: "inq1" });
    const res = await req("/api/providers/p1/inquiries", { method: "POST", body: valid });
    expect(res.status).toBe(200);
    expect(emitNotification).toHaveBeenCalledWith({
      type: "NEW_INQUIRY",
      recipients: [{ userId: "owner-1", email: "n@baas.lk", locale: "en" }],
      payload: { customerName: valid.name },
      link: "/dashboard/inquiries/inq1",
      origin: expect.any(String),
    });
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
    expect(emitNotification).toHaveBeenCalled();
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
