// Route-handler tests for job-service's public /api/jobs endpoints. app.test.ts
// covers the /internal S2S contracts and query.test.ts covers pagination
// normalization; this file exercises the route handlers themselves: job
// creation (+ category validation, the #556 verified-email gate and daily
// posting cap), the board's category/district scoping and
// exclude-own filter, /mine, the owner-only status patch, and the response flow
// (provider gate, out-of-scope / own-job / closed-job rejection, one-per-job
// dedup + the P2002 race guard). Prisma is mocked and s2s is stubbed per path —
// no live DB or network.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Keep lib/http real (requireInternalSecret + getAuth/getLocale/getOrigin) but
// stub the S2S transport.
vi.mock("../lib/http", async (importActual) => {
  const actual = await importActual<typeof import("../lib/http")>();
  return { ...actual, s2s: vi.fn() };
});

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    jobRequest: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    jobResponse: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    // Content filter (#375): the auto-report path files a SYSTEM report on
    // the job / response when its text matches the denylist.
    report: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("../db", () => ({ db: dbMock }));

import { app } from "../app";
import { s2s } from "../lib/http";

const SECRET = "dev-internal-secret";
const CUSTOMER_ID = "user_customer";
const PROVIDER_USER_ID = "user_provider";
const PROVIDER = { id: "prov_1", category: "plumbing", district: "Colombo" };

const s2sMock = vi.mocked(s2s);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Route s2s by path. `providerByUser` drives the provider gate; category
// validation always resolves the seeded category set; hydration + notification
// default to benign responses.
function wireS2s(opts: {
  providerByUser?: typeof PROVIDER | null | "fail";
  users?: { id: string; name: string; email: string }[];
  providers?: { id: string; contactName: string | null; contactPhone: string | null }[];
  // #501 forward fan-out: matching providers returned to the create path, and
  // whether the matching lookup / new-job notification blows up.
  matching?: { id: string; contactName: string | null; contactEmail: string }[] | "fail";
  newJob?: "fail";
  // #556 gate: the emailVerified value identity returns for any looked-up user
  // (verified by default); "fail" makes the identity lookup blow up.
  emailVerified?: string | null | "fail";
} = {}) {
  const {
    providerByUser = PROVIDER,
    users = [],
    providers = [],
    matching = [],
    newJob,
    emailVerified = "2026-01-01T00:00:00.000Z",
  } = opts;
  s2sMock.mockImplementation(async (_base: string, path: string) => {
    if (path.includes("/internal/categories")) {
      return json({ categories: [{ slug: "plumbing" }, { slug: "electrical" }] });
    }
    if (path.includes("/internal/providers/by-user/")) {
      if (providerByUser === "fail") return new Response("boom", { status: 503 });
      return json({ provider: providerByUser });
    }
    if (path.includes("/internal/providers/matching")) {
      if (matching === "fail") throw new Error("provider-service down");
      return json({ providers: matching });
    }
    if (path.includes("/internal/users?ids=")) {
      if (emailVerified === "fail") return new Response("boom", { status: 503 });
      if (users.length > 0) return json({ users });
      // Echo the queried ids back with the configured emailVerified so the
      // create path's gate resolves without per-test wiring.
      const ids = decodeURIComponent(path.split("ids=")[1] ?? "").split(",");
      return json({
        users: ids.filter(Boolean).map((id) => ({
          id,
          name: "User",
          email: "user@example.com",
          emailVerified,
        })),
      });
    }
    if (path.includes("/internal/providers?ids=")) return json({ providers });
    if (path.includes("/internal/email/new-job")) {
      if (newJob === "fail") throw new Error("notification down");
      return json({ ok: true, accepted: 0 }, 202);
    }
    if (path.includes("/internal/email/job-response")) return json({ ok: true });
    throw new Error(`unexpected s2s path: ${path}`);
  });
}

