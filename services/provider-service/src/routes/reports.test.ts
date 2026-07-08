// Public abuse-report tests (#257, #50). Session is optional here (anonymous
// visitors can report), so the auth surface is about the signed-in dedupe
// path — one OPEN report per (user, target), refreshed on re-report — versus
// anonymous reports which always create a fresh row. Prisma is mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    provider: { findUnique: vi.fn() },
    workPhoto: { findUnique: vi.fn() },
    report: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../db", () => ({ db: dbMock }));

import { app } from "../app";

const SECRET = "dev-internal-secret";

function req(
  path: string,
  opts: { body?: unknown; userId?: string } = {}
) {
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

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.report.create.mockResolvedValue({ id: "rep1" });
  dbMock.report.update.mockResolvedValue({ id: "rep1" });
});

describe("POST /api/providers/:id/report", () => {
  const valid = { reason: "scam", details: "asked for money up front" };

  it("404 when the provider is unknown (no report filed)", async () => {
    dbMock.provider.findUnique.mockResolvedValue(null);
    const res = await req("/api/providers/nope/report", { body: valid });
    expect(res.status).toBe(404);
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });

  it("400 for an invalid reason", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1" });
    const res = await req("/api/providers/p1/report", { body: { reason: "because" } });
    expect(res.status).toBe(400);
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });

  it("anonymous visitor creates a fresh report (no dedupe lookup)", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1" });
    const res = await req("/api/providers/p1/report", { body: valid });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMock.report.findFirst).not.toHaveBeenCalled();
    expect(dbMock.report.create.mock.calls[0][0].data.reporterId).toBeNull();
  });

  it("signed-in first report creates a row keyed to the reporter", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1" });
    dbMock.report.findFirst.mockResolvedValue(null);
    const res = await req("/api/providers/p1/report", { body: valid, userId: "u1" });
    expect(res.status).toBe(200);
    expect(dbMock.report.create.mock.calls[0][0].data).toMatchObject({
      targetType: "PROVIDER",
      targetId: "p1",
      reporterId: "u1",
    });
  });

  it("signed-in re-report refreshes the existing OPEN report instead of duplicating", async () => {
    dbMock.provider.findUnique.mockResolvedValue({ id: "p1" });
    dbMock.report.findFirst.mockResolvedValue({ id: "existing" });
    const res = await req("/api/providers/p1/report", { body: valid, userId: "u1" });
    expect(res.status).toBe(200);
    expect(dbMock.report.update).toHaveBeenCalledWith({
      where: { id: "existing" },
      data: { reason: "scam", details: "asked for money up front" },
    });
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/photos/:id/report", () => {
  it("404 when the photo is unknown", async () => {
    dbMock.workPhoto.findUnique.mockResolvedValue(null);
    const res = await req("/api/photos/nope/report", { body: { reason: "offensive" } });
    expect(res.status).toBe(404);
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });

  it("files a WORK_PHOTO report for an existing photo", async () => {
    dbMock.workPhoto.findUnique.mockResolvedValue({ id: "ph1" });
    dbMock.report.findFirst.mockResolvedValue(null);
    const res = await req("/api/photos/ph1/report", { body: { reason: "offensive" }, userId: "u1" });
    expect(res.status).toBe(200);
    expect(dbMock.report.create.mock.calls[0][0].data).toMatchObject({
      targetType: "WORK_PHOTO",
      targetId: "ph1",
    });
  });
});
