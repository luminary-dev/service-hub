// Job abuse-report tests (#376). The public endpoint mirrors provider/review
// reporting: session optional (anonymous visitors can report), signed-in
// dedupe (one OPEN report per user+target, refreshed on re-report), hidden
// jobs 404. The admin queue mirrors review-service's /api/admin/review-reports
// — SUPPORT-tier reads and resolve/dismiss with hydrated job targets. Prisma
// is mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    jobRequest: { findUnique: vi.fn(), findMany: vi.fn() },
    report: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    adminAuditLog: { create: vi.fn() },
  },
}));
vi.mock("../db", () => ({ db: dbMock }));

import { app } from "../app";

const SECRET = "dev-internal-secret";

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

function adminReq(path: string, init: RequestInit = {}, role = "ADMIN") {
  return app.request(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-internal-secret": SECRET,
      "x-user-id": "admin_1",
      "x-user-role": role,
      ...(init.headers as object),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.report.create.mockResolvedValue({ id: "rep1" });
  dbMock.report.update.mockResolvedValue({ id: "rep1" });
  dbMock.report.findMany.mockResolvedValue([]);
  dbMock.report.count.mockResolvedValue(0);
  dbMock.jobRequest.findMany.mockResolvedValue([]);
  dbMock.adminAuditLog.create.mockResolvedValue({ id: "audit1" });
});

describe("POST /api/jobs/:id/report", () => {
  const valid = { reason: "scam", details: "asks for a deposit up front" };

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
});

describe("GET /api/admin/job-reports", () => {
  it("403s a non-admin caller", async () => {
    const res = await adminReq("/api/admin/job-reports", {}, "CUSTOMER");
    expect(res.status).toBe(403);
  });

  it("is readable by the SUPPORT tier", async () => {
    dbMock.report.count.mockResolvedValue(0);
    const res = await adminReq("/api/admin/job-reports", {}, "SUPPORT");
    expect(res.status).toBe(200);
  });

  it("short-circuits to empty for a non-JOB targetType filter", async () => {
    const res = await adminReq("/api/admin/job-reports?targetType=REVIEW");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reports: [], total: 0, page: 1, pageSize: 20 });
    expect(dbMock.report.findMany).not.toHaveBeenCalled();
  });

  it("hydrates the job target and flags hidden jobs as removed", async () => {
    // No status filter → open/closed group counts, then a findMany per
    // non-empty group window (2 open rows, empty closed tail).
    dbMock.report.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    dbMock.report.findMany
      .mockResolvedValueOnce([
        { id: "r1", targetType: "JOB", targetId: "job1", status: "OPEN" },
        { id: "r2", targetType: "JOB", targetId: "gone", status: "OPEN" },
      ])
      .mockResolvedValueOnce([]);
    dbMock.jobRequest.findMany.mockResolvedValue([
      { id: "job1", title: "Fix tap", status: "OPEN", hiddenAt: new Date() },
    ]);
    const res = await adminReq("/api/admin/job-reports");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reports[0].target).toEqual({
      jobId: "job1",
      title: "Fix tap",
      status: "OPEN",
      removed: true,
    });
    // Hard-deleted target hydrates to null but the report row survives.
    expect(body.reports[1].target).toBeNull();
  });
});

describe("PATCH /api/admin/job-reports/:id", () => {
  it("403s a non-admin caller", async () => {
    const res = await adminReq(
      "/api/admin/job-reports/r1",
      { method: "PATCH", body: JSON.stringify({ status: "RESOLVED" }) },
      "PROVIDER"
    );
    expect(res.status).toBe(403);
  });

  it("SUPPORT can resolve, stamping resolvedBy/resolvedAt and auditing", async () => {
    dbMock.report.updateMany.mockResolvedValue({ count: 1 });
    const res = await adminReq(
      "/api/admin/job-reports/r1",
      { method: "PATCH", body: JSON.stringify({ status: "RESOLVED" }) },
      "SUPPORT"
    );
    expect(res.status).toBe(200);
    expect(dbMock.report.updateMany).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: expect.objectContaining({ status: "RESOLVED", resolvedBy: "admin_1" }),
    });
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "resolve-report", targetId: "r1" }),
    });
  });

  it("404s an unknown report id", async () => {
    dbMock.report.updateMany.mockResolvedValue({ count: 0 });
    const res = await adminReq("/api/admin/job-reports/nope", {
      method: "PATCH",
      body: JSON.stringify({ status: "DISMISSED" }),
    });
    expect(res.status).toBe(404);
  });

  it("400s an invalid status", async () => {
    const res = await adminReq("/api/admin/job-reports/r1", {
      method: "PATCH",
      body: JSON.stringify({ status: "OPEN" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/admin/job-reports (bulk)", () => {
  it("closes every matched report and audits each one", async () => {
    dbMock.report.findMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
    dbMock.report.updateMany.mockResolvedValue({ count: 2 });
    const res = await adminReq("/api/admin/job-reports", {
      method: "PATCH",
      body: JSON.stringify({ ids: ["r1", "r2", "ghost"], status: "DISMISSED" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 2 });
    expect(dbMock.adminAuditLog.create).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/admin/job-reports/count", () => {
  it("returns the open-report count for the badge", async () => {
    dbMock.report.count.mockResolvedValue(3);
    const res = await adminReq("/api/admin/job-reports/count", {}, "SUPPORT");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ openReports: 3 });
  });
});
