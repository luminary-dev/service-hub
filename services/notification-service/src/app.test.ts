import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is stateful now: /healthz probes Postgres and the notification
// routes hit Prisma, so the client is mocked — no live DB in unit tests.
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    notification: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    notificationPreference: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));
vi.mock("./db", () => ({ db: dbMock }));

import { app } from "./app";

// The test environment must not have a Resend key: the happy paths below
// assert the console-fallback behavior (delivered: false).
delete process.env.RESEND_API_KEY;

const SECRET = "dev-internal-secret";

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function postWithSecret(path: string, body: unknown) {
  return post(path, body, { "x-internal-secret": SECRET });
}

beforeEach(() => {
  // Silence the [email:dev] console fallback in test output.
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("GET /healthz", () => {
  it("responds without the internal secret when the DB is reachable", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "notification-service" });
  });

  it("degrades to 503 when the DB probe fails", async () => {
    dbMock.$queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    const res = await app.request("/healthz");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      ok: false,
      service: "notification-service",
      db: "down",
    });
  });
});

describe("internal secret enforcement", () => {
  it.each([
    "/internal/email/verify",
    "/internal/email/password-reset",
    "/internal/email/account-exists",
    "/internal/email/email-change-attempt",
    "/internal/notifications/events",
    "/internal/users/u1/erase",
    "/api/notifications/read",
    "/api/notification-preferences",
  ])("rejects %s without x-internal-secret", async (path) => {
    const res = await post(path, { to: "a@b.lk", url: "https://baas.lk" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("rejects a wrong secret", async () => {
    const res = await post(
      "/internal/email/verify",
      { to: "a@b.lk", url: "https://baas.lk" },
      { "x-internal-secret": "wrong" }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});

describe("input validation", () => {
  it.each([
    "/internal/email/verify",
    "/internal/email/password-reset",
    "/internal/email/account-exists",
    "/internal/email/email-change-attempt",
  ])("returns 400 for an invalid body on %s", async (path) => {
    const res = await postWithSecret(path, { to: "a@b.lk" }); // missing url
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it("returns 400 for a non-JSON body", async () => {
    const res = await app.request("/internal/email/verify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": SECRET,
      },
      body: "not json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it.each([
    "/internal/email/verify",
    "/internal/email/password-reset",
    "/internal/email/change-email",
    "/internal/email/email-change-attempt",
  ])("returns 400 when `to` is not a valid email on %s", async (path) => {
    const res = await postWithSecret(path, {
      to: "not-an-email",
      url: "https://baas.lk",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it("404s the retired marketplace email routes (migrated to /internal/notifications/events)", async () => {
    for (const path of [
      "/internal/email/inquiry",
      "/internal/email/job-response",
      "/internal/email/new-job",
      "/internal/email/new-provider-match",
    ]) {
      const res = await postWithSecret(path, {
        to: "a@b.lk",
        url: "https://baas.lk",
      });
      expect(res.status, path).toBe(404);
    }
  });
});

describe("happy paths (no RESEND_API_KEY → console fallback)", () => {
  it("POST /internal/email/verify", async () => {
    const res = await postWithSecret("/internal/email/verify", {
      to: "user@example.com",
      url: "https://baas.lk/verify-email?token=abc",
      locale: "si",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, delivered: false });
  });

  it("POST /internal/email/password-reset", async () => {
    const res = await postWithSecret("/internal/email/password-reset", {
      to: "user@example.com",
      url: "https://baas.lk/reset-password?token=abc",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, delivered: false });
  });

  it("POST /internal/email/account-exists", async () => {
    const res = await postWithSecret("/internal/email/account-exists", {
      to: "user@example.com",
      url: "https://baas.lk/login",
      locale: "si",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, delivered: false });
  });

  it("POST /internal/email/email-change-attempt", async () => {
    const res = await postWithSecret("/internal/email/email-change-attempt", {
      to: "owner@example.com",
      url: "https://baas.lk/login",
      locale: "si",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, delivered: false });
  });

  it("coerces an invalid locale to en", async () => {
    const res = await postWithSecret("/internal/email/verify", {
      to: "user@example.com",
      url: "https://baas.lk/verify-email?token=abc",
      locale: "fr",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, delivered: false });
  });
});
