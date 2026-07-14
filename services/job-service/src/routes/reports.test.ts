// Route tests for job abuse reporting: the public report-a-job endpoint
// (#376 — session optional, signed-in dedupe, hidden-job 404) and the
// job-reports moderation queue (#375): the SUPPORT/ADMIN authorization gate,
// target hydration (JOB and JOB_RESPONSE, plus the hard-deleted-target null),
// the foreign-targetType short-circuit, and the resolve/dismiss paths with
// their audit trail. Prisma is mocked — this is the HTTP + authz contract,
// not a live DB test.
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    jobRequest: { findMany: vi.fn(), findUnique: vi.fn() },
    jobResponse: { findMany: vi.fn() },
    report: {
      count: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    adminAuditLog: { create: vi.fn(), findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("../db", () => ({ db: dbMock }));
vi.mock("../lib/notify", () => ({
  emitNotification: vi.fn().mockResolvedValue(undefined),
}));

import { app } from "../app";
import { emitNotification } from "../lib/notify";

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

function reportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "rep1",
    targetType: "JOB",
    targetId: "job_1",
    reporterId: null,
    reason: "auto-flag: content filter",
    details: 'content filter matched "hutta" in description: "…"',
    status: "OPEN",
    source: "SYSTEM",
    createdAt: new Date("2026-07-01"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.report.count.mockResolvedValue(0);
  dbMock.report.findUnique.mockResolvedValue(null);
  dbMock.report.findMany.mockResolvedValue([]);
  dbMock.report.updateMany.mockResolvedValue({ count: 1 });
  dbMock.report.findFirst.mockResolvedValue(null);
  dbMock.report.create.mockResolvedValue({ id: "rep1" });
  dbMock.report.update.mockResolvedValue({ id: "rep1" });
  dbMock.jobRequest.findMany.mockResolvedValue([]);
  dbMock.jobResponse.findMany.mockResolvedValue([]);
  dbMock.adminAuditLog.create.mockResolvedValue({});
  dbMock.adminAuditLog.findMany.mockResolvedValue([]);
});

describe("authorization gate (SUPPORT tier)", () => {
  const routes = [
    { name: "GET queue", method: "GET", path: "/api/admin/job-reports" },
    { name: "GET count", method: "GET", path: "/api/admin/job-reports/count" },
    {
      name: "PATCH single",
      method: "PATCH",
      path: "/api/admin/job-reports/rep1",
      body: { status: "RESOLVED" },
    },
    {
      name: "PATCH bulk",
      method: "PATCH",
      path: "/api/admin/job-reports",
      body: { ids: ["rep1"], status: "RESOLVED" },
    },
    { name: "GET audit log", method: "GET", path: "/api/admin/job-audit-log" },
  ];

  it.each(routes)("$name: 403 for anonymous and non-admin roles", async (r) => {
    for (const role of [null, "CUSTOMER", "PROVIDER"] as Role[]) {
      const res = await req(r.path, { method: r.method, body: r.body, role });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
    }
  });

  it.each(routes)("$name: allowed for SUPPORT and ADMIN", async (r) => {
    for (const role of ["SUPPORT", "ADMIN"] as Role[]) {
      const res = await req(r.path, { method: r.method, body: r.body, role });
      expect(res.status).toBe(200);
    }
  });
});

describe("GET /api/admin/job-reports", () => {
  it("short-circuits to an empty page for a foreign (REVIEW) targetType filter", async () => {
    const res = await req("/api/admin/job-reports?targetType=REVIEW", {
      role: "SUPPORT",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reports: [], total: 0 });
    expect(dbMock.report.findMany).not.toHaveBeenCalled();
  });

  it("hydrates JOB targets with the job's title/description/status", async () => {
    dbMock.report.count.mockResolvedValue(1);
    dbMock.report.findMany.mockResolvedValue([reportRow()]);
    dbMock.jobRequest.findMany.mockResolvedValue([
      {
        id: "job_1",
        title: "Fix a leaking tap",
        description: "Kitchen tap leaking.",
        status: "OPEN",
        hiddenAt: null,
      },
    ]);
    const res = await req("/api/admin/job-reports?status=OPEN", { role: "SUPPORT" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reports[0].target).toEqual({
      jobId: "job_1",
      title: "Fix a leaking tap",
      description: "Kitchen tap leaking.",
      status: "OPEN",
      removed: false,
    });
  });

  it("flags a taken-down job's target as removed (#376)", async () => {
    dbMock.report.count.mockResolvedValue(1);
    dbMock.report.findMany.mockResolvedValue([reportRow()]);
    dbMock.jobRequest.findMany.mockResolvedValue([
      {
        id: "job_1",
        title: "Fix a leaking tap",
        description: "Kitchen tap leaking.",
        status: "OPEN",
        hiddenAt: new Date(),
      },
    ]);
    const res = await req("/api/admin/job-reports?status=OPEN", { role: "SUPPORT" });
    const body = await res.json();
    expect(body.reports[0].target.removed).toBe(true);
  });

  it("hydrates JOB_RESPONSE targets with the message and its job", async () => {
    dbMock.report.count.mockResolvedValue(1);
    dbMock.report.findMany.mockResolvedValue([
      reportRow({ targetType: "JOB_RESPONSE", targetId: "resp_1" }),
    ]);
    dbMock.jobResponse.findMany.mockResolvedValue([
      {
        id: "resp_1",
        message: "flagged message text",
        providerId: "prov_1",
        jobRequestId: "job_1",
        jobRequest: { title: "Fix a leaking tap" },
      },
    ]);
    const res = await req("/api/admin/job-reports?status=OPEN", { role: "SUPPORT" });
    const body = await res.json();
    expect(body.reports[0].target).toEqual({
      jobId: "job_1",
      jobTitle: "Fix a leaking tap",
      message: "flagged message text",
      providerId: "prov_1",
    });
  });

  it("returns target=null when the reported content was hard-deleted", async () => {
    dbMock.report.count.mockResolvedValue(1);
    dbMock.report.findMany.mockResolvedValue([reportRow({ targetId: "gone" })]);
    dbMock.jobRequest.findMany.mockResolvedValue([]);
    const res = await req("/api/admin/job-reports?status=OPEN", { role: "SUPPORT" });
    const body = await res.json();
    expect(body.reports[0].target).toBeNull();
  });

  it("pages OPEN first then closed when no status filter is given", async () => {
    dbMock.report.count.mockImplementation(async (args: { where: { status: unknown } }) =>
      args.where.status === "OPEN" ? 1 : 1
    );
    const open = reportRow({ id: "rep-open" });
    const closed = reportRow({ id: "rep-closed", status: "RESOLVED" });
    dbMock.report.findMany.mockImplementation(
      async (args: { where: { status: unknown } }) =>
        args.where.status === "OPEN" ? [open] : [closed]
    );
    const res = await req("/api/admin/job-reports", { role: "ADMIN" });
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.reports.map((r: { id: string }) => r.id)).toEqual([
      "rep-open",
      "rep-closed",
    ]);
  });
});

describe("PATCH /api/admin/job-reports/:id", () => {
  it("stamps resolvedBy/resolvedAt and logs the audit entry", async () => {
    const res = await req("/api/admin/job-reports/rep1", {
      method: "PATCH",
      body: { status: "RESOLVED" },
      role: "SUPPORT",
    });
    expect(res.status).toBe(200);
    const arg = dbMock.report.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "rep1" });
    expect(arg.data.status).toBe("RESOLVED");
    expect(arg.data.resolvedBy).toBe("admin-1");
    expect(arg.data.resolvedAt).toBeInstanceOf(Date);
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminId: "admin-1",
        action: "resolve-report",
        targetType: "REPORT",
        targetId: "rep1",
        reason: null,
      },
    });
  });

  it("404s for an unknown report id", async () => {
    dbMock.report.updateMany.mockResolvedValue({ count: 0 });
    const res = await req("/api/admin/job-reports/nope", {
      method: "PATCH",
      body: { status: "DISMISSED" },
      role: "ADMIN",
    });
    expect(res.status).toBe(404);
  });

  it("400s on an invalid status", async () => {
    const res = await req("/api/admin/job-reports/rep1", {
      method: "PATCH",
      body: { status: "OPEN" },
      role: "ADMIN",
    });
    expect(res.status).toBe(400);
  });

  // REPORT_RESOLVED notification: the reporter hears their report was
  // actioned (in-app only in v1); SYSTEM/anonymous reports emit nothing.
  it("emits REPORT_RESOLVED to a USER reporter", async () => {
    dbMock.report.findUnique.mockResolvedValue(
      reportRow({ reporterId: "cust-9", targetType: "JOB_RESPONSE" })
    );
    const res = await req("/api/admin/job-reports/rep1", {
      method: "PATCH",
      body: { status: "RESOLVED" },
      role: "SUPPORT",
    });
    expect(res.status).toBe(200);
    expect(emitNotification).toHaveBeenCalledWith({
      type: "REPORT_RESOLVED",
      recipients: [{ userId: "cust-9" }],
      payload: { targetType: "JOB_RESPONSE", status: "RESOLVED" },
      link: "/",
    });
  });

  it("emits nothing for a SYSTEM report (no reporterId)", async () => {
    dbMock.report.findUnique.mockResolvedValue(reportRow()); // reporterId: null
    const res = await req("/api/admin/job-reports/rep1", {
      method: "PATCH",
      body: { status: "DISMISSED" },
      role: "SUPPORT",
    });
    expect(res.status).toBe(200);
    expect(emitNotification).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/job-reports (bulk)", () => {
  it("logs one audit entry per affected report (ghost ids skipped)", async () => {
    dbMock.report.findMany.mockResolvedValue([{ id: "rep1" }, { id: "rep2" }]);
    dbMock.report.updateMany.mockResolvedValue({ count: 2 });
    const res = await req("/api/admin/job-reports", {
      method: "PATCH",
      body: { ids: ["rep1", "rep2", "ghost"], status: "DISMISSED" },
      role: "SUPPORT",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 2 });
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledTimes(2);
    const actions = dbMock.adminAuditLog.create.mock.calls.map(
      (call) => call[0].data
    );
    expect(actions).toEqual([
      {
        adminId: "admin-1",
        action: "dismiss-report",
        targetType: "REPORT",
        targetId: "rep1",
        reason: null,
      },
      {
        adminId: "admin-1",
        action: "dismiss-report",
        targetType: "REPORT",
        targetId: "rep2",
        reason: null,
      },
    ]);
  });

  it("batches REPORT_RESOLVED per target type, skipping SYSTEM/anonymous reporters", async () => {
    dbMock.report.findMany.mockResolvedValue([
      { id: "rep1", reporterId: "cust-1", targetType: "JOB" },
      { id: "rep2", reporterId: "cust-2", targetType: "JOB_RESPONSE" },
      { id: "rep3", reporterId: null, targetType: "JOB" }, // SYSTEM/anonymous
    ]);
    dbMock.report.updateMany.mockResolvedValue({ count: 3 });
    const res = await req("/api/admin/job-reports", {
      method: "PATCH",
      body: { ids: ["rep1", "rep2", "rep3"], status: "RESOLVED" },
      role: "ADMIN",
    });
    expect(res.status).toBe(200);
    expect(emitNotification).toHaveBeenCalledTimes(2);
    expect(emitNotification).toHaveBeenCalledWith({
      type: "REPORT_RESOLVED",
      recipients: [{ userId: "cust-1" }],
      payload: { targetType: "JOB", status: "RESOLVED" },
      link: "/",
    });
    expect(emitNotification).toHaveBeenCalledWith({
      type: "REPORT_RESOLVED",
      recipients: [{ userId: "cust-2" }],
      payload: { targetType: "JOB_RESPONSE", status: "RESOLVED" },
      link: "/",
    });
  });
});