function req(path: string, init: RequestInit = {}, headers: Record<string, string> = {}) {
  return app.request(path, {
    ...init,
    headers: {
      "x-internal-secret": SECRET,
      "content-type": "application/json",
      ...headers,
      ...(init.headers as object),
    },
  });
}

const validJob = {
  category: "plumbing",
  district: "Colombo",
  title: "Fix a leaking tap",
  description: "The kitchen tap has been leaking for days.",
};

beforeEach(() => {
  vi.clearAllMocks();
  wireS2s();
  // Create-path daily cap (#556): default to no posts in the window.
  dbMock.jobRequest.count.mockResolvedValue(0);
});

describe("POST /api/jobs (create)", () => {
  it("401s without a session", async () => {
    const res = await req("/api/jobs", { method: "POST", body: JSON.stringify(validJob) });
    expect(res.status).toBe(401);
  });

  it("400s on an invalid body", async () => {
    const res = await req(
      "/api/jobs",
      { method: "POST", body: JSON.stringify({ title: "x" }) },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(400);
    expect(dbMock.jobRequest.create).not.toHaveBeenCalled();
  });

  it("400s when the category is not in the live set", async () => {
    const res = await req(
      "/api/jobs",
      { method: "POST", body: JSON.stringify({ ...validJob, category: "astrology" }) },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid category");
    expect(dbMock.jobRequest.create).not.toHaveBeenCalled();
  });

  it("403s when the poster's email is unverified (#556)", async () => {
    wireS2s({ emailVerified: null });
    const res = await req(
      "/api/jobs",
      { method: "POST", body: JSON.stringify(validJob) },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/verify your email/i);
    expect(dbMock.jobRequest.create).not.toHaveBeenCalled();
  });

  it("502s when the email-verification lookup fails (write-path gate)", async () => {
    wireS2s({ emailVerified: "fail" });
    const res = await req(
      "/api/jobs",
      { method: "POST", body: JSON.stringify(validJob) },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(502);
    expect(dbMock.jobRequest.create).not.toHaveBeenCalled();
  });

  it("429s when the daily posting cap is reached (#556)", async () => {
    dbMock.jobRequest.count.mockResolvedValue(10);
    const res = await req(
      "/api/jobs",
      { method: "POST", body: JSON.stringify(validJob) },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/daily job posting limit/i);
    expect(dbMock.jobRequest.create).not.toHaveBeenCalled();
    // The cap counts only the caller's posts inside the 24h window.
    expect(dbMock.jobRequest.count).toHaveBeenCalledWith({
      where: {
        customerId: CUSTOMER_ID,
        createdAt: { gte: expect.any(Date) },
      },
    });
  });

  it("creates the job and returns its id", async () => {
    dbMock.jobRequest.create.mockResolvedValue({ id: "job_1" });
    const res = await req(
      "/api/jobs",
      { method: "POST", body: JSON.stringify(validJob) },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "job_1" });
    expect(dbMock.jobRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: CUSTOMER_ID,
        category: "plumbing",
        district: "Colombo",
        budget: null,
      }),
    });
  });

  it("notifies matching providers (fan-out) after creating the job", async () => {
    dbMock.jobRequest.create.mockResolvedValue({
      id: "job_1",
      title: validJob.title,
      category: "plumbing",
      district: "Colombo",
    });
    wireS2s({
      matching: [
        { id: "prov_1", contactName: "Jane", contactEmail: "jane@example.com" },
        { id: "prov_2", contactName: "Sam", contactEmail: "sam@example.com" },
      ],
    });
    const res = await req(
      "/api/jobs",
      { method: "POST", body: JSON.stringify(validJob) },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "job_1" });

    // The matching lookup is scoped to the job's category+district and excludes
    // the poster.
    const matchCall = s2sMock.mock.calls.find(([, p]) =>
      p.includes("/internal/providers/matching")
    );
    expect(matchCall?.[1]).toContain("category=plumbing");
    expect(matchCall?.[1]).toContain("district=Colombo");
    expect(matchCall?.[1]).toContain(`excludeUserId=${CUSTOMER_ID}`);

    // Every matching provider's email is handed to notification in one call.
    const notifyCall = s2sMock.mock.calls.find(([, p]) =>
      p.includes("/internal/email/new-job")
    );
    expect(notifyCall).toBeDefined();
    const body = JSON.parse((notifyCall?.[2]?.body as string) ?? "{}");
    expect(body.recipients).toEqual(["jane@example.com", "sam@example.com"]);
    expect(body.jobTitle).toBe(validJob.title);
    expect(body.district).toBe("Colombo");
  });

  it("skips the notification call when no providers match", async () => {
    dbMock.jobRequest.create.mockResolvedValue({
      id: "job_1",
      title: validJob.title,
      category: "plumbing",
      district: "Colombo",
    });
    wireS2s({ matching: [] });
    const res = await req(
      "/api/jobs",
      { method: "POST", body: JSON.stringify(validJob) },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(200);
    const notifyCall = s2sMock.mock.calls.find(([, p]) =>
      p.includes("/internal/email/new-job")
    );
    expect(notifyCall).toBeUndefined();
  });

  it("still returns { id } when the matching lookup fails (best-effort)", async () => {
    dbMock.jobRequest.create.mockResolvedValue({
      id: "job_1",
      title: validJob.title,
      category: "plumbing",
      district: "Colombo",
    });
    wireS2s({ matching: "fail" });
    const res = await req(
      "/api/jobs",
      { method: "POST", body: JSON.stringify(validJob) },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "job_1" });
  });

  it("still returns { id } when the notification call fails (best-effort)", async () => {
    dbMock.jobRequest.create.mockResolvedValue({
      id: "job_1",
      title: validJob.title,
      category: "plumbing",
      district: "Colombo",
    });
    wireS2s({
      matching: [{ id: "prov_1", contactName: "Jane", contactEmail: "jane@example.com" }],
      newJob: "fail",
    });
    const res = await req(
      "/api/jobs",
      { method: "POST", body: JSON.stringify(validJob) },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "job_1" });
  });
});

