// Provider dashboard authorization tests (#257). Every route is gated by
// getCurrentProvider: the caller must be role PROVIDER *and* own a provider
// row. Beyond that, per-resource routes enforce ownership — a service/photo/
// inquiry belonging to a different provider must 404, never mutate. Prisma,
// storage and the S2S clients are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    provider: { findUnique: vi.fn(), update: vi.fn() },
    service: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    workPhoto: { findUnique: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
    inquiry: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    inquiryMessage: { groupBy: vi.fn() },
    // Content filter (#375): the auto-report path files a SYSTEM report on
    // the provider when profile/service text matches the denylist.
    report: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../db", () => ({ db: dbMock }));
// Search-index pushes (search RFC) are fired (not awaited) from these routes.
vi.mock("../lib/search-index", () => ({
  buildIndexDocument: vi.fn(() => ({})),
  INDEX_SERVICE_SELECT: { title: true, price: true },
  syncProviderIndex: vi.fn(() => Promise.resolve()),
  syncProviderIndexByUser: vi.fn(() => Promise.resolve()),
  deleteProviderIndex: vi.fn(() => Promise.resolve()),
}));
vi.mock("../lib/clients", () => ({
  fetchEmailVerified: vi.fn().mockResolvedValue("2026-01-01"),
  fetchOpenJobsCount: vi.fn().mockResolvedValue(0),
  fetchRatings: vi.fn().mockResolvedValue({}),
  syncIdentityProfile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/storage", () => ({
  ALLOWED_IMAGE_TYPES: new Set(["image/jpeg", "image/png", "image/webp"]),
  MAX_UPLOAD_SIZE: 5 * 1024 * 1024,
  InvalidImageError: class extends Error {},
  removeStoredFile: vi.fn().mockResolvedValue(undefined),
  storeImage: vi.fn().mockResolvedValue("/files/x.jpg"),
  validateImage: vi.fn().mockReturnValue(null),
}));

import { app } from "../app";
import { fetchOpenJobsCount } from "../lib/clients";

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
    headers["x-user-id"] = opts.userId ?? "owner-1";
    headers["x-user-role"] = opts.role;
    headers["x-user-name"] = "Prov";
  }
  return app.request(path, {
    method: opts.method ?? "GET",
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

const MY_PROVIDER = { id: "prov1", userId: "owner-1", category: "plumbing", district: "Colombo" };

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.inquiryMessage.groupBy.mockResolvedValue([]);
});

