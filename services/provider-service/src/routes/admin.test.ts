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
  fetchProviderReviews: vi.fn().mockResolvedValue({ reviews: [], nextCursor: null }),
}));

import { app } from "../app";

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
  it("suspend flips suspended=true and records an audit entry", async () => {
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
      data: { suspended: true },
    });
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledOnce();
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
