// Route-handler tests for the unified trust-safety surface: the public
// report submission handlers (payload contract, owner validation gate, the
// MESSAGE thread-party gate, dedupe), the admin queue with its SUPPORT/ADMIN
// authorization + hydration degrade, single/batch resolve, the audit log, the
// (dark) takedown action route, and the /internal ingestion endpoints.
// Prisma is mocked and s2s is stubbed — no live DB or network; the owner
// /internal/moderation/* endpoints don't exist yet (dark launch), so every
// S2S interaction is asserted against the RFC-specified contract.
import { beforeEach, describe, expect, it, vi } from "vitest";

// Keep lib/http real (so requireInternalSecret + getAuth + role gates run)
// but stub s2s.
vi.mock("../lib/http", async (importActual) => {
  const actual = await importActual<typeof import("../lib/http")>();
  return { ...actual, s2s: vi.fn() };
});

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    report: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    adminAuditLog: { create: vi.fn(), findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("../db", () => ({ db: dbMock }));

import { app } from "../app";
import { s2s } from "../lib/http";

const SECRET = "dev-internal-secret";
const s2sMock = vi.mocked(s2s);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type ReqOpts = {
  method?: string;
  body?: unknown;
  user?: { id: string; role?: string };
  secret?: boolean;
};

function req(path: string, opts: ReqOpts = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.secret !== false) headers["x-internal-secret"] = SECRET;
  if (opts.user) {
    headers["x-user-id"] = opts.user.id;
    headers["x-user-role"] = opts.user.role ?? "CUSTOMER";
    headers["x-user-name"] = "Test%20User";
  }
  return app.request(path, {
    method: opts.method ?? "GET",
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

const ADMIN = { id: "user_admin", role: "ADMIN" };
const SUPPORT = { id: "user_support", role: "SUPPORT" };

beforeEach(() => {
  // resetAllMocks (not clearAllMocks): mockResolvedValue implementations must
  // not leak between tests — e.g. the dedupe test's report.findFirst stub
  // would otherwise divert later create paths into the refresh branch.
  vi.resetAllMocks();
});

describe("internal secret guard", () => {
  it("rejects requests without the internal secret", async () => {
    const res = await req("/api/admin/reports/count", { secret: false, user: ADMIN });
    expect(res.status).toBe(403);
  });

  it("keeps /healthz open", async () => {
    dbMock.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "trust-safety-service" });
  });
});

describe("public report submission", () => {
  const validBody = { reason: "spam", details: "Suspicious listing" };

  it("files a report after the owner confirms the target (anonymous)", async () => {
    s2sMock.mockResolvedValue(json({ exists: true, visible: true }));
    const res = await req("/api/providers/prov_1/report", {
      method: "POST",
      body: validBody,
    });
    expect(res.status).toBe(200);
    // Validation read hits the RFC-specified owner endpoint.
    expect(s2sMock).toHaveBeenCalledWith(
      expect.any(String),
      "/internal/moderation/targets/PROVIDER/prov_1"
    );
    expect(dbMock.report.create).toHaveBeenCalledWith({
      data: {
        targetType: "PROVIDER",
        targetId: "prov_1",
        ownerService: "provider",
        reporterId: null,
        reason: "spam",
        details: "Suspicious listing",
      },
    });
  });

  it.each([
    ["/api/photos/ph_1/report", "WORK_PHOTO", "provider", "Photo not found"],
    ["/api/reviews/rev_1/report", "REVIEW", "review", "Review not found"],
    ["/api/jobs/job_1/report", "JOB", "job", "Job not found"],
  ])("%s targets %s owned by %s", async (path, targetType, owner, notFound) => {
    s2sMock.mockResolvedValue(json({ exists: true, visible: true }));
    const ok = await req(path, { method: "POST", body: validBody });
    expect(ok.status).toBe(200);
    expect(dbMock.report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ targetType, ownerService: owner }),
    });

    // Invisible (soft-deleted / hidden) targets 404 with today's wording.
    s2sMock.mockResolvedValue(json({ exists: true, visible: false }));
    const gone = await req(path, { method: "POST", body: validBody });
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: notFound });
  });

  it("refreshes a signed-in user's existing OPEN report instead of duplicating", async () => {
    s2sMock.mockResolvedValue(json({ exists: true, visible: true }));
    dbMock.report.findFirst.mockResolvedValue({ id: "rep_1" });
    const res = await req("/api/reviews/rev_1/report", {
      method: "POST",
      body: { reason: "scam", details: "" },
      user: { id: "user_1" },
    });
    expect(res.status).toBe(200);
    expect(dbMock.report.update).toHaveBeenCalledWith({
      where: { id: "rep_1" },
      data: { reason: "scam", details: null },
    });
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload with 400", async () => {
    s2sMock.mockResolvedValue(json({ exists: true, visible: true }));
    const res = await req("/api/providers/prov_1/report", {
      method: "POST",
      body: { reason: "not-a-reason" },
    });
    expect(res.status).toBe(400);
  });

  it("404s a target the owner says does not exist", async () => {
    s2sMock.mockResolvedValue(json({ exists: false, visible: false }));
    const res = await req("/api/providers/prov_x/report", {
      method: "POST",
      body: validBody,
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Provider not found" });
  });

  it("503s loudly when the owner validation read is unavailable (write-path gate)", async () => {
    s2sMock.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const res = await req("/api/providers/prov_1/report", {
      method: "POST",
      body: validBody,
    });
    expect(res.status).toBe(503);
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });

  it("503s when the owner answers non-2xx (endpoint dark until cutover)", async () => {
    s2sMock.mockResolvedValue(json({ error: "Not found" }, 404));
    const res = await req("/api/jobs/job_1/report", { method: "POST", body: validBody });
    expect(res.status).toBe(503);
  });

  describe("MESSAGE thread-party gate (#376)", () => {
    const parties = { customerUserId: "user_cust", providerUserId: "user_prov" };

    it("lets a thread party report a message", async () => {
      s2sMock.mockResolvedValue(json({ exists: true, visible: true, parties }));
      const res = await req("/api/messages/msg_1/report", {
        method: "POST",
        body: validBody,
        user: { id: "user_cust" },
      });
      expect(res.status).toBe(200);
      expect(dbMock.report.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          targetType: "MESSAGE",
          ownerService: "provider",
          reporterId: "user_cust",
        }),
      });
    });

    it.each([
      ["a non-party", { id: "user_other" }],
      ["a signed-out caller", undefined],
    ])("404s %s without confirming the message id", async (_label, user) => {
      s2sMock.mockResolvedValue(json({ exists: true, visible: true, parties }));
      const res = await req("/api/messages/msg_1/report", {
        method: "POST",
        body: validBody,
        user,
      });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Message not found" });
    });

    it("404s a message already removed by moderation", async () => {
      s2sMock.mockResolvedValue(json({ exists: true, visible: false, parties }));
      const res = await req("/api/messages/msg_1/report", {
        method: "POST",
        body: validBody,
        user: { id: "user_cust" },
      });
      expect(res.status).toBe(404);
    });
  });
});