describe("getCurrentProvider gate", () => {
  it("GET /api/provider/dashboard: 401 when unauthenticated", async () => {
    const res = await req("/api/provider/dashboard");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(dbMock.provider.findUnique).not.toHaveBeenCalled();
  });

  it("GET /api/provider/dashboard: 401 for a CUSTOMER (wrong role)", async () => {
    const res = await req("/api/provider/dashboard", { role: "CUSTOMER" });
    expect(res.status).toBe(401);
    // getCurrentProvider short-circuits on role before touching the DB.
    expect(dbMock.provider.findUnique).not.toHaveBeenCalled();
  });

  it("GET /api/provider/dashboard: 401 for an ADMIN (not a provider role)", async () => {
    const res = await req("/api/provider/dashboard", { role: "ADMIN" });
    expect(res.status).toBe(401);
  });

  it("GET /api/provider/dashboard: 401 when the PROVIDER owns no provider row", async () => {
    dbMock.provider.findUnique.mockResolvedValue(null);
    const res = await req("/api/provider/dashboard", { role: "PROVIDER" });
    expect(res.status).toBe(401);
  });

  it("GET /api/provider/dashboard: 200 for an owning PROVIDER", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.service.findMany.mockResolvedValue([]);
    dbMock.workPhoto.findMany.mockResolvedValue([]);
    dbMock.inquiry.findMany.mockResolvedValue([]);
    dbMock.inquiry.count.mockResolvedValue(0);
    const res = await req("/api/provider/dashboard", { role: "PROVIDER" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider.id).toBe("prov1");
    expect(body).toHaveProperty("openJobsCount");
  });

  it("GET /api/provider/dashboard: counts open jobs across the served set (#502)", async () => {
    dbMock.provider.findUnique.mockResolvedValue({
      ...MY_PROVIDER,
      serviceDistricts: ["Colombo", "Gampaha"],
    });
    dbMock.service.findMany.mockResolvedValue([]);
    dbMock.workPhoto.findMany.mockResolvedValue([]);
    dbMock.inquiry.findMany.mockResolvedValue([]);
    dbMock.inquiry.count.mockResolvedValue(0);
    const res = await req("/api/provider/dashboard", { role: "PROVIDER" });
    expect(res.status).toBe(200);
    expect(vi.mocked(fetchOpenJobsCount)).toHaveBeenCalledWith(
      "plumbing",
      ["Colombo", "Gampaha"],
      "owner-1"
    );
  });

  it("GET /api/provider/dashboard: falls back to [district] for a pre-#502 row", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.service.findMany.mockResolvedValue([]);
    dbMock.workPhoto.findMany.mockResolvedValue([]);
    dbMock.inquiry.findMany.mockResolvedValue([]);
    dbMock.inquiry.count.mockResolvedValue(0);
    const res = await req("/api/provider/dashboard", { role: "PROVIDER" });
    expect(res.status).toBe(200);
    expect(vi.mocked(fetchOpenJobsCount)).toHaveBeenCalledWith(
      "plumbing",
      ["Colombo"],
      "owner-1"
    );
  });

  it("GET /api/provider/dashboard: embeds only the first inquiries page + totals (#372)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.service.findMany.mockResolvedValue([]);
    dbMock.workPhoto.findMany.mockResolvedValue([]);
    dbMock.inquiry.findMany.mockResolvedValue([]);
    // Two counts: the whole inbox, then the NEW subset.
    dbMock.inquiry.count.mockResolvedValueOnce(57).mockResolvedValueOnce(4);
    const res = await req("/api/provider/dashboard", { role: "PROVIDER" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider.inquiriesTotal).toBe(57);
    expect(body.provider.newInquiriesCount).toBe(4);
    expect(dbMock.inquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 })
    );
    expect(dbMock.inquiry.count).toHaveBeenCalledWith({
      where: { providerId: "prov1", status: "NEW" },
    });
  });
});

describe("GET /api/provider/inquiries — pagination (#372)", () => {
  beforeEach(() => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.inquiry.findMany.mockResolvedValue([]);
    dbMock.inquiry.count.mockResolvedValue(0);
  });

  it("defaults to page 1 of 20 and returns the compat envelope", async () => {
    dbMock.inquiry.count.mockResolvedValue(45);
    dbMock.inquiry.findMany.mockResolvedValue([
      {
        id: "inq1",
        providerId: "prov1",
        customerLastReadAt: null,
        providerLastReadAt: null,
      },
    ]);
    dbMock.inquiryMessage.groupBy.mockResolvedValue([
      { inquiryId: "inq1", _count: { _all: 3 } },
    ]);
    const res = await req("/api/provider/inquiries", { role: "PROVIDER" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(45);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(body.inquiries[0].unreadCount).toBe(3);
    expect(dbMock.inquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 })
    );
  });

  it("honors ?page/?pageSize", async () => {
    const res = await req("/api/provider/inquiries?page=3&pageSize=5", {
      role: "PROVIDER",
    });
    expect(res.status).toBe(200);
    expect(dbMock.inquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 })
    );
  });

  it("caps pageSize at 100 and falls back on junk input", async () => {
    const res = await req("/api/provider/inquiries?page=zero&pageSize=9999", {
      role: "PROVIDER",
    });
    expect(res.status).toBe(200);
    expect(dbMock.inquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 100 })
    );
  });
});

