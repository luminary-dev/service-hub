// Route-handler tests for job-service's public /api/jobs endpoints. app.test.ts
// covers the /internal S2S contracts and query.test.ts covers pagination
// normalization; this file exercises the route handlers themselves: job
// creation (+ category validation), the board's category/district scoping and
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
} = {}) {
  const { providerByUser = PROVIDER, users = [], providers = [] } = opts;
  s2sMock.mockImplementation(async (_base: string, path: string) => {
    if (path.includes("/internal/categories")) {
      return json({ categories: [{ slug: "plumbing" }, { slug: "electrical" }] });
    }
    if (path.includes("/internal/providers/by-user/")) {
      if (providerByUser === "fail") return new Response("boom", { status: 503 });
      return json({ provider: providerByUser });
    }
    if (path.includes("/internal/users?ids=")) return json({ users });
    if (path.includes("/internal/providers?ids=")) return json({ providers });
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
          category: "plumbing",
          district: "Colombo",
          NOT: { customerId: PROVIDER_USER_ID },
        },
      })
    );
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
