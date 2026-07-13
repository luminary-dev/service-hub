// Inquiry message-thread access tests (#257, #13). Authorization here is the
// thread-party gate (lib/thread-access): only the customer who filed the
// inquiry (signed-in inquiries only) and the receiving provider may read or
// post. Everyone else — anonymous, or an unrelated user — gets an
// indistinguishable 404 (missing and forbidden share one shape so ids can't be
// probed). Prisma (incl. $transaction) is mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, txMock } = vi.hoisted(() => {
  const txMock = {
    inquiryMessage: { create: vi.fn() },
    inquiry: { update: vi.fn() },
  };
  return {
    txMock,
    dbMock: {
      inquiry: { findUnique: vi.fn(), update: vi.fn() },
      inquiryMessage: { findMany: vi.fn(), create: vi.fn() },
      // Content filter (#375): the auto-report path files a SYSTEM report on
      // the thread's inquiry when a message matches the denylist.
      report: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      $transaction: vi.fn((fn: (tx: typeof txMock) => unknown) => fn(txMock)),
    },
  };
});

vi.mock("../db", () => ({ db: dbMock }));

import { app } from "../app";

const SECRET = "dev-internal-secret";
type Role = "CUSTOMER" | "PROVIDER" | "ADMIN" | null;

function req(
  path: string,
  opts: { method?: string; body?: unknown; role?: Role; userId?: string } = {}
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-internal-secret": SECRET,
  };
  if (opts.role) {
    headers["x-user-id"] = opts.userId ?? "u1";
    headers["x-user-role"] = opts.role;
    headers["x-user-name"] = "Someone";
  }
  return app.request(path, {
    method: opts.method ?? "GET",
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

// Inquiry filed by customer "cust-1", received by provider owned by "prov-owner".
function inquiryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "inq1",
    userId: "cust-1",
    status: "NEW",
    message: "Original inquiry message",
    createdAt: new Date("2026-01-01"),
    name: "Kamal",
    respondedAt: null,
    provider: { id: "prov1", userId: "prov-owner", contactName: "Nimal" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation((fn: (tx: typeof txMock) => unknown) => fn(txMock));
  dbMock.inquiryMessage.findMany.mockResolvedValue([]);
  dbMock.inquiry.update.mockResolvedValue({});
  txMock.inquiryMessage.create.mockResolvedValue({
    id: "m1",
    sender: "PROVIDER",
    body: "hi",
    createdAt: new Date("2026-01-02"),
  });
  txMock.inquiry.update.mockResolvedValue({});
});

describe("GET /api/inquiries/:id/messages — thread party gate", () => {
  it("404 for an anonymous caller", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue(inquiryRow());
    const res = await req("/api/inquiries/inq1/messages");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("404 for an unrelated signed-in user", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue(inquiryRow());
    const res = await req("/api/inquiries/inq1/messages", { role: "CUSTOMER", userId: "stranger" });
    expect(res.status).toBe(404);
    // No read marker written for a non-party.
    expect(dbMock.inquiry.update).not.toHaveBeenCalled();
  });

  it("404 when the inquiry does not exist", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue(null);
    const res = await req("/api/inquiries/nope/messages", { role: "CUSTOMER", userId: "cust-1" });
    expect(res.status).toBe(404);
  });

  it("lets the filing customer read and marks their side read", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue(inquiryRow());
    const res = await req("/api/inquiries/inq1/messages", { role: "CUSTOMER", userId: "cust-1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.party).toBe("CUSTOMER");
    expect(dbMock.inquiry.update.mock.calls[0][0].data).toHaveProperty("customerLastReadAt");
  });

  it("lets the receiving provider read and marks their side read", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue(inquiryRow());
    const res = await req("/api/inquiries/inq1/messages", { role: "PROVIDER", userId: "prov-owner" });
    expect(res.status).toBe(200);
    expect((await res.json()).party).toBe("PROVIDER");
    expect(dbMock.inquiry.update.mock.calls[0][0].data).toHaveProperty("providerLastReadAt");
  });

  it("excludes messages removed by admin takedown (#376)", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue(inquiryRow());
    const res = await req("/api/inquiries/inq1/messages", { role: "CUSTOMER", userId: "cust-1" });
    expect(res.status).toBe(200);
    expect(dbMock.inquiryMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      })
    );
  });
});