describe("GET /api/jobs/board", () => {
  it("401s without a session", async () => {
    const res = await req("/api/jobs/board");
    expect(res.status).toBe(401);
  });

  it("502s when the provider gate lookup fails", async () => {
    wireS2s({ providerByUser: "fail" });
    const res = await req("/api/jobs/board", {}, { "x-user-id": PROVIDER_USER_ID });
    expect(res.status).toBe(502);
  });

  it("403s a caller who is not a registered provider", async () => {
    wireS2s({ providerByUser: null });
    const res = await req("/api/jobs/board", {}, { "x-user-id": CUSTOMER_ID });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/registered professionals/i);
  });

  it("scopes to the provider's category+district, excludes own jobs, flags responded", async () => {
    dbMock.jobRequest.findMany.mockResolvedValue([
      {
        id: "job_1",
        title: "t",
        description: "d",
        category: "plumbing",
        district: "Colombo",
        budget: null,
        status: "OPEN",
        createdAt: new Date(),
        customerId: CUSTOMER_ID,
        responses: [{ id: "resp_1" }],
      },
    ]);
    dbMock.jobRequest.count.mockResolvedValue(1);
    const res = await req("/api/jobs/board", {}, { "x-user-id": PROVIDER_USER_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs[0].responded).toBe(true);
    expect(dbMock.jobRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "OPEN",
          hiddenAt: null,
          category: "plumbing",
          district: "Colombo",
          NOT: { customerId: PROVIDER_USER_ID },
        },
      })
    );
  });

  it("serializes a Decimal budget as a JSON number (#371)", async () => {
    // budget is DECIMAL(12,2) in the DB, so Prisma hands the route a Decimal —
    // which would JSON-stringify as a string without the edge conversion.
    dbMock.jobRequest.findMany.mockResolvedValue([
      {
        id: "job_1",
        title: "t",
        description: "d",
        category: "plumbing",
        district: "Colombo",
        budget: new Prisma.Decimal("60000.00"),
        status: "OPEN",
        createdAt: new Date(),
        customerId: CUSTOMER_ID,
        responses: [],
      },
    ]);
    dbMock.jobRequest.count.mockResolvedValue(1);
    const res = await req("/api/jobs/board", {}, { "x-user-id": PROVIDER_USER_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs[0].budget).toBe(60000);
    expect(typeof body.jobs[0].budget).toBe("number");
  });
});

