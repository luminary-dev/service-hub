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
    "/internal/email/account-exists",
    "/internal/email/email-change-attempt",
    "/internal/email/job-response",
    "/internal/email/new-job",
    "/internal/email/new-provider-match",
    "/internal/email/inquiry",
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
    "/internal/email/job-response",
    "/internal/email/inquiry",
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

  it("returns 400 when new-job is missing recipients/jobTitle/district", async () => {
    const res = await postWithSecret("/internal/email/new-job", {
      url: "https://baas.lk/jobs",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it("returns 400 when a new-job recipient is not a valid email", async () => {
    const res = await postWithSecret("/internal/email/new-job", {
      recipients: ["not-an-email"],
      url: "https://baas.lk/jobs",
      jobTitle: "Fix a leaking tap",
      district: "Colombo",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it("returns 400 when new-provider-match is missing recipients/providerName/district", async () => {
    const res = await postWithSecret("/internal/email/new-provider-match", {
      url: "https://baas.lk/providers/prov1",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it("returns 400 when a new-provider-match recipient is not a valid email", async () => {
    const res = await postWithSecret("/internal/email/new-provider-match", {
      recipients: ["not-an-email"],
      url: "https://baas.lk/providers/prov1",
      providerName: "Nimal Perera",
      district: "Colombo",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it("returns 400 when inquiry is missing customerName", async () => {
    const res = await postWithSecret("/internal/email/inquiry", {
      to: "a@b.lk",
      url: "https://baas.lk/dashboard",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
  });

  it.each([
    "/internal/email/verify",
    "/internal/email/password-reset",
    "/internal/email/change-email",
    "/internal/email/email-change-attempt",
    "/internal/email/job-response",
    "/internal/email/inquiry",
  ])("returns 400 when `to` is not a valid email on %s", async (path) => {
    const res = await postWithSecret(path, {
      to: "not-an-email",
      url: "https://baas.lk",
      providerName: "Nimal Perera",
      jobTitle: "Fix a leaking tap",
      customerName: "Dilani Fernando",
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

  it("POST /internal/email/new-job acks 202 before the fan-out (#557)", async () => {
    const res = await postWithSecret("/internal/email/new-job", {
      recipients: ["jane@example.com", "sam@example.com"],
      url: "https://baas.lk/jobs",
      jobTitle: "Fix a leaking tap",
      district: "Colombo",
      locale: "si",
    });
    expect(res.status).toBe(202);
    // Deduped recipient count; delivery happens in the background and is
    // logged, not returned.
    expect(await res.json()).toEqual({ ok: true, accepted: 2 });
  });

  it("POST /internal/email/new-job dedupes case-insensitive recipients", async () => {
    const res = await postWithSecret("/internal/email/new-job", {
      recipients: ["jane@example.com", "JANE@example.com"],
      url: "https://baas.lk/jobs",
      jobTitle: "Fix a leaking tap",
      district: "Colombo",
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, accepted: 1 });
  });

  it("POST /internal/email/new-provider-match acks 202 with the deduped count (#516)", async () => {
    const res = await postWithSecret("/internal/email/new-provider-match", {
      recipients: ["jane@example.com", "JANE@example.com", "sam@example.com"],
      url: "https://baas.lk/providers/prov1",
      providerName: "Nimal Perera",
      district: "Colombo",
      locale: "si",
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, accepted: 2 });
  });

  it("POST /internal/email/inquiry", async () => {
    const res = await postWithSecret("/internal/email/inquiry", {
      to: "provider@example.com",
      url: "https://baas.lk/dashboard",
      customerName: "Dilani Fernando",
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
