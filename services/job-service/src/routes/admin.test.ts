// Route-handler tests for job-service's admin job list (#222). Focus: the
// status/category filter validation (security audit L9) — an out-of-range
// `status` used to be passed straight into the Prisma `where` and 500'd; it's
// now dropped like an absent filter, mirroring provider-service's admin list
// normalizer. Prisma is mocked and hydration is stubbed — no live DB or network.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    jobRequest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
  },
}));
vi.mock("../db", () => ({ db: dbMock }));

// Keep the route real but stub the S2S-backed hydration so no network happens.
vi.mock("../lib/hydrate", () => ({
  fetchUsers: vi.fn(async () => new Map()),
  fetchProviders: vi.fn(async () => new Map()),
}));

import { app } from "../app";

const SECRET = "dev-internal-secret";

// Admin routes trust the gateway-forwarded identity headers behind the internal
// secret; an ADMIN role clears isSupportOrAdmin.
function adminReq(path: string) {
  return app.request(path, {
    headers: {
      "x-internal-secret": SECRET,
      "x-user-id": "admin_1",
      "x-user-role": "ADMIN",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.jobRequest.findMany.mockResolvedValue([]);
  dbMock.jobRequest.count.mockResolvedValue(0);
});

describe("GET /api/admin/jobs — filter validation", () => {
  it("forwards a valid status filter unchanged", async () => {
    const res = await adminReq("/api/admin/jobs?status=CLOSED");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jobs: [], total: 0, page: 1, pageSize: 20 });
    expect(dbMock.jobRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "CLOSED" } })
    );
  });

  it("drops an out-of-range status instead of 500ing (audit L9)", async () => {
    const res = await adminReq("/api/admin/jobs?status=PAUSED");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jobs: [], total: 0, page: 1, pageSize: 20 });
    // Invalid value normalized away → no status in the where clause.
    expect(dbMock.jobRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
  });

  it("combines a valid status with a free-form category filter", async () => {
    const res = await adminReq("/api/admin/jobs?status=OPEN&category=plumbing");
    expect(res.status).toBe(200);
    expect(dbMock.jobRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "OPEN", category: "plumbing" } })
    );
  });

  it("passes category through even with an invalid status", async () => {
    const res = await adminReq("/api/admin/jobs?status=bogus&category=electrical");
    expect(res.status).toBe(200);
    expect(dbMock.jobRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { category: "electrical" } })
    );
  });
});

describe("GET /api/admin/jobs — pagination (#372)", () => {
  it("defaults to page 1 of 20 and counts the full match set", async () => {
    dbMock.jobRequest.count.mockResolvedValue(45);
    const res = await adminReq("/api/admin/jobs");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(45);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(dbMock.jobRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 })
    );
  });

  it("honors ?page/?pageSize and scopes the count to the filters", async () => {
    const res = await adminReq("/api/admin/jobs?status=OPEN&page=3&pageSize=5");
    expect(res.status).toBe(200);
    expect(dbMock.jobRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "OPEN" }, skip: 10, take: 5 })
    );
    expect(dbMock.jobRequest.count).toHaveBeenCalledWith({
      where: { status: "OPEN" },
    });
  });

  it("caps pageSize at 50 and falls back on junk input", async () => {
    const res = await adminReq("/api/admin/jobs?page=zero&pageSize=9999");
    expect(res.status).toBe(200);
    expect(dbMock.jobRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 50 })
    );
  });
});
