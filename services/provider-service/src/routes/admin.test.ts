// Authorization-matrix tests for the admin moderation routes (#257). The
// central guarantee here is the two-tier gate from lib/http.ts:
//   - isSupportOrAdmin: SUPPORT *and* ADMIN may read every admin view and
//     resolve/dismiss reports.
//   - isFullAdmin: only ADMIN may perform destructive / record-creating
//     actions (suspend/verify, bulk mutations, photo soft-delete/restore,
//     the flagging run, category writes). SUPPORT is 403'd on these.
// Every unauthenticated or wrong-role (CUSTOMER/PROVIDER) request is 403.
// Prisma and the review-service client are mocked — this is the HTTP + authz
// contract, not a live DB test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    provider: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
    report: {
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
      createMany: vi.fn(),
    },
    workPhoto: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
    adminAuditLog: { create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("../db", () => ({ db: dbMock }));
vi.mock("../lib/clients", () => ({
  fetchRatings: vi.fn().mockResolvedValue({}),
  fetchRatingsResult: vi.fn().mockResolvedValue({ ok: true, ratings: {} }),
  fetchProviderReviews: vi.fn().mockResolvedValue({ reviews: [], nextCursor: null }),
}));

import { app } from "../app";
import { fetchRatingsResult } from "../lib/clients";

const fetchRatingsResultMock = vi.mocked(fetchRatingsResult);

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
    headers["x-user-id"] = "admin-1";
    headers["x-user-role"] = opts.role;
    headers["x-user-name"] = "Admin";
  }
  return app.request(path, {
    method: opts.method ?? "GET",
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Safe defaults so an *authorized* request never crashes on an unmocked call.
  dbMock.provider.findMany.mockResolvedValue([]);
  dbMock.provider.count.mockResolvedValue(0);
  dbMock.provider.findUnique.mockResolvedValue(null);
  dbMock.provider.update.mockResolvedValue({});
  dbMock.provider.updateMany.mockResolvedValue({ count: 0 });
  dbMock.provider.groupBy.mockResolvedValue([]);
  dbMock.report.count.mockResolvedValue(0);
  dbMock.report.findMany.mockResolvedValue([]);
  dbMock.report.updateMany.mockResolvedValue({ count: 1 });
  dbMock.report.groupBy.mockResolvedValue([]);
  dbMock.report.createMany.mockResolvedValue({ count: 0 });
  dbMock.workPhoto.findUnique.mockResolvedValue(null);
  dbMock.workPhoto.findMany.mockResolvedValue([]);
  dbMock.workPhoto.update.mockResolvedValue({});
  dbMock.workPhoto.updateMany.mockResolvedValue({ count: 1 });
  dbMock.category.findMany.mockResolvedValue([]);
  dbMock.category.findUnique.mockResolvedValue(null);
  dbMock.category.create.mockResolvedValue({ slug: "x" });
  dbMock.category.update.mockResolvedValue({ slug: "x" });
  dbMock.category.groupBy.mockResolvedValue([]);
  dbMock.adminAuditLog.create.mockResolvedValue({});
  dbMock.adminAuditLog.findMany.mockResolvedValue([]);
  // Default: ratings hydrated fully with no reviews (review-service healthy).
  fetchRatingsResultMock.mockResolvedValue({ ok: true, ratings: {} });
});

// ---------------------------------------------------------------------------
// The route → required-tier map, exercised as a matrix below.
// ---------------------------------------------------------------------------

// Reads + report resolve/dismiss: SUPPORT and ADMIN allowed.
const supportOrAdminRoutes: { name: string; method: string; path: string; body?: unknown }[] = [
  { name: "GET /api/admin/providers", method: "GET", path: "/api/admin/providers" },
  { name: "GET /api/admin/providers/:id", method: "GET", path: "/api/admin/providers/p1" },
  { name: "GET /api/admin/verifications", method: "GET", path: "/api/admin/verifications" },
  { name: "GET /api/admin/reports", method: "GET", path: "/api/admin/reports" },
  { name: "GET /api/admin/notifications/counts", method: "GET", path: "/api/admin/notifications/counts" },
  { name: "GET /api/admin/stats", method: "GET", path: "/api/admin/stats" },
  { name: "GET /api/admin/categories", method: "GET", path: "/api/admin/categories" },
  { name: "GET /api/admin/audit-log", method: "GET", path: "/api/admin/audit-log" },
  { name: "PATCH /api/admin/reports/:id", method: "PATCH", path: "/api/admin/reports/r1", body: { status: "RESOLVED" } },
  { name: "PATCH /api/admin/reports (bulk)", method: "PATCH", path: "/api/admin/reports", body: { ids: ["r1"], status: "RESOLVED" } },
];