describe("service ownership", () => {
  beforeEach(() => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
  });

  const valid = { title: "Tap repair", price: 1500, priceType: "FIXED" };

  it("PUT /api/provider/services/:id: 404 when the service belongs to someone else", async () => {
    dbMock.service.findUnique.mockResolvedValue({ id: "s1", providerId: "OTHER" });
    const res = await req("/api/provider/services/s1", { method: "PUT", body: valid, role: "PROVIDER" });
    expect(res.status).toBe(404);
    expect(dbMock.service.update).not.toHaveBeenCalled();
  });

  it("DELETE /api/provider/services/:id: 404 when not the owner (no delete)", async () => {
    dbMock.service.findUnique.mockResolvedValue({ id: "s1", providerId: "OTHER" });
    const res = await req("/api/provider/services/s1", { method: "DELETE", role: "PROVIDER" });
    expect(res.status).toBe(404);
    expect(dbMock.service.delete).not.toHaveBeenCalled();
  });

  it("DELETE /api/provider/services/:id: deletes an owned service", async () => {
    dbMock.service.findUnique.mockResolvedValue({ id: "s1", providerId: "prov1" });
    dbMock.service.delete.mockResolvedValue({});
    const res = await req("/api/provider/services/s1", { method: "DELETE", role: "PROVIDER" });
    expect(res.status).toBe(200);
    expect(dbMock.service.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("POST /api/provider/services: serializes the Decimal price as a JSON number (#371)", async () => {
    // price is DECIMAL(12,2) in the DB, so Prisma hands the route a Decimal —
    // which would JSON-stringify as a string without the edge conversion.
    dbMock.service.create.mockResolvedValue({
      id: "s1",
      providerId: "prov1",
      title: valid.title,
      description: null,
      price: new Prisma.Decimal("1500.00"),
      priceType: "FIXED",
    });
    const res = await req("/api/provider/services", {
      method: "POST",
      body: valid,
      role: "PROVIDER",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service.price).toBe(1500);
    expect(typeof body.service.price).toBe("number");
  });
});

describe("photo ownership", () => {
  beforeEach(() => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
  });

  it("DELETE /api/provider/photos/:id: 404 when the photo belongs to another provider", async () => {
    dbMock.workPhoto.findUnique.mockResolvedValue({ id: "ph1", providerId: "OTHER", url: "/files/x.jpg" });
    const res = await req("/api/provider/photos/ph1", { method: "DELETE", role: "PROVIDER" });
    expect(res.status).toBe(404);
    expect(dbMock.workPhoto.delete).not.toHaveBeenCalled();
  });

  it("DELETE /api/provider/photos/:id: hard-deletes an owned photo (and its file)", async () => {
    dbMock.workPhoto.findUnique.mockResolvedValue({ id: "ph1", providerId: "prov1", url: "/files/x.jpg" });
    dbMock.workPhoto.delete.mockResolvedValue({});
    const res = await req("/api/provider/photos/ph1", { method: "DELETE", role: "PROVIDER" });
    expect(res.status).toBe(200);
    expect(dbMock.workPhoto.delete).toHaveBeenCalledWith({ where: { id: "ph1" } });
  });
});

describe("inquiry ownership", () => {
  beforeEach(() => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
  });

  it("PATCH /api/provider/inquiries/:id: 404 when the inquiry is for another provider", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue({ id: "inq1", providerId: "OTHER" });
    const res = await req("/api/provider/inquiries/inq1", {
      method: "PATCH",
      body: { status: "RESPONDED" },
      role: "PROVIDER",
    });
    expect(res.status).toBe(404);
    expect(dbMock.inquiry.update).not.toHaveBeenCalled();
  });

  it("PATCH /api/provider/inquiries/:id: stamps respondedAt on the first RESPONDED move", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue({ id: "inq1", providerId: "prov1", respondedAt: null });
    dbMock.inquiry.update.mockResolvedValue({ id: "inq1", status: "RESPONDED" });
    const res = await req("/api/provider/inquiries/inq1", {
      method: "PATCH",
      body: { status: "RESPONDED" },
      role: "PROVIDER",
    });
    expect(res.status).toBe(200);
    const arg = dbMock.inquiry.update.mock.calls[0][0];
    expect(arg.data.status).toBe("RESPONDED");
    expect(arg.data.respondedAt).toBeInstanceOf(Date);
  });

  it("PATCH /api/provider/inquiries/:id: does NOT rewrite respondedAt when already set", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue({
      id: "inq1",
      providerId: "prov1",
      respondedAt: new Date("2026-01-01"),
    });
    dbMock.inquiry.update.mockResolvedValue({ id: "inq1" });
    await req("/api/provider/inquiries/inq1", {
      method: "PATCH",
      body: { status: "RESPONDED" },
      role: "PROVIDER",
    });
    const arg = dbMock.inquiry.update.mock.calls[0][0];
    expect(arg.data).not.toHaveProperty("respondedAt");
  });
});

