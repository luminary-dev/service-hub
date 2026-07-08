// Contract tests for provider-service's /internal/* endpoints (#260): the
// internal-secret auth guard plus the response shape each sibling consumes
// (identity orchestrates registration; job/review/media hydrate + gate here).
// Prisma and the media storage helper are mocked — this is the HTTP contract,
// not a live DB test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    category: { findMany: vi.fn() },
    provider: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    inquiry: { findFirst: vi.fn(), deleteMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("./db", () => ({ db: dbMock }));
vi.mock("./lib/storage", () => ({
  removeStoredFile: vi.fn().mockResolvedValue(undefined),
  sweepMedia: vi.fn().mockResolvedValue({ removed: 0, kept: 0 }),
}));

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

const validProvider = {
  userId: "u1",
  name: "Nimal Perera",
  email: "n@baas.lk",
  category: "plumbing",
  headline: "Experienced plumber",
  bio: "Two decades of plumbing across Colombo.",
  district: "Colombo",
  city: "Colombo",
  experience: 20,
  services: [{ title: "Tap repair", price: 1500, priceType: "FIXED" }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("internal secret enforcement", () => {
  it("rejects GET /internal/categories without the secret", async () => {
    const res = await req("/internal/categories", {}, false);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("rejects a wrong secret", async () => {
    const res = await req(
      "/internal/categories",
      { headers: { "x-internal-secret": "wrong" } },
      false
    );
    expect(res.status).toBe(403);
  });

  it("rejects POST /internal/providers without the secret", async () => {
    const res = await req(
      "/internal/providers",
      { method: "POST", body: JSON.stringify(validProvider) },
      false
    );
    expect(res.status).toBe(403);
    expect(dbMock.provider.create).not.toHaveBeenCalled();
  });
});

describe("GET /internal/categories", () => {
  it("returns { categories }", async () => {
    dbMock.category.findMany.mockResolvedValue([
      { key: "plumbing", labelEn: "Plumbing", active: true, sortOrder: 1 },
    ]);
    const res = await req("/internal/categories");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      categories: [{ key: "plumbing", labelEn: "Plumbing", active: true, sortOrder: 1 }],
    });
  });
});

describe("POST /internal/providers (registration orchestration)", () => {
  it("creates a provider and returns { id }", async () => {
    dbMock.provider.create.mockResolvedValue({ id: "prov1" });
    const res = await req("/internal/providers", {
      method: "POST",
      body: JSON.stringify(validProvider),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "prov1" });
  });

  it("returns 400 for an invalid body", async () => {
    const res = await req("/internal/providers", {
      method: "POST",
      body: JSON.stringify({ userId: "u1" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
    expect(dbMock.provider.create).not.toHaveBeenCalled();
  });
});

describe("GET /internal/providers/by-user/:userId", () => {
  it("returns { provider } when one exists", async () => {
    dbMock.provider.findUnique.mockResolvedValue({
      id: "prov1",
      userId: "u1",
      category: "plumbing",
      district: "Colombo",
      contactName: "Nimal Perera",
    });
    const res = await req("/internal/providers/by-user/u1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      provider: {
        id: "prov1",
        userId: "u1",
        category: "plumbing",
        district: "Colombo",
        contactName: "Nimal Perera",
      },
    });
  });

  it("returns { provider: null } when none exists", async () => {
    dbMock.provider.findUnique.mockResolvedValue(null);
    const res = await req("/internal/providers/by-user/nope");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ provider: null });
  });
});

describe("GET /internal/providers (batch hydration)", () => {
  it("returns { providers }", async () => {
    dbMock.provider.findMany.mockResolvedValue([
      { id: "prov1", userId: "u1", contactName: "Nimal", contactPhone: null, suspended: false },
    ]);
    const res = await req("/internal/providers?ids=prov1,prov2");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      providers: [
        { id: "prov1", userId: "u1", contactName: "Nimal", contactPhone: null, suspended: false },
      ],
    });
  });

  it("returns { providers: [] } without querying when no ids are given", async () => {
    const res = await req("/internal/providers");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providers: [] });
    expect(dbMock.provider.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /internal/inquiries/exists (review gating)", () => {
  it("returns { exists: true } when an inquiry matches", async () => {
    dbMock.inquiry.findFirst.mockResolvedValue({ id: "inq1" });
    const res = await req("/internal/inquiries/exists?providerId=prov1&userId=u1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ exists: true });
  });

  it("returns { exists: false } when none matches", async () => {
    dbMock.inquiry.findFirst.mockResolvedValue(null);
    const res = await req("/internal/inquiries/exists?providerId=prov1&userId=u1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ exists: false });
  });

  it("returns 400 when a required query param is missing", async () => {
    const res = await req("/internal/inquiries/exists?providerId=prov1");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "providerId and userId are required",
    });
  });
});

describe("GET /internal/providers/:id/summary", () => {
  it("returns { provider } for an existing provider", async () => {
    dbMock.provider.findUnique.mockResolvedValue({
      id: "prov1",
      userId: "u1",
      suspended: false,
    });
    const res = await req("/internal/providers/prov1/summary");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      provider: { id: "prov1", userId: "u1", suspended: false },
    });
  });

  it("returns { provider: null } for an unknown provider", async () => {
    dbMock.provider.findUnique.mockResolvedValue(null);
    const res = await req("/internal/providers/nope/summary");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ provider: null });
  });
});
