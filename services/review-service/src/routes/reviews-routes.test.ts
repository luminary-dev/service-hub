// Route-handler tests for the review-service endpoints NOT already covered by
// reviews.test.ts (the #25 interaction gate) or app.test.ts (the /internal S2S
// contracts). This file exercises: the public provider-reviews listing
// (including the suspended-provider 404 and degrade-open paths), the
// create path's provider-summary branches (not-found / suspended / own-profile
// / upstream) and photo-cap guard, review-photo deletion authorization, the
// admin soft-delete + restore ADMIN gate, the customer account review history,
// abuse-report creation, and the admin review-reports queue with its
// SUPPORT/ADMIN authorization. Prisma + the media storage helper are mocked and
// s2s is stubbed per path — no live DB or network.
import { beforeEach, describe, expect, it, vi } from "vitest";

// Keep lib/http real (so requireInternalSecret + getAuth run) but stub s2s.
vi.mock("../lib/http", async (importActual) => {
  const actual = await importActual<typeof import("../lib/http")>();
  return { ...actual, s2s: vi.fn() };
});

// Keep the storage module real for InvalidImageError/validate/store, but make
// the best-effort file removal a no-op we can assert on.
vi.mock("../lib/storage", async (importActual) => {
  const actual = await importActual<typeof import("../lib/storage")>();
  return { ...actual, removeStoredFile: vi.fn().mockResolvedValue(undefined) };
});

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    review: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    reviewPhoto: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    report: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    adminAuditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("../db", () => ({ db: dbMock }));

import { app } from "../app";
import { s2s } from "../lib/http";
import { removeStoredFile } from "../lib/storage";

const SECRET = "dev-internal-secret";
const PROVIDER_ID = "prov_1";
const OWNER_ID = "user_owner";
const REVIEWER_ID = "user_reviewer";

const s2sMock = vi.mocked(s2s);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Route s2s calls by path. `summary` controls the provider-summary lookup;
// `interaction` controls the #25 inquiry-exists check; provider/user batch
// hydration returns an empty set by default.
function wireS2s(opts: {
  summary?: "ok" | "suspended" | "null" | "404" | "502" | "throw";
  interaction?: boolean;
  providers?: { id: string; contactName: string }[];
} = {}) {
  const { summary = "ok", interaction = true, providers = [] } = opts;
  s2sMock.mockImplementation(async (_base: string, path: string) => {
    if (path.includes("/summary")) {
      if (summary === "throw") throw new Error("network down");
      if (summary === "502") return new Response("boom", { status: 503 });
      if (summary === "404") return json({ provider: null }, 404);
      if (summary === "null") return json({ provider: null });
      if (summary === "suspended")
        return json({ provider: { id: PROVIDER_ID, userId: OWNER_ID, suspended: true } });
      return json({ provider: { id: PROVIDER_ID, userId: OWNER_ID, suspended: false } });
    }
    if (path.includes("/internal/inquiries/exists")) return json({ exists: interaction });
    if (path.includes("/internal/providers?ids=")) return json({ providers });
    if (path.includes("/internal/users?ids=")) return json({ users: [] });
    throw new Error(`unexpected s2s path: ${path}`);
  });
}