describe("GET /api/jobs/mine", () => {
  it("401s without a session", async () => {
    const res = await req("/api/jobs/mine");
    expect(res.status).toBe(401);
  });

  it("returns the caller's jobs with hydrated responses", async () => {
    dbMock.jobRequest.findMany.mockResolvedValue([
      {
        id: "job_1",
        title: "t",
        description: "d",
        category: "plumbing",
        district: "Colombo",
        budget: null,
        status: "OPEN",
        createdAt: new Date(),
        customerId: CUSTOMER_ID,
        responses: [
          { id: "resp_1", message: "I can help", createdAt: new Date(), providerId: "prov_1" },
        ],
      },
    ]);
    dbMock.jobRequest.count.mockResolvedValue(1);
    wireS2s({
      providers: [{ id: "prov_1", contactName: "Jane Plumb", contactPhone: "0771234567" }],
    });
    const res = await req("/api/jobs/mine", {}, { "x-user-id": CUSTOMER_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs[0].responses[0].provider).toEqual({
      id: "prov_1",
      name: "Jane Plumb",
      phone: "0771234567",
    });
    expect(dbMock.jobRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: CUSTOMER_ID } })
    );
  });
});

describe("PATCH /api/jobs/:id (owner toggles status)", () => {
  it("401s without a session", async () => {
    const res = await req("/api/jobs/job_1", {
      method: "PATCH",
      body: JSON.stringify({ status: "CLOSED" }),
    });
    expect(res.status).toBe(401);
  });

  it("404s when the job is missing or owned by someone else", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue({ id: "job_1", customerId: "someone_else" });
    const res = await req(
      "/api/jobs/job_1",
      { method: "PATCH", body: JSON.stringify({ status: "CLOSED" }) },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(404);
    expect(dbMock.jobRequest.update).not.toHaveBeenCalled();
  });

  it("400s on an invalid status", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue({ id: "job_1", customerId: CUSTOMER_ID });
    const res = await req(
      "/api/jobs/job_1",
      { method: "PATCH", body: JSON.stringify({ status: "PAUSED" }) },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(400);
  });

  it("toggles the status for the owner", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue({ id: "job_1", customerId: CUSTOMER_ID });
    dbMock.jobRequest.update.mockResolvedValue({});
    const res = await req(
      "/api/jobs/job_1",
      { method: "PATCH", body: JSON.stringify({ status: "CLOSED" }) },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(200);
    expect(dbMock.jobRequest.update).toHaveBeenCalledWith({
      where: { id: "job_1" },
      data: { status: "CLOSED" },
    });
  });
});

