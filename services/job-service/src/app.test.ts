// Contract tests for job-service's /internal/* endpoints (#260): the
// internal-secret auth guard plus the response shape each sibling consumes
// (provider-service reads the open-jobs count; identity-service fans out
// erasure). Prisma is mocked — this is the HTTP contract, not a live DB test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    jobRequest: { count: vi.fn(), deleteMany: vi.fn() },
    jobResponse: { deleteMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("./db", () => ({ db: dbMock }));

import { app } from "./app";

const SECRET = "dev-internal-secret";

function req(path: string, init: RequestInit = {}, withSecret = true) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (withSecret) headers["x-internal-secret"] = SECRET;
  return app.request(path, { ...init, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("internal secret enforcement", () => {
  it("rejects GET /internal/jobs/count without the secret", async () => {
    const res = await req("/internal/jobs/count", {}, false);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("rejects a wrong secret", async () => {
    const res = await req(
      "/internal/jobs/count",
      { headers: { "x-internal-secret": "wrong" } },
      false
    );
    expect(res.status).toBe(403);
  });

  it("rejects POST /internal/users/:id/erase without the secret", async () => {
    const res = await req("/internal/users/u1/erase", { method: "POST" }, false);
    expect(res.status).toBe(403);
  });
});

describe("GET /internal/jobs/count", () => {
  it("returns { count } for a valid request", async () => {
    dbMock.jobRequest.count.mockResolvedValue(5);
    const res = await req("/internal/jobs/count?category=plumbing&district=Colombo");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 5 });
    expect(dbMock.jobRequest.count).toHaveBeenCalledWith({
      where: { status: "OPEN", category: "plumbing", district: "Colombo" },
    });
  });
});

describe("POST /internal/users/:id/erase", () => {
  it("deletes the customer's job requests and returns { ok: true }", async () => {
    dbMock.jobRequest.deleteMany.mockResolvedValue({ count: 0 });
    const res = await req("/internal/users/u1/erase", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMock.jobRequest.deleteMany).toHaveBeenCalledWith({
      where: { customerId: "u1" },
    });
    expect(dbMock.jobResponse.deleteMany).not.toHaveBeenCalled();
  });

  it("also deletes the provider's responses when a providerId is supplied", async () => {
    dbMock.jobRequest.deleteMany.mockResolvedValue({ count: 0 });
    dbMock.jobResponse.deleteMany.mockResolvedValue({ count: 0 });
    const res = await req("/internal/users/u1/erase", {
      method: "POST",
      body: JSON.stringify({ providerId: "p1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMock.jobResponse.deleteMany).toHaveBeenCalledWith({
      where: { providerId: "p1" },
    });
  });
});
