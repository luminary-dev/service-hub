import { beforeEach, describe, expect, it, vi } from "vitest";
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
  it("responds without the internal secret", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "notification-service" });
  });
});

describe("internal secret enforcement", () => {
  it.each([
    "/internal/email/verify",
    "/internal/email/password-reset",
    "/internal/email/job-response",
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
    "/internal/email/job-response",
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

  it("returns 400 when job-response is missing providerName/jobTitle", async () => {
    const res = await postWithSecret("/internal/email/job-response", {
      to: "a@b.lk",
      url: "https://baas.lk/jobs",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
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

  it("POST /internal/email/job-response", async () => {
    const res = await postWithSecret("/internal/email/job-response", {
      to: "user@example.com",
      url: "https://baas.lk/jobs",
      providerName: "Nimal Perera",
      jobTitle: "Fix a leaking tap",
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
