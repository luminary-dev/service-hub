import { Hono } from "hono";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { moderateContent } from "../lib/auto-report";
import { getAuth, getLocale, getOrigin, s2s } from "../lib/http";
import { log } from "../lib/log";
import { emitNotification } from "../lib/notify";
import { jobSchema, jobResponseSchema } from "../lib/job-schema";
import { moneyToNumberOrNull } from "../lib/money";
import { categoryValidator } from "../lib/categories";
import { fetchUsers, fetchProviders } from "../lib/hydrate";
import { normalizeListQuery } from "../lib/query";

const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4001";
const PROVIDER_URL = process.env.PROVIDER_SERVICE_URL ?? "http://localhost:4002";

// Per-account daily posting cap (#556): the per-IP gateway rule alone lets one
// rotating attacker trigger the provider fan-out repeatedly; this bounds what a
// single account can amplify per day.
const MAX_JOBS_PER_DAY = 10;

const statusSchema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });

type ProviderByUser = {
  id: string;
  category: string;
  district: string;
  // Multi-district service area (#502) — always includes `district`.
  serviceDistricts?: string[];
};

// The districts a provider serves (#502). Falls back to the primary district
// when the set is absent/empty (a provider-service predating #502, or a row
// that raced the backfill) so scoping never widens or collapses to nothing.
function servedDistricts(provider: ProviderByUser): string[] {
  return provider.serviceDistricts?.length
    ? provider.serviceDistricts
    : [provider.district];
}