// Destructive / record-creating writes: ADMIN only, SUPPORT forbidden.
const fullAdminRoutes: { name: string; method: string; path: string; body?: unknown }[] = [
  { name: "PATCH /api/admin/providers/:id", method: "PATCH", path: "/api/admin/providers/p1", body: { action: "suspend" } },
  { name: "PATCH /api/admin/providers (bulk suspend)", method: "PATCH", path: "/api/admin/providers", body: { ids: ["p1"], suspended: true } },
  { name: "PATCH /api/admin/verifications/:id", method: "PATCH", path: "/api/admin/verifications/p1", body: { action: "approve" } },
  { name: "PATCH /api/admin/verifications (bulk)", method: "PATCH", path: "/api/admin/verifications", body: { ids: ["p1"], action: "approve" } },
  { name: "DELETE /api/admin/photos/:id", method: "DELETE", path: "/api/admin/photos/ph1" },
  { name: "PATCH /api/admin/photos/:id/restore", method: "PATCH", path: "/api/admin/photos/ph1/restore" },
  { name: "POST /api/admin/flagging/run", method: "POST", path: "/api/admin/flagging/run" },
  { name: "POST /api/admin/categories", method: "POST", path: "/api/admin/categories", body: { slug: "new-cat", labelEn: "New", labelSi: "අලුත්" } },
  { name: "PATCH /api/admin/categories/:slug", method: "PATCH", path: "/api/admin/categories/new-cat", body: { active: false } },
];

