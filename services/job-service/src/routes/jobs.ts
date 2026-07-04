import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { getAuth, getLocale, getOrigin, s2s } from "../lib/http";
import { jobSchema, jobResponseSchema } from "../lib/job-schema";
import { categoryValidator } from "../lib/categories";

const IDENTITY_URL = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:4001";
const PROVIDER_URL = process.env.PROVIDER_SERVICE_URL ?? "http://localhost:4002";
const NOTIFICATION_URL = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4005";

const statusSchema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });

type ProviderByUser = { id: string; category: string; district: string };

// Provider gate: the monolith's getCurrentProvider(), now an S2S lookup.
async function getProviderByUser(userId: string): Promise<ProviderByUser | null> {
  const res = await s2s(PROVIDER_URL, `/internal/providers/by-user/${userId}`);
  if (!res.ok) {
    throw new Error(`provider by-user lookup failed: ${res.status}`);
  }
  const data = (await res.json()) as { provider: ProviderByUser | null };
  return data.provider;
}

// Batch user hydration from identity-service. Degrades gracefully: on any
// failure returns an empty map and callers fall back to "Unknown".
async function fetchUsers(
  ids: string[]
): Promise<Map<string, { name: string; email: string }>> {
  const map = new Map<string, { name: string; email: string }>();
  if (ids.length === 0) return map;
  try {
    const res = await s2s(IDENTITY_URL, `/internal/users?ids=${ids.join(",")}`);
    if (!res.ok) return map;
    const data = (await res.json()) as {
      users: { id: string; name: string; email: string }[];
    };
    for (const u of data.users) map.set(u.id, { name: u.name, email: u.email });
  } catch (e) {
    console.error("[jobs] user hydration failed", e);
  }
  return map;
}

// Batch provider hydration from provider-service (contact name/phone for the
// "my jobs" responses list). Degrades gracefully like fetchUsers.
async function fetchProviders(
  ids: string[]
): Promise<Map<string, { contactName: string | null; contactPhone: string | null }>> {
  const map = new Map<string, { contactName: string | null; contactPhone: string | null }>();
  if (ids.length === 0) return map;
  try {
    const res = await s2s(PROVIDER_URL, `/internal/providers?ids=${ids.join(",")}`);
    if (!res.ok) return map;
    const data = (await res.json()) as {
      providers: { id: string; contactName: string | null; contactPhone: string | null }[];
    };
    for (const p of data.providers) {
      map.set(p.id, { contactName: p.contactName, contactPhone: p.contactPhone });
    }
  } catch (e) {
    console.error("[jobs] provider hydration failed", e);
  }
  return map;
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
    console.error("[jobs] provider gate failed", e);
    return c.json({ error: "Upstream service unavailable" }, 502);
  }
  if (!provider) {
    return c.json(
      { error: "Only registered professionals can respond to jobs" },
      403
    );
  }

  const board = await db.jobRequest.findMany({
    where: {
      status: "OPEN",
      category: provider.category,
      district: provider.district,
      NOT: { customerId: auth.userId },
    },
    orderBy: { createdAt: "desc" },
    include: {
      responses: { where: { providerId: provider.id }, select: { id: true } },
    },
  });

  const customerIds = [...new Set(board.map((j) => j.customerId))];
  const users = await fetchUsers(customerIds);

  return c.json({
    jobs: board.map((job) => ({
      id: job.id,
      title: job.title,
      description: job.description,
      category: job.category,
      district: job.district,
      budget: job.budget,
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

  const myJobs = await db.jobRequest.findMany({
    where: { customerId: auth.userId },
    orderBy: { createdAt: "desc" },
    include: { responses: { orderBy: { createdAt: "desc" } } },
  });

  const providerIds = [
    ...new Set(myJobs.flatMap((j) => j.responses.map((r) => r.providerId))),
  ];
  const providers = await fetchProviders(providerIds);

  return c.json({
    jobs: myJobs.map((job) => ({
      id: job.id,
      title: job.title,
      description: job.description,
      category: job.category,
      district: job.district,
      budget: job.budget,
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
    console.error("[job-response] provider gate failed", e);
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
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
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

  await db.jobResponse.create({
    data: {
      jobRequestId: id,
      providerId: provider.id,
      message: parsed.data.message,
    },
  });

  // Best-effort notification to the customer — never fail the response on this.
  try {
    const users = await fetchUsers([job.customerId]);
    const to = users.get(job.customerId)?.email;
    if (to) {
      await s2s(NOTIFICATION_URL, "/internal/email/job-response", {
        method: "POST",
        body: JSON.stringify({
          to,
          url: `${getOrigin(c)}/jobs`,
          providerName: auth.name,
          jobTitle: job.title,
          locale: getLocale(c),
        }),
      });
    }
  } catch (e) {
    console.error("[job-response] notification failed", e);
  }

  return c.json({ ok: true });
});