describe("POST /api/inquiries/:id/messages", () => {
  it("404 for a non-party (never writes a message)", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue(inquiryRow());
    const res = await req("/api/inquiries/inq1/messages", {
      method: "POST",
      body: { body: "let me in" },
      role: "CUSTOMER",
      userId: "stranger",
    });
    expect(res.status).toBe(404);
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it("400 for an empty body", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue(inquiryRow());
    const res = await req("/api/inquiries/inq1/messages", {
      method: "POST",
      body: { body: "  " },
      role: "CUSTOMER",
      userId: "cust-1",
    });
    expect(res.status).toBe(400);
  });

  it("a provider's first reply flips NEW→RESPONDED and stamps respondedAt", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue(inquiryRow({ status: "NEW", respondedAt: null }));
    const res = await req("/api/inquiries/inq1/messages", {
      method: "POST",
      body: { body: "On my way tomorrow morning." },
      role: "PROVIDER",
      userId: "prov-owner",
    });
    expect(res.status).toBe(200);
    const updateArg = txMock.inquiry.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe("RESPONDED");
    expect(updateArg.data.respondedAt).toBeInstanceOf(Date);
  });

  it("a customer reply does not change status", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue(inquiryRow({ status: "NEW" }));
    await req("/api/inquiries/inq1/messages", {
      method: "POST",
      body: { body: "Thanks, see you then." },
      role: "CUSTOMER",
      userId: "cust-1",
    });
    const updateArg = txMock.inquiry.update.mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty("status");
  });
});

// Write-time content filter (#375): a denylist hit on a thread message
// auto-files a SYSTEM report on the inquiry; the message itself is still
// delivered (decision: auto-report and keep visible, never hard-block).
describe("POST /api/inquiries/:id/messages — content filter (#375)", () => {
  it("auto-files a SYSTEM INQUIRY report on a denylist hit, message still sent", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue(inquiryRow());
    dbMock.report.findFirst.mockResolvedValue(null);
    const res = await req("/api/inquiries/inq1/messages", {
      method: "POST",
      body: { body: "pay up or you're a dead man, hutta" },
      role: "CUSTOMER",
      userId: "cust-1",
    });
    expect(res.status).toBe(200);
    expect(txMock.inquiryMessage.create).toHaveBeenCalledTimes(1);
    expect(dbMock.report.create).toHaveBeenCalledWith({
      data: {
        targetType: "INQUIRY",
        targetId: "inq1",
        reporterId: null,
        reason: "auto-flag: content filter",
        details: expect.stringContaining('matched "hutta" in message'),
        source: "SYSTEM",
      },
    });
  });

  it("refreshes the thread's existing OPEN SYSTEM report instead of stacking", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue(inquiryRow());
    dbMock.report.findFirst.mockResolvedValue({ id: "rep1" });
    const res = await req("/api/inquiries/inq1/messages", {
      method: "POST",
      body: { body: "මූ පකයා වගේ වැඩ කරන්නේ" },
      role: "CUSTOMER",
      userId: "cust-1",
    });
    expect(res.status).toBe(200);
    expect(dbMock.report.create).not.toHaveBeenCalled();
    expect(dbMock.report.update).toHaveBeenCalledWith({
      where: { id: "rep1" },
      data: { details: expect.stringContaining("පකයා") },
    });
  });

  it("leaves the reports table untouched for a clean message", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue(inquiryRow());
    const res = await req("/api/inquiries/inq1/messages", {
      method: "POST",
      body: { body: "Thanks, the quote looks reasonable." },
      role: "CUSTOMER",
      userId: "cust-1",
    });
    expect(res.status).toBe(200);
    expect(dbMock.report.findFirst).not.toHaveBeenCalled();
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });

  it("never fails the send when the auto-report path throws (best-effort)", async () => {
    dbMock.inquiry.findUnique.mockResolvedValue(inquiryRow());
    dbMock.report.findFirst.mockRejectedValue(new Error("db down"));
    const res = await req("/api/inquiries/inq1/messages", {
      method: "POST",
      body: { body: "hutta" },
      role: "CUSTOMER",
      userId: "cust-1",
    });
    expect(res.status).toBe(200);
  });
});