describe("admin authorization — reads & report moderation (isSupportOrAdmin)", () => {
  it.each(supportOrAdminRoutes)("$name: SUPPORT is allowed (not 403)", async (r) => {
    const res = await req(r.path, { method: r.method, body: r.body, role: "SUPPORT" });
    expect(res.status).not.toBe(403);
  });

  it.each(supportOrAdminRoutes)("$name: ADMIN is allowed (not 403)", async (r) => {
    const res = await req(r.path, { method: r.method, body: r.body, role: "ADMIN" });
    expect(res.status).not.toBe(403);
  });

  it.each(supportOrAdminRoutes)("$name: CUSTOMER is 403", async (r) => {
    const res = await req(r.path, { method: r.method, body: r.body, role: "CUSTOMER" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it.each(supportOrAdminRoutes)("$name: unauthenticated is 403", async (r) => {
    const res = await req(r.path, { method: r.method, body: r.body, role: null });
    expect(res.status).toBe(403);
  });
});

describe("admin authorization — destructive writes (isFullAdmin)", () => {
  it.each(fullAdminRoutes)("$name: SUPPORT is 403 (cannot perform)", async (r) => {
    const res = await req(r.path, { method: r.method, body: r.body, role: "SUPPORT" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it.each(fullAdminRoutes)("$name: CUSTOMER is 403", async (r) => {
    const res = await req(r.path, { method: r.method, body: r.body, role: "CUSTOMER" });
    expect(res.status).toBe(403);
  });

  it.each(fullAdminRoutes)("$name: PROVIDER is 403", async (r) => {
    const res = await req(r.path, { method: r.method, body: r.body, role: "PROVIDER" });
    expect(res.status).toBe(403);
  });

  it.each(fullAdminRoutes)("$name: unauthenticated is 403", async (r) => {
    const res = await req(r.path, { method: r.method, body: r.body, role: null });
    expect(res.status).toBe(403);
  });

  it.each(fullAdminRoutes)("$name: ADMIN is allowed (not 403)", async (r) => {
    const res = await req(r.path, { method: r.method, body: r.body, role: "ADMIN" });
    expect(res.status).not.toBe(403);
  });
});

// SUPPORT must be blocked from mutating provider state on the full-admin write
// paths that touch it — assert the DB write never fires, not just the status
// code, so a future refactor can't 403 *after* the mutation.
describe("SUPPORT cannot mutate provider/verification state", () => {
  it("PATCH /api/admin/providers/:id (suspend) never calls provider.update", async () => {
    await req("/api/admin/providers/p1", {
      method: "PATCH",
      body: { action: "suspend" },
      role: "SUPPORT",
    });
    expect(dbMock.provider.update).not.toHaveBeenCalled();
  });

  it("PATCH /api/admin/providers (bulk) never calls provider.updateMany", async () => {
    await req("/api/admin/providers", {
      method: "PATCH",
      body: { ids: ["p1", "p2"], suspended: true },
      role: "SUPPORT",
    });
    expect(dbMock.provider.updateMany).not.toHaveBeenCalled();
  });

  it("POST /api/admin/flagging/run never creates SYSTEM reports", async () => {
    await req("/api/admin/flagging/run", { method: "POST", role: "SUPPORT" });
    expect(dbMock.report.createMany).not.toHaveBeenCalled();
    expect(dbMock.provider.findMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Behavior for the authorized (ADMIN) path — a thin happy-path check on the
// gated actions so the tests assert real effects, not just the guard.
// ---------------------------------------------------------------------------
describe("PATCH /api/admin/providers/:id (ADMIN actions)", () => {
  it("suspend flips suspended+adminSuspended=true and records an audit entry", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1", suspended: false });
    const res = await req("/api/admin/providers/p1", {
      method: "PATCH",
      body: { action: "suspend" },
      role: "ADMIN",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMock.provider.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { suspended: true, adminSuspended: true },
    });
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledOnce();
  });

  // #550: this is the single path that lifts an ADMIN suspension.
  it("unsuspend clears both suspended and adminSuspended", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1", suspended: true });
    const res = await req("/api/admin/providers/p1", {
      method: "PATCH",
      body: { action: "unsuspend" },
      role: "ADMIN",
    });
    expect(res.status).toBe(200);
    expect(dbMock.provider.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { suspended: false, adminSuspended: false },
    });
  });

  it("verify sets VERIFIED + verifiedAt", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1" });
    const res = await req("/api/admin/providers/p1", {
      method: "PATCH",
      body: { action: "verify" },
      role: "ADMIN",
    });
    expect(res.status).toBe(200);
    const arg = dbMock.provider.update.mock.calls[0][0];
    expect(arg.data.verificationStatus).toBe("VERIFIED");
    expect(arg.data.verifiedAt).toBeInstanceOf(Date);
  });

  it("returns 404 when the provider does not exist", async () => {
    dbMock.provider.findUnique.mockResolvedValue(null);
    const res = await req("/api/admin/providers/nope", {
      method: "PATCH",
      body: { action: "suspend" },
      role: "ADMIN",
    });
    expect(res.status).toBe(404);
    expect(dbMock.provider.update).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown action", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1" });
    const res = await req("/api/admin/providers/p1", {
      method: "PATCH",
      body: { action: "delete-everything" },
      role: "ADMIN",
    });
    expect(res.status).toBe(400);
    expect(dbMock.provider.update).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/verifications/:id (ADMIN)", () => {
  it("approve → VERIFIED", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1" });
    const res = await req("/api/admin/verifications/p1", {
      method: "PATCH",
      body: { action: "approve" },
      role: "ADMIN",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "VERIFIED" });
  });

  it("reject → REJECTED and stores the reason", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1" });
    const res = await req("/api/admin/verifications/p1", {
      method: "PATCH",
      body: { action: "reject", reason: "blurry NIC" },
      role: "ADMIN",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "REJECTED" });
    const arg = dbMock.provider.update.mock.calls[0][0];
    expect(arg.data.rejectionReason).toBe("blurry NIC");
  });
});

describe("DELETE /api/admin/photos/:id (ADMIN soft-delete)", () => {
  it("soft-deletes (sets deletedAt) rather than hard-deleting", async () => {
    dbMock.workPhoto.findUnique.mockResolvedValue({ id: "ph1" });
    const res = await req("/api/admin/photos/ph1", { method: "DELETE", role: "ADMIN" });
    expect(res.status).toBe(200);
    const arg = dbMock.workPhoto.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "ph1" });
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
  });

  it("404 when the photo is unknown", async () => {
    dbMock.workPhoto.findUnique.mockResolvedValue(null);
    const res = await req("/api/admin/photos/nope", { method: "DELETE", role: "ADMIN" });
    expect(res.status).toBe(404);
    expect(dbMock.workPhoto.update).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/photos/:id/restore (ADMIN)", () => {
  it("clears deletedAt and returns 200 when the photo exists", async () => {
    dbMock.workPhoto.updateMany.mockResolvedValue({ count: 1 });
    const res = await req("/api/admin/photos/ph1/restore", {
      method: "PATCH",
      role: "ADMIN",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const arg = dbMock.workPhoto.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "ph1" });
    expect(arg.data).toEqual({ deletedAt: null });
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledOnce();
  });

  it("404 when the id matches no photo (updateMany count 0), not a false 200", async () => {
    dbMock.workPhoto.updateMany.mockResolvedValue({ count: 0 });
    const res = await req("/api/admin/photos/nope/restore", {
      method: "PATCH",
      role: "ADMIN",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Photo not found" });
    expect(dbMock.adminAuditLog.create).not.toHaveBeenCalled();
  });
});

// The provider-detail quality score and the auto-flagging run must penalize on
// the same report source set: OPEN USER-source reports only. SYSTEM reports are
// the flagging job's own output, so if the detail score also counted them an
// auto-flag would drop the visible score below the threshold that triggered it.
describe("GET /api/admin/providers/:id — quality-score report source parity", () => {
  it("counts only OPEN USER-source reports for the penalty (matches flagging's USER groupBy)", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1", photos: [] });
    dbMock.report.count.mockResolvedValue(2);
    const res = await req("/api/admin/providers/p1", { role: "ADMIN" });
    expect(res.status).toBe(200);
    expect(dbMock.report.count).toHaveBeenCalledWith({
      where: {
        targetType: "PROVIDER",
        targetId: "p1",
        status: "OPEN",
        source: "USER",
      },
    });
    const body = await res.json();
    // 2 USER open reports × 15 penalty, no reviews → neutral 70 − 30 = 40 —
    // identical to what computeQualityScore yields inside the flagging run for
    // the same USER-report count.
    expect(body.provider.quality.openReportCount).toBe(2);
    expect(body.provider.quality.reportPenalty).toBe(30);
    expect(body.provider.quality.qualityScore).toBe(40);
  });
});

describe("POST /api/admin/flagging/run (ADMIN)", () => {
  it("returns { flagged: 0 } when there are no active providers", async () => {
    dbMock.provider.findMany.mockResolvedValue([]);
    const res = await req("/api/admin/flagging/run", { method: "POST", role: "ADMIN" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ flagged: 0 });
    expect(dbMock.report.createMany).not.toHaveBeenCalled();
  });

  it("opens SYSTEM reports for providers over the report-volume threshold, skipping already-flagged ones", async () => {
    dbMock.provider.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);
    // p1: 3 open USER reports (>= FLAG_OPEN_USER_REPORTS_AT) → flagged.
    // p2: already carries an OPEN SYSTEM flag → skipped (dedupe).
    // p3: no reports, good rating → not flagged.
    dbMock.report.groupBy.mockImplementation(
      ({ where }: { where: { source: string } }) => {
        if (where.source === "USER") {
          return Promise.resolve([{ targetId: "p1", _count: { _all: 3 } }]);
        }
        return Promise.resolve([{ targetId: "p2", _count: { _all: 1 } }]);
      }
    );
    const res = await req("/api/admin/flagging/run", { method: "POST", role: "ADMIN" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ flagged: 1 });
    const created = dbMock.report.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      targetType: "PROVIDER",
      targetId: "p1",
      source: "SYSTEM",
      status: "OPEN",
    });
  });

  it("flags on a genuine low quality score when ratings hydrate fully", async () => {
    // p1 really does have poor reviews (rating 1.0 over 5 reviews →
    // ratingComponent 20 → quality 20 < FLAG_QUALITY_BELOW) and no open
    // reports. With a healthy review-service this is a true positive.
    dbMock.provider.findMany.mockResolvedValue([{ id: "p1" }]);
    fetchRatingsResultMock.mockResolvedValue({
      ok: true,
      ratings: { p1: { rating: 1, count: 5 } },
    });
    const res = await req("/api/admin/flagging/run", { method: "POST", role: "ADMIN" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ flagged: 1 });
    const created = dbMock.report.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ targetId: "p1", source: "SYSTEM" });
  });

  it("does NOT flag on the quality signal when ratings hydration degraded (#366)", async () => {
    // review-service outage: ratings come back incomplete (ok: false). A
    // healthy provider with no open reports must not be flagged just because
    // its rating reads as absent — that would create a bogus SYSTEM report.
    dbMock.provider.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    fetchRatingsResultMock.mockResolvedValue({ ok: false, ratings: {} });
    const res = await req("/api/admin/flagging/run", { method: "POST", role: "ADMIN" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ flagged: 0 });
    expect(dbMock.report.createMany).not.toHaveBeenCalled();
  });

  it("still flags on report volume during a ratings outage (trigger needs no peer)", async () => {
    // Even with ratings degraded, the report-count trigger is peer-independent
    // and must keep working: p1 has 3 open USER reports.
    dbMock.provider.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    fetchRatingsResultMock.mockResolvedValue({ ok: false, ratings: {} });
    dbMock.report.groupBy.mockImplementation(
      ({ where }: { where: { source: string } }) =>
        where.source === "USER"
          ? Promise.resolve([{ targetId: "p1", _count: { _all: 3 } }])
          : Promise.resolve([])
    );
    const res = await req("/api/admin/flagging/run", { method: "POST", role: "ADMIN" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ flagged: 1 });
    const created = dbMock.report.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ targetId: "p1", source: "SYSTEM" });
  });
});

describe("report moderation is open to SUPPORT (isSupportOrAdmin)", () => {
  it("SUPPORT can resolve a report and it is stamped with the actor", async () => {
    const res = await req("/api/admin/reports/r1", {
      method: "PATCH",
      body: { status: "RESOLVED" },
      role: "SUPPORT",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const arg = dbMock.report.updateMany.mock.calls[0][0];
    expect(arg.data.status).toBe("RESOLVED");
    expect(arg.data.resolvedBy).toBe("admin-1");
  });

  it("404 when the report id matches nothing", async () => {
    dbMock.report.updateMany.mockResolvedValue({ count: 0 });
    const res = await req("/api/admin/reports/nope", {
      method: "PATCH",
      body: { status: "DISMISSED" },
      role: "SUPPORT",
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/admin/reports (SUPPORT read)", () => {
  it("short-circuits to an empty page for a non-local (REVIEW) targetType filter", async () => {
    const res = await req("/api/admin/reports?targetType=REVIEW", { role: "SUPPORT" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reports: [], total: 0 });
    expect(dbMock.report.findMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Bulk moderation must leave the same audit trail as the single-item actions
// (#362): one AdminAuditLog entry per affected target, with the same action
// name / target type the single PATCH records. Previously the bulk variants
// mutated state with no trail at all.
// ---------------------------------------------------------------------------
describe("bulk moderation records one audit entry per affected target", () => {
  it("PATCH /api/admin/providers (bulk suspend) logs 'suspend' for each matched provider", async () => {
    // Only p1/p2 exist; the "ghost" id in the request is not matched, so it
    // must not produce an audit entry.
    dbMock.provider.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    dbMock.provider.updateMany.mockResolvedValue({ count: 2 });
    const res = await req("/api/admin/providers", {
      method: "PATCH",
      body: { ids: ["p1", "p2", "ghost"], suspended: true },
      role: "ADMIN",
    });
    expect(res.status).toBe(200);
    // adminSuspended mirrors suspended (#550): a bulk suspend is admin-owned
    // and must not be self-liftable via the #403 downgrade → re-upgrade cycle.
    expect(dbMock.provider.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["p1", "p2", "ghost"] } },
      data: { suspended: true, adminSuspended: true },
    });
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledTimes(2);
    const entries = dbMock.adminAuditLog.create.mock.calls.map((call) => call[0].data);
    expect(entries).toEqual([
      { adminId: "admin-1", action: "suspend", targetType: "PROVIDER", targetId: "p1", reason: null },
      { adminId: "admin-1", action: "suspend", targetType: "PROVIDER", targetId: "p2", reason: null },
    ]);
  });

  it("PATCH /api/admin/providers (bulk unsuspend) logs 'unsuspend'", async () => {
    dbMock.provider.findMany.mockResolvedValue([{ id: "p1" }]);
    dbMock.provider.updateMany.mockResolvedValue({ count: 1 });
    await req("/api/admin/providers", {
      method: "PATCH",
      body: { ids: ["p1"], suspended: false },
      role: "ADMIN",
    });
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledOnce();
    expect(dbMock.adminAuditLog.create.mock.calls[0][0].data.action).toBe("unsuspend");
  });

  it("PATCH /api/admin/verifications (bulk approve) logs 'verify' only for still-PENDING targets", async () => {
    // The update's PENDING filter is mirrored by the pre-write lookup, so the
    // affected set is exactly the rows returned by findMany.
    dbMock.provider.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    dbMock.provider.updateMany.mockResolvedValue({ count: 2 });
    const res = await req("/api/admin/verifications", {
      method: "PATCH",
      body: { ids: ["p1", "p2", "p3"], action: "approve" },
      role: "ADMIN",
    });
    expect(res.status).toBe(200);
    expect(dbMock.provider.findMany.mock.calls[0][0].where).toMatchObject({
      verificationStatus: "PENDING",
    });
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledTimes(2);
    const entries = dbMock.adminAuditLog.create.mock.calls.map((call) => call[0].data);
    expect(entries).toEqual([
      { adminId: "admin-1", action: "verify", targetType: "PROVIDER", targetId: "p1", reason: null },
      { adminId: "admin-1", action: "verify", targetType: "PROVIDER", targetId: "p2", reason: null },
    ]);
  });

  it("PATCH /api/admin/verifications (bulk reject) logs 'reject-verification'", async () => {
    dbMock.provider.findMany.mockResolvedValue([{ id: "p1" }]);
    dbMock.provider.updateMany.mockResolvedValue({ count: 1 });
    await req("/api/admin/verifications", {
      method: "PATCH",
      body: { ids: ["p1"], action: "reject", reason: "blurry NIC" },
      role: "ADMIN",
    });
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledOnce();
    expect(dbMock.adminAuditLog.create.mock.calls[0][0].data.action).toBe("reject-verification");
  });

  it("PATCH /api/admin/reports (bulk resolve) logs 'resolve-report' per affected report", async () => {
    dbMock.report.findMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
    dbMock.report.updateMany.mockResolvedValue({ count: 2 });
    const res = await req("/api/admin/reports", {
      method: "PATCH",
      body: { ids: ["r1", "r2"], status: "RESOLVED" },
      role: "ADMIN",
    });
    expect(res.status).toBe(200);
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledTimes(2);
    const entries = dbMock.adminAuditLog.create.mock.calls.map((call) => call[0].data);
    expect(entries).toEqual([
      { adminId: "admin-1", action: "resolve-report", targetType: "REPORT", targetId: "r1", reason: null },
      { adminId: "admin-1", action: "resolve-report", targetType: "REPORT", targetId: "r2", reason: null },
    ]);
  });

  it("PATCH /api/admin/reports (bulk dismiss) logs 'dismiss-report' (SUPPORT allowed)", async () => {
    dbMock.report.findMany.mockResolvedValue([{ id: "r1" }]);
    dbMock.report.updateMany.mockResolvedValue({ count: 1 });
    await req("/api/admin/reports", {
      method: "PATCH",
      body: { ids: ["r1"], status: "DISMISSED" },
      role: "SUPPORT",
    });
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledOnce();
    expect(dbMock.adminAuditLog.create.mock.calls[0][0].data.action).toBe("dismiss-report");
  });

  it("a logging failure never fails the bulk action (best-effort)", async () => {
    dbMock.provider.findMany.mockResolvedValue([{ id: "p1" }]);
    dbMock.provider.updateMany.mockResolvedValue({ count: 1 });
    dbMock.adminAuditLog.create.mockRejectedValue(new Error("audit db down"));
    const res = await req("/api/admin/providers", {
      method: "PATCH",
      body: { ids: ["p1"], suspended: true },
      role: "ADMIN",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 1 });
  });
});

// ---------------------------------------------------------------------------
// Audit-log date filtering (#…): a *date-only* `to` bound must include the
// whole named day. Previously `to=2026-07-12` parsed to midnight UTC and was
// used as an `lte`, so every entry from July 12 was excluded (off-by-one).
// The DB is mocked, so we assert the `createdAt` bounds handed to Prisma and
// check that an entry timestamped mid-day would fall inside them.
// ---------------------------------------------------------------------------
describe("GET /api/admin/audit-log date range", () => {
  function whereFromCall() {
    return dbMock.adminAuditLog.findMany.mock.calls[0][0].where as {
      createdAt?: { gte?: Date; lte?: Date };
    };
  }

  it("a date-only `to` includes entries from that whole day (end-of-day UTC)", async () => {
    const entryCreatedAt = new Date("2026-07-12T10:00:00Z");
    const res = await req("/api/admin/audit-log?to=2026-07-12", { role: "SUPPORT" });
    expect(res.status).toBe(200);

    const { createdAt } = whereFromCall();
    expect(createdAt?.lte).toEqual(new Date("2026-07-12T23:59:59.999Z"));
    // The mid-day entry is at/under the upper bound → it would be returned.
    expect(entryCreatedAt.getTime()).toBeLessThanOrEqual(createdAt!.lte!.getTime());
  });

  it("excludes entries after a date-only `to` (next-day entries fall past the bound)", async () => {
    const nextDayEntry = new Date("2026-07-13T00:00:00Z");
    await req("/api/admin/audit-log?to=2026-07-12", { role: "SUPPORT" });

    const { createdAt } = whereFromCall();
    expect(nextDayEntry.getTime()).toBeGreaterThan(createdAt!.lte!.getTime());
  });

  it("honors a full ISO datetime `to` verbatim (no end-of-day snapping)", async () => {
    await req("/api/admin/audit-log?to=2026-07-12T10:00:00Z", { role: "SUPPORT" });

    const { createdAt } = whereFromCall();
    expect(createdAt?.lte).toEqual(new Date("2026-07-12T10:00:00Z"));
  });

  it("keeps a date-only `from` at midnight UTC as the lower bound", async () => {
    await req("/api/admin/audit-log?from=2026-07-12", { role: "SUPPORT" });

    const { createdAt } = whereFromCall();
    expect(createdAt?.gte).toEqual(new Date("2026-07-12T00:00:00Z"));
  });
});

describe("POST /api/admin/categories — imageUrl path validation (#519)", () => {
  const base = { slug: "roofing", labelEn: "Roofing", labelSi: "වහල" };

  it("rejects a protocol-relative //host imageUrl (would load cross-origin)", async () => {
    const res = await req("/api/admin/categories", {
      role: "ADMIN",
      method: "POST",
      body: { ...base, imageUrl: "//evil.com/x.jpg" },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Image URL must be a relative path");
    expect(dbMock.category.create).not.toHaveBeenCalled();
  });

  it("rejects an absolute external URL", async () => {
    const res = await req("/api/admin/categories", {
      role: "ADMIN",
      method: "POST",
      body: { ...base, imageUrl: "https://evil.com/x.jpg" },
    });
    expect(res.status).toBe(400);
    expect(dbMock.category.create).not.toHaveBeenCalled();
  });

  it("accepts an uploaded /api/files cover path", async () => {
    const res = await req("/api/admin/categories", {
      role: "ADMIN",
      method: "POST",
      body: { ...base, imageUrl: "/api/files/category/covers/roofing.jpg" },
    });
    expect(res.status).toBe(200);
    expect(dbMock.category.create).toHaveBeenCalled();
  });

  it("accepts a seeded /images asset path", async () => {
    const res = await req("/api/admin/categories", {
      role: "ADMIN",
      method: "POST",
      body: { ...base, imageUrl: "/images/workers/roofing-1.jpg" },
    });
    expect(res.status).toBe(200);
    expect(dbMock.category.create).toHaveBeenCalled();
  });
});
