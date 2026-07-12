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
});

describe("GET /api/admin/jobs — filter validation", () => {
  it("forwards a valid status filter unchanged", async () => {
    const res = await adminReq("/api/admin/jobs?status=CLOSED");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jobs: [] });
    expect(dbMock.jobRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "CLOSED" } })
    );
  });

  it("drops an out-of-range status instead of 500ing (audit L9)", async () => {
    const res = await adminReq("/api/admin/jobs?status=PAUSED");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jobs: [] });
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