// Verified-email gate (#556): a throwaway account with an unconfirmed address
// must not be able to trigger the 200-recipient provider fan-out. Fails loudly
// (write-path gate), like the provider gate below.
async function isEmailVerified(userId: string): Promise<boolean> {
  const res = await s2s(
    IDENTITY_URL,
    `/internal/users?ids=${encodeURIComponent(userId)}`
  );
  if (!res.ok) {
    throw new Error(`user lookup failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    users: { id: string; emailVerified: string | null }[];
  };
  return Boolean(data.users.find((u) => u.id === userId)?.emailVerified);
}

// Provider gate: the monolith's getCurrentProvider(), now an S2S lookup.
async function getProviderByUser(userId: string): Promise<ProviderByUser | null> {
  const res = await s2s(PROVIDER_URL, `/internal/providers/by-user/${userId}`);
  if (!res.ok) {
    throw new Error(`provider by-user lookup failed: ${res.status}`);
  }
  const data = (await res.json()) as { provider: ProviderByUser | null };
  return data.provider;
}

export const jobs = new Hono();

// POST /api/jobs — post a job request.
jobs.post("/", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Sign in to post a job" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = jobSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      400
    );
  }
  // Category is data now, not code: check it against provider-service's list
  // (60s cache, static fallback) as an explicit post-parse step.
  if (!(await categoryValidator.isValidCategory(parsed.data.category))) {
    return c.json({ error: "Invalid category" }, 400);
  }

  // #556: verified email + per-account daily cap, both checked before the
  // write so a blocked post never reaches the fan-out below.
  let verified: boolean;
  try {
    verified = await isEmailVerified(auth.userId);
  } catch (e) {
    log.error("email-verification gate failed", { context: "jobs", err: e });
    return c.json({ error: "Upstream service unavailable" }, 502);
  }
  if (!verified) {
    return c.json({ error: "Verify your email address to post a job" }, 403);
  }

  const postedToday = await db.jobRequest.count({
    where: {
      customerId: auth.userId,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
  if (postedToday >= MAX_JOBS_PER_DAY) {
    return c.json(
      { error: "You've reached the daily job posting limit. Try again tomorrow." },
      429
    );
  }

  const job = await db.jobRequest.create({
    data: {
      customerId: auth.userId,
      category: parsed.data.category,
      district: parsed.data.district,
      title: parsed.data.title,
      description: parsed.data.description,
      budget: parsed.data.budget ?? null,
    },
  });

  // Content filter (#375): AFTER the write on purpose — the post stays
  // visible and a filter hit only queues a SYSTEM report for admin triage.
  await moderateContent("JOB", job.id, {
    title: parsed.data.title,
    description: parsed.data.description,
  });

  // Lead-gen fan-out (#501): notify the providers whose category + district
  // match this job so they don't have to browse the board to find it — the
  // forward direction of the existing job-response notification below. Ask
  // provider-service for the matching providers (it mirrors the board's
  // scoping + suspended gate, caps + dedupes), then hand the whole list to
  // notification-service's event ingestion in one batched call — which acks
  // immediately (202), writes the in-app rows and queues the emails behind
  // per-user preferences (#557/#394), so this await stays well inside the
  // s2s budget. Best-effort: a provider-lookup or notification failure is
  // logged and never fails the post (mirrors the response flow's block).
  try {
    const res = await s2s(
      PROVIDER_URL,
      `/internal/providers/matching?category=${encodeURIComponent(
        job.category
      )}&district=${encodeURIComponent(
        job.district
      )}&excludeUserId=${encodeURIComponent(auth.userId)}`
    );
    if (res.ok) {
      const data = (await res.json()) as {
        providers: {
          id: string;
          userId: string;
          contactName: string | null;
          contactEmail: string;
        }[];
      };
      const locale = getLocale(c);
      await emitNotification({
        type: "NEW_JOB_MATCH",
        recipients: data.providers
          .filter((p) => p.userId)
          .slice(0, 200)
          .map((p) => ({
            userId: p.userId,
            email: p.contactEmail || undefined,
            locale,
          })),
        payload: { jobTitle: job.title, district: job.district },
        link: "/jobs",
        origin: getOrigin(c),
      });
    }
  } catch (e) {
    log.error("new-job notification failed", { context: "jobs", err: e });
  }

  return c.json({ id: job.id });
});

// GET /api/jobs/board — open jobs matching the caller's provider profile.
jobs.get("/board", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let provider: ProviderByUser | null;
  try {
    provider = await getProviderByUser(auth.userId);
  } catch (e) {
    log.error("provider gate failed", { context: "jobs", err: e });
    return c.json({ error: "Upstream service unavailable" }, 502);
  }
  if (!provider) {
    return c.json(
      { error: "Only registered professionals can respond to jobs" },
      403
    );
  }

  // Pagination (#203): the board is unbounded otherwise — cap the page and
  // count the full match set so the web board can page through on demand.
  const { page, pageSize } = normalizeListQuery({
    page: c.req.query("page") ?? null,
    pageSize: c.req.query("pageSize") ?? null,
    take: c.req.query("take") ?? null,
  });

  const where = {
    status: "OPEN" as const,
    // Admin-taken-down jobs (#376) are invisible to the board.
    hiddenAt: null,
    category: provider.category,
    // Membership over the served set (#502), not just the home district.
    district: { in: servedDistricts(provider) },
    NOT: { customerId: auth.userId },
  };

  const [board, total] = await Promise.all([
    db.jobRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        responses: { where: { providerId: provider.id }, select: { id: true } },
      },
    }),
    db.jobRequest.count({ where }),
  ]);

  const customerIds = [...new Set(board.map((j) => j.customerId))];
  const users = await fetchUsers(customerIds);

  return c.json({
    total,
    page,
    pageSize,
    jobs: board.map((job) => ({
      id: job.id,
      title: job.title,
      description: job.description,
      category: job.category,
      district: job.district,
      // budget is DECIMAL in the DB (#371) — a Decimal JSON-serializes as a
      // string, so convert back to the number this payload has always carried.
      budget: moneyToNumberOrNull(job.budget),
      status: job.status,
      createdAt: job.createdAt,
      customer: { name: users.get(job.customerId)?.name ?? "Unknown" },
      responded: job.responses.length > 0,
    })),
  });
});

// GET /api/jobs/mine — the caller's own jobs with hydrated responses.
jobs.get("/mine", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Pagination (#203): a customer's job history grows without bound — cap the
  // page and count the total so the web my-jobs list can page through.
  const { page, pageSize } = normalizeListQuery({
    page: c.req.query("page") ?? null,
    pageSize: c.req.query("pageSize") ?? null,
    take: c.req.query("take") ?? null,
  });

  const where = { customerId: auth.userId };

  const [myJobs, total] = await Promise.all([
    db.jobRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { responses: { orderBy: { createdAt: "desc" } } },
    }),
    db.jobRequest.count({ where }),
  ]);

  const providerIds = [
    ...new Set(myJobs.flatMap((j) => j.responses.map((r) => r.providerId))),
  ];
  const providers = await fetchProviders(providerIds);

  return c.json({
    total,
    page,
    pageSize,
    jobs: myJobs.map((job) => ({
      id: job.id,
      title: job.title,
      description: job.description,
      category: job.category,
      district: job.district,
      // Same Decimal → number edge conversion as the board payload (#371).
      budget: moneyToNumberOrNull(job.budget),
      status: job.status,
      createdAt: job.createdAt,
      responses: job.responses.map((r) => ({
        id: r.id,
        message: r.message,
        createdAt: r.createdAt,
        provider: {
          id: r.providerId,
          name: providers.get(r.providerId)?.contactName ?? "Unknown",
          phone: providers.get(r.providerId)?.contactPhone ?? null,
        },
      })),
    })),
  });
});

// PATCH /api/jobs/:id — owner toggles OPEN/CLOSED.
jobs.patch("/:id", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  const job = await db.jobRequest.findUnique({ where: { id } });
  if (!job || job.customerId !== auth.userId) {
    return c.json({ error: "Job not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  await db.jobRequest.update({
    where: { id },
    data: { status: parsed.data.status },
  });
  return c.json({ ok: true });
});

// POST /api/jobs/:id/responses — a provider responds to an open job.
jobs.post("/:id/responses", async (c) => {
  const auth = getAuth(c);
  if (!auth) {
    return c.json({ error: "Sign in to respond" }, 401);
  }

  let provider: ProviderByUser | null;
  try {
    provider = await getProviderByUser(auth.userId);
  } catch (e) {
    log.error("provider gate failed", { context: "job-response", err: e });
    return c.json({ error: "Upstream service unavailable" }, 502);
  }
  if (!provider) {
    return c.json(
      { error: "Only registered professionals can respond to jobs" },
      403
    );
  }

  const id = c.req.param("id");
  const job = await db.jobRequest.findUnique({ where: { id } });
  // A job hidden by an admin takedown (#376) is gone from the board, so a
  // response to it gets the same 404 as a job that never existed.
  if (!job || job.hiddenAt) {
    return c.json({ error: "Job not found" }, 404);
  }
  // Enforce the same scoping the board query applies (category + served
  // districts + not-own-job). Without this a provider who obtains a job id can
  // respond to jobs outside their trade/area, or to their own posting —
  // bypassing the board and enabling cross-scope response spam.
  if (job.customerId === auth.userId) {
    return c.json({ error: "You cannot respond to your own job" }, 400);
  }
  if (
    job.category !== provider.category ||
    !servedDistricts(provider).includes(job.district)
  ) {
    return c.json(
      { error: "This job is outside your category or district" },
      403
    );
  }
  if (job.status !== "OPEN") {
    return c.json({ error: "This job is closed" }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = jobResponseSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const existing = await db.jobResponse.findUnique({
    where: {
      jobRequestId_providerId: { jobRequestId: id, providerId: provider.id },
    },
  });
  if (existing) {
    return c.json({ error: "You've already responded to this job" }, 400);
  }

  let response: { id: string };
  try {
    response = await db.jobResponse.create({
      data: {
        jobRequestId: id,
        providerId: provider.id,
        message: parsed.data.message,
      },
    });
  } catch (e) {
    // (jobRequestId, providerId) is unique: a concurrent double-submit that
    // races past the check above hits the constraint — return the same 400 as
    // the check, not an unhandled 500.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return c.json({ error: "You've already responded to this job" }, 400);
    }
    throw e;
  }

  // Content filter (#375): AFTER the write on purpose — the response stays
  // visible and a filter hit only queues a SYSTEM report for admin triage.
  await moderateContent("JOB_RESPONSE", response.id, {
    message: parsed.data.message,
  });

  // Best-effort notification to the customer — never fail the response on
  // this. In-app + email via the notification event; the email address is
  // hydrated from identity and its absence degrades to in-app only.
  try {
    const users = await fetchUsers([job.customerId]);
    await emitNotification({
      type: "JOB_RESPONSE",
      recipients: [
        {
          userId: job.customerId,
          email: users.get(job.customerId)?.email,
          locale: getLocale(c),
        },
      ],
      payload: { providerName: auth.name, jobTitle: job.title },
      link: "/jobs",
      origin: getOrigin(c),
    });
  } catch (e) {
    log.error("notification failed", { context: "job-response", err: e });
  }

  return c.json({ ok: true });
});
