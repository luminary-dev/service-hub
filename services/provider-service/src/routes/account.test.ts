// Customer account-history tests (#257, #46). Auth gate: a session is
// required (401 otherwise), and the query is scoped to the caller's own
// userId — a user can only ever see the inquiries they filed. Prisma is
// mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    inquiry: { findMany: vi.fn() },
    inquiryMessage: { groupBy: vi.fn() },
  },
}));

vi.mock("../db", () => ({ db: dbMock }));

import { app } from "../app";

const SECRET = "dev-internal-secret";

function req(opts: { userId?: string } = {}) {
  const headers: Record<string, string> = { "x-internal-secret": SECRET };
  if (opts.userId) {
    headers["x-user-id"] = opts.userId;
    headers["x-user-role"] = "CUSTOMER";
    headers["x-user-name"] = "Kamal";
  }
  return app.request("/api/account/inquiries", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.inquiryMessage.groupBy.mockResolvedValue([]);
});

describe("GET /api/account/inquiries", () => {
  it("401 when unauthenticated", async () => {
    const res = await req();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(dbMock.inquiry.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to the caller's own userId", async () => {
    dbMock.inquiry.findMany.mockResolvedValue([]);
    const res = await req({ userId: "u1" });
    expect(res.status).toBe(200);
    expect(dbMock.inquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
  });

  it("maps rows to the account DTO with the provider summary", async () => {
    dbMock.inquiry.findMany.mockResolvedValue([
      {
        id: "inq1",
        message: "Need a plumber",
        status: "NEW",
        createdAt: new Date("2026-01-01"),
        respondedAt: null,
        customerLastReadAt: null,
        providerLastReadAt: null,
        provider: { id: "p1", contactName: "Nimal", category: "plumbing", suspended: false },
      },
    ]);
    const res = await req({ userId: "u1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inquiries[0]).toMatchObject({
      id: "inq1",
      provider: { id: "p1", name: "Nimal", category: "plumbing", suspended: false },
      unreadCount: 0,
    });
  });
});
