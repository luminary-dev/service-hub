// Contract tests for identity-service's /internal/* endpoints (#260): the
// internal-secret auth guard shared by every service, plus the response shape
// each sibling consumes. Prisma is mocked — this is the HTTP contract, not a
// live DB test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
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
  it("rejects GET /internal/users without the secret", async () => {
    const res = await req("/internal/users?ids=a", {}, false);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("rejects a wrong secret", async () => {
    const res = await req(
      "/internal/users?ids=a",
      { headers: { "x-internal-secret": "wrong" } },
      false
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});

describe("GET /internal/users (batch hydration)", () => {
  it("returns { users } for a valid request", async () => {
    dbMock.user.findMany.mockResolvedValue([
      {
        id: "u1",
        name: "Nimal",
        email: "n@baas.lk",
        phone: null,
        emailVerified: true,
      },
    ]);
    const res = await req("/internal/users?ids=u1,u2");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      users: [
        { id: "u1", name: "Nimal", email: "n@baas.lk", phone: null, emailVerified: true },
      ],
    });
  });

  it("returns an empty list without querying when no ids are given", async () => {
    const res = await req("/internal/users");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [] });
    expect(dbMock.user.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /internal/users/:id/session-version", () => {
  it("returns the sessionVersion for an existing user", async () => {
    dbMock.user.findUnique.mockResolvedValue({ sessionVersion: 3 });
    const res = await req("/internal/users/u1/session-version");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ v: 3 });
  });

  it("returns { v: null } for an unknown user", async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    const res = await req("/internal/users/nope/session-version");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ v: null });
  });
});

describe("GET /internal/users/count", () => {
  it("returns { count }", async () => {
    dbMock.user.count.mockResolvedValue(42);
    const res = await req("/internal/users/count");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 42 });
  });
});

describe("PATCH /internal/users/:id (profile sync)", () => {
  it("returns { ok: true } for a valid patch", async () => {
    dbMock.user.updateMany.mockResolvedValue({ count: 1 });
    const res = await req("/internal/users/u1", {
      method: "PATCH",
      body: JSON.stringify({ name: "New Name", phone: "0771234567" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { name: "New Name", phone: "0771234567" },
    });
  });

  it("returns 400 for an invalid body", async () => {
    const res = await req("/internal/users/u1", {
      method: "PATCH",
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
    expect(dbMock.user.updateMany).not.toHaveBeenCalled();
  });
});