function req(path: string, init: RequestInit = {}, headers: Record<string, string> = {}) {
  return app.request(path, {
    ...init,
    headers: { "x-internal-secret": SECRET, ...headers, ...(init.headers as object) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  wireS2s();
});

describe("GET /api/providers/:id/reviews (public listing)", () => {
  it("serves the paginated page when the provider exists", async () => {
    dbMock.review.findMany.mockResolvedValue([]);
    const res = await req(`/api/providers/${PROVIDER_ID}/reviews`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reviews: [], nextCursor: null });
  });

  it("404s for a suspended provider", async () => {
    wireS2s({ summary: "suspended" });
    const res = await req(`/api/providers/${PROVIDER_ID}/reviews`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Provider not found");
    expect(dbMock.review.findMany).not.toHaveBeenCalled();
  });

  it("degrades open (still serves) when the provider summary lookup throws", async () => {
    wireS2s({ summary: "throw" });
    dbMock.review.findMany.mockResolvedValue([]);
    const res = await req(`/api/providers/${PROVIDER_ID}/reviews`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reviews: [], nextCursor: null });
  });
});

describe("POST /api/providers/:id/reviews (summary + photo branches)", () => {
  function postReview(headers: Record<string, string>, photos = 0) {
    const form = new FormData();
    form.set("rating", "5");
    form.set("comment", "Great, tidy work.");
    for (let i = 0; i < photos; i++) {
      form.append("photos", new File(["x"], `p${i}.jpg`, { type: "image/jpeg" }));
    }
    return req(
      `/api/providers/${PROVIDER_ID}/reviews`,
      { method: "POST", body: form },
      { "x-user-id": REVIEWER_ID, ...headers }
    );
  }

  it("404s when the provider does not exist", async () => {
    wireS2s({ summary: "null" });
    const res = await postReview({});
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Provider not found");
  });

  it("404s for a suspended provider before the interaction check", async () => {
    wireS2s({ summary: "suspended" });
    const res = await postReview({});
    expect(res.status).toBe(404);
    // Interaction gate is never consulted once the provider is 404'd.
    expect(s2sMock.mock.calls.every(([, p]) => !p.includes("inquiries"))).toBe(true);
  });

  it("400s when reviewing your own profile", async () => {
    const res = await postReview({ "x-user-id": OWNER_ID });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("You cannot review your own profile");
  });

  it("502s when the provider summary lookup returns a server error", async () => {
    wireS2s({ summary: "502" });
    const res = await postReview({});
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Upstream service unavailable" });
  });

  it("400s when the photo batch exceeds the per-review cap", async () => {
    // Gate passes; existing review already has 0 photos so remaining = 3.
    dbMock.review.findUnique.mockResolvedValue({ _count: { photos: 0 } });
    const res = await postReview({}, 4);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at most 3 photos/i);
  });
});