describe("PUT /api/provider/profile — bilingual content (#515)", () => {
  const baseBody = {
    name: "Ann Silva",
    phone: "0771234567",
    category: "plumber",
    headline: "Reliable plumber",
    bio: "Twenty-plus characters of provider bio text here.",
    district: "Colombo",
    city: "Colombo",
    experience: 5,
    available: true,
  };

  it("persists the optional Sinhala headline/bio", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.provider.update.mockResolvedValue({ id: "prov1" });
    const res = await req("/api/provider/profile", {
      method: "PUT",
      role: "PROVIDER",
      body: {
        ...baseBody,
        headlineSi: "විශ්වාසවන්ත ජලනළ කාර්මිකයා",
        bioSi: "අවුරුදු දහයකට වැඩි පළපුරුද්දක් සහිත ජලනළ සේවා සපයයි.",
      },
    });
    expect(res.status).toBe(200);
    const arg = dbMock.provider.update.mock.calls[0][0];
    expect(arg.data.headlineSi).toBe("විශ්වාසවන්ත ජලනළ කාර්මිකයා");
    expect(arg.data.bioSi).toBe(
      "අවුරුදු දහයකට වැඩි පළපුරුද්දක් සහිත ජලනළ සේවා සපයයි."
    );
  });

  it("clears the Sinhala variants to null when omitted/empty", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.provider.update.mockResolvedValue({ id: "prov1" });
    const res = await req("/api/provider/profile", {
      method: "PUT",
      role: "PROVIDER",
      body: { ...baseBody, headlineSi: "", bioSi: "" },
    });
    expect(res.status).toBe(200);
    const arg = dbMock.provider.update.mock.calls[0][0];
    expect(arg.data.headlineSi).toBeNull();
    expect(arg.data.bioSi).toBeNull();
  });
});

describe("PUT /api/provider/profile — multi-district service area (#502)", () => {
  const baseBody = {
    name: "Ann Silva",
    phone: "0771234567",
    category: "plumber",
    headline: "Reliable plumber",
    bio: "Twenty-plus characters of provider bio text here.",
    district: "Colombo",
    city: "Colombo",
    experience: 5,
    available: true,
  };

  it("persists the served set, deduped with the primary district pinned first", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.provider.update.mockResolvedValue({ id: "prov1" });
    const res = await req("/api/provider/profile", {
      method: "PUT",
      role: "PROVIDER",
      body: { ...baseBody, serviceDistricts: ["Gampaha", "Colombo", "Gampaha"] },
    });
    expect(res.status).toBe(200);
    const arg = dbMock.provider.update.mock.calls[0][0];
    expect(arg.data.serviceDistricts).toEqual(["Colombo", "Gampaha"]);
  });

  it("collapses the served set to [district] when omitted", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.provider.update.mockResolvedValue({ id: "prov1" });
    const res = await req("/api/provider/profile", {
      method: "PUT",
      role: "PROVIDER",
      body: baseBody,
    });
    expect(res.status).toBe(200);
    const arg = dbMock.provider.update.mock.calls[0][0];
    expect(arg.data.serviceDistricts).toEqual(["Colombo"]);
  });

  it("400s when the union with the primary district exceeds the cap", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    const res = await req("/api/provider/profile", {
      method: "PUT",
      role: "PROVIDER",
      body: {
        ...baseBody,
        serviceDistricts: ["Gampaha", "Kalutara", "Kandy", "Galle", "Matara"],
      },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at most 5 districts/i);
    expect(dbMock.provider.update).not.toHaveBeenCalled();
  });

  it("400s on an unknown district in the served set", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    const res = await req("/api/provider/profile", {
      method: "PUT",
      role: "PROVIDER",
      body: { ...baseBody, serviceDistricts: ["Atlantis"] },
    });
    expect(res.status).toBe(400);
    expect(dbMock.provider.update).not.toHaveBeenCalled();
  });
});