describe("GET /api/admin/job-reports/count", () => {
  it("returns the OPEN count", async () => {
    dbMock.report.count.mockResolvedValue(3);
    const res = await req("/api/admin/job-reports/count", { role: "SUPPORT" });
    expect(await res.json()).toEqual({ openReports: 3 });
    expect(dbMock.report.count).toHaveBeenCalledWith({
      where: { status: "OPEN" },
    });
  });
});

describe("GET /api/admin/job-audit-log", () => {
  it("passes filters through and returns the entries", async () => {
    dbMock.adminAuditLog.findMany.mockResolvedValue([{ id: "log1" }]);
    const res = await req(
      "/api/admin/job-audit-log?adminId=admin-1&action=resolve-report",
      { role: "SUPPORT" }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [{ id: "log1" }] });
    expect(dbMock.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { adminId: "admin-1", action: "resolve-report" },
        orderBy: { createdAt: "desc" },
      })
    );
  });
});

// Public report-a-job flow (#376) — mirrors the provider/photo/review report
// endpoints: session optional, signed-in dedupe refresh, hidden job 404.
describe("POST /api/jobs/:id/report", () => {
  const valid = { reason: "scam", details: "asks for a deposit up front" };

  function reportReq(path: string, opts: { body?: unknown; userId?: string } = {}) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-internal-secret": SECRET,
    };
    if (opts.userId) {
      headers["x-user-id"] = opts.userId;
      headers["x-user-role"] = "CUSTOMER";
      headers["x-user-name"] = "Reporter";
    }
    return app.request(path, {
      method: "POST",
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
  }

  it("404 when the job is unknown (no report filed)", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue(null);
    const res = await reportReq("/api/jobs/nope/report", { body: valid });
    expect(res.status).toBe(404);
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });

  it("404 when the job was already taken down (hidden)", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue({ id: "job1", hiddenAt: new Date() });
    const res = await reportReq("/api/jobs/job1/report", { body: valid });
    expect(res.status).toBe(404);
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });

  it("400 for an invalid reason", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue({ id: "job1", hiddenAt: null });
    const res = await reportReq("/api/jobs/job1/report", { body: { reason: "because" } });
    expect(res.status).toBe(400);
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });

  it("anonymous visitor creates a fresh report (no dedupe lookup)", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue({ id: "job1", hiddenAt: null });
    const res = await reportReq("/api/jobs/job1/report", { body: valid });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMock.report.findFirst).not.toHaveBeenCalled();
    expect(dbMock.report.create.mock.calls[0][0].data.reporterId).toBeNull();
  });

  it("signed-in first report creates a row keyed to the reporter", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue({ id: "job1", hiddenAt: null });
    dbMock.report.findFirst.mockResolvedValue(null);
    const res = await reportReq("/api/jobs/job1/report", { body: valid, userId: "u1" });
    expect(res.status).toBe(200);
    expect(dbMock.report.create.mock.calls[0][0].data).toMatchObject({
      targetType: "JOB",
      targetId: "job1",
      reporterId: "u1",
    });
  });

  it("signed-in re-report refreshes the existing OPEN report instead of duplicating", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue({ id: "job1", hiddenAt: null });
    dbMock.report.findFirst.mockResolvedValue({ id: "existing" });
    const res = await reportReq("/api/jobs/job1/report", { body: valid, userId: "u1" });
    expect(res.status).toBe(200);
    expect(dbMock.report.update).toHaveBeenCalledWith({
      where: { id: "existing" },
      data: { reason: "scam", details: "asks for a deposit up front" },
    });
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });

  it("treats the unique-constraint race (P2002) as idempotent success", async () => {
    // Both concurrent requests miss the findFirst dedupe, both try to create;
    // the partial unique index (#651) rejects the loser with P2002, which the
    // handler swallows into the same 200 rather than a 500.
    dbMock.jobRequest.findUnique.mockResolvedValue({ id: "job1", hiddenAt: null });
    dbMock.report.findFirst.mockResolvedValue(null);
    dbMock.report.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "7",
      })
    );
    const res = await reportReq("/api/jobs/job1/report", { body: valid, userId: "u1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