describe("GET /api/admin/reports", () => {
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    targetType: "REVIEW",
    targetId: `t_${id}`,
    ownerService: "review",
    reporterId: null,
    reason: "spam",
    details: null,
    status: "OPEN",
    source: "USER",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    resolvedBy: null,
    resolvedAt: null,
    ...over,
  });

  it("is forbidden without SUPPORT/ADMIN", async () => {
    expect((await req("/api/admin/reports")).status).toBe(403);
    expect((await req("/api/admin/reports", { user: { id: "u", role: "CUSTOMER" } })).status).toBe(403);
  });

  it("returns the OPEN-first page window with hydrated targets", async () => {
    dbMock.report.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    dbMock.report.findMany
      .mockResolvedValueOnce([row("r1")])
      .mockResolvedValueOnce([row("r2", { status: "RESOLVED" })]);
    s2sMock.mockResolvedValue(
      json({ targets: { t_r1: { reviewId: "t_r1", rating: 1 }, t_r2: null } })
    );

    const res = await req("/api/admin/reports", { user: SUPPORT });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(body.reports).toHaveLength(2);
    expect(body.reports[0].target).toEqual({ reviewId: "t_r1", rating: 1 });
    expect(body.reports[1].target).toBeNull();
    // Batched hydration read per (owner, type), RFC §5.2.
    expect(s2sMock).toHaveBeenCalledWith(
      expect.any(String),
      "/internal/moderation/targets?type=REVIEW&ids=t_r1,t_r2"
    );
  });

  it("degrades hydration to target: null when the owner is unreachable (dark launch)", async () => {
    dbMock.report.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    // The open group holds the only row; the closed-tail query fills the rest
    // of the page window and comes back empty.
    dbMock.report.findMany
      .mockResolvedValueOnce([row("r1")])
      .mockResolvedValueOnce([]);
    s2sMock.mockRejectedValue(new Error("owner down"));

    const res = await req("/api/admin/reports", { user: ADMIN });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reports[0].target).toBeNull();
  });

  it("actually filters by targetType (no foreign-type short-circuit)", async () => {
    dbMock.report.count.mockResolvedValue(0);
    dbMock.report.findMany.mockResolvedValue([]);
    const res = await req("/api/admin/reports?targetType=JOB", { user: SUPPORT });
    expect(res.status).toBe(200);
    expect(dbMock.report.count).toHaveBeenCalledWith({
      where: { status: "OPEN", targetType: "JOB" },
    });
  });

  it("filters by status with plain page pagination", async () => {
    dbMock.report.count.mockResolvedValue(1);
    dbMock.report.findMany.mockResolvedValue([row("r1", { status: "RESOLVED" })]);
    s2sMock.mockResolvedValue(json({ targets: {} }));
    const res = await req("/api/admin/reports?status=RESOLVED&page=2&pageSize=10", {
      user: SUPPORT,
    });
    expect(res.status).toBe(200);
    expect(dbMock.report.findMany).toHaveBeenCalledWith({
      where: { status: "RESOLVED" },
      orderBy: { createdAt: "desc" },
      skip: 10,
      take: 10,
    });
  });
});