describe("POST /api/jobs/:id/responses (provider responds)", () => {
  const openJob = {
    id: "job_1",
    customerId: CUSTOMER_ID,
    category: "plumbing",
    district: "Colombo",
    status: "OPEN",
    title: "Fix tap",
  };
  const message = { message: "I can come by tomorrow morning." };

  it("401s without a session", async () => {
    const res = await req("/api/jobs/job_1/responses", {
      method: "POST",
      body: JSON.stringify(message),
    });
    expect(res.status).toBe(401);
  });

  it("502s when the provider gate lookup fails", async () => {
    wireS2s({ providerByUser: "fail" });
    const res = await req(
      "/api/jobs/job_1/responses",
      { method: "POST", body: JSON.stringify(message) },
      { "x-user-id": PROVIDER_USER_ID }
    );
    expect(res.status).toBe(502);
  });

  it("403s a caller who is not a registered provider", async () => {
    wireS2s({ providerByUser: null });
    const res = await req(
      "/api/jobs/job_1/responses",
      { method: "POST", body: JSON.stringify(message) },
      { "x-user-id": PROVIDER_USER_ID }
    );
    expect(res.status).toBe(403);
  });

  it("404s when the job does not exist", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue(null);
    const res = await req(
      "/api/jobs/job_1/responses",
      { method: "POST", body: JSON.stringify(message) },
      { "x-user-id": PROVIDER_USER_ID }
    );
    expect(res.status).toBe(404);
  });

  it("404s when the job was taken down by an admin (#376)", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue({ ...openJob, hiddenAt: new Date() });
    const res = await req(
      "/api/jobs/job_1/responses",
      { method: "POST", body: JSON.stringify(message) },
      { "x-user-id": PROVIDER_USER_ID }
    );
    expect(res.status).toBe(404);
    expect(dbMock.jobResponse.create).not.toHaveBeenCalled();
  });

  it("400s when responding to your own job", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue({ ...openJob, customerId: PROVIDER_USER_ID });
    const res = await req(
      "/api/jobs/job_1/responses",
      { method: "POST", body: JSON.stringify(message) },
      { "x-user-id": PROVIDER_USER_ID }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/your own job/i);
  });

  it("403s when the job is outside the provider's category or district", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue({ ...openJob, district: "Kandy" });
    const res = await req(
      "/api/jobs/job_1/responses",
      { method: "POST", body: JSON.stringify(message) },
      { "x-user-id": PROVIDER_USER_ID }
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/outside your category or district/i);
  });

  it("400s when the job is closed", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue({ ...openJob, status: "CLOSED" });
    const res = await req(
      "/api/jobs/job_1/responses",
      { method: "POST", body: JSON.stringify(message) },
      { "x-user-id": PROVIDER_USER_ID }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/closed/i);
  });

  it("400s on an invalid message body", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue(openJob);
    const res = await req(
      "/api/jobs/job_1/responses",
      { method: "POST", body: JSON.stringify({ message: "short" }) },
      { "x-user-id": PROVIDER_USER_ID }
    );
    expect(res.status).toBe(400);
  });

  it("400s when the provider has already responded", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue(openJob);
    dbMock.jobResponse.findUnique.mockResolvedValue({ id: "resp_1" });
    const res = await req(
      "/api/jobs/job_1/responses",
      { method: "POST", body: JSON.stringify(message) },
      { "x-user-id": PROVIDER_USER_ID }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already responded/i);
    expect(dbMock.jobResponse.create).not.toHaveBeenCalled();
  });

  it("creates the response (notification best-effort) and returns ok", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue(openJob);
    dbMock.jobResponse.findUnique.mockResolvedValue(null);
    dbMock.jobResponse.create.mockResolvedValue({ id: "resp_1" });
    wireS2s({
      users: [{ id: CUSTOMER_ID, name: "Cus Tomer", email: "cust@example.com" }],
    });
    const res = await req(
      "/api/jobs/job_1/responses",
      { method: "POST", body: JSON.stringify(message) },
      { "x-user-id": PROVIDER_USER_ID }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMock.jobResponse.create).toHaveBeenCalledWith({
      data: { jobRequestId: "job_1", providerId: "prov_1", message: message.message },
    });
  });

  it("maps the unique-constraint race (P2002) to the same 400", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue(openJob);
    dbMock.jobResponse.findUnique.mockResolvedValue(null);
    dbMock.jobResponse.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "7.8.0",
      })
    );
    const res = await req(
      "/api/jobs/job_1/responses",
      { method: "POST", body: JSON.stringify(message) },
      { "x-user-id": PROVIDER_USER_ID }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already responded/i);
  });
});