// Geo capture (#48, search & discovery RFC phase 1): the optional map pin.
// Coordinates travel as a pair, bounded to the Sri Lanka box; absent leaves
// the stored pin untouched (the awayUntil contract) and explicit nulls clear.
describe("PUT /api/provider/profile — map pin (#48)", () => {
  const baseBody = {
    name: "Ann Silva",
    phone: "0771234567",
    category: "plumber",
    headline: "Reliable plumber",
    bio: "Twenty-plus characters of provider bio text here.",
    district: "Colombo",
    city: "Colombo",
    experience: 5,
    available: true,
  };

  it("persists an in-bounds coordinate pair", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.provider.update.mockResolvedValue({ id: "prov1" });
    const res = await req("/api/provider/profile", {
      method: "PUT",
      role: "PROVIDER",
      body: { ...baseBody, latitude: 6.9271, longitude: 79.8612 },
    });
    expect(res.status).toBe(200);
    const arg = dbMock.provider.update.mock.calls[0][0];
    expect(arg.data.latitude).toBe(6.9271);
    expect(arg.data.longitude).toBe(79.8612);
  });

  it("clears the pin on explicit nulls", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.provider.update.mockResolvedValue({ id: "prov1" });
    const res = await req("/api/provider/profile", {
      method: "PUT",
      role: "PROVIDER",
      body: { ...baseBody, latitude: null, longitude: null },
    });
    expect(res.status).toBe(200);
    const arg = dbMock.provider.update.mock.calls[0][0];
    expect(arg.data.latitude).toBeNull();
    expect(arg.data.longitude).toBeNull();
  });

  it("leaves the stored pin untouched when both are absent", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.provider.update.mockResolvedValue({ id: "prov1" });
    const res = await req("/api/provider/profile", {
      method: "PUT",
      role: "PROVIDER",
      body: baseBody,
    });
    expect(res.status).toBe(200);
    const arg = dbMock.provider.update.mock.calls[0][0];
    expect(arg.data.latitude).toBeUndefined();
    expect(arg.data.longitude).toBeUndefined();
  });

  it("400s a lone latitude (half a pair)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    const res = await req("/api/provider/profile", {
      method: "PUT",
      role: "PROVIDER",
      body: { ...baseBody, latitude: 6.9271 },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/both latitude and longitude/i);
    expect(dbMock.provider.update).not.toHaveBeenCalled();
  });

  it("400s coordinates outside the Sri Lanka bounding box", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    const res = await req("/api/provider/profile", {
      method: "PUT",
      role: "PROVIDER",
      // London — nowhere near the box.
      body: { ...baseBody, latitude: 51.5072, longitude: -0.1276 },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/within Sri Lanka/i);
    expect(dbMock.provider.update).not.toHaveBeenCalled();
  });
});