describe("GET /api/admin/reports/count", () => {
  it("returns the single open-reports figure for the badge", async () => {
    dbMock.report.count.mockResolvedValue(7);
    const res = await req("/api/admin/reports/count", { user: SUPPORT });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ openReports: 7 });
  });

  it("is forbidden without SUPPORT/ADMIN", async () => {
    expect((await req("/api/admin/reports/count")).status).toBe(403);
  });
});

describe("PATCH /api/admin/reports[/:id]", () => {
  it("resolves a report, stamping resolver + audit (SUPPORT tier)", async () => {
    dbMock.report.updateMany.mockResolvedValue({ count: 1 });
    const res = await req("/api/admin/reports/rep_1", {
      method: "PATCH",
      body: { status: "RESOLVED" },
      user: SUPPORT,
    });
    expect(res.status).toBe(200);
    expect(dbMock.report.updateMany).toHaveBeenCalledWith({
      where: { id: "rep_1" },
      data: expect.objectContaining({
        status: "RESOLVED",
        resolvedBy: "user_support",
      }),
    });
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "resolve-report",
        targetId: "rep_1",
        service: "trust-safety",
      }),
    });
  });

  it("404s an unknown report id", async () => {
    dbMock.report.updateMany.mockResolvedValue({ count: 0 });
    const res = await req("/api/admin/reports/rep_x", {
      method: "PATCH",
      body: { status: "DISMISSED" },
      user: ADMIN,
    });
    expect(res.status).toBe(404);
  });

  it("bulk-dismisses and audits each affected report", async () => {
    dbMock.report.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    dbMock.report.updateMany.mockResolvedValue({ count: 2 });
    const res = await req("/api/admin/reports", {
      method: "PATCH",
      body: { ids: ["a", "b", "ghost"], status: "DISMISSED" },
      user: SUPPORT,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 2 });
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid status", async () => {
    const res = await req("/api/admin/reports/rep_1", {
      method: "PATCH",
      body: { status: "OPEN" },
      user: ADMIN,
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/reports/:id/action (dark)", () => {
  const report = {
    id: "rep_1",
    targetType: "JOB",
    targetId: "job_1",
    ownerService: "job",
    status: "OPEN",
  };

  it("requires full ADMIN (SUPPORT is read/resolve only)", async () => {
    const res = await req("/api/admin/reports/rep_1/action", {
      method: "POST",
      body: { action: "takedown" },
      user: SUPPORT,
    });
    expect(res.status).toBe(403);
  });

  it("calls the owner's internal takedown endpoint, audits, and resolves", async () => {
    dbMock.report.findUnique.mockResolvedValue(report);
    s2sMock.mockResolvedValue(json({ ok: true }));
    const res = await req("/api/admin/reports/rep_1/action", {
      method: "POST",
      body: { action: "takedown", reason: "spam post", resolve: true },
      user: ADMIN,
    });
    expect(res.status).toBe(200);
    expect(s2sMock).toHaveBeenCalledWith(
      expect.any(String),
      "/internal/moderation/jobs/job_1/takedown",
      { method: "POST", body: JSON.stringify({ reason: "spam post" }) }
    );
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "takedown-job",
        targetType: "JOB",
        targetId: "job_1",
        reason: "spam post",
      }),
    });
    expect(dbMock.report.update).toHaveBeenCalledWith({
      where: { id: "rep_1" },
      data: expect.objectContaining({ status: "RESOLVED", resolvedBy: "user_admin" }),
    });
  });

  it("502s while the owner endpoints don't exist yet (dark launch write gate)", async () => {
    dbMock.report.findUnique.mockResolvedValue(report);
    s2sMock.mockResolvedValue(json({ error: "Not found" }, 500));
    const res = await req("/api/admin/reports/rep_1/action", {
      method: "POST",
      body: { action: "restore" },
      user: ADMIN,
    });
    expect(res.status).toBe(502);
    expect(dbMock.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("502s loudly on owner outage", async () => {
    dbMock.report.findUnique.mockResolvedValue(report);
    s2sMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await req("/api/admin/reports/rep_1/action", {
      method: "POST",
      body: { action: "takedown" },
      user: ADMIN,
    });
    expect(res.status).toBe(502);
  });

  it("404s when the owner reports the content row gone", async () => {
    dbMock.report.findUnique.mockResolvedValue(report);
    s2sMock.mockResolvedValue(json({ error: "Not found" }, 404));
    const res = await req("/api/admin/reports/rep_1/action", {
      method: "POST",
      body: { action: "takedown" },
      user: ADMIN,
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Target not found" });
  });

  it("400s target types with no takedown mutation (INQUIRY, JOB_RESPONSE)", async () => {
    dbMock.report.findUnique.mockResolvedValue({ ...report, targetType: "INQUIRY" });
    const res = await req("/api/admin/reports/rep_1/action", {
      method: "POST",
      body: { action: "takedown" },
      user: ADMIN,
    });
    expect(res.status).toBe(400);
    expect(s2sMock).not.toHaveBeenCalled();
  });

  it("404s an unknown report", async () => {
    dbMock.report.findUnique.mockResolvedValue(null);
    const res = await req("/api/admin/reports/rep_x/action", {
      method: "POST",
      body: { action: "takedown" },
      user: ADMIN,
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/admin/audit-log", () => {
  it("returns entries with the service origin column, capped and filtered", async () => {
    const entries = [
      {
        id: "a1",
        adminId: "user_admin",
        action: "resolve-report",
        targetType: "REPORT",
        targetId: "rep_1",
        reason: null,
        service: "trust-safety",
        createdAt: new Date().toISOString(),
      },
    ];
    dbMock.adminAuditLog.findMany.mockResolvedValue(entries);
    const res = await req(
      "/api/admin/audit-log?adminId=user_admin&action=resolve-report&from=2026-07-01&to=2026-07-12",
      { user: SUPPORT }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).entries).toHaveLength(1);
    const call = dbMock.adminAuditLog.findMany.mock.calls[0][0];
    expect(call.take).toBe(200);
    expect(call.where.adminId).toBe("user_admin");
    expect(call.where.action).toBe("resolve-report");
    // Date-only `to` is snapped to end-of-day UTC.
    expect(call.where.createdAt.lte.toISOString()).toBe("2026-07-12T23:59:59.999Z");
  });

  it("is forbidden without SUPPORT/ADMIN", async () => {
    expect((await req("/api/admin/audit-log")).status).toBe(403);
  });
});

describe("POST /internal/reports/auto", () => {
  it("files a SYSTEM report with the derived ownerService on a filter hit", async () => {
    dbMock.report.findFirst.mockResolvedValue(null);
    const res = await req("/internal/reports/auto", {
      method: "POST",
      body: {
        targetType: "JOB",
        targetId: "job_1",
        fields: { title: "clean gutters", description: "this is fucking urgent" },
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, flagged: true });
    expect(dbMock.report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: "JOB",
        targetId: "job_1",
        ownerService: "job",
        reporterId: null,
        source: "SYSTEM",
        reason: "auto-flag: content filter",
        details: expect.stringContaining('"fucking"'),
      }),
    });
  });

  it("refreshes the one OPEN SYSTEM report per target on re-edit", async () => {
    dbMock.report.findFirst.mockResolvedValue({ id: "rep_sys" });
    const res = await req("/internal/reports/auto", {
      method: "POST",
      body: { targetType: "REVIEW", targetId: "rev_1", fields: { comment: "hutta" } },
    });
    expect(res.status).toBe(200);
    expect(dbMock.report.update).toHaveBeenCalledWith({
      where: { id: "rep_sys" },
      data: { details: expect.stringContaining('"hutta"') },
    });
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });

  it("no-ops on clean text (fields with nulls skipped)", async () => {
    const res = await req("/internal/reports/auto", {
      method: "POST",
      body: {
        targetType: "PROVIDER",
        targetId: "prov_1",
        fields: { headline: "Reliable plumber in Galle", bio: null },
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, flagged: false });
    expect(dbMock.report.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an unknown target type", async () => {
    const res = await req("/internal/reports/auto", {
      method: "POST",
      body: { targetType: "USER", targetId: "u1", fields: {} },
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /internal/audit", () => {
  it("ingests an owner-native audit row with its service tag", async () => {
    const res = await req("/internal/audit", {
      method: "POST",
      body: {
        adminId: "user_admin",
        action: "suspend-provider",
        targetType: "PROVIDER",
        targetId: "prov_1",
        reason: "repeat offender",
        service: "provider",
      },
    });
    expect(res.status).toBe(200);
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminId: "user_admin",
        action: "suspend-provider",
        targetType: "PROVIDER",
        targetId: "prov_1",
        reason: "repeat offender",
        service: "provider",
      },
    });
  });

  it("rejects an unknown service tag", async () => {
    const res = await req("/internal/audit", {
      method: "POST",
      body: {
        adminId: "user_admin",
        action: "x",
        targetType: "Y",
        targetId: "z",
        service: "identity",
      },
    });
    expect(res.status).toBe(400);
  });
});
