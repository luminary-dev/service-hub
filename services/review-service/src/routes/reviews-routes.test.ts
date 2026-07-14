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
      groupBy: vi.fn(),
    },
    reviewPhoto: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    reviewResponse: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
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
    adminAuditLog: { create: vi.fn(), findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
// Search-index rating pushes (search RFC) are fired (not awaited) from the
// review write/moderation paths.
vi.mock("../lib/search-index", () => ({
  pushRatingsToSearchIndex: vi.fn(() => Promise.resolve()),
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

// The public reviews GET now folds in a rating `summary` (#528). With no
// review rows the two grouped queries return [] and the summary zero-fills.
const EMPTY_SUMMARY = {
  rating: 0,
  count: 0,
  dimensions: { quality: null, punctuality: null, value: null, communication: null },
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

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
  // Default: no reviews → the rating-summary groupBys return nothing.
  dbMock.review.groupBy.mockResolvedValue([]);
});

describe("GET /api/providers/:id/reviews (public listing)", () => {
  it("serves the paginated page plus a rating summary when the provider exists", async () => {
    dbMock.review.findMany.mockResolvedValue([]);
    const res = await req(`/api/providers/${PROVIDER_ID}/reviews`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      reviews: [],
      nextCursor: null,
      summary: EMPTY_SUMMARY,
    });
  });

  it("aggregates the rating summary over all reviews (dimensions + distribution)", async () => {
    dbMock.review.findMany.mockResolvedValue([]);
    dbMock.review.groupBy.mockImplementation(async (args: { by: string[] }) => {
      if (args.by.includes("rating")) {
        return [
          { providerId: PROVIDER_ID, rating: 5, _count: { _all: 2 } },
          { providerId: PROVIDER_ID, rating: 3, _count: { _all: 1 } },
        ];
      }
      return [
        {
          providerId: PROVIDER_ID,
          _avg: {
            rating: 13 / 3,
            quality: 4.5,
            punctuality: null,
            value: 4,
            communication: 5,
          },
          _count: { _all: 3 },
        },
      ];
    });
    const res = await req(`/api/providers/${PROVIDER_ID}/reviews`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toEqual({
      rating: 13 / 3,
      count: 3,
      dimensions: { quality: 4.5, punctuality: null, value: 4, communication: 5 },
      distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 2 },
    });
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
    expect(await res.json()).toEqual({
      reviews: [],
      nextCursor: null,
      summary: EMPTY_SUMMARY,
    });
  });

  it("never leaks the reviewer's userId or deletedAt in the public payload (audit L6)", async () => {
    dbMock.review.findMany.mockResolvedValue([
      {
        id: "rev1",
        providerId: PROVIDER_ID,
        userId: REVIEWER_ID,
        rating: 5,
        comment: "Great, tidy work.",
        verified: true,
        deletedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        photos: [
          { id: "ph1", url: "reviews/ph1.jpg", createdAt: new Date("2026-01-01T00:00:00Z") },
        ],
        response: {
          id: "resp1",
          reviewId: "rev1",
          text: "Thank you!",
          createdAt: new Date("2026-01-02T00:00:00Z"),
          updatedAt: new Date("2026-01-02T00:00:00Z"),
        },
      },
    ]);
    const res = await req(`/api/providers/${PROVIDER_ID}/reviews`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reviews).toHaveLength(1);
    const [review] = body.reviews;
    expect(review).not.toHaveProperty("userId");
    expect(review).not.toHaveProperty("deletedAt");
    // No userId hiding in any nested field a scraper could parse out.
    expect(JSON.stringify(body)).not.toContain(REVIEWER_ID);
    expect(review).toMatchObject({
      id: "rev1",
      rating: 5,
      comment: "Great, tidy work.",
      verified: true,
      user: { name: "Unknown" },
      // The provider's public reply (#395) rides along, projected to
      // text + timestamps only.
      response: { text: "Thank you!" },
    });
    expect(review.response).not.toHaveProperty("id");
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

// Provider responses (#395): one public reply per review, gated on the caller
// owning the reviewed provider profile (checked S2S, fail-loud on the write
// path like review creation).
describe("POST/DELETE /api/reviews/:id/response", () => {
  const REVIEW_ROW = {
    id: "rev1",
    providerId: PROVIDER_ID,
    deletedAt: null,
  };

  function postResponse(text: string, headers: Record<string, string> = {}) {
    return req(
      "/api/reviews/rev1/response",
      { method: "POST", body: JSON.stringify({ text }) },
      { "x-user-id": OWNER_ID, ...headers }
    );
  }

  it("401s without a session", async () => {
    const res = await req("/api/reviews/rev1/response", {
      method: "POST",
      body: JSON.stringify({ text: "Thank you!" }),
    });
    expect(res.status).toBe(401);
  });

  it("404s when the review is missing or soft-deleted", async () => {
    dbMock.review.findUnique.mockResolvedValue(null);
    expect((await postResponse("Thank you!")).status).toBe(404);

    dbMock.review.findUnique.mockResolvedValue({
      ...REVIEW_ROW,
      deletedAt: new Date(),
    });
    expect((await postResponse("Thank you!")).status).toBe(404);
    expect(dbMock.reviewResponse.upsert).not.toHaveBeenCalled();
  });

  it("403s a caller who does not own the reviewed profile", async () => {
    dbMock.review.findUnique.mockResolvedValue(REVIEW_ROW);
    const res = await postResponse("Thank you!", { "x-user-id": REVIEWER_ID });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Only the reviewed provider can respond");
    expect(dbMock.reviewResponse.upsert).not.toHaveBeenCalled();
  });

  it("403s when the provider profile is suspended", async () => {
    wireS2s({ summary: "suspended" });
    dbMock.review.findUnique.mockResolvedValue(REVIEW_ROW);
    expect((await postResponse("Thank you!")).status).toBe(403);
  });

  it("502s (fail-loud) when the ownership check is unavailable", async () => {
    wireS2s({ summary: "throw" });
    dbMock.review.findUnique.mockResolvedValue(REVIEW_ROW);
    const res = await postResponse("Thank you!");
    expect(res.status).toBe(502);
    expect(dbMock.reviewResponse.upsert).not.toHaveBeenCalled();
  });

  it("400s on invalid text (too short / missing)", async () => {
    dbMock.review.findUnique.mockResolvedValue(REVIEW_ROW);
    expect((await postResponse("no")).status).toBe(400);
    const res = await req(
      "/api/reviews/rev1/response",
      { method: "POST", body: "not json" },
      { "x-user-id": OWNER_ID }
    );
    expect(res.status).toBe(400);
  });

  it("upserts the response for the profile owner (create-or-edit)", async () => {
    dbMock.review.findUnique.mockResolvedValue(REVIEW_ROW);
    const res = await postResponse("  Thank you for the kind words!  ");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // Text is trimmed; one response per review via the reviewId upsert key.
    expect(dbMock.reviewResponse.upsert).toHaveBeenCalledWith({
      where: { reviewId: "rev1" },
      create: { reviewId: "rev1", text: "Thank you for the kind words!" },
      update: { text: "Thank you for the kind words!" },
    });
  });

  it("DELETE removes the owner's response and is idempotent", async () => {
    dbMock.review.findUnique.mockResolvedValue(REVIEW_ROW);
    dbMock.reviewResponse.deleteMany.mockResolvedValue({ count: 0 });
    const res = await req(
      "/api/reviews/rev1/response",
      { method: "DELETE" },
      { "x-user-id": OWNER_ID }
    );
    expect(res.status).toBe(200);
    expect(dbMock.reviewResponse.deleteMany).toHaveBeenCalledWith({
      where: { reviewId: "rev1" },
    });
  });

  it("DELETE 403s a non-owner", async () => {
    dbMock.review.findUnique.mockResolvedValue(REVIEW_ROW);
    const res = await req(
      "/api/reviews/rev1/response",
      { method: "DELETE" },
      { "x-user-id": REVIEWER_ID }
    );
    expect(res.status).toBe(403);
    expect(dbMock.reviewResponse.deleteMany).not.toHaveBeenCalled();
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

describe("PATCH /api/admin/review-reports (bulk resolve / dismiss)", () => {
  it("403s a plain CUSTOMER", async () => {
    const res = await req(
      "/api/admin/review-reports",
      { method: "PATCH", body: JSON.stringify({ ids: ["rep1"], status: "RESOLVED" }) },
      { "x-user-id": REVIEWER_ID }
    );
    expect(res.status).toBe(403);
  });

  it("400s on an invalid status", async () => {
    const res = await req(
      "/api/admin/review-reports",
      { method: "PATCH", body: JSON.stringify({ ids: ["rep1"], status: "MAYBE" }) },
      { "x-user-id": "sup_1", "x-user-role": "SUPPORT" }
    );
    expect(res.status).toBe(400);
  });

  it("writes one audit entry per affected report on a bulk close", async () => {
    // updateMany silently skips unknown ids, so the audit trail keys off the
    // ids actually matched by the pre-write findMany — here two of three.
    dbMock.report.findMany.mockResolvedValue([{ id: "rep1" }, { id: "rep2" }]);
    dbMock.report.updateMany.mockResolvedValue({ count: 2 });
    const res = await req(
      "/api/admin/review-reports",
      {
        method: "PATCH",
        body: JSON.stringify({ ids: ["rep1", "rep2", "gone"], status: "RESOLVED" }),
      },
      { "x-user-id": "sup_1", "x-user-role": "SUPPORT" }
    );
    expect(res.status).toBe(200);
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Review-audit-log date filtering: a *date-only* `to` bound must include the
// whole named day. Previously `to=2026-07-12` parsed to midnight UTC and was
// used as an `lte`, so every entry from July 12 was excluded (off-by-one) —
// the same bug fixed in provider-service's audit-log handler. The DB is
// mocked, so we assert the `createdAt` bounds handed to Prisma and check that
// an entry timestamped mid-day would fall inside them.
// ---------------------------------------------------------------------------
describe("GET /api/admin/review-audit-log date range", () => {
  function whereFromCall() {
    return dbMock.adminAuditLog.findMany.mock.calls[0][0].where as {
      createdAt?: { gte?: Date; lte?: Date };
    };
  }

  beforeEach(() => {
    dbMock.adminAuditLog.findMany.mockResolvedValue([]);
  });

  it("a date-only `to` includes entries from that whole day (end-of-day UTC)", async () => {
    const entryCreatedAt = new Date("2026-07-12T10:00:00Z");
    const res = await req(
      "/api/admin/review-audit-log?to=2026-07-12",
      {},
      { "x-user-id": "sup_1", "x-user-role": "SUPPORT" }
    );
    expect(res.status).toBe(200);

    const { createdAt } = whereFromCall();
    expect(createdAt?.lte).toEqual(new Date("2026-07-12T23:59:59.999Z"));
    // The mid-day entry is at/under the upper bound → it would be returned.
    expect(entryCreatedAt.getTime()).toBeLessThanOrEqual(createdAt!.lte!.getTime());
  });

  it("excludes entries after a date-only `to` (next-day entries fall past the bound)", async () => {
    const nextDayEntry = new Date("2026-07-13T00:00:00Z");
    await req(
      "/api/admin/review-audit-log?to=2026-07-12",
      {},
      { "x-user-id": "sup_1", "x-user-role": "SUPPORT" }
    );

    const { createdAt } = whereFromCall();
    expect(nextDayEntry.getTime()).toBeGreaterThan(createdAt!.lte!.getTime());
  });

  it("honors a full ISO datetime `to` verbatim (no end-of-day snapping)", async () => {
    await req(
      "/api/admin/review-audit-log?to=2026-07-12T10:00:00Z",
      {},
      { "x-user-id": "sup_1", "x-user-role": "SUPPORT" }
    );

    const { createdAt } = whereFromCall();
    expect(createdAt?.lte).toEqual(new Date("2026-07-12T10:00:00Z"));
  });

  it("keeps a date-only `from` at midnight UTC as the lower bound", async () => {
    await req(
      "/api/admin/review-audit-log?from=2026-07-12",
      {},
      { "x-user-id": "sup_1", "x-user-role": "SUPPORT" }
    );

    const { createdAt } = whereFromCall();
    expect(createdAt?.gte).toEqual(new Date("2026-07-12T00:00:00Z"));
  });
});