// Write-time content filter (#375): a denylist hit on job / response text
// auto-files a SYSTEM report; the write itself always succeeds (decision:
// auto-report and keep visible, never hard-block).
describe("content filter on job posts and responses (#375)", () => {
  const openJob = {
    id: "job_1",
    customerId: CUSTOMER_ID,
    category: "plumbing",
    district: "Colombo",
    status: "OPEN",
    title: "Fix a leaking tap",
  };

  it("POST /api/jobs: flags a denylist hit in the description (JOB target)", async () => {
    dbMock.jobRequest.create.mockResolvedValue({ id: "job_1", ...validJob });
    dbMock.report.findFirst.mockResolvedValue(null);
    const res = await req(
      "/api/jobs",
      {
        method: "POST",
        body: JSON.stringify({
          ...validJob,
          description: "Last plumber was a fucking crook, need a real one.",
        }),
      },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "job_1" });
    expect(dbMock.report.create).toHaveBeenCalledWith({
      data: {
        targetType: "JOB",
        targetId: "job_1",
        reporterId: null,
        reason: "auto-flag: content filter",
        details: expect.stringContaining('matched "fucking" in description'),
        source: "SYSTEM",
      },
    });
  });

  it("POST /api/jobs: flags Sinhala job text too", async () => {
    dbMock.jobRequest.create.mockResolvedValue({ id: "job_1", ...validJob });
    dbMock.report.findFirst.mockResolvedValue(null);
    const res = await req(
      "/api/jobs",
      {
        method: "POST",
        body: JSON.stringify({
          ...validJob,
          description: "කලින් ආපු කැරියා වැඩේ කලේ නැහැ, හොඳ කෙනෙක් ඕන.",
        }),
      },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(200);
    const arg = dbMock.report.create.mock.calls[0][0] as { data: { details: string } };
    expect(arg.data.details).toContain("කැරියා");
  });

  it("POST /api/jobs: clean text never touches the reports table", async () => {
    dbMock.jobRequest.create.mockResolvedValue({ id: "job_1", ...validJob });
    const res = await req(
      "/api/jobs",
      { method: "POST", body: JSON.stringify(validJob) },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(200);
    expect(dbMock.report.findFirst).not.toHaveBeenCalled();
    expect(dbMock.report.create).not.toHaveBeenCalled();
  });

  it("POST /api/jobs/:id/responses: flags a hit in the message (JOB_RESPONSE target)", async () => {
    dbMock.jobRequest.findUnique.mockResolvedValue(openJob);
    dbMock.jobResponse.findUnique.mockResolvedValue(null);
    dbMock.jobResponse.create.mockResolvedValue({ id: "resp_1" });
    dbMock.report.findFirst.mockResolvedValue(null);
    wireS2s({
      users: [{ id: CUSTOMER_ID, name: "Cus Tomer", email: "cust@example.com" }],
    });
    const res = await req(
      "/api/jobs/job_1/responses",
      {
        method: "POST",
        body: JSON.stringify({
          message: "mata deela thibba job eka hariyata karala nathi hutta mama nemei",
        }),
      },
      { "x-user-id": PROVIDER_USER_ID }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMock.report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: "JOB_RESPONSE",
        targetId: "resp_1",
        source: "SYSTEM",
        details: expect.stringContaining('matched "hutta" in message'),
      }),
    });
  });

  it("never fails the write when the auto-report path throws (best-effort)", async () => {
    dbMock.jobRequest.create.mockResolvedValue({ id: "job_1", ...validJob });
    dbMock.report.findFirst.mockRejectedValue(new Error("db down"));
    const res = await req(
      "/api/jobs",
      {
        method: "POST",
        body: JSON.stringify({ ...validJob, description: "utter bullshit service" }),
      },
      { "x-user-id": CUSTOMER_ID }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "job_1" });
  });
});