// Write-time content filter (#375): a denylist hit on profile or service text
// auto-files a SYSTEM report on the provider; the write itself always
// succeeds (decision: auto-report and keep visible, never hard-block).
describe("content filter on profile/service text (#375)", () => {
  const baseBody = {
    name: "Ann Silva",
    phone: "0771234567",
    category: "plumber",
    headline: "Reliable plumber",
    bio: "Twenty-plus characters of provider bio text here.",
    district: "Colombo",
    city: "Colombo",
    experience: 5,
    available: true,
  };

  it("PUT profile: flags a denylist hit in the bio without blocking the save", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.provider.update.mockResolvedValue({ id: "prov1" });
    dbMock.report.findFirst.mockResolvedValue(null);
    const res = await req("/api/provider/profile", {
      method: "PUT",
      role: "PROVIDER",
      body: { ...baseBody, bio: "I do not work with those fucking agencies, ever." },
    });
    expect(res.status).toBe(200);
    expect(dbMock.provider.update).toHaveBeenCalledTimes(1);
    expect(dbMock.report.create).toHaveBeenCalledWith({
      data: {
        targetType: "PROVIDER",
        targetId: "prov1",
        reporterId: null,
        reason: "auto-flag: content filter",
        details: expect.stringContaining('matched "fucking" in bio'),
        source: "SYSTEM",
      },
    });
  });

  it("PUT profile: flags Sinhala bio text (bioSi) too", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.provider.update.mockResolvedValue({ id: "prov1" });
    dbMock.report.findFirst.mockResolvedValue(null);
    const res = await req("/api/provider/profile", {
      method: "PUT",
      role: "PROVIDER",
      body: { ...baseBody, bioSi: "අනිත් කට්ටිය ඔක්කොම වේසි වැඩ කරන අය" },
    });
    expect(res.status).toBe(200);
    const arg = dbMock.report.create.mock.calls[0][0] as { data: { details: string } };
    expect(arg.data.details).toContain("වේසි");
  });

  it("PUT profile: clean text never touches the reports table", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.provider.update.mockResolvedValue({ id: "prov1" });
    const res = await req("/api/provider/profile", {
      method: "PUT",
      role: "PROVIDER",
      body: baseBody,
    });
    expect(res.status).toBe(200);
    expect(dbMock.report.findFirst).not.toHaveBeenCalled();
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });

  it("POST services: flags a denylist hit in the description (PROVIDER target)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.service.create.mockResolvedValue({ id: "s1" });
    dbMock.report.findFirst.mockResolvedValue(null);
    const res = await req("/api/provider/services", {
      method: "POST",
      role: "PROVIDER",
      body: {
        title: "Pipe repairs",
        description: "hutta wage wada naha, quality service only",
        price: 2500,
        priceType: "FIXED",
      },
    });
    expect(res.status).toBe(200);
    expect(dbMock.service.create).toHaveBeenCalledTimes(1);
    const arg = dbMock.report.create.mock.calls[0][0] as {
      data: { targetType: string; targetId: string; details: string };
    };
    expect(arg.data.targetType).toBe("PROVIDER");
    expect(arg.data.targetId).toBe("prov1");
    expect(arg.data.details).toContain("hutta");
  });

  it("refreshes an existing OPEN SYSTEM report instead of stacking duplicates", async () => {
    dbMock.provider.findUnique.mockResolvedValue(MY_PROVIDER);
    dbMock.provider.update.mockResolvedValue({ id: "prov1" });
    dbMock.report.findFirst.mockResolvedValue({ id: "rep1" });
    const res = await req("/api/provider/profile", {
      method: "PUT",
      role: "PROVIDER",
      body: { ...baseBody, bio: "I do not work with those fucking agencies, ever." },
    });
    expect(res.status).toBe(200);
    expect(dbMock.report.create).not.toHaveBeenCalled();
    expect(dbMock.report.update).toHaveBeenCalledWith({
      where: { id: "rep1" },
      data: { details: expect.stringContaining('matched "fucking"') },
    });
  });
});

// Verification documents are PII (NIC / business-registration scans). The
// gateway routes /api/files/provider/verification/* here instead of to the
// public media path (#500); only ADMIN/SUPPORT may fetch the bytes, which this
// route pulls from media over S2S. The stored URL IS the request path, so the
// route hands it straight to media's raw endpoint.
describe("GET /api/files/provider/verification/* (admin-gated PII, #500)", () => {
  const url = "/api/files/provider/verification/doc-1.jpg";

  afterEach(() => vi.restoreAllMocks());

  it.each<Role>([null, "CUSTOMER", "PROVIDER"])(
    "403 for role=%s (not an admin/support session)",
    async (role) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const res = await req(url, role ? { role } : {});
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
      // Never reaches media when the caller is unauthorized.
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it.each<Role>(["ADMIN", "SUPPORT"])(
    "streams the document for role=%s, fetching it from media with the same url",
    async (role) => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { "content-type": "image/jpeg" },
          })
        );
      const res = await req(url, { role });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect((await res.arrayBuffer()).byteLength).toBe(3);
      expect(fetchSpy).toHaveBeenCalledOnce();
      const calledUrl = String(fetchSpy.mock.calls[0][0]);
      expect(calledUrl).toContain("/internal/media/raw?url=");
      expect(calledUrl).toContain(encodeURIComponent(url));
    }
  );

  it("404 when media has no such document", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 404 })
    );
    const res = await req(url, { role: "ADMIN" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});