describe("DELETE /api/reviews/photos/:id", () => {
  it("401s without a session", async () => {
    const res = await req("/api/reviews/photos/ph1", { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("404s when the photo does not exist", async () => {
    dbMock.reviewPhoto.findUnique.mockResolvedValue(null);
    const res = await req("/api/reviews/photos/ph1", { method: "DELETE" }, {
      "x-user-id": REVIEWER_ID,
    });
    expect(res.status).toBe(404);
  });

  it("403s when the caller is neither the author nor an admin", async () => {
    dbMock.reviewPhoto.findUnique.mockResolvedValue({
      id: "ph1",
      url: "u",
      review: { userId: "someone_else" },
    });
    const res = await req("/api/reviews/photos/ph1", { method: "DELETE" }, {
      "x-user-id": REVIEWER_ID,
    });
    expect(res.status).toBe(403);
    expect(dbMock.reviewPhoto.delete).not.toHaveBeenCalled();
  });

  it("lets the author delete their own photo", async () => {
    dbMock.reviewPhoto.findUnique.mockResolvedValue({
      id: "ph1",
      url: "reviews/ph1.jpg",
      review: { userId: REVIEWER_ID },
    });
    const res = await req("/api/reviews/photos/ph1", { method: "DELETE" }, {
      "x-user-id": REVIEWER_ID,
    });
    expect(res.status).toBe(200);
    expect(dbMock.reviewPhoto.delete).toHaveBeenCalledWith({ where: { id: "ph1" } });
    expect(vi.mocked(removeStoredFile)).toHaveBeenCalledWith("reviews/ph1.jpg");
  });

  it("lets an admin moderate any photo", async () => {
    dbMock.reviewPhoto.findUnique.mockResolvedValue({
      id: "ph1",
      url: "u",
      review: { userId: "another_user" },
    });
    const res = await req("/api/reviews/photos/ph1", { method: "DELETE" }, {
      "x-user-id": "admin_1",
      "x-user-role": "ADMIN",
    });
    expect(res.status).toBe(200);
  });
});

describe("admin soft-delete + restore (ADMIN only)", () => {
  it("403s a SUPPORT user on DELETE /api/admin/reviews/:id", async () => {
    const res = await req("/api/admin/reviews/rev1", { method: "DELETE" }, {
      "x-user-id": "sup_1",
      "x-user-role": "SUPPORT",
    });
    expect(res.status).toBe(403);
    expect(dbMock.review.updateMany).not.toHaveBeenCalled();
  });

  it("soft-deletes for an ADMIN and writes an audit entry", async () => {
    dbMock.review.updateMany.mockResolvedValue({ count: 1 });
    const res = await req("/api/admin/reviews/rev1", { method: "DELETE" }, {
      "x-user-id": "admin_1",
      "x-user-role": "ADMIN",
    });
    expect(res.status).toBe(200);
    expect(dbMock.review.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rev1" } })
    );
    expect(dbMock.adminAuditLog.create).toHaveBeenCalled();
  });

  it("403s a non-admin on the restore route", async () => {
    const res = await req("/api/admin/reviews/rev1/restore", { method: "PATCH" }, {
      "x-user-id": REVIEWER_ID,
    });
    expect(res.status).toBe(403);
  });

  it("restores for an ADMIN", async () => {
    dbMock.review.updateMany.mockResolvedValue({ count: 1 });
    const res = await req("/api/admin/reviews/rev1/restore", { method: "PATCH" }, {
      "x-user-id": "admin_1",
      "x-user-role": "ADMIN",
    });
    expect(res.status).toBe(200);
    expect(dbMock.review.updateMany).toHaveBeenCalledWith({
      where: { id: "rev1" },
      data: { deletedAt: null },
    });
  });
});

describe("GET /api/account/reviews (account history)", () => {
  it("401s without a session", async () => {
    const res = await req("/api/account/reviews");
    expect(res.status).toBe(401);
  });

  it("returns the caller's reviews with hydrated provider names", async () => {
    dbMock.review.findMany.mockResolvedValue([
      {
        id: "rev1",
        rating: 5,
        comment: "good",
        verified: true,
        createdAt: new Date("2026-01-01"),
        providerId: PROVIDER_ID,
        photos: [{ id: "ph1", url: "u", createdAt: new Date() }],
      },
    ]);
    wireS2s({ providers: [{ id: PROVIDER_ID, contactName: "Acme Co" }] });
    const res = await req("/api/account/reviews", {}, { "x-user-id": REVIEWER_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reviews[0].provider).toEqual({ id: PROVIDER_ID, name: "Acme Co" });
    expect(body.reviews[0].photos).toEqual([{ id: "ph1", url: "u" }]);
  });

  it("falls back to 'Unknown' when provider hydration fails", async () => {
    dbMock.review.findMany.mockResolvedValue([
      {
        id: "rev1",
        rating: 4,
        comment: "ok",
        verified: false,
        createdAt: new Date(),
        providerId: PROVIDER_ID,
        photos: [],
      },
    ]);
    s2sMock.mockRejectedValue(new Error("identity down"));
    const res = await req("/api/account/reviews", {}, { "x-user-id": REVIEWER_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reviews[0].provider.name).toBe("Unknown");
  });
});

describe("POST /api/reviews/:id/report (abuse reports)", () => {
  it("404s when the review is missing or soft-deleted", async () => {
    dbMock.review.findUnique.mockResolvedValue({ id: "rev1", deletedAt: new Date() });
    const res = await req("/api/reviews/rev1/report", {
      method: "POST",
      body: JSON.stringify({ reason: "spam" }),
    });
    expect(res.status).toBe(404);
  });

  it("400s on an invalid reason", async () => {
    dbMock.review.findUnique.mockResolvedValue({ id: "rev1", deletedAt: null });
    const res = await req("/api/reviews/rev1/report", {
      method: "POST",
      body: JSON.stringify({ reason: "not-a-reason" }),
    });
    expect(res.status).toBe(400);
  });

  it("creates a report for an anonymous reporter", async () => {
    dbMock.review.findUnique.mockResolvedValue({ id: "rev1", deletedAt: null });
    const res = await req("/api/reviews/rev1/report", {
      method: "POST",
      body: JSON.stringify({ reason: "scam", details: "fraud" }),
    });
    expect(res.status).toBe(200);
    expect(dbMock.report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: "REVIEW",
        targetId: "rev1",
        reporterId: null,
        reason: "scam",
      }),
    });
  });

  it("refreshes an existing OPEN report instead of duplicating for a signed-in user", async () => {
    dbMock.review.findUnique.mockResolvedValue({ id: "rev1", deletedAt: null });
    dbMock.report.findFirst.mockResolvedValue({ id: "rep1" });
    const res = await req(
      "/api/reviews/rev1/report",
      { method: "POST", body: JSON.stringify({ reason: "fake" }) },
      { "x-user-id": REVIEWER_ID }
    );
    expect(res.status).toBe(200);
    expect(dbMock.report.update).toHaveBeenCalledWith({
      where: { id: "rep1" },
      data: { reason: "fake", details: null },
    });
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });
});

describe("admin review-reports queue (SUPPORT + ADMIN)", () => {
  it("403s a plain CUSTOMER", async () => {
    const res = await req("/api/admin/review-reports", {}, { "x-user-id": REVIEWER_ID });
    expect(res.status).toBe(403);
  });

  it("serves the queue for a SUPPORT user", async () => {
    dbMock.report.count.mockResolvedValue(1);
    dbMock.report.findMany.mockResolvedValue([
      { id: "rep1", targetId: "rev1", status: "OPEN", createdAt: new Date() },
    ]);
    dbMock.review.findMany.mockResolvedValue([]);
    const res = await req(
      "/api/admin/review-reports?status=OPEN",
      {},
      { "x-user-id": "sup_1", "x-user-role": "SUPPORT" }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    // Report whose review was hard-deleted hydrates target: null.
    expect(body.reports[0].target).toBeNull();
  });

  it("serves the queue for an ADMIN (no status filter → OPEN then closed)", async () => {
    dbMock.report.count.mockResolvedValue(0);
    dbMock.report.findMany.mockResolvedValue([]);
    const res = await req(
      "/api/admin/review-reports",
      {},
      { "x-user-id": "admin_1", "x-user-role": "ADMIN" }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(
      expect.objectContaining({ reports: [], total: 0 })
    );
  });

  it("short-circuits to an empty page for a non-REVIEW targetType filter", async () => {
    const res = await req(
      "/api/admin/review-reports?targetType=PROVIDER",
      {},
      { "x-user-id": "admin_1", "x-user-role": "ADMIN" }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(
      expect.objectContaining({ reports: [], total: 0 })
    );
    expect(dbMock.report.findMany).not.toHaveBeenCalled();
  });

  it("403s a CUSTOMER on the count endpoint but serves SUPPORT", async () => {
    const denied = await req(
      "/api/admin/review-reports/count",
      {},
      { "x-user-id": REVIEWER_ID }
    );
    expect(denied.status).toBe(403);

    dbMock.report.count.mockResolvedValue(3);
    const ok = await req(
      "/api/admin/review-reports/count",
      {},
      { "x-user-id": "sup_1", "x-user-role": "SUPPORT" }
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ openReports: 3 });
  });
});

describe("PATCH /api/admin/review-reports/:id (resolve / dismiss)", () => {
  it("403s a plain CUSTOMER", async () => {
    const res = await req(
      "/api/admin/review-reports/rep1",
      { method: "PATCH", body: JSON.stringify({ status: "RESOLVED" }) },
      { "x-user-id": REVIEWER_ID }
    );
    expect(res.status).toBe(403);
  });

  it("400s on an invalid status", async () => {
    const res = await req(
      "/api/admin/review-reports/rep1",
      { method: "PATCH", body: JSON.stringify({ status: "MAYBE" }) },
      { "x-user-id": "sup_1", "x-user-role": "SUPPORT" }
    );
    expect(res.status).toBe(400);
  });

  it("404s when no report matches", async () => {
    dbMock.report.updateMany.mockResolvedValue({ count: 0 });
    const res = await req(
      "/api/admin/review-reports/rep1",
      { method: "PATCH", body: JSON.stringify({ status: "DISMISSED" }) },
      { "x-user-id": "sup_1", "x-user-role": "SUPPORT" }
    );
    expect(res.status).toBe(404);
  });

  it("resolves a report and writes an audit entry", async () => {
    dbMock.report.updateMany.mockResolvedValue({ count: 1 });
    const res = await req(
      "/api/admin/review-reports/rep1",
      { method: "PATCH", body: JSON.stringify({ status: "RESOLVED" }) },
      { "x-user-id": "sup_1", "x-user-role": "SUPPORT" }
    );
    expect(res.status).toBe(200);
    expect(dbMock.adminAuditLog.create).toHaveBeenCalled();
  });
});
